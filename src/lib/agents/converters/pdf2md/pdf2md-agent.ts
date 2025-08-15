import { ConversionResult, FileInput, AgentConfig } from '../../types/agent-interfaces';
import pRetry from 'p-retry';
import { parsePdf } from 'pdf2md-js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Local interfaces matching pdf2md-js types (not exported by the library)
interface PDF2MDParseOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  openAiApicompatible?: boolean;
  outputDir?: string;
  prompt?: string;
  textPrompt?: string;
  verbose?: boolean;
  scale?: number;
  concurrency?: number;
  onProgress?: (progress: { current: number; total: number; taskStatus: 'starting' | 'running' | 'finished' }) => void;
}

interface PDF2MDParseResult {
  content: string;
  mdFilePath: string;
}

interface PDF2MDOptions {
  enableVision?: boolean;
  openaiApiKey?: string;
  imageQuality?: 'low' | 'medium' | 'high';
  preserveImages?: boolean;
  timeout?: number;
  model?: string;
  baseUrl?: string;
  outputDir?: string;
  verbose?: boolean;
  scale?: number;
  concurrency?: number;
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
      model: options?.model ?? 'gpt-4-vision-preview',
      baseUrl: options?.baseUrl,
      outputDir: options?.outputDir,
      verbose: options?.verbose ?? false,
      scale: options?.scale ?? 2,
      concurrency: options?.concurrency ?? 4,
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
    let tempFilePath: string | null = null;

    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        // Clean up temp file on timeout
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          try {
            fs.unlinkSync(tempFilePath);
          } catch (cleanupError) {
            console.warn('Failed to clean up temp file on timeout:', cleanupError);
          }
        }
        reject(new Error(`PDF2MD processing timeout after ${this.config.timeoutMs}ms`));
      }, this.config.timeoutMs);

      try {
        // Create a temporary file from the buffer
        const buffer = Buffer.from(fileInput.buffer);
        const tempDir = os.tmpdir();
        const tempFileName = `pdf2md_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.pdf`;
        tempFilePath = path.join(tempDir, tempFileName);

        // Write buffer to temporary file
        await fs.promises.writeFile(tempFilePath, buffer);

        // Configure pdf2md options based on agent settings
        const parseOptions: PDF2MDParseOptions = {
          verbose: this.options.verbose,
          scale: this.options.scale,
          concurrency: this.options.concurrency,
        };

        // Enable vision processing if configured and API key is available
        if (this.options.enableVision && this.options.openaiApiKey) {
          parseOptions.apiKey = this.options.openaiApiKey;
          parseOptions.model = this.options.model;
          if (this.options.baseUrl) {
            parseOptions.baseUrl = this.options.baseUrl;
          }
        }

        // Set output directory if specified
        if (this.options.outputDir) {
          parseOptions.outputDir = this.options.outputDir;
        }

        // Perform the conversion using parsePdf
        const result: PDF2MDParseResult = await parsePdf(tempFilePath, parseOptions);
        
        clearTimeout(timeoutId);
        
        // Clean up the temporary file
        try {
          if (fs.existsSync(tempFilePath)) {
            await fs.promises.unlink(tempFilePath);
          }
        } catch (cleanupError) {
          console.warn('Failed to clean up temp file:', cleanupError);
        }

        if (!result.content || result.content.trim().length === 0) {
          reject(new Error('PDF2MD returned empty result'));
          return;
        }

        // Clean up the markdown output
        const cleanedMarkdown = this.postProcessMarkdown(result.content);
        resolve(cleanedMarkdown);

      } catch (error) {
        clearTimeout(timeoutId);
        
        // Clean up temp file on error
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          try {
            await fs.promises.unlink(tempFilePath);
          } catch (cleanupError) {
            console.warn('Failed to clean up temp file on error:', cleanupError);
          }
        }
        
        // Handle common pdf2md-js errors
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (errorMessage.includes('password')) {
          reject(new Error('PDF is password protected and cannot be processed'));
        } else if (errorMessage.includes('corrupt')) {
          reject(new Error('PDF file appears to be corrupted'));
        } else if (errorMessage.includes('API') && errorMessage.includes('key')) {
          reject(new Error('Vision processing failed: Invalid or missing OpenAI API key'));
        } else if (errorMessage.includes('ENOENT')) {
          reject(new Error('PDF file could not be accessed - temporary file creation failed'));
        } else {
          reject(new Error(`PDF2MD processing failed: ${errorMessage}`));
        }
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
  setVisionProcessing(enabled: boolean, apiKey?: string, model?: string): void {
    this.options.enableVision = enabled;
    if (apiKey) {
      this.options.openaiApiKey = apiKey;
    }
    if (model) {
      this.options.model = model;
    }
  }

  /**
   * Set the OpenAI model and base URL for vision processing
   */
  setModelConfiguration(model: string, baseUrl?: string): void {
    this.options.model = model;
    if (baseUrl) {
      this.options.baseUrl = baseUrl;
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