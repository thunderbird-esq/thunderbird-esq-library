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

function QualityTag({ text, color }: { text: string; color: string }) {
  return <span className={`text-xs font-bold px-2 py-1 rounded-full ${color}`}>{text}</span>;
}

// Helper function to find the best filename from metadata by fetching it client-side
async function getFilename(docIdentifier: string, formats: string[]): Promise<string> {
  const metadataUrl = `https://archive.org/metadata/${docIdentifier}`;
  // This fetch happens in the user's browser, so it will not be blocked.
  const metadataResponse = await fetch(metadataUrl);
  if (!metadataResponse.ok) throw new Error('Failed to fetch metadata to find filename.');
  const metadata = await metadataResponse.json();
  
  // Prioritize specific formats
  for (const format of formats) {
    const file = metadata.files.find((f: any) => f.format === format);
    if (file) return file.name;
  }

  // Fallback for file extensions if specific format metadata is missing
  const extension = formats[0].includes('Text') ? '.txt' : '.pdf';
  const fileByExt = metadata.files.find((f: any) => f.name.endsWith(extension));
  if(fileByExt) return fileByExt.name;

  throw new Error(`No file with supported formats (${formats.join(', ')}) found.`);
}


export function DocumentItem({ doc }: { doc: Document }) {
  const [ingestState, setIngestState] = useState<IngestionState>('idle');
  const [message, setMessage] = useState<string>('');
  
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
      const downloadUrl = `https://archive.org/download/${doc.identifier}/${filename}`;
      
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error(`Failed to download text file: ${response.statusText}`);
      const rawText = await response.text();

      setIngestState('processing');
      setMessage('Text downloaded. Processing on server...');
      const chunkResult = await processRawText(rawText);
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
      setMessage(errorMessage);
    }
  };

  const handleAdvancedIngest = async () => {
    setMessage('');
    setIngestState('fetching');
    setMessage('Downloading PDF in browser...');

    try {
      const filename = await getFilename(doc.identifier, ['Abbyy GZ', 'PDF']);
      const downloadUrl = `https://archive.org/download/${doc.identifier}/${filename}`;

      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error(`Failed to download PDF: ${response.statusText}`);
      const buffer = await response.arrayBuffer();

      setIngestState('processing');
      setMessage('PDF downloaded. Processing on server...');
      const chunkResult = await processArrayBuffer(buffer);
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
      setMessage(errorMessage);
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
          <p className={`mt-1 text-xs font-bold ${
              ingestState === 'success' ? 'text-green-500' 
              : ingestState === 'failed' ? 'text-red-500' 
              : 'text-blue-500'
            }`}
          >
            {message}
          </p>
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
