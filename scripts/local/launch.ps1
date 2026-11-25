# Starts SIM's local server if it isn't running, then opens SIM in its own window.
# Installed to %LOCALAPPDATA%\SIM by scripts/setup-local.ps1.

$ErrorActionPreference = 'Stop'
$home_ = $PSScriptRoot
$url = 'https://localhost:8080'

function Test-Listening { [bool](Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue) }

if (-not (Test-Listening)) {
  Start-Process node -ArgumentList "`"$home_\server.mjs`"" -WindowStyle Hidden `
    -RedirectStandardError "$home_\server-error.log"
  for ($i = 0; $i -lt 40 -and -not (Test-Listening); $i++) { Start-Sleep -Milliseconds 250 }
}

$browser = Get-Content "$home_\browser.txt" -ErrorAction SilentlyContinue
if ($browser -and (Test-Path $browser)) {
  Start-Process $browser "--app=$url"
} else {
  Start-Process $url
}
