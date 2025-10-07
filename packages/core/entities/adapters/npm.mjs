import { EntityAdapter } from "./base.mjs";
import merge from "deepmerge";

/**
 * NPM package entity adapter
 * Loads entities from NPM packages
 */
export class NPMEntityAdapter extends EntityAdapter {
  constructor(logger, pathResolver, resourceLoader, loadingStrategy) {
    super(logger, pathResolver, resourceLoader, loadingStrategy);
    this.moduleCache = new Map();
  }

  /**
   * Get adapter type identifier
   * @returns {string} Adapter type
   */
  getType() {
    return "npm";
  }

  /**
   * Check if adapter can handle the source
   * @param {string} source - NPM package name
   * @returns {Promise<boolean>} True if can handle
   */
  async canHandle(source) {
    try {
      await this.pathResolver.getModuleInfo(source);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load entity configuration from NPM package
   * @param {string} packageName - NPM package name
   * @param {Object} defaults - Default configuration
   * @returns {Promise<Object>} Entity configuration
   */
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

  /**
   * Load entity resources from NPM package
   * @param {Object} app - Fastify app instance
   * @param {EntityContext} entityContext - Entity context
   * @returns {Promise<void>}
   */
  async loadResources(app, entityContext) {
    const { type: entityType, id: entityId, config } = entityContext;
    const packageName = config.packageName;

    try {
      const mainModule = await import(packageName);
      const entityExport = mainModule.default || mainModule;

      // If the module exports a Fastify plugin function
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

      // Load additional resources from package directory
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

        // Process schemas
        if (results.schemas.success) {
          results.schemas.value.forEach((schemaId) =>
            entityContext.addSchema(schemaId)
          );
          this.logger.debug(
            `Loaded ${results.schemas.value.length} schemas from NPM package`
          );
        }

        // Process services
        if (results.services.success) {
          Object.entries(results.services.value).forEach(([name, service]) => {
            entityContext.addService(name, service);
          });
          this.logger.debug(
            `Loaded ${Object.keys(results.services.value).length} services from NPM package`
          );
        }

        // Process plugins
        if (results.plugins.success) {
          results.plugins.value.forEach((plugin) =>
            entityContext.addPlugin(plugin)
          );
          this.logger.debug(
            `Loaded ${results.plugins.value.length} plugins from NPM package`
          );
        }

        // Process routes
        if (results.routes.success && results.routes.value) {
          entityContext.addRoute(config.path);
          this.logger.debug(`Loaded routes from NPM package`);
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

  /**
   * Get adapter capabilities
   * @returns {Object} Capabilities object
   */
  getCapabilities() {
    return {
      hotReload: false,
      remoteLoading: true,
      caching: true,
      versioning: true,
      packageManagement: true,
    };
  }

  /**
   * Cache loaded module
   * @param {string} packageName - Package name
   * @param {Object} module - Module exports
   */
  cacheModule(packageName, module) {
    this.moduleCache.set(packageName, {
      module,
      loadedAt: Date.now(),
    });
  }

  /**
   * Get cached module
   * @param {string} packageName - Package name
   * @returns {Object|null} Cached module or null
   */
  getCachedModule(packageName) {
    const cached = this.moduleCache.get(packageName);
    if (cached) {
      // Optionally check cache age
      const age = Date.now() - cached.loadedAt;
      const maxAge = 5 * 60 * 1000; // 5 minutes
      if (age < maxAge) {
        return cached.module;
      }
      this.moduleCache.delete(packageName);
    }
    return null;
  }

  /**
   * Clear module cache
   * @param {string} packageName - Package name to clear, or undefined for all
   */
  clearCache(packageName) {
    if (packageName) {
      this.moduleCache.delete(packageName);
    } else {
      this.moduleCache.clear();
    }
  }

  /**
   * Get package metadata
   * @param {string} packageName - Package name
   * @returns {Promise<Object>} Package metadata
   */
  async getPackageMetadata(packageName) {
    try {
      const moduleInfo = await this.pathResolver.getModuleInfo(packageName);
      return {
        name: packageName,
        version: moduleInfo.packageJson.version,
        description: moduleInfo.packageJson.description,
        main: moduleInfo.packageJson.main,
        path: moduleInfo.rootDir,
        dependencies: moduleInfo.packageJson.dependencies || {},
      };
    } catch (err) {
      this.logger.error({ err }, `Failed to get metadata for ${packageName}`);
      return null;
    }
  }

  /**
   * Validate NPM package structure
   * @param {string} packageName - Package name
   * @returns {Promise<Object>} Validation result
   */
  async validatePackage(packageName) {
    const result = {
      valid: true,
      errors: [],
      warnings: [],
    };

    try {
      const moduleInfo = await this.pathResolver.getModuleInfo(packageName);

      // Check if main export exists
      try {
        const mainModule = await import(packageName);
        if (!mainModule.default && !mainModule) {
          result.warnings.push('Package has no default export');
        }
      } catch (err) {
        result.valid = false;
        result.errors.push(`Cannot import package: ${err.message}`);
      }

      // Check package.json for entity metadata
      if (!moduleInfo.packageJson.entityConfig) {
        result.warnings.push('Package.json missing entityConfig metadata');
      }

    } catch (err) {
      result.valid = false;
      result.errors.push(`Cannot resolve package: ${err.message}`);
    }

    return result;
  }

  /**
   * List available NPM entity packages
   * @param {string} pattern - Package name pattern
   * @returns {Promise<Array>} List of available packages
   */
  async listAvailablePackages(pattern = 'fastify-mta-entity-*') {
    // This would typically query npm registry or local packages
    // For now, return empty array
    this.logger.debug(`Would search for packages matching: ${pattern}`);
    return [];
  }
}