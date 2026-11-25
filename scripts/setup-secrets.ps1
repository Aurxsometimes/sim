# Sets up the keys SIM's GitHub Pages build needs, then starts a deploy.
#
# Run from the repo folder:   powershell -ExecutionPolicy Bypass -File scripts\setup-secrets.ps1
#
# You'll be asked for the three values from your Bungie app page
# (https://www.bungie.net/en/Application). The script then:
#   1. registers a DIM Sync key for the website's address, and
#   2. saves all four keys as encrypted GitHub repository secrets.
# Nothing is written to disk.

$ErrorActionPreference = 'Stop'

$Repo = 'Aurxsometimes/sim'
$SiteOrigin = 'https://aurxsometimes.github.io'

Write-Host ''
Write-Host 'SIM key setup' -ForegroundColor Cyan
Write-Host 'Copy these from your Bungie app page (https://www.bungie.net/en/Application).'
Write-Host ''

$apiKey = (Read-Host 'Bungie "API Key"').Trim()
$clientId = (Read-Host 'Bungie "OAuth client_id"').Trim()
$clientSecret = (Read-Host 'Bungie "OAuth client_secret"').Trim()

if (-not $apiKey -or -not $clientId -or -not $clientSecret) {
  throw 'All three values are required.'
}

# Register a DIM Sync (DIM API) key for the website's origin
$dimApiKey = $null
while (-not $dimApiKey) {
  $appName = (Read-Host 'Name for your DIM Sync app (lowercase letters, numbers, dashes; e.g. seeyuna-sim)').Trim()
  if ($appName -notmatch '^[a-z0-9-]{3,}$') {
    Write-Host 'Use at least 3 characters: a-z, 0-9 and - only.' -ForegroundColor Yellow
    continue
  }
  $body = @{ id = $appName; bungieApiKey = $apiKey; origin = $SiteOrigin } | ConvertTo-Json
  try {
    $response = Invoke-RestMethod -Method Post -Uri 'https://api.destinyitemmanager.com/new_app' `
      -ContentType 'application/json' -Body $body
    $dimApiKey = $response.app.dimApiKey
    if (-not $dimApiKey) { throw 'The DIM API did not return a key.' }
    Write-Host "DIM Sync key registered for $SiteOrigin." -ForegroundColor Green
  } catch {
    Write-Host "Couldn't register '$appName': $($_.Exception.Message)" -ForegroundColor Yellow
    if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message -ForegroundColor Yellow }
    Write-Host 'That name may be taken - try another.' -ForegroundColor Yellow
  }
}

Write-Host ''
Write-Host "Saving secrets to github.com/$Repo ..." -ForegroundColor Cyan
gh secret set WEB_API_KEY -R $Repo --body $apiKey
gh secret set WEB_OAUTH_CLIENT_ID -R $Repo --body $clientId
gh secret set WEB_OAUTH_CLIENT_SECRET -R $Repo --body $clientSecret
gh secret set DIM_API_KEY -R $Repo --body $dimApiKey

Write-Host ''
Write-Host 'Starting a deploy...' -ForegroundColor Cyan
gh workflow run deploy.yml -R $Repo

Write-Host ''
Write-Host "Done. The site will be live in a few minutes at $SiteOrigin/sim/" -ForegroundColor Green
Write-Host "Watch progress at https://github.com/$Repo/actions"
