/**
 * Entity lifecycle states
 * Defines the possible states an entity can be in during its lifecycle
 */
export const EntityLifecycleStates = {
  UNLOADED: "unloaded",
  LOADING: "loading",
  ACTIVE: "active",
  SUSPENDED: "suspended",
  ERROR: "error",
  UNLOADING: "unloading",
};

/**
 * Check if a state is valid
 * @param {string} state - State to check
 * @returns {boolean} True if valid state
 */
export function isValidState(state) {
  return Object.values(EntityLifecycleStates).includes(state);
}

/**
 * Check if entity is in operational state
 * @param {string} state - Current state
 * @returns {boolean} True if operational (active or suspended)
 */
export function isOperationalState(state) {
  return state === EntityLifecycleStates.ACTIVE ||
         state === EntityLifecycleStates.SUSPENDED;
}

/**
 * Check if entity is in transitional state
 * @param {string} state - Current state
 * @returns {boolean} True if transitional (loading or unloading)
 */
export function isTransitionalState(state) {
  return state === EntityLifecycleStates.LOADING ||
         state === EntityLifecycleStates.UNLOADING;
}

/**
 * Get state display name
 * @param {string} state - State
 * @returns {string} Display name
 */
export function getStateDisplayName(state) {
  const displayNames = {
    [EntityLifecycleStates.UNLOADED]: "Unloaded",
    [EntityLifecycleStates.LOADING]: "Loading",
    [EntityLifecycleStates.ACTIVE]: "Active",
    [EntityLifecycleStates.SUSPENDED]: "Suspended",
    [EntityLifecycleStates.ERROR]: "Error",
    [EntityLifecycleStates.UNLOADING]: "Unloading",
  };
  return displayNames[state] || "Unknown";
}

/**
 * Get state color for logging
 * @param {string} state - State
 * @returns {string} Color code
 */
export function getStateColor(state) {
  const colors = {
    [EntityLifecycleStates.UNLOADED]: "gray",
    [EntityLifecycleStates.LOADING]: "yellow",
    [EntityLifecycleStates.ACTIVE]: "green",
    [EntityLifecycleStates.SUSPENDED]: "orange",
    [EntityLifecycleStates.ERROR]: "red",
    [EntityLifecycleStates.UNLOADING]: "yellow",
  };
  return colors[state] || "white";
}