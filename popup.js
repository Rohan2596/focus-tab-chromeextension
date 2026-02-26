/**
 * Focus Tab - Popup Logic
 * Compliant with 2026 Chrome Web Store Least Privilege Policies.
 */

const btn = document.getElementById('toggle');
const minimizeOption = document.getElementById('minimizeOption');

// Helper to update button state
function setButtonState(disabled, text) {
  btn.disabled = disabled;
  btn.textContent = text;
}

async function updateStatus() {
  setButtonState(true, 'Checking…');

  // Request current state from Service Worker
  chrome.runtime.sendMessage({ command: 'status' }, (resp) => {
    if (chrome.runtime.lastError) {
      setButtonState(false, 'Status Error');
      return;
    }

    if (resp?.ok) {
      setButtonState(false, resp.state ? '🚀 Restore Tabs' : '🎯 Hide Other Tabs');
    } else {
      setButtonState(false, 'Error');
    }
  });

  // Load user preference for minimize mode
  chrome.storage.local.get('minimizeMode', (res) => {
    minimizeOption.checked = Boolean(res.minimizeMode);
  });
}

// Save preference immediately when toggled
minimizeOption.addEventListener('change', () => {
  chrome.storage.local.set({ minimizeMode: minimizeOption.checked });
});

// Handle Focus/Restore toggle
btn.addEventListener('click', () => {
  setButtonState(true, 'Working…');

  chrome.runtime.sendMessage({ command: 'toggle' }, (resp) => {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError);
      setButtonState(false, 'Error');
      return;
    }

    if (resp?.ok) {
      // Immediate UI update based on the action performed
      setButtonState(false, resp.action === 'focus' ? '🚀 Restore Tabs' : '🎯 Hide Other Tabs');
    } else {
      setButtonState(false, 'Retry');
      console.error(resp?.error);
    }
    
    // Refresh status to ensure background sync
    setTimeout(updateStatus, 300);
  });
});

// Initialize on popup open
document.addEventListener('DOMContentLoaded', updateStatus);