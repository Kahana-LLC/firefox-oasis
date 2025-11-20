import { runAssistantStream, resetAssistantSession } from "./assistant.bundle.js";

window.__OASIS_DEBUG__ = true;
console.debug('[DEBUG] assistant.ui.js loaded');

// Import voice input service - it will be bundled
let voiceInputService = null;
try {
  // The voice input service will be available in the bundle
  voiceInputService = window.voiceInputService;
} catch (e) {
  console.warn("Voice input service not available:", e);
}

// SupabaseAuth should be available from the bundle
// The bundle now exposes window.supabaseAuth directly
console.log('SupabaseAuth available:', !!window.supabaseAuth);

// Check current authentication status on page load
async function checkCurrentAuthStatus() {
  if (window.supabaseAuth && window.supabaseAuth.supabase) {
    try {
      const { data: { user }, error } = await window.supabaseAuth.supabase.auth.getUser();
      if (user && !error) {
        console.log('User is already authenticated:', user.email);
        updateAuthUI(true, user);
      } else {
        console.log('User is not authenticated');
        updateAuthUI(false);
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      updateAuthUI(false);
    }
  }
}

// Check auth status after a short delay to ensure everything is loaded
setTimeout(checkCurrentAuthStatus, 1000);

const log = document.getElementById("log");
const q = document.getElementById("q");
const go = document.getElementById("go");

// Theme setup (primary accent: #2c532d)
const THEME = {
  primary: "#2c532d",
  primaryText: "#ffffff",
  assistantBg: "#F3FAF5",
  surface: "#F0F6F1",
  border: "#E5E7EB",
  softText: "#6B7280",
  hardText: "#111827"
};

function applyTheme() {
  const root = document.documentElement;
  root.style.setProperty("--oasis-primary", THEME.primary);
  root.style.setProperty("--oasis-primary-text", THEME.primaryText);
  root.style.setProperty("--oasis-assistant-card-bg", THEME.assistantBg);
  root.style.setProperty("--oasis-surface", THEME.surface);
  root.style.setProperty("--oasis-border", THEME.border);
  root.style.setProperty("--oasis-soft-text", THEME.softText);
  root.style.setProperty("--oasis-hard-text", THEME.hardText);
}
applyTheme();

// Utility: shade a hex color by percentage (negative to darken)
function shadeColor(hex, percent) {
  try {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const f = 1 + (percent / 100);
    const toHex = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    return `#${toHex(r * f)}${toHex(g * f)}${toHex(b * f)}`;
  } catch {
    return hex;
  }
}

// Enhance the main log area into a card-based feed container
let feed = null;
let tasksPanel = null;
let tasksState = [];
let header = null;
// Make the whole assistant UI float and draggable
function enableFloatingPanel() {
  const main = document.querySelector("main");
  if (!main || main.dataset.floating === "1") return;

  // Create overlay container
  const overlay = document.createElement("div");
  overlay.id = "assistantOverlay";
  overlay.style.cssText = `
    position: fixed;
    top: 96px;
    right: 24px;
    width: min(90vw, 760px);
    max-width: 90vw;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    background: var(--oasis-surface);
    border: 1px solid var(--oasis-border);
    border-radius: 14px;
    box-shadow: 0 20px 40px rgba(0,0,0,0.25);
    overflow: hidden;
    z-index: 2147483646;
  `;

  // Mount into document and move the existing main inside
  document.body.appendChild(overlay);
  overlay.appendChild(main);
  main.dataset.floating = "1";
  // Tidy main within overlay
  main.style.height = "100%";
  main.style.display = "flex";
  main.style.flexDirection = "column";
  main.style.margin = "0";
  main.style.width = "100%";

  // Make log scrollable with reasonable height
  const logEl = document.getElementById("log");
  if (logEl) {
    logEl.style.flex = "1 1 auto";
    logEl.style.height = "auto";
    logEl.style.overflow = "auto";
  }

  // Restore previous position if any
  try {
    const saved = JSON.parse(localStorage.getItem("assistantOverlayPos") || "{}");
    if (Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
      overlay.style.left = `${saved.left}px`;
      overlay.style.top = `${saved.top}px`;
      overlay.style.right = "auto";
    }
  } catch { }

  // Restore saved size, if available
  try {
    const savedSize = JSON.parse(localStorage.getItem("assistantOverlaySize") || "{}");
    if (Number.isFinite(savedSize.width)) overlay.style.width = `${savedSize.width}px`;
    if (Number.isFinite(savedSize.height)) overlay.style.height = `${savedSize.height}px`;
  } catch { }

  // Dragging support (use header if available, fall back to overlay)
  const getHandle = () => document.getElementById("oasis-header") || overlay;
  let handle = getHandle();
  if (handle) handle.style.cursor = "grab";

  let dragging = false;
  let startX = 0, startY = 0, startLeft = 0, startTop = 0;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const onDown = (e) => {
    // Disable dragging in fullscreen mode
    if (overlay.dataset.fullscreen === "1") return;
    // Ignore clicks on interactive header buttons
    if (e.target.closest && e.target.closest("button")) return;
    dragging = true;
    const rect = overlay.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    const touch = e.touches && e.touches[0];
    startX = touch ? touch.clientX : e.clientX;
    startY = touch ? touch.clientY : e.clientY;
    overlay.style.right = "auto";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onUp);
    if (handle) handle.style.cursor = "grabbing";
  };
  const onMove = (e) => {
    if (!dragging) return;
    const touch = e.touches && e.touches[0];
    const x = touch ? touch.clientX : e.clientX;
    const y = touch ? touch.clientY : e.clientY;
    if (x == null || y == null) return;
    const dx = x - startX;
    const dy = y - startY;
    const left = clamp(startLeft + dx, 0, window.innerWidth - overlay.offsetWidth);
    const top = clamp(startTop + dy, 0, window.innerHeight - Math.min(overlay.offsetHeight, window.innerHeight));
    overlay.style.left = `${left}px`;
    overlay.style.top = `${top}px`;
    overlay.style.right = "auto";
    e.preventDefault();
  };
  const onUp = () => {
    dragging = false;
    if (handle) handle.style.cursor = "grab";
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    document.removeEventListener("touchmove", onMove);
    document.removeEventListener("touchend", onUp);
    try {
      const rect = overlay.getBoundingClientRect();
      localStorage.setItem("assistantOverlayPos", JSON.stringify({ left: rect.left, top: rect.top }));
    } catch { }
  };

  // Attach listeners
  handle.addEventListener("mousedown", onDown);
  handle.addEventListener("touchstart", onDown, { passive: true });

  // Double-click header to toggle compact/expanded width
  handle.addEventListener("dblclick", () => {
    if (overlay.dataset.fullscreen === "1") return; // disable in fullscreen
    const current = overlay.getBoundingClientRect().width;
    const expanded = Math.min(window.innerWidth * 0.9, 760);
    const compact = 420;
    const target = current < (expanded - 40) ? expanded : compact;
    overlay.style.width = `${target}px`;
    try { localStorage.setItem("assistantOverlaySize", JSON.stringify({ width: target, height: overlay.getBoundingClientRect().height })); } catch { }
  });

  // Resize handle (bottom-right corner)
  const grip = document.createElement("div");
  grip.title = "Drag to resize";
  grip.style.cssText = `
    position: absolute;
    right: 8px;
    bottom: 8px;
    width: 14px; height: 14px;
    border-right: 2px solid var(--oasis-border);
    border-bottom: 2px solid var(--oasis-border);
    opacity: .8;
    cursor: nwse-resize;
  `;
  overlay.appendChild(grip);

  let resizing = false;
  let startW = 0, startH = 0;
  const onResizeStart = (e) => {
    // Disable resizing in fullscreen mode
    if (overlay.dataset.fullscreen === "1") return;
    resizing = true;
    const rect = overlay.getBoundingClientRect();
    startW = rect.width;
    startH = rect.height;
    const touch = e.touches && e.touches[0];
    startX = touch ? touch.clientX : e.clientX;
    startY = touch ? touch.clientY : e.clientY;
    document.addEventListener("mousemove", onResizing);
    document.addEventListener("mouseup", onResizeEnd);
    document.addEventListener("touchmove", onResizing, { passive: false });
    document.addEventListener("touchend", onResizeEnd);
    e.preventDefault();
  };
  const onResizing = (e) => {
    if (!resizing) return;
    const touch = e.touches && e.touches[0];
    const x = touch ? touch.clientX : e.clientX;
    const y = touch ? touch.clientY : e.clientY;
    const dx = x - startX;
    const dy = y - startY;
    const minW = 360, minH = 240;
    const maxW = Math.floor(window.innerWidth * 0.95);
    const maxH = Math.floor(window.innerHeight * 0.95);
    const w = clamp(startW + dx, minW, maxW);
    const h = clamp(startH + dy, minH, maxH);
    overlay.style.width = `${w}px`;
    overlay.style.height = `${h}px`;
    e.preventDefault();
  };
  const onResizeEnd = () => {
    resizing = false;
    document.removeEventListener("mousemove", onResizing);
    document.removeEventListener("mouseup", onResizeEnd);
    document.removeEventListener("touchmove", onResizing);
    document.removeEventListener("touchend", onResizeEnd);
    try {
      const rect = overlay.getBoundingClientRect();
      localStorage.setItem("assistantOverlaySize", JSON.stringify({ width: rect.width, height: rect.height }));
    } catch { }
  };

  // Toggle fullscreen when clicking the expand button in the header
  const expandBtn = document.querySelector('#oasis-header button[aria-label="Expand"]');
  if (expandBtn) {
    expandBtn.addEventListener('click', () => {
      const isFull = overlay.dataset.fullscreen === "1";
      if (!isFull) {
        overlay.dataset.fullscreen = "1";
        // Cover the entire viewport with a dark scrim
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.right = '0';
        overlay.style.bottom = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.background = 'var(--oasis-surface)';
        overlay.style.border = '0';
        overlay.style.borderRadius = '0';
        overlay.style.boxShadow = 'none';
        overlay.style.zIndex = '2147483646';

        // Center the assistant card inside the scrim
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.padding = '0 24px';

        // Style the main container like a modal card
        main.style.margin = 'auto';
        main.style.maxWidth = '760px';
        main.style.width = 'min(760px, 95vw)';
        main.style.maxHeight = '90vh';
        main.style.borderRadius = '14px';
        main.style.boxShadow = '0 20px 40px rgba(0,0,0,0.40)';
      } else {
        overlay.dataset.fullscreen = "0";
        // Restore original floating panel styles
        overlay.style.top = '96px';
        overlay.style.right = '24px';
        overlay.style.left = 'auto';
        overlay.style.bottom = 'auto';
        overlay.style.width = 'min(90vw, 760px)';
        overlay.style.height = '';
        overlay.style.background = 'var(--oasis-surface)';
        overlay.style.border = '1px solid var(--oasis-border)';
        overlay.style.borderRadius = '14px';
        overlay.style.boxShadow = '0 20px 40px rgba(0,0,0,0.25)';
        overlay.style.display = 'flex';
        overlay.style.alignItems = '';
        overlay.style.justifyContent = '';
        overlay.style.padding = '';

        main.style.margin = '0';
        main.style.maxWidth = '';
        main.style.width = '100%';
        main.style.maxHeight = '';
        main.style.borderRadius = '';
        main.style.boxShadow = '';
      }
    });
  }
  grip.addEventListener("mousedown", onResizeStart);
  grip.addEventListener("touchstart", onResizeStart, { passive: false });

  // If header is added later, update handle
  const mo = new MutationObserver(() => {
    const maybe = getHandle();
    if (maybe !== handle) {
      // Detach from old
      if (handle) {
        handle.removeEventListener("mousedown", onDown);
        handle.removeEventListener("touchstart", onDown);
      }
      handle = maybe;
      if (handle) {
        handle.style.cursor = "grab";
        handle.addEventListener("mousedown", onDown);
        handle.addEventListener("touchstart", onDown, { passive: true });
      }
    }
  });
  mo.observe(main, { childList: true, subtree: true });
}
function initFeed() {
  if (!log) return;
  log.innerHTML = "";
  log.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    background: var(--oasis-feed-bg, transparent);
  `;

  // Header block similar to screenshot
  header = document.createElement("div");
  header.id = "oasis-header";
  header.style.cssText = `
    display:flex; align-items:center; justify-content:space-between;
    background: var(--oasis-surface);
    border: 1px solid var(--oasis-border);
    border-radius: 12px; padding: 10px 12px; margin-bottom: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  `;
  // Allow absolute-positioned dropdowns relative to header
  header.style.position = "relative";
  const left = document.createElement("div");
  left.style.cssText = "display:flex; align-items:center; gap:10px;";
  const avatar = document.createElement("div");
  avatar.textContent = "S";
  avatar.style.cssText = `width:28px; height:28px; border-radius:999px; display:flex; align-items:center; justify-content:center; background: var(--oasis-primary); color: var(--oasis-primary-text); font-weight:700;`;
  const title = document.createElement("div");
  title.textContent = "Sloth AI";
  title.style.cssText = "color: var(--oasis-hard-text); font-weight:700;";
  left.appendChild(avatar);
  left.appendChild(title);
  const debugBadge = document.createElement("span");
  debugBadge.textContent = "DEBUG";
  debugBadge.style.cssText = "margin-left:8px; padding:2px 8px; border-radius:999px; background:#dc2626; color:#fff; font-size:11px; font-weight:700;";
  left.appendChild(debugBadge);

  const right = document.createElement("div");
  right.style.cssText = "display:flex; align-items:center; gap:12px; color: var(--oasis-soft-text);";
  // Consistent SVG icon buttons: profile, bell, settings, close
  function svgFor(type) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    // 1.3x original size (18 -> ~24)
    svg.setAttribute("width", "24");
    svg.setAttribute("height", "24");
    svg.style.cssText = "display:block; color:currentColor;";

    const NS = "http://www.w3.org/2000/svg";
    const make = (name) => document.createElementNS(NS, name);
    const group = make("g");
    group.setAttribute("fill", "none");
    group.setAttribute("stroke", "currentColor");
    group.setAttribute("stroke-width", "2.4");
    group.setAttribute("stroke-linecap", "round");
    group.setAttribute("stroke-linejoin", "round");

    if (type === "profile") {
      const head = make("circle");
      head.setAttribute("cx", "12"); head.setAttribute("cy", "8"); head.setAttribute("r", "3.5");
      const body = make("path");
      body.setAttribute("d", "M4 20c0-4.2 3.8-7.5 8-7.5s8 3.3 8 7.5");
      group.appendChild(head); group.appendChild(body);
    } else if (type === "bubble") {
      const rect = make("path");
      rect.setAttribute("d", "M4 6h14a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H9l-4 3v-3H5a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3z");
      group.appendChild(rect);
    } else if (type === "expand") {
      const p1 = make("path"); p1.setAttribute("d", "M21 8V3h-5");
      const p2 = make("path"); p2.setAttribute("d", "M21 3l-8 8");
      // Add opposite bottom-left arrow to form a full expand icon
      const p3 = make("path"); p3.setAttribute("d", "M3 16v5h5");
      const p4 = make("path"); p4.setAttribute("d", "M3 21l8-8");
      group.appendChild(p1); group.appendChild(p2); group.appendChild(p3); group.appendChild(p4);
    } else if (type === "close") {
      const x1 = make("path"); x1.setAttribute("d", "M6 6l12 12");
      const x2 = make("path"); x2.setAttribute("d", "M18 6l-12 12");
      group.appendChild(x1); group.appendChild(x2);
    }

    svg.appendChild(group);
    return svg;
  }

  function createIconButton(type, label, opts = {}) {
    const { variant = "ghost", color = null } = opts;
    const b = document.createElement("button");
    b.setAttribute("aria-label", label);
    const base = `display:flex; align-items:center; justify-content:center; cursor:pointer; transition: border-color .15s ease, background .15s ease, color .15s ease, transform .05s ease;`;
    if (variant === "pill") {
      // ~1.3x hit area (28 -> ~36)
      b.style.cssText = `${base} background:#F3F4F6; border:1px solid var(--oasis-border); color:${color || 'var(--oasis-hard-text)'}; border-radius:999px; width:36px; height:36px;`;
    } else {
      b.style.cssText = `${base} background:transparent; border:0; color:${color || 'var(--oasis-hard-text)'}; width:36px; height:36px; border-radius:999px;`;
    }
    b.appendChild(svgFor(type));
    b.addEventListener("mouseenter", () => {
      if (variant === "pill") {
        b.style.borderColor = "var(--oasis-primary)";
        b.style.background = "#EAF3EC";
        b.style.color = color || "var(--oasis-primary)";
      } else {
        b.style.background = "#F3F4F6";
        b.style.color = color || "var(--oasis-primary)";
      }
    });
    b.addEventListener("mouseleave", () => {
      if (variant === "pill") {
        b.style.borderColor = "var(--oasis-border)";
        b.style.background = "#F3F4F6";
        b.style.color = color || "var(--oasis-hard-text)";
      } else {
        b.style.background = "transparent";
        b.style.color = color || "var(--oasis-hard-text)";
      }
    });
    b.addEventListener("mousedown", () => { b.style.transform = "scale(0.97)"; });
    b.addEventListener("mouseup", () => { b.style.transform = "none"; });
    return b;
  }

  right.appendChild(createIconButton("profile", "Account", { variant: "pill" }));
  right.appendChild(createIconButton("bubble", "Messages", { variant: "ghost", color: "var(--oasis-primary)" }));
  right.appendChild(createIconButton("expand", "Expand", { variant: "ghost" }));
  right.appendChild(createIconButton("close", "Close", { variant: "ghost" }));
  header.appendChild(left);
  header.appendChild(right);
  log.appendChild(header);
  // Tasks panel container
  tasksPanel = document.createElement("div");
  tasksPanel.id = "tasksPanel";
  tasksPanel.style.cssText = `
    background: var(--oasis-surface);
    border: 1px solid var(--oasis-border);
    border-radius: 12px;
    padding: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  `;
  const tpHeader = document.createElement("div");
  tpHeader.style.cssText = "display:flex; align-items:center; gap:8px; margin-bottom:8px;";
  const tpTitle = document.createElement("span");
  tpTitle.textContent = "TASKS RUNNING";
  tpTitle.style.cssText = "font-weight:700; font-size:12px; color: var(--oasis-soft-text);";
  tpHeader.appendChild(tpTitle);
  tasksPanel.appendChild(tpHeader);
  const tpBody = document.createElement("div");
  tpBody.className = "tasks-body";
  tpBody.style.cssText = "display:flex; flex-direction:column; gap:6px;";
  tasksPanel.appendChild(tpBody);

  const empty = document.createElement("div");
  empty.className = "tasks-empty";
  empty.textContent = "No tasks running";
  empty.style.cssText = "color: var(--oasis-soft-text); font-size:12px;";
  tpBody.appendChild(empty);

  function refreshTasks() {
    tpBody.innerHTML = "";
    if (tasksState.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "No tasks running";
      empty.style.cssText = "color: var(--oasis-soft-text); font-size:12px;";
      tpBody.appendChild(empty);
      return;
    }
    for (const t of tasksState) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:12px; color: var(--oasis-hard-text); padding:6px 4px;";
      const left = document.createElement("div");
      left.style.cssText = "display:flex; align-items:center; gap:8px;";
      const chevron = document.createElement("span");
      chevron.textContent = "›";
      chevron.style.cssText = "color: var(--oasis-soft-text); font-weight:700;";
      const label = document.createElement("span");
      label.textContent = t.title;
      left.appendChild(chevron);
      left.appendChild(label);

      const refresh = document.createElement("button");
      refresh.setAttribute("aria-label", "Refresh task");
      refresh.style.cssText = `
        width:22px; height:22px; border-radius:999px; display:flex; align-items:center; justify-content:center;
        background: var(--oasis-surface); border: 1px solid var(--oasis-border); color: var(--oasis-soft-text);
        cursor:pointer; transition: all .15s ease;
      `;
      refresh.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9"/><path d="M3 12a9 9 0 0 0 9 9"/><polyline points="3 12 6 9 9 12"/></svg>';
      refresh.addEventListener("mouseenter", () => {
        refresh.style.borderColor = "var(--oasis-primary)";
        refresh.style.background = "#EAF3EC";
        refresh.style.color = "var(--oasis-primary)";
      });
      refresh.addEventListener("mouseleave", () => {
        refresh.style.borderColor = "var(--oasis-border)";
        refresh.style.background = "var(--oasis-surface)";
        refresh.style.color = "var(--oasis-soft-text)";
      });

      row.appendChild(left);
      row.appendChild(refresh);
      tpBody.appendChild(row);
    }
  }

  tasksPanel.refresh = refreshTasks;

  log.appendChild(tasksPanel);
  feed = document.createElement("div");
  feed.id = "feed";
  feed.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 10px;
  `;
  log.appendChild(feed);
}
initFeed();
enableFloatingPanel();

// Stop button
const bar = document.getElementById("bar") || q.parentElement;
const stop = document.createElement("button");
stop.textContent = "Stop";
stop.disabled = true;
bar.appendChild(stop);

// Clear context button
const clearContext = document.createElement("button");
clearContext.textContent = "Clear Context";
clearContext.style.marginLeft = "8px";
clearContext.title = "Clear conversation history (start fresh)";
bar.appendChild(clearContext);
clearContext.addEventListener("click", () => {
  resetAssistantSession();
  append("\n🔄 Conversation context cleared. Starting fresh!\n");
});

// Microphone button
const micButton = document.createElement("button");
// MODIFIED: Updated micSvg function to use solid fill for icons
function micSvg(state = "idle") {
  const primaryColor = 'var(--oasis-primary)';

  if (state === "idle") {
    // Outlined microphone icon to match send button style
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox='0 0 24 24' width='22' height='22' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='display:block;'><path d='M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z'/><path d='M19 10v2a7 7 0 0 1-14 0v-2'/><line x1='12' y1='19' x2='12' y2='23'/><line x1='8' y1='23' x2='16' y2='23'/></svg>`;
  }
  if (state === "loading") {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox='0 0 24 24' width='20' height='20' fill='none' stroke='${primaryColor}' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='9' opacity='.25'/><path d='M12 3a9 9 0 0 1 9 9' /></svg>`;
  }
  if (state === "recording") {
    // Solid fill for the recording state button (using the theme primary color)
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox='0 0 24 24' width='20' height='20' fill='currentColor' stroke='none' style='display:block;'><circle cx='12' cy='12' r='9' /><rect x='9' y='9' width='6' height='6' fill='currentColor' stroke='none' /></svg>`;
  }
  return micSvg("idle");
}
micButton.innerHTML = micSvg("idle");
micButton.style.cssText = `
  margin-left: 6px;
  padding: 0;
  width: 32px; height: 32px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--oasis-hard-text);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  flex: 0 0 32px; min-width: 32px; min-height: 32px; aspect-ratio: 1 / 1; flex-shrink: 0;
  transition: color .15s ease, background .15s ease, transform .05s ease;
`;
micButton.addEventListener("mouseenter", () => {
  micButton.style.color = "var(--oasis-primary)";
});
micButton.addEventListener("mouseleave", () => {
  micButton.style.color = "var(--oasis-soft-text)";
});
micButton.title = "Click to start voice input";
bar.appendChild(micButton);

