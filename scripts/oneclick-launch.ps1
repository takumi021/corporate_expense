$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Host "Launching Corporate Expense Tracking..." -ForegroundColor Cyan

try {
  $postgresService = Get-Service |
    Where-Object { $_.Name -like "postgresql*" -or $_.DisplayName -like "postgresql*" } |
    Select-Object -First 1

  if ($null -ne $postgresService) {
    if ($postgresService.Status -ne "Running") {
      Write-Host "Starting PostgreSQL service: $($postgresService.Name)" -ForegroundColor Yellow
      Start-Service -Name $postgresService.Name
      Start-Sleep -Seconds 2
    } else {
      Write-Host "PostgreSQL is already running." -ForegroundColor Green
    }
  } else {
    Write-Warning "PostgreSQL Windows service not found. Make sure DB is running."
  }
} catch {
  Write-Warning "Could not start PostgreSQL service automatically: $($_.Exception.Message)"
}

if (-not (Test-Path ".env")) {
  if (Test-Path ".env.example") {
    Copy-Item ".env.example" ".env" -Force
    Write-Warning "Created .env from .env.example. Update DB password before login if needed."
  } else {
    Write-Warning ".env is missing and .env.example not found."
  }
}

$npmCommand = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
if ($null -eq $npmCommand) {
  throw "Node.js/npm is not installed or not in PATH."
}

if (-not (Test-Path "node_modules")) {
  Write-Host "Installing dependencies (first run only)..." -ForegroundColor Yellow
  & npm.cmd install
  if ($LASTEXITCODE -ne 0) {
    throw "npm install failed."
  }
}

Start-Process "cmd.exe" -ArgumentList "/c timeout /t 3 >nul && start http://localhost:3000" -WindowStyle Hidden

Write-Host "Starting app on http://localhost:3000 ..." -ForegroundColor Green
& npm.cmd run dev
