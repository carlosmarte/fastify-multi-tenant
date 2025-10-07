# {{PROJECT_NAME}} - Generic Entity Framework Hello World

Welcome to your new Generic Entity Framework application! This project was generated from the `mta-helloworld` template and demonstrates the key concepts of multi-entity architecture.

## 🚀 Quick Start

```bash
# Install dependencies (if not already done)
npm install

# Start the development server
npm start

# Or with hot reloading
npm run dev
```

Your server will start at `http://localhost:3000`

## 🎯 Try These URLs

### Health & Status
- **Health Check**: http://localhost:3000/health
- **API Status**: http://localhost:3000/api
- **System Info**: http://localhost:3000/api/capabilities

### Hello World Demonstrations
- **Global Hello**: http://localhost:3000/api/hello
- **Demo Tenant (Subdomain)**: http://demo.localhost:3000/app/demo/hello
- **Demo Tenant (Path)**: http://localhost:3000/tenants/demo/hello
- **Demo Tenant (Query)**: http://localhost:3000/api/hello?tenant=demo

### Entity Management
- **All Entities**: http://localhost:3000/admin/entities
- **Demo Tenant Admin**: http://localhost:3000/admin/entities/tenant/demo
- **Entity Discovery**: http://localhost:3000/api/discover

## 🏗️ Project Structure

```
{{PROJECT_DIR}}/
├── main.mjs                    # Framework core
├── server.js                   # Application entry point
├── entity-config.json          # Entity configuration
├── .env                        # Environment variables
├── plugins/                    # Core plugins
│   └── logger/                 # Simple logging plugin
├── routes/                     # Global routes
│   ├── api/                    # API endpoints
│   └── health/                 # Health checks
└── entities/                   # Entity-specific resources
    └── tenants/                # Tenant entity type
        └── demo/               # Demo tenant instance
            ├── config.json     # Tenant configuration
            └── routes/         # Tenant-specific routes
                └── index.mjs   # Hello world routes
```

## 🔍 Understanding Entity Identification

This application demonstrates three ways to identify entities:

### 1. Subdomain Strategy (Priority 1)
```
http://demo.localhost:3000/app/demo/hello
     ↑
   Entity ID
```

### 2. Path Strategy (Priority 2)
```
http://localhost:3000/tenants/demo/hello
                            ↑
                        Entity ID
```

### 3. Query Strategy (Priority 3)
```
http://localhost:3000/api/hello?tenant=demo
                                      ↑
                                  Entity ID
```

## 🛠️ Customization

### Adding New Tenants

1. Create a new directory: `entities/tenants/your-tenant/`
2. Add configuration: `entities/tenants/your-tenant/config.json`
3. Add routes: `entities/tenants/your-tenant/routes/index.mjs`

Example:
```bash
mkdir -p entities/tenants/acme/routes
```

### Modifying Identification Strategies

Edit `entity-config.json` to change how entities are identified:

```json
{
  "entities": {
    "definitions": {
      "tenant": {
        "identificationStrategy": "composite",
        "strategies": [
          // Add or modify strategies here
        ]
      }
    }
  }
}
```

### Adding Global Routes

Create new route files in the `routes/` directory:

```javascript
// routes/my-routes/index.mjs
async function myRoutes(fastify, options) {
  fastify.get('/my-endpoint', async (request, reply) => {
    return { message: 'Hello from my custom route!' };
  });
}

export default myRoutes;
```

## 🔧 Environment Configuration

Key environment variables in `.env`:

```bash
NODE_ENV=development          # Environment mode
HOST=0.0.0.0                 # Server host
PORT=3000                    # Server port
LOG_LEVEL=info               # Logging level
CUSTOM_MESSAGE=Hello World!  # Custom greeting message
```

## 📚 Learning More

### Key Concepts Demonstrated

1. **Entity Identification**: Multiple strategies for identifying entities from requests
2. **Resource Loading**: Hierarchical loading of schemas, services, plugins, and routes
3. **Configuration-Driven**: Entity behavior defined through JSON configuration
4. **Multi-Strategy**: Composite identification with priority fallback
5. **Request Context**: Automatic entity injection into request objects

### Framework Features

- **Security**: Input validation, path traversal protection, entity isolation
- **Lifecycle Management**: Entity loading, unloading, and state tracking
- **Plugin System**: Local and NPM plugin support
- **Health Monitoring**: Built-in health checks and admin endpoints
- **Production Ready**: Graceful shutdown, error handling, logging

## 🏃‍♂️ Next Steps

1. **Explore the Code**: Check out the demo tenant in `entities/tenants/demo/`
2. **Add Your Tenant**: Create your own tenant directory and configuration
3. **Customize Routes**: Add new endpoints to existing or new entities
4. **Read the Docs**: See `USAGE.md` for comprehensive documentation
5. **Build Features**: Add services, plugins, and schemas as needed

## 🤝 Framework Documentation

This project uses the Generic Entity Framework. For comprehensive documentation, see:
- `USAGE.md` - Complete framework documentation
- Entity configuration examples in `entities/`
- Plugin examples in `plugins/`

## 🐛 Troubleshooting

### Common Issues

1. **Port Already in Use**: Change `PORT` in `.env` or run with different port:
   ```bash
   PORT=3001 npm start
   ```

2. **Subdomain Not Working**: Add to your `/etc/hosts`:
   ```
   127.0.0.1 demo.localhost
   ```

3. **Entity Not Found**: Check that the entity directory exists and `config.json` is valid

### Debug Mode

Enable detailed logging:
```bash
LOG_LEVEL=debug npm start
```

---

**Happy coding!** 🎉

Generated from the Generic Entity Framework `mta-helloworld` template.