/**
 * Core entity management system
 * @module @thinkeloquent/core-entities
 */

// Entity context
export { EntityContext } from "./context.mjs";

// Lifecycle management
export {
  EntityLifecycleStates,
  EntityLifecycleManager,
  isValidState,
  isOperationalState,
  isTransitionalState,
  getStateDisplayName,
  getStateColor
} from "./lifecycle/index.mjs";

// Adapters
export {
  EntityAdapter,
  LocalEntityAdapter,
  NPMEntityAdapter
} from "./adapters/index.mjs";

// Entity management core classes moved to @thinkeloquent/core-orchestrator
// Re-export for backward compatibility
export { EntityFactory, EntityRegistry, EntityManager } from "@thinkeloquent/core-orchestrator";