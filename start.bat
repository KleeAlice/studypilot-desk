@echo off
setlocal
cd /d "%~dp0"

set "ELECTRON_EXE=%~dp0node_modules\electron\dist\electron.exe"
if exist "%~dp0dist\index.html" if exist "%~dp0dist-electron\main.cjs" if exist "%~dp0.venv\Scripts\python.exe" if exist "%ELECTRON_EXE%" (
    start "" "%ELECTRON_EXE%" .
    exit /b 0
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
if errorlevel 1 pause

