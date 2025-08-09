// src/app/actions.ts

'use server';

import { HfInference } from '@huggingface/inference';
import * as cheerio from 'cheerio';

// Initialize the Hugging Face Inference client with your API key
const hf = new HfInference(process.env.HUGGING_FACE_API_KEY);

/**
 * Sends a prompt to a Hugging Face chat model and returns the response.
 * @param prompt The user's question or prompt.
 * @returns The AI model's response text.
 */
export async function askModel(prompt: string) {
  try {
    const response = await hf.chatCompletion({
      model: 'mistralai/Mistral-7B-Instruct-v0.2',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
    }, {
      provider: 'featherless-ai' // Force specific provider
    });

    const modelResponse =
      response.choices[0].message?.content || 'Sorry, I could not get a response.';
    return modelResponse;
  } catch (error) {
    console.error('Error calling Hugging Face API:', error);
    return 'There was an error communicating with the AI model. Please check the server logs.';
  }
}

/**
 * Searches the Internet Archive for texts related to a topic.
 * @param topic The topic to search for.
 * @returns A list of documents found.
 */
export async function searchInternetArchive(topic: string) {
  const searchUrl = 'https://archive.org/advancedsearch.php';
  const query = `(title:("${topic}") OR subject:("${topic}") OR description:("${topic}")) AND mediatype:(texts)`;
  const params = new URLSearchParams({
    q: query,
    'fl[]': 'identifier,title,creator,date',
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
    return data.response.docs;
  } catch (error) {
    console.error('Error searching Internet Archive:', error);
    return [];
  }
}

/**
 * Fetches the full text of a document from the Internet Archive and splits it into chunks.
 * This definitive version uses the Internet Archive's metadata API and a prioritized search
 * to find the most reliable plain text file available.
 * @param documentId The identifier of the Internet Archive document.
 * @returns An array of text chunks.
 */
export async function fetchAndChunkText(documentId: string) {
  try {
    // Step 1: Call the metadata API for the specific item
    console.log(`Fetching metadata for ${documentId}...`);
    const metadataUrl = `https://archive.org/metadata/${documentId}`;
    const metadataResponse = await fetch(metadataUrl);
    if (!metadataResponse.ok) {
      throw new Error('Failed to fetch metadata.');
    }
    const metadata = await metadataResponse.json();

    const availableFormats = metadata.files.map((f: any) => ({ name: f.name, format: f.format }));
    console.log('Available file formats:', availableFormats);

    // Step 2: Find a plain text file using a prioritized search
    let textFile;

    // Priority 1: Look for a file explicitly marked with format "Text". This is the gold standard.
    textFile = metadata.files.find((file: any) => file.format === 'Text');

    // Priority 2: If none, look for a non-DjVu .txt file.
    if (!textFile) {
      console.log("No 'Text' format found. Looking for other .txt files...");
      textFile = metadata.files.find((file: any) =>
        file.name.endsWith('.txt') && file.format !== 'DjVuTXT'
      );
    }

    // Priority 3: If still none, fall back to the DjVuTXT file as a last resort.
    if (!textFile) {
      console.log("No other .txt files found. Falling back to DjVuTXT...");
      textFile = metadata.files.find((file: any) => file.format === 'DjVuTXT');
    }

    if (!textFile) {
      throw new Error('No suitable text file found in document metadata after prioritized search.');
    }

    const fileName = textFile.name;
    const downloadUrl = `https://archive.org/download/${documentId}/${fileName}`;
    
    // Step 3: Download the content from the direct file URL
    console.log(`Best file found: '${fileName}' (Format: ${textFile.format}). Downloading from: ${downloadUrl}`);
    const textResponse = await fetch(downloadUrl);
    if (!textResponse.ok) {
      throw new Error(`Failed to download text file from ${downloadUrl}`);
    }
    const rawText = await textResponse.text();

    if (rawText.length < 100) {
        throw new Error('Downloaded text file is too short to be useful.');
    }
    
    console.log('Successfully downloaded raw text content.');

    // Step 3.5: Clean the text
    const cleanedText = rawText
      .replace(/-\n/g, '') // Rejoin words broken by a hyphen and a newline
      .replace(/\n/g, ' ') // Replace all other newlines with a space
      .replace(/\s+/g, ' ') // Collapse multiple whitespace characters into a single space
      .trim();
    
    console.log('Successfully cleaned text content.');

    // Step 4: Chunk the CLEAN text
    const chunkSize = 500;
    const chunkOverlap = 50;
    const words = cleanedText.split(' '); // Split by single space
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += chunkSize - chunkOverlap) {
      const chunk = words.slice(i, i + chunkSize).join(' ');
      chunks.push(chunk);
    }
    console.log(
      `Successfully chunked document ${documentId} into ${chunks.length} chunks.`
    );
    return chunks;
    
  } catch (error) {
    console.error('Error in API-driven fetch/chunk process:', error);
    return [];
  }
}

