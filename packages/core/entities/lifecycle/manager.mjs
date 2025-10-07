import { EntityError, Result } from "@thinkeloquent/core-exceptions";
import { EntityLifecycleStates, isValidState } from "./states.mjs";

/**
 * Entity lifecycle manager
 * Manages state transitions and lifecycle events for entities
 */
export class EntityLifecycleManager {
  constructor(logger) {
    this.logger = logger;
    this.entityStates = new Map();
    this.stateTransitions = new Map();
    this.stateListeners = new Map();

    this.setupTransitions();
  }

  setupTransitions() {
    // Define valid state transitions
    this.stateTransitions.set("load", {
      from: [EntityLifecycleStates.UNLOADED, EntityLifecycleStates.ERROR],
      to: EntityLifecycleStates.LOADING,
      final: EntityLifecycleStates.ACTIVE,
    });

    this.stateTransitions.set("suspend", {
      from: [EntityLifecycleStates.ACTIVE],
      to: EntityLifecycleStates.SUSPENDED,
    });

    this.stateTransitions.set("resume", {
      from: [EntityLifecycleStates.SUSPENDED],
      to: EntityLifecycleStates.ACTIVE,
    });

    this.stateTransitions.set("reload", {
      from: [EntityLifecycleStates.ACTIVE],
      to: EntityLifecycleStates.LOADING,
      final: EntityLifecycleStates.ACTIVE,
    });

    this.stateTransitions.set("unload", {
      from: [
        EntityLifecycleStates.ACTIVE,
        EntityLifecycleStates.SUSPENDED,
        EntityLifecycleStates.ERROR,
      ],
      to: EntityLifecycleStates.UNLOADING,
      final: EntityLifecycleStates.UNLOADED,
    });

    this.stateTransitions.set("error", {
      from: Object.values(EntityLifecycleStates).filter(s => s !== EntityLifecycleStates.ERROR),
      to: EntityLifecycleStates.ERROR,
    });
  }

  /**
   * Get entity key for state tracking
   * @param {string} entityType - Entity type
   * @param {string} entityId - Entity ID
   * @returns {string} Entity key
   */
  getEntityKey(entityType, entityId) {
    return `${entityType}:${entityId}`;
  }

  /**
   * Get current state of an entity
   * @param {string} entityType - Entity type
   * @param {string} entityId - Entity ID
   * @returns {string} Current state
   */
  getState(entityType, entityId) {
    const key = this.getEntityKey(entityType, entityId);
    return this.entityStates.get(key) || EntityLifecycleStates.UNLOADED;
  }

  /**
   * Set entity state
   * @param {string} entityType - Entity type
   * @param {string} entityId - Entity ID
   * @param {string} state - New state
   * @returns {string} New state
   */
  setState(entityType, entityId, state) {
    if (!isValidState(state)) {
      throw new EntityError(`Invalid state: ${state}`, entityType, entityId);
    }

    const key = this.getEntityKey(entityType, entityId);
    const oldState = this.getState(entityType, entityId);

    this.entityStates.set(key, state);
    this.logger.debug(`Entity ${key} state changed: ${oldState} → ${state}`);

    // Notify listeners
    this.notifyStateChange(entityType, entityId, oldState, state);

    return state;
  }

  /**
   * Check if transition is allowed
   * @param {string} entityType - Entity type
   * @param {string} entityId - Entity ID
   * @param {string} transition - Transition name
   * @returns {boolean} True if transition is allowed
   */
  canTransition(entityType, entityId, transition) {
    const currentState = this.getState(entityType, entityId);
    const transitionConfig = this.stateTransitions.get(transition);

    if (!transitionConfig) return false;

    return transitionConfig.from.includes(currentState);
  }

  /**
   * Execute a state transition
   * @param {string} entityType - Entity type
   * @param {string} entityId - Entity ID
   * @param {string} transitionName - Transition name
   * @param {Function} handler - Async handler function
   * @returns {Result} Result of transition
   */
  async transition(entityType, entityId, transitionName, handler) {
    if (!this.canTransition(entityType, entityId, transitionName)) {
      const currentState = this.getState(entityType, entityId);
      throw new EntityError(
        `Invalid transition '${transitionName}' from state '${currentState}'`,
        entityType,
        entityId
      );
    }

    const transitionConfig = this.stateTransitions.get(transitionName);

    try {
      // Set intermediate state
      this.setState(entityType, entityId, transitionConfig.to);

      // Execute handler
      if (handler) {
        await handler();
      }

      // Set final state if defined
      if (transitionConfig.final) {
        this.setState(entityType, entityId, transitionConfig.final);
      }

      return Result.ok(this.getState(entityType, entityId));
    } catch (err) {
      this.setState(entityType, entityId, EntityLifecycleStates.ERROR);
      return Result.fail(err.message);
    }
  }

