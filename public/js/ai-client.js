/**
 * KĀRA: AI Client
 * Sends AI requests to a background Web Worker. If workers are unavailable
 * (very old browser, or the page was opened from file://), it falls back to
 * running the search on the main thread so the game still works.
 */

import { getBestAIAction } from './ai.js';

let worker = null;
let workerBroken = false;
let nextRequestId = 1;
const pending = new Map();

function runOnMainThread(state, difficulty) {
  return getBestAIAction(state, difficulty);
}

function failAllPendingToMainThread() {
  for (const req of pending.values()) {
    runOnMainThread(req.state, req.difficulty).then(req.resolve, req.reject);
  }
  pending.clear();
}

function getWorker() {
  if (workerBroken || typeof Worker === 'undefined') return null;
  if (worker) return worker;

  try {
    worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
  } catch (err) {
    console.warn('AI worker unavailable, using main thread:', err);
    workerBroken = true;
    return null;
  }

  worker.onmessage = (event) => {
    const { id, action, error } = event.data;
    const req = pending.get(id);
    if (!req) return;
    pending.delete(id);
    if (error) req.reject(new Error(error));
    else req.resolve(action);
  };

  // Fires if the worker script fails to load or crashes.
  worker.onerror = (event) => {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    console.warn('AI worker failed, using main thread:', event && event.message);
    workerBroken = true;
    worker.terminate();
    worker = null;
    failAllPendingToMainThread();
  };

  return worker;
}

/**
 * Asks the AI for its best action in the given state.
 * Resolves with an action object (plain data) or null.
 */
export function requestAIAction(state, difficulty) {
  // Move history is not needed for the search; dropping it keeps the
  // message small as games get long.
  const slimState = { ...state, history: [] };

  const w = getWorker();
  if (!w) return runOnMainThread(slimState, difficulty);

  return new Promise((resolve, reject) => {
    const id = nextRequestId++;
    pending.set(id, { resolve, reject, state: slimState, difficulty });
    w.postMessage({ id, state: slimState, difficulty });
  });
}
