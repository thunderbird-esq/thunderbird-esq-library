// src/app/api/chat/route.ts
import { HfInference } from '@huggingface/inference';
import { createClient } from '@/lib/supabase/server';
import * as ai from '@/lib/ai/huggingface';

export const runtime = 'edge'; // Use the Vercel Edge Runtime for best performance

const hf = new HfInference(process.env.HUGGING_FACE_API_KEY);

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    const lastUserMessage = messages[messages.length - 1]?.content || '';

    // RAG: Get context from Supabase
    const supabase = await createClient();
    const questionEmbedding = await ai.embed(lastUserMessage);
    const { data: documents } = await supabase.rpc('match_documents', {
      query_embedding: questionEmbedding,
      match_threshold: 0.5,
      match_count: 5,
    });

    // Type for document from Supabase match_documents function
    interface Document {
      content: string;
    }
    
    const context = documents && documents.length > 0
      ? documents.map((doc: Document) => `- ${doc.content.trim()}`).join('\n\n')
      : "No relevant context found.";

    // Format messages for conversational task
    const conversationMessages = [
      {
        role: 'system' as const,
        content: `You are a helpful AI assistant. Answer questions based *only* on the provided context. If the context does not contain the answer, state that you cannot answer based on the provided information.`
      },
      {
        role: 'user' as const,
        content: `Context:\n${context}\n\nQuestion: ${lastUserMessage}`
      }
    ];

    // Create chat completion stream using the conversational task
    const stream = hf.chatCompletionStream({
      model: 'mistralai/Mistral-7B-Instruct-v0.2',
      messages: conversationMessages,
      max_tokens: 500,
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
