/**
 * Lobby Durable Object: a single global matchmaking queue.
 *
 * Players open a WebSocket to the lobby for a game type (Simple / Eclipse / Towers).
 * When two different players are waiting for the same variant, the lobby
 * creates a GameRoom and tells both sockets the game id.
 */

import { DurableObject } from 'cloudflare:workers';

export class Lobby extends DurableObject {
  async fetch(request) {
    const me = {
      id: request.headers.get('X-User-Id'),
      username: request.headers.get('X-Username'),
      rating: Number(request.headers.get('X-Rating')),
      avatarUrl: request.headers.get('X-Avatar-Url') || null,
      variant: request.headers.get('X-Variant'),
      joinedAt: Date.now(),
      matched: false
    };

    // A player has at most one search at a time (e.g. second tab replaces the first).
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (a && a.id === me.id) {
        try { ws.close(4000, 'Replaced by a newer search'); } catch { /* closed */ }
      }
    }

    // Longest-waiting player of the same variant.
    let opponentWs = null;
    let opponent = null;
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (!a || a.matched || a.id === me.id || a.variant !== me.variant) continue;
      if (!opponent || a.joinedAt < opponent.joinedAt) {
        opponent = a;
        opponentWs = ws;
      }
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(me);

    if (!opponent) {
      server.send(JSON.stringify({ type: 'waiting', variant: me.variant }));
      return new Response(null, { status: 101, webSocket: client });
    }

    opponent.matched = true;
    opponentWs.serializeAttachment(opponent);
    me.matched = true;
    server.serializeAttachment(me);

    const roomId = this.env.GAME_ROOM.newUniqueId();
    const gameId = roomId.toString();
    const strip = ({ id, username, rating, avatarUrl }) => ({ id, username, rating, avatarUrl });
    await this.env.GAME_ROOM.get(roomId).init({
      id: gameId,
      variant: me.variant,
      players: [strip(opponent), strip(me)]
    });

    const msg = JSON.stringify({ type: 'matched', gameId });
    for (const ws of [opponentWs, server]) {
      try {
        ws.send(msg);
        ws.close(1000, 'matched');
      } catch { /* closed */ }
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    if (raw === 'ping') {
      try { ws.send('pong'); } catch { /* closed */ }
    }
  }

  async webSocketClose(ws) {
    try { ws.close(1000, 'bye'); } catch { /* closed */ }
  }
}
