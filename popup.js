document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const autoPlayToggle = document.getElementById('autoPlay');
  const autoQueueToggle = document.getElementById('autoQueue');
  const accuracySlider = document.getElementById('targetAccuracy');
  const premoveSlider = document.getElementById('premoveProb');
  const speedSlider = document.getElementById('thinkingSpeed');
  const engineUrlInput = document.getElementById('engineUrl');

  const accuracyVal = document.getElementById('accuracyVal');
  const premoveVal = document.getElementById('premoveVal');
  const speedVal = document.getElementById('speedVal');

  const statusBanner = document.getElementById('statusBanner');
  const statusPulse = document.getElementById('statusPulse');
  const statusText = document.getElementById('statusText');
  const sessionGamesVal = document.getElementById('sessionGames');
  const winLossRatioVal = document.getElementById('winLossRatio');

  // Default values
  const defaults = {
    autoPlay: true,
    autoQueue: true,
    engineUrl: 'http://100.86.25.112:8000/move',
    targetAccuracy: 80,
    premoveProb: 20,
    thinkingSpeed: 3.5
  };

  // Load saved settings
  chrome.storage.local.get(defaults, (settings) => {
    autoPlayToggle.checked = settings.autoPlay;
    autoQueueToggle.checked = settings.autoQueue;
    engineUrlInput.value = settings.engineUrl;
    
    accuracySlider.value = settings.targetAccuracy;
    accuracyVal.textContent = `${settings.targetAccuracy}%`;
    
    premoveSlider.value = settings.premoveProb;
    premoveVal.textContent = `${settings.premoveProb}%`;
    
    speedSlider.value = settings.thinkingSpeed;
    speedVal.textContent = `${settings.thinkingSpeed}s`;
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
