// src/app/test-api/page.tsx

'use client';

import { useState } from 'react';
import {
  askModel,
  getSourcedAnswer,
  searchInternetArchive,
  fetchAndChunkText,
  generateEmbeddingsAndStore,
} from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function TestApiPage() {
  const [topic, setTopic] = useState('the germ theory');
  const [archiveResults, setArchiveResults] = useState<any[]>([]);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [ingestingDocId, setIngestingDocId] = useState<string | null>(null);
  const [ingestionStatus, setIngestionStatus] = useState<
    Record<string, 'success' | 'failed'>
  >({});
  const [question, setQuestion] = useState("What was Louis Pasteur's role?");
  const [simpleAiResponse, setSimpleAiResponse] = useState('');
  const [finalAnswer, setFinalAnswer] = useState('');

  const handleSimpleAsk = async () => {
    setLoadingAction('simple_ask');
    setSimpleAiResponse('');
    const response = await askModel(topic);
    setSimpleAiResponse(response);
    setLoadingAction(null);
  };

  const handleSearch = async () => {
    setLoadingAction('search');
    setArchiveResults([]);
    const results = await searchInternetArchive(topic);
    setArchiveResults(results);
    setLoadingAction(null);
  };

  const handleIngest = async (documentId: string, title: string) => {
    setIngestingDocId(documentId);
    setIngestionStatus((prev) => ({ ...prev, [documentId]: undefined }));
    const chunks = await fetchAndChunkText(documentId);

    if (chunks.length === 0) {
      setIngestionStatus((prev) => ({ ...prev, [documentId]: 'failed' }));
      setIngestingDocId(null);
      return;
    }

    const result = await generateEmbeddingsAndStore(chunks, documentId, title);
    if (result.success) {
      setIngestionStatus((prev) => ({ ...prev, [documentId]: 'success' }));
    } else {
      setIngestionStatus((prev) => ({ ...prev, [documentId]: 'failed' }));
    }
    setIngestingDocId(null);
  };

  const handleQuestionSubmit = async () => {
    setLoadingAction('rag');
    setFinalAnswer('');
    const answer = await getSourcedAnswer(question);
    setFinalAnswer(answer);
    setLoadingAction(null);
  };

  const isAnyActionLoading = loadingAction !== null || ingestingDocId !== null;

  return (
    <div className="container mx-auto p-4 sm:p-8 space-y-6">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>🧪 Ultimate Test Page</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Use this page to test all core server actions independently.
          </p>
        </CardContent>
      </Card>

      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Step 1: Base AI & Document Search</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Enter a topic for AI or Search..."
            disabled={isAnyActionLoading}
          />
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              onClick={handleSimpleAsk}
              disabled={isAnyActionLoading}
            >
              {loadingAction === 'simple_ask' ? 'Thinking...' : 'Test Ask AI'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleSearch}
              disabled={isAnyActionLoading}
            >
              {loadingAction === 'search' ? 'Searching...' : 'Search for Documents'}
            </Button>
          </div>
          {simpleAiResponse && (
            <div className="mt-4">
              <p className="text-sm font-semibold">Simple AI Response:</p>
              <p className="whitespace-pre-wrap font-mono text-sm p-4 bg-gray-100 dark:bg-gray-800 rounded-md">
                {simpleAiResponse}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {archiveResults.length > 0 && (
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Step 2: Document Ingestion</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3">
              {archiveResults.map((doc) => {
                const status = ingestionStatus[doc.identifier];
                const isThisOneIngesting = ingestingDocId === doc.identifier;
                return (
                  <li key={doc.identifier} className="p-3 border rounded-md flex justify-between items-center">
                    <div>
                      <p className="font-semibold">{doc.title || 'Untitled'}</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.creator || 'Unknown Author'} ({doc.date ? new Date(doc.date).getFullYear() : 'N/A'})
                      </p>
                      {status === 'success' && <p className="text-xs text-green-500 font-bold">Successfully Ingested!</p>}
                      {status === 'failed' && <p className="text-xs text-red-500 font-bold">Ingestion Failed</p>}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleIngest(doc.identifier, doc.title)} disabled={isAnyActionLoading || status === 'success'}>
                      {isThisOneIngesting ? 'Ingesting...' : status === 'failed' ? 'Retry' : 'Ingest'}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Step 3: Chat with Your Documents (RAG)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question about the ingested documents..."
              disabled={isAnyActionLoading}
            />
            <Button
              type="button"
              onClick={handleQuestionSubmit}
              disabled={isAnyActionLoading}
            >
              {loadingAction === 'rag' ? 'Thinking...' : 'Get Sourced Answer'}
            </Button>
          </div>
          {finalAnswer && (
            <div className="mt-6">
              <p className="whitespace-pre-wrap font-mono text-sm p-4 bg-gray-100 dark:bg-gray-800 rounded-md">
                {finalAnswer}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
