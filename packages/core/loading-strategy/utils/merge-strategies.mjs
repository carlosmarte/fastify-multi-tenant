/**
 * Resource merge strategies
 * Utilities for merging resources loaded from different sources
 */

/**
 * Merge strategies enum
 */
export const MergeStrategies = {
  OVERRIDE: "override",
  EXTEND: "extend",
  ISOLATE: "isolate",
  DEEP_MERGE: "deepMerge",
  CONCAT: "concat",
};

/**
 * Apply merge strategy to resources
 * @param {Object} base - Base resources
 * @param {Object} overlay - Overlay resources
 * @param {string} strategy - Merge strategy
 * @returns {Object} Merged resources
 */
export function applyMergeStrategy(base, overlay, strategy) {
  switch (strategy) {
    case MergeStrategies.OVERRIDE:
      return overlay || base;

    case MergeStrategies.EXTEND:
      return { ...(base || {}), ...(overlay || {}) };

    case MergeStrategies.ISOLATE:
      return overlay;

    case MergeStrategies.DEEP_MERGE:
      return deepMerge(base, overlay);

    case MergeStrategies.CONCAT:
      if (Array.isArray(base) && Array.isArray(overlay)) {
        return [...base, ...overlay];
      }
      return { ...base, ...overlay };

    default:
      return overlay || base;
  }
}

/**
 * Deep merge two objects
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} Merged object
 */
export function deepMerge(target, source) {
  const result = { ...target };

  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (isObject(source[key]) && isObject(target[key])) {
        result[key] = deepMerge(target[key], source[key]);
      } else if (Array.isArray(source[key]) && Array.isArray(target[key])) {
        result[key] = [...target[key], ...source[key]];
      } else {
        result[key] = source[key];
      }
    }
  }

  return result;
}

/**
 * Check if value is a plain object
 * @param {any} value - Value to check
 * @returns {boolean} True if plain object
 */
function isObject(value) {
  return value !== null &&
         typeof value === 'object' &&
         value.constructor === Object;
}

/**
 * Merge resources with priority
 * @param {Array<Object>} resources - Array of resource objects with priority
 * @param {string} strategy - Merge strategy
 * @returns {Object} Merged resources
 */
export function mergeWithPriority(resources, strategy) {
  // Sort by priority (lower number = higher priority)
  const sorted = [...resources].sort((a, b) =>
    (a.priority || 999) - (b.priority || 999)
  );

  let result = {};

  for (const resource of sorted) {
    result = applyMergeStrategy(result, resource.data, strategy);
  }

  return result;
}

/**
 * Validate merge strategy
 * @param {string} strategy - Strategy to validate
 * @returns {boolean} True if valid
 */
export function isValidMergeStrategy(strategy) {
  return Object.values(MergeStrategies).includes(strategy);
}

/**
 * Get default merge strategy for resource type
 * @param {string} resourceType - Type of resource
 * @returns {string} Default merge strategy
 */
export function getDefaultMergeStrategy(resourceType) {
  const defaults = {
    schemas: MergeStrategies.CONCAT,
    services: MergeStrategies.EXTEND,
    plugins: MergeStrategies.CONCAT,
    routes: MergeStrategies.OVERRIDE,
    config: MergeStrategies.DEEP_MERGE,
  };

  return defaults[resourceType] || MergeStrategies.OVERRIDE;
}

/**
 * Merge resource collections
 * @param {Object} collections - Resource collections to merge
 * @param {Object} strategies - Merge strategies for each resource type
 * @returns {Object} Merged collections
 */
export function mergeResourceCollections(collections, strategies = {}) {
  const result = {};

  for (const [type, items] of Object.entries(collections)) {
    const strategy = strategies[type] || getDefaultMergeStrategy(type);

    if (Array.isArray(items)) {
      result[type] = items;
    } else if (typeof items === 'object') {
      result[type] = applyMergeStrategy({}, items, strategy);
    } else {
      result[type] = items;
    }
  }

  return result;
}

/**
 * Create merge strategy configuration
 * @param {Object} options - Strategy options
 * @returns {Object} Strategy configuration
 */
export function createMergeConfig(options = {}) {
  return {
    schemas: options.schemas || MergeStrategies.CONCAT,
    services: options.services || MergeStrategies.EXTEND,
    plugins: options.plugins || MergeStrategies.CONCAT,
    routes: options.routes || MergeStrategies.OVERRIDE,
    config: options.config || MergeStrategies.DEEP_MERGE,
    custom: options.custom || {},
  };
}

/**
 * Apply merge config to resources
 * @param {Object} base - Base resources
 * @param {Object} overlay - Overlay resources
 * @param {Object} config - Merge configuration
 * @returns {Object} Merged resources
 */
export function applyMergeConfig(base, overlay, config) {
  const result = {};

  for (const key in overlay) {
    const strategy = config[key] || (config.custom && config.custom[key]) || MergeStrategies.OVERRIDE;
    result[key] = applyMergeStrategy(base[key], overlay[key], strategy);
  }

  // Include base keys not in overlay
  for (const key in base) {
    if (!(key in result)) {
      result[key] = base[key];
    }
  }

  return result;
}