/**
 * Core exception classes and error handling utilities
 * @module @thinkeloquent/core-exceptions
 */

// Export existing error classes
export { ValidationError } from "./errors/validation.mjs";
export { EntityError } from "./errors/entity.mjs";
export { PluginError } from "./errors/plugin.mjs";

// Export new custom error classes
export { AbstractMethodError } from "./errors/abstract.mjs";
export {
  DatabaseError,
  DatabaseConnectionError,
  DatabaseAuthenticationError,
  DatabaseConfigurationError,
} from "./errors/database.mjs";
export { ModuleResolutionError, PathResolutionError } from "./errors/module.mjs";
export { ServerStateError, ServerInitializationError } from "./errors/server.mjs";
export { ConfigurationError, ConfigurationValidationError } from "./errors/configuration.mjs";

// Export Result pattern
export { Result, ResultUnwrapError } from "./result.mjs";