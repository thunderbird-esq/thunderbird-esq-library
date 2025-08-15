/**
 * Multi-Agent PDF Conversion System - Phase 3 Implementation
 * Processing Pipeline Functions
 * 
 * High-level orchestration functions that coordinate the entire multi-agent process:
 * 1. Parallel execution of conversion agents
 * 2. Synthesis and selection of best result
 * 3. Comprehensive reporting and analysis
 */

import { ConversionResult, FileInput, AgentConfig } from './types/agent-interfaces';
import { SynthesisResult, ProcessingMetrics } from './types/conversion-results';
import { MarkerAgent } from './converters/marker';
import { PDF2MDAgent } from './converters/pdf2md';
import { OpenDocSGAgent } from './converters/opendocsg';
import { SynthesisAgent, defaultSynthesisAgent } from './synthesis';
import { AgentError, AgentTimeoutError } from './converters';

export interface PipelineConfig {
  // Which agents to run (allows selective execution)
  enabledAgents: {
    marker: boolean;
    pdf2md: boolean;
    opendocsg: boolean;
  };
  
  // Parallel execution settings
  maxConcurrency: number;
  
  // Individual agent configurations
  agentConfigs: {
    marker?: Partial<AgentConfig>;
    pdf2md?: Partial<AgentConfig>;
    opendocsg?: Partial<AgentConfig>;
  };
  
  // Synthesis configuration
  synthesisAgent?: SynthesisAgent;
  
  // Retry and error handling
  retryFailedAgents: boolean;
  maxRetries: number;
}

const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  enabledAgents: {
    marker: true,
    pdf2md: true,
    opendocsg: true
  },
  maxConcurrency: 3,
  agentConfigs: {},
  retryFailedAgents: true,
  maxRetries: 2
};

/**
 * Process a file with multiple conversion agents in parallel
 */
export async function processWithMultipleAgents(
  fileInput: FileInput,
  config: Partial<PipelineConfig> = {}
): Promise<SynthesisResult> {
  const mergedConfig = { ...DEFAULT_PIPELINE_CONFIG, ...config };
  const synthesisAgent = mergedConfig.synthesisAgent || defaultSynthesisAgent;
  
  const startTime = Date.now();
  
  // Determine which agents to run
  const agentsToRun: Array<{
    name: string;
    agent: any;
    config?: Partial<AgentConfig>;
  }> = [];
  
  if (mergedConfig.enabledAgents.marker) {
    agentsToRun.push({
      name: 'marker',
      agent: new MarkerAgent(mergedConfig.agentConfigs.marker),
      config: mergedConfig.agentConfigs.marker
    });
  }
  
  if (mergedConfig.enabledAgents.pdf2md) {
    agentsToRun.push({
      name: 'pdf2md',
      agent: new PDF2MDAgent(mergedConfig.agentConfigs.pdf2md),
      config: mergedConfig.agentConfigs.pdf2md
    });
  }
  
  if (mergedConfig.enabledAgents.opendocsg) {
    agentsToRun.push({
      name: 'opendocsg',
      agent: new OpenDocSGAgent(mergedConfig.agentConfigs.opendocsg),
      config: mergedConfig.agentConfigs.opendocsg
    });
  }
  
  if (agentsToRun.length === 0) {
    throw new Error('No agents enabled for processing');
  }
  
  // Execute agents in parallel with concurrency limiting
  const results = await executeAgentsWithConcurrency(
    agentsToRun,
    fileInput,
    mergedConfig.maxConcurrency,
    mergedConfig.retryFailedAgents,
    mergedConfig.maxRetries
  );
  
  // Synthesize results to select the best conversion
  const synthesisResult = await synthesisAgent.synthesize(results);
  
  const totalTime = Date.now() - startTime;
  
  // Add processing metrics to the result
  synthesisResult.processingMetrics = {
    totalProcessingTime: totalTime,
    agentResults: results,
    selectedAgent: synthesisResult.selectedResult.sourceAgent,
    selectionReason: synthesisResult.synthesisData.selectionReason,
    confidenceLevel: synthesisResult.synthesisData.confidenceLevel
  };
  
  return synthesisResult;
}

/**
 * Execute agents with concurrency control and retry logic
 */
