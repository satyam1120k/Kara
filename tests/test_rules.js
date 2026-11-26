/**
 * Comprehensive Automated Test Suite for KĀRA
 */

import {
  SIDES,
  FACES,
  PIECE_TYPES,
  BOARD_SIZE,
  VARIANTS,
  createPiece,
  getTowerEchoes,
  getPseudoLegalMoves
} from '../public/js/engine.js';

import {
  createEmptyBoard,
  createInitialGameState,
  applyDraftPreset,
  DRAFT_PRESETS,
  getAllLegalActions,
  applyAction,
  isCheck,
  findSovereign,
  replayActions
} from '../public/js/rules.js';

function assert(cond, msg) {
  if (!cond) {
    console.error(`❌ Assertion Failed: ${msg}`);
    process.exit(1);
  }
}

console.log('--- Starting Kāra Rules Test Suite ---');

// Test 1: Echoes Calculation
{
  console.log('Test 1: Echo calculation on stacked towers');
  const tower = [
    createPiece(PIECE_TYPES.CHARIOT, SIDES.DAWN), // buried Tier 1
    createPiece(PIECE_TYPES.SPEAR, SIDES.DAWN),   // buried Tier 2
    createPiece(PIECE_TYPES.SPEAR, SIDES.DAWN)    // top Tier 3
  ];

  const echoes = getTowerEchoes(tower);
  assert(echoes.thrustBonus === 1, `Expected thrustBonus 1, got ${echoes.thrustBonus}`);
  assert(echoes.horizonBonus === 2, `Expected horizonBonus 2, got ${echoes.horizonBonus}`);
  assert(echoes.hasAegis === false, `Expected no Aegis`);
  console.log('✅ Test 1 Passed');
}

// Test 2: Horizon + Thrust interaction on Spear
{
  console.log('Test 2: Horizon + Thrust interaction on Spear movement range');
  const board = createEmptyBoard();
  // Place tower on e2 (f=4, r=1)
  board[1][4] = [
    createPiece(PIECE_TYPES.CHARIOT, SIDES.DAWN),
    createPiece(PIECE_TYPES.SPEAR, SIDES.DAWN),
    createPiece(PIECE_TYPES.SPEAR, SIDES.DAWN)
  ];

  const moves = getPseudoLegalMoves(board, 4, 1);
  // Forward for Dawn is +r. From r=1: r=2, r=3, r=4, r=5 (4 steps forward!)
  const forwardSquares = moves.map(m => `${m.to.f},${m.to.r}`);
  assert(forwardSquares.includes('4,2'), 'Should reach e3');
  assert(forwardSquares.includes('4,3'), 'Should reach e4');
  assert(forwardSquares.includes('4,4'), 'Should reach e5');
  assert(forwardSquares.includes('4,5'), 'Should reach e6 (1 base + 1 thrust + 2 horizon = 4 squares)');
  assert(!forwardSquares.includes('4,6'), 'Should NOT reach e7');
  console.log('✅ Test 2 Passed');
}

// Test 3: Vault (Scout buried) leaping over 1 piece
{
  console.log('Test 3: Vault leaping over 1 intervening piece');
  const board = createEmptyBoard();
  // Chariot on top of Scout on e2
  board[1][4] = [
    createPiece(PIECE_TYPES.SCOUT, SIDES.DAWN), // buried Scout grants Vault
    createPiece(PIECE_TYPES.CHARIOT, SIDES.DAWN)
  ];
  // An obstacle piece on e4 (r=3, f=4)
  board[3][4] = [
    createPiece(PIECE_TYPES.SPEAR, SIDES.DUSK)
  ];

  const moves = getPseudoLegalMoves(board, 4, 1);
  const targets = moves.map(m => `${m.to.f},${m.to.r}`);
  // Should target e3 (empty)
  assert(targets.includes('4,2'), 'Can move to e3');
  // Should target e4 (enemy capture)
  assert(targets.includes('4,3'), 'Can capture on e4');
  // With Vault, should leap over e4 and reach e5, e6!
  assert(targets.includes('4,4'), 'Vault allows leaping over e4 to reach e5');
  assert(targets.includes('4,5'), 'Vault allows reaching e6');
  console.log('✅ Test 3 Passed');
}

