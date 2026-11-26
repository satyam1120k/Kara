/**
 * KĀRA: Towers of Dawn & Eclipse
 * Core Game Engine: Board, Pieces, Echoes, and Move Generation
 */

export const SIDES = {
  DAWN: 'DAWN',
  DUSK: 'DUSK'
};

export const FACES = {
  DAWN: 'DAWN',
  ECLIPSE: 'ECLIPSE'
};

export const PIECE_TYPES = {
  SOVEREIGN: 'SOVEREIGN',
  SPEAR: 'SPEAR',
  BASTION: 'BASTION',
  SCOUT: 'SCOUT',
  RIDER: 'RIDER',
  CHARIOT: 'CHARIOT',
  MYSTIC: 'MYSTIC'
};

export const PIECE_SYMBOLS = {
  SOVEREIGN: { name: 'Sovereign', abbr: 'S', echo: 'None' },
  SPEAR:     { name: 'Spear',     abbr: 'Sp', echo: 'Thrust' },
  BASTION:   { name: 'Bastion',   abbr: 'B', echo: 'Aegis' },
  SCOUT:     { name: 'Scout',     abbr: 'Sc', echo: 'Vault' },
  RIDER:     { name: 'Rider',     abbr: 'R', echo: 'Gallop' },
  CHARIOT:   { name: 'Chariot',   abbr: 'C', echo: 'Horizon' },
  MYSTIC:    { name: 'Mystic',    abbr: 'M', echo: 'Phase' }
};

/**
 * Game types, from easiest to full rules:
 *  - SIMPLE:  basic moves and captures only. No promotion, no stacking.
 *  - ECLIPSE: adds promotion. A piece that reaches the opponent's Citadel can
 *             awaken to its stronger Eclipse face. Still no stacking.
 *  - TOWERS:  everything: Eclipse promotion plus stacking up to 3 tiers,
 *             with buried pieces granting Echo powers.
 */
export const VARIANTS = {
  SIMPLE: 'SIMPLE',
  ECLIPSE: 'ECLIPSE',
  TOWERS: 'TOWERS'
};

export const VARIANT_LIST = [VARIANTS.SIMPLE, VARIANTS.ECLIPSE, VARIANTS.TOWERS];

export const VARIANT_INFO = {
  SIMPLE: {
    name: 'Simple',
    tagline: 'Basic moves',
    icon: '♟',
    description: 'Move and capture. No promotion, no stacking. Best for learning the pieces.'
  },
  ECLIPSE: {
    name: 'Eclipse',
    tagline: 'With promotion',
    icon: '🌘',
    description: 'Reach the opponent\'s side and your piece can awaken to its stronger Eclipse face. No stacking.'
  },
  TOWERS: {
    name: 'Towers',
    tagline: 'Full rules',
    icon: '🏯',
    description: 'Eclipse promotion plus stacking: build towers up to 3 high; buried pieces give Echo powers.'
  }
};

/**
 * Accepts old names too: games saved before there were three types used
 * "CLASSIC", which had exactly the Eclipse rules.
 */
export function normalizeVariant(variant) {
  if (variant === 'CLASSIC') return VARIANTS.ECLIPSE;
  return VARIANT_LIST.includes(variant) ? variant : null;
}

export function isStackingAllowed(variant) {
  return normalizeVariant(variant) === VARIANTS.TOWERS || variant === undefined;
}

export function isPromotionAllowed(variant) {
  return normalizeVariant(variant) !== VARIANTS.SIMPLE;
}

export const BOARD_SIZE = 9;
export const ZENITH = { f: 4, r: 4 }; // e5

let _pieceIdCounter = 1;
export function createPiece(type, side, face = FACES.DAWN) {
  return {
    id: `p_${_pieceIdCounter++}`,
    type,
    side,
    face
  };
}

export function parseSquare(coord) {
  if (!coord || coord.length < 2) return null;
  const f = coord.charCodeAt(0) - 97;
  const r = parseInt(coord.slice(1), 10) - 1;
  if (f < 0 || f >= BOARD_SIZE || r < 0 || r >= BOARD_SIZE) return null;
  return { f, r };
}

export function formatSquare(f, r) {
  return `${String.fromCharCode(97 + f)}${r + 1}`;
}

export function isDawnCitadel(r) {
  return r >= 0 && r <= 2; // ranks 1-3
}

export function isDuskCitadel(r) {
  return r >= 6 && r <= 8; // ranks 7-9
}

export function isPromotionZone(side, r) {
  return side === SIDES.DAWN ? isDuskCitadel(r) : isDawnCitadel(r);
}

export function isZenith(f, r) {
  return f === ZENITH.f && r === ZENITH.r;
}

