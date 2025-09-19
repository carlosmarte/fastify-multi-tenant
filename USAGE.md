# Generic Entity System Framework - Usage Guide

A configuration-driven multi-entity framework for Fastify that supports any type of organizational unit (tenants, products, regions, brands, etc.) through configuration rather than code duplication.

## Table of Contents

1. [Framework Overview](#framework-overview)
2. [Quick Start Guide](#quick-start-guide)
3. [Core Concepts](#core-concepts)
4. [Configuration Reference](#configuration-reference)
5. [Development Patterns](#development-patterns)
6. [API Reference](#api-reference)
7. [Production Deployment](#production-deployment)
8. [Advanced Features](#advanced-features)
9. [Complete Examples](#complete-examples)
10. [Integration & Testing](#integration-testing)

## Framework Overview

### Philosophy

This framework goes beyond traditional multi-tenancy to provide a **Generic Entity System** that can handle any organizational unit:

- **Multi-Tenant SaaS**: Traditional tenant isolation
- **Product-Based**: Feature isolation by product line
- **Regional Services**: Geographic routing and localization
- **White-Label Apps**: Brand-specific configurations
- **Department Systems**: Team/department-based access
- **Feature Groupings**: Dynamic feature flag management
- **Environment-Specific**: Development, staging, production variants

### Key Features

- **Configuration-Driven**: Define entity types through JSON, not code
- **Multiple Identification Strategies**: Subdomain, path, header, query parameter
- **Hierarchical Resource Loading**: Global → Parent → Entity inheritance
- **Security-First Design**: Input validation, path traversal protection
- **Lifecycle Management**: Entity state tracking and transitions
- **Plugin Ecosystem**: Local and NPM plugin support
- **Production-Ready**: Health checks, graceful shutdown, monitoring

### When to Use This Framework

✅ **Good Fit:**
- Multi-tenant SaaS applications
- Applications with multiple brands/products
- Services needing regional/geographic isolation
- Systems with department-based access control
- Applications with complex feature flagging needs

❌ **Not Ideal For:**
- Simple single-tenant applications
- Static websites without dynamic content
- Applications where all users share identical functionality

## Quick Start Guide

### 1. Installation

```bash
npm install fastify
# Copy main.mjs to your project
```

### 2. Basic Project Structure

```
my-app/
├── main.mjs                 # Framework entry point
├── entity-config.json      # Entity definitions
├── .env                     # Environment variables
├── plugins/                 # Core plugins
│   ├── database/
│   ├── auth/
│   └── logger/
├── routes/                  # Global routes
│   ├── api/
│   └── health/
└── entities/               # Entity-specific resources
    └── tenants/            # Example: tenant entities
        ├── acme/           # Entity ID: "acme"
        │   ├── config.json
        │   ├── services/
        │   ├── plugins/
        │   └── routes/
        └── globex/         # Entity ID: "globex"
            ├── config.json
            ├── services/
            ├── plugins/
            └── routes/
```

### 3. Minimal Configuration

Create `entity-config.json`:

```json
{
  "server": {
    "port": 3000,
    "host": "0.0.0.0"
  },
  "entities": {
    "definitions": {
      "tenant": {
        "enabled": true,
        "basePath": "/tenants",
        "identificationStrategy": "subdomain",
        "routePrefix": "/app/{entityId}",
        "resourceLoading": {
          "schemas": true,
          "services": true,
          "plugins": true,
          "routes": true
        },
        "maxInstances": 100,
        "priority": 1
      }
    },
    "defaultEntity": "tenant",
    "hierarchicalLoading": true
  }
}
```

### 4. Environment Variables

Create `.env`:

```bash
NODE_ENV=development
LOG_LEVEL=info
HOST=0.0.0.0
PORT=3000

# Database (if using database plugin)
DB_DIALECT=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=myapp
DB_USER=user
DB_PASS=password
```

### 5. Start the Server

```javascript
// server.js
import { GenericEntityServer } from './main.mjs';

const server = new GenericEntityServer();

async function start() {
  try {
    await server.start();
    await server.listen();
    console.log('Server started successfully!');
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
```

### 6. Test Your Setup

```bash
# Start the server
node server.js

# Test endpoints
curl http://localhost:3000/health          # Health check
curl http://localhost:3000/admin/entities  # Entity overview
curl http://acme.localhost:3000/api        # Tenant-specific endpoint
```

## Core Concepts

### Entity Identification Strategies

The framework supports multiple ways to identify which entity a request belongs to:

#### 1. Subdomain Strategy

Extracts entity ID from subdomain:

```json
{
  "identificationStrategy": "subdomain",
  "extractPattern": "^([^.]+)\\.(.+\\..+)$"
}
```

**Examples:**
- `acme.myapp.com` → Entity: "acme"
- `globex.localhost:3000` → Entity: "globex"

#### 2. Path Strategy

Extracts entity ID from URL path:

```json
{
  "identificationStrategy": "path",
  "pathPrefix": "/tenants",
  "pathSegment": 1
}
```

**Examples:**
- `/tenants/acme/dashboard` → Entity: "acme"
- `/tenants/globex/api/users` → Entity: "globex"

#### 3. Header Strategy

Extracts entity ID from HTTP header:

```json
{
  "identificationStrategy": "header",
  "headerName": "X-Tenant-ID",
  "headerPattern": "^(.+)$"
}
```

**Examples:**
- `X-Tenant-ID: acme` → Entity: "acme"
- `X-Client-ID: globex` → Entity: "globex"

#### 4. Query Strategy

Extracts entity ID from query parameter:

```json
{
  "identificationStrategy": "query",
  "parameterName": "tenant",
  "defaultValue": "default"
}
```

**Examples:**
- `/api/users?tenant=acme` → Entity: "acme"
- `/dashboard?client=globex` → Entity: "globex"

#### 5. Composite Strategy

Combines multiple strategies with priority fallback:

```json
{
  "identificationStrategy": "composite",
  "strategies": [
    {
      "type": "subdomain",
      "priority": 1,
      "extractPattern": "^([^.]+)\\.(.+\\..+)$"
    },
    {
      "type": "header",
      "priority": 2,
      "headerName": "X-Tenant-ID"
    },
    {
      "type": "query",
      "priority": 3,
      "parameterName": "tenant"
    }
  ]
}
```

### Resource Loading Hierarchy

The framework loads resources in a hierarchical order, allowing inheritance and overrides:

```
Global Resources (shared by all entities)
    ↓
Parent Entity Resources (if entity has parent)
    ↓
Entity-Specific Resources (highest priority)
```

#### Resource Types

1. **Schemas**: JSON schemas for request/response validation
2. **Services**: Business logic classes/functions
3. **Plugins**: Fastify plugins for middleware/functionality
4. **Routes**: HTTP route handlers

#### Loading Order Example

For entity "acme" with parent "enterprise":

```
1. Global:     /schemas/user.json
2. Parent:     /entities/enterprises/schemas/user.json
3. Entity:     /entities/tenants/acme/schemas/user.json
```

Entity-specific resources override parent and global resources.

### Entity Lifecycle Management

Entities have well-defined states and transitions:

#### States

- **UNLOADED**: Entity not loaded
- **LOADING**: Entity being loaded
- **ACTIVE**: Entity ready to serve requests
- **SUSPENDED**: Entity temporarily disabled
- **ERROR**: Entity failed to load/crashed
- **UNLOADING**: Entity being removed

#### Transitions

```javascript
// Load an entity
await entityManager.loadEntity(app, 'tenant', '/entities/tenants/acme');

// Reload an entity (useful for config changes)
await entityManager.reloadEntity(app, 'tenant', 'acme');

// Unload an entity
await entityManager.unloadEntity('tenant', 'acme');
```

### Security Model

#### Input Validation

All entity IDs and plugin names are validated:

```javascript
// Default patterns (configurable)
entityIdPattern: /^[a-zA-Z0-9\-_]+$/
pluginNamePattern: /^[a-zA-Z0-9\-_]+$/
maxIdLength: 64
```

#### Path Traversal Protection

All file paths are resolved securely:

```javascript
// Safe - resolved within base directory
const safePath = pathResolver.resolvePath('entities/tenant1/config.json');

// Blocked - path traversal attempt
const blockedPath = pathResolver.resolvePath('../../../etc/passwd'); // Throws ValidationError
```

#### Entity Isolation

Entities can be configured with strict isolation:

```json
{
  "security": {
    "authentication": "required",
    "isolation": "strict"
  }
}
```

## Configuration Reference

### Entity Configuration Schema

```json
{
  "server": {
    "port": 3000,
    "host": "0.0.0.0"
  },
  "logger": {
    "level": "info",
    "pretty": true
  },
  "plugins": {
    "coreOrder": ["database", "auth", "cookie", "exception", "logger"],
    "npmPattern": "fastify-mta-entity-*"
  },
  "entities": {
    "definitions": {
      "entityType": {
        "enabled": true,
        "basePath": "/path/to/entities",
        "identificationStrategy": "subdomain|path|header|query|composite",
        "routePrefix": "/prefix/{entityId}",
        "resourceLoading": {
          "schemas": true,
          "services": true,
          "plugins": true,
          "routes": true
        },
        "maxInstances": 100,
        "priority": 1,
        "parent": "parentEntityType",
        "mergeStrategy": "override|extend|isolate",
        "security": {
          "authentication": "required|optional",
          "isolation": "strict|relaxed"
        }
      }
    },
    "defaultEntity": "entityType",
    "hierarchicalLoading": true,
    "globalResources": {
      "schemas": "/schemas",
      "services": "/services",
      "plugins": "/plugins",
      "routes": "/routes"
    }
  },
  "security": {
    "validateInputs": true,
    "maxIdLength": 64,
    "globalPolicies": {
      "pathTraversalProtection": true,
      "entityValidation": true,
      "rateLimiting": {
        "enabled": false,
        "perEntity": true
      }
    }
  }
}
```

### Entity-Specific Configuration

Each entity directory can contain a `config.json`:

```json
{
  "name": "Acme Corporation",
  "active": true,
  "priority": 1,
  "features": {
    "advancedReporting": true,
    "apiAccess": true
  },
  "settings": {
    "theme": "dark",
    "timezone": "America/New_York"
  },
  "security": {
    "authentication": "required",
    "isolation": "strict"
  },
  "database": {
    "schema": "acme_tenant",
    "migrations": true
  }
}
```

## Development Patterns

### Project Structure Best Practices

#### Recommended Directory Layout

```
project-root/
├── main.mjs                 # Framework entry point
├── server.js               # Application entry point
├── entity-config.json      # Entity type definitions
├── package.json
├── .env                     # Environment configuration
├── .env.local              # Local overrides
├── plugins/                # Core plugins (shared)
│   ├── database/
│   │   ├── index.mjs
│   │   └── models/
│   ├── auth/
│   │   ├── index.mjs
│   │   └── strategies/
│   ├── logger/
│   └── middleware/
├── schemas/                # Global schemas
│   ├── user.json
│   ├── common.json
│   └── api-responses.json
├── services/               # Global services
│   ├── email.mjs
│   ├── storage.mjs
│   └── utils.mjs
├── routes/                 # Global routes
│   ├── api/
│   │   └── index.mjs
│   ├── health/
│   │   └── index.mjs
│   └── docs/
│       └── index.mjs
├── entities/               # Entity-specific resources
│   ├── tenants/            # Entity type directory
│   │   ├── acme/           # Entity instance
│   │   │   ├── config.json
│   │   │   ├── schemas/
│   │   │   │   └── tenant-user.json
│   │   │   ├── services/
│   │   │   │   ├── billing.mjs
│   │   │   │   └── reporting.mjs
│   │   │   ├── plugins/
│   │   │   │   └── tenant-middleware/
│   │   │   │       └── index.mjs
│   │   │   └── routes/
│   │   │       └── index.mjs
│   │   └── globex/
│   │       ├── config.json
│   │       └── routes/
│   │           └── index.mjs
│   ├── products/           # Another entity type
│   │   ├── widget-pro/
│   │   └── widget-lite/
│   └── regions/            # Geographic entities
│       ├── us-east/
│       └── eu-west/
└── tests/
    ├── integration/
    └── unit/
```

### Creating Services

Services are loaded automatically and can be classes or functions:

```javascript
// services/email.mjs
export default class EmailService {
  constructor(db, config) {
    this.db = db;
    this.config = config;
  }

  async sendEmail(to, subject, body) {
    // Implementation
  }
}

// services/utils.mjs
export default function createUtilities(db, config) {
  return {
    formatDate(date) {
      // Implementation
    },
    validateInput(input) {
      // Implementation
    }
  };
}
```

### Creating Plugins

Plugins follow Fastify plugin conventions:

```javascript
// plugins/auth/index.mjs
import fp from 'fastify-plugin';

async function authPlugin(fastify, options) {
  // Register authentication logic
  fastify.register(import('@fastify/jwt'), {
    secret: options.jwtSecret
  });

  fastify.decorate('authenticate', async function(request, reply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });
}

export default fp(authPlugin, {
  name: 'auth-plugin',
  dependencies: ['database']
});
```

### Creating Routes

Routes can access entity context and services:

```javascript
// entities/tenants/acme/routes/index.mjs
async function routes(fastify, options) {
  const { entityType, entityId, config } = options;

  // Access entity-specific services
  const billingService = fastify.entityManager
    .getEntity(entityType, entityId)
    .getService('billing');

  fastify.get('/dashboard', async (request, reply) => {
    const entity = request.primaryEntity;
    
    return {
      tenant: entity.id,
      message: `Welcome to ${config.name}!`,
      features: config.features
    };
  });

  fastify.get('/billing', async (request, reply) => {
    const invoices = await billingService.getInvoices();
    return { invoices };
  });
}

export default routes;
```

### Custom Identification Strategies

Create custom identification logic:

```javascript
// strategies/custom-strategy.mjs
import { EntityIdentificationStrategy } from '../main.mjs';

export class CustomIdentificationStrategy extends EntityIdentificationStrategy {
  extractEntityId(request, entityConfig) {
    // Custom logic - example: JWT token claim
    if (request.user?.tenantId) {
      return request.user.tenantId;
    }
    
    // Fallback to header
    return request.headers['x-tenant-id'] || null;
  }
}

// Register in server initialization
const identificationManager = new EntityIdentificationManager(securityService);
identificationManager.registerStrategy('custom', new CustomIdentificationStrategy());
```

### Custom Entity Adapters

Support for custom entity sources:

```javascript
// adapters/database-adapter.mjs
import { EntityAdapter } from '../main.mjs';

export class DatabaseEntityAdapter extends EntityAdapter {
  constructor(logger, pathResolver, resourceLoader, loadingStrategy, db) {
    super(logger, pathResolver, resourceLoader, loadingStrategy);
    this.db = db;
  }

  getType() {
    return 'database';
  }

  async canHandle(source) {
    // Check if source is a database connection string
    return source.startsWith('postgres://') || source.startsWith('mysql://');
  }

  async loadConfig(source, defaults) {
    // Load entity configuration from database
    const config = await this.db.query(
      'SELECT config FROM entities WHERE source = $1',
      [source]
    );
    return { ...defaults, ...config.rows[0]?.config };
  }

  async loadResources(app, entityContext) {
    // Load resources from database instead of filesystem
    const { type: entityType, id: entityId } = entityContext;
    
    // Load and register database-stored plugins, services, etc.
    // Implementation specific to your database schema
  }
}
```

## API Reference

### GenericEntityServer

Main server class that orchestrates the entire framework.

```javascript
import { GenericEntityServer } from './main.mjs';

const server = new GenericEntityServer(options);
```

#### Constructor Options

```javascript
const options = {
  suppressErrorLogging: false,  // Suppress error logs (useful for testing)
  security: {                   // Security service options
    entityIdPattern: /^[a-zA-Z0-9\-_]+$/,
    pluginNamePattern: /^[a-zA-Z0-9\-_]+$/,
    maxIdLength: 64
  }
};
```

#### Methods

##### `start(options)`

Initialize the server with configuration.

```javascript
await server.start({
  entityConfigPath: './custom-config.json',  // Custom config path
  server: {
    port: 3001,
    host: '127.0.0.1'
  },
  entities: {
    autoLoad: true  // Auto-load entities on startup
  }
});
```

##### `listen(port, host)`

Start listening for HTTP requests.

```javascript
await server.listen(3000, '0.0.0.0');
// or
await server.listen(); // Uses config values
```

##### `stop()`

Gracefully shutdown the server.

```javascript
await server.stop();
```

##### `getRegisteredRoutes()`

Get all registered routes.

```javascript
const routes = server.getRegisteredRoutes();
// Returns: [{ path: '/api/users', method: 'GET' }, ...]
```

##### `logEndpoints()`

Log endpoint patterns to console.

```javascript
server.logEndpoints();
```

### EntityManager

Facade for entity operations.

```javascript
const entityManager = server.dependencies.entityManager;
```

#### Methods

##### `identifyEntities(request)`

Extract entity information from request.

```javascript
const entities = entityManager.identifyEntities(request);
// Returns: [{ type: 'tenant', id: 'acme', priority: 1, definition: {...} }]
```

##### `getEntity(entityType, entityId)`

Get a loaded entity.

```javascript
const entity = entityManager.getEntity('tenant', 'acme');
if (entity) {
  console.log(entity.toJSON());
}
```

##### `loadEntity(app, entityType, source, customEntityId)`

Dynamically load an entity.

```javascript
const entity = await entityManager.loadEntity(
  app, 
  'tenant', 
  '/entities/tenants/new-client',
  'new-client'
);
```

##### `reloadEntity(app, entityType, entityId)`

Reload an existing entity (useful for config changes).

```javascript
await entityManager.reloadEntity(app, 'tenant', 'acme');
```

##### `unloadEntity(entityType, entityId)`

Remove an entity from memory.

```javascript
await entityManager.unloadEntity('tenant', 'acme');
```

##### `getStats()`

Get entity statistics.

```javascript
const stats = entityManager.getStats();
console.log(stats);
// {
//   total: 5,
//   active: 4,
//   inactive: 1,
//   byType: { tenant: { total: 3, active: 3, services: 12 } },
//   servicesLoaded: 25,
//   history: { loaded: 5, failed: 0, reloaded: 2 }
// }
```

### EntityContext

Value object containing entity information and resources.

```javascript
const entity = entityManager.getEntity('tenant', 'acme');
```

#### Properties

```javascript
entity.type          // 'tenant'
entity.id            // 'acme'
entity.config        // Entity configuration object
entity.services      // Loaded services object
entity.plugins       // Set of loaded plugin names
entity.routes        // Set of loaded route paths
entity.schemas       // Set of loaded schema IDs
entity.active        // Boolean - entity active status
entity.createdAt     // Date - when entity was loaded
entity.metadata      // Additional metadata
```

#### Methods

##### `getService(name)`

Get a loaded service by name.

```javascript
const billingService = entity.getService('billing');
```

##### `listServices()`

Get names of all loaded services.

```javascript
const serviceNames = entity.listServices();
// ['billing', 'reporting', 'notifications']
```

##### `toJSON()`

Get serializable representation.

```javascript
const data = entity.toJSON();
```

### Result Pattern

Functional error handling pattern used throughout the framework.

```javascript
import { Result } from './main.mjs';

// Success case
const success = Result.ok(data);
console.log(success.success);  // true
console.log(success.value);    // data
console.log(success.unwrap()); // data

// Failure case
const failure = Result.fail('Something went wrong');
console.log(failure.success);  // false
console.log(failure.error);    // 'Something went wrong'
console.log(failure.unwrap()); // Throws Error

// Chaining
const result = Result.ok(5)
  .map(x => x * 2)           // Result.ok(10)
  .map(x => x.toString());   // Result.ok('10')

// Safe unwrapping
const value = result.unwrapOr('default'); // '10' or 'default'
```

### Error Classes

Custom error types for different scenarios.

```javascript
import { ValidationError, EntityError, PluginError } from './main.mjs';

// Validation errors (user input, configuration)
throw new ValidationError('Invalid entity ID format');

// Entity-specific errors
throw new EntityError('Entity not found', 'tenant', 'missing-id');

// Plugin-related errors  
throw new PluginError('Plugin failed to initialize', 'database');
```

## Production Deployment

### Environment Configuration

```bash
# Production environment
NODE_ENV=production
LOG_LEVEL=warn

# Server configuration
HOST=0.0.0.0
PORT=3000

# Database
DB_DIALECT=postgres
DB_HOST=db.internal
DB_PORT=5432
DB_NAME=production_app
DB_USER=app_user
DB_PASS=secure_password

# Security
JWT_SECRET=your-super-secure-secret
COOKIE_SECRET=another-secure-secret

# Monitoring
HEALTH_CHECK_INTERVAL=30000
```

### Docker Deployment

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3000

CMD ["node", "server.js"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
    depends_on:
      - postgres
    restart: unless-stopped

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=production_app
      - POSTGRES_USER=app_user
      - POSTGRES_PASSWORD=secure_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  postgres_data:
```

### Health Monitoring

The framework provides several monitoring endpoints:

```javascript
// Basic health check
GET /health
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "memory": {
    "rss": 45678592,
    "heapTotal": 20971520,
    "heapUsed": 15234816,
    "external": 1234567
  },
  "entities": {
    "total": 5,
    "active": 4,
    "byType": {
      "tenant": { "total": 3, "active": 3, "services": 12 },
      "product": { "total": 2, "active": 1, "services": 8 }
    }
  },
  "version": "1.0.0"
}

// Entity overview
GET /admin/entities
{
  "success": true,
  "data": {
    "tenant": {
      "definition": { /* entity type definition */ },
      "instances": [ /* array of entity instances */ ]
    }
  }
}

// Specific entity details
GET /admin/entities/tenant/acme
{
  "success": true,
  "data": {
    "type": "tenant",
    "id": "acme",
    "config": { /* entity configuration */ },
    "services": ["billing", "reporting"],
    "plugins": ["tenant-middleware"],
    "active": true,
    "createdAt": "2024-01-15T10:00:00.000Z"
  }
}
```

### Performance Optimization

#### Entity Caching

Entities are cached in memory after loading. Configure appropriate limits:

```json
{
  "entities": {
    "definitions": {
      "tenant": {
        "maxInstances": 1000,
        "cacheTimeout": 3600000
      }
    }
  }
}
```

#### Resource Loading

Optimize resource loading with appropriate strategies:

```json
{
  "entities": {
    "hierarchicalLoading": true,  // Enable inheritance
    "definitions": {
      "tenant": {
        "mergeStrategy": "extend",  // vs "override" or "isolate"
        "resourceLoading": {
          "schemas": true,
          "services": true,
          "plugins": false,  // Disable if not needed
          "routes": true
        }
      }
    }
  }
}
```

#### Database Connections

Use connection pooling for database-heavy applications:

```javascript
// plugins/database/index.mjs
async function databasePlugin(fastify, options) {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    max: 20,        // Maximum connections
    min: 2,         // Minimum connections
    idle: 10000,    // Close idle connections after 10s
    acquire: 30000  // Acquire timeout
  });
  
  fastify.decorate('db', pool);
}
```

### Monitoring & Observability

#### Custom Health Checks

```javascript
// Add custom health checks
server.app.get('/health/detailed', async (request, reply) => {
  const checks = {
    database: await checkDatabase(),
    redis: await checkRedis(),
    externalApi: await checkExternalAPI()
  };
  
  const allHealthy = Object.values(checks).every(check => check.healthy);
  
  reply.code(allHealthy ? 200 : 503);
  return {
    status: allHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    checks
  };
});
```

#### Logging Integration

```javascript
// Structured logging
const server = new GenericEntityServer({
  logger: {
    level: 'info',
    serializers: {
      req: (req) => ({
        method: req.method,
        url: req.url,
        entityType: req.primaryEntity?.type,
        entityId: req.primaryEntity?.id
      })
    }
  }
});
```

#### Metrics Collection

```javascript
// Custom metrics
let requestCount = 0;
let entityLoadCount = 0;

server.app.addHook('onRequest', async (request, reply) => {
  requestCount++;
});

server.app.get('/metrics', async (request, reply) => {
  const entities = server.dependencies.entityManager.getStats();
  
  return {
    requests: requestCount,
    entities: entities.total,
    entitiesLoaded: entityLoadCount,
    memory: process.memoryUsage(),
    uptime: process.uptime()
  };
});
```

### Troubleshooting

#### Common Issues

1. **Entity Not Found**
   ```
   Error: Entity 'tenant:missing-id' not found
   ```
   - Check entity directory exists
   - Verify entity ID format (alphanumeric, hyphens, underscores only)
   - Check `active: true` in entity config

2. **Plugin Loading Failed**
   ```
   Error: Failed to load plugin database
   ```
   - Verify plugin directory structure
   - Check `index.mjs` exists and exports function
   - Review plugin dependencies and initialization

3. **Path Traversal Error**
   ```
   ValidationError: Path traversal attempt detected
   ```
   - Check relative paths in configuration
   - Ensure all paths are within project directory
   - Review entity source paths

4. **Configuration Validation Failed**
   ```
   ValidationError: Entity type 'tenant' missing basePath
   ```
   - Review `entity-config.json` schema
   - Check required fields for entity definitions
   - Validate JSON syntax

#### Debug Mode

Enable detailed logging for troubleshooting:

```bash
NODE_ENV=development
LOG_LEVEL=debug
```

```javascript
const server = new GenericEntityServer({
  suppressErrorLogging: false
});
```

#### Entity State Inspection

```javascript
// Check entity lifecycle states
const lifecycleManager = server.dependencies.entityManager.lifecycleManager;
const states = lifecycleManager.getAllEntityStates();
console.log('Entity States:', states);

// Check specific entity state
const state = lifecycleManager.getState('tenant', 'acme');
console.log('Acme Tenant State:', state);
```

## Advanced Features

### NPM Package Entities

Load entities from NPM packages for reusable components:

#### Creating an NPM Entity Package

```json
// package.json for fastify-entity-analytics
{
  "name": "fastify-entity-analytics",
  "version": "1.0.0",
  "main": "index.mjs",
  "keywords": ["fastify", "entity", "analytics"]
}
```

```javascript
// index.mjs
async function analyticsEntity(fastify, options) {
  const { entityType, entityId, config } = options;

  // Register analytics routes
  fastify.get('/analytics/dashboard', async (request, reply) => {
    return {
      entity: entityId,
      analytics: await getAnalyticsData(entityId)
    };
  });

  fastify.get('/analytics/reports', async (request, reply) => {
    return {
      reports: await generateReports(entityId, request.query)
    };
  });
}

// Export entity configuration
analyticsEntity.config = {
  name: 'Analytics Entity',
  version: '1.0.0',
  features: {
    dashboard: true,
    reports: true,
    realTime: true
  }
};

export default analyticsEntity;
```

#### Using NPM Entities

```bash
npm install fastify-entity-analytics
```

```json
// entity-config.json
{
  "entities": {
    "definitions": {
      "analytics": {
        "enabled": true,
        "source": "npm",
        "packageName": "fastify-entity-analytics",
        "identificationStrategy": "path",
        "pathPrefix": "/analytics",
        "routePrefix": "/analytics/{entityId}"
      }
    }
  }
}
```

### Hierarchical Entity Inheritance

Create parent-child relationships between entity types:

```json
{
  "entities": {
    "definitions": {
      "enterprise": {
        "enabled": true,
        "basePath": "/enterprises",
        "identificationStrategy": "subdomain",
        "resourceLoading": {
          "schemas": true,
          "services": true,
          "plugins": true,
          "routes": false
        }
      },
      "tenant": {
        "enabled": true,
        "basePath": "/tenants",
        "parent": "enterprise",
        "identificationStrategy": "composite",
        "strategies": [
          {
            "type": "subdomain",
            "priority": 1,
            "extractPattern": "^([^.]+)-([^.]+)\\.(.+)$"
          },
          {
            "type": "path",
            "priority": 2,
            "pathPrefix": "/tenant"
          }
        ],
        "mergeStrategy": "extend"
      }
    }
  }
}
```

**Resource Loading Order:**
1. Global resources (`/schemas`, `/services`)
2. Enterprise resources (`/entities/enterprises/schemas`)
3. Tenant resources (`/entities/tenants/acme/schemas`)

### Custom Security Policies

Implement custom security validation:

```javascript
// security/custom-policies.mjs
export class CustomSecurityService extends EntitySecurityService {
  constructor(rules, apiKeyValidator) {
    super(rules);
    this.apiKeyValidator = apiKeyValidator;
  }

  async validateEntitySecurity(entityType, entityConfig, request) {
    // Call parent validation
    super.validateEntitySecurity(entityType, entityConfig, request);

    // Custom API key validation
    if (entityConfig.requiresApiKey) {
      const apiKey = request.headers['x-api-key'];
      if (!apiKey || !await this.apiKeyValidator.validate(apiKey, entityType)) {
        throw new ValidationError(`Invalid API key for ${entityType}`);
      }
    }

    // IP whitelist validation
    if (entityConfig.ipWhitelist) {
      const clientIP = request.ip;
      if (!entityConfig.ipWhitelist.includes(clientIP)) {
        throw new ValidationError(`IP ${clientIP} not allowed for ${entityType}`);
      }
    }

    return true;
  }
}

// Use custom security service
const customSecurity = new CustomSecurityService(
  { /* security rules */ },
  new APIKeyValidator()
);

const server = new GenericEntityServer({
  security: customSecurity
});
```

### Dynamic Entity Loading

Load entities dynamically at runtime:

```javascript
// Admin endpoint for dynamic loading
server.app.post('/admin/entities/:entityType', async (request, reply) => {
  const { entityType } = request.params;
  const { source, entityId } = request.body;

  try {
    const entity = await server.dependencies.entityManager.loadEntity(
      server.app,
      entityType,
      source,
      entityId
    );

    return {
      success: true,
      message: `Entity ${entityType}:${entityId} loaded successfully`,
      entity: entity.toJSON()
    };
  } catch (err) {
    reply.code(400);
    return {
      success: false,
      error: err.message
    };
  }
});

// Usage
curl -X POST http://localhost:3000/admin/entities/tenant \
  -H "Content-Type: application/json" \
  -d '{
    "source": "/entities/tenants/new-client",
    "entityId": "new-client"
  }'
```

### Real-time Entity Updates

Implement real-time entity configuration updates:

```javascript
// WebSocket integration for real-time updates
import { WebSocketServer } from 'ws';

class RealtimeEntityManager {
  constructor(entityManager) {
    this.entityManager = entityManager;
    this.wss = new WebSocketServer({ port: 8080 });
    this.setupWebSocket();
  }

  setupWebSocket() {
    this.wss.on('connection', (ws) => {
      ws.on('message', async (data) => {
        const message = JSON.parse(data.toString());
        
        switch (message.type) {
          case 'reload_entity':
            await this.reloadEntity(message.entityType, message.entityId);
            this.broadcast({
              type: 'entity_reloaded',
              entityType: message.entityType,
              entityId: message.entityId
            });
            break;

          case 'update_config':
            await this.updateEntityConfig(
              message.entityType,
              message.entityId,
              message.config
            );
            break;
        }
      });
    });
  }

  async reloadEntity(entityType, entityId) {
    await this.entityManager.reloadEntity(
      this.entityManager.app,
      entityType,
      entityId
    );
  }

  broadcast(message) {
    this.wss.clients.forEach((client) => {
      if (client.readyState === client.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  }
}
```

### Multi-Region Support

Configure entities for different regions:

```json
{
  "entities": {
    "definitions": {
      "region": {
        "enabled": true,
        "basePath": "/regions",
        "identificationStrategy": "composite",
        "strategies": [
          {
            "type": "header",
            "priority": 1,
            "headerName": "CF-IPCountry"
          },
          {
            "type": "subdomain",
            "priority": 2,
            "extractPattern": "^(us|eu|asia)-(.+)$"
          }
        ],
        "resourceLoading": {
          "schemas": true,
          "services": true,
          "plugins": true,
          "routes": true
        }
      }
    }
  }
}
```

```
entities/
└── regions/
    ├── us-east/
    │   ├── config.json
    │   └── services/
    │       └── payment.mjs    # Stripe integration
    ├── eu-west/
    │   ├── config.json
    │   └── services/
    │       └── payment.mjs    # European payment provider
    └── asia/
        ├── config.json
        └── services/
            └── payment.mjs    # Regional payment provider
```

## Complete Examples

### Example 1: Multi-Tenant SaaS Application

A complete SaaS application with tenant isolation:

#### Project Structure

```
saas-app/
├── main.mjs
├── server.js
├── entity-config.json
├── package.json
├── .env
├── plugins/
│   ├── database/
│   │   ├── index.mjs
│   │   └── models/
│   ├── auth/
│   │   ├── index.mjs
│   │   └── jwt.mjs
│   └── billing/
│       └── index.mjs
├── schemas/
│   ├── user.json
│   └── subscription.json
├── routes/
│   ├── api/
│   │   └── index.mjs
│   └── auth/
│       └── index.mjs
└── entities/
    └── tenants/
        ├── acme/
        │   ├── config.json
        │   ├── services/
        │   │   ├── user.mjs
        │   │   └── billing.mjs
        │   └── routes/
        │       └── index.mjs
        └── globex/
            ├── config.json
            └── services/
                └── user.mjs
```

#### Configuration

```json
// entity-config.json
{
  "server": {
    "port": 3000,
    "host": "0.0.0.0"
  },
  "logger": {
    "level": "info",
    "pretty": true
  },
  "plugins": {
    "coreOrder": ["database", "auth", "billing"]
  },
  "entities": {
    "definitions": {
      "tenant": {
        "enabled": true,
        "basePath": "/tenants",
        "identificationStrategy": "subdomain",
        "extractPattern": "^([^.]+)\\.myapp\\.com$",
        "routePrefix": "/app/{entityId}",
        "resourceLoading": {
          "schemas": true,
          "services": true,
          "plugins": false,
          "routes": true
        },
        "maxInstances": 1000,
        "security": {
          "authentication": "required",
          "isolation": "strict"
        }
      }
    },
    "defaultEntity": "tenant",
    "hierarchicalLoading": true
  }
}
```

#### Database Plugin

```javascript
// plugins/database/index.mjs
import fp from 'fastify-plugin';
import { Sequelize } from 'sequelize';

async function databasePlugin(fastify, options) {
  const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  });

  // Test connection
  await sequelize.authenticate();
  fastify.log.info('Database connected successfully');

  fastify.decorate('db', sequelize);

  // Graceful shutdown
  fastify.addHook('onClose', async () => {
    await sequelize.close();
  });
}

export default fp(databasePlugin, {
  name: 'database',
  dependencies: []
});
```

#### Tenant Service

```javascript
// entities/tenants/acme/services/user.mjs
export default class TenantUserService {
  constructor(db, config) {
    this.db = db;
    this.config = config;
    this.tenantId = config.id;
  }

  async getUsers() {
    const [results] = await this.db.query(
      'SELECT * FROM users WHERE tenant_id = ?',
      [this.tenantId]
    );
    return results;
  }

  async createUser(userData) {
    const [result] = await this.db.query(
      'INSERT INTO users (tenant_id, email, name) VALUES (?, ?, ?)',
      [this.tenantId, userData.email, userData.name]
    );
    return { id: result.insertId, ...userData };
  }

  async deleteUser(userId) {
    await this.db.query(
      'DELETE FROM users WHERE id = ? AND tenant_id = ?',
      [userId, this.tenantId]
    );
  }
}
```

#### Tenant Routes

```javascript
// entities/tenants/acme/routes/index.mjs
async function tenantRoutes(fastify, options) {
  const { entityType, entityId, config } = options;

  // Get tenant-specific user service
  const entity = fastify.entityManager.getEntity(entityType, entityId);
  const userService = entity.getService('user');

  // Tenant dashboard
  fastify.get('/dashboard', async (request, reply) => {
    const users = await userService.getUsers();
    
    return {
      tenant: {
        id: entityId,
        name: config.name,
        plan: config.subscription?.plan
      },
      stats: {
        userCount: users.length,
        lastLogin: users[0]?.lastLogin
      },
      features: config.features
    };
  });

  // User management
  fastify.get('/users', async (request, reply) => {
    const users = await userService.getUsers();
    return { users };
  });

  fastify.post('/users', async (request, reply) => {
    const user = await userService.createUser(request.body);
    return { user };
  });

  fastify.delete('/users/:userId', async (request, reply) => {
    await userService.deleteUser(request.params.userId);
    return { success: true };
  });
}

export default tenantRoutes;
```

#### Tenant Configuration

```json
// entities/tenants/acme/config.json
{
  "name": "Acme Corporation",
  "active": true,
  "subscription": {
    "plan": "enterprise",
    "maxUsers": 1000,
    "features": {
      "advancedReporting": true,
      "apiAccess": true,
      "customBranding": true
    }
  },
  "settings": {
    "theme": "corporate",
    "timezone": "America/New_York",
    "locale": "en-US"
  },
  "integrations": {
    "sso": {
      "enabled": true,
      "provider": "okta",
      "domain": "acme.okta.com"
    },
    "webhooks": {
      "userCreated": "https://acme.com/webhooks/user-created",
      "subscriptionChanged": "https://acme.com/webhooks/subscription"
    }
  }
}
```

#### Server Startup

```javascript
// server.js
import { GenericEntityServer } from './main.mjs';

const server = new GenericEntityServer();

async function start() {
  try {
    await server.start();
    await server.listen();
    
    // Log available endpoints
    server.logEndpoints();
    
    console.log('\n🎉 SaaS Application Started!');
    console.log('🏢 Tenant Examples:');
    console.log('   • acme.localhost:3000/app/acme/dashboard');
    console.log('   • globex.localhost:3000/app/globex/dashboard');
    console.log('📊 Admin: http://localhost:3000/admin/entities');
    
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
```

### Example 2: Product-Based Feature Flags

Feature isolation by product line:

#### Configuration

```json
// entity-config.json
{
  "entities": {
    "definitions": {
      "product": {
        "enabled": true,
        "basePath": "/products",
        "identificationStrategy": "path",
        "pathPrefix": "/products",
        "pathSegment": 1,
        "routePrefix": "/products/{entityId}",
        "resourceLoading": {
          "schemas": false,
          "services": true,
          "plugins": true,
          "routes": true
        }
      }
    }
  }
}
```

#### Product Structure

```
entities/
└── products/
    ├── widget-pro/
    │   ├── config.json
    │   ├── services/
    │   │   ├── analytics.mjs
    │   │   └── premium-features.mjs
    │   └── routes/
    │       └── index.mjs
    ├── widget-lite/
    │   ├── config.json
    │   └── routes/
    │       └── index.mjs
    └── widget-enterprise/
        ├── config.json
        ├── services/
        │   ├── analytics.mjs
        │   ├── premium-features.mjs
        │   └── enterprise-features.mjs
        └── routes/
            └── index.mjs
```

#### Product Configuration

```json
// entities/products/widget-pro/config.json
{
  "name": "Widget Pro",
  "active": true,
  "features": {
    "analytics": true,
    "advancedReporting": true,
    "apiAccess": false,
    "customizations": {
      "themes": 5,
      "branding": true
    }
  },
  "limits": {
    "requestsPerMinute": 1000,
    "storageGB": 100
  },
  "pricing": {
    "tier": "pro",
    "monthlyPrice": 99
  }
}
```

#### Feature Service

```javascript
// entities/products/widget-pro/services/premium-features.mjs
export default class PremiumFeaturesService {
  constructor(db, config) {
    this.db = db;
    this.config = config;
    this.features = config.features;
  }

  isFeatureEnabled(featureName) {
    return this.features[featureName] === true;
  }

  getAvailableFeatures() {
    return Object.keys(this.features).filter(
      feature => this.features[feature] === true
    );
  }

  async getUsageStats(userId) {
    if (!this.isFeatureEnabled('analytics')) {
      throw new Error('Analytics not available for this product');
    }

    // Implementation
    return {
      requests: 1500,
      storage: 45.2,
      features: this.getAvailableFeatures()
    };
  }
}
```

### Example 3: Regional Service Routing

Geographic-based entity routing:

#### Regional Configuration

```json
{
  "entities": {
    "definitions": {
      "region": {
        "enabled": true,
        "basePath": "/regions",
        "identificationStrategy": "composite",
        "strategies": [
          {
            "type": "header",
            "priority": 1,
            "headerName": "CF-IPCountry"
          },
          {
            "type": "subdomain",
            "priority": 2,
            "extractPattern": "^(us|eu|asia)-api\\.myapp\\.com$"
          },
          {
            "type": "query",
            "priority": 3,
            "parameterName": "region",
            "defaultValue": "us"
          }
        ],
        "routePrefix": "/api/v1/{entityId}"
      }
    }
  }
}
```

#### Regional Services

```javascript
// entities/regions/eu/services/payment.mjs
export default class EuropeanPaymentService {
  constructor(db, config) {
    this.db = db;
    this.config = config;
    this.provider = 'stripe-eu';
    this.currency = 'EUR';
    this.vatRate = 0.20;
  }

  async processPayment(amount, paymentMethod) {
    // GDPR-compliant payment processing
    const vatAmount = amount * this.vatRate;
    const totalAmount = amount + vatAmount;

    return {
      amount: totalAmount,
      currency: this.currency,
      vat: vatAmount,
      provider: this.provider,
      gdprCompliant: true
    };
  }
}

// entities/regions/us/services/payment.mjs
export default class USPaymentService {
  constructor(db, config) {
    this.db = db;
    this.config = config;
    this.provider = 'stripe-us';
    this.currency = 'USD';
  }

  async processPayment(amount, paymentMethod) {
    // US-specific payment processing
    return {
      amount,
      currency: this.currency,
      provider: this.provider,
      taxCalculated: false // Handled separately
    };
  }
}
```

## Integration & Testing

### Testing Setup

#### Basic Test Structure

```javascript
// tests/setup.js
import { GenericEntityServer } from '../main.mjs';

export async function createTestServer(options = {}) {
  const server = new GenericEntityServer({
    suppressErrorLogging: true,
    ...options
  });

  await server.start({
    server: { port: 0 }, // Random available port
    entities: { autoLoad: false }, // Manual entity loading in tests
    ...options
  });

  return server;
}

export async function createTestEntity(server, entityType, entityConfig) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'entity-test-'));
  
  // Create entity structure
  await fs.writeFile(
    path.join(tempDir, 'config.json'),
    JSON.stringify(entityConfig, null, 2)
  );

  // Load entity
  const entity = await server.dependencies.entityManager.loadEntity(
    server.app,
    entityType,
    tempDir,
    entityConfig.id
  );

  return { entity, tempDir };
}
```

#### Unit Tests

```javascript
// tests/unit/entity-identification.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { createTestServer } from '../setup.js';

describe('Entity Identification', () => {
  let server;

  beforeEach(async () => {
    server = await createTestServer({
      entities: {
        definitions: {
          tenant: {
            enabled: true,
            identificationStrategy: 'subdomain',
            extractPattern: '^([^.]+)\\.localhost$'
          }
        }
      }
    });
  });

  afterEach(async () => {
    await server.stop();
  });

  it('should identify entity from subdomain', async () => {
    const mockRequest = {
      hostname: 'acme.localhost',
      url: '/api/users',
      headers: {}
    };

    const entities = server.dependencies.entityManager.identifyEntities(mockRequest);
    
    assert.strictEqual(entities.length, 1);
    assert.strictEqual(entities[0].type, 'tenant');
    assert.strictEqual(entities[0].id, 'acme');
  });

  it('should handle invalid entity IDs', async () => {
    const mockRequest = {
      hostname: 'invalid-chars!@#.localhost',
      url: '/api/users',
      headers: {}
    };

    const entities = server.dependencies.entityManager.identifyEntities(mockRequest);
    assert.strictEqual(entities.length, 0);
  });
});
```

#### Integration Tests

```javascript
// tests/integration/tenant-routes.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { createTestServer, createTestEntity } from '../setup.js';

describe('Tenant Routes Integration', () => {
  let server;
  let testEntity;

  beforeEach(async () => {
    server = await createTestServer();
    
    const entityConfig = {
      id: 'test-tenant',
      name: 'Test Tenant',
      active: true,
      features: { dashboard: true }
    };

    testEntity = await createTestEntity(server, 'tenant', entityConfig);
  });

  afterEach(async () => {
    await server.stop();
    // Cleanup temp directory
    await fs.rm(testEntity.tempDir, { recursive: true, force: true });
  });

  it('should serve tenant-specific dashboard', async () => {
    const response = await server.app.inject({
      method: 'GET',
      url: '/app/test-tenant/dashboard',
      headers: {
        host: 'test-tenant.localhost'
      }
    });

    assert.strictEqual(response.statusCode, 200);
    const data = JSON.parse(response.payload);
    assert.strictEqual(data.tenant.id, 'test-tenant');
    assert.strictEqual(data.tenant.name, 'Test Tenant');
  });
});
```

#### Mock Entity Services

```javascript
// tests/mocks/services.js
export class MockUserService {
  constructor(db, config) {
    this.users = [
      { id: 1, email: 'user1@example.com', name: 'User One' },
      { id: 2, email: 'user2@example.com', name: 'User Two' }
    ];
  }

  async getUsers() {
    return this.users;
  }

  async createUser(userData) {
    const user = { id: Date.now(), ...userData };
    this.users.push(user);
    return user;
  }

  async deleteUser(userId) {
    const index = this.users.findIndex(u => u.id === userId);
    if (index > -1) {
      this.users.splice(index, 1);
    }
  }
}
```

### Development Tools

#### Entity Generator Script

```javascript
// tools/create-entity.mjs
#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';

const [entityType, entityId, entityName] = process.argv.slice(2);

if (!entityType || !entityId) {
  console.log('Usage: node tools/create-entity.mjs <entityType> <entityId> [entityName]');
  process.exit(1);
}

const entityDir = path.join('entities', `${entityType}s`, entityId);

// Create directory structure
await fs.mkdir(path.join(entityDir, 'services'), { recursive: true });
await fs.mkdir(path.join(entityDir, 'plugins'), { recursive: true });
await fs.mkdir(path.join(entityDir, 'routes'), { recursive: true });
await fs.mkdir(path.join(entityDir, 'schemas'), { recursive: true });

// Create config.json
const config = {
  name: entityName || entityId,
  active: true,
  features: {}
};

await fs.writeFile(
  path.join(entityDir, 'config.json'),
  JSON.stringify(config, null, 2)
);

// Create basic route
const routeTemplate = `async function routes(fastify, options) {
  const { entityType, entityId, config } = options;

  fastify.get('/info', async (request, reply) => {
    return {
      entity: {
        type: entityType,
        id: entityId,
        name: config.name
      },
      message: \`Hello from \${config.name}!\`
    };
  });
}

export default routes;
`;

await fs.writeFile(
  path.join(entityDir, 'routes', 'index.mjs'),
  routeTemplate
);

console.log(`✅ Created entity ${entityType}:${entityId} at ${entityDir}`);
```

#### Entity Validation Script

```javascript
// tools/validate-entities.mjs
#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { GenericEntityServer } from '../main.mjs';

async function validateEntities() {
  const server = new GenericEntityServer({ suppressErrorLogging: true });
  
  try {
    await server.start({ entities: { autoLoad: false } });
    console.log('✅ Server configuration valid');

    const entityTypes = server.configManager.getAllEntityTypes();
    
    for (const entityType of entityTypes) {
      const definition = server.configManager.getEntityDefinition(entityType);
      console.log(`\n📂 Validating ${entityType} entities:`);
      
      const entitiesPath = path.join('entities', definition.basePath.replace(/^\//, ''));
      
      try {
        const entityDirs = await fs.readdir(entitiesPath);
        
        for (const entityId of entityDirs) {
          if (entityId.startsWith('.')) continue;
          
          try {
            await server.dependencies.entityManager.loadEntity(
              server.app,
              entityType,
              path.join(entitiesPath, entityId),
              entityId
            );
            console.log(`  ✅ ${entityId}`);
          } catch (err) {
            console.log(`  ❌ ${entityId}: ${err.message}`);
          }
        }
      } catch (err) {
        console.log(`  ⚠️ No entities directory found: ${entitiesPath}`);
      }
    }
    
  } catch (err) {
    console.error('❌ Validation failed:', err.message);
    process.exit(1);
  } finally {
    await server.stop();
  }
}

validateEntities();
```

### CI/CD Integration

#### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Test Entity Framework

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run entity validation
        run: node tools/validate-entities.mjs
        
      - name: Run tests
        run: npm test
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/test
          NODE_ENV: test
          
      - name: Test entity loading
        run: node tools/test-entity-loading.mjs
```

This comprehensive usage guide covers all aspects of the Generic Entity System Framework, from basic setup to advanced production deployment patterns. The framework provides a powerful foundation for building scalable, multi-entity applications with Fastify.