@echo off
setlocal
set "REPO_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%REPO_DIR%scripts\oneclick-launch.ps1"
endlocal
