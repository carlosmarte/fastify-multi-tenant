import { EntityAdapter } from "./base.mjs";

/**
 * Local filesystem entity adapter
 * Loads entities from local directories
 */
export class LocalEntityAdapter extends EntityAdapter {
  /**
   * Get adapter type identifier
   * @returns {string} Adapter type
   */
  getType() {
    return "local";
  }

  /**
   * Check if adapter can handle the source
   * @param {string} source - Entity source path
   * @returns {Promise<boolean>} True if can handle
   */
  async canHandle(source) {
    return await this.pathResolver.pathExists(source);
  }

  /**
   * Load entity configuration
   * @param {string} entityPath - Path to entity
   * @param {Object} defaults - Default configuration
   * @returns {Promise<Object>} Entity configuration
   */
  async loadConfig(entityPath, defaults) {
    return await this.resourceLoader.loadConfig(entityPath, defaults);
  }

  /**
   * Load entity resources
   * @param {Object} app - Fastify app instance
   * @param {EntityContext} entityContext - Entity context
   * @returns {Promise<void>}
   */
  async loadResources(app, entityContext) {
    const entityPath = entityContext.config.path || entityContext.config.source;
    const { type: entityType, id: entityId, config } = entityContext;

    try {
      const context = {
        entityPath,
        entityType,
        entityId,
        app,
        pathResolver: this.pathResolver,
        config,
      };

      const results = await this.loadingStrategy.loadResources(context);

      // Process schemas
      if (results.schemas.success) {
        results.schemas.value.forEach((schemaId) =>
          entityContext.addSchema(schemaId)
        );
        this.logger.debug(
          `Loaded ${results.schemas.value.length} schemas for ${entityType}:${entityId}`
        );
      }

      // Process services
      if (results.services.success) {
        Object.entries(results.services.value).forEach(([name, service]) => {
          entityContext.addService(name, service);
        });
        this.logger.debug(
          `Loaded ${Object.keys(results.services.value).length} services for ${entityType}:${entityId}`
        );
      }

      // Process plugins
      if (results.plugins.success) {
        results.plugins.value.forEach((plugin) =>
          entityContext.addPlugin(plugin)
        );
        this.logger.debug(
          `Loaded ${results.plugins.value.length} plugins for ${entityType}:${entityId}`
        );
      }

      // Process routes
      if (results.routes.success && results.routes.value) {
        entityContext.addRoute(entityPath);
        this.logger.debug(
          `Loaded routes for ${entityType}:${entityId}`
        );
      }

      this.logger.info(
        `📦 Loaded resources for ${entityType} entity ${entityId} from local path`
      );
    } catch (err) {
      this.logger.error(
        { err },
        `❌ Failed to load resources for ${entityType} entity ${entityId}`
      );
      throw err;
    }
  }

  /**
   * Get adapter capabilities
   * @returns {Object} Capabilities object
   */
  getCapabilities() {
    return {
      hotReload: true,
      remoteLoading: false,
      caching: true,
      versioning: false,
      watchMode: true,
    };
  }

  /**
   * Watch entity directory for changes
   * @param {string} entityPath - Path to entity
   * @param {Function} callback - Callback on change
   * @returns {Function} Unwatch function
   */
  watchEntity(entityPath, callback) {
    // This would typically use a file watcher like chokidar
    // For now, return a no-op unwatch function
    this.logger.debug(`Would watch entity path: ${entityPath}`);
    return () => {
      this.logger.debug(`Would unwatch entity path: ${entityPath}`);
    };
  }

  /**
   * Validate entity directory structure
   * @param {string} entityPath - Path to entity
   * @returns {Promise<Object>} Validation result
   */
  async validateStructure(entityPath) {
    const result = {
      valid: true,
      errors: [],
      warnings: [],
    };

    // Check if directory exists
    if (!await this.pathResolver.pathExists(entityPath)) {
      result.valid = false;
      result.errors.push(`Entity path does not exist: ${entityPath}`);
      return result;
    }

    // Check for common directories
    const expectedDirs = ['schemas', 'services', 'plugins', 'routes'];
    for (const dir of expectedDirs) {
      const dirPath = `${entityPath}/${dir}`;
      if (!await this.pathResolver.pathExists(dirPath)) {
        result.warnings.push(`Missing ${dir} directory`);
      }
    }

    // Check for entity.json config
    const configPath = `${entityPath}/entity.json`;
    if (!await this.pathResolver.pathExists(configPath)) {
      result.warnings.push('Missing entity.json configuration file');
    }

    return result;
  }

  /**
   * Get entity metadata from local directory
   * @param {string} entityPath - Path to entity
   * @returns {Promise<Object>} Entity metadata
   */
  async getEntityMetadata(entityPath) {
    const metadata = {
      path: entityPath,
      type: 'local',
      exists: await this.pathResolver.pathExists(entityPath),
    };

    if (metadata.exists) {
      try {
        // Try to load entity.json for additional metadata
        const config = await this.loadConfig(entityPath, {});
        metadata.config = config;
      } catch {
        // Config is optional
      }
    }

    return metadata;
  }

  /**
   * Normalize local path
   * @param {string} source - Source path
   * @returns {string} Normalized absolute path
   */
  normalizePath(source) {
    return this.pathResolver.resolvePath(source);
  }
}