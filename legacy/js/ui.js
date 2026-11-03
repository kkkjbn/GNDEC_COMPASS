/**
 * Small DOM + interaction toolkit. No framework, no dependencies.
 */

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === "class" || key === "className") node.className = value;
    else if (key === "text") node.textContent = String(value);
    else if (key === "html") node.innerHTML = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key === "style" && typeof value === "object") Object.assign(node.style, value);
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) node.setAttribute(key, "");
    else node.setAttribute(key, String(value));
  }
  append(node, children);
  return node;
}

export function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    if (child instanceof Node) node.appendChild(child);
    else node.appendChild(document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function frag(...children) {
  const f = document.createDocumentFragment();
  append(f, children);
  return f;
}

const SVG_NS = "http://www.w3.org/2000/svg";

export function icon(name, className = "") {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", `icon ${className}`.trim());
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `#i-${name}`);
  svg.appendChild(use);
  return svg;
}

export function iconButton(name, label, onClick, className = "") {
  return el(
    "button",
    { class: `icon-btn ${className}`.trim(), type: "button", "aria-label": label, onclick: onClick },
    icon(name),
  );
}

export function badge(text, variant = "", iconName = "") {
  return el(
    "span",
    { class: `badge ${variant ? `badge--${variant}` : ""}`.trim() },
    iconName ? icon(iconName) : null,
    text,
  );
}

/* ------------------------------------------------------------------ */
/* Time & dates                                                        */
/* ------------------------------------------------------------------ */

