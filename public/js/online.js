/**
 * KĀRA: online play — matchmaking, invite links and the live game connection.
 *
 * The server (GameRoom) is the referee. This class only forwards moves and
 * passes server messages to the UI through callbacks.
 */

import { api, wsUrl } from './api.js';
import { VARIANT_INFO } from './engine.js';

const $ = (id) => document.getElementById(id);

export class OnlineController {
  /**
   * ui must implement:
   *   onOnlineState(msg)    full game state (join / reconnect / resync)
   *   onOnlineMove(msg)     a move was played
   *   onOnlineGameOver(msg) game finished
   *   onOnlineDrawOffer(by), onOnlineDrawDeclined(by), onOnlineError(text)
   *   onOnlineConnection(status)  'connecting' | 'connected' | 'reconnecting'
   */
  constructor(ui) {
    this.ui = ui;
    this.lobbyWs = null;
    this.gameWs = null;
    this.gameId = null;
    this.retry = 0;
    this.retryTimer = null;
    this.pingTimer = null;
    this.searchStartedAt = 0;
    this.searchTimer = null;
    this.over = false;

    $('btnCancelSearch').addEventListener('click', () => this.cancelSearch());
    $('btnCloseInvite').addEventListener('click', () => this.cancelInvite());
    $('btnCopyInvite').addEventListener('click', () => this.copyInvite());
    $('btnShareInvite').addEventListener('click', () => this.shareInvite());
    if (navigator.share) $('btnShareInvite').style.display = 'inline-flex';
  }

  get inGame() {
    return !!this.gameId;
  }

  /* ---------------------------------------------------------- matchmaking */

  search(variant) {
    this.cancelSearch();
    this.searchStartedAt = Date.now();
    $('searchModal').style.display = 'flex';
    const name = (VARIANT_INFO[variant] || {}).name || variant;
    const tick = () => {
      const s = Math.floor((Date.now() - this.searchStartedAt) / 1000);
      $('searchInfo').textContent = `${name} • 10 min • Rated • ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };
    tick();
    this.searchTimer = setInterval(tick, 1000);

    const ws = new WebSocket(wsUrl(`/ws/lobby?variant=${encodeURIComponent(variant)}`));
    this.lobbyWs = ws;
    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.type === 'matched') {
        this.lobbyWs = null;
        this.hideSearch();
        this.join(msg.gameId);
      }
    };
    ws.onclose = (e) => {
      if (this.lobbyWs !== ws) return;
      this.lobbyWs = null;
      this.hideSearch();
      this.ui.onOnlineError(e.code === 4000 ? 'Search moved to another tab.' : 'Could not search for a game. Check your connection.');
    };
  }

  cancelSearch() {
    if (this.lobbyWs) {
      const ws = this.lobbyWs;
      this.lobbyWs = null;
      try { ws.close(1000, 'cancel'); } catch { /* closed */ }
    }
    this.hideSearch();
  }

  hideSearch() {
    clearInterval(this.searchTimer);
    $('searchModal').style.display = 'none';
  }

  /* -------------------------------------------------------------- invites */

  async invite(variant) {
    try {
      const { gameId } = await api.createInvite(variant);
      $('inviteLink').value = `${location.origin}/?game=${gameId}`;
      $('inviteModal').style.display = 'flex';
      this.join(gameId);
    } catch (err) {
      this.ui.onOnlineError(err.message);
    }
  }

  async copyInvite() {
    const input = $('inviteLink');
    try {
      await navigator.clipboard.writeText(input.value);
    } catch {
      input.select();
      document.execCommand('copy');
    }
    $('btnCopyInvite').textContent = 'Copied!';
    setTimeout(() => { $('btnCopyInvite').textContent = 'Copy'; }, 1500);
  }

  shareInvite() {
    navigator.share({ title: 'Play KĀRA with me', url: $('inviteLink').value }).catch(() => {});
  }

  cancelInvite() {
    $('inviteModal').style.display = 'none';
    this.leave();
    this.ui.onOnlineLeft();
  }

  /* ----------------------------------------------------------- game room */

  join(gameId) {
    this.leave();
    this.gameId = gameId;
    this.over = false;
    this.retry = 0;
    this.connect();
  }

  connect() {
    const gameId = this.gameId;
    this.ui.onOnlineConnection(this.retry ? 'reconnecting' : 'connecting');
    const ws = new WebSocket(wsUrl(`/ws/game/${gameId}`));
    this.gameWs = ws;

    ws.onopen = () => {
      this.retry = 0;
      this.ui.onOnlineConnection('connected');
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.send({ type: 'ping' }), 25000);
    };
    ws.onmessage = (e) => {
      if (this.gameWs !== ws) return;
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      switch (msg.type) {
        case 'state':
          if (msg.game.status !== 'WAITING') $('inviteModal').style.display = 'none';
          if (msg.game.status === 'OVER') this.over = true;
          this.ui.onOnlineState(msg);
          break;
        case 'move': this.ui.onOnlineMove(msg); break;
        case 'game_over':
          this.over = true;
          this.ui.onOnlineGameOver(msg);
          break;
        case 'draw_offer': this.ui.onOnlineDrawOffer(msg.by); break;
        case 'draw_declined': this.ui.onOnlineDrawDeclined(msg.by); break;
        case 'error': this.ui.onOnlineError(msg.message); break;
      }
    };
    ws.onclose = () => {
      if (this.gameWs !== ws) return;
      this.gameWs = null;
      clearInterval(this.pingTimer);
      if (this.over || this.gameId !== gameId) return;
      // Reconnect with backoff (phone switched networks, app was backgrounded, …)
      this.retry++;
      this.ui.onOnlineConnection('reconnecting');
      const delay = Math.min(10000, 500 * 2 ** Math.min(this.retry, 5));
      this.retryTimer = setTimeout(() => {
        if (this.gameId === gameId) this.connect();
      }, delay);
    };
  }

  send(msg) {
    if (this.gameWs && this.gameWs.readyState === WebSocket.OPEN) {
      this.gameWs.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  sendMove(action) {
    const { from, to, type, promote } = action;
    return this.send({ type: 'move', action: { action: 'MOVE', from, to, type, promote: !!promote } });
  }

  resign() { this.send({ type: 'resign' }); }
  offerDraw() { this.send({ type: 'draw_offer' }); }
  acceptDraw() { this.send({ type: 'draw_accept' }); }
  declineDraw() { this.send({ type: 'draw_decline' }); }
  resync() { this.send({ type: 'sync' }); }

  /** Disconnects from the current game (the game itself continues on the server). */
  leave() {
    clearTimeout(this.retryTimer);
    clearInterval(this.pingTimer);
    const ws = this.gameWs;
    this.gameWs = null;
    this.gameId = null;
    if (ws) {
      try { ws.close(1000, 'leave'); } catch { /* closed */ }
    }
  }

  /** Reconnect quickly when the app comes back to the foreground. */
  wake() {
    if (this.gameId && !this.gameWs && !this.over) {
      clearTimeout(this.retryTimer);
      this.connect();
    } else if (this.gameWs) {
      this.resync();
    }
  }
}
