import { describe, test, expect, beforeEach, vi } from 'vitest';
import { HierarchicalResourceStrategy } from './hierarchical.mjs';
import { Result } from '@thinkeloquent/core-exceptions';

vi.mock('fs/promises');

describe('HierarchicalResourceStrategy', () => {
  let strategy;
  let mockResourceLoader;
  let mockConfigManager;
  let mockPathResolver;
  let mockApp;
  let context;

  beforeEach(() => {
    mockResourceLoader = {
      loadSchemas: vi.fn(),
      loadServices: vi.fn(),
      loadPlugin: vi.fn()
    };

    mockConfigManager = {
      getEntityDefinition: vi.fn(),
      get: vi.fn()
    };

    mockPathResolver = {
      baseDir: '/test/base',
      pathExists: vi.fn()
    };

    mockApp = {
      db: { connection: 'mock-db' }
    };

    strategy = new HierarchicalResourceStrategy(mockResourceLoader, mockConfigManager);

    context = {
      entityPath: '/test/base/entities/tenants/tenant1',
      entityType: 'tenant',
      entityId: 'tenant1',
      app: mockApp,
      pathResolver: mockPathResolver,
      config: {
        entities: {
          hierarchicalLoading: true,
          globalResources: {
            schemas: 'global/schemas',
            services: 'global/services'
          }
        }
      }
    };
  });

  describe('Constructor', () => {
    test('should initialize with resource loader and config manager', () => {
      expect(strategy.resourceLoader).toBe(mockResourceLoader);
      expect(strategy.configManager).toBe(mockConfigManager);
    });
  });

  describe('loadSchemas()', () => {
    test('should return empty array when resource loading disabled', async () => {
      mockConfigManager.getEntityDefinition.mockReturnValue({
        resourceLoading: { schemas: false }
      });

      const result = await strategy.loadSchemas(context);

      expect(result.success).toBe(true);
      expect(result.value).toEqual([]);
      expect(mockResourceLoader.loadSchemas).not.toHaveBeenCalled();
    });

    test('should load only entity schemas when hierarchical loading disabled', async () => {
      context.config.entities.hierarchicalLoading = false;
      mockConfigManager.getEntityDefinition.mockReturnValue({
        resourceLoading: { schemas: true }
      });
      mockPathResolver.pathExists.mockResolvedValue(true);
      mockResourceLoader.loadSchemas.mockResolvedValue(
        Result.ok([{ name: 'entity-schema' }])
      );

      const result = await strategy.loadSchemas(context);

      expect(result.success).toBe(true);
      expect(result.value).toEqual([{ name: 'entity-schema' }]);
      expect(mockResourceLoader.loadSchemas).toHaveBeenCalledTimes(1);
      expect(mockResourceLoader.loadSchemas).toHaveBeenCalledWith(
        mockApp,
        '/test/base/entities/tenants/tenant1/schemas'
      );
    });

    test('should load schemas hierarchically when enabled', async () => {
      mockConfigManager.getEntityDefinition.mockReturnValue({
        resourceLoading: { schemas: true },
        parent: 'organization'
      });
      mockPathResolver.pathExists.mockResolvedValue(true);
      mockResourceLoader.loadSchemas
        .mockResolvedValueOnce(Result.ok([{ name: 'global-schema' }]))
        .mockResolvedValueOnce(Result.ok([{ name: 'parent-schema' }]))
        .mockResolvedValueOnce(Result.ok([{ name: 'entity-schema' }]));

      const result = await strategy.loadSchemas(context);

      expect(result.success).toBe(true);
      expect(result.value).toEqual([
        { name: 'global-schema' },
        { name: 'parent-schema' },
        { name: 'entity-schema' }
      ]);
      expect(mockResourceLoader.loadSchemas).toHaveBeenCalledTimes(3);
    });

    test('should skip non-existent paths', async () => {
      mockConfigManager.getEntityDefinition.mockReturnValue({
        resourceLoading: { schemas: true }
      });
      mockPathResolver.pathExists
        .mockResolvedValueOnce(false) // global path
        .mockResolvedValueOnce(true); // entity path
      mockResourceLoader.loadSchemas.mockResolvedValue(
        Result.ok([{ name: 'entity-schema' }])
      );

      const result = await strategy.loadSchemas(context);

      expect(result.success).toBe(true);
      expect(result.value).toEqual([{ name: 'entity-schema' }]);
      expect(mockResourceLoader.loadSchemas).toHaveBeenCalledTimes(1);
    });

    test('should handle load failures gracefully', async () => {
      mockConfigManager.getEntityDefinition.mockReturnValue({
        resourceLoading: { schemas: true }
      });
      mockPathResolver.pathExists.mockResolvedValue(true);
      mockResourceLoader.loadSchemas
        .mockResolvedValueOnce(Result.fail('Load error'))
        .mockResolvedValueOnce(Result.ok([{ name: 'entity-schema' }]));

      const result = await strategy.loadSchemas(context);

      expect(result.success).toBe(true);
      expect(result.value).toEqual([{ name: 'entity-schema' }]);
    });
  });

  describe('loadServices()', () => {
    test('should return empty object when resource loading disabled', async () => {
      mockConfigManager.getEntityDefinition.mockReturnValue({
        resourceLoading: { services: false }
      });

      const result = await strategy.loadServices(context);

      expect(result.success).toBe(true);
      expect(result.value).toEqual({});
      expect(mockResourceLoader.loadServices).not.toHaveBeenCalled();
    });

    test('should use override merge strategy by default', async () => {
      mockConfigManager.getEntityDefinition.mockReturnValue({
        resourceLoading: { services: true }
      });
      mockPathResolver.pathExists.mockResolvedValue(true);
      mockResourceLoader.loadServices
        .mockResolvedValueOnce(Result.ok({ globalService: 'global' }))
        .mockResolvedValueOnce(Result.ok({ entityService: 'entity' }));

      const result = await strategy.loadServices(context);

      expect(result.success).toBe(true);
      expect(result.value).toEqual({ entityService: 'entity' });
    });

    test('should use extend merge strategy when specified', async () => {
      mockConfigManager.getEntityDefinition.mockReturnValue({
        resourceLoading: { services: true },
        mergeStrategy: 'extend'
      });
      mockPathResolver.pathExists.mockResolvedValue(true);
      mockResourceLoader.loadServices
        .mockResolvedValueOnce(Result.ok({ globalService: 'global' }))
        .mockResolvedValueOnce(Result.ok({ entityService: 'entity' }));

      const result = await strategy.loadServices(context);

      expect(result.success).toBe(true);
      expect(result.value).toEqual({
        globalService: 'global',
        entityService: 'entity'
      });
    });

    test('should use isolate merge strategy when specified', async () => {
      mockConfigManager.getEntityDefinition.mockReturnValue({
        resourceLoading: { services: true },
        mergeStrategy: 'isolate'
      });
      mockPathResolver.pathExists.mockResolvedValue(true);  // entity path exists
      mockResourceLoader.loadServices.mockResolvedValue(
        Result.ok({ entityService: 'entity' })
      );

      const result = await strategy.loadServices(context);

      expect(result.success).toBe(true);
      expect(result.value).toEqual({ entityService: 'entity' });
      expect(mockResourceLoader.loadServices).toHaveBeenCalledTimes(1);
    });

    test('should pass correct context to service loader', async () => {
      mockConfigManager.getEntityDefinition.mockReturnValue({
        resourceLoading: { services: true }
      });
      mockPathResolver.pathExists.mockResolvedValue(true);
      mockResourceLoader.loadServices.mockResolvedValue(Result.ok({}));

      await strategy.loadServices(context);

      expect(mockResourceLoader.loadServices).toHaveBeenCalledWith(
        expect.any(String),
        {
          db: mockApp.db,
          config: context.config,
          entityType: 'tenant',
          entityId: 'tenant1'
        }
      );
    });
  });

  describe('loadPlugins()', () => {
    test('should return empty array when resource loading disabled', async () => {
      mockConfigManager.getEntityDefinition.mockReturnValue({
        resourceLoading: { plugins: false }
      });

      const result = await strategy.loadPlugins(context);

      expect(result.success).toBe(true);
      expect(result.value).toEqual([]);
      expect(mockResourceLoader.loadPlugin).not.toHaveBeenCalled();
    });

    test('should load plugins from entity directory', async () => {
      const { readdir } = await import('fs/promises');
      vi.mocked(readdir).mockResolvedValue([
        'plugin1',
        'plugin2',
        '.hidden'
      ]);

      mockConfigManager.getEntityDefinition.mockReturnValue({
        resourceLoading: { plugins: true }
      });
      mockPathResolver.pathExists.mockResolvedValue(true);
      mockResourceLoader.loadPlugin
        .mockResolvedValueOnce(Result.ok(true))
        .mockResolvedValueOnce(Result.ok(true));

      const result = await strategy.loadPlugins(context);

      expect(result.success).toBe(true);
      expect(result.value).toEqual(['plugin1', 'plugin2']);
      expect(mockResourceLoader.loadPlugin).toHaveBeenCalledTimes(2);
      expect(mockResourceLoader.loadPlugin).toHaveBeenCalledWith(
        mockApp,
        '/test/base/entities/tenants/tenant1/plugins/plugin1',
        {
          entityType: 'tenant',
          entityId: 'tenant1',
          config: context.config,
          namespace: '/Entity/tenant/tenant1/Plugin'
        }
      );
    });

    test('should skip hidden directories', async () => {
      const { readdir } = await import('fs/promises');
      vi.mocked(readdir).mockResolvedValue([
        '.hidden',
        '.git',
        'valid-plugin'
      ]);

      mockConfigManager.getEntityDefinition.mockReturnValue({
        resourceLoading: { plugins: true }
      });
      mockPathResolver.pathExists.mockResolvedValue(true);
      mockResourceLoader.loadPlugin.mockResolvedValue(Result.ok(true));

      const result = await strategy.loadPlugins(context);

      expect(result.success).toBe(true);
      expect(result.value).toEqual(['valid-plugin']);
      expect(mockResourceLoader.loadPlugin).toHaveBeenCalledTimes(1);
    });

    test('should handle plugin load failures gracefully', async () => {
      const { readdir } = await import('fs/promises');
      vi.mocked(readdir).mockResolvedValue([
        'plugin1',
        'plugin2'
      ]);

      mockConfigManager.getEntityDefinition.mockReturnValue({
        resourceLoading: { plugins: true }
      });
      mockPathResolver.pathExists.mockResolvedValue(true);
      mockResourceLoader.loadPlugin
        .mockResolvedValueOnce(Result.fail('Load error'))
        .mockResolvedValueOnce(Result.ok(true));

      const result = await strategy.loadPlugins(context);

      expect(result.success).toBe(true);
      expect(result.value).toEqual(['plugin2']);
    });
  });

  describe('loadRoutes()', () => {
    test('should return false when resource loading disabled', async () => {
      mockConfigManager.getEntityDefinition.mockReturnValue({
        resourceLoading: { routes: false }
      });

      const result = await strategy.loadRoutes(context);

      expect(result.success).toBe(true);
      expect(result.value).toBe(false);
      expect(mockResourceLoader.loadPlugin).not.toHaveBeenCalled();
    });

    test('should load routes with default prefix', async () => {
      mockConfigManager.getEntityDefinition.mockReturnValue({
        resourceLoading: { routes: true }
      });
      mockPathResolver.pathExists.mockResolvedValue(true);
      mockResourceLoader.loadPlugin.mockResolvedValue(Result.ok(true));

      const result = await strategy.loadRoutes(context);

      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
      expect(mockResourceLoader.loadPlugin).toHaveBeenCalledWith(
        mockApp,
        '/test/base/entities/tenants/tenant1/routes',
        {
          entityType: 'tenant',
          entityId: 'tenant1',
          config: context.config,
          prefix: '/tenants/tenant1',
          fastify: mockApp,
          namespace: '/Entity/tenant/tenant1/Routes'
        }
      );
    });

    test('should use custom route prefix with placeholder replacement', async () => {
      mockConfigManager.getEntityDefinition.mockReturnValue({
        resourceLoading: { routes: true },
        routePrefix: '/api/v1/{entityId}'
      });
      mockPathResolver.pathExists.mockResolvedValue(true);
      mockResourceLoader.loadPlugin.mockResolvedValue(Result.ok(true));

      const result = await strategy.loadRoutes(context);

      expect(result.success).toBe(true);
      expect(mockResourceLoader.loadPlugin).toHaveBeenCalledWith(
        mockApp,
        expect.any(String),
        expect.objectContaining({
          prefix: '/api/v1/tenant1'
        })
      );
    });

    test('should return false when routes path does not exist', async () => {
      mockConfigManager.getEntityDefinition.mockReturnValue({
        resourceLoading: { routes: true }
      });
      mockPathResolver.pathExists.mockResolvedValue(false);

      const result = await strategy.loadRoutes(context);

      expect(result.success).toBe(true);
      expect(result.value).toBe(false);
      expect(mockResourceLoader.loadPlugin).not.toHaveBeenCalled();
    });
  });

  describe('getMetadata()', () => {
    test('should return correct strategy metadata', () => {
      const metadata = strategy.getMetadata();

      expect(metadata).toEqual({
        type: 'HierarchicalResourceStrategy',
        supportsHierarchy: true,
        supportsCaching: false,
        supportsLazyLoading: false,
        mergeStrategies: ['override', 'extend', 'isolate']
      });
    });
  });

  describe('getLoadingOrder()', () => {
    test('should return correct loading order with hierarchy enabled', () => {
      mockConfigManager.get.mockReturnValue(true);
      mockConfigManager.getEntityDefinition.mockReturnValue({
        parent: 'organization'
      });

      const order = strategy.getLoadingOrder('tenant');

      expect(order).toEqual(['global', 'parent', 'entity']);
    });

    test('should return entity only when hierarchy disabled', () => {
      mockConfigManager.get.mockReturnValue(false);
      mockConfigManager.getEntityDefinition.mockReturnValue({});

      const order = strategy.getLoadingOrder('tenant');

      expect(order).toEqual(['entity']);
    });

    test('should skip parent when no parent defined', () => {
      mockConfigManager.get.mockReturnValue(true);
      mockConfigManager.getEntityDefinition.mockReturnValue({});

      const order = strategy.getLoadingOrder('tenant');

      expect(order).toEqual(['global', 'entity']);
    });
  });

  describe('applyMergeStrategy()', () => {
    const global = { globalService: 'global', shared: 'global' };
    const entity = { entityService: 'entity', shared: 'entity' };

    test('should extend when strategy is extend', () => {
      const result = strategy.applyMergeStrategy(global, entity, 'extend');

      expect(result).toEqual({
        globalService: 'global',
        entityService: 'entity',
        shared: 'entity'
      });
    });

    test('should isolate when strategy is isolate', () => {
      const result = strategy.applyMergeStrategy(global, entity, 'isolate');

      expect(result).toBe(entity);
    });

    test('should override when strategy is override', () => {
      const result = strategy.applyMergeStrategy(global, entity, 'override');

      expect(result).toBe(entity);
    });

    test('should fallback to global when entity is null and strategy is override', () => {
      const result = strategy.applyMergeStrategy(global, null, 'override');

      expect(result).toBe(global);
    });

    test('should default to override for unknown strategy', () => {
      const result = strategy.applyMergeStrategy(global, entity, 'unknown');

      expect(result).toBe(entity);
    });
  });

  describe('Edge Cases', () => {
    test('should handle missing config sections gracefully', async () => {
      context.config = {};
      mockConfigManager.getEntityDefinition.mockReturnValue({
        resourceLoading: { schemas: true }
      });
      mockPathResolver.pathExists.mockResolvedValue(true);
      mockResourceLoader.loadSchemas.mockResolvedValue(
        Result.ok([{ name: 'schema' }])
      );

      const result = await strategy.loadSchemas(context);

      expect(result.success).toBe(true);
      expect(result.value).toEqual([{ name: 'schema' }]);
      expect(mockResourceLoader.loadSchemas).toHaveBeenCalledTimes(1);
    });

    test('should handle undefined entity definition gracefully', async () => {
      mockConfigManager.getEntityDefinition.mockReturnValue({});

      const schemaResult = await strategy.loadSchemas(context);
      expect(schemaResult.success).toBe(true);
      expect(schemaResult.value).toEqual([]);

      const serviceResult = await strategy.loadServices(context);
      expect(serviceResult.success).toBe(true);
      expect(serviceResult.value).toEqual({});

      const pluginResult = await strategy.loadPlugins(context);
      expect(pluginResult.success).toBe(true);
      expect(pluginResult.value).toEqual([]);

      const routeResult = await strategy.loadRoutes(context);
      expect(routeResult.success).toBe(true);
      expect(routeResult.value).toBe(false);
    });

    test('should handle parent path construction correctly', async () => {
      mockConfigManager.getEntityDefinition.mockReturnValue({
        resourceLoading: { schemas: true },
        parent: 'organization'
      });
      mockPathResolver.pathExists.mockResolvedValue(true);
      mockResourceLoader.loadSchemas.mockResolvedValue(Result.ok([]));

      await strategy.loadSchemas(context);

      expect(mockResourceLoader.loadSchemas).toHaveBeenCalledWith(
        mockApp,
        '/test/base/entities/organizations/schemas'
      );
    });
  });
});