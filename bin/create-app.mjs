#!/usr/bin/env node

/**
 * Base Template Generator for Generic Entity Framework
 *
 * This is the base class that can be extended for different template strategies.
 * It provides core functionality without enforcing any prefix requirements.
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.dirname(__dirname);

// ANSI color codes for terminal output
export const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

export function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

export function log(message, color = 'reset') {
  console.log(colorize(message, color));
}

export function logStep(step, message) {
  console.log(`${colorize(step, 'cyan')} ${message}`);
}

export function logSuccess(message) {
  console.log(`${colorize('✅', 'green')} ${message}`);
}

export function logError(message) {
  console.log(`${colorize('❌', 'red')} ${message}`);
}

export function logWarning(message) {
  console.log(`${colorize('⚠️', 'yellow')} ${message}`);
}

/**
 * Base Application Generator Class
 * Can be extended to implement different template strategies
 */
export class AppGenerator {
  constructor(options = {}) {
    this.rootDir = options.rootDir || rootDir;
    this.templatesDir = path.join(this.rootDir, 'templates');
  }

  /**
   * Show usage information
   * Override this to customize the help text
   */
  showUsage() {
    console.log(`
${colorize('Generic Entity Framework - Project Generator', 'bright')}

${colorize('Usage:', 'yellow')}
  node create-app.mjs <template> [project-name]

${colorize('Templates:', 'yellow')}
  ${this.getTemplatesList()}

${colorize('Examples:', 'yellow')}
  node create-app.mjs hello-world my-app
  node create-app.mjs hello-world .              # Current directory
  node create-app.mjs hello-world                # Auto-generated name

${colorize('Options:', 'yellow')}
  -h, --help        Show this help message
  -v, --version     Show version number
`);
  }

  /**
   * Get formatted list of templates for display
   */
  getTemplatesList() {
    try {
      const templates = fs.readdirSync(this.templatesDir, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => this.formatTemplateName(entry.name));

      if (templates.length === 0) {
        return 'No templates available';
      }

      return templates.map(t => `${t}    # ${this.getTemplateDescription(t)}`).join('\n  ');
    } catch {
      return 'No templates available';
    }
  }

  /**
   * Format template name for display (can be overridden)
   */
  formatTemplateName(templateDirName) {
    return templateDirName;
  }

  /**
   * Get template description (can be overridden)
   */
  getTemplateDescription(templateName) {
    if (templateName.includes('hello')) {
      return 'Simple Hello World application with demo tenant';
    }
    return 'Template application';
  }

  /**
   * Show version information
   */
  showVersion() {
    try {
      const packageJson = fs.readJsonSync(path.join(this.rootDir, 'package.json'));
      console.log(`v${packageJson.version || '1.0.0'}`);
    } catch {
      console.log('v1.0.0');
    }
  }

  /**
   * Get list of available templates
   */
  async getAvailableTemplates() {
    if (!await fs.pathExists(this.templatesDir)) {
      return [];
    }

    const entries = await fs.readdir(this.templatesDir, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  }

  /**
   * Validate template name format (can be overridden)
   */
  validateTemplateName(templateName) {
    // Base implementation has no special validation
    return true;
  }

  /**
   * Resolve template path from template name (can be overridden)
   */
  resolveTemplatePath(templateName) {
    // Base implementation uses template name directly
    return path.join(this.templatesDir, templateName);
  }

  /**
   * Validate that template exists and return its path
   */
  async validateTemplate(templateName) {
    const templateDir = this.resolveTemplatePath(templateName);

    if (!await fs.pathExists(templateDir)) {
      const availableTemplates = await this.getAvailableTemplates();
      logError(`Template "${templateName}" not found.`);

      if (availableTemplates.length > 0) {
        log('\nAvailable templates:', 'yellow');
        availableTemplates.forEach(template => {
          console.log(`  • ${this.formatTemplateName(template)}`);
        });
      } else {
        logWarning('No templates available in templates/ directory.');
      }

      return null;
    }

    return templateDir;
  }

  /**
   * Generate project name from template (can be overridden)
   */
  generateProjectName(templateName) {
    const baseName = templateName.replace(/^mta-/, '');
    const timestamp = Date.now().toString().slice(-6);
    return `${baseName}-${timestamp}`;
  }

  /**
   * Find all .template files in a directory
   */
  async findTemplateFiles(dir) {
    const templateFiles = [];

    async function scan(currentDir) {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          await scan(fullPath);
        } else if (entry.name.endsWith('.template')) {
          templateFiles.push(fullPath);
        }
      }
    }

