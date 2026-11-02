import { el, icon, setPageMeta, emptyState, debounce, badge, fmtShortDate, relativeDay, noticeIcon, copyText } from "../ui.js";
import { load, noticeSearch, upcomingHolidays } from "../data.js";
import { pageHead, callout, breadcrumb, noticeRow } from "../components.js";

function tabNav(active) {
  return el(
    "nav",
    { class: "tabs", "aria-label": "Notices sections" },
    el("a", { href: "#/notices", "aria-current": active === "notices" ? "page" : null }, icon("bell"), "Notices"),
    el("a", { href: "#/notices?tab=holidays", "aria-current": active === "holidays" ? "page" : null }, icon("calendar"), "Holidays"),
    el("a", { href: "#/exams" }, icon("file-check"), "Exams"),
  );
}

export async function render(root, params = {}) {
  let data;
  try {
    data = await load("notices");
  } catch (err) {
    console.error(err);
    root.replaceChildren(emptyState({ iconName: "wifi-off", title: "Notices unavailable", text: "Reconnect once to cache notices and holidays.", actionLabel: "Retry", onAction: () => location.reload() }));
    return;
  }

  if (params.id) return renderDetail(root, data, params.id);
  if (params.tab === "holidays") return renderHolidays(root, data);
  return renderNotices(root, data, params);
}

async function renderNotices(root, data, params) {
  setPageMeta({ kicker: "Notice board", title: "Notices" });
  const notices = data.notices || [];
  const kinds = ["general", "exam", "event", "admin"];
  let query = params.q || "";
  let kind = "";

  const search = el("input", { class: "input", type: "search", placeholder: "Search notices, e.g. scholarship, examination…", value: query, "aria-label": "Search notices" });
  const chips = el("div", { class: "chip-row" });
  const count = el("p", { class: "small muted" });
  const list = el("div", { class: "notice-list" });

  const draw = () => {
    for (const chip of chips.querySelectorAll("button")) chip.classList.toggle("is-active", (chip.dataset.kind || "") === kind);
    const matches = noticeSearch(notices, query, kind);
    count.textContent = `${matches.length} notice${matches.length === 1 ? "" : "s"}`;
    if (!matches.length) {
      list.replaceChildren(emptyState({ iconName: "bell", title: "No notice matches", text: "Try a different word, or clear the filter." }));
      return;
    }
    list.replaceChildren(...matches.map((notice) => noticeRow(notice)));
  };

  chips.appendChild(el("button", { class: "chip is-active", type: "button", "data-kind": "", onclick: () => { kind = ""; draw(); } }, icon("grid"), `All ${notices.length}`));
  for (const value of kinds) {
    const total = notices.filter((notice) => notice.kind === value).length;
    if (!total) continue;
    chips.appendChild(
      el("button", { class: "chip", type: "button", "data-kind": value, onclick: () => { kind = value; draw(); } }, icon(noticeIcon(value)), `${value} ${total}`),
    );
  }
  search.addEventListener("input", debounce(() => { query = search.value; draw(); }, 100));
  draw();

  const latest = notices[0];
  const upcoming = upcomingHolidays(data.holidays || []).slice(0, 3);

  root.replaceChildren(
    el(
      "div",
      { class: "page-enter" },
      tabNav("notices"),
      pageHead({
        kicker: "From the college",
        title: "Notices",
        lede: "Circulars collected from the GNDEC homepage and the public ERP notice board. Every item links to its official page.",
        actions: [
          el("a", { class: "btn btn--soft btn--sm", href: "https://gndec.ac.in/", target: "_blank", rel: "noopener" }, icon("external"), "GNDEC homepage"),
          el("a", { class: "btn btn--sm", href: "https://erp.gndec.ac.in/notice", target: "_blank", rel: "noopener" }, icon("external"), "ERP notice board"),
        ],
      }),
      latest
        ? el(
            "div",
            { class: "card card--soft card--pad", style: { marginTop: "14px" } },
            el("span", { class: "eyebrow" }, icon("bell"), "Latest"),
            el("h3", { class: "display", style: { fontSize: "19px", marginTop: "4px" }, text: latest.title }),
            el("p", { class: "small muted", text: `${latest.displayDate || latest.date} · ${latest.source}` }),
            el("a", { class: "btn btn--primary btn--sm", style: { marginTop: "8px" }, href: `#/notices/${encodeURIComponent(latest.id)}` }, "Open notice", icon("chevron-right")),
          )
        : null,
      el(
        "div",
        { class: "card card--pad", style: { marginTop: "14px" } },
        el("div", { class: "filter-bar" }, el("div", { class: "input-icon", style: { flex: "1 1 280px" } }, icon("search"), search)),
        el("div", { class: "row row--wrap", style: { marginTop: "10px" } }, chips),
        el("div", { class: "row row--between", style: { marginTop: "10px" } }, count, el("span", { class: "tiny faint", text: "Newest first" })),
        el("div", { style: { marginTop: "8px" } }, list),
      ),
      upcoming.length
        ? el(
            "div",
            { class: "card card--pad" },
            el(
              "div",
              { class: "section-head" },
              el("h2", { text: "Upcoming holidays" }),
              el("a", { class: "link", href: "#/notices?tab=holidays" }, "All holidays", icon("chevron-right")),
            ),
            el(
              "div",
              { class: "chip-row" },
              ...upcoming.map((holiday) => el("span", { class: "chip" }, icon("calendar"), `${holiday.name} · ${fmtShortDate(holiday.date)}`)),
            ),
          )
        : null,
      callout("Notices are normalized from public pages. Attachment PDFs, fee notices that require login, and items removed from the homepage may not appear here.", { iconName: "info" }),
    ),
  );
}

