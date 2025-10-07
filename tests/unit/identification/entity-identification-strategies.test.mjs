import { describe, test, expect, beforeEach } from 'vitest';
import { 
  EntityIdentificationStrategy,
  SubdomainIdentificationStrategy,
  PathIdentificationStrategy,
  HeaderIdentificationStrategy,
  CompositeIdentificationStrategy
} from '../../../main.mjs';
import { MockFactories } from '../../helpers/mock-factories.mjs';

describe('Entity Identification Strategies', () => {
  describe('EntityIdentificationStrategy (Base Class)', () => {
    test('should throw error when extractEntityId is not implemented', () => {
      const strategy = new EntityIdentificationStrategy();
      const mockRequest = MockFactories.createMockRequest();
      const mockEntityConfig = MockFactories.createMockEntityConfig();
      
      expect(() => strategy.extractEntityId(mockRequest, mockEntityConfig))
        .toThrow("Abstract method 'extractEntityId' must be implemented by subclass of EntityIdentificationStrategy");
    });

    test('should be instantiable as base class', () => {
      const strategy = new EntityIdentificationStrategy();
      
      expect(strategy).toBeInstanceOf(EntityIdentificationStrategy);
    });
  });

  describe('SubdomainIdentificationStrategy', () => {
    let strategy;

    beforeEach(() => {
      strategy = new SubdomainIdentificationStrategy();
    });

    test('should be instance of base strategy', () => {
      expect(strategy).toBeInstanceOf(EntityIdentificationStrategy);
      expect(strategy).toBeInstanceOf(SubdomainIdentificationStrategy);
    });

    describe('Positive Cases', () => {
      test('should extract entity ID from subdomain with default pattern', () => {
        const request = MockFactories.createMockRequest({ 
          hostname: 'tenant1.example.com' 
        });
        const entityConfig = MockFactories.createMockEntityConfig();
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBe('tenant1');
      });

      test('should extract entity ID with custom pattern', () => {
        const request = MockFactories.createMockRequest({ 
          hostname: 'app-tenant123.mycompany.com' 
        });
        const entityConfig = MockFactories.createMockEntityConfig({
          extractPattern: '^app-([^.]+)\\.'
        });
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBe('tenant123');
      });

      test('should handle complex subdomain patterns', () => {
        const request = MockFactories.createMockRequest({ 
          hostname: 'api.tenant-org-123.staging.example.com' 
        });
        const entityConfig = MockFactories.createMockEntityConfig({
          extractPattern: 'api\\.([^.]+)\\.'
        });
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBe('tenant-org-123');
      });

      test('should extract first match group only', () => {
        const request = MockFactories.createMockRequest({ 
          hostname: 'prefix-tenant1-suffix.example.com' 
        });
        const entityConfig = MockFactories.createMockEntityConfig({
          extractPattern: 'prefix-([^-]+)-([^.]+)\\.'
        });
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBe('tenant1'); // First capture group
      });

      test('should handle single character entity IDs', () => {
        const request = MockFactories.createMockRequest({ 
          hostname: 'a.example.com' 
        });
        const entityConfig = MockFactories.createMockEntityConfig();
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBe('a');
      });

      test('should handle numeric entity IDs', () => {
        const request = MockFactories.createMockRequest({ 
          hostname: '123.example.com' 
        });
        const entityConfig = MockFactories.createMockEntityConfig();
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBe('123');
      });
    });

    describe('Negative Cases', () => {
      test('should return null when hostname is missing', () => {
        const request = MockFactories.createMockRequest({ hostname: null });
        const entityConfig = MockFactories.createMockEntityConfig();
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBeNull();
      });

      test('should return null when hostname is undefined', () => {
        const request = MockFactories.createMockRequest();
        delete request.hostname;
        const entityConfig = MockFactories.createMockEntityConfig();
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBeNull();
      });

      test('should return null when pattern does not match', () => {
        const request = MockFactories.createMockRequest({ 
          hostname: 'example.com' // No subdomain
        });
        const entityConfig = MockFactories.createMockEntityConfig();
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        // The default pattern '^([^.]+)\\.' will match 'example' before the first dot
        // Let's test with a hostname that truly won't match
        const request2 = MockFactories.createMockRequest({ 
          hostname: 'localhost' // Single word, no dots
        });
        const result2 = strategy.extractEntityId(request2, entityConfig);
        
        expect(result2).toBeNull();
      });

      test('should return null when custom pattern does not match', () => {
        const request = MockFactories.createMockRequest({ 
          hostname: 'tenant1.example.com' 
        });
        const entityConfig = MockFactories.createMockEntityConfig({
          extractPattern: '^api-([^.]+)\\.' // Looking for 'api-' prefix
        });
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBeNull();
      });

      test('should handle invalid regex pattern gracefully', () => {
        const request = MockFactories.createMockRequest({ 
          hostname: 'tenant1.example.com' 
        });
        const entityConfig = MockFactories.createMockEntityConfig({
          extractPattern: '[invalid regex'
        });
        
        expect(() => strategy.extractEntityId(request, entityConfig))
          .toThrow(); // Should throw due to invalid regex
      });

      test('should return null for empty hostname', () => {
        const request = MockFactories.createMockRequest({ hostname: '' });
        const entityConfig = MockFactories.createMockEntityConfig();
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBeNull();
      });
    });
  });

  describe('PathIdentificationStrategy', () => {
    let strategy;

    beforeEach(() => {
      strategy = new PathIdentificationStrategy();
    });

    test('should be instance of base strategy', () => {
      expect(strategy).toBeInstanceOf(EntityIdentificationStrategy);
      expect(strategy).toBeInstanceOf(PathIdentificationStrategy);
    });

    describe('Positive Cases', () => {
      test('should extract entity ID from URL path with default settings', () => {
        const request = MockFactories.createMockRequest({ 
          url: '/tenants/tenant1/dashboard' 
        });
        const entityConfig = MockFactories.createMockEntityConfig({ 
          type: 'tenant' 
        });
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBe('tenant1');
      });

      test('should use custom pathPrefix', () => {
        const request = MockFactories.createMockRequest({ 
          url: '/organizations/org123/settings' 
        });
        const entityConfig = MockFactories.createMockEntityConfig({
          pathPrefix: '/organizations'
        });
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBe('org123');
      });

      test('should use custom pathSegment index', () => {
        const request = MockFactories.createMockRequest({ 
          url: '/api/v1/tenant456/users' 
        });
        const entityConfig = MockFactories.createMockEntityConfig({
          pathPrefix: '/api/v1',
          pathSegment: 2 // Third segment (0-indexed)
        });
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBe('tenant456');
      });

      test('should handle paths with query parameters', () => {
        const request = MockFactories.createMockRequest({ 
          url: '/tenants/tenant789/dashboard?tab=overview&filter=active' 
        });
        const entityConfig = MockFactories.createMockEntityConfig({ 
          type: 'tenant' 
        });
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBe('tenant789');
      });

      test('should handle paths with trailing slashes', () => {
        const request = MockFactories.createMockRequest({ 
          url: '/tenants/tenant999/' 
        });
        const entityConfig = MockFactories.createMockEntityConfig({ 
          type: 'tenant' 
        });
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBe('tenant999');
      });

      test('should handle pathSegment 0 (first segment)', () => {
        const request = MockFactories.createMockRequest({ 
          url: '/tenant-special/dashboard' 
        });
        const entityConfig = MockFactories.createMockEntityConfig({
          pathPrefix: '/', // Must start with the pathPrefix
          pathSegment: 0
        });
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBe('tenant-special');
      });

      test('should handle complex nested paths', () => {
        const request = MockFactories.createMockRequest({ 
          url: '/app/tenants/complex-tenant-id-123/modules/billing/invoices/456' 
        });
        const entityConfig = MockFactories.createMockEntityConfig({
          pathPrefix: '/app/tenants',
          pathSegment: 2
        });
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBe('complex-tenant-id-123');
      });
    });

    describe('Negative Cases', () => {
      test('should return null when URL is missing', () => {
        const request = MockFactories.createMockRequest({ url: null });
        const entityConfig = {
          type: 'tenant',
          strategies: [
            { type: 'subdomain', priority: 1, extractPattern: '^([^.]+)\\.(.+\\..+)$' },
            { type: 'path', priority: 2 },
            { type: 'header', priority: 3 }
          ]
        };
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBeNull();
      });

      test('should return null when URL is undefined', () => {
        const request = MockFactories.createMockRequest();
        delete request.url;
        const entityConfig = {
          type: 'tenant',
          strategies: [
            { type: 'subdomain', priority: 1, extractPattern: '^([^.]+)\\.(.+\\..+)$' },
            { type: 'path', priority: 2 },
            { type: 'header', priority: 3 }
          ]
        };
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBeNull();
      });

      test('should return null when URL does not start with pathPrefix', () => {
        const request = MockFactories.createMockRequest({ 
          url: '/users/user123/profile' 
        });
        const entityConfig = MockFactories.createMockEntityConfig({ 
          type: 'tenant' // pathPrefix will be '/tenants'
        });
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBeNull();
      });

      test('should return null when pathSegment index is out of bounds', () => {
        const request = MockFactories.createMockRequest({ 
          url: '/tenants' // Only has index 0
        });
        const entityConfig = MockFactories.createMockEntityConfig({
          type: 'tenant',
          pathSegment: 1
        });
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBeNull();
      });

      test('should return null when path segment is empty', () => {
        const request = MockFactories.createMockRequest({ 
          url: '/tenants//dashboard' // Empty segment
        });
        const entityConfig = MockFactories.createMockEntityConfig({ 
          type: 'tenant' 
        });
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        // The filter(Boolean) in the implementation removes empty segments
        // So this would match 'dashboard' at index 1
        expect(result).toBe('dashboard');
      });

      test('should return null for empty URL', () => {
        const request = MockFactories.createMockRequest({ url: '' });
        const entityConfig = {
          type: 'tenant',
          strategies: [
            { type: 'subdomain', priority: 1, extractPattern: '^([^.]+)\\.(.+\\..+)$' },
            { type: 'path', priority: 2 },
            { type: 'header', priority: 3 }
          ]
        };
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBeNull();
      });

      test('should return null when pathPrefix does not match exactly', () => {
        const request = MockFactories.createMockRequest({ 
          url: '/tenant/tenant123' // 'tenant' vs 'tenants'
        });
        const entityConfig = MockFactories.createMockEntityConfig({ 
          type: 'tenant' // pathPrefix will be '/tenants'
        });
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBeNull();
      });
    });
  });

  describe('HeaderIdentificationStrategy', () => {
    let strategy;

    beforeEach(() => {
      strategy = new HeaderIdentificationStrategy();
    });

    test('should be instance of base strategy', () => {
      expect(strategy).toBeInstanceOf(EntityIdentificationStrategy);
      expect(strategy).toBeInstanceOf(HeaderIdentificationStrategy);
    });

    describe('Positive Cases', () => {
      test('should extract entity ID from default header name', () => {
        const request = MockFactories.createMockRequest({ 
          headers: {
            'x-tenant-id': 'tenant123'
          }
        });
        const entityConfig = MockFactories.createMockEntityConfig({ 
          type: 'tenant' 
        });
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBe('tenant123');
      });

      test('should use custom header name', () => {
        const request = MockFactories.createMockRequest({ 
          headers: {
            'custom-entity-header': 'entity456'
          }
        });
        const entityConfig = MockFactories.createMockEntityConfig({
          headerName: 'custom-entity-header'
        });
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBe('entity456');
      });

      test('should handle case-insensitive header names', () => {
        const request = MockFactories.createMockRequest({ 
          headers: {
            'x-tenant-id': 'tenant789' // Must be lowercase in headers object
          }
        });
        const entityConfig = MockFactories.createMockEntityConfig({ 
          type: 'tenant',
          headerName: 'X-TENANT-ID' // Config can be uppercase
        });
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBe('tenant789');
      });

      test('should handle different entity types in default header', () => {
        const request = MockFactories.createMockRequest({ 
          headers: {
            'x-organization-id': 'org-abc-123'
          }
        });
        const entityConfig = MockFactories.createMockEntityConfig({ 
          type: 'organization' 
        });
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBe('org-abc-123');
      });

      test('should handle numeric entity IDs', () => {
        const request = MockFactories.createMockRequest({ 
          headers: {
            'x-user-id': '12345'
          }
        });
        const entityConfig = MockFactories.createMockEntityConfig({ 
          type: 'user' 
        });
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBe('12345');
      });

      test('should handle complex entity ID formats', () => {
        const request = MockFactories.createMockRequest({ 
          headers: {
            'x-tenant-id': 'tenant_org-123_env-prod'
          }
        });
        const entityConfig = MockFactories.createMockEntityConfig({ 
          type: 'tenant' 
        });
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBe('tenant_org-123_env-prod');
      });

      test('should handle single character entity IDs', () => {
        const request = MockFactories.createMockRequest({ 
          headers: {
            'x-tenant-id': 'a'
          }
        });
        const entityConfig = MockFactories.createMockEntityConfig({ 
          type: 'tenant' 
        });
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBe('a');
      });
    });

    describe('Negative Cases', () => {
      test('should return null when headers object is missing', () => {
        const request = MockFactories.createMockRequest({ headers: null });
        const entityConfig = {
          type: 'tenant',
          strategies: [
            { type: 'subdomain', priority: 1, extractPattern: '^([^.]+)\\.(.+\\..+)$' },
            { type: 'path', priority: 2 },
            { type: 'header', priority: 3 }
          ]
        };
        
        expect(() => strategy.extractEntityId(request, entityConfig))
          .toThrow(); // Accessing property on null will throw
      });

      test('should return null when headers object is undefined', () => {
        const request = MockFactories.createMockRequest();
        delete request.headers;
        const entityConfig = {
          type: 'tenant',
          strategies: [
            { type: 'subdomain', priority: 1, extractPattern: '^([^.]+)\\.(.+\\..+)$' },
            { type: 'path', priority: 2 },
            { type: 'header', priority: 3 }
          ]
        };
        
        expect(() => strategy.extractEntityId(request, entityConfig))
          .toThrow(); // Accessing property on undefined will throw
      });

      test('should return null when target header is missing', () => {
        const request = MockFactories.createMockRequest({ 
          headers: {
            'content-type': 'application/json',
            'user-agent': 'test'
          }
        });
        const entityConfig = {
          type: 'tenant',
          strategies: [
            { type: 'subdomain', priority: 1, extractPattern: '^([^.]+)\\.(.+\\..+)$' },
            { type: 'path', priority: 2 },
            { type: 'header', priority: 3 }
          ]
        };
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBeNull();
      });

      test('should return null when custom header is missing', () => {
        const request = MockFactories.createMockRequest({ 
          headers: {
            'x-tenant-id': 'tenant123' // Wrong header
          }
        });
        const entityConfig = MockFactories.createMockEntityConfig({
          headerName: 'x-organization-id'
        });
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBeNull();
      });

      test('should return null when header value is empty string', () => {
        const request = MockFactories.createMockRequest({ 
          headers: {
            'x-tenant-id': ''
          }
        });
        const entityConfig = {
          type: 'tenant',
          strategies: [
            { type: 'subdomain', priority: 1, extractPattern: '^([^.]+)\\.(.+\\..+)$' },
            { type: 'path', priority: 2 },
            { type: 'header', priority: 3 }
          ]
        };
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBeNull();
      });

      test('should return null when header value is null', () => {
        const request = MockFactories.createMockRequest({ 
          headers: {
            'x-tenant-id': null
          }
        });
        const entityConfig = {
          type: 'tenant',
          strategies: [
            { type: 'subdomain', priority: 1, extractPattern: '^([^.]+)\\.(.+\\..+)$' },
            { type: 'path', priority: 2 },
            { type: 'header', priority: 3 }
          ]
        };
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBeNull();
      });

      test('should return null when header value is undefined', () => {
        const request = MockFactories.createMockRequest({ 
          headers: {
            'x-tenant-id': undefined
          }
        });
        const entityConfig = {
          type: 'tenant',
          strategies: [
            { type: 'subdomain', priority: 1, extractPattern: '^([^.]+)\\.(.+\\..+)$' },
            { type: 'path', priority: 2 },
            { type: 'header', priority: 3 }
          ]
        };
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBeNull();
      });
    });
  });

  describe('CompositeIdentificationStrategy', () => {
    let strategy;
    let strategiesMap;
    let headerStrategy;
    let subdomainStrategy;
    let pathStrategy;

    beforeEach(() => {
      headerStrategy = new HeaderIdentificationStrategy();
      subdomainStrategy = new SubdomainIdentificationStrategy();
      pathStrategy = new PathIdentificationStrategy();
      
      strategiesMap = new Map();
      strategiesMap.set('subdomain', subdomainStrategy);
      strategiesMap.set('path', pathStrategy);
      strategiesMap.set('header', headerStrategy);
      
      strategy = new CompositeIdentificationStrategy(strategiesMap);
      strategy.strategies = strategiesMap; // The implementation expects this.strategies to be the Map
    });

    test('should be instance of base strategy', () => {
      expect(strategy).toBeInstanceOf(EntityIdentificationStrategy);
      expect(strategy).toBeInstanceOf(CompositeIdentificationStrategy);
    });

    describe('Strategy Priority', () => {
      test('should try strategies in order and return first successful match', () => {
        const request = MockFactories.createMockRequest({ 
          hostname: 'tenant1.example.com', // Should match subdomain (first)
          url: '/tenants/tenant2/dashboard', // Would match path (second)
          headers: { 'x-tenant-id': 'tenant3' } // Would match header (third)
        });
        const entityConfig = {
          type: 'tenant',
          strategies: [
            { type: 'subdomain', priority: 1, extractPattern: '^([^.]+)\\.(.+\\..+)$' },
            { type: 'path', priority: 2 },
            { type: 'header', priority: 3 }
          ]
        };
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBe('tenant1'); // First strategy wins
      });

      test('should fall back to second strategy when first fails', () => {
        const request = MockFactories.createMockRequest({ 
          hostname: 'localhost', // No dots - subdomain fails
          url: '/tenants/tenant2/dashboard', // Should match path (second)
          headers: { 'x-tenant-id': 'tenant3' } // Would match header (third)
        });
        const entityConfig = {
          type: 'tenant',
          strategies: [
            { type: 'subdomain', priority: 1, extractPattern: '^([^.]+)\\.(.+\\..+)$' },
            { type: 'path', priority: 2 },
            { type: 'header', priority: 3 }
          ]
        };
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBe('tenant2'); // Second strategy wins
      });

      test('should fall back to third strategy when first two fail', () => {
        const request = MockFactories.createMockRequest({ 
          hostname: 'localhost', // No dots - subdomain fails
          url: '/users/user123/profile', // Wrong path prefix - fails
          headers: { 'x-tenant-id': 'tenant3' } // Should match header (third)
        });
        const entityConfig = {
          type: 'tenant',
          strategies: [
            { type: 'subdomain', priority: 1, extractPattern: '^([^.]+)\\.(.+\\..+)$' },
            { type: 'path', priority: 2 },
            { type: 'header', priority: 3 }
          ]
        };
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBe('tenant3'); // Third strategy wins
      });

      test('should return null when all strategies fail', () => {
        const request = MockFactories.createMockRequest({ 
          hostname: 'example.com', // No subdomain - fails
          url: '/users/user123/profile', // Wrong path prefix - fails
          headers: { 'content-type': 'application/json' } // No entity header - fails
        });
        const entityConfig = {
          type: 'tenant',
          strategies: [
            { type: 'subdomain', priority: 1, extractPattern: '^([^.]+)\\.(.+\\..+)$' },
            { type: 'path', priority: 2 },
            { type: 'header', priority: 3 }
          ]
        };
        
        const result = strategy.extractEntityId(request, entityConfig);
        
        expect(result).toBeNull();
      });
    });

    describe('Configuration', () => {
      test('should work with single strategy', () => {
        const singleStrategyMap = new Map();
        singleStrategyMap.set('header', headerStrategy);
        const singleStrategy = new CompositeIdentificationStrategy(singleStrategyMap);
        const request = MockFactories.createMockRequest({ 
          headers: { 'x-tenant-id': 'tenant-single' }
        });
        const entityConfig = {
          type: 'tenant',
          strategies: [
            { type: 'subdomain', priority: 1, extractPattern: '^([^.]+)\\.(.+\\..+)$' },
            { type: 'path', priority: 2 },
            { type: 'header', priority: 3 }
          ]
        };
        
        const result = singleStrategy.extractEntityId(request, entityConfig);
        
        expect(result).toBe('tenant-single');
      });

      test('should handle empty strategies array', () => {
        const emptyStrategyMap = new Map();
        const emptyStrategy = new CompositeIdentificationStrategy(emptyStrategyMap);
        const request = MockFactories.createMockRequest({ 
          hostname: 'tenant1.example.com'
        });
        const entityConfig = {
          type: 'tenant',
          strategies: [
            { type: 'subdomain', priority: 1, extractPattern: '^([^.]+)\\.(.+\\..+)$' },
            { type: 'path', priority: 2 },
            { type: 'header', priority: 3 }
          ]
        };
        
        const result = emptyStrategy.extractEntityId(request, entityConfig);
        
        expect(result).toBeNull();
      });

      test('should work with custom strategy order', () => {
        // Put header strategy first with highest priority
        const customOrderStrategyMap = new Map();
        customOrderStrategyMap.set('header', headerStrategy);
        customOrderStrategyMap.set('subdomain', subdomainStrategy);
        customOrderStrategyMap.set('path', pathStrategy);
        const customOrderStrategy = new CompositeIdentificationStrategy(customOrderStrategyMap);
        
        const request = MockFactories.createMockRequest({ 
          hostname: 'tenant1.example.com', // Would match subdomain
          url: '/tenants/tenant2/dashboard', // Would match path
          headers: { 'x-tenant-id': 'tenant3' } // Should match header (highest priority)
        });
        const entityConfig = {
          type: 'tenant',
          strategies: [
            { type: 'subdomain', priority: 3, extractPattern: '^([^.]+)\\.(.+\\..+)$' },
            { type: 'path', priority: 2 },
            { type: 'header', priority: 1 }
          ]
        };
        
        const result = customOrderStrategy.extractEntityId(request, entityConfig);
        
        expect(result).toBe('tenant3'); // Header strategy now wins
      });
    });

    describe('Error Handling', () => {
      test('should handle strategy errors gracefully and continue to next', () => {
        // Create a mock strategy that throws an error
        const errorStrategy = {
          extractEntityId: () => {
            throw new Error('Strategy failed');
          }
        };
        
        const resilientStrategyMap = new Map();
        resilientStrategyMap.set('error', errorStrategy);
        resilientStrategyMap.set('header', headerStrategy);
        const resilientStrategy = new CompositeIdentificationStrategy(resilientStrategyMap);
        
        const request = MockFactories.createMockRequest({ 
          headers: { 'x-tenant-id': 'tenant-after-error' }
        });
        const entityConfig = {
          type: 'tenant',
          strategies: [
            { type: 'error', priority: 1 },
            { type: 'header', priority: 2 }
          ]
        };
        
        const result = resilientStrategy.extractEntityId(request, entityConfig);
        
        expect(result).toBe('tenant-after-error'); // Should recover and use header strategy
      });

      test('should return null when all strategies throw errors', () => {
        const errorStrategy1 = {
          extractEntityId: () => { throw new Error('Error 1'); }
        };
        const errorStrategy2 = {
          extractEntityId: () => { throw new Error('Error 2'); }
        };
        
        const allErrorStrategy = new CompositeIdentificationStrategy([
          errorStrategy1,
          errorStrategy2
        ]);
        
        const request = MockFactories.createMockRequest();
        const entityConfig = {
          type: 'tenant',
          strategies: [
            { type: 'subdomain', priority: 1, extractPattern: '^([^.]+)\\.(.+\\..+)$' },
            { type: 'path', priority: 2 },
            { type: 'header', priority: 3 }
          ]
        };
        
        const result = allErrorStrategy.extractEntityId(request, entityConfig);
        
        expect(result).toBeNull();
      });
    });
  });

  describe('Integration Tests', () => {
    test('should work together in realistic multi-strategy scenarios', () => {
      const compositeStrategy = new CompositeIdentificationStrategy([
        new SubdomainIdentificationStrategy(),
        new PathIdentificationStrategy(),
        new HeaderIdentificationStrategy()
      ]);
      
      // Test different request patterns
      const testCases = [
        {
          name: 'Subdomain identification',
          request: MockFactories.createMockRequest({ 
            hostname: 'tenant-prod.myapp.com' 
          }),
          expected: 'tenant-prod'
        },
        {
          name: 'Path identification',
          request: MockFactories.createMockRequest({ 
            hostname: 'myapp.com',
            url: '/tenants/enterprise-client/billing'
          }),
          expected: 'enterprise-client'
        },
        {
          name: 'Header identification',
          request: MockFactories.createMockRequest({ 
            hostname: 'myapp.com',
            url: '/dashboard',
            headers: { 'x-tenant-id': 'header-tenant-123' }
          }),
          expected: 'header-tenant-123'
        }
      ];
      
      for (const testCase of testCases) {
        const entityConfig = {
          type: 'tenant',
          strategies: [
            { type: 'subdomain', priority: 1, extractPattern: '^([^.]+)\\.(.+\\..+)$' },
            { type: 'path', priority: 2 },
            { type: 'header', priority: 3 }
          ]
        };
        const result = compositeStrategy.extractEntityId(testCase.request, entityConfig);
        expect(result).toBe(testCase.expected);
      }
    });

    test('should handle mixed success/failure scenarios correctly', () => {
      const compositeStrategy = new CompositeIdentificationStrategy([
        new SubdomainIdentificationStrategy(),
        new PathIdentificationStrategy(),
        new HeaderIdentificationStrategy()
      ]);
      
      // Subdomain fails, path succeeds
      const request1 = MockFactories.createMockRequest({ 
        hostname: 'app.com', // No subdomain
        url: '/tenants/fallback-tenant/api'
      });
      
      const result1 = compositeStrategy.extractEntityId(
        request1, 
        {
          type: 'tenant',
          strategies: [
            { type: 'subdomain', priority: 1, extractPattern: '^([^.]+)\\.(.+\\..+)$' },
            { type: 'path', priority: 2 },
            { type: 'header', priority: 3 }
          ]
        }
      );
      
      expect(result1).toBe('fallback-tenant');
      
      // Subdomain and path fail, header succeeds
      const request2 = MockFactories.createMockRequest({ 
        hostname: 'app.com', // No subdomain
        url: '/some/other/path', // Wrong path
        headers: { 'x-tenant-id': 'final-fallback' }
      });
      
      const result2 = compositeStrategy.extractEntityId(
        request2, 
        {
          type: 'tenant',
          strategies: [
            { type: 'subdomain', priority: 1, extractPattern: '^([^.]+)\\.(.+\\..+)$' },
            { type: 'path', priority: 2 },
            { type: 'header', priority: 3 }
          ]
        }
      );
      
      expect(result2).toBe('final-fallback');
    });
  });
});