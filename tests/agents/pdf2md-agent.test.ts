import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PDF2MDAgent } from '../../src/lib/agents/converters/pdf2md/pdf2md-agent';
import { FileInput } from '../../src/lib/agents/types/agent-interfaces';

// Mock the pdf2md-js library
vi.mock('pdf2md-js', () => ({
  pdf2md: vi.fn(),
}));

import { pdf2md } from 'pdf2md-js';
const mockPdf2md = vi.mocked(pdf2md);

describe('PDF2MDAgent', () => {
  let agent: PDF2MDAgent;
  let mockFileInput: FileInput;

  beforeEach(() => {
    vi.clearAllMocks();
    agent = new PDF2MDAgent();
    
    // Create a mock PDF file input
    const mockBuffer = new ArrayBuffer(2000);
    mockFileInput = {
      buffer: mockBuffer,
      originalName: 'test-document.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2000,
    };

    // Set up environment variable mock
    process.env.OPENAI_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with default configuration', () => {
      const defaultAgent = new PDF2MDAgent();
      expect(defaultAgent).toBeInstanceOf(PDF2MDAgent);
    });

    it('should accept custom configuration', () => {
      const customAgent = new PDF2MDAgent(
        { timeoutMs: 120000, retryAttempts: 3, maxFileSizeMB: 50 },
        { enableVision: true, imageQuality: 'high' }
      );
      expect(customAgent).toBeInstanceOf(PDF2MDAgent);
    });

    it('should configure vision processing correctly', () => {
      const visionAgent = new PDF2MDAgent(
        {},
        { enableVision: true, openaiApiKey: 'custom-key' }
      );
      
      const config = visionAgent.getConfiguration();
      expect(config.options.enableVision).toBe(true);
      expect(config.options.openaiApiKey).toBe('custom-key');
    });
  });

  describe('File Validation', () => {
    it('should reject files that are too large', async () => {
      const largeFileInput = {
        ...mockFileInput,
        sizeBytes: 50 * 1024 * 1024, // 50MB (exceeds default 25MB limit)
      };

      const result = await agent.convertPdf(largeFileInput);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds maximum allowed size');
      expect(result.sourceAgent).toBe('pdf2md');
    });

    it('should reject non-PDF files', async () => {
      const nonPdfInput = {
        ...mockFileInput,
        mimeType: 'text/plain',
      };

      const result = await agent.convertPdf(nonPdfInput);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported file type');
    });
  });

  describe('Successful Conversion', () => {
    it('should successfully convert a PDF file without vision', async () => {
      const mockMarkdown = '# Test Document\n\nThis is a test document with multiple paragraphs.\n\nAnother paragraph here.';
      
      mockPdf2md.mockResolvedValueOnce(mockMarkdown);

      const result = await agent.convertPdf(mockFileInput);

      expect(result.success).toBe(true);
      expect(result.sourceAgent).toBe('pdf2md');
      expect(result.markdownContent).toBe(mockMarkdown);
      expect(result.metadata.wordCount).toBeGreaterThan(0);
      expect(result.metadata.confidence).toBeGreaterThan(0.5);
    });

    it('should successfully convert with vision processing enabled', async () => {
      const visionAgent = new PDF2MDAgent(
        {},
        { enableVision: true, openaiApiKey: 'test-key' }
      );
      
      const mockMarkdown = '# Vision-Enhanced Document\n\nThis document had images processed with AI vision.';
      mockPdf2md.mockResolvedValueOnce(mockMarkdown);

      const result = await visionAgent.convertPdf(mockFileInput);

      expect(result.success).toBe(true);
      expect(result.metadata.confidence).toBeGreaterThan(0.8); // Higher confidence with vision
      expect(mockPdf2md).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({
          vision: expect.objectContaining({
            enabled: true,
            apiKey: 'test-key',
          }),
        })
      );
    });

    it('should post-process markdown correctly', async () => {
      const rawMarkdown = '# Title\n\n\n\n\nExcessive whitespace\n\n\n\nAnother paragraph    123';
      const expectedClean = '# Title\n\n\nExcessive whitespace\n\n\nAnother paragraph';
      
      mockPdf2md.mockResolvedValueOnce(rawMarkdown);

      const result = await agent.convertPdf(mockFileInput);

      expect(result.success).toBe(true);
      expect(result.markdownContent).not.toContain('\n\n\n\n');
      expect(result.markdownContent).not.toMatch(/\s+\d+\s*$/);
    });
  });

  describe('Error Handling', () => {
    it('should handle PDF2MD library errors', async () => {
      mockPdf2md.mockRejectedValueOnce(new Error('PDF parsing failed'));

      const result = await agent.convertPdf(mockFileInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain('PDF2MD processing failed');
    });

    it('should handle password-protected PDFs', async () => {
      mockPdf2md.mockRejectedValueOnce(new Error('PDF is password protected'));

      const result = await agent.convertPdf(mockFileInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain('password protected');
    });

    it('should handle corrupted PDFs', async () => {
      mockPdf2md.mockRejectedValueOnce(new Error('PDF file is corrupt'));

      const result = await agent.convertPdf(mockFileInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain('corrupted');
    });

    it('should handle vision API errors', async () => {
      const visionAgent = new PDF2MDAgent(
        {},
        { enableVision: true, openaiApiKey: 'invalid-key' }
      );
      
      mockPdf2md.mockRejectedValueOnce(new Error('Vision processing failed: Invalid API key'));

      const result = await visionAgent.convertPdf(mockFileInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid or missing OpenAI API key');
    });

    it('should handle empty response', async () => {
      mockPdf2md.mockResolvedValueOnce('');

      const result = await agent.convertPdf(mockFileInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain('empty result');
    });

    it('should handle processing timeout', async () => {
      const quickTimeoutAgent = new PDF2MDAgent({ timeoutMs: 100 });
      
      mockPdf2md.mockImplementationOnce(() => 
        new Promise(resolve => setTimeout(() => resolve('# Document'), 200))
      );

      const result = await quickTimeoutAgent.convertPdf(mockFileInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });
  });

  describe('Retry Logic', () => {
    it('should retry failed conversions', async () => {
      const agentWithRetries = new PDF2MDAgent({ retryAttempts: 2 });

      mockPdf2md
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce('# Recovered Document\n\nThis worked on retry.');

      const result = await agentWithRetries.convertPdf(mockFileInput);

      expect(result.success).toBe(true);
      expect(mockPdf2md).toHaveBeenCalledTimes(2);
    });

    it('should fail after exhausting retries', async () => {
      const agentWithRetries = new PDF2MDAgent({ retryAttempts: 2 });

      mockPdf2md.mockRejectedValue(new Error('Persistent error'));

      const result = await agentWithRetries.convertPdf(mockFileInput);

      expect(result.success).toBe(false);
      expect(mockPdf2md).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe('Confidence Calculation', () => {
    it('should calculate higher confidence with vision enabled', async () => {
      const normalAgent = new PDF2MDAgent();
      const visionAgent = new PDF2MDAgent({}, { enableVision: true });

      const mockMarkdown = '# Document\n\nGood structured content with multiple paragraphs.';
      
      mockPdf2md.mockResolvedValue(mockMarkdown);

      const normalResult = await normalAgent.convertPdf(mockFileInput);
      const visionResult = await visionAgent.convertPdf(mockFileInput);

      expect(visionResult.metadata.confidence).toBeGreaterThan(
        normalResult.metadata.confidence
      );
    });

    it('should adjust confidence based on content quality', async () => {
      const goodContent = '# Well Structured Document\n\n## Section 1\n\nGood paragraph content.\n\n- List item 1\n- List item 2';
      const poorContent = 'no structure just text';

      mockPdf2md.mockResolvedValueOnce(goodContent);
      const goodResult = await agent.convertPdf(mockFileInput);

      mockPdf2md.mockResolvedValueOnce(poorContent);
      const poorResult = await agent.convertPdf(mockFileInput);

      expect(goodResult.metadata.confidence).toBeGreaterThan(
        poorResult.metadata.confidence
      );
    });

    it('should penalize short content from large files', async () => {
      const largeFileInput = {
        ...mockFileInput,
        sizeBytes: 500000, // 500KB
      };

      mockPdf2md.mockResolvedValueOnce('Short content.'); // Very short for large file

      const result = await agent.convertPdf(largeFileInput);

      expect(result.success).toBe(true);
      expect(result.metadata.confidence).toBeLessThan(0.6);
    });
  });

  describe('Warning Generation', () => {
    it('should warn about vision processing without API key', async () => {
      delete process.env.OPENAI_API_KEY;
      
      const visionAgent = new PDF2MDAgent({}, { enableVision: true });
      mockPdf2md.mockResolvedValueOnce('# Document\n\nContent here.');

      const result = await visionAgent.convertPdf(mockFileInput);

      expect(result.success).toBe(true);
      expect(result.metadata.warnings).toContain(
        expect.stringContaining('no OpenAI API key provided')
      );
    });

    it('should warn about large files without vision processing', async () => {
      const largeFileInput = {
        ...mockFileInput,
        sizeBytes: 1000000, // 1MB
      };

      mockPdf2md.mockResolvedValueOnce('# Document\n\nMinimal content.');

      const result = await agent.convertPdf(largeFileInput);

      expect(result.success).toBe(true);
      expect(result.metadata.warnings).toContain(
        expect.stringContaining('require vision processing')
      );
    });

    it('should warn about very short output', async () => {
      mockPdf2md.mockResolvedValueOnce('Short.');

      const result = await agent.convertPdf(mockFileInput);

      expect(result.success).toBe(true);
      expect(result.metadata.warnings).toContain(
        expect.stringContaining('Very short output detected')
      );
    });
  });

  describe('Vision Processing Configuration', () => {
    it('should enable vision processing dynamically', () => {
      agent.setVisionProcessing(true, 'new-api-key');
      
      const config = agent.getConfiguration();
      expect(config.options.enableVision).toBe(true);
      expect(config.options.openaiApiKey).toBe('new-api-key');
    });

    it('should disable vision processing', () => {
      const visionAgent = new PDF2MDAgent({}, { enableVision: true });
      visionAgent.setVisionProcessing(false);
      
      const config = visionAgent.getConfiguration();
      expect(config.options.enableVision).toBe(false);
    });
  });

  describe('Word Count and Structure Analysis', () => {
    it('should correctly count words', async () => {
      const content = 'This sentence has exactly six words total.';
      mockPdf2md.mockResolvedValueOnce(content);

      const result = await agent.convertPdf(mockFileInput);

      expect(result.success).toBe(true);
      expect(result.metadata.wordCount).toBe(6);
    });

    it('should detect good document structure', async () => {
      const structuredContent = `
# Main Title

## Section Header

This is a paragraph with good structure.

- List item one
- List item two

Another paragraph here.
      `.trim();

      mockPdf2md.mockResolvedValueOnce(structuredContent);

      const result = await agent.convertPdf(mockFileInput);

      expect(result.success).toBe(true);
      // Structured content should get confidence bonus
      expect(result.metadata.confidence).toBeGreaterThan(0.7);
    });
  });
});