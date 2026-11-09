-- Deep Studio · 0005 · cronologia delle versioni dei progetti (9 nov 2026)
-- Una "fotografia" del progetto: prima di ogni modifica del coach, ogni 10 minuti di lavoro e a mano.
-- Le scrive il browser con la sessione dell'utente: la RLS fa tutta la sicurezza.

create table public.project_versions (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null check (length(title) between 1 and 120),
  label       text not null check (length(label) between 1 and 120),
  data        jsonb not null check (pg_column_size(data) < 200000),
  created_at  timestamptz not null default now()
);
create index project_versions_project_idx on public.project_versions (project_id, created_at desc);
create index project_versions_owner_idx on public.project_versions (owner_id);

alter table public.project_versions enable row level security;

create policy "versioni: leggo le mie" on public.project_versions
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "versioni: salvo nei miei progetti" on public.project_versions
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy "versioni: cancello le mie" on public.project_versions
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Tengo le ultime 60 versioni per progetto: le più vecchie si cancellano da sole
create function public.prune_project_versions() returns trigger
language plpgsql set search_path = '' as $$
begin
  delete from public.project_versions
  where project_id = new.project_id
    and id not in (
      select id from public.project_versions
      where project_id = new.project_id
      order by created_at desc
      limit 60);
  return null;
end;
$$;
revoke execute on function public.prune_project_versions() from public, anon, authenticated;

create trigger project_versions_prune after insert on public.project_versions
  for each row execute function public.prune_project_versions();
