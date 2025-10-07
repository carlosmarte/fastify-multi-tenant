import path from "path";
import { readFile } from "fs/promises";
import merge from "deepmerge";
import { Result, ConfigurationValidationError } from "@thinkeloquent/core-exceptions";

/**
 * Entity configuration manager
 */
export class EntityConfigurationManager {
  constructor(overrides = {}, options = {}) {
    this.suppressErrorLogging = options.suppressErrorLogging || false;
    this.config = merge(this.getDefaultConfig(), overrides);
    this.entityDefinitions = new Map();
  }

  getDefaultConfig() {
    return {
      server: {
        port: parseInt(process.env.PORT || "3002", 10),
        host: process.env.HOST || "0.0.0.0",
      },
      logger: {
        level: process.env.LOG_LEVEL || "info",
        pretty: process.env.NODE_ENV !== "production",
      },
      plugins: {
        coreOrder: [
          "database",
          "auth",
          "cookie",
          "exception",
          "logger",
          "request",
          "static",
        ],
        npmPattern: "fastify-mta-entity-*",
      },
      entities: {
        definitions: {},
        defaultEntity: "tenant",
        hierarchicalLoading: true,
        globalResources: {
          schemas: "/schemas",
          services: "/services",
          plugins: "/plugins",
          routes: "/routes",
        },
      },
      security: {
        validateInputs: true,
        maxIdLength: 64,
        globalPolicies: {
          pathTraversalProtection: true,
          entityValidation: true,
          rateLimiting: {
            enabled: false,
            perEntity: true,
          },
        },
      },
    };
  }

  async loadEntityConfig(configPath = null, projectRoot = null) {
    try {
      // Use provided project root or fallback to process.cwd()
      const baseDir = projectRoot || process.cwd();
      const entityConfigPath =
        configPath || path.join(baseDir, "entity-config.json");
      const configData = await readFile(entityConfigPath, "utf8");
      const entityConfig = JSON.parse(configData);

      // Merge the entire configuration, not just entities
      this.config = merge(this.config, entityConfig);

      // Ensure entities exist after merge
      this.config.entities = this.config.entities || {};

      // Process entity definitions
      for (const [entityType, definition] of Object.entries(
        this.config.entities.definitions || {}
      )) {
        this.entityDefinitions.set(entityType, {
          ...definition,
          type: entityType,
        });
      }

      return Result.ok(this.config);
    } catch (err) {
      // Use default config if no entity config file exists
      return Result.ok(this.config);
    }
  }

  getEntityDefinition(entityType) {
    return this.entityDefinitions.get(entityType);
  }

  getAllEntityTypes() {
    return Array.from(this.entityDefinitions.keys());
  }

  get(key) {
    if (!key) return this.config;

    const keys = key.split(".");
    let value = this.config;

    for (const k of keys) {
      value = value?.[k];
      if (value === undefined) break;
    }

    return value;
  }

  merge(overrides) {
    this.config = merge(this.config, overrides);
  }

  validate() {
    const errors = [];

    if (
      typeof this.config.server.port !== "number" ||
      this.config.server.port < 1 ||
      this.config.server.port > 65535
    ) {
      errors.push("server.port must be a number between 1 and 65535");
    }

    // Validate entity definitions
    for (const [entityType, definition] of this.entityDefinitions) {
      if (!definition.basePath) {
        errors.push(`Entity type '${entityType}' missing basePath`);
      }
      if (!definition.identificationStrategy) {
        errors.push(
          `Entity type '${entityType}' missing identificationStrategy`
        );
      }
    }

    return errors.length > 0 ? Result.fail(errors) : Result.ok(this.config);
  }

  /**
   * Clone the current configuration
   */
  clone() {
    const cloned = new EntityConfigurationManager(
      this.config,
      { suppressErrorLogging: this.suppressErrorLogging }
    );
    // Copy entity definitions
    for (const [key, value] of this.entityDefinitions) {
      cloned.entityDefinitions.set(key, { ...value });
    }
    return cloned;
  }

  /**
   * Export configuration as JSON
   */
  toJSON() {
    const definitions = {};
    for (const [key, value] of this.entityDefinitions) {
      definitions[key] = value;
    }

    return {
      ...this.config,
      entities: {
        ...this.config.entities,
        definitions,
      },
    };
  }

  /**
   * Import configuration from JSON
   */
  static fromJSON(json, options = {}) {
    const manager = new EntityConfigurationManager({}, options);
    manager.config = json;

    // Rebuild entity definitions
    if (json.entities?.definitions) {
      for (const [entityType, definition] of Object.entries(json.entities.definitions)) {
        manager.entityDefinitions.set(entityType, {
          ...definition,
          type: entityType,
        });
      }
    }

    return manager;
  }

  /**
   * Get configuration for a specific entity type
   */
  getEntityConfig(entityType) {
    const definition = this.getEntityDefinition(entityType);
    if (!definition) return null;

    return {
      ...definition,
      globalResources: this.config.entities?.globalResources,
      hierarchicalLoading: this.config.entities?.hierarchicalLoading,
      security: this.config.security,
    };
  }

  /**
   * Set or update an entity definition
   */
  setEntityDefinition(entityType, definition) {
    this.entityDefinitions.set(entityType, {
      ...definition,
      type: entityType,
    });

    // Update config as well
    if (!this.config.entities) {
      this.config.entities = {};
    }
    if (!this.config.entities.definitions) {
      this.config.entities.definitions = {};
    }
    this.config.entities.definitions[entityType] = definition;

    return this;
  }

  /**
   * Remove an entity definition
   */
  removeEntityDefinition(entityType) {
    this.entityDefinitions.delete(entityType);

    if (this.config.entities?.definitions) {
      delete this.config.entities.definitions[entityType];
    }

    return this;
  }

  /**
   * Check if an entity type exists
   */
  hasEntityType(entityType) {
    return this.entityDefinitions.has(entityType);
  }

  /**
   * Get all entity definitions as an object
   */
  getEntityDefinitions() {
    const definitions = {};
    for (const [key, value] of this.entityDefinitions) {
      definitions[key] = value;
    }
    return definitions;
  }
}