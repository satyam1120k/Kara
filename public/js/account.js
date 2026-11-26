/**
 * KĀRA: accounts UI — login/sign-up screen, profiles, leaderboard and the
 * "Get the app" popup.
 *
 * All user-written text (names, bios) is inserted with textContent, never as
 * HTML, so it can't inject scripts.
 */

import { api, ApiError, NetworkError } from './api.js';
import { getTitle, TITLES } from './ratings.js';
import { VARIANT_INFO, normalizeVariant } from './engine.js';
import { sounds } from './audio.js';

const $ = (id) => document.getElementById(id);

/** Creates an element: el('span', { className: 'x', text: 'hi' }, [children]). */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null) continue;
    if (k === 'text') node.textContent = v;
    else if (k === 'style') Object.assign(node.style, v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
}

/** Fills an avatar box with the photo, or the first letter of the name. */
export function setAvatar(box, avatarUrl, name, fallback) {
  box.textContent = '';
  box.style.backgroundImage = '';
  box.classList.toggle('has-photo', !!avatarUrl);
  if (avatarUrl) {
    box.style.backgroundImage = `url("${avatarUrl}")`;
  } else {
    box.textContent = fallback ?? (name ? name[0].toUpperCase() : '👤');
  }
}

/** A username coloured by its rating title, e.g. "alice" in Expert blue. */
export function ratedName(username, rating, { link = true, onOpen } = {}) {
  const t = getTitle(rating);
  const node = el(link ? 'button' : 'span', {
    className: 'rated-name' + (t.short === 'LGM' ? ' title-lgm' : ''),
    text: username,
    title: `${t.name} • ${rating}`,
    style: { color: t.color }
  });
  if (link && onOpen) {
    node.type = 'button';
    node.addEventListener('click', (e) => {
      e.stopPropagation();
      onOpen(username);
    });
  }
  return node;
}

export function titleBadge(rating) {
  const t = getTitle(rating);
  return el('span', {
    className: 'title-badge',
    text: t.name,
    style: { color: t.color, borderColor: t.color }
  });
}

/** Crops the image to a centred square and shrinks it to a small JPEG. */
async function resizeImage(file, size = 256) {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error('That file is not an image we can read.');
  const s = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, (bitmap.width - s) / 2, (bitmap.height - s) / 2, s, s, 0, 0, size, size);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
}

function detectPlatform() {
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  return 'desktop';
}

/** True inside the installed Android app (the app adds "KaraApp" to its user agent). */
export function isInsideApp() {
  return /KaraApp/.test(navigator.userAgent) ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
}

