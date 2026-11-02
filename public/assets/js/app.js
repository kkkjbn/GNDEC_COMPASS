/**
 * GNDEC One — application bootstrap and hash router.
 *
 * Routes are intentionally small and readable:
 *   #/today
 *   #/timetable[/:section]
 *   #/people[?tab=teachers|students|contacts]
 *   #/people/teacher/:id
 *   #/people/student/:crn
 *   #/rasta[?from=&to=&q=]
 *   #/rasta/place/:id
 *   #/rasta/room/:id
 *   #/study[?tab=syllabus|papers|notes|first-year]
 *   #/notices[/:id][?tab=holidays]
 *   #/exams
 *   #/assistant[?q=]
 *   #/settings
 *   #/admin
 *   #/about
 *   #/more
 */

import { $, $$, el, icon, setPageMeta, scrollTop, toast, openSheet, closeSheet, emptyState } from "./ui.js";
import { getState, subscribe, cycleTheme, themeLabel, resolvedTheme, dismiss } from "./store.js";
import { openProfileEditor } from "./components.js";
import { openSearch, close as closeSearch, isOpen as searchIsOpen, preloadSearch } from "./search.js";

const PAGES = {
  today: () => import("./pages/today.js"),
  timetable: () => import("./pages/timetable.js"),
  people: () => import("./pages/people.js"),
  rasta: () => import("./pages/rasta.js"),
  study: () => import("./pages/study.js"),
  notices: () => import("./pages/notices.js"),
  exams: () => import("./pages/exams.js"),
  assistant: () => import("./pages/assistant-page.js"),
  settings: () => import("./pages/settings.js"),
  admin: () => import("./pages/admin.js"),
  about: () => import("./pages/about.js"),
  more: () => import("./pages/more.js"),
};

const MAIN_TABS = new Set(["today", "timetable", "rasta", "study"]);
const sectionMeta = {
  today: ["GNDEC One", "Today"],
  timetable: ["Timetable", "Timetable"],
  people: ["People", "People"],
  rasta: ["Rasta · campus navigation", "Campus map"],
  study: ["Study", "Study"],
  notices: ["Notice board", "Notices"],
  exams: ["Examinations", "Exams"],
  assistant: ["Grounded assistant", "Assistant"],
  settings: ["Preferences", "Settings"],
  admin: ["Editorial console", "Data & coverage"],
  about: ["About", "GNDEC One"],
  more: ["Everything else", "More"],
};

let renderToken = 0;
let currentRoute = null;
let deferredInstall = null;
let installTimer = 0;

/* ------------------------------------------------------------------ */
/* Routing                                                             */
/* ------------------------------------------------------------------ */

function parseRoute() {
  const raw = location.hash.replace(/^#/, "") || "/today";
  const [pathPart, queryPart = ""] = raw.split("?");
  const segments = pathPart
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });
  const query = Object.fromEntries(new URLSearchParams(queryPart));
  return { segments, query };
}

function resolve(route) {
  const [root = "today", second, third] = route.segments;
  const page = PAGES[root] ? root : "notfound";
  const params = { ...route.query };

  if (root === "timetable" && second) params.id = second.toUpperCase();
  if (root === "people") {
    if (second === "teacher" && third) {
      params.kind = "teacher";
      params.id = third;
    } else if (second === "student" && third) {
      params.kind = "student";
      params.id = third;
    } else if (second) {
      params.tab = second;
    }
  }
  if (root === "rasta") {
    if (second === "place" && third) {
      params.kind = "place";
      params.id = third;
    } else if (second === "room" && third) {
      params.kind = "room";
      params.id = third;
    }
  }
  if (root === "notices" && second) params.id = second;

  return { page, params, root };
}

function activeKey(root) {
  if (MAIN_TABS.has(root)) return root;
  return "more";
}

