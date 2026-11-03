/**
 * Shared UI blocks used by more than one page.
 */

import { el, icon, fmtTime, relativeDay, noticeIcon, avatarEl, openSheet, closeSheet, toast, safeUrl } from "./ui.js";
import { load, placeForRoom, getPlace, studentsMatching } from "./data.js";
import { setProfile, getState, isFavourite, toggleFavourite } from "./store.js";
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
  let students = [];
  try {
    const [timetableData, studentsData] = await Promise.all([load("timetable"), load("students").catch(() => null)]);
    timetable = timetableData;
    students = studentsData?.students || [];
  } catch {
    toast("Timetable could not load. Check your connection and try again.", "error");
    return;
  }

  const state = getState();
  const profile = state.profile;
  const sections = [...(timetable.sections || [])].sort(
    (a, b) => a.year - b.year || String(a.branch).localeCompare(String(b.branch)) || String(a.group).localeCompare(String(b.group)),
  );

  let matchedRecord = null;
  let lookupTimer = 0;

  const nameInput = el("input", { class: "input", type: "text", placeholder: "Start typing your full name", value: profile.name || "", autocomplete: "name" });
  const crnInput = el("input", { class: "input", type: "text", placeholder: "or your CRN / registration number", value: profile.crn || "", inputmode: "numeric" });
  const lookup = el("input", { class: "input", type: "search", placeholder: "Name or CRN — for example “Aaditya Koundal” or 2621001", "aria-label": "Find yourself in the official roster" });
  const results = el("div", { class: "stack", style: { gap: "8px" } });
  const lookupStatus = el("p", { class: "tiny faint", text: students.length ? `${students.length.toLocaleString("en-IN")} first- and second-year roster records available.` : "Roster data is not available offline yet." });

  const sectionSelect = el("select", { class: "select", "aria-label": "Your section" });
  sectionSelect.appendChild(el("option", { value: "", text: "Choose your section" }));
  const byYear = new Map();
  for (const section of sections) {
    if (!byYear.has(section.year)) byYear.set(section.year, []);
    byYear.get(section.year).push(section);
  }
  for (const [year, list] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
    const group = el("optgroup", { label: `${year === 1 ? "1st" : year === 2 ? "2nd" : year === 3 ? "3rd" : `${year}th`} Year` });
    for (const section of list) {
      group.appendChild(
        el("option", {
          value: section.id,
          text: `${section.id} - ${section.branchName}${section.group ? ` · Group ${section.group}` : ""}${section.program !== "B.Tech" ? ` · ${section.program}` : ""}`,
        }),
      );
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
    for (const subgroup of subgroups) subgroupSelect.appendChild(el("option", { value: subgroup.id, text: `${subgroup.id} - practical / tutorial group` }));
    subgroupSelect.value = profile.section === chosen.id ? profile.subgroup || "" : "";
  };
  fillSubgroups();
  sectionSelect.addEventListener("change", fillSubgroups);

  function recordLine(student) {
    const parts = [student.branch, student.section, student.subgroup, student.batch ? `Batch ${student.batch}` : ""].filter(Boolean);
    return parts.join(" · ");
  }

  function applyRecord(student, { silent = false } = {}) {
    matchedRecord = student;
    nameInput.value = student.name || "";
    crnInput.value = student.crn || "";
    const matchingSection = sections.find((section) => section.id === student.section || section.id === student.group);
    if (matchingSection) {
      sectionSelect.value = matchingSection.id;
      fillSubgroups();
      const subgroupId = student.subgroup || student.group || "";
      if ([...subgroupSelect.options].some((option) => option.value === subgroupId)) subgroupSelect.value = subgroupId;
    } else {
      sectionSelect.value = "";
      fillSubgroups();
      toast(`Your roster section is ${student.section || "not published"}, but there is no matching timetable group. Choose one manually below.`, "error");
    }
    if (!silent) {
      results.replaceChildren(
        el(
          "div",
          { class: "callout", style: { borderColor: "var(--ok)" } },
          icon("check"),
          el(
            "div",
            {},
            el("strong", { text: `${student.name} · CRN ${student.crn}` }),
            el("p", { class: "small muted", text: recordLine(student) }),
            el("p", { class: "tiny faint", text: student.mentor ? `Mentor: ${student.mentor}${student.venue ? ` · usually ${student.venue}` : ""}` : "Mentor not published." }),
          ),
        ),
      );
    }
  }

  function renderMatches(rows, query) {
    if (!rows.length) {
      results.replaceChildren(
        el(
          "div",
          { class: "callout" },
          icon("info"),
          el("div", {}, el("strong", { text: "No roster match" }), el("p", { class: "small muted", text: "Check the spelling, use your CRN, or choose your section manually below." })),
        ),
      );
      return;
    }
    const list = el("div", { class: "stack", style: { gap: "6px" } });
    for (const student of rows.slice(0, 8)) {
      list.appendChild(
        el(
          "button",
          { class: "list-row", type: "button", style: { textAlign: "left" }, onclick: () => applyRecord(student) },
          el("span", { class: "avatar avatar--sm", style: { background: "var(--primary-soft)" } }, icon("graduation")),
          el(
            "span",
            { class: "list-main" },
            el("strong", { text: student.name }),
            el("small", { class: "faint", text: `${recordLine(student)} · CRN ${student.crn}` }),
          ),
          icon("chevron-right"),
        ),
      );
    }
    results.replaceChildren(
      el("p", { class: "small muted", text: `${rows.length} match${rows.length === 1 ? "" : "es"} for “${query}”. Pick yours:` }),
      list,
    );
  }

  function runLookup() {
    const query = lookup.value.trim();
    if (!query) {
      results.replaceChildren();
      return;
    }
    const exact = students.find((student) => String(student.crn) === query || String(student.registrationNo) === query);
    if (exact) {
      applyRecord(exact);
      return;
    }
    const rows = studentsMatching(students, query);
    if (!rows.length) {
      // Tolerate small spelling mistakes: every token must match the start of a
      // name token, so "aadit koundal" still finds "Aaditya Koundal".
      const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
      const fuzzy = students.filter((student) => {
        const words = student.name.toLowerCase().split(/\s+/);
        return tokens.every((token) => words.some((word) => word.startsWith(token) || token.startsWith(word.slice(0, Math.max(3, token.length - 1)))));
      });
      renderMatches(fuzzy, query);
      return;
    }
    renderMatches(rows, query);
  }

  lookup.addEventListener("input", () => {
    clearTimeout(lookupTimer);
    lookupTimer = setTimeout(runLookup, 220);
  });
  lookup.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runLookup();
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
        const chosenSection = sections.find((section) => section.id === chosen);
        const record = matchedRecord && matchedRecord.section === chosen ? matchedRecord : null;
        setProfile({
          name: nameInput.value.trim(),
          crn: crnInput.value.trim(),
          section: chosen,
          subgroup: subgroupSelect.value,
          branch: record?.branch || chosenSection?.branch || "",
          year: record?.year || chosenSection?.year || null,
          batch: record?.batch || "",
          mentor: record?.mentor || "",
          mentorPhone: record?.mentorPhone || "",
          registrationNo: record?.registrationNo || "",
          mentorVenue: record?.venue || "",
          rosterSection: record?.section || "",
          source: record ? "official-roster" : "manual",
        });
        closeSheet();
        toast(record ? "Profile matched to the official roster" : "Profile saved on this device");
        if (onSaved) onSaved();
        else window.dispatchEvent(new CustomEvent("gndec:profile-changed"));
      },
    },
    el(
      "div",
      { class: "callout" },
      icon("lock"),
      el("div", {}, el("strong", { text: "Find yourself once" }), el("p", { class: "small muted", text: "Search the official roster by name or CRN. Your branch, year, section, subgroup and mentor are then filled automatically. Everything stays on this device." })),
    ),
    el("div", { class: "field" }, el("label", { for: "profile-lookup", text: "Find me in the official roster" }), lookup),
    lookupStatus,
    results,
    el("p", { class: "small muted", style: { margin: "4px 0" }, text: "Or set the section manually:" }),
    el("div", { class: "field" }, el("label", { for: "profile-name", text: "Name (optional)" }), nameInput),
    el("div", { class: "field" }, el("label", { for: "profile-section", text: "Section" }), sectionSelect),
    el("div", { class: "field" }, el("label", { for: "profile-subgroup", text: "Subgroup (optional)" }), subgroupSelect),
    el("div", { class: "field" }, el("label", { for: "profile-crn", text: "CRN (optional)" }), crnInput),
    el("div", { style: { marginTop: "4px" } }, el("button", { class: "btn btn--primary btn--block", type: "submit" }, icon("check"), "Save profile")),
  );

  openSheet({ title: "Your profile", body: form, wide: true });
  lookup.id = "profile-lookup";
  nameInput.id = "profile-name";
  sectionSelect.id = "profile-section";
  subgroupSelect.id = "profile-subgroup";
  crnInput.id = "profile-crn";
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
