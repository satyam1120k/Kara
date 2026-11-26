/**
 * KĀRA: piece artwork (original SVG designs).
 *
 * One shape per piece type, drawn on a 100×100 grid. Colours are NOT baked
 * in: CSS sets them per side and face (see pieces.css), so the same shape
 * works for Dawn, Dusk and the promoted Eclipse face.
 *
 * Classes used inside the shapes:
 *   pc-body   main filled parts (side colour + outline)
 *   pc-accent trim details (bronze/violet; bright gold when Eclipse)
 *   pc-dark   small dark details (eyes, doorway)
 *   pc-line   outline-only strokes
 *
 * To swap in an artist's set later, replace the strings in SHAPES (keep
 * viewBox 0 0 100 100 and these class names) and nothing else changes.
 */

import { PIECE_SYMBOLS } from './engine.js';

// Shared by every piece: Eclipse aura, ground shadow and pedestal.
const AURA = '<circle class="pc-aura" cx="50" cy="48" r="47"/>';
const SHADOW = '<ellipse class="pc-shadow" cx="50" cy="91" rx="27" ry="4.5"/>';
const BASE =
  '<path class="pc-body" d="M25 89 Q25 81 33 79.5 L67 79.5 Q75 81 75 89 Z"/>' +
  '<path class="pc-body" d="M31 80 L35 72.5 L65 72.5 L69 80 Z"/>';

const SHAPES = {
  // Tall robed ruler with a sun-disc halo and a three-point crown.
  SOVEREIGN:
    '<circle class="pc-halo" cx="50" cy="26" r="17"/>' +
    '<path class="pc-body" d="M37 73 L41 44 Q50 38 59 44 L63 73 Z"/>' +
    '<path class="pc-accent" d="M38.8 57 L61.2 57 L62 62.5 L38 62.5 Z"/>' +
    '<circle class="pc-body" cx="50" cy="32" r="9"/>' +
    '<path class="pc-accent" d="M41.5 27 L42.5 15 L46.5 21.5 L50 11 L53.5 21.5 L57.5 15 L58.5 27 Z"/>',

  // Slim pawn-like soldier holding a spear upright: it moves straight ahead.
  SPEAR:
    '<path class="pc-body" d="M38 73 Q40 61 45 55.5 L55 55.5 Q60 61 62 73 Z"/>' +
    '<rect class="pc-body" x="40.5" y="51" width="19" height="5.5" rx="2.75"/>' +
    '<circle class="pc-body" cx="50" cy="43" r="8.5"/>' +
    '<line class="pc-line pc-shaft" x1="50" y1="34.5" x2="50" y2="23"/>' +
    '<line class="pc-line" x1="44" y1="24.5" x2="56" y2="24.5"/>' +
    '<path class="pc-accent" d="M50 5 L57.5 18.5 L50 24.5 L42.5 18.5 Z"/>',

  // Short, wide tower with battlements: the defender.
  BASTION:
    '<path class="pc-body" d="M31 73 L33 45 L67 45 L69 73 Z"/>' +
    '<path class="pc-body" d="M28.5 46 L28.5 32 L37 32 L37 38.5 L45.5 38.5 L45.5 32 L54.5 32 L54.5 38.5 L63 38.5 L63 32 L71.5 32 L71.5 46 Z"/>' +
    '<path class="pc-accent" d="M32.6 51 L67.4 51 L67.8 56.5 L32.2 56.5 Z"/>' +
    '<path class="pc-dark" d="M44.5 73 L44.5 65 Q50 58.5 55.5 65 L55.5 73 Z"/>',

  // Hooded figure in a slanted cloak with a diagonal sash: it slides diagonally.
  SCOUT:
    '<path class="pc-body" d="M35 73 Q37 56 44 45 L58 43 Q62 56 66 73 Z"/>' +
    '<path class="pc-body" d="M40 48 Q36.5 29 50 22 Q58 18 69 11 Q63.5 22 63.5 32 Q63.5 45 53 48.5 Z"/>' +
    '<ellipse class="pc-dark" cx="51.5" cy="35" rx="5.5" ry="7.5"/>' +
    '<path class="pc-accent" d="M37.5 66 L60 45.5 L63.5 49 L41 69.5 Z"/>',

  // Stylised griffin head in profile with a feathered crest: the leaper.
  RIDER:
    '<path class="pc-body" d="M36 73 Q33 56 39 44 Q44 31 55 25 Q65 20 72 25 L84.5 31 L72 35.5 Q69 41 63 43 Q57 46 57 55 Q58 65 64 73 Z"/>' +
    '<path class="pc-accent" d="M52.5 26.5 Q47 14 55.5 5.5 Q55.5 15 62 22.5 Z"/>' +
    '<path class="pc-accent" d="M45.5 33 Q37 24 41 12.5 Q45.5 22 52 27.5 Z"/>' +
    '<circle class="pc-dark" cx="65" cy="29" r="2.8"/>' +
    '<path class="pc-line" d="M43.5 46 Q48.5 54 46 65"/>',

  // Spoked wheel on a low stand: it slides in straight lines.
  CHARIOT:
    '<path class="pc-body" d="M42.5 65 L57.5 65 L61.5 73 L38.5 73 Z"/>' +
    '<circle class="pc-body" cx="50" cy="43" r="23.5"/>' +
    '<circle class="pc-line" cx="50" cy="43" r="16.5"/>' +
    '<path class="pc-line" d="M50 26.5 L50 59.5 M33.5 43 L66.5 43 M38.3 31.3 L61.7 54.7 M61.7 31.3 L38.3 54.7"/>' +
    '<circle class="pc-accent" cx="50" cy="43" r="6.5"/>',

  // Robed seer with an eye emblem and a floating orb: the jumper.
  MYSTIC:
    '<circle class="pc-orbglow" cx="50" cy="14.5" r="10.5"/>' +
    '<path class="pc-body" d="M34 73 Q39 52 43 45 Q50 39 57 45 Q61 52 66 73 Z"/>' +
    '<circle class="pc-body" cx="50" cy="36.5" r="8.5"/>' +
    '<path class="pc-dark" d="M42.5 58 Q50 51.5 57.5 58 Q50 64.5 42.5 58 Z"/>' +
    '<circle class="pc-accent pc-pupil" cx="50" cy="58" r="2.8"/>' +
    '<circle class="pc-accent" cx="50" cy="14.5" r="6.5"/>'
};

