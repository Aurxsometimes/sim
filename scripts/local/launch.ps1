# Starts SIM's local server if it isn't running, then opens SIM.
# - If SIM has been installed as an app (from SIM's menu -> "Install as an App"), opens that app.
# - Otherwise opens SIM in a normal browser tab, where the install option is offered.
# Installed to %LOCALAPPDATA%\SIM by scripts/setup-local.ps1.

$ErrorActionPreference = 'Stop'
$simHome = $PSScriptRoot
$url = 'https://localhost:8080'

function Test-Listening { [bool](Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue) }

if (-not (Test-Listening)) {
  Start-Process node -ArgumentList "`"$simHome\server.mjs`"" -WindowStyle Hidden `
    -RedirectStandardError "$simHome\server-error.log"
  for ($i = 0; $i -lt 40 -and -not (Test-Listening); $i++) { Start-Sleep -Milliseconds 250 }
}

# Find the app shortcut the browser made when SIM was installed (it launches with --app-id=...)
$shell = New-Object -ComObject WScript.Shell
$appShortcut = Get-ChildItem ([Environment]::GetFolderPath('Programs')) -Recurse -Filter *.lnk -ErrorAction SilentlyContinue |
  Where-Object { $_.BaseName -like "Seeyuna*Item Manager*" -or $_.BaseName -eq 'SIM' } |
  Where-Object { $shell.CreateShortcut($_.FullName).Arguments -match '--app-id=' } |
  Select-Object -First 1

if ($appShortcut) {
  Start-Process $appShortcut.FullName
} else {
  # Not installed yet: a normal tab, so SIM's "Install as an App" option appears
  Start-Process $url
}
