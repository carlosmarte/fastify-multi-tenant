import path from "path";
import fs from "fs/promises";
import Fastify from "fastify";
import { findProjectRoot, PathResolver } from "@thinkeloquent/core-folders";
import { EntityConfigurationManager } from "@thinkeloquent/core-configure";
import { EntitySecurityService } from "@thinkeloquent/core-security";
import {
  ConfigurationValidationError,
  PluginError,
  ServerStateError
} from "@thinkeloquent/core-exceptions";
import { ResourceLoader } from "@thinkeloquent/core-loading-strategy";
import { EntityLifecycleManager } from "@thinkeloquent/core-entities";
import {
  EntityFactory,
  EntityRegistry,
  EntityManager
} from "@thinkeloquent/core-orchestrator";
import { EntityIdentificationManager } from "@thinkeloquent/core-entity-identification-strategy";
import { ServerLifecycleManager } from "./server-lifecycle-manager.mjs";
import { PluginManager } from "@thinkeloquent/core-plugins";

export class GenericEntityServer {
  constructor(options = {}) {
    this.suppressErrorLogging = options.suppressErrorLogging !== undefined
      ? options.suppressErrorLogging
      : process.env.NODE_ENV === 'test';
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
          console.error(`Failed to start server: ConfigurationValidationError: ${errorMessage}`);
        }
        throw new ConfigurationValidationError(configResult.error);
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
      throw new ServerStateError("Server not initialized. Call start() first.", "uninitialized", "initialized");
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