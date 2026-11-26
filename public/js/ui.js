/**
 * KĀRA: Master UI Controller & Interaction Engine
 * Chess.com Clean Minimalist Edition (responsive: desktop + mobile)
 */

import {
  SIDES,
  PIECE_SYMBOLS,
  BOARD_SIZE,
  VARIANTS,
  VARIANT_INFO,
  normalizeVariant,
  formatSquare,
  isDawnCitadel,
  isDuskCitadel,
  isSanctum,
  isZenith,
  getTowerEchoes
} from './engine.js';

import {
  createInitialGameState,
  getAllLegalActions,
  applyAction,
  replayActions
} from './rules.js';

import { AI_DIFFICULTIES } from './ai.js';
import { requestAIAction } from './ai-client.js';
import { sounds } from './audio.js';
import { COMPENDIUM_DATA, renderMoveGrid } from './compendium.js';
import { saveGame, loadGame, clearSavedGame, loadPrefs, savePrefs } from './storage.js';
import { AccountUI, setAvatar, ratedName } from './account.js';
import { OnlineController } from './online.js';
import { getTitle } from './ratings.js';
import { createPieceEl, pieceHtml } from './piece-art.js';

const START_CLOCK_SECONDS = 600;
const ONLINE_MODES = ['ONLINE', 'INVITE'];

export class KaraUI {
  constructor() {
    this.state = null;
    this.selectedSquare = null; // { f, r }
    this.lastMove = null; // { from: {f, r}, to: {f, r} }
    this.currentLegalActions = [];
    this.pendingPromotionAction = null;

    const prefs = loadPrefs();
    this.variant = normalizeVariant(prefs.variant) || VARIANTS.TOWERS;
    this.gameMode = prefs.gameMode || 'PVC_DUSK'; // 'PVP' | 'PVC_DUSK' | 'PVC_DAWN' | 'CVC'
    this.aiDifficulty = prefs.aiDifficulty || AI_DIFFICULTIES.ADEPT;
    this.isAiThinking = false;
    this.isAiRunning = false;
    this.aiSpeedMs = 800;
    this.is3D = false;
    this.gameStarted = false;

    // Incremented whenever the game is replaced (new game / undo / restore) so
    // an AI answer that arrives late for an old position is ignored.
    this.gameToken = 0;

    // Only devices with a real pointer get hover-to-inspect.
    this.canHover = window.matchMedia && window.matchMedia('(hover: hover)').matches;

    // Chess Clocks (10 minutes each, frozen until the game starts)
    this.timers = { DAWN: START_CLOCK_SECONDS, DUSK: START_CLOCK_SECONDS };
    this.timerInterval = null;

    // Online state (null when playing locally)
    this.onlineGame = null;
    this.onlineConnection = 'connected';
    this.offlineOnly = false; // true when the user chose "Play offline"
    this.flipped = false;     // board drawn from Dusk's side
    this.lastOpponentPref = prefs.opponent || 'ONLINE';

    this.cacheElements();
    this.initNewGameChooser();
    this.bindEvents();
    this.initCompendium();

    // A local game is drawn behind the login screen so the page never looks empty.
    this.startNewGame(this.variant, { silent: true, keepSave: true });

    this.online = new OnlineController(this);
    this.account = new AccountUI({
      onLogin: (user, activeGameId) => this.afterLogin(user, activeGameId),
      onLogout: () => this.afterLogout(),
      onPlayOffline: () => this.playOffline(),
      onUserChanged: () => this.renderPlayerBars()
    });
    this.account.boot();
  }

  /* ==========================================================================
     Login flow
     ========================================================================== */

  afterLogin(user, activeGameId) {
    this.offlineOnly = false;
    this.refreshChooserOpponents();

    // 1. Opened an invite link?  2. Unfinished online game?  3. Local game?  4. Chooser.
    const params = new URLSearchParams(location.search);
    const linkGame = params.get('game');
    if (linkGame && /^[0-9a-f]{64}$/.test(linkGame)) {
      history.replaceState(null, '', location.pathname);
      this.online.join(linkGame);
      return;
    }
    if (activeGameId) {
      this.online.join(activeGameId);
      return;
    }
    if (!this.restoreSavedGame()) this.openNewGameModal();
  }

  afterLogout() {
    this.online.cancelSearch();
    this.online.leave();
    this.onlineGame = null;
    this.gameMode = this.lastLocalMode || 'PVC_DUSK';
    this.flipped = false;
    this.startNewGame(this.variant, { silent: true, keepSave: true });
  }

  playOffline() {
    this.offlineOnly = true;
    this.refreshChooserOpponents();
    if (!this.restoreSavedGame()) this.openNewGameModal();
  }

  get isOnline() {
    return this.gameMode === 'ONLINE' && !!this.onlineGame;
  }

  /** True while an online game is being played (not finished). */
  get onlineGameActive() {
    return this.isOnline && this.onlineGame.status !== 'OVER';
  }

  /* ==========================================================================
     Toast notifications
     ========================================================================== */

