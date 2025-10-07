import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { GenericEntityServer } from './generic-entity-server.mjs';
import {
  ConfigurationValidationError,
  PluginError,
  ServerStateError
} from '@thinkeloquent/core-exceptions';

// Mock all dependencies
vi.mock('fastify', () => ({
  default: vi.fn(() => ({
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    },
    decorate: vi.fn(),
    get: vi.fn(),
    listen: vi.fn(),
    close: vi.fn(),
    printRoutes: vi.fn(() => '├── /test (GET)'),
    server: {
      listening: false,
      close: vi.fn()
    }
  }))
}));

vi.mock('fs/promises', () => ({
  default: {
    readdir: vi.fn()
  }
}));

vi.mock('glob', () => ({
  glob: vi.fn()
}));

vi.mock('@thinkeloquent/core-folders', () => {
  const pathExistsMock = vi.fn();
  const resolvePathMock = vi.fn(path => path);

  return {
    findProjectRoot: vi.fn(),
    PathResolver: vi.fn(function(baseDir) {
      this.baseDir = baseDir;
      this.pathExists = pathExistsMock;
      this.resolvePath = resolvePathMock;
    })
  };
});

vi.mock('@thinkeloquent/core-configure', () => ({
  EntityConfigurationManager: vi.fn(function(options) {
    this.loadEntityConfig = vi.fn();
    this.merge = vi.fn();
    this.validate = vi.fn();
    this.getAllEntityTypes = vi.fn(() => []);
    this.getEntityDefinition = vi.fn(() => ({ enabled: true }));
  })
}));

vi.mock('@thinkeloquent/core-security', () => ({
  EntitySecurityService: vi.fn(function(options) {
    this.validateEntityId = vi.fn();
    this.validatePluginName = vi.fn();
  })
}));

vi.mock('@thinkeloquent/core-loading-strategy', () => ({
  ResourceLoader: vi.fn(function(logger, pathResolver) {
    this.loadPlugin = vi.fn(() => ({ success: true }));
  })
}));

vi.mock('@thinkeloquent/core-entities', () => ({
  EntityLifecycleManager: vi.fn(function(logger) {
    this.getAllEntityStates = vi.fn(() => ({}));
  })
}));

vi.mock('@thinkeloquent/core-orchestrator', () => ({
  EntityFactory: vi.fn(function() {}),
  EntityRegistry: vi.fn(function() {}),
  EntityManager: vi.fn(function(options) {
    this.loadAllEntities = vi.fn();
    this.getStats = vi.fn(() => ({ total: 0, loaded: 0 }));
    this.getEntitiesByType = vi.fn(() => []);
    this.getEntity = vi.fn();
    this.lifecycleManager = {
      getAllEntityStates: vi.fn(() => ({}))
    };
  })
}));

vi.mock('@thinkeloquent/core-entity-identification-strategy', () => ({
  EntityIdentificationManager: vi.fn(function() {})
}));

vi.mock('./server-lifecycle-manager.mjs', () => ({
  ServerLifecycleManager: vi.fn(function(app, logger, entityManager) {
    this.setupRequestPipeline = vi.fn();
    this.setupGracefulShutdown = vi.fn();
  })
}));

vi.mock('@thinkeloquent/core-plugins', () => ({
  PluginManager: vi.fn(function(logger, pathResolver, securityService) {
    this.loadLocalPlugins = vi.fn(() => ({ success: true, value: {} }));
  })
}));

