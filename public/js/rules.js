/**
 * KĀRA: Towers of Dawn & Eclipse
 * Rules Engine: State, Move Execution, Check/Checkmate, Ascension, and Draft
 */

import {
  SIDES,
  FACES,
  PIECE_TYPES,
  BOARD_SIZE,
  ZENITH,
  VARIANTS,
  isStackingAllowed,
  isPromotionAllowed,
  normalizeVariant,
  createPiece,
  formatSquare,
  isDawnCitadel,
  isDuskCitadel,
  isPromotionZone,
  isZenith,
  getTowerEchoes,
  canPromote,
  getPseudoLegalMoves,
  getPseudoLegalDeploys,
  getPseudoLegalSacrifices
} from './engine.js';

export function createEmptyBoard() {
  const board = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    const row = [];
    for (let f = 0; f < BOARD_SIZE; f++) {
      row.push([]);
    }
    board.push(row);
  }
  return board;
}

export function clonePiece(p) {
  if (!p) return null;
  return {
    id: p.id,
    type: p.type,
    side: p.side,
    face: p.face
  };
}

export function cloneBoard(board) {
  const newBoard = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    const row = [];
    for (let f = 0; f < BOARD_SIZE; f++) {
      const tower = board[r][f];
      row.push(tower.map(p => clonePiece(p)));
    }
    newBoard.push(row);
  }
  return newBoard;
}

export function getInitialUnplacedPool(side) {
  const pool = [];
  // 1 Sovereign (placed automatically at e1 / e9)
  // 5 Spears
  for (let i = 0; i < 5; i++) pool.push(createPiece(PIECE_TYPES.SPEAR, side));
  // 2 Bastions
  for (let i = 0; i < 2; i++) pool.push(createPiece(PIECE_TYPES.BASTION, side));
  // 2 Scouts
  for (let i = 0; i < 2; i++) pool.push(createPiece(PIECE_TYPES.SCOUT, side));
  // 2 Riders
  for (let i = 0; i < 2; i++) pool.push(createPiece(PIECE_TYPES.RIDER, side));
  // 2 Chariots
  for (let i = 0; i < 2; i++) pool.push(createPiece(PIECE_TYPES.CHARIOT, side));
  // 2 Mystics
  for (let i = 0; i < 2; i++) pool.push(createPiece(PIECE_TYPES.MYSTIC, side));
  return pool;
}

