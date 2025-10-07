import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { HierarchicalResourceStrategy, Result } from '../../../main.mjs';
import { MockFactories } from '../../helpers/mock-factories.mjs';
import fs from 'fs/promises';
import path from 'path';

// Mock dependencies
vi.mock('fs/promises');

describe('HierarchicalResourceStrategy', () => {
  let strategy;
  let mockResourceLoader;
  let mockConfigManager;
  let mockContext;
  let mockEntityDefinition;
  let tempDir;
  let cleanupEnv;

  beforeEach(() => {
    tempDir = MockFactories.createTempDir();
    
    mockResourceLoader = {
      loadSchemas: vi.fn().mockResolvedValue(Result.ok(['schema1', 'schema2'])),
      loadServices: vi.fn().mockResolvedValue(Result.ok({ service1: {}, service2: {} })),
      loadPlugin: vi.fn().mockResolvedValue(Result.ok(true))
    };

    mockEntityDefinition = {
      type: 'tenant',
      parent: 'organization',
      mergeStrategy: 'override',
      resourceLoading: {
        schemas: true,
        services: true,
        plugins: true,
        routes: true
      }
    };

    mockConfigManager = {
      getEntityDefinition: vi.fn().mockReturnValue(mockEntityDefinition)
    };

    mockContext = {
      entityPath: '/test/entities/tenants/test-tenant',
      entityType: 'tenant',
      entityId: 'test-tenant',
      app: MockFactories.createMockFastifyApp(),
      pathResolver: {
        baseDir: tempDir.name,
        pathExists: vi.fn().mockResolvedValue(true)
      },
      config: {
        entities: {
          hierarchicalLoading: true,
          globalResources: {
            schemas: '/schemas',
            services: '/services',
            plugins: '/plugins',
            routes: '/routes'
          }
        }
      }
    };

    strategy = new HierarchicalResourceStrategy(mockResourceLoader, mockConfigManager);
    
    cleanupEnv = MockFactories.setupMockEnv();
  });

  afterEach(() => {
    cleanupEnv?.();
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with resource loader and config manager', () => {
      expect(strategy.resourceLoader).toBe(mockResourceLoader);
      expect(strategy.configManager).toBe(mockConfigManager);
    });
  });

  describe('loadSchemas()', () => {
    describe('Hierarchical Loading Enabled', () => {
      test('should load schemas in hierarchical order: global → parent → entity', async () => {
        const globalPath = path.join(tempDir.name, 'schemas');
        const parentPath = path.join(tempDir.name, 'entities', 'organizations', 'schemas');
        const entityPath = path.join('/test/entities/tenants/test-tenant', 'schemas');

        mockContext.pathResolver.pathExists
          .mockResolvedValueOnce(true)  // global exists
          .mockResolvedValueOnce(true)  // parent exists
          .mockResolvedValueOnce(true); // entity exists

        mockResourceLoader.loadSchemas
          .mockResolvedValueOnce(Result.ok(['global-schema']))
          .mockResolvedValueOnce(Result.ok(['parent-schema']))
          .mockResolvedValueOnce(Result.ok(['entity-schema']));

        const result = await strategy.loadSchemas(mockContext);

        expect(result).toBeInstanceOf(Result);
        expect(result.success).toBe(true);
        expect(result.value).toEqual(['global-schema', 'parent-schema', 'entity-schema']);

        // Verify loading order
        expect(mockResourceLoader.loadSchemas).toHaveBeenCalledTimes(3);
        expect(mockResourceLoader.loadSchemas).toHaveBeenNthCalledWith(1, mockContext.app, globalPath);
        expect(mockResourceLoader.loadSchemas).toHaveBeenNthCalledWith(2, mockContext.app, parentPath);
        expect(mockResourceLoader.loadSchemas).toHaveBeenNthCalledWith(3, mockContext.app, entityPath);
      });

      test('should skip missing directories in hierarchy', async () => {
        mockContext.pathResolver.pathExists
          .mockResolvedValueOnce(false) // global missing
          .mockResolvedValueOnce(true)  // parent exists
          .mockResolvedValueOnce(false); // entity missing

        mockResourceLoader.loadSchemas
          .mockResolvedValueOnce(Result.ok(['parent-schema']));

        const result = await strategy.loadSchemas(mockContext);

        expect(result.success).toBe(true);
        expect(result.value).toEqual(['parent-schema']);
        expect(mockResourceLoader.loadSchemas).toHaveBeenCalledTimes(1);
      });

      test('should handle entities without parent', async () => {
        const entityWithoutParent = { ...mockEntityDefinition, parent: null };
        mockConfigManager.getEntityDefinition.mockReturnValue(entityWithoutParent);

        mockContext.pathResolver.pathExists
          .mockResolvedValueOnce(true)  // global exists
          .mockResolvedValueOnce(true); // entity exists

        mockResourceLoader.loadSchemas
          .mockResolvedValueOnce(Result.ok(['global-schema']))
          .mockResolvedValueOnce(Result.ok(['entity-schema']));

        const result = await strategy.loadSchemas(mockContext);

        expect(result.success).toBe(true);
        expect(result.value).toEqual(['global-schema', 'entity-schema']);
        expect(mockResourceLoader.loadSchemas).toHaveBeenCalledTimes(2);
      });
    });

    describe('Hierarchical Loading Disabled', () => {
      test('should only load entity-specific schemas when hierarchical loading is disabled', async () => {
        mockContext.config.entities.hierarchicalLoading = false;

        mockContext.pathResolver.pathExists.mockResolvedValueOnce(true);
        mockResourceLoader.loadSchemas.mockResolvedValueOnce(Result.ok(['entity-schema']));

        const result = await strategy.loadSchemas(mockContext);

        expect(result.success).toBe(true);
        expect(result.value).toEqual(['entity-schema']);
        expect(mockResourceLoader.loadSchemas).toHaveBeenCalledTimes(1);
      });
    });

    describe('Resource Loading Disabled', () => {
      test('should return empty array when schema loading is disabled', async () => {
        const entityWithoutSchemas = { 
          ...mockEntityDefinition, 
          resourceLoading: { ...mockEntityDefinition.resourceLoading, schemas: false }
        };
        mockConfigManager.getEntityDefinition.mockReturnValue(entityWithoutSchemas);

        const result = await strategy.loadSchemas(mockContext);

        expect(result).toBeInstanceOf(Result);
        expect(result.success).toBe(true);
        expect(result.value).toEqual([]);
        expect(mockResourceLoader.loadSchemas).not.toHaveBeenCalled();
      });
    });

    describe('Error Handling', () => {
      test('should continue loading when one level fails', async () => {
        mockContext.pathResolver.pathExists
          .mockResolvedValueOnce(true)  // global exists
          .mockResolvedValueOnce(true)  // parent exists
          .mockResolvedValueOnce(true); // entity exists

        mockResourceLoader.loadSchemas
          .mockResolvedValueOnce(Result.ok(['global-schema']))
          .mockResolvedValueOnce(Result.fail('Parent loading failed'))
          .mockResolvedValueOnce(Result.ok(['entity-schema']));

        const result = await strategy.loadSchemas(mockContext);

        expect(result.success).toBe(true);
        expect(result.value).toEqual(['global-schema', 'entity-schema']);
      });
    });
  });

  describe('loadServices()', () => {
    describe('Merge Strategies', () => {
      test('should override services with "override" strategy', async () => {
        mockEntityDefinition.mergeStrategy = 'override';

        mockContext.pathResolver.pathExists
          .mockResolvedValueOnce(true)  // global exists
          .mockResolvedValueOnce(true); // entity exists

        mockResourceLoader.loadServices
          .mockResolvedValueOnce(Result.ok({ globalService: 'global', sharedService: 'global' }))
          .mockResolvedValueOnce(Result.ok({ entityService: 'entity', sharedService: 'entity' }));

        const result = await strategy.loadServices(mockContext);

        expect(result.success).toBe(true);
        expect(result.value).toEqual({ 
          entityService: 'entity', 
          sharedService: 'entity' // overridden
        });
      });

      test('should extend services with "extend" strategy', async () => {
        mockEntityDefinition.mergeStrategy = 'extend';

        mockContext.pathResolver.pathExists
          .mockResolvedValueOnce(true)  // global exists
          .mockResolvedValueOnce(true); // entity exists

        mockResourceLoader.loadServices
          .mockResolvedValueOnce(Result.ok({ globalService: 'global', sharedService: 'global' }))
          .mockResolvedValueOnce(Result.ok({ entityService: 'entity', sharedService: 'entity' }));

        const result = await strategy.loadServices(mockContext);

        expect(result.success).toBe(true);
        expect(result.value).toEqual({
          globalService: 'global',
          entityService: 'entity',
          sharedService: 'entity' // entity still overrides
        });
      });

      test('should isolate services with "isolate" strategy', async () => {
        mockEntityDefinition.mergeStrategy = 'isolate';

        mockContext.pathResolver.pathExists.mockResolvedValueOnce(true);
        mockResourceLoader.loadServices.mockResolvedValueOnce(Result.ok({ entityService: 'entity' }));

        const result = await strategy.loadServices(mockContext);

        expect(result.success).toBe(true);
        expect(result.value).toEqual({ entityService: 'entity' });
        // Should only load entity services, no global loading
        expect(mockResourceLoader.loadServices).toHaveBeenCalledTimes(1);
      });
    });

    describe('Service Context Passing', () => {
      test('should pass correct context to service loader', async () => {
        mockContext.pathResolver.pathExists.mockResolvedValueOnce(true);
        mockResourceLoader.loadServices.mockResolvedValueOnce(Result.ok({}));

        await strategy.loadServices(mockContext);

        expect(mockResourceLoader.loadServices).toHaveBeenCalledWith(
          expect.any(String),
          {
            db: mockContext.app.db,
            config: mockContext.config,
            entityType: 'tenant',
            entityId: 'test-tenant'
          }
        );
      });
    });

    describe('Resource Loading Disabled', () => {
      test('should return empty object when service loading is disabled', async () => {
        const entityWithoutServices = { 
          ...mockEntityDefinition, 
          resourceLoading: { ...mockEntityDefinition.resourceLoading, services: false }
        };
        mockConfigManager.getEntityDefinition.mockReturnValue(entityWithoutServices);

        const result = await strategy.loadServices(mockContext);

        expect(result).toBeInstanceOf(Result);
        expect(result.success).toBe(true);
        expect(result.value).toEqual({});
        expect(mockResourceLoader.loadServices).not.toHaveBeenCalled();
      });
    });

    describe('Error Handling', () => {
      test('should handle global service loading failure gracefully', async () => {
        mockContext.pathResolver.pathExists
          .mockResolvedValueOnce(true)  // global exists
          .mockResolvedValueOnce(true); // entity exists

        mockResourceLoader.loadServices
          .mockResolvedValueOnce(Result.fail('Global services failed'))
          .mockResolvedValueOnce(Result.ok({ entityService: 'entity' }));

        const result = await strategy.loadServices(mockContext);

        expect(result.success).toBe(true);
        expect(result.value).toEqual({ entityService: 'entity' });
      });
    });
  });

  describe('loadPlugins()', () => {
    beforeEach(() => {
      // Don't reassign fs methods - vi.mock handles it
      // Just set default return values
      fs.readFile.mockResolvedValue('{}');
      fs.mkdir.mockResolvedValue(undefined);
      fs.readdir.mockResolvedValue([]);
      fs.stat.mockResolvedValue({ isDirectory: () => true });
    });

    describe('Successful Plugin Loading', () => {
      test('should load plugins from entity plugins directory', async () => {
        const pluginsPath = path.join('/test/entities/tenants/test-tenant', 'plugins');
        
        mockContext.pathResolver.pathExists.mockResolvedValue(true);
        fs.readdir.mockResolvedValue(['plugin1', 'plugin2', '.hidden']); // .hidden should be skipped

        mockResourceLoader.loadPlugin
          .mockResolvedValueOnce(Result.ok(true))
          .mockResolvedValueOnce(Result.ok(true));

        const result = await strategy.loadPlugins(mockContext);

        expect(result).toBeInstanceOf(Result);
        expect(result.success).toBe(true);
        expect(result.value).toEqual(['plugin1', 'plugin2']);

        expect(mockResourceLoader.loadPlugin).toHaveBeenCalledTimes(2);
        expect(mockResourceLoader.loadPlugin).toHaveBeenNthCalledWith(
          1,
          mockContext.app,
          path.join(pluginsPath, 'plugin1'),
          {
            entityType: 'tenant',
            entityId: 'test-tenant',
            config: mockContext.config,
            namespace: '/Entity/tenant/test-tenant/Plugin'
          }
        );
      });

      test('should skip hidden directories (starting with dot)', async () => {
        mockContext.pathResolver.pathExists.mockResolvedValue(true);
        fs.readdir.mockResolvedValue(['plugin1', '.hidden', '..', '.git']);

        mockResourceLoader.loadPlugin.mockResolvedValue(Result.ok(true));

        const result = await strategy.loadPlugins(mockContext);

        expect(result.success).toBe(true);
        expect(result.value).toEqual(['plugin1']);
        expect(mockResourceLoader.loadPlugin).toHaveBeenCalledTimes(1);
      });

      test('should handle plugin loading failures gracefully', async () => {
        mockContext.pathResolver.pathExists.mockResolvedValue(true);
        fs.readdir.mockResolvedValue(['working-plugin', 'failing-plugin']);

        mockResourceLoader.loadPlugin
          .mockResolvedValueOnce(Result.ok(true))
          .mockResolvedValueOnce(Result.fail('Plugin failed to load'));

        const result = await strategy.loadPlugins(mockContext);

        expect(result.success).toBe(true);
        expect(result.value).toEqual(['working-plugin']); // Only successful plugins
      });
    });

    describe('No Plugins Directory', () => {
      test('should return empty array when plugins directory does not exist', async () => {
        mockContext.pathResolver.pathExists.mockResolvedValue(false);

        const result = await strategy.loadPlugins(mockContext);

        expect(result).toBeInstanceOf(Result);
        expect(result.success).toBe(true);
        expect(result.value).toEqual([]);
        expect(fs.readdir).not.toHaveBeenCalled();
      });
    });

    describe('Resource Loading Disabled', () => {
      test('should return empty array when plugin loading is disabled', async () => {
        const entityWithoutPlugins = { 
          ...mockEntityDefinition, 
          resourceLoading: { ...mockEntityDefinition.resourceLoading, plugins: false }
        };
        mockConfigManager.getEntityDefinition.mockReturnValue(entityWithoutPlugins);

        const result = await strategy.loadPlugins(mockContext);

        expect(result).toBeInstanceOf(Result);
        expect(result.success).toBe(true);
        expect(result.value).toEqual([]);
        expect(mockContext.pathResolver.pathExists).not.toHaveBeenCalled();
      });
    });
  });

  describe('loadRoutes()', () => {
    describe('Successful Route Loading', () => {
      test('should load routes with correct prefix', async () => {
        const routesPath = path.join('/test/entities/tenants/test-tenant', 'routes');
        
        mockContext.pathResolver.pathExists.mockResolvedValue(true);
        mockResourceLoader.loadPlugin.mockResolvedValue(Result.ok(true));

        const result = await strategy.loadRoutes(mockContext);

        expect(result).toBeInstanceOf(Result);
        expect(result.success).toBe(true);
        expect(result.value).toBe(true);

        expect(mockResourceLoader.loadPlugin).toHaveBeenCalledWith(
          mockContext.app,
          routesPath,
          {
            entityType: 'tenant',
            entityId: 'test-tenant',
            config: mockContext.config,
            prefix: '/tenants/test-tenant',
            fastify: mockContext.app,
            namespace: '/Entity/tenant/test-tenant/Routes'
          }
        );
      });

      test('should use custom route prefix with entity ID substitution', async () => {
        const entityWithCustomPrefix = { 
          ...mockEntityDefinition, 
          routePrefix: '/api/{entityId}/v1'
        };
        mockConfigManager.getEntityDefinition.mockReturnValue(entityWithCustomPrefix);

        mockContext.pathResolver.pathExists.mockResolvedValue(true);
        mockResourceLoader.loadPlugin.mockResolvedValue(Result.ok(true));

        const result = await strategy.loadRoutes(mockContext);

        expect(result.success).toBe(true);
        expect(mockResourceLoader.loadPlugin).toHaveBeenCalledWith(
          mockContext.app,
          expect.any(String),
          expect.objectContaining({
            prefix: '/api/test-tenant/v1'
          })
        );
      });

      test('should use default prefix when routePrefix is not defined', async () => {
        const entityWithoutPrefix = { 
          ...mockEntityDefinition
        };
        delete entityWithoutPrefix.routePrefix;
        mockConfigManager.getEntityDefinition.mockReturnValue(entityWithoutPrefix);

        mockContext.pathResolver.pathExists.mockResolvedValue(true);
        mockResourceLoader.loadPlugin.mockResolvedValue(Result.ok(true));

        const result = await strategy.loadRoutes(mockContext);

        expect(result.success).toBe(true);
        expect(mockResourceLoader.loadPlugin).toHaveBeenCalledWith(
          mockContext.app,
          expect.any(String),
          expect.objectContaining({
            prefix: '/tenants/test-tenant'
          })
        );
      });
    });

    describe('No Routes Directory', () => {
      test('should return false when routes directory does not exist', async () => {
        mockContext.pathResolver.pathExists.mockResolvedValue(false);

        const result = await strategy.loadRoutes(mockContext);

        expect(result).toBeInstanceOf(Result);
        expect(result.success).toBe(true);
        expect(result.value).toBe(false);
        expect(mockResourceLoader.loadPlugin).not.toHaveBeenCalled();
      });
    });

    describe('Resource Loading Disabled', () => {
      test('should return false when route loading is disabled', async () => {
        const entityWithoutRoutes = { 
          ...mockEntityDefinition, 
          resourceLoading: { ...mockEntityDefinition.resourceLoading, routes: false }
        };
        mockConfigManager.getEntityDefinition.mockReturnValue(entityWithoutRoutes);

        const result = await strategy.loadRoutes(mockContext);

        expect(result).toBeInstanceOf(Result);
        expect(result.success).toBe(true);
        expect(result.value).toBe(false);
        expect(mockContext.pathResolver.pathExists).not.toHaveBeenCalled();
      });
    });

    describe('Route Loading Failure', () => {
      test('should return failure result when route loading fails', async () => {
        mockContext.pathResolver.pathExists.mockResolvedValue(true);
        mockResourceLoader.loadPlugin.mockResolvedValue(Result.fail('Route loading failed'));

        const result = await strategy.loadRoutes(mockContext);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Route loading failed');
      });
    });
  });

  describe('loadResources() - Integration', () => {
    test('should load all resource types in parallel', async () => {
      // Setup all paths to exist
      mockContext.pathResolver.pathExists.mockResolvedValue(true);
      fs.readdir.mockResolvedValue(['plugin1']);

      // Mock all resource loaders - with hierarchical loading enabled, we expect:
      // 1. Global schemas, 2. Parent schemas, 3. Entity schemas
      mockResourceLoader.loadSchemas
        .mockResolvedValueOnce(Result.ok(['global-schema']))    // Global schemas
        .mockResolvedValueOnce(Result.ok(['parent-schema']))    // Parent schemas  
        .mockResolvedValueOnce(Result.ok(['entity-schema']));   // Entity schemas
      
      mockResourceLoader.loadServices.mockResolvedValue(Result.ok({ service1: {} }));
      mockResourceLoader.loadPlugin.mockResolvedValue(Result.ok(true));

      const result = await strategy.loadResources(mockContext);

      expect(result).toEqual({
        schemas: expect.objectContaining({ success: true, value: ['global-schema', 'parent-schema', 'entity-schema'] }),
        services: expect.objectContaining({ success: true, value: { service1: {} } }),
        plugins: expect.objectContaining({ success: true, value: ['plugin1'] }),
        routes: expect.objectContaining({ success: true, value: true })
      });
    });

    test('should handle mixed success and failure results', async () => {
      mockContext.pathResolver.pathExists.mockResolvedValue(true);
      fs.readdir.mockResolvedValue([]);

      // Schema loading succeeds
      mockResourceLoader.loadSchemas.mockResolvedValue(Result.ok(['schema1']));
      
      // Service loading: make both global and entity calls fail to simulate complete failure
      mockResourceLoader.loadServices
        .mockResolvedValueOnce(Result.fail('Global services failed'))
        .mockResolvedValueOnce(Result.fail('Entity services failed'));
        
      mockResourceLoader.loadPlugin.mockResolvedValue(Result.ok(false));

      const result = await strategy.loadResources(mockContext);

      expect(result.schemas.success).toBe(true);
      expect(result.services.success).toBe(true); // Still succeeds because failures are handled gracefully - returns empty object
      expect(result.services.value).toEqual({}); // Should be empty object when all levels fail
      expect(result.plugins.success).toBe(true);
      expect(result.routes.success).toBe(true);
    });

    test('should handle entities with selective resource loading', async () => {
      const selectiveEntity = {
        ...mockEntityDefinition,
        resourceLoading: {
          schemas: true,
          services: false,
          plugins: true,
          routes: false
        }
      };
      mockConfigManager.getEntityDefinition.mockReturnValue(selectiveEntity);

      mockResourceLoader.loadSchemas.mockResolvedValue(Result.ok(['schema1']));
      mockContext.pathResolver.pathExists.mockResolvedValue(true);
      fs.readdir.mockResolvedValue(['plugin1']);
      mockResourceLoader.loadPlugin.mockResolvedValue(Result.ok(true));

      const result = await strategy.loadResources(mockContext);

      // Only schemas and plugins should be loaded
      expect(result.schemas.success).toBe(true);
      expect(result.services.success).toBe(true);
      expect(result.services.value).toEqual({});
      expect(result.plugins.success).toBe(true);
      expect(result.routes.success).toBe(true);
      expect(result.routes.value).toBe(false);

      expect(mockResourceLoader.loadServices).not.toHaveBeenCalled();
    });
  });

  describe('Complex Hierarchy Scenarios', () => {
    test('should handle deep inheritance hierarchy', async () => {
      // Setup: organization → department → team
      const teamEntity = {
        type: 'team',
        parent: 'department',
        mergeStrategy: 'extend',
        resourceLoading: { services: true }
      };

      const departmentContext = {
        ...mockContext,
        entityType: 'team',
        entityId: 'dev-team'
      };

      mockConfigManager.getEntityDefinition.mockReturnValue(teamEntity);

      // Mock path existence for deep hierarchy
      mockContext.pathResolver.pathExists
        .mockResolvedValueOnce(true)  // global services
        .mockResolvedValueOnce(true); // entity services

      mockResourceLoader.loadServices
        .mockResolvedValueOnce(Result.ok({ 
          globalAuth: 'global',
          sharedUtil: 'global' 
        }))
        .mockResolvedValueOnce(Result.ok({ 
          teamSpecific: 'team',
          sharedUtil: 'team-override'
        }));

      const result = await strategy.loadServices(departmentContext);

      expect(result.success).toBe(true);
      expect(result.value).toEqual({
        globalAuth: 'global',
        teamSpecific: 'team',
        sharedUtil: 'team-override'
      });
    });

    test('should handle circular parent references gracefully', async () => {
      // This would be a configuration error, but shouldn't crash
      const circularEntity = {
        type: 'circular',
        parent: 'circular',
        resourceLoading: { schemas: true }
      };

      mockConfigManager.getEntityDefinition.mockReturnValue(circularEntity);
      mockContext.pathResolver.pathExists.mockResolvedValue(true);
      mockResourceLoader.loadSchemas.mockResolvedValue(Result.ok(['schema']));

      const result = await strategy.loadSchemas(mockContext);

      // Should still work, just might load some paths multiple times
      expect(result.success).toBe(true);
    });
  });
});