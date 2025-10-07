import { describe, test, expect, vi } from 'vitest';
import { Result } from '../../../main.mjs';

describe('Result Pattern', () => {
  describe('Result.ok()', () => {
    test('should create successful result with value', () => {
      const value = { data: 'test' };
      const result = Result.ok(value);
      
      expect(result).toBeInstanceOf(Result);
      expect(result.success).toBe(true);
      expect(result.value).toBe(value);
      expect(result.error).toBeNull();
    });

    test('should handle null and undefined values', () => {
      const nullResult = Result.ok(null);
      const undefinedResult = Result.ok(undefined);
      
      expect(nullResult.success).toBe(true);
      expect(nullResult.value).toBeNull();
      expect(nullResult.error).toBeNull();
      
      expect(undefinedResult.success).toBe(true);
      expect(undefinedResult.value).toBeUndefined();
      expect(undefinedResult.error).toBeNull();
    });

    test('should handle primitive values', () => {
      const stringResult = Result.ok('test');
      const numberResult = Result.ok(42);
      const booleanResult = Result.ok(true);
      
      expect(stringResult.success).toBe(true);
      expect(stringResult.value).toBe('test');
      
      expect(numberResult.success).toBe(true);
      expect(numberResult.value).toBe(42);
      
      expect(booleanResult.success).toBe(true);
      expect(booleanResult.value).toBe(true);
    });
  });

  describe('Result.fail()', () => {
    test('should create failed result with error', () => {
      const error = 'Something went wrong';
      const result = Result.fail(error);
      
      expect(result).toBeInstanceOf(Result);
      expect(result.success).toBe(false);
      expect(result.value).toBeNull();
      expect(result.error).toBe(error);
    });

    test('should handle Error objects', () => {
      const error = new Error('Test error');
      const result = Result.fail(error.message);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe(error.message);
    });

    test('should handle null and undefined errors', () => {
      const nullResult = Result.fail(null);
      const undefinedResult = Result.fail(undefined);
      
      expect(nullResult.success).toBe(false);
      expect(nullResult.error).toBeNull();
      
      expect(undefinedResult.success).toBe(false);
      expect(undefinedResult.error).toBeNull(); // Constructor sets undefined error to null
    });
  });

  describe('map()', () => {
    test('should transform successful result value', () => {
      const original = Result.ok(10);
      const transformed = original.map(x => x * 2);
      
      expect(transformed.success).toBe(true);
      expect(transformed.value).toBe(20);
      expect(transformed.error).toBeNull();
    });

    test('should not transform failed result', () => {
      const failed = Result.fail('error');
      const spy = vi.fn(x => x * 2);
      const result = failed.map(spy);
      
      expect(result.success).toBe(false);
      expect(result.value).toBeNull();
      expect(result.error).toBe('error');
      expect(spy).not.toHaveBeenCalled();
      expect(result).toBe(failed); // Should return same instance
    });

    test('should handle transformation that throws error', () => {
      const original = Result.ok(10);
      const transformed = original.map(x => {
        throw new Error('Transformation failed');
      });
      
      expect(transformed.success).toBe(false);
      expect(transformed.value).toBeNull();
      expect(transformed.error).toBe('Transformation failed');
    });

    test('should chain multiple transformations', () => {
      const result = Result.ok(5)
        .map(x => x * 2)
        .map(x => x + 1)
        .map(x => x.toString());
      
      expect(result.success).toBe(true);
      expect(result.value).toBe('11');
    });

    test('should stop chain on first error', () => {
      const spy = vi.fn(x => x.toString());
      const result = Result.ok(5)
        .map(x => x * 2)
        .map(x => { throw new Error('Failed'); })
        .map(spy);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed');
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('mapError()', () => {
    test('should transform error message on failed result', () => {
      const failed = Result.fail('original error');
      const transformed = failed.mapError(error => `Transformed: ${error}`);
      
      expect(transformed.success).toBe(false);
      expect(transformed.value).toBeNull();
      expect(transformed.error).toBe('Transformed: original error');
    });

    test('should not transform successful result', () => {
      const successful = Result.ok('value');
      const spy = vi.fn(error => `Transformed: ${error}`);
      const result = successful.mapError(spy);
      
      expect(result.success).toBe(true);
      expect(result.value).toBe('value');
      expect(result.error).toBeNull();
      expect(spy).not.toHaveBeenCalled();
      expect(result).toBe(successful); // Should return same instance
    });

    test('should handle null/undefined error transformation', () => {
      const failed = Result.fail('error');
      const transformed = failed.mapError(() => null);
      
      expect(transformed.success).toBe(false);
      expect(transformed.error).toBeNull();
    });
  });

  describe('unwrap()', () => {
    test('should return value for successful result', () => {
      const value = { data: 'test' };
      const result = Result.ok(value);
      
      expect(result.unwrap()).toBe(value);
    });

    test('should throw error for failed result', () => {
      const result = Result.fail('Something went wrong');
      
      expect(() => result.unwrap()).toThrow('Something went wrong');
    });

    test('should throw Error instance for failed result', () => {
      const result = Result.fail('Test error');
      
      expect(() => result.unwrap()).toThrow(Error);
      expect(() => result.unwrap()).toThrow('Test error');
    });
  });

  describe('unwrapOr()', () => {
    test('should return value for successful result', () => {
      const value = 'success';
      const result = Result.ok(value);
      
      expect(result.unwrapOr('default')).toBe(value);
    });

    test('should return default for failed result', () => {
      const result = Result.fail('error');
      const defaultValue = 'default';
      
      expect(result.unwrapOr(defaultValue)).toBe(defaultValue);
    });

    test('should handle null/undefined defaults', () => {
      const failed = Result.fail('error');
      
      expect(failed.unwrapOr(null)).toBeNull();
      expect(failed.unwrapOr(undefined)).toBeUndefined();
    });

    test('should return actual value even if it is falsy', () => {
      const zeroResult = Result.ok(0);
      const emptyStringResult = Result.ok('');
      const falseResult = Result.ok(false);
      
      expect(zeroResult.unwrapOr('default')).toBe(0);
      expect(emptyStringResult.unwrapOr('default')).toBe('');
      expect(falseResult.unwrapOr('default')).toBe(false);
    });
  });

  describe('Complex Result Workflows', () => {
    test('should handle complex chaining with both success and error paths', () => {
      const processData = (data) => {
        return Result.ok(data)
          .map(x => x.trim())
          .map(x => x.toUpperCase())
          .map(x => x.split(' '))
          .map(x => x.filter(word => word.length > 0));
      };
      
      const result1 = processData('  hello world  ');
      expect(result1.success).toBe(true);
      expect(result1.value).toEqual(['HELLO', 'WORLD']);
      
      const result2 = processData(null);
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('Cannot read');
    });

    test('should handle error recovery with mapError', () => {
      const result = Result.fail('Network error')
        .mapError(error => `Handled: ${error}`)
        .mapError(error => error.toUpperCase());
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('HANDLED: NETWORK ERROR');
    });

    test('should preserve original result when no transformation needed', () => {
      const original = Result.ok('test');
      const mapped = original.map(x => x);
      
      // Different instances but same values
      expect(mapped).not.toBe(original);
      expect(mapped.success).toBe(original.success);
      expect(mapped.value).toBe(original.value);
      expect(mapped.error).toBe(original.error);
    });
  });

  describe('Result Constructor', () => {
    test('should create result with all parameters', () => {
      const success = new Result(true, 'value', null);
      const failure = new Result(false, null, 'error');
      
      expect(success.success).toBe(true);
      expect(success.value).toBe('value');
      expect(success.error).toBeNull();
      
      expect(failure.success).toBe(false);
      expect(failure.value).toBeNull();
      expect(failure.error).toBe('error');
    });

    test('should use default error value', () => {
      const result = new Result(true, 'value');
      
      expect(result.error).toBeNull();
    });
  });
});