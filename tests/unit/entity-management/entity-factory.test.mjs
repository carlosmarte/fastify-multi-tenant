import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { EntityFactory, EntityError, LocalEntityAdapter, NPMEntityAdapter } from '../../../main.mjs';
import { MockFactories } from '../../helpers/mock-factories.mjs';

describe('EntityFactory', () => {
  let entityFactory;
  let mockLogger;
  let mockPathResolver;
  let mockResourceLoader;
  let mockSecurityService;
  let mockConfigManager;
  let mockApp;
  let tempDir;
  let cleanupEnv;

  beforeEach(() => {
    mockLogger = MockFactories.createMockLogger();
    tempDir = MockFactories.createTempDir();
    
    mockPathResolver = {
      baseDir: tempDir.name,
      pathExists: vi.fn().mockResolvedValue(true)
    };

    mockResourceLoader = {
      loadConfig: vi.fn().mockResolvedValue({ active: true })
    };

    mockSecurityService = {
      validateEntityId: vi.fn().mockImplementation(id => id)
    };

    mockConfigManager = {
      getEntityDefinition: vi.fn().mockReturnValue({
        type: 'tenant',
        name: 'Tenant',
        basePath: '/tenants',
        identificationStrategy: 'subdomain',
        enabled: true,
        resourceLoading: {
          schemas: true,
          services: true,
          plugins: true,
          routes: true
        }
      })
    };

    mockApp = MockFactories.createMockFastifyApp();

    entityFactory = new EntityFactory(
      mockLogger,
      mockPathResolver,
      mockResourceLoader,
      mockSecurityService,
      mockConfigManager
    );
    
    cleanupEnv = MockFactories.setupMockEnv();
  });

  afterEach(() => {
    cleanupEnv?.();
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with dependencies and create adapters', () => {
      expect(entityFactory.logger).toBe(mockLogger);
      expect(entityFactory.securityService).toBe(mockSecurityService);
      expect(entityFactory.configManager).toBe(mockConfigManager);
      expect(entityFactory.adapters).toHaveLength(2);
      expect(entityFactory.adapters[0]).toBeInstanceOf(LocalEntityAdapter);
      expect(entityFactory.adapters[1]).toBeInstanceOf(NPMEntityAdapter);
    });
  });

  describe('createEntity()', () => {
    const entityType = 'tenant';
    const source = '/test/entities/tenants/test-tenant';
    const entityId = 'test-tenant';

    describe('Successful Entity Creation', () => {
      test('should create entity with local adapter', async () => {
        const mockEntityDefinition = {
          type: 'tenant',
          name: 'Tenant',
          enabled: true
        };
        mockConfigManager.getEntityDefinition.mockReturnValue(mockEntityDefinition);

        // Mock local adapter can handle
        entityFactory.adapters[0].canHandle = vi.fn().mockResolvedValue(true);
        entityFactory.adapters[0].loadConfig = vi.fn().mockResolvedValue({
          ...mockEntityDefinition,
          id: entityId,
          active: true,
          source
        });
        entityFactory.adapters[0].loadResources = vi.fn().mockResolvedValue(undefined);

        const entity = await entityFactory.createEntity(mockApp, entityType, source, entityId);

        expect(entity).toBeDefined();
        expect(entity.type).toBe(entityType);
        expect(entity.id).toBe(entityId);
        expect(entity.config.source).toBe(source);
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining(`Entity '${entityType}:${entityId}' (local) loaded successfully`)
        );
      });

      test('should create entity with NPM adapter', async () => {
        const npmSource = 'fastify-entity-tenant';
        
        // Local adapter cannot handle
        entityFactory.adapters[0].canHandle = vi.fn().mockResolvedValue(false);
        // NPM adapter can handle
        entityFactory.adapters[1].canHandle = vi.fn().mockResolvedValue(true);
        entityFactory.adapters[1].loadConfig = vi.fn().mockResolvedValue({
          id: entityId,
          active: true,
          source: npmSource,
          packageName: npmSource
        });
        entityFactory.adapters[1].loadResources = vi.fn().mockResolvedValue(undefined);

        const entity = await entityFactory.createEntity(mockApp, entityType, npmSource, entityId);

        expect(entity).toBeDefined();
        expect(entity.type).toBe(entityType);
        expect(entity.id).toBe(entityId);
        expect(entity.config.source).toBe(npmSource);
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining(`Entity '${entityType}:${entityId}' (npm) loaded successfully`)
        );
      });

      test('should auto-generate entity ID for local entities', async () => {
        const localSource = '/test/entities/tenants/auto-generated';
        
        entityFactory.adapters[0].canHandle = vi.fn().mockResolvedValue(true);
        entityFactory.adapters[0].loadConfig = vi.fn().mockResolvedValue({
          id: 'auto-generated',
          active: true,
          source: localSource
        });
        entityFactory.adapters[0].loadResources = vi.fn().mockResolvedValue(undefined);

        const entity = await entityFactory.createEntity(mockApp, entityType, localSource);

        expect(entity.id).toBe('auto-generated'); // Derived from path basename
        expect(mockSecurityService.validateEntityId).toHaveBeenCalledWith('auto-generated', entityType);
      });

      test('should auto-generate entity ID for NPM entities', async () => {
        const npmSource = 'fastify-entity-organization';
        
        entityFactory.adapters[0].canHandle = vi.fn().mockResolvedValue(false);
        entityFactory.adapters[1].canHandle = vi.fn().mockResolvedValue(true);
        entityFactory.adapters[1].loadConfig = vi.fn().mockResolvedValue({
          id: 'organization',
          active: true,
          source: npmSource
        });
        entityFactory.adapters[1].loadResources = vi.fn().mockResolvedValue(undefined);

        const entity = await entityFactory.createEntity(mockApp, entityType, npmSource);

        expect(entity.id).toBe('organization'); // Derived from package name
      });

      test('should validate entity ID through security service', async () => {
        const customEntityId = 'custom-entity-123';
        mockSecurityService.validateEntityId.mockReturnValue(customEntityId);

        entityFactory.adapters[0].canHandle = vi.fn().mockResolvedValue(true);
        entityFactory.adapters[0].loadConfig = vi.fn().mockResolvedValue({
          id: customEntityId,
          active: true,
          source
        });
        entityFactory.adapters[0].loadResources = vi.fn().mockResolvedValue(undefined);

        const entity = await entityFactory.createEntity(mockApp, entityType, source, 'unsafe-id');

        expect(mockSecurityService.validateEntityId).toHaveBeenCalledWith('unsafe-id', entityType);
        expect(entity.id).toBe(customEntityId);
      });
    });

    describe('Entity Definition Validation', () => {
      test('should throw EntityError when entity type is not defined', async () => {
        mockConfigManager.getEntityDefinition.mockReturnValue(null);

        await expect(
          entityFactory.createEntity(mockApp, 'nonexistent', source, entityId)
        ).rejects.toThrow(EntityError);

        await expect(
          entityFactory.createEntity(mockApp, 'nonexistent', source, entityId)
        ).rejects.toThrow("Entity type 'nonexistent' not defined in configuration");
      });
    });

    describe('Adapter Selection', () => {
      test('should throw EntityError when no adapter can handle source', async () => {
        // All adapters cannot handle
        entityFactory.adapters[0].canHandle = vi.fn().mockResolvedValue(false);
        entityFactory.adapters[1].canHandle = vi.fn().mockResolvedValue(false);

        await expect(
          entityFactory.createEntity(mockApp, entityType, source, entityId)
        ).rejects.toThrow(EntityError);

        await expect(
          entityFactory.createEntity(mockApp, entityType, source, entityId)
        ).rejects.toThrow(`No adapter found for entity source: ${source}`);
      });

      test('should use first adapter that can handle source', async () => {
        // Both adapters can handle, should use first one
        entityFactory.adapters[0].canHandle = vi.fn().mockResolvedValue(true);
        entityFactory.adapters[1].canHandle = vi.fn().mockResolvedValue(true);
        
        entityFactory.adapters[0].loadConfig = vi.fn().mockResolvedValue({
          id: entityId,
          active: true,
          source
        });
        entityFactory.adapters[0].loadResources = vi.fn().mockResolvedValue(undefined);

        const entity = await entityFactory.createEntity(mockApp, entityType, source, entityId);

        expect(entityFactory.adapters[0].canHandle).toHaveBeenCalled();
        expect(entityFactory.adapters[1].canHandle).not.toHaveBeenCalled();
        expect(entity.adapter).toBe(entityFactory.adapters[0]);
      });
    });

    describe('Inactive Entity Handling', () => {
      test('should return null for inactive entities', async () => {
        entityFactory.adapters[0].canHandle = vi.fn().mockResolvedValue(true);
        entityFactory.adapters[0].loadConfig = vi.fn().mockResolvedValue({
          id: entityId,
          active: false, // Inactive entity
          source
        });

        const entity = await entityFactory.createEntity(mockApp, entityType, source, entityId);

        expect(entity).toBeNull();
        expect(mockLogger.info).toHaveBeenCalledWith(
          `📦 Entity ${entityType}:${entityId} is inactive, skipping`
        );
      });
    });

    describe('Error Handling', () => {
      test('should handle adapter errors gracefully', async () => {
        entityFactory.adapters[0].canHandle = vi.fn().mockResolvedValue(true);
        entityFactory.adapters[0].loadConfig = vi.fn().mockRejectedValue(new Error('Config loading failed'));

        await expect(
          entityFactory.createEntity(mockApp, entityType, source, entityId)
        ).rejects.toThrow(EntityError);

        expect(mockLogger.error).toHaveBeenCalledWith(
          { err: expect.any(Error) },
          `❌ Failed to build entity from ${source}`
        );
      });

      test('should handle security validation errors', async () => {
        mockSecurityService.validateEntityId.mockImplementation(() => {
          throw new Error('Invalid entity ID');
        });

        entityFactory.adapters[0].canHandle = vi.fn().mockResolvedValue(true);

        await expect(
          entityFactory.createEntity(mockApp, entityType, source, entityId)
        ).rejects.toThrow(EntityError);
      });

      test('should handle resource loading errors', async () => {
        entityFactory.adapters[0].canHandle = vi.fn().mockResolvedValue(true);
        entityFactory.adapters[0].loadConfig = vi.fn().mockResolvedValue({
          id: entityId,
          active: true,
          source
        });
        entityFactory.adapters[0].loadResources = vi.fn().mockRejectedValue(new Error('Resource loading failed'));

        await expect(
          entityFactory.createEntity(mockApp, entityType, source, entityId)
        ).rejects.toThrow(EntityError);
      });
    });
  });

  describe('buildEntity()', () => {
    const entityType = 'tenant';
    const source = '/test/entities/tenants/test-tenant';
    const customEntityId = 'custom-entity';
    let adapter;

    beforeEach(() => {
      adapter = entityFactory.adapters[0]; // Local adapter
      adapter.getType = vi.fn().mockReturnValue('local');
      adapter.loadConfig = vi.fn().mockResolvedValue({
        id: 'test-entity',
        active: true,
        source
      });
      adapter.loadResources = vi.fn().mockResolvedValue(undefined);
    });

    describe('Entity ID Generation', () => {
      test('should use custom entity ID when provided', async () => {
        const entity = await entityFactory.buildEntity(mockApp, entityType, source, adapter, customEntityId);

        expect(entity.id).toBe(customEntityId);
        expect(mockSecurityService.validateEntityId).toHaveBeenCalledWith(customEntityId, entityType);
      });

      test('should generate ID from NPM package name', async () => {
        const npmSource = 'fastify-entity-organization';
        adapter.getType.mockReturnValue('npm');

        const entity = await entityFactory.buildEntity(mockApp, entityType, npmSource, adapter);

        expect(mockSecurityService.validateEntityId).toHaveBeenCalledWith('organization', entityType);
      });

      test('should generate ID from local path basename', async () => {
        const localSource = '/entities/tenants/my-tenant';
        adapter.getType.mockReturnValue('local');

        const entity = await entityFactory.buildEntity(mockApp, entityType, localSource, adapter);

        expect(mockSecurityService.validateEntityId).toHaveBeenCalledWith('my-tenant', entityType);
      });
    });

    describe('Config Loading and Merging', () => {
      test('should merge entity definition with adapter config', async () => {
        const entityDefinition = {
          type: 'tenant',
          name: 'Tenant Entity',
          basePath: '/tenants',
          enabled: true
        };
        mockConfigManager.getEntityDefinition.mockReturnValue(entityDefinition);

        adapter.loadConfig.mockResolvedValue({
          customProperty: 'custom-value',
          active: true
        });

        const entity = await entityFactory.buildEntity(mockApp, entityType, source, adapter, customEntityId);

        expect(adapter.loadConfig).toHaveBeenCalledWith(source, {
          ...entityDefinition,
          id: customEntityId,
          name: customEntityId,
          active: true,
          source
        });
        expect(entity.config).toEqual(expect.objectContaining({
          customProperty: 'custom-value',
          active: true
        }));
      });
    });

    describe('Resource Loading', () => {
      test('should call adapter loadResources with entity context', async () => {
        const entity = await entityFactory.buildEntity(mockApp, entityType, source, adapter, customEntityId);

        expect(adapter.loadResources).toHaveBeenCalledWith(mockApp, entity);
      });
    });

    describe('Entity Context Creation', () => {
      test('should create entity context with correct properties', async () => {
        const entity = await entityFactory.buildEntity(mockApp, entityType, source, adapter, customEntityId);

        expect(entity.type).toBe(entityType);
        expect(entity.id).toBe(customEntityId);
        expect(entity.adapter).toBe(adapter);
        expect(entity.createdAt).toBeInstanceOf(Date);
        expect(entity.services).toEqual({});
        expect(entity.plugins).toBeInstanceOf(Set);
        expect(entity.routes).toBeInstanceOf(Set);
        expect(entity.schemas).toBeInstanceOf(Set);
      });
    });

    describe('Error Handling', () => {
      test('should throw EntityError with context when building fails', async () => {
        adapter.loadConfig.mockRejectedValue(new Error('Config loading failed'));

        await expect(
          entityFactory.buildEntity(mockApp, entityType, source, adapter, customEntityId)
        ).rejects.toThrow(EntityError);

        const error = await entityFactory.buildEntity(mockApp, entityType, source, adapter, customEntityId)
          .catch(err => err);
        
        expect(error.message).toContain(`Failed to build entity from ${source}`);
        expect(error.entityType).toBe(entityType);
        expect(error.entityId).toBe(customEntityId);
      });

      test('should handle security validation errors', async () => {
        mockSecurityService.validateEntityId.mockImplementation(() => {
          throw new Error('Security validation failed');
        });

        await expect(
          entityFactory.buildEntity(mockApp, entityType, source, adapter, customEntityId)
        ).rejects.toThrow(EntityError);
      });

      test('should handle adapter config loading errors', async () => {
        adapter.loadConfig.mockRejectedValue(new Error('Adapter config failed'));

        await expect(
          entityFactory.buildEntity(mockApp, entityType, source, adapter, customEntityId)
        ).rejects.toThrow(EntityError);
      });

      test('should handle adapter resource loading errors', async () => {
        adapter.loadResources.mockRejectedValue(new Error('Resource loading failed'));

        await expect(
          entityFactory.buildEntity(mockApp, entityType, source, adapter, customEntityId)
        ).rejects.toThrow(EntityError);
      });
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle multiple entity types with different adapters', async () => {
      // Setup different entity types
      const tenantDefinition = {
        type: 'tenant',
        name: 'Tenant',
        enabled: true
      };
      const userDefinition = {
        type: 'user', 
        name: 'User',
        enabled: true
      };

      mockConfigManager.getEntityDefinition
        .mockReturnValueOnce(tenantDefinition)
        .mockReturnValueOnce(userDefinition);

      // Tenant uses local adapter
      entityFactory.adapters[0].canHandle = vi.fn()
        .mockResolvedValueOnce(true)  // For tenant
        .mockResolvedValueOnce(false); // For user
      entityFactory.adapters[0].loadConfig = vi.fn().mockResolvedValue({
        id: 'local-tenant',
        active: true,
        source: '/tenants/local-tenant'
      });
      entityFactory.adapters[0].loadResources = vi.fn().mockResolvedValue(undefined);

      // User uses NPM adapter
      entityFactory.adapters[1].canHandle = vi.fn()
        .mockResolvedValueOnce(true); // For user
      entityFactory.adapters[1].loadConfig = vi.fn().mockResolvedValue({
        id: 'npm-user',
        active: true,
        source: 'fastify-entity-user'
      });
      entityFactory.adapters[1].loadResources = vi.fn().mockResolvedValue(undefined);

      const tenantEntity = await entityFactory.createEntity(mockApp, 'tenant', '/tenants/local-tenant');
      const userEntity = await entityFactory.createEntity(mockApp, 'user', 'fastify-entity-user');

      expect(tenantEntity.adapter).toBe(entityFactory.adapters[0]);
      expect(userEntity.adapter).toBe(entityFactory.adapters[1]);
    });

    test('should handle entity creation with complex configurations', async () => {
      const complexDefinition = {
        type: 'organization',
        name: 'Organization',
        parent: 'tenant',
        maxInstances: 50,
        routePrefix: '/orgs/{entityId}',
        resourceLoading: {
          schemas: true,
          services: false,
          plugins: true,
          routes: true
        },
        mergeStrategy: 'extend',
        security: {
          authentication: 'required',
          isolation: 'strict'
        }
      };

      mockConfigManager.getEntityDefinition.mockReturnValue(complexDefinition);

      entityFactory.adapters[0].canHandle = vi.fn().mockResolvedValue(true);
      entityFactory.adapters[0].loadConfig = vi.fn().mockImplementation(async (source, defaults) => {
        return {
          ...defaults,  // Merge entity definition properties
          id: 'complex-org',
          active: true,
          source: '/orgs/complex-org',
          customConfig: { environment: 'production' }
        };
      });
      entityFactory.adapters[0].loadResources = vi.fn().mockResolvedValue(undefined);

      const entity = await entityFactory.createEntity(mockApp, 'organization', '/orgs/complex-org');

      expect(entity.config).toEqual(expect.objectContaining({
        type: 'organization',
        parent: 'tenant',
        maxInstances: 50,
        customConfig: { environment: 'production' }
      }));
      expect(entity.metadata.parent).toBe('tenant');
      expect(entity.metadata.mergeStrategy).toBe('extend');
    });

    test('should handle concurrent entity creation', async () => {
      entityFactory.adapters[0].canHandle = vi.fn().mockResolvedValue(true);
      entityFactory.adapters[0].loadConfig = vi.fn()
        .mockResolvedValueOnce({ id: 'entity1', active: true, source: '/entity1' })
        .mockResolvedValueOnce({ id: 'entity2', active: true, source: '/entity2' })
        .mockResolvedValueOnce({ id: 'entity3', active: true, source: '/entity3' });
      entityFactory.adapters[0].loadResources = vi.fn().mockResolvedValue(undefined);

      const entities = await Promise.all([
        entityFactory.createEntity(mockApp, 'tenant', '/entity1'),
        entityFactory.createEntity(mockApp, 'tenant', '/entity2'),
        entityFactory.createEntity(mockApp, 'tenant', '/entity3')
      ]);

      expect(entities).toHaveLength(3);
      expect(entities[0].id).toBe('entity1');
      expect(entities[1].id).toBe('entity2');
      expect(entities[2].id).toBe('entity3');
    });
  });
});