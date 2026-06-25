@echo off
REM ============================================================
REM  ONE-CLICK: starts the signal server AND the ngrok tunnel.
REM
REM  Before the very first run:
REM    1) Run setup-ngrok-windows.bat once (logs ngrok in).
REM    2) Set your TV_SECRET inside start-windows.bat.
REM  If you change the port, change it in BOTH start-windows.bat
REM  and the PORT line below so they match.
REM ============================================================
set PORT=8000
title TradingView Signal Tunnel - launcher
cd /d "%~dp0"

REM --- Is ngrok installed? ---
where ngrok >nul 2>nul
if errorlevel 1 (
  echo.
  echo ngrok was not found on this PC.
  echo Install it from  https://ngrok.com/download
  echo   or run:  winget install ngrok.ngrok
  echo Then run setup-ngrok-windows.bat once, and start this again.
  echo.
  pause
  exit /b
)

REM --- Start the auto-restarting server in its own window ---
start "Signal Server" cmd /c "%~dp0start-windows.bat"

REM --- Open the public tunnel (this window prints your public URL) ---
timeout /t 2 /nobreak >nul
echo.
echo ============================================================
echo  Your public URL appears below (the https://...ngrok... line).
echo  On computer three, open that URL.
echo  In TradingView, the webhook URL is that URL + /tradingview
echo ============================================================
echo.
ngrok http %PORT%
