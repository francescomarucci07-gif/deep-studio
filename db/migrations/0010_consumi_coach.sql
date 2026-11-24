-- Deep Studio · 0010 · i consumi del coach per gli admin (24 nov 2026)
-- Ogni risposta del coach salva modello, token e costo in coach_messages (dal primo giorno, come chiedono le regole).
-- La pagina /studio/consumi li mostra a chi gestisce il prodotto, ma solo come totali: questa funzione restituisce
-- giorno, persona (un numero, niente email), risposte, token e costo, mai il testo dei messaggi. Risponde solo a chi è
-- nella tabella admins (migrazione 0008); agli altri dà errore.

create function public.consumi_coach(p_giorni integer default 30)
returns table (giorno date, persona integer, e_tu boolean, risposte integer, tokens_in bigint, tokens_out bigint, costo_usd numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'solo per gli admin' using errcode = '42501';
  end if;
  return query
    with r as (
      select m.owner_id, (m.created_at at time zone 'Europe/Rome')::date as g, m.tokens_in, m.tokens_out, m.cost_usd
      from public.coach_messages m
      where m.role = 'assistant'
        and m.created_at > now() - make_interval(days => greatest(1, least(p_giorni, 366)))
    ),
    -- un numero per persona, in ordine di primo uso: "persona 1" è chi ha usato il coach per primo nel periodo
    p as (
      select owner_id, (row_number() over (order by min(g), owner_id))::integer as n from r group by owner_id
    )
    select r.g, p.n, r.owner_id = (select auth.uid()), count(*)::integer,
           coalesce(sum(r.tokens_in), 0)::bigint, coalesce(sum(r.tokens_out), 0)::bigint, coalesce(sum(r.cost_usd), 0)
    from r join p using (owner_id)
    group by r.g, p.n, r.owner_id
    order by r.g desc, p.n;
end;
$$;
revoke execute on function public.consumi_coach(integer) from public, anon;
grant execute on function public.consumi_coach(integer) to authenticated;
