import { el, icon, fmtDate, fmtShortDate, relativeDay, emptyState, setPageMeta, toast } from "../ui.js";
import { load } from "../data.js";
import { getState, hasProfile, subscribe } from "../store.js";
import { classRow, greeting, noticeRow, photoStrip, openProfileEditor, sectionCard, callout } from "../components.js";
import { dayPlan, nextLecture, fmtDuration, fmtTime, DAY_NAMES, uniqueSubjects } from "../logic.js";

function nextClassCard(section, subgroup, now) {
  const card = el("div", { class: "next-class" });
  if (!section) {
    card.append(
      el("span", { class: "eyebrow" }, icon("graduation"), "Make it yours"),
      el("h3", { text: "Which section are you in?" }),
      el("p", { class: "small muted", text: "Pick your section once. Today, timetable and the assistant will then speak about your actual classes." }),
      el(
        "button",
        { class: "btn btn--primary btn--sm", type: "button", onclick: () => openProfileEditor() },
        icon("plus"),
        "Choose my section",
      ),
    );
    return card;
  }

  const next = nextLecture(section, subgroup, now);
  if (!next) {
    card.append(
      el("span", { class: "eyebrow" }, icon("calendar"), section.id),
      el("h3", { text: "No classes ahead" }),
      el("p", { class: "small muted", text: "The published timetable has no upcoming lecture for this section. Check notices for changes." }),
      el("a", { class: "btn btn--soft btn--sm", href: `#/timetable/${section.id}` }, icon("calendar"), "Open timetable"),
    );
    return card;
  }

  const { lecture, kind, startsIn, endsIn, dayOffset } = next;
  const when =
    kind === "now"
      ? `In progress · ${fmtDuration(endsIn)} left`
      : kind === "today"
        ? `Starts in ${fmtDuration(startsIn)}`
        : `${dayOffset === 1 ? "Tomorrow" : DAY_NAMES[next.day]} · ${fmtTime(lecture.start)}`;

  card.append(
    el("span", { class: "eyebrow" }, icon(kind === "now" ? "clock" : "arrow-right"), kind === "now" ? "Happening now" : "Next class"),
    el("h3", { text: lecture.subject }),
    el(
      "div",
      { class: "meta-line" },
      el("span", {}, icon("clock"), `${fmtTime(lecture.start)} – ${fmtTime(lecture.end)}`),
      lecture.room ? el("span", {}, icon("pin"), lecture.room) : null,
      lecture.teacher ? el("span", {}, icon("users"), lecture.teacher) : null,
    ),
    el("div", { class: "countdown" }, icon("clock"), el("span", { text: when })),
    el(
      "div",
      { class: "row", style: { gap: "7px", flexWrap: "wrap" } },
      el("a", { class: "btn btn--primary btn--sm", href: `#/timetable/${section.id}` }, icon("calendar"), "Timetable"),
      lecture.room ? el("a", { class: "btn btn--sm", href: `#/rasta/room/${encodeURIComponent(lecture.room)}` }, icon("route"), "Find room") : null,
      el("a", { class: "btn btn--sm", href: "#/assistant" }, icon("sparkles"), "Ask"),
    ),
  );
  return card;
}

function todayList(section, subgroup, rooms, campus, now) {
  if (!section) {
    return emptyState({
      iconName: "graduation",
      title: "Your day appears here",
      text: "Choose your section and GNDEC One shows the exact lectures, rooms and next class for today.",
      actionLabel: "Choose section",
      onAction: () => openProfileEditor(),
    });
  }
  const plan = dayPlan(section, subgroup, now);
  if (plan.isOff) {
    const monday = nextLecture(section, subgroup, now);
    return el(
      "div",
      { class: "stack" },
      emptyState({ iconName: "coffee", title: "Sunday — no scheduled classes", text: "Enjoy the break. The week's first lecture is shown below." }),
      monday
        ? el(
            "div",
            { class: "card card--pad" },
            el("span", { class: "eyebrow" }, icon("calendar"), DAY_NAMES[monday.day]),
            el("h3", { class: "display", style: { fontSize: "20px", marginTop: "4px" }, text: monday.lecture.subject }),
            el("p", { class: "small muted", text: `${fmtTime(monday.lecture.start)} · ${monday.lecture.room || "Room not published"} · ${monday.lecture.teacher || "Teacher not listed"}` }),
          )
        : null,
    );
  }
  if (!plan.lectures.length) {
    return emptyState({
      iconName: "coffee",
      title: "No classes today",
      text: "Nothing is scheduled for your section today in the official timetable.",
    });
  }

  const nowMins = now.getHours() * 60 + now.getMinutes();
  const next = plan.lectures.find((lecture) => (lecture.end ? lecture.state !== "done" : true));
  return el(
    "div",
    { class: "timeline" },
    ...plan.lectures.map((lecture) =>
      classRow(lecture, {
        state: lecture.state,
        place: rooms && lecture.room ? (campus?.places || []).find((p) => p.id === (rooms.map?.[lecture.room] || "")) || null : null,
      }),
    ),
  );
}

