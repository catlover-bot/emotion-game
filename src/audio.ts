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

export type AudioSourceKind = "unchecked" | "file" | "procedural" | "disabled";

export type AudioRuntimeStatus = {
  unlocked: boolean;
  contextState: AudioContextState | "unsupported";
  bgmSource: AudioSourceKind;
  sfxSource: AudioSourceKind;
  currentTrack: BgmTrack | null;
  lastMessage: string;
};

export type AudioTestResult = AudioRuntimeStatus & {
  ok: boolean;
  message: string;
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

const SFX_TONES: Record<SfxKey, { frequency: number; duration: number; type: OscillatorType }> = {
  confirm: { frequency: 660, duration: 0.09, type: "sine" },
  back: { frequency: 260, duration: 0.1, type: "triangle" },
  jump: { frequency: 780, duration: 0.11, type: "sine" },
  attack: { frequency: 170, duration: 0.12, type: "square" },
  boost: { frequency: 980, duration: 0.14, type: "sawtooth" },
  feverStart: { frequency: 880, duration: 0.28, type: "triangle" },
  gachaReveal: { frequency: 740, duration: 0.2, type: "sine" },
  missionClear: { frequency: 620, duration: 0.22, type: "triangle" },
  achievement: { frequency: 920, duration: 0.24, type: "sine" },
  resultFanfare: { frequency: 520, duration: 0.35, type: "triangle" },
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

function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof AudioContext !== "undefined") return AudioContext;
  const webkitAudioContext = (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return webkitAudioContext ?? null;
}

function waitForHtmlAudio(audio: HTMLAudioElement, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("error", onError);
      window.clearTimeout(timer);
    };
    const finish = (ok: boolean, error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (ok) resolve();
      else reject(error ?? new Error("音声ファイルを再生できませんでした。"));
    };
    const onPlaying = () => finish(true);
    const onError = () => finish(false, new Error("音声ファイルが見つからないか、読み込めません。"));
    const timer = window.setTimeout(() => finish(false, new Error("音声ファイルの再生がタイムアウトしました。")), timeoutMs);

    audio.addEventListener("playing", onPlaying, { once: true });
    audio.addEventListener("error", onError, { once: true });
    void audio.play().then(() => finish(true), (error: unknown) => {
      finish(false, error instanceof Error ? error : new Error(String(error)));
    });
  });
}

