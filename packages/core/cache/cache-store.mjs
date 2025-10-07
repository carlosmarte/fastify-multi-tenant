/**
 * Individual cache store with configurable eviction policy
 */
export class CacheStore {
  constructor(options = {}) {
    this.options = {
      ttl: options.ttl !== undefined ? options.ttl : 5 * 60 * 1000, // 5 minutes default
      maxSize: options.maxSize || 100,
      evictionPolicy: options.evictionPolicy || 'lru',
      enabled: options.enabled !== false,
    };

    // Use Map for insertion order (FIFO) or custom tracking
    this.cache = new Map();
    this.accessOrder = []; // For LRU tracking
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      sets: 0,
    };
  }

  /**
   * Generate cache key
   * @param {...any} parts - Key parts to join
   * @returns {string} Cache key
   */
  static createKey(...parts) {
    return parts.filter(Boolean).join(':');
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {any} Cached value or undefined
   */
  get(key) {
    if (!this.options.enabled) return undefined;

    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check TTL (use entry's TTL if set, otherwise default)
    const ttl = entry.ttl !== undefined ? entry.ttl : this.options.ttl;
    if (ttl > 0) {
      const age = Date.now() - entry.timestamp;
      if (age > ttl) {
        this.cache.delete(key);
        this.stats.misses++;
        return undefined;
      }
    }

    // Update access order for LRU
    if (this.options.evictionPolicy === 'lru') {
      this.updateAccessOrder(key);
    }

    this.stats.hits++;
    return entry.value;
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Optional TTL override
   */
  set(key, value, ttl = null) {
    if (!this.options.enabled) return;

    // Evict if at max size
    if (this.cache.size >= this.options.maxSize && !this.cache.has(key)) {
      this.evict();
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: ttl !== null ? ttl : this.options.ttl,
    });

    // Track access order for LRU
    if (this.options.evictionPolicy === 'lru') {
      this.updateAccessOrder(key);
    }

    this.stats.sets++;
  }

  /**
   * Delete entry from cache
   * @param {string} key - Cache key
   * @returns {boolean} True if deleted
   */
  delete(key) {
    const deleted = this.cache.delete(key);
    if (deleted && this.options.evictionPolicy === 'lru') {
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
    }
    return deleted;
  }

  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists
   */
  has(key) {
    if (!this.options.enabled) return false;

    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check TTL (use entry's TTL if set, otherwise default)
    const ttl = entry.ttl !== undefined ? entry.ttl : this.options.ttl;
    if (ttl > 0) {
      const age = Date.now() - entry.timestamp;
      if (age > ttl) {
        this.cache.delete(key);
        return false;
      }
    }

    return true;
  }

  /**
   * Get cache size
   * @returns {number} Number of entries
   */
  get size() {
    if (!this.options.enabled) return 0;
    // Clean expired entries first - collect keys to delete
    const keysToDelete = [];
    for (const [key, entry] of this.cache.entries()) {
      const ttl = entry.ttl !== undefined ? entry.ttl : this.options.ttl;
      if (ttl > 0) {
        const age = Date.now() - entry.timestamp;
        if (age > ttl) {
          keysToDelete.push(key);
        }
      }
    }
    // Delete expired keys
    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
    return this.cache.size;
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
    this.accessOrder = [];
    this.stats.evictions += this.cache.size;
  }

  /**
   * Update access order for LRU
   * @private
   * @param {string} key - Cache key
   */
  updateAccessOrder(key) {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  /**
   * Evict entry based on policy
   * @private
   */
  evict() {
    let keyToEvict;

    switch (this.options.evictionPolicy) {
      case 'lru':
        // Least Recently Used
        keyToEvict = this.accessOrder.shift();
        break;
      case 'fifo':
        // First In First Out
        keyToEvict = this.cache.keys().next().value;
        break;
      case 'random':
        // Random eviction
        const keys = Array.from(this.cache.keys());
        keyToEvict = keys[Math.floor(Math.random() * keys.length)];
        break;
      default:
        // Default to FIFO
        keyToEvict = this.cache.keys().next().value;
    }

    if (keyToEvict) {
      this.cache.delete(keyToEvict);
      this.stats.evictions++;
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    return {
      ...this.stats,
      size: this.cache.size,
      maxSize: this.options.maxSize,
      ttl: this.options.ttl,
      evictionPolicy: this.options.evictionPolicy,
      enabled: this.options.enabled,
      hitRate: this.stats.hits + this.stats.misses > 0
        ? this.stats.hits / (this.stats.hits + this.stats.misses)
        : 0,
    };
  }

  /**
   * Get all keys in cache
   * @returns {string[]} Array of cache keys
   */
  keys() {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache size
   * @returns {number} Number of entries
   */
  get size() {
    return this.cache.size;
  }
}