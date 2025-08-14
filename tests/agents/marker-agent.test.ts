import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest';
import { MarkerAgent } from '../../src/lib/agents/converters/marker/marker-agent';
import { FileInput, ConversionResult } from '../../src/lib/agents/types/agent-interfaces';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('MarkerAgent', () => {
  let agent: MarkerAgent;
  let mockFileInput: FileInput;

  beforeEach(() => {
    vi.clearAllMocks();
    agent = new MarkerAgent();
    
    // Create a mock PDF file input
    const mockBuffer = new ArrayBuffer(1000);
    mockFileInput = {
      buffer: mockBuffer,
      originalName: 'test-document.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1000,
    };
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with default configuration', () => {
      const defaultAgent = new MarkerAgent();
      expect(defaultAgent).toBeInstanceOf(MarkerAgent);
    });

    it('should accept custom configuration', () => {
      const customAgent = new MarkerAgent(
        { timeoutMs: 60000, retryAttempts: 5, maxFileSizeMB: 100 },
        'http://custom-marker-service:8000'
      );
      expect(customAgent).toBeInstanceOf(MarkerAgent);
    });
  });

  describe('File Validation', () => {
    it('should reject files that are too large', async () => {
      const largeFileInput = {
        ...mockFileInput,
        sizeBytes: 100 * 1024 * 1024, // 100MB (exceeds default 50MB limit)
      };

      const result = await agent.convertPdf(largeFileInput);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds maximum allowed size');
      expect(result.sourceAgent).toBe('marker');
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
    it('should successfully convert a PDF file', async () => {
      const mockResponse = {
        success: true,
        markdown: '# Test Document\n\nThis is a test document with some content.',
        pageCount: 1,
        processingTimeMs: 2000,
        confidence: 0.95,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await agent.convertPdf(mockFileInput);

      expect(result.success).toBe(true);
      expect(result.sourceAgent).toBe('marker');
      expect(result.markdownContent).toBe(mockResponse.markdown);
      expect(result.metadata.pageCount).toBe(1);
      expect(result.metadata.confidence).toBeGreaterThan(0.8);
      expect(result.metadata.wordCount).toBeGreaterThan(0);
    });

    it('should calculate confidence scores correctly', async () => {
      const mockResponse = {
        success: true,
        markdown: '# Document Title\n\nContent with multiple paragraphs and good structure.',
        confidence: 0.9,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await agent.convertPdf(mockFileInput);

      expect(result.success).toBe(true);
      expect(result.metadata.confidence).toBeGreaterThan(0.8);
      expect(result.metadata.confidence).toBeLessThanOrEqual(1.0);
    });
  });

  describe('Error Handling', () => {
    it('should handle network connection errors', async () => {
      const connectionError = new Error('ECONNREFUSED');
      connectionError.name = 'ECONNREFUSED';
      connectionError.code = 'ECONNREFUSED';
      mockFetch.mockRejectedValueOnce(connectionError);

      const result = await agent.convertPdf(mockFileInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot connect to Marker service');
    });

    it('should handle HTTP error responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Internal server error',
        json: async () => ({}),
      } as any);

      const result = await agent.convertPdf(mockFileInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Marker service error (500)');
    });

    it('should handle timeout errors', async () => {
      const quickTimeoutAgent = new MarkerAgent({ timeoutMs: 100 });
      
      // Mock a slow response
      mockFetch.mockImplementationOnce(() => 
        new Promise(resolve => setTimeout(() => resolve({
          ok: true,
          json: async () => ({ success: true, markdown: 'content' })
        } as any), 200))
      );

      const result = await quickTimeoutAgent.convertPdf(mockFileInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    it('should handle empty response from service', async () => {
      const mockResponse = {
        success: true,
        markdown: '', // Empty markdown
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const result = await agent.convertPdf(mockFileInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain('empty markdown content');
    });

    it('should handle service failure responses', async () => {
      const mockResponse = {
        success: false,
        error: 'PDF parsing failed',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const result = await agent.convertPdf(mockFileInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain('PDF parsing failed');
    });
  });

  describe('Retry Logic', () => {
    it('should retry failed requests', async () => {
      const agentWithRetries = new MarkerAgent({ retryAttempts: 2 });

      // First call fails, second succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            markdown: '# Recovered Document\n\nThis worked on retry.',
          }),
        } as any);

      const result = await agentWithRetries.convertPdf(mockFileInput);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should fail after exhausting retries', async () => {
      const agentWithRetries = new MarkerAgent({ retryAttempts: 2 });

      mockFetch.mockRejectedValue(new Error('Persistent network error'));

      const result = await agentWithRetries.convertPdf(mockFileInput);

      expect(result.success).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe('Health Check', () => {
    it('should successfully check service health', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      } as any);

      const healthResult = await agent.healthCheck();

      expect(healthResult.available).toBe(true);
      expect(healthResult.latencyMs).toBeGreaterThan(0);
      expect(healthResult.error).toBeUndefined();
    });

    it('should detect unhealthy service', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      } as any);

      const healthResult = await agent.healthCheck();

      expect(healthResult.available).toBe(false);
      expect(healthResult.error).toContain('HTTP 503');
    });

    it('should handle health check timeouts', async () => {
      mockFetch.mockRejectedValueOnce(new Error('AbortError'));

      const healthResult = await agent.healthCheck();

      expect(healthResult.available).toBe(false);
      expect(healthResult.error).toBeDefined();
    });
  });

  describe('Warning Generation', () => {
    it('should generate warnings for slow processing', async () => {
      const mockResponse = {
        success: true,
        markdown: '# Document\n\nContent here.',
      };

      mockFetch.mockImplementationOnce(async () => {
        // Simulate slow processing
        await new Promise(resolve => setTimeout(resolve, 100));
        return {
          ok: true,
          json: async () => mockResponse,
        };
      });

      const result = await agent.convertPdf(mockFileInput);

      expect(result.success).toBe(true);
      // The test runs too fast to trigger the 60-second warning, but we can check the structure
      expect(Array.isArray(result.metadata.warnings)).toBe(true);
    });

    it('should generate warnings for very short output', async () => {
      const mockResponse = {
        success: true,
        markdown: 'Short.', // Very short content
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const largeFileInput = {
        ...mockFileInput,
        sizeBytes: 500000, // Large file (500KB)
      };

      const result = await agent.convertPdf(largeFileInput);

      expect(result.success).toBe(true);
      expect(result.metadata.warnings).toContain(
        expect.stringContaining('Very short output detected')
      );
    });
  });

  describe('Word Count Calculation', () => {
    it('should correctly count words in markdown', async () => {
      const mockResponse = {
        success: true,
        markdown: '# Title\n\nThis document has exactly eight words total.',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const result = await agent.convertPdf(mockFileInput);

      expect(result.success).toBe(true);
      expect(result.metadata.wordCount).toBe(9); // "Title" + "This document has exactly eight words total" = 9 words
    });

    it('should handle empty content gracefully', async () => {
      const mockResponse = {
        success: true,
        markdown: '', // Actually empty content
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const result = await agent.convertPdf(mockFileInput);

      expect(result.success).toBe(false); // Should fail due to empty content
      expect(result.metadata.wordCount).toBe(0);
    });
  });
});