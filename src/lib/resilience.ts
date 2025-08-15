// src/lib/resilience.ts

export type ResilienceConfig<T> = {
  strategies: T[];
  maxRetries?: number;
  baseDelayMs?: number;
  retryableStatusCodes?: number[];
  isRetryable?: (error: Error) => boolean;
};

/**
 * A generic resilience wrapper for asynchronous operations.
 * It handles retries with exponential backoff and cycles through different "strategies" (e.g., API endpoints, models).
 *
 * @param operation The async function to execute. It receives a strategy.
 * @param config Configuration for resilience, including strategies and retry logic.
 * @returns The result of the operation if successful.
 * @throws An error if the operation fails after all retries and with all strategies.
 */
export async function withResilience<S, R>(
  operation: (strategy: S) => Promise<R>,
  config: ResilienceConfig<S>
): Promise<R> {
  const {
    strategies,
    maxRetries = 3,
    baseDelayMs = 1000,
    retryableStatusCodes = [429, 500, 502, 503, 504],
    isRetryable: customIsRetryable,
  } = config;

  let lastError: Error | undefined;

  for (const strategy of strategies) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // console.log(`Attempting operation with strategy:`, strategy, `(Attempt ${attempt + 1}/${maxRetries})`);
        return await operation(strategy);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        const isRetryable = customIsRetryable
          ? customIsRetryable(lastError)
          : retryableStatusCodes.some(code => lastError!.message.includes(String(code)));

        if (isRetryable && attempt < maxRetries - 1) {
          const delay = baseDelayMs * Math.pow(2, attempt);
          console.warn(`Retryable error with strategy. Retrying in ${delay}ms...`, { strategy, attempt, error: lastError.message });
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          // If not a retryable error, or if it's the last attempt, break the inner loop and try the next strategy.
          console.warn(`Non-retryable error or max retries reached for strategy.`, { strategy, attempt, error: lastError.message });
          break;
        }
      }
    }
  }

  throw new Error(`Operation failed with all strategies. Last error: ${lastError?.message}`);
}
