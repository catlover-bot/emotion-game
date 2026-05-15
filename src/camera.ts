// src/camera.ts
export type CameraErrorKind = "denied" | "unsupported" | "unavailable" | "unknown";

export class CameraSetupError extends Error {
  readonly kind: CameraErrorKind;

  constructor(kind: CameraErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = "CameraSetupError";
  }
}

let activeStream: MediaStream | null = null;

function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function normalizeCameraError(error: unknown): CameraSetupError {
  if (error instanceof CameraSetupError) return error;

  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return new CameraSetupError("denied", "Camera permission was denied.");
    }
    if (error.name === "NotFoundError" || error.name === "OverconstrainedError") {
      return new CameraSetupError("unavailable", "No usable front camera was found.");
    }
    if (error.name === "NotReadableError" || error.name === "AbortError") {
      return new CameraSetupError("unavailable", "The camera is currently unavailable.");
    }
    return new CameraSetupError("unknown", error.message || "Unknown camera error.");
  }

  return new CameraSetupError("unknown", "Unknown camera error.");
}

export async function setupCamera(video: HTMLVideoElement): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraSetupError(
      "unsupported",
      "This browser does not support camera access.",
    );
  }

  video.setAttribute("playsinline", "true");
  video.muted = true;

  stopTracks(activeStream);
  activeStream = null;

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 960 },
        height: { ideal: 1280 },
      },
      audio: false,
    });
  } catch (error) {
    throw normalizeCameraError(error);
  }

  activeStream = stream;
  video.srcObject = stream;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => {
      void video
        .play()
        .then(() => resolve())
        .catch((error: unknown) => reject(normalizeCameraError(error)));
    };
  });
}

export function stopCamera(video: HTMLVideoElement): void {
  stopTracks(activeStream);
  activeStream = null;
  video.srcObject = null;
}
