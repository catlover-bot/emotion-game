export type BgmTrack = "title" | "gameplay" | "result" | "gacha" | "customize";
export type SfxKey =
  | "confirm"
  | "back"
  | "jump"
  | "attack"
  | "boost"
  | "feverStart"
  | "gachaReveal"
  | "missionClear"
  | "achievement"
  | "resultFanfare";

export type AudioSettings = {
  bgmEnabled: boolean;
  sfxEnabled: boolean;
  bgmVolume: number;
  sfxVolume: number;
};

const AUDIO_SETTINGS_KEY = "emotion-game.audio-settings";

const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  bgmEnabled: true,
  sfxEnabled: true,
  bgmVolume: 0.45,
  sfxVolume: 0.62,
};

const BGM_PATHS: Record<BgmTrack, string> = {
  title: "./audio/bgm/title.mp3",
  gameplay: "./audio/bgm/gameplay.mp3",
  result: "./audio/bgm/result.mp3",
  gacha: "./audio/bgm/gacha.mp3",
  customize: "./audio/bgm/customize.mp3",
};

const SFX_PATHS: Record<SfxKey, string> = {
  confirm: "./audio/sfx/confirm.mp3",
  back: "./audio/sfx/back.mp3",
  jump: "./audio/sfx/jump.mp3",
  attack: "./audio/sfx/attack.mp3",
  boost: "./audio/sfx/boost.mp3",
  feverStart: "./audio/sfx/fever_start.mp3",
  gachaReveal: "./audio/sfx/gacha_reveal.mp3",
  missionClear: "./audio/sfx/mission_clear.mp3",
  achievement: "./audio/sfx/achievement.mp3",
  resultFanfare: "./audio/sfx/result_fanfare.mp3",
};

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function logAudioInfo(message: string, payload?: unknown) {
  if (payload === undefined) {
    console.info(`EMOTION_RUNNER_AUDIO ${message}`);
    return;
  }
  console.info(`EMOTION_RUNNER_AUDIO ${message}`, payload);
}

function logAudioError(message: string, payload?: unknown) {
  if (payload === undefined) {
    console.warn(`EMOTION_RUNNER_AUDIO ${message}`);
    return;
  }
  console.warn(`EMOTION_RUNNER_AUDIO ${message}`, payload);
}

function normalizeAudioSettings(value: unknown): AudioSettings {
  if (!value || typeof value !== "object") return { ...DEFAULT_AUDIO_SETTINGS };
  const raw = value as Partial<AudioSettings>;
  return {
    bgmEnabled: typeof raw.bgmEnabled === "boolean" ? raw.bgmEnabled : DEFAULT_AUDIO_SETTINGS.bgmEnabled,
    sfxEnabled: typeof raw.sfxEnabled === "boolean" ? raw.sfxEnabled : DEFAULT_AUDIO_SETTINGS.sfxEnabled,
    bgmVolume: clampVolume(typeof raw.bgmVolume === "number" ? raw.bgmVolume : DEFAULT_AUDIO_SETTINGS.bgmVolume),
    sfxVolume: clampVolume(typeof raw.sfxVolume === "number" ? raw.sfxVolume : DEFAULT_AUDIO_SETTINGS.sfxVolume),
  };
}

