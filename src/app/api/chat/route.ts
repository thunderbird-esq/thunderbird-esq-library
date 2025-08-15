// src/app/api/chat/route.ts
import { HfInference } from '@huggingface/inference';
import { streamText, CoreMessage } from 'ai';
import { createClient } from '@supabase/supabase-js';
import * as ai from '@/lib/ai/huggingface';
import { createStreamableValue } from 'ai/rsc';

export const runtime = 'edge';

const hf = new HfInference(process.env.HUGGING_FACE_API_KEY);

// A custom provider for Hugging Face that conforms to the Vercel AI SDK's LanguageModel interface
const huggingFaceProvider = (model: string) => ({
  doStream: async ({ prompt, temperature, maxTokens }: { prompt: CoreMessage[], temperature?: number, maxTokens?: number }) => {
    const stream = createStreamableValue();
    (async () => {
      const hfStream = hf.chatCompletionStream({
        model,
        messages: prompt as any, // The 'any' cast is needed because the types are slightly different
        max_tokens: maxTokens,
        temperature,
      });

      for await (const chunk of hfStream) {
        if (chunk.choices && chunk.choices[0].delta.content) {
          stream.update({ text: chunk.choices[0].delta.content });
        }
      }
      stream.done();
    })().catch(err => stream.error(err));
    return { stream: stream.value };
  },
});

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    const lastUserMessage = messages[messages.length - 1]?.content || '';

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const questionEmbedding = await ai.embed(lastUserMessage);
    const { data: documents } = await supabase.rpc('match_documents', {
      query_embedding: questionEmbedding,
      match_threshold: 0.5,
      match_count: 5,
    });

    interface Document {
      content: string;
      title: string;
    }
    
    const context = documents && documents.length > 0
      ? documents.map((doc: Document) => `Source: ${doc.title}\nContent: ${doc.content.trim()}`).join('\n\n---\n\n')
      : "No relevant context found.";
      
    const systemPrompt = `You are a scrupulous and transparent research analyst. Your mission is to provide trustworthy, verifiable answers based exclusively on the provided source documents. You must show your work.

Follow these rules with no exceptions:
1. Analyze the Context: First, silently review the provided context to understand the connections between the documents.
2. Synthesize the Answer: Formulate a direct answer to the user's question. For every assertion or piece of information you state, you MUST include an inline citation that looks like this: [n].
3. Explain Your Reasoning: After the answer, add a "Reasoning" section. Here, you will explain how you connected the cited sources to arrive at your conclusion. This should be a brief, conversational explanation of your thought process.
4. Create a Bibliography: After the reasoning, add a "Bibliography" section. List each citation number from your answer. For each number, provide the exact quote from the source document that supports the assertion, followed by the title of the source document it came from.
5. Strictly Adhere to Sources: Do not use any information not present in the provided context. If the answer cannot be found, you must respond ONLY with the sentence: "I cannot answer this question as the provided documents do not contain the necessary information."`;

    const result = await streamText({
      model: huggingFaceProvider('HuggingFaceH4/zephyr-7b-beta'),
      system: systemPrompt,
      prompt: `Context:\n${context}\n\nQuestion: ${lastUserMessage}`,
      maxTokens: 1024,
      temperature: 0.1,
    });

    return result.toAIStreamResponse();
    
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
