@echo off
chcp 65001 >nul
title Deep Studio - analisi

if "%~1"=="" (
  echo.
  echo  Trascina la cartella con i WAV sopra questo file.
  echo.
  pause
  exit /b
)

rem Prima volta: installa numpy e scipy se mancano
py -c "import numpy, scipy" 2>nul
if errorlevel 1 (
  echo Installo numpy e scipy, serve solo la prima volta...
  py -m pip install --user numpy scipy
)

py "%~dp0deep_studio_analyze.py" "%~1"
echo.
pause