export function createInitialGameState(requestedVariant = VARIANTS.TOWERS) {
  const variant = normalizeVariant(requestedVariant);
  if (!variant) {
    throw new Error(`Unknown game variant: ${requestedVariant}`);
  }
  const board = createEmptyBoard();

  // Helper to place piece
  function put(r, f, type, side) {
    board[r][f].push(createPiece(type, side, FACES.DAWN));
  }

  // Initial Placement: DAWN (Ranks 1-3)
  // Rank 1 (r=0): Chariot(a1), Bastion(c1), Sovereign(e1), Bastion(g1), Chariot(i1)
  put(0, 0, PIECE_TYPES.CHARIOT, SIDES.DAWN);
  put(0, 2, PIECE_TYPES.BASTION, SIDES.DAWN);
  put(0, 4, PIECE_TYPES.SOVEREIGN, SIDES.DAWN);
  put(0, 6, PIECE_TYPES.BASTION, SIDES.DAWN);
  put(0, 8, PIECE_TYPES.CHARIOT, SIDES.DAWN);

  // Rank 2 (r=1): Rider(b2), Mystic(d2), Mystic(f2), Rider(h2)
  put(1, 1, PIECE_TYPES.RIDER, SIDES.DAWN);
  put(1, 3, PIECE_TYPES.MYSTIC, SIDES.DAWN);
  put(1, 5, PIECE_TYPES.MYSTIC, SIDES.DAWN);
  put(1, 7, PIECE_TYPES.RIDER, SIDES.DAWN);

  // Rank 3 (r=2): Spear(a3), Scout(b3), Spear(c3-g3), Scout(h3), Spear(i3)
  put(2, 0, PIECE_TYPES.SPEAR, SIDES.DAWN); // a3
  put(2, 1, PIECE_TYPES.SCOUT, SIDES.DAWN);
  put(2, 2, PIECE_TYPES.SPEAR, SIDES.DAWN);
  put(2, 3, PIECE_TYPES.SPEAR, SIDES.DAWN);
  put(2, 4, PIECE_TYPES.SPEAR, SIDES.DAWN);
  put(2, 5, PIECE_TYPES.SPEAR, SIDES.DAWN);
  put(2, 6, PIECE_TYPES.SPEAR, SIDES.DAWN);
  put(2, 7, PIECE_TYPES.SCOUT, SIDES.DAWN);
  put(2, 8, PIECE_TYPES.SPEAR, SIDES.DAWN); // i3

  // Initial Placement: DUSK (Ranks 7-9)
  // Rank 9 (r=8): Chariot(a9), Bastion(c9), Sovereign(e9), Bastion(g9), Chariot(i9)
  put(8, 0, PIECE_TYPES.CHARIOT, SIDES.DUSK);
  put(8, 2, PIECE_TYPES.BASTION, SIDES.DUSK);
  put(8, 4, PIECE_TYPES.SOVEREIGN, SIDES.DUSK);
  put(8, 6, PIECE_TYPES.BASTION, SIDES.DUSK);
  put(8, 8, PIECE_TYPES.CHARIOT, SIDES.DUSK);

  // Rank 8 (r=7): Rider(b8), Mystic(d8), Mystic(f8), Rider(h8)
  put(7, 1, PIECE_TYPES.RIDER, SIDES.DUSK);
  put(7, 3, PIECE_TYPES.MYSTIC, SIDES.DUSK);
  put(7, 5, PIECE_TYPES.MYSTIC, SIDES.DUSK);
  put(7, 7, PIECE_TYPES.RIDER, SIDES.DUSK);

  // Rank 7 (r=6): Spear(a7), Scout(b7), Spear(c7-g7), Scout(h7), Spear(i7)
  put(6, 0, PIECE_TYPES.SPEAR, SIDES.DUSK); // a7
  put(6, 1, PIECE_TYPES.SCOUT, SIDES.DUSK);
  put(6, 2, PIECE_TYPES.SPEAR, SIDES.DUSK);
  put(6, 3, PIECE_TYPES.SPEAR, SIDES.DUSK);
  put(6, 4, PIECE_TYPES.SPEAR, SIDES.DUSK);
  put(6, 5, PIECE_TYPES.SPEAR, SIDES.DUSK);
  put(6, 6, PIECE_TYPES.SPEAR, SIDES.DUSK);
  put(6, 7, PIECE_TYPES.SCOUT, SIDES.DUSK);
  put(6, 8, PIECE_TYPES.SPEAR, SIDES.DUSK); // i7

  const initialHash = getStateHash(board, { DAWN: [], DUSK: [] }, SIDES.DAWN);

  return {
    variant,
    board,
    turn: SIDES.DAWN,
    phase: 'PLAY', // Immediately ready for battle!
    moveNumber: 1,
    turnCount: 1,
    captured: {
      DAWN: [], // Pieces captured by Dawn (permanently eliminated from board)
      DUSK: []  // Pieces captured by Dusk (permanently eliminated from board)
    },
    reserves: { // Retained for backwards compatibility / graveyard display
      DAWN: [],
      DUSK: []
    },
    discarded: {
      DAWN: [],
      DUSK: []
    },
    zenithState: {
      occupantSide: null,
      reachedOnTurn: 0,
      checkedDuringOpponentTurn: false
    },
    status: {
      isCheck: false,
      isCheckmate: false,
      isStalemate: false,
      isAscension: false,
      isRepetition: false,
      winner: null,
      reason: ''
    },
    history: [],
    repetitionMap: { [initialHash]: 1 }
  };
}

/**
 * Finds the coordinates of the Sovereign for a given side.
 */
export function findSovereign(board, side) {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let f = 0; f < BOARD_SIZE; f++) {
      const tower = board[r][f];
      if (tower.length > 0) {
        const top = tower[tower.length - 1];
        if (top.type === PIECE_TYPES.SOVEREIGN && top.side === side) {
          return { f, r };
        }
      }
    }
  }
  return null;
}

/**
 * Checks if a square is attacked by any pseudo-legal move of the given side.
 */
