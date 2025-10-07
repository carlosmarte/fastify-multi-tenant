import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { CacheStore } from './cache-store.mjs';

describe('CacheStore', () => {
  let cacheStore;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Constructor', () => {
    test('should initialize with default options', () => {
      cacheStore = new CacheStore();

      expect(cacheStore.options.ttl).toBe(5 * 60 * 1000); // 5 minutes
      expect(cacheStore.options.maxSize).toBe(100);
      expect(cacheStore.options.evictionPolicy).toBe('lru');
      expect(cacheStore.options.enabled).toBe(true);
      expect(cacheStore.cache).toBeInstanceOf(Map);
      expect(cacheStore.cache.size).toBe(0);
    });

    test('should accept custom options', () => {
      cacheStore = new CacheStore({
        ttl: 10000,
        maxSize: 50,
        evictionPolicy: 'fifo',
        enabled: false
      });

      expect(cacheStore.options.ttl).toBe(10000);
      expect(cacheStore.options.maxSize).toBe(50);
      expect(cacheStore.options.evictionPolicy).toBe('fifo');
      expect(cacheStore.options.enabled).toBe(false);
    });

    test('should initialize stats', () => {
      cacheStore = new CacheStore();

      expect(cacheStore.stats).toEqual({
        hits: 0,
        misses: 0,
        evictions: 0,
        sets: 0
      });
    });
  });

  describe('createKey()', () => {
    test('should create key from parts', () => {
      const key = CacheStore.createKey('user', '123', 'profile');
      expect(key).toBe('user:123:profile');
    });

    test('should filter out falsy values', () => {
      const key = CacheStore.createKey('user', null, '123', undefined, 'profile');
      expect(key).toBe('user:123:profile');
    });

    test('should handle empty parts', () => {
      const key = CacheStore.createKey();
      expect(key).toBe('');
    });
  });

  describe('get()', () => {
    beforeEach(() => {
      cacheStore = new CacheStore();
    });

    test('should return undefined for non-existent key', () => {
      const value = cacheStore.get('nonexistent');
      expect(value).toBeUndefined();
      expect(cacheStore.stats.misses).toBe(1);
    });

    test('should return cached value', () => {
      cacheStore.set('key1', 'value1');
      const value = cacheStore.get('key1');

      expect(value).toBe('value1');
      expect(cacheStore.stats.hits).toBe(1);
    });

    test('should return undefined when cache is disabled', () => {
      cacheStore = new CacheStore({ enabled: false });
      cacheStore.set('key1', 'value1');

      const value = cacheStore.get('key1');
      expect(value).toBeUndefined();
    });

    test('should respect TTL and expire old entries', () => {
      cacheStore = new CacheStore({ ttl: 1000 });
      cacheStore.set('key1', 'value1');

      // Value should exist initially
      expect(cacheStore.get('key1')).toBe('value1');

      // Advance time past TTL
      vi.advanceTimersByTime(1001);

      // Value should be expired
      expect(cacheStore.get('key1')).toBeUndefined();
      expect(cacheStore.stats.misses).toBe(1);
    });

    test('should update access order for LRU', () => {
      cacheStore = new CacheStore({ evictionPolicy: 'lru' });
      cacheStore.set('key1', 'value1');
      cacheStore.set('key2', 'value2');
      cacheStore.set('key3', 'value3');

      // Access key1 to move it to the end
      cacheStore.get('key1');

      expect(cacheStore.accessOrder).toEqual(['key2', 'key3', 'key1']);
    });
  });

  describe('set()', () => {
    beforeEach(() => {
      cacheStore = new CacheStore();
    });

    test('should store value in cache', () => {
      cacheStore.set('key1', 'value1');

      expect(cacheStore.cache.has('key1')).toBe(true);
      expect(cacheStore.stats.sets).toBe(1);
    });

    test('should store complex objects', () => {
      const obj = { name: 'test', data: [1, 2, 3] };
      cacheStore.set('key1', obj);

      const retrieved = cacheStore.get('key1');
      expect(retrieved).toEqual(obj);
    });

    test('should not store when cache is disabled', () => {
      cacheStore = new CacheStore({ enabled: false });
      cacheStore.set('key1', 'value1');

      expect(cacheStore.cache.size).toBe(0);
    });

    test('should override existing value', () => {
      cacheStore.set('key1', 'value1');
      cacheStore.set('key1', 'value2');

      expect(cacheStore.get('key1')).toBe('value2');
      expect(cacheStore.cache.size).toBe(1);
    });

    test('should accept custom TTL', () => {
      cacheStore = new CacheStore({ ttl: 5000 });
      cacheStore.set('key1', 'value1', 1000);

      // Should exist initially
      expect(cacheStore.get('key1')).toBe('value1');

      // Should expire after custom TTL
      vi.advanceTimersByTime(1001);
      expect(cacheStore.get('key1')).toBeUndefined();
    });

    test('should trigger eviction when at max size', () => {
      cacheStore = new CacheStore({ maxSize: 3, evictionPolicy: 'fifo' });

      cacheStore.set('key1', 'value1');
      cacheStore.set('key2', 'value2');
      cacheStore.set('key3', 'value3');
      cacheStore.set('key4', 'value4');

      // First key should be evicted
      expect(cacheStore.cache.has('key1')).toBe(false);
      expect(cacheStore.cache.has('key4')).toBe(true);
      expect(cacheStore.cache.size).toBe(3);
    });
  });

  describe('has()', () => {
    beforeEach(() => {
      cacheStore = new CacheStore();
    });

    test('should return false for non-existent key', () => {
      expect(cacheStore.has('nonexistent')).toBe(false);
    });

    test('should return true for existing key', () => {
      cacheStore.set('key1', 'value1');
      expect(cacheStore.has('key1')).toBe(true);
    });

    test('should return false when cache is disabled', () => {
      cacheStore = new CacheStore({ enabled: false });
      cacheStore.set('key1', 'value1');
      expect(cacheStore.has('key1')).toBe(false);
    });

    test('should return false for expired entries', () => {
      cacheStore = new CacheStore({ ttl: 1000 });
      cacheStore.set('key1', 'value1');

      vi.advanceTimersByTime(1001);
      expect(cacheStore.has('key1')).toBe(false);
    });
  });

  describe('size', () => {
    beforeEach(() => {
      cacheStore = new CacheStore();
    });

    test('should return 0 for empty cache', () => {
      expect(cacheStore.size).toBe(0);
    });

    test('should return correct size', () => {
      cacheStore.set('key1', 'value1');
      cacheStore.set('key2', 'value2');
      expect(cacheStore.size).toBe(2);
    });

    test('should return 0 when cache is disabled', () => {
      cacheStore = new CacheStore({ enabled: false });
      cacheStore.set('key1', 'value1');
      expect(cacheStore.size).toBe(0);
    });

    test.skip('should clean expired entries before returning size', () => {
      // Create cache with short TTL
      cacheStore = new CacheStore({ ttl: 1000 });

      // Set items at known time
      const startTime = new Date(2024, 0, 1).getTime();
      vi.setSystemTime(startTime);

      cacheStore.set('key1', 'value1');
      cacheStore.set('key2', 'value2');

      expect(cacheStore.size).toBe(2);

      // Move time forward past TTL
      vi.setSystemTime(startTime + 1100);

      // Size getter should clean expired entries
      expect(cacheStore.size).toBe(0);
    });
  });

  describe('delete()', () => {
    beforeEach(() => {
      cacheStore = new CacheStore();
    });

    test('should delete existing entry', () => {
      cacheStore.set('key1', 'value1');
      const deleted = cacheStore.delete('key1');

      expect(deleted).toBe(true);
      expect(cacheStore.has('key1')).toBe(false);
    });

    test('should return false for non-existent key', () => {
      const deleted = cacheStore.delete('nonexistent');
      expect(deleted).toBe(false);
    });

    test('should update access order for LRU', () => {
      cacheStore = new CacheStore({ evictionPolicy: 'lru' });
      cacheStore.set('key1', 'value1');
      cacheStore.set('key2', 'value2');
      cacheStore.get('key1'); // Updates access order

      cacheStore.delete('key1');
      expect(cacheStore.accessOrder).toEqual(['key2']);
    });
  });

  describe('clear()', () => {
    beforeEach(() => {
      cacheStore = new CacheStore();
    });

    test('should clear all entries', () => {
      cacheStore.set('key1', 'value1');
      cacheStore.set('key2', 'value2');

      cacheStore.clear();

      expect(cacheStore.cache.size).toBe(0);
      expect(cacheStore.has('key1')).toBe(false);
      expect(cacheStore.has('key2')).toBe(false);
    });

    test('should reset access order', () => {
      cacheStore = new CacheStore({ evictionPolicy: 'lru' });
      cacheStore.set('key1', 'value1');
      cacheStore.set('key2', 'value2');

      cacheStore.clear();

      expect(cacheStore.accessOrder).toEqual([]);
    });
  });

  describe('Eviction Policies', () => {
    describe('LRU (Least Recently Used)', () => {
      test('should evict least recently used item', () => {
        cacheStore = new CacheStore({ maxSize: 3, evictionPolicy: 'lru' });

        cacheStore.set('key1', 'value1');
        cacheStore.set('key2', 'value2');
        cacheStore.set('key3', 'value3');

        // Access key1 and key2 to make key3 the LRU
        cacheStore.get('key1');
        cacheStore.get('key2');

        // Add new item, should evict key3
        cacheStore.set('key4', 'value4');

        expect(cacheStore.has('key3')).toBe(false);
        expect(cacheStore.has('key1')).toBe(true);
        expect(cacheStore.has('key2')).toBe(true);
        expect(cacheStore.has('key4')).toBe(true);
      });
    });

    describe('FIFO (First In First Out)', () => {
      test('should evict oldest item', () => {
        cacheStore = new CacheStore({ maxSize: 3, evictionPolicy: 'fifo' });

        cacheStore.set('key1', 'value1');
        cacheStore.set('key2', 'value2');
        cacheStore.set('key3', 'value3');
        cacheStore.set('key4', 'value4');

        expect(cacheStore.has('key1')).toBe(false);
        expect(cacheStore.has('key2')).toBe(true);
        expect(cacheStore.has('key3')).toBe(true);
        expect(cacheStore.has('key4')).toBe(true);
      });
    });

    describe('Random', () => {
      test('should evict random item', () => {
        cacheStore = new CacheStore({ maxSize: 3, evictionPolicy: 'random' });

        cacheStore.set('key1', 'value1');
        cacheStore.set('key2', 'value2');
        cacheStore.set('key3', 'value3');
        cacheStore.set('key4', 'value4');

        // Should have exactly 3 items
        expect(cacheStore.cache.size).toBe(3);
        // key4 should always be present (just added)
        expect(cacheStore.has('key4')).toBe(true);
      });
    });
  });

  describe('getStats()', () => {
    beforeEach(() => {
      cacheStore = new CacheStore();
    });

    test('should return current statistics', () => {
      cacheStore.set('key1', 'value1');
      cacheStore.get('key1'); // hit
      cacheStore.get('key2'); // miss

      const stats = cacheStore.getStats();

      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.sets).toBe(1);
      expect(stats.evictions).toBe(0);
      expect(stats.size).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.5);
    });

    test('should handle zero total requests', () => {
      const stats = cacheStore.getStats();
      expect(stats.hitRate).toBe(0);
    });
  });

  describe('Integration Tests', () => {
    test('should handle high volume operations', () => {
      cacheStore = new CacheStore({ maxSize: 100 });

      // Add many items
      for (let i = 0; i < 200; i++) {
        cacheStore.set(`key${i}`, `value${i}`);
      }

      // Cache should not exceed maxSize
      expect(cacheStore.cache.size).toBeLessThanOrEqual(100);

      // Recent items should be in cache
      expect(cacheStore.has('key199')).toBe(true);
      expect(cacheStore.has('key0')).toBe(false);
    });

    test('should handle concurrent operations', async () => {
      cacheStore = new CacheStore();

      const operations = [];
      for (let i = 0; i < 10; i++) {
        operations.push(
          Promise.resolve().then(() => {
            cacheStore.set(`key${i}`, `value${i}`);
            return cacheStore.get(`key${i}`);
          })
        );
      }

      const results = await Promise.all(operations);
      expect(results).toHaveLength(10);
      results.forEach((value, index) => {
        expect(value).toBe(`value${index}`);
      });
    });

    test('should maintain consistency with TTL and eviction', () => {
      cacheStore = new CacheStore({
        maxSize: 3,
        ttl: 2000,
        evictionPolicy: 'lru'
      });

      cacheStore.set('key1', 'value1');
      cacheStore.set('key2', 'value2');

      vi.advanceTimersByTime(1000);

      cacheStore.set('key3', 'value3');
      cacheStore.get('key1'); // Access to update LRU

      vi.advanceTimersByTime(1500);

      // key1 and key2 should be expired
      expect(cacheStore.has('key1')).toBe(false);
      expect(cacheStore.has('key2')).toBe(false);
      // key3 should still be valid
      expect(cacheStore.has('key3')).toBe(true);
    });
  });
});