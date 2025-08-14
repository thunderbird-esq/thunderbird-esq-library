import { ConversionResult, FileInput, AgentConfig } from '../../types/agent-interfaces';
import pRetry from 'p-retry';
// @ts-ignore - @opendocsg/pdf2md may not have perfect TypeScript definitions
import { pdf2md } from '@opendocsg/pdf2md';

interface OpenDocSGOptions {
  preserveFormatting?: boolean;
  extractImages?: boolean;
  maxTableWidth?: number;
  enableOCR?: boolean;
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
      preserveFormatting: options?.preserveFormatting ?? true,
      extractImages: options?.extractImages ?? true,
      maxTableWidth: options?.maxTableWidth ?? 120,
      enableOCR: options?.enableOCR ?? false, // Disabled by default for speed
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
        
        // Configure OpenDocSG options
        const conversionOptions: any = {
          preserveFormatting: this.options.preserveFormatting,
          extractImages: this.options.extractImages,
          maxTableWidth: this.options.maxTableWidth,
          enableOCR: this.options.enableOCR,
          // OpenDocSG specific optimizations
          fastMode: true, // Prioritize speed over detail
          cleanOutput: true, // Remove processing artifacts
        };

        // Perform the conversion
        pdf2md(buffer, conversionOptions)
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

    // Clean up OpenDocSG-specific artifacts
    processed = processed.replace(/\[OpenDocSG\]/g, ''); // Remove tool signatures
    
    // Fix table formatting issues common with OpenDocSG
    processed = processed.replace(/\|\s*-+\s*\|/g, '|---|'); // Standardize table separators
    processed = processed.replace(/\|\s{2,}/g, '| '); // Fix excessive spacing in tables
    
    // Optimize heading structures
    processed = processed.replace(/^(#{1,6})\s*(.+?)\s*#+\s*$/gm, '$1 $2'); // Remove trailing hashes
    
    // Clean up list formatting
    processed = processed.replace(/^\s*[-*+]\s*$/gm, ''); // Remove empty list items
    processed = processed.replace(/^(\s*)[-*+](\s+)/gm, '$1- '); // Standardize list markers
    
    // Fix paragraph spacing (OpenDocSG can be inconsistent)
    processed = processed.replace(/\n{3,}/g, '\n\n'); // Max 2 consecutive newlines
    processed = processed.replace(/([.!?])\n([A-Z])/g, '$1\n\n$2'); // Ensure paragraph breaks
    
    // Remove page artifacts
    processed = processed.replace(/^Page \d+.*$/gm, ''); // Remove page headers/footers
    processed = processed.replace(/^\d+\s*$/gm, ''); // Remove standalone page numbers
    
    // Fix broken links and references
    processed = processed.replace(/\[([^\]]+)\]\(\s*\)/g, '$1'); // Remove empty links
    processed = processed.replace(/\[\]\([^)]+\)/g, ''); // Remove empty link text

    return processed.trim();
  }

  private calculateConfidence(markdown: string, fileInput: FileInput, processingTimeMs: number): number {
    let confidence = 0.75; // Base confidence for OpenDocSG (fast, reliable for text-based PDFs)

    // Performance bonus - OpenDocSG is optimized for speed
    const expectedTimeMs = fileInput.sizeBytes / 5000; // ~0.2ms per KB (very fast baseline)
    if (processingTimeMs < expectedTimeMs * 2) {
      confidence += 0.1; // Significant bonus for fast processing
    }

    // Content quality assessment
    const wordCount = this.countWords(markdown);
    const hasGoodStructure = this.assessStructureQuality(markdown);
    const hasTablesOrLists = this.hasTablesOrLists(markdown);

    if (hasGoodStructure) {
      confidence += 0.05;
    }

    if (hasTablesOrLists && this.options.preserveFormatting) {
      confidence += 0.05; // Bonus for structured content
    }

    // Adjust based on file size vs content ratio
    const contentRatio = wordCount / (fileInput.sizeBytes / 1024); // Words per KB
    if (contentRatio > 5) { // Good text density
      confidence += 0.05;
    } else if (contentRatio < 1 && fileInput.sizeBytes > 100000) { // Poor text density in large file
      confidence -= 0.1;
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
    const hasProperParagraphs = markdown.split('\n\n').length >= 3;
    const hasLists = /^[\s]*[-*+]\s+.+$/m.test(markdown) || /^\d+\.\s+.+$/m.test(markdown);
    
    // Check for lack of artifacts
    const hasMinimalArtifacts = !(
      markdown.includes('���') || // Encoding issues
      markdown.includes('[object Object]') || // Conversion artifacts
      /\s{10,}/.test(markdown) // Excessive whitespace
    );

    return (hasHeaders || hasLists) && hasProperParagraphs && hasMinimalArtifacts;
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

    // Table/formatting warnings
    if (markdown.includes('|') && !this.options.preserveFormatting) {
      warnings.push('Tables detected but formatting preservation is disabled. Enable preserveFormatting for better table conversion.');
    }

    // OCR warnings
    if (!this.options.enableOCR && fileInput.sizeBytes > 1000000 && markdown.length < 500) {
      warnings.push('Large file with minimal text output. Consider enabling OCR for image-based PDFs.');
    }

    // Image warnings
    const imageCount = (markdown.match(/!\[.*?\]\(.*?\)/g) || []).length;
    if (imageCount === 0 && !this.options.extractImages && markdown.includes('image')) {
      warnings.push('Image references found but image extraction is disabled.');
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
          preserveFormatting: false,
          extractImages: false,
          maxTableWidth: 80,
          enableOCR: false,
        };
        this.config.timeoutMs = 30000; // 30 seconds
        break;

      case 'balanced':
        this.options = {
          preserveFormatting: true,
          extractImages: true,
          maxTableWidth: 120,
          enableOCR: false,
        };
        this.config.timeoutMs = 45000; // 45 seconds
        break;

      case 'thorough':
        this.options = {
          preserveFormatting: true,
          extractImages: true,
          maxTableWidth: 200,
          enableOCR: true,
        };
        this.config.timeoutMs = 90000; // 90 seconds
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