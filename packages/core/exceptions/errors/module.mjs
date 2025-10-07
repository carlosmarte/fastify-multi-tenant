/**
 * Module resolution error
 */
export class ModuleResolutionError extends Error {
  constructor(message, moduleName = null, path = null) {
    super(message);
    this.name = "ModuleResolutionError";
    this.moduleName = moduleName;
    this.path = path;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      moduleName: this.moduleName,
      path: this.path,
    };
  }
}

/**
 * Path resolution error
 */
export class PathResolutionError extends Error {
  constructor(message, path = null, reason = null) {
    super(message);
    this.name = "PathResolutionError";
    this.path = path;
    this.reason = reason;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      path: this.path,
      reason: this.reason,
    };
  }
}