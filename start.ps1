# DB Hub — start backend + frontend dev server
Write-Host "Starting DB Hub..." -ForegroundColor Cyan

Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd backend && python -m uvicorn main:app --port 8000 --reload"
Start-Sleep -Seconds 2
Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd frontend && npm run dev -- --port 5173"
Start-Sleep -Seconds 2

Write-Host ""
Write-Host "  Backend API:  http://localhost:8000" -ForegroundColor Green
Write-Host "  Frontend:     http://localhost:5173" -ForegroundColor Green
Write-Host ""
Write-Host "Open http://localhost:5173 in your browser." -ForegroundColor Yellow
