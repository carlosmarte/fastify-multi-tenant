/**
 * Simple Logger Plugin
 * 
 * Adds request logging and decorates Fastify with logging utilities
 */

import fp from 'fastify-plugin';

async function loggerPlugin(fastify, options) {
  // Add request logging hook
  fastify.addHook('onRequest', async (request, reply) => {
    const start = Date.now();
    
    // Store start time for response timing
    request.startTime = start;
    
    // Log incoming request
    fastify.log.info({
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent']
    }, 'Incoming request');
  });
  
  // Add response logging hook
  fastify.addHook('onSend', async (request, reply, payload) => {
    const duration = Date.now() - request.startTime;
    
    // Log response
    fastify.log.info({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration: `${duration}ms`,
      entity: request.primaryEntity ? {
        type: request.primaryEntity.type,
        id: request.primaryEntity.id
      } : null
    }, 'Request completed');
    
    return payload;
  });
  
  // Add error logging hook
  fastify.addHook('onError', async (request, reply, error) => {
    fastify.log.error({
      method: request.method,
      url: request.url,
      error: {
        message: error.message,
        stack: error.stack,
        statusCode: error.statusCode
      }
    }, 'Request error');
  });
  
  // Decorate with helper methods (only if not already present)
  if (!fastify.hasDecorator('logInfo')) {
    fastify.decorate('logInfo', (message, data = {}) => {
      fastify.log.info(data, message);
    });
  }
  
  if (!fastify.hasDecorator('logError')) {
    fastify.decorate('logError', (message, error = null) => {
      const errorData = error ? {
        error: {
          message: error.message,
          stack: error.stack
        }
      } : {};
      fastify.log.error(errorData, message);
    });
  }
  
  fastify.log.info('Logger plugin initialized');
}

export default fp(loggerPlugin, {
  name: 'logger-plugin',
  dependencies: []
});