async function renderDetail(root, data, id) {
  const notice = (data.notices || []).find((item) => item.id === decodeURIComponent(id));
  if (!notice) {
    root.replaceChildren(
      emptyState({
        iconName: "bell",
        title: "Notice not found",
        text: "It may have been removed from the official site.",
        actionLabel: "All notices",
        onAction: () => { location.hash = "#/notices"; },
      }),
    );
    return;
  }
  setPageMeta({ kicker: "Notice", title: notice.title });

  const kind = notice.kind || "general";
  const related = (data.notices || []).filter((item) => item.id !== notice.id && item.kind === kind).slice(0, 4);

  root.replaceChildren(
    el(
      "div",
      { class: "page-enter stack", style: { gap: "16px" } },
      breadcrumb("All notices", "#/notices"),
      el(
        "div",
        { class: "detail-hero" },
        el("span", { class: "avatar avatar--xl", style: { background: "var(--primary-soft)" } }, icon(noticeIcon(kind))),
        el(
          "div",
          { class: "detail-main" },
          el("span", { class: "eyebrow" }, icon("bell"), `${kind} · ${notice.source}`),
          el("h2", { class: "display", text: notice.title }),
          el("p", { class: "detail-sub", text: `${notice.displayDate || notice.date}${notice.author ? ` · ${notice.author}` : ""}` }),
          el(
            "div",
            { class: "detail-actions" },
            notice.url
              ? el("a", { class: "btn btn--primary btn--sm", href: notice.url, target: "_blank", rel: "noopener" }, icon("external"), "Read on official site")
              : null,
            el("button", { class: "btn btn--sm", type: "button", onclick: () => copyText(`${location.origin}${location.pathname}#/notices/${encodeURIComponent(notice.id)}`, "Notice link copied") }, icon("share"), "Share"),
            el("a", { class: "btn btn--sm", href: `#/notices?tab=holidays` }, icon("calendar"), "Holidays"),
          ),
        ),
      ),
      el(
        "div",
        { class: "grid grid--2", style: { alignItems: "start" } },
        el(
          "div",
          { class: "card card--pad" },
          el("div", { class: "section-head" }, el("h2", { text: "About this notice" })),
          el(
            "dl",
            { class: "kv" },
            el("dt", { text: "Date" }),
            el("dd", { text: notice.displayDate || notice.date }),
            el("dt", { text: "Source" }),
            el("dd", { text: notice.source }),
            notice.author ? [el("dt", { text: "Author" }), el("dd", { text: notice.author })] : null,
            el("dt", { text: "Type" }),
            el("dd", {}, badge(kind, "muted")),
          ),
          el("p", { class: "small muted", style: { marginTop: "12px" }, text: "The college publishes the full text, attachments and corrigenda on its own page. GNDEC One keeps only the verified headline, date and source so the notice still works offline." }),
          notice.url ? el("a", { class: "btn btn--soft btn--sm", style: { marginTop: "8px" }, href: notice.url, target: "_blank", rel: "noopener" }, icon("external"), "Open source page") : null,
        ),
        el(
          "div",
          { class: "card card--pad" },
          el("div", { class: "section-head" }, el("h2", { text: "Related notices" })),
          related.length
            ? el("div", { class: "notice-list" }, ...related.map((item) => noticeRow(item, { compact: true })))
            : el("p", { class: "small muted", text: "No other notices of this type." }),
        ),
      ),
      callout("If this notice changes, the official page is always the final authority. Use the source link above.", { iconName: "info" }),
    ),
  );
}

