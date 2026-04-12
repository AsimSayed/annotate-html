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
  // Double-injection guard
  // ═══════════════════════════════════════════
  // If annotate.js has already booted on this page (e.g. Chrome extension
  // clicked twice, or script tag + extension), do NOT build a second toolbar.
  // Instead, ask the existing instance to toggle its visibility and bail.
  if (window.__annotateHtml && typeof window.__annotateHtml.toggle === "function") {
    try { window.__annotateHtml.toggle(); } catch (e) {}
    return;
  }

  // ═══════════════════════════════════════════
  // State
  // ═══════════════════════════════════════════
  const state = {
    active: false,
    annotations: [],
    hoveredEl: null,
    detailLevel: "detailed",
    counter: 0,
    markersHidden: false,
    toolbarHidden: false,
    markerColor: "#C96442",
  };

  var MARKER_COLORS = [
    "#C96442", "#EF4444", "#F59E0B",
    "#22C55E", "#06B6D4", "#3B82F6", "#8B5CF6",
  ];

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
      'height:44px;max-width:600px;overflow:hidden;',
      'border:1px solid rgba(31,30,29,.08);',
      'box-shadow:0 1px 2px rgba(31,30,29,.04),0 8px 24px rgba(31,30,29,.10);',
      'transition:max-width .36s cubic-bezier(.65,0,.35,1),',
      'padding .36s cubic-bezier(.65,0,.35,1),',
      'border-radius .36s cubic-bezier(.65,0,.35,1),',
      'box-shadow .25s ease;',
      'user-select:none}',

      // Collapsed (round button) state — same element morphs
      '#ann-toolbar.collapsed{max-width:44px;padding:0;border-radius:50%;',
      'overflow:visible;justify-content:center;cursor:pointer;',
      'box-shadow:0 1px 2px rgba(31,30,29,.04),0 6px 18px rgba(31,30,29,.10)}',
      '@media (hover:hover){#ann-toolbar.collapsed:hover{',
      'box-shadow:0 2px 4px rgba(31,30,29,.06),0 10px 28px rgba(31,30,29,.14)}}',

      // Children fade — fast out on collapse, delayed in on expand
      '#ann-toolbar > *:not(.ann-collapsed-view){',
      'opacity:1;transition:opacity .15s ease .22s}',
      '#ann-toolbar.collapsed > *:not(.ann-collapsed-view){',
      'opacity:0;pointer-events:none;transition:opacity .12s ease 0s}',

      // The collapsed face — pencil icon + badge, sits absolute over the row
      '.ann-collapsed-view{position:absolute;inset:0;display:flex;align-items:center;',
      'justify-content:center;color:#C96442;pointer-events:none;opacity:0;',
      'transition:opacity .14s ease 0s}',
      '#ann-toolbar.collapsed .ann-collapsed-view{opacity:1;pointer-events:auto;',
      'transition:opacity .14s ease .22s}',
      '.ann-collapsed-view svg{width:18px;height:18px;display:block}',
      '.ann-collapsed-view .ann-collapsed-badge{position:absolute;top:-4px;right:-4px;',
      'background:#C96442;color:#FAF9F5;border:1.5px solid #FAF9F5;',
      'border-radius:100px;min-width:17px;height:17px;padding:0 4px;',
      'font-size:10px;font-weight:600;font-variant-numeric:tabular-nums;',
      'display:flex;align-items:center;justify-content:center;line-height:1;',
      'pointer-events:none;transform-origin:center;',
      'transition:transform .2s cubic-bezier(.2,.8,.2,1)}',
      '.ann-collapsed-view .ann-collapsed-badge.empty{display:none}',
      '.ann-collapsed-view .ann-collapsed-badge.bump{animation:ann-badge-pop .35s cubic-bezier(.2,.8,.2,1)}',


      '#ann-toolbar button{background:none;border:none;color:#1F1E1D;cursor:pointer;',
      'padding:7px 10px;border-radius:9px;font-size:13px;font-weight:500;font-family:inherit;',
      'transition:background .15s ease,color .15s ease,transform .1s ease;',
      'display:inline-flex;align-items:center;gap:6px;white-space:nowrap;line-height:1}',
      '#ann-toolbar button svg{width:18px;height:18px;flex-shrink:0;display:block}',
      '@media (hover:hover){#ann-toolbar button:hover{background:#F0EEE6;color:#1F1E1D}}',
      '#ann-toolbar button:active{transform:scale(.97)}',
      '#ann-toolbar button.active{background:rgba(201,100,66,.10);color:#C96442}',
      '#ann-toolbar button.icon-only{padding:7px}',

      // Eye-toggle button with corner badge
      '#ann-toolbar .ann-eye-btn{position:relative}',
      '#ann-toolbar .ann-eye-badge{position:absolute;top:-3px;right:-3px;',
      'background:#C96442;color:#FAF9F5;border:1.5px solid #FAF9F5;',
      'border-radius:100px;min-width:17px;height:17px;padding:0 4px;',
      'font-size:10px;font-weight:600;font-variant-numeric:tabular-nums;',
      'display:flex;align-items:center;justify-content:center;line-height:1;',
      'pointer-events:none;transform-origin:center;',
      'transition:transform .2s cubic-bezier(.2,.8,.2,1)}',
      '#ann-toolbar .ann-eye-badge.empty{display:none}',
      '#ann-toolbar .ann-eye-btn.hidden-state{color:#75726B}',
      // pop on increment
      '@keyframes ann-badge-pop{0%{transform:scale(1)}40%{transform:scale(1.25)}100%{transform:scale(1)}}',
      '#ann-toolbar .ann-eye-badge.bump{animation:ann-badge-pop .35s cubic-bezier(.2,.8,.2,1)}',

      // Copy success state
      '#ann-toolbar button.success{background:rgba(34,165,90,.10)}',
      '#ann-toolbar button.success svg{color:inherit}',

      // Color swatch (toolbar circle)
      '#ann-toolbar .ann-color-swatch{width:22px;height:22px;border-radius:50%;cursor:pointer;',
      'border:2px solid rgba(31,30,29,.10);flex-shrink:0;',
      'transition:transform .15s ease,border-color .15s ease}',
      '@media (hover:hover){#ann-toolbar .ann-color-swatch:hover{transform:scale(1.1);',
      'border-color:rgba(31,30,29,.25)}}',
      '#ann-toolbar .ann-color-swatch:active{transform:scale(.95)}',

      // Color picker popover
      '#ann-color-picker{position:fixed;z-index:99998;',
      'background:#FAF9F5;border:1px solid rgba(31,30,29,.08);',
      'border-radius:12px;padding:10px 14px;',
      'box-shadow:0 1px 2px rgba(31,30,29,.04),0 12px 32px rgba(31,30,29,.14);',
      'display:flex;gap:8px;align-items:center;',
      'animation:ann-popup-in .2s cubic-bezier(.2,.8,.2,1) both}',
      '.ann-color-opt{width:28px;height:28px;border-radius:50%;cursor:pointer;',
      'flex-shrink:0;border:none;padding:0;',
      'transition:transform .12s ease}',
      '@media (hover:hover){.ann-color-opt:hover{transform:scale(1.15)}}',
      '.ann-color-opt:active{transform:scale(.92)}',
      '.ann-color-opt.active{box-shadow:0 0 0 2px #FAF9F5,0 0 0 3.5px #1F1E1D}',

      // Custom toolbar tooltip (pops above)
      '#ann-tip{position:fixed;z-index:100000;',
      'background:#FAF9F5;border:1px solid rgba(31,30,29,.08);',
      'border-radius:8px;padding:5px 10px;',
      'box-shadow:0 2px 12px rgba(31,30,29,.12);',
      'font-family:ui-sans-serif,-apple-system,system-ui,sans-serif;',
      '-webkit-font-smoothing:antialiased;',
      'font-size:12px;font-weight:500;color:#1F1E1D;',
      'white-space:nowrap;pointer-events:none;',
      'opacity:0;transform:translateX(-50%) translateY(4px);',
      'transition:opacity .1s ease,transform .1s ease}',
      '#ann-tip.show{opacity:1;transform:translateX(-50%) translateY(0)}',
      '#ann-tip .ann-tip-key{color:#9A968E;margin-left:6px;font-size:11px;font-weight:400}',
      "#ann-tip::after{content:'';position:absolute;bottom:-5px;left:50%;",
      'transform:translateX(-50%);',
      'border-left:5px solid transparent;border-right:5px solid transparent;',
      'border-top:5px solid #FAF9F5}',

      '#ann-toolbar .ann-divider{width:1px;height:18px;background:rgba(31,30,29,.10);margin:0 2px}',

      '#ann-toolbar select{appearance:none;-webkit-appearance:none;-moz-appearance:none;',
      'background-color:#F5F4ED;',
      'background-image:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2375726B\' stroke-width=\'2.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'><path d=\'m6 9 6 6 6-6\'/></svg>");',
      'background-repeat:no-repeat;background-position:right 9px center;',
      'border:1px solid rgba(31,30,29,.08);',
      'color:#1F1E1D;border-radius:8px;padding:5px 26px 5px 10px;',
      'font-size:12px;font-weight:500;line-height:1.4;',
      'font-family:inherit;cursor:pointer;transition:border-color .15s ease}',
      '#ann-toolbar select:hover{border-color:rgba(31,30,29,.18)}',
      '#ann-toolbar select:focus{outline:none;border-color:#C96442}',
      '#ann-toolbar select::-ms-expand{display:none}',

      // Hover highlight
      '#ann-hover-highlight{position:fixed;z-index:99990;pointer-events:none;',
      'border:1.5px solid #C96442;border-radius:4px;',
      'background:rgba(201,100,66,.04);',
      'transition:all .12s cubic-bezier(.2,.8,.2,1)}',

      // Hover label
      '#ann-hover-label{position:fixed;z-index:99991;pointer-events:none;',
      'background:#1F1E1D;color:#FAF9F5;',
      'padding:5px 10px;border-radius:7px;font-size:11px;font-weight:500;',
      'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;',
      'white-space:nowrap;box-shadow:0 4px 16px rgba(31,30,29,.18)}',

      // Markers — outer wrapper handles position + entry pop only (no visual)
      '.ann-marker{position:absolute;z-index:99992;width:24px;height:24px;',
      'cursor:pointer;overflow:visible;',
      'transform:translate(-50%,-100%);',
      'animation:ann-pop .3s cubic-bezier(.2,.8,.2,1) backwards}',
      // Inner circle — the actual visible pin, scales on hover
      '.ann-marker-circle{cursor:pointer;width:24px;height:24px;border-radius:50%;',
      'background:#C96442;color:#FAF9F5;',
      'font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;',
      'display:flex;align-items:center;justify-content:center;',
      'border:2px solid #FAF9F5;box-sizing:border-box;',
      'box-shadow:0 1px 2px rgba(31,30,29,.10),0 4px 12px rgba(201,100,66,.30);',
      'font-family:ui-sans-serif,-apple-system,system-ui,sans-serif;',
      'transform-origin:center;',
      'transition:transform .2s cubic-bezier(.2,.8,.2,1),box-shadow .2s ease}',
      '.ann-marker .ann-marker-num,.ann-marker .ann-marker-edit{',
      'display:flex;align-items:center;justify-content:center;line-height:1}',
      '.ann-marker .ann-marker-edit{display:none}',
      '.ann-marker .ann-marker-edit svg{width:13px;height:13px;display:block}',
      '@media (hover:hover){.ann-marker:hover .ann-marker-circle{',
      'transform:scale(1.3);',
      'box-shadow:0 2px 4px rgba(31,30,29,.12),0 8px 22px rgba(201,100,66,.42)}',
      '.ann-marker:hover .ann-marker-num{display:none}',
      '.ann-marker:hover .ann-marker-edit{display:flex}}',
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

      // Header (chevron + label) — click to expand path
      '#ann-popup .ann-popup-header{display:flex;align-items:center;gap:6px;',
      'margin-bottom:10px;cursor:pointer;user-select:none;',
      'padding:2px 4px 2px 2px;margin-left:-4px;border-radius:6px;',
      'transition:background .15s ease}',
      '@media (hover:hover){#ann-popup .ann-popup-header:hover{background:#F0EEE6}}',
      '#ann-popup .ann-popup-chevron{width:12px;height:12px;color:#75726B;flex-shrink:0;',
      'transition:transform .2s cubic-bezier(.2,.8,.2,1)}',
      '#ann-popup .ann-popup-header.expanded .ann-popup-chevron{transform:rotate(90deg)}',
      '#ann-popup .ann-popup-label{color:#C96442;font-size:11px;font-weight:600;',
      'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;',
      'display:block;letter-spacing:.01em;overflow:hidden;text-overflow:ellipsis;',
      'white-space:nowrap;flex:1;min-width:0}',
      '#ann-popup .ann-popup-path{display:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;',
      'font-size:10px;color:#75726B;background:#F5F4ED;border:1px solid rgba(31,30,29,.06);',
      'border-radius:7px;padding:6px 9px;margin-bottom:10px;',
      'word-break:break-all;line-height:1.5}',
      '#ann-popup .ann-popup-header.expanded + .ann-popup-path{display:block}',

      '#ann-popup textarea{width:100%;background:#F5F4ED;border:1px solid rgba(31,30,29,.08);',
      'color:#1F1E1D;border-radius:9px;padding:10px 12px;font-size:13px;',
      'font-family:inherit;-webkit-font-smoothing:antialiased;',
      'resize:vertical;min-height:64px;outline:none;line-height:1.55;',
      'transition:border-color .15s ease,background .15s ease}',
      '#ann-popup textarea::placeholder{color:#A8A49B}',
      '#ann-popup textarea:focus{border-color:#C96442;background:#FAF9F5}',

      '#ann-popup .ann-popup-actions{display:flex;gap:6px;margin-top:10px;align-items:center}',
      '#ann-popup .ann-popup-actions .ann-spacer{flex:1}',

      '#ann-popup .ann-popup-actions button{background:transparent;',
      'border:1px solid rgba(31,30,29,.10);',
      'color:#1F1E1D;border-radius:9px;padding:7px 14px;font-size:12px;font-weight:500;',
      'cursor:pointer;font-family:inherit;',
      'transition:background .15s,border-color .15s,transform .1s,color .15s}',
      '@media (hover:hover){#ann-popup .ann-popup-actions button:hover{background:#F0EEE6}}',
      '#ann-popup .ann-popup-actions button:active{transform:scale(.97)}',
      '#ann-popup .ann-popup-actions button.primary{background:#C96442;',
      'color:#FAF9F5;border-color:#C96442}',
      '@media (hover:hover){#ann-popup .ann-popup-actions button.primary:hover{background:#B5573A;border-color:#B5573A}}',
      '#ann-popup .ann-popup-actions button.icon-only{padding:7px;border-color:transparent;color:#75726B}',
      '#ann-popup .ann-popup-actions button.icon-only svg{width:15px;height:15px;display:block}',
      '@media (hover:hover){#ann-popup .ann-popup-actions button.icon-only:hover{',
      'background:rgba(201,100,66,.10);color:#C96442}}',

      // Active cursor
      'body.ann-active{cursor:crosshair !important}',
      'body.ann-active *{cursor:crosshair !important}',
      // Override crosshair on the tool's own UI
      'body.ann-active #ann-toolbar,body.ann-active #ann-toolbar *,',
      'body.ann-active #ann-color-picker,body.ann-active #ann-color-picker *,',
      'body.ann-active #ann-popup,body.ann-active #ann-popup *,',
      'body.ann-active .ann-marker,body.ann-active .ann-marker *{cursor:auto !important}',
      'body.ann-active #ann-toolbar button,body.ann-active #ann-toolbar .ann-color-swatch,',
      'body.ann-active #ann-color-picker .ann-color-opt,',
      'body.ann-active #ann-toolbar.collapsed,body.ann-active .ann-collapsed-view,',
      'body.ann-active #ann-popup button,body.ann-active #ann-popup .ann-popup-header,',
      'body.ann-active .ann-marker{cursor:pointer !important}',
      'body.ann-active #ann-popup textarea{cursor:text !important}',

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

      // Rulers (top + left edge)
      '#ann-ruler-h,#ann-ruler-v{position:fixed;z-index:99988;',
      'background:rgba(250,249,245,.92);backdrop-filter:blur(6px);',
      'pointer-events:auto;cursor:crosshair;',
      'transition:opacity .2s ease}',
      '#ann-ruler-h{top:0;left:20px;right:0;height:20px;',
      'border-bottom:1px solid rgba(31,30,29,.08)}',
      '#ann-ruler-v{top:20px;left:0;bottom:0;width:20px;',
      'border-right:1px solid rgba(31,30,29,.08)}',
      '#ann-ruler-corner{position:fixed;z-index:99989;top:0;left:0;width:20px;height:20px;',
      'background:rgba(250,249,245,.92);backdrop-filter:blur(6px);',
      'border-right:1px solid rgba(31,30,29,.08);',
      'border-bottom:1px solid rgba(31,30,29,.08)}',
      '#ann-ruler-h canvas,#ann-ruler-v canvas{display:block}',

      // Guide lines (dropped from rulers)
      '.ann-guide{position:fixed;z-index:99987;pointer-events:auto}',
      '.ann-guide-h{left:0;right:0;height:1px;cursor:ns-resize}',
      '.ann-guide-v{top:0;bottom:0;width:1px;cursor:ew-resize}',
      // Guide handle (drag affordance + label + close)
      '.ann-guide-handle{position:absolute;display:flex;align-items:center;gap:2px;',
      'background:#FAF9F5;border:1px solid rgba(31,30,29,.10);',
      'border-radius:6px;padding:3px 3px 3px 8px;',
      'box-shadow:0 1px 6px rgba(31,30,29,.10);',
      'cursor:grab;user-select:none;',
      'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;',
      'font-size:10px;font-weight:500;color:#1F1E1D;white-space:nowrap;',
      'font-variant-numeric:tabular-nums;',
      'opacity:0;transition:opacity .15s ease}',
      '.ann-guide:hover .ann-guide-handle,.ann-guide-handle.dragging{opacity:1}',
      '.ann-guide-handle:active{cursor:grabbing}',
      '.ann-guide-h .ann-guide-handle{left:24px;top:50%;transform:translateY(-50%)}',
      '.ann-guide-v .ann-guide-handle{top:24px;left:50%;transform:translateX(-50%)}',
      '.ann-guide-close{background:none;border:none;color:#9A968E;cursor:pointer;',
      'padding:2px;border-radius:4px;display:flex;align-items:center;justify-content:center;',
      'transition:color .12s,background .12s}',
      '@media (hover:hover){.ann-guide-close:hover{background:rgba(31,30,29,.08);color:#1F1E1D}}',
      '.ann-guide-close svg{width:12px;height:12px;display:block}',
      // Wider invisible hit area on the line itself
      '.ann-guide::before{content:"";position:absolute}',
      '.ann-guide-h::before{left:0;right:0;top:-4px;bottom:-4px}',
      '.ann-guide-v::before{top:0;bottom:0;left:-4px;right:-4px}',

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
    // square-pen (toolbar Annotate button + collapsed face)
    pencil: '<svg ' + ICON_ATTRS + '>' +
      '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>' +
      '<path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>' +
      '</svg>',
    // plain pencil (marker hover edit)
    pencilPlain: '<svg ' + ICON_ATTRS + '>' +
      '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>' +
      '<path d="m15 5 4 4"/>' +
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
    // eye
    eye: '<svg ' + ICON_ATTRS + '>' +
      '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/>' +
      '<circle cx="12" cy="12" r="3"/>' +
      '</svg>',
    // eye-off
    eyeOff: '<svg ' + ICON_ATTRS + '>' +
      '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/>' +
      '<path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/>' +
      '<path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/>' +
      '<path d="m2 2 20 20"/>' +
      '</svg>',
    // chevron-right
    chevronRight: '<svg ' + ICON_ATTRS + '>' +
      '<path d="m9 18 6-6-6-6"/>' +
      '</svg>',
    // check-circle filled (for copy success)
    checkCircleFilled: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="10" fill="#22A55A"/>' +
      '<path d="m8.5 12.5 2.5 2.5 4.5-5" fill="none" stroke="#FAF9F5" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>' +
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
  var eyeBtn, eyeIconWrap, eyeBadge, copyBtn;
  var collapsedView, collapsedBadge;
  var colorSwatch, colorPicker;
  var accentSheet;
  var tipEl;

  function darkenHex(hex, amt) {
    var r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amt);
    var g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amt);
    var b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amt);
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  function updateAccentColor(hex) {
    state.markerColor = hex;
    if (colorSwatch) colorSwatch.style.background = hex;

    if (!accentSheet) {
      accentSheet = document.createElement("style");
      accentSheet.id = "ann-accent-styles";
      document.head.appendChild(accentSheet);
    }

    var bg10 = hex + "1A";   // 10%
    var bg42 = hex + "6B";   // 42%
    var dark = darkenHex(hex, 20);

    accentSheet.textContent = [
      "#ann-toolbar button.active{background:" + bg10 + ";color:" + hex + "}",
      "#ann-toolbar .ann-eye-badge{background:" + hex + "}",
      ".ann-collapsed-view{color:" + hex + "}",
      ".ann-collapsed-view .ann-collapsed-badge{background:" + hex + "}",
      ".ann-marker-tip strong{color:" + hex + "}",
      "#ann-popup .ann-popup-label{color:" + hex + "}",
      "#ann-popup .ann-popup-header.expanded .ann-popup-chevron{color:" + hex + "}",
      "#ann-popup textarea:focus{border-color:" + hex + "}",
      "#ann-popup .ann-popup-actions button.primary{background:" + hex + ";border-color:" + hex + "}",
      "#ann-toast svg{color:" + hex + "}",
      "@media (hover:hover){",
      "#ann-popup .ann-popup-actions button.primary:hover{background:" + dark + ";border-color:" + dark + "}",
      "#ann-popup .ann-popup-actions button.icon-only:hover{background:" + bg10 + ";color:" + hex + "}",
      ".ann-marker:hover .ann-marker-circle{box-shadow:0 2px 4px rgba(31,30,29,.12),0 8px 22px " + bg42 + "}}",
    ].join("\n");

    renderMarkers();
  }

  function addTip(target, text, key) {
    target.addEventListener("mouseenter", function () {
      if (!tipEl) return;
      tipEl.innerHTML = escHtml(text) + (key ? '<span class="ann-tip-key">' + escHtml(key) + '</span>' : "");
      var r = target.getBoundingClientRect();
      tipEl.style.left = (r.left + r.width / 2) + "px";
      tipEl.style.top = (r.top - 8) + "px";
      tipEl.style.bottom = "auto";
      // Anchor bottom of tooltip to that top value
      requestAnimationFrame(function () {
        var th = tipEl.offsetHeight;
        tipEl.style.top = (r.top - 8 - th) + "px";
        tipEl.classList.add("show");
      });
    });
    target.addEventListener("mouseleave", function () {
      if (tipEl) tipEl.classList.remove("show");
    });
  }

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
    var altKey = isMac ? "\u2325" : "Alt";

    // Shared tooltip element
    tipEl = el("div", { id: "ann-tip" });
    document.body.appendChild(tipEl);

    // Toggle annotate mode
    var toggleBtn = el("button", {
      onClick: toggleActive
    });
    toggleBtn.id = "ann-toggle-btn";
    toggleBtn.appendChild(iconEl("pencil"));
    toggleBtn.appendChild(document.createTextNode("Annotate"));

    // Color swatch
    colorSwatch = el("div", {
      className: "ann-color-swatch",
      role: "button",
      tabindex: "0",
      "aria-label": "Change marker color"
    });
    colorSwatch.style.background = state.markerColor;
    colorSwatch.addEventListener("click", function (e) { e.stopPropagation(); showColorPicker(); });
    colorSwatch.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showColorPicker(); }
    });

    var divider1 = el("span", { className: "ann-divider" });

    // Eye toggle (markers visibility) with corner count badge
    eyeBtn = el("button", {
      className: "icon-only ann-eye-btn",
      onClick: toggleMarkersVisibility,
      "aria-label": "Show or hide markers"
    });
    eyeIconWrap = el("span", { className: "ann-eye-icon" });
    eyeIconWrap.appendChild(iconEl("eye"));
    eyeBadge = el("span", { className: "ann-eye-badge empty" }, "0");
    eyeBtn.appendChild(eyeIconWrap);
    eyeBtn.appendChild(eyeBadge);

    // Copy
    copyBtn = el("button", {
      className: "icon-only",
      onClick: copyOutput,
      "aria-label": "Copy feedback"
    });
    copyBtn.appendChild(iconEl("copy"));

    // Clear all
    var clearBtn = el("button", {
      className: "icon-only",
      onClick: clearAll,
      "aria-label": "Clear all"
    });
    clearBtn.appendChild(iconEl("trash"));

    var divider3 = el("span", { className: "ann-divider" });

    // Close (collapse toolbar)
    var closeBtn = el("button", {
      className: "icon-only",
      onClick: hideToolbar,
      "aria-label": "Close"
    });
    closeBtn.appendChild(iconEl("x"));

    var toggleKey = (isMac ? "\u2325" : "Alt") + "A";
    var extKey = isMac ? "\u2325\u21E7A" : "Alt+Shift+A";
    addTip(toggleBtn, "Toggle mode", toggleKey);
    addTip(colorSwatch, "Marker color", "M");
    addTip(eyeBtn, "Show/hide markers", "H");
    addTip(copyBtn, "Copy markdown", "C");
    addTip(clearBtn, "Clear all");
    addTip(closeBtn, "Close", extKey);

    toolbar.appendChild(toggleBtn);
    toolbar.appendChild(colorSwatch);
    toolbar.appendChild(divider1);
    toolbar.appendChild(eyeBtn);
    toolbar.appendChild(copyBtn);
    toolbar.appendChild(clearBtn);
    toolbar.appendChild(divider3);
    toolbar.appendChild(closeBtn);

    // Collapsed face — overlay sibling that's revealed when toolbar morphs to round
    collapsedView = el("div", {
      className: "ann-collapsed-view",
      role: "button",
      tabindex: "0",
      title: "Open annotate-html (" + altKey + "+A)",
      "aria-label": "Open annotate toolbar"
    });
    collapsedView.appendChild(iconEl("pencil"));
    collapsedBadge = el("span", { className: "ann-collapsed-badge empty" }, "0");
    collapsedView.appendChild(collapsedBadge);
    collapsedView.addEventListener("click", showToolbar);
    collapsedView.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showToolbar(); }
    });
    toolbar.appendChild(collapsedView);

    document.body.appendChild(toolbar);

    // Create rulers (visible when annotation mode is active)
    createRulers();
  }

  // ═══════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════

  // ═══════════════════════════════════════════
  // Rulers & Guides
  // ═══════════════════════════════════════════

  var rulerH, rulerV, rulerCorner, rulerHCanvas, rulerVCanvas;
  var guides = [];

  function createRulers() {
    rulerCorner = el("div", { id: "ann-ruler-corner" });
    document.body.appendChild(rulerCorner);

    rulerH = el("div", { id: "ann-ruler-h" });
    rulerHCanvas = document.createElement("canvas");
    rulerHCanvas.height = 20;
    rulerH.appendChild(rulerHCanvas);
    initRulerDrag(rulerH, "v");
    document.body.appendChild(rulerH);

    rulerV = el("div", { id: "ann-ruler-v" });
    rulerVCanvas = document.createElement("canvas");
    rulerVCanvas.width = 20;
    rulerV.appendChild(rulerVCanvas);
    initRulerDrag(rulerV, "h");
    document.body.appendChild(rulerV);

    drawRulers();
  }

  function initRulerDrag(rulerEl, guideDir) {
    var preview = null;

    rulerEl.addEventListener("mousedown", function (e) {
      e.preventDefault();
      preview = el("div", { className: "ann-guide ann-guide-" + guideDir });
      preview.style.background = state.markerColor;
      preview.style.opacity = "0.5";
      var lbl = el("span", { className: "ann-guide-label" }, "0px");
      preview.appendChild(lbl);
      document.body.appendChild(preview);

      function onMove(ev) {
        if (!preview) return;
        var pos, pagePos;
        if (guideDir === "h") {
          pos = ev.clientY;
          pagePos = pos + window.scrollY;
          preview.style.top = pos + "px";
        } else {
          pos = ev.clientX;
          pagePos = pos + window.scrollX;
          preview.style.left = pos + "px";
        }
        preview.querySelector(".ann-guide-label").textContent = Math.round(pagePos) + "px";
        // If dragged back onto the ruler, dim it
        var onRuler = guideDir === "h" ? ev.clientX < 20 : ev.clientY < 20;
        preview.style.opacity = onRuler ? "0.2" : "0.5";
      }

      function onUp(ev) {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        if (!preview) return;
        // Check if dropped back on the ruler — cancel
        var onRuler = guideDir === "h" ? ev.clientX < 20 : ev.clientY < 20;
        if (preview.parentNode) preview.parentNode.removeChild(preview);
        preview = null;
        if (onRuler) return;

        var viewPos, pagePos;
        if (guideDir === "h") {
          viewPos = ev.clientY;
          pagePos = viewPos + window.scrollY;
        } else {
          viewPos = ev.clientX;
          pagePos = viewPos + window.scrollX;
        }
        addGuide(guideDir, viewPos, pagePos);
      }

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  function drawRulers() {
    if (!rulerHCanvas || !rulerVCanvas) return;
    var dpr = window.devicePixelRatio || 1;
    var w = window.innerWidth - 20;
    var h = window.innerHeight - 20;
    var sx = window.scrollX;
    var sy = window.scrollY;
    var tickColor = "rgba(31,30,29,.25)";
    var textColor = "rgba(31,30,29,.5)";

    // Horizontal ruler
    rulerHCanvas.width = w * dpr;
    rulerHCanvas.height = 20 * dpr;
    rulerHCanvas.style.width = w + "px";
    rulerHCanvas.style.height = "20px";
    var ctxH = rulerHCanvas.getContext("2d");
    ctxH.scale(dpr, dpr);
    ctxH.font = "9px ui-monospace,SFMono-Regular,Menlo,monospace";
    ctxH.fillStyle = textColor;
    ctxH.strokeStyle = tickColor;
    ctxH.lineWidth = 0.5;
    var startX = Math.floor(sx / 10) * 10;
    for (var px = startX; px < sx + w; px += 10) {
      var x = px - sx;
      var isMajor = px % 100 === 0;
      var isMid = px % 50 === 0;
      ctxH.beginPath();
      ctxH.moveTo(x + 0.5, 20);
      ctxH.lineTo(x + 0.5, isMajor ? 4 : isMid ? 10 : 14);
      ctxH.stroke();
      if (isMajor) {
        ctxH.fillText(String(px), x + 3, 12);
      }
    }

    // Vertical ruler
    rulerVCanvas.width = 20 * dpr;
    rulerVCanvas.height = h * dpr;
    rulerVCanvas.style.width = "20px";
    rulerVCanvas.style.height = h + "px";
    var ctxV = rulerVCanvas.getContext("2d");
    ctxV.scale(dpr, dpr);
    ctxV.font = "9px ui-monospace,SFMono-Regular,Menlo,monospace";
    ctxV.fillStyle = textColor;
    ctxV.strokeStyle = tickColor;
    ctxV.lineWidth = 0.5;
    var startY = Math.floor(sy / 10) * 10;
    for (var py = startY; py < sy + h; py += 10) {
      var y = py - sy;
      var isMajorY = py % 100 === 0;
      var isMidY = py % 50 === 0;
      ctxV.beginPath();
      ctxV.moveTo(20, y + 0.5);
      ctxV.lineTo(isMajorY ? 4 : isMidY ? 10 : 14, y + 0.5);
      ctxV.stroke();
      if (isMajorY) {
        ctxV.save();
        ctxV.translate(12, y + 3);
        ctxV.rotate(-Math.PI / 2);
        ctxV.fillText(String(py), 0, 0);
        ctxV.restore();
      }
    }
  }

  function addGuide(dir, viewPos, pagePos) {
    var guide = el("div", { className: "ann-guide ann-guide-" + dir });
    guide.style[dir === "h" ? "top" : "left"] = viewPos + "px";
    guide.style.background = state.markerColor;
    guide._pagePos = pagePos;
    guide._dir = dir;

    // Handle: drag affordance + px label + close button
    var handle = el("div", { className: "ann-guide-handle" });
    var label = el("span", {}, String(Math.round(pagePos)) + "px");

    var closeBtn = el("button", { className: "ann-guide-close", "aria-label": "Remove guide" });
    closeBtn.appendChild(iconEl("x"));
    closeBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      removeGuide(guide);
    });

    handle.appendChild(label);
    handle.appendChild(closeBtn);
    guide.appendChild(handle);

    // Drag from handle or line to reposition; drag to ruler edge to remove
    function startDrag(e) {
      e.preventDefault();
      e.stopPropagation();
      handle.classList.add("dragging");
      function onMove(ev) {
        var pos, pp;
        if (dir === "h") {
          pos = ev.clientY;
          pp = pos + window.scrollY;
          guide.style.top = pos + "px";
        } else {
          pos = ev.clientX;
          pp = pos + window.scrollX;
          guide.style.left = pos + "px";
        }
        guide._pagePos = pp;
        label.textContent = Math.round(pp) + "px";
        var onRuler = dir === "h" ? ev.clientX < 20 : ev.clientY < 20;
        guide.style.opacity = onRuler ? "0.3" : "1";
      }
      function onUp(ev) {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        handle.classList.remove("dragging");
        var onRuler = dir === "h" ? ev.clientX < 20 : ev.clientY < 20;
        if (onRuler) { removeGuide(guide); return; }
        guide.style.opacity = "1";
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    }

    handle.addEventListener("mousedown", startDrag);
    guide.addEventListener("mousedown", function (e) {
      if (e.target === guide || e.target === guide.querySelector("::before")) startDrag(e);
    });

    document.body.appendChild(guide);
    guides.push(guide);
  }

  function removeGuide(guide) {
    if (guide.parentNode) guide.parentNode.removeChild(guide);
    guides = guides.filter(function (g) { return g !== guide; });
  }

  function updateGuidePositions() {
    guides.forEach(function (g) {
      if (g._dir === "h") {
        g.style.top = (g._pagePos - window.scrollY) + "px";
      } else {
        g.style.left = (g._pagePos - window.scrollX) + "px";
      }
    });
  }

  function clearGuides() {
    guides.forEach(function (g) { if (g.parentNode) g.parentNode.removeChild(g); });
    guides = [];
  }

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

  function hideToolbar() {
    if (!toolbar) return;
    if (state.active) toggleActive();
    closePopup();
    hideHover();
    toolbar.classList.add("collapsed");
    state.toolbarHidden = true;
  }

  function showToolbar() {
    if (!toolbar) return;
    toolbar.classList.remove("collapsed");
    state.toolbarHidden = false;
  }

  function toggleMarkersVisibility() {
    state.markersHidden = !state.markersHidden;
    markersContainer.style.display = state.markersHidden ? "none" : "";
    eyeIconWrap.innerHTML = "";
    eyeIconWrap.appendChild(iconEl(state.markersHidden ? "eyeOff" : "eye"));
    if (state.markersHidden) eyeBtn.classList.add("hidden-state");
    else eyeBtn.classList.remove("hidden-state");
    // Toggle rulers and guides visibility
    if (rulerH) rulerH.style.display = state.markersHidden ? "none" : "";
    if (rulerV) rulerV.style.display = state.markersHidden ? "none" : "";
    if (rulerCorner) rulerCorner.style.display = state.markersHidden ? "none" : "";
    guides.forEach(function (g) {
      g.style.display = state.markersHidden ? "none" : "";
    });
  }

  function updateCount() {
    if (!eyeBadge) return;
    var n = state.annotations.length;
    var prev = parseInt(eyeBadge.textContent, 10) || 0;

    eyeBadge.textContent = n;
    if (n === 0) eyeBadge.classList.add("empty");
    else eyeBadge.classList.remove("empty");

    if (collapsedBadge) {
      collapsedBadge.textContent = n;
      if (n === 0) collapsedBadge.classList.add("empty");
      else collapsedBadge.classList.remove("empty");
    }

    // Pop on increment
    if (n > prev) {
      eyeBadge.classList.remove("bump");
      void eyeBadge.offsetWidth;
      eyeBadge.classList.add("bump");
      if (collapsedBadge) {
        collapsedBadge.classList.remove("bump");
        void collapsedBadge.offsetWidth;
        collapsedBadge.classList.add("bump");
      }
    }
  }

  function showToast(msg) {
    // Replace text node (preserve the icon SVG child)
    var tn = null;
    for (var i = 0; i < toast.childNodes.length; i++) {
      if (toast.childNodes[i].nodeType === 3) { tn = toast.childNodes[i]; break; }
    }
    if (tn) tn.nodeValue = msg || "Copied to clipboard";
    else toast.appendChild(document.createTextNode(msg || "Copied to clipboard"));
    toast.classList.add("show");
    setTimeout(function () { toast.classList.remove("show"); }, 1800);
  }

  function flashCopySuccess() {
    if (!copyBtn) return;
    copyBtn.innerHTML = ICONS.checkCircleFilled;
    copyBtn.classList.add("success");
    setTimeout(function () {
      copyBtn.innerHTML = "";
      copyBtn.appendChild(iconEl("copy"));
      copyBtn.classList.remove("success");
    }, 1500);
  }

  function copyOutput() {
    var md = generateOutput();
    if (!md) { showToast("No annotations"); return; }
    navigator.clipboard.writeText(md).then(function () {
      flashCopySuccess();
      showToast("Copied " + state.annotations.length + " annotation(s)");
    });
  }

  function clearAll() {
    state.annotations = [];
    updateCount();
    renderMarkers();
  }

  // ═══════════════════════════════════════════
  // Color picker
  // ═══════════════════════════════════════════

  function closeColorPicker() {
    if (colorPicker && colorPicker.parentNode) colorPicker.parentNode.removeChild(colorPicker);
    colorPicker = null;
  }

  function showColorPicker() {
    if (colorPicker) { closeColorPicker(); return; }
    colorPicker = el("div", { id: "ann-color-picker" });

    MARKER_COLORS.forEach(function (hex) {
      var opt = el("div", { className: "ann-color-opt" + (hex === state.markerColor ? " active" : "") });
      opt.style.background = hex;
      opt.addEventListener("click", function (e) {
        e.stopPropagation();
        updateAccentColor(hex);
        closeColorPicker();
      });
      colorPicker.appendChild(opt);
    });

    // Position above the swatch
    var swRect = colorSwatch.getBoundingClientRect();
    colorPicker.style.bottom = (window.innerHeight - swRect.top + 8) + "px";
    colorPicker.style.right = (window.innerWidth - swRect.right) + "px";

    document.body.appendChild(colorPicker);
  }

  // ═══════════════════════════════════════════
  // Popup (comment input)
  // ═══════════════════════════════════════════

  function closePopup() {
    if (popup && popup.parentNode) popup.parentNode.removeChild(popup);
    popup = null;
    closeColorPicker();
  }

  function buildPopupHeader(elementName, elementPath) {
    var header = el("div", { className: "ann-popup-header", role: "button", tabindex: "0",
      title: "Show element path" });
    var chev = el("span", { className: "ann-popup-chevron" });
    chev.appendChild(iconEl("chevronRight"));
    var label = el("span", { className: "ann-popup-label" }, elementName);
    header.appendChild(chev);
    header.appendChild(label);
    var path = el("div", { className: "ann-popup-path" }, elementPath || "");
    header.addEventListener("click", function () {
      header.classList.toggle("expanded");
    });
    return { header: header, path: path };
  }

  function positionPopup(x, y) {
    popup.style.left = Math.min(x + 12, window.innerWidth - 400) + "px";
    popup.style.top = Math.min(y + 12, window.innerHeight - 220) + "px";
  }

  function showPopup(x, y, info, rect, selectedText) {
    closePopup();

    var bb = rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;

    popup = el("div", { id: "ann-popup" });

    var hp = buildPopupHeader(info.name, info.path);
    var textarea = el("textarea", { placeholder: "What should change?", rows: "3" });

    var cancelBtn = el("button", { onClick: function () { closePopup(); } }, "Cancel");
    var addBtn = el("button", { className: "primary", onClick: function () {
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
    }}, "Add");

    var actions = el("div", { className: "ann-popup-actions" }, [
      el("span", { className: "ann-spacer" }),
      cancelBtn,
      addBtn,
    ]);

    popup.appendChild(hp.header);
    popup.appendChild(hp.path);
    popup.appendChild(textarea);
    popup.appendChild(actions);

    positionPopup(x, y);
    document.body.appendChild(popup);
    textarea.focus();

    textarea.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addBtn.click();
      if (e.key === "Escape") closePopup();
    });
  }

  function showEditPopup(x, y, index) {
    closePopup();
    var ann = state.annotations[index];
    if (!ann) return;

    popup = el("div", { id: "ann-popup" });

    var hp = buildPopupHeader(ann.element, ann.elementPath);
    var textarea = el("textarea", { placeholder: "What should change?", rows: "3" });
    textarea.value = ann.comment;

    var trashBtn = el("button", {
      className: "icon-only",
      title: "Delete annotation",
      "aria-label": "Delete annotation",
      onClick: function () {
        state.annotations.splice(index, 1);
        updateCount();
        renderMarkers();
        closePopup();
      }
    });
    trashBtn.appendChild(iconEl("trash"));

    var cancelBtn = el("button", { onClick: function () { closePopup(); } }, "Cancel");
    var saveBtn = el("button", { className: "primary", onClick: function () {
      var comment = textarea.value.trim();
      if (!comment) {
        // Empty save = delete
        state.annotations.splice(index, 1);
      } else {
        ann.comment = comment;
      }
      updateCount();
      renderMarkers();
      closePopup();
    }}, "Save");

    var actions = el("div", { className: "ann-popup-actions" }, [
      trashBtn,
      el("span", { className: "ann-spacer" }),
      cancelBtn,
      saveBtn,
    ]);

    popup.appendChild(hp.header);
    popup.appendChild(hp.path);
    popup.appendChild(textarea);
    popup.appendChild(actions);

    positionPopup(x, y);
    document.body.appendChild(popup);
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    textarea.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveBtn.click();
      if (e.key === "Escape") closePopup();
    });
  }

  // ═══════════════════════════════════════════
  // Markers
  // ═══════════════════════════════════════════

  function renderMarkers() {
    markersContainer.innerHTML = "";
    state.annotations.forEach(function (a, i) {
      var marker = el("div", { className: "ann-marker", title: "Click to edit annotation" });
      marker.style.left = a.x + "px";
      marker.style.top = a.y + "px";

      // Inner visible circle — this scales on hover, the wrapper does not
      var circle = el("div", { className: "ann-marker-circle" });
      circle.style.background = state.markerColor;
      circle.style.boxShadow = "0 1px 2px rgba(31,30,29,.10),0 4px 12px " +
        state.markerColor + "4D"; // 30% opacity hex suffix
      var numEl = el("span", { className: "ann-marker-num" }, String(i + 1));
      var editEl = el("span", { className: "ann-marker-edit" });
      editEl.appendChild(iconEl("pencilPlain"));
      circle.appendChild(numEl);
      circle.appendChild(editEl);
      marker.appendChild(circle);

      // Tooltip — sibling of circle so it doesn't scale with it
      var tip = el("div", { className: "ann-marker-tip" });
      tip.innerHTML = "<strong>" + escHtml(a.element) + "</strong><br>" +
        escHtml(a.comment) +
        '<span class="ann-tip-path">' + escHtml(a.elementPath) + '</span>';
      marker.appendChild(tip);

      // Click to edit
      marker.addEventListener("click", function (e) {
        e.stopPropagation();
        e.preventDefault();
        showEditPopup(e.clientX, e.clientY, i);
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
          node.id === "ann-color-picker" || node.id === "ann-tip" ||
          node.id === "ann-ruler-h" || node.id === "ann-ruler-v" ||
          node.id === "ann-ruler-corner" ||
          (node.className && typeof node.className === "string" && node.className.indexOf("ann-guide") !== -1) ||
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
    hoverHighlight.style.borderColor = state.markerColor;
    hoverHighlight.style.background = state.markerColor + "0A";

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
    // Alt+A: bring back hidden toolbar OR toggle annotate mode
    if (e.altKey && (e.code === "KeyA" || (e.key && e.key.toLowerCase() === "a"))) {
      e.preventDefault();
      if (state.toolbarHidden) {
        showToolbar();
        if (!state.active) toggleActive();
      } else {
        toggleActive();
      }
    }
    // Single-key shortcuts (only when no popup/input is focused)
    if (!e.metaKey && !e.ctrlKey && !e.altKey && !popup && !colorPicker &&
        document.activeElement && document.activeElement.tagName !== "TEXTAREA" &&
        document.activeElement.tagName !== "INPUT") {
      var k = e.key.toLowerCase();
      if (k === "c" && state.annotations.length > 0) { e.preventDefault(); copyOutput(); }
      if (k === "m") { e.preventDefault(); showColorPicker(); }
      if (k === "h") { e.preventDefault(); toggleMarkersVisibility(); }
    }
    // Escape to deactivate or close popup
    if (e.key === "Escape") {
      if (colorPicker) { closeColorPicker(); return; }
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
      drawRulers();
      updateGuidePositions();
    }, { passive: true });
    window.addEventListener("resize", function () {
      drawRulers();
    }, { passive: true });

    // Publish a tiny control hook so re-injection (Chrome extension click,
    // second <script> tag, etc.) toggles this instance instead of duplicating.
    window.__annotateHtml = {
      version: 1,
      toggle: function () {
        if (state.toolbarHidden) showToolbar();
        else hideToolbar();
      },
      show: showToolbar,
      hide: hideToolbar
    };
  }

  // Boot when DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
