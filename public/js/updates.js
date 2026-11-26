/**
 * KĀRA: update notifications.
 *
 * Every deploy writes /version.json. This module compares it with what is
 * running and shows a banner:
 *   - "New version of KĀRA" (game code changed)  -> Update = reload the page
 *   - "App update available" (newer APK, only inside the Android app)
 *                                                -> Download opens the APK in the browser
 *
 * Checks on start, every 5 minutes, and whenever the app comes back to the
 * foreground.
 */

const CHECK_EVERY_MS = 5 * 60 * 1000;
const RUNNING_BUILD = document.querySelector('meta[name="kara-build"]')?.content || null;

function $(id) {
  return document.getElementById(id);
}

/** The installed app's build number, or null when not running inside the app. */
async function getAppBuild() {
  const ua = navigator.userAgent;
  if (!/KaraApp\//.test(ua)) return null;
  const App = window.Capacitor?.Plugins?.App;
  if (App?.getInfo) {
    try {
      const info = await App.getInfo();
      const n = Number(info.build);
      if (n) return n;
    } catch {
      // fall through to the user agent
    }
  }
  const m = ua.match(/KaraBuild\/(\d+)/);
  return m ? Number(m[1]) : 1; // the first release (1.0) did not report its build
}

/** Opens a URL in the phone's browser (the in-app view can't download files). */
async function openInBrowser(url) {
  const Browser = window.Capacitor?.Plugins?.Browser;
  if (Browser?.open) {
    await Browser.open({ url });
    return true;
  }
  return false;
}

export class UpdateChecker {
  constructor() {
    this.dismissedWeb = null;
    this.dismissedApk = null;
    this.latest = null;
    this.banner = $('updateBanner');
    $('btnUpdateClose').addEventListener('click', () => this.dismiss());
    $('btnUpdateAction').addEventListener('click', () => this.act());
  }

  start() {
    this.check();
    setInterval(() => this.check(), CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.check();
    });
  }

  async check() {
    if (!navigator.onLine) return;
    let latest;
    try {
      const res = await fetch('/version.json', { cache: 'no-store' });
      if (!res.ok) return;
      latest = await res.json();
    } catch {
      return;
    }
    this.latest = latest;

    // 1. Newer APK? (only matters inside the installed app)
    const appBuild = await getAppBuild();
    if (appBuild !== null && latest.apk && latest.apk.versionCode > appBuild &&
        this.dismissedApk !== latest.apk.versionCode) {
      this.show('apk', `App update available: v${latest.apk.versionName}` + (latest.notes ? ` • ${latest.notes}` : ''), 'Download');
      return;
    }

    // 2. Newer game code?
    if (RUNNING_BUILD && latest.web && latest.web !== RUNNING_BUILD && this.dismissedWeb !== latest.web) {
      this.show('web', 'A new version of KĀRA is ready.' + (latest.notes ? ` ${latest.notes}` : ''), 'Update now');
    }
  }

  show(kind, text, actionLabel) {
    this.kind = kind;
    $('updateText').textContent = text;
    $('btnUpdateAction').textContent = actionLabel;
    this.banner.style.display = 'flex';
  }

  hide() {
    this.banner.style.display = 'none';
  }

  dismiss() {
    if (this.kind === 'apk') this.dismissedApk = this.latest?.apk?.versionCode;
    else this.dismissedWeb = this.latest?.web;
    this.hide();
  }

  async act() {
    if (this.kind === 'web') {
      // Make the service worker pick up the new files, then reload.
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        await reg?.update();
      } catch {
        // reload anyway
      }
      location.reload();
      return;
    }

    const url = new URL(this.latest.apk.url, location.origin).href;
    if (await openInBrowser(url)) {
      this.hide();
      return;
    }
    // Very first app version has no browser plugin: copy the link instead.
    try {
      await navigator.clipboard.writeText(url);
      $('updateText').textContent = 'Link copied. Paste it into Chrome to download the update.';
    } catch {
      $('updateText').textContent = `Open this in Chrome to update: ${url}`;
    }
    $('btnUpdateAction').style.display = 'none';
  }
}