async function executeAgentsWithConcurrency(
  agents: Array<{ name: string; agent: any; config?: Partial<AgentConfig> }>,
  fileInput: FileInput,
  maxConcurrency: number,
  retryFailedAgents: boolean,
  maxRetries: number
): Promise<ConversionResult[]> {
  const results: ConversionResult[] = [];
  const executing: Promise<ConversionResult>[] = [];
  
  for (const agentInfo of agents) {
    // Limit concurrency
    if (executing.length >= maxConcurrency) {
      const completedResult = await Promise.race(executing);
      results.push(completedResult);
      
      // Remove completed promise from executing array
      const completedIndex = executing.findIndex(p => p === Promise.resolve(completedResult));
      if (completedIndex > -1) {
        executing.splice(completedIndex, 1);
      }
    }
    
    // Start agent execution
    const agentPromise = executeAgentWithRetry(
      agentInfo.agent,
      agentInfo.name,
      fileInput,
      retryFailedAgents,
      maxRetries
    );
    
    executing.push(agentPromise);
  }
  
  // Wait for all remaining agents to complete
  const remainingResults = await Promise.all(executing);
  results.push(...remainingResults);
  
  return results;
}

/**
 * Execute a single agent with retry logic
 */
async function executeAgentWithRetry(
  agent: any,
  agentName: string,
  fileInput: FileInput,
  retryFailedAgents: boolean,
  maxRetries: number
): Promise<ConversionResult> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await agent.convert(fileInput);
      
      // Log successful conversion
      console.log(`${agentName} agent completed successfully on attempt ${attempt + 1}`);
      
      return result;
    } catch (error) {
      lastError = error as Error;
      
      console.warn(`${agentName} agent failed on attempt ${attempt + 1}:`, error);
      
      // Don't retry if retries are disabled or this is the final attempt
      if (!retryFailedAgents || attempt >= maxRetries) {
        break;
      }
      
      // Don't retry for non-recoverable errors
      if (error instanceof AgentError && !error.recoverable) {
        console.log(`${agentName} agent error is not recoverable, skipping retries`);
        break;
      }
      
      // Wait before retry (exponential backoff)
      const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // Return a failed result
  return {
    success: false,
    sourceAgent: agentName,
    markdownContent: '',
    metadata: {
      processingTimeMs: 0,
      wordCount: 0,
      errors: [lastError?.message || 'Unknown error']
    },
    error: lastError?.message || 'Conversion failed after all retries'
  };
}

/**
 * Select the best conversion from multiple results (simplified version for direct use)
 */
export async function selectBestConversion(
  results: ConversionResult[],
  synthesisAgent?: SynthesisAgent
): Promise<SynthesisResult> {
  const agent = synthesisAgent || defaultSynthesisAgent;
  return await agent.synthesize(results);
}

/**
 * Generate comprehensive processing report
 */
export async function generateProcessingReport(
  results: ConversionResult[],
  synthesisResult?: SynthesisResult
): Promise<{
  summary: string;
  agentPerformance: Array<{
    agent: string;
    success: boolean;
    processingTime: number;
    wordCount: number;
    confidence?: number;
    errors?: string[];
  }>;
  synthesisAnalysis?: {
    selectedAgent: string;
    selectionReason: string;
    confidenceLevel: string;
    scoreDifferences: Array<{
      agent: string;
      score: number;
      rank: number;
    }>;
  };
  recommendations: string[];
}> {
  const agentPerformance = results.map(result => ({
    agent: result.sourceAgent,
    success: result.success,
    processingTime: result.metadata.processingTimeMs,
    wordCount: result.metadata.wordCount,
    confidence: result.metadata.confidence,
    errors: result.metadata.errors
  }));

  const successfulAgents = results.filter(r => r.success).length;
  const totalAgents = results.length;
  
  let summary = `Processing completed: ${successfulAgents}/${totalAgents} agents succeeded`;
  
  const recommendations: string[] = [];
  
  // Analyze agent performance
  if (successfulAgents === 0) {
    summary += '. All conversions failed.';
    recommendations.push('Check input file format and agent configurations');
    recommendations.push('Review error logs for common issues');
  } else if (successfulAgents < totalAgents) {
    summary += '. Some agents failed.';
    recommendations.push('Investigate failed agent configurations');
    recommendations.push('Consider adjusting timeout and retry settings');
  } else {
    summary += '. All agents succeeded.';
    recommendations.push('System performing optimally');
  }
  
  let synthesisAnalysis: any = undefined;
  
  if (synthesisResult) {
    const scores = synthesisResult.synthesisData.scores
      .sort((a, b) => b.totalScore - a.totalScore)
      .map((score, index) => ({
        agent: score.agent,
        score: score.totalScore,
        rank: index + 1
      }));
    
    synthesisAnalysis = {
      selectedAgent: synthesisResult.selectedResult.sourceAgent,
      selectionReason: synthesisResult.synthesisData.selectionReason,
      confidenceLevel: synthesisResult.synthesisData.confidenceLevel,
      scoreDifferences: scores
    };
    
    // Add synthesis-specific recommendations
    if (synthesisResult.synthesisData.confidenceLevel === 'low') {
      recommendations.push('Low confidence in selection - consider manual review');
    }
    
    if (synthesisResult.synthesisData.llmCoherenceUsed) {
      recommendations.push('LLM coherence check was used - scores were very close');
    }
    
    const topTwoScores = scores.slice(0, 2);
    if (topTwoScores.length > 1) {
      const scoreDiff = topTwoScores[0].score - topTwoScores[1].score;
      if (scoreDiff < 0.05) {
        recommendations.push('Very close scores detected - consider tuning heuristic weights');
      }
    }
  }
  
  return {
    summary,
    agentPerformance,
    synthesisAnalysis,
    recommendations
  };
}

