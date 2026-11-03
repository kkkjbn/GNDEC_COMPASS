/**
 * Command palette — one search box for every public thing in the app.
 * The index is a generated JSON file, loaded only when the palette opens.
 */

import { load } from "./data.js";
import { getState } from "./store.js";
import { $, el, icon, clear, debounce } from "./ui.js";

const GROUP_ORDER = ["page", "section", "teacher", "student", "room", "place", "paper", "syllabus", "notes", "notice"];
const GROUP_LABEL = {
  page: "Sections",
  section: "Timetables",
  teacher: "Teachers",
  student: "Students",
  room: "Rooms",
  place: "Campus",
  paper: "Previous papers",
  syllabus: "Syllabus",
  notes: "Question banks",
  notice: "Notices",
};
const TYPE_ICON = {
  page: "compass",
  section: "calendar",
  teacher: "users",
  student: "graduation",
  room: "pin",
  place: "map",
  paper: "file",
  syllabus: "book",
  notes: "file-check",
  notice: "bell",
};
const TYPE_LABEL = {
  page: "Page",
  section: "Section",
  teacher: "Teacher",
  student: "Student",
  room: "Room",
  place: "Place",
  paper: "Paper",
  syllabus: "Syllabus",
  notes: "Notes",
  notice: "Notice",
};

let indexPromise = null;
let entries = [];
let active = 0;
let results = [];
let input = null;
let listNode = null;
let paletteNode = null;
let lastQuery = "";
let visible = false;

function index() {
  if (!indexPromise) {
    indexPromise = load("search")
      .then((data) => {
        entries = data.entries || [];
        return entries;
      })
      .catch((err) => {
        console.error("search index failed", err);
        entries = [];
        return [];
      });
  }
  return indexPromise;
}

function normalise(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function scoreEntry(entry, query) {
  const title = normalise(entry.title);
  const sub = normalise(entry.sub);
  const key = normalise(entry.k);
  const tokens = query.split(" ").filter(Boolean);
  const hay = `${title} ${sub} ${key} ${normalise(entry.id)} ${normalise(entry.to)}`;
  if (!tokens.every((token) => hay.includes(token))) return 0;
  let score = 0;
  if (title === query) score += 300;
  if (title.startsWith(query)) score += 180;
  if (title.includes(query)) score += 90;
  if (sub.includes(query)) score += 35;
  if (key.includes(query)) score += 25;
  for (const token of tokens) {
    if (title.includes(token)) score += 16;
    if (key.includes(token)) score += 7;
  }
  // Exact-looking codes and CRNs should beat prose.
  if (/^[a-z]{1,5}[- ]?\d{2,4}$/.test(query) && new RegExp(`\\b${query.replace(/[- ]/g, "[- ]?")}\\b`).test(normalise(`${entry.title} ${entry.sub}`))) score += 60;
  return score;
}

function search(query) {
  const q = normalise(query);
  if (!q) return [];
  const scored = [];
  for (const entry of entries) {
    const score = scoreEntry(entry, q);
    if (score > 0) scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title));
  const perGroup = new Map();
  const output = [];
  for (const row of scored) {
    const type = row.entry.t;
    const count = perGroup.get(type) || 0;
    if (count >= 6) continue;
    perGroup.set(type, count + 1);
    output.push(row.entry);
    if (output.length >= 48) break;
  }
  return output;
}

function defaultEntries() {
  const state = getState();
  const favourites = (state.favourites || []).slice(0, 6);
  const recent = (state.recent || []).slice(0, 6);
  if (favourites.length || recent.length) {
    const seen = new Set();
    return [...favourites, ...recent].filter((item) => {
      const key = `${item.type}:${item.id}`;
      if (seen.has(key) || !item.to) return false;
      seen.add(key);
      return true;
    }).slice(0, 10);
  }
  return entries.filter((entry) => entry.t === "page").slice(0, 8);
}

function groupResults(items) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.t)) groups.set(item.t, []);
    groups.get(item.t).push(item);
  }
  return [...groups.entries()].sort((a, b) => GROUP_ORDER.indexOf(a[0]) - GROUP_ORDER.indexOf(b[0]));
}

