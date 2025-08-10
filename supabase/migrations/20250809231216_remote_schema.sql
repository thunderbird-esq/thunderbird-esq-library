create extension if not exists "vector" with schema "public" version '0.8.0';

create sequence "public"."documents_id_seq";

create table "public"."documents" (
    "id" bigint not null default nextval('documents_id_seq'::regclass),
    "document_id" text,
    "title" text,
    "content" text,
    "embedding" vector(384)
);


alter table "public"."documents" enable row level security;

alter sequence "public"."documents_id_seq" owned by "public"."documents"."id";

CREATE UNIQUE INDEX documents_pkey ON public.documents USING btree (id);

alter table "public"."documents" add constraint "documents_pkey" PRIMARY KEY using index "documents_pkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.match_documents(query_embedding vector, match_threshold double precision, match_count integer)
 RETURNS TABLE(id bigint, document_id text, title text, content text, similarity double precision)
 LANGUAGE sql
 STABLE
AS $function$
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
$function$
;

grant delete on table "public"."documents" to "anon";

grant insert on table "public"."documents" to "anon";

grant references on table "public"."documents" to "anon";

grant select on table "public"."documents" to "anon";

grant trigger on table "public"."documents" to "anon";

grant truncate on table "public"."documents" to "anon";

grant update on table "public"."documents" to "anon";

grant delete on table "public"."documents" to "authenticated";

grant insert on table "public"."documents" to "authenticated";

grant references on table "public"."documents" to "authenticated";

grant select on table "public"."documents" to "authenticated";

grant trigger on table "public"."documents" to "authenticated";

grant truncate on table "public"."documents" to "authenticated";

grant update on table "public"."documents" to "authenticated";

grant delete on table "public"."documents" to "service_role";

grant insert on table "public"."documents" to "service_role";

grant references on table "public"."documents" to "service_role";

grant select on table "public"."documents" to "service_role";

grant trigger on table "public"."documents" to "service_role";

grant truncate on table "public"."documents" to "service_role";

grant update on table "public"."documents" to "service_role";

create policy "Allow service_role access"
on "public"."documents"
as permissive
for all
to public
using (true)
with check (true);


create policy "Deny ALL access"
on "public"."documents"
as permissive
for all
to public
using (false)
with check (false);



