-- Deep Studio · 0001_init · schema iniziale (M1)
-- Ricostruito il 20 ott 2026 dal modello dati del documento "P6 · Architettura e stack".
--
-- Regola d'oro: ogni tabella ha owner_id e la row-level security (RLS) attiva.
-- Un utente vede e modifica solo le righe con owner_id = auth.uid().
-- Il worker (M2) usa la service role key, che salta la RLS: per questo vive solo sul server.

-- ---------------------------------------------------------------------------
-- Tipi
-- ---------------------------------------------------------------------------

create type public.subgenre as enum ('deep', 'tech', 'progressive');
create type public.stage as enum ('idea_grezza', 'mix_a_meta', 'finita');
create type public.export_kind as enum ('master', 'nomaster');
create type public.upload_kind as enum ('mix', 'stem');
-- stessi ruoli di role_of() in analysis/deep_studio_analyze.py
create type public.stem_role as enum ('kick', 'bass', 'drums', 'perc', 'clap', 'lead', 'pad', 'fx', 'vox', 'other');
-- i LED della schermata "Analisi in corso", nell'ordine
create type public.job_status as enum ('in_coda', 'in_analisi', 'separazione_stem', 'coach', 'pronta', 'errore');
create type public.note_status as enum ('aperta', 'applicata', 'ignorata', 'sbagliata');

-- ---------------------------------------------------------------------------
-- Tabelle
-- ---------------------------------------------------------------------------

create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  display_name        text,
  language            text not null default 'it' check (language in ('it', 'en')),
  preferred_subgenres public.subgenre[] not null default '{}',
  level               text,
  created_at          timestamptz not null default now()
);

create table public.tracks (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text not null check (length(trim(title)) > 0),
  subgenre   public.subgenre not null,
  created_at timestamptz not null default now()
);

create table public.track_versions (
  id          uuid primary key default gen_random_uuid(),
  track_id    uuid not null references public.tracks (id) on delete cascade,
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  version_no  integer not null check (version_no >= 1),
  stage       public.stage not null,
  export_kind public.export_kind not null,
  created_at  timestamptz not null default now(),
  unique (track_id, version_no)
);

create table public.uploads (
  id               uuid primary key default gen_random_uuid(),
  version_id       uuid not null references public.track_versions (id) on delete cascade,
  owner_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind             public.upload_kind not null,
  role             public.stem_role,
  file_name        text not null,
  -- percorso nel bucket "audio": <utente>/<traccia>/<versione>/<file>
  storage_path     text not null unique,
  size_bytes       bigint check (size_bytes >= 0),
  -- l'audio si cancella dopo 30 giorni (proposta P6, da confermare con Spencer)
  audio_expires_at timestamptz not null default now() + interval '30 days',
  audio_deleted_at timestamptz,
  created_at       timestamptz not null default now(),
  check ((kind = 'mix' and role is null) or (kind = 'stem' and role is not null)),
  check (split_part(storage_path, '/', 1) = owner_id::text)
);
-- un solo mix per versione
create unique index uploads_one_mix_per_version on public.uploads (version_id) where kind = 'mix';

create table public.jobs (
  id            uuid primary key default gen_random_uuid(),
  version_id    uuid not null references public.track_versions (id) on delete cascade,
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  status        public.job_status not null default 'in_coda',
  error_message text,
  attempts      integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz
);
create index jobs_queue on public.jobs (created_at) where status = 'in_coda';

create table public.analyses (
  id             uuid primary key default gen_random_uuid(),
  version_id     uuid not null references public.track_versions (id) on delete cascade,
  job_id         uuid references public.jobs (id) on delete set null,
  owner_id       uuid not null references auth.users (id) on delete cascade,
  schema_version text not null,
  analyzer       text not null,
  data           jsonb not null,
  compute_s      numeric,
  created_at     timestamptz not null default now()
);

create table public.coach_reports (
  id             uuid primary key default gen_random_uuid(),
  analysis_id    uuid not null references public.analyses (id) on delete cascade,
  owner_id       uuid not null references auth.users (id) on delete cascade,
  model          text not null,
  prompt_version text not null,
  data           jsonb not null,
  tokens_in      integer,
  tokens_out     integer,
  cost_usd       numeric(10, 5),
  created_at     timestamptz not null default now()
);

create table public.notes (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references public.coach_reports (id) on delete cascade,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  priority   integer not null check (priority between 1 and 5),
  category   text not null,
  title      text not null,
  body       jsonb not null,
  action     jsonb,
  confidence text check (confidence in ('high', 'medium', 'low')),
  status     public.note_status not null default 'aperta',
  updated_at timestamptz not null default now()
);

-- media dei riferimenti per sottogenere: condivisa, la scrive solo il server
create table public.reference_sets (
  id         uuid primary key default gen_random_uuid(),
  subgenre   public.subgenre not null,
  n_tracks   integer not null,
  data       jsonb not null,
  created_at timestamptz not null default now()
);

