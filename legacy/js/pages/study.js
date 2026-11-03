import { el, icon, setPageMeta, emptyState, debounce, toast, safeUrl } from "../ui.js";
import { load, paperSearch, syllabusSearch } from "../data.js";
import { pageHead, callout } from "../components.js";

const TABS = [
  ["papers", "Previous papers", "file"],
  ["syllabus", "Syllabus", "book"],
  ["notes", "Question banks", "file-check"],
  ["first-year", "First year reader", "book-open"],
];

function tabNav(active) {
  return el(
    "nav",
    { class: "tabs", "aria-label": "Study sections" },
    ...TABS.map(([key, label, iconName]) =>
      el("a", { href: `#/study?tab=${key}`, "aria-current": active === key ? "page" : null }, icon(iconName), label),
    ),
  );
}

export async function render(root, params = {}) {
  const tab = TABS.some(([key]) => key === params.tab) ? params.tab : "papers";
  setPageMeta({ kicker: "Study", title: tab === "papers" ? "Previous papers" : tab === "syllabus" ? "Syllabus" : tab === "notes" ? "Question banks" : "First year reader" });

  if (tab === "papers") return renderPapers(root, params);
  if (tab === "syllabus") return renderSyllabus(root, params);
  if (tab === "notes") return renderNotes(root, params);
  return renderFirstYear(root, params);
}

/* ------------------------------------------------------------------ */
/* Previous-year papers                                                */
/* ------------------------------------------------------------------ */

