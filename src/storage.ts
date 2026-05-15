const ONBOARDING_KEY = "emotion-game.onboarding-complete";
const TUTORIAL_KEY = "emotion-game.tutorial-complete";
export const DAILY_BEST_PREFIX = "emotion_game_daily_best_";

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

export function clearAppStorage(): void {
  try {
    window.localStorage.removeItem(ONBOARDING_KEY);
    window.localStorage.removeItem(TUTORIAL_KEY);

    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(DAILY_BEST_PREFIX)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => {
      window.localStorage.removeItem(key);
    });
  } catch {
    // Ignore storage failures so the app can continue.
  }
}
