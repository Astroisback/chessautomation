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
  chrome.runtime
    .sendMessage({
      action: "updateStatus",
      data: { status, statusText },
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

function findButtonByText(text) {
  const buttons = Array.from(
    document.querySelectorAll('button, a, div[role="button"]'),
  );
  return buttons.find((b) => {
    const btnText = b.textContent || b.innerText || "";
    const isVisible = b.offsetWidth > 0 || b.offsetHeight > 0;
    return isVisible && btnText.toLowerCase().trim().includes(text.toLowerCase());
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

    // Perform "Click-to-Move" (100% reliable across devices if enabled on chess.com)
    clickSquare(fromSquare, isFlipped);
    await new Promise((r) => setTimeout(r, 200));
    clickSquare(toSquare, isFlipped);

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
    updateSystemStatus("error", "No VPS URL Set");
    return null;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      action: "getEngineMove",
      data: {
        url: settings.engineUrl,
        moves: moveHistory,
        color: ourColor,
        accuracy: settings.targetAccuracy,
      },
    });

    if (response.error) {
      throw new Error(response.error);
    }

    return response.move;
  } catch (err) {
    console.error("[Automata] API request failed:", err);
    updateSystemStatus("error", "API Connect Failed");
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
  const modal = document.querySelector(
    ".game-over-modal-container, .game-over-header-component, .game-over-dialog",
  );
  const playAgainBtn =
    findButtonByText("Play Again") || findButtonByText("Next Game");
  
  const modalVisible = modal && (modal.offsetWidth > 0 || modal.offsetHeight > 0);
  return modalVisible || !!playAgainBtn;
}

function parseGameOutcome() {
  const modal = document.querySelector(
    ".game-over-modal-container, .game-over-header-component, .game-over-dialog",
  );
  if (!modal) return "draw";

  const text = (modal.innerText || modal.textContent || "").toLowerCase();

  if (
    text.includes("draw") ||
    text.includes("stalemate") ||
    text.includes("insufficient")
  )
    return "draw";
  if (
    text.includes("you won") ||
    text.includes("victory") ||
    text.includes("won on time")
  )
    return "win";
  if (
    text.includes("you lost") ||
    text.includes("defeat") ||
    text.includes("lost on time")
  )
    return "loss";

  if (text.includes("white won") || text.includes("white is victorious"))
    return ourColor === "w" ? "win" : "loss";
  if (text.includes("black won") || text.includes("black is victorious"))
    return ourColor === "b" ? "win" : "loss";

  return "draw";
}

function handleAutoQueue() {
  if (autoQueueTimeout) return;
  const queueDelay = 8000 + Math.random() * 8000;

  autoQueueTimeout = setTimeout(() => {
    autoQueueTimeout = null;
    chrome.storage.local.get({ autoQueue: true }, (settings) => {
      if (!settings.autoQueue) return;

      const playAgainBtn =
        findButtonByText("Play Again") ||
        findButtonByText("Next Game") ||
        findButtonByText("New 10 min") ||
        findButtonByText("Play");
      if (playAgainBtn) {
        playAgainBtn.click();
        updateSystemStatus("running", "Queueing Match...");
      } else {
        const newGameBtn = document.querySelector(
          'button[data-cy="new-game-button"], .game-over-buttons-play-again',
        );
        if (newGameBtn) {
          newGameBtn.click();
          updateSystemStatus("running", "Queueing Match...");
        }
      }
    });
  }, queueDelay);
}

async function processTurn() {
  chrome.storage.local.get(
    {
      autoPlay: true,
      engineUrl: "http://100.86.25.112:8000/move",
      targetAccuracy: 80,
      premoveProb: 20,
      thinkingSpeed: 3.5,
    },
    async (settings) => {
      if (!settings.autoPlay) {
        updateSystemStatus("running", "Auto-Play Disabled");
        return;
      }

      updateSystemStatus("thinking", "Querying VPS Engine...");

      const engineMove = await getEngineMove(settings);
      if (!engineMove) return;

      updateSystemStatus("thinking", "Thinking (Human Delay)...");

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

// Try to read UCI moves already stored in chess.com's DOM (data-uci attribute).
function parseDOMMoveHistory() {
  const moves = [];
  document.querySelectorAll("[data-uci]").forEach((el) => {
    const uci = el.getAttribute("data-uci");
    if (uci && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) moves.push(uci);
  });
  return moves;
}

// Called when we find pieces on the board but didn't see the starting position.
// Attempts to bootstrap the engine into an already-running game.
function tryStartMidGame(boardState) {
  const pieceCount = Object.keys(boardState).length;
  if (pieceCount < 2) return;

  // Clocks must be present to confirm this is a live game, not an analysis board.
  if (
    !document.querySelector(
      '.clock-bottom, .clock-component, [class*="clock-"]',
    )
  )
    return;

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

function handleBoardUpdate() {
  const boardState = parseBoardDOM();
  if (!boardState) return;

  if (isStartingPosition(boardState) && !gameInProgress) {
    gameInProgress = true;
    lastBoardState = Object.assign({}, boardState);
    const boardEl =
      document.querySelector("chess-board") ||
      document.querySelector("wc-chess-board");
    const isFlipped = boardEl.classList.contains("flipped");
    ourColor = isFlipped ? "b" : "w";
    activeColor = "w";
    moveHistory = [];

    chrome.runtime
      .sendMessage({
        action: "gameStarted",
        data: { color: ourColor === "w" ? "White" : "Black" },
      })
      .catch(() => {});

    if (ourColor === "w") processTurn();
    return;
  }

  // Not at starting position and no game tracked yet — try to join mid-game.
  if (!gameInProgress) {
    tryStartMidGame(boardState);
    return;
  }

  if (gameInProgress) {
    if (activeColor !== ourColor) {
      const movePlayed = detectMoveByDiff(boardState, activeColor);
      if (movePlayed) {
        moveHistory.push(movePlayed);
        activeColor = ourColor;
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
        const outcome = parseGameOutcome();
        chrome.runtime
          .sendMessage({
            action: "gameEnded",
            data: { outcome },
          })
          .catch(() => {});
      }
      handleAutoQueue();
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
  }, 1000);

  // Polling fallback: catches board changes that the MutationObserver misses
  // (e.g. closed shadow DOM, animation edge-cases). Safe because detectMoveByDiff
  // returns null when lastBoardState already matches the current board.
  setInterval(() => {
    if (gameInProgress && !isMakingMove) {
      if (isGameOver()) return;
      handleBoardUpdate();
    }
  }, 500);
}

startLifecycle();
