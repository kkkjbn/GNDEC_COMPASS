/**
 * Shared UI blocks used by more than one page.
 */

import { el, icon, fmtTime, relativeDay, noticeIcon, avatarEl, openSheet, closeSheet, toast, safeUrl } from "./ui.js";
import { load, placeForRoom, getPlace, studentsMatching } from "./data.js";
import { setProfile, setProfileFromStudent, getState, isFavourite, toggleFavourite } from "./store.js";
import { DAY_NAMES } from "./logic.js";

export function pageHead({ kicker = "", title, lede = "", actions = [] } = {}) {
  return el(
    "header",
    { class: "page-head" },
    el(
      "div",
      {},
      kicker ? el("span", { class: "eyebrow" }, kicker) : null,
      el("h2", { class: "display", text: title }),
      lede ? el("p", { class: "lede", text: lede }) : null,
    ),
    actions.length ? el("div", { class: "row row--wrap" }, ...actions) : null,
  );
}

export function breadcrumb(label, href) {
  return el("a", { class: "link small", href, style: { display: "inline-flex", alignItems: "center", gap: "4px" } }, icon("chevron-left"), label);
}

export function stat(value, label) {
  return el("div", { class: "stat" }, el("strong", { text: String(value) }), el("small", { text: label }));
}

export function statGrid(items) {
  return el("div", { class: "stat-grid" }, ...items.map(([value, label]) => stat(value, label)));
}

export function callout(text, { iconName = "info", variant = "" } = {}) {
  return el("div", { class: `callout ${variant ? `callout--${variant}` : ""}`.trim() }, icon(iconName), el("div", { text }));
}

export function sectionCard(section, { href = `#/timetable/${section.id}`, compact = false } = {}) {
  return el(
    "a",
    { class: "card card--interactive card--pad", href, style: { textDecoration: "none", color: "inherit" } },
    el(
      "div",
      { class: "row row--between" },
      el("span", { class: "badge", text: section.id }),
      el("span", { class: "small muted", text: `${section.lectures?.length || 0} lectures` }),
    ),
    el("h4", { style: { marginTop: "9px", fontSize: "14px" }, text: section.label }),
    el("small", { class: "muted", text: `${section.branchName} · Semester ${section.semester}` }),
    compact ? null : el("div", { class: "chip-row", style: { marginTop: "10px" } }, el("span", { class: "chip" }, icon("calendar"), `${section.group || "—"}`), el("span", { class: "chip" }, icon("users"), `${section.program || "B.Tech"}`)),
  );
}

export function classRow(lecture, { state = "upcoming", place = null, showDay = false, now = new Date() } = {}) {
  const start = fmtTime(lecture.start);
  const end = fmtTime(lecture.end);
  const isLab = /[ .]P$|LAB/i.test(lecture.subject);
  const teacherNames = lecture.teachers?.length ? lecture.teachers : lecture.teacher ? [lecture.teacher] : [];

  return el(
    "div",
    { class: `class-row ${state === "now" ? "is-now" : state === "done" ? "is-done" : ""}`.trim() },
    el("div", { class: "class-time" }, el("strong", { text: start }), el("small", { text: `→ ${end}` })),
    el("div", { class: "class-rail", "aria-hidden": "true" }, el("span", { class: "class-dot" })),
    el(
      "div",
      { class: "class-body" },
      el(
        "div",
        { class: "row row--wrap", style: { gap: "7px" } },
        el("strong", { text: lecture.subject }),
        state === "now" ? el("span", { class: "now-tag", text: "Now" }) : null,
        isLab ? el("span", { class: "badge badge--accent", text: "Practical" }) : null,
        lecture.subsection && lecture.subsection !== lecture.group ? el("span", { class: "badge badge--muted", text: lecture.subsection }) : null,
      ),
      el(
        "div",
        { class: "class-meta" },
        lecture.room
          ? el(
              "span",
              {},
              icon("pin"),
              place ? el("a", { href: `#/rasta/place/${place.id}`, class: "link" }, lecture.room) : lecture.room,
            )
          : el("span", { class: "faint" }, "Room not published"),
        teacherNames.length
          ? el(
              "span",
              {},
              icon("users"),
              teacherNames.length > 1
                ? `${teacherNames[0]} +${teacherNames.length - 1}`
                : teacherNames[0],
            )
          : null,
        showDay ? el("span", {}, icon("calendar"), DAY_NAMES[lecture.day] || "") : null,
      ),
    ),
    el(
      "div",
      { class: "class-actions" },
      place
        ? el(
            "a",
            { class: "icon-btn", href: `#/rasta?to=${place.id}`, "aria-label": `Route to ${lecture.room}`, title: `Route to ${lecture.room}` },
            icon("route"),
          )
        : null,
    ),
  );
}

