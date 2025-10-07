import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 10000,
    hookTimeout: 10000,
    setupFiles: ['./tests/helpers/setup.mjs'],
    include: [
      'tests/unit/**/*.test.mjs',
      'tests/integration/**/*.test.mjs',
      'tests/e2e/**/*.test.mjs',
      'packages/**/*.test.mjs'
    ],
    exclude: [
      'node_modules/**',
      'tests/fixtures/**',
      'tests/helpers/**'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportOnFailure: true,
      include: ['main.mjs'],
      exclude: [
        'tests/**',
        'node_modules/**',
        '**/*.test.mjs',
        '**/*.spec.mjs'
      ],
      thresholds: {
        global: {
          branches: 85,
          functions: 85,
          lines: 85,
          statements: 85
        }
      }
    },
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false
      }
    }
  }
});