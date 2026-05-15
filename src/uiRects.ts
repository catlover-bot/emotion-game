// src/uiRects.ts
export type Rect = { x: number; y: number; w: number; h: number };

export function contains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function gameOverButtons(
  w: number,
  h: number,
): { share: Rect; retry: Rect; title: Rect } {
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
