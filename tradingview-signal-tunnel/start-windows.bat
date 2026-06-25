@echo off
REM ============================================================
REM  TradingView Signal Tunnel - always-on launcher (Windows)
REM  Double-click this file to run the server. It restarts
REM  itself automatically if it ever crashes.
REM
REM  >>> EDIT THE TWO LINES BELOW before first run <<<
REM ============================================================
set TV_SECRET=CHANGE_THIS_SECRET
set PORT=8000
REM ============================================================

title TradingView Signal Tunnel
cd /d "%~dp0"

:loop
echo.
echo [%date% %time%] Starting TradingView Signal Tunnel on port %PORT% ...
node server.js
echo [%date% %time%] Server exited. Restarting in 3 seconds. Close this window to stop.
timeout /t 3 /nobreak >nul
goto loop
