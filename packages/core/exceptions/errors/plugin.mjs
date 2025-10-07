/**
 * Plugin-related error for plugin operations
 */
export class PluginError extends Error {
  constructor(message, pluginName, phase = null) {
    super(message);
    this.name = "PluginError";
    this.pluginName = pluginName;
    this.phase = phase; // 'loading', 'registration', 'initialization', etc.
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      pluginName: this.pluginName,
      phase: this.phase,
    };
  }
}