#!/usr/bin/env node

/**
 * NPX Template Generator for Generic Entity Framework
 * 
 * Usage: npx create-my-app <template> [project-name]
 * Example: npx create-my-app mta-helloworld my-awesome-app
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.dirname(__dirname);

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

function log(message, color = 'reset') {
  console.log(colorize(message, color));
}

function logStep(step, message) {
  console.log(`${colorize(step, 'cyan')} ${message}`);
}

function logSuccess(message) {
  console.log(`${colorize('✅', 'green')} ${message}`);
}

function logError(message) {
  console.log(`${colorize('❌', 'red')} ${message}`);
}

function logWarning(message) {
  console.log(`${colorize('⚠️', 'yellow')} ${message}`);
}

function showUsage() {
  console.log(`
${colorize('Generic Entity Framework - Project Generator', 'bright')}

${colorize('Usage:', 'yellow')}
  npx create-my-app <template> [project-name]

${colorize('Templates:', 'yellow')}
  mta-helloworld    Simple Hello World application with demo tenant

${colorize('Examples:', 'yellow')}
  npx create-my-app mta-helloworld my-app
  npx create-my-app mta-helloworld .              # Current directory
  npx create-my-app mta-helloworld                # Auto-generated name

${colorize('Options:', 'yellow')}
  -h, --help        Show this help message
  -v, --version     Show version number
`);
}

function showVersion() {
  try {
    const packageJson = fs.readJsonSync(path.join(rootDir, 'package.json'));
    console.log(`v${packageJson.version || '1.0.0'}`);
  } catch {
    console.log('v1.0.0');
  }
}

async function getAvailableTemplates() {
  const templatesDir = path.join(rootDir, 'templates');
  
  if (!await fs.pathExists(templatesDir)) {
    return [];
  }
  
  const entries = await fs.readdir(templatesDir, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);
}

async function validateTemplate(templateName) {
  const templatesDir = path.join(rootDir, 'templates');
  const templateDir = path.join(templatesDir, templateName.replace('mta-', ''));
  
  if (!await fs.pathExists(templateDir)) {
    const availableTemplates = await getAvailableTemplates();
    logError(`Template "${templateName}" not found.`);
    
    if (availableTemplates.length > 0) {
      log('\nAvailable templates:', 'yellow');
      availableTemplates.forEach(template => {
        console.log(`  • mta-${template}`);
      });
    } else {
      logWarning('No templates available in templates/ directory.');
    }
    
    process.exit(1);
  }
  
  return templateDir;
}

function generateProjectName(templateName) {
  const baseName = templateName.replace('mta-', '');
  const timestamp = Date.now().toString().slice(-6);
  return `${baseName}-${timestamp}`;
}

async function copyTemplate(templateDir, projectDir, projectName) {
  logStep('📁', `Copying template files...`);
  
  // Copy all files from template
  await fs.copy(templateDir, projectDir, {
    filter: (src, dest) => {
      // Skip node_modules if it exists in template
      return !src.includes('node_modules');
    }
  });
  
  // Process .template files
  const templateFiles = await findTemplateFiles(projectDir);
  
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

async function findTemplateFiles(dir) {
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

async function installDependencies(projectDir) {
  logStep('📦', 'Installing dependencies...');
  
  try {
    const packageJsonPath = path.join(projectDir, 'package.json');
    
    if (!await fs.pathExists(packageJsonPath)) {
      logWarning('No package.json found, skipping dependency installation');
      return;
    }
    
    process.chdir(projectDir);
    execSync('npm install', { stdio: 'inherit' });
    logSuccess('Dependencies installed successfully');
    
  } catch (error) {
    logError('Failed to install dependencies. You can install them manually with:');
    console.log(`  cd ${path.basename(projectDir)}`);
    console.log(`  npm install`);
  }
}

function showNextSteps(projectDir, projectName) {
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

async function createProject(templateName, projectName) {
  try {
    // Validate template exists
    const templateDir = await validateTemplate(templateName);
    
    // Determine project directory
    let projectDir;
    if (projectName === '.') {
      projectDir = process.cwd();
      projectName = path.basename(projectDir);
    } else if (projectName) {
      projectDir = path.resolve(projectName);
    } else {
      projectName = generateProjectName(templateName);
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
    await copyTemplate(templateDir, projectDir, projectName);
    
    // Copy main.mjs from root (the framework file)
    const mainSourcePath = path.join(rootDir, 'main.mjs');
    const mainTargetPath = path.join(projectDir, 'main.mjs');
    
    if (await fs.pathExists(mainSourcePath)) {
      logStep('📋', 'Copying framework file...');
      await fs.copy(mainSourcePath, mainTargetPath);
      logSuccess('Framework file copied');
    } else {
      logWarning('main.mjs not found in root directory');
    }
    
    // Install dependencies
    await installDependencies(projectDir);
    
    // Show next steps
    showNextSteps(projectDir, projectName);
    
  } catch (error) {
    logError(`Failed to create project: ${error.message}`);
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  // Handle help and version flags
  if (args.includes('-h') || args.includes('--help')) {
    showUsage();
    return;
  }
  
  if (args.includes('-v') || args.includes('--version')) {
    showVersion();
    return;
  }
  
  // Check for required arguments
  if (args.length === 0) {
    logError('Template name is required.');
    showUsage();
    process.exit(1);
  }
  
  const templateName = args[0];
  const projectName = args[1];
  
  // Validate template name format
  if (!templateName.startsWith('mta-')) {
    logError('Template name must start with "mta-" (e.g., "mta-helloworld")');
    process.exit(1);
  }
  
  await createProject(templateName, projectName);
}

// Run the CLI
main().catch((error) => {
  logError(`Unexpected error: ${error.message}`);
  process.exit(1);
});