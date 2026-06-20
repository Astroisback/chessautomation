// content.js - Chess Automata Core Engine (VPS/Maia Version)

console.log("[Automata] Chess Automata extension injected successfully.");

// State variables
let gameInProgress = false;
let moveHistory = [];
let ourColor = 'w'; // 'w' or 'b'
let activeColor = 'w';
let isMakingMove = false;
let autoQueueTimeout = null;
let mutationObserver = null;

// File/Rank translation coordinates
const fileMap = { 1: 'a', 2: 'b', 3: 'c', 4: 'd', 5: 'e', 6: 'f', 7: 'g', 8: 'h' };
const rankMap = { 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8' };

const STARTING_BOARD = {
  a1: 'wr', b1: 'wn', c1: 'wb', d1: 'wq', e1: 'wk', f1: 'wb', g1: 'wn', h1: 'wr',
  a2: 'wp', b2: 'wp', c2: 'wp', d2: 'wp', e2: 'wp', f2: 'wp', g2: 'wp', h2: 'wp',
  a7: 'bp', b7: 'bp', c7: 'bp', d7: 'bp', e7: 'bp', f7: 'bp', g7: 'bp', h7: 'bp',
  a8: 'br', b8: 'bn', c8: 'bb', d8: 'bq', e8: 'bk', f8: 'bb', g8: 'bn', h8: 'br'
};

function updateSystemStatus(status, statusText) {
  chrome.runtime.sendMessage({
    action: 'updateStatus',
    data: { status, statusText }
  }).catch(() => {});
}

function parseBoardDOM() {
  const boardEl = document.querySelector('chess-board');
  if (!boardEl) return null;
  const boardState = {};
  const pieceEls = boardEl.querySelectorAll('.piece');
  pieceEls.forEach(el => {
    const squareClass = Array.from(el.classList).find(c => c.startsWith('square-'));
    const pieceClass = Array.from(el.classList).find(c => c.length === 2 && (c.startsWith('w') || c.startsWith('b')));
    if (squareClass && pieceClass) {
      const coordStr = squareClass.replace('square-', '');
      const fileNum = parseInt(coordStr[0], 10);
      const rankNum = parseInt(coordStr[1], 10);
      const squareName = fileMap[fileNum] + rankMap[rankNum];
      boardState[squareName] = pieceClass;
    }
  });
  return boardState;
}

function isStartingPosition(boardState) {
  if (!boardState) return false;
  const keys = Object.keys(STARTING_BOARD);
  if (Object.keys(boardState).length !== 32) return false;
  return keys.every(key => boardState[key] === STARTING_BOARD[key]);
}

function findButtonByText(text) {
  const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
  return buttons.find(b => {
    const btnText = b.textContent || b.innerText || '';
    return btnText.toLowerCase().trim().includes(text.toLowerCase());
  });
}

function clickSquare(squareName, isFlipped) {
  const boardEl = document.querySelector('chess-board');
  if (!boardEl) return;
  
  const rect = boardEl.getBoundingClientRect();
  const file = squareName.charCodeAt(0) - 97; 
  const rank = parseInt(squareName[1], 10) - 1; 
  
  let col, row;
  if (!isFlipped) {
    col = file;
    row = 7 - rank;
  } else {
    col = 7 - file;
    row = rank;
  }
  
  const w = rect.width / 8;
  const h = rect.height / 8;
  const x = rect.left + (col + 0.5) * w;
  const y = rect.top + (row + 0.5) * h;
  
  const downEvent = new PointerEvent('pointerdown', {
    clientX: x, clientY: y, button: 0, buttons: 1, bubbles: true, cancelable: true, view: window
  });
  const upEvent = new PointerEvent('pointerup', {
    clientX: x, clientY: y, button: 0, buttons: 0, bubbles: true, cancelable: true, view: window
  });
  
  boardEl.dispatchEvent(downEvent);
  const elementAtPoint = document.elementFromPoint(x, y);
  if (elementAtPoint) {
    elementAtPoint.dispatchEvent(downEvent);
    setTimeout(() => {
      elementAtPoint.dispatchEvent(upEvent);
      elementAtPoint.click();
    }, 50);
  }
}

function selectPromotionPiece(toSquare, promotionType, isFlipped) {
  const color = ourColor;
  const pieceCode = color + promotionType.toLowerCase();
  let promoPiece = document.querySelector(`.promotion-piece.${pieceCode}, .promotion-menu [class*="${pieceCode}"]`);
  
  if (!promoPiece) {
    const promoPieces = document.querySelectorAll('.promotion-piece, [class*="promotion-piece"]');
    for (const el of promoPieces) {
      if (el.className.includes(pieceCode) || el.classList.contains(promotionType)) {
        promoPiece = el;
        break;
      }
    }
  }
  
  if (promoPiece) {
    promoPiece.click();
  } else {
    const queenOption = document.querySelector(`.promotion-piece.${color}q`);
    if (queenOption) queenOption.click();
  }
}

async function executeMove(moveStr) {
  if (isMakingMove) return;
  isMakingMove = true;
  
  try {
    const boardEl = document.querySelector('chess-board');
    if (!boardEl) return;
    
    const isFlipped = boardEl.classList.contains('flipped');
    const fromSquare = moveStr.substring(0, 2);
    const toSquare = moveStr.substring(2, 4);
    const promotionType = moveStr.length > 4 ? moveStr[4] : null;
    
    clickSquare(fromSquare, isFlipped);
    
    const pathDelay = 150 + Math.random() * 200;
    await new Promise(resolve => setTimeout(resolve, pathDelay));
    
    clickSquare(toSquare, isFlipped);
    
    if (promotionType) {
      const promoDelay = 350 + Math.random() * 200;
      await new Promise(resolve => setTimeout(resolve, promoDelay));
      selectPromotionPiece(toSquare, promotionType, isFlipped);
    }

    // Record our move instantly
    moveHistory.push(moveStr);
    activeColor = activeColor === 'w' ? 'b' : 'w';
    saveGameState();

  } catch (err) {
    console.error("[Automata] Error executing move:", err);
  } finally {
    isMakingMove = false;
  }
}

function getHumanDelay(history, targetSpeed, isPreMove) {
  if (isPreMove) return 120 + Math.random() * 130;
  
  let baseDelay = targetSpeed * 1000;
  if (history.length < 6) baseDelay *= 0.45;
  else if (history.length > 45) baseDelay *= 0.75;
  
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const normalRandom = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  
  let finalDelay = baseDelay + normalRandom * (baseDelay * 0.28);
  return Math.max(750, Math.min(15000, finalDelay));
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
        accuracy: settings.targetAccuracy
      }
    });

    if (response.error) {
      throw new Error(response.error);
    }
    
    return response.move; 
  } catch (err) {
    console.error("[Automata] API request failed:", err);
    updateSystemStatus('error', 'API Connect Failed');
    return null;
  }
}