-- le 4 domande della rubrica P2, una riga per nota
create table public.feedback (
  id            uuid primary key default gen_random_uuid(),
  note_id       uuid not null references public.notes (id) on delete cascade,
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  right_problem boolean,
  right_fix     boolean,
  useful_in_fl  boolean,
  would_apply   boolean,
  comment       text,
  created_at    timestamptz not null default now(),
  unique (note_id, owner_id)
);

create index on public.tracks (owner_id);
create index on public.track_versions (track_id);
create index on public.uploads (version_id);
create index on public.jobs (version_id);
create index on public.analyses (version_id);
create index on public.notes (report_id);

-- ---------------------------------------------------------------------------
-- Funzioni e trigger
-- ---------------------------------------------------------------------------

create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger jobs_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();
create trigger notes_updated_at before update on public.notes
  for each row execute function public.set_updated_at();

-- profilo creato in automatico al primo login
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- "Riprova" (storia 4): l'utente non puo' scrivere jobs direttamente,
-- puo' solo rimettere in coda un SUO job finito in errore.
create function public.retry_job(p_job_id uuid) returns public.jobs
language plpgsql security definer set search_path = '' as $$
declare
  j public.jobs;
begin
  update public.jobs
     set status = 'in_coda', error_message = null, attempts = attempts + 1,
         started_at = null, finished_at = null
   where id = p_job_id and owner_id = auth.uid() and status = 'errore'
  returning * into j;
  if j.id is null then
    raise exception 'job non trovato o non in errore';
  end if;
  return j;
end $$;

revoke execute on function public.retry_job(uuid) from public, anon;
grant execute on function public.retry_job(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles       enable row level security;
alter table public.tracks         enable row level security;
alter table public.track_versions enable row level security;
alter table public.uploads        enable row level security;
alter table public.jobs           enable row level security;
alter table public.analyses       enable row level security;
alter table public.coach_reports  enable row level security;
alter table public.notes          enable row level security;
alter table public.reference_sets enable row level security;
alter table public.feedback       enable row level security;

-- profiles: solo il proprio
create policy "profilo: leggo il mio" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profilo: modifico il mio" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- tracks: tutto sulle proprie
create policy "tracce: le mie" on public.tracks
  for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- track_versions: solo dentro una traccia mia
create policy "versioni: leggo le mie" on public.track_versions
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "versioni: creo nelle mie tracce" on public.track_versions
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.tracks t where t.id = track_id and t.owner_id = (select auth.uid())));
create policy "versioni: cancello le mie" on public.track_versions
  for delete to authenticated using (owner_id = (select auth.uid()));

-- uploads: solo dentro una versione mia; il ruolo dello stem si puo' correggere
create policy "upload: leggo i miei" on public.uploads
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "upload: creo nelle mie versioni" on public.uploads
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.track_versions v where v.id = version_id and v.owner_id = (select auth.uid())));
create policy "upload: correggo i miei" on public.uploads
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "upload: cancello i miei" on public.uploads
  for delete to authenticated using (owner_id = (select auth.uid()));
revoke update on public.uploads from authenticated;
grant update (role) on public.uploads to authenticated;

-- jobs: leggo i miei, ne creo solo "in coda"; gli stati li cambia il worker
create policy "job: leggo i miei" on public.jobs
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "job: metto in coda nelle mie versioni" on public.jobs
  for insert to authenticated with check (
    owner_id = (select auth.uid()) and status = 'in_coda' and attempts = 0
    and exists (select 1 from public.track_versions v where v.id = version_id and v.owner_id = (select auth.uid())));

-- risultati: solo lettura (li scrive il worker)
create policy "analisi: leggo le mie" on public.analyses
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "report: leggo i miei" on public.coach_reports
  for select to authenticated using (owner_id = (select auth.uid()));

-- notes: leggo le mie e ne cambio solo lo stato
create policy "note: leggo le mie" on public.notes
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "note: cambio stato alle mie" on public.notes
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
revoke update on public.notes from authenticated;
grant update (status) on public.notes to authenticated;

-- reference_sets: tutti gli utenti loggati leggono, nessuno scrive dal browser
create policy "riferimenti: lettura" on public.reference_sets
  for select to authenticated using (true);

-- feedback: i miei, solo su note mie
create policy "feedback: i miei" on public.feedback
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.notes n where n.id = note_id and n.owner_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- Storage: bucket privato "audio", percorso <utente>/<traccia>/<versione>/<file>
-- ---------------------------------------------------------------------------

-- 500 MB per file. In locale serve anche [storage] file_size_limit = "500MiB"
-- in supabase/config.toml; sul piano Free hosted il limite massimo e' 50 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audio', 'audio', false, 524288000,
        array['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave', 'audio/flac', 'audio/x-flac']);

create policy "audio: leggo i miei file" on storage.objects
  for select to authenticated
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "audio: carico nella mia cartella" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'audio' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "audio: cancello i miei file" on storage.objects
  for delete to authenticated
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Realtime: la schermata "Analisi in corso" ascolta i cambi di stato dei job
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.jobs;
