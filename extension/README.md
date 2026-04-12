# Annotate HTML — Chrome Extension

A thin Manifest V3 wrapper that injects [`annotate.js`](../annotate.js) into any tab on demand. Same toolbar, same markdown output, same everything — but for pages you don't control.

## Install (load unpacked)

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top-right)
3. Click **Load unpacked**
4. Select this `extension/` folder
5. Pin "Annotate HTML" to your Chrome toolbar

## Usage

- **Click the toolbar icon** on any page → toolbar appears in the bottom-right
- **Click again** → toolbar collapses to a round button
- **Press `Alt+Shift+A`** (default) → same toggle, no mouse needed. Rebind in `chrome://extensions/shortcuts` if it conflicts.

The first injection builds the toolbar. Subsequent invocations on the same tab toggle visibility instead of building duplicates (handled by a guard inside `annotate.js`).

## How it works

- `manifest.json` declares `activeTab` + `scripting` permissions only — no host permissions, no auto-injection on every page.
- `background.js` listens for `chrome.action.onClicked` and `chrome.commands.onCommand`. Both call `chrome.scripting.executeScript` with `world: "ISOLATED"` to inject `annotate.js` into the active tab.
- `annotate.js` is a byte-for-byte copy of `../annotate.js` — Chrome rejects manifest paths with `..`, so the file must physically live inside this folder.

## Sync with the root file

After editing `../annotate.js`, run:

```bash
./sync.sh
```

This is a one-line `cp` that copies the root file into this folder. There's no build step.

## Restricted pages

Chrome blocks content scripts on `chrome://*`, `chrome-extension://*`, the Chrome Web Store, the New Tab Page, and the built-in PDF viewer. The action will silently no-op on those pages — check the service worker console (`chrome://extensions` → Inspect views → service worker) for the warning.

## Known limitations

- **Shadow DOM**: `document.elementFromPoint` returns the shadow host, not the shadow child. Pre-existing limitation of `annotate.js`.
- **Iframes**: only the top frame gets the toolbar (`allFrames: false`). Cross-origin iframe annotation isn't supported.
- **Coexistence with the CDN script tag**: if a page already loads `annotate.js` via `<script>` tag, the page's main-world copy and the extension's isolated-world copy don't see each other — you'll briefly get two toolbars. Don't use the extension on pages that already embed the CDN version.

## License

MIT — same as the parent project.