async function renderPapers(root, params) {
  let data;
  try {
    data = await load("papers");
  } catch (err) {
    console.error(err);
    root.replaceChildren(
      emptyState({
        iconName: "wifi-off",
        title: "Paper archive unavailable",
        text: "Reconnect once to cache the 1,600-paper archive, then it works offline.",
        actionLabel: "Retry",
        onAction: () => location.reload(),
      }),
    );
    return;
  }

  const papers = data.papers || [];
  const sessions = (data.sessions || []).map((session) => session.label);
  const departments = [...new Set(papers.map((paper) => paper.department).filter(Boolean))].sort();
  const yearRange = (() => {
    const years = papers.map((paper) => Number(paper.year)).filter(Boolean);
    return years.length ? `${Math.min(...years)}–${Math.max(...years)}` : "";
  })();

  let query = params.q || "";
  let session = "";
  let department = "";
  let limit = 50;

  const search = el("input", {
    class: "input",
    type: "search",
    placeholder: "Paper code or subject, e.g. BTCS-304, data structures…",
    value: query,
    "aria-label": "Search papers",
  });

  const sessionSelect = el("select", { class: "select", "aria-label": "Filter by session" });
  sessionSelect.appendChild(el("option", { value: "", text: "All sessions" }));
  for (const label of sessions) sessionSelect.appendChild(el("option", { value: label, text: label }));

  const deptSelect = el("select", { class: "select", "aria-label": "Filter by department" });
  deptSelect.appendChild(el("option", { value: "", text: "All departments" }));
  for (const dept of departments) deptSelect.appendChild(el("option", { value: dept, text: dept }));

  const countLine = el("p", { class: "small muted" });
  const list = el("div", { class: "paper-list" });

  const draw = () => {
    const matches = paperSearch(papers, query, { session, department });
    const shown = matches.slice(0, limit);
    countLine.textContent = `${matches.length.toLocaleString("en-IN")} paper${matches.length === 1 ? "" : "s"} match${matches.length === 1 ? "es" : ""}`;

    if (!matches.length) {
      list.replaceChildren(
        emptyState({
          iconName: "file",
          title: "No paper matches",
          text: "Try the subject code printed on your admit card, or clear the session filter.",
          actionLabel: "Clear filters",
          onAction: () => {
            search.value = "";
            sessionSelect.value = "";
            deptSelect.value = "";
            query = "";
            session = "";
            department = "";
            limit = 50;
            draw();
          },
        }),
      );
      return;
    }

    const rows = shown.map((paper) =>
      el(
        "div",
        { class: "paper-row" },
        el("span", { class: "code-badge", text: paper.code || "—" }),
        el(
          "div",
          { class: "paper-main" },
          el("strong", { text: paper.title && paper.title !== paper.code ? paper.title : paper.name.replace(/\.pdf$/i, "") }),
          el(
            "small",
            {},
            `${paper.session}${paper.department ? ` · ${paper.department}` : ""}${paper.makeup ? " · makeup" : ""}`,
          ),
        ),
        el(
          "div",
          { class: "paper-actions" },
          safeUrl(paper.view)
            ? el("a", { class: "icon-btn", href: safeUrl(paper.view), target: "_blank", rel: "noopener", "aria-label": "Open paper", title: "Open on Google Drive" }, icon("eye"))
            : null,
          safeUrl(paper.download)
            ? el("a", { class: "icon-btn", href: safeUrl(paper.download), target: "_blank", rel: "noopener", "aria-label": "Download paper", title: "Download PDF" }, icon("download"))
            : null,
        ),
      ),
    );

    if (matches.length > shown.length) {
      rows.push(
        el(
          "button",
          {
            class: "btn btn--soft",
            type: "button",
            style: { alignSelf: "center", marginTop: "6px" },
            onclick: () => {
              limit += 50;
              draw();
            },
          },
          icon("chevron-down"),
          `Show ${Math.min(50, matches.length - shown.length)} more`,
        ),
      );
    }
    list.replaceChildren(...rows);
  };

  search.addEventListener("input", debounce(() => { query = search.value; limit = 50; draw(); }, 110));
  sessionSelect.addEventListener("change", () => { session = sessionSelect.value; limit = 50; draw(); });
  deptSelect.addEventListener("change", () => { department = deptSelect.value; limit = 50; draw(); });
  draw();

  root.replaceChildren(
    el(
      "div",
      { class: "page-enter" },
      tabNav("papers"),
      pageHead({
        kicker: `Archive · ${yearRange}`,
        title: "Previous-year papers",
        lede: `${papers.length.toLocaleString("en-IN")} question papers across ${sessions.length} examination sessions, indexed from the GNDEC shared Drive archive.`,
        actions: [
          el("a", { class: "btn btn--sm", href: "https://drive.google.com/drive/folders/11ywkOKyeixCPihsCzqZDyzy2msLXxx6w", target: "_blank", rel: "noopener" }, icon("external"), "Original Drive folder"),
          el("a", { class: "btn btn--sm", href: "#/exams" }, icon("file-check"), "Exam help"),
        ],
      }),
      el(
        "div",
        { class: "card card--pad", style: { marginTop: "14px" } },
        el(
          "div",
          { class: "filter-bar" },
          el("div", { class: "input-icon", style: { flex: "1 1 280px" } }, icon("search"), search),
          sessionSelect,
          deptSelect,
        ),
        el("div", { class: "row row--between", style: { marginTop: "12px" } }, countLine, el("span", { class: "tiny faint", text: "Newest papers first" })),
        el("div", { style: { marginTop: "10px" } }, list),
      ),
      callout(
        "The archive is shared by the college and covers 2013–2025. Later sessions and some elective subjects are simply not uploaded, so a missing paper is not an app error.",
        { iconName: "info" },
      ),
    ),
  );
}

/* ------------------------------------------------------------------ */
/* Syllabus                                                            */
/* ------------------------------------------------------------------ */

