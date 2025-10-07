import { CacheStore } from './cache-store.mjs';

/**
 * Manager for multiple cache stores
 */
export class CacheManager {
  constructor(defaultOptions = {}) {
    this.stores = new Map();
    this.defaultOptions = {
      ttl: defaultOptions.ttl || 5 * 60 * 1000, // 5 minutes
      maxSize: defaultOptions.maxSize || 100,
      evictionPolicy: defaultOptions.evictionPolicy || 'lru',
      enabled: defaultOptions.enabled !== false,
    };
  }

  /**
   * Create or get a cache store
   * @param {string} name - Store name
   * @param {Object} options - Store options
   * @returns {CacheStore} Cache store instance
   */
  getStore(name, options = {}) {
    if (!this.stores.has(name)) {
      this.stores.set(name, new CacheStore({
        ...this.defaultOptions,
        ...options,
      }));
    }
    return this.stores.get(name);
  }

  /**
   * Create a new cache store
   * @param {string} name - Store name
   * @param {Object} options - Store options
   * @returns {CacheStore} Cache store instance
   */
  createStore(name, options = {}) {
    const store = new CacheStore({
      ...this.defaultOptions,
      ...options,
    });
    this.stores.set(name, store);
    return store;
  }

  /**
   * Delete a cache store
   * @param {string} name - Store name
   * @returns {boolean} True if deleted
   */
  deleteStore(name) {
    const store = this.stores.get(name);
    if (store) {
      store.clear();
      return this.stores.delete(name);
    }
    return false;
  }

  /**
   * Clear all stores
   */
  clearAll() {
    for (const store of this.stores.values()) {
      store.clear();
    }
  }

  /**
   * Get all store names
   * @returns {string[]} Array of store names
   */
  getStoreNames() {
    return Array.from(this.stores.keys());
  }

  /**
   * Get statistics for all stores
   * @returns {Object} Statistics by store name
   */
  getAllStats() {
    const stats = {};
    for (const [name, store] of this.stores) {
      stats[name] = store.getStats();
    }
    return stats;
  }

  /**
   * Check if store exists
   * @param {string} name - Store name
   * @returns {boolean} True if exists
   */
  hasStore(name) {
    return this.stores.has(name);
  }

  /**
   * Get total size across all stores
   * @returns {number} Total entries
   */
  getTotalSize() {
    let total = 0;
    for (const store of this.stores.values()) {
      total += store.size;
    }
    return total;
  }

  /**
   * Create a namespaced cache interface
   * @param {string} namespace - Namespace prefix
   * @param {string} storeName - Store to use
   * @returns {Object} Namespaced cache interface
   */
  createNamespace(namespace, storeName = 'default') {
    const store = this.getStore(storeName);

    return {
      get: (key) => store.get(`${namespace}:${key}`),
      set: (key, value, ttl) => store.set(`${namespace}:${key}`, value, ttl),
      delete: (key) => store.delete(`${namespace}:${key}`),
      has: (key) => store.has(`${namespace}:${key}`),
      clear: () => {
        // Clear only namespaced keys
        const keysToDelete = [];
        for (const key of store.keys()) {
          if (key.startsWith(`${namespace}:`)) {
            keysToDelete.push(key);
          }
        }
        keysToDelete.forEach(key => store.delete(key));
      },
    };
  }

  /**
   * Enable or disable all stores
   * @param {boolean} enabled - Whether to enable caching
   */
  setEnabled(enabled) {
    for (const store of this.stores.values()) {
      store.options.enabled = enabled;
      if (!enabled) {
        store.clear();
      }
    }
  }
}