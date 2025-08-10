DEVLOG: AI Research Assistant
This document chronicles the development and debugging process of the AI Research Assistant application, built between August 8th and August 9th, 2025.

Project Goal
The initial goal was to create a Next.js web application that could leverage Large Language Models (LLMs) from Hugging Face to query a knowledge base built from documents sourced from the Internet Archive API. The core technology is a Retrieval-Augmented Generation (RAG) pipeline, with a Supabase vector database serving as the long-term memory for the AI.

Development Timeline & Key Milestones
1. Foundation & Setup (Step 1)
The project began with a solid, modern tech stack:

Framework: Next.js 15 with App Router and TypeScript.

Styling: Tailwind CSS.

UI Components: Shadcn/UI.

Backend: Supabase (Postgres with pgvector, Auth).

The initial setup was smooth, involving initializing the Next.js project, setting up Shadcn, creating a Supabase project, and securely storing API keys in a .env.local file. A comprehensive .gitignore was established early on to ensure no secrets were committed.

2. Core API Connectivity (Step 2)
We successfully built the two primary server actions:

An action to communicate with the Hugging Face Inference API to get responses from a generative model (mistralai/Mistral-7B-Instruct-v0.2).

An action to query the Internet Archive's public search API to find relevant documents based on a user's topic.

A test page (/test-api) was created to validate these connections. Early UI bugs, such as buttons firing multiple actions, were quickly resolved by adding the type="button" attribute.

3. The RAG Pipeline: Ingestion & Debugging (Step 3)
This was the most intensive and iterative part of the development process. Our goal was to create a pipeline to fetch, process, and store document content.

Initial Attempt (Web Scraping): The first version of fetchAndChunkText attempted to guess the URL of a document's plain text file. This failed immediately due to the inconsistency of URL formats on the Internet Archive.

Improving Robustness: The function was refactored to try a list of potential URL formats. This worked for some documents but failed for others, leading to the discovery of "phantom files"—files listed in the metadata that were not actually available for download.

The API-Driven Solution: We pivoted to a much more reliable method. The fetchAndChunkText function was completely rewritten to first call the Internet Archive's /metadata API. This allowed us to get a definitive list of all files associated with a document and intelligently search for the best available text source.

Data Quality Issues: This is where the project met the reality of real-world data.

Bad OCR: The first successfully ingested documents (like the Charlotte Baker diaries) contained gibberish text due to poor Optical Character Recognition (OCR) on the original scans.

HTML Contamination: Later attempts downloaded HTML pages instead of plain text, filling our database with website code instead of document content.

Corrupted Text: Even with better documents, we found that the raw text files contained formatting artifacts (like hyphenated line breaks) that corrupted our chunks.

The Final Data Pipeline: To solve these data quality issues, we implemented two final, critical improvements:

A prioritized file search that looks for the highest-quality text formats first before falling back to lower-quality ones.

A text cleaning step that uses regular expressions to sanitize the downloaded text, removing unwanted line breaks and whitespace before the chunking process.

4. Backend & Database Refinements
Several backend issues were identified and resolved:

Supabase pgvector: The vector extension was enabled, and a documents table with a match_documents SQL function was created.

Vector Insertion Bug: We discovered that the pgvector extension requires vector arrays to be passed as a JSON string, which was fixed with a JSON.stringify() call.

Next.js 15 cookies() Error: A persistent terminal error was traced to a breaking change in Next.js 15, which made the cookies() function asynchronous. This was resolved by updating our Supabase server client (/lib/supabase/server.ts) and adding await to all createClient() calls in our server actions.

Bulk Inserts: To improve efficiency and error handling, the database insertion logic was refactored to perform a single bulk insert for all of a document's chunks, rather than one insert per chunk.

Current Status (As of August 9, 2025)
The application is a functionally complete proof-of-concept. The entire RAG pipeline works from end to end. We can successfully search for documents, ingest them through a hardened and resilient data pipeline, and ask questions that receive sourced answers based on the clean, ingested content.

Known Issues & Next Steps
Hugging Face API Performance: The free, shared Inference API is slow, leading to long wait times for answers.

Solution: Implement streaming responses using the Vercel AI SDK to dramatically improve the user experience.

Supabase 1MB Request Limit: The current bulk insert method sends all chunks in a single request. For very large documents (>250-300 chunks), this may exceed the 1MB request payload limit on Supabase's free tier.

Solution: Implement "batching" for the bulk insert. Instead of sending all 270+ chunks at once, send them in batches of 100.

Source Data Quality: The ultimate limiting factor is the quality of the source documents from the Internet Archive. Our pipeline is robust, but it cannot fix fundamentally poor OCR. The application works best with high-quality, modern documents.

UI/UX: The current interface is a developer test page.

Solution: Build a dedicated, polished chat interface that manages conversation history and provides a better user experience. Implement user accounts with Supabase Auth to give each user their own private knowledge base.

---

DEVLOG: AI Research Assistant
This document chronicles the development and debugging process of the AI Research Assistant application, built between August 8th and August 9th, 2025.

