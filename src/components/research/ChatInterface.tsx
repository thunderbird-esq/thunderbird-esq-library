// src/components/research/ChatInterface.tsx
'use client';

import { useState } from 'react';
import { getSourcedAnswer } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function ChatInterface() {
  const [question, setQuestion] = useState("What was Louis Pasteur's role?");
  const [finalAnswer, setFinalAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleQuestionSubmit = async () => {
    setLoading(true);
    setFinalAnswer('');
    setError('');
    const result = await getSourcedAnswer(question);
    if (result.success && result.data) {
      setFinalAnswer(result.data);
    } else {
      setError(result.error || 'An unknown error occurred.');
    }
    setLoading(false);
  };

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Step 3: Chat with Your Documents (RAG)</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
            <p className="mb-4 text-sm text-red-500 font-bold bg-red-500/10 p-3 rounded-md">
              Error: {error}
            </p>
        )}
        <div className="flex flex-col gap-4">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question about the ingested documents..."
            disabled={loading}
          />
          <Button
            type="button"
            onClick={handleQuestionSubmit}
            disabled={loading}
          >
            {loading ? 'Thinking...' : 'Get Sourced Answer'}
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
  );
}
