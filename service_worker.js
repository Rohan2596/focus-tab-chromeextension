// service_worker.js

async function getState() {
  const { tabManagerState } = await chrome.storage.local.get('tabManagerState');
  return tabManagerState || null;
}

async function setState(state) {
  await chrome.storage.local.set({ tabManagerState: state });
}

async function clearState() {
  await chrome.storage.local.remove('tabManagerState');
}

// --- Focus current tab ---
async function focusCurrentTab() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab) throw new Error('No active tab found');

  const { minimizeMode } = await chrome.storage.local.get('minimizeMode');
  const allTabs = await chrome.tabs.query({ currentWindow: true });
  const otherTabs = allTabs.filter(t => t.id !== activeTab.id);

  if (otherTabs.length === 0) {
    return { message: 'Only one tab open — nothing to hide' };
  }

  if (minimizeMode) {
    // --- Minimize current window instead of moving ---
    await setState({
      movedTabIds: otherTabs.map(t => t.id),
      originalWindowId: activeTab.windowId,
      activeTabId: activeTab.id,
      minimizeMode: true,
    });

    await chrome.windows.update(activeTab.windowId, { state: 'minimized' });
    return { message: 'Minimized window' };
  }

  // --- Hide tabs into a new window ---
  const newWin = await chrome.windows.create({ focused: false, tabId: otherTabs[0].id });
  const movedTabIds = otherTabs.slice(1).map(t => t.id);

  if (movedTabIds.length > 0) {
    await chrome.tabs.move(movedTabIds, { windowId: newWin.id, index: -1 });
  }

  await setState({
    movedTabIds: otherTabs.map(t => t.id),
    originalWindowId: activeTab.windowId,
    activeTabId: activeTab.id,
    minimizeMode: false,
  });

  await chrome.windows.update(activeTab.windowId, { focused: true });
  await chrome.tabs.update(activeTab.id, { active: true });

  return { message: 'Hid other tabs' };
}

// --- Restore tabs ---
async function restoreTabs() {
  const state = await getState();
  if (!state) return { message: 'No state found' };

  const { movedTabIds = [], originalWindowId, minimizeMode } = state;

  if (minimizeMode) {
    try {
      await chrome.windows.update(originalWindowId, { state: 'normal', focused: true });
    } catch {
      // window may no longer exist
      await chrome.windows.create({ focused: true });
    }
    await clearState();
    return { message: 'Restored minimized window' };
  }

  // --- Normal restore logic ---
  const existingTabs = await chrome.tabs.query({});
  const existingIds = new Set(existingTabs.map(t => t.id));
  const idsToMove = movedTabIds.filter(id => existingIds.has(id));

  if (idsToMove.length === 0) {
    await clearState();
    return { message: 'No tabs to restore' };
  }

  let targetWindowId = originalWindowId;
  try {
    await chrome.windows.get(targetWindowId);
  } catch {
    const win = await chrome.windows.create({ focused: false });
    targetWindowId = win.id;
  }

  await chrome.tabs.move(idsToMove, { windowId: targetWindowId, index: -1 });

  try {
    await chrome.tabs.update(state.activeTabId, { active: true });
    const tab = await chrome.tabs.get(state.activeTabId);
    if (tab?.windowId) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
  } catch {}

  await clearState();
  return { message: 'Restored tabs' };
}

// --- Message handler ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.command === 'toggle') {
        const state = await getState();
        if (state) {
          const res = await restoreTabs();
          sendResponse({ ok: true, action: 'restore', res });
        } else {
          const res = await focusCurrentTab();
          sendResponse({ ok: true, action: 'focus', res });
        }
      } else if (msg?.command === 'status') {
        const state = await getState();
        sendResponse({ ok: true, state });
      } else {
        sendResponse({ ok: false, error: 'Unknown command' });
      }
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
  })();

  return true;
});
