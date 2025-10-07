import closeWithGrace from "close-with-grace";

/**
 * Server lifecycle manager
 */
export class ServerLifecycleManager {
  constructor(app, logger, entityManager) {
    this.app = app;
    this.logger = logger;
    this.entityManager = entityManager;
    this.hooks = new Map();
  }

  registerHook(phase, handler) {
    if (!this.hooks.has(phase)) {
      this.hooks.set(phase, []);
    }
    this.hooks.get(phase).push(handler);
  }

  async executePhase(phase, context) {
    const handlers = this.hooks.get(phase) || [];
    for (const handler of handlers) {
      await handler(context);
    }
  }

  setupRequestPipeline() {
    this.app.addHook("onRequest", this.createRequestHook());
    this.app.addHook("onSend", this.createResponseHook());
    // Error handler is now managed by graceful-shutdown plugin
  }

  createRequestHook() {
    return async (request, reply) => {
      try {
        const entityInfo = this.entityManager.identifyEntities(request);

        request.entities = entityInfo;
        request.primaryEntity = entityInfo[0] || null;

        if (request.primaryEntity) {
          request.log = request.log.child({
            entityType: request.primaryEntity.type,
            entityId: request.primaryEntity.id,
          });
        }

        // Check if entity exists for API routes
        if (request.url.startsWith("/api/") && request.primaryEntity) {
          const entity = this.entityManager.getEntity(
            request.primaryEntity.type,
            request.primaryEntity.id
          );

          if (!entity) {
            reply.code(404).send({
              success: false,
              error: `Entity '${request.primaryEntity.type}:${request.primaryEntity.id}' not found`,
            });
          }
        }
      } catch (err) {
        request.log.error({ err }, "Error in entity resolution");
        reply.code(400).send({
          success: false,
          error: "Invalid entity identifier",
        });
      }
    };
  }

  createResponseHook() {
    return async (request, reply, payload) => {
      reply.header("X-Content-Type-Options", "nosniff");
      reply.header("X-Frame-Options", "DENY");
      reply.header("X-XSS-Protection", "1; mode=block");

      if (request.primaryEntity) {
        reply.header("X-Entity-Type", request.primaryEntity.type);
        reply.header("X-Entity-ID", request.primaryEntity.id);
      }

      return payload;
    };
  }


  setupGracefulShutdown() {
    const closeListeners = closeWithGrace(
      { delay: 500 },
      async ({ signal, err }) => {
        if (err) {
          this.logger.error({ err }, "❌ Server closing due to error");
        } else {
          this.logger.info(`Server closing due to ${signal}`);
        }

        try {
          await this.app.close();
        } catch (closeErr) {
          this.logger.error({ err: closeErr }, "❌ Error during server close");
        }
      }
    );

    this.app.addHook("onClose", (instance, done) => {
      closeListeners.uninstall();
      done();
    });

    process.on("uncaughtException", (err) => {
      this.logger.fatal({ err }, "Uncaught exception");
      // Allow process.exit in tests when it's mocked, otherwise skip in test mode
      if (process.env.NODE_ENV !== "test" || (typeof process.exit.mock !== 'undefined')) {
        process.exit(1);
      }
    });

    process.on("unhandledRejection", (reason, promise) => {
      this.logger.fatal({ reason, promise }, "Unhandled rejection");
      // Allow process.exit in tests when it's mocked, otherwise skip in test mode
      if (process.env.NODE_ENV !== "test" || (typeof process.exit.mock !== 'undefined')) {
        process.exit(1);
      }
    });
  }
}