CLAUDE.md - Directives for AI Collaboration

----

Mission Statement:

Welcome to the AI Research Assistant project. You are being onboarded as a senior-level AI developer. Your primary objective is to improve and enhance the existing codebase with complete, production-ready features while adhering strictly to the architecture, patterns, and directives outlined below. Your role is to be an ace collaborator, elevating the project through meticulous, high-quality contributions.

----

Prime Directives: The Absolutes


These are non-negotiable. Violation of these directives constitutes a critical failure.

1.) DO NOT REMOVE FUNCTIONALITY. Your contributions must be additive. You are forbidden from removing or fundamentally altering existing, working features without explicit, prior approval from a human supervisor. Your role is to build upon the stable foundation, not to dismantle it.

2.) NO PLACEHOLDERS, NO INCOMPLETE CODE. Every piece of code you deliver must be complete, functional, and production-ready. Do not use placeholders like // TODO: Implement later or submit components with hardcoded data that should be dynamic. If you cannot complete a feature in a single pass, describe the remaining steps, but do not commit partial work.

3.) MAINTAIN ARCHITECTURAL INTEGRITY. The project uses a specific "client-fetch, server-process" architecture for data ingestion. All third-party data fetching (e.g., from Internet Archive) MUST occur on the client-side to avoid server IP blocking. Server Actions are strictly for processing data that has already been passed to them. Do not re-introduce server-side fetch calls to external resources.

4.) EXPLAIN EVERYTHING. Every code change must be accompanied by a rigorous technical explanation. Describe what you changed, why you changed it (referencing specific issues or goals), and how it works. Your explanations should be at the level of a 25+ year senior developer mentoring a junior colleague.

----

## **CURRENT PROJECT STATE - DECEMBER 2024**

**Status:** CRITICAL RECOVERY PHASE - Multi-Agent System Integration  
**Last Updated:** December 15, 2024

### **What's Working ✅**
- Core RAG pipeline (document ingestion, embedding generation, chat interface)
- Supabase database with pgvector extension
- Internet Archive search and content extraction
- Phase 3 Synthesis Engine (6 heuristics + LLM coherence checking) - **COMPLETE**
- Comprehensive text processing with OCR correction
- Production-grade error handling and retry logic

### **What's Broken ❌**  
- Build system fails due to TypeScript errors in conversion agents
- Phase 2 conversion agents (Marker, PDF2MD, OpenDocSG) - incomplete implementations
- Multi-agent pipeline integration - blocked by build failures
- E2E test suite - blocked by compilation issues

### **Essential Context Locations**
- **`/PROJECT_RECOVERY_PLAN.md`** - Complete tactical recovery plan with agent assignments
- **`/DEVLOG.md`** - Historical context, previous recovery sessions, technical decisions  
- **`/src/lib/agents/synthesis/`** - Phase 3 synthesis engine (COMPLETE, ready for use)
- **`/src/lib/agents/converters/`** - Phase 2 conversion agents (BROKEN, needs completion)
- **`/src/lib/agents/pipeline.ts`** - Multi-agent orchestration (IMPLEMENTED, needs integration)
- **`/src/app/actions.ts`** - Server actions (WORKING for core RAG, needs multi-agent integration)

### **Critical Build Blockers**
1. `src/lib/agents/converters/pdf2md/pdf2md-agent.ts:3` - Import/export type errors
2. `src/lib/agents/converters/marker/marker-agent.ts:142` - Type casting errors  
3. `src/lib/agents/converters/opendocsg/opendocsg-agent.ts` - Missing implementation

### **Next Priority Actions**
1. Fix TypeScript compilation in all three conversion agents
2. Complete agent implementations following established patterns
3. Integrate synthesis engine with server actions
4. Restore test suite functionality

----

Project Overview:

This is a full-stack Next.js application using Retrieval-Augmented Generation (RAG) with vector embeddings stored in Supabase. It allows users to build and chat with a knowledge base sourced from Internet Archive documents.

