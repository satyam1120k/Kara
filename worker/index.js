/**
 * KĀRA online: Cloudflare Worker entry point.
 *
 *   /api/*        JSON API (accounts, profiles, leaderboard, invites)
 *   /ws/lobby     matchmaking WebSocket  -> Lobby Durable Object
 *   /ws/game/:id  live game WebSocket    -> GameRoom Durable Object
 *   everything else: static game files from /public
 */

import { json, error, readJson, HttpError, isSameOrigin } from './http.js';
import {
  hashPassword, verifyPassword, createSession, clearSessionCookie,
  getSessionUser, deleteSession, publicUser, newId
} from './auth.js';
import { VARIANTS, normalizeVariant } from '../public/js/engine.js';
import { START_RATING } from '../public/js/ratings.js';

export { GameRoom } from './game-room.js';
export { Lobby } from './lobby.js';

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const MAX_AVATAR_BYTES = 300 * 1024;
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/')) return await handleApi(request, env, url);
      if (url.pathname.startsWith('/ws/')) return await handleWebSocket(request, env, url);
      return env.ASSETS.fetch(request);
    } catch (err) {
      if (err instanceof HttpError) return error(err.message, err.status);
      console.error(err && err.stack ? err.stack : err);
      return error('Something went wrong on the server.', 500);
    }
  }
};

async function requireUser(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) throw new HttpError('Please log in.', 401);
  return user;
}

/* ============================================================== API routes */

async function handleApi(request, env, url) {
  const { pathname } = url;
  const method = request.method;

  if (method !== 'GET' && method !== 'HEAD' && !isSameOrigin(request, url)) {
    return error('Cross-site request blocked.', 403);
  }

  // ---- Accounts
  if (pathname === '/api/auth/signup' && method === 'POST') return signup(request, env);
  if (pathname === '/api/auth/login' && method === 'POST') return login(request, env);
  if (pathname === '/api/auth/logout' && method === 'POST') {
    await deleteSession(request, env);
    return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
  }

  // ---- Me
  if (pathname === '/api/me' && method === 'GET') {
    const u = await requireUser(request, env);
    return json({ user: publicUser(u), activeGameId: u.active_game_id || null });
  }
  if (pathname === '/api/me' && method === 'PUT') return updateProfile(request, env);
  if (pathname === '/api/me/avatar' && method === 'PUT') return uploadAvatar(request, env);
  if (pathname === '/api/me/avatar' && method === 'DELETE') {
    const u = await requireUser(request, env);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM avatars WHERE user_id = ?').bind(u.id),
      env.DB.prepare('UPDATE users SET has_avatar = 0 WHERE id = ?').bind(u.id)
    ]);
    return json({ ok: true });
  }

  // ---- Live stats (players online / playing). Public so the login screen can show it.
  if (pathname === '/api/stats' && method === 'GET') return json(await getStats(env));
  // Heartbeat: marks you as online and returns the latest stats.
  if (pathname === '/api/presence' && method === 'POST') {
    const u = await requireUser(request, env);
    await env.DB.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(Date.now(), u.id).run();
    return json(await getStats(env));
  }

  // ---- Leaderboard
  if (pathname === '/api/leaderboard' && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT * FROM users WHERE games_played > 0 ORDER BY rating DESC, games_played DESC LIMIT 100`
    ).all();
    return json({ players: results.map(publicUser) });
  }

  // ---- Public profiles
  let m = pathname.match(/^\/api\/users\/([A-Za-z0-9_]{1,20})(\/avatar)?$/);
  if (m && method === 'GET') {
    return m[2] ? serveAvatar(env, m[1]) : getProfile(request, env, m[1]);
  }

  // ---- Games
  if (pathname === '/api/games/invite' && method === 'POST') return createInvite(request, env);
  m = pathname.match(/^\/api\/games\/([0-9a-f]{64})$/);
  if (m && method === 'GET') {
    await requireUser(request, env);
    let roomId;
    try {
      roomId = env.GAME_ROOM.idFromString(m[1]);
    } catch {
      return error('Game not found.', 404);
    }
    const summary = await env.GAME_ROOM.get(roomId).summary();
    return summary ? json({ game: summary }) : error('Game not found.', 404);
  }

  return error('Not found.', 404);
}

const ONLINE_WINDOW_MS = 2 * 60 * 1000; // seen in the last 2 minutes = online

async function getStats(env) {
  const row = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM users WHERE last_seen_at > ?1) AS online,
       (SELECT COUNT(*) FROM users WHERE active_game_id IS NOT NULL) AS playing,
       (SELECT COUNT(DISTINCT active_game_id) FROM users WHERE active_game_id IS NOT NULL) AS liveGames,
       (SELECT COUNT(*) FROM users) AS players,
       (SELECT COUNT(*) FROM games) AS gamesPlayed`
  ).bind(Date.now() - ONLINE_WINDOW_MS).first();
  return {
    online: row.online,
    playing: row.playing,
    liveGames: row.liveGames,
    players: row.players,
    gamesPlayed: row.gamesPlayed
  };
}

