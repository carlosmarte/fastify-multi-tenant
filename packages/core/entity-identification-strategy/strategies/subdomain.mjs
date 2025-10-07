import { EntityIdentificationStrategy } from "../base.mjs";

/**
 * Subdomain identification strategy
 * Extracts entity ID from the subdomain portion of the hostname
 */
export class SubdomainIdentificationStrategy extends EntityIdentificationStrategy {
  /**
   * Extract entity ID from subdomain
   * @param {Object} request - Fastify request object
   * @param {Object} entityConfig - Entity configuration
   * @returns {string|null} Extracted entity ID or null
   */
  extractEntityId(request, entityConfig) {
    const pattern = entityConfig.extractPattern || "^([^.]+)\\.(.+\\..+)$";
    const hostnameMatch = request.hostname?.match(new RegExp(pattern));
    return hostnameMatch ? hostnameMatch[1] : null;
  }

  /**
   * Validate strategy configuration
   * @param {Object} entityConfig - Entity configuration to validate
   * @returns {boolean} True if configuration is valid
   */
  validateConfig(entityConfig) {
    if (entityConfig.extractPattern) {
      try {
        new RegExp(entityConfig.extractPattern);
      } catch {
        return false;
      }
    }
    return true;
  }

  /**
   * Get default configuration for this strategy
   * @returns {Object} Default configuration
   */
  static getDefaultConfig() {
    return {
      extractPattern: "^([^.]+)\\.(.+\\..+)$",
      allowWildcard: false,
      caseSensitive: false
    };
  }
}