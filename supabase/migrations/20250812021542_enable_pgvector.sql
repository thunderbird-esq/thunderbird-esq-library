-- Enable the pgvector extension
create extension if not exists vector with schema extensions;

-- Grant usage on the extensions schema to the postgres role
grant usage on schema extensions to postgres;

-- Add the extensions schema to the search path for the postgres user
-- This ensures that vector functions are available in the public schema
alter role postgres set search_path = "$user", public, extensions;
