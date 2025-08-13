create table if not exists public.documents (
    id bigserial primary key,
    document_id text,
    title text,
    content text,
    embedding vector(384)
);

create or replace function public.match_documents (
  query_embedding vector(384),
  match_threshold float,
  match_count int
)
returns table (
  id bigint,
  document_id text,
  title text,
  content text,
  similarity float
)
language sql stable
as $$
  select
    documents.id,
    documents.document_id,
    documents.title,
    documents.content,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where 1 - (documents.embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
$$;