  showToast(text, actions = [], timeoutMs = 4000) {
    clearTimeout(this.toastTimer);
    this.toastText.textContent = text;
    this.toastActions.textContent = '';
    for (const a of actions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn ${a.primary ? 'btn-green' : 'btn-secondary'}`;
      b.textContent = a.label;
      b.addEventListener('click', () => {
        this.hideToast();
        a.onClick();
      });
      this.toastActions.appendChild(b);
    }
    this.toastEl.style.display = 'flex';
    if (timeoutMs) this.toastTimer = setTimeout(() => this.hideToast(), timeoutMs);
  }

  hideToast() {
    clearTimeout(this.toastTimer);
    this.toastEl.style.display = 'none';
  }

  /* ==========================================================================
     Online game callbacks (from OnlineController)
     ========================================================================== */

  onOnlineState(msg) {
    const g = msg.game;
    this.onlineGame = {
      id: g.id,
      you: msg.you,
      status: g.status,
      players: g.players,
      host: g.host,
      clocks: g.clocks,
      clocksRunning: g.clocksRunning,
      turnStartedAt: g.turnStartedAt,
      firstMoveDeadline: g.firstMoveDeadline,
      serverOffset: msg.serverNow - Date.now(),
      result: g.result,
      reason: g.reason,
      ratingChanges: g.ratingChanges,
      drawOfferBy: g.drawOfferBy
    };

    this.gameMode = 'ONLINE';
    this.variant = g.variant;
    this.gameToken++;
    this.isAiThinking = false;
    this.isAiRunning = false;
    this.selectedSquare = null;
    this.currentLegalActions = [];
    this.pendingPromotionAction = null;
    this.promotionModal.style.display = 'none';
    this.newGameModal.style.display = 'none';
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = null;

    this.state = replayActions(g.variant, g.actions);
    this.lastMove = g.actions.length ? g.actions[g.actions.length - 1] : null;
    this.gameStarted = g.status !== 'WAITING';
    this.flipped = msg.you === SIDES.DUSK;

    if (g.status === 'OVER') {
      this.applyOnlineResult();
    } else {
      this.gameOverModal.style.display = 'none';
      this.startOnlineClock();
    }
    if (g.drawOfferBy && g.drawOfferBy !== msg.you && g.status === 'ACTIVE' && this.isPlayer()) {
      this.onOnlineDrawOffer(g.drawOfferBy);
    }
    this.render();
  }

  onOnlineMove(msg) {
    if (!this.onlineGame) return;
    const og = this.onlineGame;
    og.clocks = msg.clocks;
    og.clocksRunning = msg.clocksRunning;
    og.turnStartedAt = msg.turnStartedAt;
    og.firstMoveDeadline = msg.firstMoveDeadline;
    og.serverOffset = msg.serverNow - Date.now();
    og.drawOfferBy = null;

    const localPly = this.state.history.length;
    if (msg.ply === localPly + 1) {
      // Opponent's move (or ours after a reconnect)
      this.executeVerifiedAction(msg.action);
      this.selectedSquare = null;
      this.currentLegalActions = [];
    } else if (msg.ply !== localPly) {
      this.online.resync();
      return;
    }
    this.render();
  }

  onOnlineGameOver(msg) {
    if (!this.onlineGame) return;
    Object.assign(this.onlineGame, {
      status: 'OVER',
      result: msg.result,
      reason: msg.reason,
      ratingChanges: msg.ratingChanges,
      clocks: msg.clocks,
      drawOfferBy: null
    });
    this.hideToast();
    this.applyOnlineResult();
    this.render();
    this.account.refreshUser();
  }

  /** Copies the server's final result into the local rules state. */
  applyOnlineResult() {
    const og = this.onlineGame;
    this.state = {
      ...this.state,
      phase: 'GAME_OVER',
      status: {
        ...this.state.status,
        winner: og.result === 'DAWN' || og.result === 'DUSK' ? og.result : null,
        reason: og.reason
      }
    };
  }

  onOnlineDrawOffer(by) {
    if (!this.onlineGame || !this.isPlayer()) return;
    if (by === this.onlineGame.you) {
      this.showToast('Draw offer sent.');
      return;
    }
    sounds.playCheck();
    this.showToast('Your opponent offers a draw.', [
      { label: 'Accept', primary: true, onClick: () => this.online.acceptDraw() },
      { label: 'Decline', onClick: () => this.online.declineDraw() }
    ], 20000);
  }

  onOnlineDrawDeclined(by) {
    if (this.onlineGame && by !== this.onlineGame.you) this.showToast('Draw offer declined.');
  }

  onOnlineError(text) {
    this.showToast(text);
  }

  onOnlineConnection(status) {
    this.onlineConnection = status;
    if (this.isOnline) this.renderStatusStrip();
  }

  onOnlineLeft() {
    this.onlineGame = null;
    this.gameMode = this.selectGameMode.value;
    this.flipped = false;
    this.startNewGame(this.variant, { silent: true, keepSave: true });
    this.openNewGameModal();
  }

  isPlayer() {
    return this.onlineGame && (this.onlineGame.you === SIDES.DAWN || this.onlineGame.you === SIDES.DUSK);
  }

  /** Remaining clock time (ms) for a side, extrapolated from the server's last update. */
  onlineRemainingMs(side) {
    const og = this.onlineGame;
    let ms = og.clocks[side];
    if (og.status === 'ACTIVE' && og.clocksRunning && this.state.turn === side) {
      ms -= (Date.now() + og.serverOffset) - og.turnStartedAt;
    }
    return Math.max(0, ms);
  }

  startOnlineClock() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (!this.isOnline) return;
      this.updateClockDisplays();
      if (this.onlineGame.firstMoveDeadline) this.renderStatusStrip();
    }, 250);
  }

  cacheElements() {
    const $ = (id) => document.getElementById(id);

    // Nav Rail
    this.railPlayBtn = $('railPlayBtn');
    this.railAiBtn = $('railAiBtn');
    this.railRulesBtn = $('railRulesBtn');
    this.railCompBtn = $('railCompBtn');
    this.railPanelBtn = $('railPanelBtn');
    this.btnAudioToggle = $('btnAudioToggle');
    this.audioIcon = $('audioIcon');
    this.btn3DToggle = $('btn3DToggle');

    // Board & Clocks
    this.boardEl = $('koroBoard');
    this.perspectiveWrapper = $('boardPerspectiveWrapper');
    this.dawnClockEl = $('dawnClock');
    this.duskClockEl = $('duskClock');
    this.dawnPlayerName = $('dawnPlayerName');
    this.duskPlayerName = $('duskPlayerName');
    this.dawnCapturedTray = $('dawnCapturedTray');
    this.duskCapturedTray = $('duskCapturedTray');
    this.btnTopOptions = $('btnTopOptions');
    this.dawnAvatar = $('dawnAvatar');
    this.duskAvatar = $('duskAvatar');
    this.dawnPlayerRating = $('dawnPlayerRating');
    this.duskPlayerRating = $('duskPlayerRating');
    this.boardColumn = document.querySelector('.board-column');

    // Online controls & toast
    this.btnOfferDraw = $('btnOfferDraw');
    this.btnResign = $('btnResign');
    this.victoryRating = $('victoryRating');
    this.toastEl = $('toast');
    this.toastText = $('toastText');
    this.toastActions = $('toastActions');

    // Status (panel strip + mobile line)
    this.statusDot = $('statusDot');
    this.statusText = $('statusText');
    this.variantBadge = $('variantBadge');
    this.mobileStatusDot = $('mobileStatusDot');
    this.mobileStatusText = $('mobileStatusText');
    this.mobileVariantBadge = $('mobileVariantBadge');

    // Panel (side panel on desktop, bottom sheet on mobile)
    this.gamePanel = $('gamePanel');
    this.panelBackdrop = $('panelBackdrop');
    this.btnClosePanel = $('btnClosePanel');

    // AI Battle Toolbar
    this.aiBattleToolbar = $('aiBattleToolbar');
    this.btnAiPlayToggle = $('btnAiPlayToggle');
    this.aiPlayIcon = $('aiPlayIcon');
    this.aiPlayText = $('aiPlayText');
    this.btnAiStep = $('btnAiStep');
    this.selectAiSpeed = $('selectAiSpeed');

    // Moves Table & Panel Tabs
    this.movesTableBody = $('movesTableBody');
    this.movesScrollArea = $('movesScrollArea');
    this.movesEmptyState = $('movesEmptyState');

    this.tabBtnMoves = $('tabBtnMoves');
    this.tabBtnInspector = $('tabBtnInspector');
    this.tabBtnSettings = $('tabBtnSettings');
    this.viewMoves = $('viewMoves');
    this.viewInspector = $('viewInspector');
    this.viewSettings = $('viewSettings');

    // Inspector
    this.inspectorSquareTitle = $('inspectorSquareTitle');
    this.inspectorContent = $('inspectorContent');

    // Settings
    this.selectGameMode = $('selectGameMode');
    this.selectAiDiff = $('selectAiDiff');
    this.selectBoardTheme = $('selectBoardTheme');
    this.btnToggle3DSetting = $('btnToggle3DSetting');

    // Playback Controls
    this.btnNavPlay = $('btnNavPlay');

    // Footer Actions
    this.btnNewGame = $('btnNewGame');
    this.btnUndoMove = $('btnUndoMove');
    this.btnRulesModal = $('btnRulesModal');

    // New Game chooser
    this.newGameModal = $('newGameModal');
    this.btnCloseNewGame = $('btnCloseNewGame');
    this.btnStartNewGame = $('btnStartNewGame');
    this.newGameOpponent = $('newGameOpponent');
    this.newGameDifficulty = $('newGameDifficulty');
    this.newGameDifficultyRow = $('newGameDifficultyRow');
    this.variantCards = Array.from(document.querySelectorAll('.variant-card'));

    // Modals
    this.promotionModal = $('promotionModal');
    this.promotionPreview = $('promotionPreview');
    this.btnPromoteYes = $('btnPromoteYes');
    this.btnPromoteNo = $('btnPromoteNo');

    this.gameOverModal = $('gameOverModal');
    this.victoryCrest = $('victoryCrest');
    this.victoryTitle = $('victoryTitle');
    this.victoryReason = $('victoryReason');
    this.btnPlayAgain = $('btnPlayAgain');

    this.compendiumModal = $('compendiumModal');
    this.btnCloseCompendium = $('btnCloseCompendium');
    this.pieceCardsList = $('pieceCardsList');
  }

  bindEvents() {
    // Board: one delegated listener instead of 81 per render.
    this.boardEl.addEventListener('click', (e) => {
      const sq = e.target.closest('.board-square');
      if (sq) this.handleSquareClick(Number(sq.dataset.f), Number(sq.dataset.r));
    });
    if (this.canHover) {
      this.boardEl.addEventListener('mouseover', (e) => {
        const sq = e.target.closest('.board-square');
        if (sq) this.inspectSquare(Number(sq.dataset.f), Number(sq.dataset.r));
      });
    }

    // Nav Rail
    this.railPlayBtn.addEventListener('click', () => {
      this.setActiveRailItem(this.railPlayBtn);
      this.openNewGameModal();
    });

    this.railAiBtn.addEventListener('click', () => {
      if (this.onlineGameActive) {
        this.showToast('Finish your online game first.');
        return;
      }
      this.setActiveRailItem(this.railAiBtn);
      this.setGameMode('CVC');
      this.switchPanelTab('tab-moves');
      this.openPanel();
      sounds.playSelect();
    });

    this.railRulesBtn.addEventListener('click', () => this.openCompendiumModal('tab-rules'));
    this.railCompBtn.addEventListener('click', () => this.openCompendiumModal('tab-pieces'));
    this.btnRulesModal.addEventListener('click', () => this.openCompendiumModal('tab-rules'));

    // Mobile bottom sheet
    this.railPanelBtn.addEventListener('click', () => this.togglePanel());
    this.btnClosePanel.addEventListener('click', () => this.closePanel());
    this.panelBackdrop.addEventListener('click', () => this.closePanel());
    if (this.btnTopOptions) {
      this.btnTopOptions.addEventListener('click', () => {
        this.switchPanelTab('tab-settings');
        this.openPanel();
      });
    }

    this.btnAudioToggle.addEventListener('click', () => this.toggleAudio());
    this.btn3DToggle.addEventListener('click', () => this.togglePerspective());
    this.btnToggle3DSetting.addEventListener('click', () => this.togglePerspective());

    this.btnNewGame.addEventListener('click', () => this.openNewGameModal());
    this.btnUndoMove.addEventListener('click', () => this.undoMove());
    this.btnResign.addEventListener('click', () => {
      if (!this.onlineGameActive || !this.isPlayer()) return;
      if (window.confirm('Resign this game? It counts as a loss.')) this.online.resign();
    });
    this.btnOfferDraw.addEventListener('click', () => {
      if (!this.onlineGameActive || !this.isPlayer()) return;
      this.online.offerDraw();
    });

    // Panel Tabs
    this.tabBtnMoves.addEventListener('click', () => this.switchPanelTab('tab-moves'));
    this.tabBtnInspector.addEventListener('click', () => this.switchPanelTab('tab-inspector'));
    this.tabBtnSettings.addEventListener('click', () => this.switchPanelTab('tab-settings'));

    // Game Mode & Difficulty
    this.selectGameMode.value = this.gameMode;
    this.selectAiDiff.value = this.aiDifficulty;
    this.selectGameMode.addEventListener('change', (e) => this.setGameMode(e.target.value));
    this.selectAiDiff.addEventListener('change', (e) => {
      this.aiDifficulty = e.target.value;
      savePrefs({ aiDifficulty: this.aiDifficulty });
      this.persist();
      this.renderPlayerBars();
    });

    // AI vs AI Controls
    this.btnAiPlayToggle.addEventListener('click', () => this.toggleAiBattle());
    this.btnAiStep.addEventListener('click', () => this.stepAiBattle());
    this.btnNavPlay.addEventListener('click', () => {
      if (this.gameMode === 'CVC') this.toggleAiBattle();
      else this.stepAiBattle();
    });

    this.selectAiSpeed.addEventListener('change', (e) => {
      this.aiSpeedMs = parseInt(e.target.value, 10);
    });

    // Promotion Dialog Buttons
    this.btnPromoteYes.addEventListener('click', () => this.resolvePromotion(true));
    this.btnPromoteNo.addEventListener('click', () => this.resolvePromotion(false));

    // Game Over & Compendium
    this.btnPlayAgain.addEventListener('click', () => {
      this.gameOverModal.style.display = 'none';
      this.openNewGameModal();
    });

    this.btnCloseCompendium.addEventListener('click', () => {
      this.compendiumModal.style.display = 'none';
      sounds.playSelect();
    });

    // Compendium Sub-Tabs
    document.querySelectorAll('.compendium-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.compendium-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.compendium-content .tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.getAttribute('data-tab')).classList.add('active');
        sounds.playSelect();
      });
    });

    // Save when the app is backgrounded / closed (phones may kill the page).
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.persist();
      else if (this.online) this.online.wake(); // reconnect quickly after the phone wakes up
    });
    window.addEventListener('pagehide', () => this.persist());
  }

  /* ==========================================================================
     New Game chooser (Simple / Eclipse / Towers)
     ========================================================================== */

  initNewGameChooser() {
    // Fill the variant cards from VARIANT_INFO (single source of truth).
    this.variantCards.forEach(card => {
      const info = VARIANT_INFO[card.dataset.variant];
      card.querySelectorAll('[data-field]').forEach(el => {
        el.textContent = info[el.dataset.field];
      });
      card.addEventListener('click', () => {
        this.selectVariantCard(card.dataset.variant);
        sounds.playSelect();
      });
    });

    // Reuse the option lists from the settings panel (online options are added on login).
    this.refreshChooserOpponents();
    this.newGameDifficulty.innerHTML = this.selectAiDiff.innerHTML;
    this.newGameOpponent.addEventListener('change', () => this.updateChooserDifficultyRow());

    this.btnStartNewGame.addEventListener('click', () => this.startFromChooser());
    this.btnCloseNewGame.addEventListener('click', () => this.closeNewGameModal());
  }

  selectVariantCard(variant) {
    this.chooserVariant = variant;
    this.variantCards.forEach(card => {
      const on = card.dataset.variant === variant;
      card.classList.toggle('selected', on);
      card.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  /** Opponent list: online options first (when logged in), then local ones. */
  refreshChooserOpponents() {
    const sel = this.newGameOpponent;
    sel.innerHTML = '';
    const loggedIn = this.account && this.account.user && !this.offlineOnly;
    if (loggedIn) {
      const group = document.createElement('optgroup');
      group.label = 'Online (rated)';
      group.append(new Option('Play online: random opponent', 'ONLINE'));
      group.append(new Option('Play online: invite a friend (link)', 'INVITE'));
      sel.append(group);
    }
    const local = document.createElement('optgroup');
    local.label = 'On this device';
    for (const opt of this.selectGameMode.options) local.append(new Option(opt.text, opt.value));
    sel.append(local);
  }

  updateChooserDifficultyRow() {
    const v = this.newGameOpponent.value;
    this.newGameDifficultyRow.style.display = (v === 'PVP' || ONLINE_MODES.includes(v)) ? 'none' : 'flex';
  }

  openNewGameModal() {
    if (this.onlineGameActive && this.isPlayer()) {
      this.showToast('Finish (or resign) your online game first.');
      return;
    }
    this.closePanel();
    this.selectVariantCard(this.variant);
    const loggedIn = this.account && this.account.user && !this.offlineOnly;
    const preferred = loggedIn && ONLINE_MODES.includes(this.lastOpponentPref)
      ? this.lastOpponentPref
      : (this.gameMode === 'ONLINE' ? 'PVC_DUSK' : this.gameMode);
    this.newGameOpponent.value = preferred;
    if (!this.newGameOpponent.value) this.newGameOpponent.selectedIndex = 0;
    this.newGameDifficulty.value = this.aiDifficulty;
    this.updateChooserDifficultyRow();
    this.newGameModal.style.display = 'flex';
    sounds.playSelect();
  }

  closeNewGameModal() {
    this.newGameModal.style.display = 'none';
    this.setActiveRailItem(this.railPlayBtn);
  }

  startFromChooser() {
    this.variant = this.chooserVariant || VARIANTS.TOWERS;
    const opponent = this.newGameOpponent.value;
    this.lastOpponentPref = opponent;
    savePrefs({ variant: this.variant, opponent });

    if (ONLINE_MODES.includes(opponent)) {
      this.closeNewGameModal();
      this.online.leave();
      this.onlineGame = null;
      if (opponent === 'ONLINE') this.online.search(this.variant);
      else this.online.invite(this.variant);
      return;
    }

    // Local game: leave any finished online game behind.
    this.online.leave();
    this.onlineGame = null;
    this.flipped = opponent === 'PVC_DAWN'; // you play Dusk: view from Dusk's side
    this.gameMode = opponent;
    this.aiDifficulty = this.newGameDifficulty.value;
    this.selectGameMode.value = this.gameMode;
    this.selectAiDiff.value = this.aiDifficulty;
    savePrefs({ variant: this.variant, gameMode: this.gameMode, aiDifficulty: this.aiDifficulty });

    this.closeNewGameModal();
    this.startNewGame(this.variant);
    this.startGame();

    if (this.gameMode === 'CVC') {
      this.switchPanelTab('tab-moves');
      this.openPanel();
    }
  }

  /* ==========================================================================
     Panel / navigation helpers
     ========================================================================== */

  setActiveRailItem(activeBtn) {
    document.querySelectorAll('.rail-item').forEach(i => i.classList.remove('active'));
    activeBtn.classList.add('active');
  }

  openPanel() {
    this.gamePanel.classList.add('open');
    this.panelBackdrop.classList.add('open');
    this.railPanelBtn.classList.add('active');
  }

  closePanel() {
    this.gamePanel.classList.remove('open');
    this.panelBackdrop.classList.remove('open');
    this.railPanelBtn.classList.remove('active');
  }

  togglePanel() {
    if (this.gamePanel.classList.contains('open')) this.closePanel();
    else this.openPanel();
    sounds.playSelect();
  }

  switchPanelTab(tabName) {
    this.tabBtnMoves.classList.toggle('active', tabName === 'tab-moves');
    this.tabBtnInspector.classList.toggle('active', tabName === 'tab-inspector');
    this.tabBtnSettings.classList.toggle('active', tabName === 'tab-settings');

    this.viewMoves.classList.toggle('active', tabName === 'tab-moves');
    this.viewInspector.classList.toggle('active', tabName === 'tab-inspector');
    this.viewSettings.classList.toggle('active', tabName === 'tab-settings');
    sounds.playSelect();
  }

  openCompendiumModal(defaultTab = 'tab-rules') {
    this.closePanel();
    this.compendiumModal.style.display = 'flex';
    document.querySelectorAll('.compendium-tabs .tab-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-tab') === defaultTab);
    });
    document.querySelectorAll('.compendium-content .tab-pane').forEach(p => {
      p.classList.toggle('active', p.id === defaultTab);
    });
    sounds.playSelect();
  }

  togglePerspective() {
    this.is3D = !this.is3D;
    this.perspectiveWrapper.classList.toggle('perspective-3d', this.is3D);
    sounds.playSelect();
  }

  toggleAudio() {
    const isMuted = sounds.toggleMute();
    this.audioIcon.textContent = isMuted ? '🔇' : '🔊';
  }

  setGameMode(mode) {
    if (this.isOnline) {
      this.selectGameMode.value = this.lastLocalMode || 'PVC_DUSK';
      this.showToast('Start a new local game from "New Game" to change this.');
      return;
    }
    this.gameMode = mode;
    this.selectGameMode.value = mode;
    this.isAiRunning = false;
    if (this.gameStarted) this.startClockTimer(); // starts or stops the clock for the new mode
    savePrefs({ gameMode: mode });
    this.persist();
    this.render();
    this.checkAiTurn();
  }

  /* ==========================================================================
     Game lifecycle
     ========================================================================== */

  startNewGame(variant = this.variant, { silent = false, keepSave = false } = {}) {
    this.variant = variant;
    this.state = createInitialGameState(variant);
    this.gameToken++;
    this.selectedSquare = null;
    this.lastMove = null;
    this.currentLegalActions = [];
    this.isAiThinking = false;
    this.isAiRunning = false;
    this.gameStarted = false;

    // Reset Clocks (frozen until the game starts)
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = null;
    this.timers = { DAWN: START_CLOCK_SECONDS, DUSK: START_CLOCK_SECONDS };

    this.gameOverModal.style.display = 'none';
    this.promotionModal.style.display = 'none';
    this.pendingPromotionAction = null;

    if (!keepSave) clearSavedGame();
    if (!silent) sounds.playSelect();
    this.render();
  }

  startGame() {
    if (this.gameStarted) return;
    this.gameStarted = true;
    sounds.playSelect();
    this.startClockTimer();
    this.persist();
    this.render();
    this.checkAiTurn();
  }

  /** Restores an unfinished game saved earlier. Returns true on success. */
  restoreSavedGame() {
    const saved = loadGame();
    if (!saved) return false;

    this.state = saved.state;
    this.variant = saved.state.variant;
    this.gameToken++;
    if (saved.gameMode) this.gameMode = saved.gameMode;
    if (saved.aiDifficulty) this.aiDifficulty = saved.aiDifficulty;
    this.selectGameMode.value = this.gameMode;
    this.selectAiDiff.value = this.aiDifficulty;

    if (saved.timers && Number.isFinite(saved.timers.DAWN) && Number.isFinite(saved.timers.DUSK)) {
      this.timers = { DAWN: saved.timers.DAWN, DUSK: saved.timers.DUSK };
    }
    const hist = this.state.history;
    this.lastMove = hist.length > 0 ? hist[hist.length - 1].action : null;
    this.gameStarted = saved.gameStarted;
    this.flipped = this.gameMode === 'PVC_DAWN';
    if (this.gameStarted) this.startClockTimer();

    this.render();
    this.checkAiTurn();
    return true;
  }

  /** Saves the current local game so it can be resumed after reload. */
  persist() {
    if (!this.state || this.gameMode === 'ONLINE') return; // online games live on the server
    if (this.state.phase !== 'PLAY' || (!this.gameStarted && this.state.history.length === 0)) {
      clearSavedGame();
      return;
    }
    saveGame({
      state: this.state,
      gameMode: this.gameMode,
      aiDifficulty: this.aiDifficulty,
      timers: this.timers,
      gameStarted: this.gameStarted
    });
  }

  /** Local games only use a clock for 2-player pass & play (never against the AI). */
  usesLocalClock() {
    return this.gameMode === 'PVP';
  }

  startClockTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = null;
    if (!this.usesLocalClock()) return;
    this.timerInterval = setInterval(() => {
      // Don't burn clock time while the app is in the background.
      if (document.hidden) return;
      if (this.gameStarted && this.state && this.state.phase === 'PLAY' && !this.isAiThinking) {
        const side = this.state.turn;
        if (this.timers[side] > 0) {
          this.timers[side]--;
          this.updateClockDisplays();
        }
      }
    }, 1000);
  }

  formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  updateClockDisplays() {
    if (this.isOnline) {
      const og = this.onlineGame;
      const dawnMs = this.onlineRemainingMs(SIDES.DAWN);
      const duskMs = this.onlineRemainingMs(SIDES.DUSK);
      this.dawnClockEl.textContent = this.formatTime(Math.ceil(dawnMs / 1000));
      this.duskClockEl.textContent = this.formatTime(Math.ceil(duskMs / 1000));
      const running = og.status === 'ACTIVE';
      this.dawnClockEl.classList.toggle('active-clock', running && this.state.turn === SIDES.DAWN);
      this.duskClockEl.classList.toggle('active-clock', running && this.state.turn === SIDES.DUSK);
      this.dawnClockEl.classList.toggle('low-time', running && dawnMs < 30000);
      this.duskClockEl.classList.toggle('low-time', running && duskMs < 30000);
      return;
    }
    this.dawnClockEl.classList.remove('low-time');
    this.duskClockEl.classList.remove('low-time');
    this.dawnClockEl.textContent = this.formatTime(this.timers.DAWN);
    this.duskClockEl.textContent = this.formatTime(this.timers.DUSK);

    if (!this.gameStarted) {
      this.dawnClockEl.classList.remove('active-clock');
      this.duskClockEl.classList.remove('active-clock');
      return;
    }

    const isDawnTurn = this.state.turn === SIDES.DAWN;
    this.dawnClockEl.classList.toggle('active-clock', isDawnTurn);
    this.duskClockEl.classList.toggle('active-clock', !isDawnTurn);
  }

  undoMove() {
    if (this.isOnline) return; // no take-backs in rated games
    if (!this.state || this.state.history.length === 0 || this.state.phase !== 'PLAY') return;
    if (this.isAiThinking) return;

    const isAiGame = this.gameMode.startsWith('PVC');
    const undoSteps = (isAiGame && this.state.history.length >= 2) ? 2 : 1;
    const actions = this.state.history.slice(0, -undoSteps).map(h => h.action);

    this.state = replayActions(this.state.variant, actions);
    this.gameToken++;
    this.selectedSquare = null;
    this.currentLegalActions = [];
    this.lastMove = actions.length > 0 ? actions[actions.length - 1] : null;
    sounds.playMove();
    this.persist();
    this.render();
    this.checkAiTurn();
  }

  /* ==========================================================================
     Master Render Pipeline
     ========================================================================== */

  render() {
    const online = this.isOnline;
    if (!online) this.lastLocalMode = this.gameMode;
    document.body.classList.toggle('no-clock', !online && !this.usesLocalClock());
    this.boardColumn.classList.toggle('flipped', this.flipped);
    document.body.classList.toggle('mode-online', online);
    const canAct = online && this.onlineGame.status === 'ACTIVE' && this.isPlayer();
    this.btnResign.disabled = !canAct;
    this.btnOfferDraw.disabled = !canAct;
    this.selectGameMode.disabled = online;
    this.selectAiDiff.disabled = online;

    this.renderBoard();
    this.renderPlayerBars();
    this.renderStatusStrip();
    this.renderAiToolbar();
    this.renderMovesTable();
    this.renderGameOver();
    this.updateClockDisplays();
  }

  renderBoard() {
    this.boardEl.innerHTML = '';
    const b = this.state.board;
    const frag = document.createDocumentFragment();

    // Normally rank 9 is at the top; when flipped (playing Dusk) rank 1 is at the top.
    const edgeFile = this.flipped ? BOARD_SIZE - 1 : 0;
    const edgeRank = this.flipped ? BOARD_SIZE - 1 : 0;
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const r = this.flipped ? row : BOARD_SIZE - 1 - row;
        const f = this.flipped ? BOARD_SIZE - 1 - col : col;
        const sqEl = document.createElement('div');
        sqEl.className = 'board-square';
        sqEl.dataset.f = f;
        sqEl.dataset.r = r;
        sqEl.classList.add((f + r) % 2 === 0 ? 'sq-dark' : 'sq-light');

        if (f === edgeFile) {
          const rankLabel = document.createElement('span');
          rankLabel.className = 'sq-coord-rank';
          rankLabel.textContent = `${r + 1}`;
          sqEl.appendChild(rankLabel);
        }
        if (r === edgeRank) {
          const fileLabel = document.createElement('span');
          fileLabel.className = 'sq-coord-file';
          fileLabel.textContent = String.fromCharCode(97 + f);
          sqEl.appendChild(fileLabel);
        }

        // Sanctum (d4-f6) subtle corner markings
        if (isSanctum(f, r)) {
          if (f === 3 && r === 5) sqEl.classList.add('sq-sanctum-corner-tl');
          if (f === 5 && r === 5) sqEl.classList.add('sq-sanctum-corner-tr');
          if (f === 3 && r === 3) sqEl.classList.add('sq-sanctum-corner-bl');
          if (f === 5 && r === 3) sqEl.classList.add('sq-sanctum-corner-br');
        }

        if (isZenith(f, r)) sqEl.classList.add('sq-zenith');

        if (this.selectedSquare && this.selectedSquare.f === f && this.selectedSquare.r === r) {
          sqEl.classList.add('selected-origin');
        }

        if (this.lastMove) {
          if ((this.lastMove.from && this.lastMove.from.f === f && this.lastMove.from.r === r) ||
              (this.lastMove.to && this.lastMove.to.f === f && this.lastMove.to.r === r)) {
            sqEl.classList.add('prev-move-highlight');
          }
        }

        // Legal move targets
        if (this.selectedSquare) {
          const matchingMove = this.currentLegalActions.find(
            a => a.action === 'MOVE' && a.to.f === f && a.to.r === r
          );
          if (matchingMove) {
            if (matchingMove.type === 'NORMAL') sqEl.classList.add('target-move');
            else if (matchingMove.type === 'STACK') sqEl.classList.add('target-stack');
            else if (matchingMove.type === 'CAPTURE_STANDALONE') sqEl.classList.add('target-capture');
            else if (matchingMove.type === 'CAPTURE_PEEL') sqEl.classList.add('target-peel');
            else if (matchingMove.type === 'CAPTURE_AEGIS') sqEl.classList.add('target-aegis');
          }
        }

        // Tower / Piece Tokens
        const tower = b[r][f];
        if (tower && tower.length > 0) {
          const towerWrapper = document.createElement('div');
          towerWrapper.className = 'tower-wrapper';

          // Buried pieces are drawn as stacked discs; the top piece stands on them.
          const top = tower.length - 1;
          tower.forEach((p, idx) => {
            if (idx < top) {
              const disc = document.createElement('div');
              disc.className = `tower-disc side-${p.side.toLowerCase()}`;
              disc.style.setProperty('--i', idx);
              disc.title = `Buried ${PIECE_SYMBOLS[p.type].name} (${PIECE_SYMBOLS[p.type].echo})`;
              towerWrapper.appendChild(disc);
            } else {
              towerWrapper.appendChild(createPieceEl(p, top > 0 ? `lift-${top}` : ''));
            }
          });

          if (tower.length > 1) {
            const badge = document.createElement('div');
            badge.className = 'tower-tier-badge';
            badge.textContent = `${tower.length}`;
            towerWrapper.appendChild(badge);

            const echoes = getTowerEchoes(tower);
            const echoBadges = document.createElement('div');
            echoBadges.className = 'tower-echo-badges';

            if (echoes.thrustBonus > 0) this.appendEchoIcon(echoBadges, '⚡', `Thrust +${echoes.thrustBonus}`);
            if (echoes.hasAegis) this.appendEchoIcon(echoBadges, '🛡', 'Aegis Bodyguard');
            if (echoes.hasVault) this.appendEchoIcon(echoBadges, '🌀', 'Vault: Leap 1 piece');
            if (echoes.hasGallop) this.appendEchoIcon(echoBadges, '🐎', 'Gallop: Knight leap');
            if (echoes.horizonBonus > 0) this.appendEchoIcon(echoBadges, '👁', `Horizon +${echoes.horizonBonus}`);
            if (echoes.hasPhase) this.appendEchoIcon(echoBadges, '✨', 'Phase: Diagonal step');

            towerWrapper.appendChild(echoBadges);
          }

          sqEl.appendChild(towerWrapper);
        }

        frag.appendChild(sqEl);
      }
    }
    this.boardEl.appendChild(frag);
  }

  appendEchoIcon(container, icon, title) {
    const span = document.createElement('span');
    span.className = 'tower-echo-icon';
    span.textContent = icon;
    span.title = title;
    container.appendChild(span);
  }

  renderPlayerBars() {
    if (!this.dawnAvatar) return;
    if (this.isOnline) {
      this.renderOnlinePlayer(SIDES.DAWN, this.dawnPlayerName, this.dawnPlayerRating, this.dawnAvatar);
      this.renderOnlinePlayer(SIDES.DUSK, this.duskPlayerName, this.duskPlayerRating, this.duskAvatar);
      this.renderCapturedChips(SIDES.DAWN, this.dawnCapturedTray);
      this.renderCapturedChips(SIDES.DUSK, this.duskCapturedTray);
      return;
    }

    setAvatar(this.dawnAvatar, null, null, '☀');
    setAvatar(this.duskAvatar, null, null, '☽');
    this.dawnPlayerName.style.color = '';
    this.duskPlayerName.style.color = '';
    this.dawnPlayerRating.textContent = '';
    this.duskPlayerRating.textContent = '';
    const me = this.account && this.account.user;
    const youName = me ? me.username : 'You';

    if (this.gameMode === 'CVC') {
      this.dawnPlayerName.textContent = 'Dawn (AI)';
      this.duskPlayerName.textContent = 'Dusk (AI)';
    } else if (this.gameMode === 'PVC_DAWN') {
      this.dawnPlayerName.textContent = `Dawn (${this.aiDifficulty})`;
      this.duskPlayerName.textContent = `Dusk (${youName})`;
    } else if (this.gameMode === 'PVP') {
      this.dawnPlayerName.textContent = 'Dawn (Player 1)';
      this.duskPlayerName.textContent = 'Dusk (Player 2)';
    } else {
      this.dawnPlayerName.textContent = `Dawn (${youName})`;
      this.duskPlayerName.textContent = `Dusk (${this.aiDifficulty})`;
    }

    this.renderCapturedChips(SIDES.DAWN, this.dawnCapturedTray);
    this.renderCapturedChips(SIDES.DUSK, this.duskCapturedTray);
  }

  renderOnlinePlayer(side, nameEl, ratingEl, avatarEl) {
    const p = this.onlineGame.players[side];
    nameEl.textContent = '';
    nameEl.style.color = '';
    if (!p) {
      nameEl.textContent = 'Waiting for opponent…';
      ratingEl.textContent = '';
      setAvatar(avatarEl, null, null, side === SIDES.DAWN ? '☀' : '☽');
      return;
    }
    nameEl.append(ratedName(p.username, p.rating, { onOpen: (n) => this.account.openProfile(n) }));
    const t = getTitle(p.rating);
    ratingEl.textContent = `${p.rating} · ${t.name}`;
    ratingEl.style.color = t.color;
    setAvatar(avatarEl, p.avatarUrl, p.username);
  }

  renderCapturedChips(capturingSide, trayEl) {
    trayEl.innerHTML = '';
    const pool = this.state.reserves[capturingSide];
    if (!pool || pool.length === 0) return;

    const grouped = {};
    pool.forEach(p => {
      grouped[p.type] = (grouped[p.type] || 0) + 1;
    });

    for (const [type, count] of Object.entries(grouped)) {
      const chip = document.createElement('span');
      chip.className = 'cap-chip';
      chip.textContent = `${PIECE_SYMBOLS[type].abbr}${count > 1 ? '×' + count : ''}`;
      chip.title = `${PIECE_SYMBOLS[type].name} (Eliminated)`;
      trayEl.appendChild(chip);
    }
  }

  renderStatusStrip() {
    let color = '#81b64c';
    let text;
    const og = this.isOnline ? this.onlineGame : null;

    if (og && og.status !== 'OVER' && this.onlineConnection !== 'connected') {
      color = '#f59e0b';
      text = this.onlineConnection === 'reconnecting' ? 'Connection lost • reconnecting…' : 'Connecting…';
    } else if (og && og.status === 'WAITING') {
      color = '#f59e0b';
      text = 'Waiting for your friend to open the invite link…';
    } else if (og && og.status === 'OVER') {
      color = '#ef4444';
      text = og.reason;
    } else if (og && og.firstMoveDeadline) {
      const secs = Math.max(0, Math.ceil((og.firstMoveDeadline - (Date.now() + og.serverOffset)) / 1000));
      const yours = this.state.turn === og.you;
      color = '#f59e0b';
      text = yours
        ? `Your first move • ${secs}s left or the game is aborted`
        : `Waiting for opponent's first move (${secs}s)`;
    } else if (og) {
      const yours = this.state.turn === og.you;
      if (this.state.status.isCheck) color = '#ef4444';
      const check = this.state.status.isCheck ? 'CHECK! ' : '';
      text = og.you === 'SPECTATOR'
        ? `Watching • ${this.state.turn === SIDES.DAWN ? 'Dawn' : 'Dusk'} to move`
        : `${check}${yours ? 'Your move' : "Opponent's move"}`;
    } else if (this.state.phase === 'GAME_OVER') {
      color = '#ef4444';
      text = this.state.status.reason;
    } else if (this.isAiThinking) {
      text = `${this.state.turn === SIDES.DAWN ? 'Dawn' : 'Dusk'} (AI) is thinking…`;
    } else if (!this.gameStarted && this.gameMode !== 'CVC') {
      text = this.usesLocalClock() ? 'Ready • Move a piece to start the clock' : 'Ready • Make your first move';
    } else if (this.state.status.isCheck) {
      color = '#ef4444';
      text = `CHECK! ${this.state.turn} Sovereign is threatened`;
    } else if (this.state.zenithState && this.state.zenithState.occupantSide) {
      color = '#f59e0b';
      text = `Zenith Contest: ${this.state.zenithState.occupantSide} Sovereign occupies e5`;
    } else {
      text = `${this.state.turn === SIDES.DAWN ? 'White (Dawn)' : 'Black (Dusk)'} to move`;
    }

    const info = VARIANT_INFO[this.state.variant] || VARIANT_INFO.TOWERS;
    const badgeText = info.name;
    const badgeTitle = `${info.name}: ${info.tagline}`;

    this.statusDot.style.backgroundColor = color;
    this.statusText.textContent = text;
    this.variantBadge.textContent = badgeText;
    this.variantBadge.title = badgeTitle;

    this.mobileStatusDot.style.backgroundColor = color;
    this.mobileStatusText.textContent = text;
    this.mobileVariantBadge.textContent = badgeText;
    this.mobileVariantBadge.title = badgeTitle;
  }

