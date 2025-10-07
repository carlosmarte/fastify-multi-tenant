import path from "path";
import fs from "fs/promises";
import fastGlob from "fast-glob";
import merge from "deepmerge";
import { Result, DatabaseConfigurationError } from "@thinkeloquent/core-exceptions";

/**
 * Resource loader
 * Handles loading of various resource types (services, plugins, schemas, configs)
 */
export class ResourceLoader {
  constructor(logger, pathResolver) {
    this.logger = logger;
    this.pathResolver = pathResolver;
    this.loadedResources = new Map();
  }

  /**
   * Load services from a directory
   * @param {string} servicesPath - Path to services directory
   * @param {Object} options - Loading options
   * @returns {Promise<Result>} Result with loaded services
   */
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

  /**
   * Load a plugin from a directory
   * @param {Object} app - Fastify app instance
   * @param {string} pluginPath - Path to plugin directory
   * @param {Object} options - Loading options
   * @returns {Promise<Result>} Result indicating success or failure
   */
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
      this.logger.info(`📦 Loaded plugin from ${options.namespace}`);
      return Result.ok(true);
    } catch (err) {
      // Enhanced error handling for database errors
      if (err.message?.includes("Dialect needs to be explicitly supplied")) {
        const dbErr = new DatabaseConfigurationError(
          `Database configuration error in plugin ${options.namespace}: Missing DB_DIALECT environment variable`,
          "DB_DIALECT"
        );
        this.logger.error({ err: dbErr }, dbErr.message);
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

  /**
   * Load schemas from a directory
   * @param {Object} app - Fastify app instance
   * @param {string} schemaPath - Path to schemas directory
   * @param {Object} options - Loading options
   * @returns {Promise<Result>} Result with loaded schema IDs
   */
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

  /**
   * Load configuration from a directory
   * @param {string} configPath - Path to config directory
   * @param {Object} defaults - Default configuration
   * @param {Object} options - Loading options
   * @returns {Promise<Object>} Loaded configuration
   */
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

  /**
   * Clear resource cache
   * @param {string} type - Resource type to clear, or undefined for all
   */
  clearCache(type) {
    if (type) {
      const keysToDelete = [];
      for (const key of this.loadedResources.keys()) {
        if (key.startsWith(`${type}:`)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => this.loadedResources.delete(key));
    } else {
      this.loadedResources.clear();
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    const stats = {
      totalEntries: this.loadedResources.size,
      byType: {}
    };

    for (const key of this.loadedResources.keys()) {
      const type = key.split(':')[0];
      stats.byType[type] = (stats.byType[type] || 0) + 1;
    }

    return stats;
  }

  /**
   * Check if a resource is cached
   * @param {string} key - Cache key
   * @returns {boolean} True if cached
   */
  isCached(key) {
    return this.loadedResources.has(key);
  }

  /**
   * Get cached resource
   * @param {string} key - Cache key
   * @returns {any} Cached resource or undefined
   */
  getCached(key) {
    return this.loadedResources.get(key);
  }
}