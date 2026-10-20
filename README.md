# Deep Studio

Coach di mixaggio per producer house in FL Studio. Istruzioni per Claude Code in `CLAUDE.md`;
i passi della M1 in `docs/PROMPT-M1.md` (oppure `python passi.py` nel terminale).

## Da dove vengono i file (20 ottobre 2026)

**Copiati da Drive, identici:** `analysis/analizza.bat`, `analysis/prova_demucs.py`,
`analysis/prova_coach_api.py`, `docs/LEGGIMI-analisi-locale.md`, `docs/P6-architettura-e-stack.md`.

**Aggiornato:** `analysis/deep_studio_analyze.py` da v0.2-house (Drive) a **v0.3**:
JSON 1.0, `role_of()`, `--sottogenere`, `--stadio`, `--crea-riferimenti`, `analyze_file()` per il worker.

**Ricostruiti** (gli originali non erano su Drive: se li ritrovi, confrontali):

| File | Cosa contiene |
| :--- | :--- |
| `CLAUDE.md` | contesto, regole, stack, comandi per Claude Code |
| `docs/USER-STORIES-FASE1.md` | storie 1–5 con criteri di finito e testo della privacy |
| `docs/MOCKUP-P5.md` | wireframe di "Nuova analisi" e "Analisi in corso" |
| `docs/PROMPT-M1.md`, `passi.py` | i prompt della M1, consultabili dal terminale |
| `analysis/deep-studio-analysis-1.0.schema.json` | schema del JSON 1.0 |
| `analysis/tests/` | 17 test su segnali sintetici e sul worker (passano in ~10 s) |
| `db/migrations/0001_init.sql` | tabelle P6, RLS, bucket privato `audio`, realtime sui job |
| `web/design/tokens.css` | colori, spazi e classi `.ds-*` (modulo, pad, LED) |

Verificato qui: i 17 test passano; la migrazione è SQL valido per il parser di Postgres,
ma va provata davvero con `supabase db reset` (Passo 3).

Restano solo su Drive: *P2 · Note gold*, *P2 · Come parla il coach*, *P6 · Modello dei costi*,
*Deep Studio · Test set P1*. Mancano ancora `P4-prompt-coach-v1.md` e gli input `G01…G10`
per `prova_coach_api.py` (servono dalla M3).
