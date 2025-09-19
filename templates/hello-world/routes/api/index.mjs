/**
 * Global API Routes
 * 
 * These routes are available globally and demonstrate different 
 * entity identification strategies.
 */

async function apiRoutes(fastify, options) {
  // API status endpoint
  fastify.get('/api', async (request, reply) => {
    const entities = request.entities || [];
    const primaryEntity = request.primaryEntity;
    
    return {
      success: true,
      message: 'Hello from the Generic Entity Framework!',
      timestamp: new Date().toISOString(),
      api: {
        version: '1.0.0',
        framework: 'Generic Entity Framework',
        template: 'mta-helloworld'
      },
      request: {
        method: request.method,
        url: request.url,
        ip: request.ip,
        userAgent: request.headers['user-agent']
      },
      entities: {
        identified: entities.length,
        primary: primaryEntity ? {
          type: primaryEntity.type,
          id: primaryEntity.id
        } : null,
        all: entities.map(e => ({
          type: e.type,
          id: e.id,
          priority: e.priority
        }))
      }
    };
  });
  
  // Global hello endpoint with entity detection
  fastify.get('/api/hello', async (request, reply) => {
    const primaryEntity = request.primaryEntity;
    const customMessage = process.env.CUSTOM_MESSAGE || 'Hello World!';
    
    return {
      success: true,
      message: customMessage,
      entity: primaryEntity ? {
        type: primaryEntity.type,
        id: primaryEntity.id,
        greeting: `Hello from ${primaryEntity.type} "${primaryEntity.id}"!`
      } : {
        type: 'global',
        id: 'system',
        greeting: 'Hello from the global system!'
      },
      timestamp: new Date().toISOString(),
      tips: [
        'Try http://demo.localhost:3000/api/hello for subdomain detection',
        'Try http://localhost:3000/api/hello?tenant=demo for query detection',
        'Try http://localhost:3000/tenants/demo/hello for path detection'
      ]
    };
  });
  
  // Endpoint discovery
  fastify.get('/api/discover', async (request, reply) => {
    const entityManager = fastify.entityManager;
    const allEntities = entityManager.getAllEntities();
    const stats = entityManager.getStats();
    
    return {
      success: true,
      message: 'Entity discovery information',
      stats,
      entities: allEntities.map(entity => ({
        type: entity.type,
        id: entity.id,
        name: entity.config.name || entity.id,
        active: entity.active,
        services: entity.listServices(),
        routes: Array.from(entity.routes),
        createdAt: entity.createdAt
      })),
      availableStrategies: [
        {
          name: 'Subdomain',
          example: 'http://demo.localhost:3000/api/hello',
          description: 'Extract entity from subdomain'
        },
        {
          name: 'Path',
          example: 'http://localhost:3000/tenants/demo/hello',
          description: 'Extract entity from URL path'
        },
        {
          name: 'Query Parameter',
          example: 'http://localhost:3000/api/hello?tenant=demo',
          description: 'Extract entity from query parameter'
        }
      ]
    };
  });
  
  // System capabilities
  fastify.get('/api/capabilities', async (request, reply) => {
    const configManager = fastify.configManager;
    const entityTypes = configManager.getAllEntityTypes();
    
    return {
      success: true,
      message: 'System capabilities and configuration',
      framework: {
        name: 'Generic Entity Framework',
        version: '1.0.0',
        template: 'mta-helloworld'
      },
      capabilities: {
        multiTenant: true,
        entityTypes: entityTypes.length,
        identificationStrategies: ['subdomain', 'path', 'query', 'header', 'composite'],
        resourceLoading: ['schemas', 'services', 'plugins', 'routes'],
        securityFeatures: ['input validation', 'path traversal protection', 'entity isolation']
      },
      entityTypes: entityTypes.map(type => {
        const definition = configManager.getEntityDefinition(type);
        return {
          name: type,
          enabled: definition.enabled,
          strategy: definition.identificationStrategy,
          routePrefix: definition.routePrefix,
          maxInstances: definition.maxInstances
        };
      }),
      endpoints: {
        global: ['/api', '/api/hello', '/api/discover', '/api/capabilities'],
        health: ['/health'],
        admin: ['/admin/entities'],
        entity: ['/{routePrefix}/hello', '/{routePrefix}/info']
      }
    };
  });
}

export default apiRoutes;