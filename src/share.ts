// src/share.ts
export async function shareResultImage(canvas: HTMLCanvasElement, text: string) {
  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/png"));
  if (!blob) return;

  const file = new File([blob], "hyojo-runner-result.png", { type: "image/png" });

  // Web Share API (iOS/Androidで効く)
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ title: "表情ランナー", text, files: [file] });
  } else if (navigator.share) {
    await navigator.share({ title: "表情ランナー", text });
  } else {
    // フォールバック：ダウンロード
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "hyojo-runner-result.png";
    a.click();
    URL.revokeObjectURL(a.href);
  }
}
