@echo off
rem Deep Studio - avvia il worker delle analisi (Windows, doppio clic).
rem La prima volta prepara Python e le librerie, poi resta in ascolto dei job in coda.
setlocal
cd /d "%~dp0"
title Deep Studio - worker analisi

set "VPY=analysis\.venv\Scripts\python.exe"
if exist "%VPY%" goto :chiavi

echo Prima volta: preparo l'ambiente Python, ci vuole un paio di minuti...
set "PY=python"
where py >nul 2>nul
if not errorlevel 1 set "PY=py -3"
%PY% -m venv analysis\.venv
if errorlevel 1 goto :nopython
"%VPY%" -m pip install --quiet --upgrade pip
"%VPY%" -m pip install --quiet numpy scipy soundfile
if errorlevel 1 goto :nopip

:chiavi
if exist "web\.env.local" goto :controlla
> "web\.env.local" echo NEXT_PUBLIC_SUPABASE_URL=https://rfttvhvvryyhhtwungxf.supabase.co
>> "web\.env.local" echo NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_ZmP5yx-hwSuOOeKLE3yNvw_ff0C9-0T
>> "web\.env.local" echo SUPABASE_SERVICE_ROLE_KEY=

:controlla
findstr /r /c:"^SUPABASE_SERVICE_ROLE_KEY=..*" "web\.env.local" >nul
if not errorlevel 1 goto :avvia
echo.
echo Manca la service role key. Si apre il Blocco note:
echo   1. Supabase, Project Settings, API Keys: copia la chiave secret / service_role
echo   2. incollala dopo SUPABASE_SERVICE_ROLE_KEY=  e salva
echo   3. chiudi il Blocco note e fai di nuovo doppio clic su avvia-worker.bat
echo La chiave resta solo su questo PC: non mandarla a nessuno.
notepad "web\.env.local"
goto :fine

:avvia
echo.
echo Worker avviato. Lascia aperta questa finestra; per fermarlo premi Ctrl+C.
echo.
"%VPY%" analysis\worker_locale.py
goto :fine

:nopython
echo.
echo Python non trovato. Installa Python 3.11 o piu' recente da https://www.python.org/downloads/
echo spuntando "Add python.exe to PATH", poi rifai doppio clic su questo file.
goto :fine

:nopip
echo.
echo Installazione delle librerie non riuscita: controlla la connessione e riprova.
rmdir /s /q analysis\.venv

:fine
echo.
pause
