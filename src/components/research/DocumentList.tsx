// src/components/research/DocumentList.tsx
'use client';

import { DocumentItem } from './DocumentItem';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Document = {
  identifier: string;
  title: string;
  creator?: string;
  date?: string;
};

export function DocumentList({ documents }: { documents: Document[] }) {
  if (documents.length === 0) {
    return null;
  }

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Step 2: Document Ingestion</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-3">
          {documents.map((doc) => (
            <DocumentItem key={doc.identifier} doc={doc} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
