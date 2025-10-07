import { AbstractMethodError } from "@thinkeloquent/core-exceptions";

/**
 * Base class for entity identification strategies
 * @abstract
 */
export class EntityIdentificationStrategy {
  /**
   * Extract entity ID from request
   * @param {Object} request - Fastify request object
   * @param {Object} entityConfig - Entity configuration
   * @returns {string|null} Extracted entity ID or null
   * @abstract
   */
  extractEntityId(request, entityConfig) {
    throw new AbstractMethodError("extractEntityId", "EntityIdentificationStrategy");
  }

  /**
   * Validate strategy configuration
   * @param {Object} entityConfig - Entity configuration to validate
   * @returns {boolean} True if configuration is valid
   */
  validateConfig(entityConfig) {
    return true;
  }

  /**
   * Get strategy type name
   * @returns {string} Strategy type name
   */
  getType() {
    return this.constructor.name.replace('IdentificationStrategy', '').toLowerCase();
  }

  /**
   * Check if this strategy can handle the given request
   * @param {Object} request - Fastify request object
   * @param {Object} entityConfig - Entity configuration
   * @returns {boolean} True if strategy can handle the request
   */
  canHandle(request, entityConfig) {
    try {
      const result = this.extractEntityId(request, entityConfig);
      return result !== null && result !== undefined;
    } catch {
      return false;
    }
  }

  /**
   * Get strategy priority (lower number = higher priority)
   * @param {Object} entityConfig - Entity configuration
   * @returns {number} Priority value
   */
  getPriority(entityConfig) {
    return entityConfig.priority || 999;
  }
}