/**
 * Entity lifecycle management
 * @module @thinkeloquent/core-entities/lifecycle
 */

export {
  EntityLifecycleStates,
  isValidState,
  isOperationalState,
  isTransitionalState,
  getStateDisplayName,
  getStateColor
} from "./states.mjs";

export { EntityLifecycleManager } from "./manager.mjs";