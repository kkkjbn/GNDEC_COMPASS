import { el, icon, setPageMeta, emptyState, fmtShortDate } from "../ui.js";
import { load } from "../data.js";
import { pageHead, callout, noticeRow } from "../components.js";
import { EXAM_TIPS } from "../logic.js";

const DATE_KEY = "gndec-one:exam-date";

function daysBetween(a, b) {
  const start = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((end - start) / 86400000);
}

function planner() {
  const stored = (() => {
    try {
      return localStorage.getItem(DATE_KEY) || "";
    } catch {
      return "";
    }
  })();

  const input = el("input", { class: "input", type: "date", value: stored, "aria-label": "Your next exam date" });
  const output = el("div", { style: { marginTop: "10px" } });

  const draw = () => {
    output.replaceChildren();
    if (!input.value) {
      output.appendChild(el("p", { class: "small muted", text: "Pick the date of your first paper. The plan stays on this device." }));
      return;
    }
    const target = new Date(`${input.value}T09:00:00`);
    const left = daysBetween(new Date(), target);
    if (Number.isNaN(left)) return;
    if (left < 0) {
      output.appendChild(callout("That date is in the past. Pick the next paper.", { iconName: "info" }));
      return;
    }
    output.append(
      el(
        "div",
        { class: "stat-grid" },
        el("div", { class: "stat" }, el("strong", { text: left === 0 ? "Today" : String(left) }), el("small", { text: left === 0 ? "Exam day" : left === 1 ? "Day left" : "Days left" })),
        el("div", { class: "stat" }, el("strong", { text: fmtShortDate(target) }), el("small", { text: "First paper" })),
        el("div", { class: "stat" }, el("strong", { text: String(Math.max(1, Math.ceil(left / 3))) }), el("small", { text: "Subjects to rotate" })),
      ),
      el(
        "ul",
        { class: "small muted", style: { margin: "10px 0 0 16px", lineHeight: "1.7" } },
        el("li", { text: left > 14 ? "Use the first week to finish the syllabus unit by unit; keep the last ten days for papers." : "Start with the units that repeat in past papers, then do one full paper under time." }),
        el("li", { text: "Rotate subjects every 90 minutes instead of spending a whole day on one." }),
        el("li", { text: "Confirm your seating plan and reporting time on the ERP notice board a day before." }),
      ),
    );
  };

  input.addEventListener("change", () => {
    try {
      localStorage.setItem(DATE_KEY, input.value);
    } catch {
      /* ignore */
    }
    draw();
  });
  draw();

  return el(
    "div",
    { class: "card card--pad" },
    el("div", { class: "section-head" }, el("h2", { text: "Exam countdown" }), el("span", { class: "badge badge--muted", text: "Private" })),
    el("div", { class: "field" }, el("label", { for: "exam-date", text: "First paper date" }), input),
    output,
  );
}

export async function render(root) {
  setPageMeta({ kicker: "Examinations", title: "Exams" });
  let data;
  try {
    data = await load("notices");
  } catch (err) {
    console.error(err);
    root.replaceChildren(emptyState({ iconName: "wifi-off", title: "Exam notices unavailable", text: "Reconnect once. The study tips and planner below still work offline.", actionLabel: "Retry", onAction: () => location.reload() }));
    return;
  }

  const exams = (data.exams || []).length ? data.exams : (data.notices || []).filter((notice) => notice.kind === "exam");

  const official = exams.length
    ? el("div", { class: "notice-list" }, ...exams.slice(0, 12).map((notice) => noticeRow(notice)))
    : emptyState({
        iconName: "file-check",
        title: "No public exam notice right now",
        text: "Date sheets and seating plans are posted on the ERP notice board, usually a week before the exam.",
        actionLabel: "Open ERP notice board",
        onAction: () => window.open("https://erp.gndec.ac.in/notice", "_blank", "noopener"),
      });

  const tips = el(
    "div",
    { class: "grid grid--2" },
    ...EXAM_TIPS.map((tip, index) =>
      el(
        "div",
        { class: "card card--pad" },
        el(
          "div",
          { class: "row", style: { gap: "9px", alignItems: "flex-start" } },
          el("span", { class: "badge", style: { minWidth: "28px", justifyContent: "center" }, text: String(index + 1).padStart(2, "0") }),
          el("div", {}, el("strong", { style: { fontSize: "13px" }, text: tip.title }), el("p", { class: "small muted", style: { marginTop: "4px" }, text: tip.body })),
        ),
        tip.to ? el("a", { class: "btn btn--soft btn--sm", style: { marginTop: "10px" }, href: tip.to }, "Open", icon("chevron-right")) : null,
      ),
    ),
  );

  root.replaceChildren(
    el(
      "div",
      { class: "page-enter stack", style: { gap: "18px" } },
      pageHead({
        kicker: "Examinations",
        title: "Exams, without the panic",
        lede: "Official exam notices, a private countdown, previous papers and a revision method that actually fits the syllabus.",
        actions: [
          el("a", { class: "btn btn--primary btn--sm", href: "#/study?tab=papers" }, icon("file"), "Previous papers"),
          el("a", { class: "btn btn--soft btn--sm", href: "https://erp.gndec.ac.in/notice", target: "_blank", rel: "noopener" }, icon("external"), "ERP notice board"),
        ],
      }),
      el(
        "div",
        { class: "grid grid--2", style: { alignItems: "start" } },
        el(
          "div",
          { class: "card card--pad" },
          el(
            "div",
            { class: "section-head" },
            el("h2", { text: "Published exam notices" }),
            el("span", { class: "badge badge--muted", text: exams.length ? `${exams.length} items` : "none yet" }),
          ),
          official,
          el("p", { class: "tiny faint", style: { marginTop: "10px" }, text: "Seating plans, room allotments and consolidated date sheets are login-only on the ERP. The app never guesses them." }),
        ),
        el("div", { class: "stack" }, planner(), el(
          "div",
          { class: "card card--pad" },
          el("div", { class: "section-head" }, el("h2", { text: "Exam-day checklist" })),
          el(
            "ul",
            { class: "small muted", style: { margin: "0 0 0 16px", lineHeight: "1.8" } },
            el("li", { text: "Admit card and college ID." }),
            el("li", { text: "Reporting time, room and seat number from the ERP plan." }),
            el("li", { text: "Transparent geometry box, blue/black pens, and a non-programmable calculator if allowed." }),
            el("li", { text: "Water and a light snack; avoid a heavy meal before a three-hour paper." }),
            el("li", { text: "Check the notice board once more on the morning of the exam for room changes." }),
          ),
        )),
      ),
      el("section", { class: "section" }, el("div", { class: "section-head" }, el("h2", { text: "How to revise, not just read" })), tips),
      callout("The app does not invent dates or seating plans. It shows the official notices it can verify, and links to the ERP notice board for everything that requires a login.", { iconName: "shield" }),
    ),
  );
}
