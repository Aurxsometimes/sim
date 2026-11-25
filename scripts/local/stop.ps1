# Stops SIM's local server. Installed to %LOCALAPPDATA%\SIM by scripts/setup-local.ps1.
$server = Join-Path $PSScriptRoot 'server.mjs'
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like "*$server*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
