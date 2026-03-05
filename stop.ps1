$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $root '.dev-server-pids.json'

if (-not (Test-Path $pidFile)) {
  Write-Host "PID file not found: $pidFile" -ForegroundColor Yellow
  Write-Host 'No running services were recorded by start.ps1.' -ForegroundColor Yellow
  exit 0
}

$info = Get-Content -Path $pidFile -Raw | ConvertFrom-Json
$targets = @(
  @{ Name = 'backend'; Pid = [int]$info.backend },
  @{ Name = 'frontend'; Pid = [int]$info.frontend }
)

foreach ($target in $targets) {
  try {
    $proc = Get-Process -Id $target.Pid -ErrorAction Stop
    Stop-Process -Id $proc.Id -Force
    Write-Host "$($target.Name) stopped (PID: $($proc.Id))" -ForegroundColor Green
  } catch {
    Write-Host "$($target.Name) not running (PID: $($target.Pid))" -ForegroundColor Yellow
  }
}

Remove-Item -Path $pidFile -Force -ErrorAction SilentlyContinue
Write-Host 'All done.' -ForegroundColor Cyan
