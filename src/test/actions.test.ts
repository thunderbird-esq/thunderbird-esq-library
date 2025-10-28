// src/test/actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  processRawText,
  processArrayBuffer,
  generateEmbeddingsAndStore,
  getSourcedAnswer
} from '@/app/actions'

// Type for mocked Supabase client
type MockSupabaseClient = {
  from: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
}

// Mock the AI module
vi.mock('@/lib/ai/huggingface', () => ({
  chat: vi.fn(),
  embed: vi.fn()
}))

// Mock the Supabase server module
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn()
}))

// Mock pdfjs-dist
const mockPdfjs = {
  getDocument: vi.fn()
}
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => mockPdfjs)

// Mock text processing
vi.mock('@/lib/text-processing', () => ({
  fixOcrErrorsAsync: vi.fn(text => Promise.resolve(`(fixed) ${text}`))
}))

import * as ai from '@/lib/ai/huggingface'
import { createClient } from '@/lib/supabase/server'
import { fixOcrErrorsAsync } from '@/lib/text-processing'

describe('RAG Pipeline Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('processRawText', () => {
    it('should successfully process valid text and return chunks', async () => {
      const validText = 'This is a sample text that is longer than 100 characters. '.repeat(5)
      
      const result = await processRawText(validText)
      
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(Array.isArray(result.data)).toBe(true)
      expect(result.data!.length).toBeGreaterThan(0)
      expect(result.data![0]).toContain('This is a sample text')
    })

    it('should handle text that is too short (< 100 chars)', async () => {
      const shortText = 'Short text'
      
      const result = await processRawText(shortText)
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('Downloaded text is too short to be useful.')
      expect(result.data).toBeUndefined()
    })

    it('should properly chunk very long text', async () => {
      // Create text with more than 500 words to test chunking
      const longText = 'word '.repeat(1000) // 1000 words
      
      const result = await processRawText(longText)
      
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data!.length).toBeGreaterThan(1) // Should create multiple chunks
      
      // Test chunk overlap - each chunk should have some overlap
      const firstChunk = result.data![0].split(' ')
      const secondChunk = result.data![1].split(' ')
      expect(firstChunk.length).toBeLessThanOrEqual(500)
      expect(secondChunk.length).toBeLessThanOrEqual(500)
    })

    it('should clean text by removing line breaks and extra spaces', async () => {
      const messyText = 'This is a test-\nwith line breaks\n\nand    multiple   spaces. '.repeat(3)
      
      const result = await processRawText(messyText)
      
      expect(result.success).toBe(true)
      expect(result.data![0]).not.toContain('-\n')
      expect(result.data![0]).not.toContain('\n')
      expect(result.data![0]).not.toMatch(/\s{2,}/) // No multiple spaces
    })

    it('should handle edge case with exactly 100 characters', async () => {
      const exactText = 'a'.repeat(100) // Exactly 100 characters
      
      const result = await processRawText(exactText)
      
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data!.length).toBe(1) // Should create one chunk
    })
  })

  describe('processArrayBuffer', () => {
    const mockPdfDoc = {
      numPages: 2,
      getPage: vi.fn()
    }
    
    const mockPage = {
      getTextContent: vi.fn()
    }
    
    const mockTextContent = {
      items: [
        { str: 'This is page 1 content' },
        { str: ' with multiple items' },
        { str: ' that should be joined.' }
      ]
    }

    beforeEach(() => {
      mockPdfjs.getDocument.mockReturnValue({
        promise: Promise.resolve(mockPdfDoc)
      })
      
      mockPdfDoc.getPage.mockResolvedValue(mockPage)
      mockPage.getTextContent.mockResolvedValue(mockTextContent)
      // No longer mocking ai.chat for cleaning
    })

    it('should successfully extract and process PDF text', async () => {
      const mockBuffer = new ArrayBuffer(1024)
      
      const result = await processArrayBuffer(mockBuffer)
      
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(Array.isArray(result.data)).toBe(true)
      expect(result.data!.length).toBeGreaterThan(0)
      
      // Verify PDF extraction was called
      expect(mockPdfjs.getDocument).toHaveBeenCalledWith({
        data: new Uint8Array(mockBuffer)
      })
      expect(mockPdfDoc.getPage).toHaveBeenCalledWith(1)
      expect(mockPdfDoc.getPage).toHaveBeenCalledWith(2)
      
      // Verify our new OCR fixing function was called
      expect(fixOcrErrorsAsync).toHaveBeenCalled()
      expect(ai.chat).not.toHaveBeenCalled()
    })

    it('should handle PDF with no extractable text', async () => {
      // Setup a PDF with no pages to ensure truly empty rawText
      const mockEmptyPdfDoc = {
        numPages: 0,
        getPage: vi.fn()
      }
      
      mockPdfjs.getDocument.mockReturnValue({
        promise: Promise.resolve(mockEmptyPdfDoc)
      })
      
      const mockBuffer = new ArrayBuffer(1024)
      
      const result = await processArrayBuffer(mockBuffer)
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('Could not extract any text from the PDF.')
    })

    it('should handle PDF processing errors', async () => {
      mockPdfjs.getDocument.mockReturnValue({
        promise: Promise.reject(new Error('Corrupted PDF'))
      })
      
      const mockBuffer = new ArrayBuffer(1024)
      
      const result = await processArrayBuffer(mockBuffer)
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('Corrupted PDF')
    })

    it('should properly chunk cleaned text', async () => {
      // Mock longer text content from the PDF to ensure chunking happens
      const longTextContent = {
        items: Array.from({ length: 600 }, (_, i) => ({ str: `word${i}` }))
      }
      mockPage.getTextContent.mockResolvedValue(longTextContent)
      
      const mockBuffer = new ArrayBuffer(1024)
      
      const result = await processArrayBuffer(mockBuffer)
      
      expect(result.success).toBe(true)
      // With 600 words and a chunk size of 500 with an overlap, we expect more than one chunk.
      expect(result.data!.length).toBeGreaterThan(1)
    })
  })

  describe('generateEmbeddingsAndStore', () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      insert: vi.fn()
    }

    beforeEach(() => {
      vi.mocked(createClient).mockResolvedValue(mockSupabase as MockSupabaseClient)
      vi.mocked(ai.embed).mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5])
      mockSupabase.insert.mockResolvedValue({ error: null })
    })

    it('should successfully generate embeddings and store in batches', async () => {
      // Use longer chunks to pass the MIN_CHUNK_LENGTH validation (10 chars)
      const chunks = ['chunk number one text', 'chunk number two text', 'chunk number three text']
      const documentId = 'doc-123'
      const title = 'Test Document'
      
      const result = await generateEmbeddingsAndStore(chunks, documentId, title)
      
      expect(result.success).toBe(true)
      expect(result.data).toBe(3)
      
      // Verify embeddings were generated for each chunk
      expect(ai.embed).toHaveBeenCalledTimes(3)
      expect(ai.embed).toHaveBeenCalledWith('chunk number one text')
      expect(ai.embed).toHaveBeenCalledWith('chunk number two text')
      expect(ai.embed).toHaveBeenCalledWith('chunk number three text')
      
      // Verify Supabase insert was called
      expect(mockSupabase.from).toHaveBeenCalledWith('documents')
      expect(mockSupabase.insert).toHaveBeenCalledWith([
        {
          document_id: documentId,
          title: title,
          content: 'chunk number one text',
          embedding: [0.1, 0.2, 0.3, 0.4, 0.5] // Note: no JSON.stringify in new implementation
        },
        {
          document_id: documentId,
          title: title,
          content: 'chunk number two text',
          embedding: [0.1, 0.2, 0.3, 0.4, 0.5]
        },
        {
          document_id: documentId,
          title: title,
          content: 'chunk number three text',
          embedding: [0.1, 0.2, 0.3, 0.4, 0.5]
        }
      ])
    })

    it('should handle large batches by splitting them', async () => {
      // Create 150 chunks with proper length to test batch processing (BATCH_SIZE = 100)
      const chunks = Array.from({ length: 150 }, (_, i) => `chunk number ${i} with enough text`)
      
      const result = await generateEmbeddingsAndStore(chunks, 'doc-123', 'Test Document')
      
      expect(result.success).toBe(true)
      expect(result.data).toBe(150)
      
      // Should call insert twice (100 + 50)
      expect(mockSupabase.insert).toHaveBeenCalledTimes(2)
      
      // First batch should have 100 items
      const firstBatchCall = mockSupabase.insert.mock.calls[0][0]
      expect(firstBatchCall).toHaveLength(100)
      
      // Second batch should have 50 items
      const secondBatchCall = mockSupabase.insert.mock.calls[1][0]
      expect(secondBatchCall).toHaveLength(50)
    })

    it('should handle empty chunks array', async () => {
      const result = await generateEmbeddingsAndStore([], 'doc-123', 'Test Document')
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid input: chunks must be a non-empty array')
      expect(ai.embed).not.toHaveBeenCalled()
      expect(mockSupabase.insert).not.toHaveBeenCalled()
    })

    it('should handle embedding generation errors with graceful degradation', async () => {
      vi.mocked(ai.embed).mockRejectedValue(new Error('Embedding service down'));

      const chunks = ['chunk number one with text'];
      const documentId = 'doc-123';
      const title = 'Test Document';

      const result = await generateEmbeddingsAndStore(chunks, documentId, title);

      // The operation should now be considered a success, as the text is stored.
      expect(result.success).toBe(true);
      // It should report that 0 embeddings were successfully stored, but 1 total document.
      expect(result.data).toBe(1);

      // Verify that Supabase insert was still called
      expect(mockSupabase.from).toHaveBeenCalledWith('documents');
      
      // Verify that the document was inserted with a null embedding
      const insertedData = mockSupabase.insert.mock.calls[0][0][0];
      expect(insertedData.content).toBe('chunk number one with text');
      expect(insertedData.embedding).toBeNull();
    });

    it('should handle Supabase insert errors', async () => {
      mockSupabase.insert.mockResolvedValue({ 
        error: { message: 'Database connection failed' } 
      })
      
      const result = await generateEmbeddingsAndStore(['chunk number one with text'], 'doc-123', 'Test Document')
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('Database connection failed') // Updated implementation includes batch info
    })

    it('should handle partial batch failure', async () => {
      const chunks = Array.from({ length: 150 }, (_, i) => `chunk number ${i} with text`)
      
      // First batch succeeds, second batch fails
      mockSupabase.insert
        .mockResolvedValueOnce({ error: null })
        .mockResolvedValueOnce({ error: { message: 'Second batch failed' } })
      
      const result = await generateEmbeddingsAndStore(chunks, 'doc-123', 'Test Document')
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('Second batch failed')
    })
  })

  describe('getSourcedAnswer', () => {
    const mockSupabase = {
      rpc: vi.fn()
    }

    const mockDocuments = [
      {
        content: 'This is relevant document content about the topic.',
        similarity: 0.8
      },
      {
        content: 'Another relevant piece of information.',
        similarity: 0.7
      }
    ]

    beforeEach(() => {
      vi.mocked(createClient).mockResolvedValue(mockSupabase as MockSupabaseClient)
      vi.mocked(ai.embed).mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5])
      vi.mocked(ai.chat).mockResolvedValue('Based on the provided context, here is the answer.')
      mockSupabase.rpc.mockResolvedValue({ data: mockDocuments, error: null })
    })

    it('should successfully retrieve and answer with relevant documents', async () => {
      const question = 'What is the topic about?'
      
      const result = await getSourcedAnswer(question)
      
      expect(result.success).toBe(true)
      expect(result.data).toBe('Based on the provided context, here is the answer.')
      
      // Verify question embedding was generated
      expect(ai.embed).toHaveBeenCalledWith(question)
      
      // Verify document matching was called
      expect(mockSupabase.rpc).toHaveBeenCalledWith('match_documents', {
        query_embedding: [0.1, 0.2, 0.3, 0.4, 0.5], // No JSON.stringify in updated implementation
        match_threshold: 0.5,
        match_count: 5
      })
      
      // Verify AI chat was called with context
      expect(ai.chat).toHaveBeenCalledWith(
        expect.stringContaining('This is relevant document content')
      )
      expect(ai.chat).toHaveBeenCalledWith(
        expect.stringContaining('Another relevant piece of information')
      )
    })

    it('should handle empty question', async () => {
      const result = await getSourcedAnswer('')
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to get sourced answer: Question cannot be empty.')
    })

    it('should handle no relevant documents found', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: [], error: null })
      
      const result = await getSourcedAnswer('What is the topic about?')
      
      expect(result.success).toBe(true)
      expect(result.data).toBe("I couldn't find any relevant information in the ingested documents to answer your question.")
    })

    it('should handle null documents response', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: null, error: null })
      
      const result = await getSourcedAnswer('What is the topic about?')
      
      expect(result.success).toBe(true)
      expect(result.data).toBe("I couldn't find any relevant information in the ingested documents to answer your question.")
    })

    it('should handle Supabase RPC errors', async () => {
      mockSupabase.rpc.mockResolvedValue({ 
        data: null, 
        error: { message: 'RPC function not found' } 
      })
      
      const result = await getSourcedAnswer('What is the topic about?')
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to get sourced answer: Error matching documents: RPC function not found')
    })

    it('should handle embedding generation errors', async () => {
      vi.mocked(ai.embed).mockRejectedValue(new Error('Embedding failed'))
      
      const result = await getSourcedAnswer('What is the topic about?')
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to get sourced answer: Embedding failed')
    })

    it('should handle AI chat errors', async () => {
      vi.mocked(ai.chat).mockRejectedValue(new Error('Chat service unavailable'))
      
      const result = await getSourcedAnswer('What is the topic about?')
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to get sourced answer: Chat service unavailable')
    })

    it('should format context properly with multiple documents', async () => {
      const question = 'Test question'
      
      await getSourcedAnswer(question)
      
      const chatCall = vi.mocked(ai.chat).mock.calls[0][0]
      expect(chatCall).toContain('- This is relevant document content about the topic.')
      expect(chatCall).toContain('- Another relevant piece of information.')
      expect(chatCall).toContain('Test question')
    })

    it('should use correct similarity threshold and match count', async () => {
      await getSourcedAnswer('Test question')
      
      expect(mockSupabase.rpc).toHaveBeenCalledWith('match_documents', {
        query_embedding: [0.1, 0.2, 0.3, 0.4, 0.5], // Updated to match implementation
        match_threshold: 0.5,
        match_count: 5
      })
    })
  })
})