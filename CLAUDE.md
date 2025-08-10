# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AI Research Assistant that allows users to build and chat with a knowledge base sourced from Internet Archive documents. It's a full-stack Next.js application using Retrieval-Augmented Generation (RAG) with vector embeddings stored in Supabase.

## Development Commands

- `npm run dev --turbopack` - Start development server with Turbopack for faster builds
- `npm run build` - Build the application for production 
- `npm run start` - Start the production server
- `npm run lint` - Run ESLint to check code quality

## Environment Setup

Required environment variables in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
HUGGING_FACE_API_KEY=your_hugging_face_token
```

## Database Schema

The application uses a Supabase Postgres database with the `pgvector` extension. Key table:
- `documents` table stores document chunks with embeddings (384-dimensional vectors)
- `match_documents` function performs similarity search using cosine distance

## Architecture

### Server Actions (`src/app/actions.ts`)
- `searchInternetArchive()` - Search Internet Archive for documents
- `fetchAndChunkText()` - Download, clean, and chunk document text
- `generateEmbeddingsAndStore()` - Generate embeddings and batch insert to database
- `getSourcedAnswer()` - RAG pipeline for answering questions
- `askModel()` - Direct AI model chat interface

### AI Integration (`src/lib/ai/huggingface.ts`)
- Uses Hugging Face Inference API with featherless-ai provider
- Chat model: `mistralai/Mistral-7B-Instruct-v0.2`
- Embedding model: `sentence-transformers/all-MiniLM-L6-v2`
- Centralized AI_CONFIG for easy model switching

### Supabase Client (`src/lib/supabase/server.ts`)
- Server-side Supabase client with Next.js 15 cookie handling
- Uses async cookies() function for compatibility

### Components
- Research components in `src/components/research/` for document management and chat
- Shadcn/UI components in `src/components/ui/` for consistent styling

## Key Patterns

### Error Handling
All server actions return `ActionResult<T>` type with standardized success/error structure defined in `src/app/types.ts`.

### Text Processing
- Documents are chunked into 500-word segments with 50-word overlap
- Text cleaning removes hyphens, normalizes whitespace
- Prefers "Text" format files from Internet Archive, falls back to .txt or DjVuTXT

### Database Operations
- Uses batch inserts (100 records per batch) to avoid payload limits
- Embeddings stored as JSON strings in Postgres
- Similarity search uses cosine distance with configurable threshold (0.5)

## Test Page
The main functionality is demonstrated at `/test-api` which provides a complete workflow interface for searching, ingesting, and querying documents.