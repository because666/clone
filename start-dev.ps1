Write-Host "===================================" -ForegroundColor Cyan
Write-Host "Starting AetherWeave Local Development Environment..." -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan

Write-Host "[1/2] Starting Python Backend Server (Port: 5001)..." -ForegroundColor Green
Start-Process "cmd.exe" -ArgumentList "/k `"title AetherWeave Backend & python trajectory_lab\scripts\server.py`""

Write-Host "[2/2] Starting Vite Frontend Server (Port: 5173)..." -ForegroundColor Green
Start-Process "cmd.exe" -ArgumentList "/k `"title AetherWeave Frontend & cd frontend && npm run dev`""

Write-Host "`nAll processes started successfully!" -ForegroundColor Yellow
Write-Host "Please keep the two command windows open." -ForegroundColor Yellow
Write-Host "Frontend URL: http://localhost:5173`n" -ForegroundColor DarkCyan