  renderAiToolbar() {
    if (this.gameMode !== 'CVC') {
      this.aiBattleToolbar.style.display = 'none';
      return;
    }

    this.aiBattleToolbar.style.display = 'flex';
    if (this.isAiRunning) {
      this.aiPlayIcon.textContent = '⏸';
      this.aiPlayText.textContent = 'Pause AI Match';
      this.btnAiPlayToggle.className = 'btn btn-secondary btn-full';
    } else {
      this.aiPlayIcon.textContent = '▶';
      this.aiPlayText.textContent = 'Start AI Match';
      this.btnAiPlayToggle.className = 'btn btn-green btn-full';
    }
  }

  renderMovesTable() {
    this.movesTableBody.innerHTML = '';
    if (this.state.history.length === 0) {
      this.movesEmptyState.style.display = 'block';
      return;
    }

    this.movesEmptyState.style.display = 'none';

    for (let i = 0; i < this.state.history.length; i += 2) {
      const roundNum = Math.floor(i / 2) + 1;
      const dawnMove = this.state.history[i];
      const duskMove = this.state.history[i + 1];

      const tr = document.createElement('tr');

      const numTd = document.createElement('td');
      numTd.className = 'move-num';
      numTd.textContent = `${roundNum}.`;

      const dawnTd = document.createElement('td');
      dawnTd.className = 'move-cell';
      if (dawnMove) {
        dawnTd.textContent = `${dawnMove.notation}${dawnMove.check ? '+' : ''}`;
        if (i === this.state.history.length - 1) dawnTd.classList.add('active-move');
      }

      const duskTd = document.createElement('td');
      duskTd.className = 'move-cell';
      if (duskMove) {
        duskTd.textContent = `${duskMove.notation}${duskMove.check ? '+' : ''}`;
        if (i + 1 === this.state.history.length - 1) duskTd.classList.add('active-move');
      }

      tr.appendChild(numTd);
      tr.appendChild(dawnTd);
      tr.appendChild(duskTd);
      this.movesTableBody.appendChild(tr);
    }

    this.movesScrollArea.scrollTop = this.movesScrollArea.scrollHeight;
  }

