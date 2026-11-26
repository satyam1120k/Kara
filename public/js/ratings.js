/**
 * KĀRA: Ratings & Titles (shared by the server and the browser)
 *
 * Elo rating: the winner gains what the loser drops. The amount depends on how
 * surprising the result was (beating a stronger player gives more points).
 * New players move faster (higher K) until their rating settles.
 */

export const START_RATING = 1200;
export const MIN_RATING = 100;
const PROVISIONAL_GAMES = 30;

/** K-factor: how far a single game can move a rating. */
export function kFactor(gamesPlayed) {
  return gamesPlayed < PROVISIONAL_GAMES ? 40 : 20;
}

/** Probability (0..1) that a player rated `ra` beats a player rated `rb`. */
export function expectedScore(ra, rb) {
  return 1 / (1 + Math.pow(10, (rb - ra) / 400));
}

/**
 * Computes new ratings after a game.
 * scoreA: 1 = A won, 0.5 = draw, 0 = A lost.
 * Returns { a, b, deltaA, deltaB } (new ratings and changes).
 */
export function computeElo(ratingA, gamesA, ratingB, gamesB, scoreA) {
  const ea = expectedScore(ratingA, ratingB);
  const eb = 1 - ea;
  const scoreB = 1 - scoreA;
  const a = Math.max(MIN_RATING, Math.round(ratingA + kFactor(gamesA) * (scoreA - ea)));
  const b = Math.max(MIN_RATING, Math.round(ratingB + kFactor(gamesB) * (scoreB - eb)));
  return { a, b, deltaA: a - ratingA, deltaB: b - ratingB };
}

/**
 * Rating titles (tiers), lowest first. Each tier has its own colour,
 * like competitive-programming ranks.
 */
export const TITLES = [
  { min: 0,    name: 'Newbie',                    short: 'NB',  color: '#9ca3af' },
  { min: 1200, name: 'Pupil',                     short: 'PU',  color: '#4ade80' },
  { min: 1400, name: 'Specialist',                short: 'SP',  color: '#22d3ee' },
  { min: 1600, name: 'Expert',                    short: 'EX',  color: '#60a5fa' },
  { min: 1900, name: 'Candidate Master',          short: 'CM',  color: '#c084fc' },
  { min: 2100, name: 'Master',                    short: 'M',   color: '#fb923c' },
  { min: 2300, name: 'International Master',      short: 'IM',  color: '#f59e0b' },
  { min: 2400, name: 'Grandmaster',               short: 'GM',  color: '#f87171' },
  { min: 2600, name: 'International Grandmaster', short: 'IGM', color: '#ef4444' },
  { min: 3000, name: 'Legendary Grandmaster',     short: 'LGM', color: '#dc2626' }
];

export function getTitle(rating) {
  let title = TITLES[0];
  for (const t of TITLES) {
    if (rating >= t.min) title = t;
  }
  return title;
}