describe('GenericEntityServer', () => {
  let server;
  let mockFindProjectRoot;
  let mockFs;
  let mockGlob;
  let mockPathExists;

  beforeEach(async () => {
    // Get mocked modules
    const coreFolder = await import('@thinkeloquent/core-folders');
    mockFindProjectRoot = vi.mocked(coreFolder.findProjectRoot);

    // Get PathResolver mock and access its pathExists
    const PathResolver = coreFolder.PathResolver;
    mockPathExists = vi.fn().mockResolvedValue(false);

    // Set pathExists on the PathResolver instances
    PathResolver.mockImplementation(function(baseDir) {
      this.baseDir = baseDir;
      this.pathExists = mockPathExists;
      this.resolvePath = vi.fn(path => path);
    });

    mockFs = vi.mocked((await import('fs/promises')).default);
    const globModule = await import('glob');
    mockGlob = vi.mocked(globModule.glob);

    // Reset mocks
    vi.clearAllMocks();

    // Set default mock behaviors
    mockFindProjectRoot.mockResolvedValue('/project');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with default options', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production'; // Ensure not in test mode

      server = new GenericEntityServer();

      expect(server.suppressErrorLogging).toBe(false);

      process.env.NODE_ENV = originalEnv;
      expect(server.configManager).toBeDefined();
      expect(server.securityService).toBeDefined();
      expect(server.pathResolver).toBeNull();
      expect(server.projectRoot).toBeNull();
      expect(server.dependencies).toBeNull();
      expect(server.app).toBeNull();
    });

    test('should accept custom options', () => {
      server = new GenericEntityServer({
        suppressErrorLogging: true,
        security: { maxIdLength: 128 }
      });

      expect(server.suppressErrorLogging).toBe(true);
    });

    test('should suppress error logging in test environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      server = new GenericEntityServer();

      expect(server.suppressErrorLogging).toBe(true);

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('start', () => {
    beforeEach(() => {
      server = new GenericEntityServer({ suppressErrorLogging: true });
    });

    test('should initialize server successfully', async () => {
      // Mock configuration validation
      server.configManager.validate.mockReturnValue({
        success: true,
        value: {
          server: { port: 3000, host: 'localhost' },
          logger: { level: 'info', pretty: false },
          entities: { autoLoad: true },
          plugins: {}
        }
      });

      // Mock path existence checks through the PathResolver instance
      const { PathResolver } = await import('@thinkeloquent/core-folders');
      // The PathResolver constructor will create an instance with pathExists method
      // Since it's mocked, we need to access the mocked instance created during server.start()

      const result = await server.start();

      expect(result).toBe(server);
      expect(mockFindProjectRoot).toHaveBeenCalled();
      expect(server.projectRoot).toBe('/project');
      expect(server.pathResolver).toBeDefined();
      expect(server.app).toBeDefined();
      expect(server.dependencies).toBeDefined();
    });

    test('should throw ConfigurationValidationError on invalid config', async () => {
      server.configManager.validate.mockReturnValue({
        success: false,
        error: ['Invalid port', 'Missing host']
      });

      await expect(server.start()).rejects.toThrow(ConfigurationValidationError);
    });

    test('should load entities when autoLoad is enabled', async () => {
      server.configManager.validate.mockReturnValue({
        success: true,
        value: {
          server: { port: 3000, host: 'localhost' },
          logger: { level: 'info', pretty: false },
          entities: { autoLoad: true },
          plugins: {}
        }
      });

      // PathExists is already mocked to return false by default

      await server.start();

      expect(server.dependencies.entityManager.loadAllEntities).toHaveBeenCalled();
    });

    test('should skip entity loading when autoLoad is false', async () => {
      server.configManager.validate.mockReturnValue({
        success: true,
        value: {
          server: { port: 3000, host: 'localhost' },
          logger: { level: 'info', pretty: false },
          entities: { autoLoad: false },
          plugins: {}
        }
      });

      // PathExists is already mocked to return false by default

      await server.start();

      expect(server.dependencies.entityManager.loadAllEntities).not.toHaveBeenCalled();
    });

    test('should setup pretty logger when enabled', async () => {
      server.configManager.validate.mockReturnValue({
        success: true,
        value: {
          server: { port: 3000, host: 'localhost' },
          logger: { level: 'debug', pretty: true },
          entities: {},
          plugins: {}
        }
      });

      // PathExists is already mocked to return false by default

      await server.start();

      const Fastify = (await import('fastify')).default;
      expect(Fastify).toHaveBeenCalledWith(
        expect.objectContaining({
          logger: expect.objectContaining({
            transport: expect.objectContaining({
              target: 'pino-pretty'
            })
          })
        })
      );
    });

    test('should cleanup on initialization error', async () => {
      server.configManager.validate.mockReturnValue({
        success: false,
        error: ['Error']
      });

      await expect(server.start()).rejects.toThrow();

      expect(server.app).toBeNull();
      expect(server.dependencies).toBeNull();
    });

    test('should decorate app with managers', async () => {
      server.configManager.validate.mockReturnValue({
        success: true,
        value: {
          server: { port: 3000, host: 'localhost' },
          logger: { level: 'info', pretty: false },
          entities: {},
          plugins: {}
        }
      });

      // PathExists is already mocked to return false by default

      await server.start();

      expect(server.app.decorate).toHaveBeenCalledWith('entityManager', expect.any(Object));
      expect(server.app.decorate).toHaveBeenCalledWith('resourceLoader', expect.any(Object));
      expect(server.app.decorate).toHaveBeenCalledWith('pluginManager', expect.any(Object));
      expect(server.app.decorate).toHaveBeenCalledWith('configManager', server.configManager);
    });
  });

  describe('setupHealthCheck', () => {
    beforeEach(async () => {
      server = new GenericEntityServer({ suppressErrorLogging: true });

      server.configManager.validate.mockReturnValue({
        success: true,
        value: {
          server: { port: 3000, host: 'localhost' },
          logger: { level: 'info', pretty: false },
          entities: {},
          plugins: {}
        }
      });

      // PathExists is already mocked to return false by default

      await server.start();
    });

    test('should register health check endpoint', () => {
      expect(server.app.get).toHaveBeenCalledWith('/health', expect.any(Function));
    });

    test('should register admin entities endpoints', () => {
      expect(server.app.get).toHaveBeenCalledWith('/admin/entities', expect.any(Function));
      expect(server.app.get).toHaveBeenCalledWith('/admin/entities/:entityType', expect.any(Function));
      expect(server.app.get).toHaveBeenCalledWith('/admin/entities/:entityType/:entityId', expect.any(Function));
    });
  });

  describe('loadCorePlugins', () => {
    test('should load plugins in specified order', async () => {
      server = new GenericEntityServer({ suppressErrorLogging: true });

      mockFs.readdir.mockResolvedValue([
        { name: 'plugin1', isDirectory: () => true },
        { name: 'plugin2', isDirectory: () => true },
        { name: 'plugin3', isDirectory: () => true }
      ]);

      server.configManager.validate.mockReturnValue({
        success: true,
        value: {
          server: { port: 3000, host: 'localhost' },
          logger: { level: 'info', pretty: false },
          entities: {},
          plugins: { coreOrder: ['plugin2', 'plugin1'] }
        }
      });

      mockPathExists.mockResolvedValue(true);

      await server.start();

      expect(server.dependencies.pluginManager.loadLocalPlugins).toHaveBeenCalledWith(
        server.app,
        ['plugin2', 'plugin1', 'plugin3'],
        expect.any(Object)
      );
    });

    test('should skip plugins directory if not found', async () => {
      server = new GenericEntityServer({ suppressErrorLogging: true });

      server.configManager.validate.mockReturnValue({
        success: true,
        value: {
          server: { port: 3000, host: 'localhost' },
          logger: { level: 'info', pretty: false },
          entities: {},
          plugins: {}
        }
      });

      // PathExists is already mocked to return false by default

      await server.start();

      expect(mockFs.readdir).not.toHaveBeenCalled();
    });

    test('should filter out non-directories', async () => {
      server = new GenericEntityServer({ suppressErrorLogging: true });

      mockFs.readdir.mockResolvedValue([
        { name: 'plugin1', isDirectory: () => true },
        { name: 'file.txt', isDirectory: () => false },
        { name: '.hidden', isDirectory: () => true }
      ]);

      server.configManager.validate.mockReturnValue({
        success: true,
        value: {
          server: { port: 3000, host: 'localhost' },
          logger: { level: 'info', pretty: false },
          entities: {},
          plugins: {}
        }
      });

      mockPathExists.mockResolvedValue(true);

      await server.start();

      expect(server.dependencies.pluginManager.loadLocalPlugins).toHaveBeenCalledWith(
        server.app,
        ['plugin1'],
        expect.any(Object)
      );
    });

    test('should throw PluginError on failure', async () => {
      server = new GenericEntityServer({ suppressErrorLogging: true });

      const { PluginManager } = await import('@thinkeloquent/core-plugins');
      PluginManager.mockImplementation(function(logger, pathResolver, securityService) {
        this.loadLocalPlugins = vi.fn(() => ({
          success: false,
          error: 'Failed to load'
        }));
      });

      mockFs.readdir.mockResolvedValue([
        { name: 'plugin1', isDirectory: () => true }
      ]);

      server.configManager.validate.mockReturnValue({
        success: true,
        value: {
          server: { port: 3000, host: 'localhost' },
          logger: { level: 'info', pretty: false },
          entities: {},
          plugins: {}
        }
      });

      mockPathExists.mockResolvedValue(true);

      await expect(server.start()).rejects.toThrow(PluginError);
    });
  });

  describe('loadGlobalRoutes', () => {
    test('should load routes from configured path', async () => {
      server = new GenericEntityServer({ suppressErrorLogging: true });

      server.configManager.validate.mockReturnValue({
        success: true,
        value: {
          server: { port: 3000, host: 'localhost' },
          logger: { level: 'info', pretty: false },
          entities: {},
          plugins: {}
        }
      });

      mockPathExists.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

      mockGlob.mockResolvedValue([
        '/project/routes/api/index.mjs',
        '/project/routes/auth/index.mjs'
      ]);

      await server.start();

      expect(mockGlob).toHaveBeenCalledWith(
        expect.stringContaining('routes/**/index.mjs'),
        expect.objectContaining({
          ignore: ['**/node_modules/**']
        })
      );
    });

    test('should skip loading if routes directory not found', async () => {
      server = new GenericEntityServer({ suppressErrorLogging: true });

      server.configManager.validate.mockReturnValue({
        success: true,
        value: {
          server: { port: 3000, host: 'localhost' },
          logger: { level: 'info', pretty: false },
          entities: {},
          plugins: {}
        }
      });

      // PathExists is already mocked to return false by default

      await server.start();

      expect(mockGlob).not.toHaveBeenCalled();
    });

    test('should handle glob errors gracefully', async () => {
      server = new GenericEntityServer({ suppressErrorLogging: true });

      server.configManager.validate.mockReturnValue({
        success: true,
        value: {
          server: { port: 3000, host: 'localhost' },
          logger: { level: 'info', pretty: false },
          entities: {},
          plugins: {}
        }
      });

      mockPathExists.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

      mockGlob.mockRejectedValue(new Error('Glob failed'));

      // Should not throw, server should start gracefully despite route loading error
      await expect(server.start()).resolves.toBeDefined();
    });
  });

  describe('listen', () => {
    beforeEach(async () => {
      server = new GenericEntityServer({ suppressErrorLogging: true });
    });

    test('should throw if server not initialized', async () => {
      await expect(server.listen()).rejects.toThrow(ServerStateError);
    });

    test('should listen on configured port and host', async () => {
      server.configManager.validate.mockReturnValue({
        success: true,
        value: {
          server: { port: 3000, host: '0.0.0.0' },
          logger: { level: 'info', pretty: false },
          entities: {},
          plugins: {}
        }
      });

      // PathExists is already mocked to return false by default

      await server.start();
      await server.listen();

      expect(server.app.listen).toHaveBeenCalledWith({
        port: 3000,
        host: '0.0.0.0'
      });
    });

    test('should override port and host if provided', async () => {
      server.configManager.validate.mockReturnValue({
        success: true,
        value: {
          server: { port: 3000, host: '0.0.0.0' },
          logger: { level: 'info', pretty: false },
          entities: {},
          plugins: {}
        }
      });

      // PathExists is already mocked to return false by default

      await server.start();
      await server.listen(4000, 'localhost');

      expect(server.app.listen).toHaveBeenCalledWith({
        port: 4000,
        host: 'localhost'
      });
    });

    test('should setup graceful shutdown', async () => {
      server.configManager.validate.mockReturnValue({
        success: true,
        value: {
          server: { port: 3000, host: 'localhost' },
          logger: { level: 'info', pretty: false },
          entities: {},
          plugins: {}
        }
      });

      // PathExists is already mocked to return false by default

      await server.start();
      await server.listen();

      expect(server.serverLifecycleManager.setupGracefulShutdown).toHaveBeenCalled();
    });
  });

  describe('getRegisteredRoutes', () => {
    test('should return empty array if app not initialized', () => {
      server = new GenericEntityServer();

      expect(server.getRegisteredRoutes()).toEqual([]);
    });

    test('should parse and return registered routes', async () => {
      server = new GenericEntityServer({ suppressErrorLogging: true });

      server.configManager.validate.mockReturnValue({
        success: true,
        value: {
          server: { port: 3000, host: 'localhost' },
          logger: { level: 'info', pretty: false },
          entities: {},
          plugins: {}
        }
      });

      // PathExists is already mocked to return false by default

      await server.start();

      server.app.printRoutes.mockReturnValue('├── /test (GET)\n└── /api (POST)');

      const routes = server.getRegisteredRoutes();

      expect(routes).toEqual([
        { path: '/test', method: 'GET' },
        { path: '/api', method: 'POST' }
      ]);
    });
  });

  describe('getEndpointPatterns', () => {
    test('should return endpoint patterns', async () => {
      server = new GenericEntityServer({ suppressErrorLogging: true });

      server.configManager.validate.mockReturnValue({
        success: true,
        value: {
          server: { port: 3002, host: 'localhost' },
          logger: { level: 'info', pretty: false },
          entities: {},
          plugins: {}
        }
      });

      // PathExists is already mocked to return false by default

      await server.start();

      server.configManager.getAllEntityTypes.mockReturnValue(['tenant', 'user']);
      server.configManager.getEntityDefinition.mockImplementation(type => ({
        enabled: true,
        routePrefix: `/${type}s/{entityId}`
      }));

      const patterns = server.getEndpointPatterns();

      expect(patterns.baseUrl).toBe('http://localhost:3002');
      expect(patterns.patterns.global).toBeDefined();
      expect(patterns.patterns.system).toBeDefined();
      expect(patterns.patterns.entities).toHaveLength(2);
    });
  });

  describe('cleanup and stop', () => {
    test('should cleanup resources', async () => {
      server = new GenericEntityServer({ suppressErrorLogging: true });

      server.configManager.validate.mockReturnValue({
        success: true,
        value: {
          server: { port: 3000, host: 'localhost' },
          logger: { level: 'info', pretty: false },
          entities: {},
          plugins: {}
        }
      });

      // PathExists is already mocked to return false by default

      await server.start();
      await server.cleanup();

      expect(server.app).toBeNull();
      expect(server.dependencies).toBeNull();
      expect(server.serverLifecycleManager).toBeNull();
    });

    test('should close listening server', async () => {
      server = new GenericEntityServer({ suppressErrorLogging: true });

      server.configManager.validate.mockReturnValue({
        success: true,
        value: {
          server: { port: 3000, host: 'localhost' },
          logger: { level: 'info', pretty: false },
          entities: {},
          plugins: {}
        }
      });

      // PathExists is already mocked to return false by default

      await server.start();
      const appBeforeCleanup = server.app;
      server.app.server.listening = true;

      await server.cleanup();

      expect(appBeforeCleanup.close).toHaveBeenCalled();
    });

    test('should handle cleanup errors gracefully', async () => {
      server = new GenericEntityServer({ suppressErrorLogging: true });

      server.configManager.validate.mockReturnValue({
        success: true,
        value: {
          server: { port: 3000, host: 'localhost' },
          logger: { level: 'info', pretty: false },
          entities: {},
          plugins: {}
        }
      });

      // PathExists is already mocked to return false by default

      await server.start();
      server.app.close.mockRejectedValue(new Error('Close failed'));

      // Should not throw
      await expect(server.cleanup()).resolves.toBeUndefined();
    });

    test('should stop server by calling cleanup', async () => {
      server = new GenericEntityServer({ suppressErrorLogging: true });

      server.configManager.validate.mockReturnValue({
        success: true,
        value: {
          server: { port: 3000, host: 'localhost' },
          logger: { level: 'info', pretty: false },
          entities: {},
          plugins: {}
        }
      });

      // PathExists is already mocked to return false by default

      await server.start();

      const cleanupSpy = vi.spyOn(server, 'cleanup');
      await server.stop();

      expect(cleanupSpy).toHaveBeenCalled();
    });
  });

  describe('Error Logging', () => {
    test('should suppress error logging when configured', async () => {
      server = new GenericEntityServer({ suppressErrorLogging: true });

      server.configManager.validate.mockReturnValue({
        success: false,
        error: ['Test error']
      });

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(server.start()).rejects.toThrow();

      expect(consoleErrorSpy).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    test('should log errors when not suppressed', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      server = new GenericEntityServer({ suppressErrorLogging: false });

      server.configManager.validate.mockReturnValue({
        success: false,
        error: ['Test error']
      });

      await expect(server.start()).rejects.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });
});