@echo off
setlocal

:: Try conda info --base first
for /f "tokens=*" %%i in ('conda info --base 2^>nul') do set "CONDA_BASE=%%i"

:: Fallback to common locations
if not defined CONDA_BASE (
    if exist "%USERPROFILE%\anaconda3" set "CONDA_BASE=%USERPROFILE%\anaconda3"
    if exist "%USERPROFILE%\miniconda3" set "CONDA_BASE=%USERPROFILE%\miniconda3"
    if exist "C:\ProgramData\anaconda3" set "CONDA_BASE=C:\ProgramData\anaconda3"
)

set "PYTHON=%CONDA_BASE%\envs\sharp\pythonw.exe"
if not exist "%PYTHON%" set "PYTHON=%CONDA_BASE%\envs\sharp\python.exe"
if not exist "%PYTHON%" (
    echo Could not find Python in conda env 'sharp'.
    echo Run scripts\setup.bat first.
    pause
    exit /b 1
)

start "" "%PYTHON%" "%~dp0launcher.py"
