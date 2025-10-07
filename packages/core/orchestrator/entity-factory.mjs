import path from "path";
import { EntityError } from "@thinkeloquent/core-exceptions";
import { HierarchicalResourceStrategy } from "@thinkeloquent/core-loading-strategy";
import { EntityContext, LocalEntityAdapter, NPMEntityAdapter } from "@thinkeloquent/core-entities";

/**
 * Factory for creating and initializing entity instances
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