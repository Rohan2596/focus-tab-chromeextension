/**
 * Focus Tab - Service Worker
 * Policy Compliance: This script uses only Tab IDs and Window IDs.
 * It does not access Tab URLs, Titles, or Favicons, satisfying the 
 * "Least Privilege" requirement for removing the 'tabs' permission.
 */

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
  // Querying for ID and windowId is permitted without "tabs" permission
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab) throw new Error('No active tab found');

  const { minimizeMode } = await chrome.storage.local.get('minimizeMode');
  const allTabs = await chrome.tabs.query({ currentWindow: true });
  
  // We only use the .id property here
  const otherTabs = allTabs.filter(t => t.id !== activeTab.id);

  if (otherTabs.length === 0) {
    return { message: 'Only one tab open' };
  }

  if (minimizeMode) {
    await setState({
      movedTabIds: otherTabs.map(t => t.id),
      originalWindowId: activeTab.windowId,
      activeTabId: activeTab.id,
      minimizeMode: true,
    });

    await chrome.windows.update(activeTab.windowId, { state: 'minimized' });
    return { message: 'Minimized' };
  }

  // Create a new window to "hold" the hidden tabs
  // Passing the first tabId here is a standard way to move tabs without broad permissions
  const newWin = await chrome.windows.create({ focused: false, tabId: otherTabs[0].id });
  const movedTabIds = otherTabs.slice(1).map(t => t.id);

  if (movedTabIds.length > 0) {
    await chrome.tabs.move(movedTabIds, { windowId: newWin.id, index: -1 });
  }

  await setState({
    movedTabIds: otherTabs.map(t => t.id),
    hiddenWindowId: newWin.id, // Track the hidden window to close it later
    originalWindowId: activeTab.windowId,
    activeTabId: activeTab.id,
    minimizeMode: false,
  });

  // Re-focus the original window and tab
  await chrome.windows.update(activeTab.windowId, { focused: true });
  await chrome.tabs.update(activeTab.id, { active: true });

  return { message: 'Focused' };
}

// --- Restore tabs ---
async function restoreTabs() {
  const state = await getState();
  if (!state) return { message: 'No state' };

  const { movedTabIds = [], originalWindowId, minimizeMode, hiddenWindowId } = state;

  if (minimizeMode) {
    try {
      await chrome.windows.update(originalWindowId, { state: 'normal', focused: true });
    } catch (e) {
      // Window might have been closed; nothing to restore
    }
    await clearState();
    return { message: 'Restored' };
  }

  // Verify tabs still exist before moving
  const existingTabs = await chrome.tabs.query({});
  const existingIds = new Set(existingTabs.map(t => t.id));
  const idsToMove = movedTabIds.filter(id => existingIds.has(id));

  if (idsToMove.length > 0) {
    let targetWindowId = originalWindowId;
    try {
      await chrome.windows.get(targetWindowId);
    } catch (e) {
      // Original window closed, create a new one
      const win = await chrome.windows.create({ focused: true });
      targetWindowId = win.id;
    }

    await chrome.tabs.move(idsToMove, { windowId: targetWindowId, index: -1 });
    
    // Close the temporary "hidden" window if it still exists and is empty
    if (hiddenWindowId) {
      try { await chrome.windows.remove(hiddenWindowId); } catch (e) {}
    }
  }

  // Ensure the active tab stays active
  try {
    await chrome.tabs.update(state.activeTabId, { active: true });
  } catch (e) {}

  await clearState();
  return { message: 'Restored' };
}

// --- Messaging Hub ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.command === 'toggle') {
    (async () => {
      const state = await getState();
      const res = state ? await restoreTabs() : await focusCurrentTab();
      sendResponse({ ok: true, action: state ? 'restore' : 'focus', res });
    })();
    return true; 
  }

  if (msg?.command === 'status') {
    getState().then(state => sendResponse({ ok: true, state }));
    return true;
  }
});