import { EntityIdentificationStrategy } from "../base.mjs";

/**
 * Query parameter identification strategy
 * Extracts entity ID from URL query parameters
 */
export class QueryIdentificationStrategy extends EntityIdentificationStrategy {
  /**
   * Extract entity ID from query parameters
   * @param {Object} request - Fastify request object
   * @param {Object} entityConfig - Entity configuration
   * @returns {string|null} Extracted entity ID or null
   */
  extractEntityId(request, entityConfig) {
    const parameterName = entityConfig.parameterName || entityConfig.type;
    const url = new URL(request.url, `http://${request.hostname}`);
    const value = url.searchParams.get(parameterName);

    return value || entityConfig.defaultValue || null;
  }

  /**
   * Validate strategy configuration
   * @param {Object} entityConfig - Entity configuration to validate
   * @returns {boolean} True if configuration is valid
   */
  validateConfig(entityConfig) {
    if (!entityConfig.type && !entityConfig.parameterName) {
      return false;
    }
    return true;
  }

  /**
   * Get default configuration for this strategy
   * @returns {Object} Default configuration
   */
  static getDefaultConfig() {
    return {
      required: false,
      defaultValue: null,
      allowMultiple: false
    };
  }

  /**
   * Extract all matching entity IDs (for multi-value support)
   * @param {Object} request - Fastify request object
   * @param {Object} entityConfig - Entity configuration
   * @returns {Array<string>} Array of extracted entity IDs
   */
  extractAllEntityIds(request, entityConfig) {
    const parameterName = entityConfig.parameterName || entityConfig.type;
    const url = new URL(request.url, `http://${request.hostname}`);
    const values = url.searchParams.getAll(parameterName);

    if (values.length === 0 && entityConfig.defaultValue) {
      return [entityConfig.defaultValue];
    }

    return values;
  }

  /**
   * Strip entity parameter from URL for downstream processing
   * @param {string} url - Original URL
   * @param {Object} entityConfig - Entity configuration
   * @returns {string} Modified URL without entity parameter
   */
  stripEntityFromQuery(url, entityConfig) {
    const parameterName = entityConfig.parameterName || entityConfig.type;
    const urlObj = new URL(url, 'http://example.com');
    urlObj.searchParams.delete(parameterName);
    return urlObj.pathname + urlObj.search;
  }
}