import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MarkerAgent } from '../../src/lib/agents/converters/marker/marker-agent';
import { PDF2MDAgent } from '../../src/lib/agents/converters/pdf2md/pdf2md-agent';
import { OpenDocSGAgent } from '../../src/lib/agents/converters/opendocsg/opendocsg-agent';
import { 
  AGENT_TYPES, 
  isValidAgentType, 
  getAgentDisplayName,
  AgentError,
  AgentTimeoutError,
  AgentValidationError,
  AgentProcessingError 
} from '../../src/lib/agents/converters';
import { FileInput, ConversionResult } from '../../src/lib/agents/types/agent-interfaces';

// Mock external dependencies
const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock('pdf2md-js', () => ({
  pdf2md: vi.fn(),
}));

const mockOpenDocSGPdf2md = vi.fn();
vi.mock('@opendocsg/pdf2md', () => ({
  pdf2md: mockOpenDocSGPdf2md,
}));

import { pdf2md as mockPdf2mdJs } from 'pdf2md-js';
const mockPdf2mdJsTyped = vi.mocked(mockPdf2mdJs);

describe('Multi-Agent Integration Tests', () => {
  let mockFileInput: FileInput;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create a realistic mock PDF file input
    const mockBuffer = new ArrayBuffer(50000); // 50KB test file
    mockFileInput = {
      buffer: mockBuffer,
      originalName: 'integration-test.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 50000,
    };

    // Set up default successful responses for all agents
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        markdown: '# Marker Result\n\nThis is content from Marker agent.',
        pageCount: 2,
        confidence: 0.9,
      }),
    });

    mockPdf2mdJsTyped.mockResolvedValue(
      '# PDF2MD Result\n\nThis is content from PDF2MD agent with vision processing.'
    );

    mockOpenDocSGPdf2md.mockResolvedValue(
      '# OpenDocSG Result\n\nThis is content from OpenDocSG agent optimized for speed.'
    );
  });

  describe('Agent Type Utilities', () => {
    it('should validate agent types correctly', () => {
      expect(isValidAgentType('marker')).toBe(true);
      expect(isValidAgentType('pdf2md')).toBe(true);
      expect(isValidAgentType('opendocsg')).toBe(true);
      expect(isValidAgentType('invalid')).toBe(false);
      expect(isValidAgentType('')).toBe(false);
    });

    it('should provide correct display names', () => {
      expect(getAgentDisplayName('marker')).toBe('Marker (High-Quality OCR)');
      expect(getAgentDisplayName('pdf2md')).toBe('PDF2MD (Vision-Enhanced)');
      expect(getAgentDisplayName('opendocsg')).toBe('OpenDocSG (High-Speed)');
    });

    it('should include all expected agent types', () => {
      expect(AGENT_TYPES).toEqual(['marker', 'pdf2md', 'opendocsg']);
    });
  });

  describe('Cross-Agent Comparison', () => {
    it('should process the same file with all three agents successfully', async () => {
      const markerAgent = new MarkerAgent();
      const pdf2mdAgent = new PDF2MDAgent();
      const openDocSGAgent = new OpenDocSGAgent();

      const [markerResult, pdf2mdResult, openDocSGResult] = await Promise.all([
        markerAgent.convertPdf(mockFileInput),
        pdf2mdAgent.convertPdf(mockFileInput),
        openDocSGAgent.convertPdf(mockFileInput),
      ]);

      // All agents should succeed
      expect(markerResult.success).toBe(true);
      expect(pdf2mdResult.success).toBe(true);
      expect(openDocSGResult.success).toBe(true);

      // Each should have unique content reflecting their agent
      expect(markerResult.markdownContent).toContain('Marker');
      expect(pdf2mdResult.markdownContent).toContain('PDF2MD');
      expect(openDocSGResult.markdownContent).toContain('OpenDocSG');

      // All should have proper metadata
      expect(markerResult.metadata.processingTimeMs).toBeGreaterThan(0);
      expect(pdf2mdResult.metadata.processingTimeMs).toBeGreaterThan(0);
      expect(openDocSGResult.metadata.processingTimeMs).toBeGreaterThan(0);

      expect(markerResult.metadata.wordCount).toBeGreaterThan(0);
      expect(pdf2mdResult.metadata.wordCount).toBeGreaterThan(0);
      expect(openDocSGResult.metadata.wordCount).toBeGreaterThan(0);
    });

    it('should handle file size limits consistently', async () => {
      const tooLargeInput = {
        ...mockFileInput,
        sizeBytes: 100 * 1024 * 1024, // 100MB - exceeds all default limits
      };

      const markerAgent = new MarkerAgent();
      const pdf2mdAgent = new PDF2MDAgent();
      const openDocSGAgent = new OpenDocSGAgent();

      const [markerResult, pdf2mdResult, openDocSGResult] = await Promise.all([
        markerAgent.convertPdf(tooLargeInput),
        pdf2mdAgent.convertPdf(tooLargeInput),
        openDocSGAgent.convertPdf(tooLargeInput),
      ]);

      // All should fail due to size limits
      expect(markerResult.success).toBe(false);
      expect(pdf2mdResult.success).toBe(false);
      expect(openDocSGResult.success).toBe(false);

      // All should have similar error messages
      expect(markerResult.error).toContain('exceeds maximum allowed size');
      expect(pdf2mdResult.error).toContain('exceeds maximum allowed size');
      expect(openDocSGResult.error).toContain('exceeds maximum allowed size');
    });

    it('should reject non-PDF files consistently', async () => {
      const nonPdfInput = {
        ...mockFileInput,
        mimeType: 'text/plain',
        originalName: 'document.txt',
      };

      const markerAgent = new MarkerAgent();
      const pdf2mdAgent = new PDF2MDAgent();
      const openDocSGAgent = new OpenDocSGAgent();

      const [markerResult, pdf2mdResult, openDocSGResult] = await Promise.all([
        markerAgent.convertPdf(nonPdfInput),
        pdf2mdAgent.convertPdf(nonPdfInput),
        openDocSGAgent.convertPdf(nonPdfInput),
      ]);

      expect(markerResult.success).toBe(false);
      expect(pdf2mdResult.success).toBe(false);
      expect(openDocSGResult.success).toBe(false);

      expect(markerResult.error).toContain('Unsupported file type');
      expect(pdf2mdResult.error).toContain('Unsupported file type');
      expect(openDocSGResult.error).toContain('Unsupported file type');
    });
  });

  describe('Performance Characteristics', () => {
    it('should have different confidence scoring patterns', async () => {
      // Marker should have high base confidence (OCR specialist)
      const markerAgent = new MarkerAgent();
      
      // PDF2MD with vision should have highest confidence
      const pdf2mdAgent = new PDF2MDAgent({}, { enableVision: true });
      
      // OpenDocSG should be fast but moderate confidence
      const openDocSGAgent = new OpenDocSGAgent();

      const [markerResult, pdf2mdResult, openDocSGResult] = await Promise.all([
        markerAgent.convertPdf(mockFileInput),
        pdf2mdAgent.convertPdf(mockFileInput),
        openDocSGAgent.convertPdf(mockFileInput),
      ]);

      expect(markerResult.success).toBe(true);
      expect(pdf2mdResult.success).toBe(true);
      expect(openDocSGResult.success).toBe(true);

      // PDF2MD with vision should have highest confidence
      expect(pdf2mdResult.metadata.confidence).toBeGreaterThan(0.8);
      
      // Marker should have high confidence for OCR
      expect(markerResult.metadata.confidence).toBeGreaterThan(0.8);
      
      // All should have reasonable confidence
      expect(openDocSGResult.metadata.confidence).toBeGreaterThan(0.7);
    });

    it('should have appropriate timeout configurations', () => {
      const markerAgent = new MarkerAgent();
      const pdf2mdAgent = new PDF2MDAgent();
      const openDocSGAgent = new OpenDocSGAgent();

      // We can't directly test private config, but we can test behavior
      // by creating agents with known configurations
      const fastMarker = new MarkerAgent({ timeoutMs: 30000 });
      const slowPdf2md = new PDF2MDAgent({ timeoutMs: 120000 });
      const quickOpenDocSG = new OpenDocSGAgent({ timeoutMs: 30000 });

      expect(fastMarker).toBeInstanceOf(MarkerAgent);
      expect(slowPdf2md).toBeInstanceOf(PDF2MDAgent);
      expect(quickOpenDocSG).toBeInstanceOf(OpenDocSGAgent);
    });
  });

  describe('Error Handling Integration', () => {
    it('should properly classify agent errors', () => {
      const timeoutError = new AgentTimeoutError('marker', 30000);
      const validationError = new AgentValidationError('pdf2md', 'Invalid file');
      const processingError = new AgentProcessingError('opendocsg', 'Processing failed');
      const genericError = new AgentError('Generic error', 'marker', 'GENERIC', true);

      expect(timeoutError).toBeInstanceOf(AgentError);
      expect(timeoutError.agent).toBe('marker');
      expect(timeoutError.code).toBe('TIMEOUT');
      expect(timeoutError.recoverable).toBe(true);

      expect(validationError).toBeInstanceOf(AgentError);
      expect(validationError.agent).toBe('pdf2md');
      expect(validationError.code).toBe('VALIDATION');
      expect(validationError.recoverable).toBe(false);

      expect(processingError).toBeInstanceOf(AgentError);
      expect(processingError.agent).toBe('opendocsg');
      expect(processingError.code).toBe('PROCESSING');
      expect(processingError.recoverable).toBe(true);

      expect(genericError.agent).toBe('marker');
      expect(genericError.recoverable).toBe(true);
    });

    it('should handle cascading failures gracefully', async () => {
      // Simulate scenario where external services are down
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
      mockPdf2mdJsTyped.mockRejectedValue(new Error('PDF parsing failed'));
      mockOpenDocSGPdf2md.mockRejectedValue(new Error('Service unavailable'));

      const markerAgent = new MarkerAgent({ retryAttempts: 1 });
      const pdf2mdAgent = new PDF2MDAgent({ retryAttempts: 1 });
      const openDocSGAgent = new OpenDocSGAgent({ retryAttempts: 1 });

      const [markerResult, pdf2mdResult, openDocSGResult] = await Promise.all([
        markerAgent.convertPdf(mockFileInput),
        pdf2mdAgent.convertPdf(mockFileInput),
        openDocSGAgent.convertPdf(mockFileInput),
      ]);

      // All should fail but with appropriate error messages
      expect(markerResult.success).toBe(false);
      expect(pdf2mdResult.success).toBe(false);
      expect(openDocSGResult.success).toBe(false);

      expect(markerResult.error).toContain('Cannot connect to Marker service');
      expect(pdf2mdResult.error).toContain('PDF2MD processing failed');
      expect(openDocSGResult.error).toContain('OpenDocSG processing failed');

      // All should have recorded processing time
      expect(markerResult.metadata.processingTimeMs).toBeGreaterThan(0);
      expect(pdf2mdResult.metadata.processingTimeMs).toBeGreaterThan(0);
      expect(openDocSGResult.metadata.processingTimeMs).toBeGreaterThan(0);
    });
  });

  describe('Agent Configuration Compatibility', () => {
    it('should allow custom configurations for all agents', () => {
      const customConfig = {
        timeoutMs: 60000,
        retryAttempts: 5,
        maxFileSizeMB: 100,
      };

      const markerAgent = new MarkerAgent(customConfig, 'http://custom-marker:8000');
      const pdf2mdAgent = new PDF2MDAgent(customConfig, { enableVision: true });
      const openDocSGAgent = new OpenDocSGAgent(customConfig, { preserveFormatting: true });

      expect(markerAgent).toBeInstanceOf(MarkerAgent);
      expect(pdf2mdAgent).toBeInstanceOf(PDF2MDAgent);
      expect(openDocSGAgent).toBeInstanceOf(OpenDocSGAgent);

      // Test that custom configurations are applied
      const pdf2mdConfig = pdf2mdAgent.getConfiguration();
      expect(pdf2mdConfig.options.enableVision).toBe(true);

      const openDocSGConfig = openDocSGAgent.getConfiguration();
      expect(openDocSGConfig.options.preserveFormatting).toBe(true);
    });

    it('should handle different processing modes for OpenDocSG', () => {
      const fastAgent = new OpenDocSGAgent();
      const balancedAgent = new OpenDocSGAgent();
      const thoroughAgent = new OpenDocSGAgent();

      fastAgent.setProcessingMode('fast');
      balancedAgent.setProcessingMode('balanced');
      thoroughAgent.setProcessingMode('thorough');

      const fastConfig = fastAgent.getConfiguration();
      const balancedConfig = balancedAgent.getConfiguration();
      const thoroughConfig = thoroughAgent.getConfiguration();

      expect(fastConfig.options.enableOCR).toBe(false);
      expect(balancedConfig.options.enableOCR).toBe(false);
      expect(thoroughConfig.options.enableOCR).toBe(true);

      expect(fastConfig.config.timeoutMs).toBeLessThan(balancedConfig.config.timeoutMs);
      expect(balancedConfig.config.timeoutMs).toBeLessThan(thoroughConfig.config.timeoutMs);
    });
  });

  describe('Marker Health Check Integration', () => {
    it('should check Marker service health independently', async () => {
      // Mock healthy service
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      const markerAgent = new MarkerAgent();
      const healthResult = await markerAgent.healthCheck();

      expect(healthResult.available).toBe(true);
      expect(healthResult.latencyMs).toBeGreaterThan(0);
      expect(healthResult.error).toBeUndefined();
    });

    it('should detect unhealthy Marker service', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      const markerAgent = new MarkerAgent();
      const healthResult = await markerAgent.healthCheck();

      expect(healthResult.available).toBe(false);
      expect(healthResult.error).toContain('HTTP 503');
    });
  });

  describe('Content Quality Comparison', () => {
    it('should produce different results for the same input', async () => {
      // Set up different outputs for each agent
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          markdown: '# Marker Output\n\nHigh-quality OCR with excellent accuracy.',
        }),
      });

      mockPdf2mdJsTyped.mockResolvedValue(
        '# PDF2MD Output\n\nVision-enhanced processing with image understanding.'
      );

      mockOpenDocSGPdf2md.mockResolvedValue(
        '# OpenDocSG Output\n\nFast processing optimized for speed and efficiency.'
      );

      const markerAgent = new MarkerAgent();
      const pdf2mdAgent = new PDF2MDAgent();
      const openDocSGAgent = new OpenDocSGAgent();

      const [markerResult, pdf2mdResult, openDocSGResult] = await Promise.all([
        markerAgent.convertPdf(mockFileInput),
        pdf2mdAgent.convertPdf(mockFileInput),
        openDocSGAgent.convertPdf(mockFileInput),
      ]);

      // All should succeed but with different content
      expect(markerResult.success).toBe(true);
      expect(pdf2mdResult.success).toBe(true);
      expect(openDocSGResult.success).toBe(true);

      expect(markerResult.markdownContent).not.toBe(pdf2mdResult.markdownContent);
      expect(pdf2mdResult.markdownContent).not.toBe(openDocSGResult.markdownContent);
      expect(openDocSGResult.markdownContent).not.toBe(markerResult.markdownContent);

      // Each should reflect their specialization
      expect(markerResult.markdownContent).toContain('OCR');
      expect(pdf2mdResult.markdownContent).toContain('Vision-enhanced');
      expect(openDocSGResult.markdownContent).toContain('speed');
    });
  });

  describe('Concurrency and Resource Management', () => {
    it('should handle concurrent processing safely', async () => {
      const markerAgent = new MarkerAgent();
      const pdf2mdAgent = new PDF2MDAgent();
      const openDocSGAgent = new OpenDocSGAgent();

      // Process multiple files concurrently with each agent
      const fileInputs = Array.from({ length: 3 }, (_, i) => ({
        ...mockFileInput,
        originalName: `concurrent-test-${i}.pdf`,
      }));

      const allPromises = fileInputs.flatMap(fileInput => [
        markerAgent.convertPdf(fileInput),
        pdf2mdAgent.convertPdf(fileInput),
        openDocSGAgent.convertPdf(fileInput),
      ]);

      const results = await Promise.all(allPromises);

      // All 9 operations should complete
      expect(results).toHaveLength(9);
      
      // All should succeed (given our mocked successful responses)
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.metadata.processingTimeMs).toBeGreaterThan(0);
      });
    });
  });
});