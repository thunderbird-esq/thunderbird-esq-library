/**
 * Multi-Agent PDF Conversion System - Phase 3 Implementation
 * Synthesis Agent - Core Orchestration Engine
 * 
 * This agent receives outputs from multiple conversion agents (Marker, PDF2MD, OpenDocSG)
 * and intelligently selects the best conversion using heuristic analysis and LLM coherence checks.
 */

import { ConversionResult, SynthesisScore } from '../types/agent-interfaces';
import { SynthesisResult } from '../types/conversion-results';
import { calculateHeuristicScores, getDetailedHeuristicAnalysis } from './heuristics';
import { askModel } from '@/app/actions';

export interface SynthesisConfig {
  // Minimum score difference required to avoid LLM coherence check
  scoreThreshold: number;
  
  // Weights for different heuristics (must sum to 1.0)
  heuristicWeights: {
    textQuality: number;
    structurePreservation: number;
    tableIntegrity: number;
    listFormatting: number;
    headerHierarchy: number;
    linkPreservation: number;
  };
  
  // LLM coherence check settings
  llmCoherence: {
    enabled: boolean;
    maxRetries: number;
    timeoutMs: number;
  };
}

const DEFAULT_SYNTHESIS_CONFIG: SynthesisConfig = {
  scoreThreshold: 0.15, // 15% difference threshold
  heuristicWeights: {
    textQuality: 0.25,
    structurePreservation: 0.20,
    tableIntegrity: 0.15,
    listFormatting: 0.15,
    headerHierarchy: 0.15,
    linkPreservation: 0.10
  },
  llmCoherence: {
    enabled: true,
    maxRetries: 2,
    timeoutMs: 30000
  }
};

export class SynthesisAgent {
  private config: SynthesisConfig;

