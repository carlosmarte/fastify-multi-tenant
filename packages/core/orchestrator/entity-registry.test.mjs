import { describe, test, expect, beforeEach, vi } from 'vitest';
import { EntityRegistry } from './entity-registry.mjs';
import { EntityError } from '@thinkeloquent/core-exceptions';

describe('EntityRegistry', () => {
  let registry;
  let mockLogger;
  let mockConfigManager;
  let mockEntityContext;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    };

    mockConfigManager = {
      getEntityDefinition: vi.fn()
    };

    registry = new EntityRegistry(mockLogger, mockConfigManager);

    mockEntityContext = {
      type: 'tenant',
      id: 'tenant-123',
      active: true,
      listServices: vi.fn(() => ['service1', 'service2'])
    };
  });

  describe('Constructor', () => {
    test('should initialize with correct defaults', () => {
      expect(registry.logger).toBe(mockLogger);
      expect(registry.configManager).toBe(mockConfigManager);
      expect(registry.entities).toBeInstanceOf(Map);
      expect(registry.entities.size).toBe(0);
      expect(registry.entityStats).toEqual({
        loaded: 0,
        failed: 0,
        reloaded: 0
      });
    });
  });

  describe('getEntityKey()', () => {
    test('should return correct entity key', () => {
      const key = registry.getEntityKey('tenant', 'abc-123');
      expect(key).toBe('tenant:abc-123');
    });

    test('should handle special characters in IDs', () => {
      const key = registry.getEntityKey('user', 'user@example.com');
      expect(key).toBe('user:user@example.com');
    });
  });

  describe('register()', () => {
    test('should successfully register an entity', () => {
      mockConfigManager.getEntityDefinition.mockReturnValue({ maxInstances: 100 });

      registry.register(mockEntityContext);

      expect(registry.entities.size).toBe(1);
      expect(registry.entities.get('tenant:tenant-123')).toBe(mockEntityContext);
      expect(registry.entityStats.loaded).toBe(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        "📂 Entity 'tenant:tenant-123' registered in registry"
      );
    });

    test('should enforce maxInstances limit', () => {
      mockConfigManager.getEntityDefinition.mockReturnValue({ maxInstances: 2 });

      registry.register({ type: 'tenant', id: '1', listServices: vi.fn() });
      registry.register({ type: 'tenant', id: '2', listServices: vi.fn() });

      expect(() => {
        registry.register({ type: 'tenant', id: '3', listServices: vi.fn() });
      }).toThrow(EntityError);
    });

    test('should use default maxInstances when not configured', () => {
      mockConfigManager.getEntityDefinition.mockReturnValue(null);

      for (let i = 0; i < 100; i++) {
        registry.register({
          type: 'tenant',
          id: `tenant-${i}`,
          listServices: vi.fn()
        });
      }

      expect(() => {
        registry.register({ type: 'tenant', id: 'tenant-101', listServices: vi.fn() });
      }).toThrow(EntityError);
    });

    test('should allow different entity types to have separate limits', () => {
      mockConfigManager.getEntityDefinition.mockImplementation((type) => {
        if (type === 'tenant') return { maxInstances: 2 };
        if (type === 'user') return { maxInstances: 3 };
        return null;
      });

      registry.register({ type: 'tenant', id: '1', listServices: vi.fn() });
      registry.register({ type: 'tenant', id: '2', listServices: vi.fn() });
      registry.register({ type: 'user', id: '1', listServices: vi.fn() });
      registry.register({ type: 'user', id: '2', listServices: vi.fn() });
      registry.register({ type: 'user', id: '3', listServices: vi.fn() });

      expect(registry.entities.size).toBe(5);
    });
  });

  describe('unregister()', () => {
    beforeEach(() => {
      mockConfigManager.getEntityDefinition.mockReturnValue({ maxInstances: 100 });
      registry.register(mockEntityContext);
    });

    test('should successfully unregister an existing entity', () => {
      const result = registry.unregister('tenant', 'tenant-123');

      expect(result).toBe(true);
      expect(registry.entities.size).toBe(0);
      expect(mockLogger.info).toHaveBeenCalledWith(
        "📂 Entity 'tenant:tenant-123' unregistered from registry"
      );
    });

    test('should return false when unregistering non-existent entity', () => {
      const result = registry.unregister('tenant', 'non-existent');

      expect(result).toBe(false);
      expect(registry.entities.size).toBe(1);
      expect(mockLogger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('unregistered')
      );
    });
  });

  describe('getEntity()', () => {
    beforeEach(() => {
      mockConfigManager.getEntityDefinition.mockReturnValue({ maxInstances: 100 });
      registry.register(mockEntityContext);
    });

    test('should return entity when it exists', () => {
      const entity = registry.getEntity('tenant', 'tenant-123');
      expect(entity).toBe(mockEntityContext);
    });

    test('should return null when entity does not exist', () => {
      const entity = registry.getEntity('tenant', 'non-existent');
      expect(entity).toBeNull();
    });
  });

  describe('getAllEntities()', () => {
    test('should return empty array when no entities', () => {
      const entities = registry.getAllEntities();
      expect(entities).toEqual([]);
    });

    test('should return all registered entities', () => {
      mockConfigManager.getEntityDefinition.mockReturnValue({ maxInstances: 100 });

      const entity1 = { type: 'tenant', id: '1', listServices: vi.fn() };
      const entity2 = { type: 'user', id: '2', listServices: vi.fn() };

      registry.register(entity1);
      registry.register(entity2);

      const entities = registry.getAllEntities();
      expect(entities).toHaveLength(2);
      expect(entities).toContain(entity1);
      expect(entities).toContain(entity2);
    });
  });

  describe('getEntitiesByType()', () => {
    beforeEach(() => {
      mockConfigManager.getEntityDefinition.mockReturnValue({ maxInstances: 100 });

      registry.register({ type: 'tenant', id: '1', listServices: vi.fn() });
      registry.register({ type: 'tenant', id: '2', listServices: vi.fn() });
      registry.register({ type: 'user', id: '1', listServices: vi.fn() });
    });

    test('should return entities of specified type', () => {
      const tenants = registry.getEntitiesByType('tenant');
      expect(tenants).toHaveLength(2);
      expect(tenants.every(e => e.type === 'tenant')).toBe(true);
    });

    test('should return empty array for non-existent type', () => {
      const entities = registry.getEntitiesByType('non-existent');
      expect(entities).toEqual([]);
    });
  });

  describe('getActiveEntities()', () => {
    beforeEach(() => {
      mockConfigManager.getEntityDefinition.mockReturnValue({ maxInstances: 100 });

      registry.register({ type: 'tenant', id: '1', active: true, listServices: vi.fn() });
      registry.register({ type: 'tenant', id: '2', active: false, listServices: vi.fn() });
      registry.register({ type: 'user', id: '1', active: true, listServices: vi.fn() });
    });

    test('should return only active entities', () => {
      const activeEntities = registry.getActiveEntities();

      expect(activeEntities).toHaveLength(2);
      expect(activeEntities.every(e => e.active === true)).toBe(true);
    });
  });

  describe('getStats()', () => {
    test('should return correct stats for empty registry', () => {
      const stats = registry.getStats();

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

    test('should return correct stats for populated registry', () => {
      mockConfigManager.getEntityDefinition.mockReturnValue({ maxInstances: 100 });

      registry.register({
        type: 'tenant',
        id: '1',
        active: true,
        listServices: vi.fn(() => ['s1', 's2'])
      });

      registry.register({
        type: 'tenant',
        id: '2',
        active: false,
        listServices: vi.fn(() => ['s3'])
      });

      registry.register({
        type: 'user',
        id: '1',
        active: true,
        listServices: vi.fn(() => ['s4', 's5', 's6'])
      });

      const stats = registry.getStats();

      expect(stats).toEqual({
        total: 3,
        active: 2,
        inactive: 1,
        byType: {
          tenant: {
            total: 2,
            active: 1,
            inactive: 1,
            services: 3
          },
          user: {
            total: 1,
            active: 1,
            inactive: 0,
            services: 3
          }
        },
        servicesLoaded: 6,
        history: {
          loaded: 3,
          failed: 0,
          reloaded: 0
        }
      });
    });

    test('should correctly track history stats', () => {
      mockConfigManager.getEntityDefinition.mockReturnValue({ maxInstances: 100 });

      registry.register({ type: 'tenant', id: '1', listServices: vi.fn(() => []) });
      registry.entityStats.failed = 2;
      registry.entityStats.reloaded = 5;

      const stats = registry.getStats();

      expect(stats.history).toEqual({
        loaded: 1,
        failed: 2,
        reloaded: 5
      });
    });
  });
});