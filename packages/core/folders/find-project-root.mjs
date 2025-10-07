import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import { findUp } from "find-up";

/**
 * Find the project root by looking for the workspace root package.json
 */
export async function findProjectRoot() {
  try {
    // Look for package.json with workspaces definition
    const packageJsonPath = await findUp('package.json', {
      cwd: path.dirname(fileURLToPath(import.meta.url)),
      type: 'file'
    });

    if (packageJsonPath) {
      // Check if this is the workspace root (has workspaces field)
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
      if (packageJson.workspaces) {
        return path.dirname(packageJsonPath);
      }
      // If not workspace root, continue searching up
      const parentPath = await findUp('package.json', {
        cwd: path.dirname(path.dirname(packageJsonPath)),
        type: 'file'
      });
      if (parentPath) {
        const parentPackageJson = JSON.parse(await fs.readFile(parentPath, 'utf8'));
        if (parentPackageJson.workspaces) {
          return path.dirname(parentPath);
        }
      }
    }
  } catch (err) {
    // Fallback to process.cwd() if unable to find workspace root
  }
  return process.cwd();
}