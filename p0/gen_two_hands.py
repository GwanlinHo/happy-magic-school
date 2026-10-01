"""產生雙手四階段影片：垂放且張開 → 抬到肩線且握拳 → 回落 → 張開抬到肩線維持。
供 headless 整合測試使用（真 MediaPipe + 假相機 + 本專案判定層）。"""
import math, os, shutil, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_hand import render, W, H

FPS = 15
PHASES = [("rest", 2.0), ("shoulder", 2.0), ("settle", 1.0), ("hold", 5.0)]
# 全程張開手。
# 本來想讓校正第二步握拳，但 2D 色塊畫的拳頭 MediaPipe 偵測不到（試過爪形與全握，
# 爪形只認得出一隻、全握兩隻都認不出）。握拳的判定邏輯改由單元測試覆蓋（可完全控制座標），
# 這支影片則專門驗「校正量不到手型差異時，系統會自動退回不用手型的判定」這條路徑。
CURL = {"rest": 0.0, "shoulder": 0.0, "settle": 0.0, "hold": 0.0}
REST_Y, SHOULDER_Y = 0.72 * H, 0.46 * H   # 只到肩膀高度，不是舉到最高

def y_at(phase, u):
    if phase == "rest":     return REST_Y
    if phase == "shoulder": return SHOULDER_Y
    if phase == "settle":   return REST_Y
    # hold：立刻到位再維持。
    # 這裡刻意不做緩慢上升：整支影片會被以極低 fps 重新編碼放慢（Pi 推論很慢），
    # 若生成時還做 1 秒的漸進，重編碼後會變成「花好幾秒緩慢舉手」——
    # 那不是人的真實動作，只會讓測試去測一個不存在的情境。
    lift = 0.90
    return REST_Y - lift * (REST_Y - SHOULDER_Y) + 3 * math.sin(u * 6)

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
        c = CURL[phase]
        render(f"{out}/{i:04d}.png", [
            dict(cx=0.34 * W, cy=y, scale=0.85, curl=c),
            dict(cx=0.66 * W, cy=y, scale=0.85, curl=c, mirror=True),
        ])
        i += 1
print("frames:", i)
for m in marks: print("  phase %-7s %.1fs ~ %.1fs" % m)
