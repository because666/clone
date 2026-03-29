<#
  AetherWeave Dev Startup Script
  Auto-check dependencies, then start backend + frontend
#>

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  =========================================" -ForegroundColor Cyan
Write-Host "    AetherWeave Development Environment"     -ForegroundColor Cyan
Write-Host "  =========================================" -ForegroundColor Cyan
Write-Host ""

# -- Step 0: Check Python & Node --
Write-Host "[0/3] Checking environment..." -ForegroundColor DarkGray

$pyCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $pyCmd) {
    Write-Host "  x Python not found. Please install Python 3.10+" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
$pyVer = & python --version 2>&1
Write-Host "  OK $pyVer" -ForegroundColor Green

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "  x Node.js not found. Please install Node.js 18+" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
$nodeVer = & node --version 2>&1
Write-Host "  OK Node.js $nodeVer" -ForegroundColor Green
Write-Host ""

# -- Step 1: Python backend deps --
Write-Host "[1/3] Checking Python dependencies..." -ForegroundColor Yellow

$reqFile = Join-Path $PSScriptRoot "trajectory_lab\requirements.txt"

$pipPkgs = @(
    @{ Name = "flask";            Mod = "flask" },
    @{ Name = "flask-cors";       Mod = "flask_cors" },
    @{ Name = "flask-compress";   Mod = "flask_compress" },
    @{ Name = "flask-sqlalchemy"; Mod = "flask_sqlalchemy" },
    @{ Name = "pyjwt";            Mod = "jwt" },
    @{ Name = "numpy";            Mod = "numpy" },
    @{ Name = "shapely";          Mod = "shapely" }
)

$needInstall = $false
foreach ($pkg in $pipPkgs) {
    & python -c "import $($pkg.Mod)" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  x Missing: $($pkg.Name)" -ForegroundColor Red
        $needInstall = $true
    }
    else {
        Write-Host "  OK $($pkg.Name)" -ForegroundColor DarkGreen
    }
}

if ($needInstall) {
    Write-Host ""
    Write-Host "  Installing missing Python packages..." -ForegroundColor Cyan
    & pip install -r $reqFile 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  x pip install failed. Run manually: pip install -r trajectory_lab/requirements.txt" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Host "  OK All Python deps installed" -ForegroundColor Green
}
else {
    Write-Host "  OK All Python deps ready" -ForegroundColor Green
}
Write-Host ""

# -- Step 2: Frontend Node deps --
Write-Host "[2/3] Checking frontend dependencies..." -ForegroundColor Yellow

$frontendDir  = Join-Path $PSScriptRoot "frontend"
$nodeModules  = Join-Path $frontendDir "node_modules"

if (-not (Test-Path $nodeModules)) {
    Write-Host "  x node_modules not found, running npm install..." -ForegroundColor Cyan
    Push-Location $frontendDir
    & npm install 2>&1 | Out-Null
    Pop-Location
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  x npm install failed. Run manually: cd frontend && npm install" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Host "  OK Frontend deps installed" -ForegroundColor Green
}
else {
    Write-Host "  OK node_modules exists" -ForegroundColor Green
}
Write-Host ""

# -- Step 3: Launch services --
Write-Host "[3/3] Starting services..." -ForegroundColor Yellow
Write-Host ""

$rootDir = $PSScriptRoot

Write-Host "  -> Backend  (Port 5001)..." -ForegroundColor Green
Start-Process "cmd.exe" -ArgumentList "/k title [AetherWeave] Backend & cd /d $rootDir & python trajectory_lab\scripts\server.py"

Start-Sleep -Seconds 2

Write-Host "  -> Frontend (Port 5173)..." -ForegroundColor Green
Start-Process "cmd.exe" -ArgumentList "/k title [AetherWeave] Frontend & cd /d $rootDir\frontend & npm run dev"

Write-Host ""
Write-Host "  =========================================" -ForegroundColor Green
Write-Host "    All services started!                  " -ForegroundColor Green
Write-Host "  -----------------------------------------" -ForegroundColor Green
Write-Host "    Frontend:  http://localhost:5173        " -ForegroundColor Green
Write-Host "    Backend:   http://localhost:5001        " -ForegroundColor Green
Write-Host "    Login:     admin / admin123             " -ForegroundColor Green
Write-Host "  =========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Keep the two command windows open." -ForegroundColor DarkGray
Write-Host ""
