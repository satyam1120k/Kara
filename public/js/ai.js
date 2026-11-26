/**
 * KĀRA: Tactical AI Engine
 * Minimax with Alpha-Beta pruning, move ordering, and Kāra-specific heuristics
 */

import {
  SIDES,
  FACES,
  PIECE_TYPES,
  BOARD_SIZE,
  isZenith,
  isSanctum,
  getTowerEchoes
} from './engine.js';

import {
  getAllLegalActions,
  applyAction,
  findSovereign,
  isCheck,
  simulateAction
} from './rules.js';

const PIECE_VALUES = {
  SOVEREIGN: 100000,
  SPEAR:     100,
  BASTION:   240,
  SCOUT:     300,
  RIDER:     330,
  CHARIOT:   520,
  MYSTIC:    260
};

const ECLIPSE_BONUS = {
  SOVEREIGN: 0,
  SPEAR:     120, // steps in 6 directions
  BASTION:   160, // 8 directions (like Sovereign)
  SCOUT:     150, // unlimited diagonal + orthogonal
  RIDER:     130, // knight + orthogonal
  CHARIOT:   140, // rook + diagonal
  MYSTIC:    180  // 2-square jump + diagonal
};

const ECHO_VALUES = {
  thrustBonus:  35,  // +1 forward step
  hasAegis:     180, // bodyguard absorption
  hasVault:     90,  // leap over 1 piece
  hasGallop:    120, // gains knight leap
  horizonBonus: 130, // +2 range per buried chariot
  hasPhase:     70   // gains diagonal step
};

export const AI_DIFFICULTIES = {
  NOVICE: 'NOVICE',
  ADEPT:  'ADEPT',
  MASTER: 'MASTER'
};

/**
 * Static evaluation function of the board state from Dawn's perspective.
 * Positive = Dawn advantage; Negative = Dusk advantage.
 */
export function evaluateState(state) {
  if (state.phase === 'GAME_OVER') {
    if (state.status.winner === SIDES.DAWN) return 999999;
    if (state.status.winner === SIDES.DUSK) return -999999;
    return 0; // Draw
  }

  const b = state.board;
  let score = 0;

  // 1. Board Material & Tower Evaluation
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let f = 0; f < BOARD_SIZE; f++) {
      const tower = b[r][f];
      if (!tower || tower.length === 0) continue;

      const side = tower[0].side;
      const multiplier = side === SIDES.DAWN ? 1 : -1;

      // Base value of all pieces in the tower
      for (let i = 0; i < tower.length; i++) {
        const piece = tower[i];
        let val = PIECE_VALUES[piece.type] || 0;
        if (piece.face === FACES.ECLIPSE) {
          val += ECLIPSE_BONUS[piece.type] || 0;
        }
        score += val * multiplier;
      }

      // Height resilient bonus (peeling defense)
      if (tower.length === 2) score += 40 * multiplier;
      else if (tower.length === 3) score += 95 * multiplier;

      // Buried Echo bonuses
      if (tower.length > 1) {
        const echoes = getTowerEchoes(tower);
        let echoScore = 0;
        echoScore += echoes.thrustBonus * ECHO_VALUES.thrustBonus;
        if (echoes.hasAegis) echoScore += ECHO_VALUES.hasAegis;
        if (echoes.hasVault) echoScore += ECHO_VALUES.hasVault;
        if (echoes.hasGallop) echoScore += ECHO_VALUES.hasGallop;
        echoScore += echoes.horizonBonus * ECHO_VALUES.horizonBonus;
        if (echoes.hasPhase) echoScore += ECHO_VALUES.hasPhase;

        score += echoScore * multiplier;
      }

      // Positional: Central dominance (Sanctum)
      if (isSanctum(f, r)) {
        score += 20 * multiplier;
      }

      // Positional: The Zenith control
      if (isZenith(f, r)) {
        const top = tower[tower.length - 1];
        if (top.type === PIECE_TYPES.SOVEREIGN) {
          score += 3500 * multiplier; // Sovereign on Zenith is massive threat
        } else {
          score += 80 * multiplier;
        }
      }

      // Proximity of Sovereign to Zenith
      const top = tower[tower.length - 1];
      if (top.type === PIECE_TYPES.SOVEREIGN) {
        const distToZenith = Math.abs(f - 4) + Math.abs(r - 4);
        score -= distToZenith * 15 * multiplier;
      }
    }
  }

  // 2. Captured Material (Permanent Elimination)
  for (const piece of state.reserves.DAWN) {
    score += (PIECE_VALUES[piece.type] || 0);
  }
  for (const piece of state.reserves.DUSK) {
    score -= (PIECE_VALUES[piece.type] || 0);
  }

  // 3. Check bonus/penalty
  if (state.status.isCheck) {
    // Current side to move is in check
    if (state.turn === SIDES.DAWN) score -= 180;
    else score += 180;
  }

  return score;
}

