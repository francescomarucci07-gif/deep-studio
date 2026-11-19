-- Deep Studio · 0008 · la pagina delle segnalazioni per chi gestisce il prodotto (19 nov 2026)
-- Fino a qui ognuno vedeva solo le sue segnalazioni e Francesco le leggeva dalla dashboard di Supabase. Ora c'è una
-- pagina nel sito (/studio/segnalazioni) per gli admin: chi è nella tabella admins le legge tutte e può segnarle come
-- risolte. Il controllo lo fa il database (RLS), non la pagina.
--
-- Gli admin non si aggiungono dal sito: solo dalla dashboard o con l'SQL editor di Supabase, per esempio
--   insert into public.admins (user_id) select id from auth.users where email = '<email>';
-- (l'email non sta qui: il repo non contiene dati personali)

create table public.admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);
alter table public.admins enable row level security;
-- ognuno può solo sapere se lui stesso è admin (la pagina lo usa per decidere se mostrarsi); nessuno scrive dal sito
create policy "admins: vedo se sono io" on public.admins
  for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.admins from anon, authenticated;

-- una segnalazione sistemata: quando (null = da guardare)
alter table public.segnalazioni add column risolta_at timestamptz;

create policy "segnalazioni: gli admin leggono tutte" on public.segnalazioni
  for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));
create policy "segnalazioni: gli admin segnano risolte" on public.segnalazioni
  for update to authenticated
  using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));
-- dal sito si può cambiare solo "risolta": messaggio, autore e dati tecnici restano come li ha scritti chi segnala
revoke update on public.segnalazioni from anon, authenticated;
grant update (risolta_at) on public.segnalazioni to authenticated;

create index segnalazioni_created_idx on public.segnalazioni (created_at desc);
