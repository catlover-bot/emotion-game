// src/uiRects.ts
export type Rect = { x: number; y: number; w: number; h: number };

export function contains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function gameOverButtons(
  w: number,
  h: number,
): { share: Rect; retry: Rect; title: Rect } {
  if (w > h * 1.1) {
    const gap = 16;
    const bh = 56;
    const available = Math.min(w - 48, 780);
    const bw = Math.max(150, (available - gap * 2) / 3);
    const totalW = bw * 3 + gap * 2;
    const x0 = (w - totalW) / 2;
    const y = h - bh - 24;

    return {
      share: { x: x0, y, w: bw, h: bh },
      retry: { x: x0 + bw + gap, y, w: bw, h: bh },
      title: { x: x0 + (bw + gap) * 2, y, w: bw, h: bh },
    };
  }

  const bw = Math.min(320, w * 0.78);
  const bh = 56;
  const cx = (w - bw) / 2;
  const y0 = h / 2 + 132;

  return {
    share: { x: cx, y: y0, w: bw, h: bh },
    retry: { x: cx, y: y0 + bh + 16, w: bw, h: bh },
    title: { x: cx, y: y0 + (bh + 16) * 2, w: bw, h: bh },
  };
}