  renderGameOver() {
    if (this.state.phase !== 'GAME_OVER') return;
    // Online: wait for the server's verdict (it carries the rating changes).
    if (this.isOnline && this.onlineGame.status !== 'OVER') return;
    if (this.gameOverModal.style.display === 'flex') return;
    if (this.shownGameOverFor === this.gameToken) return;
    this.shownGameOverFor = this.gameToken;

    this.victoryRating.textContent = '';
    if (this.isOnline) {
      const og = this.onlineGame;
      const me = og.you;
      if (og.result === 'ABORTED') this.victoryTitle.textContent = 'Game aborted';
      else if (og.result === 'DRAW') this.victoryTitle.textContent = 'Draw';
      else if (me === SIDES.DAWN || me === SIDES.DUSK) this.victoryTitle.textContent = og.result === me ? 'You won! 🎉' : 'You lost';
      else this.victoryTitle.textContent = `${og.result === SIDES.DAWN ? 'Dawn' : 'Dusk'} wins`;
      this.victoryReason.textContent = og.reason;

      const rc = og.ratingChanges && (og.ratingChanges[me] || null);
      if (rc) {
        const t = getTitle(rc.after);
        const sign = rc.delta >= 0 ? '+' : '';
        this.victoryRating.textContent = `Rating ${rc.before} → ${rc.after} (${sign}${rc.delta}) • ${t.name}`;
        this.victoryRating.style.color = t.color;
      }
    } else {
      this.victoryTitle.textContent = this.state.status.isCheckmate ? 'Checkmate' :
                                     this.state.status.isAscension ? 'Ascension' :
                                     this.state.status.isRepetition ? 'Draw' : 'Victory';
      this.victoryReason.textContent = this.state.status.reason;
    }

    this.victoryCrest.textContent = this.state.status.winner === SIDES.DAWN ? '☀' :
                                    this.state.status.winner === SIDES.DUSK ? '☽' : '⚖';

    this.closePanel();
    this.gameOverModal.style.display = 'flex';
    if (!this.isOnline) clearSavedGame();
    sounds.playVictory();
  }

