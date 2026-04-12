# annotate-html

Point at things on any webpage. Tell your AI agent what to change.

One script tag. No framework, no build step, no dependencies. Also ships as a Chrome extension for pages you don't control.

## Install

**Script tag** — add before `</body>`:

```html
<script src="https://cdn.jsdelivr.net/gh/AsimSayed/annotate-html@main/annotate.js"></script>
```

**Chrome extension** — for any page, no code changes needed:

1. Clone this repo
2. `chrome://extensions` → Developer mode → Load unpacked → select `extension/`
3. Click the asterisk icon on any tab (or press `Alt+Shift+A`)

Both channels run the same `annotate.js`.

## How it works

1. A toolbar appears bottom-right. Click **Annotate** or press `Alt+A` — an asterisk cursor appears
2. Hover any element to see its selector and highlight. Click to open a popup with computed styles and a feedback field
3. Markers drop at your click position. Hover to preview, click to edit
4. Press `C` to copy all feedback as structured markdown. Paste into Claude Code, Cursor, or any AI coding tool

The toolbar collapses to a round button when closed. Rulers along the top and left edges let you drag out guide lines for alignment.

### Keyboard shortcuts

| Key | What it does |
|---|---|
| `Alt+A` | Toggle annotation mode |
| `C` | Copy markdown |
| `M` | Marker color picker |
| `H` | Show/hide markers, rulers, guides |
| `Cmd/Ctrl+Enter` | Submit annotation |
| `Esc` | Close popup or exit mode |

### Color picker

Click the color swatch or press `M`. Seven colors. Choosing one repaints everything — markers, highlights, cursor, active states, badges, buttons.

## What gets captured

Each annotation records what an AI agent needs to find and fix the right code:

- **Element name** — `button "Download"`, `h2 "Features"`, `image "hero.png"`
- **Selector path** — `.hero > .cta > .btn-primary`
- **CSS classes, bounding box, computed styles**
- **Selected text** (if you highlight before clicking)
- **Nearby text context** from sibling elements
- **Accessibility info** — role, aria-label, focusable

### Example output

```markdown
## Page Feedback: /index.html
**Viewport:** 1440×900

### 1. button "Download for macOS"
**Location:** .hero > .wrap > .hero-actions > .btn-primary
**Classes:** btn-primary
**Position:** 420px, 380px (180×48px)
**Feedback:** Make the border-radius softer, more like 100px pill shape

### 2. h2 "Built with Swift."
**Location:** .native-section > .wrap > .vis
**Feedback:** Font weight feels too heavy here, try 600 instead of 700
```

## License

MIT

## Credits

Element identification approach adapted from [Agentation](https://github.com/benjitaylor/agentation) (MIT). Built by [Asim Sayed](https://asimsayed.com).
