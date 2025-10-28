import { ConversionResult } from './types/agent-interfaces';
import { AgentError, AgentTimeoutError, AgentValidationError, AgentProcessingError } from './converters';

export interface ErrorContext {
  agent: string;
  operation: string;
  fileSize?: number;
  fileName?: string;
  timestamp: Date;
  attempt?: number;
  maxAttempts?: number;
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
  jitter: boolean;
}

export class AgentErrorHandler {
  private static readonly DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    backoffFactor: 2,
    jitter: true,
  };

  /**
   * Wraps agent operations with comprehensive error handling and retry logic
   */
  static async withErrorHandling<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    retryConfig: Partial<RetryConfig> = {}
  ): Promise<T> {
    const config = { ...this.DEFAULT_RETRY_CONFIG, ...retryConfig };
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        const result = await operation();
        
        // Log successful recovery if this wasn't the first attempt
        if (attempt > 1) {
          console.info(`${context.agent} agent recovered on attempt ${attempt}/${config.maxAttempts}`);
        }
        
        return result;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Create enhanced error context
        const enhancedContext = {
          ...context,
          attempt,
          maxAttempts: config.maxAttempts,
        };

        // Determine if error is recoverable and if we should retry
        const errorInfo = this.analyzeError(lastError, enhancedContext);
        
        // Log the error with context
        this.logError(lastError, enhancedContext, errorInfo);

        // Don't retry on final attempt or if error is not recoverable
        if (attempt === config.maxAttempts || !errorInfo.recoverable) {
          throw this.enhanceError(lastError, enhancedContext, errorInfo);
        }

        // Calculate delay with jitter and backoff
        const delay = this.calculateDelay(attempt, config);
        await this.sleep(delay);
      }
    }

    // This should never be reached, but TypeScript requires it
    throw lastError || new Error('Unknown error occurred');
  }

  /**
   * Creates a standardized error result for failed conversions
   */
  static createErrorResult(
    agent: string,
    error: Error,
    processingTimeMs: number,
    context?: Partial<ErrorContext>
  ): ConversionResult {
    const errorInfo = this.analyzeError(error, { 
      agent, 
      operation: 'conversion', 
      timestamp: new Date(),
      ...context 
    });

    return {
      success: false,
      sourceAgent: agent,
      markdownContent: '',
      metadata: {
        processingTimeMs,
        wordCount: 0,
        errors: [errorInfo.userMessage],
      },
      error: errorInfo.userMessage,
    };
  }

  /**
   * Analyzes errors to determine type, recoverability, and user-friendly messages
   */
  private static analyzeError(error: Error, context: ErrorContext): {
    type: string;
    recoverable: boolean;
    userMessage: string;
    technicalMessage: string;
  } {
    // Handle known agent errors
    if (error instanceof AgentError) {
      return {
        type: error.code,
        recoverable: error.recoverable,
        userMessage: error.message,
        technicalMessage: error.message,
      };
    }

    // Handle common error patterns
    const message = error.message.toLowerCase();

    // Network/connection errors
    if (message.includes('econnrefused') || message.includes('network') || message.includes('fetch')) {
      return {
        type: 'NETWORK_ERROR',
        recoverable: true,
        userMessage: `Unable to connect to ${context.agent} service. Please check your connection and try again.`,
        technicalMessage: error.message,
      };
    }

    // Timeout errors
    if (message.includes('timeout') || message.includes('aborted')) {
      return {
        type: 'TIMEOUT_ERROR',
        recoverable: true,
        userMessage: `${context.agent} processing timed out. This may happen with large or complex files.`,
        technicalMessage: error.message,
      };
    }

    // File validation errors
    if (message.includes('password') || message.includes('encrypted')) {
      return {
        type: 'PASSWORD_PROTECTED',
        recoverable: false,
        userMessage: 'This PDF is password protected and cannot be processed. Please provide an unlocked version.',
        technicalMessage: error.message,
      };
    }

    if (message.includes('corrupted') || message.includes('invalid pdf') || message.includes('malformed')) {
      return {
        type: 'CORRUPTED_FILE',
        recoverable: false,
        userMessage: 'The PDF file appears to be corrupted or invalid. Please try with a different file.',
        technicalMessage: error.message,
      };
    }

    // Memory/resource errors
    if (message.includes('memory') || message.includes('heap') || message.includes('out of')) {
      return {
        type: 'RESOURCE_ERROR',
        recoverable: false,
        userMessage: 'The file is too large to process. Please try with a smaller file or reduce the file size.',
        technicalMessage: error.message,
      };
    }

    // API/authentication errors
    if (message.includes('api key') || message.includes('unauthorized') || message.includes('forbidden')) {
      return {
        type: 'AUTH_ERROR',
        recoverable: false,
        userMessage: 'Authentication failed. Please check your API configuration.',
        technicalMessage: error.message,
      };
    }

    // Generic processing errors
    return {
      type: 'PROCESSING_ERROR',
      recoverable: true,
      userMessage: `${context.agent} processing failed. This may be due to the document's complexity or format.`,
      technicalMessage: error.message,
    };
  }

  /**
   * Enhances errors with additional context and creates appropriate error types
   */
  private static enhanceError(error: Error, context: ErrorContext, errorInfo: any): Error {
    const message = `${context.agent} agent failed after ${context.attempt}/${context.maxAttempts} attempts: ${errorInfo.userMessage}`;

    switch (errorInfo.type) {
      case 'TIMEOUT_ERROR':
        return new AgentTimeoutError(context.agent, 0); // timeout value would come from config

      case 'PASSWORD_PROTECTED':
      case 'CORRUPTED_FILE':
      case 'RESOURCE_ERROR':
      case 'AUTH_ERROR':
      case 'VALIDATION_ERROR':
        return new AgentValidationError(context.agent, errorInfo.userMessage);

      case 'NETWORK_ERROR':
      case 'PROCESSING_ERROR':
        return new AgentProcessingError(context.agent, errorInfo.userMessage, errorInfo.recoverable);

      default:
        return new AgentError(message, context.agent, errorInfo.type, errorInfo.recoverable);
    }
  }

  /**
   * Logs errors with appropriate level and context
   */
  private static logError(error: Error, context: ErrorContext, errorInfo: any): void {
    const logData = {
      agent: context.agent,
      operation: context.operation,
      attempt: context.attempt,
      maxAttempts: context.maxAttempts,
      fileSize: context.fileSize,
      fileName: context.fileName,
      errorType: errorInfo.type,
      recoverable: errorInfo.recoverable,
      technicalMessage: errorInfo.technicalMessage,
      timestamp: context.timestamp.toISOString(),
    };

    if (context.attempt === context.maxAttempts || !errorInfo.recoverable) {
      console.error('Agent operation failed permanently:', logData);
    } else {
      console.warn('Agent operation failed (will retry):', logData);
    }
  }

  /**
   * Calculates retry delay with exponential backoff and optional jitter
   */
  private static calculateDelay(attempt: number, config: RetryConfig): number {
    const exponentialDelay = config.baseDelayMs * Math.pow(config.backoffFactor, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
    
    if (config.jitter) {
      // Add ±25% jitter to prevent thundering herd
      const jitterRange = cappedDelay * 0.25;
      const jitter = (Math.random() - 0.5) * 2 * jitterRange;
      return Math.max(0, cappedDelay + jitter);
    }
    
    return cappedDelay;
  }

  /**
   * Promise-based sleep utility
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validates file input and throws appropriate errors
   */
  static validateFileInput(fileInput: any, agent: string, maxSizeMB: number): asserts fileInput is {
    buffer: ArrayBuffer;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  } {
    if (!fileInput) {
      throw new AgentValidationError(agent, 'No file input provided');
    }

    if (!fileInput.buffer || !(fileInput.buffer instanceof ArrayBuffer)) {
      throw new AgentValidationError(agent, 'Invalid file buffer provided');
    }

    if (!fileInput.originalName || typeof fileInput.originalName !== 'string') {
      throw new AgentValidationError(agent, 'File name is required');
    }

    if (!fileInput.mimeType || typeof fileInput.mimeType !== 'string') {
      throw new AgentValidationError(agent, 'File MIME type is required');
    }

    if (!fileInput.mimeType.includes('pdf')) {
      throw new AgentValidationError(agent, `Unsupported file type: ${fileInput.mimeType}. Only PDF files are supported.`);
    }

    if (typeof fileInput.sizeBytes !== 'number' || fileInput.sizeBytes <= 0) {
      throw new AgentValidationError(agent, 'Invalid file size');
    }

    if (fileInput.sizeBytes > maxSizeMB * 1024 * 1024) {
      throw new AgentValidationError(
        agent, 
        `File size ${Math.round(fileInput.sizeBytes / 1024 / 1024)}MB exceeds maximum allowed size of ${maxSizeMB}MB`
      );
    }
  }
}

/**
 * Standalone utility function for handling agent errors
 * Wraps the AgentErrorHandler.createErrorResult method for convenient usage
 */
export function handleAgentError(
  agent: string,
  error: Error,
  processingTimeMs: number,
  context?: Partial<ErrorContext>
): ConversionResult {
  return AgentErrorHandler.createErrorResult(agent, error, processingTimeMs, context);
}

/**
 * Determines if an error is recoverable and worth retrying
 * Uses the same analysis logic as AgentErrorHandler.analyzeError
 */
export function isRecoverableError(error: Error, context?: Partial<ErrorContext>): boolean {
  const defaultContext: ErrorContext = {
    agent: 'unknown',
    operation: 'analysis',
    timestamp: new Date(),
    ...context
  };

  // Use the private analyzeError method by calling it through the class
  // We need to access this via reflection since it's private
  const errorAnalysis = (AgentErrorHandler as any).analyzeError(error, defaultContext);
  return errorAnalysis.recoverable;
}