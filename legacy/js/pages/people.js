import { el, icon, avatarEl, badge, setPageMeta, emptyState, toast, copyText, debounce, openSheet } from "../ui.js";
import { load, teachersMatching, studentsMatching, findTeacher, normName } from "../data.js";
import { getState } from "../store.js";
import { pageHead, teacherCard, favouriteButton, breadcrumb, callout } from "../components.js";
import { DAY_NAMES, fmtTime } from "../logic.js";

function tabs(active) {
  const items = [
    ["teachers", "Teachers", "users"],
    ["students", "Students", "graduation"],
    ["contacts", "Contacts", "phone"],
  ];
  return el(
    "nav",
    { class: "tabs", "aria-label": "People types" },
    ...items.map(([key, label, iconName]) =>
      el("a", { href: `#/people?tab=${key}`, "aria-current": active === key ? "page" : null }, icon(iconName), label),
    ),
  );
}

function teacherList(teachers, { query = "", department = "", teachingOnly = false } = {}) {
  let list = query ? teachersMatching(teachers, query) : [...teachers];
  if (department) list = list.filter((teacher) => teacher.department === department);
  if (teachingOnly) list = list.filter((teacher) => teacher.teaches);
  return list.sort((a, b) => Number(b.teaches) - Number(a.teaches) || a.name.localeCompare(b.name));
}

export async function render(root, params = {}) {
  const id = params.id || "";
  if (id) {
    if (params.kind === "teacher") return renderTeacher(root, decodeURIComponent(id));
    if (params.kind === "student") return renderStudent(root, decodeURIComponent(id));
  }
  return renderList(root, params);
}