export function createAudioManager(initialSettings: AudioSettings) {
  let settings = normalizeAudioSettings(initialSettings);
  let unlocked = false;
  let currentTrack: BgmTrack | null = null;
  let currentBgm: HTMLAudioElement | null = null;
  let pendingTrack: BgmTrack | null = null;
  let audioContext: AudioContext | null = null;
  let proceduralGain: GainNode | null = null;
  let proceduralTimer: number | null = null;
  let bgmSource: AudioSourceKind = "unchecked";
  let sfxSource: AudioSourceKind = "unchecked";
  let lastMessage = "音声はまだ確認されていません。";
  const sfxCache = new Map<SfxKey, HTMLAudioElement>();
  const lastSfxAt = new Map<SfxKey, number>();

  function getContextState(): AudioContextState | "unsupported" {
    return audioContext?.state ?? (getAudioContextConstructor() ? "suspended" : "unsupported");
  }

  function getStatus(): AudioRuntimeStatus {
    return {
      unlocked,
      contextState: getContextState(),
      bgmSource,
      sfxSource,
      currentTrack,
      lastMessage,
    };
  }

  function setMessage(message: string) {
    lastMessage = message;
    logAudioInfo("status", getStatus());
  }

  function ensureAudioContext(): AudioContext | null {
    if (audioContext) return audioContext;
    const AudioContextConstructor = getAudioContextConstructor();
    if (!AudioContextConstructor) {
      logAudioError("web-audio-unsupported");
      return null;
    }
    audioContext = new AudioContextConstructor();
    logAudioInfo("audio-context-created", { state: audioContext.state });
    return audioContext;
  }

  async function resumeAudioContext(): Promise<boolean> {
    const context = ensureAudioContext();
    if (!context) return false;
    if (context.state === "suspended") {
      try {
        await context.resume();
      } catch (error) {
        logAudioError("audio-context-resume-failed", {
          errorName: error instanceof Error ? error.name : "UnknownError",
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    }
    logAudioInfo("audio-context-state", { state: context.state });
    return context.state === "running";
  }

  function applyBgmVolume() {
    const volume = settings.bgmEnabled ? settings.bgmVolume : 0;
    if (currentBgm) {
      currentBgm.volume = volume;
    }
    if (proceduralGain) {
      proceduralGain.gain.setTargetAtTime(volume * 0.11, audioContext?.currentTime ?? 0, 0.04);
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

  function stopProceduralBgm() {
    if (proceduralTimer !== null) {
      window.clearInterval(proceduralTimer);
      proceduralTimer = null;
    }
    proceduralGain?.disconnect();
    proceduralGain = null;
  }

  function playProceduralTone(frequency: number, duration: number, type: OscillatorType, volume: number) {
    const context = ensureAudioContext();
    if (!context || context.state !== "running") return false;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
    return true;
  }

  function startProceduralBgm(track: BgmTrack) {
    const context = ensureAudioContext();
    if (!context || context.state !== "running") {
      setMessage("内蔵テスト音源を準備できませんでした。iPhoneの消音モードや音量も確認してください。");
      return false;
    }

    stopProceduralBgm();
    void fadeOutAndStop(currentBgm);
    currentBgm = null;
    currentTrack = track;
    bgmSource = "procedural";

    const patterns: Record<BgmTrack, number[]> = {
      title: [392, 494, 587, 494],
      gameplay: [330, 392, 494, 659],
      result: [523, 659, 784, 659],
      gacha: [440, 554, 659, 880],
      customize: [349, 440, 523, 440],
    };
    const notes = patterns[track];
    let index = 0;
    proceduralGain = context.createGain();
    proceduralGain.gain.value = settings.bgmEnabled ? settings.bgmVolume * 0.11 : 0;
    proceduralGain.connect(context.destination);

    const tick = () => {
      if (!proceduralGain || !settings.bgmEnabled) return;
      const oscillator = context.createOscillator();
      const noteGain = context.createGain();
      const now = context.currentTime;
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(notes[index % notes.length] ?? 440, now);
      noteGain.gain.setValueAtTime(0.0001, now);
      noteGain.gain.exponentialRampToValueAtTime(0.2, now + 0.025);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
      oscillator.connect(noteGain).connect(proceduralGain);
      oscillator.start(now);
      oscillator.stop(now + 0.26);
      index += 1;
    };

    tick();
    proceduralTimer = window.setInterval(tick, track === "gameplay" ? 260 : 360);
    setMessage("内蔵テスト音源を使用中です。iPhoneの消音モードや音量も確認してください。");
    logAudioInfo("procedural-bgm-started", { track, contextState: context.state });
    return true;
  }

  async function playBgmNow(track: BgmTrack) {
    pendingTrack = track;
    if (!settings.bgmEnabled) {
      stopProceduralBgm();
      await fadeOutAndStop(currentBgm);
      currentTrack = track;
      bgmSource = "disabled";
      setMessage("BGMはオフです。");
      return;
    }

    if (!unlocked) {
      logAudioInfo("bgm-deferred-until-unlock", { track, iOSGestureUnlocked: unlocked });
      return;
    }

    if (currentTrack === track && (currentBgm && !currentBgm.paused || bgmSource === "procedural")) {
      applyBgmVolume();
      return;
    }

    const previousBgm = currentBgm;
    const audio = createAudioElement(BGM_PATHS[track], true);
    if (!audio) {
      startProceduralBgm(track);
      return;
    }

    audio.volume = 0;
    currentTrack = track;
    currentBgm = audio;

    try {
      await waitForHtmlAudio(audio, 1400);
      stopProceduralBgm();
      bgmSource = "file";
      logAudioInfo("bgm-play-success", { track, path: BGM_PATHS[track] });
      void fadeOutAndStop(previousBgm);
      const target = settings.bgmVolume;
      for (let i = 1; i <= 4; i += 1) {
        audio.volume = target * (i / 4);
        await new Promise((resolve) => window.setTimeout(resolve, 55));
      }
      applyBgmVolume();
      setMessage("音声ファイルを使用中です。");
    } catch (error) {
      logAudioError("bgm-file-fallback", {
        track,
        path: BGM_PATHS[track],
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      if (currentBgm === audio) {
        currentBgm = previousBgm;
      }
      startProceduralBgm(track);
    }
  }

  function playProceduralSfx(key: SfxKey) {
    const tone = SFX_TONES[key];
    const ok = playProceduralTone(tone.frequency, tone.duration, tone.type, settings.sfxVolume * 0.12);
    if (ok) {
      sfxSource = "procedural";
      setMessage("内蔵テスト音源を使用中です。");
      logAudioInfo("procedural-sfx-played", { key, contextState: getContextState() });
    }
    return ok;
  }

  async function playSfxOnce(key: SfxKey, throttleMs = 80): Promise<AudioSourceKind> {
    if (!unlocked || !settings.sfxEnabled) return "disabled";
    const now = performance.now();
    const previous = lastSfxAt.get(key) ?? -Infinity;
    if (now - previous < throttleMs) return sfxSource;
    lastSfxAt.set(key, now);

    let audio = sfxCache.get(key);
    if (!audio) {
      audio = createAudioElement(SFX_PATHS[key], false) ?? undefined;
      if (audio) sfxCache.set(key, audio);
    }

    if (!audio) {
      return playProceduralSfx(key) ? "procedural" : "unchecked";
    }

    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = settings.sfxVolume;
      await waitForHtmlAudio(audio, 700);
      sfxSource = "file";
      setMessage("音声ファイルを使用中です。");
      logAudioInfo("sfx-play-success", { key, path: SFX_PATHS[key] });
      return "file";
    } catch (error) {
      logAudioError("sfx-file-fallback", {
        key,
        path: SFX_PATHS[key],
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return playProceduralSfx(key) ? "procedural" : "unchecked";
    }
  }

  function playSfx(key: SfxKey, throttleMs = 80) {
    void playSfxOnce(key, throttleMs);
  }

  async function unlock(): Promise<AudioRuntimeStatus> {
    logAudioInfo("unlock-requested", { unlocked, contextState: getContextState() });
    unlocked = true;
    const contextReady = await resumeAudioContext();
    logAudioInfo(contextReady ? "unlock-success" : "unlock-partial", {
      contextState: getContextState(),
      iOSGestureUnlocked: unlocked,
    });
    if (pendingTrack) {
      void playBgmNow(pendingTrack);
    }
    return getStatus();
  }

  return {
    unlock,
    setSettings(nextSettings: AudioSettings) {
      settings = normalizeAudioSettings(nextSettings);
      saveAudioSettings(settings);
      logAudioInfo("settings-updated", {
        settings,
        contextState: getContextState(),
        iOSGestureUnlocked: unlocked,
      });
      applyBgmVolume();
      if (!settings.bgmEnabled) {
        stopProceduralBgm();
        void fadeOutAndStop(currentBgm);
        bgmSource = "disabled";
      } else if (pendingTrack) {
        void playBgmNow(pendingTrack);
      }
    },
    getSettings(): AudioSettings {
      return { ...settings };
    },
    getStatus,
    requestBgm(track: BgmTrack) {
      logAudioInfo("bgm-requested", { track, unlocked, contextState: getContextState() });
      void playBgmNow(track);
    },
    async testBgm(track: BgmTrack = pendingTrack ?? "title"): Promise<AudioTestResult> {
      await unlock();
      await playBgmNow(track);
      const status = getStatus();
      const ok = status.bgmSource === "file" || status.bgmSource === "procedural";
      const message = ok
        ? `${status.bgmSource === "file" ? "音声ファイル" : "内蔵テスト音源"}でBGMを再生しました。iPhoneの消音モードや音量も確認してください。`
        : "BGMの再生に失敗しました。iPhoneの消音モードや音量も確認してください。";
      setMessage(message);
      return { ...status, ok, message };
    },
    async testSfx(key: SfxKey = "confirm"): Promise<AudioTestResult> {
      await unlock();
      await playSfxOnce(key, 0);
      const status = getStatus();
      const ok = status.sfxSource === "file" || status.sfxSource === "procedural";
      const message = ok
        ? `${status.sfxSource === "file" ? "音声ファイル" : "内蔵テスト音源"}で効果音を再生しました。`
        : "効果音の再生に失敗しました。iPhoneの消音モードや音量も確認してください。";
      setMessage(message);
      return { ...status, ok, message };
    },
    playSfx,
  };
}