let isRecording = false;

micButton.addEventListener("click", async () => {
  if (!isAuthenticated) {
    append("\n❌ Please sign in to use voice input.\n");
    return;
  }

  if (!voiceInputService) {
    append("\n❌ Voice input service not available.\n");
    return;
  }

  if (isRecording) {
    // Stop recording
    micButton.innerHTML = micSvg("loading");
    micButton.disabled = true;
    micButton.style.background = "transparent";

    try {
      const transcribedText = await voiceInputService.stopRecording();

      if (transcribedText && transcribedText.trim()) {
        q.value = transcribedText;
        append(`\n🎤 Transcribed: ${transcribedText}\n`);
      } else {
        append("\n⚠️ No speech detected.\n");
      }
    } catch (error) {
      console.error("Transcription error:", error);
      append(`\n❌ Transcription failed: ${error.message}\n`);
    } finally {
      isRecording = false;
      micButton.innerHTML = micSvg("idle");
      micButton.disabled = false;
      micButton.style.background = "transparent";
      micButton.title = "Click to start voice input";
    }
  } else {
    // Start recording
    try {
      await voiceInputService.startRecording();
      isRecording = true;
      micButton.innerHTML = micSvg("recording");
      micButton.style.background = "transparent";
      micButton.title = "Click to stop recording";
      append("\n🎤 Recording... Click again to stop.\n");
    } catch (error) {
      console.error("Recording error:", error);
      append(`\n❌ Failed to start recording: ${error.message}\n`);
    }
  }
});

