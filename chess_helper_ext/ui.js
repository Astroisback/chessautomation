// --- CONFIG & STATE ---
window.chessHelper = {
    autoPlay: false,
    debug: true
};

function log(msg) {
    if (window.chessHelper.debug) console.log(`[ChessHelper] ${msg}`);
}
window.chessHelperLog = log;

// --- DOM ELEMENTS REFERENCE ---
let rootEl, bubbleEl, panelEl;

// --- DRAG PHYSICS STATE ---
let drag = {
    active: false,
    currentX: 0, currentY: 0,
    initialX: 0, initialY: 0,
    xOffset: 0, yOffset: 0,
    velocityX: 0, velocityY: 0,
    lastX: 0, lastY: 0,
    lastTime: 0
};
let animationFrameId;

// --- INITIALIZATION ---
function initUI() {
    // Remove old if exists
    const oldRoot = document.getElementById('chess-helper-root');
    if (oldRoot) oldRoot.remove();

    // Create Root
    rootEl = document.createElement('div');
    rootEl.id = 'chess-helper-root';

    // 1. Create Bubble (Clean minimalist icon)
    bubbleEl = document.createElement('div');
    bubbleEl.id = 'chess-helper-bubble';
    // Official Chess.com 'Neo' Style Knight (White)
    bubbleEl.innerHTML = `<img src="https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wn.png" style="width:100%; height:100%; pointer-events:none; display:block;" draggable="false" />`;

    // Set initial position
    drag.xOffset = window.innerWidth - 80;
    drag.yOffset = 80;
    updateBubbleTransform();

    // 2. Create Panel
    panelEl = document.createElement('div');
    panelEl.id = 'chess-helper-panel';
    // Minimalist Structure: Title + 2 Actions
    panelEl.innerHTML = `
        <div class="ch-header">
            <div class="ch-title">Chess Assist</div>
        </div>
        
        <div class="ch-row">
            <span class="ch-label">Auto-play best move</span>
            <label class="ch-switch">
                <input type="checkbox" id="ch-toggle-autoplay">
                <span class="ch-slider"></span>
            </label>
        </div>

        <button class="ch-btn ch-btn-primary" id="ch-btn-analyze">
            <span id="ch-analyze-text">What's the best move?</span>
        </button>
    `;

    rootEl.appendChild(bubbleEl);
    rootEl.appendChild(panelEl);
    document.body.appendChild(rootEl);

    // Bind Events
    setupDragEvents();
    setupButtonEvents();
}

// --- DRAG & PHYSICS LOGIC ---
function setupDragEvents() {
    bubbleEl.addEventListener('mousedown', dragStart);
    document.addEventListener('mouseup', dragEnd);
    document.addEventListener('mousemove', dragMove);

    bubbleEl.addEventListener('touchstart', dragStart, { passive: false });
    document.addEventListener('touchend', dragEnd);
    document.addEventListener('touchmove', dragMove, { passive: false });
}

function dragStart(e) {
    if (e.target.closest('#chess-helper-panel')) return;
    drag.active = true;
    drag.lastTime = Date.now();

    if (e.type === "touchstart") {
        drag.initialX = e.touches[0].clientX - drag.xOffset;
        drag.initialY = e.touches[0].clientY - drag.yOffset;
    } else {
        drag.initialX = e.clientX - drag.xOffset;
        drag.initialY = e.clientY - drag.yOffset;
    }
}

function dragEnd(e) {
    if (!drag.active) return;
    drag.active = false;
    startInertia();
}

function dragMove(e) {
    if (drag.active) {
        e.preventDefault();
        let cx = e.type === "touchmove" ? e.touches[0].clientX : e.clientX;
        let cy = e.type === "touchmove" ? e.touches[0].clientY : e.clientY;

        drag.currentX = cx - drag.initialX;
        drag.currentY = cy - drag.initialY;

        const now = Date.now();
        const dt = now - drag.lastTime;
        if (dt > 0) {
            drag.velocityX = (drag.currentX - drag.xOffset) / dt;
            drag.velocityY = (drag.currentY - drag.yOffset) / dt;
        }
        drag.lastTime = now;

        drag.xOffset = drag.currentX;
        drag.yOffset = drag.currentY;

        updateBubbleTransform();
        if (panelEl.classList.contains('visible')) closePanel();
    }
}

function updateBubbleTransform() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const size = 52;

    if (drag.xOffset < 0) drag.xOffset = 0;
    if (drag.yOffset < 0) drag.yOffset = 0;
    if (drag.xOffset > w - size) drag.xOffset = w - size;
    if (drag.yOffset > h - size) drag.yOffset = h - size;

    bubbleEl.style.transform = `translate3d(${drag.xOffset}px, ${drag.yOffset}px, 0)`;
}

function startInertia() {
    const speed = Math.sqrt(drag.velocityX * drag.velocityX + drag.velocityY * drag.velocityY);
    if (speed < 0.15) {
        togglePanel();
        return;
    }
    function step() {
        if (drag.active) return;
        drag.velocityX *= 0.92;
        drag.velocityY *= 0.92;
        drag.xOffset += drag.velocityX * 16;
        drag.yOffset += drag.velocityY * 16;
        updateBubbleTransform();
        if (Math.abs(drag.velocityX) > 0.05 || Math.abs(drag.velocityY) > 0.05) {
            requestAnimationFrame(step);
        }
    }
    requestAnimationFrame(step);
}

