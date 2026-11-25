# One-time setup for SIM's website on Cloudflare Pages.
#
# Run from the repo folder:   powershell -ExecutionPolicy Bypass -File scripts\setup-secrets.ps1
#
# It will:
#   1. use your Cloudflare API token to create (or find) the Cloudflare Pages project,
#      and tell you the site's address,
#   2. wait while you create the Bungie app for that address,
#   3. register a DIM Sync key for that address,
#   4. save everything as encrypted GitHub secrets and start a deploy.
# Nothing is written to disk. Safe to run again.

$ErrorActionPreference = 'Stop'
$Repo = 'Aurxsometimes/sim'

function Read-Secret([string]$prompt) {
  $secure = Read-Host $prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)).Trim() }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Invoke-Cloudflare([string]$method, [string]$path, $body = $null) {
  $params = @{
    Method  = $method
    Uri     = "https://api.cloudflare.com/client/v4$path"
    Headers = @{ Authorization = "Bearer $script:cfToken" }
  }
  if ($body) { $params.ContentType = 'application/json'; $params.Body = ($body | ConvertTo-Json) }
  return Invoke-RestMethod @params
}

Write-Host ''
Write-Host '=== Step 1: Cloudflare ===' -ForegroundColor Cyan
Write-Host 'Make an API token at https://dash.cloudflare.com/profile/api-tokens'
Write-Host '  Create Token -> Create Custom Token'
Write-Host '  Permissions: Account | Cloudflare Pages | Edit'
Write-Host '  Account Resources: Include | (your account)'
Write-Host ''
$script:cfToken = Read-Secret 'Cloudflare API token (input hidden)'

# A Pages-only token usually isn't allowed to list accounts, so fall back to asking for the ID.
$accounts = @()
try { $accounts = @((Invoke-Cloudflare GET '/accounts').result) } catch {}
if ($accounts.Count -eq 1) {
  $account = $accounts[0]
} elseif ($accounts.Count -gt 1) {
  for ($i = 0; $i -lt $accounts.Count; $i++) { Write-Host "  [$i] $($accounts[$i].name)" }
  $account = $accounts[[int](Read-Host 'Which account')]
} else {
  Write-Host ''
  Write-Host 'Your Account ID is the long code in the dashboard address bar:'
  Write-Host '  https://dash.cloudflare.com/<ACCOUNT ID>/...'
  Write-Host '  (also shown under Account home -> "..." next to your account -> Copy account ID)'
  $accountId = ''
  while ($accountId -notmatch '^[0-9a-f]{32}$') {
    $accountId = (Read-Host 'Cloudflare Account ID').Trim().ToLower()
    if ($accountId -notmatch '^[0-9a-f]{32}$') {
      Write-Host 'That should be 32 characters of 0-9 and a-f.' -ForegroundColor Yellow
    }
  }
  $account = [pscustomobject]@{ id = $accountId; name = $accountId }
}
Write-Host "Using Cloudflare account: $($account.name)" -ForegroundColor Green

# Check the token can actually manage Pages on this account before going further
try {
  $null = Invoke-Cloudflare GET "/accounts/$($account.id)/pages/projects"
} catch {
  throw "That token can't manage Cloudflare Pages on account $($account.id). Check the token has Account | Cloudflare Pages | Edit for this account, and that the Account ID is right. ($($_.ErrorDetails.Message))"
}

$project = $null
while (-not $project) {
  $projectName = Read-Host 'Cloudflare project name (lowercase, e.g. sim) [sim]'
  if (-not $projectName) { $projectName = 'sim' }
  $projectName = $projectName.Trim().ToLower()
  try {
    $project = (Invoke-Cloudflare GET "/accounts/$($account.id)/pages/projects/$projectName").result
    Write-Host "Found existing project '$projectName'." -ForegroundColor Green
  } catch {
    try {
      $project = (Invoke-Cloudflare POST "/accounts/$($account.id)/pages/projects" @{
          name = $projectName; production_branch = 'main'
        }).result
      Write-Host "Created project '$projectName'." -ForegroundColor Green
    } catch {
      Write-Host "Couldn't create '$projectName': $($_.ErrorDetails.Message)" -ForegroundColor Yellow
    }
  }
}

