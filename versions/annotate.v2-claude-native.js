// =============================================================================
// Annotate.js — Standalone visual feedback tool for AI coding agents
// Inspired by Agentation (benjitaylor/agentation), rebuilt for plain HTML.
// No React. No build step. Just drop a <script> tag.
//
// Usage: <script src="annotate.js"></script>
// =============================================================================

(function () {
  "use strict";

  if (typeof window === "undefined") return;

  // ═══════════════════════════════════════════
  // State
  // ═══════════════════════════════════════════
  const state = {
    active: false,
    annotations: [],
    hoveredEl: null,
    detailLevel: "standard", // compact | standard | detailed | forensic
    counter: 0,
  };

  // ═══════════════════════════════════════════
  // Element Identification (ported from agentation)
  // ═══════════════════════════════════════════

  function getElementPath(target, maxDepth) {
    maxDepth = maxDepth || 4;
    const parts = [];
    let current = target;
    let depth = 0;
    while (current && depth < maxDepth) {
      const tag = current.tagName.toLowerCase();
      if (tag === "html" || tag === "body") break;
      let id = tag;
      if (current.id) {
        id = "#" + current.id;
      } else if (current.className && typeof current.className === "string") {
        const cls = current.className
          .split(/\s+/)
          .find(function (c) {
            return c.length > 2 && !c.match(/^[a-z]{1,2}$/) && !c.match(/[A-Z0-9]{5,}/);
          });
        if (cls) id = "." + cls.split("_")[0];
      }
      parts.unshift(id);
      current = current.parentElement;
      depth++;
    }
    return parts.join(" > ");
  }

  function identifyElement(target) {
    const path = getElementPath(target);
    const tag = target.tagName.toLowerCase();

    if (target.dataset && target.dataset.element) return { name: target.dataset.element, path: path };

    // SVG
    if (["path", "circle", "rect", "line", "g", "svg"].indexOf(tag) !== -1) {
      return { name: "graphic element", path: path };
    }
    // Buttons
    if (tag === "button") {
      var text = (target.textContent || "").trim();
      var ariaLabel = target.getAttribute("aria-label");
      if (ariaLabel) return { name: 'button [' + ariaLabel + ']', path: path };
      return { name: text ? 'button "' + text.slice(0, 25) + '"' : "button", path: path };
    }
    // Links
    if (tag === "a") {
      var linkText = (target.textContent || "").trim();
      return { name: linkText ? 'link "' + linkText.slice(0, 25) + '"' : "link", path: path };
    }
    // Inputs
    if (tag === "input") {
      var type = target.getAttribute("type") || "text";
      var ph = target.getAttribute("placeholder");
      if (ph) return { name: 'input "' + ph + '"', path: path };
      return { name: type + " input", path: path };
    }
    // Headings
    if (/^h[1-6]$/.test(tag)) {
      var hText = (target.textContent || "").trim();
      return { name: hText ? tag + ' "' + hText.slice(0, 35) + '"' : tag, path: path };
    }
    // Paragraphs
    if (tag === "p") {
      var pText = (target.textContent || "").trim();
      if (pText) return { name: 'paragraph: "' + pText.slice(0, 40) + (pText.length > 40 ? '...' : '') + '"', path: path };
      return { name: "paragraph", path: path };
    }
    // Spans / labels
    if (tag === "span" || tag === "label") {
      var sText = (target.textContent || "").trim();
      if (sText && sText.length < 40) return { name: '"' + sText + '"', path: path };
      return { name: tag, path: path };
    }
    // Images
    if (tag === "img") {
      var alt = target.getAttribute("alt");
      return { name: alt ? 'image "' + alt.slice(0, 30) + '"' : "image", path: path };
    }
    // Containers
    if (["div", "section", "article", "nav", "header", "footer", "aside", "main"].indexOf(tag) !== -1) {
      var role = target.getAttribute("role");
      var ariaL = target.getAttribute("aria-label");
      if (ariaL) return { name: tag + " [" + ariaL + "]", path: path };
      if (role) return { name: role, path: path };
      if (typeof target.className === "string" && target.className) {
        var words = target.className.split(/[\s_-]+/)
          .map(function (c) { return c.replace(/[A-Z0-9]{5,}.*$/, ""); })
          .filter(function (c) { return c.length > 2; })
          .slice(0, 2);
        if (words.length > 0) return { name: words.join(" "), path: path };
      }
      return { name: tag === "div" ? "container" : tag, path: path };
    }

    return { name: tag, path: path };
  }

  function getNearbyText(el) {
    var texts = [];
    var own = (el.textContent || "").trim();
    if (own && own.length < 100) texts.push(own);
    var prev = el.previousElementSibling;
    if (prev) {
      var pt = (prev.textContent || "").trim();
      if (pt && pt.length < 50) texts.unshift('[before: "' + pt.slice(0, 40) + '"]');
    }
    var next = el.nextElementSibling;
    if (next) {
      var nt = (next.textContent || "").trim();
      if (nt && nt.length < 50) texts.push('[after: "' + nt.slice(0, 40) + '"]');
    }
    return texts.join(" ");
  }

  function getClasses(el) {
    if (typeof el.className !== "string" || !el.className) return "";
    return el.className.split(/\s+/).filter(function (c) { return c.length > 0; }).join(", ");
  }

  function getComputedSnapshot(el) {
    var s = window.getComputedStyle(el);
    var parts = [];
    if (s.color && s.color !== "rgb(0, 0, 0)") parts.push("color: " + s.color);
    var bg = s.backgroundColor;
    if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") parts.push("bg: " + bg);
    if (s.fontSize) parts.push("font: " + s.fontSize);
    if (s.fontWeight && s.fontWeight !== "400" && s.fontWeight !== "normal") parts.push("weight: " + s.fontWeight);
    if (s.padding && s.padding !== "0px") parts.push("padding: " + s.padding);
    if (s.margin && s.margin !== "0px") parts.push("margin: " + s.margin);
    var d = s.display;
    if (d && d !== "block" && d !== "inline") parts.push("display: " + d);
    if (s.position && s.position !== "static") parts.push("position: " + s.position);
    if (s.borderRadius && s.borderRadius !== "0px") parts.push("radius: " + s.borderRadius);
    return parts.join(", ");
  }

  function getFullPath(el) {
    var parts = [];
    var cur = el;
    while (cur && cur.tagName && cur.tagName.toLowerCase() !== "html") {
      var tag = cur.tagName.toLowerCase();
      var ident = tag;
      if (cur.id) ident = tag + "#" + cur.id;
      else if (cur.className && typeof cur.className === "string") {
        var cls = cur.className.split(/\s+/).find(function (c) { return c.length > 2; });
        if (cls) ident = tag + "." + cls;
      }
      parts.unshift(ident);
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  }

  function getA11yInfo(el) {
    var parts = [];
    var role = el.getAttribute("role");
    var ariaLabel = el.getAttribute("aria-label");
    var tabIndex = el.getAttribute("tabindex");
    var ariaHidden = el.getAttribute("aria-hidden");
    if (role) parts.push('role="' + role + '"');
    if (ariaLabel) parts.push('aria-label="' + ariaLabel + '"');
    if (tabIndex) parts.push("tabindex=" + tabIndex);
    if (ariaHidden === "true") parts.push("aria-hidden");
    if (el.matches("a, button, input, select, textarea, [tabindex]")) parts.push("focusable");
    return parts.join(", ");
  }

  // ═══════════════════════════════════════════
  // Output Generation (ported from agentation)
  // ═══════════════════════════════════════════

  function generateOutput() {
    if (state.annotations.length === 0) return "";
    var viewport = window.innerWidth + "\u00d7" + window.innerHeight;
    var pathname = window.location.pathname;
    var dl = state.detailLevel;
    var out = "## Page Feedback: " + pathname + "\n";

    if (dl === "forensic") {
      out += "\n**Environment:**\n";
      out += "- Viewport: " + viewport + "\n";
      out += "- URL: " + window.location.href + "\n";
      out += "- Timestamp: " + new Date().toISOString() + "\n";
      out += "\n---\n";
    } else if (dl !== "compact") {
      out += "**Viewport:** " + viewport + "\n";
    }
    out += "\n";

    state.annotations.forEach(function (a, i) {
      if (dl === "compact") {
        out += (i + 1) + ". **" + a.element + "**: " + a.comment;
        if (a.selectedText) out += ' (re: "' + a.selectedText.slice(0, 30) + '")';
        out += "\n";
      } else if (dl === "forensic") {
        out += "### " + (i + 1) + ". " + a.element + "\n";
        if (a.fullPath) out += "**Full DOM Path:** " + a.fullPath + "\n";
        if (a.cssClasses) out += "**CSS Classes:** " + a.cssClasses + "\n";
        if (a.boundingBox) {
          var bb = a.boundingBox;
          out += "**Position:** x:" + Math.round(bb.x) + ", y:" + Math.round(bb.y) +
            " (" + Math.round(bb.width) + "\u00d7" + Math.round(bb.height) + "px)\n";
        }
        if (a.selectedText) out += '**Selected text:** "' + a.selectedText + '"\n';
        if (a.nearbyText && !a.selectedText) out += "**Context:** " + a.nearbyText.slice(0, 100) + "\n";
        if (a.computedStyles) out += "**Computed Styles:** " + a.computedStyles + "\n";
        if (a.accessibility) out += "**Accessibility:** " + a.accessibility + "\n";
        out += "**Feedback:** " + a.comment + "\n\n";
      } else {
        out += "### " + (i + 1) + ". " + a.element + "\n";
        out += "**Location:** " + a.elementPath + "\n";
        if (dl === "detailed") {
          if (a.cssClasses) out += "**Classes:** " + a.cssClasses + "\n";
          if (a.boundingBox) {
            var b = a.boundingBox;
            out += "**Position:** " + Math.round(b.x) + "px, " + Math.round(b.y) +
              "px (" + Math.round(b.width) + "\u00d7" + Math.round(b.height) + "px)\n";
          }
          if (a.nearbyText && !a.selectedText) out += "**Context:** " + a.nearbyText.slice(0, 100) + "\n";
        }
        if (a.selectedText) out += '**Selected text:** "' + a.selectedText + '"\n';
        out += "**Feedback:** " + a.comment + "\n\n";
      }
    });

    return out.trim();
  }

  // ═══════════════════════════════════════════
  // UI — Styles (injected once)
  // ═══════════════════════════════════════════

  function injectStyles() {
    if (document.getElementById("annotate-js-styles")) return;
    var style = document.createElement("style");
    style.id = "annotate-js-styles";
    style.textContent = [
      // Design tokens (Claude-native palette)
      // --ann-bg:        #FAF9F5  cream surface
      // --ann-bg-alt:    #F5F4ED  recessed surface
      // --ann-ink:       #1F1E1D  primary text
      // --ann-ink-mute:  #75726B  secondary text
      // --ann-line:      rgba(31,30,29,.08) hairline
      // --ann-accent:    #C96442  Claude orange
      // --ann-accent-bg: rgba(201,100,66,.10)

      // Toolbar
      '#ann-toolbar{position:fixed;bottom:24px;right:24px;z-index:99999;',
      'font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;',
      '-webkit-font-smoothing:antialiased;font-feature-settings:"ss01","cv11";',
      'font-size:13px;display:flex;align-items:center;gap:4px;',
      'background:#FAF9F5;color:#1F1E1D;padding:6px;border-radius:14px;',
      'border:1px solid rgba(31,30,29,.08);',
      'box-shadow:0 1px 2px rgba(31,30,29,.04),0 8px 24px rgba(31,30,29,.10);',
      'transition:transform .3s cubic-bezier(.2,.8,.2,1),opacity .25s ease;',
      'user-select:none}',

      '#ann-toolbar.hidden{transform:translateY(20px) scale(.95);opacity:0;pointer-events:none}',

      '#ann-toolbar button{background:none;border:none;color:#1F1E1D;cursor:pointer;',
      'padding:7px 10px;border-radius:9px;font-size:13px;font-weight:500;font-family:inherit;',
      'transition:background .15s ease,color .15s ease,transform .1s ease;',
      'display:inline-flex;align-items:center;gap:6px;white-space:nowrap;line-height:1}',
      '#ann-toolbar button svg{width:15px;height:15px;flex-shrink:0;display:block}',
      '@media (hover:hover){#ann-toolbar button:hover{background:#F0EEE6;color:#1F1E1D}}',
      '#ann-toolbar button:active{transform:scale(.97)}',
      '#ann-toolbar button.active{background:rgba(201,100,66,.10);color:#C96442}',
      '#ann-toolbar button.icon-only{padding:7px}',

      '#ann-toolbar .ann-badge{background:#C96442;color:#FAF9F5;',
      'border-radius:100px;padding:2px 8px;font-size:11px;font-weight:600;',
      'min-width:20px;text-align:center;font-variant-numeric:tabular-nums;',
      'transition:background .15s ease}',
      '#ann-toolbar .ann-badge.empty{background:#E8E5DA;color:#75726B}',

      '#ann-toolbar .ann-divider{width:1px;height:18px;background:rgba(31,30,29,.10);margin:0 2px}',

      '#ann-toolbar select{background:#F5F4ED;border:1px solid rgba(31,30,29,.08);',
      'color:#1F1E1D;border-radius:8px;padding:5px 8px;font-size:12px;font-weight:500;',
      'font-family:inherit;cursor:pointer;transition:border-color .15s ease}',
      '#ann-toolbar select:hover{border-color:rgba(31,30,29,.18)}',
      '#ann-toolbar select:focus{outline:none;border-color:#C96442}',

      // Hover highlight
      '#ann-hover-highlight{position:fixed;z-index:99990;pointer-events:none;',
      'border:1.5px solid #C96442;border-radius:8px;',
      'background:rgba(201,100,66,.06);',
      'box-shadow:0 0 0 4px rgba(201,100,66,.10);',
      'transition:all .12s cubic-bezier(.2,.8,.2,1)}',

      // Hover label
      '#ann-hover-label{position:fixed;z-index:99991;pointer-events:none;',
      'background:#1F1E1D;color:#FAF9F5;',
      'padding:5px 10px;border-radius:7px;font-size:11px;font-weight:500;',
      'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;',
      'white-space:nowrap;box-shadow:0 4px 16px rgba(31,30,29,.18)}',

      // Markers
      '.ann-marker{position:absolute;z-index:99992;width:24px;height:24px;',
      'border-radius:50%;background:#C96442;color:#FAF9F5;',
      'font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;',
      'display:flex;align-items:center;justify-content:center;',
      'cursor:pointer;border:2px solid #FAF9F5;',
      'box-shadow:0 1px 2px rgba(31,30,29,.10),0 4px 12px rgba(201,100,66,.30);',
      'font-family:ui-sans-serif,-apple-system,system-ui,sans-serif;overflow:visible;',
      'transform:translate(-50%,-100%);',
      'transition:transform .2s cubic-bezier(.2,.8,.2,1),box-shadow .2s ease;',
      'animation:ann-pop .3s cubic-bezier(.2,.8,.2,1) both}',
      '@media (hover:hover){.ann-marker:hover{transform:translate(-50%,-100%) scale(1.12);',
      'box-shadow:0 2px 4px rgba(31,30,29,.12),0 6px 18px rgba(201,100,66,.42)}}',
      '@keyframes ann-pop{from{transform:translate(-50%,-100%) scale(.8);opacity:0}',
      'to{transform:translate(-50%,-100%) scale(1);opacity:1}}',

      // Marker tooltip
      '.ann-marker-tip{position:absolute;left:30px;top:50%;transform:translateY(-50%);',
      'background:#FAF9F5;color:#1F1E1D;',
      'padding:10px 12px;border-radius:10px;font-size:12px;min-width:200px;max-width:320px;',
      'border:1px solid rgba(31,30,29,.08);',
      'box-shadow:0 1px 2px rgba(31,30,29,.04),0 12px 32px rgba(31,30,29,.14);',
      'pointer-events:none;white-space:normal;line-height:1.5;text-wrap:pretty;',
      'opacity:0;transition:opacity .15s}',
      '.ann-marker:hover .ann-marker-tip{opacity:1}',
      '.ann-marker-tip strong{color:#C96442;font-weight:600}',
      '.ann-marker-tip .ann-tip-path{color:#75726B;',
      'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;',
      'margin-top:6px;display:block;word-break:break-all}',

      // Popup (comment input)
      '#ann-popup{position:fixed;z-index:99998;background:#FAF9F5;',
      'border:1px solid rgba(31,30,29,.08);',
      'border-radius:14px;padding:14px;min-width:300px;max-width:380px;',
      'box-shadow:0 1px 2px rgba(31,30,29,.04),0 16px 48px rgba(31,30,29,.16);',
      'font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;',
      '-webkit-font-smoothing:antialiased;',
      'animation:ann-popup-in .2s cubic-bezier(.2,.8,.2,1) both}',
      '@keyframes ann-popup-in{from{transform:translateY(4px) scale(.98);opacity:0}',
      'to{transform:translateY(0) scale(1);opacity:1}}',

      '#ann-popup .ann-popup-label{color:#C96442;font-size:11px;font-weight:600;',
      'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;',
      'margin-bottom:10px;display:block;letter-spacing:.01em}',

      '#ann-popup textarea{width:100%;background:#F5F4ED;border:1px solid rgba(31,30,29,.08);',
      'color:#1F1E1D;border-radius:9px;padding:10px 12px;font-size:13px;',
      'font-family:inherit;-webkit-font-smoothing:antialiased;',
      'resize:vertical;min-height:64px;outline:none;line-height:1.55;',
      'transition:border-color .15s ease,background .15s ease}',
      '#ann-popup textarea::placeholder{color:#A8A49B}',
      '#ann-popup textarea:focus{border-color:#C96442;background:#FAF9F5}',

      '#ann-popup .ann-popup-actions{display:flex;gap:6px;margin-top:10px;justify-content:flex-end}',

      '#ann-popup .ann-popup-actions button{background:transparent;',
      'border:1px solid rgba(31,30,29,.10);',
      'color:#1F1E1D;border-radius:9px;padding:7px 14px;font-size:12px;font-weight:500;',
      'cursor:pointer;font-family:inherit;',
      'transition:background .15s,border-color .15s,transform .1s}',
      '@media (hover:hover){#ann-popup .ann-popup-actions button:hover{background:#F0EEE6}}',
      '#ann-popup .ann-popup-actions button:active{transform:scale(.97)}',
      '#ann-popup .ann-popup-actions button.primary{background:#C96442;',
      'color:#FAF9F5;border-color:#C96442}',
      '@media (hover:hover){#ann-popup .ann-popup-actions button.primary:hover{background:#B5573A;border-color:#B5573A}}',

      // Active cursor
      'body.ann-active{cursor:crosshair !important}',
      'body.ann-active *{cursor:crosshair !important}',

      // Copied toast
      '#ann-toast{position:fixed;top:24px;left:50%;transform:translateX(-50%) translateY(-12px);',
      'z-index:99999;background:#1F1E1D;color:#FAF9F5;padding:10px 18px;',
      'border-radius:100px;font-size:13px;font-weight:500;',
      'font-family:ui-sans-serif,-apple-system,system-ui,sans-serif;',
      '-webkit-font-smoothing:antialiased;',
      'box-shadow:0 1px 2px rgba(31,30,29,.10),0 12px 32px rgba(31,30,29,.24);',
      'opacity:0;transition:all .25s cubic-bezier(.2,.8,.2,1);pointer-events:none;',
      'display:inline-flex;align-items:center;gap:8px}',
      '#ann-toast svg{width:14px;height:14px;color:#C96442}',
      '#ann-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}',

      // Reduced motion
      '@media (prefers-reduced-motion:reduce){',
      '#ann-toolbar,#ann-popup,#ann-toast,.ann-marker,#ann-hover-highlight{',
      'transition:none !important;animation:none !important}}',
    ].join("\n");
    document.head.appendChild(style);
  }

  // ═══════════════════════════════════════════
  // UI — DOM helpers
  // ═══════════════════════════════════════════

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "className") e.className = attrs[k];
      else if (k.startsWith("on")) e.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    if (children) {
      if (typeof children === "string") e.textContent = children;
      else if (Array.isArray(children)) children.forEach(function (c) { if (c) e.appendChild(c); });
      else e.appendChild(children);
    }
    return e;
  }

  // ═══════════════════════════════════════════
  // Icons (Lucide — ISC license, inlined for zero-dep)
  // ═══════════════════════════════════════════

  var ICON_ATTRS = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

  var ICONS = {
    // square-pen
    pencil: '<svg ' + ICON_ATTRS + '>' +
      '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>' +
      '<path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>' +
      '</svg>',
    // copy
    copy: '<svg ' + ICON_ATTRS + '>' +
      '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>' +
      '<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>' +
      '</svg>',
    // trash-2
    trash: '<svg ' + ICON_ATTRS + '>' +
      '<path d="M3 6h18"/>' +
      '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>' +
      '<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' +
      '<line x1="10" x2="10" y1="11" y2="17"/>' +
      '<line x1="14" x2="14" y1="11" y2="17"/>' +
      '</svg>',
    // x
    x: '<svg ' + ICON_ATTRS + '>' +
      '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>' +
      '</svg>',
    // check
    check: '<svg ' + ICON_ATTRS + '>' +
      '<path d="M20 6 9 17l-5-5"/>' +
      '</svg>',
  };

  function iconEl(name) {
    var span = document.createElement("span");
    span.innerHTML = ICONS[name];
    return span.firstChild;
  }

  // ═══════════════════════════════════════════
  // UI — Toolbar
  // ═══════════════════════════════════════════

  var toolbar, hoverHighlight, hoverLabel, popup, toast;
  var markersContainer;

  function createToolbar() {
    injectStyles();

    // Hover highlight box
    hoverHighlight = el("div", { id: "ann-hover-highlight" });
    hoverHighlight.style.display = "none";
    document.body.appendChild(hoverHighlight);

    // Hover label
    hoverLabel = el("div", { id: "ann-hover-label" });
    hoverLabel.style.display = "none";
    document.body.appendChild(hoverLabel);

    // Markers container
    markersContainer = el("div", { id: "ann-markers", style: "position:absolute;top:0;left:0;width:0;height:0;overflow:visible;z-index:99992" });
    document.body.appendChild(markersContainer);

    // Toast
    toast = el("div", { id: "ann-toast" });
    toast.appendChild(iconEl("check"));
    toast.appendChild(document.createTextNode("Copied to clipboard"));
    document.body.appendChild(toast);

    // Build toolbar
    toolbar = el("div", { id: "ann-toolbar" });

    var isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

    // Toggle annotate mode
    var toggleBtn = el("button", {
      onClick: toggleActive,
      title: "Toggle annotation mode (" + (isMac ? "\u2325" : "Alt") + "+A)"
    });
    toggleBtn.id = "ann-toggle-btn";
    toggleBtn.appendChild(iconEl("pencil"));
    toggleBtn.appendChild(document.createTextNode("Annotate"));

    // Count badge
    var badge = el("span", { className: "ann-badge empty", id: "ann-count" }, "0");

    var divider1 = el("span", { className: "ann-divider" });

    // Detail level select
    var detailSelect = el("select", {
      title: "Output detail level",
      onChange: function (e) { state.detailLevel = e.target.value; }
    });
    ["compact", "standard", "detailed", "forensic"].forEach(function (v) {
      var opt = el("option", { value: v }, v.charAt(0).toUpperCase() + v.slice(1));
      if (v === state.detailLevel) opt.selected = true;
      detailSelect.appendChild(opt);
    });

    var divider2 = el("span", { className: "ann-divider" });

    // Copy
    var copyBtn = el("button", {
      className: "icon-only",
      onClick: copyOutput,
      title: "Copy annotations as markdown",
      "aria-label": "Copy annotations"
    });
    copyBtn.appendChild(iconEl("copy"));

    // Clear
    var clearBtn = el("button", {
      className: "icon-only",
      onClick: clearAll,
      title: "Clear all annotations",
      "aria-label": "Clear all annotations"
    });
    clearBtn.appendChild(iconEl("trash"));

    toolbar.appendChild(toggleBtn);
    toolbar.appendChild(badge);
    toolbar.appendChild(divider1);
    toolbar.appendChild(detailSelect);
    toolbar.appendChild(divider2);
    toolbar.appendChild(copyBtn);
    toolbar.appendChild(clearBtn);

    document.body.appendChild(toolbar);
  }

  // ═══════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════

  function toggleActive() {
    state.active = !state.active;
    var btn = document.getElementById("ann-toggle-btn");
    if (state.active) {
      btn.classList.add("active");
      document.body.classList.add("ann-active");
    } else {
      btn.classList.remove("active");
      document.body.classList.remove("ann-active");
      hideHover();
      closePopup();
    }
  }

  function hideHover() {
    hoverHighlight.style.display = "none";
    hoverLabel.style.display = "none";
    state.hoveredEl = null;
  }

  function updateCount() {
    var badge = document.getElementById("ann-count");
    if (!badge) return;
    var n = state.annotations.length;
    badge.textContent = n;
    if (n === 0) badge.classList.add("empty");
    else badge.classList.remove("empty");
  }

  function showToast(msg) {
    toast.textContent = msg || "Copied to clipboard";
    toast.classList.add("show");
    setTimeout(function () { toast.classList.remove("show"); }, 1800);
  }

  function copyOutput() {
    var md = generateOutput();
    if (!md) { showToast("No annotations"); return; }
    navigator.clipboard.writeText(md).then(function () {
      showToast("Copied " + state.annotations.length + " annotation(s)");
    });
  }

  function clearAll() {
    state.annotations = [];
    updateCount();
    renderMarkers();
  }

  // ═══════════════════════════════════════════
  // Popup (comment input)
  // ═══════════════════════════════════════════

  function closePopup() {
    if (popup && popup.parentNode) popup.parentNode.removeChild(popup);
    popup = null;
  }

  function showPopup(x, y, info, rect, selectedText) {
    closePopup();

    var bb = rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;

    popup = el("div", { id: "ann-popup" });

    var label = el("span", { className: "ann-popup-label" }, info.name);
    var textarea = el("textarea", { placeholder: "What should change?", rows: "3" });

    var actions = el("div", { className: "ann-popup-actions" }, [
      el("button", { onClick: function () { closePopup(); } }, "Cancel"),
      el("button", { className: "primary", onClick: function () {
        var comment = textarea.value.trim();
        if (!comment) { closePopup(); return; }

        var annotation = {
          id: "ann-" + (++state.counter),
          x: rect.x + rect.width / 2 + window.scrollX,
          y: rect.y + window.scrollY,
          comment: comment,
          element: info.name,
          elementPath: info.path,
          timestamp: Date.now(),
          selectedText: selectedText || undefined,
          boundingBox: bb,
          nearbyText: getNearbyText(info.target),
          cssClasses: getClasses(info.target),
          fullPath: getFullPath(info.target),
          accessibility: getA11yInfo(info.target),
          computedStyles: getComputedSnapshot(info.target),
        };

        state.annotations.push(annotation);
        updateCount();
        renderMarkers();
        closePopup();
      }}, "Add"),
    ]);

    popup.appendChild(label);
    popup.appendChild(textarea);
    popup.appendChild(actions);

    // Position near click
    popup.style.left = Math.min(x + 12, window.innerWidth - 380) + "px";
    popup.style.top = Math.min(y + 12, window.innerHeight - 200) + "px";

    document.body.appendChild(popup);
    textarea.focus();

    // Submit on Cmd/Ctrl+Enter
    textarea.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        actions.querySelector(".primary").click();
      }
      if (e.key === "Escape") closePopup();
    });
  }

  // ═══════════════════════════════════════════
  // Markers
  // ═══════════════════════════════════════════

  function renderMarkers() {
    markersContainer.innerHTML = "";
    state.annotations.forEach(function (a, i) {
      var marker = el("div", { className: "ann-marker" }, String(i + 1));
      marker.style.left = a.x + "px";
      marker.style.top = a.y + "px";

      // Tooltip on hover
      var tip = el("div", { className: "ann-marker-tip" });
      tip.innerHTML = "<strong>" + escHtml(a.element) + "</strong><br>" +
        escHtml(a.comment) +
        '<span class="ann-tip-path">' + escHtml(a.elementPath) + '</span>';
      marker.appendChild(tip);

      // Click to delete
      marker.addEventListener("click", function (e) {
        e.stopPropagation();
        state.annotations.splice(i, 1);
        updateCount();
        renderMarkers();
      });

      markersContainer.appendChild(marker);
    });
  }

  function escHtml(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  // ═══════════════════════════════════════════
  // Event Handlers
  // ═══════════════════════════════════════════

  function isToolbarElement(el) {
    if (!el) return false;
    var node = el;
    while (node) {
      if (node.id === "ann-toolbar" || node.id === "ann-popup" ||
          node.id === "ann-hover-highlight" || node.id === "ann-hover-label" ||
          (node.className && typeof node.className === "string" && node.className.indexOf("ann-marker") !== -1)) {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  function handleMouseMove(e) {
    if (!state.active) return;
    if (isToolbarElement(e.target)) { hideHover(); return; }

    var target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target || isToolbarElement(target)) { hideHover(); return; }

    state.hoveredEl = target;
    var rect = target.getBoundingClientRect();

    // Highlight box
    hoverHighlight.style.display = "block";
    hoverHighlight.style.left = rect.left + "px";
    hoverHighlight.style.top = rect.top + "px";
    hoverHighlight.style.width = rect.width + "px";
    hoverHighlight.style.height = rect.height + "px";

    // Label
    var info = identifyElement(target);
    hoverLabel.style.display = "block";
    hoverLabel.textContent = info.name + "  " + info.path;

    // Position label above element or below if too high
    var labelTop = rect.top - 28;
    if (labelTop < 4) labelTop = rect.bottom + 6;
    hoverLabel.style.left = Math.max(4, rect.left) + "px";
    hoverLabel.style.top = labelTop + "px";
  }

  function handleClick(e) {
    if (!state.active) return;
    if (isToolbarElement(e.target)) return;

    e.preventDefault();
    e.stopPropagation();

    var target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target || isToolbarElement(target)) return;

    var info = identifyElement(target);
    info.target = target;
    var rect = target.getBoundingClientRect();

    // Check for text selection
    var sel = window.getSelection();
    var selectedText = sel && sel.toString().trim() ? sel.toString().trim() : null;

    showPopup(e.clientX, e.clientY, info, rect, selectedText);
  }

  function handleKeydown(e) {
    // Alt+A to toggle
    if (e.altKey && (e.code === "KeyA" || e.key.toLowerCase() === "a")) {
      e.preventDefault();
      toggleActive();
    }
    // Escape to deactivate or close popup
    if (e.key === "Escape") {
      if (popup) { closePopup(); return; }
      if (state.active) toggleActive();
    }
  }

  // ═══════════════════════════════════════════
  // Init
  // ═══════════════════════════════════════════

  function init() {
    createToolbar();
    document.addEventListener("mousemove", handleMouseMove, true);
    document.addEventListener("click", handleClick, true);
    document.addEventListener("keydown", handleKeydown);
    window.addEventListener("scroll", function () {
      if (state.active) hideHover();
    }, { passive: true });
  }

  // Boot when DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