/** Full SVG markup for a piece type (colours come from CSS). */
export function pieceSvg(type) {
  const shape = SHAPES[type] || SHAPES.SPEAR;
  return `<svg class="piece-art" viewBox="0 0 100 100" aria-hidden="true" focusable="false">${AURA}${SHADOW}${BASE}${shape}</svg>`;
}

function label(type, side, face) {
  const name = PIECE_SYMBOLS[type]?.name || type;
  const s = side === 'DAWN' ? 'Dawn' : 'Dusk';
  return face === 'ECLIPSE' ? `${s} ${name} (Eclipse)` : `${s} ${name}`;
}

/** HTML string for a standalone piece (inspector, promotion dialog, rules). */
export function pieceHtml(type, side, face = 'DAWN', extraClass = 'preview-token') {
  return `<div class="piece-token piece-figure ${extraClass} side-${side.toLowerCase()} face-${face.toLowerCase()}" role="img" aria-label="${label(type, side, face)}">${pieceSvg(type)}</div>`;
}

/** DOM element for a piece on the board. */
export function createPieceEl(piece, extraClass = '') {
  const el = document.createElement('div');
  el.className = `piece-token piece-figure ${extraClass} side-${piece.side.toLowerCase()} face-${piece.face.toLowerCase()}`;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', label(piece.type, piece.side, piece.face));
  el.innerHTML = pieceSvg(piece.type);
  return el;
}
