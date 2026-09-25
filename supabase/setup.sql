-- =====================================================================================
-- Fio Fresbee — configurazione del database Supabase
-- Da eseguire UNA volta: Supabase → progetto del gioco → SQL Editor → incolla tutto → Run.
-- Si può rieseguire senza danni (ogni passo controlla se è già stato fatto).
--
-- Cosa fa:
--   1. Classifica (tabella "scores"):
--      - aggiunge la data di inserimento (serve alla classifica della settimana);
--      - accetta solo nomi validi (A-Z, 0-9, spazi, max 10) e punteggi credibili;
--      - da browser si può solo LEGGERE e AGGIUNGERE: niente modifiche o cancellazioni;
--      - limita gli invii: stesso nome al massimo una volta ogni 20 secondi, 30 invii al minuto in tutto.
--   2. Codici per trasferire i progressi tra telefoni (tabella "ff_saves" + due funzioni).
--
-- NB: i punteggi già presenti NON vengono controllati né cancellati (vincoli "NOT VALID").
--     Chi vuole barare può ancora inviare un punteggio falso ma "credibile": per bloccarlo
--     davvero servirebbe verificare la partita sul server. Queste regole fermano gli abusi evidenti.
-- =====================================================================================

-- ---------- 1. CLASSIFICA ----------
alter table public.scores add column if not exists created_at timestamptz not null default now();
create index if not exists scores_score_idx on public.scores (score desc);
create index if not exists scores_created_score_idx on public.scores (created_at, score desc);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'scores_name_ok') then
    alter table public.scores add constraint scores_name_ok
      check (char_length(name) between 1 and 10 and name ~ '^[A-Z0-9 ]+$') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'scores_score_ok') then
    -- tetto generoso: una partita da record reale sta ben sotto (10.000 punti = trofeo "Leggenda")
    alter table public.scores add constraint scores_score_ok
      check (score between 1 and 500000) not valid;
  end if;
end $$;

-- sicurezza a livello di riga: sostituiamo qualunque regola precedente con due regole chiare
alter table public.scores enable row level security;
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'scores' loop
    execute format('drop policy %I on public.scores', p.policyname);
  end loop;
end $$;
create policy "scores: tutti leggono" on public.scores for select to anon, authenticated using (true);
create policy "scores: tutti aggiungono" on public.scores for insert to anon, authenticated with check (true);
revoke update, delete, truncate on public.scores from anon, authenticated;

-- limite di frequenza + data decisa dal server (non dal browser)
create or replace function public.ff_scores_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now();
  if exists (select 1 from public.scores
             where name = new.name and created_at > now() - interval '20 seconds') then
    raise exception 'Invio troppo ravvicinato per questo nome' using errcode = 'P0001';
  end if;
  if (select count(*) from public.scores where created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Troppi invii, riprova tra poco' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists ff_scores_guard on public.scores;
create trigger ff_scores_guard before insert on public.scores
  for each row execute function public.ff_scores_guard();

-- ---------- 2. CODICI DI SALVATAGGIO ----------
-- la tabella non è accessibile direttamente dal browser: solo tramite le due funzioni qui sotto
create table if not exists public.ff_saves (
  code       text primary key,
  data       jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.ff_saves enable row level security;
revoke all on public.ff_saves from anon, authenticated;

create or replace function public.ff_save_progress(p_data jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   -- niente O/0 e I/1
  c text;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' or pg_column_size(p_data) > 65536 then
    raise exception 'Dati non validi' using errcode = 'P0001';
  end if;
  if (select count(*) from public.ff_saves where created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Troppi salvataggi, riprova tra poco' using errcode = 'P0001';
  end if;
  delete from public.ff_saves where created_at < now() - interval '90 days';   -- pulizia dei codici scaduti
  loop
    c := '';
    for i in 1..8 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      insert into public.ff_saves (code, data) values (c, p_data);
      exit;
    exception when unique_violation then
      -- codice già usato (rarissimo): ne generiamo un altro
    end;
  end loop;
  return c;
end $$;

create or replace function public.ff_load_progress(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select data from public.ff_saves
  where code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
    and created_at > now() - interval '90 days';
$$;

revoke all on function public.ff_save_progress(jsonb) from public;
revoke all on function public.ff_load_progress(text) from public;
grant execute on function public.ff_save_progress(jsonb) to anon, authenticated;
grant execute on function public.ff_load_progress(text) to anon, authenticated;