export function noticeRow(notice, { compact = false } = {}) {
  const kind = notice.kind || "general";
  return el(
    "a",
    { class: "notice-item", href: `#/notices/${encodeURIComponent(notice.id)}` },
    el("span", { class: `notice-icon ${kind === "exam" ? "is-exam" : kind === "event" ? "is-event" : kind === "admin" ? "is-admin" : ""}`.trim() }, icon(noticeIcon(kind))),
    el(
      "div",
      { class: "notice-main" },
      el("strong", { text: notice.title }),
      el(
        "div",
        { class: "notice-meta" },
        el("span", {}, relativeDay(notice.date)),
        notice.source ? el("span", {}, notice.source) : null,
        !compact && notice.kind ? el("span", { class: "badge badge--muted", text: kind }) : null,
      ),
    ),
    icon("chevron-right"),
  );
}

export function photoStrip(campus) {
  if (!campus?.gallery?.length) return null;
  return el(
    "div",
    { class: "photo-strip" },
    ...campus.gallery.slice(0, 8).map((photo) =>
      el(
        "figure",
        {},
        el("img", { src: photo.src, alt: photo.title, loading: "lazy", decoding: "async" }),
        el("figcaption", {}, el("strong", { style: { color: "var(--ink)", fontSize: "11px" }, text: photo.title }), el("span", { text: ` · ${photo.credit}` })),
      ),
    ),
  );
}

export function teacherCard(teacher) {
  return el(
    "a",
    { class: "person-card", href: `#/people/teacher/${encodeURIComponent(teacher.id)}` },
    avatarEl(teacher.name, teacher.photoUrl, "sm"),
    el(
      "div",
      { class: "person-main" },
      el("strong", { text: teacher.name }),
      el("span", { class: "person-sub", text: [teacher.designation, teacher.department].filter(Boolean).join(" · ") || "Faculty" }),
      el(
        "div",
        { class: "person-foot" },
        teacher.teaches ? el("span", { class: "badge", text: `${teacher.hoursPerWeek}h/week` }) : el("span", { class: "badge badge--muted", text: "Directory" }),
        teacher.subjects?.length ? el("span", { class: "badge badge--muted", text: `${teacher.subjects.length} subjects` }) : null,
      ),
    ),
  );
}

export function teacherLine(teacher) {
  return el(
    "a",
    { class: "person-card", href: `#/people/teacher/${encodeURIComponent(teacher.id)}` },
    avatarEl(teacher.name, teacher.photoUrl, "sm"),
    el(
      "div",
      { class: "person-main" },
      el("strong", { text: teacher.name }),
      el("span", { class: "person-sub", text: [teacher.designation, teacher.department].filter(Boolean).join(" · ") }),
    ),
    icon("chevron-right"),
  );
}

export function roomPlaceId(rooms, roomName) {
  return placeForRoom(rooms, roomName) || "";
}

export function placeOf(campus, placeId) {
  return placeId ? getPlace(campus, placeId) : null;
}

/* ------------------------------------------------------------------ */
/* Profile editor                                                      */
/* ------------------------------------------------------------------ */

