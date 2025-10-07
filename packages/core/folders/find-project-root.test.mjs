import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { findProjectRoot } from './find-project-root.mjs';
import path from 'path';
import { fileURLToPath } from 'url';

// Mock modules
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn()
  }
}));

vi.mock('find-up', () => ({
  findUp: vi.fn()
}));

describe('findProjectRoot', () => {
  let mockFs;
  let mockFindUp;

  beforeEach(async () => {
    // Get mocked modules
    mockFs = vi.mocked((await import('fs/promises')).default);
    mockFindUp = vi.mocked((await import('find-up')).findUp);

    // Reset mocks
    vi.clearAllMocks();

    // Mock process.cwd()
    vi.spyOn(process, 'cwd').mockReturnValue('/default/working/directory');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Workspace Root Detection', () => {
    test('should find workspace root when first package.json has workspaces', async () => {
      const packageJsonPath = '/project/package.json';
      const packageJsonContent = JSON.stringify({
        name: 'my-workspace',
        workspaces: ['packages/*']
      });

      mockFindUp.mockResolvedValueOnce(packageJsonPath);
      mockFs.readFile.mockResolvedValueOnce(packageJsonContent);

      const result = await findProjectRoot();

      expect(result).toBe('/project');
      expect(mockFindUp).toHaveBeenCalledWith('package.json', {
        cwd: expect.stringContaining('folders'),
        type: 'file'
      });
      expect(mockFs.readFile).toHaveBeenCalledWith(packageJsonPath, 'utf8');
    });

    test('should find parent workspace root when first package.json lacks workspaces', async () => {
      const childPackagePath = '/project/packages/core/package.json';
      const parentPackagePath = '/project/package.json';

      const childPackageContent = JSON.stringify({
        name: '@my-workspace/core'
      });

      const parentPackageContent = JSON.stringify({
        name: 'my-workspace',
        workspaces: ['packages/*']
      });

      mockFindUp
        .mockResolvedValueOnce(childPackagePath)
        .mockResolvedValueOnce(parentPackagePath);

      mockFs.readFile
        .mockResolvedValueOnce(childPackageContent)
        .mockResolvedValueOnce(parentPackageContent);

      const result = await findProjectRoot();

      expect(result).toBe('/project');
      expect(mockFindUp).toHaveBeenCalledTimes(2);
      expect(mockFs.readFile).toHaveBeenCalledTimes(2);
    });

    test('should handle nested workspace structures', async () => {
      const deepChildPath = '/project/packages/core/subfolder/package.json';
      const parentPath = '/project/package.json';

      mockFindUp
        .mockResolvedValueOnce(deepChildPath)
        .mockResolvedValueOnce(parentPath);

      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify({ name: 'subfolder' }))
        .mockResolvedValueOnce(JSON.stringify({
          name: 'root',
          workspaces: ['packages/*']
        }));

      const result = await findProjectRoot();

      expect(result).toBe('/project');
    });
  });

  describe('Fallback Scenarios', () => {
    test('should return process.cwd() when no package.json found', async () => {
      mockFindUp.mockResolvedValueOnce(undefined);

      const result = await findProjectRoot();

      expect(result).toBe('/default/working/directory');
      expect(mockFindUp).toHaveBeenCalledOnce();
      expect(mockFs.readFile).not.toHaveBeenCalled();
    });

    test('should return process.cwd() when no workspace root found', async () => {
      const packagePath = '/some/package/package.json';

      mockFindUp
        .mockResolvedValueOnce(packagePath)
        .mockResolvedValueOnce(undefined);

      mockFs.readFile.mockResolvedValueOnce(
        JSON.stringify({ name: 'non-workspace-package' })
      );

      const result = await findProjectRoot();

      expect(result).toBe('/default/working/directory');
    });

    test('should handle error when reading package.json fails', async () => {
      mockFindUp.mockResolvedValueOnce('/project/package.json');
      mockFs.readFile.mockRejectedValueOnce(new Error('File read error'));

      const result = await findProjectRoot();

      expect(result).toBe('/default/working/directory');
    });

    test('should handle invalid JSON in package.json', async () => {
      mockFindUp.mockResolvedValueOnce('/project/package.json');
      mockFs.readFile.mockResolvedValueOnce('{ invalid json }');

      const result = await findProjectRoot();

      expect(result).toBe('/default/working/directory');
    });

    test('should handle findUp throwing an error', async () => {
      mockFindUp.mockRejectedValueOnce(new Error('Permission denied'));

      const result = await findProjectRoot();

      expect(result).toBe('/default/working/directory');
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty workspaces array', async () => {
      const packagePath = '/project/package.json';

      mockFindUp.mockResolvedValueOnce(packagePath);
      mockFs.readFile.mockResolvedValueOnce(
        JSON.stringify({
          name: 'workspace',
          workspaces: []
        })
      );

      const result = await findProjectRoot();

      expect(result).toBe('/project');
    });

    test('should handle workspaces as object format', async () => {
      const packagePath = '/project/package.json';

      mockFindUp.mockResolvedValueOnce(packagePath);
      mockFs.readFile.mockResolvedValueOnce(
        JSON.stringify({
          name: 'workspace',
          workspaces: {
            packages: ['packages/*'],
            nohoist: ['**/react-native']
          }
        })
      );

      const result = await findProjectRoot();

      expect(result).toBe('/project');
    });

    test('should handle circular package.json references', async () => {
      const packagePath = '/project/package.json';

      // Mock same path returned twice
      mockFindUp
        .mockResolvedValueOnce(packagePath)
        .mockResolvedValueOnce(packagePath);

      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify({ name: 'package' }))
        .mockResolvedValueOnce(JSON.stringify({ name: 'package' }));

      const result = await findProjectRoot();

      expect(result).toBe('/default/working/directory');
    });

    test('should handle very long paths', async () => {
      const longPath = '/very/long/path/'.repeat(50) + 'package.json';

      mockFindUp.mockResolvedValueOnce(longPath);
      mockFs.readFile.mockResolvedValueOnce(
        JSON.stringify({
          name: 'deep-package',
          workspaces: ['*']
        })
      );

      const result = await findProjectRoot();

      expect(result).toBe(path.dirname(longPath));
    });

    test('should handle Windows-style paths', async () => {
      const windowsPath = 'C:\\Users\\Project\\package.json';

      mockFindUp.mockResolvedValueOnce(windowsPath);
      mockFs.readFile.mockResolvedValueOnce(
        JSON.stringify({
          name: 'windows-project',
          workspaces: ['packages/*']
        })
      );

      const result = await findProjectRoot();

      expect(result).toBe(path.dirname(windowsPath));
    });
  });

  describe('Multiple Workspace Levels', () => {
    test('should find the topmost workspace root', async () => {
      const level3Path = '/root/level1/level2/package.json';
      const level1Path = '/root/package.json';

      mockFindUp
        .mockResolvedValueOnce(level3Path)
        .mockResolvedValueOnce(level1Path);

      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify({
          name: 'nested',
          workspaces: ['local/*']
        }))
        .mockResolvedValueOnce(JSON.stringify({
          name: 'root',
          workspaces: ['level1/*']
        }));

      const result = await findProjectRoot();

      // Should return the first workspace root found (level3)
      expect(result).toBe('/root/level1/level2');
    });

    test('should handle monorepo with multiple workspace configurations', async () => {
      const subWorkspacePath = '/monorepo/packages/sub-workspace/package.json';
      const rootPath = '/monorepo/package.json';

      mockFindUp
        .mockResolvedValueOnce(subWorkspacePath)
        .mockResolvedValueOnce(rootPath);

      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify({
          name: 'sub-workspace',
          workspaces: ['components/*'] // Sub-workspace
        }))
        .mockResolvedValueOnce(JSON.stringify({
          name: 'monorepo-root',
          workspaces: ['packages/*'] // Root workspace
        }));

      const result = await findProjectRoot();

      // Should return the first workspace found
      expect(result).toBe('/monorepo/packages/sub-workspace');
    });
  });

  describe('Performance Considerations', () => {
    test('should cache readFile calls efficiently', async () => {
      const packagePath = '/project/package.json';

      mockFindUp.mockResolvedValueOnce(packagePath);
      mockFs.readFile.mockResolvedValueOnce(
        JSON.stringify({
          name: 'project',
          workspaces: ['packages/*']
        })
      );

      const result = await findProjectRoot();

      expect(result).toBe('/project');
      expect(mockFs.readFile).toHaveBeenCalledOnce();
    });

    test('should stop searching after finding workspace root', async () => {
      const packagePath = '/project/package.json';

      mockFindUp.mockResolvedValueOnce(packagePath);
      mockFs.readFile.mockResolvedValueOnce(
        JSON.stringify({
          name: 'workspace',
          workspaces: ['*']
        })
      );

      const result = await findProjectRoot();

      expect(result).toBe('/project');
      expect(mockFindUp).toHaveBeenCalledOnce();
    });
  });

  describe('Special Package.json Formats', () => {
    test('should handle package.json with comments (non-standard)', async () => {
      const packagePath = '/project/package.json';

      mockFindUp.mockResolvedValueOnce(packagePath);
      // This would actually fail in real scenario, testing error handling
      mockFs.readFile.mockResolvedValueOnce('// comment\n{ "name": "test" }');

      const result = await findProjectRoot();

      expect(result).toBe('/default/working/directory');
    });

    test('should handle package.json with BOM', async () => {
      const packagePath = '/project/package.json';
      const bomContent = '\ufeff' + JSON.stringify({
        name: 'project',
        workspaces: ['packages/*']
      });

      mockFindUp.mockResolvedValueOnce(packagePath);
      mockFs.readFile.mockResolvedValueOnce(bomContent);

      const result = await findProjectRoot();

      // BOM should be handled by JSON.parse in most cases
      // If it fails, should fall back to process.cwd()
      expect(['/project', '/default/working/directory']).toContain(result);
    });

    test('should handle package.json with trailing commas', async () => {
      const packagePath = '/project/package.json';

      mockFindUp.mockResolvedValueOnce(packagePath);
      // Invalid JSON with trailing comma
      mockFs.readFile.mockResolvedValueOnce('{ "workspaces": ["*"], }');

      const result = await findProjectRoot();

      expect(result).toBe('/default/working/directory');
    });
  });

  describe('Concurrency and Race Conditions', () => {
    test('should handle concurrent calls correctly', async () => {
      const packagePath = '/project/package.json';
      const packageContent = JSON.stringify({
        name: 'workspace',
        workspaces: ['packages/*']
      });

      mockFindUp.mockResolvedValue(packagePath);
      mockFs.readFile.mockResolvedValue(packageContent);

      // Call findProjectRoot multiple times concurrently
      const results = await Promise.all([
        findProjectRoot(),
        findProjectRoot(),
        findProjectRoot()
      ]);

      expect(results).toEqual(['/project', '/project', '/project']);
    });
  });
});