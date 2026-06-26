// --- LEGACY ENGINE RESTORED + PROMOTION SUPPORT ---

// --- HELPERS ---
const pieceToFen = {
    'wp': 'P', 'wn': 'N', 'wb': 'B', 'wr': 'R', 'wq': 'Q', 'wk': 'K',
    'bp': 'p', 'bn': 'n', 'bb': 'b', 'br': 'r', 'bq': 'q', 'bk': 'k'
};
const colToNum = { 'a': 1, 'b': 2, 'c': 3, 'd': 4, 'e': 5, 'f': 6, 'g': 7, 'h': 8 };

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(msg) { console.log(`[ChessEngine] ${msg}`); }

// --- DOM UTILS ---
function getBoard() {
    return document.querySelector('wc-chess-board') || document.querySelector('.board') || document.querySelector('chess-board');
}

function getSquareRect(square) {
    const board = getBoard();
    if (!board) return null;

    const rect = board.getBoundingClientRect();
    const size = rect.width / 8;
    const isFlipped = board.classList.contains('flipped');

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
        centerX: rect.left + x + size / 2,
        centerY: rect.top + y + size / 2
    };
}



function algToSquareClass(sq) {
    return `square-${colToNum[sq[0]]}${sq[1]}`;
}

function getPieceElementOnSquare(sq) {
    const cls = algToSquareClass(sq);
    // Sur chess.com, les pièces sont des div.piece ... square-XY
    return document.querySelector(`.piece.${cls}`);
}

function isMyPieceOnSquare(sq) {
    const el = getPieceElementOnSquare(sq);
    if (!el) return false;
    const my = getMyColor(); // 'w' ou 'b'
    // classes: wp, wn, ... ou bp, bn ...
    return el.classList.contains(`${my}p`) ||
        el.classList.contains(`${my}n`) ||
        el.classList.contains(`${my}b`) ||
        el.classList.contains(`${my}r`) ||
        el.classList.contains(`${my}q`) ||
        el.classList.contains(`${my}k`);
}


// --- FEN & STATE ---
function getMyColor() {
    const board = getBoard();
    if (!board) return 'w';
    return board.classList.contains('flipped') ? 'b' : 'w';
}

function getActiveColor() {
    let sideToMove = "w";
    const highlights = document.querySelectorAll('.highlight');
    for (let hl of highlights) {
        const hlClass = Array.from(hl.classList).find(c => c.startsWith('square-'));
        if (hlClass) {
            const squareNum = hlClass.split('-')[1];
            const piece = document.querySelector(`.piece.square-${squareNum}`);
            if (piece) {
                const pClasses = Array.from(piece.classList);
                if (pClasses.some(c => c.startsWith('w'))) { sideToMove = "b"; break; }
                else if (pClasses.some(c => c.startsWith('b'))) { sideToMove = "w"; break; }
            }
        }
    }
    return sideToMove;
}

function getFEN() {
    const pieces = document.querySelectorAll('.piece');
    if (pieces.length === 0) return null;

    let board = Array(8).fill(null).map(() => Array(8).fill(null));
    pieces.forEach(piece => {
        const classes = Array.from(piece.classList);
        const typeClass = classes.find(c => pieceToFen[c]);
        const squareClass = classes.find(c => c.startsWith('square-'));
        if (typeClass && squareClass) {
            const coords = squareClass.split('-')[1];
            board[8 - parseInt(coords[1])][parseInt(coords[0]) - 1] = pieceToFen[typeClass];
        }
    });

    let fenRows = [];
    for (let r = 0; r < 8; r++) {
        let empty = 0; let rowStr = "";
        for (let c = 0; c < 8; c++) {
            if (board[r][c] === null) empty++;
            else {
                if (empty > 0) { rowStr += empty; empty = 0; }
                rowStr += board[r][c];
            }
        }
        if (empty > 0) rowStr += empty;
        fenRows.push(rowStr);
    }
    const side = getActiveColor();
    return fenRows.join('/') + ` ${side} - - 0 1`;
}

