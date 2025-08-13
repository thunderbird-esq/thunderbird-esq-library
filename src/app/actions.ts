// src/app/actions.ts
'use server';

import { ActionResult, InternetArchiveDocument, MatchedDocument } from './types';
import * as ai from '@/lib/ai/huggingface';
import { fixOcrErrorsAsync } from '@/lib/text-processing';


/**
 * Wrapper function to apply OCR correction with timeout protection.
 * Falls back to basic text cleaning if OCR correction times out.
 * @param text Raw text to process
 * @param timeoutMs Timeout in milliseconds
 * @param progressCallback Optional progress callback
 * @returns Processed text
 */
async function processOcrWithTimeout(
  text: string, 
  timeoutMs: number,
  progressCallback?: (progress: { stage: string; percent: number; message: string }) => void
): Promise<string> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`OCR correction timeout after ${timeoutMs}ms`)), timeoutMs);
  });

  const ocrPromise = async (): Promise<string> => {
    try {
      // Use async OCR correction with yielding support
      const result = await fixOcrErrorsAsync(text);
      return result;
    } catch (error) {
      console.warn('OCR correction failed, using basic cleanup:', error);
      // Fallback to basic text cleaning
      const basicClean = text
        .replace(/-\n/g, '')
        .replace(/\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return basicClean;
    }
  };

  try {
    const result = await Promise.race([ocrPromise(), timeoutPromise]);
    progressCallback?.({ stage: 'ocr_correction', percent: 75, message: 'OCR correction completed' });
    return result;
  } catch {
    // Timeout occurred, use basic cleanup
    console.warn('OCR correction timed out, using basic text cleanup');
    progressCallback?.({ stage: 'ocr_correction', percent: 75, message: 'Using basic text cleanup due to timeout' });
    
    const basicClean = text
      .replace(/-\n/g, '')
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return basicClean;
  }
}

/**
 * Processes a raw text string that has already been downloaded by the client.
 * Enhanced with timeout protection and async yielding to prevent event loop blocking.
 * @param rawText The raw string content of the document.
 * @param timeoutMs Optional timeout in milliseconds (default: 10000ms)
 * @param progressCallback Optional callback for progress updates
 * @returns An ActionResult with the chunks or an error.
 */
