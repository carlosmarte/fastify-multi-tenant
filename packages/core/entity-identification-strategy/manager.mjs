import { ValidationError } from "@thinkeloquent/core-exceptions";
import { EntityIdentificationStrategy } from "./base.mjs";
import { SubdomainIdentificationStrategy } from "./strategies/subdomain.mjs";
import { PathIdentificationStrategy } from "./strategies/path.mjs";
import { HeaderIdentificationStrategy } from "./strategies/header.mjs";
import { QueryIdentificationStrategy } from "./strategies/query.mjs";
import { CompositeIdentificationStrategy } from "./strategies/composite.mjs";

/**
 * Entity identification manager
 * Manages strategy registration and entity extraction
 */
export class EntityIdentificationManager {
  constructor(securityService) {
    this.securityService = securityService;
    this.strategies = new Map();

    // Register default strategies
    this.strategies.set("subdomain", new SubdomainIdentificationStrategy());
    this.strategies.set("path", new PathIdentificationStrategy());
    this.strategies.set("header", new HeaderIdentificationStrategy());
    this.strategies.set("query", new QueryIdentificationStrategy());
    this.strategies.set(
      "composite",
      new CompositeIdentificationStrategy(this.strategies)
    );
  }

  /**
   * Register a custom strategy
   * @param {string} name - Strategy name
   * @param {EntityIdentificationStrategy} strategy - Strategy instance
   * @returns {EntityIdentificationManager} This instance for chaining
   */
  registerStrategy(name, strategy) {
    if (!(strategy instanceof EntityIdentificationStrategy)) {
      throw new ValidationError(
        "Strategy must extend EntityIdentificationStrategy"
      );
    }
    this.strategies.set(name, strategy);

    // Update composite strategy if it exists
    const composite = this.strategies.get("composite");
    if (composite instanceof CompositeIdentificationStrategy) {
      composite.addStrategy(name, strategy);
    }

    return this;
  }

  /**
   * Unregister a strategy
   * @param {string} name - Strategy name
   * @returns {boolean} True if strategy was removed
   */
  unregisterStrategy(name) {
    // Prevent removal of default strategies
    if (["subdomain", "path", "header", "query", "composite"].includes(name)) {
      throw new ValidationError(`Cannot unregister default strategy: ${name}`);
    }

    // Remove from composite if it exists
    const composite = this.strategies.get("composite");
    if (composite instanceof CompositeIdentificationStrategy) {
      composite.removeStrategy(name);
    }

    return this.strategies.delete(name);
  }

  /**
   * Get a registered strategy
   * @param {string} name - Strategy name
   * @returns {EntityIdentificationStrategy|undefined} Strategy instance or undefined
   */
  getStrategy(name) {
    return this.strategies.get(name);
  }

  /**
   * Get all registered strategy names
   * @returns {Array<string>} Array of strategy names
   */
  getStrategyNames() {
    return Array.from(this.strategies.keys());
  }

  /**
   * Extract entity information from request
   * @param {Object} request - Fastify request object
   * @param {Map} entityDefinitions - Map of entity definitions
   * @returns {Array} Array of extracted entity info sorted by priority
   */
  extractEntityInfo(request, entityDefinitions) {
    const results = [];

    for (const [entityType, definition] of entityDefinitions) {
      if (!definition.enabled) continue;

      const strategy = this.strategies.get(definition.identificationStrategy);
      if (!strategy) continue;

      try {
        const entityId = strategy.extractEntityId(request, definition);
        if (entityId) {
          const validatedId = this.securityService.validateEntityId(
            entityId,
            entityType
          );
          results.push({
            type: entityType,
            id: validatedId,
            priority: definition.priority || 999,
            definition,
          });
        }
      } catch (err) {
        // Continue with other entity types
      }
    }

    // Sort by priority and return
    results.sort((a, b) => a.priority - b.priority);
    return results;
  }

  /**
   * Extract primary entity (highest priority)
   * @param {Object} request - Fastify request object
   * @param {Map} entityDefinitions - Map of entity definitions
   * @returns {Object|null} Primary entity info or null
   */
  extractPrimaryEntity(request, entityDefinitions) {
    const entities = this.extractEntityInfo(request, entityDefinitions);
    return entities.length > 0 ? entities[0] : null;
  }

  /**
   * Validate all registered strategies
   * @param {Map} entityDefinitions - Map of entity definitions
   * @returns {Object} Validation results
   */
  validateStrategies(entityDefinitions) {
    const results = {
      valid: true,
      errors: []
    };

    for (const [entityType, definition] of entityDefinitions) {
      const strategy = this.strategies.get(definition.identificationStrategy);

      if (!strategy) {
        results.valid = false;
        results.errors.push(`Strategy '${definition.identificationStrategy}' not found for entity type '${entityType}'`);
        continue;
      }

      if (!strategy.validateConfig(definition)) {
        results.valid = false;
        results.errors.push(`Invalid configuration for entity type '${entityType}' using strategy '${definition.identificationStrategy}'`);
      }
    }

    return results;
  }

  /**
   * Create a new manager instance with custom strategies
   * @param {Object} securityService - Security service instance
   * @param {Object} customStrategies - Map of custom strategies to register
   * @returns {EntityIdentificationManager} New manager instance
   */
  static create(securityService, customStrategies = {}) {
    const manager = new EntityIdentificationManager(securityService);

    for (const [name, strategy] of Object.entries(customStrategies)) {
      manager.registerStrategy(name, strategy);
    }

    return manager;
  }

  /**
   * Clone this manager with all registered strategies
   * @param {Object} securityService - Security service for the clone
   * @returns {EntityIdentificationManager} Cloned manager
   */
  clone(securityService = this.securityService) {
    const cloned = new EntityIdentificationManager(securityService);

    // Copy custom strategies (skip defaults as they're auto-registered)
    for (const [name, strategy] of this.strategies) {
      if (!["subdomain", "path", "header", "query", "composite"].includes(name)) {
        cloned.registerStrategy(name, strategy);
      }
    }

    return cloned;
  }
}