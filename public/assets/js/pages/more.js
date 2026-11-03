import { el, icon, setPageMeta, toast, share } from "../ui.js";
import { getState } from "../store.js";
import { load } from "../data.js";
import { pageHead, callout, greeting } from "../components.js";

const LINKS = [
  ["calendar", "Timetable", "All sections, groups and teachers", "#/timetable"],
  ["users", "People", "Teachers, students and offices", "#/people"],
  ["map", "Rasta", "Rooms, blocks, gates and routes", "#/rasta"],
  ["book", "Study", "Syllabus, papers and question banks", "#/study"],
  ["heart", "Campus life", "Clubs, events and resources", "#/community"],
  ["bell", "Notices", "Circulars and the holiday list", "#/notices"],
  ["file-check", "Exams", "Notices, countdown and revision tips", "#/exams"],
  ["sparkles", "Assistant", "Ask in plain language", "#/assistant"],
  ["settings", "Settings", "Theme, section, offline and backup", "#/settings"],
  ["shield", "Admin", "Data coverage and room mapping", "#/admin"],
  ["info", "About", "Sources, credits and privacy", "#/about"],
];

export async function render(root) {
  setPageMeta({ kicker: "Everything else", title: "More" });
  const profile = getState().profile;
  let meta = null;
  try {
    meta = await load("meta");
  } catch {
    /* the grid still works */
  }

  const counts = meta?.counts || {};

  root.replaceChildren(
    el(
      "div",
      { class: "page-enter stack", style: { gap: "16px" } },
      pageHead({
        kicker: "GNDEC One",
        title: `${greeting()}.`,
        lede: profile.section
          ? `Signed in as ${profile.name || "a student"} · ${profile.section}${profile.subgroup ? ` · ${profile.subgroup}` : ""}. Everything works offline once opened.`
          : "Set your section once and the app speaks about your actual classes. No account, no password.",
        actions: [
          profile.section
            ? el("a", { class: "btn btn--soft btn--sm", href: `#/timetable/${profile.section}` }, icon("calendar"), "My timetable")
            : el("a", { class: "btn btn--primary btn--sm", href: "#/settings" }, icon("plus"), "Set my section"),
          el("button", { class: "btn btn--sm", type: "button", onclick: () => share({ title: "GNDEC One", text: "Timetables, people, rooms and papers for GNDEC — offline.", url: location.origin + location.pathname }) }, icon("share"), "Share app"),
        ],
      }),
      el(
        "div",
        { class: "more-grid" },
        ...LINKS.map(([iconName, title, sub, href]) =>
          el("a", { class: "more-card", href }, el("span", { class: "more-icon" }, icon(iconName)), el("strong", { text: title }), el("small", { text: sub }), icon("chevron-right")),
        ),
      ),
      el(
        "div",
        { class: "grid grid--2", style: { alignItems: "start" } },
        el(
          "div",
          { class: "card card--pad" },
          el("div", { class: "section-head" }, el("h2", { text: "Keep it with you" })),
          el(
            "div",
            { class: "setting-row" },
            el("div", { class: "setting-main" }, el("strong", { text: "Install as an app" }), el("small", { text: "Adds GNDEC One to your home screen with its own icon." })),
            el("button", { class: "btn btn--primary btn--sm", type: "button", onclick: () => window.dispatchEvent(new CustomEvent("gndec:install-request")) }, icon("download"), "Install"),
          ),
          el(
            "div",
            { class: "setting-row" },
            el("div", { class: "setting-main" }, el("strong", { text: "Download for offline" }), el("small", { text: "Caches every JSON file, photo and page for a no-network day." })),
            el("a", { class: "btn btn--sm", href: "#/settings" }, icon("download"), "Open settings"),
          ),
        ),
        el(
          "div",
          { class: "card card--pad" },
          el("div", { class: "section-head" }, el("h2", { text: "This build" })),
          el(
            "dl",
            { class: "kv" },
            el("dt", { text: "Version" }),
            el("dd", { text: meta?.dataVersion || "—" }),
            el("dt", { text: "Timetable" }),
            el("dd", { text: meta?.timetableVersion || "—" }),
            el("dt", { text: "Sections" }),
            el("dd", { text: String(counts.sections ?? "—") }),
            el("dt", { text: "Papers" }),
            el("dd", { text: String(counts.papers ?? "—") }),
            el("dt", { text: "Places" }),
            el("dd", { text: String(counts.places ?? "—") }),
          ),
          el("p", { class: "tiny faint", style: { marginTop: "8px" }, text: "Missing data never blocks the app. Coverage is documented in Admin." }),
        ),
      ),
      callout("On iPhone or iPad, use Safari → Share → Add to Home Screen. On Android, use Chrome → menu → Install app.", { iconName: "info" }),
      el(
        "div",
        { class: "row", style: { justifyContent: "center", gap: "8px", flexWrap: "wrap" } },
        el("button", { class: "btn btn--sm btn--ghost", type: "button", onclick: () => toast("Pull the latest data from Settings → Download for offline.") }, icon("refresh"), "How updates work"),
        el("a", { class: "btn btn--sm btn--ghost", href: "#/about" }, icon("info"), "Credits"),
      ),
    ),
  );
}