export function loadAudioSettings(): AudioSettings {
  try {
    const raw = window.localStorage.getItem(AUDIO_SETTINGS_KEY);
    return normalizeAudioSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

export function saveAudioSettings(settings: AudioSettings): void {
  try {
    window.localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(normalizeAudioSettings(settings)));
  } catch {
    // Audio should never be required for gameplay.
  }
}

export function clearAudioSettings(): void {
  try {
    window.localStorage.removeItem(AUDIO_SETTINGS_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function createAudioElement(path: string, loop: boolean): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  const audio = new Audio(path);
  audio.preload = "auto";
  audio.loop = loop;
  audio.addEventListener("error", () => {
    logAudioError("file-missing-or-unavailable", { path });
  });
  return audio;
}

export function createAudioManager(initialSettings: AudioSettings) {
  let settings = normalizeAudioSettings(initialSettings);
  let unlocked = false;
  let currentTrack: BgmTrack | null = null;
  let currentBgm: HTMLAudioElement | null = null;
  let pendingTrack: BgmTrack | null = null;
  const sfxCache = new Map<SfxKey, HTMLAudioElement>();
  const lastSfxAt = new Map<SfxKey, number>();

  function applyBgmVolume() {
    if (currentBgm) {
      currentBgm.volume = settings.bgmEnabled ? settings.bgmVolume : 0;
    }
  }

  async function fadeOutAndStop(audio: HTMLAudioElement | null) {
    if (!audio) return;
    const startVolume = audio.volume;
    for (let i = 3; i >= 0; i -= 1) {
      audio.volume = startVolume * (i / 3);
      await new Promise((resolve) => window.setTimeout(resolve, 55));
    }
    audio.pause();
    audio.currentTime = 0;
  }

  async function playBgmNow(track: BgmTrack) {
    pendingTrack = track;
    if (!settings.bgmEnabled) {
      await fadeOutAndStop(currentBgm);
      currentTrack = track;
      return;
    }

    if (!unlocked) {
      logAudioInfo("bgm-deferred-until-unlock", { track });
      return;
    }

    if (currentTrack === track && currentBgm && !currentBgm.paused) {
      applyBgmVolume();
      return;
    }

    const previousBgm = currentBgm;
    const audio = createAudioElement(BGM_PATHS[track], true);
    if (!audio) return;
    audio.volume = 0;
    currentTrack = track;
    currentBgm = audio;

    try {
      await audio.play();
      logAudioInfo("bgm-play-success", { track, path: BGM_PATHS[track] });
      void fadeOutAndStop(previousBgm);
      const target = settings.bgmVolume;
      for (let i = 1; i <= 4; i += 1) {
        audio.volume = target * (i / 4);
        await new Promise((resolve) => window.setTimeout(resolve, 55));
      }
      applyBgmVolume();
    } catch (error) {
      logAudioError("bgm-play-failed", {
        track,
        path: BGM_PATHS[track],
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      if (currentBgm === audio) {
        currentBgm = previousBgm;
      }
    }
  }

  return {
    unlock() {
      if (unlocked) return;
      unlocked = true;
      logAudioInfo("audio-unlocked");
      if (pendingTrack) {
        void playBgmNow(pendingTrack);
      }
    },
    setSettings(nextSettings: AudioSettings) {
      settings = normalizeAudioSettings(nextSettings);
      saveAudioSettings(settings);
      logAudioInfo("settings-updated", settings);
      applyBgmVolume();
      if (!settings.bgmEnabled) {
        void fadeOutAndStop(currentBgm);
      } else if (pendingTrack) {
        void playBgmNow(pendingTrack);
      }
    },
    getSettings(): AudioSettings {
      return { ...settings };
    },
    requestBgm(track: BgmTrack) {
      logAudioInfo("bgm-requested", { track, unlocked });
      void playBgmNow(track);
    },
    playSfx(key: SfxKey, throttleMs = 80) {
      if (!unlocked || !settings.sfxEnabled) return;
      const now = performance.now();
      const previous = lastSfxAt.get(key) ?? -Infinity;
      if (now - previous < throttleMs) return;
      lastSfxAt.set(key, now);

      let audio = sfxCache.get(key);
      if (!audio) {
        audio = createAudioElement(SFX_PATHS[key], false) ?? undefined;
        if (!audio) return;
        sfxCache.set(key, audio);
      }

      try {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = settings.sfxVolume;
        void audio.play().then(
          () => logAudioInfo("sfx-play-success", { key, path: SFX_PATHS[key] }),
          (error: unknown) => {
            logAudioError("sfx-play-failed", {
              key,
              path: SFX_PATHS[key],
              errorName: error instanceof Error ? error.name : "UnknownError",
              errorMessage: error instanceof Error ? error.message : String(error),
            });
          },
        );
      } catch (error) {
        logAudioError("sfx-play-threw", {
          key,
          errorName: error instanceof Error ? error.name : "UnknownError",
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}