/**
 * Health check for all enabled agents
 */
export async function performAgentHealthCheck(
  config: Partial<PipelineConfig> = {}
): Promise<{
  overallHealth: 'healthy' | 'degraded' | 'critical';
  agentStatus: Array<{
    agent: string;
    status: 'healthy' | 'warning' | 'error';
    message: string;
    responseTime?: number;
  }>;
}> {
  const mergedConfig = { ...DEFAULT_PIPELINE_CONFIG, ...config };
  const agentStatus: Array<{
    agent: string;
    status: 'healthy' | 'warning' | 'error';
    message: string;
    responseTime?: number;
  }> = [];
  
  // Test each enabled agent with a minimal file
  const testFile: FileInput = {
    buffer: new ArrayBuffer(1024), // Small test buffer
    originalName: 'health-check.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024
  };
  
  const healthChecks: Promise<any>[] = [];
  
  if (mergedConfig.enabledAgents.marker) {
    healthChecks.push(checkAgentHealth('marker', new MarkerAgent(), testFile));
  }
  
  if (mergedConfig.enabledAgents.pdf2md) {
    healthChecks.push(checkAgentHealth('pdf2md', new PDF2MDAgent(), testFile));
  }
  
  if (mergedConfig.enabledAgents.opendocsg) {
    healthChecks.push(checkAgentHealth('opendocsg', new OpenDocSGAgent(), testFile));
  }
  
  const results = await Promise.allSettled(healthChecks);
  
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      agentStatus.push(result.value);
    } else {
      const agentNames = ['marker', 'pdf2md', 'opendocsg'];
      agentStatus.push({
        agent: agentNames[index] || 'unknown',
        status: 'error',
        message: 'Health check failed to complete'
      });
    }
  });
  
  // Determine overall health
  const errorCount = agentStatus.filter(status => status.status === 'error').length;
  const warningCount = agentStatus.filter(status => status.status === 'warning').length;
  
  let overallHealth: 'healthy' | 'degraded' | 'critical';
  if (errorCount === 0 && warningCount === 0) {
    overallHealth = 'healthy';
  } else if (errorCount === 0) {
    overallHealth = 'degraded';
  } else {
    overallHealth = 'critical';
  }
  
  return {
    overallHealth,
    agentStatus
  };
}

/**
 * Check health of individual agent
 */
async function checkAgentHealth(
  agentName: string,
  agent: any,
  testFile: FileInput
): Promise<{
  agent: string;
  status: 'healthy' | 'warning' | 'error';
  message: string;
  responseTime?: number;
}> {
  const startTime = Date.now();
  
  try {
    // Attempt a quick health check (could be a simple ping or minimal conversion)
    if (typeof agent.healthCheck === 'function') {
      await agent.healthCheck();
    } else {
      // Fallback: attempt minimal conversion with timeout
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new AgentTimeoutError(agentName, 5000)), 5000)
      );
      
      await Promise.race([agent.convert(testFile), timeoutPromise]);
    }
    
    const responseTime = Date.now() - startTime;
    
    return {
      agent: agentName,
      status: responseTime > 3000 ? 'warning' : 'healthy',
      message: responseTime > 3000 ? 'Slow response time' : 'Agent responsive',
      responseTime
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    return {
      agent: agentName,
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
      responseTime
    };
  }
}