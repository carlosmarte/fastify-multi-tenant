/**
 * Entity-related error for entity operations
 */
export class EntityError extends Error {
  constructor(message, entityType, entityId) {
    super(message);
    this.name = "EntityError";
    this.entityType = entityType;
    this.entityId = entityId;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      entityType: this.entityType,
      entityId: this.entityId,
    };
  }
}