  /* ==========================================================================
     Board Click & Action Dispatch
     ========================================================================== */

  isHumanTurn() {
    if (this.isOnline) {
      return this.onlineGame.status === 'ACTIVE' && this.state.turn === this.onlineGame.you;
    }
    if (this.gameMode === 'CVC') return false;
    if (this.gameMode === 'PVC_DUSK') return this.state.turn === SIDES.DAWN;
    if (this.gameMode === 'PVC_DAWN') return this.state.turn === SIDES.DUSK;
    return true; // PVP
  }

  handleSquareClick(f, r) {
    // Tapping any square shows it in the inspector (replaces hover on touch screens).
    this.inspectSquare(f, r);

    // If the computer moves first (e.g. you play Dusk), the first tap starts the game.
    if (!this.isOnline && !this.gameStarted && this.state.phase === 'PLAY' &&
        this.gameMode !== 'CVC' && !this.isHumanTurn()) {
      this.startGame();
      return;
    }

    if (this.isAiThinking || this.state.phase !== 'PLAY' || !this.isHumanTurn()) return;

    // Case 1: Square is already selected -> execute move if tapping a legal target
    if (this.selectedSquare) {
      const matchingMoves = this.currentLegalActions.filter(
        a => a.action === 'MOVE' && a.to.f === f && a.to.r === r
      );

      if (matchingMoves.length > 0) {
        if (!this.gameStarted) this.startGame();

        const promoMove = matchingMoves.find(m => m.promote === true);
        const nonPromoMove = matchingMoves.find(m => m.promote === false);

        if (promoMove && nonPromoMove) {
          this.pendingPromotionAction = { ...matchingMoves[0] };
          this.showPromotionDialog(this.pendingPromotionAction);
          return;
        }

        this.commitHumanAction(matchingMoves[0]);
        return;
      }

      // Tapped another friendly piece: switch selection
      const tower = this.state.board[r][f];
      if (tower.length > 0 && tower[tower.length - 1].side === this.state.turn) {
        this.selectSquare(f, r);
        return;
      }

      // Deselect
      this.selectedSquare = null;
      this.currentLegalActions = [];
      this.render();
      return;
    }

    // Case 2: No square selected -> select friendly piece
    const tower = this.state.board[r][f];
    if (tower.length > 0 && tower[tower.length - 1].side === this.state.turn) {
      this.selectSquare(f, r);
    }
  }

