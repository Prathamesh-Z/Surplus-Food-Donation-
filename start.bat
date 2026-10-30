@echo off
REM Food Waste Saver - one-click start (Windows)
REM Sets everything up on first run, then starts the app server AND the
REM AI inference service - food recognition, port 8001.
REM MAINTAINER NOTE: keep this file free of parenthesised blocks, echo
REM text with brackets, and non-ASCII characters. cmd.exe misparses them
REM and aborts with "... was unexpected at this time".
cd /d %~dp0

if exist server\.env goto env_ok
echo First run: creating server\.env from the example...
copy server\.env.example server\.env
:env_ok

if exist node_modules goto deps_ok
echo Installing dependencies - first run only...
call npm install
:deps_ok

echo Preparing database - tables plus synthetic demo data...
call npm run db:push --workspace=server
call npm run db:seed --workspace=server

if exist inference\.venv\Scripts\python.exe goto venv_ok
echo Setting up the AI service - first run only, needs Python 3.10 or newer...
python -m venv inference\.venv
inference\.venv\Scripts\pip install torch --index-url https://download.pytorch.org/whl/cpu
inference\.venv\Scripts\pip install -r inference\requirements.txt
inference\.venv\Scripts\python inference\download_models.py
:venv_ok


echo Building the web app...
call npm run build

echo Starting the AI service on port 8001...
start "FWS Recognition" /min inference\.venv\Scripts\python -m uvicorn app:app --app-dir inference --host 127.0.0.1 --port 8001

echo.
echo ============================================================
echo   Food Waste Saver is starting:  http://localhost:4000
echo   AI service health:             http://127.0.0.1:8001/health
echo   Demo logins - password DemoPass1:
echo     provider@demo.local / claimer@demo.local
echo     ngo@demo.local      / admin@demo.local
echo   Stop with Ctrl+C, and close the FWS Recognition window.
echo ============================================================
echo.
call npm run dev --workspace=server
