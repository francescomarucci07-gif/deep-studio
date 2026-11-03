-- Deep Studio · 0004 · progetti creati nello studio nel browser (3 nov 2026)
-- Un progetto è un pattern (batteria, bassline, mixer) salvato come JSON in data.
-- Lo scrive il browser con la sessione dell'utente: la RLS fa tutta la sicurezza.

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null check (length(title) between 1 and 120),
  bpm         numeric(5, 1) not null default 122 check (bpm between 60 and 200),
  data        jsonb not null default '{}'::jsonb check (pg_column_size(data) < 200000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index projects_owner_idx on public.projects (owner_id, updated_at desc);

create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

alter table public.projects enable row level security;

create policy "progetti: leggo i miei" on public.projects
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "progetti: creo i miei" on public.projects
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "progetti: modifico i miei" on public.projects
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "progetti: cancello i miei" on public.projects
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Il coach parla di una versione caricata (analisi) oppure di un progetto: uno dei due.
alter table public.coach_messages alter column version_id drop not null;
alter table public.coach_messages
  add column project_id uuid references public.projects (id) on delete cascade;
alter table public.coach_messages
  add constraint coach_messages_target check (num_nonnulls(version_id, project_id) = 1);
create index coach_messages_project_idx on public.coach_messages (project_id, created_at);

drop policy "coach: scrivo nelle mie versioni" on public.coach_messages;
create policy "coach: scrivo nelle mie versioni o progetti" on public.coach_messages
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and (
      exists (select 1 from public.track_versions v
              where v.id = version_id and v.owner_id = (select auth.uid()))
      or exists (select 1 from public.projects p
                 where p.id = project_id and p.owner_id = (select auth.uid()))
    ));
