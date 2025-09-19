import { describe, test, expect } from 'vitest';
import { ValidationError, EntityError, PluginError } from '../../../main.mjs';

describe('Error Classes', () => {
  describe('ValidationError', () => {
    test('should create ValidationError with message', () => {
      const message = 'Invalid input provided';
      const error = new ValidationError(message);
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe(message);
      expect(error.name).toBe('ValidationError');
    });

    test('should be throwable and catchable', () => {
      const message = 'Test validation error';
      
      expect(() => {
        throw new ValidationError(message);
      }).toThrow(ValidationError);
      
      expect(() => {
        throw new ValidationError(message);
      }).toThrow(message);
    });

    test('should handle empty message', () => {
      const error = new ValidationError('');
      
      expect(error.message).toBe('');
      expect(error.name).toBe('ValidationError');
    });

    test('should handle undefined message', () => {
      const error = new ValidationError();
      
      expect(error.message).toBe('');
      expect(error.name).toBe('ValidationError');
    });
  });

  describe('EntityError', () => {
    test('should create EntityError with message, entityType, and entityId', () => {
      const message = 'Entity not found';
      const entityType = 'tenant';
      const entityId = 'test-tenant';
      
      const error = new EntityError(message, entityType, entityId);
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(EntityError);
      expect(error.message).toBe(message);
      expect(error.name).toBe('EntityError');
      expect(error.entityType).toBe(entityType);
      expect(error.entityId).toBe(entityId);
    });

    test('should be throwable and catchable', () => {
      const message = 'Test entity error';
      const entityType = 'user';
      const entityId = 'user123';
      
      expect(() => {
        throw new EntityError(message, entityType, entityId);
      }).toThrow(EntityError);
      
      expect(() => {
        throw new EntityError(message, entityType, entityId);
      }).toThrow(message);
    });

    test('should handle missing entityType and entityId', () => {
      const message = 'Entity error';
      const error = new EntityError(message);
      
      expect(error.message).toBe(message);
      expect(error.entityType).toBeUndefined();
      expect(error.entityId).toBeUndefined();
    });

    test('should handle null entityType and entityId', () => {
      const message = 'Entity error';
      const error = new EntityError(message, null, null);
      
      expect(error.message).toBe(message);
      expect(error.entityType).toBeNull();
      expect(error.entityId).toBeNull();
    });
  });

  describe('PluginError', () => {
    test('should create PluginError with message and pluginName', () => {
      const message = 'Plugin failed to load';
      const pluginName = 'database-plugin';
      
      const error = new PluginError(message, pluginName);
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(PluginError);
      expect(error.message).toBe(message);
      expect(error.name).toBe('PluginError');
      expect(error.pluginName).toBe(pluginName);
    });

    test('should be throwable and catchable', () => {
      const message = 'Test plugin error';
      const pluginName = 'test-plugin';
      
      expect(() => {
        throw new PluginError(message, pluginName);
      }).toThrow(PluginError);
      
      expect(() => {
        throw new PluginError(message, pluginName);
      }).toThrow(message);
    });

    test('should handle missing pluginName', () => {
      const message = 'Plugin error';
      const error = new PluginError(message);
      
      expect(error.message).toBe(message);
      expect(error.pluginName).toBeUndefined();
    });

    test('should handle null pluginName', () => {
      const message = 'Plugin error';
      const error = new PluginError(message, null);
      
      expect(error.message).toBe(message);
      expect(error.pluginName).toBeNull();
    });
  });

  describe('Error Inheritance', () => {
    test('all custom errors should be instances of Error', () => {
      const validationError = new ValidationError('test');
      const entityError = new EntityError('test', 'type', 'id');
      const pluginError = new PluginError('test', 'plugin');
      
      expect(validationError).toBeInstanceOf(Error);
      expect(entityError).toBeInstanceOf(Error);
      expect(pluginError).toBeInstanceOf(Error);
    });

    test('errors should have proper names', () => {
      const validationError = new ValidationError('test');
      const entityError = new EntityError('test', 'type', 'id');
      const pluginError = new PluginError('test', 'plugin');
      
      expect(validationError.name).toBe('ValidationError');
      expect(entityError.name).toBe('EntityError');
      expect(pluginError.name).toBe('PluginError');
    });

    test('errors should maintain stack traces', () => {
      const validationError = new ValidationError('test');
      const entityError = new EntityError('test', 'type', 'id');
      const pluginError = new PluginError('test', 'plugin');
      
      expect(validationError.stack).toBeDefined();
      expect(entityError.stack).toBeDefined();
      expect(pluginError.stack).toBeDefined();
      expect(typeof validationError.stack).toBe('string');
      expect(typeof entityError.stack).toBe('string');
      expect(typeof pluginError.stack).toBe('string');
    });
  });
});