export function isSanctum(f, r) {
  return f >= 3 && f <= 5 && r >= 3 && r <= 5; // d4-f6
}

/**
 * Computes buried Echo traits for the top piece of a tower.
 * A piece is buried if it is NOT the top piece (i.e. index < tower.length - 1).
 */
export function getTowerEchoes(tower) {
  const echoes = {
    thrustBonus: 0,   // Spear: +1 extra step forward per buried Spear
    hasAegis: false,    // Bastion: lowest buried Bastion absorbs attack
    hasVault: false,    // Scout: leap over 1 intervening piece
    hasGallop: false,   // Rider: grants L-shape leap
    horizonBonus: 0,   // Chariot: +2 range to directional steps/slides per buried Chariot
    hasPhase: false     // Mystic: grants 1-step diagonal move
  };

  if (!tower || tower.length <= 1) return echoes;

  // Buried pieces are all except the top piece
  for (let i = 0; i < tower.length - 1; i++) {
    const piece = tower[i];
    switch (piece.type) {
      case PIECE_TYPES.SPEAR:
        echoes.thrustBonus += 1;
        break;
      case PIECE_TYPES.BASTION:
        echoes.hasAegis = true;
        break;
      case PIECE_TYPES.SCOUT:
        echoes.hasVault = true;
        break;
      case PIECE_TYPES.RIDER:
        echoes.hasGallop = true;
        break;
      case PIECE_TYPES.CHARIOT:
        echoes.horizonBonus += 2;
        break;
      case PIECE_TYPES.MYSTIC:
        echoes.hasPhase = true;
        break;
    }
  }

  return echoes;
}

/**
 * Checks if a move crosses into, within, or out of the opponent's citadel.
 */
export function canPromote(side, piece, fromR, toR, isDrop = false) {
  if (isDrop) return false;
  if (piece.type === PIECE_TYPES.SOVEREIGN) return false;
  if (piece.face === FACES.ECLIPSE) return false;

  const inPromoFrom = isPromotionZone(side, fromR);
  const inPromoTo = isPromotionZone(side, toR);
  // Enters, moves within, or exits the opponent's Citadel
  return inPromoFrom || inPromoTo;
}

/**
 * Generates all pseudo-legal board moves for the top piece on (fromF, fromR).
 * Does not filter for Sovereign check (that is done in rules validation).
 *
 * options.allowStacking (default true): when false, friendly squares simply
 * block movement and no STACK moves are generated (Simple and Eclipse games).
 */
