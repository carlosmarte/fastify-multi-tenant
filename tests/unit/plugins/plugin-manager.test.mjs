import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { PluginManager, Result } from '../../../main.mjs';
import { MockFactories } from '../../helpers/mock-factories.mjs';
import fs from 'fs/promises';
import path from 'path';

// Mock dependencies
vi.mock('fs/promises');

describe('PluginManager', () => {
  let pluginManager;
  let mockLogger;
  let mockPathResolver;
  let mockSecurityService;
  let mockApp;
  let tempDir;
  let cleanupEnv;

  beforeEach(() => {
    mockLogger = MockFactories.createMockLogger();
    tempDir = MockFactories.createTempDir();
    
    mockPathResolver = {
      baseDir: tempDir.name,
      pathExists: vi.fn().mockResolvedValue(true)
    };

    mockSecurityService = {
      validatePluginName: vi.fn().mockImplementation(name => name)
    };

    mockApp = MockFactories.createMockFastifyApp();

    pluginManager = new PluginManager(mockLogger, mockPathResolver, mockSecurityService);
    
    cleanupEnv = MockFactories.setupMockEnv();
  });

  afterEach(() => {
    cleanupEnv?.();
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with dependencies', () => {
      expect(pluginManager.logger).toBe(mockLogger);
      expect(pluginManager.pathResolver).toBe(mockPathResolver);
      expect(pluginManager.securityService).toBe(mockSecurityService);
      expect(pluginManager.pluginCache).toBeDefined();
      expect(pluginManager.pluginCache.size).toBe(0);
    });
  });

  describe('loadLocalPlugin()', () => {
    const pluginName = 'test-plugin';
    const mockOptions = {
      entityType: 'tenant',
      entityId: 'test-tenant',
      config: { test: true }
    };

    describe('Successful Loading', () => {
      test('should load and register local plugin', async () => {
        const mockPlugin = vi.fn().mockResolvedValue(undefined);
        const pluginPath = path.join(tempDir.name, 'plugins', pluginName, 'index.mjs');
        
        vi.doMock(pluginPath, () => ({ default: mockPlugin }));
        mockSecurityService.validatePluginName.mockReturnValue(pluginName);

        const result = await pluginManager.loadLocalPlugin(mockApp, pluginName, mockOptions);

        expect(result).toBeInstanceOf(Result);
        expect(result.success).toBe(true);
        expect(result.value.plugin).toBe(mockPlugin);
        expect(result.value.cached).toBe(false);

        expect(mockSecurityService.validatePluginName).toHaveBeenCalledWith(pluginName);
        expect(mockApp.register).toHaveBeenCalledWith(mockPlugin, mockOptions);
        expect(mockLogger.debug).toHaveBeenCalledWith(`Registered plugin ${pluginName}`);
      });

      test('should cache plugin after first load', async () => {
        const mockPlugin = vi.fn().mockResolvedValue(undefined);
        const pluginPath = path.join(tempDir.name, 'plugins', pluginName, 'index.mjs');
        
        vi.doMock(pluginPath, () => ({ default: mockPlugin }));

        // First load
        const result1 = await pluginManager.loadLocalPlugin(mockApp, pluginName, mockOptions);
        expect(result1.value.cached).toBe(false);

        // Second load should use cache
        const result2 = await pluginManager.loadLocalPlugin(mockApp, pluginName, mockOptions);
        expect(result2.success).toBe(true);
        expect(result2.value.cached).toBe(true);
        expect(mockLogger.debug).toHaveBeenCalledWith(`Registered cached plugin ${pluginName}`);
      });

      test('should handle plugin without default export', async () => {
        const mockPlugin = vi.fn().mockResolvedValue(undefined);
        const pluginPath = path.join(tempDir.name, 'plugins', pluginName, 'index.mjs');
        
        // Since Vitest is strict about vi.doMock returning objects,
        // and the test is supposed to verify "plugin without default export",
        // let's return a plain object that doesn't have a 'default' property.
        // The PluginManager will try to use this object as the plugin,
        // which should fail the typeof function check and return an error.
        vi.doMock(pluginPath, () => ({
          // This is an object without a default export
          someName: 'test-export',
          version: '1.0.0'
        }));

        const result = await pluginManager.loadLocalPlugin(mockApp, pluginName, mockOptions);
        
        // Vitest will return an error about missing default export
        expect(result.success).toBe(false);
        expect(result.error).toContain('No "default" export is defined');
      });

      test('should exclude fastify from options when registering', async () => {
        const mockPlugin = vi.fn().mockResolvedValue(undefined);
        const pluginPath = path.join(tempDir.name, 'plugins', pluginName, 'index.mjs');
        const optionsWithFastify = { ...mockOptions, fastify: mockApp };
        
        vi.doMock(pluginPath, () => ({ default: mockPlugin }));

        const result = await pluginManager.loadLocalPlugin(mockApp, pluginName, optionsWithFastify);

        expect(result.success).toBe(true);
        expect(mockApp.register).toHaveBeenCalledWith(mockPlugin, mockOptions); // fastify excluded
      });

      test('should validate plugin name before loading', async () => {
        const sanitizedName = 'sanitized-plugin';
        mockSecurityService.validatePluginName.mockReturnValue(sanitizedName);
        
        const mockPlugin = vi.fn().mockResolvedValue(undefined);
        const pluginPath = path.join(tempDir.name, 'plugins', sanitizedName, 'index.mjs');
        
        vi.doMock(pluginPath, () => ({ default: mockPlugin }));

        const result = await pluginManager.loadLocalPlugin(mockApp, 'unsafe-plugin-name', mockOptions);

        expect(result.success).toBe(true);
        expect(mockSecurityService.validatePluginName).toHaveBeenCalledWith('unsafe-plugin-name');
        expect(mockPathResolver.pathExists).toHaveBeenCalledWith(pluginPath);
      });
    });

    describe('Plugin Not Found', () => {
      test('should handle missing plugin file', async () => {
        mockPathResolver.pathExists.mockResolvedValue(false);

        const result = await pluginManager.loadLocalPlugin(mockApp, pluginName, mockOptions);

        expect(result).toBeInstanceOf(Result);
        expect(result.success).toBe(false);
        expect(result.error).toBe(`Plugin not found: ${pluginName}`);
      });
    });

    describe('Error Handling', () => {
      test('should handle non-function plugin exports', async () => {
        const pluginPath = path.join(tempDir.name, 'plugins', pluginName, 'index.mjs');
        vi.doMock(pluginPath, () => ({ default: 'not-a-function' }));

        const result = await pluginManager.loadLocalPlugin(mockApp, pluginName, mockOptions);

        expect(result.success).toBe(false);
        expect(result.error).toBe(`Plugin is not a function: ${pluginName}`);
      });

      test('should handle database dialect errors for database plugins', async () => {
        // Mock app.register to throw the database error instead of the plugin itself
        mockApp.register.mockRejectedValueOnce(new Error('Dialect needs to be explicitly supplied'));
        
        const mockPlugin = vi.fn().mockResolvedValue(undefined);
        const pluginPath = path.join(tempDir.name, 'plugins', 'sequelize-db', 'index.mjs');
        
        vi.doMock(pluginPath, () => ({ default: mockPlugin }));

        const result = await pluginManager.loadLocalPlugin(mockApp, 'sequelize-db', mockOptions);

        expect(result.success).toBe(false);
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({ err: expect.any(Error) }),
          expect.stringContaining("DB_DIALECT not set")
        );
      });

      test('should handle general database plugin errors', async () => {
        // Mock app.register to throw the database error
        mockApp.register.mockRejectedValueOnce(new Error('Database connection failed'));
        
        const mockPlugin = vi.fn().mockResolvedValue(undefined);
        const pluginPath = path.join(tempDir.name, 'plugins', 'database', 'index.mjs');
        
        vi.doMock(pluginPath, () => ({ default: mockPlugin }));

        const result = await pluginManager.loadLocalPlugin(mockApp, 'database', mockOptions);

        expect(result.success).toBe(false);
        expect(mockLogger.error).toHaveBeenCalledWith(
          { err: expect.any(Error) },
          '❌ Database plugin database failed to initialize'
        );
      });

      test('should handle general plugin errors', async () => {
        // Mock app.register to throw the plugin error
        mockApp.register.mockRejectedValueOnce(new Error('Plugin initialization failed'));
        
        const mockPlugin = vi.fn().mockResolvedValue(undefined);
        const pluginPath = path.join(tempDir.name, 'plugins', pluginName, 'index.mjs');
        
        vi.doMock(pluginPath, () => ({ default: mockPlugin }));

        const result = await pluginManager.loadLocalPlugin(mockApp, pluginName, mockOptions);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Plugin initialization failed');
        expect(mockLogger.error).toHaveBeenCalledWith(
          { err: expect.any(Error) },
          `❌ Failed to load plugin ${pluginName}`
        );
      });

      test('should handle plugin name validation errors', async () => {
        mockSecurityService.validatePluginName.mockImplementation(() => {
          throw new Error('Invalid plugin name');
        });

        const result = await pluginManager.loadLocalPlugin(mockApp, 'invalid-name', mockOptions);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid plugin name');
      });
    });

    describe('Plugin Caching', () => {
      test('should maintain separate cache entries for different plugins', async () => {
        const plugin1 = vi.fn().mockResolvedValue(undefined);
        const plugin2 = vi.fn().mockResolvedValue(undefined);
        
        const pluginPath1 = path.join(tempDir.name, 'plugins', 'plugin1', 'index.mjs');
        const pluginPath2 = path.join(tempDir.name, 'plugins', 'plugin2', 'index.mjs');
        
        vi.doMock(pluginPath1, () => ({ default: plugin1 }));
        vi.doMock(pluginPath2, () => ({ default: plugin2 }));

        const result1 = await pluginManager.loadLocalPlugin(mockApp, 'plugin1', mockOptions);
        const result2 = await pluginManager.loadLocalPlugin(mockApp, 'plugin2', mockOptions);

        expect(result1.success).toBe(true);
        expect(result2.success).toBe(true);
        expect(pluginManager.pluginCache.size).toBe(2);
        expect(pluginManager.pluginCache.has('local:plugin1')).toBe(true);
        expect(pluginManager.pluginCache.has('local:plugin2')).toBe(true);
      });

      test('should use correct cache keys for local plugins', async () => {
        const mockPlugin = vi.fn().mockResolvedValue(undefined);
        const pluginPath = path.join(tempDir.name, 'plugins', pluginName, 'index.mjs');
        
        vi.doMock(pluginPath, () => ({ default: mockPlugin }));

        await pluginManager.loadLocalPlugin(mockApp, pluginName, mockOptions);

        expect(pluginManager.pluginCache.has(`local:${pluginName}`)).toBe(true);
      });
    });
  });

  describe('loadNPMPlugin()', () => {
    const npmPluginName = 'fastify-cors';
    const mockOptions = {
      entityType: 'tenant',
      entityId: 'test-tenant',
      config: { origin: true }
    };

    describe('Successful Loading', () => {
      test('should load and register NPM plugin', async () => {
        const mockPlugin = vi.fn().mockResolvedValue(undefined);
        
        vi.doMock(npmPluginName, () => ({ default: mockPlugin }));

        const result = await pluginManager.loadNPMPlugin(mockApp, npmPluginName, mockOptions);

        expect(result).toBeInstanceOf(Result);
        expect(result.success).toBe(true);
        expect(result.value.plugin).toBe(mockPlugin);
        expect(result.value.cached).toBe(false);

        expect(mockApp.register).toHaveBeenCalledWith(mockPlugin, mockOptions);
        expect(mockLogger.info).toHaveBeenCalledWith(`✅ Loaded NPM plugin [${npmPluginName}]`);
      });

      test('should cache NPM plugin after first load', async () => {
        const mockPlugin = vi.fn().mockResolvedValue(undefined);
        
        vi.doMock(npmPluginName, () => ({ default: mockPlugin }));

        // First load
        const result1 = await pluginManager.loadNPMPlugin(mockApp, npmPluginName, mockOptions);
        expect(result1.value.cached).toBe(false);

        // Second load should use cache
        const result2 = await pluginManager.loadNPMPlugin(mockApp, npmPluginName, mockOptions);
        expect(result2.success).toBe(true);
        expect(result2.value.cached).toBe(true);
        expect(mockLogger.debug).toHaveBeenCalledWith(`Registered cached NPM plugin ${npmPluginName}`);
      });

      test('should handle NPM plugin without default export', async () => {
        const mockPlugin = vi.fn().mockResolvedValue(undefined);
        
        // Since Vitest is strict about vi.doMock returning objects,
        // and the test is supposed to verify "plugin without default export",
        // let's return a plain object that doesn't have a 'default' property.
        // The PluginManager will try to use this object as the plugin,
        // which should fail the typeof function check and return an error.
        vi.doMock(npmPluginName, () => ({
          // This is an object without a default export
          someName: 'test-export',
          version: '1.0.0'
        }));

        const result = await pluginManager.loadNPMPlugin(mockApp, npmPluginName, mockOptions);
        
        // Vitest will return an error about missing default export
        expect(result.success).toBe(false);
        expect(result.error).toContain('No "default" export is defined');
      });

      test('should exclude fastify from options when registering', async () => {
        const mockPlugin = vi.fn().mockResolvedValue(undefined);
        const optionsWithFastify = { ...mockOptions, fastify: mockApp };
        
        vi.doMock(npmPluginName, () => ({ default: mockPlugin }));

        const result = await pluginManager.loadNPMPlugin(mockApp, npmPluginName, optionsWithFastify);

        expect(result.success).toBe(true);
        expect(mockApp.register).toHaveBeenCalledWith(mockPlugin, mockOptions); // fastify excluded
      });
    });

    describe('Error Handling', () => {
      test('should handle module not found errors', async () => {
        // Use a plugin name that definitely doesn't exist to trigger natural module not found error
        const nonExistentPlugin = 'definitely-does-not-exist-plugin-xyz-12345';

        const result = await pluginManager.loadNPMPlugin(mockApp, nonExistentPlugin, mockOptions);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/Failed to load url|Cannot resolve|not found/i);
        expect(mockLogger.error).toHaveBeenCalledWith(
          { err: expect.any(Error) },
          `❌ Failed to load NPM plugin ${nonExistentPlugin}`
        );
      });

      test('should handle non-function NPM plugin exports', async () => {
        vi.doMock(npmPluginName, () => ({ default: 'not-a-function' }));

        const result = await pluginManager.loadNPMPlugin(mockApp, npmPluginName, mockOptions);

        expect(result.success).toBe(false);
        expect(result.error).toBe(`Plugin is not a function: ${npmPluginName}`);
      });

      test('should handle plugin registration errors', async () => {
        // Mock app.register to throw registration error
        mockApp.register.mockRejectedValueOnce(new Error('Registration failed'));
        
        const mockPlugin = vi.fn().mockResolvedValue(undefined);
        
        vi.doMock(npmPluginName, () => ({ default: mockPlugin }));

        const result = await pluginManager.loadNPMPlugin(mockApp, npmPluginName, mockOptions);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Registration failed');
      });
    });

    describe('NPM Plugin Caching', () => {
      test('should use correct cache keys for NPM plugins', async () => {
        const mockPlugin = vi.fn().mockResolvedValue(undefined);
        
        vi.doMock(npmPluginName, () => ({ default: mockPlugin }));

        await pluginManager.loadNPMPlugin(mockApp, npmPluginName, mockOptions);

        expect(pluginManager.pluginCache.has(`npm:${npmPluginName}`)).toBe(true);
      });

      test('should maintain separate caches for local and NPM plugins', async () => {
        const localPlugin = vi.fn().mockResolvedValue(undefined);
        const npmPlugin = vi.fn().mockResolvedValue(undefined);
        
        const localPluginPath = path.join(tempDir.name, 'plugins', 'test-plugin', 'index.mjs');
        vi.doMock(localPluginPath, () => ({ default: localPlugin }));
        vi.doMock(npmPluginName, () => ({ default: npmPlugin }));

        await pluginManager.loadLocalPlugin(mockApp, 'test-plugin', mockOptions);
        await pluginManager.loadNPMPlugin(mockApp, npmPluginName, mockOptions);

        expect(pluginManager.pluginCache.has('local:test-plugin')).toBe(true);
        expect(pluginManager.pluginCache.has(`npm:${npmPluginName}`)).toBe(true);
        expect(pluginManager.pluginCache.size).toBe(2);
      });
    });
  });

  describe('getNPMPluginNames()', () => {
    beforeEach(() => {
      // Don't reassign fs methods - vi.mock handles it
      // Just set default return values
      fs.readFile.mockResolvedValue('{}');
      fs.mkdir.mockResolvedValue(undefined);
      fs.readdir.mockResolvedValue([]);
      fs.stat.mockResolvedValue({ isDirectory: () => true });
    });

    describe('Successful Discovery', () => {
      test('should discover NPM plugins with default pattern', async () => {
        const mockPackageJson = {
          dependencies: {
            'fastify-entity-users': '1.0.0',
            'fastify-entity-products': '2.0.0',
            'fastify-cors': '1.0.0', // Should not match
            'express': '4.0.0' // Should not match
          },
          devDependencies: {
            'fastify-entity-test': '1.0.0'
          }
        };

        fs.readFile.mockResolvedValue(JSON.stringify(mockPackageJson));

        const result = await pluginManager.getNPMPluginNames();

        expect(result).toEqual([
          'fastify-entity-users',
          'fastify-entity-products',
          'fastify-entity-test'
        ]);
      });

      test('should discover plugins with custom pattern', async () => {
        const mockPackageJson = {
          dependencies: {
            'my-app-plugin-auth': '1.0.0',
            'my-app-plugin-db': '2.0.0',
            'fastify-cors': '1.0.0' // Should not match
          }
        };

        fs.readFile.mockResolvedValue(JSON.stringify(mockPackageJson));

        const result = await pluginManager.getNPMPluginNames('my-app-plugin-*');

        expect(result).toEqual([
          'my-app-plugin-auth',
          'my-app-plugin-db'
        ]);
      });

      test('should handle empty dependencies', async () => {
        const mockPackageJson = {
          dependencies: {},
          devDependencies: {}
        };

        fs.readFile.mockResolvedValue(JSON.stringify(mockPackageJson));

        const result = await pluginManager.getNPMPluginNames();

        expect(result).toEqual([]);
      });

      test('should handle missing dependencies sections', async () => {
        const mockPackageJson = {
          name: 'test-project'
        };

        fs.readFile.mockResolvedValue(JSON.stringify(mockPackageJson));

        const result = await pluginManager.getNPMPluginNames();

        expect(result).toEqual([]);
      });
    });

    describe('Error Handling', () => {
      test('should handle missing package.json', async () => {
        fs.readFile.mockRejectedValue(new Error('ENOENT: no such file'));

        const result = await pluginManager.getNPMPluginNames();

        expect(result).toEqual([]);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          { err: expect.any(Error) },
          'Failed to read package.json'
        );
      });

      test('should handle malformed package.json', async () => {
        fs.readFile.mockResolvedValue('{ invalid json }');

        const result = await pluginManager.getNPMPluginNames();

        expect(result).toEqual([]);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          { err: expect.any(Error) },
          'Failed to read package.json'
        );
      });
    });
  });

  describe('loadLocalPlugins()', () => {
    const pluginNames = ['plugin1', 'plugin2', 'plugin3'];
    const mockOptions = {
      plugin1: { option1: 'value1' },
      plugin2: { option2: 'value2' }
    };

    describe('Successful Loading', () => {
      test('should load multiple plugins successfully', async () => {
        const plugins = pluginNames.map(name => vi.fn().mockResolvedValue(undefined));
        
        pluginNames.forEach((name, index) => {
          const pluginPath = path.join(tempDir.name, 'plugins', name, 'index.mjs');
          vi.doMock(pluginPath, () => ({ default: plugins[index] }));
        });

        const result = await pluginManager.loadLocalPlugins(mockApp, pluginNames, mockOptions);

        expect(result).toBeInstanceOf(Result);
        expect(result.success).toBe(true);
        expect(result.value.successCount).toBe(3);
        expect(result.value.total).toBe(3);
        expect(result.value.results).toHaveLength(3);
        
        expect(mockLogger.info).toHaveBeenCalledWith(
          '✅ Successfully loaded 3/3 local plugins'
        );
      });

      test('should pass plugin-specific options', async () => {
        const plugin1 = vi.fn().mockResolvedValue(undefined);
        const plugin2 = vi.fn().mockResolvedValue(undefined);
        
        const plugin1Path = path.join(tempDir.name, 'plugins', 'plugin1', 'index.mjs');
        const plugin2Path = path.join(tempDir.name, 'plugins', 'plugin2', 'index.mjs');
        
        vi.doMock(plugin1Path, () => ({ default: plugin1 }));
        vi.doMock(plugin2Path, () => ({ default: plugin2 }));

        const result = await pluginManager.loadLocalPlugins(mockApp, ['plugin1', 'plugin2'], mockOptions);

        expect(result.success).toBe(true);
        expect(mockApp.register).toHaveBeenCalledWith(plugin1, mockOptions.plugin1);
        expect(mockApp.register).toHaveBeenCalledWith(plugin2, mockOptions.plugin2);
      });

      test('should handle plugins without specific options', async () => {
        const plugin3 = vi.fn().mockResolvedValue(undefined);
        
        const plugin3Path = path.join(tempDir.name, 'plugins', 'plugin3', 'index.mjs');
        vi.doMock(plugin3Path, () => ({ default: plugin3 }));

        const result = await pluginManager.loadLocalPlugins(mockApp, ['plugin3'], mockOptions);

        expect(result.success).toBe(true);
        expect(mockApp.register).toHaveBeenCalledWith(plugin3, {}); // Empty options
      });
    });

    describe('Partial Failures', () => {
      test('should handle mixed success and failure', async () => {
        const workingPlugin = vi.fn().mockResolvedValue(undefined);
        const failingPlugin = vi.fn().mockResolvedValue(undefined);
        
        const workingPath = path.join(tempDir.name, 'plugins', 'working', 'index.mjs');
        const failingPath = path.join(tempDir.name, 'plugins', 'failing', 'index.mjs');
        
        vi.doMock(workingPath, () => ({ default: workingPlugin }));
        vi.doMock(failingPath, () => ({ default: failingPlugin }));
        
        // Mock app.register to succeed for 'working' and fail for 'failing'
        mockApp.register
          .mockResolvedValueOnce(undefined) // working plugin succeeds
          .mockRejectedValueOnce(new Error('Plugin failed')); // failing plugin fails

        const result = await pluginManager.loadLocalPlugins(mockApp, ['working', 'failing']);

        expect(result.success).toBe(true);
        expect(result.value.successCount).toBe(1);
        expect(result.value.total).toBe(2);
        
        const workingResult = result.value.results.find(r => r.plugin === 'working');
        const failingResult = result.value.results.find(r => r.plugin === 'failing');
        
        expect(workingResult.success).toBe(true);
        expect(failingResult.success).toBe(false);
        
        expect(mockLogger.info).toHaveBeenCalledWith(
          '✅ Successfully loaded 1/2 local plugins'
        );
      });

      test('should continue loading when one plugin fails', async () => {
        mockPathResolver.pathExists
          .mockResolvedValueOnce(false) // first plugin not found
          .mockResolvedValueOnce(true); // second plugin exists
          
        const workingPlugin = vi.fn().mockResolvedValue(undefined);
        const workingPath = path.join(tempDir.name, 'plugins', 'working', 'index.mjs');
        vi.doMock(workingPath, () => ({ default: workingPlugin }));

        const result = await pluginManager.loadLocalPlugins(mockApp, ['missing', 'working']);

        expect(result.success).toBe(true);
        expect(result.value.successCount).toBe(1);
        expect(result.value.total).toBe(2);
      });
    });

    describe('Empty Plugin List', () => {
      test('should handle empty plugin list', async () => {
        const result = await pluginManager.loadLocalPlugins(mockApp, []);

        expect(result.success).toBe(true);
        expect(result.value.successCount).toBe(0);
        expect(result.value.total).toBe(0);
        expect(result.value.results).toEqual([]);
        
        expect(mockLogger.info).toHaveBeenCalledWith(
          '✅ Successfully loaded 0/0 local plugins'
        );
      });
    });
  });

  describe('Plugin Manager Integration', () => {
    test('should handle both local and NPM plugins independently', async () => {
      const localPlugin = vi.fn().mockResolvedValue(undefined);
      const npmPlugin = vi.fn().mockResolvedValue(undefined);
      
      const localPath = path.join(tempDir.name, 'plugins', 'local-plugin', 'index.mjs');
      vi.doMock(localPath, () => ({ default: localPlugin }));
      vi.doMock('npm-plugin', () => ({ default: npmPlugin }));

      const localResult = await pluginManager.loadLocalPlugin(mockApp, 'local-plugin');
      const npmResult = await pluginManager.loadNPMPlugin(mockApp, 'npm-plugin');

      expect(localResult.success).toBe(true);
      expect(npmResult.success).toBe(true);
      expect(pluginManager.pluginCache.size).toBe(2);
    });

    test('should maintain separate error handling for different plugin types', async () => {
      mockPathResolver.pathExists.mockResolvedValue(false); // Local plugin not found
      
      // Instead of mocking with doMock, we'll stub the import behavior directly
      // by mocking a non-existent plugin name that will naturally fail to import
      const localResult = await pluginManager.loadLocalPlugin(mockApp, 'missing-local');
      const npmResult = await pluginManager.loadNPMPlugin(mockApp, 'definitely-does-not-exist-plugin-12345');

      expect(localResult.success).toBe(false);
      expect(localResult.error).toBe('Plugin not found: missing-local');
      
      expect(npmResult.success).toBe(false);
      expect(npmResult.error).toContain('Failed to load url');
    });

    test('should handle complex plugin loading scenarios', async () => {
      // Test database plugin with specific error handling
      const dbPlugin = vi.fn().mockResolvedValue(undefined);
      const dbPluginPath = path.join(tempDir.name, 'plugins', 'database', 'index.mjs');
      vi.doMock(dbPluginPath, () => ({ default: dbPlugin }));

      // Test regular plugin
      const regularPlugin = vi.fn().mockResolvedValue(undefined);
      const regularPluginPath = path.join(tempDir.name, 'plugins', 'regular', 'index.mjs');
      vi.doMock(regularPluginPath, () => ({ default: regularPlugin }));
      
      // Mock app.register to fail for database plugin and succeed for regular plugin
      mockApp.register
        .mockRejectedValueOnce(new Error('Dialect needs to be explicitly supplied')) // database fails
        .mockResolvedValueOnce(undefined); // regular succeeds

      const dbResult = await pluginManager.loadLocalPlugin(mockApp, 'database');
      const regularResult = await pluginManager.loadLocalPlugin(mockApp, 'regular');

      expect(dbResult.success).toBe(false);
      expect(regularResult.success).toBe(true);
      
      // Database plugin should have specific error message for dialect error
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        'Database plugin database failed: DB_DIALECT not set. Please set DB_DIALECT to \'postgres\', \'mysql\', or \'sqlite\''
      );
    });
  });

  describe('Cache Management', () => {
    test('should properly manage cache across different plugin types and names', async () => {
      const plugins = [
        { type: 'local', name: 'plugin1' },
        { type: 'local', name: 'plugin2' },
        { type: 'npm', name: 'npm-plugin1' },
        { type: 'npm', name: 'npm-plugin2' }
      ];

      for (const { type, name } of plugins) {
        const mockPlugin = vi.fn().mockResolvedValue(undefined);
        
        if (type === 'local') {
          const pluginPath = path.join(tempDir.name, 'plugins', name, 'index.mjs');
          vi.doMock(pluginPath, () => ({ default: mockPlugin }));
          await pluginManager.loadLocalPlugin(mockApp, name);
        } else {
          vi.doMock(name, () => ({ default: mockPlugin }));
          await pluginManager.loadNPMPlugin(mockApp, name);
        }
      }

      expect(pluginManager.pluginCache.size).toBe(4);
      expect(pluginManager.pluginCache.has('local:plugin1')).toBe(true);
      expect(pluginManager.pluginCache.has('local:plugin2')).toBe(true);
      expect(pluginManager.pluginCache.has('npm:npm-plugin1')).toBe(true);
      expect(pluginManager.pluginCache.has('npm:npm-plugin2')).toBe(true);
    });

    test('should allow same name for local and NPM plugins', async () => {
      const localPlugin = vi.fn().mockResolvedValue(undefined);
      const npmPlugin = vi.fn().mockResolvedValue(undefined);
      const sameName = 'same-name';
      
      const localPath = path.join(tempDir.name, 'plugins', sameName, 'index.mjs');
      vi.doMock(localPath, () => ({ default: localPlugin }));
      vi.doMock(sameName, () => ({ default: npmPlugin }));

      await pluginManager.loadLocalPlugin(mockApp, sameName);
      await pluginManager.loadNPMPlugin(mockApp, sameName);

      expect(pluginManager.pluginCache.size).toBe(2);
      expect(pluginManager.pluginCache.has(`local:${sameName}`)).toBe(true);
      expect(pluginManager.pluginCache.has(`npm:${sameName}`)).toBe(true);
      expect(pluginManager.pluginCache.get(`local:${sameName}`)).toBe(localPlugin);
      expect(pluginManager.pluginCache.get(`npm:${sameName}`)).toBe(npmPlugin);
    });
  });
});