import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentErrorHandler } from '../../src/lib/agents/error-handling';
import { 
  AgentError, 
  AgentTimeoutError, 
  AgentValidationError, 
  AgentProcessingError 
} from '../../src/lib/agents/converters';

describe('AgentErrorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock console methods to avoid test output pollution
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  describe('Error Analysis', () => {
    it('should identify network errors correctly', async () => {
      const networkError = new Error('ECONNREFUSED: Connection refused');
      const context = {
        agent: 'marker',
        operation: 'conversion',
        timestamp: new Date(),
      };

      try {
        await AgentErrorHandler.withErrorHandling(
          () => Promise.reject(networkError),
          context,
          { maxAttempts: 1 }
        );
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AgentProcessingError);
        expect(error.message).toContain('Unable to connect to marker service');
      }
    });

    it('should identify timeout errors correctly', async () => {
      const timeoutError = new Error('Operation timeout after 30000ms');
      const context = {
        agent: 'pdf2md',
        operation: 'conversion',
        timestamp: new Date(),
      };

      try {
        await AgentErrorHandler.withErrorHandling(
          () => Promise.reject(timeoutError),
          context,
          { maxAttempts: 1 }
        );
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AgentProcessingError);
        expect(error.message).toContain('processing timed out');
      }
    });

    it('should identify password protection errors correctly', async () => {
      const passwordError = new Error('PDF is password protected');
      const context = {
        agent: 'opendocsg',
        operation: 'conversion',
        timestamp: new Date(),
      };

      try {
        await AgentErrorHandler.withErrorHandling(
          () => Promise.reject(passwordError),
          context,
          { maxAttempts: 1 }
        );
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AgentValidationError);
        expect(error.message).toContain('password protected');
      }
    });

    it('should identify corrupted file errors correctly', async () => {
      const corruptedError = new Error('PDF file is malformed');
      const context = {
        agent: 'marker',
        operation: 'conversion',
        timestamp: new Date(),
      };

      try {
        await AgentErrorHandler.withErrorHandling(
          () => Promise.reject(corruptedError),
          context,
          { maxAttempts: 1 }
        );
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AgentValidationError);
        expect(error.message).toContain('corrupted or invalid');
      }
    });

    it('should identify memory/resource errors correctly', async () => {
      const memoryError = new Error('Out of memory heap allocation failed');
      const context = {
        agent: 'pdf2md',
        operation: 'conversion',
        timestamp: new Date(),
      };

      try {
        await AgentErrorHandler.withErrorHandling(
          () => Promise.reject(memoryError),
          context,
          { maxAttempts: 1 }
        );
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AgentValidationError);
        expect(error.message).toContain('too large to process');
      }
    });

    it('should identify API authentication errors correctly', async () => {
      const authError = new Error('Invalid API key provided');
      const context = {
        agent: 'pdf2md',
        operation: 'conversion',
        timestamp: new Date(),
      };

      try {
        await AgentErrorHandler.withErrorHandling(
          () => Promise.reject(authError),
          context,
          { maxAttempts: 1 }
        );
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AgentValidationError);
        expect(error.message).toContain('Authentication failed');
      }
    });
  });

  describe('Retry Logic', () => {
    it('should retry recoverable errors', async () => {
      const retryableError = new Error('Network connection failed');
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(retryableError)
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValueOnce('success');

      const context = {
        agent: 'marker',
        operation: 'conversion',
        timestamp: new Date(),
      };

      const result = await AgentErrorHandler.withErrorHandling(
        mockOperation,
        context,
        { maxAttempts: 3, baseDelayMs: 10 } // Short delay for testing
      );

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should not retry non-recoverable errors', async () => {
      const nonRetryableError = new Error('PDF is password protected');
      const mockOperation = vi.fn().mockRejectedValue(nonRetryableError);

      const context = {
        agent: 'opendocsg',
        operation: 'conversion',
        timestamp: new Date(),
      };

      try {
        await AgentErrorHandler.withErrorHandling(
          mockOperation,
          context,
          { maxAttempts: 3 }
        );
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(mockOperation).toHaveBeenCalledTimes(1); // No retries
        expect(error).toBeInstanceOf(AgentValidationError);
      }
    });

    it('should respect maximum retry attempts', async () => {
      const persistentError = new Error('Temporary service unavailable');
      const mockOperation = vi.fn().mockRejectedValue(persistentError);

      const context = {
        agent: 'pdf2md',
        operation: 'conversion',
        timestamp: new Date(),
      };

      try {
        await AgentErrorHandler.withErrorHandling(
          mockOperation,
          context,
          { maxAttempts: 2, baseDelayMs: 10 }
        );
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(mockOperation).toHaveBeenCalledTimes(2);
        expect(error).toBeInstanceOf(AgentProcessingError);
      }
    });

    it('should calculate delay with exponential backoff', async () => {
      const delays: number[] = [];
      const originalSetTimeout = global.setTimeout;
      
      // Mock setTimeout to capture delays
      global.setTimeout = vi.fn((callback, delay) => {
        delays.push(delay);
        return originalSetTimeout(callback, 0); // Execute immediately for testing
      }) as any;

      const mockOperation = vi.fn()
        .mockRejectedValueOnce(new Error('Retry 1'))
        .mockRejectedValueOnce(new Error('Retry 2'))
        .mockResolvedValueOnce('success');

      const context = {
        agent: 'marker',
        operation: 'conversion',
        timestamp: new Date(),
      };

      await AgentErrorHandler.withErrorHandling(
        mockOperation,
        context,
        { 
          maxAttempts: 3, 
          baseDelayMs: 100, 
          backoffFactor: 2,
          jitter: false // Disable jitter for predictable testing
        }
      );

      // Should have two delays: 100ms and 200ms
      expect(delays).toHaveLength(2);
      expect(delays[0]).toBe(100);
      expect(delays[1]).toBe(200);

      // Restore original setTimeout
      global.setTimeout = originalSetTimeout;
    });

    it('should apply jitter to delays when enabled', async () => {
      const delays: number[] = [];
      const originalSetTimeout = global.setTimeout;
      
      global.setTimeout = vi.fn((callback, delay) => {
        delays.push(delay);
        return originalSetTimeout(callback, 0);
      }) as any;

      const mockOperation = vi.fn()
        .mockRejectedValueOnce(new Error('Retry 1'))
        .mockResolvedValueOnce('success');

      const context = {
        agent: 'marker',
        operation: 'conversion',
        timestamp: new Date(),
      };

      await AgentErrorHandler.withErrorHandling(
        mockOperation,
        context,
        { 
          maxAttempts: 2, 
          baseDelayMs: 100, 
          jitter: true
        }
      );

      // With jitter, delay should be 100ms ± 25%
      expect(delays).toHaveLength(1);
      expect(delays[0]).toBeGreaterThan(75);
      expect(delays[0]).toBeLessThan(125);

      global.setTimeout = originalSetTimeout;
    });
  });

  describe('Error Result Creation', () => {
    it('should create standardized error results', () => {
      const error = new Error('Processing failed');
      const result = AgentErrorHandler.createErrorResult(
        'marker',
        error,
        5000,
        { fileSize: 1000000, fileName: 'test.pdf' }
      );

      expect(result.success).toBe(false);
      expect(result.sourceAgent).toBe('marker');
      expect(result.markdownContent).toBe('');
      expect(result.metadata.processingTimeMs).toBe(5000);
      expect(result.metadata.wordCount).toBe(0);
      expect(result.metadata.errors).toHaveLength(1);
      expect(result.error).toContain('Processing failed');
    });

    it('should handle different error types in results', () => {
      const networkError = new Error('ECONNREFUSED');
      const result = AgentErrorHandler.createErrorResult(
        'pdf2md',
        networkError,
        2000
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unable to connect to pdf2md service');
    });
  });

  describe('File Input Validation', () => {
    it('should validate correct file input', () => {
      const validInput = {
        buffer: new ArrayBuffer(1000),
        originalName: 'test.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1000,
      };

      expect(() => {
        AgentErrorHandler.validateFileInput(validInput, 'marker', 50);
      }).not.toThrow();
    });

    it('should reject null/undefined input', () => {
      expect(() => {
        AgentErrorHandler.validateFileInput(null, 'marker', 50);
      }).toThrow(AgentValidationError);

      expect(() => {
        AgentErrorHandler.validateFileInput(undefined, 'marker', 50);
      }).toThrow(AgentValidationError);
    });

    it('should reject invalid buffer', () => {
      const invalidInput = {
        buffer: 'not-a-buffer',
        originalName: 'test.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1000,
      };

      expect(() => {
        AgentErrorHandler.validateFileInput(invalidInput, 'marker', 50);
      }).toThrow(AgentValidationError);
    });

    it('should reject missing file name', () => {
      const invalidInput = {
        buffer: new ArrayBuffer(1000),
        originalName: '',
        mimeType: 'application/pdf',
        sizeBytes: 1000,
      };

      expect(() => {
        AgentErrorHandler.validateFileInput(invalidInput, 'marker', 50);
      }).toThrow(AgentValidationError);
    });

    it('should reject non-PDF MIME types', () => {
      const invalidInput = {
        buffer: new ArrayBuffer(1000),
        originalName: 'test.txt',
        mimeType: 'text/plain',
        sizeBytes: 1000,
      };

      expect(() => {
        AgentErrorHandler.validateFileInput(invalidInput, 'marker', 50);
      }).toThrow(AgentValidationError);
    });

    it('should reject files that are too large', () => {
      const tooLargeInput = {
        buffer: new ArrayBuffer(1000),
        originalName: 'test.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100 * 1024 * 1024, // 100MB
      };

      expect(() => {
        AgentErrorHandler.validateFileInput(tooLargeInput, 'marker', 50); // 50MB limit
      }).toThrow(AgentValidationError);
    });

    it('should reject invalid file sizes', () => {
      const invalidInput = {
        buffer: new ArrayBuffer(1000),
        originalName: 'test.pdf',
        mimeType: 'application/pdf',
        sizeBytes: -1,
      };

      expect(() => {
        AgentErrorHandler.validateFileInput(invalidInput, 'marker', 50);
      }).toThrow(AgentValidationError);
    });
  });

  describe('Known Agent Errors', () => {
    it('should handle AgentTimeoutError correctly', async () => {
      const timeoutError = new AgentTimeoutError('marker', 30000);
      const context = {
        agent: 'marker',
        operation: 'conversion',
        timestamp: new Date(),
      };

      try {
        await AgentErrorHandler.withErrorHandling(
          () => Promise.reject(timeoutError),
          context,
          { maxAttempts: 1 }
        );
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AgentTimeoutError);
        expect(error.recoverable).toBe(true);
      }
    });

    it('should handle AgentValidationError correctly', async () => {
      const validationError = new AgentValidationError('pdf2md', 'Invalid file format');
      const context = {
        agent: 'pdf2md',
        operation: 'conversion',
        timestamp: new Date(),
      };

      try {
        await AgentErrorHandler.withErrorHandling(
          () => Promise.reject(validationError),
          context,
          { maxAttempts: 3 }
        );
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AgentValidationError);
        expect(error.recoverable).toBe(false);
      }
    });

    it('should handle AgentProcessingError correctly', async () => {
      const processingError = new AgentProcessingError('opendocsg', 'Processing failed', true);
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(processingError)
        .mockResolvedValueOnce('success');

      const context = {
        agent: 'opendocsg',
        operation: 'conversion',
        timestamp: new Date(),
      };

      const result = await AgentErrorHandler.withErrorHandling(
        mockOperation,
        context,
        { maxAttempts: 2, baseDelayMs: 10 }
      );

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });
  });

  describe('Logging', () => {
    it('should log errors with proper context', async () => {
      const error = new Error('Test error');
      const context = {
        agent: 'marker',
        operation: 'conversion',
        fileSize: 1000000,
        fileName: 'test.pdf',
        timestamp: new Date(),
      };

      const consoleErrorSpy = vi.spyOn(console, 'error');

      try {
        await AgentErrorHandler.withErrorHandling(
          () => Promise.reject(error),
          context,
          { maxAttempts: 1 }
        );
      } catch {
        // Expected to throw
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Agent operation failed permanently:',
        expect.objectContaining({
          agent: 'marker',
          operation: 'conversion',
          fileSize: 1000000,
          fileName: 'test.pdf',
        })
      );
    });

    it('should log recovery on successful retry', async () => {
      const error = new Error('Temporary failure');
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');

      const context = {
        agent: 'pdf2md',
        operation: 'conversion',
        timestamp: new Date(),
      };

      const consoleInfoSpy = vi.spyOn(console, 'info');

      await AgentErrorHandler.withErrorHandling(
        mockOperation,
        context,
        { maxAttempts: 2, baseDelayMs: 10 }
      );

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        'pdf2md agent recovered on attempt 2/2'
      );
    });
  });
});