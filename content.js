// content.js - Chess Automata Core Engine (VPS/Maia-3 Version)

console.log("[Automata] Chess Automata extension injected successfully.");

// State variables
let gameInProgress = false;
let moveHistory = [];
let ourColor = "w"; // 'w' or 'b'
let activeColor = "w";
let isMakingMove = false;
let autoQueueTimeout = null;
let mutationObserver = null;
let observedBoardEl = null;
let lastBoardState = null;
let lastGameOverCheck = 0;
let moveRetryCount = 0;
let recoveryLog = []; // Tracks all auto-recovery and force-recover attempts
let autoQueueInProgress = false; // Suppresses board observer during auto-queue navigation

// ============================================================
// HUMAN PROFILE SYSTEM — Realistic play simulation
// ============================================================
const humanProfile = {
  gamesPlayed: 0,
  fatigue: 0,           // 0-100, increases each game
  consecutiveWins: 0,
  currentPersonality: null,
  lastOutcome: null,
};

function generateGamePersonality() {
  const f = humanProfile.fatigue;
  const tilt = humanProfile.lastOutcome === 'loss' ? 15 : 0;
  
  // Force a weak game after 3-5 consecutive wins to break streaks
  let forceWeakGame = humanProfile.consecutiveWins >= 3 + Math.floor(Math.random() * 3);
  
  // ============================================================
  // ELO CLIMB PLANNER INTEGRATION
  // Check if we should intentionally lose this game to match the target win rate
  // ============================================================
  let climbWinRate = null;
  chrome.storage.local.get({
    eloClimbEnabled: false,
    currentElo: 800,
    targetElo: 1100,
    gamesToReach: 60,
  }, (climbSettings) => {
    if (climbSettings.eloClimbEnabled) {
      const delta = climbSettings.targetElo - climbSettings.currentElo;
      const gamesLeft = Math.max(1, climbSettings.gamesToReach - humanProfile.gamesPlayed);
      
      if (delta <= 0) {
        // Already at target: play 50/50 to maintain
        climbWinRate = 0.50;
      } else {
        const eloPerGame = delta / gamesLeft;
        climbWinRate = Math.min(0.90, Math.max(0.45, 0.5 + (eloPerGame / 20)));
      }
      
      // Decide: should this game be a planned loss?
      const roll = Math.random();
      if (roll > climbWinRate) {
        forceWeakGame = true;
        console.log(`[Automata ELO Climb] Planned LOSS (roll ${roll.toFixed(2)} > winRate ${climbWinRate.toFixed(2)})`);
      } else {
        forceWeakGame = false; // Override streak-breaker if climb plan says "win"
        console.log(`[Automata ELO Climb] Planned WIN (roll ${roll.toFixed(2)} <= winRate ${climbWinRate.toFixed(2)})`);
      }
    }
  });
  
  const baseElo = forceWeakGame
    ? 600 + Math.random() * 200   // Very weak: 600-800
    : 1100 + Math.random() * 300 - f * 3 - tilt; // Normal: ~1100-1400 minus fatigue
  
  const personality = {
    // ELO by game phase
    openingElo:    Math.round(Math.min(1500, baseElo + 200 + Math.random() * 100)),  // Humans know openings
    middlegameElo: Math.round(Math.max(600, baseElo - 100 - Math.random() * 150)),   // Humans struggle here
    endgameElo:    Math.round(Math.max(700, baseElo - 50 + Math.random() * 100)),    // Variable
    
    // Blunder probability (3-20% depending on fatigue)
    blunderChance: forceWeakGame
      ? 0.15 + Math.random() * 0.10   // 15-25% for forced weak games
      : Math.max(0.03, 0.03 + f * 0.0012 + Math.random() * 0.04 + tilt * 0.002),
    
    // Mate blindness: chance to miss a winning checkmate
    mateBlindness: forceWeakGame
      ? 0.30 + Math.random() * 0.20    // 30-50% for forced weak games
      : Math.max(0.05, 0.05 + f * 0.001 + Math.random() * 0.08),
    
    forceWeakGame: forceWeakGame,
  };
  
  console.log(`[Automata Human] Game #${humanProfile.gamesPlayed + 1} personality:`, {
    opening: personality.openingElo,
    middle: personality.middlegameElo,
    endgame: personality.endgameElo,
    blunder: (personality.blunderChance * 100).toFixed(1) + '%',
    mateMiss: (personality.mateBlindness * 100).toFixed(1) + '%',
    fatigue: f,
    forceWeak: forceWeakGame,
  });
  
  return personality;
}

function getPhaseElo(moveNumber, personality) {
  if (!personality) return 1100;
  
  if (moveNumber <= 10) {
    // Opening: blend from opening ELO towards middlegame
    const blend = moveNumber / 10;
    return Math.round(personality.openingElo * (1 - blend * 0.3) + personality.middlegameElo * (blend * 0.3));
  } else if (moveNumber <= 30) {
    // Middlegame
    return personality.middlegameElo;
  } else {
    // Endgame
    return personality.endgameElo;
  }
}

function shouldBlunder(personality) {
  if (!personality) return false;
  return Math.random() < personality.blunderChance;
}

function applyFatigue() {
  humanProfile.fatigue = Math.min(100, humanProfile.fatigue + 8 + Math.floor(Math.random() * 7));
  humanProfile.gamesPlayed++;
  console.log(`[Automata Human] Fatigue now: ${humanProfile.fatigue}/100, Games: ${humanProfile.gamesPlayed}`);
}

function recordOutcome(outcome) {
  humanProfile.lastOutcome = outcome;
  if (outcome === 'win') {
    humanProfile.consecutiveWins++;
  } else {
    humanProfile.consecutiveWins = 0;
  }
  
  // Update stored currentElo based on outcome (rough estimate: ±10 per game)
  chrome.storage.local.get({ currentElo: 800, eloClimbEnabled: false }, (settings) => {
    if (!settings.eloClimbEnabled) return;
    let elo = settings.currentElo;
    if (outcome === 'win') elo += 8 + Math.floor(Math.random() * 5); // +8 to +12
    else if (outcome === 'loss') elo -= 8 - Math.floor(Math.random() * 5); // -8 to -4
    // draws: no change
    chrome.storage.local.set({ currentElo: Math.max(100, elo) });
    console.log(`[Automata ELO] Updated stored ELO: ${settings.currentElo} → ${elo} (${outcome})`);
  });
}

// Detect current ELO from chess.com's page DOM
function detectCurrentElo() {
  // chess.com shows ratings in several places
  const selectors = [
    '.user-tagline-rating',                              // main game page
    '[data-cy="user-tagline-rating"]',                   // newer UI
    '.rating-tag-component',                             // profile
    '.user-rating',                                      // legacy
    '.board-player-default-bottom .user-tagline-rating', // bottom player = us
  ];
  
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      const text = (el.textContent || '').trim();
      // Extract number from text like "(1034)" or "1034" or "1034?"
      const match = text.match(/(\d{3,4})/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
  }
  
  // Fallback: search ALL elements that contain a rating-like number near "Rating"
  const allEls = document.querySelectorAll('[class*="rating"], [class*="elo"]');
  for (const el of allEls) {
    const text = (el.textContent || '').trim();
    const match = text.match(/(\d{3,4})/);
    if (match) return parseInt(match[1], 10);
  }
  
  return null;
}