export function isSquareAttacked(board, targetF, targetR, bySide) {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let f = 0; f < BOARD_SIZE; f++) {
      const tower = board[r][f];
      if (tower.length > 0 && tower[tower.length - 1].side === bySide) {
        const moves = getPseudoLegalMoves(board, f, r);
        for (const m of moves) {
          if (m.to.f === targetF && m.to.r === targetR) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

/**
 * Checks if the specified side's Sovereign is currently in check.
 */
export function isCheck(board, side) {
  const sov = findSovereign(board, side);
  if (!sov) return false;
  const enemySide = side === SIDES.DAWN ? SIDES.DUSK : SIDES.DAWN;
  return isSquareAttacked(board, sov.f, sov.r, enemySide);
}

/**
 * Executes an action on a cloned board/reserves state to test King Safety.
 * Returns { newBoard, newReserves, newDiscarded, capturedPiece, promoted }
 */
export function simulateAction(board, reserves, discarded, action, side) {
  const nextBoard = cloneBoard(board);
  const nextReserves = {
    DAWN: reserves.DAWN.map(p => clonePiece(p)),
    DUSK: reserves.DUSK.map(p => clonePiece(p))
  };
  const nextDiscarded = {
    DAWN: discarded.DAWN.map(p => clonePiece(p)),
    DUSK: discarded.DUSK.map(p => clonePiece(p))
  };

  let capturedPiece = null;
  let promoted = false;

  if (action.action === 'MOVE') {
    const fromTower = nextBoard[action.from.r][action.from.f];
    const topPiece = fromTower.pop();

    const targetTower = nextBoard[action.to.r][action.to.f];

    if (action.type === 'NORMAL') {
      targetTower.push(topPiece);
    } else if (action.type === 'STACK') {
      targetTower.push(topPiece);
    } else if (action.type === 'CAPTURE_STANDALONE') {
      const captured = targetTower.pop();
      captured.side = side;
      captured.face = FACES.DAWN;
      nextReserves[side].push(captured);
      capturedPiece = captured;
      targetTower.push(topPiece); // Attacker advances
    } else if (action.type === 'CAPTURE_PEEL') {
      const captured = targetTower.pop();
      captured.side = side;
      captured.face = FACES.DAWN;
      nextReserves[side].push(captured);
      capturedPiece = captured;
      fromTower.push(topPiece); // Attacker stays on origin
    } else if (action.type === 'CAPTURE_AEGIS') {
      // Find lowest buried Bastion
      let bastIdx = -1;
      for (let i = 0; i < targetTower.length - 1; i++) {
        if (targetTower[i].type === PIECE_TYPES.BASTION) {
          bastIdx = i;
          break;
        }
      }
      if (bastIdx !== -1) {
        const [captured] = targetTower.splice(bastIdx, 1);
        captured.side = side;
        captured.face = FACES.DAWN;
        nextReserves[side].push(captured);
        capturedPiece = captured;
      }
      fromTower.push(topPiece); // Attacker stays on origin
    }

    // Promotion check
    if (action.promote) {
      topPiece.face = FACES.ECLIPSE;
      promoted = true;
    }
  } else if (action.action === 'DEPLOY') {
    const [deployed] = nextReserves[side].splice(action.reserveIndex, 1);
    deployed.face = FACES.DAWN;
    nextBoard[action.to.r][action.to.f].push(deployed);
  } else if (action.action === 'SACRIFICE') {
    const [sacrificed] = nextReserves[side].splice(action.reserveIndex, 1);
    nextDiscarded[side].push(sacrificed);
    const targetTower = nextBoard[action.targetSquare.r][action.targetSquare.f];
    if (targetTower.length > 0) {
      targetTower[targetTower.length - 1].face = FACES.ECLIPSE;
      promoted = true;
    }
  }

  return { nextBoard, nextReserves, nextDiscarded, capturedPiece, promoted };
}

/**
 * Validates that an action does not leave the moving side's Sovereign in check.
 */
export function isActionKingSafe(board, reserves, discarded, action, side) {
  const { nextBoard } = simulateAction(board, reserves, discarded, action, side);
  return !isCheck(nextBoard, side);
}

/**
 * Generates all strictly legal actions for a side.
 * In this mode, captured pieces are permanently removed from the game (no respawn/deploys).
 * Every action is guaranteed to leave own Sovereign safe from check.
 */
export function getAllLegalActions(state, side = state.turn) {
  const actions = [];
  const board = state.board;
  const reserves = state.reserves || { DAWN: [], DUSK: [] };
  const discarded = state.discarded || { DAWN: [], DUSK: [] };
  const moveOptions = { allowStacking: isStackingAllowed(state.variant) };
  const promotionAllowed = isPromotionAllowed(state.variant);

  // Board Moves
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let f = 0; f < BOARD_SIZE; f++) {
      const tower = board[r][f];
      if (tower.length > 0 && tower[tower.length - 1].side === side) {
        const pseudoMoves = getPseudoLegalMoves(board, f, r, moveOptions);
        const topPiece = tower[tower.length - 1];

        for (const pm of pseudoMoves) {
          // Check if promotion is possible via Horizon Rule
          // (never in the Simple game)
          const promoPossible = promotionAllowed && canPromote(side, topPiece, r, pm.to.r);

          if (promoPossible) {
            // Action with promotion
            const actionWithPromo = { ...pm, promote: true };
            if (isActionKingSafe(board, reserves, discarded, actionWithPromo, side)) {
              actions.push(actionWithPromo);
            }
            // Action without promotion (promotion is optional!)
            const actionWithoutPromo = { ...pm, promote: false };
            if (isActionKingSafe(board, reserves, discarded, actionWithoutPromo, side)) {
              actions.push(actionWithoutPromo);
            }
          } else {
            const action = { ...pm, promote: false };
            if (isActionKingSafe(board, reserves, discarded, action, side)) {
              actions.push(action);
            }
          }
        }
      }
    }
  }

  return actions;
}

/**
 * Creates a unique hash for threefold repetition detection.
 */
export function getStateHash(board, reserves, turn) {
  let str = `${turn}:`;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let f = 0; f < BOARD_SIZE; f++) {
      const tower = board[r][f];
      if (tower.length > 0) {
        str += `[${f},${r}:`;
        for (const p of tower) {
          str += `${p.side[0]}${p.type[0]}${p.face[0]}`;
        }
        str += ']';
      }
    }
  }
  str += `|R_DAWN:`;
  const dawnRes = reserves.DAWN.map(p => p.type).sort().join('');
  str += dawnRes;
  str += `|R_DUSK:`;
  const duskRes = reserves.DUSK.map(p => p.type).sort().join('');
  str += duskRes;
  return str;
}