// Test 4: Aegis protection
{
  console.log('Test 4: Aegis absorbs attack on tower');
  let state = applyDraftPreset(DRAFT_PRESETS.STANDARD);

  // Set up custom board:
  // Dawn Spear at e4
  // Dusk tower at e5 with Bastion buried: [Bastion, Spear]
  state.board = createEmptyBoard();
  state.board[0][4] = [createPiece(PIECE_TYPES.SOVEREIGN, SIDES.DAWN)];
  state.board[8][4] = [createPiece(PIECE_TYPES.SOVEREIGN, SIDES.DUSK)];

  state.board[3][4] = [createPiece(PIECE_TYPES.SPEAR, SIDES.DAWN)];
  state.board[4][4] = [
    createPiece(PIECE_TYPES.BASTION, SIDES.DUSK), // buried Bastion -> Aegis!
    createPiece(PIECE_TYPES.SPEAR, SIDES.DUSK)    // top Spear
  ];

  const actions = getAllLegalActions(state, SIDES.DAWN);
  const attackMove = actions.find(a => a.action === 'MOVE' && a.to.f === 4 && a.to.r === 4);
  assert(attackMove, 'Dawn Spear must be able to attack e5');
  assert(attackMove.type === 'CAPTURE_AEGIS', 'Attack type should be CAPTURE_AEGIS');

  const nextState = applyAction(state, attackMove);

  // Attacker should stay on e4!
  assert(nextState.board[3][4].length === 1, 'Attacker stays on e4');
  assert(nextState.board[3][4][0].type === PIECE_TYPES.SPEAR, 'Attacker is Spear');

  // Target tower at e5 should now have only the top Spear!
  assert(nextState.board[4][4].length === 1, 'Target tower dropped to height 1');
  assert(nextState.board[4][4][0].type === PIECE_TYPES.SPEAR, 'Top Spear remains');

  // Dawn reserve should have received the captured Bastion
  assert(nextState.reserves.DAWN.length === 1, 'Dawn reserve has 1 piece');
  assert(nextState.reserves.DAWN[0].type === PIECE_TYPES.BASTION, 'Captured piece is Bastion');
  assert(nextState.reserves.DAWN[0].side === SIDES.DAWN, 'Captured piece converted to Dawn');
  console.log('✅ Test 4 Passed');
}

// Test 5: Peeling Strike on multi-tier tower without Aegis
{
  console.log('Test 5: Peeling strike on multi-tier tower without Aegis');
  let state = createInitialGameState();
  state.phase = 'PLAY';
  state.turn = SIDES.DAWN;

  state.board[3][4] = [createPiece(PIECE_TYPES.SPEAR, SIDES.DAWN)];
  state.board[4][4] = [
    createPiece(PIECE_TYPES.SCOUT, SIDES.DUSK),
    createPiece(PIECE_TYPES.SPEAR, SIDES.DUSK)
  ];

  const actions = getAllLegalActions(state, SIDES.DAWN);
  const peelMove = actions.find(a => a.action === 'MOVE' && a.to.f === 4 && a.to.r === 4);
  assert(peelMove.type === 'CAPTURE_PEEL', 'Attack type should be CAPTURE_PEEL');

  const nextState = applyAction(state, peelMove);

  // Attacker stays on origin
  assert(nextState.board[3][4].length === 1, 'Attacker stays on origin e4');
  // Target tower at e5 now has Scout
  assert(nextState.board[4][4].length === 1, 'Target tower has 1 piece remaining');
  assert(nextState.board[4][4][0].type === PIECE_TYPES.SCOUT, 'Exposed piece is Scout');
  // Dawn reserve has captured Spear
  assert(nextState.reserves.DAWN[0].type === PIECE_TYPES.SPEAR, 'Dawn captured top Spear');
  console.log('✅ Test 5 Passed');
}

