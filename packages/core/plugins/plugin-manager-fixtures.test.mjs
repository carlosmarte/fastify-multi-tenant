import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { PluginManager } from './plugin-manager.mjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Go up to project root and then to tests/fixtures
const projectRoot = path.resolve(__dirname, '../../../');
const fixturesDir = path.join(projectRoot, 'tests', 'fixtures');

describe('PluginManager with Real Fixtures', () => {
  let pluginManager;
  let mockLogger;
  let mockPathResolver;
  let mockSecurityService;
  let mockApp;

  beforeEach(() => {
    // Mock logger
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    // Mock pathResolver for fixture tests
    // The plugin manager expects baseDir/plugins/pluginName/index.mjs
    // Our fixtures are at fixturesDir/plugins/pluginName/index.mjs
    mockPathResolver = {
      baseDir: fixturesDir, // tests/fixtures
      pathExists: vi.fn(async (filePath) => {
        // Use actual filesystem check for real files
        const fs = await import('fs/promises');
        try {
          await fs.access(filePath);
          return true;
        } catch {
          return false;
        }
      }),
      resolvePath: vi.fn(p => p)
    };

    // Mock securityService
    mockSecurityService = {
      validatePluginName: vi.fn(name => name)
    };

    // Mock Fastify app
    mockApp = {
      register: vi.fn()
    };

    // Create PluginManager instance
    pluginManager = new PluginManager(
      mockLogger,
      mockPathResolver,
      mockSecurityService
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('loadLocalPlugin with fixtures', () => {
    test('should load and register a working plugin successfully', async () => {
      const result = await pluginManager.loadLocalPlugin(mockApp, 'working-plugin');

      expect(result.success).toBe(true);
      expect(result.value).toBeDefined();
      expect(result.value.plugin).toBeTypeOf('function');
      expect(mockApp.register).toHaveBeenCalledWith(expect.any(Function), {});
    });

    test('should return failure when plugin not found', async () => {
      const result = await pluginManager.loadLocalPlugin(mockApp, 'non-existent-plugin');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Plugin not found: non-existent-plugin');
      expect(result.value).toBe(null);
      expect(mockApp.register).not.toHaveBeenCalled();
    });

    test('should return failure when plugin is not a function', async () => {
      const result = await pluginManager.loadLocalPlugin(mockApp, 'not-function-plugin');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Plugin is not a function: not-function-plugin');
      expect(result.value).toBe(null);
      expect(mockApp.register).not.toHaveBeenCalled();
    });

    test('should handle plugin loading errors', async () => {
      const result = await pluginManager.loadLocalPlugin(mockApp, 'error-plugin');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Plugin failed to load');
      expect(result.value).toBe(null);
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockApp.register).not.toHaveBeenCalled();
    });

    test('should handle module without default export', async () => {
      const result = await pluginManager.loadLocalPlugin(mockApp, 'no-default-plugin');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Plugin is not a function: no-default-plugin');
      expect(result.value).toBe(null);
      expect(mockApp.register).not.toHaveBeenCalled();
    });
  });

  describe('loadLocalPlugins with fixtures', () => {
    test('should handle mixed success and failure', async () => {
      const result = await pluginManager.loadLocalPlugins(
        mockApp,
        ['working-plugin', 'non-existent-plugin', 'not-function-plugin']
      );

      expect(result.success).toBe(true);
      expect(result.value.successCount).toBe(1); // Only working-plugin should succeed
      expect(result.value.total).toBe(3);
      expect(result.value.results).toHaveLength(3);

      // Check individual results
      expect(result.value.results[0].success).toBe(true);
      expect(result.value.results[0].plugin).toBe('working-plugin');
      expect(result.value.results[1].success).toBe(false);
      expect(result.value.results[2].success).toBe(false);
    });

    test('should load multiple plugins successfully', async () => {
      // Create a second working plugin for this test
      mockPathResolver.pathExists.mockImplementation(async (filePath) => {
        if (filePath.includes('working-plugin')) return true;
        if (filePath.includes('plugin1')) return true;
        if (filePath.includes('plugin2')) return true;
        return false;
      });

      // For plugin1 and plugin2, we'll just reuse working-plugin
      const originalLoadLocalPlugin = pluginManager.loadLocalPlugin.bind(pluginManager);
      pluginManager.loadLocalPlugin = vi.fn(async (app, name, options) => {
        if (name === 'plugin1' || name === 'plugin2') {
          // Redirect to working-plugin for testing
          return originalLoadLocalPlugin(app, 'working-plugin', options);
        }
        return originalLoadLocalPlugin(app, name, options);
      });

      const result = await pluginManager.loadLocalPlugins(
        mockApp,
        ['working-plugin', 'plugin1', 'plugin2']
      );

      expect(result.success).toBe(true);
      expect(result.value.successCount).toBe(3);
      expect(result.value.total).toBe(3);
    });
  });
});