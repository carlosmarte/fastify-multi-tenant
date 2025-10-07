/**
 * Generic Entity System Framework
 *
 * PURPOSE: A configuration-driven multi-entity framework for Fastify that supports any type of
 * organizational unit (tenants, products, regions, brands, etc.) through configuration rather
 * than code duplication.
 *
 * USE CASES:
 * - Multi-tenant SaaS applications
 * - Product-based feature isolation
 * - Regional service variations
 * - Brand/white-label applications
 * - Department-based systems
 * - Feature flag groupings
 * - Environment-specific configurations
 *
 * PERFORMANCE CONSIDERATIONS:
 * - Lazy initialization reduces startup time
 * - Entity caching prevents redundant loading
 * - Resource pooling for shared resources
 * - Graceful shutdown ensures no data loss
 * - Configurable concurrent entity limits per type
 */

import { findProjectRoot, PathResolver } from "@thinkeloquent/core-folders";
import {
  EntityContext,
  EntityLifecycleStates,
  EntityLifecycleManager,
  EntityAdapter,
  LocalEntityAdapter,
  NPMEntityAdapter
} from "@thinkeloquent/core-entities";
import {
  EntityFactory,
  EntityRegistry,
  EntityManager
} from "@thinkeloquent/core-orchestrator";
import {
  ResourceLoadingStrategy,
  HierarchicalResourceStrategy,
  ResourceLoader
} from "@thinkeloquent/core-loading-strategy";
import {
  ValidationError,
  EntityError,
  PluginError,
  Result,
  AbstractMethodError,
  ModuleResolutionError,
  ServerStateError,
  DatabaseConfigurationError,
  ConfigurationValidationError,
} from "@thinkeloquent/core-exceptions";
import { EntitySecurityService } from "@thinkeloquent/core-security";
import { EntityConfigurationManager } from "@thinkeloquent/core-configure";
import {
  ServerLifecycleManager,
  PluginManager,
  GenericEntityServer
} from "@thinkeloquent/core-server";
import {
  EntityIdentificationStrategy,
  SubdomainIdentificationStrategy,
  PathIdentificationStrategy,
  HeaderIdentificationStrategy,
  QueryIdentificationStrategy,
  CompositeIdentificationStrategy,
  EntityIdentificationManager,
  StrategyFactory,
  createStrategy,
  createCustomStrategy
} from "@thinkeloquent/core-entity-identification-strategy";


// Error classes and Result pattern are now imported from @thinkeloquent/core-exceptions
// Re-export them for backward compatibility
export { ValidationError, EntityError, PluginError, Result } from "@thinkeloquent/core-exceptions";

// EntitySecurityService is now imported from @thinkeloquent/core-security
// Re-export it for backward compatibility
export { EntitySecurityService } from "@thinkeloquent/core-security";

// EntityConfigurationManager is now imported from @thinkeloquent/core-configure
// Re-export it for backward compatibility
export { EntityConfigurationManager } from "@thinkeloquent/core-configure";

// Re-export PathResolver for backward compatibility
export { PathResolver };

// Re-export entity identification strategies for backward compatibility
export {
  EntityIdentificationStrategy,
  SubdomainIdentificationStrategy,
  PathIdentificationStrategy,
  HeaderIdentificationStrategy,
  QueryIdentificationStrategy,
  CompositeIdentificationStrategy,
  EntityIdentificationManager,
  StrategyFactory,
  createStrategy,
  createCustomStrategy
};

// Re-export lifecycle management for backward compatibility
export { EntityLifecycleStates, EntityLifecycleManager };

// Re-export loading strategies for backward compatibility
export { ResourceLoadingStrategy, HierarchicalResourceStrategy, ResourceLoader };


/**
 * Plugin manager
 */
// PluginManager has been moved to @thinkeloquent/core-plugins
// Re-exporting for backward compatibility
export { PluginManager } from "@thinkeloquent/core-plugins";


// Re-export Entity classes for backward compatibility
export { EntityContext, EntityAdapter };

// Re-export entity adapters for backward compatibility
export { LocalEntityAdapter, NPMEntityAdapter };

/**
 * Entity factory
 */
// EntityFactory has been moved to @thinkeloquent/core-orchestrator
// Re-exporting for backward compatibility
export { EntityFactory } from "@thinkeloquent/core-orchestrator";

/**
 * Entity registry
 */
// EntityRegistry has been moved to @thinkeloquent/core-orchestrator
// Re-exporting for backward compatibility
export { EntityRegistry } from "@thinkeloquent/core-orchestrator";

// ServerLifecycleManager has been moved to @thinkeloquent/core-server
// Re-exporting for backward compatibility
export { ServerLifecycleManager } from "@thinkeloquent/core-server";

// EntityManager has been moved to @thinkeloquent/core-orchestrator
// Re-exporting for backward compatibility
export { EntityManager } from "@thinkeloquent/core-orchestrator";

// GenericEntityServer has been moved to @thinkeloquent/core-server
// Re-exporting for backward compatibility
export { GenericEntityServer } from "@thinkeloquent/core-server";

/**
 * Factory function for backward compatibility
 */
export async function start(options = {}) {
  const server = new GenericEntityServer(options);
  await server.start(options);
  return server;
}

/**
 * Default export
 */
export default {
  start,
  GenericEntityServer,
  EntityConfigurationManager,
  EntityManager,
  EntityContext,
  EntityRegistry,
  EntityFactory,
  EntityAdapter,
  LocalEntityAdapter,
  NPMEntityAdapter,
  EntityIdentificationStrategy,
  SubdomainIdentificationStrategy,
  PathIdentificationStrategy,
  HeaderIdentificationStrategy,
  QueryIdentificationStrategy,
  CompositeIdentificationStrategy,
  EntityLifecycleManager,
  EntitySecurityService,
  PluginManager,
  ResourceLoader,
  PathResolver,
  Result,
  ValidationError,
  EntityError,
  PluginError,
};