export async function openProfileEditor({ onSaved } = {}) {
  let timetable;
  let students = null;
  try {
    timetable = await load("timetable");
  } catch {
    toast("Timetable could not load. Check your connection and try again.", "error");
    return;
  }

  const state = getState();
  const profile = state.profile;
  const nameInput = el("input", { class: "input", type: "text", placeholder: "Your name (optional)", value: profile.name || "", autocomplete: "name" });
  const lookupInput = el("input", {
    class: "input",
    type: "search",
    placeholder: "CRN (e.g. 2617070) or your full name",
    autocomplete: "off",
    enterkeyhint: "search",
  });
  const lookupStatus = el("p", { class: "small muted", style: { margin: "6px 0 0" }, text: "Enter your CRN or name once — we will find your branch, section, subgroup and mentor." });
  const lookupResults = el("div", { class: "stack", style: { marginTop: "10px" } });

  const sections = [...(timetable.sections || [])].sort((a, b) => a.year - b.year || String(a.branch).localeCompare(String(b.branch)) || String(a.group).localeCompare(String(b.group)));
  const sectionSelect = el("select", { class: "select", "aria-label": "Your section" });
  sectionSelect.appendChild(el("option", { value: "", text: "Choose your section…" }));
  const byYear = new Map();
  for (const section of sections) {
    if (!byYear.has(section.year)) byYear.set(section.year, []);
    byYear.get(section.year).push(section);
  }
  for (const [year, list] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
    const group = el("optgroup", { label: `${year === 1 ? "1st" : year === 2 ? "2nd" : year === 3 ? "3rd" : `${year}th`} Year` });
    for (const section of list) {
      group.appendChild(el("option", { value: section.id, text: `${section.id} — ${section.branchName}${section.group ? ` · ${section.group}` : ""}${section.program !== "B.Tech" ? ` · ${section.program}` : ""}` }));
    }
    sectionSelect.appendChild(group);
  }
  sectionSelect.value = profile.section || "";

  const subgroupSelect = el("select", { class: "select", "aria-label": "Your subgroup" });
  const fillSubgroups = () => {
    subgroupSelect.replaceChildren(el("option", { value: "", text: "Whole section (no subgroup)" }));
    const chosen = sections.find((section) => section.id === sectionSelect.value);
    if (!chosen) return;
    const subgroups = (timetable.subgroups || []).filter((group) => group.id.startsWith(chosen.id) && group.id !== chosen.id);
    for (const subgroup of subgroups) subgroupSelect.appendChild(el("option", { value: subgroup.id, text: `${subgroup.id} — practical / tutorial group` }));
    subgroupSelect.value = profile.section === chosen.id ? profile.subgroup || "" : "";
  };
  fillSubgroups();
  sectionSelect.addEventListener("change", fillSubgroups);

  function finish(student) {
    setProfileFromStudent(student);
    closeSheet();
    toast(`Found ${student.name} · ${student.section}${student.subgroup ? ` · ${student.subgroup}` : ""}`);
    if (onSaved) onSaved();
    else window.dispatchEvent(new CustomEvent("gndec:profile-changed"));
  }

  function studentButton(student) {
    return el(
      "button",
      { class: "person-card", type: "button", style: { textAlign: "left", width: "100%" }, onclick: () => finish(student) },
      avatarEl(student.name, "", "sm"),
      el(
        "div",
        { class: "person-main" },
        el("strong", { text: student.name }),
        el("span", { class: "person-sub", text: `${student.branch} · ${student.section}${student.subgroup ? ` · ${student.subgroup}` : ""} · Year ${student.year} · CRN ${student.crn}` }),
        el("div", { class: "person-foot" }, el("span", { class: "badge", text: student.batch ? `Batch ${student.batch}` : "Roster" }), student.mentor ? el("span", { class: "badge badge--muted", text: student.mentor }) : null),
      ),
      icon("arrow-right"),
    );
  }

  async function doLookup() {
    const query = lookupInput.value.trim();
    if (!query) {
      lookupStatus.textContent = "Type a 7-digit CRN or at least two letters of your name.";
      return;
    }
    lookupStatus.textContent = "Searching the official rosters…";
    lookupResults.replaceChildren();
    if (!students) {
      try {
        students = (await load("students")).students || [];
      } catch {
        lookupStatus.textContent = "The roster could not load. Check your connection, or choose your section manually below.";
        return;
      }
    }
    const matches = studentsMatching(students, query).slice(0, 8);
    if (!matches.length) {
      lookupStatus.textContent = `No roster match for “${query}”. Rosters currently cover the 2025 and 2026 first-year batches. Choose your section manually below.`;
      return;
    }
    lookupStatus.textContent = matches.length === 1 ? "One match found. Tap to use it." : `${matches.length} matches found. Pick the right person.`;
    lookupResults.replaceChildren(...matches.map(studentButton));
    if (matches.length === 1) finish(matches[0]);
  }

  lookupInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      doLookup();
    }
  });

  const form = el(
    "form",
    {
      class: "stack",
      onsubmit: (event) => {
        event.preventDefault();
        const chosen = sectionSelect.value;
        if (!chosen) {
          toast("Choose your section to personalise the app.", "error");
          sectionSelect.focus();
          return;
        }
        setProfile({
          ...getState().profile,
          name: nameInput.value.trim(),
          crn: lookupInput.value.trim() || getState().profile.crn || "",
          section: chosen,
          subgroup: subgroupSelect.value,
        });
        closeSheet();
        toast("Profile saved on this device");
        if (onSaved) onSaved();
        else window.dispatchEvent(new CustomEvent("gndec:profile-changed"));
      },
    },
    el("div", { class: "callout" }, icon("lock"), el("div", { text: "This stays on your device. Nothing is uploaded, and no login is needed." })),
    el(
      "div",
      { class: "field" },
      el("label", { for: "profile-lookup", text: "Find me automatically" }),
      el("div", { class: "row", style: { gap: "8px", alignItems: "stretch" } }, lookupInput, el("button", { class: "btn btn--primary", type: "button", onclick: doLookup }, icon("search"), "Find")),
      lookupStatus,
      lookupResults,
    ),
    el("div", { class: "divider", style: { margin: "8px 0" } }),
    el("div", { class: "field" }, el("label", { for: "profile-name", text: "Name (optional)" }), nameInput),
    el("div", { class: "field" }, el("label", { for: "profile-section", text: "Section" }), sectionSelect),
    el("div", { class: "field" }, el("label", { for: "profile-subgroup", text: "Subgroup (optional)" }), subgroupSelect),
    el(
      "div",
      { style: { marginTop: "4px" } },
      el("button", { class: "btn btn--primary btn--block", type: "submit" }, icon("check"), "Save profile"),
    ),
  );

  openSheet({ title: "Find your classes", body: form, wide: true });
  lookupInput.id = "profile-lookup";
  nameInput.id = "profile-name";
  sectionSelect.id = "profile-section";
  subgroupSelect.id = "profile-subgroup";
  setTimeout(() => lookupInput.focus(), 80);
}

export function favouriteButton(item) {
  const active = isFavourite(item.type, item.id);
  const button = el(
    "button",
    {
      class: `btn btn--sm ${active ? "btn--soft" : ""}`.trim(),
      type: "button",
      "aria-pressed": active ? "true" : "false",
      onclick: () => {
        const now = toggleFavourite(item);
        button.classList.toggle("btn--soft", now);
        button.setAttribute("aria-pressed", now ? "true" : "false");
        button.replaceChildren(icon(now ? "star" : "star"), document.createTextNode(now ? "Saved" : "Save"));
        toast(now ? "Saved to favourites" : "Removed from favourites");
      },
    },
    icon("star"),
    active ? "Saved" : "Save",
  );
  return button;
}

export function safeExternal(url) {
  return safeUrl(url);
}

export function greeting(now = new Date()) {
  const hour = now.getHours();
  if (hour < 5) return "Still up?";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}
