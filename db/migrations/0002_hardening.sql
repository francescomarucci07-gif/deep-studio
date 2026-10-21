-- Deep Studio · 0002 · correzioni dagli advisor di Supabase (20 ott 2026)

-- search_path fisso: una funzione non deve dipendere da chi la chiama
alter function public.set_updated_at() set search_path = '';

-- handle_new_user serve solo come trigger: nessuno deve poterla chiamare via API
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- retry_job resta chiamabile dagli utenti loggati di proposito (pulsante "Riprova"):
-- dentro controlla owner_id = auth.uid() e status = 'errore'.

-- indici su owner_id: la RLS filtra su questa colonna a ogni query
create index if not exists track_versions_owner_id_idx on public.track_versions (owner_id);
create index if not exists uploads_owner_id_idx on public.uploads (owner_id);
create index if not exists jobs_owner_id_idx on public.jobs (owner_id);
create index if not exists analyses_owner_id_idx on public.analyses (owner_id);
create index if not exists analyses_job_id_idx on public.analyses (job_id);
create index if not exists coach_reports_owner_id_idx on public.coach_reports (owner_id);
create index if not exists coach_reports_analysis_id_idx on public.coach_reports (analysis_id);
create index if not exists notes_owner_id_idx on public.notes (owner_id);
create index if not exists feedback_owner_id_idx on public.feedback (owner_id);
