/**
 * Demo Tenant Routes
 * 
 * These routes are specific to the "demo" tenant and demonstrate
 * entity-specific functionality in the Generic Entity Framework.
 */

async function demoRoutes(fastify, options) {
  const { entityType, entityId, config } = options;
  
  // Main hello world endpoint
  fastify.get('/hello', async (request, reply) => {
    const customMessage = config.settings?.customMessage || 'Hello World!';
    const entity = request.primaryEntity;
    
    return {
      success: true,
      message: customMessage,
      entity: {
        type: entityType,
        id: entityId,
        name: config.name
      },
      greeting: `👋 ${customMessage}`,
      timestamp: new Date().toISOString(),
      source: 'entity-specific route',
      demonstrations: {
        note: 'This response comes from the demo tenant\'s specific route handler',
        tryAlso: [
          'http://localhost:3000/api/hello?tenant=demo (global route with entity detection)',
          'http://localhost:3000/tenants/demo/info (entity information)',
          'http://localhost:3000/admin/entities/tenant/demo (admin view)'
        ]
      }
    };
  });
  
  // Entity information endpoint
  fastify.get('/info', async (request, reply) => {
    const entity = fastify.entityManager.getEntity(entityType, entityId);
    
    return {
      success: true,
      message: 'Entity information',
      entity: {
        type: entityType,
        id: entityId,
        name: config.name,
        description: config.description,
        active: entity?.active || false,
        createdAt: entity?.createdAt || null
      },
      configuration: {
        features: config.features,
        settings: config.settings,
        demonstrations: config.demonstrations
      },
      capabilities: {
        services: entity?.listServices() || [],
        routes: Array.from(entity?.routes || []),
        schemas: Array.from(entity?.schemas || []),
        plugins: Array.from(entity?.plugins || [])
      },
      framework: {
        name: 'Generic Entity Framework',
        template: 'mta-helloworld',
        identificationStrategy: request.primaryEntity ? 'detected' : 'none'
      }
    };
  });
  
  // Customizable greeting endpoint
  fastify.get('/greeting', async (request, reply) => {
    const { name, style } = request.query;
    const entityName = config.name || entityId;
    const customMessage = config.settings?.customMessage || 'Hello World!';
    
    let greeting;
    const targetName = name || 'World';
    
    switch (style) {
      case 'formal':
        greeting = `Good day, ${targetName}. Welcome to ${entityName}.`;
        break;
      case 'casual':
        greeting = `Hey ${targetName}! 👋 Welcome to ${entityName}!`;
        break;
      case 'entity':
        greeting = `${customMessage} I'm ${entityName}, nice to meet you ${targetName}!`;
        break;
      default:
        greeting = `Hello ${targetName}, welcome to ${entityName}!`;
    }
    
    return {
      success: true,
      greeting,
      entity: {
        type: entityType,
        id: entityId,
        name: entityName
      },
      request: {
        name: targetName,
        style: style || 'default'
      },
      examples: [
        `${request.protocol}://${request.hostname}/app/demo/greeting?name=Alice&style=formal`,
        `${request.protocol}://${request.hostname}/app/demo/greeting?name=Bob&style=casual`, 
        `${request.protocol}://${request.hostname}/app/demo/greeting?name=Charlie&style=entity`
      ],
      timestamp: new Date().toISOString()
    };
  });
  
  // Demo of entity context access
  fastify.get('/context', async (request, reply) => {
    const entity = fastify.entityManager.getEntity(entityType, entityId);
    const allEntities = fastify.entityManager.getAllEntities();
    const stats = fastify.entityManager.getStats();
    
    return {
      success: true,
      message: 'Entity context demonstration',
      currentEntity: {
        type: entityType,
        id: entityId,
        config: config,
        runtime: {
          active: entity?.active,
          createdAt: entity?.createdAt,
          services: entity?.listServices() || [],
          metadata: entity?.metadata
        }
      },
      systemContext: {
        totalEntities: allEntities.length,
        stats,
        allEntityIds: allEntities.map(e => `${e.type}:${e.id}`)
      },
      request: {
        identifiedEntities: request.entities?.length || 0,
        primaryEntity: request.primaryEntity ? {
          type: request.primaryEntity.type,
          id: request.primaryEntity.id
        } : null,
        url: request.url,
        method: request.method
      }
    };
  });
  
  // Health check specific to this entity
  fastify.get('/health', async (request, reply) => {
    const entity = fastify.entityManager.getEntity(entityType, entityId);
    const isHealthy = entity && entity.active && config.active;
    
    reply.code(isHealthy ? 200 : 503);
    
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      entity: {
        type: entityType,
        id: entityId,
        name: config.name,
        active: config.active,
        loaded: !!entity
      },
      checks: {
        configActive: config.active,
        entityLoaded: !!entity,
        entityActive: entity?.active || false
      },
      timestamp: new Date().toISOString()
    };
  });
}

export default demoRoutes;