function detectOpponentMove() {
  const boardEl = document.querySelector('chess-board');
  if (!boardEl) return null;

  const highlights = Array.from(boardEl.querySelectorAll('.highlight'));
  if (highlights.length !== 2) return null;

  const getSquareCoord = (el) => {
    const sqClass = Array.from(el.classList).find(c => c.startsWith('square-'));
    if (!sqClass) return null;
    const f = parseInt(sqClass.replace('square-', '')[0], 10);
    const r = parseInt(sqClass.replace('square-', '')[1], 10);
    return fileMap[f] + rankMap[r];
  };

  const sq1 = getSquareCoord(highlights[0]);
  const sq2 = getSquareCoord(highlights[1]);

  if (!sq1 || !sq2) return null;

  const getPieceClass = (sq) => {
    const fileNum = Object.keys(fileMap).find(k => fileMap[k] === sq[0]);
    const rankNum = Object.keys(rankMap).find(k => rankMap[k] === sq[1]);
    const pieceEl = boardEl.querySelector(`.piece.square-${fileNum}${rankNum}`);
    if (pieceEl) {
       return Array.from(pieceEl.classList).find(c => c.length === 2 && (c.startsWith('w') || c.startsWith('b')));
    }
    return null;
  };

  const p1 = getPieceClass(sq1);
  const p2 = getPieceClass(sq2);

  let fromSq, toSq;
  if (p1 && !p2) {
    toSq = sq1; fromSq = sq2;
  } else if (p2 && !p1) {
    toSq = sq2; fromSq = sq1;
  } else {
    // Both have pieces (likely castling)
    const oppColor = activeColor;
    if (p1 && p1[0] === oppColor && (!p2 || p2[0] !== oppColor)) {
       toSq = sq1; fromSq = sq2;
    } else if (p2 && p2[0] === oppColor && (!p1 || p1[0] !== oppColor)) {
       toSq = sq2; fromSq = sq1;
    } else {
       if (p1 && p1[1] === 'k') {
          toSq = sq1; fromSq = sq2;
       } else if (p2 && p2[1] === 'k') {
          toSq = sq2; fromSq = sq1;
       } else {
          toSq = sq1; fromSq = sq2; // fallback
       }
    }
  }

  const isPawnPromo = () => {
    const pc = getPieceClass(toSq);
    if (pc && pc[1] !== 'p' && (toSq[1] === '8' || toSq[1] === '1') && (fromSq[1] === '7' || fromSq[1] === '2')) {
       return pc[1];
    }
    return null;
  };

  const promo = isPawnPromo();
  let move = fromSq + toSq;
  if (promo) move += promo;

  if (moveHistory.length > 0 && moveHistory[moveHistory.length - 1] === move && activeColor === ourColor) {
     return null; 
  }

  return move;
}

function isGameOver() {
  const modal = document.querySelector('.game-over-modal-container, .game-over-header-component, .game-over-dialog');
  const playAgainBtn = findButtonByText('Play Again') || findButtonByText('Next Game');
  return modal !== null || !!playAgainBtn;
}