// ============================================================
// RECOVERY & DIAGNOSTICS
// ============================================================
function forceRecoverBot(reason) {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = `[${timestamp}] ${reason || 'Manual Force Recover'}` ;
  recoveryLog.unshift(logEntry); // newest first
  if (recoveryLog.length > 10) recoveryLog.pop(); // keep last 10

  console.log(`[Automata Recovery] ${logEntry}`);
  updateSystemStatus('thinking', 'Force Recovering...');

  // Reset all volatile state
  gameInProgress = false;
  isMakingMove = false;
  moveRetryCount = 0;
  autoQueueTimeout = null;

  // Disconnect and reconnect observer
  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
    observedBoardEl = null;
  }

  // Wait 1.5s then try to re-attach to the current board state
  setTimeout(() => {
    const boardEl = document.querySelector('chess-board') || document.querySelector('wc-chess-board');
    if (boardEl) {
      setupBoardObserver();
      const boardState = parseBoardDOM();
      if (boardState && Object.keys(boardState).length > 2) {
        if (isStartingPosition(boardState)) {
          // Game hasn't started yet — wait for it
          updateSystemStatus('running', 'Recovered — Waiting for Game Start');
        } else {
          tryStartMidGame(boardState);
          updateSystemStatus('running', 'Recovered — Rejoined Active Game');
        }
      } else {
        updateSystemStatus('idle', 'Recovered — No Active Board');
      }
    } else {
      updateSystemStatus('idle', 'Recovered — No Board Found');
    }
  }, 1500);
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'detectElo') {
    const elo = detectCurrentElo();
    sendResponse({ elo: elo });
    return true;
  }

  if (message.action === 'forceRecover') {
    forceRecoverBot('Manual: Force Recover button clicked');
    sendResponse({ ok: true });
    return true;
  }

  if (message.action === 'getBotState') {
    sendResponse({
      gameInProgress,
      ourColor,
      activeColor,
      moveCount: moveHistory.length,
      isMakingMove,
      moveRetryCount,
      recoveryLog,
    });
    return true;
  }
});

// File/Rank translation coordinates
const fileMap = {
  1: "a", 2: "b", 3: "c", 4: "d", 5: "e", 6: "f", 7: "g", 8: "h",
};
const rankMap = {
  1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8",
};
const colToNum = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8 };

const STARTING_BOARD = {
  a1: "wr",
  b1: "wn",
  c1: "wb",
  d1: "wq",
  e1: "wk",
  f1: "wb",
  g1: "wn",
  h1: "wr",
  a2: "wp",
  b2: "wp",
  c2: "wp",
  d2: "wp",
  e2: "wp",
  f2: "wp",
  g2: "wp",
  h2: "wp",
  a7: "bp",
  b7: "bp",
  c7: "bp",
  d7: "bp",
  e7: "bp",
  f7: "bp",
  g7: "bp",
  h7: "bp",
  a8: "br",
  b8: "bn",
  c8: "bb",
  d8: "bq",
  e8: "bk",
  f8: "bb",
  g8: "bn",
  h8: "br",
};

function updateSystemStatus(status, statusText) {
  // Always show which color we're playing when a game is active
  const colorTag = gameInProgress ? (ourColor === 'w' ? 'Playing as White | ' : 'Playing as Black | ') : '';
  chrome.runtime
    .sendMessage({
      action: "updateStatus",
      data: { status, statusText: colorTag + statusText },
    })
    .catch(() => {});
}

function parseBoardDOM() {
  const boardEl =
    document.querySelector("chess-board") ||
    document.querySelector("wc-chess-board");
  if (!boardEl) return null;

  const boardState = {};

  // Try finding pieces inside the board, inside its shadow root, or anywhere on the page
  let pieceEls = boardEl.querySelectorAll(".piece");
  if (pieceEls.length === 0 && boardEl.shadowRoot) {
    pieceEls = boardEl.shadowRoot.querySelectorAll(".piece");
  }
  if (pieceEls.length === 0) {
    pieceEls = document.querySelectorAll(".piece");
  }

  // If still no .piece elements, look for anything with a class starting with 'square-'
  if (pieceEls.length === 0) {
    const allSquares = document.querySelectorAll('[class*="square-"]');
    console.log(
      `[Automata] Found 0 .piece elements. Found ${allSquares.length} elements with square- class.`,
    );
    pieceEls = allSquares; // Fallback attempt
  } else {
    // console.log(`[Automata] Found ${pieceEls.length} elements with .piece class.`);
  }

  pieceEls.forEach((el) => {
    const squareClass = Array.from(el.classList).find((c) =>
      c.startsWith("square-"),
    );
    const pieceClass = Array.from(el.classList).find(
      (c) => c.length === 2 && (c.startsWith("w") || c.startsWith("b")),
    );

    if (squareClass && pieceClass) {
      const coordStr = squareClass.replace("square-", "");
      const fileNum = parseInt(coordStr[0], 10);
      const rankNum = parseInt(coordStr[1], 10);
      if (fileMap[fileNum] && rankMap[rankNum]) {
        const squareName = fileMap[fileNum] + rankMap[rankNum];
        boardState[squareName] = pieceClass;
      }
    }
  });

  if (Object.keys(boardState).length > 0) {
    console.log(
      `[Automata] SUCCESS: Parsed board state! Found ${Object.keys(boardState).length} valid chess pieces.`,
    );
  }

  return boardState;
}

function isStartingPosition(boardState) {
  if (!boardState) return false;
  const keys = Object.keys(STARTING_BOARD);
  if (Object.keys(boardState).length !== 32) return false;
  return keys.every((key) => boardState[key] === STARTING_BOARD[key]);
}

function findButtonByText(text, options = {}) {
  const { excludeNav = false, minWidth = 0 } = options;
  const buttons = Array.from(
    document.querySelectorAll('button, a, div[role="button"]'),
  );
  return buttons.find((b) => {
    const btnText = b.textContent || b.innerText || "";
    const isVisible = b.offsetWidth > 0 || b.offsetHeight > 0;
    if (!isVisible) return false;
    if (!btnText.toLowerCase().trim().includes(text.toLowerCase())) return false;
    // Optionally exclude small nav links (sidebar "Play" link is narrow)
    if (excludeNav && b.offsetWidth < minWidth) return false;
    // Exclude sidebar navigation items by checking common chess.com nav selectors
    if (excludeNav) {
      const isNav = b.closest('nav, .nav, [class*="sidebar"], [class*="left-nav"], [class*="nav-menu"], [class*="nav-link"]');
      if (isNav) return false;
    }
    return true;
  });
}

function dispatchPointer(type, elem, coords, buttonsOverride = 1) {
  const evt = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: coords.x,
    clientY: coords.y,
    buttons: buttonsOverride,
    pointerId: 1,
    isPrimary: true,
    width: 1,
    height: 1,
    pressure: buttonsOverride === 0 ? 0 : 0.5,
  });
  elem.dispatchEvent(evt);
}

function getSquareRect(square, boardEl, isFlipped) {
  const rect = boardEl.getBoundingClientRect();
  const size = rect.width / 8;
  const file = colToNum[square[0]];
  const rank = parseInt(square[1]);

  let x, y;
  if (isFlipped) {
    x = (8 - file) * size;
    y = (rank - 1) * size;
  } else {
    x = (file - 1) * size;
    y = (8 - rank) * size;
  }

  return {
    x: rect.left + x + size / 2,
    y: rect.top + y + size / 2,
  };
}

async function dispatchDragAndDrop(fromSq, toSq, isFlipped) {
  const boardEl =
    document.querySelector("chess-board") ||
    document.querySelector("wc-chess-board");
  if (!boardEl) return;

  const startCoords = getSquareRect(fromSq, boardEl, isFlipped);
  const endCoords = getSquareRect(toSq, boardEl, isFlipped);

  let targetEl = document.elementFromPoint(startCoords.x, startCoords.y) || boardEl;

  // 1. Pointer Down
  dispatchPointer("pointerdown", targetEl, startCoords, 1);
  await new Promise((r) => setTimeout(r, 60));

  // 2. Drag to destination
  dispatchPointer("pointermove", document.body, endCoords, 1);
  await new Promise((r) => setTimeout(r, 60));

  // 3. Drop
  dispatchPointer("pointerup", document.body, endCoords, 1);
}

function clickSquare(squareName, isFlipped) {
  // Kept for fallback or highlighting
  const boardEl =
    document.querySelector("chess-board") ||
    document.querySelector("wc-chess-board");
  if (!boardEl) return;

  const coords = getSquareRect(squareName, boardEl, isFlipped);
  const el = document.elementFromPoint(coords.x, coords.y) || boardEl;

  const downConfig = {
    clientX: coords.x,
    clientY: coords.y,
    button: 0,
    buttons: 1,
    bubbles: true,
    cancelable: true,
    view: window,
  };
  const upConfig = {
    clientX: coords.x,
    clientY: coords.y,
    button: 0,
    buttons: 0,
    bubbles: true,
    cancelable: true,
    view: window,
  };

  el.dispatchEvent(new PointerEvent("pointerdown", downConfig));
  el.dispatchEvent(new MouseEvent("mousedown", downConfig));

  setTimeout(() => {
    el.dispatchEvent(new PointerEvent("pointerup", upConfig));
    el.dispatchEvent(new MouseEvent("mouseup", upConfig));
  }, 30);
}

