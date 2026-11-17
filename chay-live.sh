#!/usr/bin/env bash
# Linux / Mac: chạy game cho buổi live, server tắt thì tự bật lại (điểm được khôi phục, game về Tạm dừng)
cd "$(dirname "$0")"
[ -d node_modules ] || pnpm install
export LIVE_MODE=1 PORT=${PORT:-3007}
echo "Admin: http://localhost:$PORT   |   LIVE Studio: http://lvh.me:$PORT/?view=overlay (1080x1920)"
while true; do
  pnpm dev
  echo "[$(date +%T)] Server bị tắt, tự bật lại sau 5 giây... (Ctrl+C 2 lần để tắt hẳn)"
  sleep 5
done
