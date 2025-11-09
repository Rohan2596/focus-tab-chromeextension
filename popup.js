// popup.js
const btn = document.getElementById('toggle');
const minimizeOption = document.getElementById('minimizeOption');

async function updateStatus() {
  btn.disabled = true;
  btn.textContent = 'Checking…';

  chrome.runtime.sendMessage({ command: 'status' }, (resp) => {
    if (resp?.ok) {
      btn.textContent = resp.state ? 'Restore tabs' : 'Hide other tabs';
      btn.disabled = false;
    } else {
      btn.textContent = 'Error';
    }
  });

  // Load stored minimize setting
  chrome.storage.local.get('minimizeMode', (res) => {
    minimizeOption.checked = Boolean(res.minimizeMode);
  });
}

minimizeOption.addEventListener('change', () => {
  chrome.storage.local.set({ minimizeMode: minimizeOption.checked });
});

btn.addEventListener('click', () => {
  btn.disabled = true;
  btn.textContent = 'Working…';

  chrome.runtime.sendMessage(
    { command: 'toggle' },
    (resp) => {
      if (resp?.ok) {
        btn.textContent =
          resp.action === 'focus' ? 'Restore tabs' : 'Hide other tabs';
      } else {
        btn.textContent = 'Error';
        console.error(resp?.error);
      }
      setTimeout(updateStatus, 400);
    }
  );
});

updateStatus();