function selectPromotionPiece(toSquare, promotionType, isFlipped) {
  const color = ourColor;
  const pieceCode = color + promotionType.toLowerCase();
  let promoPiece = document.querySelector(
    `.promotion-piece.${pieceCode}, .promotion-menu [class*="${pieceCode}"]`,
  );

  if (!promoPiece) {
    const promoPieces = document.querySelectorAll(
      '.promotion-piece, [class*="promotion-piece"]',
    );
    for (const el of promoPieces) {
      if (
        el.className.includes(pieceCode) ||
        el.classList.contains(promotionType)
      ) {
        promoPiece = el;
        break;
      }
    }
  }

  if (promoPiece && typeof promoPiece.click === "function") {
    promoPiece.click();
  } else if (promoPiece) {
    promoPiece.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    );
  } else {
    const queenOption = document.querySelector(`.promotion-piece.${color}q`);
    if (queenOption && typeof queenOption.click === "function") {
      queenOption.click();
    } else if (queenOption) {
      queenOption.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: window,
        }),
      );
    }
  }
}

async function executeMove(moveStr) {
  if (isMakingMove) return;
  isMakingMove = true;

  try {
    const boardEl =
      document.querySelector("chess-board") ||
      document.querySelector("wc-chess-board");
    if (!boardEl) return;

    const isFlipped = boardEl.classList.contains("flipped");
    const fromSquare = moveStr.substring(0, 2);
    const toSquare = moveStr.substring(2, 4);
    const promotionType = moveStr.length > 4 ? moveStr[4] : null;

    if (moveRetryCount > 0) {
      // Retries use drag-and-drop (works even when click-to-move is disabled)
      console.log(`[Automata] Retry #${moveRetryCount}: using drag-and-drop for ${moveStr}`);
      await dispatchDragAndDrop(fromSquare, toSquare, isFlipped);
    } else {
      // First attempt: click-to-move
      clickSquare(fromSquare, isFlipped);
      await new Promise((r) => setTimeout(r, 200));
      clickSquare(toSquare, isFlipped);
    }

    if (promotionType) {
      await new Promise((r) => setTimeout(r, 400));
      selectPromotionPiece(toSquare, promotionType, isFlipped);
    }

    // State is intentionally NOT updated here.
    // The MutationObserver (handleBoardUpdate) will detect our move on the board
    // and securely update moveHistory, activeColor, and saveGameState.
  } catch (err) {
    console.error("[Automata] Error executing move:", err);
  } finally {
    setTimeout(() => {
      isMakingMove = false;
      // Verify the move actually registered on the board.
      // If the click failed silently, activeColor will still be ourColor.
      setTimeout(() => {
        if (gameInProgress && !isMakingMove && activeColor === ourColor) {
          moveRetryCount++;
          if (moveRetryCount <= 3) {
            console.log(`[Automata] Move click appears to have failed (board unchanged). Retry ${moveRetryCount}/3...`);
            updateSystemStatus('thinking', `Move Failed, Retrying (${moveRetryCount}/3)...`);
            processTurn();
          } else {
            console.log('[Automata] Move failed after 3 retries. Triggering auto-recovery...');
            updateSystemStatus('error', 'Move Failed — Auto-Recovering...');
            moveRetryCount = 0;
            forceRecoverBot('Auto-recovery: move failed after 3 retries');
          }
        }
      }, 3000);
    }, 800);
  }
}

function getHumanDelay(history, targetSpeed, isPreMove) {
  if (isPreMove) return 120 + Math.random() * 130;

  let baseDelay = targetSpeed * 1000;
  if (history.length < 6) baseDelay *= 0.45;
  else if (history.length > 45) baseDelay *= 0.75;

  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const normalRandom =
    Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);

  let finalDelay = baseDelay + normalRandom * (baseDelay * 0.28);
  // Minimum must exceed the isMakingMove lock (800 ms) to avoid a silent bail-out
  return Math.max(1000, Math.min(15000, finalDelay));
}

async function getEngineMove(settings) {
  if (!settings.engineUrl) {
    updateSystemStatus('error', 'No VPS URL Set');
    return null;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getEngineMove',
      data: {
        url: settings.engineUrl,
        moves: moveHistory,
        color: ourColor,
        elo: settings.computedElo || 1100,
      },
    });

    if (response.error) {
      throw new Error(response.error);
    }

    return response.move;
  } catch (err) {
    console.error('[Automata] API request failed:', err);
    updateSystemStatus('error', 'API Connect Failed');
    return null;
  }
}

function detectMoveByDiff(newBoardState, expectedColor) {
  if (!lastBoardState || Object.keys(lastBoardState).length === 0) return null;

  const changedSquares = [];
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const ranks = ["1", "2", "3", "4", "5", "6", "7", "8"];

  for (const f of files) {
    for (const r of ranks) {
      const sq = f + r;
      if (lastBoardState[sq] !== newBoardState[sq]) {
        changedSquares.push({
          sq,
          oldPiece: lastBoardState[sq],
          newPiece: newBoardState[sq],
        });
      }
    }
  }

  if (changedSquares.length === 0) return null;

  let fromSq = null;
  let toSq = null;
  let promo = null;

  if (changedSquares.length >= 3) {
    for (const c of changedSquares) {
      if (c.oldPiece === expectedColor + "k") fromSq = c.sq;
      if (c.newPiece === expectedColor + "k") toSq = c.sq;
    }
  }

  if (!fromSq || !toSq) {
    for (const c of changedSquares) {
      if (
        c.oldPiece &&
        c.oldPiece[0] === expectedColor &&
        (!c.newPiece || c.newPiece[0] !== expectedColor)
      ) {
        fromSq = c.sq;
      }
      if (
        c.newPiece &&
        c.newPiece[0] === expectedColor &&
        (!c.oldPiece || c.oldPiece[0] !== expectedColor)
      ) {
        toSq = c.sq;
      }
    }
  }

  if (!fromSq || !toSq) return null;

  const movedPiece = newBoardState[toSq];
  if (movedPiece && movedPiece[1] !== "p") {
    if (
      (expectedColor === "w" && toSq[1] === "8" && fromSq[1] === "7") ||
      (expectedColor === "b" && toSq[1] === "1" && fromSq[1] === "2")
    ) {
      promo = movedPiece[1];
    }
  }

  let moveStr = fromSq + toSq;
  if (promo) moveStr += promo;

  return moveStr;
}

function isGameOver() {
  // 1. Check for game-over modals (chess.com uses several class names)
  const modalSelectors = [
    '.game-over-modal-container',
    '.game-over-header-component',
    '.game-over-dialog',
    '.board-modal-container-container',
    '.game-result',
    '[class*="game-over"]',
    '[class*="gameOver"]',
  ];
  for (const sel of modalSelectors) {
    const el = document.querySelector(sel);
    if (el && (el.offsetWidth > 0 || el.offsetHeight > 0)) return true;
  }

  // 2. Check for "Play Again", "Next Game", "Rematch" buttons
  if (
    findButtonByText('Play Again') ||
    findButtonByText('Next Game') ||
    findButtonByText('Rematch') ||
    findButtonByText('New Game')
  ) return true;

  // 3. Check for game-over text anywhere visible on the page
  const allText = document.body?.innerText || '';
  const gameOverPatterns = [
    'game over', 'resigned', 'checkmate', 'stalemate',
    'abandoned', 'aborted', 'time out', 'wins by',
    'draw by', 'insufficient material',
  ];
  // Only check the bottom portion of the page (modals overlay the board)
  const modalAreas = document.querySelectorAll(
    '[class*="modal"], [class*="dialog"], [class*="game-over"], [class*="result"]'
  );
  for (const area of modalAreas) {
    const text = (area.innerText || '').toLowerCase();
    if (text.length > 5) {
      for (const pattern of gameOverPatterns) {
        if (text.includes(pattern)) return true;
      }
    }
  }

  // 4. Both clocks exist but neither is active (game ended)
  const clockBottom = document.querySelector('[class*="clock-bottom"], .clock-bottom');
  const clockTop = document.querySelector('[class*="clock-top"], .clock-top');
  if (clockBottom && clockTop && gameInProgress) {
    const anyActive = document.querySelector(
      '.clock-player-turn, [class*="player-turn"]'
    );
    // If no clock is active and we've been playing, it likely ended
    if (!anyActive && moveHistory.length > 2) {
      // Debounce: only trigger after 3 seconds of no active clock
      const now = Date.now();
      if (lastGameOverCheck === 0) {
        lastGameOverCheck = now;
      } else if (now - lastGameOverCheck > 3000) {
        return true;
      }
    } else {
      lastGameOverCheck = 0;
    }
  }

  return false;
}