function markNav(root) {
  const key = activeKey(root);
  for (const link of $$("[data-nav]")) {
    const own = link.dataset.nav;
    const inTabbar = Boolean(link.closest(".tabbar"));
    const on = inTabbar ? own === key : own === root;
    if (on) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

async function navigate() {
  const route = parseRoute();
  const { page, params, root } = resolve(route);
  const token = ++renderToken;
  closeSearch();
  closeSheet();
  closeSidebar();
  markNav(page === "notfound" ? root : root);
  scrollTop();

  const main = $("#main");
  if (!main) return;
  main.setAttribute("aria-busy", "true");
  main.classList.add("is-loading");

  const [kicker, title] = sectionMeta[root] || ["GNDEC One", "Not found"];
  if (page === "notfound") setPageMeta({ kicker: "404", title: "Page not found" });
  else setPageMeta({ kicker, title });

  main.replaceChildren(el("div", { class: "skeleton skeleton--hero", style: { marginBottom: "14px" } }));

  try {
    const module = page === "notfound" ? null : await PAGES[page]();
    if (token !== renderToken) return;
    main.replaceChildren();
    if (module?.render) {
      await module.render(main, params);
    } else {
      main.appendChild(
        emptyState({
          iconName: "compass",
          title: "This page does not exist",
          text: "The link may be old. Start from Today or search everything.",
          actionLabel: "Go to Today",
          onAction: () => {
            location.hash = "#/today";
          },
        }),
      );
    }
    main.dataset.route = root;
    currentRoute = route;
  } catch (err) {
    console.error("route failed", err);
    if (token !== renderToken) return;
    main.replaceChildren(
      el(
        "div",
        { class: "empty" },
        el("span", { class: "empty-icon" }, icon("alert")),
        el("strong", { text: "This page could not load" }),
        el("small", { text: String(err?.message || err) }),
        el("button", { class: "btn btn--soft btn--sm", type: "button", onclick: () => location.reload() }, "Reload"),
      ),
    );
  } finally {
    if (token === renderToken) {
      main.removeAttribute("aria-busy");
      main.classList.remove("is-loading");
    }
  }
}

function rerender() {
  if (!currentRoute) return;
  navigate();
}

/* ------------------------------------------------------------------ */
/* Sidebar                                                             */
/* ------------------------------------------------------------------ */

function openSidebar() {
  const sidebar = $("#sidebar");
  const scrim = $("#scrim");
  const button = $("#menu-btn");
  sidebar?.classList.add("is-open");
  if (scrim) scrim.hidden = false;
  if (button) button.setAttribute("aria-expanded", "true");
  document.body.classList.add("nav-open");
}

function closeSidebar() {
  const sidebar = $("#sidebar");
  const scrim = $("#scrim");
  const button = $("#menu-btn");
  sidebar?.classList.remove("is-open");
  if (scrim) scrim.hidden = true;
  if (button) button.setAttribute("aria-expanded", "false");
  document.body.classList.remove("nav-open");
}

function wireSidebar() {
  $("#menu-btn")?.addEventListener("click", () => {
    if ($("#sidebar")?.classList.contains("is-open")) closeSidebar();
    else openSidebar();
  });
  $("#scrim")?.addEventListener("click", closeSidebar);
  for (const link of $$(".side-nav a, .tabbar a")) link.addEventListener("click", closeSidebar);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && $("#sidebar")?.classList.contains("is-open")) closeSidebar();
  });
}

/* ------------------------------------------------------------------ */
/* Profile card & avatar                                               */
/* ------------------------------------------------------------------ */

function renderProfileCard() {
  const node = $("#profile-card");
  if (!node) return;
  const profile = getState().profile;
  node.replaceChildren();
  const button = el(
    "button",
    {
      class: profile.section ? "profile-mini" : "setup-card",
      type: "button",
      onclick: () => openProfileEditor({ onSaved: () => rerender() }),
    },
    el("span", { class: profile.section ? "avatar avatar--sm" : "avatar avatar--lg", style: { background: "var(--primary-soft)" } }, icon(profile.section ? "graduation" : "plus")),
    profile.section
      ? el(
          "div",
          { class: "profile-meta" },
          el("strong", { text: profile.name || "Your section" }),
          el("small", { text: `${profile.section}${profile.subgroup ? ` · ${profile.subgroup}` : ""}` }),
        )
      : el(
          "div",
          {},
          el("strong", { text: "Make it yours" }),
          el("small", { text: "Pick your section once" }),
        ),
    icon(profile.section ? "settings" : "chevron-right"),
  );
  node.appendChild(button);

  const avatar = $("#topbar-avatar");
  if (avatar) {
    const name = profile.name || profile.section || "G";
    avatar.textContent = name
      .replace(/^(dr|er|ms|mrs|mr|prof)\.?\s+/i, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "G";
  }
}

/* ------------------------------------------------------------------ */
/* Theme                                                               */
/* ------------------------------------------------------------------ */

const THEME_ICONS = { auto: "monitor", light: "sun", dark: "moon" };

function paintThemeButton() {
  const button = $("#theme-btn");
  if (!button) return;
  const mode = getState().settings.theme;
  button.replaceChildren(icon(THEME_ICONS[mode] || "sun"));
  button.setAttribute("aria-label", `Theme: ${themeLabel()}. Switch theme`);
  button.title = `Theme: ${themeLabel()}`;
}

function wireTheme() {
  paintThemeButton();
  $("#theme-btn")?.addEventListener("click", () => {
    const next = cycleTheme();
    paintThemeButton();
    toast(`Theme: ${themeLabel()}${next === "auto" ? ` (${resolvedTheme()})` : ""}`);
  });
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  media?.addEventListener?.("change", () => {
    if (getState().settings.theme === "auto") paintThemeButton();
  });
}

/* ------------------------------------------------------------------ */
/* Network status                                                      */
/* ------------------------------------------------------------------ */

function paintNetwork() {
  const bar = $("#offline-bar");
  if (!bar) return;
  const offline = navigator.onLine === false;
  const dismissed = getState().dismissed.offline;
  bar.hidden = !offline || dismissed;
}

function wireNetwork() {
  window.addEventListener("online", () => {
    paintNetwork();
    toast("Back online");
  });
  window.addEventListener("offline", () => {
    paintNetwork();
  });
  $("#offline-dismiss")?.addEventListener("click", () => {
    dismiss("offline");
    paintNetwork();
  });
  paintNetwork();
}

/* ------------------------------------------------------------------ */
/* Install                                                             */
/* ------------------------------------------------------------------ */

function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true;
}