async function renderSyllabus(root, params) {
  let data;
  try {
    data = await load("syllabus");
  } catch (err) {
    console.error(err);
    root.replaceChildren(emptyState({ iconName: "wifi-off", title: "Syllabus unavailable", text: "Reconnect once to cache the syllabus library.", actionLabel: "Retry", onAction: () => location.reload() }));
    return;
  }

  const docs = data.documents || [];
  const programs = [...new Set(docs.map((doc) => doc.program).filter(Boolean))];
  const branches = [...new Set(docs.map((doc) => doc.branch).filter(Boolean))];
  let query = params.q || "";
  let program = "";
  let branch = "";

  const search = el("input", { class: "input", type: "search", placeholder: "Search a scheme, semester or branch…", value: query, "aria-label": "Search syllabus" });
  const programChips = el("div", { class: "chip-row" });
  const branchSelect = el("select", { class: "select", "aria-label": "Filter by branch" });
  branchSelect.appendChild(el("option", { value: "", text: "All branches" }));
  for (const code of branches) {
    const doc = docs.find((item) => item.branch === code);
    branchSelect.appendChild(el("option", { value: code, text: `${code} — ${doc?.branchName || code}` }));
  }

  const count = el("p", { class: "small muted" });
  const grid = el("div", { class: "grid grid--3", style: { marginTop: "12px" } });

  const draw = () => {
    for (const chip of programChips.querySelectorAll("button")) {
      chip.classList.toggle("is-active", (chip.dataset.program || "") === program);
    }
    const matches = syllabusSearch(docs, query, { program, code: branch });
    count.textContent = `${matches.length} document${matches.length === 1 ? "" : "s"}`;
    if (!matches.length) {
      grid.replaceChildren(emptyState({ iconName: "book", title: "No syllabus matches", text: "First-year Sem 1–2 is complete. Branch documents are partial." }));
      return;
    }
    grid.replaceChildren(
      ...matches.map((doc) =>
        el(
          "a",
          { class: "syllabus-card", href: safeUrl(doc.url), target: "_blank", rel: "noopener" },
          el(
            "div",
            { class: "syllabus-top" },
            el("h4", { text: doc.title }),
            icon("external"),
          ),
          el("p", { class: "small muted", text: `${doc.branchName} · ${doc.program}` }),
          el(
            "div",
            { class: "syllabus-meta" },
            el("span", { class: "badge", text: doc.semester || "—" }),
            doc.scheme ? el("span", { class: "badge badge--muted", text: `${doc.scheme} scheme` }) : null,
            el("span", { class: "badge badge--muted", text: "PDF" }),
          ),
        ),
      ),
    );
  };

  const chipFor = (label, value) => {
    const chip = el("button", { class: "chip", type: "button", "data-program": value, onclick: () => { program = value; draw(); } }, icon(value ? "graduation" : "grid"), label);
    return chip;
  };
  programChips.append(chipFor(`All ${docs.length}`, ""), ...programs.map((value) => chipFor(value, value)));

  search.addEventListener("input", debounce(() => { query = search.value; draw(); }, 110));
  branchSelect.addEventListener("change", () => { branch = branchSelect.value; draw(); });
  draw();

  root.replaceChildren(
    el(
      "div",
      { class: "page-enter" },
      tabNav("syllabus"),
      pageHead({
        kicker: "Official study schemes",
        title: "Syllabus library",
        lede: "The complete first-year Sem 1–2 scheme, plus every branch-wise and program document the college publishes.",
        actions: [el("a", { class: "btn btn--primary btn--sm", href: "#/study?tab=first-year" }, icon("book-open"), "Read first year")],
      }),
      el(
        "div",
        { class: "card card--pad", style: { marginTop: "14px" } },
        el("div", { class: "filter-bar" }, el("div", { class: "input-icon", style: { flex: "1 1 280px" } }, icon("search"), search), branchSelect),
        el("div", { class: "row row--wrap", style: { marginTop: "10px" } }, programChips),
        count,
        grid,
      ),
      callout(
        "B.Tech first year (Semester 1–2) is fully covered, including the text reader. Documents for later semesters exist only where the college or department has published them — 4th-year and several elective schemes are missing.",
        { iconName: "info" },
      ),
    ),
  );
}

/* ------------------------------------------------------------------ */
/* Question banks / notes                                              */
/* ------------------------------------------------------------------ */