// Test 6: Ascension Victory condition
{
  console.log('Test 6: Ascension victory on Zenith (e5)');
  let state = createInitialGameState();
  state.phase = 'PLAY';
  state.turn = SIDES.DAWN;

  // Sovereign moves to e5 (f=4, r=4)
  state.board[0][4] = []; // clear e1
  state.board[3][4] = [createPiece(PIECE_TYPES.SOVEREIGN, SIDES.DAWN)]; // e4

  const moveAction = {
    action: 'MOVE',
    from: { f: 4, r: 3 },
    to: { f: 4, r: 4 },
    piece: state.board[3][4][0],
    type: 'NORMAL',
    promote: false
  };

  state = applyAction(state, moveAction);
  assert(state.zenithState.occupantSide === SIDES.DAWN, 'Zenith occupied by Dawn');
  assert(state.turn === SIDES.DUSK, 'Now Dusk turn');

  // Dusk makes a peaceful move (moves Sovereign on e9 to d9)
  const duskAction = {
    action: 'MOVE',
    from: { f: 4, r: 8 },
    to: { f: 3, r: 8 },
    piece: state.board[8][4][0],
    type: 'NORMAL',
    promote: false
  };

  state = applyAction(state, duskAction);
  // Dawn Sovereign survived Dusk turn on e5 without being put in check!
  // Rule 7.2: Player Sovereign moved onto e5 and remained through one full opponent turn without being placed in Check
  console.log('State after Dusk turn: phase =', state.phase, 'status =', state.status);
  assert(state.status.isAscension === true, 'Ascension victory must trigger immediately at conclusion of Dusk turn!');
  assert(state.status.winner === SIDES.DAWN, 'Dawn wins by Ascension');
  assert(state.phase === 'GAME_OVER', 'Game is over');
  console.log('✅ Test 6 Passed');
}

// Test 7: Horizon Citadel Promotion (Awaken to Eclipse)
{
  console.log('Test 7: Horizon Citadel Promotion');
  const board = createEmptyBoard();
  board[0][4] = [createPiece(PIECE_TYPES.SOVEREIGN, SIDES.DAWN)];
  board[8][4] = [createPiece(PIECE_TYPES.SOVEREIGN, SIDES.DUSK)];

  // Dawn Spear at e6 (r=5, f=4), moving into Dusk Citadel at e7 (r=6, f=4)
  board[5][4] = [createPiece(PIECE_TYPES.SPEAR, SIDES.DAWN, FACES.DAWN)];

  const state = {
    board,
    turn: SIDES.DAWN,
    phase: 'PLAY',
    turnCount: 1,
    moveNumber: 1,
    reserves: { DAWN: [], DUSK: [] },
    discarded: { DAWN: [], DUSK: [] },
    zenithState: { occupantSide: null, reachedOnTurn: 0, checkedDuringOpponentTurn: false },
    status: { isCheck: false, isCheckmate: false, isStalemate: false, isAscension: false, winner: null },
    history: [],
    repetitionMap: {}
  };

  const actions = getAllLegalActions(state, SIDES.DAWN);
  const promoAction = actions.find(a => a.promote === true && a.to.r === 6 && a.to.f === 4);
  assert(promoAction, 'Should allow Horizon promotion when moving into Citadel');

  const nextState = applyAction(state, promoAction);
  assert(nextState.board[6][4][0].face === FACES.ECLIPSE, 'Piece promotes to Eclipse face!');
  console.log('✅ Test 7 Passed');
}

