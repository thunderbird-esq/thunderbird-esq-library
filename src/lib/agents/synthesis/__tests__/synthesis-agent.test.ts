/**
 * Multi-Agent PDF Conversion System - Phase 3 Implementation
 * Synthesis Agent Test Suite
 * 
 * Comprehensive testing for the synthesis engine with varied document types
 */

import { SynthesisAgent, createSynthesisAgent } from '../synthesis-agent';
import { ConversionResult } from '../../types/agent-interfaces';

// Mock the askModel function
import { vi } from 'vitest';

vi.mock('@/app/actions', () => ({
  askModel: vi.fn()
}));

import { askModel } from '@/app/actions';
const mockAskModel = askModel as ReturnType<typeof vi.fn>;

describe('SynthesisAgent', () => {
  let synthesisAgent: SynthesisAgent;

  beforeEach(() => {
    synthesisAgent = new SynthesisAgent();
    vi.clearAllMocks();
  });

  describe('Constructor and Configuration', () => {
    it('should create agent with default configuration', () => {
      const agent = new SynthesisAgent();
      const config = agent.getConfig();
      
      expect(config.scoreThreshold).toBe(0.15);
      expect(config.llmCoherence.enabled).toBe(true);
      
      // Check weights sum to 1.0
      const totalWeight = Object.values(config.heuristicWeights).reduce((sum, weight) => sum + weight, 0);
      expect(Math.abs(totalWeight - 1.0)).toBeLessThan(0.001);
    });

    it('should create agent with custom configuration', () => {
      const customConfig = {
        scoreThreshold: 0.20,
        heuristicWeights: {
          textQuality: 0.3,
          structurePreservation: 0.2,
          tableIntegrity: 0.1,
          listFormatting: 0.1,
          headerHierarchy: 0.2,
          linkPreservation: 0.1
        }
      };
      
      const agent = createSynthesisAgent(customConfig);
      const config = agent.getConfig();
      
      expect(config.scoreThreshold).toBe(0.20);
      expect(config.heuristicWeights.textQuality).toBe(0.3);
    });

    it('should throw error for invalid heuristic weights', () => {
      const invalidConfig = {
        heuristicWeights: {
          textQuality: 0.5,
          structurePreservation: 0.2,
          tableIntegrity: 0.1,
          listFormatting: 0.1,
          headerHierarchy: 0.1,
          linkPreservation: 0.1 // Total = 1.1
        }
      };
      
      expect(() => createSynthesisAgent(invalidConfig)).toThrow('Heuristic weights must sum to 1.0');
    });
  });

  describe('Synthesis with Single Result', () => {
    it('should return single successful result immediately', async () => {
      const singleResult: ConversionResult = {
        success: true,
        sourceAgent: 'marker',
        markdownContent: '# Test Document\n\nThis is a test document with good structure.',
        metadata: {
          processingTimeMs: 1000,
          wordCount: 10,
          confidence: 0.9
        }
      };

      const synthesis = await synthesisAgent.synthesize([singleResult]);
      
      expect(synthesis.selectedResult).toBe(singleResult);
      expect(synthesis.synthesisData.selectionReason).toBe('Only successful conversion available');
      expect(synthesis.synthesisData.confidenceLevel).toBe('high');
      expect(synthesis.synthesisData.llmCoherenceUsed).toBe(false);
    });

    it('should handle failed conversions gracefully', async () => {
      const failedResult: ConversionResult = {
        success: false,
        sourceAgent: 'pdf2md',
        markdownContent: '',
        metadata: {
          processingTimeMs: 500,
          wordCount: 0,
          errors: ['Conversion failed']
        },
        error: 'Processing failed'
      };

      await expect(synthesisAgent.synthesize([failedResult])).rejects.toThrow(
        'No successful conversion results available for synthesis'
      );
    });
  });

  describe('Synthesis with Multiple Results', () => {
    const createTestResult = (agent: string, markdown: string, processingTime = 1000): ConversionResult => ({
      success: true,
      sourceAgent: agent,
      markdownContent: markdown,
      metadata: {
        processingTimeMs: processingTime,
        wordCount: markdown.split(/\s+/).length,
        confidence: 0.8
      }
    });

    it('should select result with highest heuristic score', async () => {
      const goodResult = createTestResult('marker', `
# High Quality Document

This is a well-structured document with proper formatting.

## Introduction

The document contains:
1. Clear headers
2. Proper lists
3. Good punctuation and grammar

| Feature | Score |
|---------|-------|
| Quality | High  |
| Structure | Excellent |

Visit [our website](https://example.com) for more information.
      `);

      const poorResult = createTestResult('pdf2md', `
poor document no headers bad formatting
no punctuation
- random list item
table broken | |
bad link www.example
      `);

      const synthesis = await synthesisAgent.synthesize([goodResult, poorResult]);
      
      expect(synthesis.selectedResult.sourceAgent).toBe('marker');
      expect(synthesis.synthesisData.confidenceLevel).toBe('high');
      expect(synthesis.synthesisData.llmCoherenceUsed).toBe(false);
      expect(synthesis.synthesisData.scores).toHaveLength(2);
    });

    it('should trigger LLM coherence check for close scores', async () => {
      mockAskModel.mockResolvedValue({
        success: true,
        data: `SELECTED: A
CONFIDENCE: HIGH
REASON: Better table formatting and structure preservation.`
      });

      const result1 = createTestResult('marker', `
# Document A

Well formatted content with some tables.

| Column 1 | Column 2 |
|----------|----------|
| Data     | Value    |
      `);

      const result2 = createTestResult('pdf2md', `
# Document B  

Similar quality content with lists.

1. First item
2. Second item
3. Third item
      `);

      const synthesis = await synthesisAgent.synthesize([result1, result2]);
      
      expect(mockAskModel).toHaveBeenCalled();
      expect(synthesis.synthesisData.llmCoherenceUsed).toBe(true);
      expect(synthesis.synthesisData.selectionReason).toContain('LLM coherence check');
    });

    it('should handle LLM coherence check failure gracefully', async () => {
      mockAskModel.mockResolvedValue({
        success: false,
        error: 'API timeout'
      });

      const result1 = createTestResult('marker', '# Document A\nSimilar content quality.');
      const result2 = createTestResult('pdf2md', '# Document B\nAlso similar quality.');

      const synthesis = await synthesisAgent.synthesize([result1, result2]);
      
      expect(synthesis.synthesisData.llmCoherenceUsed).toBe(false);
      expect(synthesis.synthesisData.confidenceLevel).toBe('medium');
    });
  });

  describe('Heuristic Score Calculation', () => {
    it('should calculate accurate scores for well-formatted content', async () => {
      const wellFormattedMarkdown = `
# Main Title

## Introduction

This document demonstrates **excellent formatting** with proper structure.

### Features

The document includes:
1. Clear hierarchical headers
2. Proper text formatting
3. Well-structured lists
4. Professional tables

| Feature | Rating | Notes |
|---------|--------|-------|
| Headers | 5/5    | Perfect hierarchy |
| Lists   | 5/5    | Numbered and bulleted |
| Links   | 4/5    | [Good links](https://example.com) |

## Conclusion

Visit our [website](https://example.com) or email us at contact@example.com.
      `;

      const result = {
        success: true,
        sourceAgent: 'marker',
        markdownContent: wellFormattedMarkdown,
        metadata: {
          processingTimeMs: 1000,
          wordCount: 50,
          confidence: 0.9
        }
      } as ConversionResult;

      const synthesis = await synthesisAgent.synthesize([result]);
      const score = synthesis.synthesisData.scores[0];
      
      expect(score.totalScore).toBeGreaterThan(0.8); // Should score highly
      expect(score.heuristics.headerHierarchy).toBeGreaterThan(0.8);
      expect(score.heuristics.tableIntegrity).toBeGreaterThan(0.8);
      expect(score.heuristics.listFormatting).toBeGreaterThan(0.8);
    });

    it('should penalize poorly formatted content', async () => {
      const poorlyFormattedMarkdown = `
no headers all lowercase
poor punctuation missing spaces
table|broken
- list item with no structure
random text with    excessive   spaces
malformed link www.broken
      `;

      const result = {
        success: true,
        sourceAgent: 'pdf2md',
        markdownContent: poorlyFormattedMarkdown,
        metadata: {
          processingTimeMs: 500,
          wordCount: 20,
          confidence: 0.3
        }
      } as ConversionResult;

      const synthesis = await synthesisAgent.synthesize([result]);
      const score = synthesis.synthesisData.scores[0];
      
      expect(score.totalScore).toBeLessThan(0.5); // Should score poorly
      expect(score.heuristics.textQuality).toBeLessThan(0.6);
      expect(score.heuristics.structurePreservation).toBeLessThan(0.6);
    });
  });

  describe('Synthesis Report Generation', () => {
    it('should generate comprehensive synthesis report', async () => {
      const result1 = {
        success: true,
        sourceAgent: 'marker',
        markdownContent: '# Good Document\n\nWell formatted content.',
        metadata: { processingTimeMs: 1000, wordCount: 5 }
      } as ConversionResult;

      const result2 = {
        success: true,
        sourceAgent: 'pdf2md',
        markdownContent: 'poor formatting no headers',
        metadata: { processingTimeMs: 500, wordCount: 4 }
      } as ConversionResult;

      const report = await synthesisAgent.getSynthesisReport([result1, result2]);
      
      expect(report.scores).toHaveLength(2);
      expect(report.detailedAnalysis).toHaveProperty('marker');
      expect(report.detailedAnalysis).toHaveProperty('pdf2md');
      expect(report.recommendation).toContain('Recommended:');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty results array', async () => {
      await expect(synthesisAgent.synthesize([])).rejects.toThrow(
        'No conversion results provided for synthesis'
      );
    });

    it('should handle malformed LLM response', async () => {
      mockAskModel.mockResolvedValue({
        success: true,
        data: 'Invalid response format'
      });

      const result1 = {
        success: true,
        sourceAgent: 'marker',
        markdownContent: '# Test\nContent here.',
        metadata: { processingTimeMs: 1000, wordCount: 3 }
      } as ConversionResult;

      const result2 = {
        success: true,
        sourceAgent: 'pdf2md', 
        markdownContent: '# Test\nSimilar content.',
        metadata: { processingTimeMs: 1000, wordCount: 3 }
      } as ConversionResult;

      const synthesis = await synthesisAgent.synthesize([result1, result2]);
      
      // Should fall back to heuristic scoring
      expect(synthesis.synthesisData.llmCoherenceUsed).toBe(false);
      expect(synthesis.synthesisData.confidenceLevel).toBe('medium');
    });

    it('should update configuration correctly', () => {
      const newConfig = {
        scoreThreshold: 0.25,
        llmCoherence: { enabled: false, maxRetries: 1, timeoutMs: 15000 }
      };
      
      synthesisAgent.updateConfig(newConfig);
      const config = synthesisAgent.getConfig();
      
      expect(config.scoreThreshold).toBe(0.25);
      expect(config.llmCoherence.enabled).toBe(false);
    });
  });
});