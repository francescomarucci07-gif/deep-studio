#!/bin/bash
# Deep Studio - avvia il worker delle analisi (Mac, doppio clic).
# La prima volta prepara Python e le librerie, poi resta in ascolto dei job in coda.
cd "$(dirname "$0")" || exit 1

VPY="analysis/.venv/bin/python"
if [ ! -x "$VPY" ]; then
  if ! command -v python3 >/dev/null; then
    echo "Python non trovato. Installa Python 3.11 o più recente da https://www.python.org/downloads/ e riprova."
    read -r -p "Premi Invio per chiudere."; exit 1
  fi
  echo "Prima volta: preparo l'ambiente Python, ci vuole un paio di minuti..."
  python3 -m venv analysis/.venv &&
    "$VPY" -m pip install --quiet --upgrade pip &&
    "$VPY" -m pip install --quiet numpy scipy soundfile || {
      echo "Installazione delle librerie non riuscita: controlla la connessione e riprova."
      rm -rf analysis/.venv
      read -r -p "Premi Invio per chiudere."; exit 1
    }
fi

if [ ! -f web/.env.local ]; then
  cat > web/.env.local <<'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://rfttvhvvryyhhtwungxf.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_ZmP5yx-hwSuOOeKLE3yNvw_ff0C9-0T
SUPABASE_SERVICE_ROLE_KEY=
EOF
fi

if ! grep -q '^SUPABASE_SERVICE_ROLE_KEY=..*' web/.env.local; then
  echo
  echo "Manca la service role key. Si apre TextEdit:"
  echo "  1. Supabase, Project Settings, API Keys: copia la chiave secret / service_role"
  echo "  2. incollala dopo SUPABASE_SERVICE_ROLE_KEY=  e salva"
  echo "  3. fai di nuovo doppio clic su avvia-worker.command"
  echo "La chiave resta solo su questo Mac: non mandarla a nessuno."
  open -e web/.env.local
  read -r -p "Premi Invio per chiudere."; exit 0
fi

echo
echo "Worker avviato. Lascia aperta questa finestra; per fermarlo premi Ctrl+C."
echo
"$VPY" analysis/worker_locale.py
read -r -p "Premi Invio per chiudere."