async function fetchBestMove(fen) {
    try {
        const res = await fetch(`https://stockfish.online/api/s/v2.php?fen=${encodeURIComponent(fen)}&depth=12`);
        const data = await res.json();
        if (data.success) return data.bestmove.split(' ')[1];
    } catch (e) { console.error(e); }
    return null;
}

// --- DISPATCH POINTER ---
function dispatchPointer(type, elem, coords) {
    const evt = new PointerEvent(type, {
        bubbles: true, cancelable: true, view: window,
        clientX: coords.x, clientY: coords.y,
        buttons: 1, pointerId: 1, isPrimary: true,
        width: 1, height: 1, pressure: 0.5
    });
    elem.dispatchEvent(evt);
}

async function makeMove(move) {
    if (!move) return;

    const board = getBoard();
    if (!board) return;

    const fromSq = move.substring(0, 2);
    // Sécurité: ne jamais bouger une pièce adverse
    if (!isMyPieceOnSquare(fromSq)) {
        log(`Abort: from-square ${fromSq} is not my piece`);
        return;
    }

    const toSq = move.substring(2, 4);
    const isPromotion = move.length === 5;
    const promotionPiece = isPromotion ? move[4] : null;

    log(`Playing move: ${fromSq} -> ${toSq}${isPromotion ? ' (promotion: ' + promotionPiece + ')' : ''}`);

    const fromRect = getSquareRect(fromSq);
    const toRect = getSquareRect(toSq);

    if (!fromRect || !toRect) return;

    const startCoords = { x: fromRect.centerX, y: fromRect.centerY };
    const endCoords = { x: toRect.centerX, y: toRect.centerY };

    let targetEl = document.elementFromPoint(startCoords.x, startCoords.y) || board;

    // 1. Pointer Down
    dispatchPointer('pointerdown', targetEl, startCoords);
    await sleep(60);

    // 2. Drag to destination
    dispatchPointer('pointermove', document.body, endCoords);
    await sleep(60);

    // 3. Drop
    dispatchPointer('pointerup', document.body, endCoords);

    // 4. Handle Promotion
    if (isPromotion) {
        await handlePromotion(promotionPiece);
    }
}


async function handlePromotion(piece) {
    log(`Handling promotion to: ${piece}`);

    // Attendre que le menu existe + devienne cliquable
    const deadline = Date.now() + 2500;
    let promotionWindow = null;

    while (Date.now() < deadline) {
        promotionWindow = document.querySelector('.promotion-window');
        if (promotionWindow) break;
        await sleep(50);
    }

    if (!promotionWindow) {
        log(`ERROR: Promotion window not found`);
        return;
    }

    // Certains menus existent mais sont "offscreen" un court instant
    await sleep(80);

    // Chess.com: classes possibles vues selon UI: wq/wn/wr/wb OU parfois bq/bn/br/bb
    const p = piece.toLowerCase(); // 'q','r','b','n'
    const myColor = getMyColor();  // 'w' ou 'b'

    const candidates = [
        `.promotion-piece.${myColor}${p}`, // ex: .promotion-piece.bq
        `.promotion-piece.w${p}`,          // ex: .promotion-piece.wq (très fréquent)
        `.promotion-piece.b${p}`,          // ex: .promotion-piece.bq
        `.promotion-window .promotion-piece.${myColor}${p}`,
        `.promotion-window .promotion-piece.w${p}`,
        `.promotion-window .promotion-piece.b${p}`
    ];

    // Debug rapide
    const allPromo = promotionWindow.querySelectorAll('.promotion-piece');
    log(`Promotion pieces in DOM: ${[...allPromo].map(x => x.className).join(' | ')}`);

    let btn = null;
    for (const sel of candidates) {
        btn = document.querySelector(sel);
        if (btn) {
            log(`FOUND promotion button: ${sel}`);
            break;
        }
    }

    if (!btn) {
        // Fallback: choisir par ordre (B, N, Q, R) -> on mappe vers index
        // Dans ton snippet: wb, wn, wq, wr (Q est le 3e = index 2)
        const order = { 'b': 0, 'n': 1, 'q': 2, 'r': 3 };
        const idx = order[p] ?? 2;
        btn = allPromo[idx] || null;
        if (btn) log(`Fallback promotion by index: ${idx}`);
    }

    if (!btn) {
        log(`ERROR: Could not find promotion button for ${piece}`);
        return;
    }

    // Cliques "forts" (certains overlays bloquent click simple)
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    btn.click();

    log(`Promotion clicked: ${p.toUpperCase()}`);
}


