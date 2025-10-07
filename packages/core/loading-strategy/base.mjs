import { AbstractMethodError } from "@thinkeloquent/core-exceptions";

/**
 * Resource loading strategy interface
 * Base class for different resource loading patterns
 */
export class ResourceLoadingStrategy {
  /**
   * Load all resources for an entity
   * @param {Object} context - Loading context
   * @returns {Promise<Object>} Loaded resources
   */
  async loadResources(context) {
    const results = {
      schemas: await this.loadSchemas(context),
      services: await this.loadServices(context),
      plugins: await this.loadPlugins(context),
      routes: await this.loadRoutes(context),
    };

    return results;
  }

  /**
   * Load schemas for an entity
   * @param {Object} context - Loading context
   * @returns {Promise<Result>} Result with loaded schemas
   * @abstract
   */
  async loadSchemas(context) {
    throw new AbstractMethodError("loadSchemas", "ResourceLoadingStrategy");
  }

  /**
   * Load services for an entity
   * @param {Object} context - Loading context
   * @returns {Promise<Result>} Result with loaded services
   * @abstract
   */
  async loadServices(context) {
    throw new AbstractMethodError("loadServices", "ResourceLoadingStrategy");
  }

  /**
   * Load plugins for an entity
   * @param {Object} context - Loading context
   * @returns {Promise<Result>} Result with loaded plugins
   * @abstract
   */
  async loadPlugins(context) {
    throw new AbstractMethodError("loadPlugins", "ResourceLoadingStrategy");
  }

  /**
   * Load routes for an entity
   * @param {Object} context - Loading context
   * @returns {Promise<Result>} Result with loaded routes
   * @abstract
   */
  async loadRoutes(context) {
    throw new AbstractMethodError("loadRoutes", "ResourceLoadingStrategy");
  }

  /**
   * Get strategy metadata
   * @returns {Object} Strategy metadata
   */
  getMetadata() {
    return {
      type: this.constructor.name,
      supportsHierarchy: false,
      supportsCaching: false,
      supportsLazyLoading: false,
    };
  }

  /**
   * Validate loading context
   * @param {Object} context - Loading context to validate
   * @returns {boolean} True if valid
   */
  validateContext(context) {
    return Boolean(
      context &&
      context.entityPath &&
      context.entityType &&
      context.entityId
    );
  }

  /**
   * Hook called before loading resources
   * @param {Object} context - Loading context
   * @returns {Promise<void>}
   */
  async beforeLoad(context) {
    // Override in subclasses if needed
  }

  /**
   * Hook called after loading resources
   * @param {Object} context - Loading context
   * @param {Object} results - Loading results
   * @returns {Promise<void>}
   */
  async afterLoad(context, results) {
    // Override in subclasses if needed
  }

  /**
   * Load resources with lifecycle hooks
   * @param {Object} context - Loading context
   * @returns {Promise<Object>} Loaded resources
   */
  async loadResourcesWithHooks(context) {
    await this.beforeLoad(context);
    const results = await this.loadResources(context);
    await this.afterLoad(context, results);
    return results;
  }
}