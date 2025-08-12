// src/app/types.ts

/**
 * A standardized structure for the return value of server actions.
 * @template T The type of the data returned on success.
 */
export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Internet Archive document structure from search API
 */
export interface InternetArchiveDocument {
  identifier: string;
  title: string;
  creator?: string;
  date?: string;
  format?: string[];
}

/**
 * Document structure returned from Supabase match_documents function
 */
export interface MatchedDocument {
  content: string;
  similarity?: number;
  document_id?: string;
  title?: string;
}
