# 哈比魔法學校

給小六升國中的孩子玩的手勢魔法學園遊戲。目前開發中。

- 線上：<https://gwanlinho.github.io/happy-magic-school/>
- 手勢測試頁：<https://gwanlinho.github.io/happy-magic-school/web/gesture-lab.html>

三個目的並列：好玩的奇幻校園故事、小六到國一的學科常識（佔活動評分一半）、以及上肢的輕量鍛鍊
——手舉久了會酸，而那正是遊戲的壓力來源。

完整企劃見 [`GAME_DESIGN.md`](GAME_DESIGN.md)，開發過程見 [`DEVLOG.md`](DEVLOG.md)。

## 隱私

鏡頭影像只在裝置本機運算，**不上傳、不儲存**。遊戲進度與成長報告也只存在本機。

## 開發

```bash
p0/fetch_assets.sh   # 取得 MediaPipe 資產（不進版控，體積大且可重建）
./run_tests.sh       # 單元測試 + 假相機整合測試 + 頁面冒煙測試
```

本機測試不需要相機也不需要真人：合成手圖經 ffmpeg 轉成 Y4M，再用 Chromium 的
`--use-file-for-fake-video-capture` 當成攝影機餵進真正的 MediaPipe。

目前進度：P0（測試管線與鏡頭幾何）、P1（校正層、判定層、畫形辨識、觸控備援、手勢測試頁）完成。