async function renderList(root, params) {
  setPageMeta({ kicker: "People", title: "People" });
  let teachersData;
  let studentsData;
  let contactsData;
  try {
    [teachersData, studentsData, contactsData] = await Promise.all([load("teachers"), load("students"), load("contacts")]);
  } catch (err) {
    console.error(err);
    root.replaceChildren(emptyState({ iconName: "wifi-off", title: "People data unavailable", text: "Reconnect once to cache the faculty and student directories.", actionLabel: "Retry", onAction: () => location.reload() }));
    return;
  }

  const tab = ["teachers", "students", "contacts"].includes(params.tab) ? params.tab : "teachers";
  const teachers = teachersData.teachers || [];
  const students = studentsData.students || [];
  const departments = [...new Set(teachers.map((teacher) => teacher.department).filter(Boolean))].sort();

  const countLine = el("p", { class: "small muted" });
  const body = el("div", { style: { marginTop: "14px" } });

  const updateCount = (shown, total) => {
    countLine.textContent = `${shown} of ${total} shown`;
  };

  if (tab === "teachers") {
    let query = params.q || "";
    let department = "";
    let teachingOnly = false;
    let limit = 48;

    const search = el("input", { class: "input", type: "search", placeholder: "Search by name, subject or department…", value: query, "aria-label": "Search teachers" });
    const deptSelect = el("select", { class: "select", "aria-label": "Filter by department" });
    deptSelect.appendChild(el("option", { value: "", text: "All departments" }));
    for (const dept of departments) deptSelect.appendChild(el("option", { value: dept, text: dept }));
    const teachingChip = el("button", { class: "chip", type: "button", "aria-pressed": "false" }, icon("clock"), "Teaching this semester");

    const grid = el("div", { class: "people-grid" });
    const draw = () => {
      const list = teacherList(teachers, { query, department, teachingOnly });
      const shown = list.slice(0, limit);
      updateCount(shown.length, list.length);
      if (!list.length) {
        grid.replaceChildren(emptyState({ iconName: "users", title: "No teacher matches", text: "Try a surname, a subject like “Data Structures”, or clear the department filter." }));
        return;
      }
      const cards = shown.map((teacher) => teacherCard(teacher));
      if (list.length > shown.length) {
        cards.push(
          el(
            "button",
            { class: "btn btn--soft", type: "button", style: { gridColumn: "1 / -1" }, onclick: () => { limit += 48; draw(); } },
            `Show ${Math.min(48, list.length - shown.length)} more`,
          ),
        );
      }
      grid.replaceChildren(...cards);
    };

    search.addEventListener("input", debounce(() => { query = search.value; limit = 48; draw(); }, 100));
    deptSelect.addEventListener("change", () => { department = deptSelect.value; limit = 48; draw(); });
    teachingChip.addEventListener("click", () => {
      teachingOnly = !teachingOnly;
      teachingChip.classList.toggle("is-active", teachingOnly);
      teachingChip.setAttribute("aria-pressed", teachingOnly ? "true" : "false");
      limit = 48;
      draw();
    });

    draw();
    body.append(
      el(
        "div",
        { class: "card card--pad" },
        el(
          "div",
          {},
          pageHead({
            kicker: "Faculty directory",
            title: "Teachers",
            lede: `${teachers.length} public profiles, ${teachers.filter((t) => t.teaches).length} with a teaching load this semester. Search by name, subject, room or department.`,
          }),
          el("div", { class: "filter-bar" }, el("div", { class: "input-icon", style: { flex: "1 1 260px" } }, icon("search"), search), deptSelect, teachingChip),
          el("div", { class: "row row--between", style: { marginTop: "12px" } }, countLine, el("span", { class: "tiny faint", text: "Photos and profiles from the official faculty directory" })),
          grid,
        ),
      ),
    );
  }

  if (tab === "students") {
    const batches = [...new Set(students.map((s) => s.batch).filter(Boolean))].sort().reverse();
    let query = params.q || "";
    let batch = "";
    let section = "";
    let limit = 60;

    const search = el("input", { class: "input", type: "search", placeholder: "Name, CRN or university registration…", value: query, "aria-label": "Search students" });
    const batchSelect = el("select", { class: "select", "aria-label": "Filter by batch" });
    batchSelect.appendChild(el("option", { value: "", text: "All batches" }));
    for (const value of batches) batchSelect.appendChild(el("option", { value, text: `Batch ${value}` }));
    const sectionInput = el("input", { class: "input", type: "search", placeholder: "Section (e.g. ITA)", "aria-label": "Filter by section" });

    const listNode = el("div", { class: "result-list", style: { maxHeight: "none" } });
    const draw = () => {
      let list = studentsMatching(students, query);
      if (batch) list = list.filter((student) => student.batch === batch);
      if (section.trim()) list = list.filter((student) => student.section.toUpperCase().includes(section.trim().toUpperCase()));
      const shown = list.slice(0, limit);
      updateCount(shown.length, list.length);
      if (!list.length) {
        listNode.replaceChildren(emptyState({ iconName: "graduation", title: "No student matches", text: "Only the 2026 and 2025 batch rosters are published. 3rd and 4th-year rosters are not public." }));
        return;
      }
      const rows = shown.map((student) =>
        el(
          "a",
          { class: "result-row", href: `#/people/student/${encodeURIComponent(student.crn || student.registrationNo)}`, style: { borderBottom: "1px solid var(--line)", borderRadius: 0 } },
          avatarEl(student.name, "", "sm"),
          el(
            "div",
            { class: "result-main" },
            el("strong", { text: student.name }),
            el("small", { text: `${student.crn ? `CRN ${student.crn} · ` : ""}${student.section}${student.subgroup ? ` / ${student.subgroup}` : ""} · Batch ${student.batch}` }),
          ),
          el("span", { class: "badge badge--muted", text: student.branch }),
        ),
      );
      if (list.length > shown.length) {
        rows.push(el("button", { class: "btn btn--soft", type: "button", style: { margin: "10px" }, onclick: () => { limit += 60; draw(); } }, `Show ${Math.min(60, list.length - shown.length)} more`));
      }
      listNode.replaceChildren(...rows);
    };

    search.addEventListener("input", debounce(() => { query = search.value; limit = 60; draw(); }, 110));
    batchSelect.addEventListener("change", () => { batch = batchSelect.value; limit = 60; draw(); });
    sectionInput.addEventListener("input", debounce(() => { section = sectionInput.value; limit = 60; draw(); }, 140));

    draw();
    body.append(
      el(
        "div",
        { class: "card card--pad" },
        pageHead({
          kicker: "Academic rosters",
          title: "Students",
          lede: `${students.length} students from the published 2026 and 2025 batch rosters. Search by CRN, registration number, name or section.`,
        }),
        el("div", { class: "filter-bar" }, el("div", { class: "input-icon", style: { flex: "1 1 260px" } }, icon("search"), search), batchSelect, sectionInput),
        el("div", { class: "row row--between", style: { marginTop: "12px" } }, countLine, el("span", { class: "tiny faint", text: "Public roster PDFs only" })),
        listNode,
      ),
      callout("3rd and 4th-year rosters are not published by the college. Only the 2026 (1st year) and 2025 (2nd year) batches are available, and they exclude some later admissions.", { iconName: "info" }),
    );
  }

  if (tab === "contacts") {
    const roles = contactsData.roles || [];
    const people = contactsData.people || [];
    const rows = roles.map((role) =>
      el(
        "div",
        { class: "contact-row" },
        el("span", { class: "avatar avatar--sm", style: { background: "var(--primary-soft)" } }, icon("phone")),
        el(
          "div",
          { class: "contact-main" },
          el("strong", { text: role.name || role.role }),
          el("small", { text: role.role }),
          role.contactScope ? el("small", { style: { display: "block", color: "var(--faint)", fontSize: "10px" }, text: role.contactScope }) : null,
        ),
        el(
          "div",
          { class: "row", style: { gap: "4px" } },
          role.landline || role.phone
            ? el("a", { class: "icon-btn", href: `tel:${(role.landline || role.phone).replace(/\s+/g, "")}`, "aria-label": `Call ${role.name || role.role}` }, icon("phone"))
            : null,
          role.email ? el("a", { class: "icon-btn", href: `mailto:${role.email}`, "aria-label": `Email ${role.name || role.role}` }, icon("mail")) : null,
        ),
      ),
    );
    body.append(
      el(
        "div",
        { class: "stack" },
        pageHead({
          kicker: "Administration",
          title: "Contacts",
          lede: "Office landlines and role emails published by the college. Personal mobile numbers are intentionally not reproduced.",
        }),
        el("div", { class: "card card--pad" }, el("div", { class: "section-head" }, el("h2", { text: "Key offices" })), ...rows),
        people.length
          ? el(
              "div",
              { class: "card card--pad" },
              el("div", { class: "section-head" }, el("h2", { text: "Department offices" })),
              ...people.map((person) =>
                el(
                  "div",
                  { class: "contact-row" },
                  el("div", { class: "contact-main" }, el("strong", { text: person.name }), el("small", { text: person.role || person.department || "" })),
                  person.phone ? el("a", { class: "btn btn--sm", href: `tel:${person.phone}` }, icon("phone"), person.phone) : null,
                  person.email ? el("a", { class: "icon-btn", href: `mailto:${person.email}`, "aria-label": `Email ${person.name}` }, icon("mail")) : null,
                ),
              ),
            )
          : null,
        el(
          "p",
          { class: "small faint" },
          `Source: official administration directory${contactsData.checkedAt ? `, checked ${new Date(contactsData.checkedAt).toLocaleDateString("en-IN")}` : ""}.`,
        ),
      ),
    );
  }

  root.replaceChildren(
    el("div", { class: "page-enter" }, tabs(tab), body),
  );
}