async function renderNotes(root, params) {
  let data;
  try {
    data = await load("syllabus");
  } catch (err) {
    console.error(err);
    root.replaceChildren(emptyState({ iconName: "wifi-off", title: "Question banks unavailable", text: "Reconnect once and try again.", actionLabel: "Retry", onAction: () => location.reload() }));
    return;
  }

  const banks = data.questionBanks || [];
  let query = params.q || "";
  const search = el("input", { class: "input", type: "search", placeholder: "Search a subject or code…", value: query, "aria-label": "Search question banks" });
  const count = el("p", { class: "small muted" });
  const list = el("div", { class: "paper-list" });

  const draw = () => {
    const q = query.trim().toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);
    const matches = banks.filter((bank) => !tokens.length || tokens.every((token) => bank.title.toLowerCase().includes(token)));
    count.textContent = `${matches.length} question bank${matches.length === 1 ? "" : "s"}`;
    if (!matches.length) {
      list.replaceChildren(emptyState({ iconName: "file-check", title: "No question bank matches", text: "Only the IT department's public question banks are indexed." }));
      return;
    }
    list.replaceChildren(
      ...matches.map((bank) =>
        el(
          "div",
          { class: "paper-row" },
          el("span", { class: "code-badge", text: "QB" }),
          el(
            "div",
            { class: "paper-main" },
            el("strong", { text: bank.title.replace(/\s*\([^)]*\)\s*$/, "") }),
            el("small", { text: bank.title.match(/\(([^)]+)\)\s*$/)?.[1] || "Question bank" }),
          ),
          el(
            "div",
            { class: "paper-actions" },
            safeUrl(bank.url)
              ? el("a", { class: "icon-btn", href: safeUrl(bank.url), target: "_blank", rel: "noopener", "aria-label": `Open ${bank.title}`, title: "Open PDF" }, icon("eye"))
              : null,
          ),
        ),
      ),
    );
  };

  search.addEventListener("input", debounce(() => { query = search.value; draw(); }, 100));
  draw();

  root.replaceChildren(
    el(
      "div",
      { class: "page-enter" },
      tabNav("notes"),
      pageHead({
        kicker: "Practice material",
        title: "Question banks",
        lede: `${banks.length} question banks published by the IT department. Use them with the syllabus and previous papers to plan revision.`,
        actions: [el("a", { class: "btn btn--soft btn--sm", href: "#/study?tab=papers" }, icon("file"), "Previous papers")],
      }),
      el(
        "div",
        { class: "card card--pad", style: { marginTop: "14px" } },
        el("div", { class: "input-icon" }, icon("search"), search),
        count,
        el("div", { style: { marginTop: "10px" } }, list),
      ),
      callout(
        "Only the IT department publishes open question banks. Notes for other departments, handwritten notes, and unit-wise PDFs are not available from an official public source.",
        { iconName: "info" },
      ),
    ),
  );
}

/* ------------------------------------------------------------------ */
/* First-year reader                                                   */
/* ------------------------------------------------------------------ */

function renderTextWithHighlight(text, query) {
  const wrap = el("span");
  const q = String(query || "").trim();
  if (!q) {
    wrap.textContent = text;
    return wrap;
  }
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escaped, "gi");
  let last = 0;
  let match;
  while ((match = regex.exec(text))) {
    if (match.index > last) wrap.appendChild(document.createTextNode(text.slice(last, match.index)));
    wrap.appendChild(el("mark", { text: match[0] }));
    last = match.index + match[0].length;
    if (match[0].length === 0) regex.lastIndex += 1;
  }
  if (last < text.length) wrap.appendChild(document.createTextNode(text.slice(last)));
  return wrap;
}