export async function processRawText(
  rawText: string, 
  timeoutMs: number = 10000,
  progressCallback?: (progress: { stage: string; percent: number; message: string }) => void
): Promise<ActionResult<string[]>> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Text processing timeout after ${timeoutMs}ms`)), timeoutMs);
  });

  const processingPromise = async (): Promise<ActionResult<string[]>> => {
    try {
      progressCallback?.({ stage: 'validation', percent: 5, message: 'Validating input text' });
      
      if (rawText.length < 100) {
        return { success: false, error: 'Downloaded text is too short to be useful.' };
      }

      progressCallback?.({ stage: 'cleaning', percent: 20, message: 'Cleaning text formatting' });
      
      // Yield control to prevent event loop blocking during large text processing
      await new Promise(resolve => setTimeout(resolve, 0));
      
      const cleanedText = rawText.replace(/-\n/g, '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

      progressCallback?.({ stage: 'chunking', percent: 50, message: 'Creating text chunks' });
      
      const chunkSize = 500;
      const chunkOverlap = 50;
      const words = cleanedText.split(' ');
      const chunks: string[] = [];
      
      // Process chunks in batches to yield control periodically
      const BATCH_SIZE = 1000; // Process 1000 chunks at a time
      for (let i = 0; i < words.length; i += chunkSize - chunkOverlap) {
        chunks.push(words.slice(i, i + chunkSize).join(' '));
        
        // Yield control every BATCH_SIZE chunks to prevent blocking
        if (chunks.length % BATCH_SIZE === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
          const progress = Math.min(90, 50 + (chunks.length / Math.ceil(words.length / (chunkSize - chunkOverlap))) * 40);
          progressCallback?.({ 
            stage: 'chunking', 
            percent: Math.round(progress), 
            message: `Created ${chunks.length} chunks` 
          });
        }
      }
      
      progressCallback?.({ stage: 'complete', percent: 100, message: `Processing complete: ${chunks.length} chunks created` });
      return { success: true, data: chunks };

    } catch (processingError) {
      console.error('Error in Raw Text processing:', processingError);
      const errorMessage = processingError instanceof Error ? processingError.message : 'Unknown text processing error.';
      return { success: false, error: errorMessage };
    }
  };

  try {
    // Race between processing and timeout
    return await Promise.race([processingPromise(), timeoutPromise]);
  } catch (error) {
    console.error('Error in Raw Text processing:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown text processing error.';
    
    // If timeout, provide graceful fallback with basic processing
    if (errorMessage.includes('timeout')) {
      progressCallback?.({ stage: 'fallback', percent: 100, message: 'Using fallback processing due to timeout' });
      
      try {
        // Simple fallback processing without advanced features
        const simpleClean = rawText.replace(/-\n/g, '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
        const words = simpleClean.split(' ');
        const chunks: string[] = [];
        const chunkSize = 500;
        for (let i = 0; i < words.length; i += chunkSize) {
          chunks.push(words.slice(i, i + chunkSize).join(' '));
        }
        return { success: true, data: chunks };
      } catch {
        return { success: false, error: `Processing timeout and fallback failed: ${errorMessage}` };
      }
    }
    
    return { success: false, error: errorMessage };
  }
}

/**
 * Processes a PDF that has already been downloaded by the client.
 * Enhanced with timeout protection, async yielding, and memory-aware processing
 * to prevent event loop blocking and handle large documents efficiently.
 * Extracts text using PDF.js and applies deterministic OCR error correction
 * to fix common character recognition errors, spacing issues, and formatting problems.
 * @param buffer An ArrayBuffer of the PDF file data.
 * @param timeoutMs Optional timeout in milliseconds (default: 30000ms)
 * @param progressCallback Optional callback for progress updates
 * @returns An ActionResult with the chunks or an error.
 */
export async function processArrayBuffer(
  buffer: ArrayBuffer,
  timeoutMs: number = 30000,
  progressCallback?: (progress: { stage: string; percent: number; message: string }) => void
): Promise<ActionResult<string[]>> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`PDF processing timeout after ${timeoutMs}ms`)), timeoutMs);
  });

  const processingPromise = async (): Promise<ActionResult<string[]>> => {
    try {
      progressCallback?.({ stage: 'initialization', percent: 5, message: 'Loading PDF.js library' });
      
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

      progressCallback?.({ stage: 'parsing', percent: 10, message: 'Parsing PDF document' });
      const pdfDoc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
      
      // Memory-aware processing limits for Edge Runtime
      const MAX_PAGES_EDGE_RUNTIME = 200;
      const actualPages = Math.min(pdfDoc.numPages, MAX_PAGES_EDGE_RUNTIME);
      
      if (pdfDoc.numPages > MAX_PAGES_EDGE_RUNTIME) {
        console.warn(`PDF has ${pdfDoc.numPages} pages, processing first ${MAX_PAGES_EDGE_RUNTIME} for Edge Runtime compatibility`);
        progressCallback?.({ 
          stage: 'parsing', 
          percent: 15, 
          message: `Large PDF detected: processing first ${MAX_PAGES_EDGE_RUNTIME} of ${pdfDoc.numPages} pages` 
        });
      }
      
      let rawText = '';
      const BATCH_SIZE = 5; // Process 5 pages at a time to prevent blocking
      
      for (let batchStart = 1; batchStart <= actualPages; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, actualPages);
        
        // Process batch of pages
        for (let i = batchStart; i <= batchEnd; i++) {
          const page = await pdfDoc.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map(item => ('str' in item ? item.str : '')).join(' ');
          rawText += pageText + '\n\n';
        }
        
        // Yield control after each batch to prevent event loop blocking
        await new Promise(resolve => setTimeout(resolve, 0));
        
        const progress = 15 + (batchEnd / actualPages) * 40;
        progressCallback?.({ 
          stage: 'extraction', 
          percent: Math.round(progress), 
          message: `Extracted text from ${batchEnd}/${actualPages} pages` 
        });
      }

      if (!rawText) {
        return { success: false, error: 'Could not extract any text from the PDF.' };
      }

      progressCallback?.({ stage: 'ocr_correction', percent: 60, message: 'Applying OCR error correction' });
      
      // Yield control before OCR processing
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // Apply deterministic OCR error correction with timeout protection
      const cleanedText = await processOcrWithTimeout(rawText, timeoutMs - 15000, progressCallback);

      progressCallback?.({ stage: 'chunking', percent: 80, message: 'Creating text chunks' });
      
      // Yield control before chunking
      await new Promise(resolve => setTimeout(resolve, 0));
      
      const chunkSize = 500;
      const chunkOverlap = 50;
      const words = cleanedText.split(/\s+/);
      const chunks: string[] = [];
      
      // Process chunks in batches to yield control periodically
      const CHUNK_BATCH_SIZE = 1000;
      for (let i = 0; i < words.length; i += chunkSize - chunkOverlap) {
        chunks.push(words.slice(i, i + chunkSize).join(' '));
        
        // Yield control every CHUNK_BATCH_SIZE chunks
        if (chunks.length % CHUNK_BATCH_SIZE === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
          const progress = 80 + (chunks.length / Math.ceil(words.length / (chunkSize - chunkOverlap))) * 20;
          progressCallback?.({ 
            stage: 'chunking', 
            percent: Math.round(progress), 
            message: `Created ${chunks.length} chunks` 
          });
        }
      }
      
      progressCallback?.({ stage: 'complete', percent: 100, message: `Processing complete: ${chunks.length} chunks from ${actualPages} pages` });
      return { success: true, data: chunks };

    } catch (processingError) {
      console.error('Error in ArrayBuffer processing:', processingError);
      const errorMessage = processingError instanceof Error ? processingError.message : 'Unknown PDF processing error.';
      return { success: false, error: errorMessage };
    }
  };

  try {
    // Race between processing and timeout
    return await Promise.race([processingPromise(), timeoutPromise]);
  } catch (error) {
    console.error('Error in ArrayBuffer processing:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown PDF processing error.';
    
    // If timeout, provide graceful fallback with basic processing
    if (errorMessage.includes('timeout')) {
      progressCallback?.({ stage: 'fallback', percent: 100, message: 'Using fallback processing due to timeout' });
      
      try {
        // Simple fallback: attempt basic PDF text extraction without OCR correction
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const pdfDoc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
        
        // Only process first 10 pages for fallback
        const maxPagesForFallback = Math.min(pdfDoc.numPages, 10);
        let fallbackText = '';
        
        for (let i = 1; i <= maxPagesForFallback; i++) {
          const page = await pdfDoc.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map(item => ('str' in item ? item.str : '')).join(' ');
          fallbackText += pageText + '\n\n';
        }
        
        if (fallbackText.trim()) {
          // Simple chunking without OCR correction
          const words = fallbackText.trim().split(/\s+/);
          const chunks: string[] = [];
          const chunkSize = 500;
          for (let i = 0; i < words.length; i += chunkSize) {
            chunks.push(words.slice(i, i + chunkSize).join(' '));
          }
          return { success: true, data: chunks };
        }
        
        return { success: false, error: `PDF processing timeout and no text extracted in fallback mode` };
      } catch {
        return { success: false, error: `PDF processing timeout and fallback failed: ${errorMessage}` };
      }
    }
    
    return { success: false, error: errorMessage };
  }
}

/**
 * Generates embeddings for text chunks and stores them in Supabase in batches.
 * Enhanced with production-level resilience features:
 * - Retry logic for failed API calls
 * - Partial batch failure recovery
 * - Input validation and sanitization
 * - Progress tracking and comprehensive logging
 * - Graceful degradation for large document processing
 * 
 * @param chunks The array of text chunks.
 * @param documentId The identifier of the source document.
 * @param title The title of the source document.
 * @returns An ActionResult indicating success or failure with detailed processing stats.
 */
export async function generateEmbeddingsAndStore(
  chunks: string[],
  documentId: string,
  title: string
): Promise<ActionResult<number>> {
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();
  const BATCH_SIZE = 100;
  
  // Configuration constants for production resilience
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 1000; // 1 second base delay, exponential backoff
  const MAX_CHUNK_LENGTH = 8000; // Reasonable limit for embedding models
  const MIN_CHUNK_LENGTH = 10; // Minimum meaningful chunk size
  
  // Input validation with detailed error messages
  if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
    return { success: false, error: 'Invalid input: chunks must be a non-empty array' };
  }
  
  if (!documentId || typeof documentId !== 'string' || documentId.trim().length === 0) {
    return { success: false, error: 'Invalid input: documentId must be a non-empty string' };
  }
  
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return { success: false, error: 'Invalid input: title must be a non-empty string' };
  }

  // Sanitize and validate chunks
  const validatedChunks = chunks
    .map((chunk, index) => ({ chunk: chunk?.toString().trim() || '', originalIndex: index }))
    .filter(({ chunk, originalIndex }) => {
      if (chunk.length < MIN_CHUNK_LENGTH) {
        console.warn(`Skipping chunk ${originalIndex}: too short (${chunk.length} chars)`);
        return false;
      }
      if (chunk.length > MAX_CHUNK_LENGTH) {
        console.warn(`Truncating chunk ${originalIndex}: too long (${chunk.length} chars)`);
        return true; // We'll truncate it below
      }
      return true;
    })
    .map(({ chunk, originalIndex }) => ({
      content: chunk.length > MAX_CHUNK_LENGTH ? chunk.substring(0, MAX_CHUNK_LENGTH) + '...' : chunk,
      originalIndex
    }));

  if (validatedChunks.length === 0) {
    return { success: false, error: 'No valid chunks found after validation' };
  }

  console.log(`Starting embedding generation for ${validatedChunks.length}/${chunks.length} valid chunks`);

  try {
    // Retry wrapper for embedding generation with exponential backoff
    const generateEmbeddingWithRetry = async (chunk: string, chunkIndex: number): Promise<number[] | null> => {
      let lastError: Error | null = null;
      
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const embedding = await ai.embed(chunk);
          if (attempt > 1) {
            console.log(`Chunk ${chunkIndex}: succeeded on attempt ${attempt}`);
          }
          return embedding;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Unknown embedding error');
          const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1); // Exponential backoff
          
          console.warn(`Chunk ${chunkIndex} attempt ${attempt}/${MAX_RETRIES} failed: ${lastError.message}`);
          
          if (attempt < MAX_RETRIES) {
            console.log(`Retrying chunk ${chunkIndex} in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      console.error(`Chunk ${chunkIndex}: failed after ${MAX_RETRIES} attempts. Final error: ${lastError?.message}`);
      return null; // Return null for failed embeddings to continue processing
    };

    // Process embeddings with progress tracking
    const documentsToInsert = [];
    let successfulEmbeddings = 0;
    let failedEmbeddings = 0;
    
    for (let i = 0; i < validatedChunks.length; i++) {
      const { content, originalIndex } = validatedChunks[i];
      
      // Progress logging for large jobs
      if (validatedChunks.length > 50 && (i + 1) % 25 === 0) {
        console.log(`Embedding progress: ${i + 1}/${validatedChunks.length} chunks processed`);
      }
      
      const embedding = await generateEmbeddingWithRetry(content, originalIndex);
      
      if (embedding) {
        documentsToInsert.push({
          document_id: documentId,
          title: title,
          content: content,
          embedding: embedding,
        });
        successfulEmbeddings++;
      } else {
        failedEmbeddings++;
      }
    }

    if (documentsToInsert.length === 0) {
      return { 
        success: false, 
        error: `All embedding generations failed. Processed ${validatedChunks.length} chunks, 0 successful.` 
      };
    }

    console.log(`Embedding phase complete: ${successfulEmbeddings} successful, ${failedEmbeddings} failed`);

    // Database insertion with partial batch failure recovery
    let successfulInserts = 0;
    let failedBatches = 0;
    const batchErrors = [];

    for (let i = 0; i < documentsToInsert.length; i += BATCH_SIZE) {
      const batch = documentsToInsert.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(documentsToInsert.length / BATCH_SIZE);
      
      try {
        const { error } = await supabase.from('documents').insert(batch);
        
        if (error) {
          throw new Error(`Supabase insert failed: ${error.message}`);
        }
        
        successfulInserts += batch.length;
        
        // Progress logging for batch operations
        if (totalBatches > 1) {
          console.log(`Database batch ${batchNumber}/${totalBatches} completed: ${batch.length} documents inserted`);
        }
        
      } catch (error) {
        failedBatches++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown database error';
        batchErrors.push(`Batch ${batchNumber}: ${errorMsg}`);
        
        console.error(`Database batch ${batchNumber} failed: ${errorMsg}`);
        
        // For production resilience, continue with remaining batches rather than failing entirely
        // This allows partial success in large ingestion jobs
      }
    }

    // Determine final result based on success/failure ratios
    const totalAttemptedInserts = documentsToInsert.length;
    const successRate = successfulInserts / totalAttemptedInserts;
    
    if (successfulInserts === 0) {
      return { 
        success: false, 
        error: `Complete database insertion failure. Errors: ${batchErrors.join('; ')}` 
      };
    }
    
    if (successRate >= 0.9) {
      // 90% or higher success rate - consider this a success
      if (failedBatches > 0) {
        console.warn(`Partial success: ${successfulInserts}/${totalAttemptedInserts} documents inserted. Failed batches: ${failedBatches}`);
      }
      return { 
        success: true, 
        data: successfulInserts 
      };
    } else {
      // Below 90% success rate - return as failure but with partial results info
      return { 
        success: false, 
        error: `Low success rate: only ${successfulInserts}/${totalAttemptedInserts} documents inserted (${Math.round(successRate * 100)}%). Batch errors: ${batchErrors.join('; ')}` 
      };
    }

  } catch (error) {
    console.error('Unexpected error in generateEmbeddingsAndStore:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during embedding generation.';
    return { 
      success: false, 
      error: `Embedding and storage process failed: ${errorMessage}` 
    };
  }
}

