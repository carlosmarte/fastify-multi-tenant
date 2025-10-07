import path from "path";
import { readFile } from "fs/promises";
import { Result, DatabaseConfigurationError } from "@thinkeloquent/core-exceptions";
import { CacheStore } from "@thinkeloquent/core-cache";

export class PluginManager {
  constructor(logger, pathResolver, securityService, cacheOptions = {}) {
    this.logger = logger;
    this.pathResolver = pathResolver;
    this.securityService = securityService;

    // Use CacheStore for better caching
    this.pluginCache = new CacheStore({
      ttl: cacheOptions.ttl || 0, // No TTL for plugins by default
      maxSize: cacheOptions.maxSize || 200,
      evictionPolicy: 'lru',
      enabled: cacheOptions.enabled !== false,
    });
  }

  async loadLocalPlugin(app, pluginName, options = {}) {
    try {
      const sanitizedName = this.securityService.validatePluginName(pluginName);
      const cacheKey = `local:${sanitizedName}`;

      // Check cache
      const cachedPlugin = this.pluginCache.get(cacheKey);
      if (cachedPlugin) {
        const { fastify, ...cleanOptions } = options;
        await app.register(cachedPlugin, cleanOptions);
        this.logger.debug(`Registered cached plugin ${sanitizedName}`);
        return Result.ok({ plugin: cachedPlugin, cached: true });
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

      // Cache the plugin
      this.pluginCache.set(cacheKey, plugin);

      const { fastify, ...cleanOptions } = options;
      await app.register(plugin, cleanOptions);
      this.logger.debug(`Registered plugin ${sanitizedName}`);

      return Result.ok({ plugin, cached: false });
    } catch (err) {
      // Enhanced error handling for database-related plugins
      if (pluginName === "sequelize-db" || pluginName === "database") {
        if (err.message?.includes("Dialect needs to be explicitly supplied")) {
          const dbErr = new DatabaseConfigurationError(
            `Database plugin ${pluginName} failed: DB_DIALECT not set. Please set DB_DIALECT to 'postgres', 'mysql', or 'sqlite'`,
            "DB_DIALECT"
          );
          this.logger.error({ err: dbErr }, dbErr.message);
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
      // Check cache
      const cachedPlugin = this.pluginCache.get(cacheKey);
      if (cachedPlugin) {
        const { fastify, ...cleanOptions } = options;
        await app.register(cachedPlugin, cleanOptions);
        this.logger.debug(`Registered cached NPM plugin ${pluginName}`);
        return Result.ok({ plugin: cachedPlugin, cached: true });
      }

      const pluginModule = await import(pluginName);
      const plugin = pluginModule.default || pluginModule;

      if (typeof plugin !== "function") {
        return Result.fail(`Plugin is not a function: ${pluginName}`);
      }

      // Cache the plugin
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
        await readFile(packageJsonPath, "utf8")
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

  /**
   * Clear plugin cache
   * @param {string} pluginName - Optional plugin name to clear
   */
  clearCache(pluginName) {
    if (pluginName) {
      this.pluginCache.delete(`local:${pluginName}`);
      this.pluginCache.delete(`npm:${pluginName}`);
    } else {
      this.pluginCache.clear();
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return this.pluginCache.getStats();
  }
}