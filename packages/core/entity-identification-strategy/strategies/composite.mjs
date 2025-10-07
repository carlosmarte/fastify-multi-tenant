import { EntityIdentificationStrategy } from "../base.mjs";

/**
 * Composite identification strategy
 * Combines multiple strategies with priority-based fallback
 */
export class CompositeIdentificationStrategy extends EntityIdentificationStrategy {
  /**
   * @param {Map|Array} strategies - Map or Array of strategies
   */
  constructor(strategies) {
    super();
    // Handle both Map and Array inputs
    if (Array.isArray(strategies)) {
      this.strategies = new Map();
      strategies.forEach((strategy, index) => {
        // For arrays, use index or a generic name if strategy doesn't have a type
        const key = strategy.constructor?.name?.replace('IdentificationStrategy', '').toLowerCase() || `strategy${index}`;
        this.strategies.set(key, strategy);
      });
    } else if (strategies instanceof Map) {
      this.strategies = strategies;
    } else {
      this.strategies = new Map();
    }
  }

  /**
   * Extract entity ID using multiple strategies
   * @param {Object} request - Fastify request object
   * @param {Object} entityConfig - Entity configuration
   * @returns {string|null} Extracted entity ID or null
   */
  extractEntityId(request, entityConfig) {
    const compositeStrategies = entityConfig.strategies || [];

    // Sort by priority (lower number = higher priority)
    const sortedStrategies = [...compositeStrategies].sort(
      (a, b) => (a.priority || 999) - (b.priority || 999)
    );

    for (const strategyConfig of sortedStrategies) {
      const strategy = this.strategies.get(strategyConfig.type);
      if (strategy) {
        try {
          const entityId = strategy.extractEntityId(request, {
            ...strategyConfig,
            ...entityConfig,
            strategyType: strategyConfig.type,
          });
          if (entityId) return entityId;
        } catch (error) {
          // Log error and continue to next strategy (suppress in test environment)
          if (process.env.NODE_ENV !== 'test') {
            console.debug(`Strategy ${strategyConfig.type} failed:`, error.message);
          }
          continue;
        }
      }
    }

    return null;
  }

  /**
   * Add a strategy to the composite
   * @param {string} name - Strategy name
   * @param {EntityIdentificationStrategy} strategy - Strategy instance
   * @returns {CompositeIdentificationStrategy} This instance for chaining
   */
  addStrategy(name, strategy) {
    if (!(strategy instanceof EntityIdentificationStrategy)) {
      throw new Error("Strategy must extend EntityIdentificationStrategy");
    }
    this.strategies.set(name, strategy);
    return this;
  }

  /**
   * Remove a strategy from the composite
   * @param {string} name - Strategy name
   * @returns {boolean} True if strategy was removed
   */
  removeStrategy(name) {
    return this.strategies.delete(name);
  }

  /**
   * Get all strategy names
   * @returns {Array<string>} Array of strategy names
   */
  getStrategyNames() {
    return Array.from(this.strategies.keys());
  }

  /**
   * Validate composite configuration
   * @param {Object} entityConfig - Entity configuration to validate
   * @returns {boolean} True if configuration is valid
   */
  validateConfig(entityConfig) {
    if (!entityConfig.strategies || !Array.isArray(entityConfig.strategies)) {
      return false;
    }

    // Validate each strategy configuration
    for (const strategyConfig of entityConfig.strategies) {
      if (!strategyConfig.type) {
        return false;
      }
      const strategy = this.strategies.get(strategyConfig.type);
      if (strategy && !strategy.validateConfig({ ...strategyConfig, ...entityConfig })) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get default configuration for composite strategy
   * @returns {Object} Default configuration
   */
  static getDefaultConfig() {
    return {
      strategies: [],
      stopOnFirst: true,
      collectAll: false
    };
  }

  /**
   * Extract entity IDs from all strategies (for debugging/analysis)
   * @param {Object} request - Fastify request object
   * @param {Object} entityConfig - Entity configuration
   * @returns {Object} Map of strategy name to extracted entity ID
   */
  extractFromAllStrategies(request, entityConfig) {
    const results = {};
    const compositeStrategies = entityConfig.strategies || [];

    for (const strategyConfig of compositeStrategies) {
      const strategy = this.strategies.get(strategyConfig.type);
      if (strategy) {
        try {
          results[strategyConfig.type] = strategy.extractEntityId(request, {
            ...strategyConfig,
            ...entityConfig,
            strategyType: strategyConfig.type,
          });
        } catch (error) {
          results[strategyConfig.type] = { error: error.message };
        }
      }
    }

    return results;
  }
}