function parseGameOutcome() {
  // Collect text from all game-over related elements
  const candidates = document.querySelectorAll(
    '[class*="game-over"], [class*="gameOver"], [class*="modal"], [class*="result"], [class*="dialog"]'
  );
  let text = '';
  for (const el of candidates) {
    text += ' ' + (el.innerText || el.textContent || '');
  }
  text = text.toLowerCase();

  // Draw detection
  if (
    text.includes('draw') ||
    text.includes('stalemate') ||
    text.includes('insufficient') ||
    text.includes('repetition') ||
    text.includes('agreed')
  )
    return 'draw';

  // Win detection
  if (
    text.includes('you won') ||
    text.includes('victory') ||
    text.includes('won on time') ||
    text.includes('you win')
  )
    return 'win';

  // Loss detection
  if (
    text.includes('you lost') ||
    text.includes('defeat') ||
    text.includes('lost on time') ||
    text.includes('you lose')
  )
    return 'loss';

  // Resignation detection
  if (text.includes('resigned')) {
    // "White resigned" means black won, "Black resigned" means white won
    if (text.includes('white resigned'))
      return ourColor === 'w' ? 'loss' : 'win';
    if (text.includes('black resigned'))
      return ourColor === 'b' ? 'loss' : 'win';
    // Generic "resigned" — assume opponent resigned (we won)
    return 'win';
  }

  // Abandonment
  if (text.includes('abandoned') || text.includes('aborted'))
    return 'draw';

  // Checkmate
  if (text.includes('checkmate')) {
    if (text.includes('white') && text.includes('win'))
      return ourColor === 'w' ? 'win' : 'loss';
    if (text.includes('black') && text.includes('win'))
      return ourColor === 'b' ? 'win' : 'loss';
    // Fallback: if it says checkmate, check whose turn it was
    // If it was our turn when checkmate happened, we lost
    return activeColor === ourColor ? 'loss' : 'win';
  }

  // Color-specific win text
  if (text.includes('white won') || text.includes('white is victorious') || text.includes('white wins'))
    return ourColor === 'w' ? 'win' : 'loss';
  if (text.includes('black won') || text.includes('black is victorious') || text.includes('black wins'))
    return ourColor === 'b' ? 'win' : 'loss';

  // Timeout
  if (text.includes('timeout') || text.includes('time out') || text.includes('ran out of time')) {
    if (text.includes('white')) return ourColor === 'w' ? 'loss' : 'win';
    if (text.includes('black')) return ourColor === 'b' ? 'loss' : 'win';
    return 'loss'; // If we can't tell, assume we lost on time
  }

  return 'draw';
}

function handleAutoQueue() {
  if (autoQueueTimeout) return;
  const queueDelay = 8000 + Math.random() * 8000;

  autoQueueTimeout = setTimeout(() => {
    autoQueueTimeout = null;
    // Don't queue if a game is currently in progress (prevents false game-over triggers)
    if (gameInProgress) return;
    chrome.storage.local.get({ autoQueue: true }, (settings) => {
      if (!settings.autoQueue) return;

      updateSystemStatus("running", "Queueing Match...");
      autoQueueInProgress = true; // Suppress board observer during navigation
      // Save intent to queue, then navigate to the play page directly
      sessionStorage.setItem("automata_autoqueue", "true");
      // Navigate to /play/online directly instead of reloading — this lands us
      // on the matchmaking page where the "Play" button is immediately available.
      const targetUrl = 'https://www.chess.com/play/online';
      if (window.location.href.includes('/play/online')) {
        window.location.reload();
      } else {
        window.location.href = targetUrl;
      }
    });
  }, queueDelay);
}

// Check for pending queue after a refresh
if (sessionStorage.getItem("automata_autoqueue") === "true") {
  sessionStorage.removeItem("automata_autoqueue");
  autoQueueInProgress = true; // Keep board observer suppressed until we click Play

  // Wait 5 seconds for DOM to settle after reload/navigation
  setTimeout(() => {
    console.log("[Automata AutoQueue] Post-reload: looking for Play button...");
    updateSystemStatus("running", "Looking for Play button...");

    // Retry loop: poll every 1.5 seconds for up to 25 attempts (~37 seconds)
    let attempts = 0;
    const maxAttempts = 25;
    const retryInterval = setInterval(() => {
      attempts++;

      // Look for game-start buttons — avoid matching the sidebar "Play" nav link.
      // Prioritize specific buttons first, then fall back to generic "Play" with nav exclusion.
      const playBtn =
        findButtonByText("Play Again") ||
        findButtonByText("New Game") ||
        findButtonByText("Next Game") ||
        findButtonByText("New 10 min") ||
        findButtonByText("New 5 min") ||
        findButtonByText("New 3 min") ||
        findButtonByText("New 1 min") ||
        findButtonByText("Start Game") ||
        document.querySelector(
          'button[data-cy="new-game-index-button"], button[data-cy="new-game-button"], ' +
          'button[data-cy="play-button"], .game-over-buttons-play-again'
        ) ||
        // Look for a large primary "Play" button (not the sidebar nav link)
        document.querySelector(
          '.ui_v5-button-primary, .ui_v5-button-large, ' +
          'button.ui_v5-button-component.ui_v5-button-primary'
        ) ||
        findButtonByText("Play", { excludeNav: true, minWidth: 80 });

      if (playBtn) {
        clearInterval(retryInterval);
        console.log(`[Automata AutoQueue] Found Play button after ${attempts} attempt(s): "${(playBtn.textContent || '').trim().substring(0, 30)}". Clicking.`);
        playBtn.click();
        updateSystemStatus("running", "Queueing Match...");
        // Release the board observer suppression after a short delay
        // to let chess.com transition to the game board.
        setTimeout(() => {
          autoQueueInProgress = false;
          console.log("[Automata AutoQueue] Released board observer suppression.");
        }, 5000);
        return;
      }

      if (attempts >= maxAttempts) {
        clearInterval(retryInterval);
        autoQueueInProgress = false;
        console.warn("[Automata AutoQueue] Could not find Play button after ~37 seconds. Giving up.");
        updateSystemStatus("idle", "AutoQueue Failed — No Play Button Found");
      } else {
        console.log(`[Automata AutoQueue] Play button not found yet (attempt ${attempts}/${maxAttempts})...`);
      }
    }, 1500);
  }, 5000);
}

async function processTurn() {
  const turnAtStart = activeColor;
  
  chrome.storage.local.get(
    {
      autoPlay: true,
      humanMode: true,
      engineUrl: "http://100.86.25.112:8000/move",
      targetAccuracy: 80,
      premoveProb: 20,
      thinkingSpeed: 3.5,
      autoRandomizeSpeed: false,
    },
    async (settings) => {
      // Auto-randomize thinking speed PER MOVE if enabled
      if (settings.autoRandomizeSpeed) {
        settings.thinkingSpeed = 1.5 + Math.random() * 3.5;
        chrome.storage.local.set({ thinkingSpeed: parseFloat(settings.thinkingSpeed.toFixed(2)) });
      }

      if (!settings.autoPlay) {
        updateSystemStatus('running', 'Auto-Play Disabled');
        return;
      }

      // If the turn changed while we were fetching settings
      if (activeColor !== turnAtStart || activeColor !== ourColor) return;

      // Determine ELO to send to the engine
      let elo = 1100; // default
      let isBlundering = false;
      const personality = humanProfile.currentPersonality;

      if (settings.humanMode && personality) {
        const moveNum = Math.ceil((moveHistory.length + 1) / 2);
        elo = getPhaseElo(moveNum, personality);

        // Check for blunder: request at very low ELO instead
        if (shouldBlunder(personality)) {
          isBlundering = true;
          elo = 400 + Math.floor(Math.random() * 200); // terrible move
          console.log(`[Automata Human] BLUNDER on move ${moveNum}! Using ELO ${elo}`);
        } else {
          console.log(`[Automata Human] Move ${moveNum}, phase ELO: ${elo}`);
        }
      } else {
        // Manual mode: convert accuracy slider (50-95) to ELO (800-1500)
        elo = Math.round(800 + (settings.targetAccuracy - 50) * (700 / 45));
      }

      updateSystemStatus('thinking', 'Querying VPS Engine...');

      // Override settings with computed ELO
      const engineSettings = { ...settings, computedElo: elo };
      const engineMove = await getEngineMove(engineSettings);
      if (!engineMove) return;

      // If the turn changed while querying the engine
      if (activeColor !== turnAtStart || activeColor !== ourColor) return;

      updateSystemStatus('thinking', 'Thinking (Human Delay)...');

      const isRecapture =
        moveHistory.length > 0 &&
        moveHistory[moveHistory.length - 1].substring(2, 4) ===
          engineMove.substring(2, 4);
      const isPreMove =
        Math.random() * 100 < settings.premoveProb ||
        (isRecapture && Math.random() * 100 < 60);
      const delay = getHumanDelay(
        moveHistory,
        settings.thinkingSpeed,
        isPreMove,
      );

      setTimeout(() => {
        // Final safety check before physically clicking
        if (activeColor !== turnAtStart || activeColor !== ourColor) return;
        executeMove(engineMove);
      }, delay);
    },
  );
}

