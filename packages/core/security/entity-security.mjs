import { ValidationError } from "@thinkeloquent/core-exceptions";

/**
 * Entity security service with configurable validation rules
 */
export class EntitySecurityService {
  constructor(rules = {}) {
    this.rules = {
      entityIdPattern: /^[a-zA-Z0-9\-_]+$/,
      pluginNamePattern: /^[a-zA-Z0-9\-_]+$/,
      maxIdLength: 64,
      ...rules,
    };
  }

  validateEntityId(entityId, entityType = "entity") {
    return this.validate(
      entityId,
      `${entityType} ID`,
      this.rules.entityIdPattern
    );
  }

  validatePluginName(pluginName) {
    return this.validate(
      pluginName,
      "Plugin name",
      this.rules.pluginNamePattern
    );
  }

  validate(value, fieldName, pattern) {
    if (!value || typeof value !== "string") {
      throw new ValidationError(`${fieldName} must be a non-empty string`, fieldName, value);
    }

    if (value.length > this.rules.maxIdLength) {
      throw new ValidationError(
        `${fieldName} exceeds maximum length of ${this.rules.maxIdLength}`,
        fieldName,
        value
      );
    }

    if (!pattern.test(value)) {
      throw new ValidationError(`${fieldName} contains invalid characters`, fieldName, value);
    }

    return value;
  }

  validateEntitySecurity(entityType, entityConfig, request) {
    const security = entityConfig.security || {};

    if (security.authentication === "required" && !request.authenticated) {
      throw new ValidationError(`Authentication required for ${entityType}`, "authentication", entityType);
    }

    if (security.isolation === "strict" && request.crossEntityAccess) {
      throw new ValidationError(`Cross-entity access denied for ${entityType}`, "isolation", entityType);
    }

    return true;
  }

  /**
   * Check if a value matches security rules without throwing
   */
  isValidEntityId(entityId) {
    try {
      this.validateEntityId(entityId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a plugin name is valid without throwing
   */
  isValidPluginName(pluginName) {
    try {
      this.validatePluginName(pluginName);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Sanitize an entity ID by removing invalid characters
   */
  sanitizeEntityId(entityId) {
    if (!entityId || typeof entityId !== "string") {
      return null;
    }

    // Replace invalid characters with hyphens
    let sanitized = entityId.replace(/[^a-zA-Z0-9\-_]/g, "-");

    // Remove consecutive hyphens
    sanitized = sanitized.replace(/-+/g, "-");

    // Remove leading/trailing hyphens
    sanitized = sanitized.replace(/^-+|-+$/g, "");

    // Truncate if too long
    if (sanitized.length > this.rules.maxIdLength) {
      sanitized = sanitized.substring(0, this.rules.maxIdLength);
    }

    return sanitized || null;
  }

  /**
   * Get the current validation rules
   */
  getRules() {
    return { ...this.rules };
  }

  /**
   * Update validation rules
   */
  updateRules(newRules) {
    this.rules = {
      ...this.rules,
      ...newRules,
    };
    return this.rules;
  }
}