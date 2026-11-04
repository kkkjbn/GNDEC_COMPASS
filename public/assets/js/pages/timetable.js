import { el, icon, badge, copyText, share, toast, setPageMeta, emptyState, debounce } from "../ui.js";
import { load, subgroupsFor, sectionLabel, roomIndex } from "../data.js";
import { getState, setProfile, getProfile } from "../store.js";
import { classRow, openProfileEditor, favouriteButton, pageHead } from "../components.js";
import { DAY_NAMES, DAY_SHORT, fmtTime, fmtRange, lecturesForDay, toMinutes, todayIndex, uniqueSubjects, sectionSummary } from "../logic.js";

function shareButton(section) {
  return el(
    "button",
    {
      class: "btn btn--sm",
      type: "button",
      onclick: () => {
        const url = `${location.origin}${location.pathname}#/timetable/${section.id}`;
        share({ title: `${section.id} timetable · GNDEC One`, text: `${section.label} weekly timetable`, url });
      },
    },
    icon("share"),
    "Share",
  );
}

function periodRows(timetable) {
  const periods = timetable.periods || ["08:30", "09:30", "10:30", "11:30", "12:30", "13:30", "14:30", "15:30"];
  return periods.map((start, index) => {
    const next = periods[index + 1];
    const end = next ? next : `${String(Number(start.slice(0, 2)) + 1).padStart(2, "0")}:${start.slice(3)}`;
    return { period: index, start, end };
  });
}

function weekGrid(section, timetable, subgroup, rooms, campus) {
  const wrap = el("div", { class: "tt-wrap" });
  const grid = el("div", { class: "tt-grid" });
  const today = todayIndex(new Date());

  grid.appendChild(el("div", { class: "tt-head", text: "Time" }));
  for (let day = 0; day < 6; day += 1) {
    grid.appendChild(el("div", { class: `tt-head ${day === today ? "is-today" : ""}`.trim() }, el("span", { text: DAY_SHORT[day] }), el("div", { class: "tiny", style: { fontWeight: "500", letterSpacing: "0" }, text: DAY_NAMES[day] })));
  }

  for (const row of periodRows(timetable)) {
    grid.appendChild(
      el(
        "div",
        { class: "tt-time" },
        el("strong", { text: fmtTime(row.start) }),
        el("span", { text: `to ${fmtTime(row.end)}` }),
      ),
    );
    for (let day = 0; day < 6; day += 1) {
      const lectures = lecturesForDay(section, day, subgroup).filter((lecture) => lecture.period === row.period);
      const cell = el("div", { class: `tt-cell ${day === today ? "is-today" : ""}`.trim() });
      if (!lectures.length) {
        cell.appendChild(el("div", { class: "tt-empty", text: "—" }));
      } else {
        for (const lecture of lectures) {
          const placeId = rooms.map?.[lecture.room] || "";
          const place = campus?.places?.find((p) => p.id === placeId);
          const lab = /[ .]P$|LAB/i.test(lecture.subject);
          cell.appendChild(
            el(
              "a",
              {
                class: `tt-item ${lab ? "is-lab" : ""}`.trim(),
                href: place ? `#/rasta/place/${place.id}` : "#/rasta",
                title: `${lecture.subject}${lecture.teacher ? ` · ${lecture.teacher}` : ""}`,
              },
              el("strong", { text: lecture.subject.replace(/\s[LTP]$/, "") }),
              lecture.teacher ? el("span", { text: lecture.teacher }) : null,
              lecture.room ? el("span", { class: "tt-room", text: lecture.room }) : null,
              lecture.subsection && lecture.subsection !== section.id ? el("span", { class: "tiny faint", text: lecture.subsection }) : null,
            ),
          );
        }
      }
      grid.appendChild(cell);
    }
  }

  wrap.appendChild(grid);
  return wrap;
}

