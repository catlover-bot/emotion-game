// src/dom.ts
export function getRequiredVideo(id: string): HTMLVideoElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLVideoElement)) {
    throw new Error(`video 要素 #${id} が見つかりません`);
  }
  return el;
}

export function getRequiredCanvas(id: string): HTMLCanvasElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLCanvasElement)) {
    throw new Error(`canvas 要素 #${id} が見つかりません`);
  }
  return el;
}
