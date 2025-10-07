import { EntityIdentificationStrategy } from "../base.mjs";

/**
 * Path identification strategy
 * Extracts entity ID from URL path segments
 */
export class PathIdentificationStrategy extends EntityIdentificationStrategy {
  /**
   * Extract entity ID from URL path
   * @param {Object} request - Fastify request object
   * @param {Object} entityConfig - Entity configuration
   * @returns {string|null} Extracted entity ID or null
   */
  extractEntityId(request, entityConfig) {
    const pathPrefix = entityConfig.pathPrefix || `/${entityConfig.type}s`;
    const pathSegment = entityConfig.pathSegment ?? 1;

    if (request.url?.startsWith(pathPrefix)) {
      const segments = request.url.split("/").filter(Boolean);
      return segments[pathSegment] || null;
    }

    return null;
  }

  /**
   * Validate strategy configuration
   * @param {Object} entityConfig - Entity configuration to validate
   * @returns {boolean} True if configuration is valid
   */
  validateConfig(entityConfig) {
    if (!entityConfig.type && !entityConfig.pathPrefix) {
      return false;
    }
    if (entityConfig.pathSegment !== undefined && entityConfig.pathSegment < 0) {
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
      pathSegment: 1,
      stripPrefix: true,
      caseSensitive: false
    };
  }

  /**
   * Strip entity prefix from URL for downstream processing
   * @param {string} url - Original URL
   * @param {string} entityId - Extracted entity ID
   * @param {Object} entityConfig - Entity configuration
   * @returns {string} Modified URL
   */
  stripEntityFromPath(url, entityId, entityConfig) {
    const pathPrefix = entityConfig.pathPrefix || `/${entityConfig.type}s`;
    if (entityConfig.stripPrefix !== false && url.startsWith(`${pathPrefix}/${entityId}`)) {
      return url.replace(`${pathPrefix}/${entityId}`, '') || '/';
    }
    return url;
  }
}