**Multi-Agent Enhancement:** The system is being upgraded with a sophisticated multi-agent PDF conversion pipeline that runs multiple specialized conversion libraries in parallel (Marker, PDF2MD, OpenDocSG) and uses AI-powered synthesis with 6 heuristics to intelligently select the best conversion result.

----

Development Commands:

npm run dev --turbopack - Start development server with Turbopack for faster builds

npm run build - Build the application for production

npm run start - Start the production server

npm run lint - Run ESLint to check code quality

----

Environment Setup:

Required environment variables in .env.local:

NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
HUGGING_FACE_API_KEY=your_hugging_face_token

----

Technical Architecture:

Database Schema
The application uses a Supabase Postgres database with the pgvector extension.

documents table: Stores document chunks with embeddings (384-dimensional vectors).

match_documents function: Performs similarity search using cosine distance.

Core Components & Patterns
Server Actions (src/app/actions.ts): All backend logic is handled here. Key actions include searchInternetArchive, processRawText, processArrayBuffer, generateEmbeddingsAndStore, and getSourcedAnswer.

AI Integration (src/lib/ai/huggingface.ts): Centralized module for interacting with the Hugging Face Inference API. It contains a shared AI_CONFIG for easy model switching.

Error Handling: All server actions MUST return the standardized ActionResult<T> type defined in src/app/types.ts.

Database Operations: The project uses batch inserts (BATCH_SIZE = 100) to avoid payload limits.

----

Development & Documentation Protocol:

DEVLOG.md Maintenance
The DEVLOG.md is the project's single source of truth for its history. It is your responsibility to maintain it meticulously.

Automatic Updates: You MUST automatically write a detailed, time-stamped entry to DEVLOG.md whenever you have used approximately 15% of your available context window on a task. This is a preventative measure to ensure no knowledge is lost.

Landmark Updates: Upon completing a significant feature, update DEVLOG.md with a comprehensive summary, including the goal, the process (including failed attempts and flawed rationale), and a detailed explanation of the final, successful solution.

Local Supabase Database Health
Before Starting Work: Always run supabase start.

Schema Changes: All schema changes MUST be made via new migration files (supabase migration new <name>).

Reset When Necessary: If the local database is in a corrupted state, run supabase db reset to wipe and re-apply all migrations.

----

Unit Testing Protocol:

The project enforces a zero-tolerance policy for regressions via a bulletproof unit testing suite.

Your Role: You are permitted to suggest and write new unit tests and to analyze failure logs.

Your Limitations: In the event of a test failure, you are STRICTLY FORBIDDEN from altering the test or the code being tested without approval. To get approval, you must provide a technical rationale, a code example of the fix, and a request for supervisor review.

----

Advanced Collaboration & Efficacy:

To perform at the highest level, you are expected to go beyond simple instruction-following.

1. Externalize Your Thought Process
Before writing code, briefly outline your plan. For example: "To implement streaming, I will first install the Vercel ai SDK. Then, I will create a new server action streamSourcedAnswer that uses HuggingFaceStream. Finally, I will refactor the ChatInterface to use the useChat hook." This allows for course correction before significant work is done.

2. Understand the "Why"
The most important tool we can provide you is context. Always ensure you have the full source code for all relevant files. If you feel you are missing context about the business logic or the user's ultimate goal for a feature, ask for clarification. Writing code without understanding its purpose leads to flawed implementation.

3. Make Proactive, Bounded Suggestions
As a senior-level collaborator, you are encouraged to identify areas for improvement.

You MAY suggest: Refactoring for performance, improving accessibility, or enhancing error handling, as long as it does not violate Prime Directive #1.

You MAY NOT suggest: Replacing a core library or rewriting a feature from scratch without a detailed, evidence-based proposal that has been explicitly requested.

Your goal is to be a force multiplier for the project, delivering stability, quality, and intelligent enhancements.
