-- Deep Studio · 0011 · esercizi per la modalità lezione (26 nov 2026)
-- L'insegnante trasforma un suo progetto in un esercizio: titolo, consegna e una "fotografia" del progetto, con un link
-- /esercizio/<codice>. Lo studente apre il link, legge la consegna, ascolta e preme "Copia nel mio studio": nasce un
-- progetto suo (con la consegna dentro, che vede anche il coach). Un esercizio per progetto, come il link di ascolto.
--
-- Sicurezza: la tabella ha la RLS (ognuno vede e cambia solo i suoi esercizi). Chi ha il codice legge l'esercizio con
-- esercizio(codice), senza autore né id del progetto; la copia la fa esercizio_copia(codice), solo con il login, e il
-- progetto nuovo è di chi copia. Nessuno può elencare gli esercizi degli altri; il codice è casuale (24 caratteri).

create table public.esercizi (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id  uuid not null unique references public.projects (id) on delete cascade,
  codice      text not null unique default replace(replace(encode(extensions.gen_random_bytes(18), 'base64'), '/', '_'), '+', '-'),
  title       text not null check (length(btrim(title)) between 1 and 120),
  consegna    text not null default '' check (length(consegna) <= 1500),
  data        jsonb not null check (pg_column_size(data) < 200000), -- come projects.data: la copia deve starci
  copie       integer not null default 0, -- quanti studenti l'hanno copiato
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index esercizi_owner_idx on public.esercizi (owner_id);

alter table public.esercizi enable row level security;
create policy "esercizi: leggo i miei" on public.esercizi
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "esercizi: creo i miei" on public.esercizi
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy "esercizi: aggiorno i miei" on public.esercizi
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "esercizi: tolgo i miei" on public.esercizi
  for delete to authenticated using (owner_id = (select auth.uid()));
-- dal sito si cambiano solo titolo, consegna, fotografia e data: codice, autore e contatore no
revoke update on public.esercizi from anon, authenticated;
grant update (title, consegna, data, updated_at) on public.esercizi to authenticated;

-- La pagina dell'esercizio: si legge anche senza login (per vedere la consegna prima di entrare), solo con il codice.
create function public.esercizio(p_codice text)
returns table (title text, consegna text, data jsonb, copie integer, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select e.title, e.consegna, e.data, e.copie, e.updated_at from public.esercizi e where e.codice = p_codice;
$$;
revoke execute on function public.esercizio(text) from public;
grant execute on function public.esercizio(text) to anon, authenticated;

-- "Copia nel mio studio": crea il progetto dello studente dalla fotografia e conta la copia. Restituisce l'id del
-- progetto nuovo (null se il codice non esiste). Solo con il login: il progetto è di chi lo copia.
create function public.esercizio_copia(p_codice text)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  e  public.esercizi%rowtype;
  nuovo uuid;
begin
  if me is null then
    raise exception 'serve il login' using errcode = '42501';
  end if;
  select * into e from public.esercizi where codice = p_codice;
  if not found then
    return null;
  end if;
  insert into public.projects (owner_id, title, bpm, data)
  values (
    me,
    left('Esercizio · ' || e.title, 120),
    greatest(60, least(200, coalesce(case when jsonb_typeof(e.data -> 'bpm') = 'number' then (e.data ->> 'bpm')::numeric end, 122))),
    e.data
  )
  returning id into nuovo;
  update public.esercizi set copie = copie + 1 where id = e.id;
  return nuovo;
end;
$$;
revoke execute on function public.esercizio_copia(text) from public, anon;
grant execute on function public.esercizio_copia(text) to authenticated;
