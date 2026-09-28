#!/usr/bin/env bash
# 取得測試與開發用的 MediaPipe 資產（刻意不進版控：體積大、可重建）。
# 用法：p0/fetch_assets.sh
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.node-current/bin:$PATH"

MODEL_URL="https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"

[ -d node_modules/@mediapipe/tasks-vision ] || { echo "[*] 安裝 @mediapipe/tasks-vision"; npm i @mediapipe/tasks-vision; }
[ -f hand_landmarker.task ] || { echo "[*] 下載模型"; curl -sL -o hand_landmarker.task "$MODEL_URL"; }

echo "[*] 佈署到 web/vendor"
mkdir -p ../web/vendor
cp -r node_modules/@mediapipe/tasks-vision/wasm ../web/vendor/wasm
cp node_modules/@mediapipe/tasks-vision/vision_bundle.mjs ../web/vendor/
cp hand_landmarker.task ../web/vendor/
echo "[O] 完成"