  constructor(config: Partial<SynthesisConfig> = {}) {
    this.config = { ...DEFAULT_SYNTHESIS_CONFIG, ...config };
    
    // Validate heuristic weights sum to 1.0
    const totalWeight = Object.values(this.config.heuristicWeights).reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(totalWeight - 1.0) > 0.001) {
      throw new Error(`Heuristic weights must sum to 1.0, got ${totalWeight}`);
    }
  }

  /**
   * Synthesize multiple conversion results and select the best one
   */
  async synthesize(results: ConversionResult[]): Promise<SynthesisResult> {
    if (results.length === 0) {
      throw new Error('No conversion results provided for synthesis');
    }

    // Filter out failed conversions
    const successfulResults = results.filter(result => result.success && result.markdownContent);
    
    if (successfulResults.length === 0) {
      throw new Error('No successful conversion results available for synthesis');
    }

    // If only one successful result, return it immediately
    if (successfulResults.length === 1) {
      const singleResult = successfulResults[0];
      const scores = this.calculateDetailedScores([singleResult]);
      
      return {
        selectedResult: singleResult,
        synthesisData: {
          scores,
          selectionReason: 'Only successful conversion available',
          confidenceLevel: 'high',
          llmCoherenceUsed: false
        }
      };
    }

    // Calculate heuristic scores for all results
    const scores = this.calculateDetailedScores(successfulResults);
    
    // Sort by total score descending
    scores.sort((a, b) => b.totalScore - a.totalScore);
    
    const topScore = scores[0];
    const secondScore = scores[1];
    const scoreDifference = topScore.totalScore - secondScore.totalScore;

    // Determine if LLM coherence check is needed
    const needsLLMCheck = this.config.llmCoherence.enabled && 
                         scoreDifference <= this.config.scoreThreshold;

    let selectedAgent = topScore.agent;
    let selectionReason = `Highest heuristic score (${(topScore.totalScore * 100).toFixed(1)}%)`;
    let confidenceLevel: 'high' | 'medium' | 'low' = 'high';
    let llmCoherenceUsed = false;

    // Perform LLM coherence check if scores are close
    if (needsLLMCheck) {
      try {
        const llmResult = await this.performLLMCoherenceCheck(
          successfulResults.find(r => r.sourceAgent === topScore.agent)!,
          successfulResults.find(r => r.sourceAgent === secondScore.agent)!
        );
        
        if (llmResult.selectedAgent) {
          selectedAgent = llmResult.selectedAgent;
          selectionReason = `LLM coherence check: ${llmResult.reason}`;
          confidenceLevel = llmResult.confidence;
          llmCoherenceUsed = true;
        }
      } catch (error) {
        console.warn('LLM coherence check failed, falling back to heuristic winner:', error);
        confidenceLevel = 'medium';
      }
    }

    // Set confidence level based on score differences
    if (!llmCoherenceUsed) {
      if (scoreDifference < 0.05) {
        confidenceLevel = 'low';
      } else if (scoreDifference < 0.15) {
        confidenceLevel = 'medium';
      } else {
        confidenceLevel = 'high';
      }
    }

    const selectedResult = successfulResults.find(r => r.sourceAgent === selectedAgent)!;

    return {
      selectedResult,
      synthesisData: {
        scores: scores.map(score => ({
          agent: score.agent,
          totalScore: score.totalScore,
          heuristics: score.heuristics
        })),
        selectionReason,
        confidenceLevel,
        llmCoherenceUsed
      }
    };
  }

  /**
   * Calculate detailed scores for all conversion results
   */
  private calculateDetailedScores(results: ConversionResult[]): SynthesisScore[] {
    return results.map(result => {
      const heuristics = calculateHeuristicScores(result.markdownContent);
      
      // Calculate weighted total score
      const totalScore = 
        heuristics.textQuality * this.config.heuristicWeights.textQuality +
        heuristics.structurePreservation * this.config.heuristicWeights.structurePreservation +
        heuristics.tableIntegrity * this.config.heuristicWeights.tableIntegrity +
        heuristics.listFormatting * this.config.heuristicWeights.listFormatting +
        heuristics.headerHierarchy * this.config.heuristicWeights.headerHierarchy +
        heuristics.linkPreservation * this.config.heuristicWeights.linkPreservation;

      return {
        agent: result.sourceAgent,
        totalScore,
        heuristics,
        metadata: {
          wordCount: result.metadata.wordCount,
          processingTime: result.metadata.processingTimeMs,
          confidence: result.metadata.confidence || 0
        }
      };
    });
  }

  /**
   * Perform LLM-based coherence check between two top candidates
   */
  private async performLLMCoherenceCheck(
    candidate1: ConversionResult, 
    candidate2: ConversionResult
  ): Promise<{
    selectedAgent: string;
    reason: string;
    confidence: 'high' | 'medium' | 'low';
  }> {
    const prompt = this.buildCoherenceCheckPrompt(candidate1, candidate2);
    
    const result = await askModel(prompt);
    
    if (!result.success) {
      throw new Error(`LLM coherence check failed: ${result.error}`);
    }

    if (!result.data) {
      throw new Error('LLM coherence check returned empty response');
    }

    return this.parseLLMResponse(result.data, candidate1.sourceAgent, candidate2.sourceAgent);
  }

  /**
   * Build the prompt for LLM coherence checking
   */
  private buildCoherenceCheckPrompt(candidate1: ConversionResult, candidate2: ConversionResult): string {
    // Get detailed heuristic analysis for context
    const analysis1 = getDetailedHeuristicAnalysis(candidate1.markdownContent);
    const analysis2 = getDetailedHeuristicAnalysis(candidate2.markdownContent);

    return `You are evaluating two PDF-to-Markdown conversion results to determine which preserves the original document's content and structure better. Both conversions have similar heuristic scores and need human-level judgment.

**CONVERSION A (${candidate1.sourceAgent.toUpperCase()}):**
Processing Time: ${candidate1.metadata.processingTimeMs}ms
Word Count: ${candidate1.metadata.wordCount}
Confidence: ${candidate1.metadata.confidence || 'N/A'}

Heuristic Analysis:
- Text Quality: ${analysis1.textQuality.score.toFixed(2)} (${analysis1.textQuality.details})
- Structure: ${analysis1.structurePreservation.score.toFixed(2)} (${analysis1.structurePreservation.details})
- Tables: ${analysis1.tableIntegrity.score.toFixed(2)} (${analysis1.tableIntegrity.details})
- Lists: ${analysis1.listFormatting.score.toFixed(2)} (${analysis1.listFormatting.details})
- Headers: ${analysis1.headerHierarchy.score.toFixed(2)} (${analysis1.headerHierarchy.details})
- Links: ${analysis1.linkPreservation.score.toFixed(2)} (${analysis1.linkPreservation.details})

Content Preview (first 500 chars):
\`\`\`
${candidate1.markdownContent.substring(0, 500)}${candidate1.markdownContent.length > 500 ? '...' : ''}
\`\`\`

**CONVERSION B (${candidate2.sourceAgent.toUpperCase()}):**
Processing Time: ${candidate2.metadata.processingTimeMs}ms
Word Count: ${candidate2.metadata.wordCount}
Confidence: ${candidate2.metadata.confidence || 'N/A'}

Heuristic Analysis:
- Text Quality: ${analysis2.textQuality.score.toFixed(2)} (${analysis2.textQuality.details})
- Structure: ${analysis2.structurePreservation.score.toFixed(2)} (${analysis2.structurePreservation.details})
- Tables: ${analysis2.tableIntegrity.score.toFixed(2)} (${analysis2.tableIntegrity.details})
- Lists: ${analysis2.listFormatting.score.toFixed(2)} (${analysis2.listFormatting.details})
- Headers: ${analysis2.headerHierarchy.score.toFixed(2)} (${analysis2.headerHierarchy.details})
- Links: ${analysis2.linkPreservation.score.toFixed(2)} (${analysis2.linkPreservation.details})

Content Preview (first 500 chars):
\`\`\`
${candidate2.markdownContent.substring(0, 500)}${candidate2.markdownContent.length > 500 ? '...' : ''}
\`\`\`

**EVALUATION CRITERIA:**
1. Content completeness and accuracy
2. Structural integrity (headers, lists, tables)
3. Readability and formatting quality
4. Preservation of semantic meaning
5. Overall professional presentation

**RESPONSE FORMAT:**
You must respond with exactly this format:

SELECTED: [A or B]
CONFIDENCE: [HIGH, MEDIUM, or LOW]
REASON: [One sentence explanation focusing on the key differentiating factor]

Choose the conversion that would be most valuable for a knowledge base where users will search and read the content.`;
  }

  /**
   * Parse the LLM response to extract selection decision
   */
  private parseLLMResponse(
    response: string, 
    agent1: string, 
    agent2: string
  ): {
    selectedAgent: string;
    reason: string;
    confidence: 'high' | 'medium' | 'low';
  } {
    // Extract the structured response
    const selectedMatch = response.match(/SELECTED:\s*([AB])/i);
    const confidenceMatch = response.match(/CONFIDENCE:\s*(HIGH|MEDIUM|LOW)/i);
    const reasonMatch = response.match(/REASON:\s*(.+?)(?:\n|$)/i);

    if (!selectedMatch || !confidenceMatch || !reasonMatch) {
      throw new Error('LLM response format is invalid');
    }

    const selected = selectedMatch[1].toUpperCase();
    const selectedAgent = selected === 'A' ? agent1 : agent2;
    const confidence = confidenceMatch[1].toLowerCase() as 'high' | 'medium' | 'low';
    const reason = reasonMatch[1].trim();

    return {
      selectedAgent,
      reason,
      confidence
    };
  }

  /**
   * Get detailed synthesis report for debugging and analysis
   */
  async getSynthesisReport(results: ConversionResult[]): Promise<{
    scores: SynthesisScore[];
    detailedAnalysis: Record<string, any>;
    recommendation: string;
  }> {
    const successfulResults = results.filter(result => result.success && result.markdownContent);
    const scores = this.calculateDetailedScores(successfulResults);
    
    const detailedAnalysis: Record<string, any> = {};
    successfulResults.forEach(result => {
      detailedAnalysis[result.sourceAgent] = getDetailedHeuristicAnalysis(result.markdownContent);
    });

    scores.sort((a, b) => b.totalScore - a.totalScore);
    const topAgent = scores[0];
    
    const recommendation = `Recommended: ${topAgent.agent} (Score: ${(topAgent.totalScore * 100).toFixed(1)}%)`;

    return {
      scores,
      detailedAnalysis,
      recommendation
    };
  }

  /**
   * Update synthesis configuration
   */
  updateConfig(newConfig: Partial<SynthesisConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Re-validate weights if they were updated
    if (newConfig.heuristicWeights) {
      const totalWeight = Object.values(this.config.heuristicWeights).reduce((sum, weight) => sum + weight, 0);
      if (Math.abs(totalWeight - 1.0) > 0.001) {
        throw new Error(`Heuristic weights must sum to 1.0, got ${totalWeight}`);
      }
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): SynthesisConfig {
    return { ...this.config };
  }
}

// Export default instance with standard configuration
export const defaultSynthesisAgent = new SynthesisAgent();

// Export factory function for custom configurations
export function createSynthesisAgent(config?: Partial<SynthesisConfig>): SynthesisAgent {
  return new SynthesisAgent(config);
}