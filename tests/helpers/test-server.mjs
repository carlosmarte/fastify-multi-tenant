import { GenericEntityServer } from '../../main.mjs';
import { MockFactories } from './mock-factories.mjs';
import supertest from 'supertest';
import path from 'path';
import fs from 'fs/promises';

export class TestServer {
  static instances = new Set();
  
  constructor(options = {}) {
    this.server = null;
    this.app = null;
    this.tempDir = null;
    this.baseUrl = null;
    this.options = options;
  }

  /**
   * Create and start a test server instance
   */
  static async create(options = {}) {
    const testServer = new TestServer(options);
    await testServer.start();
    this.instances.add(testServer);
    return testServer;
  }

  /**
   * Start the test server
   */
  async start() {
    try {
      // Create temporary directory for test files
      this.tempDir = MockFactories.createTempDir();
      
      // Setup test environment
      this.cleanupEnv = MockFactories.setupMockEnv(this.options.env || {});
      
      // Create test entity configuration if needed
      if (this.options.createTestEntities !== false) {
        await this.createTestEntityStructure();
      }

      // Initialize server with test configuration
      const serverOptions = {
        server: {
          port: 0, // Use random available port
          host: '127.0.0.1'
        },
        logger: {
          level: 'silent', // Suppress logs during tests
          pretty: false
        },
        entities: {
          autoLoad: this.options.autoLoad !== false,
          hierarchicalLoading: true,
          definitions: this.options.entityDefinitions || {
            tenant: MockFactories.createMockEntityConfig({
              type: 'tenant',
              basePath: '/tenants',
              identificationStrategy: 'subdomain'
            })
          }
        },
        ...this.options.serverConfig
      };

      this.server = new GenericEntityServer(serverOptions);
      
      // Override project root for testing
      if (this.tempDir) {
        this.server.projectRoot = this.tempDir.name;
      }
      
      await this.server.start({
        entityConfigPath: this.options.entityConfigPath
      });
      
      // Start listening on random port
      this.app = await this.server.listen();
      
      // Get the actual port and build base URL
      const address = this.app.server.address();
      const port = address.port;
      this.baseUrl = `http://127.0.0.1:${port}`;
      
      return this;
    } catch (err) {
      await this.cleanup();
      throw err;
    }
  }

  /**
   * Create test entity directory structure
   */
  async createTestEntityStructure() {
    const entitiesDir = path.join(this.tempDir.name, 'entities', 'tenants');
    await fs.mkdir(entitiesDir, { recursive: true });

    // Create test tenant entities
    const testTenants = this.options.testEntities || [
      { id: 'tenant1', name: 'Test Tenant 1' },
      { id: 'tenant2', name: 'Test Tenant 2' }
    ];

    for (const tenant of testTenants) {
      await this.createTestEntity('tenant', tenant.id, tenant);
    }

    // Create global plugins directory
    const pluginsDir = path.join(this.tempDir.name, 'plugins');
    await fs.mkdir(pluginsDir, { recursive: true });

    // Create global routes directory
    const routesDir = path.join(this.tempDir.name, 'routes');
    await fs.mkdir(routesDir, { recursive: true });
  }

  /**
   * Create a single test entity
   */
  async createTestEntity(entityType, entityId, config = {}) {
    const entityDir = path.join(this.tempDir.name, 'entities', `${entityType}s`, entityId);
    await fs.mkdir(entityDir, { recursive: true });

    // Create entity config
    const entityConfig = {
      id: entityId,
      name: config.name || entityId,
      active: config.active !== false,
      description: `Test ${entityType} entity`,
      ...config
    };

    await fs.writeFile(
      path.join(entityDir, 'config.json'),
      JSON.stringify(entityConfig, null, 2)
    );

    // Create subdirectories
    const subdirs = ['schemas', 'services', 'plugins', 'routes'];
    for (const subdir of subdirs) {
      await fs.mkdir(path.join(entityDir, subdir), { recursive: true });
    }

    // Create test service if requested
    if (config.createService) {
      await this.createTestService(entityDir, config.serviceName || 'testService');
    }

    // Create test route if requested
    if (config.createRoute) {
      await this.createTestRoute(entityDir, config.routePath || '/test');
    }

    return entityDir;
  }

