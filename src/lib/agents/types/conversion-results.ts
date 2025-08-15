import { ConversionResult } from './agent-interfaces';

export interface ProcessingMetrics {
  totalProcessingTime: number;
  agentResults: ConversionResult[];
  selectedAgent: string;
  selectionReason: string;
  confidenceLevel: 'high' | 'medium' | 'low';
}

export interface DocumentMetadata {
  originalFileName: string;
  fileSize: number;
  mimeType: string;
  uploadTimestamp: Date;
  processingStarted: Date;
  processingCompleted?: Date;
}

export interface SynthesisResult {
  selectedResult: ConversionResult;
  synthesisData: {
    scores: Array<{
      agent: string;
      totalScore: number;
      heuristics: Record<string, number>;
    }>;
    selectionReason: string;
    confidenceLevel: 'high' | 'medium' | 'low';
    llmCoherenceUsed: boolean;
  };
  processingMetrics?: ProcessingMetrics;
}

export interface IngestionStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  stage?: 'conversion' | 'synthesis' | 'storage';
  progress?: number;
  message?: string;
  error?: string;
}