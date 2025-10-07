import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { findUp } from "find-up";
import { resolve } from "import-meta-resolve";
import { ValidationError, ModuleResolutionError } from "@thinkeloquent/core-exceptions";

/**
 * Path resolver with security checks
 * Handles secure path resolution and module information
 */
export class PathResolver {
  constructor(baseDir = null) {
    // If no baseDir provided, use process.cwd() as the default
    // This ensures we're working from the project root where the app is started
    this.baseDir = baseDir ? path.resolve(baseDir) : process.cwd();
    this.trustedPackagePaths = new Set();
  }

  /**
   * Add a trusted path to the whitelist
   * @param {string} packagePath - Path to trust
   */
  addTrustedPath(packagePath) {
    this.trustedPackagePaths.add(path.resolve(packagePath));
  }

  /**
   * Check if a path is trusted
   * @param {string} filePath - Path to check
   * @returns {boolean} True if path is trusted
   */
  isTrustedPath(filePath) {
    const resolved = path.resolve(filePath);
    for (const trustedPath of this.trustedPackagePaths) {
      if (resolved.startsWith(trustedPath)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get detailed module information
   * @param {string} specifier - Module specifier
   * @returns {Object} Module information including path, package.json, etc.
   */
  async getModuleInfo(specifier) {
    try {
      const resolvedUrl = await resolve(specifier, import.meta.url);
      const entryPath = fileURLToPath(resolvedUrl);
      const rootDir = path.dirname(entryPath);

      const packageJsonPath = await findUp("package.json", { cwd: rootDir });
      if (!packageJsonPath) {
        throw new ModuleResolutionError("Module root not found", specifier);
      }

      const packageJson = JSON.parse(
        await fs.readFile(packageJsonPath, "utf8")
      );

      const packageRoot = path.dirname(packageJsonPath);
      this.addTrustedPath(packageRoot);

      return {
        specifier,
        entryPath,
        rootDir: packageRoot,
        packageJson,
        resolvedUrl,
        packageJsonPath,
      };
    } catch (err) {
      throw new ModuleResolutionError(`Error resolving module ${specifier}: ${err.message}`, specifier);
    }
  }

  /**
   * Resolve a path with security checks
   * @param {string} relativePath - Path to resolve
   * @param {Object} options - Resolution options
   * @returns {string} Resolved path
   */
  resolvePath(relativePath, options = {}) {
    if (path.isAbsolute(relativePath)) {
      if (options.allowTrusted && this.isTrustedPath(relativePath)) {
        return relativePath;
      }
      return relativePath;
    }

    const resolved = path.resolve(this.baseDir, relativePath);

    if (!resolved.startsWith(this.baseDir) && !this.isTrustedPath(resolved)) {
      throw new ValidationError(
        `Path traversal attempt detected: ${relativePath}`
      );
    }

    return resolved;
  }

  /**
   * Check if a path exists
   * @param {string} filePath - Path to check
   * @param {Object} options - Options
   * @returns {boolean} True if path exists
   */
  async pathExists(filePath, options = {}) {
    try {
      const resolvedPath = options.allowTrusted
        ? filePath
        : this.resolvePath(filePath, options);
      await fs.access(resolvedPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the base directory
   * @returns {string} Base directory path
   */
  getBaseDir() {
    return this.baseDir;
  }

  /**
   * Set a new base directory
   * @param {string} newBaseDir - New base directory
   */
  setBaseDir(newBaseDir) {
    this.baseDir = path.resolve(newBaseDir);
  }

  /**
   * Clear all trusted paths
   */
  clearTrustedPaths() {
    this.trustedPackagePaths.clear();
  }

  /**
   * Get all trusted paths
   * @returns {Array<string>} Array of trusted paths
   */
  getTrustedPaths() {
    return Array.from(this.trustedPackagePaths);
  }

  /**
   * Join paths safely
   * @param {...string} paths - Paths to join
   * @returns {string} Joined path
   */
  join(...paths) {
    return path.join(this.baseDir, ...paths);
  }

  /**
   * Get relative path from base directory
   * @param {string} targetPath - Target path
   * @returns {string} Relative path
   */
  relative(targetPath) {
    return path.relative(this.baseDir, targetPath);
  }

  /**
   * Check if a path is within base directory
   * @param {string} checkPath - Path to check
   * @returns {boolean} True if within base directory
   */
  isWithinBase(checkPath) {
    const resolved = path.resolve(checkPath);
    return resolved.startsWith(this.baseDir);
  }

  /**
   * Create a new instance with a different base
   * @param {string} newBaseDir - New base directory
   * @returns {PathResolver} New PathResolver instance
   */
  withBase(newBaseDir) {
    const newResolver = new PathResolver(newBaseDir);
    // Copy trusted paths
    for (const trustedPath of this.trustedPackagePaths) {
      newResolver.addTrustedPath(trustedPath);
    }
    return newResolver;
  }
}