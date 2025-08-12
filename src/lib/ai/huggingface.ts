// src/lib/ai/huggingface.ts

import { HfInference } from '@huggingface/inference';

// All AI configuration lives in one place. Easy to find, easy to change.
const AI_CONFIG = {
  chatModel: 'mistralai/Mistral-7B-Instruct-v0.2',
  embeddingModel: 'sentence-transformers/all-MiniLM-L6-v2',
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

/**
 * A wrapper for the Hugging Face feature extraction (embedding) API.
 * Throws an error if the API call fails or returns an invalid embedding.
 * @param text The text to embed.
 * @returns An array of numbers representing the vector embedding.
 */
export async function embed(text: string): Promise<number[]> {
  const embeddingResponse = await hf.featureExtraction({
    model: AI_CONFIG.embeddingModel,
    inputs: text,
  });

  if (!Array.isArray(embeddingResponse) || embeddingResponse.length === 0) {
    throw new Error('Hugging Face API returned an invalid embedding.');
  }
  return embeddingResponse as number[];
}
