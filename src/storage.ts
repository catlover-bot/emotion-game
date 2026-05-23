import type { ControlMode, ExpressionSensitivity } from "./types";
import { clearGameProgress } from "./achievements";
import { clearPendingGameServiceEvents } from "./gameCenter";
import { clearAudioSettings } from "./audio";

const ONBOARDING_KEY = "emotion-game.onboarding-complete";
const TUTORIAL_KEY = "emotion-game.tutorial-complete";
const CONTROL_MODE_KEY = "emotion-game.control-mode";
const EXPRESSION_SENSITIVITY_KEY = "emotion-game.expression-sensitivity";
export const DAILY_BEST_PREFIX = "emotion_game_daily_best_";
export const DAILY_MISSION_PREFIX = "emotion_game_daily_mission_reward_";

function loadFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function saveFlag(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? "true" : "false");
  } catch {
    // Ignore storage failures so the game still works in private browsing.
  }
}

export function loadOnboardingComplete(): boolean {
  return loadFlag(ONBOARDING_KEY);
}

export function saveOnboardingComplete(value: boolean): void {
  saveFlag(ONBOARDING_KEY, value);
}

export function loadTutorialComplete(): boolean {
  return loadFlag(TUTORIAL_KEY);
}

export function saveTutorialComplete(value: boolean): void {
  saveFlag(TUTORIAL_KEY, value);
}

export function resetTutorialComplete(): void {
  saveFlag(TUTORIAL_KEY, false);
}

export function loadControlMode(): ControlMode {
  try {
    return window.localStorage.getItem(CONTROL_MODE_KEY) === "expression" ? "expression" : "tap";
  } catch {
    return "tap";
  }
}

export function saveControlMode(value: ControlMode): void {
  try {
    window.localStorage.setItem(CONTROL_MODE_KEY, value);
  } catch {
    // Ignore storage failures so the game still works in private browsing.
  }
}

export function loadExpressionSensitivity(): ExpressionSensitivity {
  try {
    const value = window.localStorage.getItem(EXPRESSION_SENSITIVITY_KEY);
    if (value === "normal" || value === "high") return value;
    return "gentle";
  } catch {
    return "gentle";
  }
}

export function saveExpressionSensitivity(value: ExpressionSensitivity): void {
  try {
    window.localStorage.setItem(EXPRESSION_SENSITIVITY_KEY, value);
  } catch {
    // Ignore storage failures so the game still works in private browsing.
  }
}

export function clearAppStorage(): void {
  try {
    window.localStorage.removeItem(ONBOARDING_KEY);
    window.localStorage.removeItem(TUTORIAL_KEY);
    window.localStorage.removeItem(CONTROL_MODE_KEY);
    window.localStorage.removeItem(EXPRESSION_SENSITIVITY_KEY);
    window.localStorage.removeItem("emotion_game_all_time_max_combo");

    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(DAILY_BEST_PREFIX) || key?.startsWith(DAILY_MISSION_PREFIX)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => {
      window.localStorage.removeItem(key);
    });

    clearGameProgress();
    clearPendingGameServiceEvents();
    clearAudioSettings();
  } catch {
    // Ignore storage failures so the app can continue.
  }
}
