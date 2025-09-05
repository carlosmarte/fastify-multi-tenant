/**
 * Generic Entity System Framework
 *
 * PURPOSE: A configuration-driven multi-entity framework for Fastify that supports any type of
 * organizational unit (tenants, products, regions, brands, etc.) through configuration rather
 * than code duplication.
 *
 * USE CASES:
 * - Multi-tenant SaaS applications
 * - Product-based feature isolation
 * - Regional service variations
 * - Brand/white-label applications
 * - Department-based systems
 * - Feature flag groupings
 * - Environment-specific configurations
 *
 * PERFORMANCE CONSIDERATIONS:
 * - Lazy initialization reduces startup time
 * - Entity caching prevents redundant loading
 * - Resource pooling for shared resources
 * - Graceful shutdown ensures no data loss
 * - Configurable concurrent entity limits per type
 */

import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import Fastify from "fastify";
import fastGlob from "fast-glob";
import closeWithGrace from "close-with-grace";
import merge from "deepmerge";
import { resolve } from "import-meta-resolve";
import { findUp } from "find-up";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenvExpand.expand(dotenv.config({ path: [".env.local", ".env"] }));

/**
 * Find the project root by looking for the workspace root package.json
 */
async function findProjectRoot() {
  try {
    // Look for package.json with workspaces definition
    const packageJsonPath = await findUp('package.json', {
      cwd: path.dirname(fileURLToPath(import.meta.url)),
      type: 'file'
    });
    
    if (packageJsonPath) {
      // Check if this is the workspace root (has workspaces field)
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
      if (packageJson.workspaces) {
        return path.dirname(packageJsonPath);
      }
      // If not workspace root, continue searching up
      const parentPath = await findUp('package.json', {
        cwd: path.dirname(path.dirname(packageJsonPath)),
        type: 'file'
      });
      if (parentPath) {
        const parentPackageJson = JSON.parse(await fs.readFile(parentPath, 'utf8'));
        if (parentPackageJson.workspaces) {
          return path.dirname(parentPath);
        }
      }
    }
  } catch (err) {
    // Fallback to process.cwd() if unable to find workspace root
  }
  return process.cwd();
}

/**
 * Custom error classes for better error handling
 */
export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

export class EntityError extends Error {
  constructor(message, entityType, entityId) {
    super(message);
    this.name = "EntityError";
    this.entityType = entityType;
    this.entityId = entityId;
  }
}

export class PluginError extends Error {
  constructor(message, pluginName) {
    super(message);
    this.name = "PluginError";
    this.pluginName = pluginName;
  }
}

/**
 * Result pattern for consistent error handling
 */
export class Result {
  constructor(success, value, error = null) {
    this.success = success;
    this.value = value;
    this.error = error;
  }

  static ok(value) {
    return new Result(true, value, null);
  }

  static fail(error) {
    return new Result(false, null, error);
  }

  map(fn) {
    if (!this.success) return this;
    try {
      return Result.ok(fn(this.value));
    } catch (err) {
      return Result.fail(err.message);
    }
  }

  mapError(fn) {
    return !this.success ? Result.fail(fn(this.error)) : this;
  }

  unwrap() {
    if (!this.success) {
      throw new Error(this.error);
    }
    return this.value;
  }

  unwrapOr(defaultValue) {
    return this.success ? this.value : defaultValue;
  }
}

/**
 * Entity security service with configurable validation rules
 */
export class EntitySecurityService {
  constructor(rules = {}) {
    this.rules = {
      entityIdPattern: /^[a-zA-Z0-9\-_]+$/,
      pluginNamePattern: /^[a-zA-Z0-9\-_]+$/,
      maxIdLength: 64,
      ...rules,
    };
  }

  validateEntityId(entityId, entityType = "entity") {
    return this.validate(
      entityId,
      `${entityType} ID`,
      this.rules.entityIdPattern
    );
  }

  validatePluginName(pluginName) {
    return this.validate(
      pluginName,
      "Plugin name",
      this.rules.pluginNamePattern
    );
  }

  validate(value, fieldName, pattern) {
    if (!value || typeof value !== "string") {
      throw new ValidationError(`${fieldName} must be a non-empty string`);
    }

    if (value.length > this.rules.maxIdLength) {
      throw new ValidationError(
        `${fieldName} exceeds maximum length of ${this.rules.maxIdLength}`
      );
    }

    if (!pattern.test(value)) {
      throw new ValidationError(`${fieldName} contains invalid characters`);
    }

    return value;
  }

  validateEntitySecurity(entityType, entityConfig, request) {
    const security = entityConfig.security || {};

    if (security.authentication === "required" && !request.authenticated) {
      throw new ValidationError(`Authentication required for ${entityType}`);
    }

    if (security.isolation === "strict" && request.crossEntityAccess) {
      throw new ValidationError(`Cross-entity access denied for ${entityType}`);
    }

    return true;
  }
}

/**
 * Entity configuration manager
 */
export class EntityConfigurationManager {
  constructor(overrides = {}, options = {}) {
    this.suppressErrorLogging = options.suppressErrorLogging || false;
    this.config = merge(this.getDefaultConfig(), overrides);
    this.entityDefinitions = new Map();
  }

  getDefaultConfig() {
    return {
      server: {
        port: parseInt(process.env.PORT || "3002", 10),
        host: process.env.HOST || "0.0.0.0",
      },
      logger: {
        level: process.env.LOG_LEVEL || "info",
        pretty: process.env.NODE_ENV !== "production",
      },
      plugins: {
        coreOrder: [
          "database",
          "auth",
          "cookie",
          "exception",
          "logger",
          "request",
          "static",
        ],
        npmPattern: "fastify-mta-entity-*",
      },
      entities: {
        definitions: {},
        defaultEntity: "tenant",
        hierarchicalLoading: true,
        globalResources: {
          schemas: "/schemas",
          services: "/services",
          plugins: "/plugins",
          routes: "/routes",
        },
      },
      security: {
        validateInputs: true,
        maxIdLength: 64,
        globalPolicies: {
          pathTraversalProtection: true,
          entityValidation: true,
          rateLimiting: {
            enabled: false,
            perEntity: true,
          },
        },
      },
    };
  }

  async loadEntityConfig(configPath = null, projectRoot = null) {
    try {
      // Use provided project root or fallback to process.cwd()
      const baseDir = projectRoot || process.cwd();
      const entityConfigPath =
        configPath || path.join(baseDir, "entity-config.json");
      const configData = await fs.readFile(entityConfigPath, "utf8");
      const entityConfig = JSON.parse(configData);

      // Merge the entire configuration, not just entities
      this.config = merge(this.config, entityConfig);
      
      // Ensure entities exist after merge
      this.config.entities = this.config.entities || {};

      // Process entity definitions
      for (const [entityType, definition] of Object.entries(
        this.config.entities.definitions || {}
      )) {
        this.entityDefinitions.set(entityType, {
          ...definition,
          type: entityType,
        });
      }

      return Result.ok(this.config);
    } catch (err) {
      // Use default config if no entity config file exists
      return Result.ok(this.config);
    }
  }

  getEntityDefinition(entityType) {
    return this.entityDefinitions.get(entityType);
  }

  getAllEntityTypes() {
    return Array.from(this.entityDefinitions.keys());
  }

  get(key) {
    if (!key) return this.config;

    const keys = key.split(".");
    let value = this.config;

    for (const k of keys) {
      value = value?.[k];
      if (value === undefined) break;
    }

    return value;
  }

  merge(overrides) {
    this.config = merge(this.config, overrides);
  }

  validate() {
    const errors = [];

    if (
      typeof this.config.server.port !== "number" ||
      this.config.server.port < 1 ||
      this.config.server.port > 65535
    ) {
      errors.push("server.port must be a number between 1 and 65535");
    }

    // Validate entity definitions
    for (const [entityType, definition] of this.entityDefinitions) {
      if (!definition.basePath) {
        errors.push(`Entity type '${entityType}' missing basePath`);
      }
      if (!definition.identificationStrategy) {
        errors.push(
          `Entity type '${entityType}' missing identificationStrategy`
        );
      }
    }

    return errors.length > 0 ? Result.fail(errors) : Result.ok(this.config);
  }
}

/**
 * Path resolver with security checks
 */
export class PathResolver {
  constructor(baseDir = null) {
    // If no baseDir provided, use process.cwd() as the default
    // This ensures we're working from the project root where the app is started
    this.baseDir = baseDir ? path.resolve(baseDir) : process.cwd();
    this.trustedPackagePaths = new Set();
  }

  addTrustedPath(packagePath) {
    this.trustedPackagePaths.add(path.resolve(packagePath));
  }

  isTrustedPath(filePath) {
    const resolved = path.resolve(filePath);
    for (const trustedPath of this.trustedPackagePaths) {
      if (resolved.startsWith(trustedPath)) {
        return true;
      }
    }
    return false;
  }