/**
 * Generates an algebraic notation string for an action.
 */
export function getActionNotation(action, capturedPiece = null) {
  if (action.action === 'MOVE') {
    const fromStr = formatSquare(action.from.f, action.from.r);
    const toStr = formatSquare(action.to.f, action.to.r);
    const pieceAbbr = action.piece.type === PIECE_TYPES.SPEAR ? 'Sp' :
                      action.piece.type === PIECE_TYPES.BASTION ? 'B' :
                      action.piece.type === PIECE_TYPES.SCOUT ? 'Sc' :
                      action.piece.type === PIECE_TYPES.RIDER ? 'R' :
                      action.piece.type === PIECE_TYPES.CHARIOT ? 'C' :
                      action.piece.type === PIECE_TYPES.MYSTIC ? 'M' : 'S';

    let sym = '-';
    if (action.type === 'STACK') sym = '+';
    else if (action.type.startsWith('CAPTURE')) sym = 'x';

    let not = `${pieceAbbr} ${fromStr}${sym}${toStr}`;
    if (action.type === 'CAPTURE_PEEL') not += ' (peel)';
    else if (action.type === 'CAPTURE_AEGIS') not += ' (aegis)';

    if (action.promote) not += '★';
    return not;
  } else if (action.action === 'DEPLOY') {
    const toStr = formatSquare(action.to.f, action.to.r);
    const pieceAbbr = action.piece.type === PIECE_TYPES.SPEAR ? 'Sp' :
                      action.piece.type === PIECE_TYPES.BASTION ? 'B' :
                      action.piece.type === PIECE_TYPES.SCOUT ? 'Sc' :
                      action.piece.type === PIECE_TYPES.RIDER ? 'R' :
                      action.piece.type === PIECE_TYPES.CHARIOT ? 'C' :
                      action.piece.type === PIECE_TYPES.MYSTIC ? 'M' : 'S';
    return `Deploy ${pieceAbbr}@${toStr}`;
  } else if (action.action === 'SACRIFICE') {
    const toStr = formatSquare(action.targetSquare.f, action.targetSquare.r);
    return `Awaken★ @${toStr}`;
  }
  return 'Unknown action';
}

