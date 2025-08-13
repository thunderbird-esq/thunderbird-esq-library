alter table public.documents enable row level security;
drop policy if exists "Deny ALL access" on public.documents;
create policy "Deny ALL access" on public.documents for all using (false) with check (false);
drop policy if exists "Allow service_role access" on public.documents;
create policy "Allow service_role access" on public.documents for all using (true) with check (true);
