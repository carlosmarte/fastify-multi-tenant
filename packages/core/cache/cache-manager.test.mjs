import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { CacheManager } from './cache-manager.mjs';
import { CacheStore } from './cache-store.mjs';

describe('CacheManager', () => {
  let cacheManager;

  beforeEach(() => {
    vi.useFakeTimers();
    cacheManager = new CacheManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Constructor', () => {
    test('should initialize with default options', () => {
      const manager = new CacheManager();

      expect(manager.stores).toBeInstanceOf(Map);
      expect(manager.stores.size).toBe(0);
      expect(manager.defaultOptions).toEqual({
        ttl: 5 * 60 * 1000,
        maxSize: 100,
        evictionPolicy: 'lru',
        enabled: true
      });
    });

    test('should accept custom default options', () => {
      const manager = new CacheManager({
        ttl: 10000,
        maxSize: 50,
        evictionPolicy: 'fifo',
        enabled: false
      });

      expect(manager.defaultOptions.ttl).toBe(10000);
      expect(manager.defaultOptions.maxSize).toBe(50);
      expect(manager.defaultOptions.evictionPolicy).toBe('fifo');
      expect(manager.defaultOptions.enabled).toBe(false);
    });
  });

  describe('getStore()', () => {
    test('should create new store if not exists', () => {
      const store = cacheManager.getStore('test');

      expect(store).toBeInstanceOf(CacheStore);
      expect(cacheManager.stores.has('test')).toBe(true);
      expect(cacheManager.stores.size).toBe(1);
    });

    test('should return existing store if exists', () => {
      const store1 = cacheManager.getStore('test');
      store1.set('key1', 'value1');

      const store2 = cacheManager.getStore('test');

      expect(store2).toBe(store1);
      expect(store2.get('key1')).toBe('value1');
      expect(cacheManager.stores.size).toBe(1);
    });

    test('should apply custom options to new store', () => {
      const store = cacheManager.getStore('custom', {
        ttl: 1000,
        maxSize: 10
      });

      expect(store.options.ttl).toBe(1000);
      expect(store.options.maxSize).toBe(10);
      expect(store.options.evictionPolicy).toBe('lru'); // from defaults
    });

    test('should merge options with defaults', () => {
      cacheManager.defaultOptions.ttl = 2000;
      cacheManager.defaultOptions.evictionPolicy = 'fifo';

      const store = cacheManager.getStore('merged', {
        maxSize: 25
      });

      expect(store.options.ttl).toBe(2000);
      expect(store.options.maxSize).toBe(25);
      expect(store.options.evictionPolicy).toBe('fifo');
    });
  });

  describe('createStore()', () => {
    test('should create new store', () => {
      const store = cacheManager.createStore('new');

      expect(store).toBeInstanceOf(CacheStore);
      expect(cacheManager.stores.has('new')).toBe(true);
    });

    test('should overwrite existing store', () => {
      const store1 = cacheManager.createStore('test');
      store1.set('key1', 'value1');

      const store2 = cacheManager.createStore('test');

      expect(store2).not.toBe(store1);
      expect(store2.get('key1')).toBeUndefined();
      expect(cacheManager.stores.size).toBe(1);
    });

    test('should apply custom options', () => {
      const store = cacheManager.createStore('custom', {
        ttl: 500,
        maxSize: 5,
        evictionPolicy: 'random'
      });

      expect(store.options.ttl).toBe(500);
      expect(store.options.maxSize).toBe(5);
      expect(store.options.evictionPolicy).toBe('random');
    });
  });

  describe('deleteStore()', () => {
    test('should delete existing store', () => {
      const store = cacheManager.createStore('test');
      store.set('key1', 'value1');

      const result = cacheManager.deleteStore('test');

      expect(result).toBe(true);
      expect(cacheManager.stores.has('test')).toBe(false);
      expect(cacheManager.stores.size).toBe(0);
    });

    test('should clear store before deletion', () => {
      const store = cacheManager.createStore('test');
      const clearSpy = vi.spyOn(store, 'clear');
      store.set('key1', 'value1');

      cacheManager.deleteStore('test');

      expect(clearSpy).toHaveBeenCalled();
    });

    test('should return false for non-existent store', () => {
      const result = cacheManager.deleteStore('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('clearAll()', () => {
    test('should clear all stores', () => {
      const store1 = cacheManager.createStore('store1');
      const store2 = cacheManager.createStore('store2');

      store1.set('key1', 'value1');
      store2.set('key2', 'value2');

      cacheManager.clearAll();

      expect(store1.size).toBe(0);
      expect(store2.size).toBe(0);
    });

    test('should not delete stores', () => {
      cacheManager.createStore('store1');
      cacheManager.createStore('store2');

      cacheManager.clearAll();

      expect(cacheManager.stores.size).toBe(2);
      expect(cacheManager.hasStore('store1')).toBe(true);
      expect(cacheManager.hasStore('store2')).toBe(true);
    });
  });

  describe('getStoreNames()', () => {
    test('should return empty array when no stores', () => {
      expect(cacheManager.getStoreNames()).toEqual([]);
    });

    test('should return all store names', () => {
      cacheManager.createStore('store1');
      cacheManager.createStore('store2');
      cacheManager.createStore('store3');

      const names = cacheManager.getStoreNames();

      expect(names).toHaveLength(3);
      expect(names).toContain('store1');
      expect(names).toContain('store2');
      expect(names).toContain('store3');
    });
  });

  describe('getAllStats()', () => {
    test('should return empty object when no stores', () => {
      expect(cacheManager.getAllStats()).toEqual({});
    });

    test('should return stats for all stores', () => {
      const store1 = cacheManager.createStore('store1');
      const store2 = cacheManager.createStore('store2');

      store1.set('key1', 'value1');
      store1.get('key1'); // hit
      store1.get('key2'); // miss

      store2.set('key3', 'value3');
      store2.get('key3'); // hit

      const stats = cacheManager.getAllStats();

      expect(stats.store1).toBeDefined();
      expect(stats.store1.hits).toBe(1);
      expect(stats.store1.misses).toBe(1);
      expect(stats.store1.sets).toBe(1);

      expect(stats.store2).toBeDefined();
      expect(stats.store2.hits).toBe(1);
      expect(stats.store2.misses).toBe(0);
      expect(stats.store2.sets).toBe(1);
    });
  });

  describe('hasStore()', () => {
    test('should return false for non-existent store', () => {
      expect(cacheManager.hasStore('nonexistent')).toBe(false);
    });

    test('should return true for existing store', () => {
      cacheManager.createStore('test');
      expect(cacheManager.hasStore('test')).toBe(true);
    });
  });

  describe('getTotalSize()', () => {
    test('should return 0 when no stores', () => {
      expect(cacheManager.getTotalSize()).toBe(0);
    });

    test('should return 0 when stores are empty', () => {
      cacheManager.createStore('store1');
      cacheManager.createStore('store2');

      expect(cacheManager.getTotalSize()).toBe(0);
    });

    test('should return total size across all stores', () => {
      const store1 = cacheManager.createStore('store1');
      const store2 = cacheManager.createStore('store2');
      const store3 = cacheManager.createStore('store3');

      store1.set('key1', 'value1');
      store1.set('key2', 'value2');

      store2.set('key3', 'value3');
      store2.set('key4', 'value4');
      store2.set('key5', 'value5');

      store3.set('key6', 'value6');

      expect(cacheManager.getTotalSize()).toBe(6);
    });

    test.skip('should exclude expired entries from count', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const store1 = cacheManager.createStore('store1', { ttl: 1000 });
      const store2 = cacheManager.createStore('store2');

      store1.set('key1', 'value1');
      store1.set('key2', 'value2');
      store2.set('key3', 'value3');

      vi.setSystemTime(now + 1001);

      expect(cacheManager.getTotalSize()).toBe(1); // Only store2's entry remains
    });
  });

  describe('createNamespace()', () => {
    test('should create namespaced interface for default store', () => {
      const namespace = cacheManager.createNamespace('user');

      namespace.set('123', { name: 'John' });
      namespace.set('456', { name: 'Jane' });

      const store = cacheManager.getStore('default');
      expect(store.has('user:123')).toBe(true);
      expect(store.has('user:456')).toBe(true);
      expect(store.get('user:123')).toEqual({ name: 'John' });
    });

    test('should use specified store name', () => {
      const namespace = cacheManager.createNamespace('product', 'catalog');

      namespace.set('abc', { title: 'Widget' });

      const store = cacheManager.getStore('catalog');
      expect(store.has('product:abc')).toBe(true);
      expect(cacheManager.hasStore('catalog')).toBe(true);
    });

    test('should support all cache operations', () => {
      const namespace = cacheManager.createNamespace('test');

      // Set
      namespace.set('key1', 'value1');

      // Get
      expect(namespace.get('key1')).toBe('value1');

      // Has
      expect(namespace.has('key1')).toBe(true);
      expect(namespace.has('key2')).toBe(false);

      // Delete
      namespace.delete('key1');
      expect(namespace.has('key1')).toBe(false);
    });

    test('should support custom TTL', () => {
      const namespace = cacheManager.createNamespace('temp');
      const store = cacheManager.getStore('default');

      namespace.set('key1', 'value1', 1000);

      expect(namespace.get('key1')).toBe('value1');

      vi.advanceTimersByTime(1001);

      expect(namespace.get('key1')).toBeUndefined();
    });

    test('should clear only namespaced keys', () => {
      const store = cacheManager.getStore('shared');
      const namespace1 = cacheManager.createNamespace('ns1', 'shared');
      const namespace2 = cacheManager.createNamespace('ns2', 'shared');

      namespace1.set('key1', 'value1');
      namespace1.set('key2', 'value2');
      namespace2.set('key3', 'value3');
      store.set('global:key4', 'value4');

      namespace1.clear();

      expect(namespace1.has('key1')).toBe(false);
      expect(namespace1.has('key2')).toBe(false);
      expect(namespace2.has('key3')).toBe(true);
      expect(store.has('global:key4')).toBe(true);
    });

    test('should handle keys() method correctly', () => {
      const store = cacheManager.getStore('default');
      // Add keys method to CacheStore for the test
      store.keys = function* () {
        for (const key of this.cache.keys()) {
          yield key;
        }
      };

      const namespace = cacheManager.createNamespace('test');

      namespace.set('key1', 'value1');
      namespace.set('key2', 'value2');
      store.set('other:key3', 'value3');

      namespace.clear();

      expect(namespace.has('key1')).toBe(false);
      expect(namespace.has('key2')).toBe(false);
      expect(store.has('other:key3')).toBe(true);
    });
  });

  describe('setEnabled()', () => {
    test('should enable all stores', () => {
      const store1 = cacheManager.createStore('store1', { enabled: false });
      const store2 = cacheManager.createStore('store2', { enabled: false });

      cacheManager.setEnabled(true);

      expect(store1.options.enabled).toBe(true);
      expect(store2.options.enabled).toBe(true);
    });

    test('should disable all stores and clear them', () => {
      const store1 = cacheManager.createStore('store1');
      const store2 = cacheManager.createStore('store2');

      store1.set('key1', 'value1');
      store2.set('key2', 'value2');

      cacheManager.setEnabled(false);

      expect(store1.options.enabled).toBe(false);
      expect(store2.options.enabled).toBe(false);
      expect(store1.size).toBe(0);
      expect(store2.size).toBe(0);
    });

    test('should not clear stores when enabling', () => {
      const store1 = cacheManager.createStore('store1');
      const store2 = cacheManager.createStore('store2');

      store1.set('key1', 'value1');
      store2.set('key2', 'value2');

      cacheManager.setEnabled(false); // Disables and clears

      store1.options.enabled = true; // Re-enable manually
      store1.set('key3', 'value3'); // Add new data

      cacheManager.setEnabled(true); // Enable all

      expect(store1.get('key3')).toBe('value3');
    });
  });

  describe('Integration Tests', () => {
    test('should handle multiple stores with different configurations', () => {
      const shortTerm = cacheManager.createStore('short', { ttl: 1000 });
      const longTerm = cacheManager.createStore('long', { ttl: 5000 });
      const permanent = cacheManager.createStore('permanent', { ttl: 0 });

      shortTerm.set('key1', 'short-value');
      longTerm.set('key2', 'long-value');
      permanent.set('key3', 'permanent-value');

      vi.advanceTimersByTime(1001);

      expect(shortTerm.get('key1')).toBeUndefined();
      expect(longTerm.get('key2')).toBe('long-value');
      expect(permanent.get('key3')).toBe('permanent-value');

      vi.advanceTimersByTime(4000);

      expect(longTerm.get('key2')).toBeUndefined();
      expect(permanent.get('key3')).toBe('permanent-value');
    });

    test('should handle multiple namespaces in same store', () => {
      const users = cacheManager.createNamespace('users', 'main');
      const products = cacheManager.createNamespace('products', 'main');
      const orders = cacheManager.createNamespace('orders', 'main');

      users.set('u1', { name: 'Alice' });
      products.set('p1', { name: 'Widget' });
      orders.set('o1', { total: 100 });

      const store = cacheManager.getStore('main');
      expect(store.size).toBe(3);

      users.clear();
      expect(store.size).toBe(2);
      expect(products.has('p1')).toBe(true);
      expect(orders.has('o1')).toBe(true);
    });

    test('should handle high volume across multiple stores', () => {
      const stores = [];
      for (let i = 0; i < 10; i++) {
        stores.push(cacheManager.createStore(`store${i}`, { maxSize: 10 }));
      }

      // Add items to each store
      stores.forEach((store, storeIdx) => {
        for (let i = 0; i < 20; i++) {
          store.set(`key${i}`, `value${storeIdx}-${i}`);
        }
      });

      // Each store should be at max size
      stores.forEach(store => {
        expect(store.size).toBe(10);
      });

      expect(cacheManager.getTotalSize()).toBe(100);
    });

    test('should maintain isolation between stores', () => {
      const store1 = cacheManager.createStore('isolated1');
      const store2 = cacheManager.createStore('isolated2');

      store1.set('shared-key', 'value1');
      store2.set('shared-key', 'value2');

      expect(store1.get('shared-key')).toBe('value1');
      expect(store2.get('shared-key')).toBe('value2');

      store1.clear();

      expect(store1.get('shared-key')).toBeUndefined();
      expect(store2.get('shared-key')).toBe('value2');
    });

    test('should handle store recreation correctly', () => {
      let store = cacheManager.createStore('recreate');
      store.set('key1', 'value1');

      // Get reference to original store
      const originalStore = cacheManager.getStore('recreate');
      expect(originalStore.get('key1')).toBe('value1');

      // Recreate store
      store = cacheManager.createStore('recreate');

      // Original reference should still work but be different store
      expect(store).not.toBe(originalStore);
      expect(store.get('key1')).toBeUndefined();

      // Manager should reference new store
      expect(cacheManager.getStore('recreate')).toBe(store);
    });
  });
});