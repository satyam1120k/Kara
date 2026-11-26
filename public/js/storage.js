/**
 * KĀRA: Game Save / Resume
 * Persists the current game to localStorage so it survives the phone closing
 * the tab, switching apps, or reloading.
 *
 * Only the list of moves is stored; the state is rebuilt by replaying them.
 * That keeps saves tiny and guarantees a restored game is always legal.
 */

import { normalizeVariant } from './engine.js';
import { replayActions } from './rules.js';

const SAVE_KEY = 'kara.savedGame.v1';
const PREFS_KEY = 'kara.prefs.v1';

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or disabled (e.g. some private-browsing modes): ignore.
  }
}

export function saveGame(snapshot) {
  writeJSON(SAVE_KEY, {
    variant: snapshot.state.variant,
    actions: snapshot.state.history.map(h => h.action),
    gameMode: snapshot.gameMode,
    aiDifficulty: snapshot.aiDifficulty,
    timers: snapshot.timers,
    gameStarted: snapshot.gameStarted,
    savedAt: Date.now()
  });
}

/**
 * Returns { state, gameMode, aiDifficulty, timers, gameStarted } or null if
 * there is no resumable game (none saved, finished, or corrupt).
 */
export function loadGame() {
  const data = readJSON(SAVE_KEY);
  if (!data || !normalizeVariant(data.variant) || !Array.isArray(data.actions)) {
    return null;
  }
  try {
    const state = replayActions(normalizeVariant(data.variant), data.actions);
    if (state.phase !== 'PLAY') return null;
    return {
      state,
      gameMode: data.gameMode,
      aiDifficulty: data.aiDifficulty,
      timers: data.timers,
      gameStarted: !!data.gameStarted
    };
  } catch (err) {
    console.warn('Saved game could not be restored:', err);
    clearSavedGame();
    return null;
  }
}

export function clearSavedGame() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

export function loadPrefs() {
  return readJSON(PREFS_KEY) || {};
}

export function savePrefs(prefs) {
  writeJSON(PREFS_KEY, { ...loadPrefs(), ...prefs });
}
