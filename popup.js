document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const autoPlayToggle = document.getElementById('autoPlay');
  const autoQueueToggle = document.getElementById('autoQueue');
  const humanModeToggle = document.getElementById('humanMode');
  const accuracySlider = document.getElementById('targetAccuracy');
  const premoveSlider = document.getElementById('premoveProb');
  const speedSlider = document.getElementById('thinkingSpeed');
  const autoRandomizeToggle = document.getElementById('autoRandomizeSpeed');
  const engineUrlInput = document.getElementById('engineUrl');

  const accuracyVal = document.getElementById('accuracyVal');
  const premoveVal = document.getElementById('premoveVal');
  const speedVal = document.getElementById('speedVal');

  const mustWinToggle = document.getElementById('mustWin');
  const scrambleToggle = document.getElementById('timeScramble');
  const humanModeRow = humanModeToggle ? humanModeToggle.closest('.toggle-control') : null;

  const statusBanner = document.getElementById('statusBanner');
  const statusPulse = document.getElementById('statusPulse');
  const statusText = document.getElementById('statusText');
  const sessionGamesVal = document.getElementById('sessionGames');
  const winLossRatioVal = document.getElementById('winLossRatio');

  // The accuracy slider's parent container
  const accuracyControl = accuracySlider ? accuracySlider.closest('.slider-control') : null;

  // Default values
  const defaults = {
    autoPlay: true,
    autoQueue: true,
    humanMode: true,
    mustWin: false,
    timeScramble: false,
    engineUrl: 'http://100.86.25.112:8000/move',
    targetAccuracy: 80,
    premoveProb: 20,
    thinkingSpeed: 3.5,
    autoRandomizeSpeed: false
  };

  function applyMustWinUI(enabled) {
    // Visually disable Human Mode row while Must Win is on. The actual
    // override happens in content.js (mustWin beats humanMode), but greying
    // out the toggle makes it clear it has no effect right now.
    if (humanModeRow) {
      humanModeRow.classList.toggle('disabled-by-mustwin', enabled);
    }
  }

  function updateAccuracyVisibility(humanMode) {
    if (accuracyControl) {
      if (humanMode) {
        accuracyControl.classList.add('hidden');
      } else {
        accuracyControl.classList.remove('hidden');
      }
    }
  }

  // Load saved settings
  chrome.storage.local.get(defaults, (settings) => {
    autoPlayToggle.checked = settings.autoPlay;
    autoQueueToggle.checked = settings.autoQueue;
    humanModeToggle.checked = settings.humanMode;
    mustWinToggle.checked = settings.mustWin;
    scrambleToggle.checked = settings.timeScramble;
    engineUrlInput.value = settings.engineUrl;
    
    accuracySlider.value = settings.targetAccuracy;
    accuracyVal.textContent = `${settings.targetAccuracy}%`;
    
    premoveSlider.value = settings.premoveProb;
    premoveVal.textContent = `${settings.premoveProb}%`;
    
    speedSlider.value = settings.thinkingSpeed;
    speedVal.textContent = `${settings.thinkingSpeed}s`;

    if (autoRandomizeToggle) {
      autoRandomizeToggle.checked = settings.autoRandomizeSpeed;
      speedSlider.disabled = settings.autoRandomizeSpeed;
      if (settings.autoRandomizeSpeed) {
        speedSlider.style.opacity = '0.5';
      }
    }

    updateAccuracyVisibility(settings.humanMode);
    applyMustWinUI(settings.mustWin);
  });

  // Event Listeners for Changes
  autoPlayToggle.addEventListener('change', () => {
    chrome.storage.local.set({ autoPlay: autoPlayToggle.checked });
  });

  engineUrlInput.addEventListener('change', () => {
    chrome.storage.local.set({ engineUrl: engineUrlInput.value });
  });

  autoQueueToggle.addEventListener('change', () => {
    chrome.storage.local.set({ autoQueue: autoQueueToggle.checked });
  });

  humanModeToggle.addEventListener('change', () => {
    chrome.storage.local.set({ humanMode: humanModeToggle.checked });
    updateAccuracyVisibility(humanModeToggle.checked);
  });

  mustWinToggle.addEventListener('change', () => {
    chrome.storage.local.set({ mustWin: mustWinToggle.checked });
    applyMustWinUI(mustWinToggle.checked);
  });

  scrambleToggle.addEventListener('change', () => {
    chrome.storage.local.set({ timeScramble: scrambleToggle.checked });
  });

  accuracySlider.addEventListener('input', () => {
    accuracyVal.textContent = `${accuracySlider.value}%`;
  });

  accuracySlider.addEventListener('change', () => {
    chrome.storage.local.set({ targetAccuracy: parseInt(accuracySlider.value, 10) });
  });

  premoveSlider.addEventListener('input', () => {
    premoveVal.textContent = `${premoveSlider.value}%`;
  });

  premoveSlider.addEventListener('change', () => {
    chrome.storage.local.set({ premoveProb: parseInt(premoveSlider.value, 10) });
  });

  speedSlider.addEventListener('input', () => {
    speedVal.textContent = `${speedSlider.value}s`;
  });

  speedSlider.addEventListener('change', () => {
    chrome.storage.local.set({ thinkingSpeed: parseFloat(speedSlider.value) });
  });

  if (autoRandomizeToggle) {
    autoRandomizeToggle.addEventListener('change', () => {
      chrome.storage.local.set({ autoRandomizeSpeed: autoRandomizeToggle.checked });
      speedSlider.disabled = autoRandomizeToggle.checked;
      speedSlider.style.opacity = autoRandomizeToggle.checked ? '0.5' : '1.0';
    });
  }

  // ============================================================
  // PHASE ELO (manual override for middle/endgame)
  // ============================================================
  const phaseEloToggle = document.getElementById('phaseEloEnabled');
  const phaseEloSettings = document.getElementById('phaseEloSettings');
  const phaseEloModeLabel = document.getElementById('phaseEloModeLabel');
  const middleEloInput = document.getElementById('manualMiddlegameElo');
  const endEloInput = document.getElementById('manualEndgameElo');

  function refreshPhaseEloUI() {
    const manual = phaseEloToggle.checked;
    phaseEloSettings.classList.toggle('hidden', !manual);
    phaseEloModeLabel.textContent = manual
      ? `Manual — middle ${middleEloInput.value}, end ${endEloInput.value}`
      : 'Auto (managed by Human Mode)';
  }

  chrome.storage.local.get({
    phaseEloMode: 'auto',          // 'auto' or 'manual'
    manualMiddlegameElo: 1200,
    manualEndgameElo: 1300,
  }, (s) => {
    phaseEloToggle.checked = s.phaseEloMode === 'manual';
    middleEloInput.value = s.manualMiddlegameElo;
    endEloInput.value = s.manualEndgameElo;
    refreshPhaseEloUI();
  });

  phaseEloToggle.addEventListener('change', () => {
    chrome.storage.local.set({ phaseEloMode: phaseEloToggle.checked ? 'manual' : 'auto' });
    refreshPhaseEloUI();
  });
  middleEloInput.addEventListener('change', () => {
    const v = Math.max(500, Math.min(2000, parseInt(middleEloInput.value, 10) || 1200));
    middleEloInput.value = v;
    chrome.storage.local.set({ manualMiddlegameElo: v });
    refreshPhaseEloUI();
  });
  endEloInput.addEventListener('change', () => {
    const v = Math.max(500, Math.min(2000, parseInt(endEloInput.value, 10) || 1300));
    endEloInput.value = v;
    chrome.storage.local.set({ manualEndgameElo: v });
    refreshPhaseEloUI();
  });

  // ============================================================
  // MATCH BREAKS (pauses between games)
  // ============================================================
  const breaksEnabledToggle = document.getElementById('breaksEnabled');
  const randomBreaksToggle = document.getElementById('randomBreaks');
  const gamesBeforeBreakInput = document.getElementById('gamesBeforeBreak');
  const breakMinutesInput = document.getElementById('breakMinutes');
  const breaksSettings = document.getElementById('breaksSettings');
  const manualBreakInputs = document.getElementById('manualBreakInputs');
  const breakSummary = document.getElementById('breakSummary');

  function updateBreakSummary() {
    const txt = breakSummary.querySelector('.plan-text');
    if (randomBreaksToggle.checked) {
      txt.innerHTML = `Auto: play <strong>5-15</strong> games, then pause <strong>3-20</strong> min`;
    } else {
      const g = parseInt(gamesBeforeBreakInput.value, 10) || 10;
      const m = parseFloat(breakMinutesInput.value) || 0;
      txt.innerHTML = `Play <strong>${g}</strong> games, then pause <strong>${m}</strong> min`;
    }
  }

  function updateBreaksVisibility() {
    breaksSettings.classList.toggle('hidden', !breaksEnabledToggle.checked);
    manualBreakInputs.classList.toggle('hidden', randomBreaksToggle.checked);
    updateBreakSummary();
  }

  chrome.storage.local.get({
    breaksEnabled: true,
    randomBreaks: false,
    gamesBeforeBreak: 10,
    breakMinutes: 10,
  }, (settings) => {
    breaksEnabledToggle.checked = settings.breaksEnabled;
    randomBreaksToggle.checked = settings.randomBreaks;
    gamesBeforeBreakInput.value = settings.gamesBeforeBreak;
    breakMinutesInput.value = settings.breakMinutes;
    updateBreaksVisibility();
  });

  breaksEnabledToggle.addEventListener('change', () => {
    chrome.storage.local.set({ breaksEnabled: breaksEnabledToggle.checked });
    updateBreaksVisibility();
  });

  randomBreaksToggle.addEventListener('change', () => {
    chrome.storage.local.set({ randomBreaks: randomBreaksToggle.checked });
    // Reset the active batch so the new mode takes effect immediately
    chrome.storage.local.set({ breakBatchGames: 0, gamesSinceBreak: 0 });
    updateBreaksVisibility();
  });

  gamesBeforeBreakInput.addEventListener('change', () => {
    chrome.storage.local.set({
      gamesBeforeBreak: parseInt(gamesBeforeBreakInput.value, 10) || 10,
      breakBatchGames: 0, // re-resolve batch target on next game
    });
    updateBreakSummary();
  });

  breakMinutesInput.addEventListener('change', () => {
    chrome.storage.local.set({ breakMinutes: parseFloat(breakMinutesInput.value) || 0 });
    updateBreakSummary();
  });

  // ============================================================
  // ELO CLIMB PLANNER
  // ============================================================
  const eloClimbToggle = document.getElementById('eloClimbEnabled');
  const eloClimbSettings = document.getElementById('eloClimbSettings');
  const currentEloInput = document.getElementById('currentElo');
  const targetEloInput = document.getElementById('targetElo');
  const gamesToReachSlider = document.getElementById('gamesToReach');
  const gamesToReachVal = document.getElementById('gamesToReachVal');
  const eloPlanSummary = document.getElementById('eloPlanSummary');
  const detectEloBtn = document.getElementById('detectElo');

  function updateEloClimbVisibility(enabled) {
    if (eloClimbSettings) {
      if (enabled) {
        eloClimbSettings.classList.remove('hidden');
      } else {
        eloClimbSettings.classList.add('hidden');
      }
    }
  }

  function updatePlanSummary() {
    const current = parseInt(currentEloInput.value, 10) || 800;
    const target = parseInt(targetEloInput.value, 10) || 1100;
    const games = parseInt(gamesToReachSlider.value, 10) || 60;
    const delta = target - current;

    if (delta <= 0) {
      eloPlanSummary.querySelector('.plan-text').innerHTML =
        `Already at or above target! Will maintain <strong>${target}</strong> ELO`;
      return;
    }

    // Rough ELO math: at similar ratings, win ≈ +10, loss ≈ -10, draw ≈ 0
    const eloPerGame = delta / games;
    // To gain X ELO per game on average: winRate = 0.5 + (X / 20)
    const requiredWinRate = Math.min(0.95, Math.max(0.50, 0.5 + (eloPerGame / 20)));
    const winPct = Math.round(requiredWinRate * 100);
    const eloPerGameRounded = eloPerGame.toFixed(1);

    eloPlanSummary.querySelector('.plan-text').innerHTML =
      `Win ~<strong>${winPct}%</strong> → gain ~<strong>${eloPerGameRounded}</strong> ELO/game → reach <strong>${target}</strong> in <strong>${games}</strong> games`;
  }

  // Load ELO climb settings
  chrome.storage.local.get({
    eloClimbEnabled: false,
    currentElo: 800,
    targetElo: 1100,
    gamesToReach: 60,
  }, (settings) => {
    eloClimbToggle.checked = settings.eloClimbEnabled;
    currentEloInput.value = settings.currentElo;
    targetEloInput.value = settings.targetElo;
    gamesToReachSlider.value = settings.gamesToReach;
    gamesToReachVal.textContent = settings.gamesToReach;
    updateEloClimbVisibility(settings.eloClimbEnabled);
    updatePlanSummary();
  });

  eloClimbToggle.addEventListener('change', () => {
    chrome.storage.local.set({ eloClimbEnabled: eloClimbToggle.checked });
    updateEloClimbVisibility(eloClimbToggle.checked);
  });

  currentEloInput.addEventListener('change', () => {
    chrome.storage.local.set({ currentElo: parseInt(currentEloInput.value, 10) });
    updatePlanSummary();
  });

  targetEloInput.addEventListener('change', () => {
    chrome.storage.local.set({ targetElo: parseInt(targetEloInput.value, 10) });
    updatePlanSummary();
  });

  gamesToReachSlider.addEventListener('input', () => {
    gamesToReachVal.textContent = gamesToReachSlider.value;
    updatePlanSummary();
  });

  gamesToReachSlider.addEventListener('change', () => {
    chrome.storage.local.set({ gamesToReach: parseInt(gamesToReachSlider.value, 10) });
  });

  // Auto-detect ELO from chess.com
  detectEloBtn.addEventListener('click', () => {
    detectEloBtn.textContent = '⏳';
    // Send message to content script to scrape the ELO from the page
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        detectEloBtn.textContent = '❌';
        setTimeout(() => { detectEloBtn.textContent = '🔍'; }, 2000);
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, { action: 'detectElo' }, (response) => {
        if (response && response.elo) {
          currentEloInput.value = response.elo;
          chrome.storage.local.set({ currentElo: response.elo });
          updatePlanSummary();
          detectEloBtn.textContent = '✅';
        } else {
          detectEloBtn.textContent = '❌';
        }
        setTimeout(() => { detectEloBtn.textContent = '🔍'; }, 2000);
      });
    });
  });

  // Function to update the status and stats in the UI
  function updateUIState(state) {
    if (!state) return;

    // Status
    if (state.status) {
      statusText.textContent = state.statusText || 'System Idle';
      
      // Clear class list and apply status class
      statusPulse.className = 'pulse-indicator';
      statusPulse.classList.add(state.status); // idle, running, thinking, error
    }

    // Stats
    if (state.sessionGames !== undefined) {
      sessionGamesVal.textContent = state.sessionGames;
    }
    
    if (state.wins !== undefined && state.draws !== undefined && state.losses !== undefined) {
      winLossRatioVal.textContent = `${state.wins} / ${state.draws} / ${state.losses}`;
    }
  }

  // Request current status on popup open
  chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
    if (response) {
      updateUIState(response);
    }
  });

  // Listen for real-time status updates from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'statusUpdate') {
      updateUIState(message.data);
    }
  });

  // ============================================================
  // BOT DIAGNOSTICS — Force Recover + Live State Panel
  // ============================================================
  const forceRecoverBtn = document.getElementById('forceRecoverBtn');
  const diagGameState   = document.getElementById('diagGameState');
  const diagColor       = document.getElementById('diagColor');
  const diagMoves       = document.getElementById('diagMoves');
  const recoveryLogEl   = document.getElementById('recoveryLog');

  // Wire up Force Recover button
  forceRecoverBtn.addEventListener('click', () => {
    forceRecoverBtn.classList.add('recovering');
    forceRecoverBtn.textContent = '⏳ Recovering...';

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        forceRecoverBtn.classList.remove('recovering');
        forceRecoverBtn.textContent = '🔄 Force Recover';
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, { action: 'forceRecover' }, () => {
        setTimeout(() => {
          forceRecoverBtn.classList.remove('recovering');
          forceRecoverBtn.textContent = '🔄 Force Recover';
        }, 2000);
      });
    });
  });

  // Update diagnostics panel from bot state
  function updateDiagnostics(state) {
    if (!state) return;

    // Game state pill
    if (state.gameInProgress) {
      diagGameState.textContent = '🟢 In Game';
      diagGameState.className = 'diag-pill active';
    } else {
      diagGameState.textContent = '⬛ Idle';
      diagGameState.className = 'diag-pill';
    }

    // Color pill
    if (state.ourColor) {
      const colorLabel = state.ourColor === 'w' ? '♙ White' : '♟ Black';
      diagColor.textContent = colorLabel;
      diagColor.className = state.gameInProgress ? 'diag-pill active' : 'diag-pill';
    }

    // Moves pill
    const retryStr = state.moveRetryCount > 0 ? ` ⚠ retry ${state.moveRetryCount}` : '';
    diagMoves.textContent = `${state.moveCount} moves${retryStr}`;
    diagMoves.className = state.moveRetryCount > 0 ? 'diag-pill error' : 'diag-pill';

    // Recovery log
    if (state.recoveryLog && state.recoveryLog.length > 0) {
      recoveryLogEl.innerHTML = state.recoveryLog.map((entry) => {
        const isAuto = entry.toLowerCase().includes('auto');
        return `<div class="log-entry ${isAuto ? 'auto' : ''}">${entry}</div>`;
      }).join('');
    } else {
      recoveryLogEl.innerHTML = '<span class="log-empty">No recoveries yet</span>';
    }
  }

  // Poll bot state every 2 seconds while popup is open
  function pollBotState() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      chrome.tabs.sendMessage(tabs[0].id, { action: 'getBotState' }, (response) => {
        if (chrome.runtime.lastError) return; // tab not ready
        updateDiagnostics(response);
      });
    });
  }

  // Run immediately on open, then every 2 seconds
  pollBotState();
  setInterval(pollBotState, 2000);

  // ============================================================
  // LIVE SYNC — reflect changes made elsewhere (floating panel,
  // content script auto-randomize, other tabs) without reopening.
  // ============================================================
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    if (changes.autoPlay) autoPlayToggle.checked = changes.autoPlay.newValue;
    if (changes.autoQueue) autoQueueToggle.checked = changes.autoQueue.newValue;
    if (changes.humanMode) {
      humanModeToggle.checked = changes.humanMode.newValue;
      updateAccuracyVisibility(changes.humanMode.newValue);
    }
    if (changes.mustWin) {
      mustWinToggle.checked = changes.mustWin.newValue;
      applyMustWinUI(changes.mustWin.newValue);
    }
    if (changes.timeScramble) {
      scrambleToggle.checked = changes.timeScramble.newValue;
    }
    if (changes.engineUrl) engineUrlInput.value = changes.engineUrl.newValue;
    if (changes.targetAccuracy) {
      accuracySlider.value = changes.targetAccuracy.newValue;
      accuracyVal.textContent = `${changes.targetAccuracy.newValue}%`;
    }
    if (changes.premoveProb) {
      premoveSlider.value = changes.premoveProb.newValue;
      premoveVal.textContent = `${changes.premoveProb.newValue}%`;
    }
    if (changes.thinkingSpeed && !speedSlider.disabled) {
      speedSlider.value = changes.thinkingSpeed.newValue;
      speedVal.textContent = `${changes.thinkingSpeed.newValue}s`;
    }
    if (changes.autoRandomizeSpeed && autoRandomizeToggle) {
      autoRandomizeToggle.checked = changes.autoRandomizeSpeed.newValue;
      speedSlider.disabled = changes.autoRandomizeSpeed.newValue;
      speedSlider.style.opacity = changes.autoRandomizeSpeed.newValue ? '0.5' : '1.0';
    }

    // Phase ELO
    if (changes.phaseEloMode) {
      phaseEloToggle.checked = changes.phaseEloMode.newValue === 'manual';
      refreshPhaseEloUI();
    }
    if (changes.manualMiddlegameElo) {
      middleEloInput.value = changes.manualMiddlegameElo.newValue;
      refreshPhaseEloUI();
    }
    if (changes.manualEndgameElo) {
      endEloInput.value = changes.manualEndgameElo.newValue;
      refreshPhaseEloUI();
    }

    // Break settings
    if (changes.breaksEnabled) {
      breaksEnabledToggle.checked = changes.breaksEnabled.newValue;
      updateBreaksVisibility();
    }
    if (changes.randomBreaks) {
      randomBreaksToggle.checked = changes.randomBreaks.newValue;
      updateBreaksVisibility();
    }
    if (changes.gamesBeforeBreak) {
      gamesBeforeBreakInput.value = changes.gamesBeforeBreak.newValue;
      updateBreakSummary();
    }
    if (changes.breakMinutes) {
      breakMinutesInput.value = changes.breakMinutes.newValue;
      updateBreakSummary();
    }
  });
});

