/**
 * KĀRA: Application Entry Point & Bootstrap
 */

import { KaraUI } from './ui.js';
import { UpdateChecker } from './updates.js';

window.addEventListener('DOMContentLoaded', () => {
  window.karaApp = new KaraUI();
  // Tells players when a new version of the game (or of the Android app) is out.
  new UpdateChecker().start();
});

// Offline support + installable app. Service workers need http(s)
// (localhost counts as secure), so skip when opened as a plain file.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('Service worker registration failed:', err);
    });
  });
}
