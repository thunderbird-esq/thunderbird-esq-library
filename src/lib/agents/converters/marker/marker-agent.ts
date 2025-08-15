import { ConversionResult, FileInput, AgentConfig } from '../../types/agent-interfaces';
import pRetry from 'p-retry';

interface MarkerResponse {
  success: boolean;
  markdown: string;
  pageCount?: number;
  processingTimeMs?: number;
  confidence?: number;
  error?: string;
}

export class MarkerAgent {
  private config: AgentConfig;
  private baseUrl: string;

  constructor(config?: Partial<AgentConfig>, markerServiceUrl?: string) {
    this.config = {
      timeoutMs: config?.timeoutMs ?? 120000, // 2 minutes for Marker processing
      retryAttempts: config?.retryAttempts ?? 3,
      maxFileSizeMB: config?.maxFileSizeMB ?? 50, // Marker handles large files well
    };
    
    // Default to local Docker container
    this.baseUrl = markerServiceUrl ?? 'http://localhost:8000';
  }

  async convertPdf(fileInput: FileInput): Promise<ConversionResult> {
    const startTime = Date.now();
    const sourceAgent = 'marker';

    try {
      // Validate file size
      if (fileInput.sizeBytes > this.config.maxFileSizeMB * 1024 * 1024) {
        throw new Error(`File size ${Math.round(fileInput.sizeBytes / 1024 / 1024)}MB exceeds maximum allowed size of ${this.config.maxFileSizeMB}MB`);
      }

      // Validate MIME type
      if (!fileInput.mimeType.includes('pdf')) {
        throw new Error(`Unsupported file type: ${fileInput.mimeType}. Marker agent only supports PDF files.`);
      }

      const result = await pRetry(
        async () => {
          return await this.performConversion(fileInput);
        },
        {
          retries: this.config.retryAttempts,
          minTimeout: 1000,
          maxTimeout: 5000,
          factor: 2,
          onFailedAttempt: (error) => {
            console.warn(`Marker Agent attempt ${error.attemptNumber} failed:`, error.message);
          },
        }
      );

      const processingTimeMs = Date.now() - startTime;
      
      // Calculate confidence based on processing characteristics
      const confidence = this.calculateConfidence(result, fileInput, processingTimeMs);

      return {
        success: true,
        sourceAgent,
        markdownContent: result.markdown,
        metadata: {
          processingTimeMs,
          wordCount: this.countWords(result.markdown),
          pageCount: result.pageCount,
          confidence,
          warnings: this.generateWarnings(result, processingTimeMs),
        },
      };

    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      console.error('Marker Agent conversion failed:', errorMessage);

      return {
        success: false,
        sourceAgent,
        markdownContent: '',
        metadata: {
          processingTimeMs,
          wordCount: 0,
          errors: [errorMessage],
        },
        error: errorMessage,
      };
    }
  }

  private async performConversion(fileInput: FileInput): Promise<MarkerResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      // Create FormData for multipart/form-data request
      const formData = new FormData();
      const blob = new Blob([fileInput.buffer], { type: fileInput.mimeType });
      formData.append('file', blob, fileInput.originalName);
      
      // Add processing options
      formData.append('extract_images', 'true');
      formData.append('paginate', 'false');
      formData.append('force_ocr', 'false');

      const response = await fetch(`${this.baseUrl}/convert`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No error details available');
        throw new Error(`Marker service error (${response.status}): ${errorText}`);
      }

      const result: MarkerResponse = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Marker service returned failure without error message');
      }

      if (!result.markdown) {
        throw new Error('Marker service returned empty markdown content');
      }

      return result;

    } catch (error) {
      clearTimeout(timeoutId);
      
      // Type guard for AbortError
      if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
        throw new Error(`Marker processing timeout after ${this.config.timeoutMs}ms`);
      }
      
      // Type guard for ECONNREFUSED error
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ECONNREFUSED') {
        throw new Error(`Cannot connect to Marker service at ${this.baseUrl}. Ensure Docker container is running.`);
      }
      
      throw error;
    }
  }

  private calculateConfidence(result: MarkerResponse, fileInput: FileInput, processingTimeMs: number): number {
    let confidence = 0.85; // Base confidence for Marker (high-quality OCR)

    // Adjust based on explicit confidence from service
    if (result.confidence !== undefined) {
      confidence = Math.max(confidence, result.confidence);
    }

    // Adjust based on processing time (faster = more confident for structured PDFs)
    const expectedTimeMs = fileInput.sizeBytes / 1000; // ~1ms per KB baseline
    if (processingTimeMs < expectedTimeMs * 2) {
      confidence += 0.05; // Bonus for fast processing
    } else if (processingTimeMs > expectedTimeMs * 10) {
      confidence -= 0.1; // Penalty for very slow processing
    }

    // Adjust based on content length (very short results might indicate issues)
    const wordCount = this.countWords(result.markdown);
    if (wordCount < 50 && fileInput.sizeBytes > 100000) { // Less than 50 words for >100KB file
      confidence -= 0.2;
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  private generateWarnings(result: MarkerResponse, processingTimeMs: number): string[] {
    const warnings: string[] = [];

    if (processingTimeMs > 60000) { // Over 1 minute
      warnings.push(`Long processing time: ${Math.round(processingTimeMs / 1000)}s. Document may be complex or contain many images.`);
    }

    if (result.markdown.length < 100) {
      warnings.push('Very short output detected. Document may be mostly images or poorly formatted.');
    }

    const imageCount = (result.markdown.match(/!\[.*?\]\(.*?\)/g) || []).length;
    if (imageCount === 0 && result.markdown.includes('image') && processingTimeMs > 30000) {
      warnings.push('No images extracted despite references in text. Images may not have been processed correctly.');
    }

    return warnings;
  }

  private countWords(text: string): number {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Health check method to verify Marker service availability
   */
  async healthCheck(): Promise<{ available: boolean; latencyMs?: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout for health check

      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;

      return {
        available: response.ok,
        latencyMs,
        error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`,
      };

    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      return {
        available: false,
        latencyMs,
        error: errorMessage,
      };
    }
  }
}