import { el, icon, setPageMeta, fmtDate, safeUrl, copyText } from "../ui.js";
import { load } from "../data.js";
import { pageHead, callout, statGrid } from "../components.js";

export async function render(root) {
  setPageMeta({ kicker: "About", title: "About GNDEC One" });
  let meta;
  let knowledge;
  let sources;
  let campus;
  try {
    [meta, knowledge, sources, campus] = await Promise.all([load("meta"), load("knowledge"), load("sources"), load("campus")]);
  } catch (err) {
    console.error(err);
    root.replaceChildren(
      el("div", { class: "empty" }, el("strong", { text: "About page could not load" }), el("small", { text: "Reconnect once and try again." })),
    );
    return;
  }

  const facts = campus.facts || knowledge.campusFacts || {};
  const counts = meta.counts || {};
  const gallery = campus.gallery || knowledge.gallery || [];
  const portalLinks = knowledge.portalLinks || [];
  const sourceList = sources.sources || [];

  const hero = el(
    "div",
    { class: "detail-hero", style: { padding: "0", overflow: "hidden" } },
    el(
      "div",
      { class: "photo-hero", style: { width: "min(100%, 420px)", flex: "1 1 360px", borderRadius: "0" } },
      el("img", { src: "/assets/img/main-gate.jpg", alt: "GNDEC main entrance on Gill Road", loading: "eager" }),
      el("span", { class: "photo-credit", text: "GNDEC website" }),
    ),
    el(
      "div",
      { class: "detail-main", style: { padding: "clamp(18px, 3vw, 30px)" } },
      el("span", { class: "eyebrow" }, icon("compass"), "GNDEC One · 2026"),
      el("h2", { class: "display", text: "One calm place for campus life." }),
      el("p", { class: "detail-sub", text: "A fast, offline-first companion for Guru Nanak Dev Engineering College, Ludhiana. Timetables, people, rooms, routes, syllabus, papers and notices — without a login." }),
      el(
        "div",
        { class: "detail-actions" },
        el("a", { class: "btn btn--primary btn--sm", href: "#/today" }, icon("home"), "Open Today"),
        el("a", { class: "btn btn--sm", href: "https://gndec.ac.in/", target: "_blank", rel: "noopener" }, icon("external"), "Official GNDEC"),
        el("button", { class: "btn btn--sm", type: "button", onclick: () => copyText(location.origin + location.pathname, "App link copied") }, icon("share"), "Share the app"),
      ),
    ),
  );

  const factGrid = el(
    "div",
    { class: "grid grid--3", style: { marginTop: "14px" } },
    ...[
      ["Established", facts.established || "1953", "Autonomous since 2011"],
      ["Campus", facts.campusAcres ? `${facts.campusAcres} acres` : "86 acres", "Gill Road, Ludhiana"],
      ["Shared campus", "GNDEC + GND Poly", "Facilities and grounds"],
      ["Hostels", facts.hostels ? "4 hostels" : "On campus", facts.hostels || ""],
      ["Distance", facts.distanceBusStandKm ? `${facts.distanceBusStandKm} km bus stand` : "Central", facts.distanceRailwayStationKm ? `${facts.distanceRailwayStationKm} km railway station` : ""],
      ["Affiliation", "IKG PTU", facts.autonomous ? "Autonomous college" : ""],
    ].map(([title, value, sub]) =>
      el("div", { class: "card card--pad" }, el("span", { class: "eyebrow", text: title }), el("h3", { class: "display", style: { fontSize: "19px", marginTop: "4px" }, text: value }), el("p", { class: "small muted", text: sub })),
    ),
  );

  const coverage = el(
    "div",
    { class: "card card--pad" },
    el("div", { class: "section-head" }, el("h2", { text: "What is inside" }), el("span", { class: "badge badge--muted", text: meta.dataVersion || "" })),
    statGrid([
      [counts.sections || 0, "Sections"],
      [counts.lectures || 0, "Weekly lectures"],
      [counts.teachers || 0, "Teachers"],
      [counts.students || 0, "Students"],
      [counts.papers || 0, "Papers"],
      [counts.places || 0, "Mapped places"],
    ]),
    el(
      "div",
      { class: "chip-row", style: { marginTop: "12px" } },
      el("span", { class: "chip" }, icon("calendar"), `${counts.subgroups || 0} practical groups`),
      el("span", { class: "chip" }, icon("book"), `${counts.syllabus || 0} syllabus docs`),
      el("span", { class: "chip" }, icon("file-check"), `${counts.questionBanks || 0} question banks`),
      el("span", { class: "chip" }, icon("bell"), `${counts.notices || 0} notices`),
      el("span", { class: "chip" }, icon("calendar"), `${counts.holidays || 0} holidays`),
    ),
    el("p", { class: "tiny faint", style: { marginTop: "10px" }, text: `Data build ${fmtDate(meta.generatedAt)} · timetable release ${meta.timetableVersion || "—"} · ${counts.searchEntries || 0} search entries.` }),
  );

  const galleryNode = gallery.length
    ? el(
        "div",
        { class: "gallery" },
        ...gallery.map((photo) =>
          el(
            "figure",
            {},
            el("img", { src: photo.src, alt: photo.title, loading: "lazy", decoding: "async" }),
            el(
              "figcaption",
              {},
              el("strong", { text: photo.title }),
              el("small", { text: photo.caption || "" }),
              photo.credit ? el("small", { class: "faint", text: `Photo: ${photo.credit}` }) : null,
            ),
          ),
        ),
      )
    : null;

  const portalGroups = portalLinks.map((group) =>
    el(
      "div",
      { class: "card card--pad" },
      el("div", { class: "section-head" }, el("h2", { text: group.category })),
      el(
        "div",
        { class: "stack", style: { gap: "4px" } },
        ...(group.items || []).map((item) =>
          el(
            "a",
            { class: "source-row", href: safeUrl(item.url), target: "_blank", rel: "noopener" },
            el("div", { class: "source-main" }, el("strong", { text: item.title }), el("small", { text: item.description || item.url })),
            icon("external"),
          ),
        ),
      ),
    ),
  );

  const sourceRows = el(
    "div",
    { class: "stack", style: { gap: "3px" } },
    ...sourceList.map((source) =>
      el(
        "div",
        { class: "source-row" },
        el("div", { class: "source-main" }, el("strong", { text: source.label }), el("small", { text: `${source.kind || "source"}${source.fetchedAt ? ` · fetched ${fmtDate(source.fetchedAt)}` : ""}` })),
        source.url ? el("a", { class: "icon-btn", href: source.url, target: "_blank", rel: "noopener", "aria-label": `Open ${source.label}` }, icon("external")) : null,
      ),
    ),
  );

  root.replaceChildren(
    el(
      "div",
      { class: "page-enter stack", style: { gap: "18px" } },
      pageHead({
        kicker: "About",
        title: "Built for one campus",
        lede: "A student-made reader for public GNDEC data. Not an official college service, and never a place to enter your ERP password.",
        actions: [
          el("a", { class: "btn btn--soft btn--sm", href: "#/settings" }, icon("settings"), "Settings"),
          el("a", { class: "btn btn--sm", href: "#/admin" }, icon("shield"), "Data coverage"),
        ],
      }),
      hero,
      factGrid,
      el("div", { class: "grid grid--2", style: { alignItems: "start" } }, coverage, el(
        "div",
        { class: "card card--pad" },
        el("div", { class: "section-head" }, el("h2", { text: "How it is built" })),
        el(
          "ul",
          { class: "small muted", style: { margin: "0 0 0 16px", lineHeight: 1.8 } },
          el("li", { text: "Vanilla ES modules and hand-written CSS. No framework, no bundler, no tracking scripts." }),
          el("li", { text: "Static JSON generated from official pages, the shared Drive paper archive, and the public faculty directory." }),
          el("li", { text: "A Cloudflare Worker serves the app, exposes a tiny health API, and provides an optional grounded AI proxy." }),
          el("li", { text: "A service worker keeps the shell, data and photos available offline." }),
          el("li", { text: "Your profile, favourites, room corrections and chat never leave this device." }),
        ),
      )),
      galleryNode,
      el("section", { class: "section" }, el("div", { class: "section-head" }, el("h2", { text: "Official starting points" })), el("div", { class: "grid grid--2" }, ...portalGroups)),
      el(
        "div",
        { class: "card card--pad" },
        el("div", { class: "section-head" }, el("h2", { text: "Data sources used in this build" }), el("span", { class: "small muted", text: `${sourceList.length} tracked` })),
        sourceRows,
      ),
      callout(
        "Room-to-block links are inferred from room codes, not published officially. Faculty photos and profiles belong to the college. Campus photos are credited above and remain the property of their publishers. If you represent GNDEC and want a correction, this is a student project and can be updated.",
        { iconName: "info" },
      ),
      el(
        "div",
        { class: "card card--pad center" },
        el("p", { class: "small muted", text: "Made for GNDEC, Ludhiana. Data belongs to the college; the app is a public reader." }),
        el(
          "div",
          { class: "row", style: { justifyContent: "center", gap: "8px", marginTop: "8px", flexWrap: "wrap" } },
          el("a", { class: "btn btn--sm", href: "https://gndec.ac.in/", target: "_blank", rel: "noopener" }, icon("external"), "gndec.ac.in"),
          el("a", { class: "btn btn--sm", href: "https://gndpoly.org/", target: "_blank", rel: "noopener" }, icon("external"), "gndpoly.org"),
          el("a", { class: "btn btn--sm", href: "https://erp.gndec.ac.in/notice", target: "_blank", rel: "noopener" }, icon("external"), "ERP notice board"),
        ),
      ),
    ),
  );
}