async function renderTeacher(root, id) {
  let teachersData;
  try {
    teachersData = await load("teachers");
  } catch {
    root.replaceChildren(emptyState({ iconName: "wifi-off", title: "Teacher profile unavailable", text: "Reconnect once and try again." }));
    return;
  }
  const teacher = (teachersData.teachers || []).find((t) => t.id === id) || (teachersData.teachers || []).find((t) => normName(t.name) === normName(id));
  if (!teacher) {
    root.replaceChildren(emptyState({ iconName: "users", title: "Teacher not found", text: "This profile is not in the public directory.", actionLabel: "Back to people", onAction: () => { location.hash = "#/people"; } }));
    return;
  }
  setPageMeta({ kicker: "Faculty profile", title: teacher.name });

  const lecturesByDay = new Map();
  for (const lecture of teacher.lectures || []) {
    if (!lecturesByDay.has(lecture.day)) lecturesByDay.set(lecture.day, []);
    lecturesByDay.get(lecture.day).push(lecture);
  }

  const detail = el(
    "div",
    { class: "detail-hero" },
    avatarEl(teacher.name, teacher.photoUrl, "xl", "avatar--ring"),
    el(
      "div",
      { class: "detail-main" },
      el("span", { class: "eyebrow" }, icon("users"), teacher.department || "Faculty"),
      el("h2", { class: "display", text: teacher.name }),
      el("p", { class: "detail-sub", text: [teacher.designation, teacher.department, teacher.experience ? `${teacher.experience} experience` : ""].filter(Boolean).join(" · ") }),
      el(
        "div",
        { class: "detail-actions" },
        teacher.email ? el("a", { class: "btn btn--primary btn--sm", href: `mailto:${teacher.email}` }, icon("mail"), "Email") : null,
        teacher.profileUrl ? el("a", { class: "btn btn--sm", href: teacher.profileUrl, target: "_blank", rel: "noopener" }, icon("external"), "Official profile") : null,
        favouriteButton({ type: "teacher", id: teacher.id, title: teacher.name, sub: teacher.designation || "", to: `#/people/teacher/${encodeURIComponent(teacher.id)}` }),
        el("button", { class: "btn btn--sm", type: "button", onclick: () => copyText(teacher.email || teacher.name, "Copied") }, icon("copy"), "Copy email"),
      ),
    ),
  );

  const stats = el(
    "div",
    { class: "stat-grid", style: { marginTop: "14px" } },
    el("div", { class: "stat" }, el("strong", { text: teacher.hoursPerWeek || 0 }), el("small", { text: "Hours / week" })),
    el("div", { class: "stat" }, el("strong", { text: teacher.subjects?.length || 0 }), el("small", { text: "Subjects" })),
    el("div", { class: "stat" }, el("strong", { text: teacher.sections?.length || 0 }), el("small", { text: "Sections" })),
    el("div", { class: "stat" }, el("strong", { text: teacher.rooms?.length || 0 }), el("small", { text: "Rooms" })),
  );

  const week = (teacher.lectures || []).length
    ? el(
        "div",
        { class: "card card--pad" },
        el("div", { class: "section-head" }, el("h2", { text: "Weekly teaching" }), el("span", { class: "small muted", text: `${teacher.hoursPerWeek || 0} hours` })),
        ...[...lecturesByDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, lectures]) =>
          el(
            "div",
            { style: { marginBottom: "12px" } },
            el("span", { class: "eyebrow", text: DAY_NAMES[day] }),
            el(
              "div",
              { class: "timeline", style: { marginTop: "4px" } },
              ...lectures.sort((a, b) => a.start.localeCompare(b.start)).map((lecture) =>
                el(
                  "div",
                  { class: "class-row", style: { gridTemplateColumns: "64px 18px minmax(0,1fr) auto" } },
                  el("div", { class: "class-time" }, el("strong", { text: fmtTime(lecture.start) }), el("small", { text: `→ ${fmtTime(lecture.end)}` })),
                  el("div", { class: "class-rail" }, el("span", { class: "class-dot" })),
                  el(
                    "div",
                    { class: "class-body" },
                    el("strong", { text: lecture.subject.replace(/\s[LTP]$/, "") }),
                    el("div", { class: "class-meta" }, lecture.room ? el("span", {}, icon("pin"), lecture.room) : null, el("span", {}, icon("users"), lecture.group)),
                  ),
                  el("a", { class: "icon-btn", href: `#/timetable/${lecture.group}`, "aria-label": `Open ${lecture.group} timetable` }, icon("calendar")),
                ),
              ),
            ),
          ),
        ),
      )
    : callout("This teacher is in the official directory but has no lectures in the current FET timetable export.", { iconName: "info" });

  const about = el(
    "div",
    { class: "card card--pad" },
    el("div", { class: "section-head" }, el("h2", { text: "Profile" })),
    el(
      "dl",
      { class: "kv" },
      teacher.email ? [el("dt", { text: "Email" }), el("dd", {}, el("a", { href: `mailto:${teacher.email}` }, teacher.email))] : null,
      teacher.department ? [el("dt", { text: "Department" }), el("dd", { text: teacher.department })] : null,
      teacher.designation ? [el("dt", { text: "Designation" }), el("dd", { text: teacher.designation })] : null,
      teacher.experience ? [el("dt", { text: "Experience" }), el("dd", { text: teacher.experience })] : null,
      teacher.qualifications ? [el("dt", { text: "Qualifications" }), el("dd", { text: String(teacher.qualifications).replace(/\s*\d+\.\s*/g, " · ").replace(/^ · /, "") })] : null,
      teacher.publications && (teacher.publications.journals || teacher.publications.conferences)
        ? [el("dt", { text: "Publications" }), el("dd", { text: `${teacher.publications.journals || 0} journals · ${teacher.publications.conferences || 0} conferences` })]
        : null,
      teacher.researchInterests ? [el("dt", { text: "Research" }), el("dd", { text: String(teacher.researchInterests).slice(0, 700) })] : null,
      teacher.memberships ? [el("dt", { text: "Memberships" }), el("dd", { text: teacher.memberships })] : null,
    ),
    teacher.photoUrl ? el("p", { class: "tiny faint", style: { marginTop: "12px" }, text: "Photo and profile fields: gndec.ac.in faculty directory." }) : null,
  );

  root.replaceChildren(
    el(
      "div",
      { class: "page-enter stack", style: { gap: "16px" } },
      breadcrumb("All people", "#/people"),
      detail,
      stats,
      el(
        "div",
        { class: "grid grid--2", style: { alignItems: "start" } },
        week,
        el(
          "div",
          { class: "stack" },
          about,
          teacher.subjects?.length
            ? el(
                "div",
                { class: "card card--pad" },
                el("div", { class: "section-head" }, el("h2", { text: "Subjects" })),
                el("div", { class: "chip-row" }, ...teacher.subjects.map((subject) => el("a", { class: "chip", href: `#/study?tab=syllabus&q=${encodeURIComponent(subject.replace(/\s[LTP]$/, ""))}` }, icon("book"), subject.replace(/\s[LTP]$/, "")))),
              )
            : null,
          teacher.sections?.length
            ? el(
                "div",
                { class: "card card--pad" },
                el("div", { class: "section-head" }, el("h2", { text: "Sections taught" })),
                el("div", { class: "chip-row" }, ...teacher.sections.map((section) => el("a", { class: "chip", href: `#/timetable/${section}` }, icon("calendar"), section))),
              )
            : null,
          teacher.rooms?.length
            ? el(
                "div",
                { class: "card card--pad" },
                el("div", { class: "section-head" }, el("h2", { text: "Rooms" })),
                el("div", { class: "chip-row" }, ...teacher.rooms.map((room) => el("a", { class: "chip", href: `#/rasta?q=${encodeURIComponent(room)}` }, icon("pin"), room))),
              )
            : null,
        ),
      ),
    ),
  );
}