// --- HUMAN THINK TIME (ADAPTIVE) ---
let moveCounter = 0;

function countPieces(fen) {
    const placement = (fen || "").split(' ')[0];
    return (placement.match(/[a-zA-Z]/g) || []).length;
}

// Returns a human-like "thinking" duration in ms, scaled to game phase / complexity.
function computeThinkTimeMs(fen) {
    const cfg = window.chessHelper || {};

    // If both adaptive think and random mode are off, keep the legacy snappy delay.
    if (cfg.adaptiveThink === false && !cfg.randomMode) return 120;

    const pieces = countPieces(fen);
    let base;

    if (moveCounter < 6) {
        // Opening: humans play book moves fast
        base = 300 + Math.random() * 900;          // ~0.3 - 1.2s
    } else if (pieces > 20) {
        // Crowded / early middlegame
        base = 800 + Math.random() * 2500;         // ~0.8 - 3.3s
    } else if (pieces > 10) {
        // Complex middlegame, more calculation
        base = 1200 + Math.random() * 4000;        // ~1.2 - 5.2s
    } else {
        // Endgame: fewer pieces, moderate thought
        base = 600 + Math.random() * 2200;         // ~0.6 - 2.8s
    }

    // Random mode widens the variance so timing looks less mechanical
    if (cfg.randomMode) base *= 0.6 + Math.random() * 1.4;

    // Occasionally take a long "real" think, like a human pausing
    if (Math.random() < 0.10) base += 2000 + Math.random() * 4000;

    return Math.round(base);
}

// --- GAME COUNT & BREAKS (ANTI-DETECTION) ---
let gameOverActive = false;
let pauseUntil = 0;

function isGameOver() {
    return !!document.querySelector(
        '.game-over-modal-content, .game-over-header-component, ' +
        '[class*="game-over-modal"], .modal-game-over-component, ' +
        '.game-over-header-header'
    );
}

// Decide the target number of games and the break length for the next batch.
function pickBatchSettings() {
    const cfg = window.chessHelper;
    if (!cfg) return;
    if (cfg.randomMode) {
        // Auto-decide: 5-15 games, then a 3-20 minute break
        cfg._gamesTarget = 5 + Math.floor(Math.random() * 11);
        cfg._delayMs = (3 + Math.random() * 17) * 60000;
    } else {
        cfg._gamesTarget = Math.max(1, parseInt(cfg.gamesBeforeDelay, 10) || 10);
        cfg._delayMs = Math.max(0, parseFloat(cfg.delayMinutes) || 10) * 60000;
    }
}

function notifyUI() {
    if (window.chessHelperUI && typeof window.chessHelperUI.onStateChange === 'function') {
        window.chessHelperUI.onStateChange();
    }
}

function onGameFinished() {
    const cfg = window.chessHelper;
    if (!cfg) return;
    if (!cfg._gamesTarget) pickBatchSettings();
    cfg.gamesPlayed = (cfg.gamesPlayed || 0) + 1;
    log(`Game finished. Count: ${cfg.gamesPlayed}/${cfg._gamesTarget}`);
    if (cfg.gamesPlayed >= cfg._gamesTarget) startDelay();
    notifyUI();
}

