import path from "path";
import fs from "fs/promises";
import { Result } from "@thinkeloquent/core-exceptions";
import { ResourceLoadingStrategy } from "../base.mjs";

/**
 * Flat resource loading strategy
 * Loads resources only from the entity-specific directory without hierarchy
 */
export class FlatResourceStrategy extends ResourceLoadingStrategy {
  constructor(resourceLoader) {
    super();
    this.resourceLoader = resourceLoader;
  }

  /**
   * Load schemas from entity directory only
   * @param {Object} context - Loading context
   * @returns {Promise<Result>} Result with loaded schemas
   */
  async loadSchemas(context) {
    const { entityPath, app, pathResolver } = context;
    const entitySchemaPath = path.join(entityPath, "schemas");

    if (await pathResolver.pathExists(entitySchemaPath)) {
      return await this.resourceLoader.loadSchemas(app, entitySchemaPath);
    }

    return Result.ok([]);
  }

  /**
   * Load services from entity directory only
   * @param {Object} context - Loading context
   * @returns {Promise<Result>} Result with loaded services
   */
  async loadServices(context) {
    const { entityPath, entityType, entityId, pathResolver, config } = context;
    const servicesPath = path.join(entityPath, "services");

    if (await pathResolver.pathExists(servicesPath)) {
      return await this.resourceLoader.loadServices(servicesPath, {
        db: context.app?.db,
        config,
        entityType,
        entityId,
      });
    }

    return Result.ok({});
  }

  /**
   * Load plugins from entity directory only
   * @param {Object} context - Loading context
   * @returns {Promise<Result>} Result with loaded plugins
   */
  async loadPlugins(context) {
    const { entityPath, entityType, entityId, app, pathResolver, config } = context;
    const loadedPlugins = [];
    const pluginsPath = path.join(entityPath, "plugins");

    if (await pathResolver.pathExists(pluginsPath)) {
      try {
        const pluginDirs = await fs.readdir(pluginsPath);

        for (const pluginName of pluginDirs) {
          if (pluginName.startsWith(".")) continue;

          const pluginPath = path.join(pluginsPath, pluginName);
          const result = await this.resourceLoader.loadPlugin(app, pluginPath, {
            entityType,
            entityId,
            config,
            namespace: `/Entity/${entityType}/${entityId}/Plugin/${pluginName}`,
          });

          if (result.success) {
            loadedPlugins.push(pluginName);
          }
        }
      } catch (err) {
        return Result.fail(`Failed to load plugins: ${err.message}`);
      }
    }

    return Result.ok(loadedPlugins);
  }

  /**
   * Load routes from entity directory only
   * @param {Object} context - Loading context
   * @returns {Promise<Result>} Result with loaded routes
   */
  async loadRoutes(context) {
    const { entityPath, entityType, entityId, app, pathResolver, config } = context;
    const routesPath = path.join(entityPath, "routes");

    if (await pathResolver.pathExists(routesPath)) {
      const routePrefix = `/${entityType}s/${entityId}`;
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

  /**
   * Get strategy metadata
   * @returns {Object} Strategy metadata
   */
  getMetadata() {
    return {
      type: "FlatResourceStrategy",
      supportsHierarchy: false,
      supportsCaching: false,
      supportsLazyLoading: false,
      description: "Loads resources only from entity-specific directory",
    };
  }

  /**
   * Validate context for flat loading
   * @param {Object} context - Loading context
   * @returns {boolean} True if valid
   */
  validateContext(context) {
    return Boolean(
      super.validateContext(context) &&
      context.app &&
      context.pathResolver
    );
  }
}