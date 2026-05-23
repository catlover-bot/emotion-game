from pathlib import Path
from collections import deque
from PIL import Image

ITEM_DIR = Path("public/cosmetics/items")
MAX_OUTPUT_SIZE = 1024
PADDING_RATIO = 0.08

def is_background_like(pixel):
    r, g, b, a = pixel
    if a == 0:
        return True

    avg = (r + g + b) / 3
    spread = max(r, g, b) - min(r, g, b)

    # 白背景・薄いグレー背景除去
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

def crop_to_subject(img):
    alpha = img.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        return img

    cropped = img.crop(bbox)
    cw, ch = cropped.size
    pad = max(12, int(max(cw, ch) * PADDING_RATIO))

    out_w = cw + pad * 2
    out_h = ch + pad * 2

    canvas = Image.new("RGBA", (out_w, out_h), (0, 0, 0, 0))
    canvas.paste(cropped, (pad, pad), cropped)

    max_side = max(out_w, out_h)
    if max_side > MAX_OUTPUT_SIZE:
        scale = MAX_OUTPUT_SIZE / max_side
        canvas = canvas.resize(
            (max(1, int(out_w * scale)), max(1, int(out_h * scale))),
            Image.Resampling.LANCZOS
        )

    return canvas

def process(path):
    original = Image.open(path).convert("RGBA")
    before_size = original.size
    no_bg, removed = remove_edge_connected_background(original)
    out = crop_to_subject(no_bg)
    out.save(path, "PNG", optimize=True)

    alpha = out.getchannel("A")
    print(f"processed: {path}")
    print(f"  before: {before_size}")
    print(f"  after : {out.size}")
    print(f"  removed background pixels: {removed}")
    print(f"  alpha bbox: {alpha.getbbox()}")

def main():
    files = sorted(ITEM_DIR.glob("*.png"))
    if not files:
        raise SystemExit(f"No PNG files found in {ITEM_DIR}")

    for path in files:
        process(path)

if __name__ == "__main__":
    main()
