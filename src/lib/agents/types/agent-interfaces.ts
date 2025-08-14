export interface ConversionResult {
  success: boolean;
  sourceAgent: string;
  markdownContent: string;
  metadata: {
    processingTimeMs: number;
    wordCount: number;
    pageCount?: number;
    confidence?: number;
    errors?: string[];
    warnings?: string[];
  };
  error?: string;
}

export interface FileInput {
  buffer: ArrayBuffer;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface AgentConfig {
  timeoutMs: number;
  retryAttempts: number;
  maxFileSizeMB: number;
}

export interface SynthesisScore {
  agent: string;
  totalScore: number;
  heuristics: {
    textQuality: number;
    structurePreservation: number;
    tableIntegrity: number;
    listFormatting: number;
    headerHierarchy: number;
    linkPreservation: number;
  };
  metadata: {
    wordCount: number;
    processingTime: number;
    confidence: number;
  };
}