/**
 * Base database error
 */
export class DatabaseError extends Error {
  constructor(message, code = null) {
    super(message);
    this.name = "DatabaseError";
    this.code = code;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
    };
  }
}

/**
 * Database connection error
 */
export class DatabaseConnectionError extends DatabaseError {
  constructor(message, host = null, port = null) {
    super(message, "CONNECTION_FAILED");
    this.name = "DatabaseConnectionError";
    this.host = host;
    this.port = port;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      host: this.host,
      port: this.port,
    };
  }
}

/**
 * Database authentication error
 */
export class DatabaseAuthenticationError extends DatabaseError {
  constructor(message, username = null) {
    super(message, "AUTH_FAILED");
    this.name = "DatabaseAuthenticationError";
    this.username = username;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      username: this.username,
    };
  }
}

/**
 * Database configuration error
 */
export class DatabaseConfigurationError extends DatabaseError {
  constructor(message, missingConfig = null) {
    super(message, "CONFIG_ERROR");
    this.name = "DatabaseConfigurationError";
    this.missingConfig = missingConfig;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      missingConfig: this.missingConfig,
    };
  }
}