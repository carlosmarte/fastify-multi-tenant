import { ResourceLoadingStrategy } from "../base.mjs";
import { Result } from "@thinkeloquent/core-exceptions";

/**
 * Cached resource loading strategy
 * Decorator that adds caching to any resource loading strategy
 */
export class CachedResourceStrategy extends ResourceLoadingStrategy {
  constructor(baseStrategy, cacheOptions = {}) {
    super();
    this.baseStrategy = baseStrategy;
    this.cache = new Map();
    this.cacheOptions = {
      ttl: cacheOptions.ttl || 5 * 60 * 1000, // 5 minutes default
      maxSize: cacheOptions.maxSize || 100,
      enabled: cacheOptions.enabled !== false,
    };
  }

  /**
   * Generate cache key from context
   * @param {string} resourceType - Type of resource
   * @param {Object} context - Loading context
   * @returns {string} Cache key
   */
  getCacheKey(resourceType, context) {
    return `${resourceType}:${context.entityType}:${context.entityId}:${context.entityPath}`;
  }

  /**
   * Get cached resource if valid
   * @param {string} key - Cache key
   * @returns {any} Cached value or undefined
   */
  getCached(key) {
    if (!this.cacheOptions.enabled) return undefined;

    const entry = this.cache.get(key);
    if (!entry) return undefined;

    const age = Date.now() - entry.timestamp;
    if (age > this.cacheOptions.ttl) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Set cache entry
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   */
  setCached(key, value) {
    if (!this.cacheOptions.enabled) return;

    // Enforce max cache size
    if (this.cache.size >= this.cacheOptions.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    });
  }

  /**
   * Load schemas with caching
   * @param {Object} context - Loading context
   * @returns {Promise<Result>} Result with loaded schemas
   */
  async loadSchemas(context) {
    const cacheKey = this.getCacheKey("schemas", context);
    const cached = this.getCached(cacheKey);

    if (cached !== undefined) {
      return Result.ok(cached);
    }

    const result = await this.baseStrategy.loadSchemas(context);

    if (result.success) {
      this.setCached(cacheKey, result.value);
    }

    return result;
  }

  /**
   * Load services with caching
   * @param {Object} context - Loading context
   * @returns {Promise<Result>} Result with loaded services
   */
  async loadServices(context) {
    const cacheKey = this.getCacheKey("services", context);
    const cached = this.getCached(cacheKey);

    if (cached !== undefined) {
      return Result.ok(cached);
    }

    const result = await this.baseStrategy.loadServices(context);

    if (result.success) {
      this.setCached(cacheKey, result.value);
    }

    return result;
  }

  /**
   * Load plugins with caching
   * @param {Object} context - Loading context
   * @returns {Promise<Result>} Result with loaded plugins
   */
  async loadPlugins(context) {
    const cacheKey = this.getCacheKey("plugins", context);
    const cached = this.getCached(cacheKey);

    if (cached !== undefined) {
      return Result.ok(cached);
    }

    const result = await this.baseStrategy.loadPlugins(context);

    if (result.success) {
      this.setCached(cacheKey, result.value);
    }

    return result;
  }

  /**
   * Load routes with caching
   * @param {Object} context - Loading context
   * @returns {Promise<Result>} Result with loaded routes
   */
  async loadRoutes(context) {
    const cacheKey = this.getCacheKey("routes", context);
    const cached = this.getCached(cacheKey);

    if (cached !== undefined) {
      return Result.ok(cached);
    }

    const result = await this.baseStrategy.loadRoutes(context);

    if (result.success) {
      this.setCached(cacheKey, result.value);
    }

    return result;
  }

  /**
   * Clear cache
   * @param {string} entityType - Entity type to clear, or undefined for all
   * @param {string} entityId - Entity ID to clear, or undefined for all
   */
  clearCache(entityType, entityId) {
    if (!entityType) {
      this.cache.clear();
      return;
    }

    const keysToDelete = [];
    for (const key of this.cache.keys()) {
      if (entityId) {
        if (key.includes(`:${entityType}:${entityId}:`)) {
          keysToDelete.push(key);
        }
      } else if (key.includes(`:${entityType}:`)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    const stats = {
      size: this.cache.size,
      maxSize: this.cacheOptions.maxSize,
      ttl: this.cacheOptions.ttl,
      enabled: this.cacheOptions.enabled,
      entries: [],
    };

    for (const [key, entry] of this.cache) {
      const age = Date.now() - entry.timestamp;
      stats.entries.push({
        key,
        age,
        expired: age > this.cacheOptions.ttl,
      });
    }

    return stats;
  }

  /**
   * Invalidate cache entry
   * @param {string} key - Cache key
   */
  invalidate(key) {
    this.cache.delete(key);
  }

  /**
   * Get strategy metadata
   * @returns {Object} Strategy metadata
   */
  getMetadata() {
    const baseMetadata = this.baseStrategy.getMetadata();
    return {
      ...baseMetadata,
      type: `Cached(${baseMetadata.type})`,
      supportsCaching: true,
      cacheOptions: this.cacheOptions,
    };
  }

  /**
   * Validate context
   * @param {Object} context - Loading context
   * @returns {boolean} True if valid
   */
  validateContext(context) {
    return this.baseStrategy.validateContext(context);
  }

  /**
   * Set cache options
   * @param {Object} options - New cache options
   */
  setCacheOptions(options) {
    this.cacheOptions = {
      ...this.cacheOptions,
      ...options,
    };
  }

  /**
   * Enable or disable caching
   * @param {boolean} enabled - Whether to enable caching
   */
  setCacheEnabled(enabled) {
    this.cacheOptions.enabled = enabled;
    if (!enabled) {
      this.cache.clear();
    }
  }
}