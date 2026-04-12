# annotate-html

A visual feedback tool for AI coding agents. Drop a single `<script>` tag into any HTML page — no React, no build step, no dependencies.

Inspired by [Agentation](https://github.com/benjitaylor/agentation) by Benji Taylor, Dennis Jin, and Alex Vanderzon. Rebuilt from the ground up for plain HTML websites.

## Why

Agentation is excellent but requires React 18+. If you're building static HTML pages, prototyping without a framework, or working with server-rendered templates, you need something that just works with a script tag. That's this.

## Usage

Add one line before `</body>`:

```html
<script src="https://cdn.jsdelivr.net/gh/AsimSayed/annotate-html@main/annotate.js"></script>
```

Or download `annotate.js` and include it locally:

```html
<script src="annotate.js"></script>
```

That's it.

## Install as a Chrome extension (optional)

If you don't control a site's HTML — staging URLs, production sites, design references, competitor pages — the same tool is available as a Chrome extension. Click the extension's toolbar icon (or press `Alt+Shift+A`) on any page to inject the toolbar for that tab.

1. Clone this repo
2. Open `chrome://extensions` → toggle **Developer mode** → **Load unpacked**
3. Select the `extension/` folder

Both distribution channels share the same `annotate.js` file. See [`extension/README.md`](extension/README.md) for the loader details.

## How it works

1. A toolbar appears in the bottom-right corner of your page
2. Click **Annotate** (or press `Alt+A`) to enter annotation mode — an asterisk cursor appears
3. Hover over any element — see a colored highlight and selector label
4. Click an element — a popup shows computed styles and a text field for your feedback
5. Numbered markers drop at your cursor position
6. Hover a marker to preview your comment, click to edit
7. Press `C` or click Copy — structured markdown lands on your clipboard
8. Paste into Claude Code, Cursor, Copilot, or any AI coding agent

### Toolbar

The toolbar collapses to a round asterisk button when closed. Click it or press `Alt+A` to expand.

- **Color picker** — click the color swatch (or press `M`) to choose a marker color. Changes the accent color across the entire UI: markers, highlights, cursor, buttons, and badges.
- **Show/hide** — press `H` or click the eye icon to toggle markers and rulers
- **Copy markdown** — press `C` to copy all annotations as structured markdown
- **Close** — collapses to a round button; `Alt+Shift+A` (extension shortcut) or `Alt+A` brings it back

### Keyboard shortcuts

| Key | Action |
|---|---|
| `Alt+A` | Toggle annotation mode |
| `C` | Copy markdown to clipboard |
| `M` | Open/close marker color picker |
| `H` | Show/hide markers and rulers |
| `Cmd/Ctrl+Enter` | Submit annotation |
| `Esc` | Close popup, color picker, or exit annotation mode |

## What it captures

Each annotation includes structured data that helps AI agents find the exact code:

| Field | Example |
|---|---|
| Element name | `button "Download for macOS"` |
| Selector path | `.hero > .wrap > .hero-actions > .btn-primary` |
| CSS classes | `btn-primary` |
| Bounding box | `x:420, y:380 (180x48px)` |
| Nearby text | Context from sibling elements |
| Computed styles | `color: rgb(255,255,255), bg: rgb(26,29,38), radius: 100px` |
| Accessibility | `role="button", focusable` |
| Full DOM path | `main#main > section.hero > div.wrap > div > a.btn-primary` |
| Selected text | Any text you highlight before clicking |

## Output format

Annotations are exported as detailed markdown. Each annotation includes the element name, selector path, CSS classes, bounding box, nearby text context, and your feedback.

### Example output

```markdown
## Page Feedback: /index.html
**Viewport:** 1440x900

### 1. button "Download for macOS"
**Location:** .hero > .wrap > .hero-actions > .btn-primary
**Classes:** btn-primary
**Position:** 420px, 380px (180x48px)
**Feedback:** Make the border-radius softer, more like 100px pill shape

### 2. h2 "Built with Swift."
**Location:** .native-section > .wrap > .vis
**Feedback:** Font weight feels too heavy here, try 600 instead of 700
```

## Comparison with Agentation

| | annotate-html | Agentation |
|---|---|---|
| Dependencies | None | React 18+ |
| Install | `<script>` tag or Chrome extension | `npm install agentation` |
| Frameworks | Any HTML page | React apps |
| Build step | No | Yes |
| Element identification | Yes | Yes |
| Text selection | Yes | Yes |
| Computed styles preview | Yes | Yes |
| Marker color picker | Yes | Yes |
| Custom cursor | Yes | No |
| Chrome extension | Yes | No |
| Multi-select | No | Yes |
| Design/layout mode | No | Yes |
| Animation freeze | No | Yes |
| Webhook sync | No | Yes |
| MCP server | No | Yes |

If you're using React, use [Agentation](https://github.com/benjitaylor/agentation) — it's more feature-rich. This project exists for everything else.

## Use with Claude Code

The typical workflow:

1. Add `annotate.js` to your HTML page
2. Open in browser, annotate what you want changed
3. Click **Copy**
4. Paste the markdown into Claude Code
5. Claude gets exact selectors, positions, and context to find and fix the right code

## License

MIT

## Credits

Core element identification and output format adapted from [Agentation](https://github.com/benjitaylor/agentation) by Benji Taylor, Dennis Jin, and Alex Vanderzon (MIT License).

Built by [Asim Sayed](https://asimsayed.com) at the University of Washington.
