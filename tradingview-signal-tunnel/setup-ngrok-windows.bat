@echo off
REM ============================================================
REM  ONE-TIME ngrok login for this PC.
REM  Run this once, paste your authtoken when asked, and you're
REM  done forever. ngrok saves it in its own config (NOT here),
REM  so your token never goes into any file in this project.
REM ============================================================
title ngrok setup (one time)
echo.
echo This logs ngrok in on this computer. You only do this once.
echo Get your token from the ngrok dashboard ^> "Your Authtoken".
echo.
set /p TOKEN="Paste your ngrok authtoken, then press Enter: "
if "%TOKEN%"=="" (
  echo.
  echo No token entered - nothing changed.
  pause
  exit /b
)
ngrok config add-authtoken %TOKEN%
echo.
echo Done. Now run start-all-windows.bat to go live.
pause