/**
 * Generates embeddings for text chunks and stores them in the Supabase database.
 * @param chunks The array of text chunks.
 * @param documentId The identifier of the source document.
 * @param title The title of the source document.
 */
export async function generateEmbeddingsAndStore(
  chunks: string[],
  documentId: string,
  title: string
) {
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();

  try {
    const embeddingModel = 'sentence-transformers/all-MiniLM-L6-v2';
    
    const documentsToInsert = [];

    for (const chunk of chunks) {
      const embeddingResponse = await hf.featureExtraction({
        model: embeddingModel,
        inputs: chunk,
      }, {
        provider: 'featherless-ai' // Force specific provider
      });

      const embedding = embeddingResponse as number[];

      if (embedding) {
        documentsToInsert.push({
          document_id: documentId,
          title: title,
          content: chunk,
          embedding: JSON.stringify(embedding),
        });
      } else {
        console.warn(
          `Could not generate embedding for chunk: ${chunk.substring(0, 50)}...`
        );
      }
    }

    if (documentsToInsert.length > 0) {
      const { error } = await supabase.from('documents').insert(documentsToInsert);
      if (error) {
        throw error;
      }
    }

    console.log(
      `Successfully prepared to insert ${documentsToInsert.length} chunks from ${documentId}.`
    );
    return { success: true };
    
  } catch (error) {
    console.error('Error generating embeddings or storing in DB:', error);
    return { success: false, error: 'Failed to process and store document.' };
  }
}

/**
 * Takes a user's question, finds relevant documents in Supabase, and generates a sourced answer.
 * @param question The user's question.
 * @returns A sourced answer from the AI model.
 */
export async function getSourcedAnswer(question: string) {
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();

  const embeddingModel = 'sentence-transformers/all-MiniLM-L6-v2';
  let questionEmbedding;
  try {
    const embeddingResponse = await hf.featureExtraction({
      model: embeddingModel,
      inputs: question,
    }, {
      provider: 'featherless-ai' // Force specific provider
    });
    questionEmbedding = embeddingResponse as number[];
  } catch (error) {
    console.error('Error generating question embedding:', error);
    return "Sorry, I couldn't process your question.";
  }

  const { data: documents, error: matchError } = await supabase.rpc(
    'match_documents',
    {
      query_embedding: JSON.stringify(questionEmbedding),
      match_threshold: 0.5,
      match_count: 5,
    }
  );

  if (matchError) {
    console.error('Error matching documents:', matchError);
    return 'Sorry, I had trouble searching through the documents.';
  }

  if (!documents || documents.length === 0) {
    return "I couldn't find any relevant information in the ingested documents to answer your question.";
  }

  const contextText = documents
    .map((doc: any) => `- ${doc.content.trim()}`)
    .join('\n\n');

  const prompt = `
    Based *only* on the following context from historical documents, please provide a concise answer to the user's question.
    If the context does not contain the answer, state that you cannot answer based on the provided information.

    Context:
    ${contextText}

    User's Question:
    ${question}
  `;

  const finalAnswer = await askModel(prompt);
  return finalAnswer;
}