/**
 * Scores an action for move-ordering to maximize alpha-beta pruning cutoffs.
 */
function getActionMoveOrderScore(action) {
  let score = 0;
  if (action.action === 'MOVE') {
    if (action.type.startsWith('CAPTURE')) {
      score += 1000;
      if (action.type === 'CAPTURE_PEEL') score += 300;
      if (action.type === 'CAPTURE_STANDALONE') score += 500;
      if (action.type === 'CAPTURE_AEGIS') score += 250;
    }
    if (action.promote) score += 350;
    if (action.type === 'STACK') score += 150;

    // Moving Sovereign towards or onto Zenith
    if (action.piece.type === PIECE_TYPES.SOVEREIGN && isZenith(action.to.f, action.to.r)) {
      score += 2500;
    }
  }
  return score;
}

/**
 * Alpha-Beta search implementation
 */
function alphaBeta(state, depth, alpha, beta, isMaximizing, startTime, timeLimitMs) {
  if (depth === 0 || state.phase === 'GAME_OVER') {
    return { score: evaluateState(state), action: null };
  }

  if (Date.now() - startTime > timeLimitMs) {
    return { score: evaluateState(state), action: null, timeout: true };
  }

  const side = isMaximizing ? SIDES.DAWN : SIDES.DUSK;
  const legalActions = getAllLegalActions(state, side);

  if (legalActions.length === 0) {
    return { score: evaluateState(state), action: null };
  }

  // Order moves
  legalActions.sort((a, b) => getActionMoveOrderScore(b) - getActionMoveOrderScore(a));

  let bestAction = legalActions[0];

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const action of legalActions) {
      const nextState = applyAction(state, action);
      const res = alphaBeta(nextState, depth - 1, alpha, beta, false, startTime, timeLimitMs);
      if (res.score > maxEval) {
        maxEval = res.score;
        bestAction = action;
      }
      alpha = Math.max(alpha, res.score);
      if (beta <= alpha) break; // Beta cutoff
    }
    return { score: maxEval, action: bestAction };
  } else {
    let minEval = Infinity;
    for (const action of legalActions) {
      const nextState = applyAction(state, action);
      const res = alphaBeta(nextState, depth - 1, alpha, beta, true, startTime, timeLimitMs);
      if (res.score < minEval) {
        minEval = res.score;
        bestAction = action;
      }
      beta = Math.min(beta, res.score);
      if (beta <= alpha) break; // Alpha cutoff
    }
    return { score: minEval, action: bestAction };
  }
}

/**
 * Returns the best action for the current player using the selected difficulty.
 */
export async function getBestAIAction(state, difficulty = AI_DIFFICULTIES.ADEPT) {
  const side = state.turn;
  const legalActions = getAllLegalActions(state, side);
  if (legalActions.length === 0) return null;

  // If only 1 legal action, return immediately
  if (legalActions.length === 1) return legalActions[0];

  // Novice: Depth 1 with slight exploration noise
  if (difficulty === AI_DIFFICULTIES.NOVICE) {
    const isMaximizing = side === SIDES.DAWN;
    const scored = legalActions.map(action => {
      const next = applyAction(state, action);
      const rawScore = evaluateState(next);
      const noise = (Math.random() - 0.5) * 80;
      return { action, score: rawScore + noise };
    });
    scored.sort((a, b) => isMaximizing ? b.score - a.score : a.score - b.score);
    return scored[0].action;
  }

  // Adept: Depth 2
  // Master: Depth 3 with 800ms time cap
  const maxDepth = difficulty === AI_DIFFICULTIES.MASTER ? 3 : 2;
  const timeLimit = difficulty === AI_DIFFICULTIES.MASTER ? 1200 : 500;
  const isMaximizing = side === SIDES.DAWN;
  const startTime = Date.now();

  const result = alphaBeta(state, maxDepth, -Infinity, Infinity, isMaximizing, startTime, timeLimit);
  return result.action || legalActions[0];
}
