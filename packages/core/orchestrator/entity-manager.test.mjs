import { describe, test, expect, beforeEach, vi } from 'vitest';
import { EntityManager } from './entity-manager.mjs';
import { EntityError } from '@thinkeloquent/core-exceptions';
import path from 'path';

vi.mock('fs/promises', () => ({
  readdir: vi.fn(),
  stat: vi.fn()
}));

describe('EntityManager', () => {
  let entityManager;
  let mockDependencies;
  let mockApp;
  let mockPathResolver;
  let mockEntity;

  beforeEach(() => {
    mockEntity = {
      id: 'entity-123',
      type: 'tenant',
      config: { source: '/path/to/entity' },
      active: true,
      listServices: vi.fn(() => ['service1'])
    };

    mockDependencies = {
      logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
      },
      securityService: {
        validateEntity: vi.fn()
      },
      entityFactory: {
        createEntity: vi.fn()
      },
      entityRegistry: {
        getEntity: vi.fn(),
        getAllEntities: vi.fn(),
        getEntitiesByType: vi.fn(),
        getStats: vi.fn(),
        register: vi.fn(),
        unregister: vi.fn(),
        entityStats: {
          loaded: 0,
          failed: 0,
          reloaded: 0
        }
      },
      configManager: {
        entityDefinitions: {
          tenant: { enabled: true },
          user: { enabled: true }
        },
        getEntityDefinition: vi.fn(),
        getAllEntityTypes: vi.fn(() => ['tenant', 'user'])
      },
      identificationManager: {
        extractEntityInfo: vi.fn()
      },
      lifecycleManager: {
        transition: vi.fn()
      }
    };

    mockApp = {
      decorate: vi.fn()
    };

    mockPathResolver = {
      baseDir: '/project',
      pathExists: vi.fn()
    };

    entityManager = new EntityManager(mockDependencies);
  });

  describe('Constructor', () => {
    test('should initialize with provided dependencies', () => {
      expect(entityManager.logger).toBe(mockDependencies.logger);
      expect(entityManager.securityService).toBe(mockDependencies.securityService);
      expect(entityManager.entityFactory).toBe(mockDependencies.entityFactory);
      expect(entityManager.entityRegistry).toBe(mockDependencies.entityRegistry);
      expect(entityManager.configManager).toBe(mockDependencies.configManager);
      expect(entityManager.identificationManager).toBe(mockDependencies.identificationManager);
      expect(entityManager.lifecycleManager).toBe(mockDependencies.lifecycleManager);
    });
  });

  describe('identifyEntities()', () => {
    test('should delegate to identificationManager', () => {
      const mockRequest = { headers: { 'x-tenant-id': 'tenant-123' } };
      const mockResult = { tenant: 'tenant-123' };

      mockDependencies.identificationManager.extractEntityInfo.mockReturnValue(mockResult);

      const result = entityManager.identifyEntities(mockRequest);

      expect(result).toBe(mockResult);
      expect(mockDependencies.identificationManager.extractEntityInfo).toHaveBeenCalledWith(
        mockRequest,
        mockDependencies.configManager.entityDefinitions
      );
    });
  });

  describe('getEntity()', () => {
    test('should delegate to entityRegistry', () => {
      mockDependencies.entityRegistry.getEntity.mockReturnValue(mockEntity);

      const result = entityManager.getEntity('tenant', 'entity-123');

      expect(result).toBe(mockEntity);
      expect(mockDependencies.entityRegistry.getEntity).toHaveBeenCalledWith('tenant', 'entity-123');
    });
  });

  describe('getAllEntities()', () => {
    test('should delegate to entityRegistry', () => {
      const mockEntities = [mockEntity];
      mockDependencies.entityRegistry.getAllEntities.mockReturnValue(mockEntities);

      const result = entityManager.getAllEntities();

      expect(result).toBe(mockEntities);
      expect(mockDependencies.entityRegistry.getAllEntities).toHaveBeenCalled();
    });
  });

  describe('getEntitiesByType()', () => {
    test('should delegate to entityRegistry', () => {
      const mockEntities = [mockEntity];
      mockDependencies.entityRegistry.getEntitiesByType.mockReturnValue(mockEntities);

      const result = entityManager.getEntitiesByType('tenant');

      expect(result).toBe(mockEntities);
      expect(mockDependencies.entityRegistry.getEntitiesByType).toHaveBeenCalledWith('tenant');
    });
  });

  describe('getStats()', () => {
    test('should delegate to entityRegistry', () => {
      const mockStats = { total: 5, active: 3 };
      mockDependencies.entityRegistry.getStats.mockReturnValue(mockStats);

      const result = entityManager.getStats();

      expect(result).toBe(mockStats);
      expect(mockDependencies.entityRegistry.getStats).toHaveBeenCalled();
    });
  });

  describe('loadEntity()', () => {
    test('should successfully load and register an entity', async () => {
      mockDependencies.entityFactory.createEntity.mockResolvedValue(mockEntity);
      mockDependencies.lifecycleManager.transition.mockImplementation(
        async (type, id, event, callback) => await callback()
      );

      const result = await entityManager.loadEntity(
        mockApp,
        'tenant',
        '/path/to/entity',
        'entity-123'
      );

      expect(result).toBe(mockEntity);
      expect(mockDependencies.entityFactory.createEntity).toHaveBeenCalledWith(
        mockApp,
        'tenant',
        '/path/to/entity',
        'entity-123'
      );
      expect(mockDependencies.lifecycleManager.transition).toHaveBeenCalledWith(
        'tenant',
        'entity-123',
        'load',
        expect.any(Function)
      );
      expect(mockDependencies.entityRegistry.register).toHaveBeenCalledWith(mockEntity);
    });

    test('should return null when entity creation returns null', async () => {
      mockDependencies.entityFactory.createEntity.mockResolvedValue(null);

      const result = await entityManager.loadEntity(
        mockApp,
        'tenant',
        '/path/to/entity'
      );

      expect(result).toBeNull();
      expect(mockDependencies.entityRegistry.register).not.toHaveBeenCalled();
    });

    test('should handle and track load failures', async () => {
      const error = new Error('Load failed');
      mockDependencies.entityFactory.createEntity.mockRejectedValue(error);

      await expect(
        entityManager.loadEntity(mockApp, 'tenant', '/path/to/entity')
      ).rejects.toThrow(error);

      expect(mockDependencies.logger.error).toHaveBeenCalledWith(
        { err: error },
        '❌ Failed to load entity from /path/to/entity'
      );
      expect(mockDependencies.entityRegistry.entityStats.failed).toBe(1);
    });
  });

  describe('loadAllEntities()', () => {
    test('should load entities from local directories', async () => {
      const { readdir, stat } = await import('fs/promises');
      mockDependencies.configManager.getEntityDefinition.mockImplementation((type) => ({
        enabled: true,
        basePath: type === 'tenant' ? '/tenants' : '/users'
      }));

      mockPathResolver.pathExists.mockImplementation((path) =>
        path.includes('/tenants')
      );
      readdir.mockResolvedValue(['tenant-1', 'tenant-2', '.hidden']);
      stat.mockResolvedValue({ isDirectory: () => true });

      mockDependencies.entityFactory.createEntity.mockResolvedValue(mockEntity);
      mockDependencies.lifecycleManager.transition.mockImplementation(
        async (type, id, event, callback) => await callback()
      );

      const result = await entityManager.loadAllEntities(mockApp, mockPathResolver);

      expect(result).toEqual({
        tenant: { local: 2, npm: 0, failed: 0 },
        user: { local: 0, npm: 0, failed: 0 }
      });

      expect(readdir).toHaveBeenCalledWith(
        path.join('/project', 'entities', '/tenants')
      );
      expect(mockDependencies.logger.info).toHaveBeenCalledWith(
        '🔍 Found 2 local tenant entities'
      );
      expect(mockDependencies.logger.info).toHaveBeenCalledWith(
        '🧩 tenant: 2 loaded (2 local, 0 npm), 0 failed'
      );
    });

    test('should skip disabled entity types', async () => {
      const { readdir, stat } = await import('fs/promises');
      mockDependencies.configManager.getEntityDefinition.mockImplementation((type) => ({
        enabled: type === 'tenant',
        basePath: `/${type}s`
      }));

      mockPathResolver.pathExists.mockResolvedValue(false);

      const result = await entityManager.loadAllEntities(mockApp, mockPathResolver);

      expect(result).toEqual({
        tenant: { local: 0, npm: 0, failed: 0 },
        user: { local: 0, npm: 0, failed: 0 }
      });
    });

    test('should handle individual entity load failures', async () => {
      const { readdir, stat } = await import('fs/promises');
      mockDependencies.configManager.getEntityDefinition.mockReturnValue({
        enabled: true,
        basePath: '/tenants'
      });

      mockPathResolver.pathExists.mockResolvedValue(true);
      readdir.mockResolvedValue(['tenant-1', 'tenant-2']);
      stat.mockResolvedValue({ isDirectory: () => true });

      mockDependencies.entityFactory.createEntity
        .mockResolvedValueOnce(mockEntity)
        .mockRejectedValueOnce(new Error('Load failed'));

      mockDependencies.lifecycleManager.transition.mockImplementation(
        async (type, id, event, callback) => await callback()
      );

      const result = await entityManager.loadAllEntities(mockApp, mockPathResolver);

      expect(result.tenant).toEqual({ local: 1, npm: 0, failed: 1 });
      expect(mockDependencies.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        '❌ Failed to load tenant entity tenant-2'
      );
    });

    test('should skip non-directory entries', async () => {
      const { readdir, stat } = await import('fs/promises');
      mockDependencies.configManager.getEntityDefinition.mockImplementation((type) => ({
        enabled: type === 'tenant',
        basePath: '/tenants'
      }));

      mockPathResolver.pathExists.mockImplementation((path) =>
        path.includes('/tenants')
      );
      readdir.mockResolvedValue(['file.txt', 'directory']);
      stat
        .mockResolvedValueOnce({ isDirectory: () => false })
        .mockResolvedValueOnce({ isDirectory: () => true });

      mockDependencies.entityFactory.createEntity.mockResolvedValue(mockEntity);
      mockDependencies.lifecycleManager.transition.mockImplementation(
        async (type, id, event, callback) => await callback()
      );

      const result = await entityManager.loadAllEntities(mockApp, mockPathResolver);

      expect(result.tenant.local).toBe(1);
      expect(mockDependencies.entityFactory.createEntity).toHaveBeenCalledTimes(1);
    });
  });

  describe('reloadEntity()', () => {
    test('should successfully reload an existing entity', async () => {
      const newEntity = { ...mockEntity, id: 'entity-123-reloaded' };

      mockDependencies.entityRegistry.getEntity.mockReturnValue(mockEntity);
      mockDependencies.entityFactory.createEntity.mockResolvedValue(newEntity);
      mockDependencies.lifecycleManager.transition.mockImplementation(
        async (type, id, event, callback) => await callback()
      );

      await entityManager.reloadEntity(mockApp, 'tenant', 'entity-123');

      expect(mockDependencies.entityRegistry.unregister).toHaveBeenCalledWith('tenant', 'entity-123');
      expect(mockDependencies.entityFactory.createEntity).toHaveBeenCalledWith(
        mockApp,
        'tenant',
        '/path/to/entity',
        'entity-123'
      );
      expect(mockDependencies.entityRegistry.entityStats.reloaded).toBe(1);
    });

    test('should throw error if entity not found', async () => {
      mockDependencies.entityRegistry.getEntity.mockReturnValue(null);

      await expect(
        entityManager.reloadEntity(mockApp, 'tenant', 'non-existent')
      ).rejects.toThrow(EntityError);

      expect(mockDependencies.entityFactory.createEntity).not.toHaveBeenCalled();
    });

    test('should re-register old entity on reload failure', async () => {
      const error = new Error('Reload failed');

      mockDependencies.entityRegistry.getEntity.mockReturnValue(mockEntity);
      mockDependencies.entityFactory.createEntity.mockRejectedValue(error);
      mockDependencies.lifecycleManager.transition.mockImplementation(
        async (type, id, event, callback) => await callback()
      );

      await expect(
        entityManager.reloadEntity(mockApp, 'tenant', 'entity-123')
      ).rejects.toThrow(error);

      expect(mockDependencies.entityRegistry.unregister).toHaveBeenCalledWith('tenant', 'entity-123');
      expect(mockDependencies.entityRegistry.register).toHaveBeenCalledWith(mockEntity);
    });
  });

  describe('unloadEntity()', () => {
    test('should successfully unload an entity', async () => {
      mockDependencies.lifecycleManager.transition.mockImplementation(
        async (type, id, event, callback) => {
          await callback();
          return true;
        }
      );

      const result = await entityManager.unloadEntity('tenant', 'entity-123');

      expect(result).toBe(true);
      expect(mockDependencies.lifecycleManager.transition).toHaveBeenCalledWith(
        'tenant',
        'entity-123',
        'unload',
        expect.any(Function)
      );
      expect(mockDependencies.entityRegistry.unregister).toHaveBeenCalledWith('tenant', 'entity-123');
    });

    test('should handle lifecycle transition failures', async () => {
      const error = new Error('Transition failed');
      mockDependencies.lifecycleManager.transition.mockRejectedValue(error);

      await expect(
        entityManager.unloadEntity('tenant', 'entity-123')
      ).rejects.toThrow(error);
    });
  });
});