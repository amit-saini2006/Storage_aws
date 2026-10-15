@echo off
echo ========================================================
echo   Starting CloudVault (Backend + Frontend)
echo ========================================================

echo Starting Flask Backend on http://localhost:5000 ...
start "CloudVault Backend (Flask)" cmd /k "cd backend && python app.py"

echo Starting Vite Frontend on http://localhost:3000 ...
start "CloudVault Frontend (React)" cmd /k "cd frontend && npm run dev"

echo.
echo Both servers are launching!
echo Frontend will be available at: http://localhost:3000
echo Backend will be available at:  http://localhost:5000
echo ========================================================