// Test 8: Gallop and Phase Echoes
{
  console.log('Test 8: Gallop (Rider) and Phase (Mystic) Echoes');
  const board = createEmptyBoard();
  // Bastion on top of Rider + Mystic at d4 (f=3, r=3)
  board[3][3] = [
    createPiece(PIECE_TYPES.RIDER, SIDES.DAWN),  // grants Gallop
    createPiece(PIECE_TYPES.MYSTIC, SIDES.DAWN), // grants Phase
    createPiece(PIECE_TYPES.BASTION, SIDES.DAWN) // top piece
  ];

  const moves = getPseudoLegalMoves(board, 3, 3);
  const targets = moves.map(m => `${m.to.f},${m.to.r}`);

  // Gallop grants (3+1, 3+2) = (4, 5) which is e6
  assert(targets.includes('4,5'), 'Top Bastion should gain Gallop leap to e6');
  assert(targets.includes('2,5'), 'Top Bastion should gain Gallop leap to c6');

  // Phase grants 1-step diagonal: (3+1, 3+1) = (4, 4) which is e5!
  assert(targets.includes('4,4'), 'Top Bastion should gain Phase diagonal step to e5');
  console.log('✅ Test 8 Passed');
}

// Test 9: Initial Board Placement
{
  console.log('Test 9: Initial Board Placement Verification');
  const state = createInitialGameState();
  assert(state.phase === 'PLAY', 'Game starts immediately in PLAY phase');
  assert(state.turn === SIDES.DAWN, 'Dawn takes first turn');

  // Count pieces on board
  let dawnCount = 0;
  let duskCount = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let f = 0; f < BOARD_SIZE; f++) {
      for (const p of state.board[r][f]) {
        if (p.side === SIDES.DAWN) dawnCount++;
        else if (p.side === SIDES.DUSK) duskCount++;
      }
    }
  }

  assert(dawnCount === 18, `Expected 18 Dawn pieces (including flank spears on a3 & i3), got ${dawnCount}`);
  assert(duskCount === 18, `Expected 18 Dusk pieces (including flank spears on a7 & i7), got ${duskCount}`);
  console.log('✅ Test 9 Passed (All 36 pieces initially on board with a & i flank spears)');
}

// Test 11: Game types (Simple / Eclipse / Towers)
{
  console.log('Test 11: Simple vs Eclipse vs Towers');
  for (const v of [VARIANTS.SIMPLE, VARIANTS.ECLIPSE, VARIANTS.TOWERS]) {
    assert(createInitialGameState(v).variant === v, `${v} state records its type`);
  }
  assert(createInitialGameState().variant === VARIANTS.TOWERS, 'Default type is Towers');
  assert(createInitialGameState('CLASSIC').variant === VARIANTS.ECLIPSE, 'Old "CLASSIC" games load as Eclipse');
  let threw = false;
  try { createInitialGameState('NOPE'); } catch { threw = true; }
  assert(threw, 'Unknown type is rejected');

  // Stacking: only Towers
  const stacks = (v) => getAllLegalActions(createInitialGameState(v)).some(a => a.type === 'STACK');
  assert(stacks(VARIANTS.TOWERS), 'Towers allows stacking');
  assert(!stacks(VARIANTS.SIMPLE) && !stacks(VARIANTS.ECLIPSE), 'Simple and Eclipse never stack');

  // Promotion: a Dawn Spear on c6 steps into the Dusk Citadel (c7).
  const promoOptions = (v) => {
    const st = createInitialGameState(v);
    st.board = createEmptyBoard();
    st.board[0][0].push(createPiece(PIECE_TYPES.SOVEREIGN, SIDES.DAWN));
    st.board[8][8].push(createPiece(PIECE_TYPES.SOVEREIGN, SIDES.DUSK));
    st.board[5][2].push(createPiece(PIECE_TYPES.SPEAR, SIDES.DAWN));
    return getAllLegalActions(st).filter(a => a.from.f === 2 && a.from.r === 5 && a.to.r === 6);
  };
  const simple = promoOptions(VARIANTS.SIMPLE);
  assert(simple.length === 1 && simple[0].promote === false, 'Simple: entering the Citadel never promotes');
  for (const v of [VARIANTS.ECLIPSE, VARIANTS.TOWERS]) {
    const o = promoOptions(v);
    assert(o.some(a => a.promote) && o.some(a => !a.promote), `${v}: promotion is offered (and optional)`);
  }

  // Random play: Simple never promotes or stacks; Eclipse never stacks.
  let seed = 12345;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (const v of [VARIANTS.SIMPLE, VARIANTS.ECLIPSE]) {
    let s = createInitialGameState(v);
    for (let ply = 0; ply < 120 && s.phase === 'PLAY'; ply++) {
      const acts = getAllLegalActions(s);
      if (v === VARIANTS.SIMPLE) assert(!acts.some(a => a.promote), `Simple offered a promotion on ply ${ply}`);
      s = applyAction(s, acts[Math.floor(rand() * acts.length)]);
      assert(s.variant === v, 'Type survives applyAction');
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let f = 0; f < BOARD_SIZE; f++) {
          assert(s.board[r][f].length <= 1, `${v} formed a tower at ${f},${r} on ply ${ply}`);
          if (v === VARIANTS.SIMPLE && s.board[r][f][0]) assert(s.board[r][f][0].face === FACES.DAWN, 'Simple pieces stay on their Dawn face');
        }
      }
    }
    // replayActions rebuilds an identical position (used by Undo and save/resume).
    const replayed = replayActions(v, s.history.map(h => h.action));
    const boardKey = (b) => JSON.stringify(b.map(row => row.map(t => t.map(p => `${p.side}${p.type}${p.face}`))));
    assert(boardKey(replayed.board) === boardKey(s.board), `${v}: replay reproduces the board`);
    assert(replayed.turn === s.turn && replayed.variant === s.variant, `${v}: replay reproduces turn and type`);
  }
  console.log('✅ Test 11 Passed');
}

