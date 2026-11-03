import { el, icon, setPageMeta, toast, confirmSheet, downloadJson, fmtShortDate } from "../ui.js";
import { getState, setSetting, resetAll, exportState, importState, resolvedTheme } from "../store.js";
import { prefetchAll, clearDataCaches, storageEstimate, prettyBytes } from "../data.js";
import { pageHead, callout, openProfileEditor } from "../components.js";

const THEMES = [
  ["auto", "System", "monitor"],
  ["light", "Light", "sun"],
  ["dark", "Dark", "moon"],
];

const ACCENTS = [
  ["green", "Deep green"],
  ["blue", "Steel blue"],
  ["marigold", "Marigold"],
];

function segmented(options, active, onPick) {
  let current = active;
  const group = el("div", { class: "chip-row", role: "group" });
  for (const [value, label, iconName] of options) {
    const button = el(
      "button",
      {
        class: `chip ${current === value ? "is-active" : ""}`.trim(),
        type: "button",
        "aria-pressed": current === value ? "true" : "false",
        onclick: () => {
          current = value;
          for (const child of group.querySelectorAll("button")) {
            const on = child.dataset.value === value;
            child.classList.toggle("is-active", on);
            child.setAttribute("aria-pressed", on ? "true" : "false");
          }
          onPick(value);
        },
      },
      iconName ? icon(iconName) : null,
      label,
    );
    button.dataset.value = value;
    group.appendChild(button);
  }
  return group;
}

