/**
 * Validation error for input validation failures
 */
export class ValidationError extends Error {
  constructor(message, field = null, value = null) {
    super(message);
    this.name = "ValidationError";
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