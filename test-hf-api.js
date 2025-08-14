#!/usr/bin/env node

// Quick test script to verify Hugging Face API connection
const fs = require('fs');

// Manual .env.local parsing
const envContent = fs.readFileSync('.env.local', 'utf8');
const lines = envContent.split('\n');
for (const line of lines) {
  if (line.includes('=') && !line.startsWith('#')) {
    const [key, value] = line.split('=', 2);
    process.env[key.trim()] = value.trim();
  }
}

const { HfInference } = require('@huggingface/inference');

async function testHuggingFaceAPI() {
  console.log('🧪 Testing Hugging Face API connection...');
  
  if (!process.env.HUGGING_FACE_API_KEY) {
    console.error('❌ HUGGING_FACE_API_KEY not found in .env.local');
    process.exit(1);
  }
  
  console.log(`✅ API Key found (length: ${process.env.HUGGING_FACE_API_KEY.length})`);
  console.log(`🔗 Key prefix: ${process.env.HUGGING_FACE_API_KEY.substring(0, 8)}...`);
  
  const hf = new HfInference(process.env.HUGGING_FACE_API_KEY);
  
  try {
    console.log('📡 Testing embedding generation with simple text...');
    
    const result = await hf.featureExtraction({
      model: 'sentence-transformers/all-MiniLM-L6-v2',
      inputs: 'Hello world test'
    });
    
    console.log('✅ Embedding generation successful!');
    console.log(`📏 Embedding dimensions: ${result.length}`);
    console.log(`🔢 First 5 values: [${result.slice(0, 5).map(x => x.toFixed(4)).join(', ')}...]`);
    
  } catch (error) {
    console.error('❌ Embedding generation failed:');
    console.error('Error details:', error.message);
    
    if (error.message.includes('blob')) {
      console.error('💡 This "blob fetch" error usually indicates:');
      console.error('   - Invalid or expired API key');
      console.error('   - Rate limiting (too many requests)');
      console.error('   - Model temporarily unavailable');
      console.error('   - Network connectivity issues');
    }
    
    process.exit(1);
  }
}

testHuggingFaceAPI();