/**
 * Searches the Internet Archive for texts related to a topic, including file format data.
 * @param topic The topic to search for.
 * @returns An ActionResult containing an array of documents or an error.
 */
export async function searchInternetArchive(topic: string): Promise<ActionResult<InternetArchiveDocument[]>> {
  try {
    if (!topic) {
      throw new Error('Search topic cannot be empty.');
    }
    const searchUrl = 'https://archive.org/advancedsearch.php';
    const query = `(title:("${topic}") OR subject:("${topic}") OR description:("${topic}")) AND mediatype:(texts)`;
    const params = new URLSearchParams({
      q: query,
      'fl[]': 'identifier,title,creator,date,format',
      rows: '20',
      page: '1',
      output: 'json',
    });

    const response = await fetch(`${searchUrl}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`API call failed with status: ${response.status}`);
    }
    const data = await response.json();

    // **FIX:** Check if 'response' and 'docs' exist before accessing them.
    const documents = data.response?.docs || [];

    return { success: true, data: documents };
  } catch (error) {
    console.error('Error searching Internet Archive:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return { success: false, error: `Internet Archive search failed: ${errorMessage}` };
  }
}

/**
 * Sends a prompt to the configured AI chat model.
 * @param prompt The user's question or prompt.
 * @returns An ActionResult containing the AI's response string or an error.
 */
export async function askModel(prompt: string): Promise<ActionResult<string>> {
  try {
    if (!prompt) {
      throw new Error('Prompt cannot be empty.');
    }
    const modelResponse = await ai.chat(prompt);
    return { success: true, data: modelResponse };
  } catch (error) {
    console.error('Error in askModel:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return { success: false, error: `AI model request failed: ${errorMessage}` };
  }
}

/**
 * Takes a user's question, finds relevant documents, and generates a sourced answer.
 * @param question The user's question.
 * @returns An ActionResult containing the sourced answer string or an error.
 */
export async function getSourcedAnswer(question: string): Promise<ActionResult<string>> {
  try {
    if (!question) {
      throw new Error('Question cannot be empty.');
    }
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();
    const questionEmbedding = await ai.embed(question);
    const { data: documents, error: matchError } = await supabase.rpc(
      'match_documents',
      {
        query_embedding: questionEmbedding,
        match_threshold: 0.5,
        match_count: 5,
      }
    );
    if (matchError) throw new Error(`Error matching documents: ${matchError.message}`);
    if (!documents || documents.length === 0) {
      return {
        success: true,
        data: "I couldn't find any relevant information in the ingested documents to answer your question."
      };
    }
    const contextText = documents.map((doc: MatchedDocument) => `- ${doc.content.trim()}`).join('\n\n');
    const prompt = `
      Based *only* on the following context from historical documents, please provide a concise answer to the user's question.
      If the context does not contain the answer, state that you cannot answer based on the provided information.

      Context:
      ${contextText}

      User's Question:
      ${question}
    `;
    const finalAnswer = await ai.chat(prompt);
    return { success: true, data: finalAnswer };
  } catch (error) {
    console.error('Error in getSourcedAnswer:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return { success: false, error: `Failed to get sourced answer: ${errorMessage}` };
  }
}
