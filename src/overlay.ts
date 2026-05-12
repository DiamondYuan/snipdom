import { T, dur, ease, reducedMotion, KEYFRAMES } from "./tokens";
import { createSpring, stepSpring } from "./spring";
import { getSelector, getAncestry, getKeyStyles } from "./extract";
import { isSnipdomElement, kbdHint } from "./utils";

interface SelectionData {
  selector: string;
  html: string;
  ancestry: string;
  styles: Record<string, string>;
  tagName: string;
  textContent: string;
}

interface SelectionEntry {
  el: HTMLElement;
  data: SelectionData;
  comment: string;
  badge: HTMLDivElement;
  originalOutline: string;
}

type TimerHandle = ReturnType<typeof setTimeout>;

declare global {
  interface Window {
    __snipdomOverlay?: boolean;
  }
}

function writeClipboard(text: string): void {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
      return;
    }
  } catch {}
  fallbackCopy(text);
}

function fallbackCopy(text: string): void {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    Object.assign(ta.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "1px",
      height: "1px",
      opacity: "0",
      pointerEvents: "none",
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  } catch {}
}

export function initOverlay(): void {
  if (document.getElementById("__snipdom-highlight")) return;

  let inspectMode = false;
  let hoveredElement: HTMLElement | null = null;
  let hintShown = false;

  // --- Keyframes ---
  const style = document.createElement("style");
  style.id = "__snipdom-styles";
  style.textContent = KEYFRAMES;
  document.documentElement.appendChild(style);

  // --- Scale spring (capture pulse only) ---
  const scaleSpring = createSpring(1);
  let scaleAnimating = false;
  let highlightVisible = false;

  function tickScale() {
    const moving = stepSpring(scaleSpring, 160, 0.6, 1 / 60);
    highlight.style.transform = "scale(" + scaleSpring.value.toFixed(4) + ")";
    if (moving) requestAnimationFrame(tickScale);
    else scaleAnimating = false;
  }
  function startScaleSpring() {
    if (!scaleAnimating) {
      scaleAnimating = true;
      requestAnimationFrame(tickScale);
    }
  }

  function positionHighlight(
    top: number,
    left: number,
    width: number,
    height: number,
  ) {
    highlight.style.top = top + "px";
    highlight.style.left = left + "px";
    highlight.style.width = width + "px";
    highlight.style.height = height + "px";
  }

  // --- Highlight ---
  const highlight = document.createElement("div");
  highlight.id = "__snipdom-highlight";
  Object.assign(highlight.style, {
    position: "fixed",
    pointerEvents: "none",
    zIndex: "2147483645",
    border: "1.5px solid " + T.accentBorder,
    backgroundColor: T.accentSoft,
    borderRadius: "3px",
    transition:
      "opacity " +
      dur(80) +
      " ease, border-color " +
      dur(150) +
      " ease, background-color " +
      dur(150) +
      " ease, box-shadow " +
      dur(250) +
      " ease",
    opacity: "0",
    boxShadow: "none",
    transformOrigin: "center center",
  });
  document.documentElement.appendChild(highlight);

  // --- Label ---
  const label = document.createElement("div");
  label.id = "__snipdom-label";
  Object.assign(label.style, {
    position: "fixed",
    pointerEvents: "none",
    zIndex: "2147483646",
    padding: "3px 8px",
    borderRadius: "6px",
    fontFamily: T.mono,
    fontSize: "11px",
    fontWeight: "500",
    letterSpacing: "0.01em",
    color: "#fff",
    backgroundColor: T.accent,
    boxShadow: T.shadowSm,
    opacity: "0",
    transition:
      "opacity " + dur(80) + " ease, transform " + dur(80) + " " + ease,
    transform: "translateY(4px)",
    whiteSpace: "nowrap",
  });
  document.documentElement.appendChild(label);

  // --- Banner ---
  const banner = document.createElement("div");
  banner.id = "__snipdom-toggle";
  // --- Banner positioning: absolute top/left for free drag ---
  let posX = -1;
  let posY = -1;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragPosX = 0;
  let dragPosY = 0;
  const fullTransition = [
    "opacity " + dur(250) + " ease",
    "background-color " + dur(200) + " ease",
    "border-color " + dur(200) + " ease",
    "border-radius " + dur(200) + " ease",
  ].join(", ");

  Object.assign(banner.style, {
    position: "fixed",
    zIndex: "2147483647",
    borderRadius: "20px",
    fontFamily: T.font,
    fontSize: "13px",
    cursor: "grab",
    userSelect: "none",
    boxShadow: T.shadow,
    transition: fullTransition,
    opacity: "0",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
  } as Partial<CSSStyleDeclaration>);
  document.documentElement.appendChild(banner);

  // Track which edge we're snapped to
  let snappedEdge: "left" | "right" | "top" | "bottom" = "bottom";

  function setDefaultPosition() {
    try {
      const saved = sessionStorage.getItem("__snipdom_pos");
      if (saved) {
        const p = JSON.parse(saved) as {
          x: number;
          y: number;
          edge?: typeof snappedEdge;
        };
        posX = p.x;
        posY = p.y;
        snappedEdge = p.edge || "bottom";
        clampPosition();
        applyPosition();
        return;
      }
    } catch {}
    const rect = banner.getBoundingClientRect();
    posX = (window.innerWidth - rect.width) / 2;
    posY = window.innerHeight - rect.height - 8;
    snappedEdge = "bottom";
    applyPosition();
  }

  function savePosition() {
    try {
      sessionStorage.setItem(
        "__snipdom_pos",
        JSON.stringify({ x: posX, y: posY, edge: snappedEdge }),
      );
    } catch {}
  }

  function applyPosition(animate?: boolean) {
    if (animate && !reducedMotion) {
      banner.style.transition =
        fullTransition + ", left 0.25s " + ease + ", top 0.25s " + ease;
    }
    banner.style.left = posX + "px";
    banner.style.top = posY + "px";
    if (animate && !reducedMotion) {
      setTimeout(() => {
        banner.style.transition = fullTransition;
      }, 280);
    }
  }

  function clampPosition() {
    const w = banner.offsetWidth || 26;
    const h = banner.offsetHeight || 26;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const m = 8;
    posX = Math.max(m, Math.min(vw - w - m, posX));
    posY = Math.max(m, Math.min(vh - h - m, posY));
  }

  function snapToEdge(animate?: boolean) {
    const w = banner.offsetWidth || 26;
    const h = banner.offsetHeight || 26;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const m = 8;
    const cx = posX + w / 2;
    const cy = posY + h / 2;
    const distL = cx;
    const distR = vw - cx;
    const distT = cy;
    const distB = vh - cy;
    const min = Math.min(distL, distR, distT, distB);
    if (min === distL) {
      posX = m;
      snappedEdge = "left";
    } else if (min === distR) {
      posX = vw - w - m;
      snappedEdge = "right";
    } else if (min === distT) {
      posY = m;
      snappedEdge = "top";
    } else {
      posY = vh - h - m;
      snappedEdge = "bottom";
    }
    applyPosition(animate);
    savePosition();
  }

  // Entrance
  requestAnimationFrame(() => {
    renderBanner();
    requestAnimationFrame(() => {
      setDefaultPosition();
      banner.style.opacity = "1";
    });
  });

  // --- Drag ---
  function onBannerPointerDown(e: PointerEvent) {
    const target = e.target as Element | null;
    if (target && target.closest("svg")) return;
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragPosX = posX;
    dragPosY = posY;
    banner.style.cursor = "grabbing";
    banner.style.transition = fullTransition;
    e.preventDefault();
    document.addEventListener("pointermove", onBannerPointerMove, true);
    document.addEventListener("pointerup", onBannerPointerUp, true);
  }

  function onBannerPointerMove(e: PointerEvent) {
    if (!isDragging) return;
    posX = dragPosX + (e.clientX - dragStartX);
    posY = dragPosY + (e.clientY - dragStartY);
    clampPosition();
    applyPosition(false);
  }

  function onBannerPointerUp(e: PointerEvent) {
    isDragging = false;
    banner.style.cursor = "grab";

    clampPosition();
    snapToEdge(true);

    document.removeEventListener("pointermove", onBannerPointerMove, true);
    document.removeEventListener("pointerup", onBannerPointerUp, true);

    const dx = Math.abs(e.clientX - dragStartX);
    const dy = Math.abs(e.clientY - dragStartY);
    if (dx > 4 || dy > 4) {
      const suppress = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      banner.addEventListener("click", suppress, {
        once: true,
        capture: true,
      });
    }
  }

  banner.addEventListener("pointerdown", onBannerPointerDown);

  // --- Toast ---
  const toast = document.createElement("div");
  toast.id = "__snipdom-toast";
  Object.assign(toast.style, {
    position: "fixed",
    top: "20px",
    left: "50%",
    transform: "translateX(-50%) translateY(-16px) scale(0.96)",
    zIndex: "2147483647",
    padding: "10px 18px",
    borderRadius: "20px",
    fontFamily: T.font,
    fontSize: "13px",
    fontWeight: "500",
    color: "rgba(250,250,249,0.7)",
    backgroundColor: "rgba(28, 25, 23, 0.9)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    boxShadow: T.shadow,
    opacity: "0",
    transition: "all " + dur(200) + " " + ease,
    pointerEvents: "none",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  } as Partial<CSSStyleDeclaration>);
  document.documentElement.appendChild(toast);

  let toastTimer: TimerHandle | null = null;
  function showToast(tagName: string) {
    if (toastTimer) clearTimeout(toastTimer);
    toast.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="flex-shrink:0">' +
      '<circle cx="8" cy="8" r="7" stroke="' +
      T.success +
      '" stroke-width="1.5"/>' +
      '<path d="M5 8l2 2 4-4" stroke="' +
      T.success +
      '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '<span style="color:rgba(250,250,249,0.9);font-weight:600">Copied</span>' +
      '<span style="color:rgba(250,250,249,0.35);font-family:' +
      T.mono +
      ';font-size:11px">&lt;' +
      tagName +
      "&gt;</span>";
    toast.style.opacity = "1";
    toast.style.transform = "translateX(-50%) translateY(0) scale(1)";
    toastTimer = setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(-50%) translateY(-16px) scale(0.96)";
    }, 1400);
  }

  // --- Onboarding hints (two phases) ---
  const hint = document.createElement("div");
  hint.id = "__snipdom-hint";
  const hintBaseStyle = {
    position: "fixed",
    top: "20px",
    left: "50%",
    transform: "translateX(-50%) translateY(-16px) scale(0.96)",
    zIndex: "2147483647",
    padding: "10px 18px",
    borderRadius: "20px",
    fontFamily: T.font,
    fontSize: "13px",
    color: "rgba(250,250,249,0.7)",
    backgroundColor: "rgba(28, 25, 23, 0.9)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    boxShadow: T.shadow,
    opacity: "0",
    transition: "all " + dur(250) + " " + ease,
    pointerEvents: "none",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    whiteSpace: "nowrap",
  };
  Object.assign(hint.style, hintBaseStyle);
  document.documentElement.appendChild(hint);

  let hintTimer: TimerHandle | null = null;

  function setHintContent(html: string) {
    hint.innerHTML = html;
  }

  function showHintWithContent(html: string, duration?: number) {
    if (hintTimer) {
      clearTimeout(hintTimer);
      hintTimer = null;
    }
    setHintContent(html);
    hint.style.opacity = "1";
    hint.style.transform = "translateX(-50%) translateY(0) scale(1)";
    if (duration) {
      hintTimer = setTimeout(dismissHint, duration);
    }
  }

  function dismissHint() {
    if (hintTimer) {
      clearTimeout(hintTimer);
      hintTimer = null;
    }
    hint.style.opacity = "0";
    hint.style.transform = "translateX(-50%) translateY(-16px) scale(0.96)";
  }

  // Phase 1: Launch hint
  let launchHintShown = false;
  try {
    launchHintShown = sessionStorage.getItem("__snipdom_hint_done") === "1";
  } catch {}
  function showLaunchHint() {
    if (launchHintShown || hintShown) return;
    launchHintShown = true;
    try {
      sessionStorage.setItem("__snipdom_hint_done", "1");
    } catch {}
    showHintWithContent(
      "点击 " +
        '<span style="font-weight:700;color:rgba(250,250,249,0.9)">snipdom</span>' +
        " 按钮开始选取",
      5000,
    );
  }

  // Phase 2: Inspect hint
  try {
    if (sessionStorage.getItem("__snipdom_inspect_done") === "1") hintShown = true;
  } catch {}
  function showInspectHint() {
    if (hintShown) return;
    hintShown = true;
    try {
      sessionStorage.setItem("__snipdom_inspect_done", "1");
    } catch {}
    showHintWithContent(
      '<span style="color:rgba(250,250,249,0.9)">点击</span>元素进行选取' +
        '<span style="opacity:0.25;margin:0 2px">·</span>' +
        kbdHint("Enter") +
        "<span>复制</span>" +
        '<span style="opacity:0.25;margin:0 2px">·</span>' +
        kbdHint("Esc") +
        "<span>退出</span>",
      4000,
    );
  }

  setTimeout(showLaunchHint, reducedMotion ? 100 : 600);

  // --- Banner rendering ---
  function pickIcon(color: string): string {
    return (
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="' +
      color +
      '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;display:block;cursor:pointer">' +
      '<path d="M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z"/>' +
      '<path d="M21 11V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6"/></svg>'
    );
  }

  function renderBanner() {
    const dot = "width:7px;height:7px;border-radius:50%;flex-shrink:0";
    const wm =
      "font-size:13px;font-weight:700;letter-spacing:-0.03em;line-height:15px";
    const row = "display:flex;align-items:center;gap:8px;padding:8px 14px";

    const sendIcon =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;display:block;cursor:pointer">' +
      '<path d="m18 9-6-6-6 6"/><path d="M12 3v14"/><path d="M5 21h14"/></svg>';

    const selCount = selectedElements.length;

    if (inspectMode) {
      banner.style.backgroundColor = "rgba(28, 25, 23, 0.9)";
      banner.style.border = "1px solid rgba(255, 255, 255, 0.1)";
      banner.innerHTML =
        '<div style="' +
        row +
        '">' +
        '<div style="' +
        dot +
        ";background:" +
        T.accent +
        ";" +
        (reducedMotion ? "" : "animation:__snipdom-dot-pulse 2s ease infinite") +
        '"></div>' +
        '<span style="' +
        wm +
        ';color:rgba(250,250,249,0.85)">snipdom</span>' +
        (selCount > 0
          ? '<span id="__snipdom-send" style="display:flex;align-items:center;gap:4px;cursor:pointer;color:' +
            T.success +
            '">' +
            sendIcon +
            "<span style=\"font-size:11px;font-weight:600;font-feature-settings:'tnum'\">" +
            selCount +
            "</span></span>"
          : pickIcon("rgba(250,250,249,0.6)")) +
        "</div>";
      const sendBtn = document.getElementById("__snipdom-send");
      if (sendBtn) {
        sendBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          sendBatch();
        });
      }
    } else {
      banner.style.backgroundColor = "rgba(255, 252, 249, 0.92)";
      banner.style.border = "1px solid rgba(0, 0, 0, 0.08)";
      banner.innerHTML =
        '<div style="' +
        row +
        '">' +
        '<div style="' +
        dot +
        ';background:#d6d3d1"></div>' +
        '<span style="' +
        wm +
        ';color:#292524">snipdom</span>' +
        pickIcon("rgba(41,37,36,0.5)") +
        "</div>";
    }
  }

  // --- Mode toggle ---
  function setInspectMode(enabled: boolean) {
    inspectMode = enabled;
    renderBanner();
    if (enabled) {
      document.documentElement.style.cursor = "crosshair";
      dismissHint();
      showInspectHint();
    } else {
      dismissHint();
      dismissCommentPopover();
      document.documentElement.style.cursor = "";
      highlightVisible = false;
      highlight.style.opacity = "0";
      label.style.opacity = "0";
      label.style.transform = "translateY(4px)";
      hoveredElement = null;
    }
  }

  // --- Multi-select ---
  let selectedElements: SelectionEntry[] = [];

  function createBadge(index: number, el: HTMLElement): HTMLDivElement {
    const badge = document.createElement("div");
    badge.className = "__snipdom-badge";
    Object.assign(badge.style, {
      position: "fixed",
      zIndex: "2147483646",
      width: "18px",
      height: "18px",
      borderRadius: "50%",
      background: T.accent,
      color: "#fff",
      fontFamily: T.mono,
      fontSize: "10px",
      fontWeight: "700",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      boxShadow: T.shadowSm,
      transition:
        "background " + dur(150) + " ease, transform " + dur(100) + " ease",
      pointerEvents: "auto",
    } as Partial<CSSStyleDeclaration>);
    badge.textContent = String(index + 1);
    positionBadge(badge, el);
    document.documentElement.appendChild(badge);

    badge.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const idx = selectedElements.findIndex((s) => s.badge === badge);
      if (idx === -1) return;
      showCommentPopover(idx);
    });

    return badge;
  }

  function positionBadge(badge: HTMLDivElement, el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    const bw = 18;
    const bh = 18;
    const pad = 4;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top = rect.top - bh / 2;
    let left = rect.right - bw / 2;

    if (top < pad) top = rect.top + pad;
    if (left + bw > vw - pad) left = rect.right - bw - pad;
    if (left < pad) left = rect.left + pad;
    if (top + bh > vh - pad) top = rect.bottom - bh - pad;

    badge.style.top = top + "px";
    badge.style.left = left + "px";
  }

  function repositionAllBadges() {
    for (const s of selectedElements) {
      if (s.el && s.badge) positionBadge(s.badge, s.el);
    }
  }

  function renumberBadges() {
    for (let i = 0; i < selectedElements.length; i++) {
      selectedElements[i].badge.textContent = String(i + 1);
    }
  }

  function addSelection(el: HTMLElement) {
    for (let i = 0; i < selectedElements.length; i++) {
      if (selectedElements[i].el === el) {
        deselectElement(i);
        return;
      }
    }

    dismissCommentPopover();

    const html = el.outerHTML;
    const maxLen = 2000;
    const data: SelectionData = {
      selector: getSelector(el),
      html: html.length > maxLen ? html.slice(0, maxLen) + "..." : html,
      ancestry: getAncestry(el),
      styles: getKeyStyles(el),
      tagName: el.tagName.toLowerCase(),
      textContent: (el.textContent || "").trim().slice(0, 200),
    };

    const badge = createBadge(selectedElements.length, el);
    const idx = selectedElements.length;
    selectedElements.push({
      el,
      data,
      comment: "",
      badge,
      originalOutline: el.style.outline,
    });

    el.style.outline = "2px solid " + T.success;

    writeClipboard(location.href + "\n\n" + data.selector + "\n\n" + data.html);

    renderBanner();
    showToast("+" + data.tagName);

    setTimeout(() => {
      showCommentPopover(idx);
    }, 100);

    highlight.style.borderColor = T.success;
    highlight.style.backgroundColor = T.successBg;
    if (!reducedMotion) {
      scaleSpring.value = 1;
      scaleSpring.target = 0.97;
      scaleSpring.velocity = 0;
      startScaleSpring();
      setTimeout(() => {
        scaleSpring.target = 1;
        scaleSpring.velocity = 3;
        startScaleSpring();
      }, 60);
    }
    setTimeout(() => {
      highlight.style.borderColor = T.accentBorder;
      highlight.style.backgroundColor = T.accentSoft;
    }, 350);
  }

  function deselectElement(index: number) {
    const entry = selectedElements[index];
    if (entry.badge) entry.badge.remove();
    if (entry.el) entry.el.style.outline = entry.originalOutline || "";
    selectedElements.splice(index, 1);
    renumberBadges();
    renderBanner();
    dismissCommentPopover();
  }

  function clearAllSelections() {
    for (const s of selectedElements) {
      if (s.badge) s.badge.remove();
      if (s.el) s.el.style.outline = s.originalOutline || "";
    }
    selectedElements = [];
    dismissCommentPopover();
    renderBanner();
  }

  function sendBatch() {
    if (selectedElements.length === 0) return;
    const batch = selectedElements.map((s, i) => ({
      index: i + 1,
      selector: s.data.selector,
      html: s.data.html,
      ancestry: s.data.ancestry,
      styles: s.data.styles,
      tagName: s.data.tagName,
      textContent: s.data.textContent,
      comment: s.comment || null,
    }));
    const count = batch.length;
    const payload = JSON.stringify({
      type: "batch",
      url: location.href,
      selections: batch,
    });
    console.debug("__snipdom__", payload);
    writeClipboard(payload);
    clearAllSelections();
    showToast(count + " 个元素");
    dismissHint();
  }

  // --- Comment popover ---
  const commentPopover = document.createElement("div");
  commentPopover.id = "__snipdom-comment";
  Object.assign(commentPopover.style, {
    position: "fixed",
    zIndex: "2147483647",
    padding: "8px 10px",
    borderRadius: "12px",
    fontFamily: T.font,
    fontSize: "13px",
    backgroundColor: "rgba(28, 25, 23, 0.92)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    boxShadow: T.shadow,
    opacity: "0",
    transition: "all " + dur(150) + " " + ease,
    pointerEvents: "none",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    display: "flex",
    alignItems: "flex-end",
    gap: "6px",
  } as Partial<CSSStyleDeclaration>);

  const commentInput = document.createElement("textarea");
  Object.assign(commentInput.style, {
    background: "transparent",
    border: "none",
    outline: "none",
    color: "rgba(250,250,249,0.9)",
    fontFamily: T.font,
    fontSize: "13px",
    width: "200px",
    minHeight: "20px",
    maxHeight: "80px",
    padding: "0",
    resize: "none",
    lineHeight: "1.4",
    overflow: "hidden",
  } as Partial<CSSStyleDeclaration>);
  commentInput.placeholder = "添加备注...";
  commentInput.rows = 1;
  commentInput.addEventListener("input", () => {
    commentInput.style.height = "auto";
    commentInput.style.height = Math.min(commentInput.scrollHeight, 80) + "px";
  });

  const commentActions = document.createElement("div");
  Object.assign(commentActions.style, {
    display: "flex",
    gap: "2px",
    flexShrink: "0",
  } as Partial<CSSStyleDeclaration>);

  function makeActionBtn(
    svgPath: string,
    color: string,
    onClick: () => void,
  ): HTMLDivElement {
    const btn = document.createElement("div");
    Object.assign(btn.style, {
      width: "22px",
      height: "22px",
      borderRadius: "4px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      transition: "background " + dur(100) + " ease",
    } as Partial<CSSStyleDeclaration>);
    btn.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="' +
      color +
      '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
      svgPath +
      "</svg>";
    btn.addEventListener("mouseenter", () => {
      btn.style.background = "rgba(250,250,249,0.1)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "transparent";
    });
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  const confirmBtn = makeActionBtn(
    '<polyline points="20 6 9 17 4 12"/>',
    T.success,
    () => {
      dismissCommentPopover();
    },
  );
  const cancelBtn = makeActionBtn(
    '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    "rgba(250,250,249,0.4)",
    () => {
      commentInput.value = "";
      dismissCommentPopover();
    },
  );

  commentActions.appendChild(confirmBtn);
  commentActions.appendChild(cancelBtn);
  commentPopover.appendChild(commentInput);
  commentPopover.appendChild(commentActions);
  document.documentElement.appendChild(commentPopover);

  let commentTarget = -1;

  function showCommentPopover(index: number) {
    commentTarget = index;
    const entry = selectedElements[index];
    if (!entry) return;
    const rect = entry.badge.getBoundingClientRect();
    commentPopover.style.top = rect.bottom + 8 + "px";
    commentPopover.style.left = rect.left + "px";
    const vw = window.innerWidth;
    const popW = 250;
    if (rect.left + popW > vw - 12) {
      commentPopover.style.left = vw - popW - 12 + "px";
    }
    commentInput.value = entry.comment || "";
    commentInput.style.height = "auto";
    commentPopover.style.opacity = "1";
    commentPopover.style.pointerEvents = "auto";
    setTimeout(() => {
      commentInput.focus();
      if (commentInput.value) {
        commentInput.style.height =
          Math.min(commentInput.scrollHeight, 80) + "px";
      }
    }, 50);
  }

  function dismissCommentPopover() {
    if (commentTarget >= 0 && commentTarget < selectedElements.length) {
      const val = commentInput.value.trim();
      selectedElements[commentTarget].comment = val;
      if (val && selectedElements[commentTarget].badge) {
        selectedElements[commentTarget].badge.style.background = T.success;
      } else if (selectedElements[commentTarget].badge) {
        selectedElements[commentTarget].badge.style.background = T.accent;
      }
    }
    commentTarget = -1;
    commentPopover.style.opacity = "0";
    commentPopover.style.pointerEvents = "none";
    commentInput.blur();
  }

  commentInput.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      dismissCommentPopover();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      commentInput.value = "";
      dismissCommentPopover();
    }
  });

  commentPopover.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  // --- Helpers ---
  function getElementUnderCursor(e: MouseEvent): Element | null {
    const prev = highlight.style.display;
    highlight.style.display = "none";
    const badgeDisplays: string[] = [];
    for (const s of selectedElements) {
      const b = s.badge;
      if (b) {
        badgeDisplays.push(b.style.display);
        b.style.display = "none";
      }
    }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    highlight.style.display = prev;
    for (let j = 0; j < selectedElements.length; j++) {
      const b2 = selectedElements[j].badge;
      if (b2 && badgeDisplays[j] !== undefined)
        b2.style.display = badgeDisplays[j];
    }
    return el;
  }

  // --- Events ---
  function onMouseMove(e: MouseEvent) {
    if (!inspectMode || isDragging) return;
    const el = getElementUnderCursor(e);
    if (!el || isSnipdomElement(el)) {
      if (highlightVisible) {
        highlightVisible = false;
        highlight.style.opacity = "0";
        label.style.opacity = "0";
        label.style.transform = "translateY(4px)";
      }
      hoveredElement = null;
      return;
    }

    hoveredElement = el as HTMLElement;
    const rect = el.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);

    positionHighlight(rect.top, rect.left, rect.width, rect.height);
    highlight.style.opacity = "1";
    highlightVisible = true;

    const tag = el.tagName.toLowerCase();
    const id = el.id ? "#" + el.id : "";
    const cls =
      !id && el.className && typeof el.className === "string"
        ? "." +
          el.className
            .trim()
            .split(/\s+/)
            .filter((c) => !c.startsWith("__snipdom"))
            .slice(0, 2)
            .join(".")
        : "";
    label.innerHTML =
      '<span style="font-weight:600">' +
      tag +
      id +
      cls +
      "</span>" +
      "<span style=\"opacity:0.5;font-weight:400;margin-left:6px;font-feature-settings:'tnum'\">" +
      w +
      "×" +
      h +
      "</span>";

    const labelH = 24;
    const gap = 6;
    let labelTop = rect.top - labelH - gap;
    if (labelTop < 4) labelTop = rect.bottom + gap;
    Object.assign(label.style, {
      opacity: "1",
      transform: "translateY(0)",
      top: labelTop + "px",
      left: rect.left + "px",
    });
  }

  function onClick(e: MouseEvent) {
    if (!inspectMode) return;
    if (isSnipdomElement(e.target as Element | null)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const el = getElementUnderCursor(e);
    if (!el || isSnipdomElement(el)) return;
    addSelection(el as HTMLElement);
    dismissHint();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (document.activeElement === commentInput) return;

    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "x") {
      e.preventDefault();
      setInspectMode(!inspectMode);
      return;
    }
    if (e.key === "Enter" && inspectMode && selectedElements.length > 0) {
      e.preventDefault();
      sendBatch();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (inspectMode) {
        clearAllSelections();
        setInspectMode(false);
      }
    }
  }

  // --- Exit ---
  // Kept for parity with the original; not wired to a UI affordance.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function _animateExit() {
    document.documentElement.style.cursor = "";
    banner.style.opacity = "0";
    highlight.style.opacity = "0";
    highlightVisible = false;
    label.style.opacity = "0";
    toast.style.opacity = "0";
    setTimeout(
      () => {
        console.debug("__snipdom__", JSON.stringify({ type: "close" }));
        cleanup();
      },
      reducedMotion ? 0 : 250,
    );
  }

  function cleanup() {
    style.remove();
    highlight.remove();
    label.remove();
    banner.remove();
    toast.remove();
    hint.remove();
    commentPopover.remove();
    clearAllSelections();
    document.documentElement.style.cursor = "";
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("scroll", onScroll, true);
    document.removeEventListener("pointermove", onBannerPointerMove, true);
    document.removeEventListener("pointerup", onBannerPointerUp, true);
    window.__snipdomOverlay = false;
  }

  function onScroll() {
    if (!inspectMode) return;
    if (highlightVisible && hoveredElement) {
      const rect = hoveredElement.getBoundingClientRect();
      positionHighlight(rect.top, rect.left, rect.width, rect.height);
      const labelH = 24;
      const gap = 6;
      let labelTop = rect.top - labelH - gap;
      if (labelTop < 4) labelTop = rect.bottom + gap;
      label.style.top = labelTop + "px";
      label.style.left = rect.left + "px";
    }
    repositionAllBadges();
  }

  banner.addEventListener("click", (e) => {
    e.stopPropagation();
    setInspectMode(!inspectMode);
  });
  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("scroll", onScroll, true);
}
