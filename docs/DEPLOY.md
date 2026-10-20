# Deep Studio · Collegare Supabase (backend) e Vercel (display)

L'app in `web/` è pronta: login, studio, "Nuova analisi", "Analisi in corso", privacy.
Serve solo collegarla. Prima in locale, poi online.

## A · In locale (Passi 3–6 della guida)

1. Docker Desktop acceso. Dalla radice `deep-studio`:
   ```
   supabase init
   mkdir -p supabase/migrations
   cp db/migrations/0001_init.sql supabase/migrations/20261020000000_init.sql
   ```
2. In `supabase/config.toml`, sezione `[storage]`: `file_size_limit = "500MiB"`.
   Sezione `[auth]`: `site_url = "http://localhost:3000"` e in `additional_redirect_urls`
   aggiungi `"http://localhost:3000/auth/callback"`.
3. `supabase start` (la prima volta scarica le immagini, qualche minuto), poi `supabase db reset`.
4. `supabase start` stampa `API URL`, `anon key` e `service_role key`. In `web/`:
   ```
   cp .env.example .env.local
   ```
   e incolla i tre valori (a mano nel file, **non in chat**).
5. `cd web && npm install && npm run dev` → http://localhost:3000
6. Login: le email del link magico in locale arrivano su http://localhost:54324.
7. Prova lo stato in tempo reale: carica una traccia, copia l'id del job dall'indirizzo
   (`/studio/analisi/<id>`) e in un altro terminale:
   ```
   npm run job:avanza -- <id>
   npm run job:avanza -- <id> errore "File illeggibile"
   ```
   I LED cambiano senza ricaricare; con "Riprova" il job torna in coda.

## B · Online: Supabase

1. supabase.com → New project, regione **EU (Frankfurt)**, piano Free per ora.
2. Dalla radice `deep-studio`: `supabase login`, `supabase link --project-ref <ref>`, `supabase db push`
   (applica la stessa migrazione).
3. Authentication → URL Configuration: Site URL = l'indirizzo Vercel (passo C);
   Redirect URLs: `https://<app>.vercel.app/auth/callback` e `http://localhost:3000/auth/callback`.
4. Limiti del piano Free da sapere: file fino a **50 MB** (un WAV 24 bit di 6 minuti ne pesa ~100:
   per ora esporta in FLAC o tracce corte), poche email di login all'ora, progetto in pausa dopo
   una settimana senza uso. Per i beta serve il Pro (P6).

## C · Online: Vercel

1. Metti il progetto su GitHub (repository privato) — Vercel pubblica da lì.
2. vercel.com → Add New → Project → importa il repository.
3. **Root Directory: `web`** (framework Next.js, il resto lo rileva da solo).
4. Environment Variables: `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (Supabase → Project Settings → API). **Non** mettere la service role key su Vercel.
5. Deploy. Copia l'indirizzo `https://<app>.vercel.app` nel passo B.3 e fai un login di prova.

Piano Hobby di Vercel: gratis solo per uso non commerciale; Pro quando partono i beta (P6).

## Cosa c'è nell'app

| Pagina | Storia | File |
| :--- | :--- | :--- |
| `/` | — | `web/app/page.tsx` |
| `/accedi` | 1 | `web/app/accedi/` + `web/app/auth/callback/route.ts` |
| `/studio` | 1 | `web/app/studio/page.tsx` (tracce e stato dell'ultimo job) |
| `/studio/nuova` | 2, 3 | `web/app/studio/nuova/NewAnalysisForm.tsx` |
| `/studio/analisi/<job>` | 4 | `web/app/studio/analisi/[jobId]/JobStatus.tsx` (Realtime + Riprova) |
| `/privacy` | 5 | `web/app/privacy/page.tsx` |

`web/middleware.ts` rinnova la sessione e rimanda ad `/accedi` chi apre `/studio` senza login.
`web/lib/roles.ts` è la copia TypeScript di `role_of()`: se cambi una, cambia l'altra.
