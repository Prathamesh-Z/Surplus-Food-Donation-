@echo off
REM Food Waste Saver — one-click start (Windows)
REM Sets everything up on first run, then starts the single server.
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

if not exist client\public\models\mobilenet\model.json (
  echo Downloading on-device AI model weights ^(one time^)...
  call npm run fetch-model
)

echo Building the web app...
call npm run build

echo.
echo ============================================================
echo   Food Waste Saver is starting:  http://localhost:4000
echo   Demo logins (password DemoPass1):
echo     provider@demo.local / claimer@demo.local
echo     ngo@demo.local      / admin@demo.local
echo   Stop the server with Ctrl+C.
echo ============================================================
echo.
call npm run dev --workspace=server
