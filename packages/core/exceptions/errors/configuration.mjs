/**
 * Configuration error
 */
export class ConfigurationError extends Error {
  constructor(message, field = null, value = null) {
    super(message);
    this.name = "ConfigurationError";
    this.field = field;
    this.value = value;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      field: this.field,
      value: this.value,
    };
  }
}

/**
 * Configuration validation error
 */
export class ConfigurationValidationError extends ConfigurationError {
  constructor(errors = []) {
    const message = `Configuration validation failed: ${errors.join(", ")}`;
    super(message);
    this.name = "ConfigurationValidationError";
    this.errors = errors;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      errors: this.errors,
    };
  }
}