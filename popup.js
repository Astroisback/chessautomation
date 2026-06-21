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
    engineUrl: 'http://100.86.25.112:8000/move',
    targetAccuracy: 80,
    premoveProb: 20,
    thinkingSpeed: 3.5,
    autoRandomizeSpeed: false
  };

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
});
