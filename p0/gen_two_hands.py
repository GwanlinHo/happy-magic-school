"""產生雙手三階段影片：自然垂放 → 盡力舉高 → 回落後再高舉維持。
供 headless 整合測試使用（真 MediaPipe + 假相機 + 本專案判定層）。"""
import math, os, shutil, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_hand import render, W, H

FPS = 15
PHASES = [("rest", 2.0), ("top", 2.0), ("settle", 1.0), ("hold", 5.0)]
REST_Y, TOP_Y = 0.72 * H, 0.30 * H

def y_at(phase, u):
    if phase == "rest":   return REST_Y
    if phase == "top":    return TOP_Y
    if phase == "settle": return REST_Y
    # hold：立刻到位再維持。
    # 這裡刻意不做緩慢上升：整支影片會被以極低 fps 重新編碼放慢（Pi 推論很慢），
    # 若生成時還做 1 秒的漸進，重編碼後會變成「花好幾秒緩慢舉手」——
    # 那不是人的真實動作，只會讓測試去測一個不存在的情境。
    lift = 0.85
    return REST_Y - lift * (REST_Y - TOP_Y) + 3 * math.sin(u * 6)

out = "seq2"
shutil.rmtree(out, ignore_errors=True)
os.makedirs(out, exist_ok=True)
i = 0
marks = []
for phase, secs in PHASES:
    n = int(secs * FPS)
    marks.append((phase, i / FPS, (i + n) / FPS))
    for k in range(n):
        y = y_at(phase, k / FPS)
        render(f"{out}/{i:04d}.png", [
            dict(cx=0.34 * W, cy=y, scale=0.85, curl=0.0),
            dict(cx=0.66 * W, cy=y, scale=0.85, curl=0.0, mirror=True),
        ])
        i += 1
print("frames:", i)
for m in marks: print("  phase %-7s %.1fs ~ %.1fs" % m)