export async function render(root) {
  setPageMeta({ kicker: "Preferences", title: "Settings" });
  let online = navigator.onLine !== false;
  let estimate = await storageEstimate();
  const state = getState();
  const profile = state.profile;
  const sectionLabel = profile.section ? profile.section : "No section chosen";

  const profileCard = el(
    "div",
    { class: "card card--pad" },
    el(
      "div",
      { class: "section-head" },
      el("h2", { text: "Your profile" }),
      el(
        "span",
        { class: profile.source === "official-roster" ? "badge badge--ok" : "badge badge--muted", text: profile.source === "official-roster" ? "Matched to official roster" : "On this device" },
      ),
    ),
    el(
      "div",
      { class: "row row--between row--wrap", style: { gap: "12px" } },
      el(
        "div",
        { class: "row", style: { gap: "12px" } },
        el("span", { class: "avatar avatar--lg", style: { background: "var(--primary-soft)" } }, icon("graduation")),
        el(
          "div",
          {},
          el("strong", { text: profile.name || "Student" }),
          el(
            "p",
            { class: "small muted", text: `${sectionLabel}${profile.subgroup ? ` · ${profile.subgroup}` : ""}${profile.crn ? ` · CRN ${profile.crn}` : ""}` },
          ),
          profile.branch || profile.year
            ? el("p", { class: "small muted", text: [profile.branch && `${profile.branch}`, profile.year && `Year ${profile.year}`, profile.batch && `Batch ${profile.batch}`].filter(Boolean).join(" · ") })
            : "",
          profile.mentor ? el("p", { class: "tiny faint", text: `Mentor: ${profile.mentor}${profile.mentorVenue ? ` · ${profile.mentorVenue}` : ""}${profile.mentorPhone ? ` · ${profile.mentorPhone}` : ""}` }) : "",
          el("p", { class: "tiny faint", text: "Used by Today, the timetable and Ask Compass. It never leaves this device." }),
        ),
      ),
      el("button", { class: "btn btn--soft btn--sm", type: "button", onclick: () => openProfileEditor() }, icon("settings"), "Edit"),
    ),
  );

  const appearance = el(
    "div",
    { class: "card card--pad" },
    el("div", { class: "section-head" }, el("h2", { text: "Appearance" }), el("span", { class: "small muted", text: resolvedTheme() === "dark" ? "Dark now" : "Light now" })),
    el(
      "div",
      { class: "setting-row" },
      el("div", { class: "setting-main" }, el("strong", { text: "Theme" }), el("small", { text: "System follows your phone's light/dark setting." })),
      segmented(THEMES, state.settings.theme, (value) => setSetting("theme", value)),
    ),
    el(
      "div",
      { class: "setting-row" },
      el("div", { class: "setting-main" }, el("strong", { text: "Accent" }), el("small", { text: "Used for highlights, links and active states." })),
      segmented(ACCENTS.map(([value, label]) => [value, label, ""]), state.settings.accent, (value) => {
        setSetting("accent", value);
      }),
    ),
    el(
      "div",
      { class: "setting-row" },
      el("div", { class: "setting-main" }, el("strong", { text: "Larger text" }), el("small", { text: "Increases the base size without breaking layout." })),
      el(
        "button",
        {
          class: `btn btn--sm ${state.settings.size === "large" ? "btn--primary" : "btn--soft"}`,
          type: "button",
          "aria-pressed": state.settings.size === "large" ? "true" : "false",
          onclick: (event) => {
            const next = getState().settings.size === "large" ? "normal" : "large";
            setSetting("size", next);
            const on = next === "large";
            event.currentTarget.classList.toggle("btn--primary", on);
            event.currentTarget.classList.toggle("btn--soft", !on);
            event.currentTarget.setAttribute("aria-pressed", on ? "true" : "false");
            event.currentTarget.textContent = on ? "Large text on" : "Large text off";
          },
        },
        state.settings.size === "large" ? "Large text on" : "Large text off",
      ),
    ),
    el(
      "div",
      { class: "setting-row" },
      el("div", { class: "setting-main" }, el("strong", { text: "Reduce motion" }), el("small", { text: "Turns off page and card transitions." })),
      el(
        "button",
        {
          class: `btn btn--sm ${state.settings.reduceMotion ? "btn--primary" : "btn--soft"}`,
          type: "button",
          "aria-pressed": state.settings.reduceMotion ? "true" : "false",
          onclick: (event) => {
            const next = !getState().settings.reduceMotion;
            setSetting("reduceMotion", next);
            event.currentTarget.classList.toggle("btn--primary", next);
            event.currentTarget.classList.toggle("btn--soft", !next);
            event.currentTarget.setAttribute("aria-pressed", next ? "true" : "false");
            event.currentTarget.textContent = next ? "Motion reduced" : "Reduce motion";
          },
        },
        state.settings.reduceMotion ? "Motion reduced" : "Reduce motion",
      ),
    ),
  );

  const progress = el("div", { class: "tiny faint", text: estimate ? `${prettyBytes(estimate.usage)} used · ${prettyBytes(estimate.quota)} available` : "Storage estimate unavailable in this browser." });
  const offlineButton = el("button", { class: "btn btn--primary btn--sm", type: "button" }, icon("download"), "Download for offline");
  offlineButton.addEventListener("click", async () => {
    offlineButton.disabled = true;
    offlineButton.replaceChildren(icon("download"), "Downloading…");
    try {
      const result = await prefetchAll((done, total) => {
        progress.textContent = `Caching ${done} of ${total} files…`;
      });
      estimate = await storageEstimate();
      progress.textContent = result.failures.length
        ? `Cached ${result.cached} of ${result.total} files · ${result.failures.length} could not be fetched.`
        : `All ${result.total} files cached${estimate ? ` · ${prettyBytes(estimate.usage)} used` : ""}.`;
      toast("GNDEC One is ready offline");
    } catch (err) {
      progress.textContent = String(err?.message || "Offline download failed.");
      toast("Could not download everything", "error");
    } finally {
      offlineButton.disabled = false;
      offlineButton.replaceChildren(icon("download"), "Download for offline");
    }
  });

  const dataCard = el(
    "div",
    { class: "card card--pad" },
    el("div", { class: "section-head" }, el("h2", { text: "Data & offline" }), el("span", { class: `badge ${online ? "badge--ok" : "badge--muted"}`.trim(), text: online ? "Online" : "Offline" })),
    el(
      "p",
      { class: "small muted" },
      "The app loads data on demand. One download caches the timetable, people, papers, syllabus, notices and map so everything keeps working without a network.",
    ),
    el("div", { class: "row", style: { gap: "8px", flexWrap: "wrap", marginTop: "10px" } }, offlineButton, el("button", { class: "btn btn--sm", type: "button", onclick: () => window.dispatchEvent(new CustomEvent("gndec:install-request")) }, icon("plus"), "Install app")),
    progress,
    el(
      "div",
      { class: "setting-row", style: { marginTop: "12px" } },
      el("div", { class: "setting-main" }, el("strong", { text: "Clear cached data" }), el("small", { text: "Keeps your profile and favourites. The next visit downloads fresh JSON." })),
      el(
        "button",
        {
          class: "btn btn--sm btn--ghost",
          type: "button",
          onclick: () =>
            confirmSheet({
              title: "Clear cached data?",
              message: "Downloads and cached JSON will be removed. Your profile, favourites and settings stay.",
              confirmLabel: "Clear cache",
              danger: true,
              onConfirm: async () => {
                await clearDataCaches();
                estimate = await storageEstimate();
                progress.textContent = estimate ? `${prettyBytes(estimate.usage)} used · ${prettyBytes(estimate.quota)} available` : "Cache cleared.";
                toast("Cached data cleared");
              },
            }),
        },
        icon("trash"),
        "Clear",
      ),
    ),
  );

  const assistantCard = el(
    "div",
    { class: "card card--pad" },
    el("div", { class: "section-head" }, el("h2", { text: "Assistant" }), el("span", { class: "badge badge--muted", text: getState().settings.ai === "local" ? "Local only" : "Cloud when online" })),
    el(
      "div",
      { class: "setting-row" },
      el("div", { class: "setting-main" }, el("strong", { text: "Answer locally when possible" }), el("small", { text: "Local answers work fully offline. Turning this on also prevents cloud calls when online." })),
      el(
        "button",
        {
          class: `btn btn--sm ${getState().settings.ai === "local" ? "btn--primary" : "btn--soft"}`,
          type: "button",
          onclick: (event) => {
            const next = getState().settings.ai === "local" ? "auto" : "local";
            setSetting("ai", next);
            const on = next === "local";
            event.currentTarget.classList.toggle("btn--primary", on);
            event.currentTarget.classList.toggle("btn--soft", !on);
            event.currentTarget.textContent = on ? "Local only" : "Use cloud when online";
            toast(on ? "Local-only answers" : "Cloud answers enabled");
          },
        },
        getState().settings.ai === "local" ? "Local only" : "Use cloud when online",
      ),
    ),
    el("p", { class: "tiny faint", style: { marginTop: "8px" }, text: "Questions are never stored on a server. The optional cloud proxy receives only the question and a context block built from public data." }),
  );

  const fileInput = el("input", { type: "file", accept: "application/json,.json", style: { display: "none" } });
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      importState(await file.text());
      toast("Backup restored");
      setTimeout(() => location.reload(), 400);
    } catch (err) {
      toast(String(err?.message || "That backup could not be read."), "error");
    }
  });

  const backupCard = el(
    "div",
    { class: "card card--pad" },
    el("div", { class: "section-head" }, el("h2", { text: "Backup & reset" })),
    el("p", { class: "small muted", text: "Your profile, favourites, room corrections and chat live only in this browser. Export them before changing devices." }),
    el(
      "div",
      { class: "row", style: { gap: "8px", flexWrap: "wrap", marginTop: "10px" } },
      el("button", { class: "btn btn--sm", type: "button", onclick: () => downloadJson(`gndec-one-backup-${new Date().toISOString().slice(0, 10)}.json`, exportState()) }, icon("download"), "Export backup"),
      el("button", { class: "btn btn--sm", type: "button", onclick: () => fileInput.click() }, icon("upload"), "Import backup"),
      fileInput,
      el(
        "button",
        {
          class: "btn btn--sm btn--ghost",
          type: "button",
          onclick: () =>
            confirmSheet({
              title: "Reset GNDEC One?",
              message: "This removes your profile, favourites, chat, room corrections and settings from this browser. Cached downloads may remain.",
              confirmLabel: "Reset everything",
              danger: true,
              onConfirm: () => {
                resetAll();
                toast("App reset");
                setTimeout(() => location.reload(), 300);
              },
            }),
        },
        icon("trash"),
        "Reset",
      ),
    ),
    el("p", { class: "tiny faint", style: { marginTop: "10px" }, text: `Last data build: ${getState().lastSeen?.today ? fmtShortDate(new Date(getState().lastSeen.today)) : "this session"}.` }),
  );

  root.replaceChildren(
    el(
      "div",
      { class: "page-enter stack", style: { gap: "16px" } },
      pageHead({
        kicker: "Preferences",
        title: "Settings",
        lede: "Make the app yours. Everything here is stored on this device, with no account and no tracking.",
        actions: [el("a", { class: "btn btn--soft btn--sm", href: "#/about" }, icon("info"), "About the app")],
      }),
      el(
        "div",
        { class: "grid grid--2", style: { alignItems: "start" } },
        el("div", { class: "stack" }, profileCard, appearance, dataCard),
        el("div", { class: "stack" }, assistantCard, backupCard, callout("This app is a reader for publicly published college data. It is not an official GNDEC service and never asks for your ERP password.", { iconName: "shield" })),
      ),
    ),
  );
}
