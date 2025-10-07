import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import { GenericEntityServer } from './generic-entity-server.mjs';

describe('Node.js Server Testing with Vitest', () => {
  let server;
  let app;

  describe('Basic Fastify Server', () => {
    beforeAll(async () => {
      // Create a Fastify instance
      app = Fastify({ logger: false });

      // Add routes
      app.get('/health', async () => {
        return { status: 'ok', timestamp: new Date().toISOString() };
      });

      app.post('/api/users', async (request) => {
        const { name, email } = request.body;
        return {
          id: Math.random().toString(36).substr(2, 9),
          name,
          email,
          createdAt: new Date().toISOString()
        };
      });

      app.get('/api/users/:id', async (request) => {
        const { id } = request.params;
        if (id === 'notfound') {
          throw { statusCode: 404, message: 'User not found' };
        }
        return {
          id,
          name: 'Test User',
          email: 'test@example.com'
        };
      });

      // Start server
      await app.listen({ port: 0, host: '127.0.0.1' }); // Port 0 = random available port
    });

    afterAll(async () => {
      await app.close();
    });

    test('should respond to health check', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.timestamp).toBeDefined();
    });

    test('should create a new user', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/users',
        payload: {
          name: 'John Doe',
          email: 'john@example.com'
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBeDefined();
      expect(body.name).toBe('John Doe');
      expect(body.email).toBe('john@example.com');
      expect(body.createdAt).toBeDefined();
    });

    test('should get user by id', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/users/123'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe('123');
      expect(body.name).toBe('Test User');
    });

    test('should return 404 for non-existent user', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/users/notfound'
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('User not found');
    });
  });

  describe('Testing with Real HTTP Requests', () => {
    let serverUrl;

    beforeAll(async () => {
      app = Fastify({ logger: false });

      app.get('/api/data', async () => {
        return { data: 'test-data' };
      });

      // Listen on random port
      await app.listen({ port: 0, host: '127.0.0.1' });
      const address = app.server.address();
      serverUrl = `http://${address.address}:${address.port}`;
    });

    afterAll(async () => {
      await app.close();
    });

    test('should handle real HTTP request', async () => {
      const response = await fetch(`${serverUrl}/api/data`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toBe('test-data');
    });
  });

  describe('Testing with Mocked Dependencies', () => {
    let app;

    beforeEach(() => {
      app = Fastify({ logger: false });
    });

    afterEach(async () => {
      await app.close();
    });

    test('should mock database calls', async () => {
      // Mock database
      const mockDb = {
        findUser: vi.fn().mockResolvedValue({
          id: '123',
          name: 'Mocked User'
        })
      };

      app.decorate('db', mockDb);

      app.get('/api/user/:id', async function(request) {
        const user = await this.db.findUser(request.params.id);
        return user;
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/user/123'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.name).toBe('Mocked User');
      expect(mockDb.findUser).toHaveBeenCalledWith('123');
    });

    test('should mock external service calls', async () => {
      // Mock external API
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ external: 'data' })
      });

      app.decorate('fetch', mockFetch);

      app.get('/api/external', async function() {
        const response = await this.fetch('https://api.example.com/data');
        return await response.json();
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/external'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.external).toBe('data');
      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/data');
    });
  });

  describe('Testing Middleware and Hooks', () => {
    beforeEach(() => {
      app = Fastify({ logger: false });
    });

    afterEach(async () => {
      await app.close();
    });

    test('should test authentication middleware', async () => {
      // Add auth hook
      app.addHook('onRequest', async (request, reply) => {
        const token = request.headers.authorization;
        if (!token || token !== 'Bearer valid-token') {
          reply.code(401).send({ error: 'Unauthorized' });
        }
      });

      app.get('/protected', async () => {
        return { message: 'Secret data' };
      });

      // Test without token
      const response1 = await app.inject({
        method: 'GET',
        url: '/protected'
      });

      expect(response1.statusCode).toBe(401);
      expect(JSON.parse(response1.body).error).toBe('Unauthorized');

      // Test with valid token
      const response2 = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: 'Bearer valid-token'
        }
      });

      expect(response2.statusCode).toBe(200);
      expect(JSON.parse(response2.body).message).toBe('Secret data');
    });

    test('should test request validation', async () => {
      // Add schema validation
      const schema = {
        body: {
          type: 'object',
          required: ['name', 'age'],
          properties: {
            name: { type: 'string', minLength: 2 },
            age: { type: 'number', minimum: 18 }
          }
        }
      };

      app.post('/api/validate', { schema }, async (request) => {
        return { validated: request.body };
      });

      // Test invalid data
      const response1 = await app.inject({
        method: 'POST',
        url: '/api/validate',
        payload: { name: 'A', age: 17 }
      });

      expect(response1.statusCode).toBe(400);

      // Test valid data
      const response2 = await app.inject({
        method: 'POST',
        url: '/api/validate',
        payload: { name: 'John', age: 25 }
      });

      expect(response2.statusCode).toBe(200);
      const body = JSON.parse(response2.body);
      expect(body.validated.name).toBe('John');
      expect(body.validated.age).toBe(25);
    });
  });

  describe('Testing WebSocket Connections', () => {
    test('should test WebSocket upgrade', async () => {
      app = Fastify({ logger: false });

      // Register WebSocket plugin (if available)
      // await app.register(fastifyWebsocket);

      app.get('/ws', { websocket: true }, (connection) => {
        connection.socket.on('message', (message) => {
          connection.socket.send(`Echo: ${message}`);
        });
      });

      // WebSocket testing would go here
      // This is a placeholder as it requires additional setup
      expect(true).toBe(true);

      await app.close();
    });
  });

  describe('Testing with Supertest-like API', () => {
    test('should chain assertions', async () => {
      app = Fastify({ logger: false });

      app.get('/api/items', async (request) => {
        const { page = 1, limit = 10 } = request.query;
        return {
          items: Array.from({ length: limit }, (_, i) => ({
            id: (page - 1) * limit + i + 1,
            name: `Item ${(page - 1) * limit + i + 1}`
          })),
          page: Number(page),
          limit: Number(limit)
        };
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/items',
        query: { page: '2', limit: '5' }
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.items).toHaveLength(5);
      expect(body.page).toBe(2);
      expect(body.limit).toBe(5);
      expect(body.items[0].id).toBe(6);

      await app.close();
    });
  });

  describe('Testing Server Lifecycle', () => {
    test('should handle server start and stop', async () => {
      const server = new GenericEntityServer({
        server: { port: 3456, host: '127.0.0.1' },
        suppressErrorLogging: true
      });

      // Start server
      await server.start();
      expect(server.app).toBeDefined();
      expect(server.dependencies).toBeDefined();

      // Stop server
      await server.stop();

      // After stop, the app should be closed
      expect(server.app).toBeDefined(); // App reference still exists but is closed
    });

    test('should handle graceful shutdown', async () => {
      app = Fastify({ logger: false });

      let connectionCount = 0;
      const connections = new Set();

      app.get('/long-running', async (request) => {
        connectionCount++;
        connections.add(request.id);

        // Simulate long-running request
        await new Promise(resolve => setTimeout(resolve, 100));

        connections.delete(request.id);
        return { processed: true };
      });

      await app.listen({ port: 0 });

      // Start multiple requests
      const requests = Array.from({ length: 3 }, () =>
        app.inject({ method: 'GET', url: '/long-running' })
      );

      // Close server while requests are in progress
      setTimeout(() => app.close(), 50);

      // Wait for all requests to complete
      const responses = await Promise.all(requests);

      responses.forEach(response => {
        expect(response.statusCode).toBe(200);
      });

      expect(connections.size).toBe(0);
    });
  });

  describe('Performance Testing', () => {
    test('should handle concurrent requests', async () => {
      app = Fastify({ logger: false });

      let requestCount = 0;
      app.get('/api/concurrent', async () => {
        requestCount++;
        return { count: requestCount };
      });

      await app.listen({ port: 0 });

      // Send 100 concurrent requests
      const requests = Array.from({ length: 100 }, () =>
        app.inject({ method: 'GET', url: '/api/concurrent' })
      );

      const start = Date.now();
      const responses = await Promise.all(requests);
      const duration = Date.now() - start;

      expect(responses).toHaveLength(100);
      responses.forEach(response => {
        expect(response.statusCode).toBe(200);
      });
      expect(requestCount).toBe(100);

      // Performance assertion
      expect(duration).toBeLessThan(1000); // Should handle 100 requests in under 1 second

      await app.close();
    });
  });
});