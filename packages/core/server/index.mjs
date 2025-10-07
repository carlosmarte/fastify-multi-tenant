/**
 * Core server management components
 * @module @thinkeloquent/core-server
 */

// Server lifecycle management
export { ServerLifecycleManager } from "./server-lifecycle-manager.mjs";

// Main server class
export { GenericEntityServer } from "./generic-entity-server.mjs";

// Re-export PluginManager for backward compatibility
export { PluginManager } from "@thinkeloquent/core-plugins";