    await scan(dir);
    return templateFiles;
  }

  /**
   * Copy template files to project directory
   */
  async copyTemplate(templateDir, projectDir, projectName) {
    logStep('📁', `Copying template files...`);

    // Copy all files from template
    await fs.copy(templateDir, projectDir, {
      filter: (src, dest) => {
        // Skip node_modules if it exists in template
        return !src.includes('node_modules');
      }
    });

    // Process .template files
    const templateFiles = await this.findTemplateFiles(projectDir);

    for (const templateFile of templateFiles) {
      const targetFile = templateFile.replace('.template', '');

      logStep('🔧', `Processing ${path.basename(templateFile)}...`);

      let content = await fs.readFile(templateFile, 'utf8');

      // Replace placeholders
      content = content
        .replace(/\{\{PROJECT_NAME\}\}/g, projectName)
        .replace(/\{\{PROJECT_DIR\}\}/g, path.basename(projectDir))
        .replace(/\{\{TIMESTAMP\}\}/g, new Date().toISOString());

      await fs.writeFile(targetFile, content, 'utf8');
      await fs.remove(templateFile);
    }

    logSuccess('Template files copied and processed');
  }

  /**
   * Copy framework files (can be overridden)
   */
  async copyFrameworkFiles(projectDir) {
    // Copy main.mjs from root (the framework file)
    const mainSourcePath = path.join(this.rootDir, 'main.mjs');
    const mainTargetPath = path.join(projectDir, 'main.mjs');

    if (await fs.pathExists(mainSourcePath)) {
      logStep('📋', 'Copying framework file...');
      await fs.copy(mainSourcePath, mainTargetPath);
      logSuccess('Framework file copied');
    } else {
      logWarning('main.mjs not found in root directory');
    }
  }

  /**
   * Install dependencies
   */
  async installDependencies(projectDir) {
    logStep('📦', 'Installing dependencies...');

    try {
      const packageJsonPath = path.join(projectDir, 'package.json');

      if (!await fs.pathExists(packageJsonPath)) {
        logWarning('No package.json found, skipping dependency installation');
        return;
      }

      const currentDir = process.cwd();
      process.chdir(projectDir);
      execSync('npm install', { stdio: 'inherit' });
      process.chdir(currentDir);
      logSuccess('Dependencies installed successfully');

    } catch (error) {
      logError('Failed to install dependencies. You can install them manually with:');
      console.log(`  cd ${path.basename(projectDir)}`);
      console.log(`  npm install`);
    }
  }

  /**
   * Show next steps after project creation (can be overridden)
   */
  showNextSteps(projectDir, projectName) {
    const relativeDir = path.relative(process.cwd(), projectDir);

    console.log(`
${colorize('🎉 Project created successfully!', 'green')}

${colorize('📂 Project:', 'yellow')} ${projectName}
${colorize('📁 Location:', 'yellow')} ${projectDir}

${colorize('Next steps:', 'yellow')}
  ${relativeDir !== '.' ? `cd ${relativeDir}` : '# Already in project directory'}
  npm start

${colorize('Available endpoints:', 'yellow')}
  • http://localhost:3000/health           - Health check
  • http://localhost:3000/api             - API status
  • http://demo.localhost:3000/app/demo/hello - Demo tenant (subdomain)
  • http://localhost:3000/tenants/demo/hello  - Demo tenant (path)
  • http://localhost:3000/admin/entities      - Entity admin

${colorize('Documentation:', 'yellow')}
  • Check out USAGE.md for comprehensive documentation
  • Explore the entities/ directory to understand the structure
  • Add new entities in entities/tenants/

${colorize('Happy coding! 🚀', 'bright')}
`);
  }

  /**
   * Create project from template
   */
  async createProject(templateName, projectName) {
    try {
      // Validate template exists
      const templateDir = await this.validateTemplate(templateName);
      if (!templateDir) {
        process.exit(1);
      }

      // Determine project directory
      let projectDir;
      if (projectName === '.') {
        projectDir = process.cwd();
        projectName = path.basename(projectDir);
      } else if (projectName) {
        projectDir = path.resolve(projectName);
      } else {
        projectName = this.generateProjectName(templateName);
        projectDir = path.resolve(projectName);
      }

      // Check if directory exists and is not empty
      if (await fs.pathExists(projectDir)) {
        const entries = await fs.readdir(projectDir);
        if (entries.length > 0 && projectName !== '.') {
          logError(`Directory "${projectName}" already exists and is not empty.`);
          process.exit(1);
        }
      } else {
        await fs.ensureDir(projectDir);
      }

      log(`\n${colorize('🚀 Creating new project...', 'bright')}`);
      log(`${colorize('Template:', 'yellow')} ${templateName}`);
      log(`${colorize('Project:', 'yellow')} ${projectName}`);
      log(`${colorize('Directory:', 'yellow')} ${projectDir}\n`);

      // Copy template files
      await this.copyTemplate(templateDir, projectDir, projectName);

      // Copy framework files
      await this.copyFrameworkFiles(projectDir);

      // Install dependencies
      await this.installDependencies(projectDir);

      // Show next steps
      this.showNextSteps(projectDir, projectName);

    } catch (error) {
      logError(`Failed to create project: ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Main execution method
   */
  async run(args) {
    // Handle help and version flags
    if (args.includes('-h') || args.includes('--help')) {
      this.showUsage();
      return;
    }

    if (args.includes('-v') || args.includes('--version')) {
      this.showVersion();
      return;
    }

    // Check for required arguments
    if (args.length === 0) {
      logError('Template name is required.');
      this.showUsage();
      process.exit(1);
    }

    const templateName = args[0];
    const projectName = args[1];

    // Validate template name format
    if (!this.validateTemplateName(templateName)) {
      // Validation error message should be shown by the override
      process.exit(1);
    }

    await this.createProject(templateName, projectName);
  }
}

// If run directly (not imported), create and run the generator
if (import.meta.url === `file://${process.argv[1]}`) {
  const generator = new AppGenerator();
  const args = process.argv.slice(2);

  generator.run(args).catch((error) => {
    logError(`Unexpected error: ${error.message}`);
    process.exit(1);
  });
}