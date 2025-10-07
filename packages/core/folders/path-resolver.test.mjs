import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { PathResolver } from './path-resolver.mjs';
import path from 'path';
import { ValidationError, ModuleResolutionError } from '@thinkeloquent/core-exceptions';

// Mock modules
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    access: vi.fn()
  }
}));

vi.mock('find-up', () => ({
  findUp: vi.fn()
}));

vi.mock('import-meta-resolve', () => ({
  resolve: vi.fn()
}));

describe('PathResolver', () => {
  let pathResolver;
  let mockFs;
  let mockFindUp;
  let mockResolve;

  beforeEach(async () => {
    // Get mocked modules
    mockFs = vi.mocked((await import('fs/promises')).default);
    mockFindUp = vi.mocked((await import('find-up')).findUp);
    mockResolve = vi.mocked((await import('import-meta-resolve')).resolve);

    // Reset mocks
    vi.clearAllMocks();

    // Mock process.cwd()
    vi.spyOn(process, 'cwd').mockReturnValue('/project');

    // Create a new PathResolver instance for each test
    pathResolver = new PathResolver();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    test('should use process.cwd() as default base directory', () => {
      const resolver = new PathResolver();
      expect(resolver.getBaseDir()).toBe('/project');
    });

    test('should accept custom base directory', () => {
      const resolver = new PathResolver('/custom/base');
      expect(resolver.getBaseDir()).toBe('/custom/base');
    });

    test('should resolve relative base directory to absolute', () => {
      const resolver = new PathResolver('./relative');
      expect(resolver.getBaseDir()).toBe('/project/relative');
    });

    test('should initialize empty trusted paths set', () => {
      const resolver = new PathResolver();
      expect(resolver.getTrustedPaths()).toEqual([]);
    });
  });

  describe('Trusted Paths Management', () => {
    test('should add trusted path', () => {
      pathResolver.addTrustedPath('/trusted/path');
      expect(pathResolver.getTrustedPaths()).toContain('/trusted/path');
    });

    test('should resolve relative trusted paths to absolute', () => {
      pathResolver.addTrustedPath('./relative/trusted');
      expect(pathResolver.getTrustedPaths()).toContain('/project/relative/trusted');
    });

    test('should check if path is trusted', () => {
      pathResolver.addTrustedPath('/trusted/base');

      expect(pathResolver.isTrustedPath('/trusted/base/file.js')).toBe(true);
      expect(pathResolver.isTrustedPath('/untrusted/path')).toBe(false);
    });

    test('should handle multiple trusted paths', () => {
      pathResolver.addTrustedPath('/trusted1');
      pathResolver.addTrustedPath('/trusted2');
      pathResolver.addTrustedPath('/trusted3');

      expect(pathResolver.isTrustedPath('/trusted1/file')).toBe(true);
      expect(pathResolver.isTrustedPath('/trusted2/file')).toBe(true);
      expect(pathResolver.isTrustedPath('/trusted3/file')).toBe(true);
      expect(pathResolver.isTrustedPath('/untrusted/file')).toBe(false);
    });

    test('should clear all trusted paths', () => {
      pathResolver.addTrustedPath('/trusted1');
      pathResolver.addTrustedPath('/trusted2');

      pathResolver.clearTrustedPaths();

      expect(pathResolver.getTrustedPaths()).toEqual([]);
      expect(pathResolver.isTrustedPath('/trusted1')).toBe(false);
    });

    test('should prevent duplicate trusted paths', () => {
      pathResolver.addTrustedPath('/trusted');
      pathResolver.addTrustedPath('/trusted');

      expect(pathResolver.getTrustedPaths()).toHaveLength(1);
    });
  });

  describe('getModuleInfo', () => {
    test('should resolve module information successfully', async () => {
      const mockResolvedUrl = 'file:///project/node_modules/test-module/index.js';
      const mockPackageJsonPath = '/project/node_modules/test-module/package.json';
      const mockPackageJson = {
        name: 'test-module',
        version: '1.0.0'
      };

      mockResolve.mockResolvedValueOnce(mockResolvedUrl);
      mockFindUp.mockResolvedValueOnce(mockPackageJsonPath);
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockPackageJson));

      const result = await pathResolver.getModuleInfo('test-module');

      expect(result).toEqual({
        specifier: 'test-module',
        entryPath: '/project/node_modules/test-module/index.js',
        rootDir: '/project/node_modules/test-module',
        packageJson: mockPackageJson,
        resolvedUrl: mockResolvedUrl,
        packageJsonPath: mockPackageJsonPath
      });

      expect(mockResolve).toHaveBeenCalledWith('test-module', expect.any(String));
      expect(pathResolver.isTrustedPath('/project/node_modules/test-module')).toBe(true);
    });

    test('should throw ModuleResolutionError when package.json not found', async () => {
      mockResolve.mockResolvedValueOnce('file:///project/module/index.js');
      mockFindUp.mockResolvedValueOnce(null);

      await expect(pathResolver.getModuleInfo('missing-module'))
        .rejects.toThrow(ModuleResolutionError);
    });

    test('should throw ModuleResolutionError when resolution fails', async () => {
      mockResolve.mockRejectedValueOnce(new Error('Module not found'));

      await expect(pathResolver.getModuleInfo('nonexistent'))
        .rejects.toThrow(ModuleResolutionError);
    });

    test('should handle scoped packages', async () => {
      const mockResolvedUrl = 'file:///project/node_modules/@scope/package/index.js';
      const mockPackageJsonPath = '/project/node_modules/@scope/package/package.json';

      mockResolve.mockResolvedValueOnce(mockResolvedUrl);
      mockFindUp.mockResolvedValueOnce(mockPackageJsonPath);
      mockFs.readFile.mockResolvedValueOnce('{"name":"@scope/package"}');

      const result = await pathResolver.getModuleInfo('@scope/package');

      expect(result.specifier).toBe('@scope/package');
      expect(result.rootDir).toBe('/project/node_modules/@scope/package');
    });

    test('should handle invalid JSON in package.json', async () => {
      mockResolve.mockResolvedValueOnce('file:///project/module/index.js');
      mockFindUp.mockResolvedValueOnce('/project/module/package.json');
      mockFs.readFile.mockResolvedValueOnce('{ invalid json }');

      await expect(pathResolver.getModuleInfo('bad-json'))
        .rejects.toThrow(ModuleResolutionError);
    });
  });

  describe('resolvePath', () => {
    beforeEach(() => {
      pathResolver = new PathResolver('/project/base');
    });

    test('should resolve relative paths', () => {
      const result = pathResolver.resolvePath('subfolder/file.js');
      expect(result).toBe('/project/base/subfolder/file.js');
    });

    test('should handle absolute paths with trusted paths', () => {
      pathResolver.addTrustedPath('/external/trusted');

      const result = pathResolver.resolvePath('/external/trusted/file.js', { allowTrusted: true });
      expect(result).toBe('/external/trusted/file.js');
    });

    test('should return absolute paths without options', () => {
      const result = pathResolver.resolvePath('/absolute/path/file.js');
      expect(result).toBe('/absolute/path/file.js');
    });

    test('should detect path traversal attempts', () => {
      expect(() => pathResolver.resolvePath('../../../etc/passwd'))
        .toThrow(ValidationError);
    });

    test('should allow path traversal within base directory', () => {
      const result = pathResolver.resolvePath('./subfolder/../file.js');
      expect(result).toBe('/project/base/file.js');
    });

    test('should handle dot segments correctly', () => {
      expect(pathResolver.resolvePath('./file.js')).toBe('/project/base/file.js');
      expect(pathResolver.resolvePath('././file.js')).toBe('/project/base/file.js');
      expect(pathResolver.resolvePath('./sub/./file.js')).toBe('/project/base/sub/file.js');
    });

    test('should allow trusted paths outside base directory', () => {
      pathResolver.addTrustedPath('/external');

      const result = pathResolver.resolvePath('../../external/file.js');
      expect(result).toBe('/external/file.js');
    });
  });

  describe('pathExists', () => {
    test('should return true when path exists', async () => {
      mockFs.access.mockResolvedValueOnce(undefined);

      const exists = await pathResolver.pathExists('existing/file.js');

      expect(exists).toBe(true);
      expect(mockFs.access).toHaveBeenCalledWith('/project/existing/file.js');
    });

    test('should return false when path does not exist', async () => {
      mockFs.access.mockRejectedValueOnce(new Error('ENOENT'));

      const exists = await pathResolver.pathExists('nonexistent/file.js');

      expect(exists).toBe(false);
    });

    test('should handle absolute paths with allowTrusted option', async () => {
      mockFs.access.mockResolvedValueOnce(undefined);

      const exists = await pathResolver.pathExists('/absolute/path', { allowTrusted: true });

      expect(exists).toBe(true);
      expect(mockFs.access).toHaveBeenCalledWith('/absolute/path');
    });

    test('should resolve relative paths by default', async () => {
      mockFs.access.mockResolvedValueOnce(undefined);
      pathResolver.setBaseDir('/custom/base');

      await pathResolver.pathExists('relative/path');

      expect(mockFs.access).toHaveBeenCalledWith('/custom/base/relative/path');
    });
  });

  describe('Base Directory Management', () => {
    test('should get base directory', () => {
      pathResolver.setBaseDir('/new/base');
      expect(pathResolver.getBaseDir()).toBe('/new/base');
    });

    test('should set new base directory', () => {
      pathResolver.setBaseDir('/new/base');
      expect(pathResolver.getBaseDir()).toBe('/new/base');

      pathResolver.setBaseDir('./relative');
      expect(pathResolver.getBaseDir()).toBe('/project/relative');
    });

    test('should resolve paths relative to new base', () => {
      pathResolver.setBaseDir('/new/base');
      const resolved = pathResolver.resolvePath('file.js');
      expect(resolved).toBe('/new/base/file.js');
    });
  });

  describe('Path Operations', () => {
    beforeEach(() => {
      pathResolver = new PathResolver('/project/base');
    });

    test('should join paths correctly', () => {
      const result = pathResolver.join('folder', 'subfolder', 'file.js');
      expect(result).toBe('/project/base/folder/subfolder/file.js');
    });

    test('should get relative path from base', () => {
      const result = pathResolver.relative('/project/base/folder/file.js');
      expect(result).toBe('folder/file.js');
    });

    test('should check if path is within base', () => {
      expect(pathResolver.isWithinBase('/project/base/file.js')).toBe(true);
      expect(pathResolver.isWithinBase('/project/base/sub/file.js')).toBe(true);
      expect(pathResolver.isWithinBase('/other/path/file.js')).toBe(false);
    });

    test('should handle edge cases in isWithinBase', () => {
      expect(pathResolver.isWithinBase('/project/base')).toBe(true);
      expect(pathResolver.isWithinBase('/project/basedir')).toBe(true); // Starts with /project/base
      expect(pathResolver.isWithinBase('/project')).toBe(false);
      expect(pathResolver.isWithinBase('/project/other')).toBe(false); // Different directory
    });

    test('should handle empty join arguments', () => {
      const result = pathResolver.join();
      expect(result).toBe('/project/base');
    });

    test('should handle complex relative paths', () => {
      const result = pathResolver.relative('/other/path');
      expect(result).toBe('../../other/path');
    });
  });

  describe('withBase', () => {
    test('should create new instance with different base', () => {
      pathResolver.addTrustedPath('/trusted1');
      pathResolver.addTrustedPath('/trusted2');

      const newResolver = pathResolver.withBase('/new/base');

      expect(newResolver.getBaseDir()).toBe('/new/base');
      expect(newResolver).not.toBe(pathResolver);
      expect(pathResolver.getBaseDir()).toBe('/project'); // Original unchanged
    });

    test('should copy trusted paths to new instance', () => {
      pathResolver.addTrustedPath('/trusted1');
      pathResolver.addTrustedPath('/trusted2');

      const newResolver = pathResolver.withBase('/new/base');

      expect(newResolver.getTrustedPaths()).toEqual(['/trusted1', '/trusted2']);
    });

    test('should not affect original instance trusted paths', () => {
      pathResolver.addTrustedPath('/trusted1');

      const newResolver = pathResolver.withBase('/new/base');
      newResolver.addTrustedPath('/trusted2');

      expect(pathResolver.getTrustedPaths()).toEqual(['/trusted1']);
      expect(newResolver.getTrustedPaths()).toEqual(['/trusted1', '/trusted2']);
    });
  });

  describe('Security Features', () => {
    beforeEach(() => {
      pathResolver = new PathResolver('/secure/base');
    });

    test('should prevent directory traversal attacks', () => {
      const maliciousPaths = [
        '../../../etc/passwd',
        '../../sensitive/data',
        './../../../root',
        'valid/../../../../../../etc/shadow'
      ];

      for (const malPath of maliciousPaths) {
        expect(() => pathResolver.resolvePath(malPath))
          .toThrow(ValidationError);
      }
    });

    test('should allow legitimate parent directory access within base', () => {
      const legitimatePaths = [
        'subfolder/../file.js',
        './subfolder/../another/file.js',
        'deep/nested/../../file.js'
      ];

      for (const legitPath of legitimatePaths) {
        expect(() => pathResolver.resolvePath(legitPath))
          .not.toThrow();
      }
    });

    test('should handle symbolic link attempts safely', () => {
      // Paths that might be used to create symbolic link attacks
      const suspiciousPaths = [
        '/tmp/../etc/passwd',
        '/var/tmp/../../etc/shadow'
      ];

      for (const suspPath of suspiciousPaths) {
        const result = pathResolver.resolvePath(suspPath);
        // Should return the path but not within base
        expect(pathResolver.isWithinBase(result)).toBe(false);
      }
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty string paths', () => {
      const result = pathResolver.resolvePath('');
      expect(result).toBe('/project');
    });

    test('should handle paths with multiple slashes', () => {
      pathResolver.setBaseDir('/base');
      const result = pathResolver.resolvePath('folder//subfolder///file.js');
      expect(result).toBe('/base/folder/subfolder/file.js');
    });

    test('should handle Windows-style paths on Unix', () => {
      pathResolver.setBaseDir('/unix/base');
      const result = pathResolver.resolvePath('folder\\file.js');
      // Path module should handle this based on platform
      expect(result).toMatch(/file\.js$/);
    });

    test('should handle very long paths', () => {
      const longPath = 'sub/'.repeat(100) + 'file.js';
      const result = pathResolver.resolvePath(longPath);
      expect(result).toMatch(/file\.js$/);
      expect(result.split('/').length).toBeGreaterThan(100);
    });

    test('should handle paths with special characters', () => {
      const specialPaths = [
        'file with spaces.js',
        'file-with-dashes.js',
        'file_with_underscores.js',
        'file.multiple.dots.js',
        'folder/文件.js', // Unicode characters
        'folder/🚀.js' // Emoji
      ];

      for (const specialPath of specialPaths) {
        const result = pathResolver.resolvePath(specialPath);
        expect(result).toContain(path.basename(specialPath));
      }
    });
  });

  describe('Error Handling', () => {
    test('should provide meaningful error messages', async () => {
      mockResolve.mockRejectedValueOnce(new Error('Cannot find module'));

      try {
        await pathResolver.getModuleInfo('missing-module');
      } catch (error) {
        expect(error).toBeInstanceOf(ModuleResolutionError);
        expect(error.message).toContain('missing-module');
        expect(error.message).toContain('Cannot find module');
      }
    });

    test('should handle null and undefined inputs gracefully', () => {
      expect(() => pathResolver.resolvePath(null))
        .toThrow();
      expect(() => pathResolver.resolvePath(undefined))
        .toThrow();
    });

    test('should handle file system permission errors', async () => {
      mockFs.access.mockRejectedValueOnce(new Error('EACCES: Permission denied'));

      const exists = await pathResolver.pathExists('protected/file');
      expect(exists).toBe(false); // Should return false, not throw
    });
  });

  describe('Performance Considerations', () => {
    test('should cache trusted paths efficiently', () => {
      // Add many trusted paths
      for (let i = 0; i < 1000; i++) {
        pathResolver.addTrustedPath(`/trusted/path${i}`);
      }

      // Check performance of isTrustedPath
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        pathResolver.isTrustedPath(`/trusted/path${i}/subfile`);
      }
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100); // Should be fast
    });

    test('should handle duplicate trusted path additions efficiently', () => {
      const samePath = '/same/trusted/path';

      for (let i = 0; i < 100; i++) {
        pathResolver.addTrustedPath(samePath);
      }

      expect(pathResolver.getTrustedPaths()).toHaveLength(1);
    });
  });
});