function saveGameState() {
  chrome.storage.local.set({
    savedGameId: window.location.href,
    savedHistory: moveHistory,
    savedColor: ourColor,
    savedActive: activeColor,
  });
}

function tryRestoreGame() {
  chrome.storage.local.get(
    ["savedGameId", "savedHistory", "savedColor", "savedActive"],
    (res) => {
      if (res.savedGameId === window.location.href && res.savedHistory) {
        if (isStartingPosition(parseBoardDOM())) {
          return; // It's a new game, do not restore old state!
        }
        moveHistory = res.savedHistory;
        ourColor = res.savedColor;
        activeColor = res.savedActive;
        gameInProgress = true;
        lastBoardState = parseBoardDOM();
        updateSystemStatus("running", "Restored Active Match");
        if (activeColor === ourColor) processTurn();
      }
    },
  );
}

// Returns which color's turn it is by reading chess.com's active-clock indicator,
// or falls back to counting the moves shown in the move list.
function detectActiveColorFromDOM() {
  // chess.com adds a class to the clock of the player whose turn it is.
  // The bottom clock always belongs to us (the local player).
  const bottomTurn = document.querySelector(
    '.clock-bottom.clock-player-turn, .clock-bottom [class*="player-turn"], [class*="bottom"][class*="player-turn"]',
  );
  if (bottomTurn) return ourColor;

  const topTurn = document.querySelector(
    '.clock-top.clock-player-turn, .clock-top [class*="player-turn"], [class*="top"][class*="player-turn"]',
  );
  if (topTurn) return ourColor === "w" ? "b" : "w";

  // Fallback: count rendered half-moves. Even count = white to move, odd = black.
  const plies = document.querySelectorAll(
    ".main-line-ply, .move-text-component, [data-ply]",
  );
  if (plies.length > 0) return plies.length % 2 === 0 ? "w" : "b";

  return null;
}

// Try to read UCI moves from chess.com's DOM using multiple fallback strategies.
function parseDOMMoveHistory() {
  let moves = [];

  // ── Strategy 1: data-uci attributes (original, fastest) ──
  document.querySelectorAll("[data-uci]").forEach((el) => {
    const uci = el.getAttribute("data-uci");
    if (uci && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) moves.push(uci);
  });
  if (moves.length > 0) {
    console.log(`[Automata MoveHistory] Strategy 1 (data-uci): found ${moves.length} moves`);
    return moves;
  }

  // ── Strategy 2: chess.com web-component internal game object ──
  try {
    const boardEl = document.querySelector('wc-chess-board') || document.querySelector('chess-board');
    if (boardEl) {
      // Try direct .game property
      const game = boardEl.game;
      if (game) {
        // chess.com stores moves in various internal formats
        const historyMethods = ['getHistory', 'getMoveList', 'getMoves', 'history'];
        for (const method of historyMethods) {
          if (typeof game[method] === 'function') {
            const history = game[method]({ verbose: true });
            if (Array.isArray(history) && history.length > 0) {
              for (const m of history) {
                if (typeof m === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m)) {
                  moves.push(m);
                } else if (m && m.from && m.to) {
                  moves.push(m.from + m.to + (m.promotion || ''));
                } else if (m && m.uci) {
                  moves.push(m.uci);
                }
              }
              break;
            }
          }
          // Also try as a property (not function)
          if (Array.isArray(game[method]) && game[method].length > 0) {
            for (const m of game[method]) {
              if (typeof m === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m)) {
                moves.push(m);
              } else if (m && m.from && m.to) {
                moves.push(m.from + m.to + (m.promotion || ''));
              }
            }
            if (moves.length > 0) break;
          }
        }
      }
    }
  } catch (e) {
    console.log('[Automata MoveHistory] Strategy 2 (game object) failed:', e.message);
  }
  if (moves.length > 0) {
    console.log(`[Automata MoveHistory] Strategy 2 (game object): found ${moves.length} moves`);
    return moves;
  }

  // ── Strategy 3: Broader DOM selectors (shadow root, data-ply, move-node) ──
  const broadSelectors = [
    '.move-node[data-uci]',
    '.main-line-ply[data-uci]',
    '.move[data-uci]',
    '[data-ply][data-uci]',
    '.vertical-move-list [data-uci]',
    '.move-list [data-uci]',
  ];
  for (const sel of broadSelectors) {
    const els = document.querySelectorAll(sel);
    els.forEach((el) => {
      const uci = el.getAttribute('data-uci');
      if (uci && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) moves.push(uci);
    });
    if (moves.length > 0) break;
  }

  // Also try inside shadow root
  if (moves.length === 0) {
    const boardEl = document.querySelector('wc-chess-board') || document.querySelector('chess-board');
    if (boardEl && boardEl.shadowRoot) {
      boardEl.shadowRoot.querySelectorAll('[data-uci]').forEach((el) => {
        const uci = el.getAttribute('data-uci');
        if (uci && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) moves.push(uci);
      });
    }
  }
  if (moves.length > 0) {
    console.log(`[Automata MoveHistory] Strategy 3 (broad selectors): found ${moves.length} moves`);
    return moves;
  }

  // ── Strategy 4: Parse SAN move text → replay on lightweight board to get UCI ──
  try {
    moves = parseSANMovesFromDOM();
    if (moves.length > 0) {
      console.log(`[Automata MoveHistory] Strategy 4 (SAN replay): found ${moves.length} moves`);
      return moves;
    }
  } catch (e) {
    console.log('[Automata MoveHistory] Strategy 4 (SAN replay) failed:', e.message);
  }

  console.warn('[Automata MoveHistory] All strategies failed. Returning empty array.');
  return [];
}

