import { describe, it, expect, vi } from 'vitest';
import { withResilience } from '../../src/lib/resilience';

describe('withResilience', () => {
  it('should return the result of the operation on the first try', async () => {
    const operation = vi.fn().mockResolvedValue('success');
    const result = await withResilience(operation, { strategies: ['strategy1'] });
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should retry the operation on a retryable error', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('Service Unavailable (503)'))
      .mockResolvedValue('success');

    const result = await withResilience(operation, {
      strategies: ['strategy1'],
      baseDelayMs: 1
    });

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should try the next strategy if the first one fails', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('Not Found (404)'))
      .mockResolvedValue('success');

    const result = await withResilience(operation, {
      strategies: ['strategy1', 'strategy2'],
      baseDelayMs: 1
    });

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
    expect(operation).toHaveBeenCalledWith('strategy1');
    expect(operation).toHaveBeenCalledWith('strategy2');
  });

  it('should throw an error if all strategies and retries fail', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('Service Unavailable (503)'));

    await expect(withResilience(operation, {
      strategies: ['strategy1', 'strategy2'],
      maxRetries: 2,
      baseDelayMs: 1
    })).rejects.toThrow('Operation failed with all strategies. Last error: Service Unavailable (503)');

    expect(operation).toHaveBeenCalledTimes(4); // 2 strategies * 2 retries
  });

  it('should not retry on non-retryable errors', async () => {
    const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Bad Request (400)'))
        .mockResolvedValue('success');

    // This will fail on strategy1, then move to strategy2 and succeed.
    const result = await withResilience(operation, {
        strategies: ['strategy1', 'strategy2'],
        baseDelayMs: 1
    });

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should use custom isRetryable function', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('Custom retryable error'))
      .mockResolvedValue('success');

    const result = await withResilience(operation, {
      strategies: ['strategy1'],
      isRetryable: (error) => error.message.includes('Custom retryable error'),
      baseDelayMs: 1
    });

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });
});
