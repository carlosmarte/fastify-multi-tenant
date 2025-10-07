/**
 * Error thrown when an abstract method is not implemented
 */
export class AbstractMethodError extends Error {
  constructor(methodName, className = null) {
    const message = className
      ? `Abstract method '${methodName}' must be implemented by subclass of ${className}`
      : `Abstract method '${methodName}' must be implemented by subclass`;
    super(message);
    this.name = "AbstractMethodError";
    this.methodName = methodName;
    this.className = className;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      methodName: this.methodName,
      className: this.className,
    };
  }
}