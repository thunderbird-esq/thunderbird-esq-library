// src/components/research/DocumentItem.tsx
'use client';

import { useState, useMemo } from 'react';
import {
  generateEmbeddingsAndStore,
  processRawText,
  processArrayBuffer,
  processArrayBufferWithMultipleAgents,
  processAndStoreWithMultipleAgents,
  MultiAgentProcessingResult
} from '@/app/actions';
import { PipelineConfig } from '@/lib/agents/pipeline';
import { Button } from '@/components/ui/button';

type Document = {
  identifier: string; title: string; creator?: string; date?: string; format?: string[];
};

type IngestionState = 'idle' | 'downloading' | 'processing' | 'storing' | 'ingested' | 'failed';

type ProcessingMode = 'single' | 'multi';

type AgentConfig = {
  marker: { enabled: boolean; description: string };
  pdf2md: { enabled: boolean; description: string };
  opendocsg: { enabled: boolean; description: string };
};

type MultiAgentState = {
  mode: ProcessingMode;
  agentConfig: AgentConfig;
  synthesisResult?: MultiAgentProcessingResult['synthesisResult'];
  processingReport?: MultiAgentProcessingResult['processingReport'];
};

type InternetArchiveFile = {
  format?: string;
  name?: string;
  size?: string;
};

type InternetArchiveMetadata = {
  files: InternetArchiveFile[];
  [key: string]: unknown;
};

import { withResilience } from '@/lib/resilience';

// Simplified download function using the resilience wrapper
async function downloadFileWithRetry(
  docIdentifier: string,
  filename: string,
  type: 'text' | 'binary'
): Promise<string | ArrayBuffer> {
  const urlStrategies = [
    `https://archive.org/download/${docIdentifier}/${filename}`,
    `https://ia801900.us.archive.org/download/${docIdentifier}/${filename}`, // Alternative CDN
    `https://ia902700.us.archive.org/download/${docIdentifier}/${filename}`, // Alternative CDN
    `https://web.archive.org/web/0id_/${docIdentifier}/${filename}` // Wayback machine fallback
  ];

  const operation = async (url: string) => {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': type === 'text' ? 'text/plain, text/*, */*' : 'application/pdf, application/*, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-cache'
    });

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    if (type === 'text') {
      const text = await response.text();
      if (text.length < 50) {
        throw new Error('Downloaded file appears to be too small or empty');
      }
      return text;
    } else {
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength < 100) {
        throw new Error('Downloaded file appears to be too small or empty');
      }
      return buffer;
    }
  };

  return withResilience(operation, {
    strategies: urlStrategies,
    retryableStatusCodes: [401, 429, 500, 502, 503, 504],
  });
}

function QualityTag({ text, color }: { text: string; color: string }) {
  return <span className={`text-xs font-bold px-2 py-1 rounded-full ${color}`}>{text}</span>;
}

// Helper function to find the best filename from metadata by fetching it client-side
// Enhanced with retry logic and better error handling for Internet Archive API changes
async function getFilename(docIdentifier: string, formats: string[]): Promise<string> {
  const metadataUrl = `https://archive.org/metadata/${docIdentifier}`;

  const operation = async (url: string) => {
    const metadataResponse = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Research-Assistant)',
        'Accept': 'application/json, text/plain, */*',
      },
      cache: 'no-cache'
    });

    if (!metadataResponse.ok) {
      throw new Error(`Metadata fetch failed: ${metadataResponse.status} ${metadataResponse.statusText}`);
    }

    const metadata: InternetArchiveMetadata = await metadataResponse.json();

    if (!metadata.files || !Array.isArray(metadata.files)) {
      throw new Error('Invalid metadata format: missing files array');
    }

    // Prioritize specific formats
    for (const format of formats) {
      const file = metadata.files.find((f: InternetArchiveFile) => f.format === format);
      if (file && file.name) return file.name;
    }

    // Fallback for file extensions if specific format metadata is missing
    const extension = formats[0].includes('Text') ? '.txt' : '.pdf';
    const fileByExt = metadata.files.find((f: InternetArchiveFile) => f.name?.endsWith(extension));
    if (fileByExt && fileByExt.name) return fileByExt.name;

    throw new Error(`No file with supported formats (${formats.join(', ')}) found in ${metadata.files.length} available files.`);
  };

  return withResilience(() => operation(metadataUrl), {
    strategies: [metadataUrl], // Only one strategy, but we want the retry logic
    retryableStatusCodes: [429, 500, 502, 503, 504],
  });
}