  commitHumanAction(action) {
    if (this.isOnline) {
      // Show the move at once; the server confirms it (or sends a correction).
      if (!this.online.sendMove(action)) {
        this.showToast('Not connected. Your move was not sent.');
        this.online.wake();
        return;
      }
    }
    this.executeVerifiedAction(action);
    this.selectedSquare = null;
    this.currentLegalActions = [];
    this.render();
    this.checkAiTurn();
  }

  resolvePromotion(promote) {
    if (!this.pendingPromotionAction) return;
    const action = { ...this.pendingPromotionAction, promote };
    this.pendingPromotionAction = null;
    this.promotionModal.style.display = 'none';
    this.commitHumanAction(action);
  }

  selectSquare(f, r) {
    this.selectedSquare = { f, r };
    const allLegal = getAllLegalActions(this.state, this.state.turn);
    this.currentLegalActions = allLegal.filter(
      a => a.action === 'MOVE' && a.from.f === f && a.from.r === r
    );

    sounds.playSelect();
    this.render();
    this.inspectSquare(f, r);
  }

  executeVerifiedAction(action) {
    this.lastMove = action;

    if (action.type === 'NORMAL') sounds.playMove();
    else if (action.type === 'STACK') sounds.playStack();
    else if (action.type === 'CAPTURE_STANDALONE') sounds.playCapture();
    else if (action.type === 'CAPTURE_PEEL') sounds.playPeel();
    else if (action.type === 'CAPTURE_AEGIS') sounds.playAegis();

    if (action.promote) sounds.playAwaken();

    this.state = applyAction(this.state, action);

    if (this.state.status.isCheck && this.state.phase === 'PLAY') {
      sounds.playCheck();
    }

    this.persist();
  }

