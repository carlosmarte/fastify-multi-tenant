#!/usr/bin/env node

/**
 * NPX Package Template Generator for Generic Entity Framework
 *
 * This extends the base AppGenerator to enforce the 'mta-' prefix convention
 * for NPX package distribution.
 *
 * Usage: npx create-my-app <template> [project-name]
 * Example: npx create-my-app mta-helloworld my-awesome-app
 */

import { AppGenerator, logError, colorize, log, logWarning } from './create-app.mjs';
import fs from 'fs-extra';
import path from 'path';

/**
 * Package-specific Application Generator
 * Enforces the 'mta-' prefix for template names
 */
class PkgAppGenerator extends AppGenerator {
  /**
   * Override to show package-specific usage with mta- prefix
   */
  showUsage() {
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

  /**
   * Format template name with mta- prefix for display
   */
  formatTemplateName(templateDirName) {
    return `mta-${templateDirName}`;
  }

  /**
   * Validate that template name has the mta- prefix
   */
  validateTemplateName(templateName) {
    if (!templateName.startsWith('mta-')) {
      logError('Template name must start with "mta-" (e.g., "mta-helloworld")');
      return false;
    }
    return true;
  }

  /**
   * Resolve template path by stripping mta- prefix
   */
  resolveTemplatePath(templateName) {
    // Remove the mta- prefix to find the actual template directory
    const actualTemplateName = templateName.replace('mta-', '');
    return path.join(this.templatesDir, actualTemplateName);
  }

  /**
   * Override to show mta- prefixed template names
   */
  async validateTemplate(templateName) {
    const templateDir = this.resolveTemplatePath(templateName);

    if (!await fs.pathExists(templateDir)) {
      const availableTemplates = await this.getAvailableTemplates();
      logError(`Template "${templateName}" not found.`);

      if (availableTemplates.length > 0) {
        log('\nAvailable templates:', 'yellow');
        availableTemplates.forEach(template => {
          console.log(`  • mta-${template}`);
        });
      } else {
        logWarning('No templates available in templates/ directory.');
      }

      return null;
    }

    return templateDir;
  }
}

// Create and run the package generator
const generator = new PkgAppGenerator();
const args = process.argv.slice(2);

generator.run(args).catch((error) => {
  logError(`Unexpected error: ${error.message}`);
  process.exit(1);
});