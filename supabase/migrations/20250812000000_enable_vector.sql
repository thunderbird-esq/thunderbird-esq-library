create extension if not exists vector with schema extensions;
grant usage on schema extensions to postgres;
grant all on all functions in schema extensions to postgres;
alter role postgres set search_path = "$user", public, extensions;
