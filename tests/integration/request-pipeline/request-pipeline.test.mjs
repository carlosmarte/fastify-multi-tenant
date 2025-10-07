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

describe('Request Pipeline Integration Tests', () => {
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

  describe('Entity Identification Pipeline', () => {
    beforeEach(async () => {
      const entityConfig = {
        entities: {
          definitions: {
            tenant: {
              name: 'Tenant',
              basePath: '/tenants',
              identificationStrategy: 'subdomain',
              extractPattern: '^([^.]+)\\.(.+\\..+)$',
              enabled: true,
              priority: 1
            },
            user: {
              name: 'User',
              basePath: '/users',
              identificationStrategy: 'path',
              pathPrefix: '/users',
              pathSegment: 1,
              enabled: true,
              priority: 2
            },
            organization: {
              name: 'Organization',
              basePath: '/orgs',
              identificationStrategy: 'header',
              headerName: 'X-Org-ID',
              enabled: true,
              priority: 3
            }
          }
        }
      };

      fs.readFile.mockResolvedValue(JSON.stringify(entityConfig));

      server = new GenericEntityServer();
      await server.start();
    });

    describe('Subdomain Identification', () => {
      test('should identify tenant from subdomain', async () => {
        const mockRequest = MockFactories.createMockRequest({
          hostname: 'tenant1.example.com',
          url: '/dashboard'
        });
        const mockReply = MockFactories.createMockReply();

        const requestHook = server.serverLifecycleManager.createRequestHook();
        await requestHook(mockRequest, mockReply);

        expect(mockRequest.entities).toHaveLength(1);
        expect(mockRequest.entities[0]).toEqual({
          type: 'tenant',
          id: 'tenant1',
          priority: 1,
          definition: expect.any(Object)
        });
        expect(mockRequest.primaryEntity).toEqual(mockRequest.entities[0]);
      });

      test('should handle complex subdomain patterns', async () => {
        const mockRequest = MockFactories.createMockRequest({
          hostname: 'api.tenant-complex.staging.example.com',
          url: '/api/data'
        });
        const mockReply = MockFactories.createMockReply();

        // Update tenant definition to handle complex pattern
        server.configManager.entityDefinitions.set('tenant', {
          ...server.configManager.getEntityDefinition('tenant'),
          extractPattern: 'api\\.([^.]+)\\.'
        });

        const requestHook = server.serverLifecycleManager.createRequestHook();
        await requestHook(mockRequest, mockReply);

        expect(mockRequest.entities[0].id).toBe('tenant-complex');
      });
    });

    describe('Path Identification', () => {
      test('should identify user from path', async () => {
        const mockRequest = MockFactories.createMockRequest({
          hostname: 'example.com',
          url: '/users/user123/profile'
        });
        const mockReply = MockFactories.createMockReply();

        const requestHook = server.serverLifecycleManager.createRequestHook();
        await requestHook(mockRequest, mockReply);

        expect(mockRequest.entities).toHaveLength(1);
        expect(mockRequest.entities[0]).toEqual({
          type: 'user',
          id: 'user123',
          priority: 2,
          definition: expect.any(Object)
        });
      });

      test('should handle path with query parameters', async () => {
        const mockRequest = MockFactories.createMockRequest({
          hostname: 'example.com',
          url: '/users/user456/settings?tab=security&theme=dark'
        });
        const mockReply = MockFactories.createMockReply();

        const requestHook = server.serverLifecycleManager.createRequestHook();
        await requestHook(mockRequest, mockReply);

        expect(mockRequest.entities[0].id).toBe('user456');
      });
    });

    describe('Header Identification', () => {
      test('should identify organization from header', async () => {
        const mockRequest = MockFactories.createMockRequest({
          hostname: 'example.com',
          url: '/api/data',
          headers: {
            'x-org-id': 'org789'
          }
        });
        const mockReply = MockFactories.createMockReply();

        const requestHook = server.serverLifecycleManager.createRequestHook();
        await requestHook(mockRequest, mockReply);

        expect(mockRequest.entities).toHaveLength(1);
        expect(mockRequest.entities[0]).toEqual({
          type: 'organization',
          id: 'org789',
          priority: 3,
          definition: expect.any(Object)
        });
      });

      test('should handle case-insensitive headers', async () => {
        const mockRequest = MockFactories.createMockRequest({
          hostname: 'example.com',
          url: '/api/data',
          headers: {
            'x-org-id': 'org-case-test'
          }
        });
        const mockReply = MockFactories.createMockReply();

        // Update organization definition for case test
        server.configManager.entityDefinitions.set('organization', {
          ...server.configManager.getEntityDefinition('organization'),
          headerName: 'X-ORG-ID'
        });

        const requestHook = server.serverLifecycleManager.createRequestHook();
        await requestHook(mockRequest, mockReply);

        expect(mockRequest.entities[0].id).toBe('org-case-test');
      });
    });

    describe('Multi-Entity Identification', () => {
      test('should identify multiple entities and prioritize correctly', async () => {
        const mockRequest = MockFactories.createMockRequest({
          hostname: 'tenant1.example.com',
          url: '/users/user123/profile',
          headers: {
            'x-org-id': 'org789'
          }
        });
        const mockReply = MockFactories.createMockReply();

        const requestHook = server.serverLifecycleManager.createRequestHook();
        await requestHook(mockRequest, mockReply);

        expect(mockRequest.entities).toHaveLength(3);
        
        // Should be sorted by priority
        expect(mockRequest.entities[0].type).toBe('tenant'); // priority 1
        expect(mockRequest.entities[1].type).toBe('user');   // priority 2
        expect(mockRequest.entities[2].type).toBe('organization'); // priority 3

        expect(mockRequest.primaryEntity).toEqual(mockRequest.entities[0]);
      });

      test('should handle partial entity identification', async () => {
        const mockRequest = MockFactories.createMockRequest({
          hostname: 'example.com', // No subdomain
          url: '/users/user123/profile', // Path matches user
          // No org header
        });
        const mockReply = MockFactories.createMockReply();

        const requestHook = server.serverLifecycleManager.createRequestHook();
        await requestHook(mockRequest, mockReply);

        expect(mockRequest.entities).toHaveLength(1);
        expect(mockRequest.entities[0].type).toBe('user');
      });
    });

    describe('No Entity Identification', () => {
      test('should handle requests with no identifiable entities', async () => {
        const mockRequest = MockFactories.createMockRequest({
          hostname: 'example.com',
          url: '/static/css/styles.css'
        });
        const mockReply = MockFactories.createMockReply();

        const requestHook = server.serverLifecycleManager.createRequestHook();
        await requestHook(mockRequest, mockReply);

        expect(mockRequest.entities).toEqual([]);
        expect(mockRequest.primaryEntity).toBeNull();
      });
    });
  });

  describe('Logger Enhancement Pipeline', () => {
    beforeEach(async () => {
      const entityConfig = {
        entities: {
          definitions: {
            tenant: {
              name: 'Tenant',
              basePath: '/tenants',
              identificationStrategy: 'subdomain',
              enabled: true
            }
          }
        }
      };

      fs.readFile.mockResolvedValue(JSON.stringify(entityConfig));
      server = new GenericEntityServer();
      await server.start();
    });

    test('should enhance logger with entity context', async () => {
      const mockRequest = MockFactories.createMockRequest({
        hostname: 'tenant1.example.com'
      });
      const mockReply = MockFactories.createMockReply();
      const mockChildLogger = MockFactories.createMockLogger();
      
      const originalLogChild = vi.fn().mockReturnValue(mockChildLogger);
      mockRequest.log.child = originalLogChild;

      const requestHook = server.serverLifecycleManager.createRequestHook();
      await requestHook(mockRequest, mockReply);

      expect(originalLogChild).toHaveBeenCalledWith({
        entityType: 'tenant',
        entityId: 'tenant1'
      });
      expect(mockRequest.log).toBe(mockChildLogger);
    });

    test('should not modify logger when no primary entity', async () => {
      const mockRequest = MockFactories.createMockRequest({
        hostname: 'example.com'
      });
      const mockReply = MockFactories.createMockReply();
      const originalLog = mockRequest.log;

      const requestHook = server.serverLifecycleManager.createRequestHook();
      await requestHook(mockRequest, mockReply);

      expect(mockRequest.log).toBe(originalLog);
      expect(mockRequest.log.child).not.toHaveBeenCalled();
    });
  });

  describe('API Entity Validation Pipeline', () => {
    beforeEach(async () => {
      const entityConfig = {
        entities: {
          definitions: {
            tenant: {
              name: 'Tenant',
              basePath: '/tenants',
              identificationStrategy: 'subdomain',
              enabled: true
            }
          }
        }
      };

      fs.readFile.mockResolvedValue(JSON.stringify(entityConfig));
      server = new GenericEntityServer();
      await server.start();

      // Register a test tenant
      const mockEntity = {
        type: 'tenant',
        id: 'existing-tenant',
        active: true
      };
      server.dependencies.entityManager.entityRegistry.entities.set(
        'tenant:existing-tenant',
        mockEntity
      );
    });

    test('should validate entity existence for API routes', async () => {
      const mockRequest = MockFactories.createMockRequest({
        hostname: 'existing-tenant.example.com',
        url: '/api/users'
      });
      const mockReply = MockFactories.createMockReply();

      const requestHook = server.serverLifecycleManager.createRequestHook();
      await requestHook(mockRequest, mockReply);

      // Should not send error response for existing entity
      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    test('should return 404 for non-existent entity on API routes', async () => {
      const mockRequest = MockFactories.createMockRequest({
        hostname: 'nonexistent.example.com',
        url: '/api/users'
      });
      const mockReply = MockFactories.createMockReply();

      const requestHook = server.serverLifecycleManager.createRequestHook();
      await requestHook(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: "Entity 'tenant:nonexistent' not found"
      });
    });

    test('should not validate entity for non-API routes', async () => {
      const mockRequest = MockFactories.createMockRequest({
        hostname: 'nonexistent.example.com',
        url: '/public/assets/logo.png'
      });
      const mockReply = MockFactories.createMockReply();

      const requestHook = server.serverLifecycleManager.createRequestHook();
      await requestHook(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    test('should skip validation when no primary entity', async () => {
      const mockRequest = MockFactories.createMockRequest({
        hostname: 'example.com',
        url: '/api/health'
      });
      const mockReply = MockFactories.createMockReply();

      const requestHook = server.serverLifecycleManager.createRequestHook();
      await requestHook(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });
  });

  describe('Response Enhancement Pipeline', () => {
    beforeEach(async () => {
      const entityConfig = {
        entities: {
          definitions: {
            tenant: {
              name: 'Tenant',
              basePath: '/tenants',
              identificationStrategy: 'subdomain',
              enabled: true
            }
          }
        }
      };

      fs.readFile.mockResolvedValue(JSON.stringify(entityConfig));
      server = new GenericEntityServer();
      await server.start();
    });

    test('should add security headers to all responses', async () => {
      const mockRequest = MockFactories.createMockRequest();
      const mockReply = MockFactories.createMockReply();
      const payload = { data: 'test' };

      const responseHook = server.serverLifecycleManager.createResponseHook();
      const result = await responseHook(mockRequest, mockReply, payload);

      expect(mockReply.header).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(mockReply.header).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      expect(mockReply.header).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
      expect(result).toBe(payload);
    });

    test('should add entity headers when primary entity exists', async () => {
      const mockRequest = MockFactories.createMockRequest({
        primaryEntity: { type: 'tenant', id: 'test-tenant' }
      });
      const mockReply = MockFactories.createMockReply();
      const payload = { users: [] };

      const responseHook = server.serverLifecycleManager.createResponseHook();
      await responseHook(mockRequest, mockReply, payload);

      expect(mockReply.header).toHaveBeenCalledWith('X-Entity-Type', 'tenant');
      expect(mockReply.header).toHaveBeenCalledWith('X-Entity-ID', 'test-tenant');
    });

    test('should not add entity headers when no primary entity', async () => {
      const mockRequest = MockFactories.createMockRequest({
        primaryEntity: null
      });
      const mockReply = MockFactories.createMockReply();
      const payload = { data: 'global' };

      const responseHook = server.serverLifecycleManager.createResponseHook();
      await responseHook(mockRequest, mockReply, payload);

      expect(mockReply.header).not.toHaveBeenCalledWith('X-Entity-Type', expect.anything());
      expect(mockReply.header).not.toHaveBeenCalledWith('X-Entity-ID', expect.anything());
    });
  });

  describe('Error Handling Pipeline', () => {
    beforeEach(async () => {
      server = new GenericEntityServer();
      await server.start();
    });

    test('should handle entity identification errors gracefully', async () => {
      const mockRequest = MockFactories.createMockRequest();
      const mockReply = MockFactories.createMockReply();

      // Mock entity manager to throw error
      server.dependencies.entityManager.identifyEntities = vi.fn().mockImplementation(() => {
        throw new Error('Entity identification failed');
      });

      const requestHook = server.serverLifecycleManager.createRequestHook();
      await requestHook(mockRequest, mockReply);

      expect(mockRequest.log.error).toHaveBeenCalledWith(
        { err: expect.any(Error) },
        'Error in entity resolution'
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid entity identifier'
      });
    });

    test('should handle entity manager errors during validation', async () => {
      const mockRequest = MockFactories.createMockRequest({
        url: '/api/test',
        hostname: 'test.example.com'
      });
      const mockReply = MockFactories.createMockReply();

      // Mock successful identification but failed entity lookup
      server.dependencies.entityManager.identifyEntities = vi.fn().mockReturnValue([
        { type: 'tenant', id: 'test', priority: 1 }
      ]);
      server.dependencies.entityManager.getEntity = vi.fn().mockImplementation(() => {
        throw new Error('Entity manager error');
      });

      const requestHook = server.serverLifecycleManager.createRequestHook();
      await requestHook(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid entity identifier'
      });
    });
  });

  describe('Complete Request-Response Flow', () => {
    beforeEach(async () => {
      const entityConfig = {
        entities: {
          definitions: {
            tenant: {
              name: 'Tenant',
              basePath: '/tenants',
              identificationStrategy: 'subdomain',
              enabled: true,
              priority: 1
            },
            user: {
              name: 'User',
              basePath: '/users',
              identificationStrategy: 'path',
              pathPrefix: '/api/users',
              pathSegment: 2,
              enabled: true,
              priority: 2
            }
          }
        }
      };

      fs.readFile.mockResolvedValue(JSON.stringify(entityConfig));
      server = new GenericEntityServer();
      await server.start();

      // Register test entities
      const tenantEntity = { type: 'tenant', id: 'acme', active: true };
      const userEntity = { type: 'user', id: 'john', active: true };
      
      server.dependencies.entityManager.entityRegistry.entities.set('tenant:acme', tenantEntity);
      server.dependencies.entityManager.entityRegistry.entities.set('user:john', userEntity);
    });

    test('should handle complete multi-entity request flow', async () => {
      const mockRequest = MockFactories.createMockRequest({
        hostname: 'acme.example.com',
        url: '/api/users/john/profile',
        headers: {
          'user-agent': 'test-client',
          'accept': 'application/json'
        }
      });
      const mockReply = MockFactories.createMockReply();
      const mockChildLogger = MockFactories.createMockLogger();
      const originalLogChild = vi.fn().mockReturnValue(mockChildLogger);
      mockRequest.log.child = originalLogChild;

      // Execute request pipeline
      const requestHook = server.serverLifecycleManager.createRequestHook();
      await requestHook(mockRequest, mockReply);

      // Verify entity identification
      expect(mockRequest.entities).toHaveLength(2);
      expect(mockRequest.entities[0].type).toBe('tenant');
      expect(mockRequest.entities[0].id).toBe('acme');
      expect(mockRequest.entities[1].type).toBe('user');
      expect(mockRequest.entities[1].id).toBe('john');
      expect(mockRequest.primaryEntity).toEqual(mockRequest.entities[0]);

      // Verify logger enhancement
      expect(mockRequest.log).toBe(mockChildLogger);
      expect(originalLogChild).toHaveBeenCalledWith({
        entityType: 'tenant',
        entityId: 'acme'
      });

      // Verify no error response for existing entities
      expect(mockReply.code).not.toHaveBeenCalled();

      // Execute response pipeline
      const responsePayload = { profile: { id: 'john', name: 'John Doe' } };
      const responseHook = server.serverLifecycleManager.createResponseHook();
      const result = await responseHook(mockRequest, mockReply, responsePayload);

      // Verify security headers
      expect(mockReply.header).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(mockReply.header).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      expect(mockReply.header).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');

      // Verify entity headers
      expect(mockReply.header).toHaveBeenCalledWith('X-Entity-Type', 'tenant');
      expect(mockReply.header).toHaveBeenCalledWith('X-Entity-ID', 'acme');

      // Verify payload passthrough
      expect(result).toBe(responsePayload);
    });

    test('should handle static resource requests efficiently', async () => {
      const mockRequest = MockFactories.createMockRequest({
        hostname: 'acme.example.com',
        url: '/static/js/app.js'
      });
      const mockReply = MockFactories.createMockReply();
      const originalLog = mockRequest.log;

      const requestHook = server.serverLifecycleManager.createRequestHook();
      await requestHook(mockRequest, mockReply);

      // Should identify tenant but not validate (non-API route)
      expect(mockRequest.entities).toHaveLength(1);
      expect(mockRequest.primaryEntity.type).toBe('tenant');

      // Should not enhance logger for static resources (optional optimization)
      // expect(mockRequest.log).toBe(originalLog);

      // Should not perform entity validation
      expect(mockReply.code).not.toHaveBeenCalled();

      // Response should still include security headers
      const responseHook = server.serverLifecycleManager.createResponseHook();
      await responseHook(mockRequest, mockReply, 'static-content');

      expect(mockReply.header).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    });

    test('should handle health check requests with no entities', async () => {
      const mockRequest = MockFactories.createMockRequest({
        hostname: 'example.com',
        url: '/health'
      });
      const mockReply = MockFactories.createMockReply();

      const requestHook = server.serverLifecycleManager.createRequestHook();
      await requestHook(mockRequest, mockReply);

      expect(mockRequest.entities).toEqual([]);
      expect(mockRequest.primaryEntity).toBeNull();

      const responseHook = server.serverLifecycleManager.createResponseHook();
      const healthPayload = { status: 'healthy' };
      const result = await responseHook(mockRequest, mockReply, healthPayload);

      // Should have security headers but no entity headers
      expect(mockReply.header).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(mockReply.header).not.toHaveBeenCalledWith('X-Entity-Type', expect.anything());
      
      expect(result).toBe(healthPayload);
    });
  });

  describe('Performance Scenarios', () => {
    test('should handle high-frequency requests efficiently', async () => {
      const entityConfig = {
        entities: {
          definitions: {
            tenant: {
              name: 'Tenant',
              basePath: '/tenants',
              identificationStrategy: 'subdomain',
              enabled: true
            }
          }
        }
      };

      fs.readFile.mockResolvedValue(JSON.stringify(entityConfig));
      server = new GenericEntityServer();
      await server.start();

      const tenantEntity = { type: 'tenant', id: 'high-traffic', active: true };
      server.dependencies.entityManager.entityRegistry.entities.set('tenant:high-traffic', tenantEntity);

      const requestHook = server.serverLifecycleManager.createRequestHook();
      const responseHook = server.serverLifecycleManager.createResponseHook();

      const startTime = Date.now();
      
      // Simulate 100 requests
      const requests = Array.from({ length: 100 }, (_, i) => {
        const mockRequest = MockFactories.createMockRequest({
          hostname: 'high-traffic.example.com',
          url: `/api/data/${i}`
        });
        const mockReply = MockFactories.createMockReply();
        
        return { request: mockRequest, reply: mockReply };
      });

      // Process requests
      for (const { request, reply } of requests) {
        await requestHook(request, reply);
        await responseHook(request, reply, { data: 'test' });
      }

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Should process 100 requests quickly (less than 1 second)
      expect(processingTime).toBeLessThan(1000);

      // Verify last request was processed correctly
      const lastRequest = requests[99].request;
      expect(lastRequest.primaryEntity.id).toBe('high-traffic');
    });
  });
});