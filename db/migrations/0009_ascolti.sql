-- Deep Studio · 0009 · link di ascolto (20 nov 2026)
-- Il producer condivide una traccia con un link pubblico: /ascolta/<codice>. Non si salva audio: i suoni dello studio
-- sono sintetizzati, quindi basta una "fotografia" del progetto (pochi kB) che la pagina fa suonare con lo stesso motore.
-- Un link per progetto; "Aggiorna" rifà la fotografia con lo stesso codice, "Togli" lo cancella.
--
-- Sicurezza: la tabella ha la RLS come le altre (ognuno vede e cambia solo i suoi link). Chi ascolta, anche senza
-- account, passa dalla funzione ascolto(codice), che restituisce una sola fotografia e solo se il codice è giusto:
-- nessuno può elencare i link degli altri. Il codice è casuale (18 byte, 24 caratteri): non si indovina.

create table public.ascolti (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id  uuid not null unique references public.projects (id) on delete cascade,
  codice      text not null unique default replace(replace(encode(extensions.gen_random_bytes(18), 'base64'), '/', '_'), '+', '-'),
  title       text not null check (length(btrim(title)) between 1 and 120),
  data        jsonb not null check (pg_column_size(data) < 1000000),
  ascolti     integer not null default 0, -- quante volte è partito il Play dalla pagina
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index ascolti_owner_idx on public.ascolti (owner_id);

alter table public.ascolti enable row level security;
create policy "ascolti: leggo i miei" on public.ascolti
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "ascolti: creo i miei" on public.ascolti
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy "ascolti: aggiorno i miei" on public.ascolti
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "ascolti: tolgo i miei" on public.ascolti
  for delete to authenticated using (owner_id = (select auth.uid()));
-- dal sito si cambiano solo titolo, fotografia e data: codice, autore e contatore no
revoke update on public.ascolti from anon, authenticated;
grant update (title, data, updated_at) on public.ascolti to authenticated;

-- La pagina pubblica: una fotografia per codice. security definer = legge anche senza login, ma solo questa riga e
-- solo questi campi (niente autore, niente id del progetto).
create function public.ascolto(p_codice text)
returns table (title text, data jsonb, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.title, a.data, a.updated_at from public.ascolti a where a.codice = p_codice;
$$;
revoke execute on function public.ascolto(text) from public;
grant execute on function public.ascolto(text) to anon, authenticated;

-- Il contatore degli ascolti: +1 quando qualcuno preme Ascolta (al massimo uno ogni tanto per pagina, lo decide il browser)
create function public.ascolto_play(p_codice text)
returns void
language sql volatile security definer set search_path = '' as $$
  update public.ascolti set ascolti = ascolti + 1 where codice = p_codice;
$$;
revoke execute on function public.ascolto_play(text) from public;
grant execute on function public.ascolto_play(text) to anon, authenticated;
