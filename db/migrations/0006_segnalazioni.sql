-- Deep Studio · 0006 · segnalazioni dallo studio (17 nov 2026)
-- Il pulsante "Segnala" nello studio: chi prova scrive cosa non va; con il messaggio si salvano la vista aperta, il
-- progetto e qualche dato tecnico (browser, schermo). Le scrive il browser con la sessione dell'utente: ognuno vede
-- solo le sue; Francesco le legge dalla dashboard di Supabase (Table editor → segnalazioni).
-- (la tabella "feedback" che esiste già è un'altra cosa: i giudizi sulle note del coach, M4)

create table public.segnalazioni (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id  uuid references public.projects (id) on delete set null,
  message     text not null check (length(btrim(message)) between 1 and 4000),
  view        text check (length(view) <= 40),
  info        jsonb not null default '{}'::jsonb check (pg_column_size(info) < 4000),
  created_at  timestamptz not null default now()
);
create index segnalazioni_owner_idx on public.segnalazioni (owner_id, created_at desc);
create index segnalazioni_project_idx on public.segnalazioni (project_id);

alter table public.segnalazioni enable row level security;

create policy "segnalazioni: leggo le mie" on public.segnalazioni
  for select to authenticated using (owner_id = (select auth.uid()));
-- al massimo 30 segnalazioni al giorno per persona, e solo sui propri progetti
create policy "segnalazioni: scrivo le mie" on public.segnalazioni
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and (project_id is null
         or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())))
    and (select count(*) from public.segnalazioni f
         where f.owner_id = (select auth.uid()) and f.created_at > now() - interval '1 day') < 30);