function showInstallBanner() {
  if (isStandalone() || getState().dismissed.install) return;
  const banner = $("#install-banner");
  if (banner) banner.hidden = false;
  const mini = $("#install-mini");
  if (mini) mini.hidden = false;
}

function hideInstallBanner() {
  const banner = $("#install-banner");
  if (banner) banner.hidden = true;
}

async function installApp() {
  if (deferredInstall) {
    deferredInstall.prompt();
    const choice = await deferredInstall.userChoice.catch(() => null);
    deferredInstall = null;
    hideInstallBanner();
    if (choice?.outcome === "accepted") toast("Installing GNDEC One…");
    return;
  }
  if (isStandalone()) {
    toast("GNDEC One is already installed.");
    return;
  }
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  openSheet({
    title: "Install GNDEC One",
    body: el(
      "div",
      { class: "stack" },
      el("p", { class: "lede", text: ios ? "On iPhone or iPad, install from Safari:" : "Install from your browser menu:" }),
      el(
        "ol",
        { class: "small muted", style: { margin: "0 0 0 18px", lineHeight: 1.9 } },
        el("li", { text: ios ? "Tap the Share button in Safari." : "Open the browser menu (⋮ or ⋯)." }),
        el("li", { text: ios ? "Choose “Add to Home Screen”." : "Choose “Install app” or “Add to Home screen”." }),
        el("li", { text: "Confirm. The app opens without browser chrome and works offline." }),
      ),
      el("p", { class: "tiny faint", text: "Desktop Chrome and Edge also show an install icon in the address bar." }),
    ),
    actions: [{ label: "Got it", className: "btn--primary" }],
  });
}

function wireInstall() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstall = event;
    clearTimeout(installTimer);
    installTimer = setTimeout(showInstallBanner, 2600);
  });
  window.addEventListener("appinstalled", () => {
    deferredInstall = null;
    hideInstallBanner();
    toast("GNDEC One installed");
  });
  window.addEventListener("gndec:install-request", installApp);
  $("#install-btn")?.addEventListener("click", installApp);
  $("#install-mini")?.addEventListener("click", installApp);
  $("#install-dismiss")?.addEventListener("click", () => {
    dismiss("install");
    hideInstallBanner();
  });
  if (isStandalone()) hideInstallBanner();
}

/* ------------------------------------------------------------------ */
/* Service worker                                                      */
/* ------------------------------------------------------------------ */

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (!/^https?:$/.test(location.protocol)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              toast("An update is ready. Close and reopen the app to load it.");
            }
          });
        });
      })
      .catch((err) => console.warn("service worker registration failed", err));
  });
}

/* ------------------------------------------------------------------ */
/* Search & shortcuts                                                  */
/* ------------------------------------------------------------------ */

function wireSearch() {
  $("#search-btn")?.addEventListener("click", () => openSearch());
  window.addEventListener("keydown", (event) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (searchIsOpen()) closeSearch();
      else openSearch();
      return;
    }
    if (event.key === "/" && !typing && !searchIsOpen()) {
      event.preventDefault();
      openSearch();
      return;
    }
    if (event.key === "?" && !typing) {
      event.preventDefault();
      openSearch("help");
    }
  });

  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 2200));
  idle(() => preloadSearch());
}

/* ------------------------------------------------------------------ */
/* Store changes                                                       */
/* ------------------------------------------------------------------ */

function wireStore() {
  subscribe((_state, reason) => {
    if (reason === "profile" || reason === "import" || reason === "reset") {
      renderProfileCard();
      paintThemeButton();
    }
    if (reason === "settings") paintThemeButton();
    if (reason === "dismissed") paintNetwork();
  });
  window.addEventListener("gndec:profile-changed", () => {
    renderProfileCard();
    rerender();
  });
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function boot() {
  renderProfileCard();
  wireSidebar();
  wireTheme();
  wireNetwork();
  wireInstall();
  wireSearch();
  wireStore();
  registerServiceWorker();

  $("#avatar-btn")?.addEventListener("click", () => {
    if (getState().profile.section) location.hash = "#/settings";
    else openProfileEditor({ onSaved: () => rerender() });
  });

  window.addEventListener("hashchange", navigate);
  if (!location.hash) {
    location.replace(`${location.pathname}#/today`);
    return;
  }
  navigate();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
