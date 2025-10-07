/**
 * Core entity identification strategies
 * @module @thinkeloquent/core-entity-identification-strategy
 */

// Base class
export { EntityIdentificationStrategy } from "./base.mjs";

// Strategy implementations
export { SubdomainIdentificationStrategy } from "./strategies/subdomain.mjs";
export { PathIdentificationStrategy } from "./strategies/path.mjs";
export { HeaderIdentificationStrategy } from "./strategies/header.mjs";
export { QueryIdentificationStrategy } from "./strategies/query.mjs";
export { CompositeIdentificationStrategy } from "./strategies/composite.mjs";

// Manager
export { EntityIdentificationManager } from "./manager.mjs";

// Factory
export {
  StrategyFactory,
  defaultFactory,
  createStrategy,
  createCustomStrategy
} from "./factory.mjs";