// Authentication state
let isAuthenticated = false;
let currentUser = null;

// Cross-frame authentication synchronization and command coordination
function setupCrossFrameAuthSync() {
  // Check if we're in an iframe (popup) or main window
  const isInIframe = window !== window.top;

  // Listen for messages from parent window (if in iframe) or iframe (if parent)
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'OASIS_AUTH_STATE_CHANGE') {
      console.log('Received auth state change from parent:', event.data);
      const { authenticated, user } = event.data;
      updateAuthUI(authenticated, user);
    } else if (event.data && event.data.type === 'OASIS_COMMAND_RESULT') {
      // Handle command results from parent window (if in iframe)
      console.log('Received command result from parent:', event.data);
      const { result, error } = event.data;
      if (error) {
        append(`\nError: ${error}\n`);
      } else if (result) {
        append(`\n${result}\n`);
      }
    }
  });

  // Send authentication state to iframe (if we're the parent)
  function notifyIframeAuthChange(authenticated, user) {
    try {
      const iframe = document.getElementById('oasis-assistant-frame');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
          type: 'OASIS_AUTH_STATE_CHANGE',
          authenticated,
          user
        }, '*');
        console.log('Sent auth state change to iframe:', { authenticated, user: user?.email });
      }
    } catch (error) {
      console.warn('Failed to notify iframe of auth change:', error);
    }
  }

  // Send command result to iframe (if we're the parent)
  function notifyIframeCommandResult(result, error = null) {
    try {
      const iframe = document.getElementById('oasis-assistant-frame');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
          type: 'OASIS_COMMAND_RESULT',
          result,
          error
        }, '*');
        console.log('Sent command result to iframe:', { result, error });
      }
    } catch (error) {
      console.warn('Failed to notify iframe of command result:', error);
    }
  }

  // Expose functions globally
  window.notifyIframeAuthChange = notifyIframeAuthChange;
  window.notifyIframeCommandResult = notifyIframeCommandResult;
  window.isInIframe = isInIframe;
}

