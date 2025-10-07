import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResourceLoader, Result } from '../../../main.mjs';
import { MockFactories } from '../../helpers/mock-factories.mjs';
import fs from 'fs/promises';
import path from 'path';
import fastGlob from 'fast-glob';

// Mock dependencies
vi.mock('fs/promises');
vi.mock('fast-glob');

describe('ResourceLoader', () => {
  let resourceLoader;
  let mockLogger;
  let mockPathResolver;
  let tempDir;
  let cleanupEnv;

  beforeEach(() => {
    mockLogger = MockFactories.createMockLogger();
    tempDir = MockFactories.createTempDir();

    mockPathResolver = {
      baseDir: tempDir.name,
      resolvePath: vi.fn((path) => path.startsWith('/') ? path : `${tempDir.name}/${path}`),
      pathExists: vi.fn().mockResolvedValue(true)
    };

    // Don't reassign fs methods - vi.mock handles it
    // Just set default return values
    fs.readFile.mockResolvedValue('{}');
    fs.mkdir.mockResolvedValue(undefined);
    fs.readdir.mockResolvedValue([]);
    fs.stat.mockResolvedValue({ isDirectory: () => true });

    resourceLoader = new ResourceLoader(mockLogger, mockPathResolver);

    cleanupEnv = MockFactories.setupMockEnv();
  });

  afterEach(() => {
    cleanupEnv?.();
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with logger and path resolver', () => {
      expect(resourceLoader.logger).toBe(mockLogger);
      expect(resourceLoader.pathResolver).toBe(mockPathResolver);
      expect(resourceLoader.loadedResources).toBeInstanceOf(Map);
      expect(resourceLoader.loadedResources.size).toBe(0);
    });
  });

  describe('loadServices()', () => {
    const mockServicePath = '/test/services';
    const mockOptions = {
      db: MockFactories.createMockDatabase(),
      config: { testConfig: true },
      entityType: 'tenant',
      entityId: 'test-tenant'
    };

    describe('Successful Loading', () => {
      test('should load services from directory', async () => {
        const serviceFiles = [
          '/test/services/userService.mjs',
          '/test/services/authService.mjs',
          '/test/services/dataService.js'
        ];

        fastGlob.mockResolvedValue(serviceFiles);

        // Mock service modules
        const mockUserService = class UserService {
          constructor(db, config) {
            this.db = db;
            this.config = config;
          }
        };
        const mockAuthService = (db, config) => ({ db, config, type: 'function' });
        const mockDataService = { type: 'object', data: 'static' };

        // Mock dynamic imports
        vi.doMock('/test/services/userService.mjs', () => ({ default: mockUserService }));
        vi.doMock('/test/services/authService.mjs', () => ({ default: mockAuthService }));
        vi.doMock('/test/services/dataService.js', () => ({ default: mockDataService }));

        const result = await resourceLoader.loadServices(mockServicePath, mockOptions);

        expect(result).toBeInstanceOf(Result);
        expect(result.success).toBe(true);
        expect(result.value).toHaveProperty('userService');
        expect(result.value).toHaveProperty('authService');
        expect(result.value).toHaveProperty('dataService');
        expect(result.value.dataService).toBe(mockDataService);
      });

      test('should cache loaded services', async () => {
        fastGlob.mockResolvedValue(['/test/services/service.mjs']);
        vi.doMock('/test/services/service.mjs', () => ({ default: { cached: true } }));

        // First load
        const result1 = await resourceLoader.loadServices(mockServicePath, mockOptions);
        expect(result1.success).toBe(true);

        // Second load should return cached result
        const result2 = await resourceLoader.loadServices(mockServicePath, mockOptions);
        expect(result2.success).toBe(true);
        expect(mockLogger.debug).toHaveBeenCalledWith(
          `Returning cached services for ${mockServicePath}`
        );
      });

      test('should instantiate class-based services with constructor parameters', async () => {
        const serviceFiles = ['/test/services/ClassService.mjs'];
        fastGlob.mockResolvedValue(serviceFiles);

        const MockClassService = class TestService {
          constructor(db, config) {
            this.db = db;
            this.config = config;
            this.initialized = true;
          }
        };

        vi.doMock('/test/services/ClassService.mjs', () => ({ default: MockClassService }));

        const result = await resourceLoader.loadServices(mockServicePath, mockOptions);

        expect(result.success).toBe(true);
        expect(result.value.ClassService).toBeInstanceOf(MockClassService);
        expect(result.value.ClassService.db).toBe(mockOptions.db);
        expect(result.value.ClassService.config).toBe(mockOptions.config);
        expect(result.value.ClassService.initialized).toBe(true);
      });

      test('should call function-based services with parameters', async () => {
        const serviceFiles = ['/test/services/functionService.mjs'];
        fastGlob.mockResolvedValue(serviceFiles);

        const mockFunctionService = vi.fn((db, config) => ({ db, config, called: true }));

        vi.doMock('/test/services/functionService.mjs', () => ({ default: mockFunctionService }));

        const result = await resourceLoader.loadServices(mockServicePath, mockOptions);

        expect(result.success).toBe(true);
        expect(mockFunctionService).toHaveBeenCalledWith(mockOptions.db, mockOptions.config);
        expect(result.value.functionService).toEqual({
          db: mockOptions.db,
          config: mockOptions.config,
          called: true
        });
      });

      test('should handle mixed service types', async () => {
        const serviceFiles = [
          '/test/services/ClassService.mjs',
          '/test/services/functionService.mjs',
          '/test/services/objectService.mjs'
        ];
        fastGlob.mockResolvedValue(serviceFiles);

        const ClassService = class { constructor() { this.type = 'class'; } };
        const functionService = () => ({ type: 'function' });
        const objectService = { type: 'object' };

        vi.doMock('/test/services/ClassService.mjs', () => ({ default: ClassService }));
        vi.doMock('/test/services/functionService.mjs', () => ({ default: functionService }));
        vi.doMock('/test/services/objectService.mjs', () => ({ default: objectService }));

        const result = await resourceLoader.loadServices(mockServicePath, mockOptions);

        expect(result.success).toBe(true);
        expect(result.value.ClassService.type).toBe('class');
        expect(result.value.functionService.type).toBe('function');
        expect(result.value.objectService.type).toBe('object');
      });
    });

    describe('Directory Not Found', () => {
      test('should return empty object when directory does not exist', async () => {
        mockPathResolver.pathExists.mockResolvedValue(false);

        const result = await resourceLoader.loadServices(mockServicePath, mockOptions);

        expect(result).toBeInstanceOf(Result);
        expect(result.success).toBe(true);
        expect(result.value).toEqual({});
        expect(mockLogger.debug).toHaveBeenCalledWith(
          `No services directory found at ${mockServicePath}`
        );
      });
    });

    describe('Error Handling', () => {
      test('should handle file system errors gracefully', async () => {
        mockPathResolver.pathExists.mockRejectedValue(new Error('Permission denied'));

        const result = await resourceLoader.loadServices(mockServicePath, mockOptions);

        expect(result).toBeInstanceOf(Result);
        expect(result.success).toBe(false);
        expect(result.error).toBe('Permission denied');
        expect(mockLogger.error).toHaveBeenCalledWith(
          { err: expect.any(Error) },
          `❌ Failed to load services from ${mockServicePath}`
        );
      });

      test('should handle individual service loading errors', async () => {
        const serviceFiles = [
          '/test/services/goodService.mjs',
          '/test/services/badService.mjs'
        ];
        fastGlob.mockResolvedValue(serviceFiles);

        vi.doMock('/test/services/goodService.mjs', () => ({ default: { good: true } }));
        vi.doMock('/test/services/badService.mjs', () => {
          throw new Error('Service loading failed');
        });

        const result = await resourceLoader.loadServices(mockServicePath, mockOptions);

        expect(result.success).toBe(true);
        expect(result.value.goodService).toEqual({ good: true });
        expect(result.value.badService).toBeUndefined();
        expect(mockLogger.error).toHaveBeenCalledWith(
          { err: expect.any(Error) },
          '❌ Failed to load service from /test/services/badService.mjs'
        );
      });

      test('should handle constructor errors in class-based services', async () => {
        const serviceFiles = ['/test/services/FailingService.mjs'];
        fastGlob.mockResolvedValue(serviceFiles);

        const FailingService = class {
          constructor() {
            throw new Error('Constructor failed');
          }
        };

        vi.doMock('/test/services/FailingService.mjs', () => ({ default: FailingService }));

        const result = await resourceLoader.loadServices(mockServicePath, mockOptions);

        expect(result.success).toBe(true);
        expect(result.value.FailingService).toBeUndefined();
        expect(mockLogger.error).toHaveBeenCalledWith(
          { err: expect.any(Error) },
          '❌ Failed to load service from /test/services/FailingService.mjs'
        );
      });
    });

    describe('Trusted Path Handling', () => {
      test('should handle trusted paths correctly', async () => {
        const trustedPath = '/trusted/services';
        const options = { ...mockOptions, isTrustedPath: true };

        fastGlob.mockResolvedValue(['/trusted/services/service.mjs']);
        vi.doMock('/trusted/services/service.mjs', () => ({ default: { trusted: true } }));

        const result = await resourceLoader.loadServices(trustedPath, options);

        expect(result.success).toBe(true);
        expect(mockPathResolver.pathExists).toHaveBeenCalledWith(trustedPath, {
          allowTrusted: true
        });
      });
    });
  });

  describe('loadPlugin()', () => {
    const mockPluginPath = '/test/plugins/testPlugin';
    const mockApp = MockFactories.createMockFastifyApp();
    const mockOptions = {
      entityType: 'tenant',
      entityId: 'test-tenant',
      config: { test: true },
      namespace: '/Test/Plugin'
    };

    describe('Successful Loading', () => {
      test('should load plugin from index.mjs', async () => {
        const mockPlugin = vi.fn().mockResolvedValue(undefined);
        const pluginIndexPath = path.join(mockPluginPath, 'index.mjs');

        vi.doMock(pluginIndexPath, () => ({ default: mockPlugin }));

        const result = await resourceLoader.loadPlugin(mockApp, mockPluginPath, mockOptions);

        expect(result).toBeInstanceOf(Result);
        expect(result.success).toBe(true);
        expect(result.value).toBe(true);
        expect(mockApp.register).toHaveBeenCalledWith(mockPlugin, {
          entityType: 'tenant',
          entityId: 'test-tenant',
          config: { test: true },
          namespace: '/Test/Plugin'
        });
        expect(mockLogger.info).toHaveBeenCalledWith('📦 Loaded plugin from /Test/Plugin');
      });

      test('should handle plugin without default export', async () => {
        const mockPlugin = vi.fn().mockResolvedValue(undefined);
        const pluginIndexPath = path.join(mockPluginPath, 'index.mjs');

        // Mock module without default export - should fail since it's not a function
        vi.doMock(pluginIndexPath, () => ({ plugin: mockPlugin }));

        const result = await resourceLoader.loadPlugin(mockApp, mockPluginPath, mockOptions);

        expect(result.success).toBe(false);
        expect(result.error).toContain('No "default" export is defined');
      });

      test('should exclude fastify from options when registering', async () => {
        const mockPlugin = vi.fn().mockResolvedValue(undefined);
        const pluginIndexPath = path.join(mockPluginPath, 'index.mjs');
        const optionsWithFastify = { ...mockOptions, fastify: mockApp };

        vi.doMock(pluginIndexPath, () => ({ default: mockPlugin }));

        const result = await resourceLoader.loadPlugin(mockApp, mockPluginPath, optionsWithFastify);

        expect(result.success).toBe(true);
        expect(mockApp.register).toHaveBeenCalledWith(mockPlugin, {
          entityType: 'tenant',
          entityId: 'test-tenant',
          config: { test: true },
          namespace: '/Test/Plugin'
          // fastify should be excluded
        });
      });
    });

    describe('Plugin Not Found', () => {
      test('should handle missing index.mjs file', async () => {
        mockPathResolver.pathExists.mockResolvedValue(false);

        const result = await resourceLoader.loadPlugin(mockApp, mockPluginPath, mockOptions);

        expect(result).toBeInstanceOf(Result);
        expect(result.success).toBe(false);
        expect(result.error).toContain('Plugin file not found');
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Plugin file not found'),
          '/Test/Plugin'
        );
      });
    });

    describe('Error Handling', () => {
      test('should handle non-function plugin exports', async () => {
        const pluginIndexPath = path.join(mockPluginPath, 'index.mjs');
        vi.doMock(pluginIndexPath, () => ({ default: 'not-a-function' }));

        const result = await resourceLoader.loadPlugin(mockApp, mockPluginPath, mockOptions);

        expect(result.success).toBe(false);
        expect(result.error).toContain('does not export a function');
      });

      test('should handle database dialect errors', async () => {
        const mockPlugin = vi.fn().mockRejectedValue(new Error('Dialect needs to be explicitly supplied'));
        const pluginIndexPath = path.join(mockPluginPath, 'index.mjs');

        // Make register actually call the plugin to trigger the error
        mockApp.register.mockImplementationOnce(async (plugin, options) => {
          await plugin(mockApp, options);
        });

        vi.doMock(pluginIndexPath, () => ({ default: mockPlugin }));

        const result = await resourceLoader.loadPlugin(mockApp, mockPluginPath, mockOptions);

        expect(result.success).toBe(false);
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({ err: expect.any(Error) }),
          expect.stringContaining('Database configuration error')
        );
      });

      test('should handle database connection errors', async () => {
        const mockPlugin = vi.fn().mockRejectedValue(new Error('ECONNREFUSED: Connection failed'));
        const pluginIndexPath = path.join(mockPluginPath, 'index.mjs');

        // Make register actually call the plugin to trigger the error
        mockApp.register.mockImplementationOnce(async (plugin, options) => {
          await plugin(mockApp, options);
        });

        vi.doMock(pluginIndexPath, () => ({ default: mockPlugin }));

        const result = await resourceLoader.loadPlugin(mockApp, mockPluginPath, mockOptions);

        expect(result.success).toBe(false);
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('Database connection refused')
        );
      });

      test('should handle database authentication errors', async () => {
        const mockPlugin = vi.fn().mockRejectedValue(new Error('authentication failed for user'));
        const pluginIndexPath = path.join(mockPluginPath, 'index.mjs');

        // Make register actually call the plugin to trigger the error
        mockApp.register.mockImplementationOnce(async (plugin, options) => {
          await plugin(mockApp, options);
        });

        vi.doMock(pluginIndexPath, () => ({ default: mockPlugin }));

        const result = await resourceLoader.loadPlugin(mockApp, mockPluginPath, mockOptions);

        expect(result.success).toBe(false);
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('Database authentication failed')
        );
      });

      test('should handle general plugin errors', async () => {
        const mockPlugin = vi.fn().mockRejectedValue(new Error('General plugin error'));
        const pluginIndexPath = path.join(mockPluginPath, 'index.mjs');

        // Make register actually call the plugin to trigger the error
        mockApp.register.mockImplementationOnce(async (plugin, options) => {
          await plugin(mockApp, options);
        });

        vi.doMock(pluginIndexPath, () => ({ default: mockPlugin }));

        const result = await resourceLoader.loadPlugin(mockApp, mockPluginPath, mockOptions);

        expect(result.success).toBe(false);
        expect(result.error).toBe('General plugin error');
        expect(mockLogger.error).toHaveBeenCalledWith(
          { err: expect.any(Error) },
          expect.stringContaining('❌ Failed to load plugin from')
        );
      });
    });

    describe('Trusted Path Handling', () => {
      test('should handle trusted paths correctly', async () => {
        const trustedPath = '/trusted/plugin';
        const options = { ...mockOptions, isTrustedPath: true };
        const mockPlugin = vi.fn().mockResolvedValue(undefined);
        const pluginIndexPath = path.join(trustedPath, 'index.mjs');

        vi.doMock(pluginIndexPath, () => ({ default: mockPlugin }));

        const result = await resourceLoader.loadPlugin(mockApp, trustedPath, options);

        expect(result.success).toBe(true);
        expect(mockPathResolver.pathExists).toHaveBeenCalledWith(
          path.join(trustedPath, 'index.mjs'),
          { allowTrusted: true }
        );
      });
    });
  });

  describe('loadSchemas()', () => {
    const mockSchemaPath = '/test/schemas';
    const mockApp = MockFactories.createMockFastifyApp();

    describe('Successful Loading', () => {
      test('should load JSON schemas', async () => {
        const schemaFiles = [
          '/test/schemas/user.json',
          '/test/schemas/product.json'
        ];

        fastGlob.mockResolvedValue(schemaFiles);

        const userSchema = { $id: 'user-schema', type: 'object', properties: { id: { type: 'string' } } };
        const productSchema = { $id: 'product-schema', type: 'object', properties: { name: { type: 'string' } } };

        fs.readFile
          .mockResolvedValueOnce(JSON.stringify(userSchema))
          .mockResolvedValueOnce(JSON.stringify(productSchema));

        const result = await resourceLoader.loadSchemas(mockApp, mockSchemaPath);

        expect(result).toBeInstanceOf(Result);
        expect(result.success).toBe(true);
        expect(result.value).toEqual(['user-schema', 'product-schema']);
        expect(mockApp.addSchema).toHaveBeenCalledWith(userSchema);
        expect(mockApp.addSchema).toHaveBeenCalledWith(productSchema);
      });

      test('should load JavaScript/MJS schemas', async () => {
        const schemaFiles = ['/test/schemas/dynamic.mjs'];
        fastGlob.mockResolvedValue(schemaFiles);

        const dynamicSchema = { $id: 'dynamic-schema', type: 'object' };
        vi.doMock('/test/schemas/dynamic.mjs', () => ({ default: dynamicSchema }));

        const result = await resourceLoader.loadSchemas(mockApp, mockSchemaPath);

        expect(result.success).toBe(true);
        expect(result.value).toEqual(['dynamic-schema']);
        expect(mockApp.addSchema).toHaveBeenCalledWith(dynamicSchema);
      });

      test('should handle mixed schema file types', async () => {
        const schemaFiles = [
          '/test/schemas/json-schema.json',
          '/test/schemas/js-schema.mjs'
        ];

        fastGlob.mockResolvedValue(schemaFiles);

        const jsonSchema = { $id: 'json-schema', type: 'object' };
        const jsSchema = { $id: 'js-schema', type: 'array' };

        fs.readFile.mockResolvedValue(JSON.stringify(jsonSchema));
        vi.doMock('/test/schemas/js-schema.mjs', () => ({ default: jsSchema }));

        const result = await resourceLoader.loadSchemas(mockApp, mockSchemaPath);

        expect(result.success).toBe(true);
        expect(result.value).toEqual(['json-schema', 'js-schema']);
      });
    });

    describe('Schema Validation', () => {
      test('should skip schemas without $id property', async () => {
        const schemaFiles = ['/test/schemas/invalid.json'];
        fastGlob.mockResolvedValue(schemaFiles);

        const invalidSchema = { type: 'object' }; // Missing $id
        fs.readFile.mockResolvedValue(JSON.stringify(invalidSchema));

        const result = await resourceLoader.loadSchemas(mockApp, mockSchemaPath);

        expect(result.success).toBe(true);
        expect(result.value).toEqual([]);
        expect(mockApp.addSchema).not.toHaveBeenCalled();
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('does not have an $id property')
        );
      });
    });

    describe('Directory Not Found', () => {
      test('should return empty array when directory does not exist', async () => {
        mockPathResolver.pathExists.mockResolvedValue(false);

        const result = await resourceLoader.loadSchemas(mockApp, mockSchemaPath);

        expect(result).toBeInstanceOf(Result);
        expect(result.success).toBe(true);
        expect(result.value).toEqual([]);
        expect(mockLogger.debug).toHaveBeenCalledWith(
          `No schemas directory found at ${mockSchemaPath}`
        );
      });
    });

    describe('Error Handling', () => {
      test('should handle JSON parsing errors', async () => {
        const schemaFiles = ['/test/schemas/malformed.json'];
        fastGlob.mockResolvedValue(schemaFiles);

        fs.readFile.mockResolvedValue('{ invalid json }');

        const result = await resourceLoader.loadSchemas(mockApp, mockSchemaPath);

        expect(result.success).toBe(true);
        expect(result.value).toEqual([]);
        expect(mockLogger.error).toHaveBeenCalledWith(
          { err: expect.any(Error) },
          '❌ Failed to load schema from /test/schemas/malformed.json'
        );
      });

      test('should handle module import errors', async () => {
        const schemaFiles = ['/test/schemas/failing.mjs'];
        fastGlob.mockResolvedValue(schemaFiles);

        vi.doMock('/test/schemas/failing.mjs', () => {
          throw new Error('Import failed');
        });

        const result = await resourceLoader.loadSchemas(mockApp, mockSchemaPath);

        expect(result.success).toBe(true);
        expect(result.value).toEqual([]);
        expect(mockLogger.error).toHaveBeenCalledWith(
          { err: expect.any(Error) },
          '❌ Failed to load schema from /test/schemas/failing.mjs'
        );
      });

      test('should handle file system errors', async () => {
        mockPathResolver.pathExists.mockRejectedValue(new Error('Access denied'));

        const result = await resourceLoader.loadSchemas(mockApp, mockSchemaPath);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Access denied');
        expect(mockLogger.error).toHaveBeenCalledWith(
          { err: expect.any(Error) },
          `Failed to load schemas from ${mockSchemaPath}`
        );
      });
    });
  });

  describe('loadConfig()', () => {
    const mockConfigPath = '/test/config';
    const mockDefaults = { defaultValue: true };

    describe('Successful Loading', () => {
      test('should load JSON config files', async () => {
        const configFiles = ['/test/config/config.json'];
        fastGlob.mockResolvedValue(configFiles);

        const jsonConfig = { server: { port: 3000 } };
        fs.readFile.mockResolvedValue(JSON.stringify(jsonConfig));

        const result = await resourceLoader.loadConfig(mockConfigPath, mockDefaults);

        expect(result).toEqual({
          defaultValue: true,
          server: { port: 3000 }
        });
        expect(mockLogger.debug).toHaveBeenCalledWith(
          'Loaded configuration from /test/config/config.json'
        );
      });

      test('should load JavaScript/MJS config files', async () => {
        const configFiles = ['/test/config/config.mjs'];
        fastGlob.mockResolvedValue(configFiles);

        const jsConfig = { database: { host: 'localhost' } };
        vi.doMock('/test/config/config.mjs', () => ({ default: jsConfig }));

        const result = await resourceLoader.loadConfig(mockConfigPath, mockDefaults);

        expect(result).toEqual({
          defaultValue: true,
          database: { host: 'localhost' }
        });
      });

      test('should merge multiple config files', async () => {
        const configFiles = [
          '/test/config/config.json',
          '/test/config/config.mjs'
        ];
        fastGlob.mockResolvedValue(configFiles);

        const jsonConfig = { server: { port: 3000 } };
        const jsConfig = { database: { host: 'localhost' } };

        fs.readFile.mockResolvedValue(JSON.stringify(jsonConfig));
        vi.doMock('/test/config/config.mjs', () => ({ default: jsConfig }));

        const result = await resourceLoader.loadConfig(mockConfigPath, mockDefaults);

        expect(result).toEqual({
          defaultValue: true,
          server: { port: 3000 },
          database: { host: 'localhost' }
        });
      });

      test('should handle config files without default export', async () => {
        const configFiles = ['/test/config/config.mjs'];
        fastGlob.mockResolvedValue(configFiles);

        const jsConfig = { direct: true };
        // Mock the module such that configModule.default is undefined but configModule has the config
        // This tests the || configModule fallback part of: configModule.default || configModule
        vi.doMock('/test/config/config.mjs', () => {
          // Create an object that when used as configModule.default || configModule, 
          // the || configModule part resolves to our config
          return Object.assign({}, jsConfig, {
            // Ensure default is undefined to test the fallback
            default: undefined
          });
        });

        const result = await resourceLoader.loadConfig(mockConfigPath, mockDefaults);

        expect(result).toEqual({
          defaultValue: true,
          direct: true
        });
      });
    });

    describe('No Config Files', () => {
      test('should return defaults when no config files found', async () => {
        fastGlob.mockResolvedValue([]);

        const result = await resourceLoader.loadConfig(mockConfigPath, mockDefaults);

        expect(result).toEqual(mockDefaults);
        expect(mockLogger.debug).toHaveBeenCalledWith(
          `No config files found in ${mockConfigPath}`
        );
      });
    });

    describe('Error Handling', () => {
      test('should handle JSON parsing errors and continue', async () => {
        const configFiles = [
          '/test/config/good.json',
          '/test/config/bad.json'
        ];
        fastGlob.mockResolvedValue(configFiles);

        const goodConfig = { good: true };
        fs.readFile
          .mockResolvedValueOnce(JSON.stringify(goodConfig))
          .mockResolvedValueOnce('{ invalid json }');

        const result = await resourceLoader.loadConfig(mockConfigPath, mockDefaults);

        expect(result).toEqual({
          defaultValue: true,
          good: true
        });
        expect(mockLogger.error).toHaveBeenCalledWith(
          { err: expect.any(Error) },
          '❌ Failed to load config from /test/config/bad.json'
        );
      });

      test('should handle module import errors and continue', async () => {
        const configFiles = ['/test/config/failing.mjs'];
        fastGlob.mockResolvedValue(configFiles);

        vi.doMock('/test/config/failing.mjs', () => {
          // Return an object with a getter that throws when accessed
          // This simulates a module that fails during property access
          return {
            get default() {
              throw new Error('Import failed');
            }
          };
        });

        const result = await resourceLoader.loadConfig(mockConfigPath, mockDefaults);

        expect(result).toEqual(mockDefaults);
        expect(mockLogger.error).toHaveBeenCalledWith(
          { err: expect.any(Error) },
          '❌ Failed to load config from /test/config/failing.mjs'
        );
      });

      test('should handle file system errors and return defaults', async () => {
        fastGlob.mockRejectedValue(new Error('Permission denied'));

        const result = await resourceLoader.loadConfig(mockConfigPath, mockDefaults);

        expect(result).toEqual(mockDefaults);
        expect(mockLogger.error).toHaveBeenCalledWith(
          { err: expect.any(Error) },
          `❌ Failed to load config from ${mockConfigPath}`
        );
      });
    });

    describe('Trusted Path Handling', () => {
      test('should handle trusted paths correctly', async () => {
        const trustedPath = '/trusted/config';
        const options = { isTrustedPath: true };

        fastGlob.mockResolvedValue([]);

        const result = await resourceLoader.loadConfig(trustedPath, mockDefaults, options);

        expect(result).toEqual(mockDefaults);
        // Should use trustedPath directly without path resolution
      });
    });
  });

  describe('Resource Caching', () => {
    test('should cache services results', async () => {
      const servicePath = '/test/services';
      fastGlob.mockResolvedValue(['/test/services/service.mjs']);
      vi.doMock('/test/services/service.mjs', () => ({ default: { cached: true } }));

      // First load
      const result1 = await resourceLoader.loadServices(servicePath);
      expect(result1.success).toBe(true);

      // Verify it's cached
      expect(resourceLoader.loadedResources.has(`services:${servicePath}`)).toBe(true);

      // Second load should use cache
      const result2 = await resourceLoader.loadServices(servicePath);
      expect(result2.success).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `Returning cached services for ${servicePath}`
      );
    });

    test('should maintain separate cache entries for different paths', async () => {
      const path1 = '/test/services1';
      const path2 = '/test/services2';

      fastGlob
        .mockResolvedValueOnce(['/test/services1/service.mjs'])
        .mockResolvedValueOnce(['/test/services2/service.mjs']);

      vi.doMock('/test/services1/service.mjs', () => ({ default: { from: 'path1' } }));
      vi.doMock('/test/services2/service.mjs', () => ({ default: { from: 'path2' } }));

      const result1 = await resourceLoader.loadServices(path1);
      const result2 = await resourceLoader.loadServices(path2);

      expect(result1.value.service.from).toBe('path1');
      expect(result2.value.service.from).toBe('path2');
      expect(resourceLoader.loadedResources.size).toBe(2);
    });
  });

  describe('clearCache()', () => {
    beforeEach(async () => {
      // Pre-populate cache with different resource types
      fastGlob.mockResolvedValue(['/test/services/service.mjs']);
      vi.doMock('/test/services/service.mjs', () => ({ default: { test: true } }));

      await resourceLoader.loadServices('/test/services1');
      await resourceLoader.loadServices('/test/services2');

      // Manually add some cached entries to simulate different types
      resourceLoader.loadedResources.set('plugins:/test/plugin1', { plugin: true });
      resourceLoader.loadedResources.set('schemas:/test/schema1', ['schema1']);
    });

    test('should clear all cache entries when no type specified', () => {
      expect(resourceLoader.loadedResources.size).toBe(4);

      resourceLoader.clearCache();

      expect(resourceLoader.loadedResources.size).toBe(0);
    });

    test('should clear only specific type cache entries', () => {
      expect(resourceLoader.loadedResources.size).toBe(4);

      resourceLoader.clearCache('services');

      expect(resourceLoader.loadedResources.size).toBe(2);
      expect(resourceLoader.loadedResources.has('services:/test/services1')).toBe(false);
      expect(resourceLoader.loadedResources.has('services:/test/services2')).toBe(false);
      expect(resourceLoader.loadedResources.has('plugins:/test/plugin1')).toBe(true);
      expect(resourceLoader.loadedResources.has('schemas:/test/schema1')).toBe(true);
    });

    test('should handle clearing non-existent type', () => {
      const initialSize = resourceLoader.loadedResources.size;

      resourceLoader.clearCache('nonexistent');

      expect(resourceLoader.loadedResources.size).toBe(initialSize);
    });

    test('should clear cache with type prefix matching', () => {
      resourceLoader.clearCache('plugins');

      expect(resourceLoader.loadedResources.has('plugins:/test/plugin1')).toBe(false);
      expect(resourceLoader.loadedResources.has('services:/test/services1')).toBe(true);
    });
  });

  describe('getCacheStats()', () => {
    test('should return empty stats when cache is empty', () => {
      const stats = resourceLoader.getCacheStats();

      expect(stats).toEqual({
        totalEntries: 0,
        byType: {}
      });
    });

    test('should return correct statistics for cached resources', async () => {
      // Add various cached entries
      fastGlob.mockResolvedValue(['/test/services/service.mjs']);
      vi.doMock('/test/services/service.mjs', () => ({ default: { test: true } }));

      await resourceLoader.loadServices('/test/services1');
      await resourceLoader.loadServices('/test/services2');

      resourceLoader.loadedResources.set('plugins:/test/plugin1', { plugin: true });
      resourceLoader.loadedResources.set('schemas:/test/schema1', ['schema1']);
      resourceLoader.loadedResources.set('schemas:/test/schema2', ['schema2']);

      const stats = resourceLoader.getCacheStats();

      expect(stats).toEqual({
        totalEntries: 5,
        byType: {
          services: 2,
          plugins: 1,
          schemas: 2
        }
      });
    });

    test('should handle cache keys with multiple colons', () => {
      resourceLoader.loadedResources.set('services:path:with:colons', {});

      const stats = resourceLoader.getCacheStats();

      expect(stats).toEqual({
        totalEntries: 1,
        byType: {
          services: 1
        }
      });
    });
  });

  describe('isCached()', () => {
    beforeEach(() => {
      resourceLoader.loadedResources.set('services:/test/path', { cached: true });
    });

    test('should return true for cached key', () => {
      expect(resourceLoader.isCached('services:/test/path')).toBe(true);
    });

    test('should return false for non-cached key', () => {
      expect(resourceLoader.isCached('services:/other/path')).toBe(false);
    });

    test('should handle undefined and null keys', () => {
      expect(resourceLoader.isCached(undefined)).toBe(false);
      expect(resourceLoader.isCached(null)).toBe(false);
    });

    test('should handle empty string key', () => {
      expect(resourceLoader.isCached('')).toBe(false);
    });
  });

  describe('getCached()', () => {
    const cachedData = { test: 'data', value: 42 };

    beforeEach(() => {
      resourceLoader.loadedResources.set('services:/test/path', cachedData);
    });

    test('should return cached data for valid key', () => {
      const result = resourceLoader.getCached('services:/test/path');
      expect(result).toEqual(cachedData);
    });

    test('should return undefined for non-cached key', () => {
      const result = resourceLoader.getCached('services:/other/path');
      expect(result).toBeUndefined();
    });

    test('should handle undefined and null keys', () => {
      expect(resourceLoader.getCached(undefined)).toBeUndefined();
      expect(resourceLoader.getCached(null)).toBeUndefined();
    });

    test('should return exact cached object reference', () => {
      const result = resourceLoader.getCached('services:/test/path');
      expect(result).toBe(cachedData);
    });

    test('should handle different data types in cache', () => {
      resourceLoader.loadedResources.set('array-key', [1, 2, 3]);
      resourceLoader.loadedResources.set('string-key', 'test string');
      resourceLoader.loadedResources.set('number-key', 123);
      resourceLoader.loadedResources.set('null-value', null);

      expect(resourceLoader.getCached('array-key')).toEqual([1, 2, 3]);
      expect(resourceLoader.getCached('string-key')).toBe('test string');
      expect(resourceLoader.getCached('number-key')).toBe(123);
      expect(resourceLoader.getCached('null-value')).toBe(null);
    });
  });
});