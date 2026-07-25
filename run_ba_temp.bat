@echo off
rem Inicia el script de PowerShell en segundo plano y redirige la salida a un archivo log
start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0BA_Temp_Agent.ps1" > "%~dp0ba_temp.log" 2>&1