// Test 13: Elo ratings and titles
{
  console.log('Test 13: Elo & titles');
  const { computeElo, getTitle, MIN_RATING } = await import('../public/js/ratings.js');
  let e = computeElo(1200, 0, 1200, 0, 1);
  assert(e.deltaA === 20 && e.deltaB === -20, 'Equal new players: +20 / -20');
  e = computeElo(1200, 50, 1200, 50, 0.5);
  assert(e.deltaA === 0 && e.deltaB === 0, 'Draw between equals changes nothing');
  e = computeElo(1000, 50, 1600, 50, 1);
  assert(e.deltaA > 15, `Upset win earns more (got ${e.deltaA})`);
  e = computeElo(1600, 50, 1000, 50, 1);
  assert(e.deltaA >= 0 && e.deltaA < 5, `Expected win earns little (got ${e.deltaA})`);
  e = computeElo(110, 50, 2000, 50, 0);
  assert(e.a >= MIN_RATING, 'Rating never drops below the floor');
  assert(getTitle(1199).name === 'Newbie' && getTitle(1200).name === 'Pupil', 'Title boundary at 1200');
  assert(getTitle(2400).name === 'Grandmaster' && getTitle(3500).name === 'Legendary Grandmaster', 'Top titles');
  console.log('✅ Test 13 Passed');
}

// Test 10: AI Action Generation
{
  console.log('Test 10: AI decision making');
  const state = createInitialGameState();
  import('../public/js/ai.js').then(async ({ getBestAIAction, AI_DIFFICULTIES }) => {
    const aiAction = await getBestAIAction(state, AI_DIFFICULTIES.ADEPT);
    assert(aiAction !== null, 'AI should return a valid action');
    console.log('AI selected action:', aiAction.action, aiAction.piece ? aiAction.piece.type : '', aiAction.to);
    console.log('✅ Test 10 Passed');

    const simpleAction = await getBestAIAction(createInitialGameState(VARIANTS.SIMPLE), AI_DIFFICULTIES.ADEPT);
    assert(simpleAction && simpleAction.type !== 'STACK' && !simpleAction.promote, 'AI never stacks or promotes in Simple');
    const eclipseAction = await getBestAIAction(createInitialGameState(VARIANTS.ECLIPSE), AI_DIFFICULTIES.ADEPT);
    assert(eclipseAction && eclipseAction.type !== 'STACK', 'AI never stacks in Eclipse');
    console.log('✅ Test 12 Passed (AI respects each game type)');
    console.log('🎉 ALL TEST SUITES PASSED PERFECTLY!');
  });
}