// ── SAN text scraper + lightweight board replay ──
// Reads chess.com's move list text and converts SAN → UCI using a simple board tracker.
// Handles chess.com's figurine notation where pieces are rendered via icon-font spans.
function parseSANMovesFromDOM() {
  const sanMoves = [];

  // ── Approach A: Find individual move nodes and extract SAN from each ──
  const moveNodeSelectors = [
    // chess.com v1 (classic)
    '.white.node, .black.node',
    // chess.com v2 (newer)
    '.main-line-ply',
    '.move-text-component',
    // chess.com v3 (latest)
    '.move-node',
    '[data-ply]:not([data-whole-move-number])',
    '.node:not(.move-number)',
  ];

  for (const sel of moveNodeSelectors) {
    const els = document.querySelectorAll(sel);
    if (els.length < 2) continue;

    console.log(`[Automata SAN] Trying selector '${sel}' → found ${els.length} elements`);

    els.forEach((el) => {
      const san = extractSANFromElement(el);
      if (san && san.length >= 2 && san.length <= 7) {
        sanMoves.push(san);
      }
    });

    if (sanMoves.length > 0) {
      console.log(`[Automata SAN] Selector '${sel}' yielded ${sanMoves.length} SAN moves:`, sanMoves.slice(0, 15));
      break;
    }
  }

  // ── Approach B: If no individual nodes found, try the entire move list text ──
  if (sanMoves.length === 0) {
    const listSelectors = [
      '.move-list',
      '.vertical-move-list',
      '.moves-container',
      '[class*="move-list"]',
    ];

    for (const sel of listSelectors) {
      const listEl = document.querySelector(sel);
      if (!listEl) continue;

      const fullText = (listEl.textContent || '').trim();
      if (fullText.length < 4) continue;

      console.log(`[Automata SAN] Trying full text parse from '${sel}'`);
      
      // Parse "1. d4 d5 2. e3 Nf6 3. Bb5+ c6 ..." format
      const movePattern = /(?:\d+\.\s*)?([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|O-O-O|O-O|0-0-0|0-0)/g;
      let match;
      while ((match = movePattern.exec(fullText)) !== null) {
        let san = match[1].replace(/[+#]/g, '').trim();
        if (san.length >= 2) sanMoves.push(san);
      }

      if (sanMoves.length > 0) {
        console.log(`[Automata SAN] Full text parse yielded ${sanMoves.length} moves:`, sanMoves.slice(0, 15));
        break;
      }
    }
  }

  if (sanMoves.length === 0) {
    console.log('[Automata SAN] Could not find any SAN moves in the DOM.');
    return [];
  }

  // Replay on a lightweight board to convert SAN → UCI
  return replaySANtoUCI(sanMoves);
}

// Extract SAN notation from a single move element, handling:
// - Icon-font piece symbols (chess.com renders ♞ via <span class="icon-font-chess wn">)
// - Unicode chess symbols (♔♕♖♗♘ etc.)
// - Plain text SAN ("Nf3", "e4")
function extractSANFromElement(el) {
  // Skip move number labels
  const rawText = (el.textContent || '').trim();
  if (/^\d+\.?\s*$/.test(rawText)) return null;

  // Step 1: Check for icon-font piece notation in child elements
  let pieceLetter = '';
  const iconEl = el.querySelector(
    '[class*="icon-font-chess"], [class*="figurine"], [class*="piece-icon"], ' +
    '[data-figurine], [class*="chess-piece"]'
  );

  if (iconEl) {
    const classes = (iconEl.className || '') + ' ' + (iconEl.getAttribute('data-figurine') || '');
    const cl = classes.toLowerCase();
    
    if (cl.includes('knight') || /\b[wb]n\b/.test(cl)) pieceLetter = 'N';
    else if (cl.includes('bishop') || /\b[wb]b\b/.test(cl)) pieceLetter = 'B';
    else if (cl.includes('rook') || /\b[wb]r\b/.test(cl)) pieceLetter = 'R';
    else if (cl.includes('queen') || /\b[wb]q\b/.test(cl)) pieceLetter = 'Q';
    else if (cl.includes('king') || /\b[wb]k\b/.test(cl)) pieceLetter = 'K';
    // Pawns don't get a letter prefix
  }

  // Step 2: Build move text from child nodes, skipping icon elements
  let coords = '';
  function walkNodes(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      coords += node.textContent;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const cn = (node.className || '').toLowerCase();
      // Skip icon-font elements (we already extracted the piece letter)
      if (cn.includes('icon-font') || cn.includes('figurine') || cn.includes('piece-icon')) {
        return;
      }
      // Skip move number spans
      if (cn.includes('move-number') || cn.includes('moveNumber')) {
        return;
      }
      node.childNodes.forEach(walkNodes);
    }
  }
  el.childNodes.forEach(walkNodes);
  coords = coords.trim();

  // Step 3: Handle unicode chess piece symbols that might be in the text
  const unicodeMap = {
    '♔': 'K', '♕': 'Q', '♖': 'R', '♗': 'B', '♘': 'N', '♙': '',
    '♚': 'K', '♛': 'Q', '♜': 'R', '♝': 'B', '♞': 'N', '♟': '',
    '\u265A': 'K', '\u265B': 'Q', '\u265C': 'R', '\u265D': 'B', '\u265E': 'N', '\u265F': '',
    '\u2654': 'K', '\u2655': 'Q', '\u2656': 'R', '\u2657': 'B', '\u2658': 'N', '\u2659': '',
  };

  for (const [sym, letter] of Object.entries(unicodeMap)) {
    if (coords.includes(sym)) {
      if (!pieceLetter && letter) pieceLetter = letter;
      coords = coords.replace(sym, '');
    }
  }

  // Step 4: Clean up the coordinates
  coords = coords.replace(/^\d+\.\s*/, ''); // remove move number
  coords = coords.replace(/[+#!?]+/g, '');   // remove annotations
  coords = coords.replace(/\s+/g, '');        // remove whitespace
  coords = coords.trim();

  if (!coords) return null;

  // Handle castling
  if (coords === 'O-O' || coords === '0-0') return 'O-O';
  if (coords === 'O-O-O' || coords === '0-0-0') return 'O-O-O';

  // Combine: piece letter + coordinates
  const san = pieceLetter + coords;
  return san;
}

// Minimal board tracker: just piece placement (no full chess rules engine).
// Handles standard moves, captures, castling, pawn promotion, en passant.
function replaySANtoUCI(sanMoves) {
  const FILES = 'abcdefgh';
  const board = {}; // sq → 'wp', 'bk', etc.

  // Initialize board from STARTING_BOARD (defined globally)
  for (const sq in STARTING_BOARD) {
    board[sq] = STARTING_BOARD[sq];
  }

  const pieceMap = { K: 'k', Q: 'q', R: 'r', B: 'b', N: 'n' };
  const uciMoves = [];
  let colorToMove = 'w';

  for (const san of sanMoves) {
    const uci = sanToUCI(san, board, colorToMove, FILES, pieceMap);
    if (!uci) {
      console.warn(`[Automata SAN→UCI] Could not convert: "${san}" (move #${uciMoves.length + 1}). Stopping.`);
      break; // Stop on first failure — partial history is better than garbage
    }

    // Apply the move to the board
    applyUCItoBoard(uci, board, colorToMove);
    uciMoves.push(uci);
    colorToMove = colorToMove === 'w' ? 'b' : 'w';
  }

  return uciMoves;
}

function sanToUCI(san, board, color, FILES, pieceMap) {
  // Handle castling
  if (san === 'O-O' || san === '0-0') {
    const rank = color === 'w' ? '1' : '8';
    return `e${rank}g${rank}`;
  }
  if (san === 'O-O-O' || san === '0-0-0') {
    const rank = color === 'w' ? '1' : '8';
    return `e${rank}c${rank}`;
  }

  // Strip annotations
  let s = san.replace(/[+#!?=]/g, '').trim();
  if (!s) return null;

  // Promotion: e.g. "e8Q" or "exd8Q" or "e8=Q"
  let promotion = '';
  const promoMatch = s.match(/([qrbnQRBN])$/);
  if (promoMatch) {
    const lastChar = promoMatch[1];
    // Check if this is actually a promotion (pawn reaching last rank)
    // by seeing if the char before it is a rank '1' or '8'
    const beforePromo = s.slice(0, -1);
    if (beforePromo.length >= 2) {
      const destRank = beforePromo[beforePromo.length - 1];
      if (destRank === '8' || destRank === '1') {
        promotion = lastChar.toLowerCase();
        s = beforePromo;
      }
    }
  }

  // Pawn move: starts with lowercase letter or is just coords like "e4"
  const firstChar = s[0];
  if (firstChar === firstChar.toLowerCase() && FILES.includes(firstChar)) {
    // Pawn move
    const isCapture = s.includes('x');
    s = s.replace('x', '');

    if (s.length === 2) {
      // Simple pawn push: e.g. "e4"
      const toSq = s;
      const toFile = toSq[0];
      const toRank = parseInt(toSq[1]);

      // Find the pawn that could move here
      let fromSq = null;
      if (color === 'w') {
        // Try one square back
        const oneBack = toFile + (toRank - 1);
        if (board[oneBack] === 'wp') fromSq = oneBack;
        // Try two squares back (from rank 2)
        if (!fromSq && toRank === 4) {
          const twoBack = toFile + '2';
          if (board[twoBack] === 'wp' && !board[toFile + '3']) fromSq = twoBack;
        }
      } else {
        const oneBack = toFile + (toRank + 1);
        if (board[oneBack] === 'bp') fromSq = oneBack;
        if (!fromSq && toRank === 5) {
          const twoBack = toFile + '7';
          if (board[twoBack] === 'bp' && !board[toFile + '6']) fromSq = twoBack;
        }
      }
      return fromSq ? fromSq + toSq + promotion : null;
    }

    if (s.length === 3 && isCapture) {
      // Pawn capture: e.g. "ed5" (from e-file captures to d5)
      const fromFile = firstChar;
      const toSq = s.substring(1);
      const toRank = parseInt(toSq[1]);

      // Find pawn on the from file that can capture
      const expectedRank = color === 'w' ? toRank - 1 : toRank + 1;
      const fromSq = fromFile + expectedRank;
      if (board[fromSq] === color + 'p') {
        return fromSq + toSq + promotion;
      }
      return null;
    }

    // Edge case: "exd5" was already handled (x stripped, leaving "ed5")
    return null;
  }

  // Piece move: starts with uppercase
  if (!pieceMap[firstChar]) return null;
  const pieceType = pieceMap[firstChar];
  const target = color + pieceType;

  let rest = s.substring(1).replace('x', '');
  // rest could be: "f3", "1f3" (disambiguation by rank), "gf3" (disambiguation by file), "g1f3" (full disambiguation)

  if (rest.length < 2) return null;
  const toSq = rest.slice(-2);
  const disambig = rest.slice(0, -2);

  // Find all pieces of this type belonging to color
  const candidates = [];
  for (const sq in board) {
    if (board[sq] === target) {
      if (canPieceReach(pieceType, sq, toSq, board, FILES)) {
        candidates.push(sq);
      }
    }
  }

  if (candidates.length === 0) return null;

  if (candidates.length === 1) {
    return candidates[0] + toSq + promotion;
  }

  // Disambiguate
  for (const cand of candidates) {
    if (disambig.length === 2 && cand === disambig) return cand + toSq + promotion;
    if (disambig.length === 1) {
      if (FILES.includes(disambig) && cand[0] === disambig) return cand + toSq + promotion;
      if (/[1-8]/.test(disambig) && cand[1] === disambig) return cand + toSq + promotion;
    }
  }

  // Last resort: return first candidate
  return candidates[0] + toSq + promotion;
}

function canPieceReach(piece, from, to, board, FILES) {
  const ff = FILES.indexOf(from[0]), fr = parseInt(from[1]);
  const tf = FILES.indexOf(to[0]), tr = parseInt(to[1]);
  const df = tf - ff, dr = tr - fr;
  const adf = Math.abs(df), adr = Math.abs(dr);

  if (piece === 'n') {
    return (adf === 1 && adr === 2) || (adf === 2 && adr === 1);
  }
  if (piece === 'k') {
    return adf <= 1 && adr <= 1;
  }

  // Sliding pieces: check path is clear
  if (piece === 'b') {
    if (adf !== adr || adf === 0) return false;
    return isPathClear(from, to, df, dr, board, FILES);
  }
  if (piece === 'r') {
    if (df !== 0 && dr !== 0) return false;
    return isPathClear(from, to, df, dr, board, FILES);
  }
  if (piece === 'q') {
    if (adf !== adr && df !== 0 && dr !== 0) return false;
    return isPathClear(from, to, df, dr, board, FILES);
  }
  return false;
}

function isPathClear(from, to, df, dr, board, FILES) {
  const ff = FILES.indexOf(from[0]), fr = parseInt(from[1]);
  const steps = Math.max(Math.abs(df), Math.abs(dr));
  const stepF = df === 0 ? 0 : df / Math.abs(df);
  const stepR = dr === 0 ? 0 : dr / Math.abs(dr);

  for (let i = 1; i < steps; i++) {
    const sq = FILES[ff + stepF * i] + (fr + stepR * i);
    if (board[sq]) return false; // blocked
  }
  return true;
}

function applyUCItoBoard(uci, board, color) {
  const from = uci.substring(0, 2);
  const to = uci.substring(2, 4);
  const promo = uci.length > 4 ? uci[4] : null;

  const piece = board[from];
  delete board[from];

  if (promo) {
    board[to] = color + promo;
  } else {
    board[to] = piece;
  }

  // Handle castling rook
  if (piece && piece[1] === 'k') {
    const rank = color === 'w' ? '1' : '8';
    if (from === 'e' + rank && to === 'g' + rank) {
      board['f' + rank] = board['h' + rank];
      delete board['h' + rank];
    }
    if (from === 'e' + rank && to === 'c' + rank) {
      board['d' + rank] = board['a' + rank];
      delete board['a' + rank];
    }
  }

  // Handle en passant
  if (piece && piece[1] === 'p' && from[0] !== to[0] && !board[to]) {
    // Pawn moved diagonally to an empty square → en passant
    delete board[to[0] + from[1]];
  }
}

// Called when we find pieces on the board but didn't see the starting position.
// Attempts to bootstrap the engine into an already-running game.
function tryStartMidGame(boardState) {
  // Don't try to start a game during auto-queue navigation
  if (autoQueueInProgress) {
    console.log('[Automata] Skipping tryStartMidGame — auto-queue in progress');
    return;
  }

  const pieceCount = Object.keys(boardState).length;
  if (pieceCount < 2) return;

  // Clocks must be present AND actively running to confirm this is a live game,
  // not the lobby board or an analysis board. Chess.com shows clock elements on
  // the /play page even when no game is active, so just checking for clock
  // presence causes false positives.
  const hasActiveClock = document.querySelector(
    '.clock-player-turn, [class*="clock"][class*="player-turn"], ' +
    '.clock-bottom.clock-player-turn, .clock-top.clock-player-turn'
  );
  if (!hasActiveClock) {
    // Fallback: at least require both top and bottom clocks with actual time text
    const clockBottom = document.querySelector('.clock-bottom, [class*="clock-bottom"]');
    const clockTop = document.querySelector('.clock-top, [class*="clock-top"]');
    if (!clockBottom || !clockTop) return;
    const bottomText = (clockBottom.textContent || '').trim();
    const topText = (clockTop.textContent || '').trim();
    // Clocks should show time like "5:00" or "3:24" — if both are empty, this isn't a game
    if (!bottomText.match(/\d+:\d+/) || !topText.match(/\d+:\d+/)) return;
  }

  const boardEl =
    document.querySelector("chess-board") ||
    document.querySelector("wc-chess-board");
  if (!boardEl) return;

  const isFlipped = boardEl.classList.contains("flipped");
  ourColor = isFlipped ? "b" : "w";

  const detectedActive = detectActiveColorFromDOM();
  if (detectedActive === null) {
    console.log(
      "[Automata] Mid-game: could not determine active color, skipping.",
    );
    return;
  }

  gameInProgress = true;
  activeColor = detectedActive;
  moveHistory = parseDOMMoveHistory();
  lastBoardState = Object.assign({}, boardState);

  console.log(
    `[Automata] Mid-game detected. Color: ${ourColor}, Active: ${activeColor}, History: ${moveHistory.length} moves`,
  );
  updateSystemStatus(
    "running",
    `Active Match (${ourColor === "w" ? "White" : "Black"})`,
  );

  chrome.runtime
    .sendMessage({
      action: "gameStarted",
      data: { color: ourColor === "w" ? "White" : "Black" },
    })
    .catch(() => {});

  if (activeColor === ourColor) processTurn();
}

// Checks if a real game is actively being played (not just a lobby/matchmaking board).
// Chess.com shows the board in starting position on the /play page BEFORE an opponent
// is matched. This function distinguishes that from an actual live game.
function isRealGameActive() {
  // 1. Check for actively ticking clock (chess.com adds 'clock-player-turn' class)
  const activeClock = document.querySelector(
    '.clock-player-turn, [class*="clock"][class*="player-turn"]'
  );
  if (activeClock) return true;

  // 2. Check if the opponent has a real username (not the placeholder "Opponent")
  const opponentSelectors = [
    '.board-player-default-top .user-tagline-username',
    '.board-player-default-top [class*="username"]',
    '[class*="player-top"] [class*="username"]',
    '.player-top .user-tagline-component',
  ];
  for (const sel of opponentSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      const name = (el.textContent || '').trim().toLowerCase();
      // "Opponent" is the chess.com placeholder before matchmaking completes
      if (name && name !== 'opponent' && name.length > 1) return true;
    }
  }

  // 3. Check if there's a move list with any moves (game has started)
  const moveNodes = document.querySelectorAll('[data-ply], .main-line-ply, .move-node');
  if (moveNodes.length > 0) return true;

  return false;
}

function handleBoardUpdate() {
  // Don't process board updates during auto-queue navigation
  if (autoQueueInProgress) return;

  const boardState = parseBoardDOM();
  if (!boardState) return;

  if (isStartingPosition(boardState) && !gameInProgress) {
    // CRITICAL: Don't start a game unless a real opponent is matched.
    // Chess.com shows the board in starting position on the /play page
    // while waiting for matchmaking. We must wait for an active clock
    // or a real opponent username before treating this as a live game.
    if (!isRealGameActive()) {
      return; // Still in lobby/matchmaking — don't start yet
    }

    gameInProgress = true;
    lastBoardState = Object.assign({}, boardState);
    lastGameOverCheck = 0;
    const boardEl =
      document.querySelector('chess-board') ||
      document.querySelector('wc-chess-board');
    const isFlipped = boardEl.classList.contains('flipped');
    ourColor = isFlipped ? 'b' : 'w';
    activeColor = 'w';
    moveHistory = [];
    
    updateSystemStatus('running', `Playing as ${ourColor === 'w' ? 'White ♙' : 'Black ♟'}`);
    
    // Generate fresh human personality for this game
    humanProfile.currentPersonality = generateGamePersonality();

    chrome.runtime
      .sendMessage({
        action: 'gameStarted',
        data: { color: ourColor === 'w' ? 'White' : 'Black' },
      })
      .catch(() => {});

    if (ourColor === 'w') {
      // Add a 1.5-second delay on the very first move to allow chess.com's 
      // "Game Started" overlay animation to disappear before we try to click.
      setTimeout(() => {
        if (gameInProgress && activeColor === 'w') processTurn();
      }, 1500);
    }
    return;
  }

  // Not at starting position and no game tracked yet — try to join mid-game.
  if (!gameInProgress) {
    tryStartMidGame(boardState);
    return;
  }

  if (gameInProgress) {
    // Dynamically sync ourColor with the board. Chess.com sometimes delays flipping the board 
    // for a few milliseconds after placing the starting pieces!
    const boardEl = document.querySelector("chess-board") || document.querySelector("wc-chess-board");
    if (boardEl) {
      ourColor = boardEl.classList.contains("flipped") ? "b" : "w";
    }

    if (activeColor !== ourColor) {
      const movePlayed = detectMoveByDiff(boardState, activeColor);
      if (movePlayed) {
        moveHistory.push(movePlayed);
        activeColor = ourColor;
        moveRetryCount = 0; // Opponent moved, so our previous move succeeded
        saveGameState();
        lastBoardState = Object.assign({}, boardState);
        processTurn();
      } else {
        const ourMovePlayed = detectMoveByDiff(boardState, ourColor);
        if (ourMovePlayed) {
          lastBoardState = Object.assign({}, boardState);
        }
      }
    } else {
      const ourMovePlayed = detectMoveByDiff(boardState, ourColor);
      if (ourMovePlayed) {
        moveHistory.push(ourMovePlayed);
        activeColor = activeColor === "w" ? "b" : "w";
        saveGameState();
        lastBoardState = Object.assign({}, boardState);
        updateSystemStatus("running", "Waiting for Opponent...");
      }
    }
  }
}

function setupBoardObserver() {
  const boardEl =
    document.querySelector("chess-board") ||
    document.querySelector("wc-chess-board");
  if (!boardEl) return;
  if (mutationObserver) mutationObserver.disconnect();

  mutationObserver = new MutationObserver(() => {
    if (isGameOver()) {
      if (gameInProgress) {
        gameInProgress = false;
        isMakingMove = false; // Unlock in case we were stuck mid-move
        const outcome = parseGameOutcome();
        
        // Update human profile
        recordOutcome(outcome);
        applyFatigue();
        
        chrome.runtime
          .sendMessage({
            action: 'gameEnded',
            data: { outcome },
          })
          .catch(() => {});
        updateSystemStatus('idle', `Game Over: ${outcome.toUpperCase()}`);
        chrome.storage.local.remove(['savedGameId', 'savedHistory', 'savedColor', 'savedActive']);
        
        // Auto-queue next match
        handleAutoQueue();
      }
      return;
    }
    handleBoardUpdate();
  });

  mutationObserver.observe(boardEl, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class"],
  });

  // chess-board / wc-chess-board is a Web Component — pieces live inside its
  // shadow root. MutationObserver does NOT cross the shadow boundary unless we
  // explicitly observe the shadow root as well.
  if (boardEl.shadowRoot) {
    mutationObserver.observe(boardEl.shadowRoot, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    console.log("[Automata] Observing shadow root of board element.");
  }

  // Immediately parse the board to catch the starting position!
  observedBoardEl = boardEl;
  handleBoardUpdate();
}

function startLifecycle() {
  let idleBoardSeconds = 0;

  // Board presence check — set up or tear down the observer as needed
  setInterval(() => {
    const boardEl =
      document.querySelector("chess-board") ||
      document.querySelector("wc-chess-board");
    if (boardEl && (!mutationObserver || observedBoardEl !== boardEl)) {
      setupBoardObserver();
      tryRestoreGame();
    } else if (!boardEl && mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
      observedBoardEl = null;
      gameInProgress = false;
      updateSystemStatus("idle", "System Idle");
    }

    // Blind Kickstart Hack: If board is present but game hasn't started for 4 seconds
    // ONLY fire if a real game is active (opponent matched, clock running).
    // Don't fire on the matchmaking/lobby screen!
    if (boardEl && !gameInProgress && !autoQueueInProgress) {
      idleBoardSeconds++;
      if (idleBoardSeconds >= 4) {
        // Verify a real game is happening before trying blind kickstart
        if (isRealGameActive()) {
          console.log("[Automata] Game stuck at start? Attempting blind kickstart moves...");
          chrome.storage.local.get({ autoPlay: true }, (settings) => {
            if (settings.autoPlay) {
              executeMove("e2e4");
              executeMove("e7e5");
            }
          });
        } else {
          console.log("[Automata] Board present but no real game detected (lobby/matchmaking). Skipping kickstart.");
        }
        idleBoardSeconds = 0;
      }
    } else {
      idleBoardSeconds = 0;
    }
  }, 1000);

  // Polling fallback: catches board changes that the MutationObserver misses
  // (e.g. closed shadow DOM, animation edge-cases). Safe because detectMoveByDiff
  // returns null when lastBoardState already matches the current board.
  setInterval(() => {
    if (gameInProgress && !isMakingMove) {
      if (isGameOver()) return;

      // Auto-Recovery: If the DOM clock says it's our turn, but we think we are waiting,
      // it means a move diff was missed (e.g. castling). Resync state from DOM!
      const domActive = detectActiveColorFromDOM();
      if (domActive === ourColor && activeColor !== ourColor) {
        console.log("[Automata] State out of sync! Re-syncing from DOM...");
        const newHistory = parseDOMMoveHistory();
        if (newHistory.length > 0) {
          moveHistory = newHistory;
          activeColor = ourColor;
          lastBoardState = parseBoardDOM();
          processTurn();
          return;
        }
      }

      handleBoardUpdate();
    }
  }, 500);

  // Dedicated game-over polling — runs even when isMakingMove is true.
  // This catches cases where the opponent resigns/leaves while our bot
  // is stuck in a human-delay timeout or mid-move lock.
  setInterval(() => {
    if (gameInProgress && isGameOver()) {
      console.log('[Automata] Game-over detected by dedicated polling.');
      gameInProgress = false;
      isMakingMove = false;
      const outcome = parseGameOutcome();
      recordOutcome(outcome);
      applyFatigue();
      chrome.runtime
        .sendMessage({ action: 'gameEnded', data: { outcome } })
        .catch(() => {});
      updateSystemStatus('idle', `Game Over: ${outcome.toUpperCase()}`);
      chrome.storage.local.remove(['savedGameId', 'savedHistory', 'savedColor', 'savedActive']);
      handleAutoQueue();
    }
  }, 2000);
}

startLifecycle();
