@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install Node.js 20 or newer.
  echo Download: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if "%~1"=="" (
  echo [INFO] No file dragged in. Scanning courseware\inbox\ for PDF files...
) else (
  echo [INFO] Importing dragged courseware...
)
echo.

node "%~dp0tools\import.mjs" %*
set "CODE=%ERRORLEVEL%"

echo.
if not "%CODE%"=="0" (
  echo [FAILED] Import or build did not finish. See the output above and reports\latest.json.
  echo To undo the last import, run the rollback script in this folder.
) else (
  echo [DONE] Import finished. Open index.html to review.
  echo If a new deck is pending, follow content\README.md to let Codex add cards and questions.
)
echo.
pause
exit /b %CODE%