// Multi-Agent PDF Conversion System - Phase 2 Implementation
export { MarkerAgent } from './marker';
export { PDF2MDAgent } from './pdf2md';
export { OpenDocSGAgent } from './opendocsg';

// Re-export shared types
export type { 
  ConversionResult, 
  FileInput, 
  AgentConfig 
} from '../types/agent-interfaces';

// Agent error classes for standardized error handling
export class AgentError extends Error {
  constructor(
    message: string,
    public readonly agent: string,
    public readonly code: string,
    public readonly recoverable: boolean = false
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

export class AgentProcessingError extends AgentError {
  constructor(agent: string, message: string, recoverable: boolean = true) {
    super(message, agent, 'PROCESSING_ERROR', recoverable);
    this.name = 'AgentProcessingError';
  }
}

export class AgentTimeoutError extends AgentProcessingError {
  constructor(agent: string, timeoutMs: number) {
    super(agent, `Agent ${agent} timed out after ${timeoutMs}ms`, true);
    this.name = 'AgentTimeoutError';
    this.code = 'TIMEOUT_ERROR';
  }
}

export class AgentValidationError extends AgentError {
  constructor(agent: string, message: string) {
    super(message, agent, 'VALIDATION_ERROR', false);
    this.name = 'AgentValidationError';
  }
}

// Utility functions for agent management
export const AGENT_TYPES = ['marker', 'pdf2md', 'opendocsg'] as const;
export type AgentType = typeof AGENT_TYPES[number];

export function isValidAgentType(type: string): type is AgentType {
  return AGENT_TYPES.includes(type as AgentType);
}

export function getAgentDisplayName(type: AgentType): string {
  switch (type) {
    case 'marker':
      return 'Marker (High-Quality OCR)';
    case 'pdf2md':
      return 'PDF2MD (Vision-Enhanced)';
    case 'opendocsg':
      return 'OpenDocSG (High-Speed)';
    default:
      return type;
  }
}