/**
 * Shared caching infrastructure
 * @module @thinkeloquent/core-cache
 */

export { CacheStore } from './cache-store.mjs';
export { CacheManager } from './cache-manager.mjs';

// Factory function for creating cache instances
export function createCache(options = {}) {
  return new CacheManager(options);
}

// Singleton default cache manager
let defaultCacheManager;

export function getDefaultCache() {
  if (!defaultCacheManager) {
    defaultCacheManager = new CacheManager();
  }
  return defaultCacheManager;
}