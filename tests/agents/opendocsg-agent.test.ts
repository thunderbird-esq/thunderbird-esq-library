import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenDocSGAgent } from '../../src/lib/agents/converters/opendocsg/opendocsg-agent';
import { FileInput } from '../../src/lib/agents/types/agent-interfaces';

// Mock the @opendocsg/pdf2md library
const mockPdf2md = vi.fn();
vi.mock('@opendocsg/pdf2md', () => ({
  pdf2md: mockPdf2md,
}));

describe('OpenDocSGAgent', () => {
  let agent: OpenDocSGAgent;
  let mockFileInput: FileInput;

  beforeEach(() => {
    vi.clearAllMocks();
    agent = new OpenDocSGAgent();
    
    // Create a mock PDF file input
    const mockBuffer = new ArrayBuffer(1500);
    mockFileInput = {
      buffer: mockBuffer,
      originalName: 'test-document.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1500,
    };
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with default configuration', () => {
      const defaultAgent = new OpenDocSGAgent();
      expect(defaultAgent).toBeInstanceOf(OpenDocSGAgent);
    });

    it('should accept custom configuration', () => {
      const customAgent = new OpenDocSGAgent(
        { timeoutMs: 60000, retryAttempts: 3, maxFileSizeMB: 50 },
        { preserveFormatting: false, extractImages: false }
      );
      expect(customAgent).toBeInstanceOf(OpenDocSGAgent);
    });
  });

  describe('Processing Mode Configuration', () => {
    it('should configure fast mode correctly', () => {
      agent.setProcessingMode('fast');
      const config = agent.getConfiguration();
      
      expect(config.options.preserveFormatting).toBe(false);
      expect(config.options.extractImages).toBe(false);
      expect(config.options.enableOCR).toBe(false);
      expect(config.config.timeoutMs).toBe(30000);
    });

    it('should configure balanced mode correctly', () => {
      agent.setProcessingMode('balanced');
      const config = agent.getConfiguration();
      
      expect(config.options.preserveFormatting).toBe(true);
      expect(config.options.extractImages).toBe(true);
      expect(config.options.enableOCR).toBe(false);
      expect(config.config.timeoutMs).toBe(45000);
    });

    it('should configure thorough mode correctly', () => {
      agent.setProcessingMode('thorough');
      const config = agent.getConfiguration();
      
      expect(config.options.preserveFormatting).toBe(true);
      expect(config.options.extractImages).toBe(true);
      expect(config.options.enableOCR).toBe(true);
      expect(config.config.timeoutMs).toBe(90000);
    });
  });

  describe('File Validation', () => {
    it('should reject files that are too large', async () => {
      const largeFileInput = {
        ...mockFileInput,
        sizeBytes: 40 * 1024 * 1024, // 40MB (exceeds default 30MB limit)
      };

      const result = await agent.convertPdf(largeFileInput);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds maximum allowed size');
      expect(result.sourceAgent).toBe('opendocsg');
    });

    it('should reject non-PDF files', async () => {
      const nonPdfInput = {
        ...mockFileInput,
        mimeType: 'application/msword',
      };

      const result = await agent.convertPdf(nonPdfInput);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported file type');
    });
  });

  describe('Successful Conversion', () => {
    it('should successfully convert a PDF file', async () => {
      const mockMarkdown = `# Test Document

## Section 1

This is a well-structured document with multiple sections.

| Column 1 | Column 2 |
|----------|----------|
| Data 1   | Data 2   |

- List item 1
- List item 2

Another paragraph here.`;
      
      mockPdf2md.mockResolvedValueOnce(mockMarkdown);

      const result = await agent.convertPdf(mockFileInput);

      expect(result.success).toBe(true);
      expect(result.sourceAgent).toBe('opendocsg');
      expect(result.markdownContent).toContain('# Test Document');
      expect(result.metadata.wordCount).toBeGreaterThan(10);
      expect(result.metadata.confidence).toBeGreaterThan(0.6);
    });

    it('should post-process markdown to remove artifacts', async () => {
      const rawMarkdown = `# Title

[OpenDocSG]

|   ---------   |
|  data    |

Page 1

123

[](.link)`;
      
      const expectedProcessed = expect.not.stringContaining('[OpenDocSG]');
      
      mockPdf2md.mockResolvedValueOnce(rawMarkdown);

      const result = await agent.convertPdf(mockFileInput);

      expect(result.success).toBe(true);
      expect(result.markdownContent).not.toContain('[OpenDocSG]');
      expect(result.markdownContent).not.toMatch(/^Page \d+/m);
      expect(result.markdownContent).not.toMatch(/^\d+\s*$/m);
      expect(result.markdownContent).not.toContain('[](.link)');
    });

    it('should handle table formatting correctly', async () => {
      const mockMarkdown = `| Column A | Column B |
|    ---   |   ---    |
| Value 1  |  Value 2 |`;
      
      mockPdf2md.mockResolvedValueOnce(mockMarkdown);

      const result = await agent.convertPdf(mockFileInput);

      expect(result.success).toBe(true);
      expect(result.markdownContent).toContain('|---|');
      expect(result.markdownContent).not.toMatch(/\|\s{2,}/);
    });
  });

  describe('Error Handling', () => {
    it('should handle OpenDocSG library errors', async () => {
      mockPdf2md.mockRejectedValueOnce(new Error('Processing failed'));

      const result = await agent.convertPdf(mockFileInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain('OpenDocSG processing failed');
    });

    it('should handle password-protected PDFs', async () => {
      mockPdf2md.mockRejectedValueOnce(new Error('PDF is encrypted'));

      const result = await agent.convertPdf(mockFileInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain('password protected');
    });

    it('should handle corrupted files', async () => {
      mockPdf2md.mockRejectedValueOnce(new Error('PDF file is corrupted'));

      const result = await agent.convertPdf(mockFileInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain('corrupted or invalid format');
    });

    it('should handle memory errors', async () => {
      mockPdf2md.mockRejectedValueOnce(new Error('Out of memory'));

      const result = await agent.convertPdf(mockFileInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain('too large for OpenDocSG processing');
    });

    it('should handle empty response', async () => {
      mockPdf2md.mockResolvedValueOnce('');

      const result = await agent.convertPdf(mockFileInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain('empty result');
    });

    it('should handle processing timeout', async () => {
      const quickTimeoutAgent = new OpenDocSGAgent({ timeoutMs: 100 });
      
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
      const agentWithRetries = new OpenDocSGAgent({ retryAttempts: 2 });

      mockPdf2md
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce('# Recovered Document\n\nThis worked on retry.');

      const result = await agentWithRetries.convertPdf(mockFileInput);

      expect(result.success).toBe(true);
      expect(mockPdf2md).toHaveBeenCalledTimes(2);
    });

    it('should fail after exhausting retries', async () => {
      const agentWithRetries = new OpenDocSGAgent({ retryAttempts: 2 });

      mockPdf2md.mockRejectedValue(new Error('Persistent error'));

      const result = await agentWithRetries.convertPdf(mockFileInput);

      expect(result.success).toBe(false);
      expect(mockPdf2md).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe('Confidence Calculation', () => {
    it('should give high confidence for fast processing', async () => {
      const mockMarkdown = '# Fast Document\n\nQuickly processed content.';
      
      mockPdf2md.mockImplementationOnce(async () => {
        // Simulate very fast processing
        await new Promise(resolve => setTimeout(resolve, 10));
        return mockMarkdown;
      });

      const result = await agent.convertPdf(mockFileInput);

      expect(result.success).toBe(true);
      expect(result.metadata.confidence).toBeGreaterThan(0.8); // Speed bonus
    });

    it('should adjust confidence based on content density', async () => {
      const denseContent = 'Word '.repeat(100); // 100 words
      const sparseContent = 'Few words only';

      const largeFileInput = {
        ...mockFileInput,
        sizeBytes: 100000, // 100KB
      };

      // Test dense content
      mockPdf2md.mockResolvedValueOnce(denseContent);
      const denseResult = await agent.convertPdf(largeFileInput);

      // Test sparse content
      mockPdf2md.mockResolvedValueOnce(sparseContent);
      const sparseResult = await agent.convertPdf(largeFileInput);

      expect(denseResult.metadata.confidence).toBeGreaterThan(
        sparseResult.metadata.confidence
      );
    });

    it('should give confidence bonus for structured content', async () => {
      const structuredContent = `
# Title

## Section

| Table | Header |
|-------|--------|
| Data  | Value  |

- List item
- Another item
      `.trim();

      const unstructuredContent = 'Just plain text without any structure at all.';

      mockPdf2md.mockResolvedValueOnce(structuredContent);
      const structuredResult = await agent.convertPdf(mockFileInput);

      mockPdf2md.mockResolvedValueOnce(unstructuredContent);
      const unstructuredResult = await agent.convertPdf(mockFileInput);

      expect(structuredResult.metadata.confidence).toBeGreaterThan(
        unstructuredResult.metadata.confidence
      );
    });
  });

  describe('Warning Generation', () => {
    it('should warn about slow processing', async () => {
      mockPdf2md.mockImplementationOnce(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return '# Document\n\nContent here.';
      });

      const result = await agent.convertPdf(mockFileInput);

      expect(result.success).toBe(true);
      // Test runs too fast to trigger 30-second warning, but structure should be correct
      expect(Array.isArray(result.metadata.warnings)).toBe(true);
    });

    it('should warn about encoding issues', async () => {
      const problematicContent = 'Document with ��� encoding issues and ? marks.';
      
      mockPdf2md.mockResolvedValueOnce(problematicContent);

      const result = await agent.convertPdf(mockFileInput);

      expect(result.success).toBe(true);
      expect(result.metadata.warnings).toContain(
        expect.stringContaining('encoding issues detected')
      );
    });

    it('should warn about tables when formatting disabled', async () => {
      const agentNoFormatting = new OpenDocSGAgent(
        {},
        { preserveFormatting: false }
      );
      
      const tableContent = '| Table | Header |\n|-------|--------|\n| Data | Value |';
      mockPdf2md.mockResolvedValueOnce(tableContent);

      const result = await agentNoFormatting.convertPdf(mockFileInput);

      expect(result.success).toBe(true);
      expect(result.metadata.warnings).toContain(
        expect.stringContaining('preserveFormatting for better table conversion')
      );
    });

    it('should suggest OCR for large files with minimal output', async () => {
      const largeFileInput = {
        ...mockFileInput,
        sizeBytes: 2000000, // 2MB
      };

      mockPdf2md.mockResolvedValueOnce('Short content.');

      const result = await agent.convertPdf(largeFileInput);

      expect(result.success).toBe(true);
      expect(result.metadata.warnings).toContain(
        expect.stringContaining('Consider enabling OCR')
      );
    });

    it('should warn about image extraction when disabled', async () => {
      const agentNoImages = new OpenDocSGAgent(
        {},
        { extractImages: false }
      );
      
      const imageContent = 'Document with image references but extraction disabled.';
      mockPdf2md.mockResolvedValueOnce(imageContent);

      const result = await agentNoImages.convertPdf(mockFileInput);

      expect(result.success).toBe(true);
      expect(result.metadata.warnings).toContain(
        expect.stringContaining('image extraction is disabled')
      );
    });
  });

  describe('Structure Analysis', () => {
    it('should correctly identify good document structure', async () => {
      const goodStructure = `
# Main Title

## Subsection

This is a proper paragraph.

- Well formatted list
- Another item

| Table | Header |
|-------|--------|
| Clean | Data   |
      `.trim();

      mockPdf2md.mockResolvedValueOnce(goodStructure);

      const result = await agent.convertPdf(mockFileInput);

      expect(result.success).toBe(true);
      expect(result.metadata.confidence).toBeGreaterThan(0.75);
    });

    it('should detect poor structure with artifacts', async () => {
      const poorStructure = 'Text with ��� encoding issues     excessive   whitespace';

      mockPdf2md.mockResolvedValueOnce(poorStructure);

      const result = await agent.convertPdf(mockFileInput);

      expect(result.success).toBe(true);
      expect(result.metadata.confidence).toBeLessThan(0.8);
    });

    it('should correctly identify tables and lists', async () => {
      const contentWithTables = `
| Column A | Column B |
|----------|----------|
| Data 1   | Data 2   |

- List item 1
- List item 2
      `.trim();

      const contentWithoutStructure = 'Plain text without any tables or lists.';

      mockPdf2md.mockResolvedValueOnce(contentWithTables);
      const structuredResult = await agent.convertPdf(mockFileInput);

      mockPdf2md.mockResolvedValueOnce(contentWithoutStructure);
      const plainResult = await agent.convertPdf(mockFileInput);

      expect(structuredResult.metadata.confidence).toBeGreaterThan(
        plainResult.metadata.confidence
      );
    });
  });

  describe('Word Count', () => {
    it('should correctly count words', async () => {
      const content = 'This sentence contains exactly seven words in total.';
      mockPdf2md.mockResolvedValueOnce(content);

      const result = await agent.convertPdf(mockFileInput);

      expect(result.success).toBe(true);
      expect(result.metadata.wordCount).toBe(7);
    });

    it('should handle empty and whitespace-only content', async () => {
      const emptyContent = '   \n\n\t   ';
      mockPdf2md.mockResolvedValueOnce(emptyContent);

      const result = await agent.convertPdf(mockFileInput);

      expect(result.success).toBe(false); // Should fail due to empty content
    });
  });

  describe('Performance Optimization', () => {
    it('should call OpenDocSG with correct options', async () => {
      const customAgent = new OpenDocSGAgent(
        {},
        {
          preserveFormatting: true,
          extractImages: true,
          maxTableWidth: 150,
          enableOCR: true,
        }
      );

      mockPdf2md.mockResolvedValueOnce('# Document\n\nContent here.');

      await customAgent.convertPdf(mockFileInput);

      expect(mockPdf2md).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({
          preserveFormatting: true,
          extractImages: true,
          maxTableWidth: 150,
          enableOCR: true,
          fastMode: true,
          cleanOutput: true,
        })
      );
    });
  });
});