Project Goal
The initial goal was to create a Next.js web application that could leverage Large Language Models (LLMs) from Hugging Face to query a knowledge base built from documents sourced from the Internet Archive API. The core technology is a Retrieval-Augmented Generation (RAG) pipeline, with a Supabase vector database serving as the long-term memory for the AI.

Development Timeline & Key Milestones

Foundation & Setup (Step 1)
The project began with a solid, modern tech stack:

Framework: Next.js 15 with App Router and TypeScript.

Styling: Tailwind CSS.

UI Components: Shadcn/UI.

Backend: Supabase (Postgres with pgvector, Auth).

The initial setup was smooth, involving initializing the Next.js project, setting up Shadcn, creating a Supabase project, and securely storing API keys in a .env.local file. A comprehensive .gitignore was established early on to ensure no secrets were committed.

Core API Connectivity (Step 2)
We successfully built the two primary server actions:

An action to communicate with the Hugging Face Inference API to get responses from a generative model (mistralai/Mistral-7B-Instruct-v0.2).

An action to query the Internet Archive's public search API to find relevant documents based on a user's topic.

A test page (/test-api) was created to validate these connections. Early UI bugs, such as buttons firing multiple actions, were quickly resolved by adding the type="button" attribute.

The RAG Pipeline: Ingestion & Debugging (Step 3)
This was the most intensive and iterative part of the development process. Our goal was to create a pipeline to fetch, process, and store document content.

Initial Attempt (Web Scraping): The first version of fetchAndChunkText attempted to guess the URL of a document's plain text file. This failed immediately due to the inconsistency of URL formats on the Internet Archive.

Improving Robustness: The function was refactored to try a list of potential URL formats. This worked for some documents but failed for others, leading to the discovery of "phantom files"—files listed in the metadata that were not actually available for download.

The API-Driven Solution: We pivoted to a much more reliable method. The fetchAndChunkText function was completely rewritten to first call the Internet Archive's /metadata API. This allowed us to get a definitive list of all files associated with a document and intelligently search for the best available text source.

Data Quality Issues: This is where the project met the reality of real-world data.

Bad OCR: The first successfully ingested documents (like the Charlotte Baker diaries) contained gibberish text due to poor Optical Character Recognition (OCR) on the original scans.

HTML Contamination: Later attempts downloaded HTML pages instead of plain text, filling our database with website code instead of document content.

Corrupted Text: Even with better documents, we found that the raw text files contained formatting artifacts (like hyphenated line breaks) that corrupted our chunks.

The Final Data Pipeline: To solve these data quality issues, we implemented two final, critical improvements:

A prioritized file search that looks for the highest-quality text formats first before falling back to lower-quality ones.

A text cleaning step that uses regular expressions to sanitize the downloaded text, removing unwanted line breaks and whitespace before the chunking process.

Backend & Database Refinements
Several backend issues were identified and resolved:

Supabase pgvector: The vector extension was enabled, and a documents table with a match_documents SQL function was created.

Vector Insertion Bug: We discovered that the pgvector extension requires vector arrays to be passed as a JSON string, which was fixed with a JSON.stringify() call.

Next.js 15 cookies() Error: A persistent terminal error was traced to a breaking change in Next.js 15, which made the cookies() function asynchronous. This was resolved by updating our Supabase server client (/lib/supabase/server.ts) and adding await to all createClient() calls in our server actions.

Bulk Inserts: To improve efficiency and error handling, the database insertion logic was refactored to perform a single bulk insert for all of a document's chunks, rather than one insert per chunk.

Current Status (As of August 9, 2025)
The application is a functionally complete proof-of-concept. The entire RAG pipeline works from end to end. We can successfully search for documents, ingest them through a hardened and resilient data pipeline, and ask questions that receive sourced answers based on the clean, ingested content.

DEVLOG ENTRY: August 9, 2025 (Evening) - Architectural Overhaul & Ingestion Hardening
The initial success of the RAG pipeline was met with a significant real-world challenge: the unreliability of server-side data fetching and the complexities of PDF processing. The "spotty" nature of ingestion failures required a fundamental architectural change to ensure stability.

1. Failure Analysis: Server-Side Downloading is Untenable
Our initial ingestion logic, located in actions.ts, performed all file downloads from the Next.js server environment.

Previously Working (but flawed) fetchAndChunkText:

// src/app/actions.ts (Initial Version)
export async function fetchAndChunkText(documentId: string): Promise<string[]> {
  try {
    // ... logic to find filename ...
    const downloadUrl = `https://archive.org/download/${documentId}/${fileName}`;
    const textResponse = await fetch(downloadUrl); // <-- This is the failure point
    // ... rest of function
  } catch (error) {
    // ...
  }
}

This pattern initially worked but began failing intermittently with 403 Forbidden errors. The root cause was identified as anti-bot measures on the Internet Archive's servers. Requests originating from known cloud provider IP ranges (like Vercel's) are frequently blocked. This is not a bug in our code, but a fundamental network limitation.