function startDelay() {
    const cfg = window.chessHelper;
    if (!cfg) return;
    if (!cfg._delayMs) pickBatchSettings();
    pauseUntil = Date.now() + cfg._delayMs;
    cfg.paused = true;
    cfg.gamesPlayed = 0;
    log(`Break: pausing autoplay for ~${Math.round(cfg._delayMs / 60000)} min.`);
    pickBatchSettings(); // choose settings for the batch after the break
    notifyUI();
}

// Detect transitions into / out of the game-over state to count games.
function checkGameEnd() {
    const cfg = window.chessHelper;
    if (!cfg || !cfg.autoPlay) return;
    const over = isGameOver();
    if (over && !gameOverActive) {
        gameOverActive = true;
        moveCounter = 0;
        onGameFinished();
    } else if (!over && gameOverActive) {
        gameOverActive = false; // a new game has started
        moveCounter = 0;
    }
}

// Release the pause once the break has elapsed.
function checkPause() {
    const cfg = window.chessHelper;
    if (cfg && cfg.paused && Date.now() >= pauseUntil) {
        cfg.paused = false;
        log("Break finished, resuming autoplay.");
        notifyUI();
    }
}

// Expose remaining break time (ms) for the UI countdown.
function getPauseRemainingMs() {
    return Math.max(0, pauseUntil - Date.now());
}

// --- LOOP & LOGIC ---

let isProcessing = false;
let lastProcessedFen = "";

async function checkTurnAndPlay() {
    if (!window.chessHelper || !window.chessHelper.autoPlay) return;
    if (window.chessHelper.paused) return; // on a break between games
    if (isProcessing) return;

    const fen = getFEN();
    if (!fen) return;

    const activeColor = fen.split(' ')[1];
    const myColor = getMyColor();

    if (activeColor !== myColor) {
        lastProcessedFen = "";
        return;
    }

    if (fen === lastProcessedFen) return;

    isProcessing = true;
    lastProcessedFen = fen;

    try {
        const thinkMs = computeThinkTimeMs(fen);
        log(`My turn... thinking for ${thinkMs}ms`);
        await sleep(thinkMs); // human-like adaptive think time


        if (getFEN() === fen && window.chessHelper.autoPlay && !window.chessHelper.paused) {
            const move = await fetchBestMove(fen);
            if (move) {
                const fenNow = getFEN();
                if (fenNow !== fen || !window.chessHelper.autoPlay || window.chessHelper.paused) {
                    log("Abort: position changed, autoplay disabled, or on break");
                    return;
                }

                // Execute the move
                await makeMove(move);
                moveCounter++;
            }
        }
    } catch (e) {
        console.error(e);
        lastProcessedFen = "";
    } finally {
        isProcessing = false;
    }
}

// Observer
const observer = new MutationObserver(() => {
    if (window.chessHelper?.autoPlay) {
        checkGameEnd();
        checkTurnAndPlay();
    }
});
function initObserver() {
    const board = getBoard();
    if (board) {
        observer.observe(board, { childList: true, subtree: true, attributes: true });
    } else {
        setTimeout(initObserver, 1000);
    }
}
initObserver();
setInterval(() => {
    if (!window.chessHelper?.autoPlay) return;
    checkPause();
    checkGameEnd();
    checkTurnAndPlay();
}, 2000);

// EXPORT
window.chessHelperEngine = {
    triggerAutoPlay: () => {
        isProcessing = false;
        lastProcessedFen = "";
        pickBatchSettings();
        checkTurnAndPlay();
    },
    getFEN: getFEN,
    fetchBestMove: fetchBestMove,
    getMyColor: getMyColor,
    getPauseRemainingMs: getPauseRemainingMs,
    skipBreak: () => {
        if (window.chessHelper) {
            window.chessHelper.paused = false;
            pauseUntil = 0;
            log("Break skipped by user.");
            notifyUI();
        }
    }
};
