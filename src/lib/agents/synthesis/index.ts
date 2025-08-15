/**
 * Multi-Agent PDF Conversion System - Phase 3 Implementation
 * Synthesis Module Exports
 * 
 * Centralized exports for the synthesis agent and all related functionality.
 */

// Main synthesis agent
export { 
  SynthesisAgent, 
  defaultSynthesisAgent, 
  createSynthesisAgent,
  type SynthesisConfig 
} from './synthesis-agent';

// Heuristic functions and analysis
export { 
  calculateHeuristicScores,
  getDetailedHeuristicAnalysis,
  analyzeTextQuality,
  analyzeStructurePreservation,
  analyzeTableIntegrity,
  analyzeListFormatting,
  analyzeHeaderHierarchy,
  analyzeLinkPreservation,
  type HeuristicScore,
  type HeuristicAnalysis
} from './heuristics';

// Re-export relevant types
export type { 
  SynthesisResult,
  ProcessingMetrics 
} from '../types/conversion-results';
export type { 
  ConversionResult,
  SynthesisScore 
} from '../types/agent-interfaces';