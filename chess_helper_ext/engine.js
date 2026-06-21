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


// --- LOOP & LOGIC ---

let isProcessing = false;
let lastProcessedFen = "";

async function checkTurnAndPlay() {
    if (!window.chessHelper || !window.chessHelper.autoPlay) return;
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
        log("My turn...");
        await sleep(120); // juste laisser le DOM se stabiliser un peu


        if (getFEN() === fen && window.chessHelper.autoPlay) {
            const move = await fetchBestMove(fen);
            if (move) {
                const fenNow = getFEN();
                if (fenNow !== fen || !window.chessHelper.autoPlay) {
                    log("Abort: position changed or autoplay disabled");
                    return;
                }

                // Execute the move
                await makeMove(move);
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
    if (window.chessHelper?.autoPlay) checkTurnAndPlay();
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
setInterval(() => { if (window.chessHelper?.autoPlay) checkTurnAndPlay(); }, 2000);

// EXPORT
window.chessHelperEngine = {
    triggerAutoPlay: () => {
        isProcessing = false;
        lastProcessedFen = "";
        checkTurnAndPlay();
    },
    getFEN: getFEN,
    fetchBestMove: fetchBestMove,
    getMyColor: getMyColor
};