export class AccountUI {
  /**
   * callbacks: onLogin(user, activeGameId), onLogout(), onPlayOffline(), onUserChanged(user)
   */
  constructor(callbacks) {
    this.cb = callbacks;
    this.user = null;
    this.mode = 'login';
    this.viewedUsername = null;
    this.installPrompt = null;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.installPrompt = e;
      $('btnInstallPwa').style.display = 'block';
    });

    this.bindAuth();
    this.bindProfile();
    this.bindLeaderboard();
    this.bindApp();

    if (isInsideApp()) document.body.classList.add('in-app');
  }

  /* --------------------------------------------------------------- boot */

  async boot() {
    try {
      const { user, activeGameId } = await api.me();
      this.setUser(user);
      this.hideAuth();
      this.cb.onLogin(user, activeGameId);
    } catch (err) {
      this.showAuth(err instanceof NetworkError);
    }
  }

  setUser(user) {
    const wasLoggedIn = !!this.user;
    this.user = user;
    this.renderRailUser();
    if (user && !wasLoggedIn) this.startPresence();
    if (!user) this.stopPresence();
    if (this.cb.onUserChanged) this.cb.onUserChanged(user);
  }

  /* ------------------------------------------------- presence & live stats */

  /** Heartbeat every minute while the app is open: keeps you "online" and refreshes the counts. */
  startPresence() {
    this.stopPresence();
    const beat = async () => {
      if (document.hidden || !this.user) return;
      try {
        this.renderStats(await api.presence());
      } catch {
        // offline: try again next tick
      }
    };
    beat();
    this.presenceTimer = setInterval(beat, 60000);
    this.onVisible = () => { if (!document.hidden) beat(); };
    document.addEventListener('visibilitychange', this.onVisible);
  }

  stopPresence() {
    clearInterval(this.presenceTimer);
    if (this.onVisible) document.removeEventListener('visibilitychange', this.onVisible);
    this.onVisible = null;
  }

  async loadPublicStats() {
    try {
      this.renderStats(await api.stats());
    } catch {
      // ignore
    }
  }

  /** Fills every .live-stats box: "3 online · 2 playing now · 15 players · 40 games". */
  renderStats(s) {
    if (!s) return;
    this.stats = s;
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    const items = [
      { cls: 'stat-online', text: `${s.online} online` },
      { cls: 'stat-playing', text: `${s.playing} playing now` },
      { cls: 'stat-players', text: plural(s.players, 'player') },
      { cls: 'stat-games', text: `${plural(s.gamesPlayed, 'game')} played` }
    ];
    document.querySelectorAll('.live-stats').forEach(box => {
      box.textContent = '';
      for (const it of items) box.append(el('span', { className: `live-stat ${it.cls}`, text: it.text }));
    });
  }

  async refreshUser() {
    try {
      const { user } = await api.me();
      this.setUser(user);
    } catch {
      // keep the old copy
    }
  }

  renderRailUser() {
    const u = this.user;
    setAvatar($('railUserAvatar'), u && u.avatarUrl, u && u.username, '👤');
    setAvatar($('railProfileIcon'), u && u.avatarUrl, u && u.username, '👤');
    $('railUserName').textContent = u ? u.username : 'Guest';
    const r = $('railUserRating');
    if (u) {
      const t = getTitle(u.rating);
      r.textContent = `${u.rating} · ${t.name}`;
      r.style.color = t.color;
      $('railUserName').style.color = t.color;
    } else {
      r.textContent = 'Offline';
      r.style.color = '';
      $('railUserName').style.color = '';
    }
  }

  /* --------------------------------------------------------------- auth */

  bindAuth() {
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => this.setAuthMode(tab.dataset.mode));
    });
    $('authForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitAuth();
    });
    $('btnPlayOffline').addEventListener('click', () => {
      this.hideAuth();
      this.cb.onPlayOffline();
    });
    $('btnRetryOnline').addEventListener('click', () => this.boot());
  }

  setAuthMode(mode) {
    this.mode = mode;
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
    $('authSubmit').textContent = mode === 'login' ? 'Log in' : 'Create account';
    $('authPassword').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    $('authHint').textContent = mode === 'signup'
      ? 'Username: 3–20 letters, numbers or _. Password: at least 8 characters.'
      : '';
    $('authError').textContent = '';
  }

  showAuth(offline = false) {
    $('authScreen').style.display = 'flex';
    $('authForm').style.display = offline ? 'none' : 'flex';
    document.querySelector('.auth-tabs').style.display = offline ? 'none' : 'flex';
    $('authOffline').style.display = offline ? 'block' : 'none';
    if (!offline) {
      this.loadPublicStats();
      setTimeout(() => $('authUsername').focus(), 50);
    }
  }

  hideAuth() {
    $('authScreen').style.display = 'none';
  }

  async submitAuth() {
    const username = $('authUsername').value.trim();
    const password = $('authPassword').value;
    const errEl = $('authError');
    errEl.textContent = '';
    if (!username || !password) {
      errEl.textContent = 'Enter a username and password.';
      return;
    }
    const btn = $('authSubmit');
    btn.disabled = true;
    try {
      const res = this.mode === 'login'
        ? await api.login(username, password)
        : await api.signup(username, password);
      $('authPassword').value = '';
      this.setUser(res.user);
      this.hideAuth();
      sounds.playSelect();
      this.cb.onLogin(res.user, res.activeGameId);
      this.maybeAutoShowApp();
    } catch (err) {
      errEl.textContent = err.message;
      if (err instanceof NetworkError) this.showAuth(true);
    } finally {
      btn.disabled = false;
    }
  }

  async logout() {
    try {
      await api.logout();
    } catch {
      // logging out locally is enough if the server is unreachable
    }
    this.setUser(null);
    this.closeProfile();
    this.cb.onLogout();
    this.setAuthMode('login');
    this.showAuth(false);
  }

  /* ------------------------------------------------------------ profile */

  bindProfile() {
    $('railUserBtn').addEventListener('click', () => this.user && this.openProfile(this.user.username));
    $('railProfileBtn').addEventListener('click', () => this.user && this.openProfile(this.user.username));
    $('btnCloseProfile').addEventListener('click', () => this.closeProfile());
    $('btnLogout').addEventListener('click', () => this.logout());
    $('btnEditProfile').addEventListener('click', () => this.startEdit());
    $('btnCancelEdit').addEventListener('click', () => this.stopEdit());
    $('btnProfileGetApp').addEventListener('click', () => {
      this.closeProfile();
      this.openAppModal();
    });
    $('profileEditForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveProfile();
    });
    $('editAvatarInput').addEventListener('change', (e) => this.changePhoto(e.target.files[0]));
    $('btnRemoveAvatar').addEventListener('click', () => this.removePhoto());

    document.querySelectorAll('.profile-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.profile-tabs .tab-btn').forEach(b => b.classList.toggle('active', b === btn));
        $('profileRecent').style.display = btn.dataset.ptab === 'recent' ? 'block' : 'none';
        $('profileOpponents').style.display = btn.dataset.ptab === 'opponents' ? 'block' : 'none';
      });
    });
  }

  async openProfile(username) {
    this.viewedUsername = username;
    $('leaderboardModal').style.display = 'none';
    $('profileModal').style.display = 'flex';
    this.stopEdit();
    $('profileRecent').textContent = 'Loading…';
    $('profileOpponents').textContent = '';
    try {
      const data = await api.profile(username);
      if (this.viewedUsername !== username) return;
      this.renderProfile(data);
    } catch (err) {
      $('profileRecent').textContent = err.message;
    }
  }

  closeProfile() {
    $('profileModal').style.display = 'none';
    this.viewedUsername = null;
  }

  renderProfile({ user, recentGames, opponents }) {
    const isMe = this.user && user.username === this.user.username;
    if (isMe) this.setUser(user);
    const t = getTitle(user.rating);

    $('profileTitle').textContent = isMe ? 'Your profile' : 'Player profile';
    setAvatar($('profileAvatar'), user.avatarUrl, user.username);
    $('profileDisplayName').textContent = user.displayName || user.username;
    const uname = $('profileUsername');
    uname.textContent = '@' + user.username;
    uname.style.color = t.color;
    const badge = $('profileTitleBadge');
    badge.textContent = t.name;
    badge.style.color = t.color;
    badge.style.borderColor = t.color;
    $('profileRating').textContent = `Rating ${user.rating}`;
    $('profileBio').textContent = user.bio || (isMe ? 'No bio yet. Tap "Edit profile" to add one.' : '');
    $('statGames').textContent = user.gamesPlayed;
    $('statWins').textContent = user.wins;
    $('statLosses').textContent = user.losses;
    $('statDraws').textContent = user.draws;
    $('statPeak').textContent = user.peakRating;
    $('profileOwnActions').style.display = isMe ? 'flex' : 'none';

    const open = (name) => this.openProfile(name);

    const recent = $('profileRecent');
    recent.textContent = '';
    if (recentGames.length === 0) {
      recent.append(el('p', { className: 'text-muted', text: 'No rated games yet.' }));
    }
    for (const g of recentGames) {
      const delta = g.ratingAfter - g.ratingBefore;
      recent.append(el('div', { className: `game-row outcome-${g.outcome}` }, [
        el('span', { className: 'game-outcome', text: g.outcome === 'win' ? 'W' : g.outcome === 'loss' ? 'L' : 'D' }),
        el('span', { className: 'game-opp' }, [
          el('span', { className: 'text-muted', text: 'vs ' }),
          ratedName(g.opponent, g.opponentRating, { onOpen: open }),
          el('span', { className: 'text-muted', text: ` (${g.opponentRating})` })
        ]),
        el('span', { className: 'game-meta text-muted', text: `${(VARIANT_INFO[normalizeVariant(g.variant)] || {}).name || g.variant} · ${g.moves} moves · ${new Date(g.endedAt).toLocaleDateString()}` }),
        el('span', { className: 'game-delta ' + (delta >= 0 ? 'pos' : 'neg'), text: `${delta >= 0 ? '+' : ''}${delta}` })
      ]));
    }

    const opp = $('profileOpponents');
    opp.textContent = '';
    if (opponents.length === 0) {
      opp.append(el('p', { className: 'text-muted', text: 'No opponents yet.' }));
    }
    for (const o of opponents) {
      opp.append(el('div', { className: 'game-row' }, [
        el('span', { className: 'game-opp' }, [el('button', { className: 'rated-name', type: 'button', text: o.username, onClick: () => open(o.username) })]),
        el('span', { className: 'game-meta text-muted', text: `${o.games} game${o.games === 1 ? '' : 's'}` }),
        el('span', { className: 'game-wld', text: `${o.wins}W ${o.losses}L ${o.draws}D` })
      ]));
    }
  }

  startEdit() {
    const u = this.user;
    $('editDisplayName').value = u.displayName || '';
    $('editBio').value = u.bio || '';
    setAvatar($('editAvatarPreview'), u.avatarUrl, u.username);
    $('profileEditError').textContent = '';
    $('profileEditForm').style.display = 'flex';
    $('profileOwnActions').style.display = 'none';
  }

  stopEdit() {
    $('profileEditForm').style.display = 'none';
    if (this.user && this.viewedUsername === this.user.username) {
      $('profileOwnActions').style.display = 'flex';
    }
  }

  async saveProfile() {
    const btn = $('btnSaveProfile');
    btn.disabled = true;
    try {
      const { user } = await api.updateProfile($('editDisplayName').value, $('editBio').value);
      this.setUser(user);
      this.stopEdit();
      await this.openProfile(user.username);
    } catch (err) {
      $('profileEditError').textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  }

  async changePhoto(file) {
    if (!file) return;
    const errEl = $('profileEditError');
    errEl.textContent = 'Uploading photo…';
    try {
      const blob = await resizeImage(file);
      const { user } = await api.uploadAvatar(blob);
      this.setUser(user);
      setAvatar($('editAvatarPreview'), user.avatarUrl, user.username);
      setAvatar($('profileAvatar'), user.avatarUrl, user.username);
      errEl.textContent = '';
    } catch (err) {
      errEl.textContent = err.message;
    } finally {
      $('editAvatarInput').value = '';
    }
  }

  async removePhoto() {
    try {
      await api.removeAvatar();
      await this.refreshUser();
      setAvatar($('editAvatarPreview'), null, this.user.username);
      setAvatar($('profileAvatar'), null, this.user.username);
    } catch (err) {
      $('profileEditError').textContent = err.message;
    }
  }

  /* --------------------------------------------------------- leaderboard */

  bindLeaderboard() {
    $('railLeaderboardBtn').addEventListener('click', () => this.openLeaderboard());
    $('btnCloseLeaderboard').addEventListener('click', () => {
      $('leaderboardModal').style.display = 'none';
    });

    const legend = $('titleLegend');
    for (const t of TITLES) {
      legend.append(el('span', { className: 'legend-item', style: { color: t.color, borderColor: t.color }, text: `${t.name} ${t.min}+` }));
    }
  }

  async openLeaderboard() {
    if (!this.user) return;
    $('leaderboardModal').style.display = 'flex';
    const body = $('leaderboardBody');
    body.textContent = '';
    try {
      const { players } = await api.leaderboard();
      $('leaderboardEmpty').style.display = players.length ? 'none' : 'block';
      players.forEach((p, i) => {
        const me = this.user && p.username === this.user.username;
        const avatar = el('span', { className: 'lb-avatar' });
        setAvatar(avatar, p.avatarUrl, p.username);
        body.append(el('tr', { className: me ? 'lb-me' : '' }, [
          el('td', { text: String(i + 1) }),
          el('td', { className: 'lb-player' }, [avatar, ratedName(p.username, p.rating, { onOpen: (n) => this.openProfile(n) }), titleBadge(p.rating)]),
          el('td', { className: 'lb-rating', text: String(p.rating) }),
          el('td', { text: String(p.gamesPlayed) })
        ]));
      });
    } catch (err) {
      body.append(el('tr', {}, [el('td', { colSpan: 4, text: err.message })]));
    }
  }

  /* ---------------------------------------------------------------- app */

  bindApp() {
    $('railAppBtn').addEventListener('click', () => this.openAppModal());
    $('btnCloseApp').addEventListener('click', () => {
      $('appModal').style.display = 'none';
    });
    $('btnInstallPwa').addEventListener('click', async () => {
      if (!this.installPrompt) return;
      this.installPrompt.prompt();
      await this.installPrompt.userChoice.catch(() => null);
      this.installPrompt = null;
      $('btnInstallPwa').style.display = 'none';
    });
  }

  openAppModal() {
    const platform = detectPlatform();
    document.querySelectorAll('#appModal .app-section').forEach(s => {
      s.style.display = s.dataset.platform === platform ? 'block' : 'none';
    });
    $('appModal').style.display = 'flex';
  }

  /** On Android browsers (not the app), offer the APK once. */
  maybeAutoShowApp() {
    if (isInsideApp() || detectPlatform() !== 'android') return;
    try {
      if (localStorage.getItem('kara.appPromptShown')) return;
      localStorage.setItem('kara.appPromptShown', '1');
    } catch {
      return;
    }
    setTimeout(() => this.openAppModal(), 800);
  }
}

export { ApiError, NetworkError };
