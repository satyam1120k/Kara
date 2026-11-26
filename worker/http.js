/** Small HTTP helpers shared by the Worker routes. */

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers
    }
  });
}

export function error(message, status = 400) {
  return json({ error: message }, status);
}

export async function readJson(request, maxBytes = 16 * 1024) {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > maxBytes) throw new HttpError('Request too large', 413);
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError('Request too large', 413);
  try {
    return JSON.parse(text || '{}');
  } catch {
    throw new HttpError('Invalid JSON', 400);
  }
}

export class HttpError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Blocks cross-site requests that change data (CSRF). Browsers always send
 * Origin on POST/PUT/DELETE and on WebSocket upgrades.
 */
export function isSameOrigin(request, url) {
  const origin = request.headers.get('Origin');
  return !origin || origin === url.origin;
}
