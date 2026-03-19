@echo off
REM SHARP Primer Designer — first-time setup (Windows)
setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "ROOT=%SCRIPT_DIR%.."
set "CONDA_ENV_NAME=sharp"

echo === SHARP Primer Designer Setup ===
echo.

REM Check BLAST+
echo Checking BLAST+...
set "BLAST_AVAILABLE=0"
where blastn >nul 2>&1
if not errorlevel 1 (
    set "BLAST_AVAILABLE=1"
    blastn -version 2>&1 | findstr /n "^" | findstr "^1:"
) else (
    echo WARNING: BLAST+ not found. Specificity screening will be unavailable.
    echo   To enable it later, install from: https://ftp.ncbi.nlm.nih.gov/blast/executables/blast+/LATEST/
    echo   Add the bin directory to your PATH after installing.
)
echo.

REM ── Python environment ─────────────────────────────────────────────────────
REM Use conda if available, fall back to venv.
REM Check PATH first, then common install locations.

where conda >nul 2>&1
if errorlevel 1 (
    if exist "%USERPROFILE%\anaconda3\condabin\conda.bat" (
        set "PATH=%USERPROFILE%\anaconda3\condabin;%PATH%"
    ) else if exist "%USERPROFILE%\miniconda3\condabin\conda.bat" (
        set "PATH=%USERPROFILE%\miniconda3\condabin;%PATH%"
    ) else if exist "C:\ProgramData\anaconda3\condabin\conda.bat" (
        set "PATH=C:\ProgramData\anaconda3\condabin;%PATH%"
    )
)

where conda >nul 2>&1
if not errorlevel 1 (
    echo Conda detected — using conda environment '%CONDA_ENV_NAME%'

    REM Check if env exists
    conda env list | findstr /b /c:"%CONDA_ENV_NAME% " >nul 2>&1
    if errorlevel 1 (
        echo Creating conda env '%CONDA_ENV_NAME%' ^(Python 3.11^)...
        conda create -y -n %CONDA_ENV_NAME% python=3.11 -q
    ) else (
        echo Conda env '%CONDA_ENV_NAME%' already exists
    )

    echo Installing packages via conda...
    conda install -y -q -n %CONDA_ENV_NAME% -c bioconda -c conda-forge ^
        primer3-py ^
        biopython ^
        fastapi ^
        uvicorn ^
        python-multipart ^
        python-dotenv ^
        pydantic ^
        pytest ^
        httpx ^
        pip

    REM Mark that we used conda
    echo conda> "%ROOT%\.python_env_type"
    echo %CONDA_ENV_NAME%>> "%ROOT%\.python_env_type"

    REM Get the python path for later use
    for /f "tokens=*" %%i in ('conda info --base') do set "CONDA_BASE=%%i"
    set "PYTHON_CMD=!CONDA_BASE!\envs\%CONDA_ENV_NAME%\python.exe"

    echo Python dependencies installed via conda

) else (
    echo Setting up Python venv...
    cd /d "%ROOT%\backend"
    if not exist "venv" (
        python -m venv venv
        echo Created virtualenv
    )
    call venv\Scripts\activate.bat
    pip install -q -r requirements.txt

    echo venv> "%ROOT%\.python_env_type"
    set "PYTHON_CMD=python"
    echo Python dependencies installed via pip
)
echo.

REM .env
if not exist "%ROOT%\.env" (
    echo NCBI_EMAIL=support@sharpdx.com> "%ROOT%\.env"
    echo Created .env ^(update NCBI_EMAIL if needed^)
)

REM Lambda BLAST DB
if "%BLAST_AVAILABLE%"=="1" (
    echo Setting up Lambda phage BLAST database...
    cd /d "%ROOT%\backend"
    %PYTHON_CMD% -m scripts.setup_genomes
) else (
    echo Skipping BLAST database setup ^(BLAST+ not installed^)
)
echo.

REM Frontend
echo Setting up frontend...
cd /d "%ROOT%\frontend"
call npm install --silent
echo Node.js dependencies installed
echo.

echo === Setup complete ===
echo.
echo To start the app:  scripts\start.bat
echo Or double-click:   launcher.py

endlocal
