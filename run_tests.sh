#!/usr/bin/env bash
# 哈比魔法學校 — 全套測試。無需相機、無需真人。
# 用法：./run_tests.sh
set -uo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.node-current/bin:$PATH"
PORT=8777
FAIL=0

say() { printf '\n=== %s ===\n' "$1"; }

say "1/3 單元測試（校正層、判定層、畫形、觸控）"
node --test "test/*.test.mjs" 2>&1 | grep -E "^(not ok|# (tests|pass|fail))" || true
node --test "test/*.test.mjs" >/dev/null 2>&1 || FAIL=1

# 本機伺服器（getUserMedia 需要安全來源；127.0.0.1 算安全來源）
if ! pgrep -f "[h]ttp.server $PORT" >/dev/null; then
  python3 -m http.server $PORT >/dev/null 2>&1 &
  SERVER_PID=$!
  trap 'kill $SERVER_PID 2>/dev/null' EXIT
  sleep 2
fi

say "2/3 整合測試（假相機 → 真 MediaPipe → 判定層）"
if [ ! -f web/vendor/vision_bundle.mjs ] || [ ! -f web/vendor/hand_landmarker.task ]; then
  echo "[!] 缺少 MediaPipe 資產，取得中…"
  p0/fetch_assets.sh
fi
if [ ! -f p0/fake_two_hands_slow.y4m ]; then
  echo "[!] 缺少測試影片，重新產生中…"
  (cd p0 && python3 gen_two_hands.py >/dev/null && \
   ffmpeg -y -loglevel error -framerate 2 -i seq2/%04d.png -pix_fmt yuv420p fake_two_hands_slow.y4m)
fi
OUT=$(timeout 500 node p0/run_page.js "http://127.0.0.1:$PORT/web/integration-test.html" 440 \
  --use-fake-ui-for-media-stream --use-fake-device-for-media-stream \
  --use-file-for-fake-video-capture="$PWD/p0/fake_two_hands_slow.y4m" 2>&1)
echo "$OUT" | grep -E "^(PASS|FAIL|RESULT)" || echo "$OUT" | tail -5
echo "$OUT" | grep -q "RESULT PASS" || FAIL=1

say "3/3 手勢測試頁冒煙測試（無鏡頭情況）"
OUT=$(timeout 180 node p0/lab_smoke.js "http://127.0.0.1:$PORT/web/gesture-lab.html" 2>&1)
echo "$OUT" | grep -E "^(PASS|FAIL|RESULT)" || echo "$OUT" | tail -5
echo "$OUT" | grep -q "RESULT PASS" || FAIL=1

say "總結"
[ $FAIL -eq 0 ] && echo "[O] 全部通過" || echo "[X] 有測試失敗"
exit $FAIL
