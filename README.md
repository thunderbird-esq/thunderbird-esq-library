AI Research Assistant
This is a full-stack web application that serves as a powerful, personal research assistant. It leverages the power of Large Language Models (LLMs) to allow you to build and chat with a knowledge base sourced from primary documents in the Internet Archive.

Instead of just getting a generic answer from an AI, you can ingest specific books, papers, and historical documents, and then ask questions to receive answers based only on the content of those sources.

Features
Document Sourcing: Search the vast collection of the Internet Archive for text-based documents on any topic.

Robust Ingestion Pipeline: A hardened data pipeline fetches document metadata, selects the highest-quality text file available, cleans the text, and processes it for storage.

Vector Database: Document content is chunked, converted into vector embeddings, and stored in a Supabase Postgres database with the pgvector extension.

Retrieval-Augmented Generation (RAG): When you ask a question, the application performs a similarity search on the vector database to find the most relevant text chunks.

Sourced Answers: The retrieved text chunks are passed to an LLM along with your question, ensuring the answers are directly based on the content of the documents you have ingested.

Tech Stack
Framework: Next.js 15 (App Router)

Language: TypeScript

Backend: Supabase (Postgres, pgvector, Auth)

AI Models: Hugging Face Inference API

UI Components: Shadcn/UI

Styling: Tailwind CSS

Getting Started
Follow these instructions to get a local copy up and running for development and testing purposes.

Prerequisites
Node.js (v18 or later)

npm or another package manager

A free Supabase account

A free Hugging Face account

Installation & Setup
Clone the repository:

git clone https://github.com/your-username/your-repo-name.git
cd your-repo-name

Install dependencies:

npm install

Set up your Supabase project:

Create a new project on the Supabase dashboard.

Navigate to Database > Extensions and enable the vector extension for the public schema.

Navigate to the SQL Editor, create a new query, and run the following SQL to create the necessary table and search function:

-- Create a table to store your document chunks and their embeddings
create table documents (
  id bigserial primary key,
  document_id text,
  title text,
  content text,
  embedding vector(384)
);

-- Create a function to search for similar documents
create function match_documents (
  query_embedding vector(384),
  match_threshold float,
  match_count int
)
returns table (
  id bigint,
  document_id text,
  title text,
  content text,
  similarity float
)
language sql stable
as $$
  select
    documents.id,
    documents.document_id,
    documents.title,
    documents.content,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where 1 - (documents.embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
$$;

Configure Environment Variables:

Create a file named .env.local in the root of your project.

Add your API keys and project URL to this file. You can find your Supabase keys in Project Settings > API. You can generate a Hugging Face token in Your Profile > Settings > Access Tokens.

# .env.local

# Supabase
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY

# Hugging Face (this key is used server-side only)
HUGGING_FACE_API_KEY=YOUR_HUGGING_FACE_READ_TOKEN

Run the development server:

npm run dev

Open http://localhost:3000 in your browser to see the application. The test page with all functionality is available at /test-api.

Future Work
This project is a powerful proof-of-concept. Future development could include:

Streaming Responses: Integrate the Vercel AI SDK to improve perceived performance.

Batch Inserts: For very large documents, break the bulk insert operation into smaller batches to avoid database payload limits.

User Authentication: Implement a full sign-up and login flow with Supabase Auth to give each user a private knowledge base.

Polished UI: Replace the current test page with a dedicated and polished chat interface.
