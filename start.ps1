$ErrorActionPreference = 'Stop'

function Assert-CommandExists {
  param(
    [Parameter(Mandatory = $true)][string]$Name
  )

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name"
  }
}

function Escape-SingleQuotes {
  param(
    [Parameter(Mandatory = $true)][string]$Value
  )

  return $Value.Replace("'", "''")
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $root 'backend'
$frontendDir = Join-Path $root 'frontend'
$pidFile = Join-Path $root '.dev-server-pids.json'

if (-not (Test-Path $backendDir)) { throw "Backend directory not found: $backendDir" }
if (-not (Test-Path $frontendDir)) { throw "Frontend directory not found: $frontendDir" }

Assert-CommandExists -Name 'node'
Assert-CommandExists -Name 'npm'

$frontendPort = 5173
$backendPort = 3001

$lanIps = @(
  Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -notlike '127.*' -and
      $_.IPAddress -notlike '169.254.*' -and
      $_.PrefixOrigin -ne 'WellKnown'
    } |
    Select-Object -ExpandProperty IPAddress -Unique
)

if (-not $lanIps -or $lanIps.Count -eq 0) {
  $lanIps = @('无法自动识别局域网 IP')
}

Write-Host ''
Write-Host '========== Access URLs ==========' -ForegroundColor Cyan
Write-Host "Frontend (Local): http://localhost:$frontendPort" -ForegroundColor Green
foreach ($ip in $lanIps) {
  Write-Host "Frontend (LAN):   http://${ip}:$frontendPort" -ForegroundColor Yellow
}
Write-Host "Backend (Local):  http://localhost:$backendPort" -ForegroundColor Green
foreach ($ip in $lanIps) {
  Write-Host "Backend (LAN):    http://${ip}:$backendPort" -ForegroundColor Yellow
}
Write-Host '=================================' -ForegroundColor Cyan
Write-Host ''

$escapedFrontendDir = Escape-SingleQuotes -Value $frontendDir

$frontendTitle = 'shuiyin-frontend'

$frontendCmd = "`$host.UI.RawUI.WindowTitle = '$frontendTitle'; Set-Location -LiteralPath '$escapedFrontendDir'; npm run dev"

$backendProc = Start-Process -FilePath 'node' -ArgumentList @('index.js') -WorkingDirectory $backendDir -WindowStyle Hidden -PassThru
$frontendProc = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit', '-Command', $frontendCmd) -PassThru

$pidInfo = [ordered]@{
  backend = $backendProc.Id
  frontend = $frontendProc.Id
  startedAt = (Get-Date).ToString('s')
}
$pidInfo | ConvertTo-Json | Set-Content -Path $pidFile -Encoding utf8

Write-Host "Backend started (PID: $($backendProc.Id))" -ForegroundColor Green
Write-Host "Frontend started (PID: $($frontendProc.Id))" -ForegroundColor Green
Write-Host "PID file: $pidFile" -ForegroundColor DarkGray
Write-Host 'Backend is running in background (no terminal window).' -ForegroundColor DarkGray
Write-Host 'Use stop.bat to stop both services.' -ForegroundColor DarkGray
