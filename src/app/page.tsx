'use client';

import { useState } from 'react';
import { searchInternetArchive } from '@/app/actions';
import { DocumentList } from '@/components/research/DocumentList';
import { ChatInterface } from '@/components/research/ChatInterface';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InternetArchiveDocument } from '@/app/types';

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('');
  const [documents, setDocuments] = useState<InternetArchiveDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    setError(null);
    setDocuments([]);

    const result = await searchInternetArchive(searchQuery);

    if (result.success) {
      setDocuments(result.data || []);
    } else {
      setError(result.error || 'An unknown error occurred.');
    }

    setIsLoading(false);
  };

  return (
    <div className="container mx-auto px-4 py-12">
      <header className="text-center mb-12">
        <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl">
          Thunderbird-ESQ Research Assistant
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Your AI-powered partner for document research and analysis.
        </p>
      </header>

      <main className="space-y-8 max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Step 1: Find Your Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                type="search"
                placeholder="Search the Internet Archive..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                disabled={isLoading}
                data-testid="search-input"
              />
              <Button 
                onClick={handleSearch} 
                disabled={isLoading}
                data-testid="search-button"
              >
                {isLoading ? 'Searching...' : 'Search'}
              </Button>
            </div>
            {error && (
              <p className="mt-2 text-sm text-red-600">{error}</p>
            )}
          </CardContent>
        </Card>

        {documents.length > 0 && (
          <div data-testid="search-results">
            <DocumentList documents={documents} />
          </div>
        )}

        <ChatInterface />
      </main>
    </div>
  );
}
