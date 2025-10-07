import { EntityIdentificationStrategy } from "../base.mjs";

/**
 * Header identification strategy
 * Extracts entity ID from HTTP headers
 */
export class HeaderIdentificationStrategy extends EntityIdentificationStrategy {
  /**
   * Extract entity ID from request headers
   * @param {Object} request - Fastify request object
   * @param {Object} entityConfig - Entity configuration
   * @returns {string|null} Extracted entity ID or null
   */
  extractEntityId(request, entityConfig) {
    const headerName = entityConfig.headerName || `X-${entityConfig.type}-ID`;
    const headerPattern = entityConfig.headerPattern || "^(.+)$";

    const headerValue = request.headers[headerName.toLowerCase()];
    if (headerValue) {
      const match = headerValue.match(new RegExp(headerPattern));
      return match ? match[1] : null;
    }

    return null;
  }

  /**
   * Validate strategy configuration
   * @param {Object} entityConfig - Entity configuration to validate
   * @returns {boolean} True if configuration is valid
   */
  validateConfig(entityConfig) {
    if (!entityConfig.type && !entityConfig.headerName) {
      return false;
    }
    if (entityConfig.headerPattern) {
      try {
        new RegExp(entityConfig.headerPattern);
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
      headerPattern: "^(.+)$",
      caseSensitive: false,
      required: false
    };
  }

  /**
   * Get all possible header names for this strategy
   * @param {Object} entityConfig - Entity configuration
   * @returns {Array<string>} Array of header names to check
   */
  getHeaderNames(entityConfig) {
    const primary = entityConfig.headerName || `X-${entityConfig.type}-ID`;
    const alternatives = entityConfig.alternativeHeaders || [];
    return [primary.toLowerCase(), ...alternatives.map(h => h.toLowerCase())];
  }
}