Conclusion: All file fetching from third-party sources must be offloaded to the client's browser, which is a trusted environment.

2. Debugging the PDF Pipeline
Implementing PDF processing introduced a cascade of tooling compatibility issues within the Next.js server environment.

Attempt 1: pdf-parse Library: This was the first choice. However, it failed during the build process, throwing an ENOENT error as it tried to resolve its own internal test files.

Error: ENOENT: no such file or directory, open './test/data/05-versions-space.pdf'

This indicated a fundamental incompatibility with the Next.js/Turbopack bundler.

Attempt 2: pdfjs-dist (Standard Build): We switched to Mozilla's more robust library. This failed at runtime with a ReferenceError: DOMMatrix is not defined. The standard build of pdfjs-dist expects browser-native APIs that do not exist in Node.js.

Attempt 3: pdfjs-dist (Legacy Build with Worker): The library's warning suggested using the legacy build for Node.js. However, attempting to configure its worker resulted in an Invalid workerSrc type error, as the server environment could not provide the expected URL string for the worker script.

3. Success: The "Download on Client, Process on Server" Architecture
The final, working architecture solves both the network blocking and library compatibility issues.

Client-Side Responsibility (DocumentItem.tsx): The React component is now responsible for all fetch calls to the Internet Archive. It downloads the file into memory in the user's browser.

// src/components/research/DocumentItem.tsx
const handleAdvancedIngest = async () => {
  // ... logic to get filename ...
  const downloadUrl = `https://archive.org/download/${doc.identifier}/${filename}`;

  // 1. Download happens here, in the browser. It will not be blocked.
  const response = await fetch(downloadUrl);
  const buffer = await response.arrayBuffer();

  // 2. Send the raw data to the server.
  const chunkResult = await processArrayBuffer(buffer);
  // ...
};

Server-Side Responsibility (actions.ts): We created new server actions (processRawText, processArrayBuffer) that accept raw data (string or ArrayBuffer) as arguments. Their only job is to process data they are given, not to fetch it.

// src/app/actions.ts
export async function processArrayBuffer(buffer: ArrayBuffer): Promise<ActionResult<string[]>> {
  try {
    // Use the server-safe legacy build
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

    // Pass the buffer directly. No worker, no browser APIs.
    const pdfDoc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;

    // ... rest of the parsing and chunking logic ...
  } catch (error) {
    // ...
  }
}

This architecture is now implemented for both simple text and advanced PDF ingestion, resulting in a stable and reliable pipeline.

Immediate Next Steps: Streaming Responses
The most significant remaining UX issue is the perceived performance of the chat interface. The user waits for the full response to be generated before seeing any output. We will implement streaming to fix this.

Plan:

Install the Vercel AI SDK: npm install ai

Create a Streaming Server Action: We will create a new action that returns a StreamingTextResponse. This action will pipe the output from the Hugging Face API directly to the client.

Example Streaming Action (actions.ts):

// This is a conceptual example of the new action we will build.
import { HfInference } from '@huggingface/inference';
import { HuggingFaceStream, StreamingTextResponse } from 'ai';
import { createClient } from '@/lib/supabase/server'; // standard Supabase client
import * as ai from '@/lib/ai/huggingface'; // our decoupled AI service

// Helper to get context, similar to the logic in getSourcedAnswer
async function getContextForQuestion(question: string): Promise<string> {
    const supabase = await createClient();
    const questionEmbedding = await ai.embed(question);
    const { data: documents, error } = await supabase.rpc('match_documents', {
        query_embedding: JSON.stringify(questionEmbedding),
        match_threshold: 0.5,
        match_count: 5,
    });

    if (error || !documents || documents.length === 0) {
        return "No relevant context found in the documents.";
    }

    return documents.map((doc: any) => `- ${doc.content.trim()}`).join('\n\n');
}

export async function streamSourcedAnswer(question: string) {
  // 1. The RAG logic (fetch context from Supabase) remains the same.
  const context = await getContextForQuestion(question);
  const hfPrompt = `Based *only* on the following context, please provide a concise answer to the user's question. If the context does not contain the answer, state that you cannot answer based on the provided information.

  Context:
  ${context}

  User's Question:
  ${question}
  `;

  const hf = new HfInference(process.env.HUGGING_FACE_API_KEY);

  // 2. Call the API and get a stream back.
  const stream = hf.textGenerationStream({
    model: 'mistralai/Mistral-7B-Instruct-v0.2',
    inputs: hfPrompt,
    parameters: { max_new_tokens: 500, temperature: 0.1 }
  });

  // 3. Pipe the stream through the Vercel AI SDK helper.
  const hfStream = HuggingFaceStream(stream);

  // 4. Return the streaming response.
  return new StreamingTextResponse(hfStream);
}

Implement useChat Hook: The ChatInterface.tsx component will be refactored to use the useChat hook from the ai library. This hook will manage the user input, message history, and automatically handle rendering the streaming response as it arrives.