// Function to wait for an element to exist
function waitForElement(selector, timeout = 1000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver((mutations, obs) => {
      const element = document.querySelector(selector);
      if (element) {
        obs.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${selector} not found within ${timeout}ms`));
    }, timeout);
  });
}

// Function to update the authentication UI
function updateAuthUI(authenticated, user = null) {
  console.log('updateAuthUI called with:', { authenticated, user: user?.email });

  isAuthenticated = authenticated;
  currentUser = user;

  // Set global authentication state for the proxy client to access
  window.oasisAuthState = {
    isAuthenticated: authenticated,
    user: user
  };

  console.log('Global auth state set:', window.oasisAuthState);

  // Update the input field placeholder
  const inputField = document.getElementById('q');
  console.log('Input field found:', inputField);
  if (inputField) {
    if (authenticated) {
      inputField.placeholder = 'Ask me anything...';
      inputField.disabled = false;
      console.log('Input field enabled for authenticated user');
    } else {
      inputField.placeholder = 'Please sign in first...';
      inputField.disabled = true;
      console.log('Input field disabled for unauthenticated user');
    }
  } else {
    console.warn('Input field not found');
  }

  // Update send button
  const sendButton = document.getElementById('go');
  if (sendButton) {
    sendButton.disabled = !authenticated;
  }

  // Update auth status display - wait for element to exist
  waitForElement('#authStatus').then(authStatus => {
    console.log('Auth status element found:', authStatus);
    const statusSpan = authStatus.querySelector('span:last-child');
    if (statusSpan) {
      if (authenticated) {
        statusSpan.textContent = `Signed in as ${user?.email || 'User'}`;
        statusSpan.style.color = '#51cf66';
        console.log('Updated auth status to authenticated');
      } else {
        statusSpan.textContent = 'Not Authenticated';
        statusSpan.style.color = '#ff6b6b';
        console.log('Updated auth status to not authenticated');
      }
    } else {
      console.warn('Status span not found within authStatus');
    }
  }).catch(error => {
    console.warn('Auth status element not found:', error.message);
  });

  // Show/hide auth buttons - wait for element to exist
  waitForElement('#authButtons').then(authButtons => {
    console.log('Auth buttons container found:', authButtons);
    const loginButton = authButtons.querySelector('.login-btn');
    const signupButton = authButtons.querySelector('.signup-btn');
    const menuButton = authButtons.querySelector('.menu-btn');

    if (loginButton) loginButton.style.display = authenticated ? 'none' : 'inline-block';
    if (signupButton) signupButton.style.display = authenticated ? 'none' : 'inline-block';
    if (menuButton) menuButton.style.display = authenticated ? 'inline-block' : 'none';

  }).catch(error => {
    console.warn('Auth buttons container not found:', error.message);
  });

  console.log('Auth UI updated:', { authenticated, user: user?.email });

  // Notify iframe of authentication state change (if we're the parent window)
  if (typeof window.notifyIframeAuthChange === 'function') {
    window.notifyIframeAuthChange(authenticated, user);
  }
}

// Custom protocol handler for kahana:// URLs
function handleKahanaProtocol(url) {
  console.log('Received kahana:// protocol URL:', url);

  if (url.startsWith('kahana://auth-callback')) {
    // Parse the URL to extract auth parameters
    const urlObj = new URL(url);
    const params = new URLSearchParams(urlObj.search);

    // Check for error
    const error = params.get('error');
    const errorDescription = params.get('error_description');

    // Check for success
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const code = params.get('code');

    if (error) {
      console.error('OAuth error:', error, errorDescription);
      showAuthError(`Authentication failed: ${error}`);
    } else if (accessToken || code) {
      console.log('OAuth success, tokens received');
      // The Supabase client should automatically handle the session
      // We'll let the auth state change listener handle the rest
      showAuthSuccess('Authentication successful!');
    } else {
      console.log('No auth parameters found in callback');
      showAuthError('No authentication data received');
    }
  }
}

// Simple OAuth flow - no complex message handling needed
// The user will complete OAuth in a new tab, then we'll check their auth status

// Check for auth callback data in localStorage
function checkForAuthCallback() {
  try {
    const authData = localStorage.getItem('oasis_auth_callback');
    if (authData) {
      const parsed = JSON.parse(authData);
      // Only process if it's recent (within last 30 seconds)
      if (parsed.timestamp && (Date.now() - parsed.timestamp) < 30000) {
        console.log('Found recent auth callback data:', parsed);
        handleAuthSuccess(parsed);
        // Clear the data after processing
        localStorage.removeItem('oasis_auth_callback');
      }
    }
  } catch (e) {
    // Don't spam the console with localStorage errors
    if (!e.message.includes('NS_ERROR_NOT_AVAILABLE')) {
      console.error('Error checking auth callback:', e);
    }
  }
}

// Check for auth callback data when the page loads
checkForAuthCallback();

// Also check periodically in case the message was missed (disabled due to localStorage issues)
// setInterval(checkForAuthCallback, 2000);

// Check for OAuth callback data in localStorage (fallback for postMessage issues)
function checkOAuthCallbackData() {
  try {
    const callbackData = localStorage.getItem('oasis_auth_callback');
    if (callbackData) {
      const authData = JSON.parse(callbackData);
      console.log('Found OAuth callback data in localStorage:', authData);

      // Process the auth data
      if (window.supabaseAuth && window.supabaseAuth.handleOAuthCallbackData) {
        window.supabaseAuth.handleOAuthCallbackData(authData).then(result => {
          if (result.success) {
            showAuthSuccess('Authentication successful! You are now signed in.');
            // Clear the localStorage data
            localStorage.removeItem('oasis_auth_callback');
            // Refresh the auth state
            setTimeout(() => {
              window.location.reload();
            }, 1000);
          } else {
            showAuthError(`Authentication failed: ${result.error}`);
          }
        });
      }
    }
  } catch (e) {
    // Don't spam the console with localStorage errors
    if (!e.message.includes('NS_ERROR_NOT_AVAILABLE')) {
      console.error('Error checking OAuth callback data:', e);
    }
  }
}

// Check for OAuth callback data periodically (disabled due to localStorage issues)
// setInterval(checkOAuthCallbackData, 1000);

// Listen for OAuth callback messages from the redirect page
window.addEventListener('message', async (event) => {
  // Only accept messages from our OAuth callback page
  if (event.origin !== 'https://kahana.co') {
    return;
  }

  if (event.data && event.data.type === 'oauth-success') {
    console.log('Received OAuth success message:', event.data.data);

    // Use the new OAuth callback handler
    if (window.supabaseAuth && window.supabaseAuth.handleOAuthCallbackData) {
      const result = await window.supabaseAuth.handleOAuthCallbackData(event.data.data);
      if (result.success) {
        showAuthSuccess('Authentication successful! You are now signed in.');
        // Refresh the auth state
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        showAuthError(`Authentication failed: ${result.error}`);
      }
    } else {
      // Fallback to old method
      handleAuthSuccess(event.data.data);
    }
  }
});

// Add a simple "Check Authentication" button for after OAuth
// Expose the manual auth check flow so it can be reused from the profile menu
async function runManualAuthCheck() {
  const instructions = `Please copy the FULL callback URL from your browser address bar and paste it here.
        
The URL should look like:
https://kahana.co/oauth-callback#access_token=...&expires_at=...&expires_in=...&provider_token=...&refresh_token=...&token_type=bearer

Or just paste the access_token part if you prefer:`;

  const input = prompt(instructions);
  if (input && input.trim()) {
    try {
      console.log('Processing OAuth data manually...');
      let authData = {};

      // Check if it's a full URL or just a token
      if (input.includes('#')) {
        // Full URL, parse hash fragment
        const url = new URL(input);
        const hashParams = new URLSearchParams(url.hash.substring(1));
        authData = {
          access_token: hashParams.get('access_token'),
          refresh_token: hashParams.get('refresh_token'),
          expires_at: hashParams.get('expires_at'),
          expires_in: hashParams.get('expires_in'),
          token_type: hashParams.get('token_type'),
          timestamp: Date.now(),
          source: 'manual_url'
        };
      } else {
        // Minimal token-only input
        authData = {
          access_token: input.trim(),
          refresh_token: '',
          timestamp: Date.now(),
          source: 'manual_token'
        };
      }

      console.log('Auth data:', authData);

      // Try to set the session directly with Supabase
      if (window.supabaseAuth && window.supabaseAuth.supabase && authData.access_token) {
        console.log('Setting session with auth data...');
        const { data, error } = await window.supabaseAuth.supabase.auth.setSession({
          access_token: authData.access_token,
          refresh_token: authData.refresh_token || ''
        });

        if (error) {
          console.error('Failed to set session:', error.message);
          showAuthError(`Authentication failed: ${error.message}`);
        } else {
          console.log('Session set successfully for user:', data.user?.id);
          showAuthSuccess('Authentication successful! You are now signed in.');
          updateAuthUI(true, data.user);
          setTimeout(() => { window.location.reload(); }, 2000);
        }
        return;
      }

      // Fallback: Use the OAuth callback handler if available
      if (window.supabaseAuth && window.supabaseAuth.handleOAuthCallbackData) {
        const result = await window.supabaseAuth.handleOAuthCallbackData(authData);
        if (result.success) {
          showAuthSuccess('Authentication successful! You are now signed in.');
          // Refresh UI based on current user fetched after success
          try {
            const user = await window.supabaseAuth.getCurrentUser?.();
            updateAuthUI(true, user || null);
          } catch { }
          setTimeout(() => { window.location.reload(); }, 2000);
        } else {
          showAuthError(`Authentication failed: ${result.error}`);
        }
      } else {
        showAuthError('Authentication service not available.');
      }
    } catch (error) {
      console.error('Error processing OAuth data:', error);
      showAuthError('Error processing OAuth data. Please try again.');
    }
  }
}

function addAuthCheckButton() {
  // If the profile menu or header exists, show auth controls there instead
  if (document.getElementById('profileAuthMenu') || document.getElementById('oasis-header')) {
    return;
  }
  // Check if button already exists
  if (document.getElementById('checkAuthBtn')) {
    return;
  }

  // Try to find the auth header, if not found, add it to the log area
  let authHeader = document.getElementById('authHeader');
  if (!authHeader) {
    // Create auth header in the log area
    const log = document.getElementById('log');
    if (log) {
      authHeader = document.createElement('div');
      authHeader.id = 'authHeader';
      authHeader.style.cssText = `
                background: #f3f4f6;
                border: 1px solid #d1d5db;
                border-radius: 8px;
                padding: 12px;
                margin: 8px 0;
                text-align: center;
            `;
      log.appendChild(authHeader);
    } else {
      return;
    }
  }

  const checkAuthBtn = document.createElement('button');
  checkAuthBtn.id = 'checkAuthBtn';
  checkAuthBtn.textContent = 'Check Authentication';
  checkAuthBtn.style.cssText = `
        background: #10b981;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 12px;
        cursor: pointer;
        margin-left: 10px;
        font-weight: 500;
    `;

  checkAuthBtn.addEventListener('click', () => { runManualAuthCheck(); });

  authHeader.appendChild(checkAuthBtn);
}

// Add the check authentication button
setTimeout(addAuthCheckButton, 1000);

// Also try to add it immediately
addAuthCheckButton();

// Try multiple times to ensure the button gets added
setTimeout(addAuthCheckButton, 2000);
setTimeout(addAuthCheckButton, 3000);

// Handle successful authentication
function handleAuthSuccess(authData) {
  console.log('Handling auth success:', authData);

  // Show success message
  showAuthSuccess('Authentication successful! Signing you in...');

  // The Supabase client should automatically detect the session change
  // We'll let the auth state change listener handle the rest
  // But we can also try to refresh the auth state manually
  if (window.supabaseAuth) {
    window.supabaseAuth.getCurrentUser().then(user => {
      if (user) {
        console.log('User authenticated:', user.email);
        // Update the UI to show authenticated state
        updateAuthUI(true, user);
      }
    }).catch(error => {
      console.error('Error getting current user:', error);
    });
  }
}

// Helper functions for auth feedback
function showAuthSuccess(message) {
  const successDiv = document.createElement('div');
  successDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #51cf66;
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        z-index: 10000;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
  successDiv.textContent = message;
  document.body.appendChild(successDiv);

  setTimeout(() => {
    if (successDiv.parentNode) {
      successDiv.parentNode.removeChild(successDiv);
    }
  }, 3000);
}

function showAuthError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #ff6b6b;
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        z-index: 10000;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
  errorDiv.textContent = message;
  document.body.appendChild(errorDiv);

  setTimeout(() => {
    if (errorDiv.parentNode) {
      errorDiv.parentNode.removeChild(errorDiv);
    }
  }, 5000);
}

// Create a clean authentication header
const authHeader = document.createElement("div");
const gradStart = THEME.primary;
const gradEnd = shadeColor(THEME.primary, -18);
authHeader.style.cssText = `
    background: linear-gradient(135deg, ${gradStart} 0%, ${gradEnd} 100%);
    color: white;
    padding: 12px 16px;
    border-radius: 8px 8px 0 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 14px;
    font-weight: 500;
  `;
bar.parentElement.insertBefore(authHeader, bar);
// Move auth actions to profile icon; keep header DOM but hide it
authHeader.style.display = "none";

// Auth status display
const authStatus = document.createElement("div");
authStatus.id = "authStatus";
authStatus.style.cssText = "display: flex; align-items: center; gap: 8px;";
authStatus.innerHTML = `
  <span style="font-size: 16px;">🔒</span>
  <span>Not Authenticated</span>
`;
authHeader.appendChild(authStatus);

// Profile icon dropdown for Sign In / Sign Up
const profileBtn = header && header.querySelector('button[aria-label="Account"]');
if (profileBtn) {
  const profileMenu = document.createElement("div");
  profileMenu.id = "profileAuthMenu";
  profileMenu.style.cssText = `
      display: none;
      position: absolute;
      top: 48px;
      right: 12px;
      background-color: white;
      border: 1px solid var(--oasis-border);
      border-radius: 8px;
      box-shadow: 0 6px 20px rgba(0,0,0,0.12);
      z-index: 1000;
      padding: 8px;
      min-width: 160px;
    `;
  header.appendChild(profileMenu);

  function addMenuItem(text, handler, variant) {
    const item = document.createElement("button");
    item.textContent = text;
    item.style.cssText = `
        width: 100%;
        text-align: left;
        padding: 8px 10px;
        border: 0;
        background: ${variant === 'primary' ? '#EAF3EC' : 'transparent'};
        color: ${variant === 'primary' ? 'var(--oasis-primary)' : 'var(--oasis-hard-text)'};
        border-radius: 6px;
        font-size: 13px;
        cursor: pointer;
      `;
    item.addEventListener("mouseenter", () => {
      item.style.background = variant === 'primary' ? '#DCEDE0' : '#F3F4F6';
    });
    item.addEventListener("mouseleave", () => {
      item.style.background = variant === 'primary' ? '#EAF3EC' : 'transparent';
    });
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      profileMenu.style.display = "none";
      handler();
    });
    profileMenu.appendChild(item);
  }

  // Wire to existing handlers without changing functionality
  addMenuItem("Sign In", showLoginForm, "default");
  addMenuItem("Sign Up", showSignupForm, "primary");
  addMenuItem("Check Authentication", () => {
    // Use the same manual flow as the legacy button for parity
    runManualAuthCheck();
  }, "default");

  profileBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    // Toggle visibility
    const isOpen = profileMenu.style.display === "block";
    profileMenu.style.display = isOpen ? "none" : "block";
  });

  document.addEventListener("click", (e) => {
    if (!profileMenu.contains(e.target) && e.target !== profileBtn) {
      profileMenu.style.display = "none";
    }
  });
}

// Auth buttons container
const authButtons = document.createElement("div");
authButtons.id = "authButtons";
authButtons.style.cssText = "display: flex; gap: 8px;";
authHeader.appendChild(authButtons);

const loginButton = document.createElement("button");
loginButton.textContent = "Sign In";
loginButton.className = "login-btn";
loginButton.style.cssText = `
  background: rgba(255,255,255,0.2);
  color: white;
  border: 1px solid rgba(255,255,255,0.3);
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
`;
loginButton.addEventListener("mouseenter", () => {
  loginButton.style.background = "rgba(255,255,255,0.3)";
});
loginButton.addEventListener("mouseleave", () => {
  loginButton.style.background = "rgba(255,255,255,0.2)";
});
authButtons.appendChild(loginButton);

const signupButton = document.createElement("button");
signupButton.textContent = "Sign Up";
signupButton.className = "signup-btn";
signupButton.style.cssText = `
  background: rgba(255,255,255,0.9);
  color: var(--oasis-primary);
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
`;
signupButton.addEventListener("mouseenter", () => {
  signupButton.style.background = "white";
});
signupButton.addEventListener("mouseleave", () => {
  signupButton.style.background = "rgba(255,255,255,0.9)";
});
authButtons.appendChild(signupButton);

// Create three-dot menu button
const menuButton = document.createElement("button");
menuButton.className = "menu-btn";
menuButton.innerHTML = "&#8942;"; // Vertical ellipsis
menuButton.style.cssText = `
  background: transparent;
  color: white;
  border: none;
  font-size: 20px;
  cursor: pointer;
  padding: 0 8px;
  display: none; /* Hidden by default */
`;
authButtons.appendChild(menuButton);

// Create dropdown menu
const dropdownMenu = document.createElement("div");
dropdownMenu.className = "dropdown-menu";
dropdownMenu.style.cssText = `
  display: none;
  position: absolute;
  top: 40px;
  right: 10px;
  background-color: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  z-index: 1000;
`;
authHeader.appendChild(dropdownMenu);

// Dropdown items
const dropdownItems = [
  { label: "Account", action: () => alert("Account clicked") },
  { label: "Subscription", action: () => alert("Subscription clicked") },
  { label: "Settings", action: () => alert("Settings clicked") },
  { label: "Logout", action: () => logout() }
];

dropdownItems.forEach(item => {
  const menuItem = document.createElement("a");
  menuItem.textContent = item.label;
  menuItem.style.cssText = `
        display: block;
        padding: 8px 16px;
        color: #333;
        text-decoration: none;
        cursor: pointer;
    `;
  menuItem.addEventListener("mouseenter", () => menuItem.style.backgroundColor = "#f4f4f4");
  menuItem.addEventListener("mouseleave", () => menuItem.style.backgroundColor = "white");
  menuItem.addEventListener("click", item.action);
  dropdownMenu.appendChild(menuItem);
});

// Toggle dropdown menu
menuButton.addEventListener("click", () => {
  const isDisplayed = dropdownMenu.style.display === "block";
  dropdownMenu.style.display = isDisplayed ? "none" : "block";
});

// Hide dropdown if clicked outside
document.addEventListener("click", (event) => {
  if (!menuButton.contains(event.target) && !dropdownMenu.contains(event.target)) {
    dropdownMenu.style.display = "none";
  }
});


let busy = false;
let stopped = false;

function setBusy(v) {
  busy = v;
  q.disabled = v;
  go.disabled = v;
  stop.disabled = !v;
  // Keep the circular icon button shape regardless of busy state.
  // Do not switch to text content, which can make the button look flat/pill.
  // When busy, simply disable the button and keep the send arrow icon.
  // If a future loading indicator is needed, we can swap to a spinner SVG
  // of the same size, but for now, preserve the icon for consistent visuals.
  go.style.opacity = v ? 0.85 : 1;
  // MODIFIED: Ensure the SVG for the send button is correctly formed for the final look
  go.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>';
}

// ---- Card-based rendering helpers ----
function createCard({ role = "system", title = "", compact = false } = {}) {
  const card = document.createElement("div");
  card.className = `oasis-card oasis-${role}`;
  card.style.cssText = `
    background: ${role === "assistant" ? "var(--oasis-assistant-card-bg)" : role === "user" ? "#F9FAFB" : "#F3F4F6"};
    border: 1px solid var(--oasis-border);
    border-radius: 12px;
    padding: ${compact ? "10px" : "14px"};
    box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  `;

  const header = document.createElement("div");
  header.style.cssText = `display:flex; align-items:center; gap:8px; margin-bottom:${compact ? "6px" : "10px"}; color: var(--oasis-soft-text); font-size:12px;`;
  const badge = document.createElement("span");
  badge.textContent = role === "assistant" ? "Assistant" : role === "user" ? "You" : "System";
  badge.style.cssText = `
    display:inline-block; padding:2px 6px; border-radius:999px; background:${role === "assistant" ? "#EAF3EC" : role === "user" ? "#F3F4F6" : "#E5E7EB"};
    color:${role === "assistant" ? "var(--oasis-primary)" : "#374151"}; font-weight:600;
  `;
  header.appendChild(badge);
  if (title) {
    const ht = document.createElement("span");
    ht.textContent = title;
    header.appendChild(ht);
  }

  // Optional thinking-as row and chips for assistant cards
  if (role === "assistant" && !compact) {
    const thinking = document.createElement("div");
    thinking.style.cssText = "display:flex; align-items:center; gap:8px; margin-bottom:8px; color: var(--oasis-soft-text); font-size:12px;";
    const prefix = document.createElement("span"); prefix.textContent = "Thinking as";
    const pill = document.createElement("span"); pill.textContent = "@Invest Analyst"; pill.style.cssText = "padding:2px 8px; border-radius:999px; border:1px solid var(--oasis-border); background:#fff; color: var(--oasis-hard-text);";
    thinking.appendChild(prefix); thinking.appendChild(pill);

    const chips = document.createElement("div");
    chips.style.cssText = "display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px;";
    for (const tag of ["sagemount.com", "linkedin.com"]) {
      const chip = document.createElement("span");
      chip.textContent = tag;
      chip.style.cssText = "padding:4px 8px; border-radius:999px; border:1px solid var(--oasis-border); background:#fff; color: var(--oasis-hard-text); font-size:12px;";
      chips.appendChild(chip);
    }
    card.appendChild(thinking);
    card.appendChild(chips);
  }

  const body = document.createElement("div");
  body.className = "oasis-card-body";
  body.style.cssText = `white-space:pre-wrap; color: var(--oasis-hard-text); font-size:13px; line-height:1.5;`;

  card.appendChild(header);
  card.appendChild(body);
  feed?.appendChild(card);
  // auto-scroll
  log.scrollTop = log.scrollHeight;
  return { card, body };
}

// Legacy append now writes a compact system card
function append(text) {
  const { body } = createCard({ role: "system", compact: true });
  body.textContent = text;
}

// Render user message card
function renderUserMessage(prompt) {
  const { body } = createCard({ role: "user" });
  body.textContent = prompt;
}

// Streaming assistant card management
let currentAssistantCard = null;
function startAssistantStreamCard() {
  currentAssistantCard = createCard({ role: "assistant" });
}
function appendAssistantChunk(chunk) {
  if (!currentAssistantCard) startAssistantStreamCard();
  const body = currentAssistantCard.body;
  body.textContent += chunk;
  // keep scrolling
  log.scrollTop = log.scrollHeight;
}
function finalizeAssistantStream() {
  // Format the assistant text into simple sections and paragraphs
  if (currentAssistantCard) {
    const raw = currentAssistantCard.body.textContent;
    const html = formatAssistantText(raw);
    currentAssistantCard.body.innerHTML = html;
  }
  currentAssistantCard = null;
}

function formatAssistantText(text) {
  const lines = text.split(/\r?\n/);
  const parts = [];

  function humanizeOpenTab(rawUrl) {
    try {
      const url = rawUrl.trim();
      const hasProto = /^https?:\/\//i.test(url);
      const u = new URL(hasProto ? url : `https://${url}`);
      const host = u.hostname.replace(/^www\./, "");
      const sp = u.searchParams;
      // Known patterns
      if (host.includes("youtube.com") && (u.pathname.includes("/results") || sp.has("search_query"))) {
        const q = sp.get("search_query") || sp.get("q") || "";
        return `Opened YouTube search for '${escapeHtml(q)}' in a new tab.`;
      }
      if (host.includes("google.") && sp.has("q")) {
        const q = sp.get("q") || "";
        return `Opened Google results for '${escapeHtml(q)}' in a new tab.`;
      }
      // Default
      const path = u.pathname && u.pathname !== "/" ? u.pathname : "";
      return `Opened ${escapeHtml(host + path)} in a new tab.`;
    } catch {
      return `Opened ${escapeHtml(rawUrl)} in a new tab.`;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Headings
    if (/^(Overview|Investment Strategy|Summary)\b/i.test(line)) {
      parts.push(`<h3 style="margin:8px 0 6px; font-size:14px; font-weight:700; color:var(--oasis-hard-text);">${escapeHtml(line)}</h3>`);
      continue;
    }

    // Tool output: open_tab → friendlier phrasing
    const mOpen = line.match(/^\[Tool Output for open_tab\]:\s*Opened\s+(.+?)\s+in a new tab\.?$/i);
    if (mOpen) {
      parts.push(`<p style="margin:0 0 8px; color:var(--oasis-hard-text);">${humanizeOpenTab(mOpen[1])}</p>`);
      continue;
    }

    // Default paragraph
    parts.push(`<p style="margin:0 0 8px; color:var(--oasis-hard-text);">${escapeHtml(line)}</p>`);
  }
  return parts.join("");
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---- Lightweight tasks tracking (UI-only) ----
function addTask(title) {
  tasksState.push({ title, done: false });
  tasksPanel?.refresh?.();
}
function completeLastTask() {
  if (tasksState.length > 0) {
    tasksState[tasksState.length - 1].done = true;
    tasksPanel?.refresh?.();
  }
}


// Show Google OAuth instructions
function showGoogleOAuthInstructions(oauthUrl) {
  const instructions = document.createElement("div");
  instructions.style.cssText = "display: flex; flex-direction: column; gap: 20px; text-align: center;";

  const title = document.createElement("h3");
  title.textContent = "Complete Google Sign-In";
  title.style.cssText = "margin: 0; color: #1f2937; font-size: 20px; font-weight: 600;";

  const description = document.createElement("p");
  description.textContent = "Click the button below to open Google sign-in in a new tab:";
  description.style.cssText = "margin: 0; color: #6b7280; font-size: 16px;";

  const openButton = document.createElement("button");
  openButton.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px;">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
    Open Google Sign-In
  `;
  openButton.style.cssText = `
    background: #4285F4;
    color: white;
    border: none;
    padding: 14px 28px;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 500;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto;
    transition: background-color 0.2s;
  `;

  openButton.addEventListener("click", () => {
    // Try to open in new tab
    try {
      window.open(oauthUrl, '_blank');
      // Close the modal
      document.body.removeChild(document.querySelector('.modal'));
    } catch (error) {
      console.log('Could not open URL directly:', error);
      // Fallback: copy to clipboard and show instructions
      navigator.clipboard.writeText(oauthUrl).then(() => {
        alert('URL copied to clipboard! Please paste it in a new tab.');
      }).catch(() => {
        alert('Please manually copy this URL and open it in a new tab: ' + oauthUrl);
      });
    }
  });

  const note = document.createElement("p");
  note.textContent = "After completing authentication, return here and click 'Check Authentication'";
  note.style.cssText = "margin: 0; color: #6b7280; font-size: 14px; font-style: italic;";

  instructions.appendChild(title);
  instructions.appendChild(description);
  instructions.appendChild(openButton);
  instructions.appendChild(note);

  const { modal } = createModal("Google Sign-In", instructions);
}

// Create modal dialog system
function createModal(title, content) {
  const modal = document.createElement("div");
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
  `;

  const dialog = document.createElement("div");
  dialog.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 24px;
    min-width: 400px;
    max-width: 500px;
    box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
  `;

  const header = document.createElement("div");
  header.style.cssText = `
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 20px;
    text-align: center;
  `;
  header.textContent = title;

  dialog.appendChild(header);
  dialog.appendChild(content);
  modal.appendChild(dialog);

  // Close on background click
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });

  document.body.appendChild(modal);
  return { modal, dialog };
}

function showLoginForm() {
  const form = document.createElement("form");
  form.style.cssText = "display: flex; flex-direction: column; gap: 16px;";

  const emailInput = document.createElement("input");
  emailInput.type = "email";
  emailInput.placeholder = "Enter your email";
  emailInput.style.cssText = `
    padding: 12px;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    transition: border-color 0.2s;
  `;
  emailInput.addEventListener("focus", () => {
    emailInput.style.borderColor = "#667eea";
  });
  emailInput.addEventListener("blur", () => {
    emailInput.style.borderColor = "#e5e7eb";
  });

  const passwordInput = document.createElement("input");
  passwordInput.type = "password";
  passwordInput.placeholder = "Enter your password";
  passwordInput.style.cssText = `
    padding: 12px;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    transition: border-color 0.2s;
  `;
  passwordInput.addEventListener("focus", () => {
    passwordInput.style.borderColor = "#667eea";
  });
  passwordInput.addEventListener("blur", () => {
    passwordInput.style.borderColor = "#e5e7eb";
  });

  // Divider
  const divider = document.createElement("div");
  divider.style.cssText = `
    display: flex;
    align-items: center;
    margin: 16px 0;
    color: #6b7280;
    font-size: 14px;
  `;
  divider.innerHTML = `
    <div style="flex: 1; height: 1px; background: #e5e7eb;"></div>
    <span style="margin: 0 16px;">or</span>
    <div style="flex: 1; height: 1px; background: #e5e7eb;"></div>
  `;

  // Google Sign-In button
  const googleButton = document.createElement("button");
  googleButton.type = "button";
  googleButton.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" style="margin-right: 8px;">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
    Continue with Google
  `;
  googleButton.style.cssText = `
    width: 100%;
    background: white;
    color: #374151;
    border: 2px solid #e5e7eb;
    padding: 12px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  `;
  googleButton.addEventListener("mouseenter", () => {
    googleButton.style.borderColor = "#d1d5db";
    googleButton.style.backgroundColor = "#f9fafb";
  });
  googleButton.addEventListener("mouseleave", () => {
    googleButton.style.borderColor = "#e5e7eb";
    googleButton.style.backgroundColor = "white";
  });

  const buttonContainer = document.createElement("div");
  buttonContainer.style.cssText = "display: flex; gap: 12px; margin-top: 8px;";

  const submitButton = document.createElement("button");
  submitButton.type = "submit";
  submitButton.textContent = "Sign In";
  submitButton.style.cssText = `
    flex: 1;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    padding: 12px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s;
  `;
  submitButton.addEventListener("mouseenter", () => {
    submitButton.style.transform = "translateY(-1px)";
  });
  submitButton.addEventListener("mouseleave", () => {
    submitButton.style.transform = "translateY(0)";
  });

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";
  cancelButton.style.cssText = `
    flex: 1;
    background: #f3f4f6;
    color: #374151;
    border: none;
    padding: 12px;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    transition: background-color 0.2s;
  `;
  cancelButton.addEventListener("mouseenter", () => {
    cancelButton.style.background = "#e5e7eb";
  });
  cancelButton.addEventListener("mouseleave", () => {
    cancelButton.style.background = "#f3f4f6";
  });

  buttonContainer.appendChild(submitButton);
  buttonContainer.appendChild(cancelButton);

  form.appendChild(emailInput);
  form.appendChild(passwordInput);
  form.appendChild(divider);
  form.appendChild(googleButton);
  form.appendChild(buttonContainer);

  const { modal } = createModal("Sign In to Oasis", form);

  cancelButton.addEventListener("click", () => {
    document.body.removeChild(modal);
  });

  googleButton.addEventListener("click", () => {
    document.body.removeChild(modal);

    // Use Supabase auth from window
    window.supabaseAuth.signInWithGoogle().then(({ user, error }) => {
      if (error) {
        const errorMessage = window.supabaseAuth.handleAuthError(error);

        // Check if this is the special OAuth URL case
        if (errorMessage.startsWith('GOOGLE_OAUTH_URL:')) {
          const oauthUrl = errorMessage.replace('GOOGLE_OAUTH_URL:', '');
          showGoogleOAuthInstructions(oauthUrl);
        } else {
          append(`\n❌ Google sign in failed: ${errorMessage}\n`);
        }
      } else {
        append(`\n🔄 Redirecting to Google for authentication...\n`);
      }
    });
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) return;

    document.body.removeChild(modal);

    // Use Supabase auth from window
    window.supabaseAuth.signInWithEmail(email, password).then(({ user, error }) => {
      if (error) {
        append(`\n❌ Sign in failed: ${window.supabaseAuth.handleAuthError(error)}\n`);
      } else if (user) {
        isAuthenticated = true;
        currentUser = user;
        updateAuthUI(true, user);
        append(`\n🔓 Signed in as ${user.email}\n`);
      }
    });
  });

  // Focus first input
  setTimeout(() => emailInput.focus(), 100);
}

function showSignupForm() {
  const form = document.createElement("form");
  form.style.cssText = "display: flex; flex-direction: column; gap: 16px;";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = "Enter your name (optional)";
  nameInput.style.cssText = `
    padding: 12px;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    transition: border-color 0.2s;
  `;
  nameInput.addEventListener("focus", () => {
    nameInput.style.borderColor = "#667eea";
  });
  nameInput.addEventListener("blur", () => {
    nameInput.style.borderColor = "#e5e7eb";
  });

  const emailInput = document.createElement("input");
  emailInput.type = "email";
  emailInput.placeholder = "Enter your email";
  emailInput.style.cssText = `
    padding: 12px;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    transition: border-color 0.2s;
  `;
  emailInput.addEventListener("focus", () => {
    emailInput.style.borderColor = "#667eea";
  });
  emailInput.addEventListener("blur", () => {
    emailInput.style.borderColor = "#e5e7eb";
  });

  const passwordInput = document.createElement("input");
  passwordInput.type = "password";
  passwordInput.placeholder = "Enter your password (min 6 characters)";
  passwordInput.style.cssText = `
    padding: 12px;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    transition: border-color 0.2s;
  `;
  passwordInput.addEventListener("focus", () => {
    passwordInput.style.borderColor = "#667eea";
  });
  passwordInput.addEventListener("blur", () => {
    passwordInput.style.borderColor = "#e5e7eb";
  });

  // Divider
  const divider = document.createElement("div");
  divider.style.cssText = `
    display: flex;
    align-items: center;
    margin: 16px 0;
    color: #6b7280;
    font-size: 14px;
  `;
  divider.innerHTML = `
    <div style="flex: 1; height: 1px; background: #e5e7eb;"></div>
    <span style="margin: 0 16px;">or</span>
    <div style="flex: 1; height: 1px; background: #e5e7eb;"></div>
  `;

  // Google Sign-In button
  const googleButton = document.createElement("button");
  googleButton.type = "button";
  googleButton.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" style="margin-right: 8px;">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
    Continue with Google
  `;
  googleButton.style.cssText = `
    width: 100%;
    background: white;
    color: #374151;
    border: 2px solid #e5e7eb;
    padding: 12px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  `;
  googleButton.addEventListener("mouseenter", () => {
    googleButton.style.borderColor = "#d1d5db";
    googleButton.style.backgroundColor = "#f9fafb";
  });
  googleButton.addEventListener("mouseleave", () => {
    googleButton.style.borderColor = "#e5e7eb";
    googleButton.style.backgroundColor = "white";
  });

  const buttonContainer = document.createElement("div");
  buttonContainer.style.cssText = "display: flex; gap: 12px; margin-top: 8px;";

  const submitButton = document.createElement("button");
  submitButton.type = "submit";
  submitButton.textContent = "Create Account";
  submitButton.style.cssText = `
    flex: 1;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    padding: 12px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s;
  `;
  submitButton.addEventListener("mouseenter", () => {
    submitButton.style.transform = "translateY(-1px)";
  });
  submitButton.addEventListener("mouseleave", () => {
    submitButton.style.transform = "translateY(0)";
  });

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";
  cancelButton.style.cssText = `
    flex: 1;
    background: #f3f4f6;
    color: #374151;
    border: none;
    padding: 12px;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    transition: background-color 0.2s;
  `;
  cancelButton.addEventListener("mouseenter", () => {
    cancelButton.style.background = "#e5e7eb";
  });
  cancelButton.addEventListener("mouseleave", () => {
    cancelButton.style.background = "#f3f4f6";
  });

  buttonContainer.appendChild(submitButton);
  buttonContainer.appendChild(cancelButton);

  form.appendChild(nameInput);
  form.appendChild(emailInput);
  form.appendChild(passwordInput);
  form.appendChild(divider);
  form.appendChild(googleButton);
  form.appendChild(buttonContainer);

  const { modal } = createModal("Create Oasis Account", form);

  cancelButton.addEventListener("click", () => {
    document.body.removeChild(modal);
  });

  googleButton.addEventListener("click", () => {
    document.body.removeChild(modal);

    // Use Supabase auth from window
    window.supabaseAuth.signInWithGoogle().then(({ user, error }) => {
      if (error) {
        const errorMessage = window.supabaseAuth.handleAuthError(error);

        // Check if this is the special OAuth URL case
        if (errorMessage.startsWith('GOOGLE_OAUTH_URL:')) {
          const oauthUrl = errorMessage.replace('GOOGLE_OAUTH_URL:', '');
          showGoogleOAuthInstructions(oauthUrl);
        } else {
          append(`\n❌ Google sign in failed: ${errorMessage}\n`);
        }
      } else {
        append(`\n🔄 Redirecting to Google for authentication...\n`);
      }
    });
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) return;

    document.body.removeChild(modal);

    // Use Supabase auth from window
    window.supabaseAuth.signUp(email, password, name || undefined).then(({ user, error }) => {
      if (error) {
        append(`\n❌ Sign up failed: ${window.supabaseAuth.handleAuthError(error)}\n`);
        append(`\nDebug info: ${JSON.stringify(error, null, 2)}\n`);
      } else if (user) {
        append(`\n✅ Account created! Please check your email to confirm your account.\n`);
        append(`\nUser ID: ${user.id}\n`);
      } else {
        append(`\n⚠️ Sign up completed but no user returned. Check your email for confirmation.\n`);
      }
    }).catch((err) => {
      append(`\n❌ Sign up error: ${err.message}\n`);
    });
  });

  // Focus first input
  setTimeout(() => nameInput.focus(), 100);
}

async function logout() {
  // Use Supabase auth from window
  const { error } = await window.supabaseAuth.signOut();

  if (error) {
    append(`\n❌ Logout failed: ${error.message}\n`);
  } else {
    isAuthenticated = false;
    currentUser = null;
    updateAuthUI();
    append(`\n🔒 Logged out\n`);
  }
}

async function send() {
  if (busy) return;

  // Check authentication - both local state and global state
  if (!isAuthenticated || !window.oasisAuthState?.isAuthenticated) {
    append("\n❌ Authentication required: Please sign in to use the AI assistant\n");
    append("🔒 This protects our API tokens from unauthorized usage\n");
    return;
  }

  const prompt = q.value.trim();
  if (!prompt) return;
  q.value = "";
  renderUserMessage(prompt);
  stopped = false;
  setBusy(true);
  // UI-only: show a running task corresponding to the prompt
  addTask(prompt.length > 60 ? `${prompt.substring(0, 57)}…` : prompt);

  try {
    // Double-check authentication before making the API call
    if (!window.oasisAuthState?.isAuthenticated) {
      throw new Error('Authentication lost during request. Please sign in again.');
    }

    // Session context is automatically managed
    startAssistantStreamCard();
    await runAssistantStream(prompt, (chunk) => {
      if (!stopped) {
        appendAssistantChunk(chunk);
        if (typeof window.notifyIframeCommandResult === 'function') {
          window.notifyIframeCommandResult(chunk);
        }
      }
    });
    if (!stopped) {
      finalizeAssistantStream();
      if (typeof window.notifyIframeCommandResult === 'function') {
        window.notifyIframeCommandResult("\n");
      }
      completeLastTask();
    }
  } catch (e) {
    const errorMessage = e?.message?.includes('Authentication required')
      ? `🔒 ${e.message}\nPlease sign in to continue using the AI assistant.`
      : `Error: ${e?.message || e}`;

    append(`\n${errorMessage}\n`);

    // Forward error to iframe if we're in main window
    if (!window.isInIframe && typeof window.notifyIframeCommandResult === 'function') {
      window.notifyIframeCommandResult(null, errorMessage);
    }
  } finally {
    setBusy(false);
  }
}

go.addEventListener("click", send);
q.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
stop.addEventListener("click", () => { stopped = true; setBusy(false); append("\n(stopped)\n"); });
loginButton.addEventListener("click", showLoginForm);
signupButton.addEventListener("click", showSignupForm);

// Initialize UI
updateAuthUI();

// Check for existing authentication on load
async function checkExistingAuth() {
  try {
    const user = await window.supabaseAuth.getCurrentUser();
    if (user) {
      isAuthenticated = true;
      currentUser = user;
      updateAuthUI(true, user);
      append(`\n🔓 Already logged in as ${user.email}\n`);
    }
  } catch (error) {
    console.error('Error checking existing auth:', error);
  }
}

checkExistingAuth();

// Setup cross-frame authentication synchronization
setupCrossFrameAuthSync();

// Add a function to manually refresh auth state (for debugging)
window.refreshAuthState = async function () {
  console.log('Manually refreshing authentication state...');
  try {
    const user = await window.supabaseAuth.getCurrentUser();
    console.log('Current user from Supabase:', user);

    if (user) {
      isAuthenticated = true;
      currentUser = user;
      updateAuthUI(true, user);
      console.log('Updated UI to authenticated state');
    } else {
      isAuthenticated = false;
      currentUser = null;
      updateAuthUI(false);
      console.log('Updated UI to unauthenticated state');
    }
  } catch (error) {
    console.error('Error refreshing auth state:', error);
  }
};

// Add a function to force update the UI (for debugging)
window.forceUpdateUI = function () {
  console.log('Force updating UI with current state...');
  console.log('Current state:', { isAuthenticated, currentUser: currentUser?.email });
  updateAuthUI(isAuthenticated, currentUser);
};
// Composer styling to match target
function styleComposer() {
  const bar = document.getElementById("bar");
  if (!bar) return;
  bar.style.cssText = "display:flex; align-items:center; gap:8px; background:#fff; border-top:1px solid var(--oasis-border); padding:12px; flex-wrap:nowrap;";

  // Build rounded composer box with inline icons
  const box = document.createElement("div");
  // MODIFIED: Adjusted padding to make room for the mic button inside
  box.style.cssText = "flex:1 1 320px; min-width:220px; display:flex; align-items:center; gap:10px; border:1px solid var(--oasis-border); background:#fff; border-radius:12px; padding:4px 10px 4px 14px;";

  const leftIcons = document.createElement("div");
  leftIcons.style.cssText = "display:flex; align-items:center; gap:10px; color:var(--oasis-hard-text); opacity:0.9;";
  leftIcons.innerHTML = `
    <svg viewBox='0 0 24 24' width='20' height='20' fill='none' stroke='currentColor' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'><path d='M12 20l9-9-7-7-9 9v7h7z'/></svg>
    <svg viewBox='0 0 24 24' width='20' height='20' fill='none' stroke='currentColor' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'><path d='M21 8v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5h8a5 5 0 0 1 5 5z'/><path d='M7 12h10'/></svg>
    <svg viewBox='0 0 24 24' width='20' height='20' fill='none' stroke='currentColor' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'><rect x='4' y='4' width='16' height='16' rx='3'/><path d='M7 12h10'/></svg>
  `;

  // Move the existing input into the box and restyle
  q.placeholder = "Mention @Page and ask anything...";
  q.style.cssText = "flex:1 1 auto; min-width:0; padding:8px 0; border:none; outline:none; background:transparent; color:var(--oasis-hard-text);";
  box.appendChild(leftIcons);
  box.appendChild(q);

  const rightIcons = document.createElement("div");
  // MODIFIED: Add gap between mic and send button
  rightIcons.style.cssText = "display:flex; align-items:center; gap:4px;";

  // MODIFIED: Place micButton inside the input box and style it with primary color
  if (typeof micButton !== "undefined" && micButton) {
    // Remove it from its temporary placement in 'bar' if it was placed there
    if (micButton.parentNode === bar) {
      bar.removeChild(micButton);
    }

    micButton.style.cssText = `
          padding: 0;
          width: 36px; height: 36px;
          border: 0;
          border-radius: 999px;
          background: transparent;
          color: var(--oasis-primary); /* Set color to match send button */
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          flex: 0 0 36px; min-width: 36px; min-height: 36px; aspect-ratio: 1 / 1; flex-shrink: 0;
          transition: color .15s ease, background .15s ease, transform .05s ease;
      `;
    // Ensure the mic icon color is changed on hover/leave
    micButton.addEventListener("mouseenter", () => {
      micButton.style.color = shadeColor(THEME.primary, 15); // Slightly lighter green on hover
    });
    micButton.addEventListener("mouseleave", () => {
      micButton.style.color = "var(--oasis-primary)";
    });
    // Append mic button to the input box's right side
    rightIcons.appendChild(micButton);
  }

  // Round send button on the right - add it inside the input box, after mic
  go.style.cssText = "width:36px; height:36px; border-radius:999px; background: var(--oasis-primary); color: #ffffff; border:none; display:flex; align-items:center; justify-content:center; flex:0 0 36px; min-width:36px; min-height:36px; aspect-ratio:1 / 1; flex-shrink:0; line-height:0; cursor:pointer; transition:opacity 0.15s ease, transform 0.05s ease; padding:0;";
  go.textContent = ""; // Clear any "Send" text
  go.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>';
  rightIcons.appendChild(go);

  box.appendChild(rightIcons);

  // Insert the box before the buttons
  if (bar.firstChild) {
    bar.insertBefore(box, bar.firstChild);
  } else {
    bar.appendChild(box);
  }

  // Hide the mic button's old spot (if it was added globally before styleComposer)
  // This logic is now handled by moving the micButton to rightIcons above.

  // Hide stop button in preview to match screenshot if present
  const stop = document.getElementById("stop");
  if (stop) stop.style.display = "none";
}

styleComposer();