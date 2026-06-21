# Chess Automata - Maia-3 Integration

This repository contains the Chess Automata chrome extension and the backend deployment scripts to run the **Maia-3 (Chessformer)** neural network chess model on an Android Termux VPS.

---

## 🚀 Running the Backend

### Method 1: Windows Desktop Shortcut
We have created a Windows Desktop shortcut named **Start Maia-3 Server** on your desktop.
* **Action:** Double-click the shortcut on your Windows desktop.
* **What it does:** It runs the python script `files/start_maia3.py` which:
  1. Establishes an SSH connection to your Android VPS (`100.86.25.112:8022`).
  2. Kills any existing `maiaserver` tmux session.
  3. Launches a new tmux session starting the Maia-3 server inside the Ubuntu PRoot container.
  4. Verifies the server started successfully and displays confirmation.

### Method 2: VPS Desktop Shortcut (Inside VNC/noVNC/RDP)
If you are logged into your VPS GUI Desktop (XFCE), we have created a desktop launcher shortcut named **Start Maia-3 Server**.
* **Action:** Double-click the **Start Maia-3 Server** icon on your VNC/xrdp desktop.
* **What it does:** It starts the Maia-3 server in a background tmux session on port `8000`.

### Method 3: Manual Start (via local command line)
You can manually run the start script from the project directory on Windows:
```bash
python files/start_maia3.py
```

---

## 🛠️ Architecture Details

### 1. Android Termux VPS (`100.86.25.112:8022`)
* **Environment:** Ubuntu PRoot distribution running inside Termux on Android.
* **Dependencies:** Python 3, PyTorch (CPU-only), and the `maia3` package.
* **Model:** `maia3-5m` (5-million parameter transformer model, cached locally inside the Ubuntu container).

### 2. Maia-3 HTTP Server
* **Script location on VPS:** `/data/data/com.termux/files/home/server.py` (exposed as `/root/server.py` inside PRoot).
* **Port:** Runs on port `8000`.
* **API Endpoint:** `POST http://100.86.25.112:8000/move`
  * **Payload:** `{"moves": ["e2e4", "e7e5", ...], "elo": 1100}`
  * **Response:** `{"move": "g8f6"}`

### 3. Chrome Extension
* **Files:** [content.js](file:///y:/Chess%20Automata/content.js) and [popup.js](file:///y:/Chess%20Automata/popup.js)
* **Configuration:** The extension is pre-configured/hardcoded to use `http://100.86.25.112:8000/move` for requesting moves.

---

## 🔍 Debugging & Troubleshooting

If you want to debug or check server logs manually on your Termux VPS, you can run the following commands inside Termux:

1. **Check if tmux session is running:**
   ```bash
   tmux list-sessions
   ```
   *(Should list `maiaserver`)*

2. **Attach to the Maia-3 server console:**
   ```bash
   tmux attach -t maiaserver
   ```
   *(Press `Ctrl + B` followed by `D` to detach safely without killing the server)*

3. **Check Ubuntu setup/install script:**
   Inside Termux root: `/data/data/com.termux/files/home/ubuntu_setup.sh`

4. **Re-deploy/Setup everything from scratch:**
   On Windows, run:
   ```bash
   python files/deploy_vps.py
   ```

---

## 🧠 Reverse Engineering `chess_helper_ext`

To make the bot truly robust and resilient against UI updates, we reverse-engineered a known working extension (`chess_helper_ext`) and adopted its best practices:

### 1. Robust State Synchronization
Instead of blindly assuming a physical move succeeded, the bot's "brain" is decoupled from its "hands".
* The bot executes the physical clicks on the screen.
* A `MutationObserver` watches the DOM for the piece to actually land on its destination.
* Only when the DOM confirms the physical move was accepted by chess.com does the bot update its internal memory (`moveHistory`) and wait for the opponent. If a click fails (due to lag or a misclick), the bot doesn't break—it safely waits for a retry or for the user to step in manually.

### 2. Bulletproof Move Execution
Simulating physical Drag-and-Drop via `PointerEvent`s (`pointerdown` -> `pointermove` -> `pointerup`) proved highly unreliable across different device engines (like Kiwi Browser on Android).
We replaced it with a 100% native **Click-to-Move** execution:
1. Click the starting square.
2. Wait a safe delay (200ms).
3. Click the destination square.

*(Note: This requires "Click to Move" to be enabled in your chess.com board settings, which is enabled by default).*

### 3. Human Delay UI
To prevent the user from thinking the bot is frozen while it waits for its randomized "Human Delay" (1-15 seconds), the bot UI explicitly changes to **"Thinking (Human Delay)..."** right after fetching the move from the VPS.
