import path from "path";
import fs from "fs/promises";
import { Result } from "@thinkeloquent/core-exceptions";
import { ResourceLoadingStrategy } from "../base.mjs";

/**
 * Hierarchical resource loading strategy
 * Loads resources in a hierarchical manner: global → parent → entity-specific
 */
export class HierarchicalResourceStrategy extends ResourceLoadingStrategy {
  constructor(resourceLoader, configManager) {
    super();
    this.resourceLoader = resourceLoader;
    this.configManager = configManager;
  }

  /**
   * Load schemas hierarchically
   * @param {Object} context - Loading context
   * @returns {Promise<Result>} Result with loaded schemas
   */
  async loadSchemas(context) {
    const { entityPath, entityType, entityId, app, pathResolver, config } = context;
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

  /**
   * Load services hierarchically with merge strategy support
   * @param {Object} context - Loading context
   * @returns {Promise<Result>} Result with loaded services
   */
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

  /**
   * Load plugins from entity-specific directory
   * @param {Object} context - Loading context
   * @returns {Promise<Result>} Result with loaded plugins
   */
  async loadPlugins(context) {
    const { entityPath, entityType, entityId, app, pathResolver, config } = context;
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

  /**
   * Load routes from entity-specific directory
   * @param {Object} context - Loading context
   * @returns {Promise<Result>} Result with loaded routes
   */
  async loadRoutes(context) {
    const { entityPath, entityType, entityId, app, pathResolver, config } = context;
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

  /**
   * Get strategy metadata
   * @returns {Object} Strategy metadata
   */
  getMetadata() {
    return {
      type: "HierarchicalResourceStrategy",
      supportsHierarchy: true,
      supportsCaching: false,
      supportsLazyLoading: false,
      mergeStrategies: ["override", "extend", "isolate"],
    };
  }

  /**
   * Get loading order for resources
   * @param {string} entityType - Entity type
   * @returns {Array<string>} Loading order
   */
  getLoadingOrder(entityType) {
    const entityDefinition = this.configManager.getEntityDefinition(entityType);
    const order = [];

    if (this.configManager.get("entities.hierarchicalLoading")) {
      order.push("global");
      if (entityDefinition?.parent) {
        order.push("parent");
      }
    }
    order.push("entity");

    return order;
  }

  /**
   * Apply merge strategy to resources
   * @param {Object} global - Global resources
   * @param {Object} entity - Entity-specific resources
   * @param {string} strategy - Merge strategy
   * @returns {Object} Merged resources
   */
  applyMergeStrategy(global, entity, strategy) {
    switch (strategy) {
      case "extend":
        return { ...global, ...entity };
      case "isolate":
        return entity;
      case "override":
      default:
        return entity || global;
    }
  }
}