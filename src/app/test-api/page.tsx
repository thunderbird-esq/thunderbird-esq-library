// src/app/test-api/page.tsx

'use client';

import { useState } from 'react';
import { searchInternetArchive, askModel } from '@/app/actions';

// Import our new components
import { DocumentList } from '@/components/research/DocumentList';
import { ChatInterface } from '@/components/research/ChatInterface';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type ArchiveDocument = {
  identifier: string;
  title: string;
  creator?: string;
  date?: string;
  format?: string[];
};

export default function TestApiPage() {
  const [topic, setTopic] = useState('the germ theory');
  const [archiveResults, setArchiveResults] = useState<ArchiveDocument[]>([]);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [simpleAiResponse, setSimpleAiResponse] = useState('');
  const [generalError, setGeneralError] = useState('');

  const handleSearch = async () => {
    setLoadingAction('search');
    setArchiveResults([]);
    setGeneralError('');
    const result = await searchInternetArchive(topic);
    if (result.success && result.data) {
      setArchiveResults(result.data);
    } else {
      setGeneralError(result.error || 'An unknown error occurred during search.');
    }
    setLoadingAction(null);
  };
  
  // Test AI function can remain here for now
  const handleSimpleAsk = async () => {
    setLoadingAction('simple_ask');
    setSimpleAiResponse('');
    setGeneralError('');
    const result = await askModel(topic);
    if (result.success && result.data) {
      setSimpleAiResponse(result.data);
    } else {
      setGeneralError(result.error || 'An unknown error occurred.');
    }
    setLoadingAction(null);
  };


  return (
    <div className="container mx-auto p-4 sm:p-8 space-y-6">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>🧪 Ultimate Test Page</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            A hardened test page built from modular components.
          </p>
          {generalError && (
            <p className="mt-4 text-sm text-red-500 font-bold bg-red-500/10 p-3 rounded-md">
              Error: {generalError}
            </p>
          )}
        </CardContent>
      </Card>
      
      {/* Search and Simple AI Card */}
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Step 1: Base AI & Document Search</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Enter a topic..."
            disabled={!!loadingAction}
          />
          <div className="flex flex-col gap-2">
            <Button onClick={handleSimpleAsk} disabled={!!loadingAction}>
              {loadingAction === 'simple_ask' ? 'Thinking...' : 'Test Ask AI'}
            </Button>
            <Button variant="secondary" onClick={handleSearch} disabled={!!loadingAction}>
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

      {/* Render the new components */}
      <DocumentList documents={archiveResults} />
      <ChatInterface />
    </div>
  );
}