  showPromotionDialog(action) {
    const p = action.piece;
    this.promotionPreview.innerHTML = `
      <div style="display: flex; justify-content: center; gap: 2rem; align-items: center; margin: 1rem 0;">
        <div style="text-align: center;">
          ${pieceHtml(p.type, p.side, 'DAWN')}
          <div style="font-size: 0.75rem; margin-top: 0.35rem; color: #8b8987;">Dawn Face</div>
        </div>
        <div style="font-size: 1.4rem; color: var(--chess-green);">➔</div>
        <div style="text-align: center;">
          ${pieceHtml(p.type, p.side, 'ECLIPSE')}
          <div style="font-size: 0.75rem; margin-top: 0.35rem; color: #f59e0b; font-weight: 700;">Eclipse Face ★</div>
        </div>
      </div>
    `;
    this.promotionModal.style.display = 'flex';
    sounds.playSelect();
  }

  /* ==========================================================================
     AI Player Engine (runs in a Web Worker via ai-client.js)
     ========================================================================== */

  toggleAiBattle() {
    if (this.state.phase !== 'PLAY') return;
    if (!this.gameStarted) this.startGame();
    this.isAiRunning = !this.isAiRunning;
    this.render();
    sounds.playSelect();

    if (this.isAiRunning) this.checkAiTurn();
  }