/**
 * Applies a verified action to the game state.
 * Updates turn, reserves, check status, checkmate, ascension, and history.
 */
export function applyAction(state, action) {
  if (state.phase !== 'PLAY') {
    throw new Error(`Cannot execute game action while in phase: ${state.phase}`);
  }

  const side = state.turn;
  const enemySide = side === SIDES.DAWN ? SIDES.DUSK : SIDES.DAWN;

  // 1. Simulate the action
  const { nextBoard, nextReserves, nextDiscarded, capturedPiece, promoted } =
    simulateAction(state.board, state.reserves, state.discarded, action, side);

  // Check if Sovereign was in check on Zenith during opponent's turn
  let nextZenithState = { ...state.zenithState };

  // Did Sovereign move onto Zenith (e5)?
  if (action.action === 'MOVE' && action.piece.type === PIECE_TYPES.SOVEREIGN) {
    if (isZenith(action.to.f, action.to.r)) {
      nextZenithState = {
        occupantSide: side,
        reachedOnTurn: state.turnCount,
        checkedDuringOpponentTurn: false
      };
    } else if (nextZenithState.occupantSide === side) {
      // Sovereign moved off Zenith
      nextZenithState = { occupantSide: null, reachedOnTurn: 0, checkedDuringOpponentTurn: false };
    }
  }

  // 2. Is enemy Sovereign put in check?
  const enemyInCheck = isCheck(nextBoard, enemySide);

  // If enemy Sovereign is currently on Zenith, check if this move threatens them
  if (nextZenithState.occupantSide === enemySide) {
    if (enemyInCheck) {
      nextZenithState.checkedDuringOpponentTurn = true;
    }
  } else if (nextZenithState.occupantSide === side) {
    // Current player was on Zenith and just finished their resolving turn:
    // Reset checked flag so opponent must check them on this upcoming opponent turn
    nextZenithState.checkedDuringOpponentTurn = false;
  }

  // Check Ascension Victory:
  // Rule 7.2: If enemySide Sovereign was on e5, and current side (the opponent) just finished
  // their turn without putting enemy Sovereign in check!
  let isAscensionWin = false;
  let ascensionWinner = null;

  if (nextZenithState.occupantSide === enemySide &&
      state.turnCount > nextZenithState.reachedOnTurn &&
      !nextZenithState.checkedDuringOpponentTurn) {
    isAscensionWin = true;
    ascensionWinner = enemySide;
  }

  const notation = getActionNotation(action, capturedPiece);

  // Create next state
  const nextState = {
    ...state,
    board: nextBoard,
    turn: enemySide,
    turnCount: state.turnCount + 1,
    moveNumber: side === SIDES.DUSK ? state.moveNumber + 1 : state.moveNumber,
    reserves: nextReserves,
    discarded: nextDiscarded,
    zenithState: nextZenithState,
    status: {
      isCheck: enemyInCheck,
      isCheckmate: false,
      isStalemate: false,
      isAscension: isAscensionWin,
      isRepetition: false,
      winner: isAscensionWin ? ascensionWinner : null,
      reason: isAscensionWin ? `${ascensionWinner} ascends to the Zenith (e5) in glorious victory!` : ''
    },
    history: [
      ...state.history,
      {
        action,
        side,
        notation,
        check: enemyInCheck
      }
    ],
    repetitionMap: { ...state.repetitionMap }
  };

  // If Ascension won, end game immediately
  if (isAscensionWin) {
    nextState.phase = 'GAME_OVER';
    return nextState;
  }

  // Check Threefold Repetition
  const hash = getStateHash(nextBoard, nextReserves, enemySide);
  nextState.repetitionMap[hash] = (nextState.repetitionMap[hash] || 0) + 1;
  if (nextState.repetitionMap[hash] >= 3) {
    nextState.phase = 'GAME_OVER';
    nextState.status.isRepetition = true;
    nextState.status.reason = 'Game drawn by Threefold Repetition!';
    return nextState;
  }

  // Check legal actions for enemy
  const enemyLegalActions = getAllLegalActions(nextState, enemySide);

  if (enemyLegalActions.length === 0) {
    nextState.phase = 'GAME_OVER';
    if (enemyInCheck) {
      // Checkmate!
      nextState.status.isCheckmate = true;
      nextState.status.winner = side;
      nextState.status.reason = `Checkmate! ${side} captures victory.`;
    } else {
      // Stalemate / No legal moves (Rule 7.3: player with no legal moves loses!)
      nextState.status.isStalemate = true;
      nextState.status.winner = side;
      nextState.status.reason = `${enemySide} has no legal moves. ${side} wins by Stalemate!`;
    }
  }

  return nextState;
}

