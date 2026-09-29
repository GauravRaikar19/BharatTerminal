@echo off
title BharatTerminal - Real Market Data Server
echo ========================================================
echo   Starting BharatTerminal - Real Indian Stock Terminal
echo ========================================================
echo.
cd /d "%~dp0"
echo Starting local real-data feed on port 3000...
start "" "http://localhost:3000"
node server.js
pause
