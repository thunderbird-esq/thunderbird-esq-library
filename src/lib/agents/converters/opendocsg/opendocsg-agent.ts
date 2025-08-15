import { ConversionResult, FileInput, AgentConfig } from '../../types/agent-interfaces';
import pRetry from 'p-retry';
// @ts-ignore - @opendocsg/pdf2md may not have perfect TypeScript definitions
import pdf2md from '@opendocsg/pdf2md';

interface OpenDocSGOptions {
  enableDebugLogging?: boolean;
  useCallbacks?: boolean;
}

export class OpenDocSGAgent {
  private config: AgentConfig;
  private options: OpenDocSGOptions;

  constructor(config?: Partial<AgentConfig>, options?: OpenDocSGOptions) {
    this.config = {
      timeoutMs: config?.timeoutMs ?? 45000, // 45 seconds - OpenDocSG is optimized for speed
      retryAttempts: config?.retryAttempts ?? 2,
      maxFileSizeMB: config?.maxFileSizeMB ?? 30, // Good balance of size and speed
    };
    
    this.options = {
      enableDebugLogging: options?.enableDebugLogging ?? false,
      useCallbacks: options?.useCallbacks ?? true,
    };
  }

  async convertPdf(fileInput: FileInput): Promise<ConversionResult> {
    const startTime = Date.now();
    const sourceAgent = 'opendocsg';

    try {
      // Validate file size
      if (fileInput.sizeBytes > this.config.maxFileSizeMB * 1024 * 1024) {
        throw new Error(`File size ${Math.round(fileInput.sizeBytes / 1024 / 1024)}MB exceeds maximum allowed size of ${this.config.maxFileSizeMB}MB`);
      }

      // Validate MIME type
      if (!fileInput.mimeType.includes('pdf')) {
        throw new Error(`Unsupported file type: ${fileInput.mimeType}. OpenDocSG agent only supports PDF files.`);
      }

      const result = await pRetry(
        async () => {
          return await this.performConversion(fileInput);
        },
        {
          retries: this.config.retryAttempts,
          minTimeout: 1000,
          maxTimeout: 4000,
          factor: 2,
          onFailedAttempt: (error) => {
            console.warn(`OpenDocSG Agent attempt ${error.attemptNumber} failed:`, error.message);
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
      
      console.error('OpenDocSG Agent conversion failed:', errorMessage);

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
        reject(new Error(`OpenDocSG processing timeout after ${this.config.timeoutMs}ms`));
      }, this.config.timeoutMs);

      try {
        // Convert ArrayBuffer to Buffer for @opendocsg/pdf2md
        const buffer = Buffer.from(fileInput.buffer);
        
        // Configure OpenDocSG callbacks for progress tracking (optional)
        const callbacks = this.options.useCallbacks ? {
          metadataParsed: (metadata: any) => {
            if (this.options.enableDebugLogging) {
              console.debug('OpenDocSG: Metadata parsed', metadata);
            }
          },
          pageParsed: (pages: any[]) => {
            if (this.options.enableDebugLogging) {
              console.debug(`OpenDocSG: ${pages.length} pages parsed`);
            }
          },
          fontParsed: (font: any) => {
            if (this.options.enableDebugLogging) {
              console.debug('OpenDocSG: Font parsed', font);
            }
          },
          documentParsed: (document: any, pages: any[]) => {
            if (this.options.enableDebugLogging) {
              console.debug(`OpenDocSG: Document parsed with ${pages.length} pages`);
            }
          }
        } : undefined;

        // Perform the conversion using the correct API
        const conversionPromise = pdf2md(buffer, callbacks);
        
        // Ensure we have a valid promise before proceeding
        if (!conversionPromise || typeof conversionPromise.then !== 'function') {
          throw new Error('OpenDocSG library call failed - invalid return value');
        }
        
        conversionPromise
          .then((markdown: string) => {
            clearTimeout(timeoutId);
            
            if (!markdown || markdown.trim().length === 0) {
              reject(new Error('OpenDocSG returned empty result'));
              return;
            }

            // Apply OpenDocSG-specific post-processing
            const processedMarkdown = this.postProcessMarkdown(markdown);
            resolve(processedMarkdown);
          })
          .catch((error: Error) => {
            clearTimeout(timeoutId);
            
            // Handle common @opendocsg/pdf2md errors
            if (error.message.includes('encrypted') || error.message.includes('password')) {
              reject(new Error('PDF is password protected and cannot be processed by OpenDocSG'));
            } else if (error.message.includes('corrupted') || error.message.includes('invalid')) {
              reject(new Error('PDF file is corrupted or invalid format'));
            } else if (error.message.includes('memory') || error.message.includes('heap')) {
              reject(new Error('File too large for OpenDocSG processing - try reducing file size'));
            } else if (error.message.includes('PDF parsing')) {
              reject(new Error('PDF structure is incompatible with OpenDocSG parser'));
            } else {
              reject(new Error(`OpenDocSG processing failed: ${error.message}`));
            }
          });

      } catch (error) {
        clearTimeout(timeoutId);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during OpenDocSG setup';
        reject(new Error(`OpenDocSG initialization failed: ${errorMessage}`));
      }
    });
  }

