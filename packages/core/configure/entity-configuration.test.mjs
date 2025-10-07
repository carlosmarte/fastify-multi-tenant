import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFile } from 'fs/promises';
import { EntityConfigurationManager } from './entity-configuration.mjs';
import { Result, ConfigurationValidationError } from '@thinkeloquent/core-exceptions';

// Mock fs/promises
vi.mock('fs/promises');

describe('EntityConfigurationManager', () => {
  let configManager;
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Set test environment variables
    process.env.PORT = '3000';
    process.env.HOST = '127.0.0.1';
    process.env.LOG_LEVEL = 'debug';
    process.env.NODE_ENV = 'test';

    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Constructor', () => {
    test('should create with default configuration', () => {
      configManager = new EntityConfigurationManager();

      expect(configManager.config).toBeDefined();
      expect(configManager.entityDefinitions).toBeInstanceOf(Map);
      expect(configManager.entityDefinitions.size).toBe(0);
      expect(configManager.suppressErrorLogging).toBe(false);
    });

    test('should merge overrides with default configuration', () => {
      const overrides = {
        server: {
          port: 8080,
          host: 'localhost'
        },
        customProperty: 'test'
      };

      configManager = new EntityConfigurationManager(overrides);

      expect(configManager.config.server.port).toBe(8080);
      expect(configManager.config.server.host).toBe('localhost');
      expect(configManager.config.customProperty).toBe('test');
      expect(configManager.config.logger).toBeDefined(); // Default still exists
    });

    test('should accept options', () => {
      configManager = new EntityConfigurationManager({}, {
        suppressErrorLogging: true
      });

      expect(configManager.suppressErrorLogging).toBe(true);
    });
  });

  describe('getDefaultConfig()', () => {
    test('should return complete default configuration structure', () => {
      configManager = new EntityConfigurationManager();
      const defaultConfig = configManager.getDefaultConfig();

      expect(defaultConfig.server).toBeDefined();
      expect(defaultConfig.logger).toBeDefined();
      expect(defaultConfig.plugins).toBeDefined();
      expect(defaultConfig.entities).toBeDefined();
      expect(defaultConfig.security).toBeDefined();
    });

    test('should use environment variables for configuration', () => {
      configManager = new EntityConfigurationManager();
      const config = configManager.getDefaultConfig();

      expect(config.server.port).toBe(3000);
      expect(config.server.host).toBe('127.0.0.1');
      expect(config.logger.level).toBe('debug');
      expect(config.logger.pretty).toBe(true);
    });

    test('should use defaults when environment variables are not set', () => {
      delete process.env.PORT;
      delete process.env.HOST;
      delete process.env.LOG_LEVEL;

      configManager = new EntityConfigurationManager();
      const config = configManager.getDefaultConfig();

      expect(config.server.port).toBe(3002);
      expect(config.server.host).toBe('0.0.0.0');
      expect(config.logger.level).toBe('info');
    });

    test('should set logger.pretty based on NODE_ENV', () => {
      process.env.NODE_ENV = 'production';
      configManager = new EntityConfigurationManager();
      expect(configManager.getDefaultConfig().logger.pretty).toBe(false);

      process.env.NODE_ENV = 'development';
      configManager = new EntityConfigurationManager();
      expect(configManager.getDefaultConfig().logger.pretty).toBe(true);
    });
  });

  describe('loadEntityConfig()', () => {
    test('should load valid entity configuration file', async () => {
      const mockEntityConfig = {
        entities: {
          definitions: {
            tenant: {
              name: 'Tenant Entity',
              basePath: '/tenants',
              identificationStrategy: 'subdomain',
              enabled: true
            },
            user: {
              name: 'User Entity',
              basePath: '/users',
              identificationStrategy: 'path',
              enabled: true
            }
          }
        }
      };

      readFile.mockResolvedValue(JSON.stringify(mockEntityConfig));

      configManager = new EntityConfigurationManager();
      const result = await configManager.loadEntityConfig();

      expect(result.success).toBe(true);
      expect(configManager.entityDefinitions.size).toBe(2);
      expect(configManager.entityDefinitions.has('tenant')).toBe(true);
      expect(configManager.entityDefinitions.has('user')).toBe(true);
    });

    test('should use custom config path when provided', async () => {
      const mockConfig = {
        entities: {
          definitions: {
            custom: { basePath: '/custom' }
          }
        }
      };

      readFile.mockResolvedValue(JSON.stringify(mockConfig));

      configManager = new EntityConfigurationManager();
      await configManager.loadEntityConfig('/custom/path/config.json');

      expect(readFile).toHaveBeenCalledWith('/custom/path/config.json', 'utf8');
    });

    test('should use custom project root when provided', async () => {
      readFile.mockResolvedValue('{}');

      configManager = new EntityConfigurationManager();
      await configManager.loadEntityConfig(null, '/project/root');

      expect(readFile).toHaveBeenCalledWith('/project/root/entity-config.json', 'utf8');
    });

    test('should merge with existing configuration', async () => {
      const initialConfig = {
        server: { port: 8080 }
      };

      const fileConfig = {
        logger: { level: 'warn' },
        entities: {
          definitions: {
            tenant: { basePath: '/tenants' }
          }
        }
      };

      readFile.mockResolvedValue(JSON.stringify(fileConfig));

      configManager = new EntityConfigurationManager(initialConfig);
      await configManager.loadEntityConfig();

      expect(configManager.config.server.port).toBe(8080);
      expect(configManager.config.logger.level).toBe('warn');
      expect(configManager.entityDefinitions.has('tenant')).toBe(true);
    });

    test('should handle missing configuration file gracefully', async () => {
      readFile.mockRejectedValue(new Error('ENOENT: file not found'));

      configManager = new EntityConfigurationManager();
      const result = await configManager.loadEntityConfig();

      expect(result.success).toBe(true);
      expect(configManager.entityDefinitions.size).toBe(0);
    });

    test('should handle invalid JSON gracefully', async () => {
      readFile.mockResolvedValue('{ invalid json content');

      configManager = new EntityConfigurationManager();
      const result = await configManager.loadEntityConfig();

      expect(result.success).toBe(true);
      expect(configManager.entityDefinitions.size).toBe(0);
    });

    test('should add type property to entity definitions', async () => {
      const mockConfig = {
        entities: {
          definitions: {
            tenant: { basePath: '/tenants' }
          }
        }
      };

      readFile.mockResolvedValue(JSON.stringify(mockConfig));

      configManager = new EntityConfigurationManager();
      await configManager.loadEntityConfig();

      const definition = configManager.getEntityDefinition('tenant');
      expect(definition.type).toBe('tenant');
    });
  });

  describe('getEntityDefinition()', () => {
    test('should return entity definition when it exists', () => {
      configManager = new EntityConfigurationManager();
      configManager.entityDefinitions.set('tenant', {
        basePath: '/tenants',
        type: 'tenant'
      });

      const definition = configManager.getEntityDefinition('tenant');

      expect(definition).toEqual({
        basePath: '/tenants',
        type: 'tenant'
      });
    });

    test('should return undefined for non-existent entity type', () => {
      configManager = new EntityConfigurationManager();

      const definition = configManager.getEntityDefinition('nonexistent');

      expect(definition).toBeUndefined();
    });
  });

  describe('getAllEntityTypes()', () => {
    test('should return empty array when no entities', () => {
      configManager = new EntityConfigurationManager();

      expect(configManager.getAllEntityTypes()).toEqual([]);
    });

    test('should return all entity type names', () => {
      configManager = new EntityConfigurationManager();
      configManager.entityDefinitions.set('tenant', {});
      configManager.entityDefinitions.set('user', {});
      configManager.entityDefinitions.set('product', {});

      const types = configManager.getAllEntityTypes();

      expect(types).toHaveLength(3);
      expect(types).toContain('tenant');
      expect(types).toContain('user');
      expect(types).toContain('product');
    });
  });

  describe('get()', () => {
    beforeEach(() => {
      configManager = new EntityConfigurationManager({
        server: {
          port: 3000,
          host: 'localhost'
        },
        nested: {
          deep: {
            value: 'test'
          }
        }
      });
    });

    test('should return entire config when no key provided', () => {
      const result = configManager.get();

      expect(result).toBe(configManager.config);
    });

    test('should return value for simple key', () => {
      expect(configManager.get('server')).toEqual({
        port: 3000,
        host: 'localhost'
      });
    });

    test('should return value for nested key', () => {
      expect(configManager.get('server.port')).toBe(3000);
      expect(configManager.get('nested.deep.value')).toBe('test');
    });

    test('should return undefined for non-existent key', () => {
      expect(configManager.get('nonexistent')).toBeUndefined();
      expect(configManager.get('server.nonexistent')).toBeUndefined();
    });
  });

  describe('merge()', () => {
    test('should merge new configuration with existing', () => {
      configManager = new EntityConfigurationManager({
        server: { port: 3000 },
        logger: { level: 'info' }
      });

      configManager.merge({
        server: { host: 'newhost' },
        logger: { level: 'debug' }
      });

      expect(configManager.config.server.port).toBe(3000);
      expect(configManager.config.server.host).toBe('newhost');
      expect(configManager.config.logger.level).toBe('debug');
    });
  });

  describe('validate()', () => {
    test('should return success for valid configuration', () => {
      configManager = new EntityConfigurationManager({
        server: { port: 3000 }
      });

      const result = configManager.validate();

      expect(result.success).toBe(true);
    });

    test('should return error for invalid port number', () => {
      configManager = new EntityConfigurationManager({
        server: { port: -1 }
      });

      const result = configManager.validate();

      expect(result.success).toBe(false);
      expect(result.error).toContain('server.port must be a number between 1 and 65535');
    });

    test('should return error for port outside valid range', () => {
      configManager = new EntityConfigurationManager({
        server: { port: 70000 }
      });

      const result = configManager.validate();

      expect(result.success).toBe(false);
      expect(result.error).toContain('server.port must be a number between 1 and 65535');
    });

    test('should validate entity definitions', () => {
      configManager = new EntityConfigurationManager();
      configManager.entityDefinitions.set('tenant', {
        // Missing basePath and identificationStrategy
      });

      const result = configManager.validate();

      expect(result.success).toBe(false);
      expect(result.error).toHaveLength(2);
      expect(result.error).toContain("Entity type 'tenant' missing basePath");
      expect(result.error).toContain("Entity type 'tenant' missing identificationStrategy");
    });

    test('should pass validation with complete entity definitions', () => {
      configManager = new EntityConfigurationManager();
      configManager.entityDefinitions.set('tenant', {
        basePath: '/tenants',
        identificationStrategy: 'subdomain'
      });

      const result = configManager.validate();

      expect(result.success).toBe(true);
    });
  });

  describe('clone()', () => {
    test('should create deep copy of configuration', () => {
      configManager = new EntityConfigurationManager({
        server: { port: 3000 },
        custom: { value: 'original' }
      });

      const cloned = configManager.clone();

      expect(cloned).not.toBe(configManager);
      expect(cloned.config.server.port).toBe(3000);
      expect(cloned.config.custom.value).toBe('original');
      expect(cloned.config).not.toBe(configManager.config);

      // Verify deep copy by modifying cloned
      cloned.config.custom.value = 'modified';
      expect(configManager.config.custom.value).toBe('original');
    });

    test('should copy entity definitions', () => {
      configManager = new EntityConfigurationManager();
      configManager.entityDefinitions.set('tenant', {
        basePath: '/tenants',
        type: 'tenant'
      });

      const cloned = configManager.clone();

      expect(cloned.entityDefinitions.size).toBe(1);
      expect(cloned.entityDefinitions.get('tenant')).toEqual({
        basePath: '/tenants',
        type: 'tenant'
      });
    });

    test('should preserve options', () => {
      configManager = new EntityConfigurationManager({}, {
        suppressErrorLogging: true
      });

      const cloned = configManager.clone();

      expect(cloned.suppressErrorLogging).toBe(true);
    });
  });

  describe('toJSON()', () => {
    test('should export configuration as JSON', () => {
      configManager = new EntityConfigurationManager({
        server: { port: 3000 }
      });
      configManager.entityDefinitions.set('tenant', {
        basePath: '/tenants',
        type: 'tenant'
      });

      const json = configManager.toJSON();

      expect(json.server.port).toBe(3000);
      expect(json.entities.definitions.tenant).toEqual({
        basePath: '/tenants',
        type: 'tenant'
      });
    });

    test('should include all entity definitions', () => {
      configManager = new EntityConfigurationManager();
      configManager.entityDefinitions.set('tenant', { basePath: '/tenants' });
      configManager.entityDefinitions.set('user', { basePath: '/users' });

      const json = configManager.toJSON();

      expect(Object.keys(json.entities.definitions)).toHaveLength(2);
      expect(json.entities.definitions.tenant).toBeDefined();
      expect(json.entities.definitions.user).toBeDefined();
    });
  });

  describe('fromJSON()', () => {
    test('should create instance from JSON', () => {
      const json = {
        server: { port: 4000 },
        entities: {
          definitions: {
            tenant: { basePath: '/tenants' },
            user: { basePath: '/users' }
          }
        }
      };

      const manager = EntityConfigurationManager.fromJSON(json);

      expect(manager.config.server.port).toBe(4000);
      expect(manager.entityDefinitions.size).toBe(2);
      expect(manager.entityDefinitions.has('tenant')).toBe(true);
      expect(manager.entityDefinitions.has('user')).toBe(true);
    });

    test('should add type property to entity definitions', () => {
      const json = {
        entities: {
          definitions: {
            tenant: { basePath: '/tenants' }
          }
        }
      };

      const manager = EntityConfigurationManager.fromJSON(json);

      expect(manager.entityDefinitions.get('tenant').type).toBe('tenant');
    });

    test('should accept options', () => {
      const json = {};
      const manager = EntityConfigurationManager.fromJSON(json, {
        suppressErrorLogging: true
      });

      expect(manager.suppressErrorLogging).toBe(true);
    });
  });

  describe('getEntityConfig()', () => {
    beforeEach(() => {
      configManager = new EntityConfigurationManager({
        entities: {
          globalResources: { schemas: '/schemas' },
          hierarchicalLoading: true
        },
        security: { validateInputs: true }
      });
    });

    test('should return null for non-existent entity', () => {
      const config = configManager.getEntityConfig('nonexistent');

      expect(config).toBeNull();
    });

    test('should return entity config with global settings', () => {
      configManager.entityDefinitions.set('tenant', {
        basePath: '/tenants',
        type: 'tenant'
      });

      const config = configManager.getEntityConfig('tenant');

      expect(config.basePath).toBe('/tenants');
      expect(config.type).toBe('tenant');
      expect(config.globalResources).toMatchObject({ schemas: '/schemas' });
      expect(config.hierarchicalLoading).toBe(true);
      expect(config.security).toMatchObject({ validateInputs: true });
    });
  });

  describe('setEntityDefinition()', () => {
    test('should add new entity definition', () => {
      configManager = new EntityConfigurationManager();

      configManager.setEntityDefinition('tenant', {
        basePath: '/tenants',
        identificationStrategy: 'subdomain'
      });

      expect(configManager.entityDefinitions.has('tenant')).toBe(true);
      expect(configManager.config.entities.definitions.tenant).toBeDefined();
    });

    test('should update existing entity definition', () => {
      configManager = new EntityConfigurationManager();

      configManager.setEntityDefinition('tenant', { basePath: '/old' });
      configManager.setEntityDefinition('tenant', { basePath: '/new' });

      expect(configManager.entityDefinitions.get('tenant').basePath).toBe('/new');
    });

    test('should add type property', () => {
      configManager = new EntityConfigurationManager();

      configManager.setEntityDefinition('tenant', { basePath: '/tenants' });

      expect(configManager.entityDefinitions.get('tenant').type).toBe('tenant');
    });

    test('should return self for chaining', () => {
      configManager = new EntityConfigurationManager();

      const result = configManager.setEntityDefinition('tenant', {});

      expect(result).toBe(configManager);
    });
  });

  describe('removeEntityDefinition()', () => {
    test('should remove existing entity definition', () => {
      configManager = new EntityConfigurationManager();
      configManager.setEntityDefinition('tenant', { basePath: '/tenants' });

      configManager.removeEntityDefinition('tenant');

      expect(configManager.entityDefinitions.has('tenant')).toBe(false);
      expect(configManager.config.entities?.definitions?.tenant).toBeUndefined();
    });

    test('should handle non-existent entity gracefully', () => {
      configManager = new EntityConfigurationManager();

      expect(() => {
        configManager.removeEntityDefinition('nonexistent');
      }).not.toThrow();
    });

    test('should return self for chaining', () => {
      configManager = new EntityConfigurationManager();

      const result = configManager.removeEntityDefinition('tenant');

      expect(result).toBe(configManager);
    });
  });

  describe('hasEntityType()', () => {
    test('should return true for existing entity type', () => {
      configManager = new EntityConfigurationManager();
      configManager.setEntityDefinition('tenant', {});

      expect(configManager.hasEntityType('tenant')).toBe(true);
    });

    test('should return false for non-existent entity type', () => {
      configManager = new EntityConfigurationManager();

      expect(configManager.hasEntityType('nonexistent')).toBe(false);
    });
  });

  describe('getEntityDefinitions()', () => {
    test('should return empty object when no definitions', () => {
      configManager = new EntityConfigurationManager();

      expect(configManager.getEntityDefinitions()).toEqual({});
    });

    test('should return all entity definitions as object', () => {
      configManager = new EntityConfigurationManager();
      configManager.setEntityDefinition('tenant', { basePath: '/tenants' });
      configManager.setEntityDefinition('user', { basePath: '/users' });

      const definitions = configManager.getEntityDefinitions();

      expect(Object.keys(definitions)).toHaveLength(2);
      expect(definitions.tenant.basePath).toBe('/tenants');
      expect(definitions.user.basePath).toBe('/users');
    });
  });

  describe('Integration Tests', () => {
    test('should handle complete configuration workflow', async () => {
      const fileConfig = {
        server: { port: 4000 },
        entities: {
          definitions: {
            tenant: {
              basePath: '/tenants',
              identificationStrategy: 'subdomain'
            }
          }
        }
      };

      readFile.mockResolvedValue(JSON.stringify(fileConfig));

      // Create with overrides
      configManager = new EntityConfigurationManager({
        logger: { level: 'warn' }
      });

      // Load from file
      await configManager.loadEntityConfig();

      // Add more entities
      configManager.setEntityDefinition('user', {
        basePath: '/users',
        identificationStrategy: 'path'
      });

      // Validate
      const validationResult = configManager.validate();
      expect(validationResult.success).toBe(true);

      // Export
      const exported = configManager.toJSON();
      expect(exported.server.port).toBe(4000);
      expect(exported.logger.level).toBe('warn');
      expect(Object.keys(exported.entities.definitions)).toHaveLength(2);

      // Clone and modify
      const cloned = configManager.clone();
      cloned.removeEntityDefinition('user');

      expect(configManager.hasEntityType('user')).toBe(true);
      expect(cloned.hasEntityType('user')).toBe(false);
    });

    test('should handle entity configuration updates correctly', () => {
      configManager = new EntityConfigurationManager();

      // Add initial entities
      configManager
        .setEntityDefinition('tenant', {
          basePath: '/tenants',
          identificationStrategy: 'subdomain'
        })
        .setEntityDefinition('user', {
          basePath: '/users',
          identificationStrategy: 'path'
        });

      expect(configManager.getAllEntityTypes()).toHaveLength(2);

      // Update existing
      configManager.setEntityDefinition('tenant', {
        basePath: '/v2/tenants',
        identificationStrategy: 'header',
        newProperty: 'value'
      });

      const tenant = configManager.getEntityDefinition('tenant');
      expect(tenant.basePath).toBe('/v2/tenants');
      expect(tenant.identificationStrategy).toBe('header');
      expect(tenant.newProperty).toBe('value');

      // Remove one
      configManager.removeEntityDefinition('user');
      expect(configManager.getAllEntityTypes()).toHaveLength(1);
      expect(configManager.hasEntityType('user')).toBe(false);
    });

    test('should maintain consistency between config and entityDefinitions', () => {
      configManager = new EntityConfigurationManager();

      configManager.setEntityDefinition('tenant', {
        basePath: '/tenants'
      });

      // Both should be in sync
      expect(configManager.entityDefinitions.has('tenant')).toBe(true);
      expect(configManager.config.entities.definitions.tenant).toBeDefined();

      configManager.removeEntityDefinition('tenant');

      // Both should be removed
      expect(configManager.entityDefinitions.has('tenant')).toBe(false);
      expect(configManager.config.entities?.definitions?.tenant).toBeUndefined();
    });
  });
});