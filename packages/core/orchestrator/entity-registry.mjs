import { EntityError } from "@thinkeloquent/core-exceptions";

/**
 * Registry for managing entity instances
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