function dayView(section, timetable, subgroup, rooms, campus, selectedDay) {
  const container = el("div", { class: "day-list" });
  const today = todayIndex(new Date());
  let day = selectedDay;
  if (day == null || day < 0) day = today >= 0 ? today : 0;

  const picker = el("div", { class: "day-picker", role: "tablist" });
  const body = el("div", { class: "card card--pad" });

  const drawDay = () => {
    for (const button of picker.querySelectorAll("button")) {
      button.classList.toggle("is-active", Number(button.dataset.day) === day);
      button.setAttribute("aria-selected", Number(button.dataset.day) === day ? "true" : "false");
    }
    const lectures = lecturesForDay(section, day, subgroup);
    if (!lectures.length) {
      body.replaceChildren(emptyState({ iconName: "coffee", title: `No classes on ${DAY_NAMES[day]}`, text: "Nothing is scheduled for this section and group." }));
      return;
    }
    body.replaceChildren(
      ...lectures.map((lecture) =>
        classRow(lecture, {
          state: today === day ? (new Date().getHours() * 60 + new Date().getMinutes() >= toMinutes(lecture.end) ? "done" : new Date().getHours() * 60 + new Date().getMinutes() >= toMinutes(lecture.start) ? "now" : "upcoming") : "upcoming",
          place: (campus?.places || []).find((p) => p.id === (rooms.map?.[lecture.room] || "")) || null,
        }),
      ),
    );
  };

  for (let i = 0; i < 6; i += 1) {
    const button = el(
      "button",
      {
        type: "button",
        class: `${i === today ? "is-today" : ""}`.trim(),
        "data-day": i,
        role: "tab",
        onclick: () => {
          day = i;
          drawDay();
        },
      },
      el("span", { text: DAY_SHORT[i] }),
      el("small", { style: { display: "block", fontSize: "9px", opacity: "0.7" }, text: `${lecturesForDay(section, i, subgroup).length} cls` }),
    );
    picker.appendChild(button);
  }

  container.append(picker, body);
  drawDay();
  return container;
}

function subjectSummary(section, subgroup) {
  const subjects = uniqueSubjects(section, subgroup);
  return el(
    "div",
    { class: "grid grid--3" },
    ...subjects.map((subject) =>
      el(
        "div",
        { class: "card card--pad" },
        el(
          "div",
          { class: "row row--between" },
          el("strong", { style: { fontSize: "13px" }, text: subject.subject.replace(/\s[LTP]$/, "") }),
          el("span", { class: `badge ${subject.lab ? "badge--accent" : ""}`.trim(), text: subject.lab ? "Practical" : `${subject.hours}h` }),
        ),
        subject.teachers.length ? el("p", { class: "small muted", style: { marginTop: "5px" }, text: subject.teachers.join(", ") }) : el("p", { class: "small faint", style: { marginTop: "5px" }, text: "Teacher not published" }),
        subject.rooms.length ? el("p", { class: "tiny faint", text: subject.rooms.join(" · ") }) : null,
      ),
    ),
  );
}

export async function render(root, params = {}) {
  setPageMeta({ kicker: "Timetable", title: params.id ? params.id.toUpperCase() : "Timetable" });
  let timetable;
  let rooms;
  let campus;
  try {
    [timetable, rooms, campus] = await Promise.all([load("timetable"), load("rooms"), load("campus")]);
  } catch (err) {
    console.error(err);
    root.replaceChildren(emptyState({ iconName: "wifi-off", title: "Timetable unavailable", text: "Reconnect once to cache the timetable.", actionLabel: "Retry", onAction: () => location.reload() }));
    return;
  }

  const roomMap = new Map((rooms.rooms || []).map((room) => [room.name, room.place]));
  const query = String(params.id || "").toUpperCase();
  const section = query ? (timetable.sections || []).find((s) => s.id === query) : null;

  if (query && !section) {
    root.replaceChildren(
      emptyState({
        iconName: "calendar",
        title: `No section “${query}”`,
        text: "The official timetable export does not contain this section. It may be a 4th-year group (not published) or a typo.",
        actionLabel: "Browse all sections",
        onAction: () => {
          window.gndecNavigate?.("/timetable") || (location.hash = "#/timetable");
        },
      }),
    );
    return;
  }

  if (!section) {
    renderPicker(root, timetable);
    return;
  }
  drawSection(root, section, timetable, rooms, roomMap, campus);
}

