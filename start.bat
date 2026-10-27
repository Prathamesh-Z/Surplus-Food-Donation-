@echo off
REM Food Waste Saver — one-click start (Windows)
REM Sets everything up on first run, then starts the app server AND the
REM food-recognition inference service (PRD v3.3, port 8001).
cd /d %~dp0

if not exist server\.env (
  echo First run: creating server\.env from the example...
  copy server\.env.example server\.env
)

if not exist node_modules (
  echo Installing dependencies (first run only)...
  call npm install
)

echo Preparing database (tables + synthetic demo data)...
call npm run db:push --workspace=server
call npm run db:seed --workspace=server

REM ── Recognition service (Python, one-time setup) ──────────────────────────
if not exist inference\.venv\Scripts\python.exe (
  echo Setting up the food-recognition service ^(first run only, needs Python 3.10+^)...
  python -m venv inference\.venv
  inference\.venv\Scripts\pip install torch --index-url https://download.pytorch.org/whl/cpu
  inference\.venv\Scripts\pip install -r inference\requirements.txt
  inference\.venv\Scripts\python inference\download_models.py
)

echo Building the web app...
call npm run build

echo Starting the food-recognition service on port 8001...
start "FWS Recognition" /min inference\.venv\Scripts\python -m uvicorn app:app --app-dir inference --host 127.0.0.1 --port 8001

echo.
echo ============================================================
echo   Food Waste Saver is starting:  http://localhost:4000
echo   Recognition service:           http://127.0.0.1:8001/health
echo   Demo logins (password DemoPass1):
echo     provider@demo.local / claimer@demo.local
echo     ngo@demo.local      / admin@demo.local
echo   Stop with Ctrl+C, and close the "FWS Recognition" window.
echo ============================================================
echo.
call npm run dev --workspace=server
