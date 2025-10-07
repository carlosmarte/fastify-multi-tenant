import { describe, test, expect, beforeEach, vi } from 'vitest';
import { EntityFactory } from './entity-factory.mjs';
import { EntityError } from '@thinkeloquent/core-exceptions';
import { HierarchicalResourceStrategy } from '@thinkeloquent/core-loading-strategy';
import { EntityContext, LocalEntityAdapter, NPMEntityAdapter } from '@thinkeloquent/core-entities';
import path from 'path';

vi.mock('@thinkeloquent/core-loading-strategy', () => ({
  HierarchicalResourceStrategy: vi.fn()
}));

vi.mock('@thinkeloquent/core-entities', () => ({
  EntityContext: vi.fn(),
  LocalEntityAdapter: vi.fn(),
  NPMEntityAdapter: vi.fn()
}));

describe('EntityFactory', () => {
  let entityFactory;
  let mockLogger;
  let mockPathResolver;
  let mockResourceLoader;
  let mockSecurityService;
  let mockConfigManager;
  let mockApp;
  let mockLocalAdapter;
  let mockNPMAdapter;
  let mockLoadingStrategy;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    };

    mockPathResolver = {
      resolve: vi.fn((p) => p)
    };

    mockResourceLoader = {
      loadResource: vi.fn()
    };

    mockSecurityService = {
      validateEntityId: vi.fn((id) => id)
    };

    mockConfigManager = {
      getEntityDefinition: vi.fn()
    };

    mockApp = {
      register: vi.fn()
    };

    mockLoadingStrategy = {
      load: vi.fn()
    };

    mockLocalAdapter = {
      canHandle: vi.fn(),
      loadConfig: vi.fn(),
      loadResources: vi.fn(),
      getType: vi.fn(() => 'local')
    };

    mockNPMAdapter = {
      canHandle: vi.fn(),
      loadConfig: vi.fn(),
      loadResources: vi.fn(),
      getType: vi.fn(() => 'npm')
    };

    HierarchicalResourceStrategy.mockImplementation(() => mockLoadingStrategy);
    LocalEntityAdapter.mockImplementation(() => mockLocalAdapter);
    NPMEntityAdapter.mockImplementation(() => mockNPMAdapter);
    EntityContext.mockImplementation(function(type, id, config, adapter) {
      return { type, id, config, adapter };
    });

    entityFactory = new EntityFactory(
      mockLogger,
      mockPathResolver,
      mockResourceLoader,
      mockSecurityService,
      mockConfigManager
    );
  });

  describe('constructor', () => {
    test('should initialize with correct dependencies', () => {
      expect(entityFactory.logger).toBe(mockLogger);
      expect(entityFactory.securityService).toBe(mockSecurityService);
      expect(entityFactory.configManager).toBe(mockConfigManager);
      expect(entityFactory.adapters).toHaveLength(2);
    });

    test('should create HierarchicalResourceStrategy with correct parameters', () => {
      expect(HierarchicalResourceStrategy).toHaveBeenCalledWith(
        mockResourceLoader,
        mockConfigManager
      );
    });

    test('should create LocalEntityAdapter with correct parameters', () => {
      expect(LocalEntityAdapter).toHaveBeenCalledWith(
        mockLogger,
        mockPathResolver,
        mockResourceLoader,
        mockLoadingStrategy
      );
    });

    test('should create NPMEntityAdapter with correct parameters', () => {
      expect(NPMEntityAdapter).toHaveBeenCalledWith(
        mockLogger,
        mockPathResolver,
        mockResourceLoader,
        mockLoadingStrategy
      );
    });
  });

  describe('createEntity', () => {
    const entityType = 'tenant';
    const source = '/path/to/entity';
    const entityId = 'test-entity';

    beforeEach(() => {
      mockConfigManager.getEntityDefinition.mockReturnValue({
        type: entityType,
        required: false
      });
    });

    test('should throw error if entity definition not found', async () => {
      mockConfigManager.getEntityDefinition.mockReturnValue(null);

      await expect(
        entityFactory.createEntity(mockApp, entityType, source, entityId)
      ).rejects.toThrow(EntityError);

      await expect(
        entityFactory.createEntity(mockApp, entityType, source, entityId)
      ).rejects.toThrow(`Entity type '${entityType}' not defined in configuration`);
    });

    test('should use local adapter when it can handle the source', async () => {
      mockLocalAdapter.canHandle.mockResolvedValue(true);
      mockNPMAdapter.canHandle.mockResolvedValue(false);

      const mockConfig = {
        id: entityId,
        name: entityId,
        active: true,
        source
      };

      mockLocalAdapter.loadConfig.mockResolvedValue(mockConfig);
      mockLocalAdapter.loadResources.mockResolvedValue();

      const result = await entityFactory.createEntity(mockApp, entityType, source, entityId);

      expect(mockLocalAdapter.canHandle).toHaveBeenCalledWith(source);
      expect(result).toEqual({
        type: entityType,
        id: entityId,
        config: mockConfig,
        adapter: mockLocalAdapter
      });
    });

    test('should use NPM adapter when it can handle the source', async () => {
      mockLocalAdapter.canHandle.mockResolvedValue(false);
      mockNPMAdapter.canHandle.mockResolvedValue(true);

      const mockConfig = {
        id: entityId,
        name: entityId,
        active: true,
        source
      };

      mockNPMAdapter.loadConfig.mockResolvedValue(mockConfig);
      mockNPMAdapter.loadResources.mockResolvedValue();

      const result = await entityFactory.createEntity(mockApp, entityType, source, entityId);

      expect(mockNPMAdapter.canHandle).toHaveBeenCalledWith(source);
      expect(result).toEqual({
        type: entityType,
        id: entityId,
        config: mockConfig,
        adapter: mockNPMAdapter
      });
    });

    test('should throw error if no adapter can handle the source', async () => {
      mockLocalAdapter.canHandle.mockResolvedValue(false);
      mockNPMAdapter.canHandle.mockResolvedValue(false);

      await expect(
        entityFactory.createEntity(mockApp, entityType, source, entityId)
      ).rejects.toThrow(EntityError);

      await expect(
        entityFactory.createEntity(mockApp, entityType, source, entityId)
      ).rejects.toThrow(`No adapter found for entity source: ${source}`);
    });

    test('should check adapters in order', async () => {
      mockLocalAdapter.canHandle.mockResolvedValue(false);
      mockNPMAdapter.canHandle.mockResolvedValue(false);

      try {
        await entityFactory.createEntity(mockApp, entityType, source, entityId);
      } catch (e) {
        // Expected error
      }

      // Verify both adapters were called
      expect(mockLocalAdapter.canHandle).toHaveBeenCalled();
      expect(mockNPMAdapter.canHandle).toHaveBeenCalled();

      // Verify the order by checking that local adapter was called first
      const localAdapterCallOrder = mockLocalAdapter.canHandle.mock.invocationCallOrder[0];
      const npmAdapterCallOrder = mockNPMAdapter.canHandle.mock.invocationCallOrder[0];
      expect(localAdapterCallOrder).toBeLessThan(npmAdapterCallOrder);
    });
  });

  describe('buildEntity', () => {
    const entityType = 'tenant';
    const source = '/path/to/entity';
    const customEntityId = 'custom-id';

    beforeEach(() => {
      mockConfigManager.getEntityDefinition.mockReturnValue({
        type: entityType,
        required: false
      });
    });

    test('should use custom entity ID when provided', async () => {
      const mockConfig = {
        id: customEntityId,
        name: customEntityId,
        active: true,
        source
      };

      mockLocalAdapter.loadConfig.mockResolvedValue(mockConfig);
      mockLocalAdapter.loadResources.mockResolvedValue();

      const result = await entityFactory.buildEntity(
        mockApp,
        entityType,
        source,
        mockLocalAdapter,
        customEntityId
      );

      expect(mockSecurityService.validateEntityId).toHaveBeenCalledWith(
        customEntityId,
        entityType
      );
      expect(result.id).toBe(customEntityId);
    });

    test('should generate entity ID from NPM package name', async () => {
      const npmSource = 'fastify-entity-awesome-plugin';
      const expectedId = 'awesome-plugin';

      mockNPMAdapter.getType.mockReturnValue('npm');
      mockSecurityService.validateEntityId.mockReturnValue(expectedId);

      const mockConfig = {
        id: expectedId,
        name: expectedId,
        active: true,
        source: npmSource
      };

      mockNPMAdapter.loadConfig.mockResolvedValue(mockConfig);
      mockNPMAdapter.loadResources.mockResolvedValue();

      const result = await entityFactory.buildEntity(
        mockApp,
        entityType,
        npmSource,
        mockNPMAdapter,
        null
      );

      expect(mockSecurityService.validateEntityId).toHaveBeenCalledWith(
        expectedId,
        entityType
      );
      expect(result.id).toBe(expectedId);
    });

    test('should generate entity ID from path basename for local adapter', async () => {
      const localSource = '/path/to/my-entity';
      const expectedId = 'my-entity';

      mockLocalAdapter.getType.mockReturnValue('local');
      mockSecurityService.validateEntityId.mockReturnValue(expectedId);

      const mockConfig = {
        id: expectedId,
        name: expectedId,
        active: true,
        source: localSource
      };

      mockLocalAdapter.loadConfig.mockResolvedValue(mockConfig);
      mockLocalAdapter.loadResources.mockResolvedValue();

      const result = await entityFactory.buildEntity(
        mockApp,
        entityType,
        localSource,
        mockLocalAdapter,
        null
      );

      expect(mockSecurityService.validateEntityId).toHaveBeenCalledWith(
        expectedId,
        entityType
      );
      expect(result.id).toBe(expectedId);
    });

    test('should skip inactive entities', async () => {
      const mockConfig = {
        id: customEntityId,
        name: customEntityId,
        active: false,
        source
      };

      mockLocalAdapter.loadConfig.mockResolvedValue(mockConfig);

      const result = await entityFactory.buildEntity(
        mockApp,
        entityType,
        source,
        mockLocalAdapter,
        customEntityId
      );

      expect(result).toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith(
        `📦 Entity ${entityType}:${customEntityId} is inactive, skipping`
      );
      expect(mockLocalAdapter.loadResources).not.toHaveBeenCalled();
    });

    test('should create EntityContext with correct parameters', async () => {
      const mockConfig = {
        id: customEntityId,
        name: customEntityId,
        active: true,
        source
      };

      mockLocalAdapter.loadConfig.mockResolvedValue(mockConfig);
      mockLocalAdapter.loadResources.mockResolvedValue();

      await entityFactory.buildEntity(
        mockApp,
        entityType,
        source,
        mockLocalAdapter,
        customEntityId
      );

      expect(EntityContext).toHaveBeenCalledWith(
        entityType,
        customEntityId,
        mockConfig,
        mockLocalAdapter
      );
    });

    test('should load resources for active entities', async () => {
      const mockConfig = {
        id: customEntityId,
        name: customEntityId,
        active: true,
        source
      };

      mockLocalAdapter.loadConfig.mockResolvedValue(mockConfig);
      mockLocalAdapter.loadResources.mockResolvedValue();

      const result = await entityFactory.buildEntity(
        mockApp,
        entityType,
        source,
        mockLocalAdapter,
        customEntityId
      );

      expect(mockLocalAdapter.loadResources).toHaveBeenCalledWith(
        mockApp,
        expect.objectContaining({
          type: entityType,
          id: customEntityId,
          config: mockConfig,
          adapter: mockLocalAdapter
        })
      );
    });

    test('should log success message', async () => {
      const mockConfig = {
        id: customEntityId,
        name: customEntityId,
        active: true,
        source
      };

      mockLocalAdapter.loadConfig.mockResolvedValue(mockConfig);
      mockLocalAdapter.loadResources.mockResolvedValue();
      mockLocalAdapter.getType.mockReturnValue('local');

      await entityFactory.buildEntity(
        mockApp,
        entityType,
        source,
        mockLocalAdapter,
        customEntityId
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        `📦 Entity '${entityType}:${customEntityId}' (local) loaded successfully`
      );
    });

    test('should handle and throw wrapped errors', async () => {
      const errorMessage = 'Failed to load config';
      mockLocalAdapter.loadConfig.mockRejectedValue(new Error(errorMessage));

      await expect(
        entityFactory.buildEntity(
          mockApp,
          entityType,
          source,
          mockLocalAdapter,
          customEntityId
        )
      ).rejects.toThrow(EntityError);

      await expect(
        entityFactory.buildEntity(
          mockApp,
          entityType,
          source,
          mockLocalAdapter,
          customEntityId
        )
      ).rejects.toThrow(`Failed to build entity from ${source}: ${errorMessage}`);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        `❌ Failed to build entity from ${source}`
      );
    });

    test('should pass entity definition to adapter loadConfig', async () => {
      const entityDefinition = {
        type: entityType,
        required: false,
        schema: { test: 'schema' }
      };

      mockConfigManager.getEntityDefinition.mockReturnValue(entityDefinition);

      const mockConfig = {
        id: customEntityId,
        name: customEntityId,
        active: true,
        source
      };

      mockLocalAdapter.loadConfig.mockResolvedValue(mockConfig);
      mockLocalAdapter.loadResources.mockResolvedValue();

      await entityFactory.buildEntity(
        mockApp,
        entityType,
        source,
        mockLocalAdapter,
        customEntityId
      );

      expect(mockLocalAdapter.loadConfig).toHaveBeenCalledWith(
        source,
        expect.objectContaining({
          ...entityDefinition,
          id: customEntityId,
          name: customEntityId,
          active: true,
          source
        })
      );
    });

    test('should validate entity ID through security service', async () => {
      const validatedId = 'validated-id';
      mockSecurityService.validateEntityId.mockReturnValue(validatedId);

      const mockConfig = {
        id: validatedId,
        name: validatedId,
        active: true,
        source
      };

      mockLocalAdapter.loadConfig.mockResolvedValue(mockConfig);
      mockLocalAdapter.loadResources.mockResolvedValue();

      const result = await entityFactory.buildEntity(
        mockApp,
        entityType,
        source,
        mockLocalAdapter,
        customEntityId
      );

      expect(mockSecurityService.validateEntityId).toHaveBeenCalledWith(
        customEntityId,
        entityType
      );
      expect(result.id).toBe(validatedId);
    });
  });

  describe('integration scenarios', () => {
    test('should handle multiple entity creations', async () => {
      const entities = [
        { type: 'tenant', source: '/path/to/tenant1', id: 'tenant1' },
        { type: 'plugin', source: '/path/to/plugin1', id: 'plugin1' },
        { type: 'tenant', source: 'fastify-entity-tenant2', id: null }
      ];

      mockConfigManager.getEntityDefinition.mockImplementation((type) => ({
        type,
        required: false
      }));

      mockLocalAdapter.canHandle.mockImplementation((source) =>
        source.startsWith('/path')
      );

      mockNPMAdapter.canHandle.mockImplementation((source) =>
        source.startsWith('fastify-entity')
      );

      mockLocalAdapter.loadConfig.mockImplementation((source, config) =>
        Promise.resolve({ ...config, active: true })
      );

      mockNPMAdapter.loadConfig.mockImplementation((source, config) =>
        Promise.resolve({ ...config, active: true })
      );

      mockLocalAdapter.loadResources.mockResolvedValue();
      mockNPMAdapter.loadResources.mockResolvedValue();

      for (const entity of entities) {
        const result = await entityFactory.createEntity(
          mockApp,
          entity.type,
          entity.source,
          entity.id
        );

        expect(result).toBeDefined();
        expect(result.type).toBe(entity.type);
      }

      expect(mockLocalAdapter.loadResources).toHaveBeenCalledTimes(2);
      expect(mockNPMAdapter.loadResources).toHaveBeenCalledTimes(1);
    });

    test('should handle mixed success and failure scenarios', async () => {
      mockConfigManager.getEntityDefinition.mockReturnValue({
        type: 'tenant',
        required: false
      });

      mockLocalAdapter.canHandle.mockResolvedValue(true);

      const sources = [
        { source: '/path/to/success', shouldFail: false },
        { source: '/path/to/failure', shouldFail: true },
        { source: '/path/to/inactive', shouldFail: false, inactive: true }
      ];

      mockLocalAdapter.loadConfig.mockImplementation((source, config) => {
        const sourceConfig = sources.find(s => s.source === source);
        if (sourceConfig?.shouldFail) {
          return Promise.reject(new Error('Config load failed'));
        }
        return Promise.resolve({
          ...config,
          active: !sourceConfig?.inactive
        });
      });

      mockLocalAdapter.loadResources.mockResolvedValue();

      const results = [];
      for (const { source } of sources) {
        try {
          const result = await entityFactory.createEntity(
            mockApp,
            'tenant',
            source
          );
          results.push({ source, result });
        } catch (error) {
          results.push({ source, error });
        }
      }

      expect(results[0].result).toBeDefined();
      expect(results[1].error).toBeInstanceOf(EntityError);
      expect(results[2].result).toBeNull();
    });
  });
});