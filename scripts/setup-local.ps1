# Installs SIM on this PC at https://localhost:8080 - no "not secure" warning, with DIM Sync.
#
# Run from the repo folder:   powershell -ExecutionPolicy Bypass -File scripts\setup-local.ps1
# Run it again any time to update the local copy with the latest code.
#
# It will:
#   1. make a certificate that is only valid for "localhost" and ask Windows to trust it
#      (Windows shows a Security Warning - click Yes). Only done once.
#   2. build SIM. The local build has no keys baked in: it uses the Bungie and DIM Sync keys
#      your browser saved for https://localhost:8080 on the /developer page.
#   3. copy it to %LOCALAPPDATA%\SIM with a tiny local server, and add "SIM (local)" and
#      "Stop SIM (local)" shortcuts to the Start menu and desktop. Nothing runs at startup.

param([switch]$SkipBuild)

$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$simHome = Join-Path $env:LOCALAPPDATA 'SIM'
$certName = 'SIM localhost'
New-Item -ItemType Directory -Force $simHome | Out-Null

# --- 1. Certificate ---------------------------------------------------------------------------
Write-Host ''
Write-Host '=== Step 1: Certificate for localhost ===' -ForegroundColor Cyan
$cert = Get-ChildItem Cert:\CurrentUser\My |
  Where-Object { $_.FriendlyName -eq $certName -and $_.NotAfter -gt (Get-Date).AddDays(30) } |
  Sort-Object NotAfter -Descending | Select-Object -First 1
if (-not $cert -or -not (Test-Path "$simHome\localhost.pfx")) {
  $cert = New-SelfSignedCertificate -Subject 'CN=localhost' -FriendlyName $certName `
    -CertStoreLocation Cert:\CurrentUser\My -KeyExportPolicy Exportable `
    -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -NotAfter (Get-Date).AddYears(5) `
    -KeyUsage DigitalSignature, KeyEncipherment `
    -TextExtension @(
      '2.5.29.17={text}DNS=localhost&IPAddress=127.0.0.1&IPAddress=::1', # names it is valid for
      '2.5.29.37={text}1.3.6.1.5.5.7.3.1',                              # website certificate only
      '2.5.29.19={text}false'                                           # cannot sign other certificates
    )
  $pass = [Guid]::NewGuid().ToString('N')
  Export-PfxCertificate -Cert $cert -FilePath "$simHome\localhost.pfx" `
    -Password (ConvertTo-SecureString $pass -AsPlainText -Force) | Out-Null
  Set-Content "$simHome\localhost.pass" $pass -Encoding ascii
  Write-Host 'Made a new localhost certificate.' -ForegroundColor Green
}
if (-not (Test-Path "Cert:\CurrentUser\Root\$($cert.Thumbprint)")) {
  Write-Host 'Windows will now ask whether to trust "localhost" - click Yes.' -ForegroundColor Yellow
  Export-Certificate -Cert $cert -FilePath "$simHome\localhost.cer" | Out-Null
  Import-Certificate -FilePath "$simHome\localhost.cer" -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
}
if (-not (Test-Path "Cert:\CurrentUser\Root\$($cert.Thumbprint)")) {
  throw 'The certificate was not trusted (No was clicked?). Run this script again and click Yes.'
}
Write-Host 'Certificate is trusted.' -ForegroundColor Green

# --- 2. Build ---------------------------------------------------------------------------------
if (-not $SkipBuild) {
  Write-Host ''
  Write-Host '=== Step 2: Build SIM (takes a few minutes) ===' -ForegroundColor Cyan
  Push-Location $repo
  try {
    foreach ($name in 'WEB_API_KEY', 'WEB_OAUTH_CLIENT_ID', 'WEB_OAUTH_CLIENT_SECRET', 'DIM_API_KEY', 'CI') {
      Remove-Item "Env:\$name" -ErrorAction SilentlyContinue
    }
    $env:PUBLIC_PATH = '/'
    $env:PR_BUILD = '1'
    $env:VERSION = "$((Get-Content package.json -Raw | ConvertFrom-Json).version).local"
    pnpm.cmd build:release
    if ($LASTEXITCODE) { throw 'The build failed.' }
  } finally {
    Pop-Location
  }
  robocopy "$repo\dist" "$simHome\site" /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw 'Copying the built site failed.' }
}
if (-not (Test-Path "$simHome\site\index.html")) { throw 'No built site yet - run without -SkipBuild.' }

# --- 3. Server and shortcuts ------------------------------------------------------------------
Write-Host ''
Write-Host '=== Step 3: Shortcuts ===' -ForegroundColor Cyan
Copy-Item "$PSScriptRoot\local\server.mjs", "$PSScriptRoot\local\launch.ps1", "$PSScriptRoot\local\stop.ps1" $simHome -Force
Copy-Item "$repo\icons\release\favicon.ico" "$simHome\sim.ico" -Force

Remove-Item "$simHome\browser.txt" -ErrorAction SilentlyContinue # used by older versions

# .vbs wrappers run the PowerShell scripts without flashing a console window
foreach ($name in 'launch', 'stop') {
  Set-Content "$simHome\$name.vbs" -Encoding ascii -Value (
    'CreateObject("WScript.Shell").Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""' +
    "$simHome\$name.ps1" + '""", 0, False')
}

$shell = New-Object -ComObject WScript.Shell
$startMenu = [Environment]::GetFolderPath('Programs')
$desktop = [Environment]::GetFolderPath('Desktop')
foreach ($folder in $startMenu, $desktop) {
  $s = $shell.CreateShortcut("$folder\SIM (local).lnk")
  $s.TargetPath = "$env:WINDIR\System32\wscript.exe"
  $s.Arguments = "`"$simHome\launch.vbs`""
  $s.IconLocation = "$simHome\sim.ico"
  $s.Description = "Seeyuna's Item Manager (local, with DIM Sync)"
  $s.Save()
}
$s = $shell.CreateShortcut("$startMenu\Stop SIM (local).lnk")
$s.TargetPath = "$env:WINDIR\System32\wscript.exe"
$s.Arguments = "`"$simHome\stop.vbs`""
$s.IconLocation = "$simHome\sim.ico"
$s.Description = 'Stops the SIM local server'
$s.Save()

Write-Host ''
Write-Host 'Done! Open "SIM (local)" from the Start menu or desktop.' -ForegroundColor Green
Write-Host 'First time: in SIM, open the menu (top left) -> "Install as an App".'
Write-Host 'After that, "SIM (local)" starts the server and opens the installed app.'
Write-Host 'To pin it: right-click "SIM (local)" in the Start menu -> Pin to taskbar.'
Write-Host 'Note: the SIM dev server also uses port 8080, so only one of them can run at a time.'