async function signup(request, env) {
  const body = await readJson(request);
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (!USERNAME_RE.test(username)) {
    return error('Username must be 3–20 letters, numbers or underscores.');
  }
  if (password.length < 8 || password.length > 128) {
    return error('Password must be at least 8 characters.');
  }

  const existing = await env.DB.prepare('SELECT 1 FROM users WHERE username = ?').bind(username).first();
  if (existing) return error('That username is taken.', 409);

  const id = newId();
  try {
    await env.DB.prepare(
      `INSERT INTO users (id, username, password_hash, display_name, rating, peak_rating, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, username, await hashPassword(password), username, START_RATING, START_RATING, Date.now()).run();
  } catch (err) {
    if (String(err).includes('UNIQUE')) return error('That username is taken.', 409);
    throw err;
  }

  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  const cookie = await createSession(env, id);
  return json({ user: publicUser(user), activeGameId: null }, 201, { 'Set-Cookie': cookie });
}

async function login(request, env) {
  const body = await readJson(request);
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const user = USERNAME_RE.test(username)
    ? await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first()
    : null;
  // Same message whether the username or the password is wrong.
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return error('Wrong username or password.', 401);
  }
  const cookie = await createSession(env, user.id);
  return json({ user: publicUser(user), activeGameId: user.active_game_id || null }, 200, { 'Set-Cookie': cookie });
}

async function updateProfile(request, env) {
  const u = await requireUser(request, env);
  const body = await readJson(request);
  const displayName = String(body.displayName ?? u.display_name).trim().slice(0, 40);
  const bio = String(body.bio ?? u.bio).trim().slice(0, 300);
  await env.DB.prepare('UPDATE users SET display_name = ?, bio = ? WHERE id = ?')
    .bind(displayName, bio, u.id).run();
  const fresh = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(u.id).first();
  return json({ user: publicUser(fresh) });
}

function sniffImageType(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return null;
}

async function uploadAvatar(request, env) {
  const u = await requireUser(request, env);
  const buf = new Uint8Array(await request.arrayBuffer());
  if (buf.length === 0) return error('No image received.');
  if (buf.length > MAX_AVATAR_BYTES) return error('Photo is too large (max 300 KB).', 413);
  const mime = sniffImageType(buf);
  if (!mime || !AVATAR_TYPES.includes(mime)) return error('Photo must be a JPEG, PNG or WebP image.');

  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO avatars (user_id, mime, data, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at`
    ).bind(u.id, mime, btoa(bin), Date.now()),
    env.DB.prepare('UPDATE users SET has_avatar = 1, avatar_version = avatar_version + 1 WHERE id = ?').bind(u.id)
  ]);
  const fresh = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(u.id).first();
  return json({ user: publicUser(fresh) });
}

async function serveAvatar(env, username) {
  const row = await env.DB.prepare(
    'SELECT a.mime, a.data FROM avatars a JOIN users u ON u.id = a.user_id WHERE u.username = ?'
  ).bind(username).first();
  if (!row) return new Response('Not found', { status: 404 });
  const bin = atob(row.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, {
    headers: {
      'Content-Type': row.mime,
      'Cache-Control': 'public, max-age=86400', // URL has ?v=<version>, so updates bust the cache
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'"
    }
  });
}

