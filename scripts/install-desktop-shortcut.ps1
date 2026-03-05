$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$launcherPath = Join-Path $repoRoot "Launch-Corporate-Expense.cmd"

if (-not (Test-Path $launcherPath)) {
  throw "Launcher file not found: $launcherPath"
}

$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktopPath "Corporate Expense Tracker.lnk"

$wshShell = New-Object -ComObject WScript.Shell
$shortcut = $wshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $launcherPath
$shortcut.WorkingDirectory = $repoRoot
$shortcut.Description = "One-click launcher for Corporate Expense Tracking"
$shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,13"
$shortcut.Save()

Write-Host "Desktop shortcut created at: $shortcutPath" -ForegroundColor Green
