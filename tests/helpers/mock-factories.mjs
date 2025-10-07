import { vi } from 'vitest';
import { EventEmitter } from 'events';
import tmp from 'tmp';
import fs from 'fs/promises';
import path from 'path';

export class MockFactories {
  static tempDirs = new Set();
  static activeMocks = new Map();
  
  static init() {
    // Initialize any global mock configurations
  }
  
  static cleanup() {
    // Cleanup all temporary directories
    for (const dir of this.tempDirs) {
      try {
        dir.removeCallback();
      } catch (err) {
        // Ignore cleanup errors
      }
    }
    this.tempDirs.clear();
  }
  
  static resetAll() {
    // Reset all vi mocks
    vi.clearAllMocks();
  }
  
  static async cleanupTest() {
    // Per-test cleanup
  }

  /**
   * Create a mock logger compatible with Fastify/Pino
   */
  static createMockLogger() {
    return {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn(() => MockFactories.createMockLogger()),
      level: 'info'
    };
  }

  /**
   * Create a mock Fastify application instance
   */
  static createMockFastifyApp() {
    const mockApp = new EventEmitter();
    
    // Add Fastify-like methods
    Object.assign(mockApp, {
      log: this.createMockLogger(),
      register: vi.fn().mockResolvedValue(undefined),
      addHook: vi.fn(),
      addSchema: vi.fn(),
      decorate: vi.fn(),
      listen: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      printRoutes: vi.fn().mockReturnValue(''),
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      patch: vi.fn(),
      head: vi.fn(),
      options: vi.fn()
    });
    
    return mockApp;
  }

  /**
   * Create a mock HTTP request object
   */
  static createMockRequest(options = {}) {
    return {
      url: options.url || '/',
      method: options.method || 'GET',
      headers: options.headers || {},
      hostname: options.hostname || 'localhost',
      params: options.params || {},
      query: options.query || {},
      body: options.body || {},
      log: this.createMockLogger(),
      entities: options.entities || [],
      primaryEntity: options.primaryEntity || null,
      authenticated: options.authenticated || false,
      crossEntityAccess: options.crossEntityAccess || false,
      ...options
    };
  }

  /**
   * Create a mock HTTP reply object
   */
  static createMockReply() {
    const reply = {
      code: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
      send: vi.fn((data) => data),
      type: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis()
    };
    
    // Chain methods properly
    reply.code.mockReturnValue(reply);
    reply.header.mockReturnValue(reply);
    reply.type.mockReturnValue(reply);
    reply.status.mockReturnValue(reply);
    
    return reply;
  }

  /**
   * Create a mock entity configuration
   */
  static createMockEntityConfig(overrides = {}) {
    return {
      type: 'tenant',
      id: 'test-entity',
      name: 'Test Entity',
      active: true,
      basePath: '/tenants',
      identificationStrategy: 'subdomain',
      extractPattern: '^([^.]+)\\.(.+\\..+)$',
      routePrefix: '/{entityId}',
      priority: 100,
      enabled: true,
      maxInstances: 100,
      resourceLoading: {
        schemas: true,
        services: true,
        plugins: true,
        routes: true
      },
      mergeStrategy: 'override',
      security: {
        authentication: 'optional',
        isolation: 'loose'
      },
      ...overrides
    };
  }

  /**
   * Create a mock database connection
   */
  static createMockDatabase() {
    return {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      connect: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      authenticate: vi.fn().mockResolvedValue(undefined),
      sync: vi.fn().mockResolvedValue(undefined),
      transaction: vi.fn().mockImplementation(async (callback) => {
        return await callback(this.createMockTransaction());
      })
    };
  }

  /**
   * Create a mock database transaction
   */
  static createMockTransaction() {
    return {
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ rows: [] })
    };
  }

  /**
   * Create a temporary directory for testing file operations
   */
  static createTempDir(options = {}) {
    const dir = tmp.dirSync({ 
      unsafeCleanup: true,
      prefix: 'fastify-mta-test-',
      ...options 
    });
    
    this.tempDirs.add(dir);
    return dir;
  }

  /**
   * Create a temporary entity directory structure
   */
  static async createTempEntityDirectory(entityType, entityId) {
    const tempDir = this.createTempDir();
    const entityPath = path.join(tempDir.name, 'entities', `${entityType}s`, entityId);
    
    // Create directory structure
    await fs.mkdir(entityPath, { recursive: true });
    await fs.mkdir(path.join(entityPath, 'schemas'), { recursive: true });
    await fs.mkdir(path.join(entityPath, 'services'), { recursive: true });
    await fs.mkdir(path.join(entityPath, 'plugins'), { recursive: true });
    await fs.mkdir(path.join(entityPath, 'routes'), { recursive: true });
    
    // Create basic config file
    const config = {
      name: entityId,
      active: true,
      description: `Test ${entityType} entity`
    };
    
    await fs.writeFile(
      path.join(entityPath, 'config.json'),
      JSON.stringify(config, null, 2)
    );
    
    return {
      tempDir,
      entityPath,
      configPath: path.join(entityPath, 'config.json')
    };
  }

  /**
   * Create mock services for testing
   */
  static createMockServices() {
    return {
      userService: {
        findById: vi.fn().mockResolvedValue({ id: 1, name: 'Test User' }),
        create: vi.fn().mockResolvedValue({ id: 2, name: 'New User' }),
        update: vi.fn().mockResolvedValue({ id: 1, name: 'Updated User' }),
        delete: vi.fn().mockResolvedValue(true)
      },
      authService: {
        authenticate: vi.fn().mockResolvedValue(true),
        authorize: vi.fn().mockResolvedValue(true),
        generateToken: vi.fn().mockReturnValue('mock-token')
      }
    };
  }

  /**
   * Create mock file system operations
   */
  static createMockFS() {
    return {
      readFile: vi.fn().mockResolvedValue('{}'),
      writeFile: vi.fn().mockResolvedValue(undefined),
      readdir: vi.fn().mockResolvedValue([]),
      access: vi.fn().mockResolvedValue(undefined),
      stat: vi.fn().mockResolvedValue({
        isDirectory: () => true,
        isFile: () => false
      }),
      mkdir: vi.fn().mockResolvedValue(undefined)
    };
  }

  /**
   * Create mock plugin for testing plugin loading
   */
  static createMockPlugin(name = 'test-plugin') {
    return vi.fn().mockImplementation(async (fastify, options) => {
      // Mock plugin registration
      fastify.decorate(`${name}Ready`, true);
    });
  }

  /**
   * Create mock schema for testing schema loading
   */
  static createMockSchema(id = 'test-schema') {
    return {
      $id: id,
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' }
      },
      required: ['id']
    };
  }

  /**
   * Create mock environment variables
   */
  static createMockEnv(overrides = {}) {
    return {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      PORT: '3002',
      HOST: '0.0.0.0',
      DB_DIALECT: 'sqlite',
      DB_STORAGE: ':memory:',
      ...overrides
    };
  }

  /**
   * Setup mock environment variables for test
   */
  static setupMockEnv(envVars = {}) {
    const mockEnv = this.createMockEnv(envVars);
    
    // Store original values
    const originalEnv = {};
    for (const [key, value] of Object.entries(mockEnv)) {
      originalEnv[key] = process.env[key];
      process.env[key] = value;
    }
    
    // Return cleanup function
    return () => {
      for (const [key, originalValue] of Object.entries(originalEnv)) {
        if (originalValue === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = originalValue;
        }
      }
    };
  }
}