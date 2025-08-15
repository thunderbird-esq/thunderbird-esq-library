// src/app/api/chat/route.ts
import { HfInference } from '@huggingface/inference';
// --- CHANGE 1: Import the admin client ---
import { createClient } from '@supabase/supabase-js';
import * as ai from '@/lib/ai/huggingface';

export const runtime = 'edge'; // Use the Vercel Edge Runtime for best performance

const hf = new HfInference(process.env.HUGGING_FACE_API_KEY);

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    const lastUserMessage = messages[messages.length - 1]?.content || '';

    // --- CHANGE 2: Create a Supabase admin client ---
    // This client uses the service role key to bypass RLS for this trusted server-side operation.
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // RAG: Get context from Supabase
    const questionEmbedding = await ai.embed(lastUserMessage);
    const { data: documents } = await supabase.rpc('match_documents', {
      query_embedding: questionEmbedding,
      match_threshold: 0.5,
      match_count: 5,
    });

    // Type for document from Supabase match_documents function
    interface Document {
      content: string;
      title: string;
    }
    
    const context = documents && documents.length > 0
      ? documents.map((doc: Document) => `Source: ${doc.title}\nContent: ${doc.content.trim()}`).join('\n\n---\n\n')
      : "No relevant context found.";
      
    // Format messages for conversational task
    const conversationMessages = [
      {
        role: 'system' as const,
        content: `You are a scrupulous and transparent research analyst. Your mission is to provide trustworthy, verifiable answers based exclusively on the provided source documents. You must show your work.

Follow these rules with no exceptions:
1. Analyze the Context: First, silently review the provided context to understand the connections between the documents.
2. Synthesize the Answer: Formulate a direct answer to the user's question. For every assertion or piece of information you state, you MUST include an inline citation that looks like this: [n].
3. Explain Your Reasoning: After the answer, add a "Reasoning" section. Here, you will explain how you connected the cited sources to arrive at your conclusion. This should be a brief, conversational explanation of your thought process.
4. Create a Bibliography: After the reasoning, add a "Bibliography" section. List each citation number from your answer. For each number, provide the exact quote from the source document that supports the assertion, followed by the title of the source document it came from.
5. Strictly Adhere to Sources: Do not use any information not present in the provided context. If the answer cannot be found, you must respond ONLY with the sentence: "I cannot answer this question as the provided documents do not contain the necessary information."`
      },
      {
        role: 'user' as const,
        content: `Context:\n${context}\n\nQuestion: ${lastUserMessage}`
      }
    ];

    // Create chat completion stream using the conversational task
    const stream = hf.chatCompletionStream({
      model: 'HuggingFaceH4/zephyr-7b-beta',
      messages: conversationMessages,
      max_tokens: 1024,
      temperature: 0.1
    });

    // Create a ReadableStream compatible with modern browsers
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            // Chat completion stream returns delta content in choices[0].delta.content
            const deltaContent = chunk.choices?.[0]?.delta?.content;
            if (deltaContent) {
              controller.enqueue(new TextEncoder().encode(deltaContent));
            }
          }
        } catch (error) {
          console.error('Streaming error:', error);
          controller.error(error);
        } finally {
          controller.close();
        }
      }
    });

    // Return streaming text response
    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
    
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }), 
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
}
