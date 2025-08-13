import { createClient } from '@supabase/supabase-js';

/**
 * Database utilities for E2E test setup and cleanup
 * Provides methods to manage test data and database state
 */
export class DatabaseUtils {
  private static supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMBlYTn_I0'
  );

  /**
   * Clean up all test documents from the database
   */
  static async cleanupTestDocuments(): Promise<void> {
    try {
      // Delete all documents created during testing
      const { error } = await this.supabase
        .from('documents')
        .delete()
        .like('content', '%test%');

      if (error) {
        console.warn('Warning: Could not clean up test documents:', error.message);
      }
    } catch (error) {
      console.warn('Warning: Database cleanup failed:', error);
    }
  }

  /**
   * Verify database connection and schema
   */
  static async verifyDatabaseConnection(): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('documents')
        .select('id')
        .limit(1);

      if (error) {
        console.error('Database connection error:', error.message);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Database connection failed:', error);
      return false;
    }
  }

  /**
   * Get document count for testing
   */
  static async getDocumentCount(): Promise<number> {
    try {
      const { count, error } = await this.supabase
        .from('documents')
        .select('id', { count: 'exact' });

      if (error) {
        console.warn('Could not get document count:', error.message);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.warn('Document count query failed:', error);
      return 0;
    }
  }

  /**
   * Insert test document for verification
   */
  static async insertTestDocument(content: string, metadata: any = {}): Promise<string | null> {
    try {
      // Generate a simple embedding for testing (384 dimensions)
      const testEmbedding = Array.from({ length: 384 }, () => Math.random() * 2 - 1);

      const { data, error } = await this.supabase
        .from('documents')
        .insert([
          {
            content,
            metadata,
            embedding: testEmbedding,
            created_at: new Date().toISOString()
          }
        ])
        .select('id')
        .single();

      if (error) {
        console.error('Failed to insert test document:', error.message);
        return null;
      }

      return data?.id || null;
    } catch (error) {
      console.error('Test document insertion failed:', error);
      return null;
    }
  }

  /**
   * Search for documents containing specific content
   */
  static async searchDocuments(searchTerm: string): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .from('documents')
        .select('*')
        .ilike('content', `%${searchTerm}%`)
        .limit(10);

      if (error) {
        console.error('Document search error:', error.message);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Document search failed:', error);
      return [];
    }
  }

  /**
   * Verify vector search functionality
   */
  static async testVectorSearch(): Promise<boolean> {
    try {
      // Create a test query vector
      const queryVector = Array.from({ length: 384 }, () => Math.random() * 2 - 1);

      const { data, error } = await this.supabase
        .rpc('match_documents', {
          query_embedding: queryVector,
          match_threshold: 0.1,
          match_count: 5
        });

      if (error) {
        console.warn('Vector search test failed:', error.message);
        return false;
      }

      return Array.isArray(data);
    } catch (error) {
      console.warn('Vector search test error:', error);
      return false;
    }
  }

  /**
   * Get database health status
   */
  static async getDatabaseHealth(): Promise<{
    connected: boolean;
    documentsCount: number;
    vectorSearchEnabled: boolean;
  }> {
    const connected = await this.verifyDatabaseConnection();
    const documentsCount = connected ? await this.getDocumentCount() : 0;
    const vectorSearchEnabled = connected ? await this.testVectorSearch() : false;

    return {
      connected,
      documentsCount,
      vectorSearchEnabled
    };
  }

  /**
   * Reset database to clean state for testing
   */
  static async resetForTesting(): Promise<void> {
    await this.cleanupTestDocuments();
  }

  /**
   * Wait for document to be processed and stored
   */
  static async waitForDocumentProcessing(
    contentFragment: string,
    timeoutMs: number = 30000
  ): Promise<boolean> {
    const startTime = Date.now();
    const pollInterval = 1000; // Check every second

    while (Date.now() - startTime < timeoutMs) {
      const documents = await this.searchDocuments(contentFragment);
      
      if (documents.length > 0) {
        return true;
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return false;
  }

  /**
   * Get recent documents for testing
   */
  static async getRecentDocuments(limit: number = 10): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Failed to get recent documents:', error.message);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Recent documents query failed:', error);
      return [];
    }
  }
}