  private postProcessMarkdown(markdown: string): string {
    // OpenDocSG-specific post-processing for optimal output
    let processed = markdown;

    // Clean up excessive whitespace and normalize spacing
    processed = processed.replace(/\t/g, '    '); // Convert tabs to spaces
    processed = processed.replace(/[ \t]+$/gm, ''); // Remove trailing whitespace
    
    // Remove empty lines and limit consecutive newlines
    processed = processed.replace(/^\s*\n/gm, ''); // Remove empty lines
    processed = processed.replace(/\n{3,}/g, '\n\n'); // Max 2 consecutive newlines
    
    // Fix paragraph spacing for better readability
    processed = processed.replace(/([.!?])\n([A-Z])/g, '$1\n\n$2'); // Ensure paragraph breaks
    
    // Clean up list formatting
    processed = processed.replace(/^\s*[-*+]\s*$/gm, ''); // Remove empty list items
    processed = processed.replace(/^(\s*)[-*+](\s+)/gm, '$1- '); // Standardize list markers
    
    // Fix heading formatting issues
    processed = processed.replace(/^(#{1,6})\s*(.+?)\s*#+\s*$/gm, '$1 $2'); // Remove trailing hashes
    processed = processed.replace(/^(#{1,6})\s*$/gm, ''); // Remove empty headers
    
    // Improve table formatting if tables are present
    if (processed.includes('|')) {
      processed = processed.replace(/\|\s{2,}/g, '| '); // Fix excessive spacing in tables
      processed = processed.replace(/\s{2,}\|/g, ' |'); // Fix spacing before pipes
      processed = processed.replace(/^\|\s*\|/gm, '|'); // Remove empty table cells at start
    }
    
    // Remove common PDF artifacts
    processed = processed.replace(/^\d+\s*$/gm, ''); // Remove standalone page numbers
    processed = processed.replace(/^Page \d+/gm, ''); // Remove page headers
    processed = processed.replace(/^\s*\.\s*$/gm, ''); // Remove standalone periods
    
    // Fix broken links and references
    processed = processed.replace(/\[([^\]]+)\]\(\s*\)/g, '$1'); // Remove empty links
    processed = processed.replace(/\[\]\([^)]+\)/g, ''); // Remove empty link text

    return processed.trim();
  }

  private calculateConfidence(markdown: string, fileInput: FileInput, processingTimeMs: number): number {
    let confidence = 0.70; // Base confidence for OpenDocSG (fast, reliable for text-based PDFs)

    // Performance bonus - OpenDocSG is optimized for speed
    const expectedTimeMs = fileInput.sizeBytes / 1000; // ~1ms per KB (reasonable baseline for testing)
    if (processingTimeMs < expectedTimeMs * 2) {
      confidence += 0.05; // Moderate bonus for fast processing
    }

    // Content quality assessment
    const wordCount = this.countWords(markdown);
    const hasGoodStructure = this.assessStructureQuality(markdown);
    const hasTablesOrLists = this.hasTablesOrLists(markdown);

    if (hasGoodStructure) {
      confidence += 0.05;
    }

    if (hasTablesOrLists) {
      confidence += 0.05; // Bonus for structured content
    }

    // Adjust based on file size vs content ratio
    const contentRatio = wordCount / (fileInput.sizeBytes / 1024); // Words per KB
    if (contentRatio > 10) { // Very good text density
      confidence += 0.1;
    } else if (contentRatio > 5) { // Good text density
      confidence += 0.05;
    } else if (contentRatio < 0.5 && fileInput.sizeBytes > 50000) { // Poor text density in large file
      confidence -= 0.15;
    }

    // Penalty for very short results
    if (wordCount < 50 && fileInput.sizeBytes > 100000) {
      confidence -= 0.15;
    }

    // Bonus for reasonable processing time
    if (processingTimeMs < 10000) { // Under 10 seconds
      confidence += 0.05;
    }

    return Math.max(0.2, Math.min(1.0, confidence));
  }

  private assessStructureQuality(markdown: string): boolean {
    // Check for good structural elements
    const hasHeaders = /^#{1,6}\s+.+$/m.test(markdown);
    const hasProperParagraphs = markdown.split('\n\n').length >= 2;
    const hasLists = /^[\s]*[-*+]\s+.+$/m.test(markdown) || /^\d+\.\s+.+$/m.test(markdown);
    
    // Check for artifacts that indicate poor conversion
    const hasSignificantArtifacts = (
      markdown.includes('���') || // Encoding issues
      markdown.includes('[object Object]') || // Conversion artifacts
      /\s{10,}/.test(markdown) || // Excessive whitespace
      markdown.length < 20 // Very short content
    );

    // Must have structure and minimal artifacts for good quality
    return (hasHeaders || hasLists || hasProperParagraphs) && !hasSignificantArtifacts;
  }

  private hasTablesOrLists(markdown: string): boolean {
    const hasTables = markdown.includes('|') && markdown.includes('---');
    const hasLists = /^[\s]*[-*+]\s+/m.test(markdown) || /^\d+\.\s+/m.test(markdown);
    return hasTables || hasLists;
  }

  private generateWarnings(markdown: string, processingTimeMs: number, fileInput: FileInput): string[] {
    const warnings: string[] = [];

    // Performance warnings
    if (processingTimeMs > 30000) { // Over 30 seconds for fast processor
      warnings.push(`Slow processing time: ${Math.round(processingTimeMs / 1000)}s. Document may be complex or contain many images.`);
    }

    // Content warnings
    if (markdown.length < 100) {
      warnings.push('Very short output detected. Document may be image-heavy or poorly formatted for text extraction.');
    }

    // Check for potential encoding issues
    if (markdown.includes('���') || markdown.includes('?')) {
      warnings.push('Potential encoding issues detected. Some characters may not have been converted correctly.');
    }

    // Structure warnings
    if (markdown.includes('|') && markdown.split('|').length < 6) {
      warnings.push('Tables detected but may not be well-formatted. OpenDocSG provides basic table extraction.');
    }

    // Content density warnings
    if (fileInput.sizeBytes > 1000000 && markdown.length < 500) {
      warnings.push('Large file with minimal text output. File may be image-heavy or contain complex layouts.');
    }

    // Processing efficiency warnings
    if (processingTimeMs > 20000 && fileInput.sizeBytes < 500000) {
      warnings.push('Unexpectedly slow processing for file size. Document may have complex structure.');
    }

    return warnings;
  }

  private countWords(text: string): number {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Update agent options for different processing modes
   */
  setProcessingMode(mode: 'fast' | 'balanced' | 'thorough'): void {
    switch (mode) {
      case 'fast':
        this.options = {
          enableDebugLogging: false,
          useCallbacks: false,
        };
        this.config.timeoutMs = 20000; // 20 seconds
        this.config.retryAttempts = 1;
        break;

      case 'balanced':
        this.options = {
          enableDebugLogging: false,
          useCallbacks: true,
        };
        this.config.timeoutMs = 45000; // 45 seconds
        this.config.retryAttempts = 2;
        break;

      case 'thorough':
        this.options = {
          enableDebugLogging: true,
          useCallbacks: true,
        };
        this.config.timeoutMs = 90000; // 90 seconds
        this.config.retryAttempts = 3;
        break;
    }
  }

  /**
   * Get current agent configuration and options
   */
  getConfiguration(): { config: AgentConfig; options: OpenDocSGOptions } {
    return {
      config: { ...this.config },
      options: { ...this.options },
    };
  }
}