$siteOrigin = "https://$($project.subdomain)"
Write-Host ''
Write-Host "Your site will be:  $siteOrigin" -ForegroundColor Green

gh secret set CLOUDFLARE_API_TOKEN -R $Repo --body $script:cfToken
gh secret set CLOUDFLARE_ACCOUNT_ID -R $Repo --body $account.id
gh variable set CLOUDFLARE_PROJECT -R $Repo --body $projectName
gh repo edit $Repo --homepage $siteOrigin | Out-Null

Write-Host ''
Write-Host '=== Step 2: Bungie app ===' -ForegroundColor Cyan
Write-Host 'Go to https://www.bungie.net/en/Application -> Create New App, and enter:'
Write-Host '  Application Name:  SIM'
Write-Host "  Website:           https://github.com/$Repo"
Write-Host '  OAuth Client Type: Confidential'
Write-Host "  Redirect URL:      $siteOrigin/return.html"
Write-Host '  Scope:             everything EXCEPT "Administrate Groups/Clans"'
Write-Host "  Origin Header:     $siteOrigin"
Write-Host ''
Read-Host 'Press Enter once the Bungie app is created'

$apiKey = Read-Secret 'Bungie "API Key" (input hidden)'
$clientId = (Read-Host 'Bungie "OAuth client_id"').Trim()
$clientSecret = Read-Secret 'Bungie "OAuth client_secret" (input hidden)'
if (-not $apiKey -or -not $clientId -or -not $clientSecret) { throw 'All three Bungie values are required.' }

Write-Host ''
Write-Host '=== Step 3: DIM Sync ===' -ForegroundColor Cyan
$dimApiKey = $null
while (-not $dimApiKey) {
  $appName = (Read-Host 'Name for your DIM Sync app (a-z, 0-9, dashes; e.g. seeyuna-sim)').Trim()
  if ($appName -notmatch '^[a-z0-9-]{3,}$') {
    Write-Host 'Use at least 3 characters: a-z, 0-9 and - only.' -ForegroundColor Yellow
    continue
  }
  $body = @{ id = $appName; bungieApiKey = $apiKey; origin = $siteOrigin } | ConvertTo-Json
  try {
    $response = Invoke-RestMethod -Method Post -Uri 'https://api.destinyitemmanager.com/new_app' `
      -ContentType 'application/json' -Body $body
    $dimApiKey = $response.app.dimApiKey
    if (-not $dimApiKey) { throw 'The DIM API did not return a key.' }
    Write-Host "DIM Sync key registered for $siteOrigin." -ForegroundColor Green
  } catch {
    Write-Host "Couldn't register '$appName': $($_.Exception.Message)" -ForegroundColor Yellow
    if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message -ForegroundColor Yellow }
    Write-Host 'That name may be taken - try another.' -ForegroundColor Yellow
  }
}

Write-Host ''
Write-Host '=== Step 4: Save to GitHub and deploy ===' -ForegroundColor Cyan
gh secret set WEB_API_KEY -R $Repo --body $apiKey
gh secret set WEB_OAUTH_CLIENT_ID -R $Repo --body $clientId
gh secret set WEB_OAUTH_CLIENT_SECRET -R $Repo --body $clientSecret
gh secret set DIM_API_KEY -R $Repo --body $dimApiKey
gh workflow run deploy.yml -R $Repo

Write-Host ''
Write-Host "Done! In about 5 minutes SIM will be live at $siteOrigin" -ForegroundColor Green
Write-Host "Watch progress at https://github.com/$Repo/actions"
