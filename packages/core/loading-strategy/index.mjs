/**
 * Core resource loading strategies
 * @module @thinkeloquent/core-loading-strategy
 */

// Base class
export { ResourceLoadingStrategy } from "./base.mjs";

// Strategy implementations
export { HierarchicalResourceStrategy } from "./strategies/hierarchical.mjs";
export { FlatResourceStrategy } from "./strategies/flat.mjs";
export { CachedResourceStrategy } from "./strategies/cached.mjs";

// Resource loader
export { ResourceLoader } from "./loaders/resource-loader.mjs";

// Merge utilities
export {
  MergeStrategies,
  applyMergeStrategy,
  deepMerge,
  mergeWithPriority,
  isValidMergeStrategy,
  getDefaultMergeStrategy,
  mergeResourceCollections,
  createMergeConfig,
  applyMergeConfig
} from "./utils/merge-strategies.mjs";