async function renderStudent(root, id) {
  let studentsData;
  try {
    studentsData = await load("students");
  } catch {
    root.replaceChildren(emptyState({ iconName: "wifi-off", title: "Student data unavailable", text: "Reconnect once and try again." }));
    return;
  }
  const students = studentsData.students || [];
  const key = String(id || "").toLowerCase();
  const student = students.find((s) => String(s.crn).toLowerCase() === key || String(s.registrationNo).toLowerCase() === key) || students.find((s) => s.name.toLowerCase() === key);
  if (!student) {
    root.replaceChildren(emptyState({ iconName: "graduation", title: "Student not found", text: "Only the 2026 and 2025 batch rosters are public.", actionLabel: "Back to people", onAction: () => { location.hash = "#/people?tab=students"; } }));
    return;
  }
  setPageMeta({ kicker: "Student roster", title: student.name });

  const detail = el(
    "div",
    { class: "detail-hero" },
    avatarEl(student.name, "", "xl", "avatar--ring"),
    el(
      "div",
      { class: "detail-main" },
      el("span", { class: "eyebrow" }, icon("graduation"), `Batch ${student.batch} · ${student.branch}`),
      el("h2", { class: "display", text: student.name }),
      el("p", { class: "detail-sub", text: `CRN ${student.crn || "—"}${student.registrationNo ? ` · Registration ${student.registrationNo}` : ""}` }),
      el(
        "div",
        { class: "detail-actions" },
        el("a", { class: "btn btn--primary btn--sm", href: `#/timetable/${student.section}` }, icon("calendar"), `Open ${student.section} timetable`),
        student.mentor ? el("a", { class: "btn btn--sm", href: `#/people?tab=teachers&q=${encodeURIComponent(student.mentor)}` }, icon("users"), "Find mentor") : null,
        el("button", { class: "btn btn--sm", type: "button", onclick: () => copyText(student.crn || student.registrationNo, "CRN copied") }, icon("copy"), "Copy CRN"),
        favouriteButton({ type: "student", id: student.crn || student.registrationNo, title: student.name, sub: student.section, to: `#/people/student/${encodeURIComponent(student.crn || student.registrationNo)}` }),
      ),
    ),
  );

  const body = el(
    "div",
    { class: "grid grid--2", style: { alignItems: "start" } },
    el(
      "div",
      { class: "card card--pad" },
      el("div", { class: "section-head" }, el("h2", { text: "Academic details" })),
      el(
        "dl",
        { class: "kv" },
        el("dt", { text: "Section" }),
        el("dd", {}, el("a", { href: `#/timetable/${student.section}` }, student.section)),
        student.subgroup ? [el("dt", { text: "Subgroup" }), el("dd", { text: student.subgroup })] : null,
        student.academicGroup ? [el("dt", { text: "Academic group" }), el("dd", { text: student.academicGroup })] : null,
        el("dt", { text: "Branch" }),
        el("dd", { text: student.branch }),
        el("dt", { text: "Batch" }),
        el("dd", { text: student.batch }),
        student.mentor ? [el("dt", { text: "Mentor" }), el("dd", {}, el("a", { href: `#/people?tab=teachers&q=${encodeURIComponent(student.mentor)}` }, student.mentor))] : null,
        student.mentorPhone ? [el("dt", { text: "Mentor phone" }), el("dd", {}, el("a", { href: `tel:${student.mentorPhone}` }, student.mentorPhone))] : null,
        student.venue ? [el("dt", { text: "Mentor venue" }), el("dd", { text: student.venue })] : null,
        student.coordinator ? [el("dt", { text: "Coordinator" }), el("dd", { text: student.coordinator })] : null,
      ),
    ),
    el(
      "div",
      { class: "stack" },
      el(
        "div",
        { class: "card card--pad" },
        el("div", { class: "section-head" }, el("h2", { text: "Mentor & venue" })),
        student.mentor ? el("p", { text: student.mentor }) : el("p", { class: "muted", text: "Mentor not listed." }),
        student.venue ? el("p", { class: "small muted", text: `Usually meets in ${student.venue}.` }) : null,
        student.venue ? el("a", { class: "btn btn--sm", style: { marginTop: "8px" }, href: `#/rasta?q=${encodeURIComponent(student.venue)}` }, icon("route"), "Find venue") : null,
      ),
      callout("Roster data is public. Mentor phone numbers are reproduced only because the college publishes them in the section PDFs.", { iconName: "lock" }),
      student.sourceUrl
        ? el("a", { class: "btn btn--sm", href: student.sourceUrl, target: "_blank", rel: "noopener" }, icon("external"), "Official roster PDF")
        : null,
    ),
  );

  root.replaceChildren(
    el("div", { class: "page-enter stack", style: { gap: "16px" } }, breadcrumb("All students", "#/people?tab=students"), detail, body),
  );
}