  async stepAiBattle() {
    if (this.state.phase !== 'PLAY' || this.isAiThinking) return;
    if (!this.gameStarted) this.startGame();
    sounds.playSelect();
    await this.runAiMove(0);
  }

  async checkAiTurn() {
    if (this.state.phase !== 'PLAY' || this.isAiThinking || !this.gameStarted) return;

    let shouldAiAct = false;
    if (this.gameMode === 'PVC_DUSK' && this.state.turn === SIDES.DUSK) shouldAiAct = true;
    else if (this.gameMode === 'PVC_DAWN' && this.state.turn === SIDES.DAWN) shouldAiAct = true;
    else if (this.gameMode === 'CVC') shouldAiAct = this.isAiRunning;

    if (!shouldAiAct) return;

    const pauseTime = this.gameMode === 'CVC' ? Math.max(80, Math.floor(this.aiSpeedMs / 2)) : 300;
    const moved = await this.runAiMove(pauseTime);

    if (moved && this.gameMode === 'CVC' && this.state.phase === 'PLAY' && this.isAiRunning) {
      const token = this.gameToken;
      setTimeout(() => {
        if (token === this.gameToken) this.checkAiTurn();
      }, this.aiSpeedMs);
    }
  }

  /**
   * Asks the AI for a move and plays it. Returns true if a move was made.
   * If the game changed while the AI was thinking (new game, undo), the
   * answer is discarded.
   */
  async runAiMove(pauseTime) {
    const token = this.gameToken;
    this.isAiThinking = true;
    this.renderStatusStrip();

    let moved = false;
    try {
      if (pauseTime > 0) await new Promise(res => setTimeout(res, pauseTime));
      if (token !== this.gameToken) return false;

      const bestAction = await requestAIAction(this.state, this.aiDifficulty);
      if (token !== this.gameToken) return false;

      if (bestAction) {
        this.executeVerifiedAction(bestAction);
        moved = true;
      }
    } catch (err) {
      console.error('AI error:', err);
    } finally {
      if (token === this.gameToken) {
        this.isAiThinking = false;
        this.render();
      }
    }
    return moved;
  }

  /* ==========================================================================
     Tower Inspector & Compendium
     ========================================================================== */

  inspectSquare(f, r) {
    const coordStr = formatSquare(f, r);
    const tower = this.state.board[r][f];
    let zoneTag = '';
    if (isZenith(f, r)) zoneTag = ' • The Zenith';
    else if (isSanctum(f, r)) zoneTag = ' • Sanctum';
    else if (isDawnCitadel(r)) zoneTag = ' • Dawn Citadel';
    else if (isDuskCitadel(r)) zoneTag = ' • Dusk Citadel';

    this.inspectorSquareTitle.textContent = `Square ${coordStr}${zoneTag}`;

    if (!tower || tower.length === 0) {
      this.inspectorContent.innerHTML = '<p class="text-muted">Empty square.</p>';
      return;
    }

    const topPiece = tower[tower.length - 1];
    const echoes = getTowerEchoes(tower);

    let html = `
      <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.85rem;">
        ${pieceHtml(topPiece.type, topPiece.side, topPiece.face)}
        <div>
          <div style="font-weight: 700; color: #fff;">${topPiece.side} ${PIECE_SYMBOLS[topPiece.type].name}</div>
          <div style="font-size: 0.75rem; color: #8b8987;">${topPiece.face} Face • Tower Height: ${tower.length}</div>
        </div>
      </div>
    `;

    if (tower.length > 1) {
      html += '<div style="margin-bottom: 0.65rem; font-size: 0.8rem; font-weight: 600; color: #c3c2c1;">Buried Layers:</div>';
      for (let i = tower.length - 2; i >= 0; i--) {
        const bp = tower[i];
        html += `
          <div style="display: flex; justify-content: space-between; font-size: 0.78rem; padding: 0.25rem 0.5rem; background: rgba(0,0,0,0.25); border-radius: 3px; margin-bottom: 0.25rem;">
            <span>Tier ${i + 1}: ${PIECE_SYMBOLS[bp.type].name}</span>
            <span style="color: #f59e0b; font-weight: 700;">+${PIECE_SYMBOLS[bp.type].echo}</span>
          </div>
        `;
      }

      html += '<div style="margin-top: 0.5rem; display: flex; flex-wrap: wrap; gap: 0.3rem;">';
      if (echoes.thrustBonus > 0) html += `<span class="cap-chip">⚡ Thrust (+${echoes.thrustBonus})</span>`;
      if (echoes.hasAegis) html += `<span class="cap-chip">🛡 Aegis (Bodyguard)</span>`;
      if (echoes.hasVault) html += `<span class="cap-chip">🌀 Vault</span>`;
      if (echoes.hasGallop) html += `<span class="cap-chip">🐎 Gallop (Knight)</span>`;
      if (echoes.horizonBonus > 0) html += `<span class="cap-chip">👁 Horizon (+${echoes.horizonBonus})</span>`;
      if (echoes.hasPhase) html += `<span class="cap-chip">✨ Phase</span>`;
      html += '</div>';
    } else if (this.state.variant !== VARIANTS.TOWERS) {
      html += `<p class="text-muted" style="font-size: 0.78rem;">${VARIANT_INFO[this.state.variant].name} game: no stacking, so no tower layers or Echoes.</p>`;
    }

    this.inspectorContent.innerHTML = html;
  }

  initCompendium() {
    this.pieceCardsList.innerHTML = '';
    COMPENDIUM_DATA.forEach(p => {
      const card = document.createElement('div');
      card.className = 'piece-comp-card';
      card.innerHTML = `
        <div class="piece-comp-header">
          <div class="piece-comp-title-wrap">
            <div class="piece-comp-figures">
              ${pieceHtml(p.type, 'DAWN', 'DAWN')}
              ${pieceHtml(p.type, 'DUSK', 'DAWN')}
              ${p.type !== 'SOVEREIGN' ? pieceHtml(p.type, 'DAWN', 'ECLIPSE') : ''}
            </div>
            <div class="piece-comp-title">${p.name} (${p.abbr})</div>
          </div>
          <div class="piece-comp-role">${p.role}</div>
        </div>
        <div class="piece-comp-echo">
          <strong>Echo Trait (${p.echoName}, Towers game only):</strong> ${p.echoDesc}
        </div>
        <div class="piece-comp-faces">
          <div class="face-col">
            <h5>DAWN FACE</h5>
            <div class="face-desc">${p.dawnDesc}</div>
            ${renderMoveGrid(p.dawnGrid)}
          </div>
          <div class="face-col">
            <h5>ECLIPSE FACE</h5>
            <div class="face-desc">${p.eclipseDesc}</div>
            ${renderMoveGrid(p.eclipseGrid)}
          </div>
        </div>
      `;
      this.pieceCardsList.appendChild(card);
    });
  }
}

export const KoroUI = KaraUI;
