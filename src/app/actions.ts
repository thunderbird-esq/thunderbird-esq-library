// src/app/actions.ts
'use server';

import { ActionResult } from './types';
import * as ai from '@/lib/ai/huggingface';

/**
 * Processes a raw text string that has already been downloaded by the client.
 * @param rawText The raw string content of the document.
 * @returns An ActionResult with the chunks or an error.
 */
export async function processRawText(rawText: string): Promise<ActionResult<string[]>> {
  try {
    if (rawText.length < 100) {
      return { success: false, error: 'Downloaded text is too short to be useful.' };
    }

    const cleanedText = rawText.replace(/-\n/g, '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

    const chunkSize = 500;
    const chunkOverlap = 50;
    const words = cleanedText.split(' ');
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += chunkSize - chunkOverlap) {
      chunks.push(words.slice(i, i + chunkSize).join(' '));
    }
    
    return { success: true, data: chunks };

  } catch (error) {
    console.error('Error in Raw Text processing:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown text processing error.';
    return { success: false, error: errorMessage };
  }
}

/**
 * Processes a PDF that has already been downloaded by the client.
 * @param buffer An ArrayBuffer of the PDF file data.
 * @returns An ActionResult with the chunks or an error.
 */
export async function processArrayBuffer(buffer: ArrayBuffer): Promise<ActionResult<string[]>> {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

    const pdfDoc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    let rawText = '';
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => ('str' in item ? item.str : '')).join(' ');
      rawText += pageText + '\n\n';
    }

    if (!rawText) {
      return { success: false, error: 'Could not extract any text from the PDF.' };
    }

    const cleaningPrompt = `
      The following text was extracted from a PDF. Clean it up by fixing paragraph breaks, 
      correcting obvious OCR errors, and removing headers/footers. Return ONLY the cleaned text.
      RAW TEXT: --- ${rawText.substring(0, 4000)} ---
    `;
    const cleanedText = await ai.chat(cleaningPrompt);

    const chunkSize = 500;
    const chunkOverlap = 50;
    const words = cleanedText.split(/\s+/);
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += chunkSize - chunkOverlap) {
      chunks.push(words.slice(i, i + chunkSize).join(' '));
    }
    
    return { success: true, data: chunks };

  } catch (error) {
    console.error('Error in ArrayBuffer processing:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown PDF processing error.';
    return { success: false, error: errorMessage };
  }
}

/**
 * Generates embeddings for text chunks and stores them in Supabase in batches.
 * @param chunks The array of text chunks.
 * @param documentId The identifier of the source document.
 * @param title The title of the source document.
 * @returns An ActionResult indicating success or failure.
 */
export async function generateEmbeddingsAndStore(
  chunks: string[],
  documentId: string,
  title: string
): Promise<ActionResult<number>> {
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();
  const BATCH_SIZE = 100;

  try {
    const documentsToInsert = [];
    for (const chunk of chunks) {
      const embedding = await ai.embed(chunk);
      documentsToInsert.push({
        document_id: documentId,
        title: title,
        content: chunk,
        embedding: JSON.stringify(embedding),
      });
    }

    for (let i = 0; i < documentsToInsert.length; i += BATCH_SIZE) {
      const batch = documentsToInsert.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from('documents').insert(batch);
      if (error) throw new Error(`Supabase insert failed: ${error.message}`);
    }

    return { success: true, data: documentsToInsert.length };
  } catch (error) {
    console.error('Error storing embeddings:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return { success: false, error: errorMessage };
  }
}

/**
 * Searches the Internet Archive for texts related to a topic, including file format data.
 * @param topic The topic to search for.
 * @returns An ActionResult containing an array of documents or an error.
 */
export async function searchInternetArchive(topic: string): Promise<ActionResult<any[]>> {
  if (!topic) {
    return { success: false, error: 'Search topic cannot be empty.' };
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

  try {
    const response = await fetch(`${searchUrl}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`API call failed with status: ${response.status}`);
    }
    const data = await response.json();
    return { success: true, data: data.response.docs };
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
  if (!prompt) {
    return { success: false, error: 'Prompt cannot be empty.' };
  }
  try {
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
  if (!question) {
    return { success: false, error: 'Question cannot be empty.' };
  }
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();
  try {
    const questionEmbedding = await ai.embed(question);
    const { data: documents, error: matchError } = await supabase.rpc(
      'match_documents',
      {
        query_embedding: JSON.stringify(questionEmbedding),
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
    const contextText = documents.map((doc: any) => `- ${doc.content.trim()}`).join('\n\n');
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
