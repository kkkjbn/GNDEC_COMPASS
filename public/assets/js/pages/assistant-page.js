import { el, icon, setPageMeta, toast, confirmSheet } from "../ui.js";
import { getState, clearChat, setSetting } from "../store.js";
import { pageHead, callout } from "../components.js";
import { askAndRemember, messageNode, loadingNode } from "../assistant.js";

const SUGGESTIONS = [
  "My next class",
  "Where is F107?",
  "Route from main gate to library",
  "Papers for BTCS-304",
  "Who teaches data structures?",
  "Upcoming holidays",
  "Exam rules",
  "Syllabus for first year",
];

export async function render(root, params = {}) {
  setPageMeta({ kicker: "Assistant", title: "Ask GNDEC One" });
  const state = getState();
  let busy = false;

  const log = el("div", { class: "chat-log", "aria-live": "polite" });
  const input = el("textarea", {
    class: "textarea",
    rows: "1",
    placeholder: "Ask about classes, rooms, teachers, papers, syllabus, notices…",
    "aria-label": "Ask the assistant",
    maxlength: "600",
  });
  const send = el("button", { class: "btn btn--primary", type: "button", "aria-label": "Send question" }, icon("send"), "Ask");

  const autoScroll = () => {
    requestAnimationFrame(() => {
      log.scrollTop = log.scrollHeight;
    });
  };

  const welcome = () =>
    el(
      "div",
      { class: "chat-msg" },
      el("span", { class: "chat-avatar" }, icon("sparkles")),
      el(
        "div",
        { class: "chat-bubble" },
        el("p", { text: "Sat Sri Akal. Ask me anything about the published GNDEC data." }),
        el("ul", {},
          el("li", { text: "Classes and rooms — “my next class”, “where is S204”" }),
          el("li", { text: "People — “who teaches operating systems”, a teacher's name, a CRN" }),
          el("li", { text: "Study — paper codes, syllabus schemes, first-year units" }),
          el("li", { text: "Campus — routes, distances, offices and contacts" }),
        ),
        el("p", { class: "tiny faint", style: { marginTop: "8px" }, text: "I answer only from the app's verified data. If I cannot find it, I say so." }),
      ),
    );

  const drawChat = () => {
    const chat = getState().chat || [];
    log.replaceChildren();
    if (!chat.length) {
      log.appendChild(welcome());
      return;
    }
    for (const exchange of chat) {
      log.append(messageNode({ q: exchange.q }, { user: true }), messageNode(exchange));
    }
    autoScroll();
  };

  const submit = async (question) => {
    const clean = String(question || "").trim();
    if (!clean || busy) return;
    busy = true;
    input.value = "";
    input.style.height = "auto";
    log.append(messageNode({ q: clean }, { user: true }));
    const loading = loadingNode();
    log.appendChild(loading);
    autoScroll();

    try {
      const { reply, source } = await askAndRemember(clean);
      loading.replaceWith(messageNode({ q: clean, a: reply, source }));
      autoScroll();
    } catch (err) {
      loading.remove();
      toast(String(err?.message || "Something went wrong."), "error");
    } finally {
      busy = false;
      input.focus();
    }
  };

  send.addEventListener("click", () => submit(input.value));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit(input.value);
    }
  });
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
  });

  const suggestionRow = el(
    "div",
    { class: "chip-row chip-row--scroll" },
    ...SUGGESTIONS.map((text) => el("button", { class: "chip", type: "button", onclick: () => submit(text) }, text)),
  );

  const chatCard = el(
    "div",
    { class: "chat-card" },
    el(
      "div",
      { class: "chat-head" },
      el("span", { class: "avatar", style: { background: "var(--primary-soft)" } }, icon("sparkles")),
      el(
        "div",
        { class: "chat-title" },
        el("strong", { text: "GNDEC One assistant" }),
        el("small", { text: navigator.onLine === false ? "Offline · local answers" : getState().settings.ai === "local" ? "Online · local-only mode" : "Online · grounded answers" }),
      ),
      el(
        "button",
        {
          class: "btn btn--sm btn--ghost",
          type: "button",
          onclick: () =>
            confirmSheet({
              title: "Clear this chat?",
              message: "The conversation is stored only on this device. Clearing it cannot be undone.",
              confirmLabel: "Clear chat",
              danger: true,
              onConfirm: () => {
                clearChat();
                drawChat();
                toast("Chat cleared");
              },
            }),
        },
        icon("trash"),
        "Clear",
      ),
    ),
    log,
    el(
      "div",
      { class: "chat-composer" },
      el("div", { style: { flex: "1" } }, input),
      send,
    ),
  );

  const contextNote = el(
    "div",
    { class: "card card--pad" },
    el("div", { class: "section-head" }, el("h2", { text: "What I can see" })),
    el(
      "ul",
      { class: "small muted", style: { margin: "0 0 0 16px", lineHeight: "1.8" } },
      el("li", { text: "875 scheduled lectures across 54 sections and 96 practical groups." }),
      el("li", { text: "268 public faculty profiles and 2,108 students from published rosters." }),
      el("li", { text: "1,600 previous-year papers, 23 syllabus documents and the full first-year reader." }),
      el("li", { text: "Official notices, holidays, contacts and 45 mapped campus places." }),
    ),
    el(
      "p",
      { class: "tiny faint", style: { marginTop: "10px" } },
      "Missing data is reported as missing. Seating plans, internal marks, attendance, hostel allotment and live bus timings are not public.",
    ),
  );

  const privacy = el(
    "div",
    { class: "card card--pad" },
    el("div", { class: "section-head" }, el("h2", { text: "Private by design" })),
    el(
      "div",
      { class: "setting-row" },
      el(
        "div",
        { class: "setting-main" },
        el("strong", { text: "Answer locally when possible" }),
        el("small", { text: "Local answers work offline. Cloud answers are only used when you are online and this is off." }),
      ),
      el(
        "button",
        {
          class: `btn btn--sm ${getState().settings.ai === "local" ? "btn--primary" : "btn--soft"}`,
          type: "button",
          onclick: (event) => {
            const localOnly = getState().settings.ai !== "local";
            setSetting("ai", localOnly ? "local" : "auto");
            event.currentTarget.classList.toggle("btn--primary", localOnly);
            event.currentTarget.classList.toggle("btn--soft", !localOnly);
            event.currentTarget.textContent = localOnly ? "Local only" : "Use cloud when online";
            toast(localOnly ? "Local-only answers" : "Cloud answers enabled when online");
          },
        },
        getState().settings.ai === "local" ? "Local only" : "Use cloud when online",
      ),
    ),
    el("p", { class: "small muted", style: { marginTop: "10px" }, text: "No question is stored on a server. Chat history lives in this browser's localStorage and can be cleared at any time." }),
  );

  root.replaceChildren(
    el(
      "div",
      { class: "page-enter" },
      pageHead({
        kicker: "Grounded assistant",
        title: "Ask in plain language",
        lede: "Timetables, people, rooms, routes, papers and notices — answered from the same verified data the rest of the app uses.",
        actions: [
          el("a", { class: "btn btn--soft btn--sm", href: "#/today" }, icon("home"), "Today"),
          el("a", { class: "btn btn--sm", href: "#/settings" }, icon("settings"), "Settings"),
        ],
      }),
      el(
        "div",
        { class: "assistant-layout", style: { marginTop: "14px" } },
        el("div", { class: "stack" }, chatCard, suggestionRow),
        el("aside", { class: "stack" }, contextNote, privacy, callout("The assistant never invents a room, date or teacher. When data is missing it points you to the official source.", { iconName: "shield" })),
      ),
    ),
  );

  drawChat();
  input.focus();

  if (params.q) {
    const question = decodeURIComponent(params.q);
    submit(question);
  }
}