async function renderFirstYear(root, params) {
  let data;
  try {
    data = await load("syllabus");
  } catch (err) {
    console.error(err);
    root.replaceChildren(emptyState({ iconName: "wifi-off", title: "Reader unavailable", text: "Reconnect once to cache the first-year syllabus text.", actionLabel: "Retry", onAction: () => location.reload() }));
    return;
  }

  const pages = data.firstYear?.pages || [];
  if (!pages.length) {
    root.replaceChildren(emptyState({ iconName: "book", title: "No pages extracted", text: "The first-year PDF could not be read. Open the official PDF instead.", actionLabel: "Open official PDF", onAction: () => window.open(data.firstYear?.source || "https://appsc.gndec.ac.in/time_tables", "_blank", "noopener") }));
    return;
  }

  let current = Math.min(Math.max(Number(params.p) || 1, 1), pages.length);
  let query = params.q || "";

  const pageSelect = el("select", { class: "select", "aria-label": "Jump to page", style: { maxWidth: "150px" } });
  for (const page of pages) pageSelect.appendChild(el("option", { value: page.number, text: `Page ${page.number}` }));
  pageSelect.value = String(current);

  const search = el("input", { class: "input", type: "search", placeholder: "Find in the syllabus, e.g. ESC101…", value: query, "aria-label": "Search inside the syllabus" });
  const readerBody = el("div", { class: "reader-body" });
  const readerTitle = el("strong", { text: "" });
  const readerSub = el("small", { class: "muted", text: "" });
  const matchesNode = el("div", { class: "chip-row", style: { marginTop: "8px" } });

  const drawPage = () => {
    const page = pages.find((item) => item.number === current) || pages[0];
    readerTitle.textContent = `Study scheme — page ${page.number}`;
    readerSub.textContent = `Page ${page.number} of ${pages.length} · extracted from the official PDF`;
    pageSelect.value = String(page.number);
    readerBody.replaceChildren(renderTextWithHighlight(page.text || "", query));
    readerBody.scrollTop = 0;
  };

  const drawMatches = () => {
    matchesNode.replaceChildren();
    const q = query.trim().toLowerCase();
    if (!q) return;
    const matches = pages.filter((page) => page.text.toLowerCase().includes(q));
    if (!matches.length) {
      matchesNode.appendChild(el("span", { class: "small faint", text: "No page contains that word." }));
      return;
    }
    for (const page of matches.slice(0, 10)) {
      const index = page.text.toLowerCase().indexOf(q);
      const snippet = page.text.slice(Math.max(0, index - 30), Math.min(page.text.length, index + q.length + 40)).replace(/\s+/g, " ");
      matchesNode.appendChild(
        el(
          "button",
          {
            class: `chip ${page.number === current ? "is-active" : ""}`.trim(),
            type: "button",
            onclick: () => {
              current = page.number;
              drawPage();
              drawMatches();
            },
          },
          icon("file"),
          `p${page.number}: …${snippet}…`,
        ),
      );
    }
  };

  const go = (delta) => {
    current = Math.min(Math.max(current + delta, pages[0].number), pages[pages.length - 1].number);
    drawPage();
    drawMatches();
  };

  pageSelect.addEventListener("change", () => {
    current = Number(pageSelect.value) || 1;
    drawPage();
    drawMatches();
  });
  search.addEventListener(
    "input",
    debounce(() => {
      query = search.value;
      drawPage();
      drawMatches();
    }, 140),
  );

  drawPage();
  drawMatches();

  root.replaceChildren(
    el(
      "div",
      { class: "page-enter" },
      tabNav("first-year"),
      pageHead({
        kicker: "B.Tech · Semester 1–2",
        title: "First-year syllabus reader",
        lede: "The full study scheme, searchable and readable without downloading the PDF or leaving the app.",
        actions: [
          safeUrl(data.firstYear?.source)
            ? el("a", { class: "btn btn--sm", href: safeUrl(data.firstYear.source), target: "_blank", rel: "noopener" }, icon("external"), "Official PDF")
            : null,
          el("a", { class: "btn btn--sm", href: "#/study?tab=papers" }, icon("file"), "Papers"),
        ].filter(Boolean),
      }),
      el(
        "div",
        { class: "card card--pad", style: { marginTop: "14px" } },
        el("div", { class: "filter-bar" }, el("div", { class: "input-icon", style: { flex: "1 1 260px" } }, icon("search"), search), pageSelect),
        matchesNode,
        el(
          "div",
          { class: "reader", style: { marginTop: "12px" } },
          el(
            "div",
            { class: "reader-head" },
            el("div", { style: { flex: "1 1 220px" } }, readerTitle, el("br"), readerSub),
            el("span", { class: "badge badge--muted", text: "Extracted text" }),
          ),
          readerBody,
          el(
            "div",
            { class: "reader-nav" },
            el("button", { class: "btn btn--sm", type: "button", onclick: () => go(-1) }, icon("chevron-left"), "Previous"),
            el("button", { class: "btn btn--sm", type: "button", onclick: () => window.print() }, icon("file"), "Print page"),
            el("button", { class: "btn btn--sm", type: "button", onclick: () => go(1) }, "Next", icon("chevron-right")),
          ),
        ),
      ),
      callout("Text is extracted from the official Dec 2025 Sem 1–2 PDF. Tables can lose their column alignment in extraction, so confirm marks and credits in the PDF before relying on them.", { iconName: "info" }),
    ),
  );
}
