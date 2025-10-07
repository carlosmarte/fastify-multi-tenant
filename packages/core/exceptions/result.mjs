/**
 * Result pattern for consistent error handling
 */
export class Result {
  constructor(success, value, error = null) {
    this.success = success;
    this.value = value;
    this.error = error;
  }

  static ok(value) {
    return new Result(true, value, null);
  }

  static fail(error) {
    return new Result(false, null, error);
  }

  map(fn) {
    if (!this.success) return this;
    try {
      return Result.ok(fn(this.value));
    } catch (err) {
      return Result.fail(err.message);
    }
  }

  mapError(fn) {
    return !this.success ? Result.fail(fn(this.error)) : this;
  }

  unwrap() {
    if (!this.success) {
      throw new ResultUnwrapError(this.error);
    }
    return this.value;
  }

  unwrapOr(defaultValue) {
    return this.success ? this.value : defaultValue;
  }

  toJSON() {
    return {
      success: this.success,
      value: this.value,
      error: this.error,
    };
  }
}

/**
 * Error thrown when unwrapping a failed Result
 */
export class ResultUnwrapError extends Error {
  constructor(originalError) {
    super(originalError);
    this.name = "ResultUnwrapError";
    this.originalError = originalError;
  }
}