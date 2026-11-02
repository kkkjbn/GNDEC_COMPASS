/**
 * Local, private, on-device state.
 *
 * Everything in here stays in localStorage. No account, no server, no analytics.
 * The store is intentionally tiny and synchronous: the UI reads it directly and
 * subscribes to changes instead of using a framework.
 */

const STORAGE_KEY = "gndec-one:state:v1";

const DEFAULTS = {
  version: 1,
  profile: {
    name: "",
    section: "",
    subgroup: "",
    crn: "",
  },
  settings: {
    theme: "auto", // auto | light | dark
    accent: "green", // green | blue | marigold
    size: "normal", // normal | large
    reduceMotion: false,
    ai: "auto", // auto | local
  },
  favourites: [], // [{ type, id, title, sub, to }]
  recent: [], // [{ type, id, title, to, at }]
  roomOverrides: {}, // room display name -> place id
  dismissed: { install: false, offline: false },
  chat: [], // last few assistant exchanges
  lastSeen: {}, // page -> timestamp
};

const listeners = new Set();
let state = load();

function clone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(DEFAULTS);
    const parsed = JSON.parse(raw);
    return {
      ...clone(DEFAULTS),
      ...parsed,
      profile: { ...DEFAULTS.profile, ...(parsed.profile || {}) },
      settings: { ...DEFAULTS.settings, ...(parsed.settings || {}) },
      dismissed: { ...DEFAULTS.dismissed, ...(parsed.dismissed || {}) },
      favourites: Array.isArray(parsed.favourites) ? parsed.favourites : [],
      recent: Array.isArray(parsed.recent) ? parsed.recent : [],
      roomOverrides: parsed.roomOverrides && typeof parsed.roomOverrides === "object" ? parsed.roomOverrides : {},
      chat: Array.isArray(parsed.chat) ? parsed.chat : [],
      lastSeen: parsed.lastSeen && typeof parsed.lastSeen === "object" ? parsed.lastSeen : {},
    };
  } catch {
    return clone(DEFAULTS);
  }
}

let saveTimer = 0;

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage can be full or blocked — the session still works */
    }
  }, 80);
}

function emit(reason) {
  for (const fn of listeners) {
    try {
      fn(state, reason);
    } catch (err) {
      console.error("store subscriber failed", err);
    }
  }
}

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function update(mutator, reason = "update") {
  const draft = clone(state);
  const result = mutator(draft);
  state = result && typeof result === "object" && !Array.isArray(result) ? result : draft;
  persist();
  applyPreferences();
  emit(reason);
  return state;
}

export function getProfile() {
  return state.profile;
}

export function setProfile(patch) {
  return update((draft) => {
    draft.profile = { ...draft.profile, ...patch };
  }, "profile");
}

export function clearProfile() {
  return update((draft) => {
    draft.profile = clone(DEFAULTS.profile);
  }, "profile");
}

export function hasProfile() {
  return Boolean(state.profile.section);
}

export function setSetting(key, value) {
  return update((draft) => {
    draft.settings[key] = value;
  }, "settings");
}

export function getSetting(key) {
  return state.settings[key];
}

export function toggleFavourite(item) {
  const exists = state.favourites.some((f) => f.type === item.type && f.id === item.id);
  update((draft) => {
    if (exists) draft.favourites = draft.favourites.filter((f) => !(f.type === item.type && f.id === item.id));
    else draft.favourites = [{ ...item, at: Date.now() }, ...draft.favourites].slice(0, 80);
  }, "favourites");
  return !exists;
}

export function isFavourite(type, id) {
  return state.favourites.some((f) => f.type === type && f.id === id);
}

export function addRecent(item) {
  if (!item || !item.to) return;
  update((draft) => {
    draft.recent = [
      { ...item, at: Date.now() },
      ...draft.recent.filter((r) => !(r.type === item.type && r.id === item.id)),
    ].slice(0, 12);
  }, "recent");
}

export function markSeen(page) {
  update((draft) => {
    draft.lastSeen[page] = Date.now();
  }, "seen");
}

export function dismiss(key) {
  return update((draft) => {
    draft.dismissed[key] = true;
  }, "dismissed");
}

export function setRoomOverride(roomName, placeId) {
  return update((draft) => {
    if (placeId) draft.roomOverrides[roomName] = placeId;
    else delete draft.roomOverrides[roomName];
  }, "rooms");
}

export function roomOverrides() {
  return state.roomOverrides;
}

export function pushChat(exchange) {
  return update((draft) => {
    draft.chat = [...draft.chat, exchange].slice(-12);
  }, "chat");
}

export function clearChat() {
  return update((draft) => {
    draft.chat = [];
  }, "chat");
}

export function exportState() {
  return {
    exportedAt: new Date().toISOString(),
    app: "gndec-one",
    ...clone(state),
  };
}

export function importState(raw) {
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!parsed || typeof parsed !== "object" || !parsed.profile) {
    throw new Error("This file does not look like a GNDEC One backup.");
  }
  return update((draft) => {
    draft.profile = { ...DEFAULTS.profile, ...(parsed.profile || {}) };
    draft.settings = { ...DEFAULTS.settings, ...(parsed.settings || {}) };
    draft.favourites = Array.isArray(parsed.favourites) ? parsed.favourites.slice(0, 80) : [];
    draft.recent = Array.isArray(parsed.recent) ? parsed.recent.slice(0, 12) : [];
    draft.roomOverrides = parsed.roomOverrides || {};
  }, "import");
}

export function resetAll() {
  state = clone(DEFAULTS);
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  applyPreferences();
  emit("reset");
}

/* ------------------------------------------------------------------ */
/* Preferences → document                                              */
/* ------------------------------------------------------------------ */

let mediaQuery = null;

function systemTheme() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolvedTheme() {
  return state.settings.theme === "auto" ? systemTheme() : state.settings.theme;
}

export function applyPreferences() {
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme();
  root.dataset.accent = state.settings.accent || "green";
  root.dataset.size = state.settings.size === "large" ? "large" : "normal";
  root.dataset.reduceMotion = state.settings.reduceMotion ? "true" : "false";
  const themeColor = resolvedTheme() === "dark" ? "#0f1512" : "#0f3d2e";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", themeColor);
}

export function watchSystemTheme() {
  if (!window.matchMedia || mediaQuery) return;
  mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (state.settings.theme === "auto") applyPreferences();
  };
  if (mediaQuery.addEventListener) mediaQuery.addEventListener("change", onChange);
  else if (mediaQuery.addListener) mediaQuery.addListener(onChange);
}

export function cycleTheme() {
  const order = ["auto", "light", "dark"];
  const next = order[(order.indexOf(state.settings.theme) + 1) % order.length];
  setSetting("theme", next);
  return next;
}

export function themeLabel() {
  return { auto: "System", light: "Light", dark: "Dark" }[state.settings.theme] || "System";
}

/* Apply immediately, before the first render. */
applyPreferences();
watchSystemTheme();