  async getModuleInfo(specifier) {
    try {
      const resolvedUrl = await resolve(specifier, import.meta.url);
      const entryPath = fileURLToPath(resolvedUrl);
      const rootDir = path.dirname(entryPath);

      const packageJsonPath = await findUp("package.json", { cwd: rootDir });
      if (!packageJsonPath) {
        throw new Error("Module root not found");
      }

      const packageJson = JSON.parse(
        await fs.readFile(packageJsonPath, "utf8")
      );

      const packageRoot = path.dirname(packageJsonPath);
      this.addTrustedPath(packageRoot);

      return {
        specifier,
        entryPath,
        rootDir: packageRoot,
        packageJson,
        resolvedUrl,
        packageJsonPath,
      };
    } catch (err) {
      throw new Error(`Error resolving module ${specifier}: ${err.message}`);
    }
  }

  resolvePath(relativePath, options = {}) {
    if (path.isAbsolute(relativePath)) {
      if (options.allowTrusted && this.isTrustedPath(relativePath)) {
        return relativePath;
      }
      return relativePath;
    }

    const resolved = path.resolve(this.baseDir, relativePath);

    if (!resolved.startsWith(this.baseDir) && !this.isTrustedPath(resolved)) {
      throw new ValidationError(
        `Path traversal attempt detected: ${relativePath}`
      );
    }

    return resolved;
  }

