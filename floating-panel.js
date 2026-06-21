// floating-panel.js — Injected PiP-style control panel for chess.com
// This file creates a draggable, minimizable floating overlay on the page.

(function () {
  if (document.getElementById('automata-floating-panel')) return; // Prevent duplicates

  // ============================================================
  // CSS
  // ============================================================
  const style = document.createElement('style');
  style.textContent = `
    #automata-floating-panel {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 280px;
      z-index: 999999;
      font-family: 'Segoe UI', 'Inter', sans-serif;
      user-select: none;
      transition: opacity 0.2s ease, transform 0.2s ease;
    }

    #automata-floating-panel.minimized .afp-body {
      display: none;
    }

    #automata-floating-panel.minimized {
      width: auto;
    }

    .afp-card {
      background: rgba(10, 12, 18, 0.92);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6),
                  0 0 20px rgba(139, 92, 246, 0.08);
      overflow: hidden;
    }

    /* Header — always visible, draggable */
    .afp-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      cursor: grab;
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(139, 92, 246, 0.08));
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    .afp-header:active {
      cursor: grabbing;
    }

    .afp-header-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .afp-logo {
      font-size: 16px;
      line-height: 1;
    }

    .afp-title {
      font-size: 12px;
      font-weight: 700;
      background: linear-gradient(135deg, #60a5fa, #a78bfa, #f472b6);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      letter-spacing: 0.3px;
    }

    .afp-header-right {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .afp-status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #6b7280;
      transition: all 0.3s ease;
    }

    .afp-status-dot.running {
      background: #10b981;
      box-shadow: 0 0 6px #10b981;
      animation: afp-pulse 1.5s infinite alternate;
    }

    .afp-status-dot.thinking {
      background: #8b5cf6;
      box-shadow: 0 0 6px #8b5cf6;
      animation: afp-pulse 0.8s infinite alternate;
    }

    .afp-status-dot.error {
      background: #ef4444;
      box-shadow: 0 0 6px #ef4444;
    }

    @keyframes afp-pulse {
      0% { transform: scale(0.85); opacity: 0.6; }
      100% { transform: scale(1.15); opacity: 1; }
    }

    .afp-minimize-btn {
      width: 22px;
      height: 22px;
      border: none;
      background: rgba(255, 255, 255, 0.06);
      color: #9ca3af;
      border-radius: 6px;
      cursor: pointer;
      font-size: 11px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    }

    .afp-minimize-btn:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #f3f4f6;
    }

    /* Body — collapsible */
    .afp-body {
      padding: 10px 14px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .afp-status-text {
      font-size: 11px;
      color: #9ca3af;
      padding: 6px 10px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 6px;
      text-align: center;
    }

    .afp-stats-row {
      display: flex;
      justify-content: space-around;
      gap: 4px;
    }

    .afp-stat {
      text-align: center;
      flex: 1;
    }

    .afp-stat-label {
      font-size: 9px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .afp-stat-value {
      font-size: 13px;
      font-weight: 700;
      color: #f3f4f6;
    }

    .afp-divider {
      width: 1px;
      background: rgba(255, 255, 255, 0.06);
      align-self: stretch;
    }

    /* Toggle row */
    .afp-toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 5px 0;
    }

    .afp-toggle-label {
      font-size: 11px;
      color: #d1d5db;
      font-weight: 500;
    }

    .afp-toggle-label.human {
      color: #fbbf24;
    }

    /* Mini toggle switch */
    .afp-switch {
      position: relative;
      width: 32px;
      height: 18px;
      display: inline-block;
    }

    .afp-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .afp-switch .afp-slider {
      position: absolute;
      cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background: #374151;
      border-radius: 18px;
      transition: 0.3s;
    }

    .afp-switch .afp-slider:before {
      position: absolute;
      content: "";
      height: 12px;
      width: 12px;
      left: 3px;
      bottom: 3px;
      background: #fff;
      border-radius: 50%;
      transition: 0.3s;
    }

    .afp-switch input:checked + .afp-slider {
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      box-shadow: 0 0 8px rgba(139, 92, 246, 0.3);
    }

    .afp-switch input:checked + .afp-slider:before {
      transform: translateX(14px);
    }

    .afp-switch.human input:checked + .afp-slider {
      background: linear-gradient(135deg, #f59e0b, #d97706);
      box-shadow: 0 0 8px rgba(245, 158, 11, 0.3);
    }

    /* Resize handle */
    .afp-resize-handle {
      position: absolute;
      top: 0;
      left: 0;
      width: 14px;
      height: 14px;
      cursor: nw-resize;
      opacity: 0;
    }
  `;
  document.head.appendChild(style);

  // ============================================================
  // HTML
  // ============================================================
  const panel = document.createElement('div');
  panel.id = 'automata-floating-panel';
  panel.innerHTML = `
    <div class="afp-card">
      <div class="afp-header" id="afp-drag-handle">
        <div class="afp-header-left">
          <span class="afp-logo">♟️</span>
          <span class="afp-title">Chess Automata</span>
        </div>
        <div class="afp-header-right">
          <div class="afp-status-dot" id="afp-status-dot"></div>
          <button class="afp-minimize-btn" id="afp-minimize-btn" title="Minimize">—</button>
        </div>
      </div>
      <div class="afp-body">
        <div class="afp-status-text" id="afp-status-text">System Idle</div>

        <div class="afp-stats-row">
          <div class="afp-stat">
            <div class="afp-stat-label">Games</div>
            <div class="afp-stat-value" id="afp-games">0</div>
          </div>
          <div class="afp-divider"></div>
          <div class="afp-stat">
            <div class="afp-stat-label">W / D / L</div>
            <div class="afp-stat-value" id="afp-wdl">0/0/0</div>
          </div>
        </div>

        <div style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px; margin-top: 2px;">
          <div class="afp-toggle-row">
            <span class="afp-toggle-label">Auto-Play</span>
            <label class="afp-switch">
              <input type="checkbox" id="afp-autoplay" checked>
              <span class="afp-slider"></span>
            </label>
          </div>
          <div class="afp-toggle-row">
            <span class="afp-toggle-label">Auto-Queue</span>
            <label class="afp-switch">
              <input type="checkbox" id="afp-autoqueue" checked>
              <span class="afp-slider"></span>
            </label>
          </div>
          <div class="afp-toggle-row">
            <span class="afp-toggle-label human">🧠 Human Mode</span>
            <label class="afp-switch human">
              <input type="checkbox" id="afp-humanmode" checked>
              <span class="afp-slider"></span>
            </label>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  // ============================================================
  // DRAG & DROP (PiP-style)
  // ============================================================
  const dragHandle = document.getElementById('afp-drag-handle');
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  dragHandle.addEventListener('pointerdown', (e) => {
    // Don't drag if clicking the minimize button
    if (e.target.closest('.afp-minimize-btn')) return;

    isDragging = true;
    const rect = panel.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    panel.style.transition = 'none';
    dragHandle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  dragHandle.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    e.preventDefault();

    let newX = e.clientX - dragOffsetX;
    let newY = e.clientY - dragOffsetY;

    // Clamp to viewport
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    newX = Math.max(0, Math.min(window.innerWidth - pw, newX));
    newY = Math.max(0, Math.min(window.innerHeight - ph, newY));

    // Use left/top instead of right/bottom for smooth dragging
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.left = newX + 'px';
    panel.style.top = newY + 'px';
  });

  dragHandle.addEventListener('pointerup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    panel.style.transition = 'opacity 0.2s ease, transform 0.2s ease';

    // Snap to nearest edge (like PiP)
    const rect = panel.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Snap horizontal
    if (centerX < vw / 2) {
      panel.style.left = '12px';
      panel.style.right = 'auto';
    } else {
      panel.style.left = 'auto';
      panel.style.right = '12px';
    }

    // Keep vertical position, but clamp
    const top = Math.max(12, Math.min(vh - rect.height - 12, rect.top));
    panel.style.top = top + 'px';
    panel.style.bottom = 'auto';

    // Save position
    chrome.storage.local.set({
      afpPosition: {
        left: panel.style.left,
        right: panel.style.right,
        top: panel.style.top,
      }
    });
  });

  // ============================================================
  // MINIMIZE / MAXIMIZE
  // ============================================================
  const minimizeBtn = document.getElementById('afp-minimize-btn');
  let isMinimized = false;

  minimizeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    isMinimized = !isMinimized;
    panel.classList.toggle('minimized', isMinimized);
    minimizeBtn.textContent = isMinimized ? '▢' : '—';
    minimizeBtn.title = isMinimized ? 'Expand' : 'Minimize';
  });

  // ============================================================
  // SYNC WITH CHROME STORAGE
  // ============================================================
  const afpAutoplay = document.getElementById('afp-autoplay');
  const afpAutoqueue = document.getElementById('afp-autoqueue');
  const afpHumanmode = document.getElementById('afp-humanmode');
  const afpStatusDot = document.getElementById('afp-status-dot');
  const afpStatusText = document.getElementById('afp-status-text');
  const afpGames = document.getElementById('afp-games');
  const afpWdl = document.getElementById('afp-wdl');

  // Load initial settings
  chrome.storage.local.get({
    autoPlay: true,
    autoQueue: true,
    humanMode: true,
    afpPosition: null,
  }, (s) => {
    afpAutoplay.checked = s.autoPlay;
    afpAutoqueue.checked = s.autoQueue;
    afpHumanmode.checked = s.humanMode;

    // Restore saved position
    if (s.afpPosition) {
      panel.style.left = s.afpPosition.left;
      panel.style.right = s.afpPosition.right;
      panel.style.top = s.afpPosition.top;
      panel.style.bottom = 'auto';
    }
  });

  // Toggle handlers — sync to chrome.storage (which content.js reads)
  afpAutoplay.addEventListener('change', () => {
    chrome.storage.local.set({ autoPlay: afpAutoplay.checked });
  });
  afpAutoqueue.addEventListener('change', () => {
    chrome.storage.local.set({ autoQueue: afpAutoqueue.checked });
  });
  afpHumanmode.addEventListener('change', () => {
    chrome.storage.local.set({ humanMode: afpHumanmode.checked });
  });

  // Listen for status updates from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'statusUpdate') {
      const state = message.data;
      if (state.statusText) {
        afpStatusText.textContent = state.statusText;
      }
      if (state.status) {
        afpStatusDot.className = 'afp-status-dot ' + state.status;
      }
      if (state.sessionGames !== undefined) {
        afpGames.textContent = state.sessionGames;
      }
      if (state.wins !== undefined) {
        afpWdl.textContent = `${state.wins}/${state.draws}/${state.losses}`;
      }
    }
  });

  // Fetch initial state
  chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
    if (!response) return;
    if (response.statusText) afpStatusText.textContent = response.statusText;
    if (response.status) afpStatusDot.className = 'afp-status-dot ' + response.status;
    if (response.sessionGames !== undefined) afpGames.textContent = response.sessionGames;
    if (response.wins !== undefined) {
      afpWdl.textContent = `${response.wins}/${response.draws}/${response.losses}`;
    }
  });

  // Also sync when storage changes (from popup or other tab)
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.autoPlay) afpAutoplay.checked = changes.autoPlay.newValue;
    if (changes.autoQueue) afpAutoqueue.checked = changes.autoQueue.newValue;
    if (changes.humanMode) afpHumanmode.checked = changes.humanMode.newValue;
  });

  console.log('[Automata] Floating panel injected.');
})();