function renderPicker(root, timetable) {
  let year = 0;
  let text = "";

  const years = [...new Set((timetable.sections || []).map((s) => s.year))].sort((a, b) => a - b);
  const chips = el("div", { class: "chip-row" });
  const grid = el("div", { class: "grid grid--auto", style: { marginTop: "14px" } });
  const input = el("input", { class: "input", type: "search", placeholder: "Search a section, e.g. D2CSA, ITA, MEB…", "aria-label": "Search sections" });

  const draw = () => {
    for (const chip of chips.querySelectorAll("button")) {
      chip.classList.toggle("is-active", Number(chip.dataset.year) === year);
    }
    const q = text.trim().toLowerCase();
    const list = (timetable.sections || [])
      .filter((section) => (!year || section.year === year) && (!q || `${section.id} ${section.branchName} ${section.label} ${section.program}`.toLowerCase().includes(q)))
      .sort((a, b) => a.year - b.year || String(a.branch).localeCompare(String(b.branch)) || String(a.group).localeCompare(String(b.group)));

    if (!list.length) {
      grid.replaceChildren(emptyState({ iconName: "search", title: "No section matches", text: "Try the section code printed on your timetable." }));
      return;
    }
    grid.replaceChildren(
      ...list.map((section) =>
        el(
          "a",
          { class: "card card--interactive card--pad", href: `#/timetable/${section.id}`, style: { textDecoration: "none", color: "inherit" } },
          el(
            "div",
            { class: "row row--between" },
            el("span", { class: "badge", text: section.id }),
            el("span", { class: "tiny faint", text: `${section.lectures.length} lectures` }),
          ),
          el("h4", { style: { marginTop: "8px", fontSize: "13.5px" }, text: section.branchName }),
          el("p", { class: "small muted", text: `${section.program} · ${section.year === 1 ? "1st" : section.year === 2 ? "2nd" : section.year === 3 ? "3rd" : `${section.year}th`} year · Semester ${section.semester}${section.group ? ` · Group ${section.group}` : ""}` }),
        ),
      ),
    );
  };

  chips.appendChild(el("button", { class: "chip is-active", type: "button", "data-year": 0, onclick: () => { year = 0; draw(); } }, icon("grid"), `All ${timetable.sections.length}`));
  for (const y of years) {
    chips.appendChild(
      el("button", { class: "chip", type: "button", "data-year": y, onclick: () => { year = y; draw(); } }, icon("calendar"), `${y === 1 ? "1st" : y === 2 ? "2nd" : `${y}rd`} year`),
    );
  }

  input.addEventListener(
    "input",
    debounce(() => {
      text = input.value;
      draw();
    }, 100),
  );

  const profile = getProfile();
  const head = pageHead({
    kicker: "Weekly timetable",
    title: "Timetable",
    lede: `Official FET export, version ${timetable.source?.version || "—"}. Choose a section to see the full week, rooms and teachers.`,
    actions: [
      profile.section
        ? el("a", { class: "btn btn--soft", href: `#/timetable/${profile.section}` }, icon("star"), `My section · ${profile.section}`)
        : el("button", { class: "btn btn--primary", type: "button", onclick: () => openProfileEditor() }, icon("plus"), "Set my section"),
      el("a", { class: "btn", href: "https://appsc.gndec.ac.in/time_tables", target: "_blank", rel: "noopener" }, icon("external"), "Official index"),
    ],
  });

  root.replaceChildren(
    el(
      "div",
      { class: "page-enter" },
      head,
      el("div", { class: "filter-bar" }, el("div", { class: "input-icon", style: { flex: "1 1 260px" } }, icon("search"), input), chips),
      grid,
      el("p", { class: "small faint", style: { marginTop: "18px" }, text: "Sections come directly from the FET export. 4th-year groups are not present in the public export — see Admin → Data coverage." }),
    ),
  );
  draw();
}

