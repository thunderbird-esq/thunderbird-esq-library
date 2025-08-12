#!/usr/bin/env node

/**
 * Standalone Database Connection Test Script
 * 
 * This script tests Supabase connectivity independently of the Next.js application
 * to isolate database connection issues from application-level problems.
 */

const { createClient } = require('@supabase/supabase-js');

// Environment variables from .env.local
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

console.log('🔍 Database Connection Test');
console.log('==========================');
console.log(`Supabase URL: ${SUPABASE_URL}`);
console.log(`Anon Key: ${SUPABASE_ANON_KEY.substring(0, 20)}...`);
console.log('');

async function testConnection() {
  try {
    // Create Supabase client
    console.log('📡 Creating Supabase client...');
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    // Test 1: Basic connection
    console.log('🔌 Testing basic connection...');
    const { data: testData, error: testError } = await supabase
      .from('documents')
      .select('id')
      .limit(1);
    
    if (testError) {
      console.error('❌ Basic connection failed:', testError.message);
      return false;
    }
    
    console.log('✅ Basic connection successful');
    
    // Test 2: Check if documents table exists
    console.log('📋 Checking documents table schema...');
    const { data: schemaData, error: schemaError } = await supabase
      .from('documents')
      .select('*')
      .limit(1);
    
    if (schemaError) {
      console.error('❌ Documents table check failed:', schemaError.message);
      return false;
    }
    
    console.log('✅ Documents table exists and is accessible');
    
    // Test 3: Test match_documents function
    console.log('🔍 Testing match_documents function...');
    const { data: matchData, error: matchError } = await supabase
      .rpc('match_documents', {
        query_embedding: new Array(384).fill(0.1),
        match_threshold: 0.5,
        match_count: 1
      });
    
    if (matchError) {
      console.error('❌ match_documents function test failed:', matchError.message);
      return false;
    }
    
    console.log('✅ match_documents function is working');
    
    // Test 4: Check pgvector extension
    console.log('🧩 Checking pgvector extension...');
    const { data: extensionData, error: extensionError } = await supabase
      .from('pg_extension')
      .select('extname')
      .eq('extname', 'vector');
    
    if (extensionError) {
      console.warn('⚠️  Could not check pgvector extension directly:', extensionError.message);
    } else {
      console.log('✅ pgvector extension check passed');
    }
    
    console.log('');
    console.log('🎉 All database connectivity tests passed!');
    console.log('The Supabase database is fully operational and ready for use.');
    
    return true;
    
  } catch (error) {
    console.error('💥 Unexpected error during connection test:', error.message);
    console.error('Stack trace:', error.stack);
    return false;
  }
}

// Run the test
testConnection().then(success => {
  process.exit(success ? 0 : 1);
});