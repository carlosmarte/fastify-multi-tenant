/**
 * Server state error
 */
export class ServerStateError extends Error {
  constructor(message, currentState = null, expectedState = null) {
    super(message);
    this.name = "ServerStateError";
    this.currentState = currentState;
    this.expectedState = expectedState;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      currentState: this.currentState,
      expectedState: this.expectedState,
    };
  }
}

/**
 * Server initialization error
 */
export class ServerInitializationError extends ServerStateError {
  constructor(message, phase = null) {
    super(message, "uninitialized", "initialized");
    this.name = "ServerInitializationError";
    this.phase = phase;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      phase: this.phase,
    };
  }
}