export function getPseudoLegalMoves(board, fromF, fromR, options = {}) {
  const allowStacking = options.allowStacking !== false;
  const tower = board[fromR][fromF];
  if (!tower || tower.length === 0) return [];

  const topPiece = tower[tower.length - 1];
  const side = topPiece.side;
  const face = topPiece.face;
  const echoes = getTowerEchoes(tower);

  const forwardDir = side === SIDES.DAWN ? 1 : -1;
  const moves = [];

  // Helper to add a move candidate
  function tryAddMove(toF, toR, leapOver = false) {
    if (toF < 0 || toF >= BOARD_SIZE || toR < 0 || toR >= BOARD_SIZE) return false;
    if (toF === fromF && toR === fromR) return false;

    const targetTower = board[toR][toF];
    if (!targetTower || targetTower.length === 0) {
      // Empty square: simple move
      moves.push({
        action: 'MOVE',
        from: { f: fromF, r: fromR },
        to: { f: toF, r: toR },
        piece: topPiece,
        type: 'NORMAL',
        leapOver
      });
      return true;
    }

    const targetTop = targetTower[targetTower.length - 1];
    if (targetTop.side === side) {
      // Friendly square: Stacking
      // Rules: Sovereign cannot stack on anything, nor can anything stack on Sovereign.
      // Max height is 3.
      if (allowStacking &&
          topPiece.type !== PIECE_TYPES.SOVEREIGN &&
          targetTop.type !== PIECE_TYPES.SOVEREIGN &&
          targetTower.length < 3) {
        moves.push({
          action: 'MOVE',
          from: { f: fromF, r: fromR },
          to: { f: toF, r: toR },
          piece: topPiece,
          type: 'STACK',
          leapOver
        });
      }
      return false; // Friendly piece always blocks ray continuation
    } else {
      // Enemy square: Capture
      // Target tower might have Aegis or height > 1 (peeling capture) or standalone height 1
      const targetEchoes = getTowerEchoes(targetTower);
      let captureType = 'CAPTURE_STANDALONE';
      if (targetEchoes.hasAegis) {
        captureType = 'CAPTURE_AEGIS';
      } else if (targetTower.length > 1) {
        captureType = 'CAPTURE_PEEL';
      }

      moves.push({
        action: 'MOVE',
        from: { f: fromF, r: fromR },
        to: { f: toF, r: toR },
        piece: topPiece,
        type: captureType,
        targetHeight: targetTower.length,
        leapOver
      });
      return false; // Enemy piece blocks ray continuation
    }
  }

  // Helper to trace directional ray with Vault support
  function traceRay(df, dr, maxRange) {
    let currF = fromF;
    let currR = fromR;
    let leaped = false;
    let stepCount = 0;

    while (stepCount < maxRange) {
      currF += df;
      currR += dr;
      stepCount++;

      if (currF < 0 || currF >= BOARD_SIZE || currR < 0 || currR >= BOARD_SIZE) break;

      const targetTower = board[currR][currF];
      const hasObstacle = targetTower && targetTower.length > 0;

      if (!hasObstacle) {
        // Empty square: valid target
        tryAddMove(currF, currR, leaped);
      } else {
        // There is an obstacle
        if (!leaped && echoes.hasVault) {
          // Vault allows targeting this square (stack/capture)...
          tryAddMove(currF, currR, false);
          // ...and LEAPING over it to continue the ray!
          leaped = true;
          continue;
        } else {
          // Cannot leap (either already leaped 1 piece, or no Vault)
          tryAddMove(currF, currR, leaped);
          break; // Ray blocked
        }
      }
    }
  }

  // --- Base Piece Move Logic ---

  switch (topPiece.type) {
    case PIECE_TYPES.SOVEREIGN: {
      // 1 step in all 8 directions. Unstackable, cannot promote.
      const directions = [
        [0, 1], [0, -1], [1, 0], [-1, 0],
        [1, 1], [1, -1], [-1, 1], [-1, -1]
      ];
      for (const [df, dr] of directions) {
        tryAddMove(fromF + df, fromR + dr);
      }
      break;
    }

    case PIECE_TYPES.SPEAR: {
      if (face === FACES.DAWN) {
        // Dawn: 1 square straight forward.
        // Modified by Thrust (+1 each) and Horizon (+2 each)
        const forwardRange = 1 + echoes.thrustBonus + echoes.horizonBonus;
        traceRay(0, forwardDir, forwardRange);
      } else {
        // Eclipse: 1 square orthogonal (4 directions) OR forward-diagonal (2 directions)
        // Orthogonal 4 directions
        const fwdRange = 1 + echoes.thrustBonus + echoes.horizonBonus;
        const normRange = 1 + echoes.horizonBonus;

        traceRay(0, forwardDir, fwdRange);
        traceRay(0, -forwardDir, normRange);
        traceRay(1, 0, normRange);
        traceRay(-1, 0, normRange);
        // Forward diagonals
        traceRay(1, forwardDir, normRange);
        traceRay(-1, forwardDir, normRange);
      }
      break;
    }

    case PIECE_TYPES.BASTION: {
      if (face === FACES.DAWN) {
        // Dawn: 1 square orthogonally (4 directions)
        const fwdRange = 1 + echoes.thrustBonus + echoes.horizonBonus;
        const normRange = 1 + echoes.horizonBonus;

        traceRay(0, forwardDir, fwdRange);
        traceRay(0, -forwardDir, normRange);
        traceRay(1, 0, normRange);
        traceRay(-1, 0, normRange);
      } else {
        // Eclipse: 1 square in all 8 directions
        const fwdRange = 1 + echoes.thrustBonus + echoes.horizonBonus;
        const normRange = 1 + echoes.horizonBonus;

        traceRay(0, forwardDir, fwdRange);
        traceRay(0, -forwardDir, normRange);
        traceRay(1, 0, normRange);
        traceRay(-1, 0, normRange);

        traceRay(1, forwardDir, normRange);
        traceRay(-1, forwardDir, normRange);
        traceRay(1, -forwardDir, normRange);
        traceRay(-1, -forwardDir, normRange);
      }
      break;
    }

    case PIECE_TYPES.SCOUT: {
      if (face === FACES.DAWN) {
        // Dawn: Slides diagonally up to 3 squares
        const diagRange = 3 + echoes.horizonBonus;
        traceRay(1, 1, diagRange);
        traceRay(1, -1, diagRange);
        traceRay(-1, 1, diagRange);
        traceRay(-1, -1, diagRange);
      } else {
        // Eclipse: Slides diagonally UNLIMITED, OR steps 1 square orthogonally
        const diagRange = BOARD_SIZE;
        traceRay(1, 1, diagRange);
        traceRay(1, -1, diagRange);
        traceRay(-1, 1, diagRange);
        traceRay(-1, -1, diagRange);

        const fwdRange = 1 + echoes.thrustBonus + echoes.horizonBonus;
        const normRange = 1 + echoes.horizonBonus;
        traceRay(0, forwardDir, fwdRange);
        traceRay(0, -forwardDir, normRange);
        traceRay(1, 0, normRange);
        traceRay(-1, 0, normRange);
      }
      break;
    }

    case PIECE_TYPES.RIDER: {
      // Dawn & Eclipse both have L-shape leap (knight leap)
      const leaps = [
        [1, 2], [1, -2], [-1, 2], [-1, -2],
        [2, 1], [2, -1], [-2, 1], [-2, -1]
      ];
      for (const [df, dr] of leaps) {
        tryAddMove(fromF + df, fromR + dr, true);
      }

      if (face === FACES.ECLIPSE) {
        // Eclipse also steps 1 square orthogonally
        const fwdRange = 1 + echoes.thrustBonus + echoes.horizonBonus;
        const normRange = 1 + echoes.horizonBonus;
        traceRay(0, forwardDir, fwdRange);
        traceRay(0, -forwardDir, normRange);
        traceRay(1, 0, normRange);
        traceRay(-1, 0, normRange);
      }
      break;
    }

    case PIECE_TYPES.CHARIOT: {
      // Orthogonal unlimited
      traceRay(0, 1, BOARD_SIZE);
      traceRay(0, -1, BOARD_SIZE);
      traceRay(1, 0, BOARD_SIZE);
      traceRay(-1, 0, BOARD_SIZE);

      if (face === FACES.ECLIPSE) {
        // Eclipse also steps 1 square diagonally
        const diagRange = 1 + echoes.horizonBonus;
        traceRay(1, 1, diagRange);
        traceRay(1, -1, diagRange);
        traceRay(-1, 1, diagRange);
        traceRay(-1, -1, diagRange);
      }
      break;
    }

    case PIECE_TYPES.MYSTIC: {
      if (face === FACES.DAWN) {
        // Dawn: 1 square diagonally
        const diagRange = 1 + echoes.horizonBonus;
        traceRay(1, 1, diagRange);
        traceRay(1, -1, diagRange);
        traceRay(-1, 1, diagRange);
        traceRay(-1, -1, diagRange);
      } else {
        // Eclipse: Leaps exactly 2 squares orthogonally or diagonally (8 leap targets)
        const twoSquareLeaps = [
          [0, 2], [0, -2], [2, 0], [-2, 0],
          [2, 2], [2, -2], [-2, 2], [-2, -2]
        ];
        for (const [df, dr] of twoSquareLeaps) {
          tryAddMove(fromF + df, fromR + dr, true);
        }
        // OR steps 1 square diagonally
        const diagRange = 1 + echoes.horizonBonus;
        traceRay(1, 1, diagRange);
        traceRay(1, -1, diagRange);
        traceRay(-1, 1, diagRange);
        traceRay(-1, -1, diagRange);
      }
      break;
    }
  }

  // --- Added moves from Echoes ---

  // Gallop (buried Rider): Top piece gains L-shape leap
  if (echoes.hasGallop && topPiece.type !== PIECE_TYPES.RIDER) {
    const leaps = [
      [1, 2], [1, -2], [-1, 2], [-1, -2],
      [2, 1], [2, -1], [-2, 1], [-2, -1]
    ];
    for (const [df, dr] of leaps) {
      tryAddMove(fromF + df, fromR + dr, true);
    }
  }

  // Phase (buried Mystic): Top piece gains 1-step diagonal move
  if (echoes.hasPhase && topPiece.type !== PIECE_TYPES.MYSTIC) {
    const diagRange = 1 + echoes.horizonBonus;
    traceRay(1, 1, diagRange);
    traceRay(1, -1, diagRange);
    traceRay(-1, 1, diagRange);
    traceRay(-1, -1, diagRange);
  }

  // De-duplicate moves by action, toF, toR, type
  const uniqueMoves = [];
  const seen = new Set();
  for (const m of moves) {
    const key = `${m.to.f},${m.to.r},${m.type}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueMoves.push(m);
    }
  }

  return uniqueMoves;
}

/**
 * Respawns/Deploys are removed per hard mode rules:
 * Captured pieces are permanently eliminated and cannot be deployed back.
 */
export function getPseudoLegalDeploys(board, side, reservePiece, reserveIndex) {
  return [];
}

/**
 * Sacrifices from reserve are removed since captured pieces do not enter reserve.
 * Awakening to Eclipse is achieved through the Citadel Horizon Rule.
 */
export function getPseudoLegalSacrifices(board, side, reservePiece, reserveIndex) {
  return [];
}