  async pathExists(filePath, options = {}) {
    try {
      const resolvedPath = options.allowTrusted
        ? filePath
        : this.resolvePath(filePath, options);
      await fs.access(resolvedPath);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Entity identification strategy interface
 */
export class EntityIdentificationStrategy {
  extractEntityId(request, entityConfig) {
    throw new Error("extractEntityId must be implemented by subclass");
  }
}

/**
 * Subdomain identification strategy
 */
export class SubdomainIdentificationStrategy extends EntityIdentificationStrategy {
  extractEntityId(request, entityConfig) {
    const pattern = entityConfig.extractPattern || "^([^.]+)\\.(.+\\..+)$";
    const hostnameMatch = request.hostname?.match(new RegExp(pattern));
    return hostnameMatch ? hostnameMatch[1] : null;
  }
}

/**
 * Path identification strategy
 */
export class PathIdentificationStrategy extends EntityIdentificationStrategy {
  extractEntityId(request, entityConfig) {
    const pathPrefix = entityConfig.pathPrefix || `/${entityConfig.type}s`;
    const pathSegment = entityConfig.pathSegment ?? 1;

    if (request.url?.startsWith(pathPrefix)) {
      const segments = request.url.split("/").filter(Boolean);
      return segments[pathSegment] || null;
    }

    return null;
  }
}

/**
 * Header identification strategy
 */
export class HeaderIdentificationStrategy extends EntityIdentificationStrategy {
  extractEntityId(request, entityConfig) {
    const headerName = entityConfig.headerName || `X-${entityConfig.type}-ID`;
    const headerPattern = entityConfig.headerPattern || "^(.+)$";

    const headerValue = request.headers[headerName.toLowerCase()];
    if (headerValue) {
      const match = headerValue.match(new RegExp(headerPattern));
      return match ? match[1] : null;
    }

    return null;
  }
}

/**
 * Query parameter identification strategy
 */
export class QueryIdentificationStrategy extends EntityIdentificationStrategy {
  extractEntityId(request, entityConfig) {
    const parameterName = entityConfig.parameterName || entityConfig.type;
    const url = new URL(request.url, `http://${request.hostname}`);
    const value = url.searchParams.get(parameterName);

    return value || entityConfig.defaultValue || null;
  }
}

/**
 * Composite identification strategy
 */
export class CompositeIdentificationStrategy extends EntityIdentificationStrategy {
  constructor(strategies) {
    super();
    // Handle both Map and Array inputs
    if (Array.isArray(strategies)) {
      this.strategies = new Map();
      strategies.forEach((strategy, index) => {
        // For arrays, use index or a generic name if strategy doesn't have a type
        const key = strategy.constructor?.name?.replace('IdentificationStrategy', '').toLowerCase() || `strategy${index}`;
        this.strategies.set(key, strategy);
      });
    } else if (strategies instanceof Map) {
      this.strategies = strategies;
    } else {
      this.strategies = new Map();
    }
  }

  extractEntityId(request, entityConfig) {
    const compositeStrategies = entityConfig.strategies || [];

    // Sort by priority (lower number = higher priority)
    const sortedStrategies = [...compositeStrategies].sort(
      (a, b) => (a.priority || 999) - (b.priority || 999)
    );

    for (const strategyConfig of sortedStrategies) {
      const strategy = this.strategies.get(strategyConfig.type);
      if (strategy) {
        try {
          const entityId = strategy.extractEntityId(request, {
            ...strategyConfig,
            ...entityConfig,
            strategyType: strategyConfig.type,
          });
          if (entityId) return entityId;
        } catch (error) {
          // Log error and continue to next strategy
          console.debug(`Strategy ${strategyConfig.type} failed:`, error.message);
          continue;
        }
      }
    }

    return null;
  }
}

/**
 * Entity identification manager
 */
export class EntityIdentificationManager {
  constructor(securityService) {
    this.securityService = securityService;
    this.strategies = new Map();

    // Register default strategies
    this.strategies.set("subdomain", new SubdomainIdentificationStrategy());
    this.strategies.set("path", new PathIdentificationStrategy());
    this.strategies.set("header", new HeaderIdentificationStrategy());
    this.strategies.set("query", new QueryIdentificationStrategy());
    this.strategies.set(
      "composite",
      new CompositeIdentificationStrategy(this.strategies)
    );
  }

  registerStrategy(name, strategy) {
    if (!(strategy instanceof EntityIdentificationStrategy)) {
      throw new ValidationError(
        "Strategy must extend EntityIdentificationStrategy"
      );
    }
    this.strategies.set(name, strategy);
  }

  extractEntityInfo(request, entityDefinitions) {
    const results = [];

    for (const [entityType, definition] of entityDefinitions) {
      if (!definition.enabled) continue;

      const strategy = this.strategies.get(definition.identificationStrategy);
      if (!strategy) continue;

      try {
        const entityId = strategy.extractEntityId(request, definition);
        if (entityId) {
          const validatedId = this.securityService.validateEntityId(
            entityId,
            entityType
          );
          results.push({
            type: entityType,
            id: validatedId,
            priority: definition.priority || 999,
            definition,
          });
        }
      } catch (err) {
        // Continue with other entity types
      }
    }

    // Sort by priority and return
    results.sort((a, b) => a.priority - b.priority);
    return results;
  }
}

/**
 * Entity lifecycle states
 */
export const EntityLifecycleStates = {
  UNLOADED: "unloaded",
  LOADING: "loading",
  ACTIVE: "active",
  SUSPENDED: "suspended",
  ERROR: "error",
  UNLOADING: "unloading",
};

/**
 * Entity lifecycle manager
 */
export class EntityLifecycleManager {
  constructor(logger) {
    this.logger = logger;
    this.entityStates = new Map();
    this.stateTransitions = new Map();

    this.setupTransitions();
  }

  setupTransitions() {
    // Define valid state transitions
    this.stateTransitions.set("load", {
      from: [EntityLifecycleStates.UNLOADED, EntityLifecycleStates.ERROR],
      to: EntityLifecycleStates.LOADING,
      final: EntityLifecycleStates.ACTIVE,
    });

    this.stateTransitions.set("suspend", {
      from: [EntityLifecycleStates.ACTIVE],
      to: EntityLifecycleStates.SUSPENDED,
    });

    this.stateTransitions.set("resume", {
      from: [EntityLifecycleStates.SUSPENDED],
      to: EntityLifecycleStates.ACTIVE,
    });

    this.stateTransitions.set("reload", {
      from: [EntityLifecycleStates.ACTIVE],
      to: EntityLifecycleStates.LOADING,
      final: EntityLifecycleStates.ACTIVE,
    });

    this.stateTransitions.set("unload", {
      from: [
        EntityLifecycleStates.ACTIVE,
        EntityLifecycleStates.SUSPENDED,
        EntityLifecycleStates.ERROR,
      ],
      to: EntityLifecycleStates.UNLOADING,
      final: EntityLifecycleStates.UNLOADED,
    });
  }

  getEntityKey(entityType, entityId) {
    return `${entityType}:${entityId}`;
  }

  getState(entityType, entityId) {
    const key = this.getEntityKey(entityType, entityId);
    return this.entityStates.get(key) || EntityLifecycleStates.UNLOADED;
  }

  setState(entityType, entityId, state) {
    const key = this.getEntityKey(entityType, entityId);
    const oldState = this.getState(entityType, entityId);

    this.entityStates.set(key, state);
    this.logger.debug(`Entity ${key} state changed: ${oldState} → ${state}`);

    return state;
  }

  canTransition(entityType, entityId, transition) {
    const currentState = this.getState(entityType, entityId);
    const transitionConfig = this.stateTransitions.get(transition);

    if (!transitionConfig) return false;

    return transitionConfig.from.includes(currentState);
  }

  async transition(entityType, entityId, transitionName, handler) {
    if (!this.canTransition(entityType, entityId, transitionName)) {
      const currentState = this.getState(entityType, entityId);
      throw new EntityError(
        `Invalid transition '${transitionName}' from state '${currentState}'`,
        entityType,
        entityId
      );
    }

    const transitionConfig = this.stateTransitions.get(transitionName);

    try {
      // Set intermediate state
      this.setState(entityType, entityId, transitionConfig.to);

      // Execute handler
      if (handler) {
        await handler();
      }

      // Set final state if defined
      if (transitionConfig.final) {
        this.setState(entityType, entityId, transitionConfig.final);
      }

      return Result.ok(this.getState(entityType, entityId));
    } catch (err) {
      this.setState(entityType, entityId, EntityLifecycleStates.ERROR);
      return Result.fail(err.message);
    }
  }

  getAllEntityStates() {
    const states = {};

    for (const [key, state] of this.entityStates) {
      const colonIndex = key.indexOf(":");
      if (colonIndex === -1) continue; // Skip invalid keys without colon
      
      const entityType = key.substring(0, colonIndex);
      const entityId = key.substring(colonIndex + 1);
      
      if (!states[entityType]) {
        states[entityType] = {};
      }
      states[entityType][entityId] = state;
    }

    return states;
  }

  getEntityStatesByType(entityType) {
    const states = {};

    for (const [key, state] of this.entityStates) {
      if (key.startsWith(`${entityType}:`)) {
        const entityId = key.substring(entityType.length + 1);
        states[entityId] = state;
      }
    }

    return states;
  }
}

/**
 * Resource loading strategy interface
 */
export class ResourceLoadingStrategy {
  async loadResources(context) {
    const results = {
      schemas: await this.loadSchemas(context),
      services: await this.loadServices(context),
      plugins: await this.loadPlugins(context),
      routes: await this.loadRoutes(context),
    };

    return results;
  }

  async loadSchemas(context) {
    throw new Error("loadSchemas must be implemented by subclass");
  }

  async loadServices(context) {
    throw new Error("loadServices must be implemented by subclass");
  }

  async loadPlugins(context) {
    throw new Error("loadPlugins must be implemented by subclass");
  }

  async loadRoutes(context) {
    throw new Error("loadRoutes must be implemented by subclass");
  }
}

/**
 * Hierarchical resource loading strategy
 */
export class HierarchicalResourceStrategy extends ResourceLoadingStrategy {
  constructor(resourceLoader, configManager) {
    super();
    this.resourceLoader = resourceLoader;
    this.configManager = configManager;
  }

  async loadSchemas(context) {
    const { entityPath, entityType, entityId, app, pathResolver, config } =
      context;
    const entityDefinition = this.configManager.getEntityDefinition(entityType);

    if (!entityDefinition.resourceLoading?.schemas) {
      return Result.ok([]);
    }

    const schemas = [];

    // Load global schemas if hierarchical loading is enabled
    if (config.entities?.hierarchicalLoading) {
      const globalPath = path.join(
        pathResolver.baseDir,
        config.entities.globalResources.schemas
      );
      if (await pathResolver.pathExists(globalPath)) {
        const globalResult = await this.resourceLoader.loadSchemas(
          app,
          globalPath
        );
        if (globalResult.success) {
          schemas.push(...globalResult.value);
        }
      }
    }

    // Load parent entity schemas if applicable and hierarchical loading is enabled
    if (config.entities?.hierarchicalLoading && entityDefinition.parent) {
      const parentPath = path.join(
        pathResolver.baseDir,
        "entities",
        entityDefinition.parent + "s"
      );
      const parentSchemaPath = path.join(parentPath, "schemas");
      if (await pathResolver.pathExists(parentSchemaPath)) {
        const parentResult = await this.resourceLoader.loadSchemas(
          app,
          parentSchemaPath
        );
        if (parentResult.success) {
          schemas.push(...parentResult.value);
        }
      }
    }

    // Load entity-specific schemas
    const entitySchemaPath = path.join(entityPath, "schemas");
    if (await pathResolver.pathExists(entitySchemaPath)) {
      const entityResult = await this.resourceLoader.loadSchemas(
        app,
        entitySchemaPath
      );
      if (entityResult.success) {
        schemas.push(...entityResult.value);
      }
    }

    return Result.ok(schemas);
  }

  async loadServices(context) {
    const { entityPath, entityType, entityId, pathResolver, config } = context;
    const entityDefinition = this.configManager.getEntityDefinition(entityType);

    if (!entityDefinition.resourceLoading?.services) {
      return Result.ok({});
    }

    let services = {};

    // Load services based on merge strategy
    const mergeStrategy = entityDefinition.mergeStrategy || "override";

    if (config.entities?.hierarchicalLoading && mergeStrategy !== "isolate") {
      const globalPath = path.join(
        pathResolver.baseDir,
        config.entities.globalResources.services
      );
      if (await pathResolver.pathExists(globalPath)) {
        const globalResult = await this.resourceLoader.loadServices(
          globalPath,
          {
            db: context.app.db,
            config,
            entityType,
            entityId,
          }
        );
        if (globalResult.success) {
          services = { ...globalResult.value };
        }
      }
    }

    // Load entity-specific services
    const servicesPath = path.join(entityPath, "services");
    if (await pathResolver.pathExists(servicesPath)) {
      const entityResult = await this.resourceLoader.loadServices(
        servicesPath,
        {
          db: context.app.db,
          config,
          entityType,
          entityId,
        }
      );

      if (entityResult.success) {
        if (mergeStrategy === "extend") {
          services = { ...services, ...entityResult.value };
        } else if (
          mergeStrategy === "override" ||
          mergeStrategy === "isolate"
        ) {
          services = entityResult.value;
        }
      }
    }

    return Result.ok(services);
  }

  async loadPlugins(context) {
    const { entityPath, entityType, entityId, app, pathResolver, config } =
      context;
    const entityDefinition = this.configManager.getEntityDefinition(entityType);

    if (!entityDefinition.resourceLoading?.plugins) {
      return Result.ok([]);
    }

    const loadedPlugins = [];
    const pluginsPath = path.join(entityPath, "plugins");

    if (await pathResolver.pathExists(pluginsPath)) {
      const pluginDirs = await fs.readdir(pluginsPath);

      for (const pluginName of pluginDirs) {
        if (pluginName.startsWith(".")) continue;

        const pluginPath = path.join(pluginsPath, pluginName);
        const result = await this.resourceLoader.loadPlugin(app, pluginPath, {
          entityType,
          entityId,
          config,
          namespace: `/Entity/${entityType}/${entityId}/Plugin`,
        });

        if (result.success) {
          loadedPlugins.push(pluginName);
        }
      }
    }

    return Result.ok(loadedPlugins);
  }

  async loadRoutes(context) {
    const { entityPath, entityType, entityId, app, pathResolver, config } =
      context;
    const entityDefinition = this.configManager.getEntityDefinition(entityType);

    if (!entityDefinition.resourceLoading?.routes) {
      return Result.ok(false);
    }

    const routesPath = path.join(entityPath, "routes");
    const routePrefix =
      entityDefinition.routePrefix?.replace("{entityId}", entityId) ||
      `/${entityType}s/${entityId}`;

    if (await pathResolver.pathExists(routesPath)) {
      return await this.resourceLoader.loadPlugin(app, routesPath, {
        entityType,
        entityId,
        config,
        prefix: routePrefix,
        fastify: app,
        namespace: `/Entity/${entityType}/${entityId}/Routes`,
      });
    }

    return Result.ok(false);
  }
}

/**
 * Plugin manager
 */
export class PluginManager {
  constructor(logger, pathResolver, securityService) {
    this.logger = logger;
    this.pathResolver = pathResolver;
    this.securityService = securityService;
    this.pluginCache = new Map();
  }

  async loadLocalPlugin(app, pluginName, options = {}) {
    try {
      const sanitizedName = this.securityService.validatePluginName(pluginName);
      const cacheKey = `local:${sanitizedName}`;

      if (this.pluginCache.has(cacheKey)) {
        const plugin = this.pluginCache.get(cacheKey);
        const { fastify, ...cleanOptions } = options;
        await app.register(plugin, cleanOptions);
        this.logger.debug(`Registered cached plugin ${sanitizedName}`);
        return Result.ok({ plugin, cached: true });
      }

      const pluginPath = path.join(
        this.pathResolver.baseDir,
        "plugins",
        sanitizedName,
        "index.mjs"
      );

      if (!(await this.pathResolver.pathExists(pluginPath))) {
        return Result.fail(`Plugin not found: ${sanitizedName}`);
      }

      const pluginModule = await import(`file://${pluginPath}`);
      const plugin = pluginModule.default || pluginModule;

      if (typeof plugin !== "function") {
        return Result.fail(`Plugin is not a function: ${sanitizedName}`);
      }

      this.pluginCache.set(cacheKey, plugin);
      const { fastify, ...cleanOptions } = options;
      await app.register(plugin, cleanOptions);
      this.logger.debug(`Registered plugin ${sanitizedName}`);

      return Result.ok({ plugin, cached: false });
    } catch (err) {
      // Enhanced error handling for database-related plugins
      if (pluginName === "sequelize-db" || pluginName === "database") {
        if (err.message?.includes("Dialect needs to be explicitly supplied")) {
          this.logger.error(
            `❌ Database plugin ${pluginName} failed: DB_DIALECT not set. Please set DB_DIALECT to 'postgres', 'mysql', or 'sqlite'`
          );
        } else {
          this.logger.error(
            { err },
            `❌ Database plugin ${pluginName} failed to initialize`
          );
        }
      } else {
        this.logger.error({ err }, `❌ Failed to load plugin ${pluginName}`);
      }
      return Result.fail(err.message);
    }
  }

  async loadNPMPlugin(app, pluginName, options = {}) {
    const cacheKey = `npm:${pluginName}`;

    try {
      if (this.pluginCache.has(cacheKey)) {
        const plugin = this.pluginCache.get(cacheKey);
        const { fastify, ...cleanOptions } = options;
        await app.register(plugin, cleanOptions);
        this.logger.debug(`Registered cached NPM plugin ${pluginName}`);
        return Result.ok({ plugin, cached: true });
      }

      const pluginModule = await import(pluginName);
      const plugin = pluginModule.default || pluginModule;

      if (typeof plugin !== "function") {
        return Result.fail(`Plugin is not a function: ${pluginName}`);
      }

      this.pluginCache.set(cacheKey, plugin);
      const { fastify, ...cleanOptions } = options;
      await app.register(plugin, cleanOptions);
      this.logger.info(`✅ Loaded NPM plugin [${pluginName}]`);

      return Result.ok({ plugin, cached: false });
    } catch (err) {
      this.logger.error({ err }, `❌ Failed to load NPM plugin ${pluginName}`);
      return Result.fail(err.message);
    }
  }

  async getNPMPluginNames(pattern = "fastify-entity-*") {
    const packageJsonPath = path.join(process.cwd(), "package.json");

    try {
      const packageJson = JSON.parse(
        await fs.readFile(packageJsonPath, "utf8")
      );
      const dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      return Object.keys(dependencies).filter((dep) => {
        return new RegExp(pattern.replace("*", ".*")).test(dep);
      });
    } catch (err) {
      this.logger.warn({ err }, "Failed to read package.json");
      return [];
    }
  }

  async loadLocalPlugins(app, pluginNames, options = {}) {
    const results = [];
    let successCount = 0;

    for (const pluginName of pluginNames) {
      const result = await this.loadLocalPlugin(
        app,
        pluginName,
        options[pluginName] || {}
      );

      results.push({ plugin: pluginName, ...result });
      if (result.success) successCount++;
    }

    this.logger.info(
      `✅ Successfully loaded ${successCount}/${pluginNames.length} local plugins`
    );

    return Result.ok({ successCount, total: pluginNames.length, results });
  }
}

/**
 * Resource loader
 */
export class ResourceLoader {
  constructor(logger, pathResolver) {
    this.logger = logger;
    this.pathResolver = pathResolver;
    this.loadedResources = new Map();
  }

  async loadServices(servicesPath, options = {}) {
    const cacheKey = `services:${servicesPath}`;

    if (this.loadedResources.has(cacheKey)) {
      this.logger.debug(`Returning cached services for ${servicesPath}`);
      return Result.ok(this.loadedResources.get(cacheKey));
    }

    try {
      const absolutePath = options.isTrustedPath
        ? servicesPath
        : this.pathResolver.resolvePath(servicesPath);

      if (
        !(await this.pathResolver.pathExists(absolutePath, {
          allowTrusted: options.isTrustedPath,
        }))
      ) {
        this.logger.debug(`No services directory found at ${servicesPath}`);
        return Result.ok({});
      }

      const serviceFiles = await fastGlob("**/*.{js,mjs}", {
        cwd: absolutePath,
        absolute: true,
      });

      this.logger.info(
        `✅ Found ${serviceFiles.length} service files in ${path.relative(process.cwd(), servicesPath)}`
      );

      const services = {};

      for (const file of serviceFiles) {
        try {
          const serviceName = path.basename(file, path.extname(file));
          const serviceModule = await import(`file://${file}`);
          const ServiceClass = serviceModule.default || serviceModule;

          if (typeof ServiceClass === "function") {
            services[serviceName] = /^[A-Z]/.test(ServiceClass.name)
              ? new ServiceClass(options.db, options.config)
              : ServiceClass(options.db, options.config);
          } else {
            services[serviceName] = ServiceClass;
          }

          this.logger.debug(`Loaded service ${serviceName} from ${file}`);
        } catch (err) {
          this.logger.error({ err }, `❌ Failed to load service from ${file}`);
        }
      }

      this.loadedResources.set(cacheKey, services);
      return Result.ok(services);
    } catch (err) {
      this.logger.error(
        { err },
        `❌ Failed to load services from ${servicesPath}`
      );
      return Result.fail(err.message);
    }
  }

  async loadPlugin(app, pluginPath, options = {}) {
    try {
      const absolutePath = options.isTrustedPath
        ? pluginPath
        : this.pathResolver.resolvePath(pluginPath);

      const indexPath = path.join(absolutePath, "index.mjs");

      if (
        !(await this.pathResolver.pathExists(indexPath, {
          allowTrusted: options.isTrustedPath,
        }))
      ) {
        this.logger.warn(
          `Plugin file not found at ${indexPath}`,
          options.namespace
        );
        return Result.fail(`Plugin file not found at ${indexPath}`);
      }

      const pluginModule = await import(`file://${indexPath}`);
      const pluginFunc = pluginModule.default || pluginModule;

      if (typeof pluginFunc !== "function") {
        return Result.fail(`Plugin at ${indexPath} does not export a function`);
      }

      const { fastify, ...cleanOptions } = options;
      await app.register(pluginFunc, cleanOptions);
      this.logger.info(`📦 Loaded plugin from ${options.namespace}`); //${pluginPath}
      return Result.ok(true);
    } catch (err) {
      // Enhanced error handling for database errors
      if (err.message?.includes("Dialect needs to be explicitly supplied")) {
        this.logger.error(
          `❌ Database configuration error in plugin ${options.namespace}: Missing DB_DIALECT environment variable`
        );
      } else if (err.message?.includes("ECONNREFUSED")) {
        this.logger.error(
          `❌ Database connection refused in plugin ${options.namespace}: Check if database server is running`
        );
      } else if (err.message?.includes("authentication failed")) {
        this.logger.error(
          `❌ Database authentication failed in plugin ${options.namespace}: Check DB_USER and DB_PASS`
        );
      } else {
        this.logger.error(
          { err },
          `❌ Failed to load plugin from ${pluginPath} ${options.namespace}`
        );
      }
      return Result.fail(err.message);
    }
  }

  async loadSchemas(app, schemaPath, options = {}) {
    try {
      const absolutePath = options.isTrustedPath
        ? schemaPath
        : this.pathResolver.resolvePath(schemaPath);

      if (
        !(await this.pathResolver.pathExists(absolutePath, {
          allowTrusted: options.isTrustedPath,
        }))
      ) {
        this.logger.debug(`No schemas directory found at ${schemaPath}`);
        return Result.ok([]);
      }

      const schemaFiles = await fastGlob("**/*.{json,js,mjs}", {
        cwd: absolutePath,
        absolute: true,
      });

      this.logger.info(
        `✅ Found ${schemaFiles.length} schema files in ${path.relative(process.cwd(), schemaPath)}`
      );

      const schemas = [];

      for (const file of schemaFiles) {
        try {
          let schemaData;

          if (file.endsWith(".json")) {
            const content = await fs.readFile(file, "utf8");
            schemaData = JSON.parse(content);
          } else {
            const schemaModule = await import(`file://${file}`);
            schemaData = schemaModule.default || schemaModule;
          }

          if (!schemaData.$id) {
            this.logger.warn(`Schema at ${file} does not have an $id property`);
            continue;
          }

          app.addSchema(schemaData);
          schemas.push(schemaData.$id);
          this.logger.debug(`Loaded schema ${schemaData.$id} from ${file}`);
        } catch (err) {
          this.logger.error({ err }, `❌ Failed to load schema from ${file}`);
        }
      }

      return Result.ok(schemas);
    } catch (err) {
      this.logger.error({ err }, `Failed to load schemas from ${schemaPath}`);
      return Result.fail(err.message);
    }
  }

  async loadConfig(configPath, defaults = {}, options = {}) {
    let absolutePath;
    try {
      absolutePath = options.isTrustedPath
        ? configPath
        : this.pathResolver.resolvePath(configPath);
    } catch (err) {
      this.logger.error({ err }, `❌ Failed to resolve config path ${configPath}`);
      return defaults;
    }

    let config = { ...defaults };

    let configFiles;
    try {
      configFiles = await fastGlob("config.{json,js,mjs}", {
        cwd: absolutePath,
        absolute: true,
      });
    } catch (err) {
      this.logger.error({ err }, `❌ Failed to load config from ${configPath}`);
      return defaults;
    }

    if (configFiles.length === 0) {
      this.logger.debug(`No config files found in ${absolutePath}`);
      return config;
    }

    for (const file of configFiles) {
      try {
        if (file.endsWith(".json")) {
          const content = await fs.readFile(file, "utf8");
          config = merge(config, JSON.parse(content));
        } else {
          const configModule = await import(`file://${file}`);
          config = merge(config, configModule.default || configModule);
        }
        this.logger.debug(`Loaded configuration from ${file}`);
      } catch (err) {
        this.logger.error({ err }, `❌ Failed to load config from ${file}`);
        // Continue processing other config files even if this one fails
        continue;
      }
    }

    return config;
  }
}

/**
 * Entity context value object
 */
export class EntityContext {
  constructor(type, id, config, adapter) {
    this.type = type;
    this.id = id;
    this.config = config;
    this.adapter = adapter;
    this.services = {};
    this.plugins = new Set();
    this.routes = new Set();
    this.schemas = new Set();
    this.active = config.active !== false;
    this.createdAt = new Date();
    this.metadata = {
      parent: config.parent || null,
      priority: config.priority || 999,
      mergeStrategy: config.mergeStrategy || "override",
    };
  }

  addService(name, service) {
    this.services[name] = service;
  }

  getService(name) {
    return this.services[name] || null;
  }

  listServices() {
    return Object.keys(this.services);
  }

  addPlugin(pluginName) {
    this.plugins.add(pluginName);
  }

  addSchema(schemaId) {
    this.schemas.add(schemaId);
  }

  addRoute(routePath) {
    this.routes.add(routePath);
  }

  toJSON() {
    return {
      type: this.type,
      id: this.id,
      config: this.config,
      services: Object.keys(this.services),
      plugins: Array.from(this.plugins),
      routes: Array.from(this.routes),
      schemas: Array.from(this.schemas),
      active: this.active,
      createdAt: this.createdAt,
      metadata: this.metadata,
    };
  }
}

/**
 * Abstract base class for entity adapters
 */
export class EntityAdapter {
  constructor(logger, pathResolver, resourceLoader, loadingStrategy) {
    this.logger = logger;
    this.pathResolver = pathResolver;
    this.resourceLoader = resourceLoader;
    this.loadingStrategy = loadingStrategy;
  }

  getType() {
    throw new Error("getType must be implemented by subclass");
  }

  async loadConfig(entityPath, defaults) {
    throw new Error("loadConfig must be implemented by subclass");
  }

  async loadResources(app, entityContext) {
    throw new Error("loadResources must be implemented by subclass");
  }

  async canHandle(source) {
    throw new Error("canHandle must be implemented by subclass");
  }
}

/**
 * Local file-system entity adapter
 */
export class LocalEntityAdapter extends EntityAdapter {
  getType() {
    return "local";
  }

  async canHandle(source) {
    return await this.pathResolver.pathExists(source);
  }

  async loadConfig(entityPath, defaults) {
    return await this.resourceLoader.loadConfig(entityPath, defaults);
  }

  async loadResources(app, entityContext) {
    const entityPath = entityContext.config.path || entityContext.config.source;
    const { type: entityType, id: entityId, config } = entityContext;

    try {
      const context = {
        entityPath,
        entityType,
        entityId,
        app,
        pathResolver: this.pathResolver,
        config,
      };

      const results = await this.loadingStrategy.loadResources(context);

      // Process results
      if (results.schemas.success) {
        results.schemas.value.forEach((schemaId) =>
          entityContext.addSchema(schemaId)
        );
      }

      if (results.services.success) {
        Object.entries(results.services.value).forEach(([name, service]) => {
          entityContext.addService(name, service);
        });
      }

      if (results.plugins.success) {
        results.plugins.value.forEach((plugin) =>
          entityContext.addPlugin(plugin)
        );
      }

      if (results.routes.success && results.routes.value) {
        entityContext.addRoute(entityPath);
      }

      this.logger.info(
        `📦 Loaded resources for ${entityType} entity ${entityId}`
      );
    } catch (err) {
      this.logger.error(
        { err },
        `❌ Failed to load resources for ${entityType} entity ${entityId}`
      );
      throw err;
    }
  }
}

/**
 * NPM package entity adapter
 */
export class NPMEntityAdapter extends EntityAdapter {
  constructor(logger, pathResolver, resourceLoader, loadingStrategy) {
    super(logger, pathResolver, resourceLoader, loadingStrategy);
    this.moduleCache = new Map();
  }

  getType() {
    return "npm";
  }

  async canHandle(source) {
    try {
      await this.pathResolver.getModuleInfo(source);
      return true;
    } catch {
      return false;
    }
  }

  async loadConfig(packageName, defaults) {
    try {
      const moduleInfo = await this.pathResolver.getModuleInfo(packageName);

      const mainModule = await import(packageName);
      const entityConfig = mainModule.default || mainModule;

      let config = { ...defaults };

      if (typeof entityConfig === "object" && entityConfig.config) {
        config = merge(config, entityConfig.config);
      }

      config.path = moduleInfo.rootDir;
      config.packageName = packageName;
      config.packageJson = moduleInfo.packageJson;
      config.isTrustedPath = true;

      const packageConfig = await this.resourceLoader.loadConfig(
        config.path,
        {},
        { isTrustedPath: true }
      );
      config = merge(config, packageConfig);

      return config;
    } catch (err) {
      this.logger.error(
        { err },
        `❌ Failed to load NPM entity config for ${packageName}`
      );
      return { ...defaults, path: null, error: err.message };
    }
  }

  async loadResources(app, entityContext) {
    const { type: entityType, id: entityId, config } = entityContext;
    const packageName = config.packageName;

    try {
      const mainModule = await import(packageName);
      const entityExport = mainModule.default || mainModule;

      if (typeof entityExport === "function") {
        const routePrefix =
          config.routePrefix?.replace("{entityId}", entityId) ||
          `/${entityType}s/${entityId}`;

        await app.register(entityExport, {
          entityType,
          entityId,
          config,
          prefix: routePrefix,
          fastify: app,
        });

        entityContext.addPlugin(packageName);
        this.logger.info(
          `📂 Registered NPM entity ${entityType}:${entityId} as plugin`
        );
      }

      if (config.path && config.isTrustedPath) {
        const context = {
          entityPath: config.path,
          entityType,
          entityId,
          app,
          pathResolver: this.pathResolver,
          config,
        };

        const results = await this.loadingStrategy.loadResources(context);

        if (results.schemas.success) {
          results.schemas.value.forEach((schemaId) =>
            entityContext.addSchema(schemaId)
          );
        }

        if (results.services.success) {
          Object.entries(results.services.value).forEach(([name, service]) => {
            entityContext.addService(name, service);
          });
        }

        if (results.plugins.success) {
          results.plugins.value.forEach((plugin) =>
            entityContext.addPlugin(plugin)
          );
        }

        if (results.routes.success && results.routes.value) {
          entityContext.addRoute(config.path);
        }
      }

      this.logger.info(
        `📦 Loaded resources for NPM entity ${entityType}:${entityId}`
      );
    } catch (err) {
      this.logger.error(
        { err },
        `❌ Failed to load resources for NPM entity ${entityType}:${entityId}`
      );
      throw err;
    }
  }
}

/**
 * Entity factory
 */
export class EntityFactory {
  constructor(
    logger,
    pathResolver,
    resourceLoader,
    securityService,
    configManager
  ) {
    this.logger = logger;
    this.securityService = securityService;
    this.configManager = configManager;

    const loadingStrategy = new HierarchicalResourceStrategy(
      resourceLoader,
      configManager
    );

    this.adapters = [
      new LocalEntityAdapter(
        logger,
        pathResolver,
        resourceLoader,
        loadingStrategy
      ),
      new NPMEntityAdapter(
        logger,
        pathResolver,
        resourceLoader,
        loadingStrategy
      ),
    ];
  }

  async createEntity(app, entityType, source, entityId = null) {
    const entityDefinition = this.configManager.getEntityDefinition(entityType);

    if (!entityDefinition) {
      throw new EntityError(
        `Entity type '${entityType}' not defined in configuration`,
        entityType,
        entityId
      );
    }

    for (const adapter of this.adapters) {
      if (await adapter.canHandle(source)) {
        return await this.buildEntity(
          app,
          entityType,
          source,
          adapter,
          entityId
        );
      }
    }

    throw new EntityError(
      `No adapter found for entity source: ${source}`,
      entityType,
      entityId
    );
  }

  async buildEntity(app, entityType, source, adapter, customEntityId = null) {
    try {
      let entityId = customEntityId;

      if (!entityId) {
        if (adapter.getType() === "npm") {
          entityId = source.replace(/^fastify-entity-/, "");
        } else {
          entityId = path.basename(source);
        }
      }

      entityId = this.securityService.validateEntityId(entityId, entityType);

      const entityDefinition =
        this.configManager.getEntityDefinition(entityType);
      const config = await adapter.loadConfig(source, {
        ...entityDefinition,
        id: entityId,
        name: entityId,
        active: true,
        source,
      });

      if (!config.active) {
        this.logger.info(
          `📦 Entity ${entityType}:${entityId} is inactive, skipping`
        );
        return null;
      }

      const entityContext = new EntityContext(
        entityType,
        entityId, // Use directory name for predictable URLs
        config,
        adapter
      );

      await adapter.loadResources(app, entityContext);

      this.logger.info(
        `📦 Entity '${entityType}:${entityContext.id}' (${adapter.getType()}) loaded successfully`
      );

      return entityContext;
    } catch (err) {
      this.logger.error({ err }, `❌ Failed to build entity from ${source}`);
      throw new EntityError(
        `Failed to build entity from ${source}: ${err.message}`,
        entityType,
        customEntityId
      );
    }
  }
}

/**
 * Entity registry
 */
export class EntityRegistry {
  constructor(logger, configManager) {
    this.logger = logger;
    this.configManager = configManager;
    this.entities = new Map(); // Map of entityType:entityId -> EntityContext
    this.entityStats = {
      loaded: 0,
      failed: 0,
      reloaded: 0,
    };
  }

  getEntityKey(entityType, entityId) {
    return `${entityType}:${entityId}`;
  }

  register(entityContext) {
    const entityDefinition = this.configManager.getEntityDefinition(
      entityContext.type
    );
    const maxInstances = entityDefinition?.maxInstances || 100;

    // Count entities of this type
    const entityCount = Array.from(this.entities.values()).filter(
      (e) => e.type === entityContext.type
    ).length;

    if (entityCount >= maxInstances) {
      throw new EntityError(
        `Maximum number of ${entityContext.type} entities (${maxInstances}) reached`,
        entityContext.type,
        entityContext.id
      );
    }

    const key = this.getEntityKey(entityContext.type, entityContext.id);
    this.entities.set(key, entityContext);
    this.entityStats.loaded++;
    this.logger.info(`📂 Entity '${key}' registered in registry`);
  }

  unregister(entityType, entityId) {
    const key = this.getEntityKey(entityType, entityId);
    const success = this.entities.delete(key);
    if (success) {
      this.logger.info(`📂 Entity '${key}' unregistered from registry`);
    }
    return success;
  }

  getEntity(entityType, entityId) {
    const key = this.getEntityKey(entityType, entityId);
    return this.entities.get(key) || null;
  }

  getAllEntities() {
    return Array.from(this.entities.values());
  }

  getEntitiesByType(entityType) {
    return Array.from(this.entities.values()).filter(
      (entity) => entity.type === entityType
    );
  }

  getActiveEntities() {
    return this.getAllEntities().filter((entity) => entity.active);
  }

  getStats() {
    const entities = this.getAllEntities();
    const byType = {};

    for (const entity of entities) {
      if (!byType[entity.type]) {
        byType[entity.type] = {
          total: 0,
          active: 0,
          inactive: 0,
          services: 0,
        };
      }

      byType[entity.type].total++;
      if (entity.active) {
        byType[entity.type].active++;
      } else {
        byType[entity.type].inactive++;
      }
      byType[entity.type].services += entity.listServices().length;
    }

    return {
      total: entities.length,
      active: entities.filter((e) => e.active).length,
      inactive: entities.filter((e) => !e.active).length,
      byType,
      servicesLoaded: entities.reduce(
        (sum, e) => sum + e.listServices().length,
        0
      ),
      history: { ...this.entityStats },
    };
  }
}

/**
 * Server lifecycle manager
 */
export class ServerLifecycleManager {
  constructor(app, logger, entityManager) {
    this.app = app;
    this.logger = logger;
    this.entityManager = entityManager;
    this.hooks = new Map();
  }

  registerHook(phase, handler) {
    if (!this.hooks.has(phase)) {
      this.hooks.set(phase, []);
    }
    this.hooks.get(phase).push(handler);
  }

  async executePhase(phase, context) {
    const handlers = this.hooks.get(phase) || [];
    for (const handler of handlers) {
      await handler(context);
    }
  }

  setupRequestPipeline() {
    this.app.addHook("onRequest", this.createRequestHook());
    this.app.addHook("onSend", this.createResponseHook());
    // Error handler is now managed by graceful-shutdown plugin
  }

  createRequestHook() {
    return async (request, reply) => {
      try {
        const entityInfo = this.entityManager.identifyEntities(request);

        request.entities = entityInfo;
        request.primaryEntity = entityInfo[0] || null;

        if (request.primaryEntity) {
          request.log = request.log.child({
            entityType: request.primaryEntity.type,
            entityId: request.primaryEntity.id,
          });
        }

        // Check if entity exists for API routes
        if (request.url.startsWith("/api/") && request.primaryEntity) {
          const entity = this.entityManager.getEntity(
            request.primaryEntity.type,
            request.primaryEntity.id
          );

          if (!entity) {
            reply.code(404).send({
              success: false,
              error: `Entity '${request.primaryEntity.type}:${request.primaryEntity.id}' not found`,
            });
          }
        }
      } catch (err) {
        request.log.error({ err }, "Error in entity resolution");
        reply.code(400).send({
          success: false,
          error: "Invalid entity identifier",
        });
      }
    };
  }

  createResponseHook() {
    return async (request, reply, payload) => {
      reply.header("X-Content-Type-Options", "nosniff");
      reply.header("X-Frame-Options", "DENY");
      reply.header("X-XSS-Protection", "1; mode=block");

      if (request.primaryEntity) {
        reply.header("X-Entity-Type", request.primaryEntity.type);
        reply.header("X-Entity-ID", request.primaryEntity.id);
      }

      return payload;
    };
  }


  setupGracefulShutdown() {
    const closeListeners = closeWithGrace(
      { delay: 500 },
      async ({ signal, err }) => {
        if (err) {
          this.logger.error({ err }, "❌ Server closing due to error");
        } else {
          this.logger.info(`Server closing due to ${signal}`);
        }

        try {
          await this.app.close();
        } catch (closeErr) {
          this.logger.error({ err: closeErr }, "❌ Error during server close");
        }
      }
    );

    this.app.addHook("onClose", (instance, done) => {
      closeListeners.uninstall();
      done();
    });

    process.on("uncaughtException", (err) => {
      this.logger.fatal({ err }, "Uncaught exception");
      // Allow process.exit in tests when it's mocked, otherwise skip in test mode
      if (process.env.NODE_ENV !== "test" || (typeof process.exit.mock !== 'undefined')) {
        process.exit(1);
      }
    });

    process.on("unhandledRejection", (reason, promise) => {
      this.logger.fatal({ reason, promise }, "Unhandled rejection");
      // Allow process.exit in tests when it's mocked, otherwise skip in test mode
      if (process.env.NODE_ENV !== "test" || (typeof process.exit.mock !== 'undefined')) {
        process.exit(1);
      }
    });
  }
}

/**
 * Entity manager facade
 */
export class EntityManager {
  constructor(dependencies) {
    this.logger = dependencies.logger;
    this.securityService = dependencies.securityService;
    this.entityFactory = dependencies.entityFactory;
    this.entityRegistry = dependencies.entityRegistry;
    this.configManager = dependencies.configManager;
    this.identificationManager = dependencies.identificationManager;
    this.lifecycleManager = dependencies.lifecycleManager;
  }

  identifyEntities(request) {
    return this.identificationManager.extractEntityInfo(
      request,
      this.configManager.entityDefinitions
    );
  }

  getEntity(entityType, entityId) {
    return this.entityRegistry.getEntity(entityType, entityId);
  }

  getAllEntities() {
    return this.entityRegistry.getAllEntities();
  }

  getEntitiesByType(entityType) {
    return this.entityRegistry.getEntitiesByType(entityType);
  }

  getStats() {
    return this.entityRegistry.getStats();
  }

  async loadEntity(app, entityType, source, customEntityId = null) {
    try {
      const entity = await this.entityFactory.createEntity(
        app,
        entityType,
        source,
        customEntityId
      );

      if (entity) {
        await this.lifecycleManager.transition(
          entityType,
          entity.id,
          "load",
          async () => {
            this.entityRegistry.register(entity);
          }
        );
        return entity;
      }

      return null;
    } catch (err) {
      this.logger.error({ err }, `❌ Failed to load entity from ${source}`);
      this.entityRegistry.entityStats.failed++;
      throw err;
    }
  }

  async loadAllEntities(app, pathResolver) {
    const loadResults = {};

    for (const entityType of this.configManager.getAllEntityTypes()) {
      loadResults[entityType] = {
        local: 0,
        npm: 0,
        failed: 0,
      };

      const entityDefinition =
        this.configManager.getEntityDefinition(entityType);
      if (!entityDefinition.enabled) continue;

      // Load local entities
      try {
        const entitiesPath = path.join(
          pathResolver.baseDir,
          "entities",
          entityDefinition.basePath || `/${entityType}s`
        );

        if (await pathResolver.pathExists(entitiesPath)) {
          const entityDirs = (await fs.readdir(entitiesPath)).filter(
            (dir) => !dir.startsWith(".")
          );

          this.logger.info(
            `🔍 Found ${entityDirs.length} local ${entityType} entities`
          );

          for (const entityId of entityDirs) {
            try {
              const entityDirPath = path.join(entitiesPath, entityId);
              const stat = await fs.stat(entityDirPath);

              if (!stat.isDirectory()) continue;

              const entity = await this.loadEntity(
                app,
                entityType,
                entityDirPath,
                entityId
              );
              if (entity) {
                loadResults[entityType].local++;
                this.logger.info(
                  `✅ ${entityType} entity '${entity.id}' loaded successfully`
                );
              } else {
                loadResults[entityType].failed++;
              }
            } catch (err) {
              this.logger.error(
                { err },
                `❌ Failed to load ${entityType} entity ${entityId}`
              );
              loadResults[entityType].failed++;
            }
          }
        }
      } catch (err) {
        this.logger.warn(
          { err },
          `Failed to load local ${entityType} entities`
        );
      }
    }

    // Log summary
    for (const [entityType, results] of Object.entries(loadResults)) {
      const total = results.local + results.npm;
      if (total > 0 || results.failed > 0) {
        this.logger.info(
          `🧩 ${entityType}: ${total} loaded (${results.local} local, ${results.npm} npm), ${results.failed} failed`
        );
      }
    }

    return loadResults;
  }

  async reloadEntity(app, entityType, entityId) {
    const existingEntity = this.getEntity(entityType, entityId);
    if (!existingEntity) {
      throw new EntityError(
        `Entity ${entityType}:${entityId} not found`,
        entityType,
        entityId
      );
    }

    const source = existingEntity.config.source;

    await this.lifecycleManager.transition(
      entityType,
      entityId,
      "reload",
      async () => {
        this.entityRegistry.unregister(entityType, entityId);

        try {
          const entity = await this.loadEntity(
            app,
            entityType,
            source,
            entityId
          );
          this.entityRegistry.entityStats.reloaded++;
          return entity;
        } catch (err) {
          // Re-register the old entity if reload fails
          this.entityRegistry.register(existingEntity);
          throw err;
        }
      }
    );
  }

  async unloadEntity(entityType, entityId) {
    return await this.lifecycleManager.transition(
      entityType,
      entityId,
      "unload",
      async () => {
        this.entityRegistry.unregister(entityType, entityId);
      }
    );
  }
}

/**
 * Main Generic Entity Server
 */
export class GenericEntityServer {
  constructor(options = {}) {
    this.suppressErrorLogging = options.suppressErrorLogging || process.env.NODE_ENV === 'test';
    this.configManager = new EntityConfigurationManager(options, { suppressErrorLogging: this.suppressErrorLogging });
    this.pathResolver = null; // Will be initialized with project root during start
    this.securityService = new EntitySecurityService(options.security || {});
    this.projectRoot = null; // Will be set during start

    // Dependencies will be initialized during start
    this.dependencies = null;
    this.app = null;
    this.lifecycleManager = null;
  }

  async start(options = {}) {
    try {
      // Find project root (workspace root)
      this.projectRoot = await findProjectRoot();
      
      // Initialize PathResolver with project root
      this.pathResolver = new PathResolver(this.projectRoot);
      
      // Load entity configuration from project root
      await this.configManager.loadEntityConfig(options.entityConfigPath, this.projectRoot);

      // Merge and validate configuration
      this.configManager.merge(options);
      const configResult = this.configManager.validate();

      if (!configResult.success) {
        const errorMessage = `Configuration errors: ${configResult.error.join(", ")}`;
        if (!this.suppressErrorLogging) {
          console.error(`Failed to start server: ValidationError: ${errorMessage}`);
        }
        throw new ValidationError(errorMessage);
      }

      const config = configResult.value;

      // Initialize Fastify
      this.app = Fastify({
        logger: config.logger.pretty
          ? {
              transport: {
                target: "pino-pretty",
                options: {
                  translateTime: "HH:MM:ss Z",
                  ignore: "pid,hostname",
                },
              },
              level: config.logger.level,
            }
          : {
              level: config.logger.level,
            },
        trustProxy: true,
      });

      // Initialize dependencies
      const resourceLoader = new ResourceLoader(
        this.app.log,
        this.pathResolver
      );
      const pluginManager = new PluginManager(
        this.app.log,
        this.pathResolver,
        this.securityService
      );
      const entityFactory = new EntityFactory(
        this.app.log,
        this.pathResolver,
        resourceLoader,
        this.securityService,
        this.configManager
      );
      const entityRegistry = new EntityRegistry(
        this.app.log,
        this.configManager
      );
      const identificationManager = new EntityIdentificationManager(
        this.securityService
      );
      const lifecycleManager = new EntityLifecycleManager(this.app.log);

      const entityManager = new EntityManager({
        logger: this.app.log,
        securityService: this.securityService,
        entityFactory,
        entityRegistry,
        configManager: this.configManager,
        identificationManager,
        lifecycleManager,
      });

      this.serverLifecycleManager = new ServerLifecycleManager(
        this.app,
        this.app.log,
        entityManager
      );

      // Store dependencies
      this.dependencies = {
        resourceLoader,
        pluginManager,
        entityManager,
        config,
      };

      // Decorate app with managers
      this.app.decorate("entityManager", entityManager);
      this.app.decorate("resourceLoader", resourceLoader);
      this.app.decorate("pluginManager", pluginManager);
      this.app.decorate("configManager", this.configManager);

      // Setup request hooks
      this.serverLifecycleManager.setupRequestPipeline();

      // Setup health check endpoint
      this.setupHealthCheck();

      // Load core plugins
      await this.loadCorePlugins(config);

      // Load all entities first (so entity routes are registered with priority)
      if (config.entities?.autoLoad !== false) {
        await entityManager.loadAllEntities(this.app, this.pathResolver);
      }

      // Load global routes last (to ensure they don't override entity routes)
      // This ensures entity-specific routes like /tenants/* take precedence
      await this.loadGlobalRoutes(config);

      this.app.log.info("✅ Server initialized successfully");

      return this;
    } catch (err) {
      if (!this.suppressErrorLogging) {
        this.app?.log?.error({ err }, "Failed to start server") ||
          console.error("Failed to start server:", err);
      }
      
      // Clean up partially initialized state on error
      await this.cleanup();
      
      throw err;
    }
  }

  setupHealthCheck() {
    this.app.get("/health", async (request, reply) => {
      const entityStats = this.dependencies.entityManager.getStats();
      const lifecycleStates =
        this.dependencies.entityManager.lifecycleManager.getAllEntityStates();

      return {
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        entities: entityStats,
        lifecycleStates,
        version: process.env.npm_package_version || "1.0.0",
      };
    });

    this.app.get("/admin/entities", async (request, reply) => {
      const entityTypes = this.configManager.getAllEntityTypes();
      const result = {};

      for (const entityType of entityTypes) {
        const definition = this.configManager.getEntityDefinition(entityType);
        const entities =
          this.dependencies.entityManager.getEntitiesByType(entityType);

        result[entityType] = {
          definition,
          instances: entities.map((e) => e.toJSON()),
        };
      }

      return {
        success: true,
        data: result,
      };
    });

    this.app.get("/admin/entities/:entityType", async (request, reply) => {
      const { entityType } = request.params;
      const entities = this.dependencies.entityManager
        .getEntitiesByType(entityType)
        .map((e) => e.toJSON());

      return {
        success: true,
        entityType,
        data: entities,
        count: entities.length,
      };
    });

    this.app.get(
      "/admin/entities/:entityType/:entityId",
      async (request, reply) => {
        const { entityType, entityId } = request.params;
        const entity = this.dependencies.entityManager.getEntity(
          entityType,
          entityId
        );

        if (!entity) {
          return reply.code(404).send({
            success: false,
            error: `Entity ${entityType}:${entityId} not found`,
          });
        }

        return {
          success: true,
          data: entity.toJSON(),
        };
      }
    );
  }

  async loadCorePlugins(config) {
    const pluginsDir = path.join(this.pathResolver.baseDir, "plugins");

    if (!(await this.pathResolver.pathExists(pluginsDir))) {
      this.app.log.warn("No core plugins directory found");
      return;
    }

    try {
      const entries = await fs.readdir(pluginsDir, { withFileTypes: true });
      // Filter to only include directories, not files
      const pluginDirs = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
      
      const coreOrder = config.plugins?.coreOrder || [];

      const orderedPlugins = [
        ...coreOrder.filter((name) => pluginDirs.includes(name)),
        ...pluginDirs.filter(
          (name) => !coreOrder.includes(name) && !name.startsWith(".")
        ),
      ];

      const result = await this.dependencies.pluginManager.loadLocalPlugins(
        this.app,
        orderedPlugins,
        config.plugins || {}
      );

      if (!result.success) {
        throw new PluginError("Failed to load core plugins", "core");
      }

      this.app.log.info("Core plugins loaded successfully");
      return result.value;
    } catch (err) {
      this.app.log.error({ err }, "Failed to load core plugins");
      throw err;
    }
  }

  async loadGlobalRoutes(config) {
    // Use the configured global routes path from config
    const globalRoutesPath =
      config.entities?.globalResources?.routes || "/routes";
    const routesBaseDir = path.join(
      this.pathResolver.baseDir,
      globalRoutesPath.replace(/^\//, "")
    );

    if (!(await this.pathResolver.pathExists(routesBaseDir))) {
      this.app.log.warn(
        `No global routes directory found at ${globalRoutesPath}`
      );
      return;
    }

    try {
      // Import glob dynamically
      const { glob } = await import("glob");

      // Find all route modules using glob pattern
      const pattern = path.join(routesBaseDir, "**/index.mjs");
      const routeFiles = await glob(pattern, {
        ignore: ["**/node_modules/**"],
      });

      // Sort files for consistent loading order
      routeFiles.sort();

      this.app.log.info(
        `Found ${routeFiles.length} route module(s) to load from ${globalRoutesPath}`
      );

      const loadedRoutes = [];

      // Load each route module
      for (const routeFile of routeFiles) {
        try {
          // Get relative path for logging
          const relativePath = path.relative(routesBaseDir, routeFile);
          let routeName = path.dirname(relativePath);
          
          // Normalize the route name to avoid relative path issues
          // Extract just the directory name without any ../ prefixes
          const routePathSegments = routeName.split(path.sep).filter(seg => seg !== '.' && seg !== '..');
          routeName = routePathSegments.length > 0 ? routePathSegments[routePathSegments.length - 1] : 'root';

          this.app.log.info(`Loading routes from: ${relativePath}`);

          // Load the route module using ResourceLoader for consistency
          const result = await this.dependencies.resourceLoader.loadPlugin(
            this.app,
            path.dirname(routeFile),
            {
              namespace: `/Global/Routes/${routeName}`,
            }
          );

          if (result.success) {
            loadedRoutes.push({
              path: relativePath,
              directory: routeName,
              success: true,
            });
            this.app.log.info(
              `✅ Successfully loaded routes from: ${relativePath}`
            );
          } else {
            this.app.log.warn(
              `⚠️ Failed to load route module ${relativePath}: ${result.error}`
            );
            loadedRoutes.push({
              path: relativePath,
              directory: routeName,
              success: false,
              error: result.error,
            });
          }
        } catch (error) {
          this.app.log.error(
            `❌ Failed to load route module ${routeFile}: ${error.message}`
          );
          // Continue loading other routes even if one fails
        }
      }

      // Log summary
      const successCount = loadedRoutes.filter((r) => r.success).length;
      this.app.log.info(
        `✅ Global routes loading complete: ${successCount}/${loadedRoutes.length} modules loaded successfully`
      );

      // Define available endpoints
      const globalEndpoints = [
        { name: "Root", path: "/", description: "Hello World" },
        {
          name: "API Docs",
          path: "/api/docs",
          description: "API documentation",
        },
        { name: "API Status", path: "/api", description: "API status" },
        { name: "About", path: "/about", description: "System information" },
        {
          name: "Entity Discovery",
          path: "/api/discover",
          description: "Discover entities",
        },
        {
          name: "Capabilities",
          path: "/api/capabilities",
          description: "System capabilities",
        },
      ];

      const systemEndpoints = [
        { name: "Health Check", path: "/health", description: "Health status" },
        {
          name: "All Entities",
          path: "/admin/entities",
          description: "List all entity types",
        },
      ];

      // Add dynamic entity endpoints based on configuration
      const entityTypes = this.configManager.getAllEntityTypes();
      for (const entityType of entityTypes) {
        const definition = this.configManager.getEntityDefinition(entityType);
        if (definition.enabled) {
          systemEndpoints.push({
            name: `${entityType.charAt(0).toUpperCase() + entityType.slice(1)}s`,
            path: `/admin/entities/${entityType}`,
            description: `List ${entityType} entities`,
          });
        }
      }

      // Log endpoints
      this.app.log.info("\n📍 Available global endpoints:");
      for (const endpoint of globalEndpoints) {
        const padding = " ".repeat(Math.max(0, 20 - endpoint.name.length));
        this.app.log.info(`  ${endpoint.name}:${padding}${endpoint.path}`);
      }

      this.app.log.info("\n🏥 System endpoints:");
      for (const endpoint of systemEndpoints) {
        const padding = " ".repeat(Math.max(0, 20 - endpoint.name.length));
        this.app.log.info(`  ${endpoint.name}:${padding}${endpoint.path}`);
      }

      return loadedRoutes;
    } catch (err) {
      this.app.log.error(
        { err },
        `Failed to load global routes from ${globalRoutesPath}`
      );
      // Don't throw - global routes are optional
    }
  }

  async listen(port = null, host = null) {
    if (!this.app) {
      throw new Error("Server not initialized. Call start() first.");
    }

    const config = this.dependencies.config;
    const listenOptions = {
      port: port || config.server.port,
      host: host || config.server.host,
    };

    // Setup graceful shutdown
    this.serverLifecycleManager.setupGracefulShutdown();

    // Start listening
    await this.app.listen(listenOptions);

    this.app.log.info(
      `Server listening on ${listenOptions.host}:${listenOptions.port}`
    );

    const entityStats = this.dependencies.entityManager.getStats();
    this.app.log.info(`✅ Loaded ${entityStats.total} entities`);

    return this.app;
  }

  getRegisteredRoutes() {
    if (!this.app) return [];

    // Get the actual registered routes from Fastify
    const routeTree = this.app.printRoutes({ commonPrefix: false });

    // Parse the route tree to extract routes
    const routes = [];
    const lines = routeTree.split("\n");

    for (const line of lines) {
      // Parse Fastify route tree output
      // Format is typically: "├── /path (METHOD)"
      const match = line.match(/[├└]── (.+?) \((.+?)\)/);
      if (match) {
        routes.push({
          path: match[1],
          method: match[2],
        });
      }
    }

    return routes;
  }

  getEndpointPatterns() {
    const baseUrl = `http://localhost:${this.dependencies?.config?.server?.port || 3002}`;

    // High-level endpoint patterns (wildcards)
    const patterns = {
      global: [
        {
          name: "Global Routes",
          pattern: "/*",
          description: "Root-level routes",
        },
        { name: "API Routes", pattern: "/api/*", description: "API endpoints" },
      ],
      system: [
        { name: "Health", pattern: "/health", description: "Health check" },
        { name: "Admin", pattern: "/admin/*", description: "Admin endpoints" },
      ],
      entities: [],
    };

    // Add entity-specific patterns
    if (this.configManager) {
      const entityTypes = this.configManager.getAllEntityTypes();

      for (const entityType of entityTypes) {
        const definition = this.configManager.getEntityDefinition(entityType);
        if (definition?.enabled) {
          const routePrefix =
            definition.routePrefix?.replace("{entityId}", "*") ||
            `/${entityType}s/*`;

          patterns.entities.push({
            name: `${entityType.charAt(0).toUpperCase() + entityType.slice(1)}`,
            pattern: routePrefix,
            description: `${entityType} entity routes`,
            identificationStrategy: definition.identificationStrategy,
          });
        }
      }
    }

    return { baseUrl, patterns };
  }

  logEndpoints() {
    const { baseUrl, patterns } = this.getEndpointPatterns();

    console.log("\n🚀 Route Patterns:");
    console.log("─".repeat(50));

    // Log global patterns
    console.log("\n📍 Global patterns:");
    for (const pattern of patterns.global) {
      const padding = " ".repeat(Math.max(0, 20 - pattern.name.length));
      console.log(`  ${pattern.name}:${padding}${pattern.pattern}`);
    }

    // Log system patterns
    console.log("\n🏥 System patterns:");
    for (const pattern of patterns.system) {
      const padding = " ".repeat(Math.max(0, 20 - pattern.name.length));
      console.log(`  ${pattern.name}:${padding}${pattern.pattern}`);
    }

    // Log entity patterns
    if (patterns.entities.length > 0) {
      console.log("\n📦 Entity patterns:");
      for (const pattern of patterns.entities) {
        const padding = " ".repeat(Math.max(0, 20 - pattern.name.length));
        const strategy = pattern.identificationStrategy
          ? ` [${pattern.identificationStrategy}]`
          : "";
        console.log(
          `  ${pattern.name}:${padding}${pattern.pattern}${strategy}`
        );
      }
    }

    console.log("\n💡 Use 'printRoutes()' to see all registered routes");
    console.log("─".repeat(50));
  }

  printDetailedRoutes() {
    if (!this.app) {
      console.log("Server not initialized");
      return;
    }

    console.log("\n📋 Registered Routes (from Fastify):");
    console.log("─".repeat(50));
    console.log(this.app.printRoutes({ commonPrefix: false }));
    console.log("─".repeat(50));
  }

  async cleanup() {
    try {
      if (this.app) {
        // Check if the server is actually listening before trying to close
        if (this.app.server && this.app.server.listening) {
          await this.app.close();
        } else {
          // For non-listening servers, we still need to clean up any resources
          // that might have been initialized during startup
          if (this.app.server) {
            // Close the server handle if it exists but isn't listening
            this.app.server.close();
          }
        }
        this.app = null;
      }
      this.dependencies = null;
      this.serverLifecycleManager = null;
    } catch (err) {
      // Log but don't throw during cleanup
      console.error('Error during cleanup:', err.message);
    }
  }

  async stop() {
    await this.cleanup();
  }
}

/**
 * Factory function for backward compatibility
 */
export async function start(options = {}) {
  const server = new GenericEntityServer(options);
  await server.start(options);
  return server;
}

/**
 * Default export
 */
export default {
  start,
  GenericEntityServer,
  EntityConfigurationManager,
  EntityManager,
  EntityContext,
  EntityRegistry,
  EntityFactory,
  EntityAdapter,
  LocalEntityAdapter,
  NPMEntityAdapter,
  EntityIdentificationStrategy,
  SubdomainIdentificationStrategy,
  PathIdentificationStrategy,
  HeaderIdentificationStrategy,
  QueryIdentificationStrategy,
  CompositeIdentificationStrategy,
  EntityLifecycleManager,
  EntitySecurityService,
  PluginManager,
  ResourceLoader,
  PathResolver,
  Result,
  ValidationError,
  EntityError,
  PluginError,
};
