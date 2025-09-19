import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { ServerLifecycleManager } from '../../../main.mjs';
import { MockFactories } from '../../helpers/mock-factories.mjs';

// Mock close-with-grace module
vi.mock('close-with-grace', () => ({
  default: vi.fn((options, handler) => ({
    uninstall: vi.fn()
  }))
}));

describe('ServerLifecycleManager', () => {
  let serverLifecycleManager;
  let mockApp;
  let mockLogger;
  let mockEntityManager;
  let cleanupEnv;

  beforeEach(() => {
    mockApp = MockFactories.createMockFastifyApp();
    mockLogger = MockFactories.createMockLogger();
    
    mockEntityManager = {
      identifyEntities: vi.fn().mockReturnValue([]),
      getEntity: vi.fn().mockReturnValue(null)
    };

    serverLifecycleManager = new ServerLifecycleManager(mockApp, mockLogger, mockEntityManager);
    
    cleanupEnv = MockFactories.setupMockEnv();
  });

  afterEach(() => {
    cleanupEnv?.();
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with dependencies', () => {
      expect(serverLifecycleManager.app).toBe(mockApp);
      expect(serverLifecycleManager.logger).toBe(mockLogger);
      expect(serverLifecycleManager.entityManager).toBe(mockEntityManager);
      expect(serverLifecycleManager.hooks).toBeInstanceOf(Map);
      expect(serverLifecycleManager.hooks.size).toBe(0);
    });
  });

  describe('registerHook()', () => {
    test('should register hook for new phase', () => {
      const mockHandler = vi.fn();
      
      serverLifecycleManager.registerHook('startup', mockHandler);

      expect(serverLifecycleManager.hooks.has('startup')).toBe(true);
      expect(serverLifecycleManager.hooks.get('startup')).toEqual([mockHandler]);
    });

    test('should append hook to existing phase', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      serverLifecycleManager.registerHook('startup', handler1);
      serverLifecycleManager.registerHook('startup', handler2);

      const handlers = serverLifecycleManager.hooks.get('startup');
      expect(handlers).toEqual([handler1, handler2]);
    });

    test('should handle multiple phases', () => {
      const startupHandler = vi.fn();
      const shutdownHandler = vi.fn();

      serverLifecycleManager.registerHook('startup', startupHandler);
      serverLifecycleManager.registerHook('shutdown', shutdownHandler);

      expect(serverLifecycleManager.hooks.size).toBe(2);
      expect(serverLifecycleManager.hooks.get('startup')).toEqual([startupHandler]);
      expect(serverLifecycleManager.hooks.get('shutdown')).toEqual([shutdownHandler]);
    });
  });

  describe('executePhase()', () => {
    test('should execute all hooks for phase in order', async () => {
      const results = [];
      const handler1 = vi.fn().mockImplementation(async () => { results.push('handler1'); });
      const handler2 = vi.fn().mockImplementation(async () => { results.push('handler2'); });
      const context = { phase: 'test' };

      serverLifecycleManager.registerHook('test', handler1);
      serverLifecycleManager.registerHook('test', handler2);

      await serverLifecycleManager.executePhase('test', context);

      expect(handler1).toHaveBeenCalledWith(context);
      expect(handler2).toHaveBeenCalledWith(context);
      expect(results).toEqual(['handler1', 'handler2']);
    });

    test('should handle phase with no hooks', async () => {
      await expect(serverLifecycleManager.executePhase('nonexistent', {}))
        .resolves
        .not.toThrow();
    });

    test('should handle hook execution errors', async () => {
      const errorHandler = vi.fn().mockRejectedValue(new Error('Hook failed'));
      const successHandler = vi.fn();

      serverLifecycleManager.registerHook('test', errorHandler);
      serverLifecycleManager.registerHook('test', successHandler);

      await expect(serverLifecycleManager.executePhase('test', {}))
        .rejects
        .toThrow('Hook failed');
      
      expect(errorHandler).toHaveBeenCalled();
      expect(successHandler).not.toHaveBeenCalled(); // Should not execute after error
    });
  });

  describe('setupRequestPipeline()', () => {
    test('should register onRequest and onSend hooks', () => {
      serverLifecycleManager.setupRequestPipeline();

      expect(mockApp.addHook).toHaveBeenCalledWith('onRequest', expect.any(Function));
      expect(mockApp.addHook).toHaveBeenCalledWith('onSend', expect.any(Function));
    });
  });

  describe('createRequestHook()', () => {
    let requestHook;

    beforeEach(() => {
      requestHook = serverLifecycleManager.createRequestHook();
    });

    describe('Entity Identification', () => {
      test('should identify entities from request', async () => {
        const mockRequest = MockFactories.createMockRequest({
          url: '/tenants/test-tenant/dashboard'
        });
        const mockReply = MockFactories.createMockReply();
        const mockEntities = [
          { type: 'tenant', id: 'test-tenant', priority: 1 }
        ];

        mockEntityManager.identifyEntities.mockReturnValue(mockEntities);

        await requestHook(mockRequest, mockReply);

        expect(mockEntityManager.identifyEntities).toHaveBeenCalledWith(mockRequest);
        expect(mockRequest.entities).toEqual(mockEntities);
        expect(mockRequest.primaryEntity).toEqual(mockEntities[0]);
      });

      test('should set primary entity to first entity', async () => {
        const mockRequest = MockFactories.createMockRequest();
        const mockReply = MockFactories.createMockReply();
        const mockEntities = [
          { type: 'tenant', id: 'tenant1', priority: 1 },
          { type: 'user', id: 'user1', priority: 2 }
        ];

        mockEntityManager.identifyEntities.mockReturnValue(mockEntities);

        await requestHook(mockRequest, mockReply);

        expect(mockRequest.primaryEntity).toEqual(mockEntities[0]);
      });

      test('should handle no entities identified', async () => {
        const mockRequest = MockFactories.createMockRequest();
        const mockReply = MockFactories.createMockReply();

        mockEntityManager.identifyEntities.mockReturnValue([]);

        await requestHook(mockRequest, mockReply);

        expect(mockRequest.entities).toEqual([]);
        expect(mockRequest.primaryEntity).toBeNull();
      });
    });

    describe('Logger Enhancement', () => {
      test('should enhance logger with entity context', async () => {
        const mockRequest = MockFactories.createMockRequest({
          url: '/tenants/test-tenant/dashboard'
        });
        const mockReply = MockFactories.createMockReply();
        const mockChildLogger = MockFactories.createMockLogger();
        const originalLogChild = vi.fn().mockReturnValue(mockChildLogger);
        mockRequest.log.child = originalLogChild;
        
        const mockEntity = { type: 'tenant', id: 'test-tenant', priority: 1 };
        mockEntityManager.identifyEntities.mockReturnValue([mockEntity]);

        await requestHook(mockRequest, mockReply);

        expect(originalLogChild).toHaveBeenCalledWith({
          entityType: 'tenant',
          entityId: 'test-tenant'
        });
        expect(mockRequest.log).toBe(mockChildLogger);
      });

      test('should not enhance logger when no primary entity', async () => {
        const mockRequest = MockFactories.createMockRequest();
        const mockReply = MockFactories.createMockReply();
        const originalLog = mockRequest.log;

        mockEntityManager.identifyEntities.mockReturnValue([]);

        await requestHook(mockRequest, mockReply);

        expect(mockRequest.log).toBe(originalLog);
      });
    });

    describe('Entity Existence Check for API Routes', () => {
      test('should check entity existence for API routes', async () => {
        const mockRequest = MockFactories.createMockRequest({
          url: '/api/tenants/test-tenant/users'
        });
        const mockReply = MockFactories.createMockReply();
        const mockEntity = { type: 'tenant', id: 'test-tenant' };

        mockEntityManager.identifyEntities.mockReturnValue([mockEntity]);
        mockEntityManager.getEntity.mockReturnValue(null); // Entity not found

        await requestHook(mockRequest, mockReply);

        expect(mockEntityManager.getEntity).toHaveBeenCalledWith('tenant', 'test-tenant');
        expect(mockReply.code).toHaveBeenCalledWith(404);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: "Entity 'tenant:test-tenant' not found"
        });
      });

      test('should not check entity existence for non-API routes', async () => {
        const mockRequest = MockFactories.createMockRequest({
          url: '/public/css/styles.css'
        });
        const mockReply = MockFactories.createMockReply();
        const mockEntity = { type: 'tenant', id: 'test-tenant' };

        mockEntityManager.identifyEntities.mockReturnValue([mockEntity]);
        mockEntityManager.getEntity.mockReturnValue(null);

        await requestHook(mockRequest, mockReply);

        expect(mockEntityManager.getEntity).not.toHaveBeenCalled();
        expect(mockReply.code).not.toHaveBeenCalled();
      });

      test('should allow API requests when entity exists', async () => {
        const mockRequest = MockFactories.createMockRequest({
          url: '/api/tenants/test-tenant/users'
        });
        const mockReply = MockFactories.createMockReply();
        const mockEntity = { type: 'tenant', id: 'test-tenant' };
        const mockEntityContext = { type: 'tenant', id: 'test-tenant', active: true };

        mockEntityManager.identifyEntities.mockReturnValue([mockEntity]);
        mockEntityManager.getEntity.mockReturnValue(mockEntityContext);

        await requestHook(mockRequest, mockReply);

        expect(mockEntityManager.getEntity).toHaveBeenCalledWith('tenant', 'test-tenant');
        expect(mockReply.code).not.toHaveBeenCalled();
        expect(mockReply.send).not.toHaveBeenCalled();
      });

      test('should skip entity check when no primary entity', async () => {
        const mockRequest = MockFactories.createMockRequest({
          url: '/api/health'
        });
        const mockReply = MockFactories.createMockReply();

        mockEntityManager.identifyEntities.mockReturnValue([]);

        await requestHook(mockRequest, mockReply);

        expect(mockEntityManager.getEntity).not.toHaveBeenCalled();
        expect(mockReply.code).not.toHaveBeenCalled();
      });
    });

    describe('Error Handling', () => {
      test('should handle entity identification errors', async () => {
        const mockRequest = MockFactories.createMockRequest();
        const mockReply = MockFactories.createMockReply();

        mockEntityManager.identifyEntities.mockImplementation(() => {
          throw new Error('Entity identification failed');
        });

        await requestHook(mockRequest, mockReply);

        expect(mockRequest.log.error).toHaveBeenCalledWith(
          { err: expect.any(Error) },
          'Error in entity resolution'
        );
        expect(mockReply.code).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid entity identifier'
        });
      });

      test('should handle entity manager errors', async () => {
        const mockRequest = MockFactories.createMockRequest({
          url: '/api/test'
        });
        const mockReply = MockFactories.createMockReply();
        const mockEntity = { type: 'tenant', id: 'test-tenant' };

        mockEntityManager.identifyEntities.mockReturnValue([mockEntity]);
        mockEntityManager.getEntity.mockImplementation(() => {
          throw new Error('Entity manager error');
        });

        await requestHook(mockRequest, mockReply);

        expect(mockRequest.log.error).toHaveBeenCalledWith(
          { err: expect.any(Error) },
          'Error in entity resolution'
        );
        expect(mockReply.code).toHaveBeenCalledWith(400);
      });
    });
  });

  describe('createResponseHook()', () => {
    let responseHook;

    beforeEach(() => {
      responseHook = serverLifecycleManager.createResponseHook();
    });

    describe('Security Headers', () => {
      test('should add security headers', async () => {
        const mockRequest = MockFactories.createMockRequest();
        const mockReply = MockFactories.createMockReply();
        const payload = { data: 'test' };

        const result = await responseHook(mockRequest, mockReply, payload);

        expect(mockReply.header).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
        expect(mockReply.header).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
        expect(mockReply.header).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
        expect(result).toBe(payload);
      });
    });

    describe('Entity Headers', () => {
      test('should add entity headers when primary entity exists', async () => {
        const mockRequest = MockFactories.createMockRequest({
          primaryEntity: { type: 'tenant', id: 'test-tenant' }
        });
        const mockReply = MockFactories.createMockReply();
        const payload = { data: 'test' };

        await responseHook(mockRequest, mockReply, payload);

        expect(mockReply.header).toHaveBeenCalledWith('X-Entity-Type', 'tenant');
        expect(mockReply.header).toHaveBeenCalledWith('X-Entity-ID', 'test-tenant');
      });

      test('should not add entity headers when no primary entity', async () => {
        const mockRequest = MockFactories.createMockRequest({
          primaryEntity: null
        });
        const mockReply = MockFactories.createMockReply();
        const payload = { data: 'test' };

        await responseHook(mockRequest, mockReply, payload);

        expect(mockReply.header).not.toHaveBeenCalledWith('X-Entity-Type', expect.anything());
        expect(mockReply.header).not.toHaveBeenCalledWith('X-Entity-ID', expect.anything());
      });
    });

    describe('Payload Handling', () => {
      test('should return original payload', async () => {
        const mockRequest = MockFactories.createMockRequest();
        const mockReply = MockFactories.createMockReply();
        const payload = { complex: { data: 'structure' } };

        const result = await responseHook(mockRequest, mockReply, payload);

        expect(result).toBe(payload);
      });

      test('should handle null payload', async () => {
        const mockRequest = MockFactories.createMockRequest();
        const mockReply = MockFactories.createMockReply();
        const payload = null;

        const result = await responseHook(mockRequest, mockReply, payload);

        expect(result).toBeNull();
      });
    });
  });

  describe('setupGracefulShutdown()', () => {
    let closeWithGrace;

    beforeEach(async () => {
      closeWithGrace = (await import('close-with-grace')).default;
      closeWithGrace.mockClear();
    });

    test('should setup close-with-grace listener', () => {
      serverLifecycleManager.setupGracefulShutdown();

      expect(closeWithGrace).toHaveBeenCalledWith(
        { delay: 500 },
        expect.any(Function)
      );
    });

    test('should register onClose hook', () => {
      serverLifecycleManager.setupGracefulShutdown();

      expect(mockApp.addHook).toHaveBeenCalledWith('onClose', expect.any(Function));
    });

    describe('Graceful Shutdown Handler', () => {
      test('should handle normal shutdown', async () => {
        serverLifecycleManager.setupGracefulShutdown();
        
        const shutdownHandler = closeWithGrace.mock.calls[0][1];
        
        mockApp.close.mockResolvedValue();

        await shutdownHandler({ signal: 'SIGTERM' });

        expect(mockLogger.info).toHaveBeenCalledWith('Server closing due to SIGTERM');
        expect(mockApp.close).toHaveBeenCalled();
      });

      test('should handle error-triggered shutdown', async () => {
        serverLifecycleManager.setupGracefulShutdown();
        
        const shutdownHandler = closeWithGrace.mock.calls[0][1];
        const error = new Error('Test error');
        
        mockApp.close.mockResolvedValue();

        await shutdownHandler({ err: error });

        expect(mockLogger.error).toHaveBeenCalledWith(
          { err: error },
          '❌ Server closing due to error'
        );
        expect(mockApp.close).toHaveBeenCalled();
      });

      test('should handle app.close() errors', async () => {
        serverLifecycleManager.setupGracefulShutdown();
        
        const shutdownHandler = closeWithGrace.mock.calls[0][1];
        const closeError = new Error('Close error');
        
        mockApp.close.mockRejectedValue(closeError);

        await shutdownHandler({ signal: 'SIGTERM' });

        expect(mockLogger.error).toHaveBeenCalledWith(
          { err: closeError },
          '❌ Error during server close'
        );
      });
    });

    describe('onClose Hook Handler', () => {
      test('should uninstall close listeners on app close', () => {
        const mockUninstall = vi.fn();
        closeWithGrace.mockReturnValue({ uninstall: mockUninstall });

        serverLifecycleManager.setupGracefulShutdown();
        
        const onCloseHandler = mockApp.addHook.mock.calls.find(
          call => call[0] === 'onClose'
        )[1];
        const mockDone = vi.fn();

        onCloseHandler({}, mockDone);

        expect(mockUninstall).toHaveBeenCalled();
        expect(mockDone).toHaveBeenCalled();
      });
    });

    describe('Process Error Handlers', () => {
      let originalListeners;

      beforeEach(() => {
        originalListeners = {
          uncaughtException: process.listeners('uncaughtException').slice(),
          unhandledRejection: process.listeners('unhandledRejection').slice()
        };
      });

      afterEach(() => {
        // Clean up listeners
        process.removeAllListeners('uncaughtException');
        process.removeAllListeners('unhandledRejection');
        
        // Restore original listeners
        originalListeners.uncaughtException.forEach(listener => {
          process.on('uncaughtException', listener);
        });
        originalListeners.unhandledRejection.forEach(listener => {
          process.on('unhandledRejection', listener);
        });
      });

      test('should setup uncaught exception handler', () => {
        const originalExit = process.exit;
        process.exit = vi.fn();

        serverLifecycleManager.setupGracefulShutdown();

        // Find and test the uncaught exception handler
        const listeners = process.listeners('uncaughtException');
        const handler = listeners[listeners.length - 1];
        
        const testError = new Error('Uncaught test error');
        handler(testError);

        expect(mockLogger.fatal).toHaveBeenCalledWith(
          { err: testError },
          'Uncaught exception'
        );
        expect(process.exit).toHaveBeenCalledWith(1);

        process.exit = originalExit;
      });

      test('should setup unhandled rejection handler', () => {
        const originalExit = process.exit;
        process.exit = vi.fn();

        serverLifecycleManager.setupGracefulShutdown();

        // Find and test the unhandled rejection handler
        const listeners = process.listeners('unhandledRejection');
        const handler = listeners[listeners.length - 1];
        
        const testReason = 'Unhandled test rejection';
        const testPromise = Promise.reject(testReason);
        handler(testReason, testPromise);
        
        // Handle the promise to prevent unhandled rejection warning
        testPromise.catch(() => {});

        expect(mockLogger.fatal).toHaveBeenCalledWith(
          { reason: testReason, promise: testPromise },
          'Unhandled rejection'
        );
        expect(process.exit).toHaveBeenCalledWith(1);

        process.exit = originalExit;
      });
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle complete request lifecycle', async () => {
      serverLifecycleManager.setupRequestPipeline();

      const requestHook = mockApp.addHook.mock.calls.find(call => call[0] === 'onRequest')[1];
      const responseHook = mockApp.addHook.mock.calls.find(call => call[0] === 'onSend')[1];

      const mockRequest = MockFactories.createMockRequest({
        url: '/api/tenants/test-tenant/users'
      });
      const mockReply = MockFactories.createMockReply();
      const mockEntity = { type: 'tenant', id: 'test-tenant' };
      const mockEntityContext = { type: 'tenant', id: 'test-tenant', active: true };

      mockEntityManager.identifyEntities.mockReturnValue([mockEntity]);
      mockEntityManager.getEntity.mockReturnValue(mockEntityContext);

      // Execute request hook
      await requestHook(mockRequest, mockReply);

      expect(mockRequest.primaryEntity).toEqual(mockEntity);

      // Execute response hook
      const payload = { users: [] };
      const result = await responseHook(mockRequest, mockReply, payload);

      expect(mockReply.header).toHaveBeenCalledWith('X-Entity-Type', 'tenant');
      expect(mockReply.header).toHaveBeenCalledWith('X-Entity-ID', 'test-tenant');
      expect(result).toBe(payload);
    });

    test('should handle lifecycle hooks execution', async () => {
      const startupHandler = vi.fn().mockResolvedValue();
      const shutdownHandler = vi.fn().mockResolvedValue();

      serverLifecycleManager.registerHook('startup', startupHandler);
      serverLifecycleManager.registerHook('shutdown', shutdownHandler);

      const startupContext = { phase: 'startup' };
      const shutdownContext = { phase: 'shutdown' };

      await serverLifecycleManager.executePhase('startup', startupContext);
      await serverLifecycleManager.executePhase('shutdown', shutdownContext);

      expect(startupHandler).toHaveBeenCalledWith(startupContext);
      expect(shutdownHandler).toHaveBeenCalledWith(shutdownContext);
    });

    test('should handle multi-entity request scenarios', async () => {
      const requestHook = serverLifecycleManager.createRequestHook();

      const mockRequest = MockFactories.createMockRequest();
      const mockReply = MockFactories.createMockReply();
      const mockEntities = [
        { type: 'tenant', id: 'tenant1', priority: 1 },
        { type: 'user', id: 'user1', priority: 2 },
        { type: 'organization', id: 'org1', priority: 3 }
      ];

      mockEntityManager.identifyEntities.mockReturnValue(mockEntities);

      await requestHook(mockRequest, mockReply);

      expect(mockRequest.entities).toEqual(mockEntities);
      expect(mockRequest.primaryEntity).toEqual(mockEntities[0]); // Highest priority
    });
  });
});