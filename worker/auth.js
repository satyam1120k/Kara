/**
 * Accounts & sessions.
 * - Passwords: PBKDF2-SHA256 with a random salt (never stored in plain text).
 * - Sessions: random token in an HttpOnly cookie; only its SHA-256 is stored.
 */

const PBKDF2_ITERATIONS = 100000; // Workers' WebCrypto maximum
const SESSION_DAYS = 30;
export const SESSION_COOKIE = 'kara_session';

const enc = new TextEncoder();

function toB64(bytes) {
  let s = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}

function fromB64(b64) {
  const s = atob(b64);
  const arr = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i);
  return arr;
}

function toHex(bytes) {
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
  if (a.byteLength !== b.byteLength) return false;
  if (crypto.subtle.timingSafeEqual) return crypto.subtle.timingSafeEqual(a, b);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

/** Returns "pbkdf2$<iterations>$<salt b64>$<hash b64>". */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, iter, saltB64, hashB64] = String(stored).split('$');
  if (scheme !== 'pbkdf2') return false;
  const actual = await pbkdf2(password, fromB64(saltB64), Number(iter));
  return timingSafeEqual(actual, fromB64(hashB64));
}

async function sha256Hex(text) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function newId() {
  return crypto.randomUUID();
}

/** Creates a session and returns the Set-Cookie header value. */
export async function createSession(env, userId) {
  const token = randomToken();
  const now = Date.now();
  const expires = now + SESSION_DAYS * 24 * 3600 * 1000;
  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(await sha256Hex(token), userId, now, expires).run();
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 3600}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function readSessionToken(request) {
  const cookie = request.headers.get('Cookie') || '';
  for (const part of cookie.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === SESSION_COOKIE) return v.join('=');
  }
  return null;
}

/** Returns the logged-in user's row, or null. */
export async function getSessionUser(request, env) {
  const token = readSessionToken(request);
  if (!token) return null;
  return env.DB.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`
  ).bind(await sha256Hex(token), Date.now()).first();
}

export async function deleteSession(request, env) {
  const token = readSessionToken(request);
  if (!token) return;
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
}

/** Public view of a user (safe to send to anyone). */
export function publicUser(u) {
  return {
    username: u.username,
    displayName: u.display_name || '',
    bio: u.bio || '',
    avatarUrl: u.has_avatar ? `/api/users/${encodeURIComponent(u.username)}/avatar?v=${u.avatar_version}` : null,
    rating: u.rating,
    peakRating: u.peak_rating,
    gamesPlayed: u.games_played,
    wins: u.wins,
    losses: u.losses,
    draws: u.draws,
    createdAt: u.created_at
  };
}
