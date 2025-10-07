/**
 * Health Check Routes
 * 
 * Provides health monitoring and system status endpoints
 */

async function healthRoutes(fastify, options) {
  // Basic health check (this is also provided by the framework)
  fastify.get('/health/simple', async (request, reply) => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      message: 'Hello World application is running!'
    };
  });
  
  // Detailed health check with entity information
  fastify.get('/health/detailed', async (request, reply) => {
    const entityManager = fastify.entityManager;
    const stats = entityManager.getStats();
    
    // Check various system components
    const checks = {
      server: {
        status: 'healthy',
        uptime: process.uptime(),
        memory: process.memoryUsage()
      },
      entities: {
        status: stats.total > 0 ? 'healthy' : 'warning',
        total: stats.total,
        active: stats.active,
        byType: stats.byType
      },
      framework: {
        status: 'healthy',
        version: '1.0.0',
        template: 'mta-helloworld'
      }
    };
    
    // Determine overall health
    const allHealthy = Object.values(checks).every(check => 
      check.status === 'healthy'
    );
    
    reply.code(allHealthy ? 200 : 503);
    
    return {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
      message: allHealthy 
        ? 'All systems operational' 
        : 'Some systems need attention'
    };
  });
  
  // Ready check (for container orchestration)
  fastify.get('/ready', async (request, reply) => {
    const entityManager = fastify.entityManager;
    const stats = entityManager.getStats();
    
    // Application is ready if entities are loaded
    const isReady = stats.total > 0;
    
    reply.code(isReady ? 200 : 503);
    
    return {
      ready: isReady,
      timestamp: new Date().toISOString(),
      entities: {
        loaded: stats.total,
        active: stats.active
      },
      message: isReady 
        ? 'Application is ready to serve requests' 
        : 'Application is starting up'
    };
  });
  
  // Live check (for container orchestration)
  fastify.get('/live', async (request, reply) => {
    return {
      alive: true,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      message: 'Application is alive'
    };
  });
}

export default healthRoutes;