// --- PANEL LOGIC ---
function togglePanel() {
    if (panelEl.classList.contains('visible')) closePanel();
    else openPanel();
}

function openPanel() {
    updatePanelPosition();
    panelEl.classList.add('visible');
}

function closePanel() {
    panelEl.classList.remove('visible');
}

function updatePanelPosition() {
    const bubbleRect = bubbleEl.getBoundingClientRect();
    const w = window.innerWidth;
    const h = window.innerHeight;
    const panelW = 280;
    const panelH = 140; // Smaller now
    const margin = 16;

    let top, left, originX, originY;

    if (bubbleRect.left > w / 2) {
        left = bubbleRect.left - panelW - margin;
        originX = "right";
    } else {
        left = bubbleRect.right + margin;
        originX = "left";
    }

    if (bubbleRect.top > h / 2) {
        top = bubbleRect.bottom - panelH;
        originY = "bottom";
    } else {
        top = bubbleRect.top;
        originY = "top";
    }

    if (left < margin) left = margin;
    if (left + panelW > w - margin) left = w - panelW - margin;
    if (top < margin) top = margin;
    if (top + panelH > h - margin) top = h - panelH - margin;

    panelEl.style.top = `${top}px`;
    panelEl.style.left = `${left}px`;
    panelEl.style.transformOrigin = `${originX} ${originY}`;
}

// --- ACTIONS ---
function setupButtonEvents() {
    // Auto Play Toggle
    document.getElementById('ch-toggle-autoplay').addEventListener('change', (e) => {
        window.chessHelper.autoPlay = e.target.checked;
        if (window.chessHelper.autoPlay) {
            // Trigger Engine Check
            if (window.chessHelperEngine?.triggerAutoPlay) {
                window.chessHelperEngine.triggerAutoPlay();
            }
        }

    });

    // Best Move (Analysis Only)
    const btnAnalyze = document.getElementById('ch-btn-analyze');
    const btnText = document.getElementById('ch-analyze-text');

    btnAnalyze.onclick = async () => {
        if (!window.chessHelperEngine) return;

        btnText.innerText = "Analyzing...";
        const fen = window.chessHelperEngine.getFEN();

        if (!fen) {
            btnText.innerText = "No Game Found";
            setTimeout(() => btnText.innerText = "What's the best move?", 2000);
            return;
        }

        const move = await window.chessHelperEngine.fetchBestMove(fen);
        if (move) {
            // Draw visual
            drawDottedMove(move);
            btnText.innerText = `Best: ${move.toUpperCase()}`;
        } else {
            btnText.innerText = "Error";
        }
        setTimeout(() => btnText.innerText = "What's the best move?", 3000);
    };
}

// --- VISUALIZATION ---
function drawDottedMove(move) {
    // Native cleaner implementation
    document.querySelectorAll('.ch-highlight, .ch-arrow-svg').forEach(el => el.remove());
    const board = document.querySelector('wc-chess-board') || document.querySelector('.board') || document.querySelector('chess-board');
    if (!board || !move) return;

    const startSq = move.substring(0, 2);
    const endSq = move.substring(2, 4);

    // Using standard alg conversion
    const colToNum = { 'a': 1, 'b': 2, 'c': 3, 'd': 4, 'e': 5, 'f': 6, 'g': 7, 'h': 8 };
    const algToSquareClass = (sq) => `square-${colToNum[sq[0]]}${sq[1]}`;

    function createHighlight(sq, color) {
        const div = document.createElement('div');
        div.className = `ch-highlight ${algToSquareClass(sq)}`;
        div.style.backgroundColor = color;
        board.appendChild(div);
    }
    createHighlight(startSq, 'rgba(247, 192, 69, 0.6)');
    createHighlight(endSq, 'rgba(129, 182, 76, 0.6)');

    // Arrow logic
    const isFlipped = board.classList.contains('flipped');
    const getCenter = (sq) => {
        let col = colToNum[sq[0]];
        let row = parseInt(sq[1]);
        let x, y;
        const size = 12.5; // percent
        const half = 6.25;
        if (!isFlipped) {
            x = (col - 1) * size + half;
            y = (8 - row) * size + half;
        } else {
            x = (8 - col) * size + half;
            y = (row - 1) * size + half;
        }
        return { x, y };
    };

    const s = getCenter(startSq);
    const e = getCenter(endSq);

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.classList.add('ch-arrow-svg');

    // Line
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", s.x); line.setAttribute("y1", s.y);
    line.setAttribute("x2", e.x); line.setAttribute("y2", e.y);
    line.classList.add('ch-arrow-line');

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", e.x); circle.setAttribute("cy", e.y);
    circle.setAttribute("r", "2");
    circle.setAttribute("fill", "var(--ch-accent-color)");

    svg.appendChild(line);
    svg.appendChild(circle);
    board.appendChild(svg);

    setTimeout(() => {
        document.querySelectorAll('.ch-highlight, .ch-arrow-svg').forEach(el => el.remove());
    }, 4000);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
} else {
    initUI();
}