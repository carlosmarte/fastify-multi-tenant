import { ValidationError } from "@thinkeloquent/core-exceptions";
import { EntityIdentificationStrategy } from "./base.mjs";
import { SubdomainIdentificationStrategy } from "./strategies/subdomain.mjs";
import { PathIdentificationStrategy } from "./strategies/path.mjs";
import { HeaderIdentificationStrategy } from "./strategies/header.mjs";
import { QueryIdentificationStrategy } from "./strategies/query.mjs";
import { CompositeIdentificationStrategy } from "./strategies/composite.mjs";

/**
 * Factory for creating entity identification strategies
 */
export class StrategyFactory {
  constructor() {
    this.strategyTypes = new Map();

    // Register default strategy types
    this.registerType("subdomain", SubdomainIdentificationStrategy);
    this.registerType("path", PathIdentificationStrategy);
    this.registerType("header", HeaderIdentificationStrategy);
    this.registerType("query", QueryIdentificationStrategy);
    this.registerType("composite", CompositeIdentificationStrategy);
  }

  /**
   * Register a strategy type
   * @param {string} type - Strategy type name
   * @param {Function} StrategyClass - Strategy class constructor
   * @returns {StrategyFactory} This instance for chaining
   */
  registerType(type, StrategyClass) {
    if (!StrategyClass || !StrategyClass.prototype) {
      throw new ValidationError(`Invalid strategy class for type: ${type}`);
    }
    this.strategyTypes.set(type, StrategyClass);
    return this;
  }

  /**
   * Create a strategy instance
   * @param {string} type - Strategy type
   * @param {Object} options - Strategy options
   * @returns {EntityIdentificationStrategy} Strategy instance
   */
  create(type, options = {}) {
    const StrategyClass = this.strategyTypes.get(type);

    if (!StrategyClass) {
      throw new ValidationError(`Unknown strategy type: ${type}`);
    }

    // Special handling for composite strategy
    if (type === "composite") {
      const strategies = options.strategies || new Map();
      return new StrategyClass(strategies);
    }

    return new StrategyClass();
  }

  /**
   * Create strategy from configuration
   * @param {Object} config - Strategy configuration
   * @returns {EntityIdentificationStrategy} Strategy instance
   */
  createFromConfig(config) {
    if (!config.type) {
      throw new ValidationError("Strategy configuration must include 'type' field");
    }

    const strategy = this.create(config.type, config);

    // Validate configuration if the strategy supports it
    if (strategy.validateConfig && !strategy.validateConfig(config)) {
      throw new ValidationError(`Invalid configuration for strategy type: ${config.type}`);
    }

    return strategy;
  }

  /**
   * Create multiple strategies from configurations
   * @param {Array<Object>} configs - Array of strategy configurations
   * @returns {Map<string,EntityIdentificationStrategy>} Map of strategies
   */
  createMultiple(configs) {
    const strategies = new Map();

    for (const config of configs) {
      const name = config.name || config.type;
      const strategy = this.createFromConfig(config);
      strategies.set(name, strategy);
    }

    return strategies;
  }

  /**
   * Get all registered strategy types
   * @returns {Array<string>} Array of strategy type names
   */
  getTypes() {
    return Array.from(this.strategyTypes.keys());
  }

  /**
   * Check if a strategy type is registered
   * @param {string} type - Strategy type name
   * @returns {boolean} True if type is registered
   */
  hasType(type) {
    return this.strategyTypes.has(type);
  }

  /**
   * Create a custom strategy from a function
   * @param {Function} extractFn - Function to extract entity ID
   * @param {Object} options - Additional options
   * @returns {EntityIdentificationStrategy} Custom strategy instance
   */
  createCustom(extractFn, options = {}) {
    class CustomStrategy extends EntityIdentificationStrategy {
      extractEntityId(request, entityConfig) {
        return extractFn(request, entityConfig);
      }

      validateConfig(entityConfig) {
        return options.validateConfig ? options.validateConfig(entityConfig) : true;
      }

      getType() {
        return options.type || 'custom';
      }
    }

    return new CustomStrategy();
  }

  /**
   * Create a singleton factory instance
   * @returns {StrategyFactory} Singleton factory instance
   */
  static getInstance() {
    if (!StrategyFactory.instance) {
      StrategyFactory.instance = new StrategyFactory();
    }
    return StrategyFactory.instance;
  }
}

/**
 * Default factory instance
 */
export const defaultFactory = new StrategyFactory();

/**
 * Helper function to create strategy from type
 * @param {string} type - Strategy type
 * @param {Object} options - Strategy options
 * @returns {EntityIdentificationStrategy} Strategy instance
 */
export function createStrategy(type, options) {
  return defaultFactory.create(type, options);
}

/**
 * Helper function to create custom strategy
 * @param {Function} extractFn - Function to extract entity ID
 * @param {Object} options - Additional options
 * @returns {EntityIdentificationStrategy} Custom strategy instance
 */
export function createCustomStrategy(extractFn, options) {
  return defaultFactory.createCustom(extractFn, options);
}