import { AbstractMethodError } from "@thinkeloquent/core-exceptions";

/**
 * Abstract base class for entity adapters
 * Entity adapters handle loading and managing entities from different sources
 */
export class EntityAdapter {
  constructor(logger, pathResolver, resourceLoader, loadingStrategy) {
    this.logger = logger;
    this.pathResolver = pathResolver;
    this.resourceLoader = resourceLoader;
    this.loadingStrategy = loadingStrategy;
  }

  /**
   * Get adapter type identifier
   * @returns {string} Adapter type
   * @abstract
   */
  getType() {
    throw new AbstractMethodError("getType", "EntityAdapter");
  }

  /**
   * Load entity configuration
   * @param {string} entityPath - Path to entity
   * @param {Object} defaults - Default configuration
   * @returns {Promise<Object>} Entity configuration
   * @abstract
   */
  async loadConfig(entityPath, defaults) {
    throw new AbstractMethodError("loadConfig", "EntityAdapter");
  }

  /**
   * Load entity resources
   * @param {Object} app - Fastify app instance
   * @param {EntityContext} entityContext - Entity context
   * @returns {Promise<void>}
   * @abstract
   */
  async loadResources(app, entityContext) {
    throw new AbstractMethodError("loadResources", "EntityAdapter");
  }

  /**
   * Check if adapter can handle the source
   * @param {string} source - Entity source
   * @returns {Promise<boolean>} True if can handle
   * @abstract
   */
  async canHandle(source) {
    throw new AbstractMethodError("canHandle", "EntityAdapter");
  }

  /**
   * Validate entity configuration
   * @param {Object} config - Configuration to validate
   * @returns {boolean} True if valid
   */
  validateConfig(config) {
    return config && typeof config === 'object';
  }

  /**
   * Get adapter capabilities
   * @returns {Object} Capabilities object
   */
  getCapabilities() {
    return {
      hotReload: false,
      remoteLoading: false,
      caching: false,
      versioning: false,
    };
  }

  /**
   * Initialize adapter
   * @returns {Promise<void>}
   */
  async initialize() {
    // Override in subclasses if initialization is needed
  }

  /**
   * Cleanup adapter resources
   * @returns {Promise<void>}
   */
  async cleanup() {
    // Override in subclasses if cleanup is needed
  }

  /**
   * Get adapter metadata
   * @returns {Object} Metadata object
   */
  getMetadata() {
    return {
      type: this.getType(),
      capabilities: this.getCapabilities(),
      version: '1.0.0',
    };
  }

  /**
   * Handle loading error
   * @param {Error} error - Error that occurred
   * @param {string} entityType - Entity type
   * @param {string} entityId - Entity ID
   */
  handleLoadingError(error, entityType, entityId) {
    this.logger.error({
      err: error,
      entityType,
      entityId,
      adapter: this.getType()
    }, `Failed to load entity with ${this.getType()} adapter`);
  }

  /**
   * Normalize entity source path
   * @param {string} source - Source path
   * @returns {string} Normalized path
   */
  normalizePath(source) {
    return source;
  }

  /**
   * Check if entity source exists
   * @param {string} source - Entity source
   * @returns {Promise<boolean>} True if exists
   */
  async sourceExists(source) {
    return this.canHandle(source);
  }

  /**
   * Get entity source info
   * @param {string} source - Entity source
   * @returns {Promise<Object>} Source information
   */
  async getSourceInfo(source) {
    return {
      source,
      type: this.getType(),
      exists: await this.sourceExists(source),
    };
  }
}