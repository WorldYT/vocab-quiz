#!/usr/bin/env bash
# ============================================================
#  TradingView Signal Tunnel - always-on launcher (Mac/Linux)
#  Run:  ./start-unix.sh
#  Restarts the server automatically if it ever crashes.
#
#  Set your secret first (or edit the default below):
#     TV_SECRET=my-long-password ./start-unix.sh
# ============================================================
cd "$(dirname "$0")" || exit 1

export TV_SECRET="${TV_SECRET:-CHANGE_THIS_SECRET}"
export PORT="${PORT:-8000}"

while true; do
  echo "[$(date)] Starting TradingView Signal Tunnel on port $PORT ..."
  node server.js
  echo "[$(date)] Server exited. Restarting in 3s (press Ctrl+C to stop)."
  sleep 3
done
