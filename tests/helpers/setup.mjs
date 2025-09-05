import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { MockFactories } from './mock-factories.mjs';

// Global test setup
beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';
  
  // Initialize mock factories
  MockFactories.init();
});

// Global test teardown
afterAll(async () => {
  // Cleanup any global resources
  MockFactories.cleanup();
});

// Per-test setup
beforeEach(() => {
  // Reset all mocks before each test
  MockFactories.resetAll();
});

// Per-test teardown
afterEach(async () => {
  // Clean up any test-specific resources
  await MockFactories.cleanupTest();
});