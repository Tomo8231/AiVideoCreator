@echo off
REM ============================================================================
REM  AIVideoCreator - Server Quick Start (Windows)
REM
REM  Usage:
REM    quickstart.bat            ... setup + start dev server (default)
REM    quickstart.bat dev  [port]... start dev server
REM    quickstart.bat prod [port]... build then start production server
REM    quickstart.bat check      ... setup only (no server); for verification
REM
REM  See doc/QUICKSTART.md for details (Japanese).
REM ============================================================================
setlocal EnableExtensions
cd /d "%~dp0"

set "MODE=%~1"
if "%MODE%"=="" set "MODE=dev"
set "PORT_ARG=%~2"

echo ============================================
echo   AIVideoCreator  Quick Start  [mode: %MODE%]
echo ============================================

REM --- 1) Node.js check -------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node 20+ from https://nodejs.org/
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do set "NODE_VER=%%v"
echo [INFO] Node %NODE_VER%

REM --- 2) .env (create from example if missing) -------------------------------
if not exist ".env" (
  if exist ".env.example" (
    copy /y ".env.example" ".env" >nul
    echo [INFO] Created .env from .env.example. Set API keys later if needed.
  ) else (
    echo [WARN] .env.example not found; skipping .env creation.
  )
) else (
  echo [INFO] .env already exists.
)

REM --- 3) Dependencies --------------------------------------------------------
if not exist "node_modules" (
  echo [INFO] Installing dependencies ^(npm install^)...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
) else (
  echo [INFO] Dependencies already installed.
)

REM --- 4) Port (optional) -----------------------------------------------------
if not "%PORT_ARG%"=="" (
  set "PORT=%PORT_ARG%"
  echo [INFO] Using PORT=%PORT_ARG%
) else (
  echo [INFO] Using default port 3000 ^(override: quickstart.bat %MODE% 3100^)
)

REM --- 5) Run -----------------------------------------------------------------
if /i "%MODE%"=="check" (
  echo [OK] Setup complete. No server started ^(check mode^).
  exit /b 0
)

if /i "%MODE%"=="prod" (
  echo [INFO] Building production bundle...
  call npm run build
  if errorlevel 1 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
  )
  echo [INFO] Starting production server...
  call npm run start
  exit /b %errorlevel%
)

if /i "%MODE%"=="dev" (
  echo [INFO] Starting dev server... ^(Ctrl+C to stop^)
  call npm run dev
  exit /b %errorlevel%
)

echo [ERROR] Unknown mode "%MODE%". Use: dev ^| prod ^| check
pause
exit /b 1
