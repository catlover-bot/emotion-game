// src/camera.ts
export async function setupCamera(video: HTMLVideoElement): Promise<void> {
  // iOS Safari 対策
  video.setAttribute("playsinline", "true");

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user" },
    audio: false,
  });

  video.srcObject = stream;

  return new Promise<void>((resolve) => {
    video.onloadedmetadata = () => {
      video.play();
      resolve();
    };
  });
}