// Function to check Internet Archive availability (for potential future use)
// async function checkInternetArchiveStatus(): Promise<boolean> {
//   try {
//     const response = await fetch('https://archive.org/services/search/v1/scrape', {
//       method: 'HEAD',
//       cache: 'no-cache'
//     });
//     return response.ok;
//   } catch {
//     return false;
//   }
// }

export function DocumentItem({ doc }: { doc: Document }) {
  const [ingestState, setIngestState] = useState<IngestionState>('idle');
  const [message, setMessage] = useState<string>('');
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [multiAgentState, setMultiAgentState] = useState<MultiAgentState>({
    mode: 'single',
    agentConfig: {
      marker: { enabled: true, description: 'Advanced PDF parsing with layout preservation' },
      pdf2md: { enabled: true, description: 'Markdown conversion with structure analysis' },
      opendocsg: { enabled: true, description: 'Specialized scientific document processing' }
    }
  });
  const [showAgentConfig, setShowAgentConfig] = useState(false);
  
  const availableMethods = useMemo(() => {
    const formats = new Set(doc.format || []);
    return {
      hasSimpleText: formats.has('Text') || formats.has('DjVuTXT'),
      hasPdf: formats.has('Abbyy GZ') || formats.has('PDF'),
    };
  }, [doc.format]);

  const handleSimpleIngest = async () => {
    setMessage('');
    setIngestState('downloading');
    setMessage('Downloading text file in browser...');
    
    let progressInterval: NodeJS.Timeout | null = null;

    try {
      const filename = await getFilename(doc.identifier, ['Text', 'DjVuTXT']);
      const rawText = await downloadFileWithRetry(doc.identifier, filename, 'text') as string;

      setIngestState('processing');
      setMessage('Processing text on server...');
      setProcessingProgress(0);
      
      // Client-side progress simulation for better UX
      progressInterval = setInterval(() => {
        setProcessingProgress(prev => Math.min(prev + 5, 80));
      }, 500);
      
      const chunkResult = await processRawText(rawText, 10000);
      clearInterval(progressInterval);
      progressInterval = null;
      setProcessingProgress(100);
      
      if (!chunkResult.success || !chunkResult.data) {
        throw new Error(chunkResult.error || 'Failed to process text on server.');
      }

      setIngestState('storing');
      setMessage(`Found ${chunkResult.data.length} chunks. Generating embeddings...`);
      
      try {
        const storeResult = await generateEmbeddingsAndStore(chunkResult.data, doc.identifier, doc.title);
        if (storeResult.success) {
          setIngestState('ingested');
          setMessage(`✅ Successfully ingested ${storeResult.data} chunks with embeddings.`);
        } else {
          throw new Error(storeResult.error || 'Storage failed.');
        }
      } catch (embeddingError) {
        // Graceful degradation: show that text processing worked even if embeddings failed
        setIngestState('ingested');
        setMessage(`⚠️ Text processed (${chunkResult.data.length} chunks) but embeddings failed. RAG queries won't work until embeddings are generated. Error: ${embeddingError instanceof Error ? embeddingError.message : 'Unknown error'}`);
        console.warn('Embedding generation failed, but text processing succeeded:', embeddingError);
      }
    } catch (error) {
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      setIngestState('failed');
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      
      // Enhanced error messages to help users understand the issue
      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        setMessage('Internet Archive requires authentication for downloads. This may be due to recent security changes. Please try again later or contact support.');
      } else if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
        setMessage('Access to this document is currently restricted. The document may be temporarily unavailable.');
      } else if (errorMessage.includes('NetworkError') || errorMessage.includes('Failed to fetch')) {
        setMessage('Network error: Unable to connect to Internet Archive. Please check your internet connection and try again.');
      } else {
        setMessage(`Error: ${errorMessage}`);
      }
    }
  };

  const handleAdvancedIngest = async () => {
    setMessage('');
    setIngestState('downloading');
    setMessage('Downloading PDF in browser...');
    
    let progressInterval: NodeJS.Timeout | null = null;

    try {
      const filename = await getFilename(doc.identifier, ['Abbyy GZ', 'PDF']);
      const buffer = await downloadFileWithRetry(doc.identifier, filename, 'binary');

      // Handle single-agent processing (existing behavior)
      if (multiAgentState.mode === 'single') {
        setIngestState('processing');
        setMessage('Processing PDF on server...');
        setProcessingProgress(0);
        
        // Client-side progress simulation for better UX
        progressInterval = setInterval(() => {
          setProcessingProgress(prev => Math.min(prev + 5, 70));
        }, 800);
        
        const chunkResult = await processArrayBuffer(buffer as ArrayBuffer, 30000);
        clearInterval(progressInterval);
        progressInterval = null;
        setProcessingProgress(100);
        if (!chunkResult.success || !chunkResult.data) {
          throw new Error(chunkResult.error || 'Failed to process PDF on server.');
        }

        setIngestState('storing');
        setMessage(`Found ${chunkResult.data.length} chunks. Generating embeddings...`);
        
        try {
          const storeResult = await generateEmbeddingsAndStore(chunkResult.data, doc.identifier, doc.title);
          if (storeResult.success) {
            setIngestState('ingested');
            setMessage(`✅ Successfully ingested ${storeResult.data} chunks with embeddings.`);
          } else {
            throw new Error(storeResult.error || 'Storage failed.');
          }
        } catch (embeddingError) {
          // Graceful degradation: show that text processing worked even if embeddings failed
          setIngestState('ingested');
          setMessage(`⚠️ Text processed (${chunkResult.data.length} chunks) but embeddings failed. RAG queries won't work until embeddings are generated. Error: ${embeddingError instanceof Error ? embeddingError.message : 'Unknown error'}`);
          console.warn('Embedding generation failed, but text processing succeeded:', embeddingError);
        }
      } else {
        // Handle multi-agent processing
        setIngestState('processing');
        setMessage('Initializing multi-agent processing...');
        setProcessingProgress(0);
        
        // Build pipeline config from UI selections
        const pipelineConfig: Partial<PipelineConfig> = {
          enabledAgents: {
            marker: multiAgentState.agentConfig.marker.enabled,
            pdf2md: multiAgentState.agentConfig.pdf2md.enabled,
            opendocsg: multiAgentState.agentConfig.opendocsg.enabled
          }
        };
        
        // Progress simulation for multi-agent processing
        progressInterval = setInterval(() => {
          setProcessingProgress(prev => {
            if (prev < 30) {
              setMessage('Running parallel agent processing...');
              return prev + 3;
            } else if (prev < 60) {
              setMessage('Agents processing document...');
              return prev + 2;
            } else if (prev < 80) {
              setMessage('Synthesizing results...');
              return prev + 1;
            } else {
              setMessage('Finalizing processing...');
              return Math.min(prev + 0.5, 95);
            }
          });
        }, 1000);
        
        const multiAgentResult = await processAndStoreWithMultipleAgents(
          buffer as ArrayBuffer,
          doc.identifier,
          doc.title,
          pipelineConfig
        );
        
        clearInterval(progressInterval);
        progressInterval = null;
        setProcessingProgress(100);
        
        if (!multiAgentResult.success || !multiAgentResult.data) {
          throw new Error(multiAgentResult.error || 'Multi-agent processing failed.');
        }
        
        // Store processing results for display
        setMultiAgentState(prev => ({
          ...prev,
          processingReport: multiAgentResult.data!.processingReport
        }));
        
        setIngestState('ingested');
        const report = multiAgentResult.data.processingReport;
        setMessage(
          `✅ Multi-agent processing complete! ${multiAgentResult.data.embeddingsStored} chunks ingested. ` +
          `Selected: ${report.selectedAgent} (${report.confidenceLevel} confidence)`
        );
      }
    } catch (error) {
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      setIngestState('failed');
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      
      // Enhanced error messages to help users understand the issue
      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        setMessage('Internet Archive requires authentication for downloads. This may be due to recent security changes. Please try again later or contact support.');
      } else if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
        setMessage('Access to this document is currently restricted. The document may be temporarily unavailable.');
      } else if (errorMessage.includes('NetworkError') || errorMessage.includes('Failed to fetch')) {
        setMessage('Network error: Unable to connect to Internet Archive. Please check your internet connection and try again.');
      } else {
        setMessage(`Error: ${errorMessage}`);
      }
    }
  };
  
  const isWorking = ['downloading', 'processing', 'storing'].includes(ingestState);
  const isDone = ingestState === 'ingested';
  
  const toggleAgent = (agentName: keyof AgentConfig) => {
    setMultiAgentState(prev => ({
      ...prev,
      agentConfig: {
        ...prev.agentConfig,
        [agentName]: {
          ...prev.agentConfig[agentName],
          enabled: !prev.agentConfig[agentName].enabled
        }
      }
    }));
  };
  
  const getEnabledAgentsCount = () => {
    return Object.values(multiAgentState.agentConfig).filter(agent => agent.enabled).length;
  };

  return (
    <li className="p-3 border rounded-md flex justify-between items-start min-h-[88px] gap-4">
      <div className="flex-grow">
        <p className="font-semibold">{doc.title || 'Untitled'}</p>
        <p className="text-xs text-muted-foreground">
          {doc.creator || 'Unknown Author'} ({doc.date ? new Date(doc.date).getFullYear() : 'N/A'})
        </p>
        {message && (
          <div className="mt-1">
            <p className={`text-xs font-bold ${
                ingestState === 'ingested' ? 'text-green-500' 
                : ingestState === 'failed' ? 'text-red-500' 
                : 'text-blue-500'
              }`}
              data-testid="ingestion-status"
            >
              {message}
            </p>
            {ingestState === 'processing' && processingProgress > 0 && (
              <div className="mt-1 w-full bg-gray-200 rounded-full h-1.5">
                <div 
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-300" 
                  style={{ width: `${processingProgress}%` }}
                ></div>
              </div>
            )}
            
            {/* Multi-agent processing results */}
            {isDone && multiAgentState.mode === 'multi' && multiAgentState.processingReport && (
              <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs">
                <div className="font-semibold text-green-800 mb-1">Multi-Agent Results:</div>
                <div className="space-y-1 text-green-700">
                  <div>Selected Agent: <span className="font-medium">{multiAgentState.processingReport.selectedAgent}</span></div>
                  <div>Confidence: <span className="font-medium">{multiAgentState.processingReport.confidenceLevel}</span></div>
                  <div>Reason: {multiAgentState.processingReport.selectionReason}</div>
                  <div className="text-xs text-green-600">
                    {multiAgentState.processingReport.successfulAgents}/{multiAgentState.processingReport.totalAgents} agents succeeded
                  </div>
                  
                  {/* Agent performance details */}
                  {multiAgentState.processingReport.allAgentResults.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-green-600 hover:text-green-800">Agent Details</summary>
                      <div className="mt-1 space-y-1">
                        {multiAgentState.processingReport.allAgentResults.map((result, idx) => (
                          <div key={idx} className={`text-xs p-1 rounded ${
                            result.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            <div className="font-medium">{result.agent}: {result.success ? '✓' : '✗'}</div>
                            <div>{result.wordCount} words, {result.processingTime}ms</div>
                            {result.errors && result.errors.length > 0 && (
                              <div className="text-red-600">{result.errors.join(', ')}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 items-end flex-shrink-0">
        {availableMethods.hasSimpleText && (
          <Button variant="outline" size="sm" onClick={handleSimpleIngest} disabled={isWorking || isDone} data-testid="ingest-text">
            {isWorking ? 'Processing...' : isDone ? 'Ingested' : 'Ingest Text'}
          </Button>
        )}
        {availableMethods.hasPdf && (
          <div className="flex flex-col gap-2">
            {/* Multi-agent mode toggle - only show for PDFs */}
            <div className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                id={`multi-agent-${doc.identifier}`}
                checked={multiAgentState.mode === 'multi'}
                onChange={(e) => {
                  setMultiAgentState(prev => ({
                    ...prev,
                    mode: e.target.checked ? 'multi' : 'single'
                  }));
                  if (!e.target.checked) {
                    setShowAgentConfig(false);
                  }
                }}
                disabled={isWorking || isDone}
                className="w-3 h-3"
              />
              <label htmlFor={`multi-agent-${doc.identifier}`} className="text-muted-foreground cursor-pointer">
                Multi-Agent
              </label>
            </div>
            
            {/* Agent configuration - only show when multi-agent mode is enabled */}
            {multiAgentState.mode === 'multi' && (
              <div className="text-xs border rounded p-2 bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-gray-700">Agent Selection</span>
                  <button
                    onClick={() => setShowAgentConfig(!showAgentConfig)}
                    className="text-blue-600 hover:text-blue-800"
                    disabled={isWorking || isDone}
                  >
                    {showAgentConfig ? 'Hide' : 'Configure'}
                  </button>
                </div>
                
                {showAgentConfig && (
                  <div className="space-y-2">
                    {Object.entries(multiAgentState.agentConfig).map(([agentName, config]) => (
                      <div key={agentName} className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          id={`agent-${agentName}-${doc.identifier}`}
                          checked={config.enabled}
                          onChange={() => toggleAgent(agentName as keyof AgentConfig)}
                          disabled={isWorking || isDone}
                          className="w-3 h-3 mt-0.5"
                        />
                        <div className="flex-1">
                          <label 
                            htmlFor={`agent-${agentName}-${doc.identifier}`} 
                            className="font-medium capitalize cursor-pointer"
                          >
                            {agentName}
                          </label>
                          <div className="text-gray-600 text-xs">{config.description}</div>
                        </div>
                      </div>
                    ))}
                    <div className="text-xs text-gray-500 mt-2">
                      {getEnabledAgentsCount()} of 3 agents enabled
                    </div>
                  </div>
                )}
                
                {!showAgentConfig && (
                  <div className="text-gray-600">
                    {getEnabledAgentsCount()} agents enabled
                  </div>
                )}
              </div>
            )}
            
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={handleAdvancedIngest} 
              disabled={isWorking || isDone || (multiAgentState.mode === 'multi' && getEnabledAgentsCount() === 0)} 
              data-testid="ingest-pdf"
            >
              {isWorking ? 'Processing...' : isDone ? 'Ingested' : 
               multiAgentState.mode === 'multi' ? 'Multi-Agent PDF' : 'Ingest PDF'}
            </Button>
          </div>
        )}
        {!availableMethods.hasSimpleText && !availableMethods.hasPdf && (
           <QualityTag text="No Content" color="bg-gray-200 text-gray-700" />
        )}
      </div>
    </li>
  );
}
