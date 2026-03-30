const STORAGE_KEY = "sanmao-state";

function pickStoredState(parsed, fallbackState) {
  return {
    ...fallbackState,
    ui: {
      ...fallbackState.ui,
      activeTab: parsed?.ui?.activeTab ?? fallbackState.ui.activeTab,
      activeMatchId: parsed?.ui?.activeMatchId ?? fallbackState.ui.activeMatchId
    },
    local: {
      ...fallbackState.local,
      viewedCount:
        typeof parsed?.local?.viewedCount === "number"
          ? parsed.local.viewedCount
          : fallbackState.local.viewedCount,
      skippedIds: Array.isArray(parsed?.local?.skippedIds)
        ? parsed.local.skippedIds
        : fallbackState.local.skippedIds
    },
    draftMessage:
      typeof parsed?.draftMessage === "string"
        ? parsed.draftMessage
        : fallbackState.draftMessage
  };
}

export function loadState(fallbackState) {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return fallbackState;
    }

    return pickStoredState(JSON.parse(raw), fallbackState);
  } catch {
    return fallbackState;
  }
}

export function saveState(state) {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ui: {
        activeTab: state.ui.activeTab,
        activeMatchId: state.ui.activeMatchId
      },
      local: {
        viewedCount: state.local.viewedCount,
        skippedIds: state.local.skippedIds
      },
      draftMessage: state.draftMessage
    })
  );
}
