const STORAGE_KEY = "sanmao-state";

export function loadState(fallbackState) {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return fallbackState;
    }

    return {
      ...fallbackState,
      ...JSON.parse(raw)
    };
  } catch {
    return fallbackState;
  }
}

export function saveState(state) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
