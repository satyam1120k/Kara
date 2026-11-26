/**
 * KĀRA: tiny client for the server API.
 * The session is an HttpOnly cookie, so requests just need credentials.
 */

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** Thrown when the server can't be reached at all (offline). */
export class NetworkError extends Error {}

async function request(method, path, body, rawType) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': rawType || 'application/json' } : {},
      body: body === undefined ? undefined : rawType ? body : JSON.stringify(body)
    });
  } catch (err) {
    throw new NetworkError('Cannot reach the server. Check your internet connection.');
  }
  let data = null;
  if ((res.headers.get('content-type') || '').includes('application/json')) {
    data = await res.json().catch(() => null);
  }
  if (!res.ok) throw new ApiError((data && data.error) || `Request failed (${res.status})`, res.status);
  return data;
}

export const api = {
  me: () => request('GET', '/api/me'),
  signup: (username, password) => request('POST', '/api/auth/signup', { username, password }),
  login: (username, password) => request('POST', '/api/auth/login', { username, password }),
  logout: () => request('POST', '/api/auth/logout', {}),
  updateProfile: (displayName, bio) => request('PUT', '/api/me', { displayName, bio }),
  uploadAvatar: (blob) => request('PUT', '/api/me/avatar', blob, blob.type || 'image/jpeg'),
  removeAvatar: () => request('DELETE', '/api/me/avatar'),
  profile: (username) => request('GET', `/api/users/${encodeURIComponent(username)}`),
  leaderboard: () => request('GET', '/api/leaderboard'),
  stats: () => request('GET', '/api/stats'),
  presence: () => request('POST', '/api/presence', {}),
  createInvite: (variant) => request('POST', '/api/games/invite', { variant }),
  gameSummary: (id) => request('GET', `/api/games/${id}`)
};

export function wsUrl(path) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}${path}`;
}
