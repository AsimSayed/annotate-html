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
      // Toolbar
      '#ann-toolbar{position:fixed;bottom:24px;right:24px;z-index:99999;',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;',
      'font-size:13px;display:flex;align-items:center;gap:6px;',
      'background:rgba(20,22,30,.92);backdrop-filter:blur(16px);',
      'color:#e4e8f0;padding:6px 8px;border-radius:14px;',
      'border:1px solid rgba(255,255,255,.1);',
      'box-shadow:0 8px 32px rgba(0,0,0,.35);',
      'transition:transform .35s cubic-bezier(.34,1.56,.64,1),opacity .2s;',
      'user-select:none}',

      '#ann-toolbar.hidden{transform:translateY(20px) scale(.95);opacity:0;pointer-events:none}',

      '#ann-toolbar button{background:none;border:none;color:#9ba2b4;cursor:pointer;',
      'padding:6px 8px;border-radius:8px;font-size:12px;font-family:inherit;',
      'transition:background .15s,color .15s;display:flex;align-items:center;gap:5px;',
      'white-space:nowrap}',
      '#ann-toolbar button:hover{background:rgba(255,255,255,.08);color:#e4e8f0}',
      '#ann-toolbar button.active{background:rgba(74,124,236,.15);color:#6ea8ff}',

      '#ann-toolbar .ann-badge{background:rgba(74,124,236,.2);color:#6ea8ff;',
      'border-radius:100px;padding:1px 7px;font-size:11px;font-weight:600;min-width:18px;text-align:center}',

      '#ann-toolbar .ann-divider{width:1px;height:20px;background:rgba(255,255,255,.1);margin:0 2px}',

      '#ann-toolbar select{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);',
      'color:#9ba2b4;border-radius:6px;padding:3px 6px;font-size:11px;font-family:inherit;cursor:pointer}',
      '#ann-toolbar select:focus{outline:none;border-color:rgba(74,124,236,.4)}',

      // Hover highlight
      '#ann-hover-highlight{position:fixed;z-index:99990;pointer-events:none;',
      'border:2px solid rgba(74,124,236,.6);border-radius:4px;',
      'background:rgba(74,124,236,.06);',
      'transition:all .1s ease}',

      // Hover label
      '#ann-hover-label{position:fixed;z-index:99991;pointer-events:none;',
      'background:rgba(20,22,30,.92);backdrop-filter:blur(12px);color:#e4e8f0;',
      'padding:4px 10px;border-radius:8px;font-size:11px;font-family:monospace;',
      'border:1px solid rgba(255,255,255,.1);white-space:nowrap;',
      'box-shadow:0 4px 16px rgba(0,0,0,.3)}',

      // Markers
      '.ann-marker{position:absolute;z-index:99992;width:22px;height:22px;',
      'border-radius:50%;background:rgba(74,124,236,.9);color:#fff;',
      'font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;',
      'cursor:pointer;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);',
      'font-family:-apple-system,system-ui,sans-serif;overflow:visible;',
      'transform:translate(-50%,-100%);',
      'transition:transform .3s cubic-bezier(.34,1.56,.64,1);',
      'animation:ann-pop .35s cubic-bezier(.34,1.56,.64,1) both}',
      '.ann-marker:hover{transform:translate(-50%,-100%) scale(1.2)}',
      '@keyframes ann-pop{from{transform:translate(-50%,-100%) scale(0);opacity:0}to{transform:translate(-50%,-100%) scale(1);opacity:1}}',

      // Marker tooltip
      '.ann-marker-tip{position:absolute;left:28px;top:50%;transform:translateY(-50%);',
      'background:rgba(20,22,30,.95);backdrop-filter:blur(12px);color:#e4e8f0;',
      'padding:8px 12px;border-radius:10px;font-size:12px;min-width:180px;max-width:320px;',
      'border:1px solid rgba(255,255,255,.1);box-shadow:0 8px 24px rgba(0,0,0,.3);',
      'pointer-events:none;white-space:normal;line-height:1.5;',
      'opacity:0;transition:opacity .15s}',
      '.ann-marker:hover .ann-marker-tip{opacity:1}',
      '.ann-marker-tip strong{color:#6ea8ff;font-weight:600}',
      '.ann-marker-tip .ann-tip-path{color:#5c6274;font-family:monospace;font-size:10px;',
      'margin-top:4px;display:block}',

      // Popup (comment input)
      '#ann-popup{position:fixed;z-index:99998;background:rgba(20,22,30,.95);',
      'backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.12);',
      'border-radius:14px;padding:12px;min-width:280px;max-width:360px;',
      'box-shadow:0 16px 48px rgba(0,0,0,.4);',
      'animation:ann-popup-in .25s cubic-bezier(.34,1.56,.64,1) both}',
      '@keyframes ann-popup-in{from{transform:scale(.92) translateY(8px);opacity:0}',
      'to{transform:scale(1) translateY(0);opacity:1}}',

      '#ann-popup .ann-popup-label{color:#6ea8ff;font-size:11px;font-family:monospace;',
      'margin-bottom:8px;display:block}',

      '#ann-popup textarea{width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);',
      'color:#e4e8f0;border-radius:8px;padding:8px 10px;font-size:13px;font-family:inherit;',
      'resize:vertical;min-height:60px;outline:none;line-height:1.5}',
      '#ann-popup textarea:focus{border-color:rgba(74,124,236,.5)}',

      '#ann-popup .ann-popup-actions{display:flex;gap:6px;margin-top:8px;justify-content:flex-end}',

      '#ann-popup .ann-popup-actions button{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);',
      'color:#9ba2b4;border-radius:8px;padding:6px 14px;font-size:12px;cursor:pointer;',
      'font-family:inherit;transition:all .15s}',
      '#ann-popup .ann-popup-actions button:hover{background:rgba(255,255,255,.1);color:#e4e8f0}',
      '#ann-popup .ann-popup-actions button.primary{background:rgba(74,124,236,.2);',
      'color:#6ea8ff;border-color:rgba(74,124,236,.3)}',
      '#ann-popup .ann-popup-actions button.primary:hover{background:rgba(74,124,236,.3)}',

      // Active cursor
      'body.ann-active{cursor:crosshair !important}',
      'body.ann-active *{cursor:crosshair !important}',

      // Copied toast
      '#ann-toast{position:fixed;top:24px;left:50%;transform:translateX(-50%) translateY(-20px);',
      'z-index:99999;background:rgba(22,163,74,.9);color:#fff;padding:8px 20px;',
      'border-radius:100px;font-size:13px;font-weight:600;font-family:-apple-system,system-ui,sans-serif;',
      'opacity:0;transition:all .3s cubic-bezier(.34,1.56,.64,1);pointer-events:none}',
      '#ann-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}',
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
    toast = el("div", { id: "ann-toast" }, "Copied to clipboard");
    document.body.appendChild(toast);

    // Build toolbar
    toolbar = el("div", { id: "ann-toolbar" });

    var isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    var toggleBtn = el("button", { onClick: toggleActive, title: "Toggle annotation mode (" + (isMac ? "\u2325" : "Alt") + "+A)" }, "\u270e Annotate");
    toggleBtn.id = "ann-toggle-btn";

    var divider1 = el("span", { className: "ann-divider" });

    var badge = el("span", { className: "ann-badge", id: "ann-count" }, "0");

    var detailSelect = el("select", { title: "Output detail level", onChange: function (e) { state.detailLevel = e.target.value; } });
    ["compact", "standard", "detailed", "forensic"].forEach(function (v) {
      var opt = el("option", { value: v }, v.charAt(0).toUpperCase() + v.slice(1));
      if (v === state.detailLevel) opt.selected = true;
      detailSelect.appendChild(opt);
    });

    var copyBtn = el("button", { onClick: copyOutput, title: "Copy annotations as markdown" }, "\u2398 Copy");
    var clearBtn = el("button", { onClick: clearAll, title: "Clear all annotations" }, "\u2715 Clear");

    var divider2 = el("span", { className: "ann-divider" });

    toolbar.appendChild(toggleBtn);
    toolbar.appendChild(divider1);
    toolbar.appendChild(badge);
    toolbar.appendChild(detailSelect);
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
    if (badge) badge.textContent = state.annotations.length;
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
