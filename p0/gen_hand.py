"""合成卡通手圖產生器 — 供無相機環境測試 MediaPipe HandLandmarker。
畫法：手掌圓角矩形 + 5 根分節手指(膠囊)，帶簡單明暗與描邊。
"""
import math, os
from PIL import Image, ImageDraw, ImageFilter

W, H = 640, 480
SKIN = (226, 178, 143)
SKIN_D = (196, 148, 115)
BG = (245, 245, 240)

def capsule(d, p0, p1, r, fill, outline=None, ow=2):
    (x0, y0), (x1, y1) = p0, p1
    d.line([x0, y0, x1, y1], fill=fill, width=int(r * 2), joint="curve")
    for (cx, cy) in (p0, p1):
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)

def finger(d, base, angle_deg, seg_lens, r, curl=0.0):
    """從 base 沿 angle 畫分節手指；curl>0 表示彎曲。

    注意：curl=1 畫出來比較像「半握的爪形」而不是緊握的拳頭。
    試過把三節折到合計 180 度做成真正的拳頭，結果 MediaPipe 完全偵測不到
    （2D 色塊畫的拳頭缺少真實手部的輪廓線索）。爪形雖然不夠像，
    但能被偵測、而且伸展比（約 1.6）與張開（約 2.06）分得開，
    足以在整合測試裡驗證「手型訊號」這條路徑是通的。
    真正的拳頭與張開能不能分開，要在真人實機上確認。"""
    pts = [base]
    a = math.radians(angle_deg)
    bend = (15, 35, 35)
    for i, L in enumerate(seg_lens):
        a += math.radians(curl * bend[i] if i < len(bend) else 0)
        Lc = L
        x = pts[-1][0] + Lc * math.cos(a)
        y = pts[-1][1] + Lc * math.sin(a)
        pts.append((x, y))
    rr = r
    for i in range(len(pts) - 1):
        capsule(d, pts[i], pts[i + 1], rr, SKIN)
        rr *= 0.86
    return pts[-1]

def draw_hand(d, cx, cy, scale=1.0, curl=0.0, mirror=False, rot=0.0):
    s = scale
    sgn = -1 if mirror else 1
    # 手掌
    pw, ph = 86 * s, 100 * s
    d.rounded_rectangle([cx - pw / 2, cy - ph / 2, cx + pw / 2, cy + ph / 2],
                        radius=34 * s, fill=SKIN)
    # 四指（指向上方 = -90 度）
    spread = [-108, -97, -86, -75]
    lens = [[34, 26, 20], [38, 29, 22], [36, 28, 21], [29, 23, 17]]
    xs = [-30, -10, 10, 29]
    for i in range(4):
        bx = cx + sgn * xs[i] * s
        by = cy - ph / 2 + 8 * s
        ang = spread[i] * (1 if not mirror else 1)
        if mirror:
            ang = -180 - spread[i]
        finger(d, (bx, by), ang + rot, [l * s for l in lens[i]], 11 * s, curl)
    # 拇指
    tb = (cx - sgn * pw / 2 + sgn * 6 * s, cy + 14 * s)
    finger(d, tb, (-160 if not mirror else -20) + rot, [34 * s, 26 * s], 13 * s, curl * 0.6)

def render(name, hands):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    for h in hands:
        draw_hand(d, **h)
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    img.save(name)
    return name

os.makedirs("frames", exist_ok=True)
cases = {
    "open_center":  [dict(cx=320, cy=260, scale=1.0, curl=0.0)],
    "open_high":    [dict(cx=320, cy=140, scale=1.0, curl=0.0)],
    "fist":         [dict(cx=320, cy=260, scale=1.0, curl=1.0)],
    "two_hands":    [dict(cx=200, cy=250, scale=0.9, curl=0.0),
                     dict(cx=440, cy=250, scale=0.9, curl=0.0, mirror=True)],
    "tilt":         [dict(cx=320, cy=250, scale=1.0, curl=0.0, rot=18)],
}
for k, v in cases.items():
    print(render(f"frames/{k}.png", v))

# --- 動態序列：手由低舉到高並維持 ---
import shutil
seq = "seq"
shutil.rmtree(seq, ignore_errors=True)
os.makedirs(seq, exist_ok=True)
N = 90
for i in range(N):
    t = i / (N - 1)
    if t < 0.45:          # 舉起
        y = 330 - (330 - 130) * (t / 0.45)
    else:                  # 維持
        y = 130 + 4 * math.sin(i * 0.5)
    render(f"{seq}/{i:04d}.png", [dict(cx=320, cy=y, scale=1.0, curl=0.0)])
print("seq frames:", N)
