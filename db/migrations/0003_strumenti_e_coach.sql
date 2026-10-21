-- Deep Studio · 0003 · più strumenti e conversazione con il coach (21 ott 2026)

-- Ruoli degli stem: stessa lista di analysis/stem_roles.json (e web/lib/stem-roles.json)
alter type public.stem_role add value if not exists 'snare';
alter type public.stem_role add value if not exists 'hats';
alter type public.stem_role add value if not exists 'toms';
alter type public.stem_role add value if not exists 'cymbals';
alter type public.stem_role add value if not exists 'sub';
alter type public.stem_role add value if not exists 'pluck';
alter type public.stem_role add value if not exists 'arp';
alter type public.stem_role add value if not exists 'chords';
alter type public.stem_role add value if not exists 'guitar';
alter type public.stem_role add value if not exists 'piano';
alter type public.stem_role add value if not exists 'keys';
alter type public.stem_role add value if not exists 'organ';
alter type public.stem_role add value if not exists 'strings';
alter type public.stem_role add value if not exists 'brass';
alter type public.stem_role add value if not exists 'woodwinds';
alter type public.stem_role add value if not exists 'backing_vox';
alter type public.stem_role add value if not exists 'vocal_chop';
alter type public.stem_role add value if not exists 'choir';

-- Conversazione con il coach, legata a una versione della traccia.
-- Le righe le scrive la route /api/coach con la sessione dell'utente (RLS attiva):
-- un utente può leggere e aggiungere solo messaggi suoi, su versioni sue.
create table public.coach_messages (
  id          uuid primary key default gen_random_uuid(),
  version_id  uuid not null references public.track_versions (id) on delete cascade,
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null check (length(content) between 1 and 20000),
  model       text,
  tokens_in   integer,
  tokens_out  integer,
  cost_usd    numeric(10, 5),
  created_at  timestamptz not null default now()
);
create index coach_messages_version_idx on public.coach_messages (version_id, created_at);
create index coach_messages_owner_idx on public.coach_messages (owner_id);

alter table public.coach_messages enable row level security;

create policy "coach: leggo i miei messaggi" on public.coach_messages
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "coach: scrivo nelle mie versioni" on public.coach_messages
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.track_versions v where v.id = version_id and v.owner_id = (select auth.uid())));