/**
 * Executes a draft placement of 1 piece into Citadel.
 */
export function placeDraftPiece(state, pieceIndex, toF, toR) {
  if (state.phase !== 'DRAFT') {
    throw new Error('Not in draft phase.');
  }

  const side = state.draft.currentDraftSide;
  const pool = state.draft.unplacedPool[side];
  if (pieceIndex < 0 || pieceIndex >= pool.length) {
    throw new Error('Invalid piece index from draft pool.');
  }

  // Validate square is inside player's Citadel
  const inCitadel = side === SIDES.DAWN ? isDawnCitadel(toR) : isDuskCitadel(toR);
  if (!inCitadel) {
    throw new Error(`Square ${formatSquare(toF, toR)} is not inside ${side}'s Citadel.`);
  }

  const tower = state.board[toR][toF];
  // Cannot stack onto Sovereign
  if (tower.length > 0) {
    const top = tower[tower.length - 1];
    if (top.type === PIECE_TYPES.SOVEREIGN) {
      throw new Error('Cannot stack on Sovereign during draft.');
    }
    // Max height during draft is 2
    if (tower.length >= 2) {
      throw new Error('Towers can only be stacked up to Tier 2 during draft.');
    }
  }

  const nextBoard = cloneBoard(state.board);
  const nextPool = {
    DAWN: [...state.draft.unplacedPool.DAWN],
    DUSK: [...state.draft.unplacedPool.DUSK]
  };

  const [piece] = nextPool[side].splice(pieceIndex, 1);
  piece.face = FACES.DAWN;
  nextBoard[toR][toF].push(piece);

  let nextPiecesPlaced = state.draft.piecesPlacedThisDraftTurn + 1;
  let nextDraftSide = side;

  // Alternate players after 2 pieces are placed (or last 1 piece of 15)
  // Total 15 pieces per side.
  const remainingForSide = nextPool[side].length;
  const turnLimit = remainingForSide === 0 ? 1 : 2;

  if (nextPiecesPlaced >= turnLimit) {
    nextPiecesPlaced = 0;
    nextDraftSide = side === SIDES.DAWN ? SIDES.DUSK : SIDES.DAWN;
  }

  // Check if draft is finished
  const dawnDone = nextPool.DAWN.length === 0;
  const duskDone = nextPool.DUSK.length === 0;
  const draftFinished = dawnDone && duskDone;

  const nextState = {
    ...state,
    board: nextBoard,
    phase: draftFinished ? 'PLAY' : 'DRAFT',
    turn: SIDES.DAWN, // Dawn always goes first once play begins
    draft: {
      currentDraftSide: nextDraftSide,
      piecesPlacedThisDraftTurn: nextPiecesPlaced,
      unplacedPool: nextPool
    }
  };

  if (draftFinished) {
    // Initialize hash
    const hash = getStateHash(nextBoard, nextState.reserves, SIDES.DAWN);
    nextState.repetitionMap = { [hash]: 1 };
  }

  return nextState;
}

/**
 * Pre-made draft setups for instant play
 */
export const DRAFT_PRESETS = {
  STANDARD: 'Standard Balanced',
  FORTRESS: 'Bastion Fortress',
  WINGS: 'Cavalry Wings',
  VANGUARD: 'Spear Vanguard'
};

export function applyDraftPreset(presetKey, variant = VARIANTS.TOWERS) {
  // Initial state is already fully placed and ready to play
  return createInitialGameState(variant);
}

/**
 * Rebuilds a game state by replaying a list of actions from the start position.
 * Used by Undo and as a safe way to restore saved games.
 */
export function replayActions(variant, actions) {
  let state = createInitialGameState(variant);
  for (const action of actions) {
    state = applyAction(state, action);
  }
  return state;
}