function render(query = "") {
  if (!listNode) return;
  clear(listNode);
  lastQuery = query;
  const items = query.trim() ? search(query) : defaultEntries();
  results = items;
  active = 0;

  if (!query.trim() && !items.length) {
    listNode.appendChild(
      el("div", { class: "empty" }, el("strong", { text: "Start typing" }), el("small", { text: "Teachers, sections, rooms, papers, notices — all in one place." })),
    );
    return;
  }

  if (!items.length) {
    listNode.appendChild(
      el(
        "div",
        { class: "empty" },
        el("span", { class: "empty-icon" }, icon("search")),
        el("strong", { text: "No match" }),
        el("small", { text: "Try a section code (D2CSA), a teacher's surname, a room (F107) or a paper code (BTCS-304)." }),
      ),
    );
    return;
  }

  const groups = groupResults(items);
  let flatIndex = 0;
  for (const [type, group] of groups) {
    const title = !query.trim() ? (type === "page" ? "Saved & recent" : GROUP_LABEL[type] || type) : GROUP_LABEL[type] || type;
    listNode.appendChild(el("div", { class: "palette-group-title", text: title }));
    for (const item of group) {
      const index = flatIndex;
      flatIndex += 1;
      const row = el(
        "a",
        {
          class: `palette-item ${index === active ? "is-active" : ""}`.trim(),
          href: item.to,
          role: "option",
          "data-index": index,
          onclick: (event) => {
            event.preventDefault();
            choose(item);
          },
          onmouseenter: () => setActive(index, false),
        },
        el("span", { class: "p-icon" }, icon(TYPE_ICON[item.t] || "pin")),
        el(
          "span",
          { class: "p-main" },
          el("strong", { text: item.title }),
          el("small", { text: item.sub || "" }),
        ),
        el("span", { class: "p-type", text: TYPE_LABEL[item.t] || item.t }),
      );
      listNode.appendChild(row);
    }
  }
}

function setActive(index, scroll = true) {
  const rows = listNode ? [...listNode.querySelectorAll(".palette-item")] : [];
  if (!rows.length) return;
  active = Math.max(0, Math.min(index, rows.length - 1));
  rows.forEach((row, i) => row.classList.toggle("is-active", i === active));
  if (scroll) rows[active]?.scrollIntoView({ block: "nearest" });
}

function choose(item) {
  if (!item) return;
  close();
  if (item.url) window.open(item.url, "_blank", "noopener");
  else window.gndecNavigate?.(item.to) || (location.hash = item.to);
}

export function openSearch(initial = "") {
  const root = $("#palette-root");
  if (!root) return;
  visible = true;
  root.classList.add("is-open");
  document.body.style.overflow = "hidden";

  paletteNode = el("div", { class: "palette", role: "dialog", "aria-modal": "true", "aria-label": "Search GNDEC One" });
  input = el("input", {
    type: "search",
    placeholder: "Search sections, teachers, rooms, papers…",
    "aria-label": "Search everything",
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: "false",
  });
  listNode = el("div", { class: "palette-results", role: "listbox" });

  const onInput = debounce(() => render(input.value), 70);

  const head = el(
    "div",
    { class: "palette-search" },
    icon("search"),
    input,
    el("kbd", { text: "Esc" }),
  );

  const foot = el(
    "div",
    { class: "palette-foot" },
    el("span", {}, el("kbd", { text: "↑↓" }), " navigate"),
    el("span", {}, el("kbd", { text: "↵" }), " open"),
    el("span", {}, el("kbd", { text: "Esc" }), " close"),
  );

  paletteNode.append(head, listNode, foot);
  clear(root);
  root.appendChild(paletteNode);

  input.addEventListener("input", onInput);
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(active + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(active - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(results[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  });

  root.onclick = (event) => {
    if (event.target === root) close();
  };
  document.addEventListener("keydown", onDocumentKey, true);

  listNode.appendChild(el("div", { class: "empty" }, el("small", { text: "Loading index…" })));
  setTimeout(() => input?.focus(), 30);

  index().then(() => {
    if (!visible) return;
    render(initial);
    if (initial) {
      input.value = initial;
      render(initial);
    }
  });
}

function onDocumentKey(event) {
  if (!visible) return;
  if (event.key === "Escape") {
    event.preventDefault();
    close();
  }
}

export function close() {
  visible = false;
  const root = $("#palette-root");
  if (!root) return;
  root.classList.remove("is-open");
  clear(root);
  document.body.style.overflow = "";
  document.removeEventListener("keydown", onDocumentKey, true);
  paletteNode = null;
  input = null;
  listNode = null;
  lastQuery = "";
}

export function isOpen() {
  return visible;
}

export function preloadSearch() {
  index();
}
