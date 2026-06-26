// background.js - State Manager for Chess Automata

const defaultState = {
  status: "idle",
  statusText: "System Idle",
  sessionGames: 0,
  wins: 0,
  draws: 0,
  losses: 0,
};

async function getState() {
  const res = await chrome.storage.local.get("sessionState");
  return res.sessionState || { ...defaultState };
}

async function saveState(state) {
  await chrome.storage.local.set({ sessionState: state });
  broadcastState(state);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action, data } = message;

  if (action === "getStatus") {
    getState().then(sendResponse);
    return true;
  }

  if (action === "updateStatus") {
    getState().then((state) => {
      state.status = data.status || state.status;
      state.statusText = data.statusText || state.statusText;
      saveState(state);
    });
    return true;
  }

  if (action === "gameStarted") {
    getState().then((state) => {
      state.sessionGames++;
      state.status = "running";
      state.statusText = `Active Match (${data.color})`;
      saveState(state);
    });
    return true;
  }

  if (action === "gameEnded") {
    getState().then((state) => {
      const outcome = data.outcome;
      if (outcome === "win") state.wins++;
      else if (outcome === "draw") state.draws++;
      else if (outcome === "loss") state.losses++;

      state.status = "idle";
      state.statusText = `Game Over: ${outcome.toUpperCase()}`;
      saveState(state);
    });
    return true;
  }

  if (action === "getEngineMove") {
    const { url, moves, color, elo, mustWin } = data;
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moves, elo: elo || 1100, mustWin: !!mustWin }),
    })
      .then((response) => {
        if (!response.ok)
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        return response.json();
      })
      .then((json) => sendResponse({ move: json.move }))
      .catch((err) => {
        console.error("[Automata Background] API error:", err.message || err);
        sendResponse({ error: err.message || String(err) });
      });
    return true; // Keep channel open for async fetch
  }
});

function broadcastState(state) {
  chrome.runtime
    .sendMessage({
      action: "statusUpdate",
      data: state,
    })
    .catch(() => {});
}