async function getProfile(request, env, username) {
  await requireUser(request, env);
  const u = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
  if (!u) return error('Player not found.', 404);

  const recent = await env.DB.prepare(
    `SELECT g.id, g.variant, g.result, g.reason, g.ended_at, g.move_count,
            CASE WHEN g.dawn_id = ?1 THEN 'DAWN' ELSE 'DUSK' END AS side,
            CASE WHEN g.dawn_id = ?1 THEN g.dawn_rating_before ELSE g.dusk_rating_before END AS rating_before,
            CASE WHEN g.dawn_id = ?1 THEN g.dawn_rating_after ELSE g.dusk_rating_after END AS rating_after,
            CASE WHEN g.dawn_id = ?1 THEN g.dusk_rating_before ELSE g.dawn_rating_before END AS opponent_rating,
            o.username AS opponent
     FROM games g JOIN users o ON o.id = CASE WHEN g.dawn_id = ?1 THEN g.dusk_id ELSE g.dawn_id END
     WHERE g.dawn_id = ?1 OR g.dusk_id = ?1
     ORDER BY g.ended_at DESC LIMIT 25`
  ).bind(u.id).all();

  const opponents = await env.DB.prepare(
    `SELECT o.username AS username, COUNT(*) AS games,
            SUM(CASE WHEN (g.result = 'DAWN' AND g.dawn_id = ?1) OR (g.result = 'DUSK' AND g.dusk_id = ?1) THEN 1 ELSE 0 END) AS wins,
            SUM(CASE WHEN g.result = 'DRAW' THEN 1 ELSE 0 END) AS draws
     FROM games g JOIN users o ON o.id = CASE WHEN g.dawn_id = ?1 THEN g.dusk_id ELSE g.dawn_id END
     WHERE g.dawn_id = ?1 OR g.dusk_id = ?1
     GROUP BY o.id ORDER BY games DESC LIMIT 20`
  ).bind(u.id).all();

  return json({
    user: publicUser(u),
    recentGames: recent.results.map(r => ({
      id: r.id,
      variant: r.variant,
      side: r.side,
      outcome: r.result === 'DRAW' ? 'draw' : r.result === r.side ? 'win' : 'loss',
      reason: r.reason,
      endedAt: r.ended_at,
      moves: r.move_count,
      ratingBefore: r.rating_before,
      ratingAfter: r.rating_after,
      opponent: r.opponent,
      opponentRating: r.opponent_rating
    })),
    opponents: opponents.results.map(o => ({
      username: o.username,
      games: o.games,
      wins: o.wins,
      draws: o.draws,
      losses: o.games - o.wins - o.draws
    }))
  });
}

async function createInvite(request, env) {
  const u = await requireUser(request, env);
  const body = await readJson(request);
  const variant = normalizeVariant(body.variant) || VARIANTS.TOWERS;
  const roomId = env.GAME_ROOM.newUniqueId();
  const gameId = roomId.toString();
  await env.GAME_ROOM.get(roomId).init({
    id: gameId,
    variant,
    host: { id: u.id, username: u.username, rating: u.rating, avatarUrl: publicUser(u).avatarUrl }
  });
  return json({ gameId });
}

/* ============================================================ WebSockets */

async function handleWebSocket(request, env, url) {
  if (request.headers.get('Upgrade') !== 'websocket') return error('Expected a WebSocket.', 426);
  if (!isSameOrigin(request, url)) return error('Cross-site request blocked.', 403);
  const u = await requireUser(request, env);

  // Pass the verified identity to the Durable Object.
  const headers = new Headers(request.headers);
  headers.set('X-User-Id', u.id);
  headers.set('X-Username', u.username);
  headers.set('X-Rating', String(u.rating));
  headers.set('X-Avatar-Url', publicUser(u).avatarUrl || '');

  if (url.pathname === '/ws/lobby') {
    const variant = normalizeVariant(url.searchParams.get('variant'));
    if (!variant) return error('Unknown game type.');
    headers.set('X-Variant', variant);
    const lobby = env.LOBBY.get(env.LOBBY.idFromName('global'));
    return lobby.fetch(new Request(request, { headers }));
  }

  const m = url.pathname.match(/^\/ws\/game\/([0-9a-f]{64})$/);
  if (m) {
    let id;
    try {
      id = env.GAME_ROOM.idFromString(m[1]);
    } catch {
      return error('Game not found.', 404);
    }
    return env.GAME_ROOM.get(id).fetch(new Request(request, { headers }));
  }

  return error('Not found.', 404);
}