function parseGameOutcome() {
  const modal = document.querySelector('.game-over-modal-container, .game-over-header-component, .game-over-dialog');
  if (!modal) return 'draw';
  
  const text = (modal.innerText || modal.textContent || '').toLowerCase();
  
  if (text.includes('draw') || text.includes('stalemate') || text.includes('insufficient')) return 'draw';
  if (text.includes('you won') || text.includes('victory') || text.includes('won on time')) return 'win';
  if (text.includes('you lost') || text.includes('defeat') || text.includes('lost on time')) return 'loss';
  
  if (text.includes('white won') || text.includes('white is victorious')) return ourColor === 'w' ? 'win' : 'loss';
  if (text.includes('black won') || text.includes('black is victorious')) return ourColor === 'b' ? 'win' : 'loss';
  
  return 'draw';
}

function handleAutoQueue() {
  if (autoQueueTimeout) return;
  const queueDelay = 8000 + Math.random() * 8000;
  
  autoQueueTimeout = setTimeout(() => {
    autoQueueTimeout = null;
    chrome.storage.local.get({ autoQueue: true }, (settings) => {
      if (!settings.autoQueue) return;
      
      const playAgainBtn = findButtonByText('Play Again') || findButtonByText('Next Game') || findButtonByText('New 10 min') || findButtonByText('Play');
      if (playAgainBtn) {
        playAgainBtn.click();
        updateSystemStatus('running', 'Queueing Match...');
      } else {
        const newGameBtn = document.querySelector('button[data-cy="new-game-button"], .game-over-buttons-play-again');
        if (newGameBtn) {
          newGameBtn.click();
          updateSystemStatus('running', 'Queueing Match...');
        }
      }
    });
  }, queueDelay);
}

async function processTurn() {
  chrome.storage.local.get({
    autoPlay: true,
    engineUrl: '',
    targetAccuracy: 80,
    premoveProb: 20,
    thinkingSpeed: 3.5
  }, async (settings) => {
    if (!settings.autoPlay) {
      updateSystemStatus('running', 'Auto-Play Disabled');
      return;
    }
    
    updateSystemStatus('thinking', 'Querying VPS Engine...');
    
    const engineMove = await getEngineMove(settings);
    if (!engineMove) return;
    
    const isRecapture = moveHistory.length > 0 && moveHistory[moveHistory.length - 1].substring(2, 4) === engineMove.substring(2, 4);
    const isPreMove = (Math.random() * 100 < settings.premoveProb) || (isRecapture && Math.random() * 100 < 60);
    const delay = getHumanDelay(moveHistory, settings.thinkingSpeed, isPreMove);
    
    setTimeout(() => {
      executeMove(engineMove);
      updateSystemStatus('running', 'Waiting for Opponent...');
    }, delay);
  });
}

function saveGameState() {
  chrome.storage.local.set({
    savedGameId: window.location.href,
    savedHistory: moveHistory,
    savedColor: ourColor,
    savedActive: activeColor
  });
}

function tryRestoreGame() {
  chrome.storage.local.get(['savedGameId', 'savedHistory', 'savedColor', 'savedActive'], (res) => {
    if (res.savedGameId === window.location.href && res.savedHistory) {
      moveHistory = res.savedHistory;
      ourColor = res.savedColor;
      activeColor = res.savedActive;
      gameInProgress = true;
      updateSystemStatus('running', 'Restored Active Match');
      if (activeColor === ourColor) processTurn();
    }
  });
}

function handleBoardUpdate() {
  const boardState = parseBoardDOM();
  if (!boardState) return;
  
  if (isStartingPosition(boardState) && !gameInProgress) {
    gameInProgress = true;
    const boardEl = document.querySelector('chess-board');
    const isFlipped = boardEl.classList.contains('flipped');
    ourColor = isFlipped ? 'b' : 'w';
    activeColor = 'w';
    moveHistory = [];
    
    chrome.runtime.sendMessage({
      action: 'gameStarted',
      data: { color: ourColor === 'w' ? 'White' : 'Black' }
    }).catch(() => {});
    
    if (ourColor === 'w') processTurn();
    return;
  }
  
  if (gameInProgress && activeColor !== ourColor) {
    const movePlayed = detectOpponentMove();
    if (movePlayed) {
      moveHistory.push(movePlayed);
      activeColor = ourColor;
      saveGameState();
      processTurn();
    }
  }
}

function setupBoardObserver() {
  const boardEl = document.querySelector('chess-board');
  if (!boardEl) return;
  if (mutationObserver) mutationObserver.disconnect();
  
  mutationObserver = new MutationObserver(() => {
    if (isGameOver()) {
      if (gameInProgress) {
        gameInProgress = false;
        const outcome = parseGameOutcome();
        chrome.runtime.sendMessage({
          action: 'gameEnded',
          data: { outcome }
        }).catch(() => {});
      }
      handleAutoQueue();
      return;
    }
    handleBoardUpdate();
  });
  
  mutationObserver.observe(boardEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
}

function startLifecycle() {
  setInterval(() => {
    const boardEl = document.querySelector('chess-board');
    if (boardEl && !mutationObserver) {
      setupBoardObserver();
      tryRestoreGame();
    } else if (!boardEl && mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
      gameInProgress = false;
      updateSystemStatus('idle', 'System Idle');
    }
  }, 1000);
}

startLifecycle();
