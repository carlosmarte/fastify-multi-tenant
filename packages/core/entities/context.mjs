/**
 * Entity context value object
 * Represents the runtime context of a loaded entity
 */
export class EntityContext {
  constructor(type, id, config, adapter) {
    this.type = type;
    this.id = id;
    this.config = config;
    this.adapter = adapter;
    this.services = {};
    this.plugins = new Set();
    this.routes = new Set();
    this.schemas = new Set();
    this.active = config.active !== false;
    this.createdAt = new Date();
    this.metadata = {
      parent: config.parent || null,
      priority: config.priority || 999,
      mergeStrategy: config.mergeStrategy || "override",
    };
  }

  /**
   * Add a service to the entity context
   * @param {string} name - Service name
   * @param {Object} service - Service instance
   */
  addService(name, service) {
    this.services[name] = service;
  }

  /**
   * Get a service from the entity context
   * @param {string} name - Service name
   * @returns {Object|null} Service instance or null
   */
  getService(name) {
    return this.services[name] || null;
  }

  /**
   * List all service names
   * @returns {Array<string>} Service names
   */
  listServices() {
    return Object.keys(this.services);
  }

  /**
   * Add a plugin to the entity context
   * @param {string} pluginName - Plugin name
   */
  addPlugin(pluginName) {
    this.plugins.add(pluginName);
  }

  /**
   * Add a schema to the entity context
   * @param {string} schemaId - Schema ID
   */
  addSchema(schemaId) {
    this.schemas.add(schemaId);
  }

  /**
   * Add a route to the entity context
   * @param {string} routePath - Route path
   */
  addRoute(routePath) {
    this.routes.add(routePath);
  }

  /**
   * Check if entity has a specific service
   * @param {string} name - Service name
   * @returns {boolean} True if service exists
   */
  hasService(name) {
    return name in this.services;
  }

  /**
   * Check if entity has a specific plugin
   * @param {string} pluginName - Plugin name
   * @returns {boolean} True if plugin exists
   */
  hasPlugin(pluginName) {
    return this.plugins.has(pluginName);
  }

  /**
   * Get all plugins
   * @returns {Array<string>} Plugin names
   */
  getPlugins() {
    return Array.from(this.plugins);
  }

  /**
   * Get all schemas
   * @returns {Array<string>} Schema IDs
   */
  getSchemas() {
    return Array.from(this.schemas);
  }

  /**
   * Get all routes
   * @returns {Array<string>} Route paths
   */
  getRoutes() {
    return Array.from(this.routes);
  }

  /**
   * Clear all services
   */
  clearServices() {
    this.services = {};
  }

  /**
   * Clear all plugins
   */
  clearPlugins() {
    this.plugins.clear();
  }

  /**
   * Clear all schemas
   */
  clearSchemas() {
    this.schemas.clear();
  }

  /**
   * Clear all routes
   */
  clearRoutes() {
    this.routes.clear();
  }

  /**
   * Convert to JSON representation
   * @returns {Object} JSON representation
   */
  toJSON() {
    return {
      type: this.type,
      id: this.id,
      config: this.config,
      services: Object.keys(this.services),
      plugins: Array.from(this.plugins),
      routes: Array.from(this.routes),
      schemas: Array.from(this.schemas),
      active: this.active,
      createdAt: this.createdAt,
      metadata: this.metadata,
    };
  }

  /**
   * Create a clone of this context
   * @returns {EntityContext} Cloned context
   */
  clone() {
    const cloned = new EntityContext(this.type, this.id, { ...this.config }, this.adapter);
    cloned.services = { ...this.services };
    cloned.plugins = new Set(this.plugins);
    cloned.routes = new Set(this.routes);
    cloned.schemas = new Set(this.schemas);
    cloned.active = this.active;
    cloned.createdAt = this.createdAt;
    cloned.metadata = { ...this.metadata };
    return cloned;
  }

  /**
   * Get entity key for identification
   * @returns {string} Entity key
   */
  getKey() {
    return `${this.type}:${this.id}`;
  }

  /**
   * Check if entity is active
   * @returns {boolean} True if active
   */
  isActive() {
    return this.active;
  }

  /**
   * Activate the entity
   */
  activate() {
    this.active = true;
  }

  /**
   * Deactivate the entity
   */
  deactivate() {
    this.active = false;
  }
}