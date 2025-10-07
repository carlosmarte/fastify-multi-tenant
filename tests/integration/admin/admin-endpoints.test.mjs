import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { GenericEntityServer } from '../../../main.mjs';
import { MockFactories } from '../../helpers/mock-factories.mjs';
import fs from 'fs/promises';

// Mock dependencies
vi.mock('fs/promises');
vi.mock('fast-glob', () => ({
  default: vi.fn().mockResolvedValue([])
}));
vi.mock('glob', () => ({
  glob: vi.fn().mockResolvedValue([])
}));

// Mock Fastify to return a properly mocked app
vi.mock('fastify', () => ({
  default: vi.fn().mockImplementation(() => MockFactories.createMockFastifyApp())
}));

describe('Admin Endpoints Integration Tests', () => {
  let server;
  let tempDir;
  let cleanupEnv;

  beforeEach(async () => {
    tempDir = MockFactories.createTempDir();

    // Don't reassign fs methods - vi.mock handles it
    // Just set default return values
    fs.readFile.mockResolvedValue('{}');
    fs.mkdir.mockResolvedValue(undefined);
    fs.readdir.mockResolvedValue([]);
    fs.stat.mockResolvedValue({ isDirectory: () => true });

    cleanupEnv = MockFactories.setupMockEnv({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent'
    });
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
    cleanupEnv?.();
    vi.clearAllMocks();
  });

  describe('/health Endpoint', () => {
    beforeEach(async () => {
      server = new GenericEntityServer({
        server: {
          port: 3002,
          host: '0.0.0.0'
        }
      });
      await server.start();
    });

    test('should return health status with system information', async () => {
      let healthResponse;
      
      // Mock the health endpoint handler
      const healthHandler = server.app.get.mock.calls.find(
        call => call[0] === '/health'
      )[1];

      const mockRequest = MockFactories.createMockRequest();
      const mockReply = MockFactories.createMockReply();

      // Execute health check
      healthResponse = await healthHandler(mockRequest, mockReply);

      expect(healthResponse).toEqual({
        status: 'healthy',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        memory: expect.any(Object),
        entities: expect.any(Object),
        lifecycleStates: expect.any(Object),
        version: expect.any(String)
      });

      expect(healthResponse.status).toBe('healthy');
      expect(new Date(healthResponse.timestamp)).toBeInstanceOf(Date);
      expect(healthResponse.uptime).toBeGreaterThan(0);
      expect(healthResponse.memory).toHaveProperty('rss');
      expect(healthResponse.memory).toHaveProperty('heapUsed');
    });

    test('should include entity statistics in health response', async () => {
      // Register some test entities
      const mockEntity1 = { type: 'tenant', id: 'tenant1', active: true, listServices: () => ['service1'] };
      const mockEntity2 = { type: 'tenant', id: 'tenant2', active: false, listServices: () => [] };
      const mockEntity3 = { type: 'user', id: 'user1', active: true, listServices: () => ['userService'] };

      server.dependencies.entityManager.entityRegistry.entities.set('tenant:tenant1', mockEntity1);
      server.dependencies.entityManager.entityRegistry.entities.set('tenant:tenant2', mockEntity2);
      server.dependencies.entityManager.entityRegistry.entities.set('user:user1', mockEntity3);

      const healthHandler = server.app.get.mock.calls.find(
        call => call[0] === '/health'
      )[1];

      const healthResponse = await healthHandler(MockFactories.createMockRequest(), MockFactories.createMockReply());

      expect(healthResponse.entities).toEqual({
        total: 3,
        active: 2,
        inactive: 1,
        byType: {
          tenant: {
            total: 2,
            active: 1,
            inactive: 1,
            services: 1
          },
          user: {
            total: 1,
            active: 1,
            inactive: 0,
            services: 1
          }
        },
        servicesLoaded: 2,
        history: expect.any(Object)
      });
    });

    test('should include lifecycle states in health response', async () => {
      // Set some lifecycle states
      server.dependencies.entityManager.lifecycleManager.setState('tenant', 'tenant1', 'active');
      server.dependencies.entityManager.lifecycleManager.setState('tenant', 'tenant2', 'loading');
      server.dependencies.entityManager.lifecycleManager.setState('user', 'user1', 'suspended');

      const healthHandler = server.app.get.mock.calls.find(
        call => call[0] === '/health'
      )[1];

      const healthResponse = await healthHandler(MockFactories.createMockRequest(), MockFactories.createMockReply());

      expect(healthResponse.lifecycleStates).toEqual({
        tenant: {
          tenant1: 'active',
          tenant2: 'loading'
        },
        user: {
          user1: 'suspended'
        }
      });
    });

    test('should include version information', async () => {
      const originalVersion = process.env.npm_package_version;
      process.env.npm_package_version = '2.1.0';

      const healthHandler = server.app.get.mock.calls.find(
        call => call[0] === '/health'
      )[1];

      const healthResponse = await healthHandler(MockFactories.createMockRequest(), MockFactories.createMockReply());

      expect(healthResponse.version).toBe('2.1.0');

      // Restore original
      if (originalVersion) {
        process.env.npm_package_version = originalVersion;
      } else {
        delete process.env.npm_package_version;
      }
    });

    test('should default to version 1.0.0 when npm_package_version not set', async () => {
      const originalVersion = process.env.npm_package_version;
      delete process.env.npm_package_version;

      const healthHandler = server.app.get.mock.calls.find(
        call => call[0] === '/health'
      )[1];

      const healthResponse = await healthHandler(MockFactories.createMockRequest(), MockFactories.createMockReply());

      expect(healthResponse.version).toBe('1.0.0');

      // Restore original
      if (originalVersion) {
        process.env.npm_package_version = originalVersion;
      }
    });
  });

  describe('/admin/entities Endpoint', () => {
    beforeEach(async () => {
      const entityConfig = {
        entities: {
          definitions: {
            tenant: {
              name: 'Tenant Entity',
              basePath: '/tenants',
              identificationStrategy: 'subdomain',
              enabled: true,
              maxInstances: 100
            },
            user: {
              name: 'User Entity',
              basePath: '/users',
              identificationStrategy: 'path',
              enabled: true,
              maxInstances: 1000
            },
            organization: {
              name: 'Organization Entity',
              basePath: '/orgs',
              identificationStrategy: 'header',
              enabled: false,
              maxInstances: 50
            }
          }
        }
      };

      fs.readFile.mockResolvedValue(JSON.stringify(entityConfig));
      server = new GenericEntityServer({
        server: {
          port: 3002,
          host: '0.0.0.0'
        }
      });
      await server.start();
    });

    test('should return all entity types with definitions and instances', async () => {
      // Register some test entities
      const mockTenant = { 
        type: 'tenant', 
        id: 'tenant1', 
        active: true,
        toJSON: () => ({ type: 'tenant', id: 'tenant1', active: true, services: [] })
      };
      const mockUser = { 
        type: 'user', 
        id: 'user1', 
        active: true,
        toJSON: () => ({ type: 'user', id: 'user1', active: true, services: [] })
      };

      server.dependencies.entityManager.entityRegistry.entities.set('tenant:tenant1', mockTenant);
      server.dependencies.entityManager.entityRegistry.entities.set('user:user1', mockUser);

      const entitiesHandler = server.app.get.mock.calls.find(
        call => call[0] === '/admin/entities'
      )[1];

      const response = await entitiesHandler(MockFactories.createMockRequest(), MockFactories.createMockReply());

      expect(response).toEqual({
        success: true,
        data: {
          tenant: {
            definition: {
              name: 'Tenant Entity',
              basePath: '/tenants',
              identificationStrategy: 'subdomain',
              enabled: true,
              maxInstances: 100,
              type: 'tenant'
            },
            instances: [
              { type: 'tenant', id: 'tenant1', active: true, services: [] }
            ]
          },
          user: {
            definition: {
              name: 'User Entity',
              basePath: '/users',
              identificationStrategy: 'path',
              enabled: true,
              maxInstances: 1000,
              type: 'user'
            },
            instances: [
              { type: 'user', id: 'user1', active: true, services: [] }
            ]
          },
          organization: {
            definition: {
              name: 'Organization Entity',
              basePath: '/orgs',
              identificationStrategy: 'header',
              enabled: false,
              maxInstances: 50,
              type: 'organization'
            },
            instances: []
          }
        }
      });
    });

    test('should handle empty entity registry', async () => {
      const entitiesHandler = server.app.get.mock.calls.find(
        call => call[0] === '/admin/entities'
      )[1];

      const response = await entitiesHandler(MockFactories.createMockRequest(), MockFactories.createMockReply());

      expect(response.success).toBe(true);
      expect(response.data.tenant.instances).toEqual([]);
      expect(response.data.user.instances).toEqual([]);
      expect(response.data.organization.instances).toEqual([]);
    });

    test('should include both enabled and disabled entity types', async () => {
      const entitiesHandler = server.app.get.mock.calls.find(
        call => call[0] === '/admin/entities'
      )[1];

      const response = await entitiesHandler(MockFactories.createMockRequest(), MockFactories.createMockReply());

      expect(response.data.tenant.definition.enabled).toBe(true);
      expect(response.data.user.definition.enabled).toBe(true);
      expect(response.data.organization.definition.enabled).toBe(false);
    });
  });

  describe('/admin/entities/:entityType Endpoint', () => {
    beforeEach(async () => {
      const entityConfig = {
        entities: {
          definitions: {
            tenant: {
              name: 'Tenant Entity',
              enabled: true,
              basePath: '/tenants',
              identificationStrategy: 'subdomain'
            },
            user: {
              name: 'User Entity',
              enabled: true,
              basePath: '/users',
              identificationStrategy: 'header'
            }
          }
        }
      };

      fs.readFile.mockResolvedValue(JSON.stringify(entityConfig));
      server = new GenericEntityServer({
        server: {
          port: 3002,
          host: '0.0.0.0'
        }
      });
      await server.start();
    });

    test('should return entities of specified type', async () => {
      // Register test entities
      const mockTenant1 = { 
        type: 'tenant', 
        id: 'tenant1',
        toJSON: () => ({ type: 'tenant', id: 'tenant1', name: 'Tenant 1' })
      };
      const mockTenant2 = { 
        type: 'tenant', 
        id: 'tenant2',
        toJSON: () => ({ type: 'tenant', id: 'tenant2', name: 'Tenant 2' })
      };
      const mockUser1 = { 
        type: 'user', 
        id: 'user1',
        toJSON: () => ({ type: 'user', id: 'user1', name: 'User 1' })
      };

      server.dependencies.entityManager.entityRegistry.entities.set('tenant:tenant1', mockTenant1);
      server.dependencies.entityManager.entityRegistry.entities.set('tenant:tenant2', mockTenant2);
      server.dependencies.entityManager.entityRegistry.entities.set('user:user1', mockUser1);

      const entityTypeHandler = server.app.get.mock.calls.find(
        call => call[0] === '/admin/entities/:entityType'
      )[1];

      const mockRequest = MockFactories.createMockRequest({
        params: { entityType: 'tenant' }
      });
      const mockReply = MockFactories.createMockReply();

      const response = await entityTypeHandler(mockRequest, mockReply);

      expect(response).toEqual({
        success: true,
        entityType: 'tenant',
        data: [
          { type: 'tenant', id: 'tenant1', name: 'Tenant 1' },
          { type: 'tenant', id: 'tenant2', name: 'Tenant 2' }
        ],
        count: 2
      });
    });

    test('should return empty array for entity type with no instances', async () => {
      const entityTypeHandler = server.app.get.mock.calls.find(
        call => call[0] === '/admin/entities/:entityType'
      )[1];

      const mockRequest = MockFactories.createMockRequest({
        params: { entityType: 'user' }
      });

      const response = await entityTypeHandler(mockRequest, MockFactories.createMockReply());

      expect(response).toEqual({
        success: true,
        entityType: 'user',
        data: [],
        count: 0
      });
    });

    test('should handle non-existent entity type', async () => {
      const entityTypeHandler = server.app.get.mock.calls.find(
        call => call[0] === '/admin/entities/:entityType'
      )[1];

      const mockRequest = MockFactories.createMockRequest({
        params: { entityType: 'nonexistent' }
      });

      const response = await entityTypeHandler(mockRequest, MockFactories.createMockReply());

      expect(response).toEqual({
        success: true,
        entityType: 'nonexistent',
        data: [],
        count: 0
      });
    });
  });

  describe('/admin/entities/:entityType/:entityId Endpoint', () => {
    beforeEach(async () => {
      const entityConfig = {
        entities: {
          definitions: {
            tenant: {
              name: 'Tenant Entity',
              enabled: true,
              basePath: '/tenants',
              identificationStrategy: 'subdomain'
            }
          }
        }
      };

      fs.readFile.mockResolvedValue(JSON.stringify(entityConfig));
      server = new GenericEntityServer({
        server: {
          port: 3002,
          host: '0.0.0.0'
        }
      });
      await server.start();
    });

    test('should return specific entity details', async () => {
      const mockTenant = {
        type: 'tenant',
        id: 'tenant123',
        active: true,
        services: { userService: {}, authService: {} },
        plugins: new Set(['auth-plugin', 'db-plugin']),
        routes: new Set(['/dashboard', '/settings']),
        schemas: new Set(['user-schema']),
        metadata: { version: '1.0', environment: 'production' },
        toJSON: () => ({
          type: 'tenant',
          id: 'tenant123',
          active: true,
          services: ['userService', 'authService'],
          plugins: ['auth-plugin', 'db-plugin'],
          routes: ['/dashboard', '/settings'],
          schemas: ['user-schema'],
          metadata: { version: '1.0', environment: 'production' },
          createdAt: '2023-01-01T00:00:00.000Z'
        })
      };

      server.dependencies.entityManager.entityRegistry.entities.set('tenant:tenant123', mockTenant);

      const entityHandler = server.app.get.mock.calls.find(
        call => call[0] === '/admin/entities/:entityType/:entityId'
      )[1];

      const mockRequest = MockFactories.createMockRequest({
        params: { entityType: 'tenant', entityId: 'tenant123' }
      });

      const response = await entityHandler(mockRequest, MockFactories.createMockReply());

      expect(response).toEqual({
        success: true,
        data: {
          type: 'tenant',
          id: 'tenant123',
          active: true,
          services: ['userService', 'authService'],
          plugins: ['auth-plugin', 'db-plugin'],
          routes: ['/dashboard', '/settings'],
          schemas: ['user-schema'],
          metadata: { version: '1.0', environment: 'production' },
          createdAt: '2023-01-01T00:00:00.000Z'
        }
      });
    });

    test('should return 404 for non-existent entity', async () => {
      const entityHandler = server.app.get.mock.calls.find(
        call => call[0] === '/admin/entities/:entityType/:entityId'
      )[1];

      const mockRequest = MockFactories.createMockRequest({
        params: { entityType: 'tenant', entityId: 'nonexistent' }
      });
      const mockReply = MockFactories.createMockReply();

      const response = await entityHandler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(response).toEqual({
        success: false,
        error: 'Entity tenant:nonexistent not found'
      });
    });

    test('should handle entity with minimal data', async () => {
      const mockMinimalTenant = {
        type: 'tenant',
        id: 'minimal',
        active: true,
        toJSON: () => ({
          type: 'tenant',
          id: 'minimal',
          active: true,
          services: [],
          plugins: [],
          routes: [],
          schemas: []
        })
      };

      server.dependencies.entityManager.entityRegistry.entities.set('tenant:minimal', mockMinimalTenant);

      const entityHandler = server.app.get.mock.calls.find(
        call => call[0] === '/admin/entities/:entityType/:entityId'
      )[1];

      const mockRequest = MockFactories.createMockRequest({
        params: { entityType: 'tenant', entityId: 'minimal' }
      });

      const response = await entityHandler(mockRequest, MockFactories.createMockReply());

      expect(response.success).toBe(true);
      expect(response.data.id).toBe('minimal');
      expect(response.data.services).toEqual([]);
      expect(response.data.plugins).toEqual([]);
    });
  });

  describe('Admin Endpoints Integration Flow', () => {
    beforeEach(async () => {
      const entityConfig = {
        entities: {
          definitions: {
            tenant: {
              name: 'Tenant Entity',
              basePath: '/tenants',
              identificationStrategy: 'subdomain',
              enabled: true,
              maxInstances: 100,
              resourceLoading: {
                schemas: true,
                services: true,
                plugins: true,
                routes: true
              }
            },
            user: {
              name: 'User Entity',
              basePath: '/users',
              identificationStrategy: 'path',
              enabled: true,
              maxInstances: 1000
            }
          }
        }
      };

      fs.readFile.mockResolvedValue(JSON.stringify(entityConfig));
      server = new GenericEntityServer({
        server: {
          port: 3002,
          host: '0.0.0.0'
        }
      });
      await server.start();

      // Create comprehensive test entities
      const createMockEntity = (type, id, options = {}) => ({
        type,
        id,
        active: options.active !== false,
        services: options.services || {},
        plugins: new Set(options.plugins || []),
        routes: new Set(options.routes || []),
        schemas: new Set(options.schemas || []),
        metadata: options.metadata || {},
        createdAt: new Date(),
        listServices: () => Object.keys(options.services || {}),
        toJSON: () => ({
          type,
          id,
          active: options.active !== false,
          services: Object.keys(options.services || {}),
          plugins: Array.from(options.plugins || []),
          routes: Array.from(options.routes || []),
          schemas: Array.from(options.schemas || []),
          metadata: options.metadata || {},
          createdAt: new Date().toISOString()
        })
      });

      // Register test entities
      const tenant1 = createMockEntity('tenant', 'acme-corp', {
        services: { userService: {}, authService: {}, billingService: {} },
        plugins: ['auth', 'database', 'billing'],
        routes: ['/dashboard', '/settings', '/billing'],
        schemas: ['user-schema', 'billing-schema'],
        metadata: { plan: 'enterprise', region: 'us-east-1' }
      });

      const tenant2 = createMockEntity('tenant', 'startup-inc', {
        active: false,
        services: { userService: {} },
        plugins: ['auth'],
        routes: ['/dashboard'],
        schemas: ['user-schema'],
        metadata: { plan: 'basic', region: 'us-west-2' }
      });

      const user1 = createMockEntity('user', 'john-doe', {
        services: { profileService: {}, notificationService: {} },
        plugins: ['profile', 'notifications'],
        routes: ['/profile', '/notifications'],
        schemas: ['profile-schema'],
        metadata: { role: 'admin', department: 'engineering' }
      });

      const user2 = createMockEntity('user', 'jane-smith', {
        services: { profileService: {} },
        plugins: ['profile'],
        routes: ['/profile'],
        schemas: ['profile-schema'],
        metadata: { role: 'user', department: 'marketing' }
      });

      server.dependencies.entityManager.entityRegistry.entities.set('tenant:acme-corp', tenant1);
      server.dependencies.entityManager.entityRegistry.entities.set('tenant:startup-inc', tenant2);
      server.dependencies.entityManager.entityRegistry.entities.set('user:john-doe', user1);
      server.dependencies.entityManager.entityRegistry.entities.set('user:jane-smith', user2);

      // Set some lifecycle states
      server.dependencies.entityManager.lifecycleManager.setState('tenant', 'acme-corp', 'active');
      server.dependencies.entityManager.lifecycleManager.setState('tenant', 'startup-inc', 'suspended');
      server.dependencies.entityManager.lifecycleManager.setState('user', 'john-doe', 'active');
      server.dependencies.entityManager.lifecycleManager.setState('user', 'jane-smith', 'loading');

      // Update stats
      server.dependencies.entityManager.entityRegistry.entityStats.loaded = 4;
      server.dependencies.entityManager.entityRegistry.entityStats.failed = 1;
      server.dependencies.entityManager.entityRegistry.entityStats.reloaded = 2;
    });

    test('should provide complete system overview through health endpoint', async () => {
      const healthHandler = server.app.get.mock.calls.find(
        call => call[0] === '/health'
      )[1];

      const response = await healthHandler(MockFactories.createMockRequest(), MockFactories.createMockReply());

      // Comprehensive health check
      expect(response.status).toBe('healthy');
      expect(response.entities).toEqual({
        total: 4,
        active: 3,
        inactive: 1,
        byType: {
          tenant: {
            total: 2,
            active: 1,
            inactive: 1,
            services: 4 // 3 from acme-corp + 1 from startup-inc
          },
          user: {
            total: 2,
            active: 2,
            inactive: 0,
            services: 3 // 2 from john-doe + 1 from jane-smith
          }
        },
        servicesLoaded: 7,
        history: {
          loaded: 4,
          failed: 1,
          reloaded: 2
        }
      });

      expect(response.lifecycleStates).toEqual({
        tenant: {
          'acme-corp': 'active',
          'startup-inc': 'suspended'
        },
        user: {
          'john-doe': 'active',
          'jane-smith': 'loading'
        }
      });
    });

    test('should provide detailed entity overview through admin entities endpoint', async () => {
      const entitiesHandler = server.app.get.mock.calls.find(
        call => call[0] === '/admin/entities'
      )[1];

      const response = await entitiesHandler(MockFactories.createMockRequest(), MockFactories.createMockReply());

      expect(response.success).toBe(true);
      expect(response.data.tenant.instances).toHaveLength(2);
      expect(response.data.user.instances).toHaveLength(2);

      // Check specific entity data
      const acmeEntity = response.data.tenant.instances.find(e => e.id === 'acme-corp');
      expect(acmeEntity).toEqual({
        type: 'tenant',
        id: 'acme-corp',
        active: true,
        services: ['userService', 'authService', 'billingService'],
        plugins: ['auth', 'database', 'billing'],
        routes: ['/dashboard', '/settings', '/billing'],
        schemas: ['user-schema', 'billing-schema'],
        metadata: { plan: 'enterprise', region: 'us-east-1' },
        createdAt: expect.any(String)
      });
    });

    test('should provide filtered entity list by type', async () => {
      const entityTypeHandler = server.app.get.mock.calls.find(
        call => call[0] === '/admin/entities/:entityType'
      )[1];

      // Test tenant entities
      const tenantRequest = MockFactories.createMockRequest({
        params: { entityType: 'tenant' }
      });
      const tenantResponse = await entityTypeHandler(tenantRequest, MockFactories.createMockReply());

      expect(tenantResponse).toEqual({
        success: true,
        entityType: 'tenant',
        data: expect.arrayContaining([
          expect.objectContaining({ id: 'acme-corp', type: 'tenant' }),
          expect.objectContaining({ id: 'startup-inc', type: 'tenant' })
        ]),
        count: 2
      });

      // Test user entities
      const userRequest = MockFactories.createMockRequest({
        params: { entityType: 'user' }
      });
      const userResponse = await entityTypeHandler(userRequest, MockFactories.createMockReply());

      expect(userResponse.count).toBe(2);
      expect(userResponse.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'john-doe', type: 'user' }),
          expect.objectContaining({ id: 'jane-smith', type: 'user' })
        ])
      );
    });

    test('should provide detailed individual entity information', async () => {
      const entityHandler = server.app.get.mock.calls.find(
        call => call[0] === '/admin/entities/:entityType/:entityId'
      )[1];

      // Test detailed tenant view
      const tenantRequest = MockFactories.createMockRequest({
        params: { entityType: 'tenant', entityId: 'acme-corp' }
      });
      const tenantResponse = await entityHandler(tenantRequest, MockFactories.createMockReply());

      expect(tenantResponse.success).toBe(true);
      expect(tenantResponse.data).toEqual({
        type: 'tenant',
        id: 'acme-corp',
        active: true,
        services: ['userService', 'authService', 'billingService'],
        plugins: ['auth', 'database', 'billing'],
        routes: ['/dashboard', '/settings', '/billing'],
        schemas: ['user-schema', 'billing-schema'],
        metadata: { plan: 'enterprise', region: 'us-east-1' },
        createdAt: expect.any(String)
      });

      // Test detailed user view
      const userRequest = MockFactories.createMockRequest({
        params: { entityType: 'user', entityId: 'john-doe' }
      });
      const userResponse = await entityHandler(userRequest, MockFactories.createMockReply());

      expect(userResponse.success).toBe(true);
      expect(userResponse.data.metadata).toEqual({
        role: 'admin',
        department: 'engineering'
      });
    });

    test('should handle admin endpoint error cases consistently', async () => {
      const entityHandler = server.app.get.mock.calls.find(
        call => call[0] === '/admin/entities/:entityType/:entityId'
      )[1];

      // Test non-existent entity
      const nonExistentRequest = MockFactories.createMockRequest({
        params: { entityType: 'tenant', entityId: 'nonexistent' }
      });
      const mockReply = MockFactories.createMockReply();

      const response = await entityHandler(nonExistentRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(response).toEqual({
        success: false,
        error: 'Entity tenant:nonexistent not found'
      });
    });
  });

  describe('Admin Endpoints Performance', () => {
    test('should handle large numbers of entities efficiently', async () => {
      // Setup entity configuration for performance test
      const entityConfig = {
        entities: {
          definitions: {
            tenant: {
              name: 'Tenant Entity',
              basePath: '/tenants',
              identificationStrategy: 'subdomain',
              enabled: true,
              maxInstances: 1000
            }
          }
        }
      };
      fs.readFile.mockResolvedValue(JSON.stringify(entityConfig));
      
      server = new GenericEntityServer({
        server: {
          port: 3002,
          host: '0.0.0.0'
        }
      });
      await server.start();

      // Create 100 test entities
      for (let i = 0; i < 100; i++) {
        const mockEntity = {
          type: 'tenant',
          id: `tenant${i}`,
          active: i % 2 === 0,
          listServices: () => [`service${i}`],
          toJSON: () => ({
            type: 'tenant',
            id: `tenant${i}`,
            active: i % 2 === 0,
            services: [`service${i}`]
          })
        };
        server.dependencies.entityManager.entityRegistry.entities.set(`tenant:tenant${i}`, mockEntity);
      }

      const startTime = Date.now();

      // Test health endpoint performance
      const healthHandler = server.app.get.mock.calls.find(
        call => call[0] === '/health'
      )[1];
      const healthResponse = await healthHandler(MockFactories.createMockRequest(), MockFactories.createMockReply());

      // Test entities endpoint performance
      const entitiesHandler = server.app.get.mock.calls.find(
        call => call[0] === '/admin/entities'
      )[1];
      const entitiesResponse = await entitiesHandler(MockFactories.createMockRequest(), MockFactories.createMockReply());

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Should handle 100 entities quickly (less than 500ms)
      expect(processingTime).toBeLessThan(500);

      // Verify correct data
      expect(healthResponse.entities.total).toBe(100);
      expect(healthResponse.entities.active).toBe(50);
      expect(entitiesResponse.data.tenant.instances).toHaveLength(100);
    });
  });
});