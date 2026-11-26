/**
 * GameRoom Durable Object: one instance per online game.
 *
 * The server is the referee. It runs the same rules engine as the browser,
 * so every move is checked here and illegal moves are rejected. It also owns
 * the clocks, resignations, draw offers, and writes the rated result to D1.
 *
 * Uses the WebSocket Hibernation API, so an idle game costs nothing.
 */

import { DurableObject } from 'cloudflare:workers';
import { createInitialGameState, getAllLegalActions, applyAction } from '../public/js/rules.js';
import { SIDES } from '../public/js/engine.js';
import { computeElo } from '../public/js/ratings.js';

const START_CLOCK_MS = 10 * 60 * 1000; // 10 minutes each
const FIRST_MOVE_MS = 60 * 1000;       // each side must make its first move within 60s or the game is aborted

const other = (side) => (side === SIDES.DAWN ? SIDES.DUSK : SIDES.DAWN);

function sameAction(a, b) {
  return a.action === 'MOVE' && b &&
    a.from.f === b.from?.f && a.from.r === b.from?.r &&
    a.to.f === b.to?.f && a.to.r === b.to?.r &&
    a.type === b.type && !!a.promote === !!b.promote;
}

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.game = null;
    ctx.blockConcurrencyWhile(async () => {
      this.game = (await ctx.storage.get('game')) || null;
    });
  }

  async save() {
    await this.ctx.storage.put('game', this.game);
  }

  /* ------------------------------------------------------------------ RPC */

  /**
   * Creates the game.
   *  - Matchmaking: { variant, players: [p1, p2] } -> starts immediately.
   *  - Invite link: { variant, host: p } -> waits for someone to join.
   * A player is { id, username, rating, avatarUrl }.
   */
  async init({ id, variant, players, host }) {
    if (this.game) return;
    this.game = {
      id,
      variant,
      status: 'WAITING', // WAITING -> ACTIVE -> OVER
      host: host || null,
      players: { DAWN: null, DUSK: null },
      rules: null,
      actions: [],
      notations: [],
      clocks: { DAWN: START_CLOCK_MS, DUSK: START_CLOCK_MS },
      turnStartedAt: 0,
      startedAt: 0,
      result: null, // 'DAWN' | 'DUSK' | 'DRAW' | 'ABORTED'
      reason: '',
      ratingChanges: null,
      drawOfferBy: null
    };
    if (players) {
      await this.start(players[0], players[1]);
    } else {
      await this.save();
    }
  }

  async summary() {
    const g = this.game;
    if (!g) return null;
    return {
      id: g.id,
      variant: g.variant,
      status: g.status,
      host: g.host ? g.host.username : null,
      players: {
        DAWN: g.players.DAWN?.username || null,
        DUSK: g.players.DUSK?.username || null
      }
    };
  }

  /* ------------------------------------------------------------ lifecycle */

  async start(a, b) {
    const g = this.game;
    const [dawn, dusk] = Math.random() < 0.5 ? [a, b] : [b, a];
    g.players = { DAWN: dawn, DUSK: dusk };
    g.status = 'ACTIVE';
    g.startedAt = Date.now();
    g.turnStartedAt = g.startedAt;
    const rules = createInitialGameState(g.variant);
    rules.history = [];
    g.rules = rules;
    await this.save();

    await this.env.DB.batch([
      this.env.DB.prepare('UPDATE users SET active_game_id = ? WHERE id IN (?, ?)').bind(g.id, dawn.id, dusk.id)
    ]);
    await this.scheduleAlarm();
  }

  /** Moment the side to move runs out of time (or must make a first move by). */
  deadline() {
    const g = this.game;
    if (g.actions.length < 2) return g.turnStartedAt + FIRST_MOVE_MS;
    return g.turnStartedAt + g.clocks[g.rules.turn];
  }

  async scheduleAlarm() {
    if (this.game.status === 'ACTIVE') {
      await this.ctx.storage.setAlarm(this.deadline());
    } else {
      await this.ctx.storage.deleteAlarm();
    }
  }

  async alarm() {
    const g = this.game;
    if (!g || g.status !== 'ACTIVE') return;
    const now = Date.now();
    if (now < this.deadline() - 50) {
      await this.scheduleAlarm(); // woke early
      return;
    }
    const side = g.rules.turn;
    if (g.actions.length < 2) {
      await this.finish('ABORTED', `Game aborted: ${side} did not make a first move.`);
    } else {
      g.clocks[side] = 0;
      await this.finish(other(side), `${other(side)} wins on time.`);
    }
  }

  /**
   * Ends the game. Rated results update both players' Elo in one D1 batch.
   */
  async finish(result, reason) {
    const g = this.game;
    if (g.status === 'OVER') return;
    g.status = 'OVER';
    g.result = result;
    g.reason = reason;
    g.drawOfferBy = null;
    const now = Date.now();
    const { DAWN: dawn, DUSK: dusk } = g.players;
    const db = this.env.DB;

    if (result === 'ABORTED') {
      await db.prepare('UPDATE users SET active_game_id = NULL WHERE id IN (?, ?) AND active_game_id = ?')
        .bind(dawn.id, dusk.id, g.id).run();
    } else {
      // Use current ratings (players may have finished other games meanwhile).
      const rows = await db.prepare('SELECT id, rating, games_played FROM users WHERE id IN (?, ?)')
        .bind(dawn.id, dusk.id).all();
      const byId = Object.fromEntries(rows.results.map(r => [r.id, r]));
      const d = byId[dawn.id];
      const k = byId[dusk.id];
      const scoreDawn = result === 'DAWN' ? 1 : result === 'DUSK' ? 0 : 0.5;
      const elo = computeElo(d.rating, d.games_played, k.rating, k.games_played, scoreDawn);

      g.ratingChanges = {
        DAWN: { before: d.rating, after: elo.a, delta: elo.deltaA },
        DUSK: { before: k.rating, after: elo.b, delta: elo.deltaB }
      };

      const updateUser = (id, newRating, score) => db.prepare(
        `UPDATE users SET
           rating = ?, peak_rating = MAX(peak_rating, ?), games_played = games_played + 1,
           wins = wins + ?, losses = losses + ?, draws = draws + ?,
           active_game_id = CASE WHEN active_game_id = ? THEN NULL ELSE active_game_id END
         WHERE id = ?`
      ).bind(newRating, newRating, score === 1 ? 1 : 0, score === 0 ? 1 : 0, score === 0.5 ? 1 : 0, g.id, id);

      await db.batch([
        db.prepare(
          `INSERT INTO games (id, variant, dawn_id, dusk_id, result, reason,
             dawn_rating_before, dusk_rating_before, dawn_rating_after, dusk_rating_after,
             move_count, moves, started_at, ended_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(g.id, g.variant, dawn.id, dusk.id, result, reason,
          d.rating, k.rating, elo.a, elo.b,
          g.actions.length, JSON.stringify(g.notations), g.startedAt, now),
        updateUser(dawn.id, elo.a, scoreDawn),
        updateUser(dusk.id, elo.b, 1 - scoreDawn)
      ]);
    }

    await this.save();
    await this.ctx.storage.deleteAlarm();
    this.broadcast({
      type: 'game_over',
      result: g.result,
      reason: g.reason,
      ratingChanges: g.ratingChanges,
      clocks: g.clocks
    });
  }

  /* ----------------------------------------------------------- websockets */

  async fetch(request) {
    const g = this.game;
    if (!g) return new Response('Game not found', { status: 404 });

    const me = {
      id: request.headers.get('X-User-Id'),
      username: request.headers.get('X-Username'),
      rating: Number(request.headers.get('X-Rating')),
      avatarUrl: request.headers.get('X-Avatar-Url') || null
    };

    // Invite link: the first other person to open it becomes the opponent.
    if (g.status === 'WAITING' && g.host && me.id !== g.host.id) {
      await this.start(g.host, me);
    }

    let role = 'SPECTATOR';
    if (g.players.DAWN?.id === me.id) role = SIDES.DAWN;
    else if (g.players.DUSK?.id === me.id) role = SIDES.DUSK;
    else if (g.status === 'WAITING' && g.host?.id === me.id) role = 'HOST';

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ userId: me.id, role });

    server.send(JSON.stringify(this.stateMessage(role)));
    // Let the waiting host know the game has started.
    if (g.status === 'ACTIVE') this.broadcastState();

    return new Response(null, { status: 101, webSocket: client });
  }

  stateMessage(role) {
    const g = this.game;
    const publicPlayer = (p) => p && { username: p.username, rating: p.rating, avatarUrl: p.avatarUrl };
    return {
      type: 'state',
      you: role,
      serverNow: Date.now(),
      game: {
        id: g.id,
        variant: g.variant,
        status: g.status,
        players: { DAWN: publicPlayer(g.players.DAWN), DUSK: publicPlayer(g.players.DUSK) },
        host: g.host ? g.host.username : null,
        actions: g.actions,
        clocks: g.clocks,
        clocksRunning: g.actions.length >= 2,
        turnStartedAt: g.turnStartedAt,
        firstMoveDeadline: g.status === 'ACTIVE' && g.actions.length < 2 ? this.deadline() : null,
        result: g.result,
        reason: g.reason,
        ratingChanges: g.ratingChanges,
        drawOfferBy: g.drawOfferBy
      }
    };
  }

  broadcastState() {
    for (const ws of this.ctx.getWebSockets()) {
      const { role } = ws.deserializeAttachment() || {};
      this.safeSend(ws, this.stateMessage(role));
    }
  }

  broadcast(msg) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) this.safeSend(ws, text);
  }

  safeSend(ws, msg) {
    try {
      ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } catch {
      // socket already closing
    }
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const { role } = ws.deserializeAttachment() || {};
    const g = this.game;

    if (msg.type === 'ping') return this.safeSend(ws, { type: 'pong', serverNow: Date.now() });
    if (msg.type === 'sync') return this.safeSend(ws, this.stateMessage(role));
    if (role !== SIDES.DAWN && role !== SIDES.DUSK) return;
    if (g.status !== 'ACTIVE') return this.safeSend(ws, this.stateMessage(role));

    switch (msg.type) {
      case 'move': return this.handleMove(ws, role, msg.action);
      case 'resign': return this.finish(other(role), `${role} resigned. ${other(role)} wins.`);
      case 'draw_offer':
        if (g.drawOfferBy === other(role)) {
          return this.finish('DRAW', 'Draw by agreement.');
        }
        g.drawOfferBy = role;
        await this.save();
        return this.broadcast({ type: 'draw_offer', by: role });
      case 'draw_accept':
        if (g.drawOfferBy === other(role)) return this.finish('DRAW', 'Draw by agreement.');
        return;
      case 'draw_decline':
        if (g.drawOfferBy === other(role)) {
          g.drawOfferBy = null;
          await this.save();
          this.broadcast({ type: 'draw_declined', by: role });
        }
        return;
    }
  }

  async handleMove(ws, side, proposed) {
    const g = this.game;
    if (g.rules.turn !== side) {
      return this.safeSend(ws, { type: 'error', message: 'Not your turn.' });
    }
    const legal = getAllLegalActions(g.rules, side).find(a => sameAction(a, proposed));
    if (!legal) {
      this.safeSend(ws, { type: 'error', message: 'Illegal move.' });
      return this.safeSend(ws, this.stateMessage(side));
    }

    const now = Date.now();
    if (g.actions.length >= 2) {
      g.clocks[side] -= now - g.turnStartedAt;
      if (g.clocks[side] <= 0) {
        g.clocks[side] = 0;
        return this.finish(other(side), `${other(side)} wins on time.`);
      }
    } else if (now > g.turnStartedAt + FIRST_MOVE_MS) {
      return this.finish('ABORTED', `Game aborted: ${side} did not make a first move.`);
    }

    const next = applyAction(g.rules, legal);
    const notation = next.history[next.history.length - 1].notation;
    next.history = []; // keep stored state small; moves are kept in g.actions
    g.rules = next;
    g.actions.push(legal);
    g.notations.push(notation);
    g.turnStartedAt = now;
    g.drawOfferBy = null;

    this.broadcast({
      type: 'move',
      ply: g.actions.length,
      action: legal,
      clocks: g.clocks,
      clocksRunning: g.actions.length >= 2,
      turnStartedAt: g.turnStartedAt,
      firstMoveDeadline: g.actions.length < 2 ? this.deadline() : null,
      serverNow: now
    });

    if (next.phase === 'GAME_OVER') {
      const s = next.status;
      return this.finish(s.winner || 'DRAW', s.reason);
    }
    await this.save();
    await this.scheduleAlarm();
  }

  async webSocketClose(ws) {
    try {
      ws.close(1000, 'closing');
    } catch {
      // already closed
    }
  }
}
