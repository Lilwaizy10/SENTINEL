@echo off
echo ===============================================
echo   SENTINEL - Starting
echo ===============================================
echo.
echo Starting BACKEND on port 8000...
echo.

cd backend
start "SENTINEL Backend" cmd /k "python main.py"

timeout /t 5 /nobreak >nul

echo.
echo Starting FRONTEND on http://localhost:3000...
echo.

cd ..\frontend
start "SENTINEL Frontend" cmd /k "npm start"

echo.
echo ===============================================
echo   SENTINEL is starting...
echo ===============================================
echo.
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:3000
echo.
echo Press any key to exit this window...
pause >nul
