/**
 * Multi-Agent PDF Conversion System - Main Exports
 * Phase 3 Complete Implementation
 * 
 * Centralized exports for the complete multi-agent system including:
 * - Phase 1: Infrastructure and types
 * - Phase 2: Conversion agents (Marker, PDF2MD, OpenDocSG)
 * - Phase 3: Synthesis engine with heuristic analysis
 */

// Conversion Agents (Phase 2)
export {
  MarkerAgent,
  PDF2MDAgent,
  OpenDocSGAgent,
  AgentError,
  AgentTimeoutError,
  AgentValidationError,
  AgentProcessingError,
  AGENT_TYPES,
  isValidAgentType,
  getAgentDisplayName,
  type AgentType
} from './converters';

// Synthesis Engine (Phase 3)
export {
  SynthesisAgent,
  defaultSynthesisAgent,
  createSynthesisAgent,
  calculateHeuristicScores,
  getDetailedHeuristicAnalysis,
  analyzeTextQuality,
  analyzeStructurePreservation,
  analyzeTableIntegrity,
  analyzeListFormatting,
  analyzeHeaderHierarchy,
  analyzeLinkPreservation,
  type SynthesisConfig,
  type HeuristicScore,
  type HeuristicAnalysis
} from './synthesis';

// Core Types (Phase 1)
export type {
  ConversionResult,
  FileInput,
  AgentConfig,
  SynthesisScore
} from './types/agent-interfaces';

export type {
  ProcessingMetrics,
  DocumentMetadata,
  SynthesisResult,
  IngestionStatus
} from './types/conversion-results';

// Error Handling Utilities
export { handleAgentError, isRecoverableError } from './error-handling';

// Multi-Agent Processing Pipeline Functions
export {
  processWithMultipleAgents,
  selectBestConversion,
  generateProcessingReport
} from './pipeline';