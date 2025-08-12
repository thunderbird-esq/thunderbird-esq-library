'use client';

import { useState } from 'react';
import { searchInternetArchive, askModel } from '@/app/actions';
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

export default function Home() {
  const [searchTopic, setSearchTopic] = useState('');
  const [documents, setDocuments] = useState<ArchiveDocument[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [simpleAiResponse, setSimpleAiResponse] = useState('');
  const [isAsking, setIsAsking] = useState(false);

  const handleSearch = async () => {
    if (!searchTopic.trim()) return;
    
    setIsSearching(true);
    setDocuments([]);
    setSearchError('');
    
    try {
      const result = await searchInternetArchive(searchTopic);
      if (result.success && result.data) {
        setDocuments(result.data);
      } else {
        setSearchError(result.error || 'Search failed. Please try again.');
      }
    } catch {
      setSearchError('An unexpected error occurred during search.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSimpleAsk = async () => {
    if (!searchTopic.trim()) return;
    
    setIsAsking(true);
    setSimpleAiResponse('');
    setSearchError('');
    
    try {
      const result = await askModel(searchTopic);
      if (result.success && result.data) {
        setSimpleAiResponse(result.data);
      } else {
        setSearchError(result.error || 'AI request failed. Please try again.');
      }
    } catch {
      setSearchError('An unexpected error occurred during AI request.');
    } finally {
      setIsAsking(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isSearching && !isAsking) {
      handleSearch();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Thunderbird-ESQ Research Assistant
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
            AI-powered document research and analysis using Internet Archive sources with advanced RAG capabilities.
          </p>
        </div>

        {/* Search Interface */}
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>🤖</span>
              Step 1: Ask AI or Search Internet Archive
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Input
                type="text"
                value={searchTopic}
                onChange={(e) => setSearchTopic(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter research topic (e.g., 'artificial intelligence', 'climate change')..."
                disabled={isSearching || isAsking}
                className="w-full"
              />
              <div className="flex gap-2">
                <Button 
                  onClick={handleSimpleAsk} 
                  disabled={isAsking || isSearching || !searchTopic.trim()}
                  className="flex-1"
                  variant="outline"
                >
                  {isAsking ? 'Thinking...' : 'Ask AI'}
                </Button>
                <Button 
                  onClick={handleSearch} 
                  disabled={isSearching || isAsking || !searchTopic.trim()}
                  className="flex-1"
                >
                  {isSearching ? 'Searching...' : 'Search Archive'}
                </Button>
              </div>
            </div>
            
            {searchError && (
              <div className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-md">
                ⚠️ {searchError}
              </div>
            )}
            
            {documents.length > 0 && (
              <div className="text-sm text-green-600 dark:text-green-400">
                ✅ Found {documents.length} documents. Review below and proceed to Step 3 to chat with your research.
              </div>
            )}
            
            {simpleAiResponse && (
              <div className="space-y-2">
                <div className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                  🤖 AI Response:
                </div>
                <div className="p-4 text-sm bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md whitespace-pre-wrap">
                  {simpleAiResponse}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Document Results */}
        {documents.length > 0 && (
          <DocumentList documents={documents} />
        )}

        {/* Chat Interface */}
        <ChatInterface />

        {/* Instructions */}
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>📋 How to Use</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex gap-3">
              <span className="font-semibold text-blue-600 dark:text-blue-400 min-w-[60px]">Step 1:</span>
              <span>Search for documents related to your research topic using the Internet Archive.</span>
            </div>
            <div className="flex gap-3">
              <span className="font-semibold text-purple-600 dark:text-purple-400 min-w-[60px]">Step 2:</span>
              <span>Review the found documents. The system automatically processes and stores them for analysis.</span>
            </div>
            <div className="flex gap-3">
              <span className="font-semibold text-green-600 dark:text-green-400 min-w-[60px]">Step 3:</span>
              <span>Ask questions in the chat interface. The AI will provide answers based on your ingested documents using advanced RAG technology.</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