function baseSubject(name) {
  return String(name || "")
    .replace(/\s+[LTP]$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function comparePanel(section, timetable, subgroup, roomMap) {
  const card = el("div", { class: "card card--pad" });
  const options = [...(timetable.sections || [])]
    .filter((item) => item.id !== section.id)
    .sort((a, b) => a.year - b.year || String(a.branch).localeCompare(String(b.branch)) || String(a.group).localeCompare(String(b.group)));
  const otherSelect = el("select", { class: "select", "aria-label": "Compare with section" });
  otherSelect.appendChild(el("option", { value: "", text: "Choose a section to compare…" }));
  for (const item of options) {
    otherSelect.appendChild(el("option", { value: item.id, text: `${item.id} — ${item.branchName}${item.group ? ` · Group ${item.group}` : ""}` }));
  }
  const otherSubSelect = el("select", { class: "select", "aria-label": "Compare with subgroup" });
  const body = el("div", { style: { marginTop: "10px" } });

  const fillSubgroups = () => {
    otherSubSelect.replaceChildren(el("option", { value: "", text: "Whole section" }));
    const other = (timetable.sections || []).find((item) => item.id === otherSelect.value);
    if (!other) return;
    for (const group of subgroupsFor(timetable, other.id)) {
      otherSubSelect.appendChild(el("option", { value: group.id, text: group.id }));
    }
  };

  const render = () => {
    const other = (timetable.sections || []).find((item) => item.id === otherSelect.value);
    if (!other) {
      body.replaceChildren(el("p", { class: "small muted", text: "Pick a friend's section to see both weeks side by side. Useful for planning a shared free period or a group study slot." }));
      return;
    }
    const otherSub = otherSubSelect.value;
    const subjectsA = new Set(uniqueSubjects(section, subgroup).map((item) => baseSubject(item.subject)));
    const subjectsB = new Set(uniqueSubjects(other, otherSub).map((item) => baseSubject(item.subject)));
    const shared = [...subjectsA].filter((name) => subjectsB.has(name));
    const onlyA = [...subjectsA].filter((name) => !subjectsB.has(name));
    const onlyB = [...subjectsB].filter((name) => !subjectsA.has(name));

    const days = DAY_NAMES.map((dayName, day) => {
      const a = lecturesForDay(section, day, subgroup);
      const b = lecturesForDay(other, day, otherSub);
      const row = (lecture, mine) => {
        if (!lecture) return el("div", { class: "compare-row is-empty" }, el("time", { text: "—" }), el("span", { text: "No class" }));
        const sharedSubject = subjectsB.has(baseSubject(lecture.subject)) && subjectsA.has(baseSubject(lecture.subject));
        return el(
          "div",
          { class: `compare-row ${sharedSubject ? "is-shared" : ""}`.trim() },
          el("time", { text: fmtTime(lecture.start) }),
          el("span", {}, el("strong", { text: lecture.subject || "Class" }), el("small", { class: "faint", text: ` · ${lecture.room || "room TBA"}${mine ? "" : ""}` })),
        );
      };
      return el(
        "div",
        { class: "compare-day" },
        el("h4", { text: dayName }),
        el("div", { class: "tiny faint", text: `${section.id}${subgroup ? ` · ${subgroup}` : ""}` }),
        ...a.map((lecture) => row(lecture, true)),
        a.length ? null : el("div", { class: "compare-row is-empty" }, el("time", { text: "—" }), el("span", { text: "Free day" })),
        el("div", { class: "divider", style: { margin: "8px 0" } }),
        el("div", { class: "tiny faint", text: `${other.id}${otherSub ? ` · ${otherSub}` : ""}` }),
        ...b.map((lecture) => row(lecture, false)),
        b.length ? null : el("div", { class: "compare-row is-empty" }, el("time", { text: "—" }), el("span", { text: "Free day" })),
      );
    });

    body.replaceChildren(
      el(
        "div",
        { class: "grid grid--3", style: { marginBottom: "10px" } },
        el("div", { class: "stat" }, el("strong", { text: shared.length }), el("small", { text: "Shared subjects" })),
        el("div", { class: "stat" }, el("strong", { text: onlyA.length }), el("small", { text: `${section.id} only` })),
        el("div", { class: "stat" }, el("strong", { text: onlyB.length }), el("small", { text: `${other.id} only` })),
      ),
      shared.length
        ? el("p", { class: "small", text: `Common subjects: ${shared.slice(0, 8).join(", ")}. Highlighted rows are shared.` })
        : el("p", { class: "small muted", text: "No shared subject names in the published timetable. Lab groups may still overlap." }),
      el("div", { class: "compare-grid", style: { marginTop: "10px" } }, ...days),
      el(
        "div",
        { class: "row", style: { marginTop: "10px", gap: "6px", flexWrap: "wrap" } },
        el("a", { class: "btn btn--sm", href: `#/timetable/${other.id}` }, icon("calendar"), `Open ${other.id}`),
        el("button", { class: "btn btn--sm", type: "button", onclick: () => copyText(`Shared subjects between ${section.id} and ${other.id}: ${shared.join(", ") || "none"}`, "Comparison copied") }, icon("copy"), "Copy summary"),
      ),
    );
  };

  otherSelect.addEventListener("change", () => {
    fillSubgroups();
    render();
  });
  otherSubSelect.addEventListener("change", render);
  fillSubgroups();
  render();

  card.append(
    el("div", { class: "section-head" }, el("h2", { text: "Compare with a friend" }), el("span", { class: "badge badge--muted" }, icon("users"), "timetable comparison")),
    el("div", { class: "route-selects" }, el("div", { class: "field" }, el("label", { text: "Their section" }), otherSelect), el("div", { class: "field" }, el("label", { text: "Their practical group" }), otherSubSelect)),
    body,
  );
  return card;
}

function drawSection(root, section, timetable, rooms, roomMap, campus) {
  const stored = getState();
  const own = stored.profile.section === section.id ? stored.profile : null;
  let subgroup = own?.subgroup || "";
  let selectedDay = null;

  const draw = () => {
    setPageMeta({ kicker: `${section.program} · ${section.year === 1 ? "1st year" : section.year === 2 ? "2nd year" : `${section.year}rd year`}`, title: section.id });
    const summary = sectionSummary(section, subgroup);
    const subgroups = subgroupsFor(timetable, section.id);

    const chips = el("div", { class: "chip-row" });
    chips.appendChild(
      el(
        "button",
        { type: "button", class: `chip ${!subgroup ? "is-active" : ""}`.trim(), onclick: () => { subgroup = ""; draw(); } },
        icon("users"),
        "Whole section",
      ),
    );
    for (const group of subgroups) {
      chips.appendChild(
        el(
          "button",
          { type: "button", class: `chip ${subgroup === group.id ? "is-active" : ""}`.trim(), onclick: () => { subgroup = group.id; draw(); } },
          icon("layers"),
          group.id,
        ),
      );
    }

    const header = el(
      "div",
      { class: "stack" },
      el("div", { class: "row row--between row--wrap" }, el("a", { class: "link small", href: "#/timetable" }, icon("chevron-left"), "All sections")),
      el(
        "div",
        { class: "detail-hero" },
        el(
          "div",
          { class: "detail-main" },
          el("span", { class: "eyebrow" }, icon("calendar"), `${section.program} · Semester ${section.semester}`),
          el("h2", { class: "display", text: section.label }),
          el("p", { class: "detail-sub", text: `${section.branchName}${section.group ? ` · Group ${section.group}` : ""} · ${summary.total} lectures per week` }),
          el(
            "div",
            { class: "detail-actions" },
            own
              ? el("span", { class: "badge badge--ok", text: "Your section" })
              : el(
                  "button",
                  {
                    class: "btn btn--soft btn--sm",
                    type: "button",
                    onclick: () => {
                      setProfile({ section: section.id, subgroup });
                      toast("Set as your section");
                      draw();
                    },
                  },
                  icon("star"),
                  "Make this my section",
                ),
            favouriteButton({ type: "section", id: section.id, title: section.id, sub: section.label, to: `#/timetable/${section.id}` }),
            shareButton(section),
            el("button", { class: "btn btn--sm", type: "button", onclick: () => window.print() }, icon("file"), "Print"),
          ),
        ),
        el(
          "div",
          { class: "stat-grid", style: { minWidth: "210px", flex: "0 1 260px" } },
          el("div", { class: "stat" }, el("strong", { text: summary.total }), el("small", { text: "Lectures / week" })),
          el("div", { class: "stat" }, el("strong", { text: summary.subjects }), el("small", { text: "Subjects" })),
          el("div", { class: "stat" }, el("strong", { text: summary.teachers }), el("small", { text: "Teachers" })),
          el("div", { class: "stat" }, el("strong", { text: summary.labs }), el("small", { text: "Practicals" })),
        ),
      ),
      subgroups.length
        ? el(
            "div",
            { class: "row row--wrap" },
            el("span", { class: "small muted", text: "Practical group:" }),
            chips,
          )
        : null,
    );

    const grid = weekGrid(section, timetable, subgroup, { map: roomMap }, campus);
    const mobile = dayView(section, timetable, subgroup, { map: roomMap }, campus, selectedDay);

    const legend = el(
      "div",
      { class: "legend" },
      el("span", {}, el("i"), "Lecture"),
      el("span", {}, el("i", { class: "is-lab" }), "Practical / lab"),
      el("span", {}, icon("pin"), "Tap a class to see its block"),
    );

    root.replaceChildren(
      el(
        "div",
        { class: "page-enter stack", style: { gap: "16px" } },
        header,
        el(
          "div",
          { class: "card card--pad" },
          el(
            "div",
            { class: "tt-toolbar" },
            el("span", { class: "badge badge--muted" }, icon("clock"), `${timetable.source?.version || "current"} release`),
            el("span", { class: "small muted", text: `${fmtDate(new Date(), { weekday: true, month: "short", year: true })} · ${new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })} · Sunday has no scheduled classes.` }),
            el("span", { class: "spacer" }),
            el("button", { class: "btn btn--sm", type: "button", onclick: () => share({ title: section.id, text: section.label, url: `${location.origin}${location.pathname}#/timetable/${section.id}` }) }, icon("share"), "Share link"),
          ),
          grid,
          mobile,
          legend,
        ),
        comparePanel(section, timetable, subgroup, roomMap),
        el("section", { class: "section" }, el("div", { class: "section-head" }, el("h2", { text: "Subjects & teachers" })), subjectSummary(section, subgroup)),
        el(
          "p",
          { class: "small faint" },
          `Source: official FET timetable export (${timetable.source?.version || ""}). Room-to-block links are inferred from room codes; correct them in Admin → Room mapping.`,
        ),
      ),
    );
  };

  draw();
}