  /**
   * Get all entity states
   * @returns {Object} All entity states grouped by type
   */
  getAllEntityStates() {
    const states = {};

    for (const [key, state] of this.entityStates) {
      const colonIndex = key.indexOf(":");
      if (colonIndex === -1) continue; // Skip invalid keys without colon

      const entityType = key.substring(0, colonIndex);
      const entityId = key.substring(colonIndex + 1);

      if (!states[entityType]) {
        states[entityType] = {};
      }
      states[entityType][entityId] = state;
    }

    return states;
  }

  /**
   * Get entity states by type
   * @param {string} entityType - Entity type
   * @returns {Object} Entity states for the type
   */
  getEntityStatesByType(entityType) {
    const states = {};

    for (const [key, state] of this.entityStates) {
      if (key.startsWith(`${entityType}:`)) {
        const entityId = key.substring(entityType.length + 1);
        states[entityId] = state;
      }
    }

    return states;
  }

  /**
   * Count entities in a specific state
   * @param {string} state - State to count
   * @returns {number} Count of entities
   */
  countEntitiesInState(state) {
    let count = 0;
    for (const entityState of this.entityStates.values()) {
      if (entityState === state) count++;
    }
    return count;
  }

  /**
   * Get entities in a specific state
   * @param {string} state - State to filter by
   * @returns {Array} Array of entity keys
   */
  getEntitiesInState(state) {
    const entities = [];
    for (const [key, entityState] of this.entityStates) {
      if (entityState === state) {
        entities.push(key);
      }
    }
    return entities;
  }

  /**
   * Clear state for an entity
   * @param {string} entityType - Entity type
   * @param {string} entityId - Entity ID
   */
  clearEntityState(entityType, entityId) {
    const key = this.getEntityKey(entityType, entityId);
    this.entityStates.delete(key);
    this.removeStateListeners(entityType, entityId);
  }

  /**
   * Clear all states
   */
  clearAllStates() {
    this.entityStates.clear();
    this.stateListeners.clear();
  }

  /**
   * Add state change listener
   * @param {string} entityType - Entity type
   * @param {string} entityId - Entity ID
   * @param {Function} listener - Listener function
   */
  addStateListener(entityType, entityId, listener) {
    const key = this.getEntityKey(entityType, entityId);
    if (!this.stateListeners.has(key)) {
      this.stateListeners.set(key, new Set());
    }
    this.stateListeners.get(key).add(listener);
  }

  /**
   * Remove state change listener
   * @param {string} entityType - Entity type
   * @param {string} entityId - Entity ID
   * @param {Function} listener - Listener function
   */
  removeStateListener(entityType, entityId, listener) {
    const key = this.getEntityKey(entityType, entityId);
    const listeners = this.stateListeners.get(key);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.stateListeners.delete(key);
      }
    }
  }

  /**
   * Remove all listeners for an entity
   * @param {string} entityType - Entity type
   * @param {string} entityId - Entity ID
   */
  removeStateListeners(entityType, entityId) {
    const key = this.getEntityKey(entityType, entityId);
    this.stateListeners.delete(key);
  }

  /**
   * Notify listeners of state change
   * @param {string} entityType - Entity type
   * @param {string} entityId - Entity ID
   * @param {string} oldState - Previous state
   * @param {string} newState - New state
   */
  notifyStateChange(entityType, entityId, oldState, newState) {
    const key = this.getEntityKey(entityType, entityId);
    const listeners = this.stateListeners.get(key);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener({ entityType, entityId, oldState, newState });
        } catch (err) {
          this.logger.error(`Error in state listener: ${err.message}`);
        }
      }
    }
  }

  /**
   * Define custom transition
   * @param {string} name - Transition name
   * @param {Object} config - Transition configuration
   */
  defineTransition(name, config) {
    if (!config.from || !config.to) {
      throw new Error("Transition must define 'from' and 'to' states");
    }
    this.stateTransitions.set(name, config);
  }

  /**
   * Get transition configuration
   * @param {string} name - Transition name
   * @returns {Object|undefined} Transition config
   */
  getTransition(name) {
    return this.stateTransitions.get(name);
  }

  /**
   * Get all available transitions for current state
   * @param {string} entityType - Entity type
   * @param {string} entityId - Entity ID
   * @returns {Array<string>} Available transition names
   */
  getAvailableTransitions(entityType, entityId) {
    const currentState = this.getState(entityType, entityId);
    const available = [];

    for (const [name, config] of this.stateTransitions) {
      if (config.from.includes(currentState)) {
        available.push(name);
      }
    }

    return available;
  }
}