function roomsToday(section, rooms, campus) {
  if (!section) return null;
  const names = [...new Set(section.lectures.map((lecture) => lecture.room).filter(Boolean))].slice(0, 10);
  if (!names.length) return null;
  return el(
    "div",
    { class: "chip-row" },
    ...names.map((name) => {
      const place = campus?.places?.find((p) => p.id === rooms?.map?.[name]);
      return el(
        "a",
        { class: "chip", href: place ? `#/rasta/place/${place.id}` : `#/rasta?q=${encodeURIComponent(name)}` },
        icon(place ? "pin" : "route"),
        name,
      );
    }),
  );
}

export async function render(root) {
  setPageMeta({ kicker: "GNDEC One", title: "Today" });
  const state = getState();
  root.appendChild(
    el(
      "div",
      { class: "stack", style: { gap: "18px" } },
      el("div", { class: "skeleton skeleton--hero" }),
      el("div", { class: "grid grid--2" }, el("div", { class: "skeleton skeleton--card" }), el("div", { class: "skeleton skeleton--card" })),
    ),
  );

  let data;
  try {
    const [meta, timetable, notices, campus, rooms] = await Promise.all([
      load("meta"),
      load("timetable"),
      load("notices"),
      load("campus"),
      load("rooms"),
    ]);
    data = { meta, timetable, notices, campus, rooms };
  } catch (err) {
    console.error(err);
    root.replaceChildren(
      emptyState({
        iconName: "wifi-off",
        title: "Data could not load",
        text: "You may be offline before the data was cached. Reconnect once, or open Settings → Download for offline.",
        actionLabel: "Try again",
        onAction: () => location.reload(),
      }),
    );
    return;
  }

  const { meta, timetable, notices, campus, rooms } = data;
  const now = new Date();
  const profile = getState().profile;
  const section = profile.section ? (timetable.sections || []).find((s) => s.id === profile.section) : null;
  const subgroup = profile.section === section?.id ? profile.subgroup : "";
  const plan = dayPlan(section, subgroup, now);
  const upcoming = (notices.notices || []).slice(0, 4);
  const latestHoliday = (notices.holidays || [])
    .filter((holiday) => new Date(`${holiday.date}T00:00:00`) >= new Date(now.getFullYear(), now.getMonth(), now.getDate()))
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  const rawRooms = new Map();
  for (const room of rooms.rooms || []) rawRooms.set(room.name, room.place);

  const greetingText = profile.name ? `${greeting(now)}, ${profile.name.split(" ")[0]}.` : `${greeting(now)}.`;

  const hero = el(
    "section",
    { class: "hero hero--home" },
    el(
      "div",
      {},
      el("div", { class: "hero-date" }, icon("calendar"), fmtDate(now, { weekday: true, month: "long", year: true })),
      el("h2", { class: "display", text: greetingText }),
      el(
        "p",
        { class: "lede" },
        section
          ? `${section.label}. ${plan.isOff ? "It is Sunday, so there are no scheduled lectures." : `${plan.lectures.length} lecture${plan.lectures.length === 1 ? "" : "s"} on today's plan.`}${latestHoliday ? ` Next holiday: ${latestHoliday.name} on ${fmtShortDate(latestHoliday.date)}.` : ""}`
          : "One calm place for timetables, people, rooms, routes, syllabus, papers and notices. Set your section to make it personal.",
      ),
      profile.branch || profile.year || profile.mentor
        ? el("p", {
            class: "tiny muted",
            text: [
              profile.crn ? `CRN ${profile.crn}` : "",
              profile.branch,
              profile.year ? `Year ${profile.year}` : "",
              profile.batch ? `Batch ${profile.batch}` : "",
              profile.mentor ? `Mentor ${profile.mentor}` : "",
            ]
              .filter(Boolean)
              .join(" · "),
          })
        : "",
      el(
        "div",
        { class: "hero-actions" },
        section
          ? el("a", { class: "btn btn--primary", href: `#/timetable/${section.id}` }, icon("calendar"), "This week")
          : el("button", { class: "btn btn--primary", type: "button", onclick: () => openProfileEditor() }, icon("plus"), "Set my section"),
        el("a", { class: "btn", href: "#/rasta" }, icon("map"), "Campus map"),
        el("a", { class: "btn", href: "#/assistant" }, icon("sparkles"), "Ask about today"),
      ),
    ),
    nextClassCard(section, subgroup, now),
  );

  const schedule = el(
    "section",
    { class: "section" },
    el(
      "div",
      { class: "section-head" },
      el("h2", { text: plan.isOff ? "Next up" : "Today's classes" }),
      section ? el("a", { class: "link", href: `#/timetable/${section.id}` }, "Full week", icon("chevron-right")) : null,
    ),
    el("div", { class: "card card--pad" }, todayList(section, subgroup, { map: rawRooms }, campus, now)),
    section
      ? el(
          "div",
          { class: "row row--between row--wrap", style: { marginTop: "10px" } },
          el("div", { class: "row row--wrap", style: { gap: "6px" } }, ...(uniqueSubjects(section, subgroup).slice(0, 4).map((subject) =>
            el("span", { class: "chip" }, icon("book-open"), subject.subject.replace(/\s[LTP]$/, "")),
          ))),
          el("a", { class: "text-btn", href: `#/timetable/${section.id}` }, "Show subjects", icon("chevron-right")),
        )
      : null,
  );

  const quick = el(
    "section",
    { class: "section" },
    el("div", { class: "section-head" }, el("h2", { text: "Quick actions" })),
    el(
      "div",
      { class: "quick-grid" },
      ...[
        ["calendar", "Timetable", "All sections & groups", "#/timetable"],
        ["map", "Rasta", "Rooms, routes, places", "#/rasta"],
        ["file", "Papers", `${meta.counts?.papers || 0} previous papers`, "#/study?tab=papers"],
        ["book", "Syllabus", "Schemes and first year", "#/study?tab=syllabus"],
        ["bell", "Notices", "Latest circulars", "#/notices"],
        ["file-check", "Exams", "Dates, gaps, tips", "#/exams"],
        ["users", "People", "Teachers & students", "#/people"],
        ["sparkles", "Assistant", "Ask in plain language", "#/assistant"],
      ].map(([iconName, title, sub, href]) =>
        el(
          "a",
          { class: "quick-action", href },
          el("span", { class: "quick-icon" }, icon(iconName)),
          el("strong", { text: title }),
          el("small", { text: sub }),
        ),
      ),
    ),
  );

  const noticesSection = el(
    "section",
    { class: "section" },
    el(
      "div",
      { class: "section-head" },
      el("h2", { text: "Latest notices" }),
      el("a", { class: "link", href: "#/notices" }, "All notices", icon("chevron-right")),
    ),
    el(
      "div",
      { class: "card card--pad" },
      upcoming.length
        ? el("div", { class: "notice-list" }, ...upcoming.map((notice) => noticeRow(notice, { compact: true })))
        : emptyState({ iconName: "bell", title: "No notices cached", text: "Reconnect to fetch the latest circulars." }),
    ),
  );

  const roomsSection = section
    ? el(
        "section",
        { class: "section" },
        el(
          "div",
          { class: "section-head" },
          el("h2", { text: "Your rooms this week" }),
          el("a", { class: "link", href: "#/rasta" }, "Open Rasta", icon("chevron-right")),
        ),
        roomsToday(section, { map: rawRooms }, campus) || emptyState({ iconName: "pin", title: "No rooms listed", text: "This section's timetable does not name rooms." }),
      )
    : null;

  const favourites = getState().favourites || [];
  const favouritesSection = favourites.length
    ? el(
        "section",
        { class: "section" },
        el("div", { class: "section-head" }, el("h2", { text: "Saved" })),
        el(
          "div",
          { class: "chip-row" },
          ...favourites.slice(0, 10).map((fav) => el("a", { class: "chip", href: fav.to }, icon(fav.type === "teacher" ? "users" : fav.type === "section" ? "calendar" : "star"), fav.title)),
        ),
      )
    : null;

  const campusSection = el(
    "section",
    { class: "section" },
    el(
      "div",
      { class: "section-head" },
      el("h2", { text: "Around campus" }),
      el("a", { class: "link", href: "#/about" }, "Photos & credits", icon("chevron-right")),
    ),
    photoStrip(campus),
  );

  const footerNote = callout(
    `Timetable version ${timetable.source?.version || "—"} · data updated ${relativeDay(meta.generatedAt)}. Public sources only; room-to-block links are inferred and editable in Admin.`,
    { iconName: "info" },
  );

  root.replaceChildren(
    el(
      "div",
      { class: "stack page-enter", style: { gap: "4px" } },
      hero,
      schedule,
      quick,
      noticesSection,
      roomsSection,
      favouritesSection,
      campusSection,
      footerNote,
    ),
  );
}
