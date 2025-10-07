import { describe, test, expect, beforeEach, vi } from 'vitest';
import { FlatResourceStrategy } from './flat.mjs';
import { Result } from '@thinkeloquent/core-exceptions';

vi.mock('fs/promises');

describe('FlatResourceStrategy', () => {
  let strategy;
  let mockResourceLoader;
  let mockPathResolver;
  let mockApp;
  let context;

  beforeEach(() => {
    mockResourceLoader = {
      loadSchemas: vi.fn(),
      loadServices: vi.fn(),
      loadPlugin: vi.fn()
    };

    mockPathResolver = {
      pathExists: vi.fn()
    };

    mockApp = {
      db: { connection: 'mock-db' }
    };

    strategy = new FlatResourceStrategy(mockResourceLoader);

    context = {
      entityPath: '/test/base/entities/tenants/tenant1',
      entityType: 'tenant',
      entityId: 'tenant1',
      app: mockApp,
      pathResolver: mockPathResolver,
      config: {
        database: {
          connection: 'test-db'
        }
      }
    };
  });

  describe('Constructor', () => {
    test('should initialize with resource loader', () => {
      expect(strategy.resourceLoader).toBe(mockResourceLoader);
    });
  });

  describe('loadSchemas()', () => {
    test('should load schemas from entity directory when path exists', async () => {
      mockPathResolver.pathExists.mockResolvedValue(true);
      mockResourceLoader.loadSchemas.mockResolvedValue(
        Result.ok([{ name: 'user-schema' }, { name: 'product-schema' }])
      );

      const result = await strategy.loadSchemas(context);

      expect(result.success).toBe(true);
      expect(result.value).toEqual([
        { name: 'user-schema' },
        { name: 'product-schema' }
      ]);
      expect(mockPathResolver.pathExists).toHaveBeenCalledWith(
        '/test/base/entities/tenants/tenant1/schemas'
      );
      expect(mockResourceLoader.loadSchemas).toHaveBeenCalledWith(
        mockApp,
        '/test/base/entities/tenants/tenant1/schemas'
      );
    });

    test('should return empty array when schemas path does not exist', async () => {
      mockPathResolver.pathExists.mockResolvedValue(false);

      const result = await strategy.loadSchemas(context);

      expect(result.success).toBe(true);
      expect(result.value).toEqual([]);
      expect(mockResourceLoader.loadSchemas).not.toHaveBeenCalled();
    });

    test('should handle schema load failures', async () => {
      mockPathResolver.pathExists.mockResolvedValue(true);
      mockResourceLoader.loadSchemas.mockResolvedValue(
        Result.fail('Failed to load schemas')
      );

      const result = await strategy.loadSchemas(context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to load schemas');
    });
  });

  describe('loadServices()', () => {
    test('should load services from entity directory when path exists', async () => {
      mockPathResolver.pathExists.mockResolvedValue(true);
      mockResourceLoader.loadServices.mockResolvedValue(
        Result.ok({
          userService: { findAll: vi.fn() },
          productService: { getById: vi.fn() }
        })
      );

      const result = await strategy.loadServices(context);

      expect(result.success).toBe(true);
      expect(result.value).toHaveProperty('userService');
      expect(result.value).toHaveProperty('productService');
      expect(mockPathResolver.pathExists).toHaveBeenCalledWith(
        '/test/base/entities/tenants/tenant1/services'
      );
      expect(mockResourceLoader.loadServices).toHaveBeenCalledWith(
        '/test/base/entities/tenants/tenant1/services',
        {
          db: mockApp.db,
          config: context.config,
          entityType: 'tenant',
          entityId: 'tenant1'
        }
      );
    });

    test('should return empty object when services path does not exist', async () => {
      mockPathResolver.pathExists.mockResolvedValue(false);

      const result = await strategy.loadServices(context);

      expect(result.success).toBe(true);
      expect(result.value).toEqual({});
      expect(mockResourceLoader.loadServices).not.toHaveBeenCalled();
    });

    test('should pass correct context to service loader', async () => {
      mockPathResolver.pathExists.mockResolvedValue(true);
      mockResourceLoader.loadServices.mockResolvedValue(Result.ok({}));

      await strategy.loadServices(context);

      expect(mockResourceLoader.loadServices).toHaveBeenCalledWith(
        '/test/base/entities/tenants/tenant1/services',
        {
          db: mockApp.db,
          config: context.config,
          entityType: 'tenant',
          entityId: 'tenant1'
        }
      );
    });

    test('should handle service load failures', async () => {
      mockPathResolver.pathExists.mockResolvedValue(true);
      mockResourceLoader.loadServices.mockResolvedValue(
        Result.fail('Service loading error')
      );

      const result = await strategy.loadServices(context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Service loading error');
    });
  });

  describe('loadPlugins()', () => {
    test('should load plugins from entity directory', async () => {
      const { readdir } = await import('fs/promises');
      vi.mocked(readdir).mockResolvedValue([
        'auth-plugin',
        'logger-plugin',
        '.hidden-plugin'
      ]);

      mockPathResolver.pathExists.mockResolvedValue(true);
      mockResourceLoader.loadPlugin
        .mockResolvedValueOnce(Result.ok(true))
        .mockResolvedValueOnce(Result.ok(true));

      const result = await strategy.loadPlugins(context);

      expect(result.success).toBe(true);
      expect(result.value).toEqual(['auth-plugin', 'logger-plugin']);
      expect(mockResourceLoader.loadPlugin).toHaveBeenCalledTimes(2);
      expect(mockResourceLoader.loadPlugin).toHaveBeenCalledWith(
        mockApp,
        '/test/base/entities/tenants/tenant1/plugins/auth-plugin',
        {
          entityType: 'tenant',
          entityId: 'tenant1',
          config: context.config,
          namespace: '/Entity/tenant/tenant1/Plugin/auth-plugin'
        }
      );
    });

    test('should skip hidden directories (starting with .)', async () => {
      const { readdir } = await import('fs/promises');
      vi.mocked(readdir).mockResolvedValue([
        '.hidden',
        '.git',
        'valid-plugin'
      ]);

      mockPathResolver.pathExists.mockResolvedValue(true);
      mockResourceLoader.loadPlugin.mockResolvedValue(Result.ok(true));

      const result = await strategy.loadPlugins(context);

      expect(result.success).toBe(true);
      expect(result.value).toEqual(['valid-plugin']);
      expect(mockResourceLoader.loadPlugin).toHaveBeenCalledTimes(1);
    });

    test('should return empty array when plugins directory does not exist', async () => {
      mockPathResolver.pathExists.mockResolvedValue(false);

      const result = await strategy.loadPlugins(context);

      expect(result.success).toBe(true);
      expect(result.value).toEqual([]);
      expect(mockResourceLoader.loadPlugin).not.toHaveBeenCalled();
    });

    test('should handle plugin load failures gracefully', async () => {
      const { readdir } = await import('fs/promises');
      vi.mocked(readdir).mockResolvedValue([
        'failing-plugin',
        'working-plugin'
      ]);

      mockPathResolver.pathExists.mockResolvedValue(true);
      mockResourceLoader.loadPlugin
        .mockResolvedValueOnce(Result.fail('Plugin load error'))
        .mockResolvedValueOnce(Result.ok(true));

      const result = await strategy.loadPlugins(context);

      expect(result.success).toBe(true);
      expect(result.value).toEqual(['working-plugin']);
    });

    test('should handle readdir failures', async () => {
      const { readdir } = await import('fs/promises');
      vi.mocked(readdir).mockRejectedValue(new Error('Permission denied'));

      mockPathResolver.pathExists.mockResolvedValue(true);

      const result = await strategy.loadPlugins(context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to load plugins: Permission denied');
    });

    test('should use correct namespace for each plugin', async () => {
      const { readdir } = await import('fs/promises');
      vi.mocked(readdir).mockResolvedValue(['plugin1', 'plugin2']);

      mockPathResolver.pathExists.mockResolvedValue(true);
      mockResourceLoader.loadPlugin.mockResolvedValue(Result.ok(true));

      await strategy.loadPlugins(context);

      expect(mockResourceLoader.loadPlugin).toHaveBeenNthCalledWith(
        1,
        mockApp,
        '/test/base/entities/tenants/tenant1/plugins/plugin1',
        expect.objectContaining({
          namespace: '/Entity/tenant/tenant1/Plugin/plugin1'
        })
      );
      expect(mockResourceLoader.loadPlugin).toHaveBeenNthCalledWith(
        2,
        mockApp,
        '/test/base/entities/tenants/tenant1/plugins/plugin2',
        expect.objectContaining({
          namespace: '/Entity/tenant/tenant1/Plugin/plugin2'
        })
      );
    });
  });

  describe('loadRoutes()', () => {
    test('should load routes with correct prefix', async () => {
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

    test('should return false when routes path does not exist', async () => {
      mockPathResolver.pathExists.mockResolvedValue(false);

      const result = await strategy.loadRoutes(context);

      expect(result.success).toBe(true);
      expect(result.value).toBe(false);
      expect(mockResourceLoader.loadPlugin).not.toHaveBeenCalled();
    });

    test('should handle route loading failures', async () => {
      mockPathResolver.pathExists.mockResolvedValue(true);
      mockResourceLoader.loadPlugin.mockResolvedValue(
        Result.fail('Route registration failed')
      );

      const result = await strategy.loadRoutes(context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Route registration failed');
    });

    test('should use correct route prefix format', async () => {
      mockPathResolver.pathExists.mockResolvedValue(true);
      mockResourceLoader.loadPlugin.mockResolvedValue(Result.ok(true));

      context.entityType = 'organization';
      context.entityId = 'org123';

      await strategy.loadRoutes(context);

      expect(mockResourceLoader.loadPlugin).toHaveBeenCalledWith(
        mockApp,
        expect.any(String),
        expect.objectContaining({
          prefix: '/organizations/org123'
        })
      );
    });

    test('should include fastify instance in route options', async () => {
      mockPathResolver.pathExists.mockResolvedValue(true);
      mockResourceLoader.loadPlugin.mockResolvedValue(Result.ok(true));

      await strategy.loadRoutes(context);

      expect(mockResourceLoader.loadPlugin).toHaveBeenCalledWith(
        mockApp,
        expect.any(String),
        expect.objectContaining({
          fastify: mockApp
        })
      );
    });
  });

  describe('getMetadata()', () => {
    test('should return correct strategy metadata', () => {
      const metadata = strategy.getMetadata();

      expect(metadata).toEqual({
        type: 'FlatResourceStrategy',
        supportsHierarchy: false,
        supportsCaching: false,
        supportsLazyLoading: false,
        description: 'Loads resources only from entity-specific directory'
      });
    });

    test('should indicate no hierarchy support', () => {
      const metadata = strategy.getMetadata();
      expect(metadata.supportsHierarchy).toBe(false);
    });

    test('should indicate no caching support', () => {
      const metadata = strategy.getMetadata();
      expect(metadata.supportsCaching).toBe(false);
    });

    test('should indicate no lazy loading support', () => {
      const metadata = strategy.getMetadata();
      expect(metadata.supportsLazyLoading).toBe(false);
    });
  });

  describe('validateContext()', () => {
    test('should return true for valid context', () => {
      const isValid = strategy.validateContext(context);
      expect(isValid).toBe(true);
    });

    test('should return false when app is missing', () => {
      delete context.app;
      const isValid = strategy.validateContext(context);
      expect(isValid).toBe(false);
    });

    test('should return false when pathResolver is missing', () => {
      delete context.pathResolver;
      const isValid = strategy.validateContext(context);
      expect(isValid).toBe(false);
    });

    test('should return false when entityPath is missing', () => {
      delete context.entityPath;
      const isValid = strategy.validateContext(context);
      expect(isValid).toBe(false);
    });

    test('should return false when entityType is missing', () => {
      delete context.entityType;
      const isValid = strategy.validateContext(context);
      expect(isValid).toBe(false);
    });

    test('should return false when entityId is missing', () => {
      delete context.entityId;
      const isValid = strategy.validateContext(context);
      expect(isValid).toBe(false);
    });

    test('should return true when all required fields are present', () => {
      const validContext = {
        entityPath: '/path/to/entity',
        entityType: 'tenant',
        entityId: 'id123',
        app: { someApp: true },
        pathResolver: { pathExists: vi.fn() }
      };
      const isValid = strategy.validateContext(validContext);
      expect(isValid).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty plugin directories', async () => {
      const { readdir } = await import('fs/promises');
      vi.mocked(readdir).mockResolvedValue([]);

      mockPathResolver.pathExists.mockResolvedValue(true);

      const result = await strategy.loadPlugins(context);

      expect(result.success).toBe(true);
      expect(result.value).toEqual([]);
      expect(mockResourceLoader.loadPlugin).not.toHaveBeenCalled();
    });

    test('should handle null config gracefully', async () => {
      context.config = null;
      mockPathResolver.pathExists.mockResolvedValue(true);
      mockResourceLoader.loadServices.mockResolvedValue(Result.ok({}));

      const result = await strategy.loadServices(context);

      expect(result.success).toBe(true);
      expect(mockResourceLoader.loadServices).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          config: null
        })
      );
    });

    test('should handle undefined config gracefully', async () => {
      delete context.config;
      mockPathResolver.pathExists.mockResolvedValue(true);
      mockResourceLoader.loadServices.mockResolvedValue(Result.ok({}));

      const result = await strategy.loadServices(context);

      expect(result.success).toBe(true);
      expect(mockResourceLoader.loadServices).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          config: undefined
        })
      );
    });

    test('should handle special characters in entity IDs', async () => {
      context.entityId = 'tenant-123_special.chars';
      mockPathResolver.pathExists.mockResolvedValue(true);
      mockResourceLoader.loadPlugin.mockResolvedValue(Result.ok(true));

      const result = await strategy.loadRoutes(context);

      expect(result.success).toBe(true);
      expect(mockResourceLoader.loadPlugin).toHaveBeenCalledWith(
        mockApp,
        expect.any(String),
        expect.objectContaining({
          prefix: '/tenants/tenant-123_special.chars'
        })
      );
    });

    test('should handle very long entity paths', async () => {
      const longPath = '/very/long/path/to/entity/directory/with/many/levels/tenant1';
      context.entityPath = longPath;
      mockPathResolver.pathExists.mockResolvedValue(true);
      mockResourceLoader.loadSchemas.mockResolvedValue(Result.ok([]));

      const result = await strategy.loadSchemas(context);

      expect(result.success).toBe(true);
      expect(mockPathResolver.pathExists).toHaveBeenCalledWith(
        `${longPath}/schemas`
      );
    });
  });

  describe('Integration Scenarios', () => {
    test('should load all resources successfully in sequence', async () => {
      const { readdir } = await import('fs/promises');
      vi.mocked(readdir).mockResolvedValue(['plugin1']);

      mockPathResolver.pathExists.mockResolvedValue(true);
      mockResourceLoader.loadSchemas.mockResolvedValue(
        Result.ok([{ name: 'schema1' }])
      );
      mockResourceLoader.loadServices.mockResolvedValue(
        Result.ok({ service1: {} })
      );
      mockResourceLoader.loadPlugin.mockResolvedValue(Result.ok(true));

      const schemaResult = await strategy.loadSchemas(context);
      const serviceResult = await strategy.loadServices(context);
      const pluginResult = await strategy.loadPlugins(context);
      const routeResult = await strategy.loadRoutes(context);

      expect(schemaResult.success).toBe(true);
      expect(schemaResult.value).toEqual([{ name: 'schema1' }]);

      expect(serviceResult.success).toBe(true);
      expect(serviceResult.value).toEqual({ service1: {} });

      expect(pluginResult.success).toBe(true);
      expect(pluginResult.value).toEqual(['plugin1']);

      expect(routeResult.success).toBe(true);
      expect(routeResult.value).toBe(true);
    });

    test('should handle partial resource availability', async () => {
      mockPathResolver.pathExists
        .mockResolvedValueOnce(true)   // schemas exist
        .mockResolvedValueOnce(false)  // services don't exist
        .mockResolvedValueOnce(false)  // plugins don't exist
        .mockResolvedValueOnce(true);  // routes exist

      mockResourceLoader.loadSchemas.mockResolvedValue(
        Result.ok([{ name: 'schema' }])
      );
      mockResourceLoader.loadPlugin.mockResolvedValue(Result.ok(true));

      const schemaResult = await strategy.loadSchemas(context);
      const serviceResult = await strategy.loadServices(context);
      const pluginResult = await strategy.loadPlugins(context);
      const routeResult = await strategy.loadRoutes(context);

      expect(schemaResult.value).toEqual([{ name: 'schema' }]);
      expect(serviceResult.value).toEqual({});
      expect(pluginResult.value).toEqual([]);
      expect(routeResult.value).toBe(true);
    });
  });
});