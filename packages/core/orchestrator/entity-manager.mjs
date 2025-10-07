import path from "path";
import { readdir, stat } from "fs/promises";
import { EntityError } from "@thinkeloquent/core-exceptions";
import { EntityFactory } from "./entity-factory.mjs";
import { EntityRegistry } from "./entity-registry.mjs";
import { EntityLifecycleManager } from "@thinkeloquent/core-entities/lifecycle/manager";

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
          const entityDirs = (await readdir(entitiesPath)).filter(
            (dir) => !dir.startsWith(".")
          );

          this.logger.info(
            `🔍 Found ${entityDirs.length} local ${entityType} entities`
          );

          for (const entityId of entityDirs) {
            try {
              const entityDirPath = path.join(entitiesPath, entityId);
              const s = await stat(entityDirPath);

              if (!s.isDirectory()) continue;

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