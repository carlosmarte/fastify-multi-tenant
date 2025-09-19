# Template System Documentation

## Overview

The Generic Entity Framework provides two template generators for creating new projects:

1. **Direct Template Generator** (`bin/create-app.mjs`) - For local development and direct template usage
2. **NPX Package Generator** (`bin/create-app-pkg.mjs`) - For NPX distribution with `mta-` prefix convention

## NPX Commands

### Quick Start

Create a new project using NPX:

```bash
npx @thinkeloquent/fastify-mta-server mta-helloworld my-app
```

Or using the aliased command:

```bash
npx create-my-app mta-helloworld my-app
```

### Command Syntax

```bash
npx create-my-app <template> [project-name]
```

#### Arguments

| Argument | Required | Description | Example |
|----------|----------|-------------|---------|
| `template` | Yes | Template name with `mta-` prefix | `mta-helloworld` |
| `project-name` | No | Name/path for new project | `my-app`, `.`, `../projects/app` |

#### Options

| Option | Alias | Description |
|--------|-------|-------------|
| `--help` | `-h` | Show help message with usage examples |
| `--version` | `-v` | Display version number |

### Usage Examples

#### Create with specific name
```bash
npx create-my-app mta-helloworld my-awesome-app
```
Creates a new project in `./my-awesome-app/` directory.

#### Create in current directory
```bash
npx create-my-app mta-helloworld .
```
Initializes project in the current directory (must be empty).

#### Create with auto-generated name
```bash
npx create-my-app mta-helloworld
```
Creates a project with an auto-generated name like `helloworld-123456/`.

#### Get help
```bash
npx create-my-app --help
```

#### Check version
```bash
npx create-my-app --version
```

## Direct Usage (Without NPX)

For local development or custom templates without the `mta-` prefix:

```bash
# Clone the repository first
git clone https://github.com/your-org/fastify-multi-tenant.git
cd fastify-multi-tenant

# Use direct template generator
./bin/create-app.mjs hello-world my-app

# Or with node
node bin/create-app.mjs hello-world my-app
```

## Available Templates

### mta-helloworld
A simple Hello World application demonstrating:
- Basic multi-tenant setup
- Demo tenant configuration
- Health check endpoints
- Admin panel integration
- Both subdomain and path-based tenant routing

**Included endpoints:**
- `http://localhost:3000/health` - Health check
- `http://localhost:3000/api` - API status
- `http://demo.localhost:3000/app/demo/hello` - Demo tenant (subdomain)
- `http://localhost:3000/tenants/demo/hello` - Demo tenant (path)
- `http://localhost:3000/admin/entities` - Entity admin

## Template Structure

When you create a new project, the following structure is generated:

```
my-app/
├── main.mjs                 # Framework core (copied from package)
├── app.mjs                  # Application launcher
├── package.json            # Dependencies and scripts
├── entity-config.json      # Entity configuration
├── .env                    # Environment variables
├── entities/              # Entity definitions
│   └── tenants/          # Tenant-specific entities
│       └── demo/         # Demo tenant
│           └── hello.mjs # Hello endpoint
├── public/               # Static assets
└── USAGE.md             # Comprehensive documentation
```

## Creating Custom Templates

To add a new template:

1. Create a new directory in `templates/`:
```bash
mkdir templates/my-template
```

2. Add template files with placeholders:
```javascript
// package.json.template
{
  "name": "{{PROJECT_NAME}}",
  "version": "1.0.0",
  "created": "{{TIMESTAMP}}"
}
```

3. Use the template with NPX (requires `mta-` prefix):
```bash
npx create-my-app mta-my-template new-project
```

Or directly (no prefix required):
```bash
./bin/create-app.mjs my-template new-project
```

### Template Placeholders

Templates support the following placeholders:

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{PROJECT_NAME}}` | Project name from command | `my-awesome-app` |
| `{{PROJECT_DIR}}` | Directory basename | `my-awesome-app` |
| `{{TIMESTAMP}}` | ISO timestamp of creation | `2024-09-19T10:30:00.000Z` |

## Post-Installation

After creating a project:

1. **Navigate to project**:
```bash
cd my-app
```

2. **Install dependencies** (if not auto-installed):
```bash
npm install
```

3. **Start the server**:
```bash
npm start
```

4. **Configure environment** (optional):
Edit `.env` file for custom settings:
```env
PORT=3000
HOST=127.0.0.1
LOG_LEVEL=info
```

## Troubleshooting

### Template not found
Ensure you're using the correct prefix:
- NPX/Package: Use `mta-` prefix (e.g., `mta-helloworld`)
- Direct: No prefix needed (e.g., `hello-world`)

### Directory not empty
The target directory must be empty unless using `.` for current directory initialization.

### Dependencies installation failed
You can manually install dependencies:
```bash
cd my-app
npm install
```

### Permission denied
Make sure the scripts are executable:
```bash
chmod +x bin/create-app.mjs
chmod +x bin/create-app-pkg.mjs
```

## Architecture

The template system uses an object-oriented approach:

- **Base Class** (`AppGenerator`): Core functionality without prefix requirements
- **Extended Class** (`PkgAppGenerator`): Adds NPX-specific `mta-` prefix handling

This design allows for:
- Code reusability and maintenance
- Different template naming strategies
- Easy extension for custom generators
- Backward compatibility

## Contributing

To contribute a new template:

1. Fork the repository
2. Create your template in `templates/your-template/`
3. Test with both generators
4. Submit a pull request with documentation

## See Also

- [USAGE.md](./USAGE.md) - Complete framework documentation
- [NPX-TEMPLATE-SYSTEM.md](./NPX-TEMPLATE-SYSTEM.md) - NPX system details
- [README.md](./README.md) - Project overview