async function renderHolidays(root, data) {
  setPageMeta({ kicker: "Academic calendar", title: "Holidays" });
  const holidays = data.holidays || [];
  const years = [...new Set(holidays.map((holiday) => holiday.year).filter(Boolean))].sort((a, b) => b - a);
  let year = years[0] || new Date().getFullYear();

  const yearChips = el("div", { class: "chip-row" });
  const count = el("p", { class: "small muted" });
  const list = el("div", { class: "notice-list" });

  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

  const draw = () => {
    for (const chip of yearChips.querySelectorAll("button")) chip.classList.toggle("is-active", Number(chip.dataset.year) === year);
    const matches = holidays
      .filter((holiday) => holiday.year === year)
      .sort((a, b) => a.date.localeCompare(b.date));
    const upcoming = matches.filter((holiday) => new Date(`${holiday.date}T00:00:00`).getTime() >= start);
    count.textContent = `${matches.length} holiday${matches.length === 1 ? "" : "s"} in ${year}${upcoming.length ? ` · ${upcoming.length} still ahead` : ""}`;
    if (!matches.length) {
      list.replaceChildren(emptyState({ iconName: "calendar", title: "No holiday list for this year", text: "The college has not published this year's list yet." }));
      return;
    }
    list.replaceChildren(
      ...matches.map((holiday) => {
        const date = new Date(`${holiday.date}T00:00:00`);
        const isPast = date.getTime() < start;
        const diff = Math.round((date.getTime() - start) / 86400000);
        const when = !isPast && diff === 0 ? "Today" : !isPast && diff > 0 ? `In ${diff} day${diff === 1 ? "" : "s"}` : relativeDay(holiday.date);
        return el(
          "div",
          { class: "notice-item", style: isPast ? { opacity: "0.62" } : {} },
          el("span", { class: "notice-icon" }, icon("calendar")),
          el(
            "div",
            { class: "notice-main" },
            el("strong", { text: holiday.name }),
            el(
              "div",
              { class: "notice-meta" },
              el("span", {}, `${holiday.weekday || ""} ${fmtShortDate(holiday.date)}`.trim()),
              holiday.category ? el("span", {}, holiday.category) : null,
              el("span", {}, when),
            ),
          ),
          isPast ? el("span", { class: "badge badge--muted", text: "Past" }) : el("span", { class: "badge", text: "Ahead" }),
        );
      }),
    );
  };

  for (const value of years) {
    yearChips.appendChild(el("button", { class: "chip", type: "button", "data-year": value, onclick: () => { year = value; draw(); } }, icon("calendar"), String(value)));
  }
  draw();

  root.replaceChildren(
    el(
      "div",
      { class: "page-enter" },
      tabNav("holidays"),
      pageHead({
        kicker: "Official holiday list",
        title: "Holidays",
        lede: "Gazetted holidays and college closures from the official GNDEC holiday calendar. Past dates stay visible so you can check what applied in a given semester.",
        actions: [
          el("a", { class: "btn btn--soft btn--sm", href: "https://gndec.ac.in/?q=holidays", target: "_blank", rel: "noopener" }, icon("external"), "Official list"),
          el("a", { class: "btn btn--sm", href: "#/notices" }, icon("bell"), "Notices"),
        ],
      }),
      el(
        "div",
        { class: "card card--pad", style: { marginTop: "14px" } },
        el("div", { class: "row row--wrap" }, yearChips),
        count,
        el("div", { style: { marginTop: "8px" } }, list),
      ),
      callout("Holiday lists are published per calendar year. Sudden closures, examination breaks and department-level holidays are announced separately as notices.", { iconName: "info" }),
    ),
  );
}
