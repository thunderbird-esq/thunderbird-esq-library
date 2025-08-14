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

/**
 * A wrapper for the Hugging Face feature extraction (embedding) API.
 * Throws an error if the API call fails or returns an invalid embedding.
 * @param text The text to embed.
 * @returns An array of numbers representing the vector embedding.
 */
export async function embed(text: string): Promise<number[]> {
  const modelsToTry = [AI_CONFIG.embeddingModel, ...AI_CONFIG.fallbackEmbeddingModels];
  
  for (let i = 0; i < modelsToTry.length; i++) {
    const model = modelsToTry[i];
    try {
      console.log(`Attempting to embed text (${text.length} chars) using model: ${model} (attempt ${i + 1}/${modelsToTry.length})`);
      
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
      
    } catch (error) {
      console.error(`Model ${model} failed:`, error);
      
      // If this is the last model, provide detailed error info
      if (i === modelsToTry.length - 1) {
        console.error('All embedding models failed');
        
        if (error instanceof Error) {
          if (error.message.includes('blob')) {
            throw new Error(`Hugging Face API error (blob fetch failed): ${error.message}. This may be due to an invalid API key, rate limiting, or model unavailability. Tried ${modelsToTry.length} different models.`);
          } else if (error.message.includes('401')) {
            throw new Error('Hugging Face API authentication failed. Please check your HUGGING_FACE_API_KEY.');
          } else if (error.message.includes('429')) {
            throw new Error('Hugging Face API rate limit exceeded. Please wait and try again.');
          } else if (error.message.includes('503') || error.message.includes('502')) {
            throw new Error('Hugging Face API is temporarily unavailable. Please try again later.');
          }
        }
        
        throw new Error(`All embedding models failed. Last error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      
      // Continue to next model
      console.log(`Trying next model: ${modelsToTry[i + 1]}`);
    }
  }
  
  throw new Error('Unexpected error: should not reach here');
}
