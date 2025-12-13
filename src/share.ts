// src/share.ts
export async function shareResultImage(canvas: HTMLCanvasElement, text: string) {
  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/png"));
  if (!blob) return;

  const file = new File([blob], "emotion-game.png", { type: "image/png" });

  // Web Share API (iOS/Androidで効く)
  // @ts-expect-error
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    // @ts-expect-error
    await navigator.share({ title: "emotion-game", text, files: [file] });
  } else {
    // フォールバック：ダウンロード
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "emotion-game.png";
    a.click();
    URL.revokeObjectURL(a.href);
  }
}
