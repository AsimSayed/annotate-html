// background.js — MV3 service worker for Annotate HTML
// Injects annotate.js into the active tab on action click OR keyboard shortcut.
// Subsequent invocations on the same tab hit the double-injection guard inside
// annotate.js and toggle toolbar visibility instead of building duplicates.

const RESTRICTED = [
  "chrome://",
  "chrome-extension://",
  "edge://",
  "about:",
  "https://chrome.google.com/webstore",
  "https://chromewebstore.google.com",
];

async function injectIntoTab(tab) {
  if (!tab || !tab.id) return;
  const url = tab.url || "";
  if (RESTRICTED.some((p) => url.startsWith(p))) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: false },
      files: ["annotate.js"],
      world: "ISOLATED",
    });
  } catch (err) {
    console.warn("[annotate] inject failed:", err);
  }
}

// Toolbar icon click
chrome.action.onClicked.addListener(injectIntoTab);

// Global keyboard shortcut (Alt+Shift+A by default, rebindable in
// chrome://extensions/shortcuts)
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-annotate") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) injectIntoTab(tab);
});
