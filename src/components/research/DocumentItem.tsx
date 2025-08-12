// src/components/research/DocumentItem.tsx
'use client';

import { useState, useMemo } from 'react';
import {
  generateEmbeddingsAndStore,
  processRawText,
  processArrayBuffer
} from '@/app/actions';
import { Button } from '@/components/ui/button';

type Document = {
  identifier: string; title: string; creator?: string; date?: string; format?: string[];
};

type IngestionState = 'idle' | 'fetching' | 'processing' | 'embedding' | 'success' | 'failed';

type InternetArchiveFile = {
  format?: string;
  name?: string;
  size?: string;
};

type InternetArchiveMetadata = {
  files: InternetArchiveFile[];
  [key: string]: unknown;
};

// Enhanced download function with multiple fallback strategies for Internet Archive
async function downloadFileWithRetry(
  docIdentifier: string, 
  filename: string, 
  type: 'text' | 'binary'
): Promise<string | ArrayBuffer> {
  const maxRetries = 3;
  const baseDelay = 2000; // 2 seconds
  
  // Multiple URL strategies to handle Internet Archive changes
  const urlStrategies = [
    `https://archive.org/download/${docIdentifier}/${filename}`,
    `https://ia801900.us.archive.org/download/${docIdentifier}/${filename}`, // Alternative CDN
    `https://ia902700.us.archive.org/download/${docIdentifier}/${filename}`, // Alternative CDN
    `https://web.archive.org/web/0id_/${docIdentifier}/${filename}` // Wayback machine fallback
  ];
  
  let lastError: Error;
  
  // Try each URL strategy
  for (let strategyIndex = 0; strategyIndex < urlStrategies.length; strategyIndex++) {
    const downloadUrl = urlStrategies[strategyIndex];
    
    // Retry each strategy multiple times
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Attempting download: ${downloadUrl} (strategy ${strategyIndex + 1}, attempt ${attempt})`);
        
        const response = await fetch(downloadUrl, {
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
        
        if (response.ok) {
          console.log(`Download successful: ${downloadUrl}`);
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
        }
        
        // Handle specific HTTP errors
        if (response.status === 401) {
          throw new Error(`Authentication required (401): Internet Archive may have implemented new access restrictions`);
        } else if (response.status === 403) {
          throw new Error(`Access forbidden (403): This document may be restricted`);
        } else if (response.status === 404) {
          throw new Error(`File not found (404): The document file may have been moved or deleted`);
        } else if (response.status === 429) {
          throw new Error(`Rate limited (429): Too many requests to Internet Archive`);
        } else {
          throw new Error(`Download failed: ${response.status} ${response.statusText}`);
        }
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown download error');
        
        console.warn(`Download attempt ${attempt} failed for strategy ${strategyIndex + 1}: ${lastError.message}`);
        
        // If this isn't the last attempt for this strategy, wait before retrying
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1);
          console.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    console.warn(`All attempts failed for strategy ${strategyIndex + 1}, trying next strategy...`);
  }
  
  // If we get here, all strategies and retries failed
  throw new Error(`Failed to download file after trying ${urlStrategies.length} URL strategies with ${maxRetries} attempts each. Last error: ${lastError!.message}`);
}

function QualityTag({ text, color }: { text: string; color: string }) {
  return <span className={`text-xs font-bold px-2 py-1 rounded-full ${color}`}>{text}</span>;
}

// Helper function to find the best filename from metadata by fetching it client-side
// Enhanced with retry logic and better error handling for Internet Archive API changes
async function getFilename(docIdentifier: string, formats: string[]): Promise<string> {
  const metadataUrl = `https://archive.org/metadata/${docIdentifier}`;
  
  // Retry logic for metadata fetch in case of temporary issues
  let lastError: Error;
  const maxRetries = 3;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // This fetch happens in the user's browser, so it will not be blocked.
      const metadataResponse = await fetch(metadataUrl, {
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
      if(fileByExt && fileByExt.name) return fileByExt.name;

      throw new Error(`No file with supported formats (${formats.join(', ')}) found in ${metadata.files.length} available files.`);
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error during metadata fetch');
      
      if (attempt === maxRetries) {
        throw new Error(`Failed to get metadata after ${maxRetries} attempts: ${lastError.message}`);
      }
      
      // Wait before retrying (exponential backoff)
      const delay = 1000 * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
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
  
  const availableMethods = useMemo(() => {
    const formats = new Set(doc.format || []);
    return {
      hasSimpleText: formats.has('Text') || formats.has('DjVuTXT'),
      hasPdf: formats.has('Abbyy GZ') || formats.has('PDF'),
    };
  }, [doc.format]);

  const handleSimpleIngest = async () => {
    setMessage('');
    setIngestState('fetching');
    setMessage('Downloading text file in browser...');

    try {
      const filename = await getFilename(doc.identifier, ['Text', 'DjVuTXT']);
      const rawText = await downloadFileWithRetry(doc.identifier, filename, 'text') as string;

      setIngestState('processing');
      setMessage('Text downloaded. Processing on server...');
      setProcessingProgress(0);
      
      const progressCallback = (progress: { stage: string; percent: number; message: string }) => {
        setProcessingProgress(progress.percent);
        setMessage(`${progress.message} (${progress.percent}%)`);
      };
      
      const chunkResult = await processRawText(rawText, 10000, progressCallback);
      if (!chunkResult.success || !chunkResult.data) {
        throw new Error(chunkResult.error || 'Failed to process text on server.');
      }

      setIngestState('embedding');
      setMessage(`Found ${chunkResult.data.length} chunks. Storing...`);
      const storeResult = await generateEmbeddingsAndStore(chunkResult.data, doc.identifier, doc.title);
      if (storeResult.success) {
        setIngestState('success');
        setMessage(`Ingested ${storeResult.data} chunks.`);
      } else {
        throw new Error(storeResult.error || 'Storage failed.');
      }
    } catch (error) {
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
    setIngestState('fetching');
    setMessage('Downloading PDF in browser...');

    try {
      const filename = await getFilename(doc.identifier, ['Abbyy GZ', 'PDF']);
      const buffer = await downloadFileWithRetry(doc.identifier, filename, 'binary');

      setIngestState('processing');
      setMessage('PDF downloaded. Processing on server...');
      setProcessingProgress(0);
      
      const progressCallback = (progress: { stage: string; percent: number; message: string }) => {
        setProcessingProgress(progress.percent);
        setMessage(`${progress.message} (${progress.percent}%)`);
      };
      
      const chunkResult = await processArrayBuffer(buffer as ArrayBuffer, 30000, progressCallback);
      if (!chunkResult.success || !chunkResult.data) {
        throw new Error(chunkResult.error || 'Failed to process PDF on server.');
      }

      setIngestState('embedding');
      setMessage(`Found ${chunkResult.data.length} chunks. Storing...`);
      const storeResult = await generateEmbeddingsAndStore(chunkResult.data, doc.identifier, doc.title);
      if (storeResult.success) {
        setIngestState('success');
        setMessage(`Ingested ${storeResult.data} chunks.`);
      } else {
        throw new Error(storeResult.error || 'Storage failed.');
      }
    } catch (error) {
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
  
  const isWorking = ['fetching', 'processing', 'embedding'].includes(ingestState);
  const isDone = ingestState === 'success';

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
                ingestState === 'success' ? 'text-green-500' 
                : ingestState === 'failed' ? 'text-red-500' 
                : 'text-blue-500'
              }`}
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
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 items-end flex-shrink-0">
        {availableMethods.hasSimpleText && (
          <Button variant="outline" size="sm" onClick={handleSimpleIngest} disabled={isWorking || isDone}>
            {isWorking ? 'Processing...' : isDone ? 'Ingested' : 'Ingest Text'}
          </Button>
        )}
        {availableMethods.hasPdf && (
          <Button variant="secondary" size="sm" onClick={handleAdvancedIngest} disabled={isWorking || isDone}>
            {isWorking ? 'Processing...' : isDone ? 'Ingested' : 'Ingest PDF'}
          </Button>
        )}
        {!availableMethods.hasSimpleText && !availableMethods.hasPdf && (
           <QualityTag text="No Content" color="bg-gray-200 text-gray-700" />
        )}
      </div>
    </li>
  );
}
