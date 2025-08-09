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
