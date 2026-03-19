@echo off
REM SHARP Primer Designer — start backend and frontend (Windows)
setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "ROOT=%SCRIPT_DIR%.."
set "ENV_TYPE_FILE=%ROOT%\.python_env_type"

if not exist "%ENV_TYPE_FILE%" (
    echo Run scripts\setup.bat first
    exit /b 1
)

set /p ENV_TYPE=<"%ENV_TYPE_FILE%"

echo Starting SHARP Primer Designer...

REM Activate the right Python environment
if "%ENV_TYPE%"=="conda" (
    for /f "skip=1 tokens=*" %%i in (%ENV_TYPE_FILE%) do set "CONDA_ENV_NAME=%%i"
    call conda activate !CONDA_ENV_NAME!
) else (
    call "%ROOT%\backend\venv\Scripts\activate.bat"
)

REM Start backend
echo   Backend  -^> http://localhost:8000
cd /d "%ROOT%\backend"
start "SHARP-Backend" /b cmd /c "uvicorn main:app --reload --port 8000"

REM Wait for backend
timeout /t 2 /nobreak >nul

REM Start frontend
echo   Frontend -^> http://localhost:5173
cd /d "%ROOT%\frontend"
start "SHARP-Frontend" /b cmd /c "npm run dev"

REM Open browser
timeout /t 3 /nobreak >nul
start http://localhost:5173

echo.
echo Press Ctrl+C to stop both servers

REM Keep the window open
pause >nul

endlocal
