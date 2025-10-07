import { describe, test, expect, beforeEach, vi } from 'vitest';
import { EntityLifecycleManager, EntityLifecycleStates, EntityError, Result } from '../../../main.mjs';
import { MockFactories } from '../../helpers/mock-factories.mjs';

describe('EntityLifecycleManager', () => {
  let lifecycleManager;
  let mockLogger;

  beforeEach(() => {
    mockLogger = MockFactories.createMockLogger();
    lifecycleManager = new EntityLifecycleManager(mockLogger);
  });

  describe('Constructor', () => {
    test('should initialize with logger and empty state', () => {
      expect(lifecycleManager.logger).toBe(mockLogger);
      expect(lifecycleManager.entityStates).toBeInstanceOf(Map);
      expect(lifecycleManager.stateTransitions).toBeInstanceOf(Map);
      expect(lifecycleManager.entityStates.size).toBe(0);
    });

    test('should setup state transitions correctly', () => {
      expect(lifecycleManager.stateTransitions.has('load')).toBe(true);
      expect(lifecycleManager.stateTransitions.has('suspend')).toBe(true);
      expect(lifecycleManager.stateTransitions.has('resume')).toBe(true);
      expect(lifecycleManager.stateTransitions.has('reload')).toBe(true);
      expect(lifecycleManager.stateTransitions.has('unload')).toBe(true);
    });

    test('should have correct state transition configuration', () => {
      const loadTransition = lifecycleManager.stateTransitions.get('load');
      expect(loadTransition.from).toEqual([
        EntityLifecycleStates.UNLOADED,
        EntityLifecycleStates.ERROR
      ]);
      expect(loadTransition.to).toBe(EntityLifecycleStates.LOADING);
      expect(loadTransition.final).toBe(EntityLifecycleStates.ACTIVE);
    });
  });

  describe('getEntityKey()', () => {
    test('should generate correct entity key', () => {
      const key = lifecycleManager.getEntityKey('tenant', 'test-tenant');
      expect(key).toBe('tenant:test-tenant');
    });

    test('should handle different entity types', () => {
      const userKey = lifecycleManager.getEntityKey('user', 'user123');
      const orgKey = lifecycleManager.getEntityKey('organization', 'org456');
      
      expect(userKey).toBe('user:user123');
      expect(orgKey).toBe('organization:org456');
    });

    test('should handle special characters in entity IDs', () => {
      const key = lifecycleManager.getEntityKey('tenant', 'tenant-with_special.chars');
      expect(key).toBe('tenant:tenant-with_special.chars');
    });
  });

  describe('getState()', () => {
    test('should return UNLOADED for new entity', () => {
      const state = lifecycleManager.getState('tenant', 'new-tenant');
      expect(state).toBe(EntityLifecycleStates.UNLOADED);
    });

    test('should return current state for existing entity', () => {
      lifecycleManager.entityStates.set('tenant:existing', EntityLifecycleStates.ACTIVE);
      
      const state = lifecycleManager.getState('tenant', 'existing');
      expect(state).toBe(EntityLifecycleStates.ACTIVE);
    });

    test('should handle different entity states', () => {
      lifecycleManager.entityStates.set('tenant:loading', EntityLifecycleStates.LOADING);
      lifecycleManager.entityStates.set('tenant:suspended', EntityLifecycleStates.SUSPENDED);
      lifecycleManager.entityStates.set('tenant:error', EntityLifecycleStates.ERROR);
      
      expect(lifecycleManager.getState('tenant', 'loading')).toBe(EntityLifecycleStates.LOADING);
      expect(lifecycleManager.getState('tenant', 'suspended')).toBe(EntityLifecycleStates.SUSPENDED);
      expect(lifecycleManager.getState('tenant', 'error')).toBe(EntityLifecycleStates.ERROR);
    });
  });

  describe('setState()', () => {
    test('should set state and log transition', () => {
      const newState = lifecycleManager.setState('tenant', 'test-tenant', EntityLifecycleStates.LOADING);
      
      expect(newState).toBe(EntityLifecycleStates.LOADING);
      expect(lifecycleManager.getState('tenant', 'test-tenant')).toBe(EntityLifecycleStates.LOADING);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Entity tenant:test-tenant state changed: unloaded → loading'
      );
    });

    test('should handle state transitions correctly', () => {
      // First transition from UNLOADED to LOADING
      lifecycleManager.setState('tenant', 'test-tenant', EntityLifecycleStates.LOADING);
      expect(mockLogger.debug).toHaveBeenLastCalledWith(
        'Entity tenant:test-tenant state changed: unloaded → loading'
      );

      // Second transition from LOADING to ACTIVE
      lifecycleManager.setState('tenant', 'test-tenant', EntityLifecycleStates.ACTIVE);
      expect(mockLogger.debug).toHaveBeenLastCalledWith(
        'Entity tenant:test-tenant state changed: loading → active'
      );
    });

    test('should return the new state', () => {
      const result = lifecycleManager.setState('user', 'user123', EntityLifecycleStates.SUSPENDED);
      expect(result).toBe(EntityLifecycleStates.SUSPENDED);
    });
  });

  describe('canTransition()', () => {
    beforeEach(() => {
      // Set up some entities in different states
      lifecycleManager.entityStates.set('tenant:unloaded', EntityLifecycleStates.UNLOADED);
      lifecycleManager.entityStates.set('tenant:active', EntityLifecycleStates.ACTIVE);
      lifecycleManager.entityStates.set('tenant:suspended', EntityLifecycleStates.SUSPENDED);
      lifecycleManager.entityStates.set('tenant:error', EntityLifecycleStates.ERROR);
      lifecycleManager.entityStates.set('tenant:loading', EntityLifecycleStates.LOADING);
    });

    describe('Valid Transitions', () => {
      test('should allow load from UNLOADED', () => {
        expect(lifecycleManager.canTransition('tenant', 'unloaded', 'load')).toBe(true);
      });

      test('should allow load from ERROR', () => {
        expect(lifecycleManager.canTransition('tenant', 'error', 'load')).toBe(true);
      });

      test('should allow suspend from ACTIVE', () => {
        expect(lifecycleManager.canTransition('tenant', 'active', 'suspend')).toBe(true);
      });

      test('should allow resume from SUSPENDED', () => {
        expect(lifecycleManager.canTransition('tenant', 'suspended', 'resume')).toBe(true);
      });

      test('should allow reload from ACTIVE', () => {
        expect(lifecycleManager.canTransition('tenant', 'active', 'reload')).toBe(true);
      });

      test('should allow unload from ACTIVE', () => {
        expect(lifecycleManager.canTransition('tenant', 'active', 'unload')).toBe(true);
      });

      test('should allow unload from SUSPENDED', () => {
        expect(lifecycleManager.canTransition('tenant', 'suspended', 'unload')).toBe(true);
      });

      test('should allow unload from ERROR', () => {
        expect(lifecycleManager.canTransition('tenant', 'error', 'unload')).toBe(true);
      });
    });

    describe('Invalid Transitions', () => {
      test('should not allow load from ACTIVE', () => {
        expect(lifecycleManager.canTransition('tenant', 'active', 'load')).toBe(false);
      });

      test('should not allow suspend from UNLOADED', () => {
        expect(lifecycleManager.canTransition('tenant', 'unloaded', 'suspend')).toBe(false);
      });

      test('should not allow resume from ACTIVE', () => {
        expect(lifecycleManager.canTransition('tenant', 'active', 'resume')).toBe(false);
      });

      test('should not allow reload from UNLOADED', () => {
        expect(lifecycleManager.canTransition('tenant', 'unloaded', 'reload')).toBe(false);
      });

      test('should not allow suspend from LOADING', () => {
        expect(lifecycleManager.canTransition('tenant', 'loading', 'suspend')).toBe(false);
      });

      test('should return false for non-existent transition', () => {
        expect(lifecycleManager.canTransition('tenant', 'active', 'invalid-transition')).toBe(false);
      });
    });
  });

  describe('transition()', () => {
    describe('Successful Transitions', () => {
      test('should perform load transition without handler', async () => {
        const result = await lifecycleManager.transition('tenant', 'test-tenant', 'load');
        
        expect(result).toBeInstanceOf(Result);
        expect(result.success).toBe(true);
        expect(result.value).toBe(EntityLifecycleStates.ACTIVE);
        expect(lifecycleManager.getState('tenant', 'test-tenant')).toBe(EntityLifecycleStates.ACTIVE);
      });

      test('should perform load transition with handler', async () => {
        const mockHandler = vi.fn().mockResolvedValue('handler-result');
        
        const result = await lifecycleManager.transition('tenant', 'test-tenant', 'load', mockHandler);
        
        expect(result.success).toBe(true);
        expect(result.value).toBe(EntityLifecycleStates.ACTIVE);
        expect(mockHandler).toHaveBeenCalledOnce();
        expect(lifecycleManager.getState('tenant', 'test-tenant')).toBe(EntityLifecycleStates.ACTIVE);
      });

      test('should set intermediate state during transition', async () => {
        let intermediateState;
        const mockHandler = vi.fn().mockImplementation(() => {
          intermediateState = lifecycleManager.getState('tenant', 'test-tenant');
          return Promise.resolve();
        });
        
        await lifecycleManager.transition('tenant', 'test-tenant', 'load', mockHandler);
        
        expect(intermediateState).toBe(EntityLifecycleStates.LOADING);
      });

      test('should perform suspend transition', async () => {
        // Set entity to ACTIVE first
        lifecycleManager.setState('tenant', 'active-tenant', EntityLifecycleStates.ACTIVE);
        
        const result = await lifecycleManager.transition('tenant', 'active-tenant', 'suspend');
        
        expect(result.success).toBe(true);
        expect(result.value).toBe(EntityLifecycleStates.SUSPENDED);
        expect(lifecycleManager.getState('tenant', 'active-tenant')).toBe(EntityLifecycleStates.SUSPENDED);
      });

      test('should perform resume transition', async () => {
        // Set entity to SUSPENDED first
        lifecycleManager.setState('tenant', 'suspended-tenant', EntityLifecycleStates.SUSPENDED);
        
        const result = await lifecycleManager.transition('tenant', 'suspended-tenant', 'resume');
        
        expect(result.success).toBe(true);
        expect(result.value).toBe(EntityLifecycleStates.ACTIVE);
        expect(lifecycleManager.getState('tenant', 'suspended-tenant')).toBe(EntityLifecycleStates.ACTIVE);
      });

      test('should perform reload transition', async () => {
        // Set entity to ACTIVE first
        lifecycleManager.setState('tenant', 'active-tenant', EntityLifecycleStates.ACTIVE);
        
        const result = await lifecycleManager.transition('tenant', 'active-tenant', 'reload');
        
        expect(result.success).toBe(true);
        expect(result.value).toBe(EntityLifecycleStates.ACTIVE);
        expect(lifecycleManager.getState('tenant', 'active-tenant')).toBe(EntityLifecycleStates.ACTIVE);
      });

      test('should perform unload transition', async () => {
        // Set entity to ACTIVE first
        lifecycleManager.setState('tenant', 'active-tenant', EntityLifecycleStates.ACTIVE);
        
        const result = await lifecycleManager.transition('tenant', 'active-tenant', 'unload');
        
        expect(result.success).toBe(true);
        expect(result.value).toBe(EntityLifecycleStates.UNLOADED);
        expect(lifecycleManager.getState('tenant', 'active-tenant')).toBe(EntityLifecycleStates.UNLOADED);
      });
    });

    describe('Failed Transitions', () => {
      test('should throw EntityError for invalid transition', async () => {
        // Try to suspend an UNLOADED entity
        await expect(
          lifecycleManager.transition('tenant', 'test-tenant', 'suspend')
        ).rejects.toThrow(EntityError);
        
        await expect(
          lifecycleManager.transition('tenant', 'test-tenant', 'suspend')
        ).rejects.toThrow("Invalid transition 'suspend' from state 'unloaded'");
      });

      test('should handle handler errors and set ERROR state', async () => {
        const mockHandler = vi.fn().mockRejectedValue(new Error('Handler failed'));
        
        const result = await lifecycleManager.transition('tenant', 'test-tenant', 'load', mockHandler);
        
        expect(result.success).toBe(false);
        expect(result.error).toBe('Handler failed');
        expect(lifecycleManager.getState('tenant', 'test-tenant')).toBe(EntityLifecycleStates.ERROR);
      });

      test('should handle synchronous handler errors', async () => {
        const mockHandler = vi.fn().mockImplementation(() => {
          throw new Error('Sync handler failed');
        });
        
        const result = await lifecycleManager.transition('tenant', 'test-tenant', 'load', mockHandler);
        
        expect(result.success).toBe(false);
        expect(result.error).toBe('Sync handler failed');
        expect(lifecycleManager.getState('tenant', 'test-tenant')).toBe(EntityLifecycleStates.ERROR);
      });

      test('should preserve entity information in EntityError', async () => {
        try {
          await lifecycleManager.transition('user', 'user123', 'suspend');
        } catch (error) {
          expect(error).toBeInstanceOf(EntityError);
          expect(error.entityType).toBe('user');
          expect(error.entityId).toBe('user123');
        }
      });
    });

    describe('Complex Transition Scenarios', () => {
      test('should handle rapid successive transitions', async () => {
        // Load entity
        const loadResult = await lifecycleManager.transition('tenant', 'test-tenant', 'load');
        expect(loadResult.success).toBe(true);
        
        // Suspend entity
        const suspendResult = await lifecycleManager.transition('tenant', 'test-tenant', 'suspend');
        expect(suspendResult.success).toBe(true);
        
        // Resume entity
        const resumeResult = await lifecycleManager.transition('tenant', 'test-tenant', 'resume');
        expect(resumeResult.success).toBe(true);
        
        // Unload entity
        const unloadResult = await lifecycleManager.transition('tenant', 'test-tenant', 'unload');
        expect(unloadResult.success).toBe(true);
        
        expect(lifecycleManager.getState('tenant', 'test-tenant')).toBe(EntityLifecycleStates.UNLOADED);
      });

      test('should allow reload from ERROR state after failure', async () => {
        // First, cause a failure to get into ERROR state
        const failingHandler = vi.fn().mockRejectedValue(new Error('Initial failure'));
        await lifecycleManager.transition('tenant', 'test-tenant', 'load', failingHandler);
        
        expect(lifecycleManager.getState('tenant', 'test-tenant')).toBe(EntityLifecycleStates.ERROR);
        
        // Now try to load again (should be allowed from ERROR state)
        const successHandler = vi.fn().mockResolvedValue('success');
        const result = await lifecycleManager.transition('tenant', 'test-tenant', 'load', successHandler);
        
        expect(result.success).toBe(true);
        expect(result.value).toBe(EntityLifecycleStates.ACTIVE);
        expect(successHandler).toHaveBeenCalledOnce();
      });
    });
  });

  describe('getAllEntityStates()', () => {
    test('should return empty object when no entities exist', () => {
      const states = lifecycleManager.getAllEntityStates();
      expect(states).toEqual({});
    });

    test('should return correctly structured states object', () => {
      lifecycleManager.entityStates.set('tenant:tenant1', EntityLifecycleStates.ACTIVE);
      lifecycleManager.entityStates.set('tenant:tenant2', EntityLifecycleStates.SUSPENDED);
      lifecycleManager.entityStates.set('user:user1', EntityLifecycleStates.LOADING);
      lifecycleManager.entityStates.set('user:user2', EntityLifecycleStates.ERROR);
      
      const states = lifecycleManager.getAllEntityStates();
      
      expect(states).toEqual({
        tenant: {
          tenant1: EntityLifecycleStates.ACTIVE,
          tenant2: EntityLifecycleStates.SUSPENDED
        },
        user: {
          user1: EntityLifecycleStates.LOADING,
          user2: EntityLifecycleStates.ERROR
        }
      });
    });

    test('should handle single entity type', () => {
      lifecycleManager.entityStates.set('tenant:only-tenant', EntityLifecycleStates.ACTIVE);
      
      const states = lifecycleManager.getAllEntityStates();
      
      expect(states).toEqual({
        tenant: {
          'only-tenant': EntityLifecycleStates.ACTIVE
        }
      });
    });

    test('should handle complex entity IDs with special characters', () => {
      lifecycleManager.entityStates.set('tenant:tenant-with_special.chars', EntityLifecycleStates.ACTIVE);
      lifecycleManager.entityStates.set('organization:org:with:colons', EntityLifecycleStates.SUSPENDED);
      
      const states = lifecycleManager.getAllEntityStates();
      
      expect(states).toEqual({
        tenant: {
          'tenant-with_special.chars': EntityLifecycleStates.ACTIVE
        },
        organization: {
          'org:with:colons': EntityLifecycleStates.SUSPENDED
        }
      });
    });
  });

  describe('getEntityStatesByType()', () => {
    beforeEach(() => {
      lifecycleManager.entityStates.set('tenant:tenant1', EntityLifecycleStates.ACTIVE);
      lifecycleManager.entityStates.set('tenant:tenant2', EntityLifecycleStates.SUSPENDED);
      lifecycleManager.entityStates.set('user:user1', EntityLifecycleStates.LOADING);
      lifecycleManager.entityStates.set('organization:org1', EntityLifecycleStates.ERROR);
    });

    test('should return states for specific entity type', () => {
      const tenantStates = lifecycleManager.getEntityStatesByType('tenant');
      
      expect(tenantStates).toEqual({
        tenant1: EntityLifecycleStates.ACTIVE,
        tenant2: EntityLifecycleStates.SUSPENDED
      });
    });

    test('should return empty object for non-existent entity type', () => {
      const nonExistentStates = lifecycleManager.getEntityStatesByType('nonexistent');
      
      expect(nonExistentStates).toEqual({});
    });

    test('should return single state for entity type with one entity', () => {
      const userStates = lifecycleManager.getEntityStatesByType('user');
      
      expect(userStates).toEqual({
        user1: EntityLifecycleStates.LOADING
      });
    });

    test('should handle entity IDs with special characters', () => {
      lifecycleManager.entityStates.set('special:entity_with-special.chars', EntityLifecycleStates.ACTIVE);
      
      const specialStates = lifecycleManager.getEntityStatesByType('special');
      
      expect(specialStates).toEqual({
        'entity_with-special.chars': EntityLifecycleStates.ACTIVE
      });
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle concurrent transitions on different entities', async () => {
      const handler1 = vi.fn().mockResolvedValue('result1');
      const handler2 = vi.fn().mockResolvedValue('result2');
      
      const [result1, result2] = await Promise.all([
        lifecycleManager.transition('tenant', 'tenant1', 'load', handler1),
        lifecycleManager.transition('user', 'user1', 'load', handler2)
      ]);
      
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(handler1).toHaveBeenCalledOnce();
      expect(handler2).toHaveBeenCalledOnce();
      expect(lifecycleManager.getState('tenant', 'tenant1')).toBe(EntityLifecycleStates.ACTIVE);
      expect(lifecycleManager.getState('user', 'user1')).toBe(EntityLifecycleStates.ACTIVE);
    });

    test('should handle mixed success and failure in concurrent operations', async () => {
      const successHandler = vi.fn().mockResolvedValue('success');
      const failureHandler = vi.fn().mockRejectedValue(new Error('failure'));
      
      const [successResult, failureResult] = await Promise.all([
        lifecycleManager.transition('tenant', 'success-entity', 'load', successHandler),
        lifecycleManager.transition('tenant', 'failure-entity', 'load', failureHandler)
      ]);
      
      expect(successResult.success).toBe(true);
      expect(failureResult.success).toBe(false);
      expect(lifecycleManager.getState('tenant', 'success-entity')).toBe(EntityLifecycleStates.ACTIVE);
      expect(lifecycleManager.getState('tenant', 'failure-entity')).toBe(EntityLifecycleStates.ERROR);
    });

    test('should maintain separate state tracking for entities with same ID but different types', async () => {
      await lifecycleManager.transition('tenant', 'same-id', 'load');
      await lifecycleManager.transition('user', 'same-id', 'load');
      
      // Now put them in different states
      await lifecycleManager.transition('tenant', 'same-id', 'suspend');
      // User should still be active
      
      expect(lifecycleManager.getState('tenant', 'same-id')).toBe(EntityLifecycleStates.SUSPENDED);
      expect(lifecycleManager.getState('user', 'same-id')).toBe(EntityLifecycleStates.ACTIVE);
    });
  });
});