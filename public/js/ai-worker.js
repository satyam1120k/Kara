/**
 * KĀRA: AI Web Worker
 * Runs the minimax search off the main thread so the board stays responsive
 * while the computer is thinking (important on slower phones).
 */

import { getBestAIAction } from './ai.js';

self.onmessage = async (event) => {
  const { id, state, difficulty } = event.data;
  try {
    const action = await getBestAIAction(state, difficulty);
    self.postMessage({ id, action });
  } catch (err) {
    self.postMessage({ id, error: err && err.message ? err.message : String(err) });
  }
};
