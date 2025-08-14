import { ConversionResult, FileInput, AgentConfig } from '../../types/agent-interfaces';
import pRetry from 'p-retry';
import { pdf2md } from 'pdf2md-js';

interface PDF2MDOptions {
  enableVision?: boolean;
  openaiApiKey?: string;
  imageQuality?: 'low' | 'medium' | 'high';
  preserveImages?: boolean;
  timeout?: number;
}

export class PDF2MDAgent {
  private config: AgentConfig;
  private options: PDF2MDOptions;

  constructor(config?: Partial<AgentConfig>, options?: PDF2MDOptions) {
    this.config = {
      timeoutMs: config?.timeoutMs ?? 90000, // 90 seconds for PDF2MD with vision
      retryAttempts: config?.retryAttempts ?? 2, // Fewer retries for local processing
      maxFileSizeMB: config?.maxFileSizeMB ?? 25, // Moderate file size limit
    };
    
    this.options = {
      enableVision: options?.enableVision ?? false,
      openaiApiKey: options?.openaiApiKey ?? process.env.OPENAI_API_KEY,
      imageQuality: options?.imageQuality ?? 'medium',
      preserveImages: options?.preserveImages ?? true,
      timeout: options?.timeout ?? this.config.timeoutMs,
    };
  }

  async convertPdf(fileInput: FileInput): Promise<ConversionResult> {
    const startTime = Date.now();
    const sourceAgent = 'pdf2md';

    try {
      // Validate file size
      if (fileInput.sizeBytes > this.config.maxFileSizeMB * 1024 * 1024) {
        throw new Error(`File size ${Math.round(fileInput.sizeBytes / 1024 / 1024)}MB exceeds maximum allowed size of ${this.config.maxFileSizeMB}MB`);
      }

      // Validate MIME type
      if (!fileInput.mimeType.includes('pdf')) {
        throw new Error(`Unsupported file type: ${fileInput.mimeType}. PDF2MD agent only supports PDF files.`);
      }

      const result = await pRetry(
        async () => {
          return await this.performConversion(fileInput);
        },
        {
          retries: this.config.retryAttempts,
          minTimeout: 2000,
          maxTimeout: 8000,
          factor: 2,
          onFailedAttempt: (error) => {
            console.warn(`PDF2MD Agent attempt ${error.attemptNumber} failed:`, error.message);
          },
        }
      );

      const processingTimeMs = Date.now() - startTime;
      const wordCount = this.countWords(result);
      const confidence = this.calculateConfidence(result, fileInput, processingTimeMs);

      return {
        success: true,
        sourceAgent,
        markdownContent: result,
        metadata: {
          processingTimeMs,
          wordCount,
          confidence,
          warnings: this.generateWarnings(result, processingTimeMs, fileInput),
        },
      };

    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      console.error('PDF2MD Agent conversion failed:', errorMessage);

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

  private async performConversion(fileInput: FileInput): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`PDF2MD processing timeout after ${this.config.timeoutMs}ms`));
      }, this.config.timeoutMs);

      try {
        // Convert ArrayBuffer to Buffer for pdf2md-js
        const buffer = Buffer.from(fileInput.buffer);
        
        // Configure pdf2md options based on agent settings
        const pdf2mdOptions: any = {
          imageQuality: this.options.imageQuality,
          preserveImages: this.options.preserveImages,
        };

        // Enable vision processing if configured and API key is available
        if (this.options.enableVision && this.options.openaiApiKey) {
          pdf2mdOptions.vision = {
            enabled: true,
            apiKey: this.options.openaiApiKey,
            model: 'gpt-4-vision-preview', // Use vision-capable model
          };
        }

        // Perform the conversion
        pdf2md(buffer, pdf2mdOptions)
          .then((markdown: string) => {
            clearTimeout(timeoutId);
            
            if (!markdown || markdown.trim().length === 0) {
              reject(new Error('PDF2MD returned empty result'));
              return;
            }

            // Clean up the markdown output
            const cleanedMarkdown = this.postProcessMarkdown(markdown);
            resolve(cleanedMarkdown);
          })
          .catch((error: Error) => {
            clearTimeout(timeoutId);
            
            // Handle common pdf2md-js errors
            if (error.message.includes('password')) {
              reject(new Error('PDF is password protected and cannot be processed'));
            } else if (error.message.includes('corrupt')) {
              reject(new Error('PDF file appears to be corrupted'));
            } else if (error.message.includes('vision') && error.message.includes('API')) {
              reject(new Error('Vision processing failed: Invalid or missing OpenAI API key'));
            } else {
              reject(new Error(`PDF2MD processing failed: ${error.message}`));
            }
          });

      } catch (error) {
        clearTimeout(timeoutId);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during PDF2MD setup';
        reject(new Error(`PDF2MD initialization failed: ${errorMessage}`));
      }
    });
  }

  private postProcessMarkdown(markdown: string): string {
    // Clean up common pdf2md-js artifacts
    let cleaned = markdown;

    // Remove excessive whitespace
    cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');
    
    // Fix broken links
    cleaned = cleaned.replace(/\[([^\]]+)\]\s*\(\s*\)/g, '$1'); // Remove empty links
    
    // Fix malformed headers
    cleaned = cleaned.replace(/^#+\s*$/gm, ''); // Remove empty headers
    
    // Fix table formatting issues
    cleaned = cleaned.replace(/\|\s*\|\s*\|/g, '| |'); // Fix empty table cells
    
    // Remove artifacts like page numbers at the end of lines
    cleaned = cleaned.replace(/\s+\d+\s*$/gm, '');
    
    // Ensure proper paragraph separation
    cleaned = cleaned.replace(/([.!?])\s*\n([A-Z])/g, '$1\n\n$2');

    return cleaned.trim();
  }

  private calculateConfidence(markdown: string, fileInput: FileInput, processingTimeMs: number): number {
    let confidence = 0.70; // Base confidence for PDF2MD (good for text-based PDFs)

    // Adjust based on vision processing capability
    if (this.options.enableVision && this.options.openaiApiKey) {
      confidence += 0.15; // Bonus for vision-enhanced processing
    }

    // Adjust based on content quality indicators
    const wordCount = this.countWords(markdown);
    const hasStructure = this.hasGoodStructure(markdown);
    const hasImages = (markdown.match(/!\[.*?\]\(.*?\)/g) || []).length > 0;

    if (hasStructure) {
      confidence += 0.05;
    }

    if (hasImages && this.options.preserveImages) {
      confidence += 0.05; // Bonus for successful image extraction
    }

    // Adjust based on processing time relative to file size
    const expectedTimeMs = fileInput.sizeBytes / 2000; // ~0.5ms per KB baseline for local processing
    if (processingTimeMs < expectedTimeMs * 3) {
      confidence += 0.05; // Bonus for reasonable processing time
    } else if (processingTimeMs > expectedTimeMs * 10) {
      confidence -= 0.1; // Penalty for very slow processing
    }

    // Penalty for very short results relative to file size
    if (wordCount < 100 && fileInput.sizeBytes > 200000) { // Less than 100 words for >200KB file
      confidence -= 0.2;
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  private hasGoodStructure(markdown: string): boolean {
    // Check for structural elements that indicate good conversion
    const hasHeaders = /^#{1,6}\s+/m.test(markdown);
    const hasLists = /^[\s]*[-*+]\s+/m.test(markdown) || /^\d+\.\s+/m.test(markdown);
    const hasParagraphs = markdown.split('\n\n').length > 2;
    
    return hasHeaders || hasLists || hasParagraphs;
  }

  private generateWarnings(markdown: string, processingTimeMs: number, fileInput: FileInput): string[] {
    const warnings: string[] = [];

    if (processingTimeMs > 60000) { // Over 1 minute
      warnings.push(`Long processing time: ${Math.round(processingTimeMs / 1000)}s. Consider using vision processing for complex documents.`);
    }

    if (markdown.length < 200) {
      warnings.push('Very short output detected. Document may contain mostly images or complex layouts.');
    }

    if (!this.options.enableVision && markdown.includes('image') && processingTimeMs > 30000) {
      warnings.push('Document appears to contain images but vision processing is disabled. Enable vision for better results.');
    }

    if (this.options.enableVision && !this.options.openaiApiKey) {
      warnings.push('Vision processing enabled but no OpenAI API key provided. Falling back to basic text extraction.');
    }

    const imageCount = (markdown.match(/!\[.*?\]\(.*?\)/g) || []).length;
    if (imageCount === 0 && fileInput.sizeBytes > 500000) { // Large file with no images extracted
      warnings.push('Large file processed but no images extracted. Document may be image-heavy and require vision processing.');
    }

    return warnings;
  }

  private countWords(text: string): number {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Enable or disable vision processing
   */
  setVisionProcessing(enabled: boolean, apiKey?: string): void {
    this.options.enableVision = enabled;
    if (apiKey) {
      this.options.openaiApiKey = apiKey;
    }
  }

  /**
   * Get current agent configuration and options
   */
  getConfiguration(): { config: AgentConfig; options: PDF2MDOptions } {
    return {
      config: { ...this.config },
      options: { ...this.options },
    };
  }
}