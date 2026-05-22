from pathlib import Path
from collections import deque
from PIL import Image

CHAR_DIR = Path("public/cosmetics/characters")
MAX_OUTPUT_SIZE = 1024
PADDING_RATIO = 0.10

def is_background_like(pixel):
    r, g, b, a = pixel
    if a == 0:
        return True

    avg = (r + g + b) / 3
    spread = max(r, g, b) - min(r, g, b)

    # 白背景・薄いグレー背景・市松模様の白/灰色を除去対象にする
    if avg >= 220 and spread <= 35:
        return True
    if min(r, g, b) >= 245:
        return True

    return False

def remove_edge_connected_background(img):
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()

    bg = bytearray(w * h)
    q = deque()

    def mark_if_bg(x, y):
        i = y * w + x
        if bg[i]:
            return
        if is_background_like(px[x, y]):
            bg[i] = 1
            q.append((x, y))

    # 端からつながっている白/灰背景だけを消す
    for x in range(w):
        mark_if_bg(x, 0)
        mark_if_bg(x, h - 1)
    for y in range(h):
        mark_if_bg(0, y)
        mark_if_bg(w - 1, y)

    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h:
                i = ny * w + nx
                if not bg[i] and is_background_like(px[nx, ny]):
                    bg[i] = 1
                    q.append((nx, ny))

    removed = 0
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if bg[i]:
                r, g, b, a = px[x, y]
                if a != 0:
                    removed += 1
                px[x, y] = (r, g, b, 0)

    return img, removed

def crop_to_face(img):
    alpha = img.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        return img

    cropped = img.crop(bbox)
    cw, ch = cropped.size

    pad = max(16, int(max(cw, ch) * PADDING_RATIO))
    side = max(cw, ch) + pad * 2

    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(cropped, ((side - cw) // 2, (side - ch) // 2), cropped)

    if side > MAX_OUTPUT_SIZE:
        canvas = canvas.resize((MAX_OUTPUT_SIZE, MAX_OUTPUT_SIZE), Image.Resampling.LANCZOS)

    return canvas

def process(path):
    original = Image.open(path).convert("RGBA")
    before_size = original.size

    no_bg, removed = remove_edge_connected_background(original)
    out = crop_to_face(no_bg)

    out.save(path, "PNG", optimize=True)

    alpha = out.getchannel("A")
    bbox = alpha.getbbox()
    print(f"processed: {path}")
    print(f"  before: {before_size}")
    print(f"  after : {out.size}")
    print(f"  removed background pixels: {removed}")
    print(f"  alpha bbox: {bbox}")

def main():
    files = sorted(CHAR_DIR.glob("*.png"))
    if not files:
        raise SystemExit(f"No PNG files found in {CHAR_DIR}")

    for path in files:
        process(path)

if __name__ == "__main__":
    main()
