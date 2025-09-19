import { describe, test, expect, beforeEach } from 'vitest';
import { EntitySecurityService, ValidationError } from '../../../main.mjs';

describe('EntitySecurityService', () => {
  let securityService;

  beforeEach(() => {
    securityService = new EntitySecurityService();
  });

  describe('Constructor', () => {
    test('should create with default rules', () => {
      const service = new EntitySecurityService();
      
      expect(service.rules).toBeDefined();
      expect(service.rules.entityIdPattern).toBeInstanceOf(RegExp);
      expect(service.rules.pluginNamePattern).toBeInstanceOf(RegExp);
      expect(service.rules.maxIdLength).toBe(64);
    });

    test('should merge custom rules with defaults', () => {
      const customRules = {
        maxIdLength: 32,
        entityIdPattern: /^[a-z0-9-]+$/,
        customRule: 'test'
      };
      
      const service = new EntitySecurityService(customRules);
      
      expect(service.rules.maxIdLength).toBe(32);
      expect(service.rules.entityIdPattern).toBe(customRules.entityIdPattern);
      expect(service.rules.pluginNamePattern).toBeInstanceOf(RegExp); // Default preserved
      expect(service.rules.customRule).toBe('test');
    });

    test('should handle empty rules object', () => {
      const service = new EntitySecurityService({});
      
      expect(service.rules.entityIdPattern).toBeInstanceOf(RegExp);
      expect(service.rules.pluginNamePattern).toBeInstanceOf(RegExp);
      expect(service.rules.maxIdLength).toBe(64);
    });
  });

  describe('validateEntityId()', () => {
    describe('Positive Cases', () => {
      test('should accept valid entity IDs', () => {
        const validIds = [
          'tenant1',
          'user-123',
          'product_456',
          'abc123',
          'test-entity-123',
          'a',
          '1',
          'A1B2C3'
        ];

        for (const id of validIds) {
          expect(() => securityService.validateEntityId(id)).not.toThrow();
          expect(securityService.validateEntityId(id)).toBe(id);
        }
      });

      test('should accept entity IDs with custom entity type', () => {
        const result = securityService.validateEntityId('test123', 'user');
        expect(result).toBe('test123');
      });

      test('should accept entity IDs at maximum length', () => {
        const maxLengthId = 'a'.repeat(64);
        const result = securityService.validateEntityId(maxLengthId);
        expect(result).toBe(maxLengthId);
      });
    });

    describe('Negative Cases', () => {
      test('should reject null and undefined', () => {
        expect(() => securityService.validateEntityId(null))
          .toThrow(ValidationError);
        expect(() => securityService.validateEntityId(null))
          .toThrow('entity ID must be a non-empty string');

        expect(() => securityService.validateEntityId(undefined))
          .toThrow(ValidationError);
      });

      test('should reject empty string', () => {
        expect(() => securityService.validateEntityId(''))
          .toThrow(ValidationError);
        expect(() => securityService.validateEntityId(''))
          .toThrow('entity ID must be a non-empty string');
      });

      test('should reject non-string values', () => {
        const invalidValues = [123, [], {}, true, false];

        for (const value of invalidValues) {
          expect(() => securityService.validateEntityId(value))
            .toThrow(ValidationError);
          expect(() => securityService.validateEntityId(value))
            .toThrow('entity ID must be a non-empty string');
        }
      });

      test('should reject entity IDs exceeding maximum length', () => {
        const tooLongId = 'a'.repeat(65);
        
        expect(() => securityService.validateEntityId(tooLongId))
          .toThrow(ValidationError);
        expect(() => securityService.validateEntityId(tooLongId))
          .toThrow('entity ID exceeds maximum length of 64');
      });

      test('should reject entity IDs with invalid characters', () => {
        const invalidIds = [
          'tenant@123',
          'user space',
          'entity/path',
          'tenant\\test',
          'user<>test',
          'entity"quoted',
          'tenant\'single',
          'user&test',
          'entity%encoded',
          'tenant+plus',
          'user=equals',
          'entity?query',
          'tenant#hash',
          'user[bracket]',
          'entity{brace}',
          'tenant|pipe',
          'user~tilde',
          'entity`backtick',
          'tenant;semicolon',
          'user:colon',
          'entity,comma',
          'tenant.dot'
        ];

        for (const id of invalidIds) {
          expect(() => securityService.validateEntityId(id))
            .toThrow(ValidationError);
          expect(() => securityService.validateEntityId(id))
            .toThrow('entity ID contains invalid characters');
        }
      });

      test('should include entity type in error message', () => {
        expect(() => securityService.validateEntityId(null, 'tenant'))
          .toThrow('tenant ID must be a non-empty string');
        
        expect(() => securityService.validateEntityId('', 'user'))
          .toThrow('user ID must be a non-empty string');

        const tooLongId = 'a'.repeat(65);
        expect(() => securityService.validateEntityId(tooLongId, 'product'))
          .toThrow('product ID exceeds maximum length of 64');

        expect(() => securityService.validateEntityId('invalid@id', 'organization'))
          .toThrow('organization ID contains invalid characters');
      });
    });
  });

  describe('validatePluginName()', () => {
    describe('Positive Cases', () => {
      test('should accept valid plugin names', () => {
        const validNames = [
          'database',
          'auth-plugin',
          'user_service',
          'plugin123',
          'test-plugin-name',
          'A1B2C3',
          'single',
          '123'
        ];

        for (const name of validNames) {
          expect(() => securityService.validatePluginName(name)).not.toThrow();
          expect(securityService.validatePluginName(name)).toBe(name);
        }
      });

      test('should accept plugin names at maximum length', () => {
        const maxLengthName = 'a'.repeat(64);
        const result = securityService.validatePluginName(maxLengthName);
        expect(result).toBe(maxLengthName);
      });
    });

    describe('Negative Cases', () => {
      test('should reject null and undefined', () => {
        expect(() => securityService.validatePluginName(null))
          .toThrow(ValidationError);
        expect(() => securityService.validatePluginName(null))
          .toThrow('Plugin name must be a non-empty string');

        expect(() => securityService.validatePluginName(undefined))
          .toThrow(ValidationError);
      });

      test('should reject empty string', () => {
        expect(() => securityService.validatePluginName(''))
          .toThrow(ValidationError);
        expect(() => securityService.validatePluginName(''))
          .toThrow('Plugin name must be a non-empty string');
      });

      test('should reject non-string values', () => {
        const invalidValues = [123, [], {}, true, false];

        for (const value of invalidValues) {
          expect(() => securityService.validatePluginName(value))
            .toThrow(ValidationError);
          expect(() => securityService.validatePluginName(value))
            .toThrow('Plugin name must be a non-empty string');
        }
      });

      test('should reject plugin names exceeding maximum length', () => {
        const tooLongName = 'a'.repeat(65);
        
        expect(() => securityService.validatePluginName(tooLongName))
          .toThrow(ValidationError);
        expect(() => securityService.validatePluginName(tooLongName))
          .toThrow('Plugin name exceeds maximum length of 64');
      });

      test('should reject plugin names with invalid characters', () => {
        const invalidNames = [
          'plugin@name',
          'plugin space',
          'plugin/path',
          'plugin\\backslash',
          'plugin<>brackets',
          'plugin"quotes',
          'plugin\'single',
          'plugin&amp',
          'plugin%encoded',
          'plugin+plus'
        ];

        for (const name of invalidNames) {
          expect(() => securityService.validatePluginName(name))
            .toThrow(ValidationError);
          expect(() => securityService.validatePluginName(name))
            .toThrow('Plugin name contains invalid characters');
        }
      });
    });
  });

  describe('validate()', () => {
    describe('Positive Cases', () => {
      test('should validate valid string with default pattern', () => {
        const result = securityService.validate('test123', 'Test Field', /^[a-zA-Z0-9\-_]+$/);
        expect(result).toBe('test123');
      });

      test('should validate with custom pattern', () => {
        const customPattern = /^[a-z]+$/;
        const result = securityService.validate('lowercase', 'Custom Field', customPattern);
        expect(result).toBe('lowercase');
      });

      test('should validate at maximum length', () => {
        const maxValue = 'a'.repeat(64);
        const result = securityService.validate(maxValue, 'Max Field', /^[a]+$/);
        expect(result).toBe(maxValue);
      });
    });

    describe('Negative Cases', () => {
      test('should reject null and undefined', () => {
        const pattern = /^[a-zA-Z0-9\-_]+$/;
        
        expect(() => securityService.validate(null, 'Test Field', pattern))
          .toThrow(ValidationError);
        expect(() => securityService.validate(null, 'Test Field', pattern))
          .toThrow('Test Field must be a non-empty string');

        expect(() => securityService.validate(undefined, 'Test Field', pattern))
          .toThrow(ValidationError);
      });

      test('should reject empty string', () => {
        const pattern = /^[a-zA-Z0-9\-_]+$/;
        
        expect(() => securityService.validate('', 'Test Field', pattern))
          .toThrow(ValidationError);
        expect(() => securityService.validate('', 'Test Field', pattern))
          .toThrow('Test Field must be a non-empty string');
      });

      test('should reject non-string values', () => {
        const pattern = /^[a-zA-Z0-9\-_]+$/;
        const invalidValues = [123, [], {}, true, false];

        for (const value of invalidValues) {
          expect(() => securityService.validate(value, 'Test Field', pattern))
            .toThrow(ValidationError);
          expect(() => securityService.validate(value, 'Test Field', pattern))
            .toThrow('Test Field must be a non-empty string');
        }
      });

      test('should reject values exceeding maximum length', () => {
        const pattern = /^[a]+$/;
        const tooLongValue = 'a'.repeat(65);
        
        expect(() => securityService.validate(tooLongValue, 'Test Field', pattern))
          .toThrow(ValidationError);
        expect(() => securityService.validate(tooLongValue, 'Test Field', pattern))
          .toThrow('Test Field exceeds maximum length of 64');
      });

      test('should reject values not matching pattern', () => {
        const pattern = /^[a-z]+$/; // Only lowercase letters
        
        expect(() => securityService.validate('Test123', 'Test Field', pattern))
          .toThrow(ValidationError);
        expect(() => securityService.validate('Test123', 'Test Field', pattern))
          .toThrow('Test Field contains invalid characters');
      });
    });
  });

  describe('validateEntitySecurity()', () => {
    describe('Positive Cases', () => {
      test('should pass validation with no security requirements', () => {
        const entityConfig = {};
        const request = {};
        
        const result = securityService.validateEntitySecurity('tenant', entityConfig, request);
        expect(result).toBe(true);
      });

      test('should pass validation with optional authentication when not authenticated', () => {
        const entityConfig = {
          security: {
            authentication: 'optional'
          }
        };
        const request = { authenticated: false };
        
        const result = securityService.validateEntitySecurity('tenant', entityConfig, request);
        expect(result).toBe(true);
      });

      test('should pass validation with required authentication when authenticated', () => {
        const entityConfig = {
          security: {
            authentication: 'required'
          }
        };
        const request = { authenticated: true };
        
        const result = securityService.validateEntitySecurity('tenant', entityConfig, request);
        expect(result).toBe(true);
      });

      test('should pass validation with strict isolation when no cross-entity access', () => {
        const entityConfig = {
          security: {
            isolation: 'strict'
          }
        };
        const request = { crossEntityAccess: false };
        
        const result = securityService.validateEntitySecurity('tenant', entityConfig, request);
        expect(result).toBe(true);
      });

      test('should pass validation with loose isolation regardless of cross-entity access', () => {
        const entityConfig = {
          security: {
            isolation: 'loose'
          }
        };
        const request = { crossEntityAccess: true };
        
        const result = securityService.validateEntitySecurity('tenant', entityConfig, request);
        expect(result).toBe(true);
      });

      test('should pass complex security validation', () => {
        const entityConfig = {
          security: {
            authentication: 'required',
            isolation: 'strict'
          }
        };
        const request = { 
          authenticated: true, 
          crossEntityAccess: false 
        };
        
        const result = securityService.validateEntitySecurity('tenant', entityConfig, request);
        expect(result).toBe(true);
      });
    });

    describe('Negative Cases', () => {
      test('should reject when required authentication is missing', () => {
        const entityConfig = {
          security: {
            authentication: 'required'
          }
        };
        const request = { authenticated: false };
        
        expect(() => securityService.validateEntitySecurity('tenant', entityConfig, request))
          .toThrow(ValidationError);
        expect(() => securityService.validateEntitySecurity('tenant', entityConfig, request))
          .toThrow('Authentication required for tenant');
      });

      test('should reject when required authentication is undefined', () => {
        const entityConfig = {
          security: {
            authentication: 'required'
          }
        };
        const request = {}; // No authenticated property
        
        expect(() => securityService.validateEntitySecurity('tenant', entityConfig, request))
          .toThrow(ValidationError);
        expect(() => securityService.validateEntitySecurity('tenant', entityConfig, request))
          .toThrow('Authentication required for tenant');
      });

      test('should reject cross-entity access with strict isolation', () => {
        const entityConfig = {
          security: {
            isolation: 'strict'
          }
        };
        const request = { crossEntityAccess: true };
        
        expect(() => securityService.validateEntitySecurity('tenant', entityConfig, request))
          .toThrow(ValidationError);
        expect(() => securityService.validateEntitySecurity('tenant', entityConfig, request))
          .toThrow('Cross-entity access denied for tenant');
      });

      test('should fail complex security validation when authentication fails', () => {
        const entityConfig = {
          security: {
            authentication: 'required',
            isolation: 'strict'
          }
        };
        const request = { 
          authenticated: false, // This should fail first
          crossEntityAccess: false 
        };
        
        expect(() => securityService.validateEntitySecurity('tenant', entityConfig, request))
          .toThrow('Authentication required for tenant');
      });

      test('should fail complex security validation when isolation fails', () => {
        const entityConfig = {
          security: {
            authentication: 'required',
            isolation: 'strict'
          }
        };
        const request = { 
          authenticated: true,
          crossEntityAccess: true // This should fail after authentication passes
        };
        
        expect(() => securityService.validateEntitySecurity('tenant', entityConfig, request))
          .toThrow('Cross-entity access denied for tenant');
      });
    });
  });

  describe('Custom Rules', () => {
    test('should use custom maximum length', () => {
      const service = new EntitySecurityService({ maxIdLength: 10 });
      
      expect(() => service.validateEntityId('a'.repeat(10))).not.toThrow();
      expect(() => service.validateEntityId('a'.repeat(11)))
        .toThrow('entity ID exceeds maximum length of 10');
    });

    test('should use custom entity ID pattern', () => {
      const service = new EntitySecurityService({ 
        entityIdPattern: /^[a-z]+$/ // Only lowercase letters
      });
      
      expect(() => service.validateEntityId('lowercase')).not.toThrow();
      expect(() => service.validateEntityId('MixedCase'))
        .toThrow('entity ID contains invalid characters');
      expect(() => service.validateEntityId('with123numbers'))
        .toThrow('entity ID contains invalid characters');
    });

    test('should use custom plugin name pattern', () => {
      const service = new EntitySecurityService({ 
        pluginNamePattern: /^plugin-[a-z]+$/ // Must start with 'plugin-'
      });
      
      expect(() => service.validatePluginName('plugin-database')).not.toThrow();
      expect(() => service.validatePluginName('database'))
        .toThrow('Plugin name contains invalid characters');
      expect(() => service.validatePluginName('Plugin-Database'))
        .toThrow('Plugin name contains invalid characters');
    });
  });
});