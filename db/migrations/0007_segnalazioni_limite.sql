-- Deep Studio · 0007 · segnalazioni: il limite giornaliero passa in un trigger (17 nov 2026)
-- Nella 0006 la regola di inserimento contava le righe della stessa tabella: Postgres la rifiutava con
-- "infinite recursion detected in policy" e nessuna segnalazione passava. Ora la regola controlla solo chi scrive e
-- di chi è il progetto; il limite (30 al giorno per persona) lo fa un trigger prima di ogni inserimento.

drop policy "segnalazioni: scrivo le mie" on public.segnalazioni;
create policy "segnalazioni: scrivo le mie" on public.segnalazioni
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and (project_id is null
         or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))));

create function public.segnalazioni_limite() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.segnalazioni s
      where s.owner_id = new.owner_id and s.created_at > now() - interval '1 day') >= 30 then
    raise exception 'troppe segnalazioni oggi' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.segnalazioni_limite() from public, anon, authenticated;

create trigger segnalazioni_limite before insert on public.segnalazioni
  for each row execute function public.segnalazioni_limite();
