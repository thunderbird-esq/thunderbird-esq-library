// src/lib/ai/huggingface.ts

import { HfInference } from '@huggingface/inference';

// All AI configuration lives in one place. Easy to find, easy to change.
const AI_CONFIG = {
  chatModel: 'mistralai/Mistral-7B-Instruct-v0.2',
  embeddingModel: 'sentence-transformers/all-MiniLM-L6-v2',
  // Fallback models in case the primary model fails
  fallbackEmbeddingModels: [
    'sentence-transformers/all-MiniLM-L12-v2',
    'sentence-transformers/paraphrase-MiniLM-L6-v2',
    'BAAI/bge-small-en-v1.5'
  ]
};

if (!process.env.HUGGING_FACE_API_KEY) {
  throw new Error('HUGGING_FACE_API_KEY is not set in the environment variables.');
}

const hf = new HfInference(process.env.HUGGING_FACE_API_KEY);

/**
 * A wrapper for the Hugging Face chat completion API.
 * Throws an error if the API call fails or returns no content.
 * @param prompt The user's prompt.
 * @returns The AI model's response text.
 */
export async function chat(prompt: string): Promise<string> {
  const response = await hf.chatCompletion({
    model: AI_CONFIG.chatModel,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 500,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Hugging Face API returned an empty chat response.');
  }
  return content;
}

import { withResilience } from '@/lib/resilience';

/**
 * A wrapper for the Hugging Face feature extraction (embedding) API.
 * It uses a resilience wrapper to handle retries, exponential backoff, and fallback models.
 * @param text The text to embed.
 * @returns An array of numbers representing the vector embedding.
 */
export async function embed(text: string): Promise<number[]> {
  const modelsToTry = [AI_CONFIG.embeddingModel, ...AI_CONFIG.fallbackEmbeddingModels];

  const operation = async (model: string) => {
    console.log(`Attempting to embed text (${text.length} chars) using model: ${model}`);

    const embeddingResponse = await hf.featureExtraction({
      model: model,
      inputs: text,
    });

    if (!Array.isArray(embeddingResponse) || embeddingResponse.length === 0) {
      console.error('Invalid embedding response:', embeddingResponse);
      throw new Error('Hugging Face API returned an invalid embedding.');
    }

    console.log(`✅ Successfully generated embedding with ${embeddingResponse.length} dimensions using ${model}`);
    return embeddingResponse as number[];
  };

  return withResilience(operation, {
    strategies: modelsToTry,
    retryableStatusCodes: [429, 500, 502, 503, 504],
    isRetryable: (error: Error) => {
        // The HF library sometimes throws a generic error for blob fetches, which can hide the underlying cause (like rate limiting)
        if (error.message.includes('blob')) {
            return true;
        }
        return [429, 500, 502, 503, 504].some(code => error.message.includes(String(code)));
    }
  });
}
