import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { EntityRegistry, EntityError, EntityContext } from '../../../main.mjs';
import { MockFactories } from '../../helpers/mock-factories.mjs';

describe('EntityRegistry', () => {
  let entityRegistry;
  let mockLogger;
  let mockConfigManager;
  let cleanupEnv;

  beforeEach(() => {
    mockLogger = MockFactories.createMockLogger();
    
    mockConfigManager = {
      getEntityDefinition: vi.fn().mockReturnValue({
        type: 'tenant',
        name: 'Tenant',
        maxInstances: 100
      })
    };

    entityRegistry = new EntityRegistry(mockLogger, mockConfigManager);
    
    cleanupEnv = MockFactories.setupMockEnv();
  });

  afterEach(() => {
    cleanupEnv?.();
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with dependencies and empty state', () => {
      expect(entityRegistry.logger).toBe(mockLogger);
      expect(entityRegistry.configManager).toBe(mockConfigManager);
      expect(entityRegistry.entities).toBeInstanceOf(Map);
      expect(entityRegistry.entities.size).toBe(0);
      expect(entityRegistry.entityStats).toEqual({
        loaded: 0,
        failed: 0,
        reloaded: 0
      });
    });
  });

  describe('getEntityKey()', () => {
    test('should generate correct entity key', () => {
      const key = entityRegistry.getEntityKey('tenant', 'test-tenant');
      expect(key).toBe('tenant:test-tenant');
    });

    test('should handle different entity types', () => {
      const tenantKey = entityRegistry.getEntityKey('tenant', 'tenant123');
      const userKey = entityRegistry.getEntityKey('user', 'user456');
      const orgKey = entityRegistry.getEntityKey('organization', 'org789');
      
      expect(tenantKey).toBe('tenant:tenant123');
      expect(userKey).toBe('user:user456');
      expect(orgKey).toBe('organization:org789');
    });

    test('should handle special characters in entity IDs', () => {
      const key = entityRegistry.getEntityKey('tenant', 'tenant-with_special.chars');
      expect(key).toBe('tenant:tenant-with_special.chars');
    });
  });

  describe('register()', () => {
    let mockEntityContext;

    beforeEach(() => {
      mockEntityContext = new EntityContext(
        'tenant',
        'test-tenant',
        MockFactories.createMockEntityConfig({
          id: 'test-tenant',
          active: true
        }),
        null
      );
    });

    describe('Successful Registration', () => {
      test('should register entity successfully', () => {
        entityRegistry.register(mockEntityContext);

        expect(entityRegistry.entities.size).toBe(1);
        expect(entityRegistry.entities.has('tenant:test-tenant')).toBe(true);
        expect(entityRegistry.entities.get('tenant:test-tenant')).toBe(mockEntityContext);
        expect(entityRegistry.entityStats.loaded).toBe(1);
        expect(mockLogger.info).toHaveBeenCalledWith("📂 Entity 'tenant:test-tenant' registered in registry");
      });

      test('should allow multiple entities of same type', () => {
        const entity1 = new EntityContext('tenant', 'tenant1', MockFactories.createMockEntityConfig(), null);
        const entity2 = new EntityContext('tenant', 'tenant2', MockFactories.createMockEntityConfig(), null);

        entityRegistry.register(entity1);
        entityRegistry.register(entity2);

        expect(entityRegistry.entities.size).toBe(2);
        expect(entityRegistry.entityStats.loaded).toBe(2);
      });

      test('should allow entities of different types', () => {
        const tenantEntity = new EntityContext('tenant', 'tenant1', MockFactories.createMockEntityConfig(), null);
        const userEntity = new EntityContext('user', 'user1', MockFactories.createMockEntityConfig(), null);

        mockConfigManager.getEntityDefinition
          .mockReturnValueOnce({ maxInstances: 100 })
          .mockReturnValueOnce({ maxInstances: 1000 });

        entityRegistry.register(tenantEntity);
        entityRegistry.register(userEntity);

        expect(entityRegistry.entities.size).toBe(2);
        expect(entityRegistry.entities.has('tenant:tenant1')).toBe(true);
        expect(entityRegistry.entities.has('user:user1')).toBe(true);
      });

      test('should overwrite entity with same type and ID', () => {
        const entity1 = new EntityContext('tenant', 'same-id', { version: 1 }, null);
        const entity2 = new EntityContext('tenant', 'same-id', { version: 2 }, null);

        entityRegistry.register(entity1);
        entityRegistry.register(entity2);

        expect(entityRegistry.entities.size).toBe(1);
        expect(entityRegistry.entities.get('tenant:same-id')).toBe(entity2);
        expect(entityRegistry.entityStats.loaded).toBe(2); // Both registrations count
      });
    });

    describe('Entity Limits', () => {
      test('should enforce maxInstances limit per entity type', () => {
        mockConfigManager.getEntityDefinition.mockReturnValue({
          maxInstances: 2
        });

        const entity1 = new EntityContext('tenant', 'tenant1', MockFactories.createMockEntityConfig(), null);
        const entity2 = new EntityContext('tenant', 'tenant2', MockFactories.createMockEntityConfig(), null);
        const entity3 = new EntityContext('tenant', 'tenant3', MockFactories.createMockEntityConfig(), null);

        entityRegistry.register(entity1);
        entityRegistry.register(entity2);

        expect(() => entityRegistry.register(entity3)).toThrow(EntityError);
        expect(() => entityRegistry.register(entity3)).toThrow(
          'Maximum number of tenant entities (2) reached'
        );
      });

      test('should count entities per type independently', () => {
        mockConfigManager.getEntityDefinition
          .mockReturnValueOnce({ maxInstances: 1 }) // tenant
          .mockReturnValueOnce({ maxInstances: 1 }); // user

        const tenantEntity = new EntityContext('tenant', 'tenant1', MockFactories.createMockEntityConfig(), null);
        const userEntity = new EntityContext('user', 'user1', MockFactories.createMockEntityConfig(), null);

        entityRegistry.register(tenantEntity);
        entityRegistry.register(userEntity);

        expect(entityRegistry.entities.size).toBe(2);
      });

      test('should handle undefined maxInstances gracefully', () => {
        mockConfigManager.getEntityDefinition.mockReturnValue({
          // No maxInstances defined
        });

        // Should default to 100
        for (let i = 0; i < 105; i++) {
          const entity = new EntityContext('tenant', `tenant${i}`, MockFactories.createMockEntityConfig(), null);
          
          if (i < 100) {
            entityRegistry.register(entity);
          } else {
            expect(() => entityRegistry.register(entity)).toThrow(EntityError);
          }
        }
      });
    });

    describe('Entity Error Context', () => {
      test('should include entity context in limit error', () => {
        mockConfigManager.getEntityDefinition.mockReturnValue({
          maxInstances: 1
        });

        const entity1 = new EntityContext('tenant', 'tenant1', MockFactories.createMockEntityConfig(), null);
        const entity2 = new EntityContext('tenant', 'tenant2', MockFactories.createMockEntityConfig(), null);

        entityRegistry.register(entity1);

        try {
          entityRegistry.register(entity2);
        } catch (error) {
          expect(error).toBeInstanceOf(EntityError);
          expect(error.entityType).toBe('tenant');
          expect(error.entityId).toBe('tenant2');
        }
      });
    });
  });

  describe('unregister()', () => {
    beforeEach(() => {
      // Register some test entities
      const entity1 = new EntityContext('tenant', 'tenant1', MockFactories.createMockEntityConfig(), null);
      const entity2 = new EntityContext('user', 'user1', MockFactories.createMockEntityConfig(), null);
      
      mockConfigManager.getEntityDefinition.mockReturnValue({ maxInstances: 100 });
      entityRegistry.register(entity1);
      entityRegistry.register(entity2);
    });

    test('should unregister existing entity', () => {
      const success = entityRegistry.unregister('tenant', 'tenant1');

      expect(success).toBe(true);
      expect(entityRegistry.entities.has('tenant:tenant1')).toBe(false);
      expect(entityRegistry.entities.size).toBe(1); // user1 still exists
      expect(mockLogger.info).toHaveBeenCalledWith("📂 Entity 'tenant:tenant1' unregistered from registry");
    });

    test('should return false for non-existent entity', () => {
      const success = entityRegistry.unregister('tenant', 'nonexistent');

      expect(success).toBe(false);
      expect(entityRegistry.entities.size).toBe(2); // No change
      expect(mockLogger.info).not.toHaveBeenCalledWith(
        expect.stringContaining("unregistered")
      );
    });

    test('should handle unregistering same entity multiple times', () => {
      const success1 = entityRegistry.unregister('tenant', 'tenant1');
      const success2 = entityRegistry.unregister('tenant', 'tenant1');

      expect(success1).toBe(true);
      expect(success2).toBe(false);
      expect(entityRegistry.entities.size).toBe(1);
    });
  });

  describe('getEntity()', () => {
    beforeEach(() => {
      const entity = new EntityContext('tenant', 'test-tenant', MockFactories.createMockEntityConfig(), null);
      mockConfigManager.getEntityDefinition.mockReturnValue({ maxInstances: 100 });
      entityRegistry.register(entity);
    });

    test('should return existing entity', () => {
      const entity = entityRegistry.getEntity('tenant', 'test-tenant');

      expect(entity).toBeDefined();
      expect(entity.type).toBe('tenant');
      expect(entity.id).toBe('test-tenant');
    });

    test('should return null for non-existent entity', () => {
      const entity = entityRegistry.getEntity('tenant', 'nonexistent');

      expect(entity).toBeNull();
    });

    test('should return null for wrong entity type', () => {
      const entity = entityRegistry.getEntity('user', 'test-tenant');

      expect(entity).toBeNull();
    });
  });

  describe('getAllEntities()', () => {
    test('should return empty array when no entities registered', () => {
      const entities = entityRegistry.getAllEntities();

      expect(entities).toEqual([]);
    });

    test('should return all registered entities', () => {
      const entity1 = new EntityContext('tenant', 'tenant1', MockFactories.createMockEntityConfig(), null);
      const entity2 = new EntityContext('user', 'user1', MockFactories.createMockEntityConfig(), null);
      const entity3 = new EntityContext('tenant', 'tenant2', MockFactories.createMockEntityConfig(), null);

      mockConfigManager.getEntityDefinition.mockReturnValue({ maxInstances: 100 });
      entityRegistry.register(entity1);
      entityRegistry.register(entity2);
      entityRegistry.register(entity3);

      const entities = entityRegistry.getAllEntities();

      expect(entities).toHaveLength(3);
      expect(entities).toContain(entity1);
      expect(entities).toContain(entity2);
      expect(entities).toContain(entity3);
    });

    test('should return array of entity contexts', () => {
      const entity = new EntityContext('tenant', 'test-tenant', MockFactories.createMockEntityConfig(), null);
      mockConfigManager.getEntityDefinition.mockReturnValue({ maxInstances: 100 });
      entityRegistry.register(entity);

      const entities = entityRegistry.getAllEntities();

      expect(entities[0]).toBeInstanceOf(EntityContext);
    });
  });

  describe('getEntitiesByType()', () => {
    beforeEach(() => {
      const tenant1 = new EntityContext('tenant', 'tenant1', MockFactories.createMockEntityConfig(), null);
      const tenant2 = new EntityContext('tenant', 'tenant2', MockFactories.createMockEntityConfig(), null);
      const user1 = new EntityContext('user', 'user1', MockFactories.createMockEntityConfig(), null);

      mockConfigManager.getEntityDefinition.mockReturnValue({ maxInstances: 100 });
      entityRegistry.register(tenant1);
      entityRegistry.register(tenant2);
      entityRegistry.register(user1);
    });

    test('should return entities of specified type', () => {
      const tenantEntities = entityRegistry.getEntitiesByType('tenant');

      expect(tenantEntities).toHaveLength(2);
      expect(tenantEntities.every(e => e.type === 'tenant')).toBe(true);
      expect(tenantEntities.map(e => e.id)).toContain('tenant1');
      expect(tenantEntities.map(e => e.id)).toContain('tenant2');
    });

    test('should return empty array for non-existent type', () => {
      const entities = entityRegistry.getEntitiesByType('nonexistent');

      expect(entities).toEqual([]);
    });

    test('should return empty array when no entities of type exist', () => {
      const entities = entityRegistry.getEntitiesByType('organization');

      expect(entities).toEqual([]);
    });
  });

  describe('getActiveEntities()', () => {
    beforeEach(() => {
      const activeEntity = new EntityContext('tenant', 'active', 
        MockFactories.createMockEntityConfig({ active: true }), null);
      const inactiveEntity = new EntityContext('tenant', 'inactive', 
        MockFactories.createMockEntityConfig({ active: false }), null);

      mockConfigManager.getEntityDefinition.mockReturnValue({ maxInstances: 100 });
      entityRegistry.register(activeEntity);
      entityRegistry.register(inactiveEntity);
    });

    test('should return only active entities', () => {
      const activeEntities = entityRegistry.getActiveEntities();

      expect(activeEntities).toHaveLength(1);
      expect(activeEntities[0].id).toBe('active');
      expect(activeEntities[0].active).toBe(true);
    });

    test('should return empty array when no active entities', () => {
      // Unregister the active entity or make all inactive
      entityRegistry.unregister('tenant', 'active');
      
      const activeEntities = entityRegistry.getActiveEntities();

      expect(activeEntities).toEqual([]);
    });
  });

  describe('getStats()', () => {
    describe('Empty Registry', () => {
      test('should return empty stats for empty registry', () => {
        const stats = entityRegistry.getStats();

        expect(stats).toEqual({
          total: 0,
          active: 0,
          inactive: 0,
          byType: {},
          servicesLoaded: 0,
          history: {
            loaded: 0,
            failed: 0,
            reloaded: 0
          }
        });
      });
    });

    describe('Registry with Entities', () => {
      beforeEach(() => {
        // Create entities with services
        const tenant1 = new EntityContext('tenant', 'tenant1', 
          MockFactories.createMockEntityConfig({ active: true }), null);
        tenant1.addService('userService', {});
        tenant1.addService('authService', {});

        const tenant2 = new EntityContext('tenant', 'tenant2', 
          MockFactories.createMockEntityConfig({ active: false }), null);
        tenant2.addService('userService', {});

        const user1 = new EntityContext('user', 'user1', 
          MockFactories.createMockEntityConfig({ active: true }), null);
        user1.addService('profileService', {});

        mockConfigManager.getEntityDefinition.mockReturnValue({ maxInstances: 100 });
        entityRegistry.register(tenant1);
        entityRegistry.register(tenant2);
        entityRegistry.register(user1);

        // Simulate some history
        entityRegistry.entityStats.failed = 2;
        entityRegistry.entityStats.reloaded = 1;
      });

      test('should calculate correct overall stats', () => {
        const stats = entityRegistry.getStats();

        expect(stats.total).toBe(3);
        expect(stats.active).toBe(2);
        expect(stats.inactive).toBe(1);
        expect(stats.servicesLoaded).toBe(4); // 2 + 1 + 1
      });

      test('should calculate correct stats by type', () => {
        const stats = entityRegistry.getStats();

        expect(stats.byType.tenant).toEqual({
          total: 2,
          active: 1,
          inactive: 1,
          services: 3 // 2 + 1
        });

        expect(stats.byType.user).toEqual({
          total: 1,
          active: 1,
          inactive: 0,
          services: 1
        });
      });

      test('should include historical stats', () => {
        const stats = entityRegistry.getStats();

        expect(stats.history).toEqual({
          loaded: 3, // Current loaded count
          failed: 2,
          reloaded: 1
        });
      });

      test('should handle entities with no services', () => {
        const emptyEntity = new EntityContext('organization', 'org1', 
          MockFactories.createMockEntityConfig({ active: true }), null);
        
        entityRegistry.register(emptyEntity);

        const stats = entityRegistry.getStats();

        expect(stats.byType.organization).toEqual({
          total: 1,
          active: 1,
          inactive: 0,
          services: 0
        });
      });
    });

    describe('Dynamic Stats Updates', () => {
      test('should update stats when entities are registered and unregistered', () => {
        const entity = new EntityContext('tenant', 'dynamic', 
          MockFactories.createMockEntityConfig({ active: true }), null);
        entity.addService('testService', {});

        mockConfigManager.getEntityDefinition.mockReturnValue({ maxInstances: 100 });

        // Initial state
        let stats = entityRegistry.getStats();
        expect(stats.total).toBe(0);

        // After registration
        entityRegistry.register(entity);
        stats = entityRegistry.getStats();
        expect(stats.total).toBe(1);
        expect(stats.servicesLoaded).toBe(1);

        // After unregistration
        entityRegistry.unregister('tenant', 'dynamic');
        stats = entityRegistry.getStats();
        expect(stats.total).toBe(0);
        expect(stats.servicesLoaded).toBe(0);
      });

      test('should track loaded count correctly', () => {
        const entity1 = new EntityContext('tenant', 'tenant1', MockFactories.createMockEntityConfig(), null);
        const entity2 = new EntityContext('tenant', 'tenant2', MockFactories.createMockEntityConfig(), null);

        mockConfigManager.getEntityDefinition.mockReturnValue({ maxInstances: 100 });

        entityRegistry.register(entity1);
        entityRegistry.register(entity2);

        const stats = entityRegistry.getStats();
        expect(stats.history.loaded).toBe(2);
      });
    });
  });

  describe('Complex Registry Operations', () => {
    test('should handle large numbers of entities efficiently', () => {
      const startTime = Date.now();
      
      // Register 1000 entities
      mockConfigManager.getEntityDefinition.mockReturnValue({ maxInstances: 2000 });
      
      for (let i = 0; i < 1000; i++) {
        const entity = new EntityContext(`tenant`, `tenant${i}`, 
          MockFactories.createMockEntityConfig({ active: i % 2 === 0 }), null);
        entity.addService('service1', {});
        entityRegistry.register(entity);
      }

      const registrationTime = Date.now() - startTime;
      
      // Basic performance check (should be reasonably fast)
      expect(registrationTime).toBeLessThan(1000); // Less than 1 second

      const stats = entityRegistry.getStats();
      expect(stats.total).toBe(1000);
      expect(stats.active).toBe(500); // Half are active
      expect(stats.inactive).toBe(500);
      expect(stats.servicesLoaded).toBe(1000);
    });

    test('should maintain data integrity during concurrent operations', () => {
      const entities = [];
      mockConfigManager.getEntityDefinition.mockReturnValue({ maxInstances: 100 });

      // Create 10 entities
      for (let i = 0; i < 10; i++) {
        const entity = new EntityContext('tenant', `concurrent${i}`, MockFactories.createMockEntityConfig(), null);
        entities.push(entity);
        entityRegistry.register(entity);
      }

      // Verify all are registered
      expect(entityRegistry.entities.size).toBe(10);

      // Unregister half
      for (let i = 0; i < 5; i++) {
        entityRegistry.unregister('tenant', `concurrent${i}`);
      }

      // Verify correct count
      expect(entityRegistry.entities.size).toBe(5);
      expect(entityRegistry.getEntitiesByType('tenant')).toHaveLength(5);

      // Get remaining entities
      const remaining = entityRegistry.getAllEntities();
      const remainingIds = remaining.map(e => e.id).sort();
      const expectedIds = ['concurrent5', 'concurrent6', 'concurrent7', 'concurrent8', 'concurrent9'];
      
      expect(remainingIds).toEqual(expectedIds);
    });

    test('should handle entity replacement correctly', () => {
      mockConfigManager.getEntityDefinition.mockReturnValue({ maxInstances: 100 });

      const entity1 = new EntityContext('tenant', 'replaceable', 
        MockFactories.createMockEntityConfig({ version: 1 }), null);
      entity1.addService('oldService', {});
      
      const entity2 = new EntityContext('tenant', 'replaceable', 
        MockFactories.createMockEntityConfig({ version: 2 }), null);
      entity2.addService('newService', {});

      entityRegistry.register(entity1);
      expect(entityRegistry.getEntity('tenant', 'replaceable').config.version).toBe(1);

      entityRegistry.register(entity2);
      expect(entityRegistry.getEntity('tenant', 'replaceable').config.version).toBe(2);
      expect(entityRegistry.entities.size).toBe(1);
      expect(entityRegistry.entityStats.loaded).toBe(2); // Both registrations count
    });
  });
});