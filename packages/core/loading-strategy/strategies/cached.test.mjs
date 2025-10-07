import { describe, test, expect, beforeEach, vi } from 'vitest';
import { CachedResourceStrategy } from './cached.mjs';
import { Result } from '@thinkeloquent/core-exceptions';

describe('CachedResourceStrategy', () => {
  let strategy;
  let mockBaseStrategy;
  let context;

  beforeEach(() => {
    vi.useFakeTimers();

    mockBaseStrategy = {
      loadSchemas: vi.fn(),
      loadServices: vi.fn(),
      loadPlugins: vi.fn(),
      loadRoutes: vi.fn(),
      validateContext: vi.fn(),
      getMetadata: vi.fn().mockReturnValue({ type: 'MockStrategy' })
    };

    context = {
      entityType: 'tenant',
      entityId: 'tenant1',
      entityPath: '/path/to/tenant1',
      app: { mock: 'app' }
    };

    strategy = new CachedResourceStrategy(mockBaseStrategy);
  });

  describe('constructor', () => {
    test('initializes with default cache options', () => {
      const strategy = new CachedResourceStrategy(mockBaseStrategy);

      expect(strategy.baseStrategy).toBe(mockBaseStrategy);
      expect(strategy.cacheOptions.ttl).toBe(5 * 60 * 1000);
      expect(strategy.cacheOptions.maxSize).toBe(100);
      expect(strategy.cacheOptions.enabled).toBe(true);
    });

    test('accepts custom cache options', () => {
      const customOptions = {
        ttl: 10000,
        maxSize: 50,
        enabled: false
      };

      const strategy = new CachedResourceStrategy(mockBaseStrategy, customOptions);

      expect(strategy.cacheOptions.ttl).toBe(10000);
      expect(strategy.cacheOptions.maxSize).toBe(50);
      expect(strategy.cacheOptions.enabled).toBe(false);
    });
  });

  describe('getCacheKey', () => {
    test('generates cache key from context', () => {
      const key = strategy.getCacheKey('schemas', context);

      expect(key).toBe('schemas:tenant:tenant1:/path/to/tenant1');
    });
  });

  describe('getCached', () => {
    test('returns undefined when cache is disabled', () => {
      strategy.cacheOptions.enabled = false;
      strategy.cache.set('key', { value: 'data', timestamp: Date.now() });

      const result = strategy.getCached('key');

      expect(result).toBeUndefined();
    });

    test('returns undefined for non-existent key', () => {
      const result = strategy.getCached('non-existent');

      expect(result).toBeUndefined();
    });

    test('returns cached value when valid', () => {
      const value = { data: 'test' };
      strategy.cache.set('key', { value, timestamp: Date.now() });

      const result = strategy.getCached('key');

      expect(result).toEqual(value);
    });

    test('returns undefined and removes expired entries', () => {
      const value = { data: 'test' };
      strategy.cache.set('key', { value, timestamp: Date.now() });

      vi.advanceTimersByTime(strategy.cacheOptions.ttl + 1);

      const result = strategy.getCached('key');

      expect(result).toBeUndefined();
      expect(strategy.cache.has('key')).toBe(false);
    });
  });

  describe('setCached', () => {
    test('does nothing when cache is disabled', () => {
      strategy.cacheOptions.enabled = false;

      strategy.setCached('key', 'value');

      expect(strategy.cache.size).toBe(0);
    });

    test('adds entry to cache', () => {
      const value = { data: 'test' };

      strategy.setCached('key', value);

      expect(strategy.cache.has('key')).toBe(true);
      expect(strategy.cache.get('key').value).toEqual(value);
    });

    test('enforces max cache size by removing oldest entry', () => {
      strategy.cacheOptions.maxSize = 2;

      strategy.setCached('key1', 'value1');
      strategy.setCached('key2', 'value2');
      strategy.setCached('key3', 'value3');

      expect(strategy.cache.size).toBe(2);
      expect(strategy.cache.has('key1')).toBe(false);
      expect(strategy.cache.has('key2')).toBe(true);
      expect(strategy.cache.has('key3')).toBe(true);
    });
  });

  describe('loadSchemas', () => {
    test('returns cached result when available', async () => {
      const cachedSchemas = { schemas: ['cached'] };
      const cacheKey = strategy.getCacheKey('schemas', context);
      strategy.cache.set(cacheKey, {
        value: cachedSchemas,
        timestamp: Date.now()
      });

      const result = await strategy.loadSchemas(context);

      expect(result.success).toBe(true);
      expect(result.value).toEqual(cachedSchemas);
      expect(mockBaseStrategy.loadSchemas).not.toHaveBeenCalled();
    });

    test('calls base strategy when not cached', async () => {
      const schemas = { schemas: ['new'] };
      mockBaseStrategy.loadSchemas.mockResolvedValue(Result.ok(schemas));

      const result = await strategy.loadSchemas(context);

      expect(result.success).toBe(true);
      expect(result.value).toEqual(schemas);
      expect(mockBaseStrategy.loadSchemas).toHaveBeenCalledWith(context);
    });

    test('caches successful results', async () => {
      const schemas = { schemas: ['new'] };
      mockBaseStrategy.loadSchemas.mockResolvedValue(Result.ok(schemas));

      await strategy.loadSchemas(context);

      const cacheKey = strategy.getCacheKey('schemas', context);
      expect(strategy.cache.has(cacheKey)).toBe(true);
      expect(strategy.cache.get(cacheKey).value).toEqual(schemas);
    });

    test('does not cache failed results', async () => {
      const error = new Error('Load failed');
      mockBaseStrategy.loadSchemas.mockResolvedValue(Result.fail(error));

      const result = await strategy.loadSchemas(context);

      expect(result.success).toBe(false);
      const cacheKey = strategy.getCacheKey('schemas', context);
      expect(strategy.cache.has(cacheKey)).toBe(false);
    });
  });

  describe('loadServices', () => {
    test('uses caching for services', async () => {
      const services = { services: ['service1'] };
      mockBaseStrategy.loadServices.mockResolvedValue(Result.ok(services));

      const result1 = await strategy.loadServices(context);
      const result2 = await strategy.loadServices(context);

      expect(mockBaseStrategy.loadServices).toHaveBeenCalledTimes(1);
      expect(result1.value).toEqual(services);
      expect(result2.value).toEqual(services);
    });
  });

  describe('loadPlugins', () => {
    test('uses caching for plugins', async () => {
      const plugins = { plugins: ['plugin1'] };
      mockBaseStrategy.loadPlugins.mockResolvedValue(Result.ok(plugins));

      const result1 = await strategy.loadPlugins(context);
      const result2 = await strategy.loadPlugins(context);

      expect(mockBaseStrategy.loadPlugins).toHaveBeenCalledTimes(1);
      expect(result1.value).toEqual(plugins);
      expect(result2.value).toEqual(plugins);
    });
  });

  describe('loadRoutes', () => {
    test('uses caching for routes', async () => {
      const routes = { routes: ['route1'] };
      mockBaseStrategy.loadRoutes.mockResolvedValue(Result.ok(routes));

      const result1 = await strategy.loadRoutes(context);
      const result2 = await strategy.loadRoutes(context);

      expect(mockBaseStrategy.loadRoutes).toHaveBeenCalledTimes(1);
      expect(result1.value).toEqual(routes);
      expect(result2.value).toEqual(routes);
    });
  });

  describe('clearCache', () => {
    beforeEach(() => {
      strategy.cache.set('schemas:tenant:tenant1:path1', { value: 'data1', timestamp: Date.now() });
      strategy.cache.set('services:tenant:tenant1:path1', { value: 'data2', timestamp: Date.now() });
      strategy.cache.set('schemas:tenant:tenant2:path2', { value: 'data3', timestamp: Date.now() });
      strategy.cache.set('schemas:organization:org1:path3', { value: 'data4', timestamp: Date.now() });
    });

    test('clears all cache when no arguments', () => {
      strategy.clearCache();

      expect(strategy.cache.size).toBe(0);
    });

    test('clears cache by entity type', () => {
      strategy.clearCache('tenant');

      expect(strategy.cache.size).toBe(1);
      expect(strategy.cache.has('schemas:organization:org1:path3')).toBe(true);
    });

    test('clears cache by entity type and id', () => {
      strategy.clearCache('tenant', 'tenant1');

      expect(strategy.cache.size).toBe(2);
      expect(strategy.cache.has('schemas:tenant:tenant2:path2')).toBe(true);
      expect(strategy.cache.has('schemas:organization:org1:path3')).toBe(true);
    });
  });

  describe('getCacheStats', () => {
    test('returns cache statistics', () => {
      strategy.cache.set('key1', { value: 'data1', timestamp: Date.now() - 1000 });
      strategy.cache.set('key2', { value: 'data2', timestamp: Date.now() - 2000 });

      const stats = strategy.getCacheStats();

      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(100);
      expect(stats.ttl).toBe(5 * 60 * 1000);
      expect(stats.enabled).toBe(true);
      expect(stats.entries).toHaveLength(2);
      expect(stats.entries[0].key).toBe('key1');
      expect(stats.entries[0].age).toBeCloseTo(1000, -2);
      expect(stats.entries[0].expired).toBe(false);
    });

    test('identifies expired entries', () => {
      strategy.cache.set('key1', { value: 'data1', timestamp: Date.now() });

      vi.advanceTimersByTime(strategy.cacheOptions.ttl + 1000);

      const stats = strategy.getCacheStats();

      expect(stats.entries[0].expired).toBe(true);
    });
  });

  describe('invalidate', () => {
    test('removes specific cache entry', () => {
      strategy.cache.set('key1', { value: 'data1', timestamp: Date.now() });
      strategy.cache.set('key2', { value: 'data2', timestamp: Date.now() });

      strategy.invalidate('key1');

      expect(strategy.cache.has('key1')).toBe(false);
      expect(strategy.cache.has('key2')).toBe(true);
    });
  });

  describe('getMetadata', () => {
    test('wraps base strategy metadata', () => {
      const metadata = strategy.getMetadata();

      expect(metadata.type).toBe('Cached(MockStrategy)');
      expect(metadata.supportsCaching).toBe(true);
      expect(metadata.cacheOptions).toEqual(strategy.cacheOptions);
    });
  });

  describe('validateContext', () => {
    test('delegates to base strategy', () => {
      mockBaseStrategy.validateContext.mockReturnValue(true);

      const result = strategy.validateContext(context);

      expect(result).toBe(true);
      expect(mockBaseStrategy.validateContext).toHaveBeenCalledWith(context);
    });
  });

  describe('setCacheOptions', () => {
    test('updates cache options', () => {
      strategy.setCacheOptions({ ttl: 10000, maxSize: 50 });

      expect(strategy.cacheOptions.ttl).toBe(10000);
      expect(strategy.cacheOptions.maxSize).toBe(50);
      expect(strategy.cacheOptions.enabled).toBe(true);
    });

    test('preserves unspecified options', () => {
      strategy.setCacheOptions({ ttl: 10000 });

      expect(strategy.cacheOptions.ttl).toBe(10000);
      expect(strategy.cacheOptions.maxSize).toBe(100);
      expect(strategy.cacheOptions.enabled).toBe(true);
    });
  });

  describe('setCacheEnabled', () => {
    test('enables caching', () => {
      strategy.cacheOptions.enabled = false;

      strategy.setCacheEnabled(true);

      expect(strategy.cacheOptions.enabled).toBe(true);
    });

    test('disables caching and clears cache', () => {
      strategy.cache.set('key1', { value: 'data', timestamp: Date.now() });

      strategy.setCacheEnabled(false);

      expect(strategy.cacheOptions.enabled).toBe(false);
      expect(strategy.cache.size).toBe(0);
    });
  });

  describe('cache expiration', () => {
    test('respects TTL for cache entries', async () => {
      const schemas = { schemas: ['test'] };
      mockBaseStrategy.loadSchemas.mockResolvedValue(Result.ok(schemas));

      await strategy.loadSchemas(context);
      expect(mockBaseStrategy.loadSchemas).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(strategy.cacheOptions.ttl - 1000);
      await strategy.loadSchemas(context);
      expect(mockBaseStrategy.loadSchemas).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(2000);
      await strategy.loadSchemas(context);
      expect(mockBaseStrategy.loadSchemas).toHaveBeenCalledTimes(2);
    });
  });
});