export function parseDate(value) {
  if (value instanceof Date) return value;
  if (!value) return new Date();
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [y, m, d] = String(value).split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function toMinutes(time) {
  const match = String(time || "").match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function fmtTime(time) {
  const mins = toMinutes(time);
  if (mins == null) return String(time || "");
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function fmtRange(start, end) {
  if (!start) return "";
  return `${fmtTime(start)}${end ? ` – ${fmtTime(end)}` : ""}`;
}

export function nowMinutes(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

export function todayIndex(date = new Date()) {
  const day = date.getDay(); // Sunday = 0
  return day === 0 ? -1 : day - 1;
}

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function fmtDate(value, options = {}) {
  const date = parseDate(value);
  return date.toLocaleDateString("en-IN", {
    weekday: options.weekday === false ? undefined : "short",
    day: "numeric",
    month: options.month || "short",
    year: options.year === false ? undefined : "numeric",
  });
}

export function fmtShortDate(value) {
  return parseDate(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function relativeDay(value) {
  const date = parseDate(value);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((target - start) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return fmtShortDate(date);
}

export function timeAgo(value) {
  const date = parseDate(value);
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (!Number.isFinite(seconds)) return "";
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return fmtShortDate(date);
}

export function duration(mins) {
  if (mins == null || mins < 0) return "";
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h} hr${h === 1 ? "" : "s"}${m ? ` ${m} min` : ""}`;
}

/* ------------------------------------------------------------------ */
/* Names, avatars                                                      */
/* ------------------------------------------------------------------ */

export function initials(name = "") {
  const clean = String(name)
    .replace(/\b(dr|er|ms|mrs|mr|prof|sh|smt)\b\.?/gi, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[^A-Za-z ]/g, " ")
    .trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (!parts.length) return "G";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function avatarEl(name, photo = "", size = "", extraClass = "") {
  const node = el("span", { class: `avatar ${size ? `avatar--${size}` : ""} ${extraClass}`.trim() });
  node.textContent = initials(name);
  if (photo) {
    const img = el("img", {
      src: photo,
      alt: "",
      loading: "lazy",
      decoding: "async",
      referrerpolicy: "no-referrer",
    });
    img.addEventListener("error", () => {
      img.remove();
      node.textContent = initials(name);
    });
    node.appendChild(img);
  }
  return node;
}

/* ------------------------------------------------------------------ */
/* Safe URLs, copy, download, share                                    */
/* ------------------------------------------------------------------ */

export function safeUrl(url = "") {
  try {
    const parsed = new URL(String(url), location.origin);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
  } catch {
    /* ignore */
  }
  return "";
}

export async function copyText(text, message = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = el("textarea", { style: { position: "fixed", opacity: "0" } });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  toast(message, "ok");
}

export function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function share({ title, text, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return true;
    } catch {
      return false;
    }
  }
  await copyText(url, "Link copied");
  return true;
}

/* ------------------------------------------------------------------ */
/* Toast                                                               */
/* ------------------------------------------------------------------ */

export function toast(message, kind = "", timeout = 3200) {
  const root = $("#toast-root");
  if (!root) return;
  const node = el(
    "div",
    { class: `toast ${kind === "error" ? "toast--error" : ""}`.trim(), role: "status" },
    icon(kind === "error" ? "alert" : "check"),
    el("span", { text: message }),
  );
  root.appendChild(node);
  setTimeout(() => {
    node.style.opacity = "0";
    node.style.transform = "translateY(6px)";
    node.style.transition = "opacity .2s, transform .2s";
    setTimeout(() => node.remove(), 220);
  }, timeout);
}

/* ------------------------------------------------------------------ */
/* Sheet / dialog                                                      */
/* ------------------------------------------------------------------ */

let sheetCleanup = null;

export function closeSheet() {
  const root = $("#sheet-root");
  if (!root) return;
  root.classList.remove("is-open");
  clear(root);
  document.body.style.overflow = "";
  if (sheetCleanup) {
    const cleanup = sheetCleanup;
    sheetCleanup = null;
    cleanup();
  }
}

export function openSheet({ title = "", body, actions = [], wide = false, onClose } = {}) {
  closeSheet();
  const root = $("#sheet-root");
  if (!root) return () => {};

  const lastFocus = document.activeElement;
  const panel = el("div", { class: `sheet ${wide ? "sheet--wide" : ""}`.trim(), role: "dialog", "aria-modal": "true" });
  panel.appendChild(el("div", { class: "sheet-handle", "aria-hidden": "true" }));

  const head = el(
    "div",
    { class: "sheet-head" },
    el("h2", { text: title }),
    iconButton("x", "Close", () => closeSheet()),
  );
  panel.appendChild(head);

  const bodyNode = el("div", { class: "sheet-body" });
  if (typeof body === "function") bodyNode.appendChild(body());
  else if (body instanceof Node) bodyNode.appendChild(body);
  else if (typeof body === "string") bodyNode.appendChild(el("p", { class: "lede", text: body }));
  panel.appendChild(bodyNode);

  if (actions.length) {
    const foot = el("div", { class: "sheet-foot" });
    for (const action of actions) {
      if (!action) continue;
      foot.appendChild(
        el(
          "button",
          {
            class: `btn ${action.className || ""}`.trim(),
            type: "button",
            onclick: async () => {
              if (action.onClick) await action.onClick();
              if (action.close !== false) closeSheet();
            },
          },
          action.icon ? icon(action.icon) : null,
          action.label,
        ),
      );
    }
    panel.appendChild(foot);
  }

  root.appendChild(panel);
  root.classList.add("is-open");
  document.body.style.overflow = "hidden";

  const focusable = () =>
    $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', panel).filter(
      (node) => !node.disabled && node.offsetParent !== null,
    );

  const onKey = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSheet();
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusable();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const onBackdrop = (event) => {
    if (event.target === root) closeSheet();
  };

  root.addEventListener("click", onBackdrop);
  document.addEventListener("keydown", onKey);
  sheetCleanup = () => {
    root.removeEventListener("click", onBackdrop);
    document.removeEventListener("keydown", onKey);
    if (onClose) onClose();
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  };

  setTimeout(() => {
    const firstInput = panel.querySelector("input, textarea, select");
    const items = focusable();
    (firstInput || items[0] || panel).focus?.();
  }, 40);

  return closeSheet;
}

export function confirmSheet({ title, message, confirmLabel = "Confirm", danger = false, onConfirm }) {
  openSheet({
    title,
    body: el("p", { class: "lede", text: message }),
    actions: [
      { label: "Cancel", className: "btn--ghost", close: true },
      {
        label: confirmLabel,
        className: danger ? "btn--danger" : "btn--primary",
        onClick: onConfirm,
      },
    ],
  });
}

/* ------------------------------------------------------------------ */
/* Common blocks                                                       */
/* ------------------------------------------------------------------ */

export function emptyState({ iconName = "search", title, text, actionLabel, onAction } = {}) {
  return el(
    "div",
    { class: "empty" },
    el("span", { class: "empty-icon" }, icon(iconName)),
    el("strong", { text: title || "Nothing here yet" }),
    text ? el("small", { text }) : null,
    actionLabel
      ? el("button", { class: "btn btn--soft btn--sm", type: "button", onclick: onAction }, actionLabel)
      : null,
  );
}

export function skeletonPage(kind = "default") {
  if (kind === "today") {
    return el(
      "div",
      { class: "stack", "aria-busy": "true", "aria-label": "Loading" },
      el("div", { class: "skeleton skeleton--hero" }),
      el(
        "div",
        { class: "grid grid--2" },
        el("div", { class: "skeleton skeleton--card" }),
        el("div", { class: "skeleton skeleton--card" }),
      ),
    );
  }
  return el(
    "div",
    { class: "stack", "aria-busy": "true", "aria-label": "Loading" },
    el("div", { class: "skeleton", style: { height: "54px", maxWidth: "320px" } }),
    el(
      "div",
      { class: "grid grid--3" },
      el("div", { class: "skeleton skeleton--card" }),
      el("div", { class: "skeleton skeleton--card" }),
      el("div", { class: "skeleton skeleton--card" }),
    ),
  );
}

export function sectionHead(title, linkLabel, href) {
  return el(
    "div",
    { class: "section-head" },
    el("h2", { text: title }),
    linkLabel && href
      ? el("a", { class: "link", href }, linkLabel, icon("chevron-right"))
      : null,
  );
}

export function categoryIcon(category = "") {
  return (
    {
      academic: "building",
      lab: "layers",
      admin: "shield",
      gate: "navigation",
      library: "book",
      food: "coffee",
      sports: "heart",
      hostel: "home",
      health: "plus",
      bank: "building",
      landmark: "star",
      other: "pin",
    }[category] || "pin"
  );
}

export function noticeIcon(kind = "") {
  return (
    {
      exam: "file-check",
      admin: "shield",
      event: "sparkles",
      admission: "graduation",
      general: "bell",
    }[kind] || "bell"
  );
}

export function categoryLabel(category = "") {
  return (
    {
      academic: "Academic",
      lab: "Lab / workshop",
      admin: "Admin",
      gate: "Gate",
      library: "Library",
      food: "Food",
      sports: "Sports",
      hostel: "Hostel",
      health: "Health",
      bank: "Bank",
      landmark: "Landmark",
    }[category] || "Place"
  );
}

export function debounce(fn, wait = 120) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function isOnline() {
  return navigator.onLine !== false;
}

export function setPageMeta({ title, kicker }) {
  const titleNode = $("#page-title");
  const kickerNode = $("#page-kicker");
  if (titleNode) titleNode.textContent = title || "GNDEC One";
  if (kickerNode) kickerNode.textContent = kicker || "GNDEC One";
  document.title = title && title !== "GNDEC One" ? `${title} · GNDEC One` : "GNDEC One";
}

export function scrollTop() {
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

export function linkButton(label, href, { className = "btn", iconName = "", external = false } = {}) {
  return el(
    "a",
    {
      class: className,
      href,
      ...(external ? { target: "_blank", rel: "noopener" } : {}),
    },
    iconName ? icon(iconName) : null,
    label,
  );
}
