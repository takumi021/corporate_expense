@echo off
setlocal
set "REPO_DIR=%~dp0"
set "PS1_FILE=%REPO_DIR%scripts\oneclick-launch.ps1"
set "WIN_PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

if exist "%WIN_PS%" (
  "%WIN_PS%" -NoProfile -ExecutionPolicy Bypass -File "%PS1_FILE%"
) else (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%PS1_FILE%"
)
endlocal
