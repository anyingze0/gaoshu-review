@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install Node.js 20 or newer.
  echo.
  pause
  exit /b 1
)

node "%~dp0tools\rollback.mjs" %*
set "CODE=%ERRORLEVEL%"

echo.
if not "%CODE%"=="0" (
  echo [FAILED] Restore did not finish. See the output above.
) else if "%~1"=="--list" (
  echo [DONE] Backup list shown above.
) else (
  echo [DONE] Backup restored and site rebuilt.
)
echo.
pause
exit /b %CODE%