  /**
   * Create a test service file
   */
  async createTestService(entityDir, serviceName) {
    const serviceContent = `
export default class ${serviceName.charAt(0).toUpperCase() + serviceName.slice(1)} {
  constructor(db, config) {
    this.db = db;
    this.config = config;
  }

  async getData() {
    return { message: 'Hello from ${serviceName}' };
  }
}
`;
    
    await fs.writeFile(
      path.join(entityDir, 'services', `${serviceName}.mjs`),
      serviceContent.trim()
    );
  }

  /**
   * Create a test route plugin
   */
  async createTestRoute(entityDir, routePath) {
    const routeContent = `
export default async function routes(fastify, options) {
  fastify.get('${routePath}', async (request, reply) => {
    return {
      message: 'Hello from test route',
      entityType: options.entityType,
      entityId: options.entityId
    };
  });
}
`;
    
    await fs.writeFile(
      path.join(entityDir, 'routes', 'index.mjs'),
      routeContent.trim()
    );
  }

  /**
   * Make an HTTP request to the test server
   */
  async makeRequest(method, path, options = {}) {
    if (!this.app) {
      throw new Error('Server not started');
    }

    const request = supertest(this.app.server);
    let req;

    switch (method.toUpperCase()) {
      case 'GET':
        req = request.get(path);
        break;
      case 'POST':
        req = request.post(path);
        break;
      case 'PUT':
        req = request.put(path);
        break;
      case 'DELETE':
        req = request.delete(path);
        break;
      case 'PATCH':
        req = request.patch(path);
        break;
      default:
        throw new Error(`Unsupported HTTP method: ${method}`);
    }

    // Add headers
    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        req.set(key, value);
      }
    }

    // Add body for POST/PUT/PATCH
    if (options.body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      req.send(options.body);
    }

    // Set content type
    if (options.contentType) {
      req.type(options.contentType);
    }

    return req;
  }

  /**
   * Get server statistics
   */
  getStats() {
    if (!this.server || !this.server.dependencies) {
      return null;
    }
    
    return this.server.dependencies.entityManager.getStats();
  }

  /**
   * Get loaded entities
   */
  getEntities(entityType = null) {
    if (!this.server || !this.server.dependencies) {
      return [];
    }
    
    const entityManager = this.server.dependencies.entityManager;
    return entityType 
      ? entityManager.getEntitiesByType(entityType)
      : entityManager.getAllEntities();
  }

  /**
   * Reload a specific entity
   */
  async reloadEntity(entityType, entityId) {
    if (!this.server || !this.server.dependencies) {
      throw new Error('Server not available');
    }
    
    return this.server.dependencies.entityManager.reloadEntity(
      this.app, 
      entityType, 
      entityId
    );
  }

  /**
   * Stop the test server and cleanup
   */
  async cleanup() {
    try {
      if (this.app) {
        await this.app.close();
        this.app = null;
      }
      
      if (this.server) {
        await this.server.stop();
        this.server = null;
      }
      
      if (this.cleanupEnv) {
        this.cleanupEnv();
        this.cleanupEnv = null;
      }
      
      if (this.tempDir) {
        this.tempDir.removeCallback();
        this.tempDir = null;
      }
    } catch (err) {
      // Ignore cleanup errors
    }
  }

  /**
   * Cleanup all test server instances
   */
  static async cleanupAll() {
    const cleanupPromises = Array.from(this.instances).map(instance => instance.cleanup());
    await Promise.allSettled(cleanupPromises);
    this.instances.clear();
  }
}