/**
 * Assistant glue.
 *
 * The local assistant (logic.js) always runs and is always available offline.
 * When the device is online and the user has not chosen "local only", we also
 * ask the Worker's grounded Cloudflare Workers AI proxy for a nicer phrasing.
 * The proxy receives the same verified context and a strict "never guess"
 * prompt, and any failure silently falls back to the local answer.
 */

import { el, icon, toast } from "./ui.js";
import { loadMany } from "./data.js";
import { answerQuestion, buildAssistantContext } from "./logic.js";
import { getState, pushChat } from "./store.js";

export async function assistantContext() {
  const state = getState();
  const data = await loadMany([
    "timetable",
    "teachers",
    "students",
    "papers",
    "syllabus",
    "notices",
    "campus",
    "contacts",
    "knowledge",
    "rooms",
  ]);
  return { ...data, profile: state.profile };
}

async function cloudAnswer(question, ctx) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch("/api/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question,
        context: buildAssistantContext(question, ctx),
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = await response.json();
    const answer = String(data?.answer || "").trim();
    if (!answer || /^i could not find that in the verified college data\.?$/i.test(answer)) return null;
    return answer;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function askAssistant(question, ctx = null) {
  const clean = String(question || "").trim().slice(0, 600);
  if (!clean) throw new Error("Type a question first.");

  const context = ctx || (await assistantContext());
  const local = answerQuestion(clean, context);

  const state = getState();
  const online = navigator.onLine !== false;
  if (!online || state.settings.ai === "local") {
    return { reply: local, source: "local" };
  }

  // The cloud model may only rephrase the local, verified answer. It never
  // replaces the structured bullets, links or sources, and it is skipped
  // entirely when the local engine already knows it cannot answer.
  if (local.kind === "fallback" || local.kind === "empty") {
    return { reply: local, source: "local" };
  }
  const answer = await cloudAnswer(clean, context);
  if (answer) {
    return { reply: { ...local, text: answer }, source: "cloud" };
  }
  return { reply: local, source: "local" };
}

export function remember(question, reply, source = "local") {
  pushChat({
    q: question,
    a: {
      text: reply.text,
      bullets: reply.bullets || [],
      actions: reply.actions || [],
      cites: reply.cites || [],
    },
    source,
    at: Date.now(),
  });
}

export function replyNode(reply, { source = "local" } = {}) {
  const bubble = el("div", { class: "chat-bubble" });
  if (reply.text) bubble.appendChild(el("p", { text: reply.text }));
  if (reply.bullets?.length) {
    bubble.appendChild(el("ul", {}, ...reply.bullets.filter(Boolean).map((line) => el("li", { text: line }))));
  }
  if (reply.actions?.length) {
    bubble.appendChild(
      el(
        "div",
        { class: "chip-row", style: { marginTop: "10px" } },
        ...reply.actions.filter(Boolean).map((action) =>
          el(
            "a",
            {
              class: "chip",
              href: action.url || action.to || "#/assistant",
              ...(action.url ? { target: "_blank", rel: "noopener" } : {}),
            },
            icon(action.url ? "external" : "arrow-right"),
            action.label,
          ),
        ),
      ),
    );
  }
  if (reply.cites?.length) {
    bubble.appendChild(
      el(
        "div",
        { class: "chat-cites" },
        ...reply.cites
          .filter(Boolean)
          .map((cite) =>
            el(
              "a",
              {
                class: "chat-cite",
                href: cite.url || cite.to || "#/about",
                ...(cite.url ? { target: "_blank", rel: "noopener" } : {}),
              },
              icon("file"),
              cite.label,
            ),
          ),
      ),
    );
  }
  if (source === "cloud") {
    bubble.appendChild(el("p", { class: "tiny faint", style: { marginTop: "8px" }, text: "Answered only from the app's verified data." }));
  }
  return bubble;
}

export function messageNode({ q, a, source }, { user = false } = {}) {
  const avatar = el("span", { class: "chat-avatar" }, icon(user ? "users" : "sparkles"));
  const body = el("div", { class: "chat-bubble" });
  if (user) body.textContent = q;
  else return el("div", { class: "chat-msg" }, avatar, replyNode(a, { source }));
  return el("div", { class: "chat-msg chat-msg--user" }, avatar, body);
}

export function loadingNode() {
  return el(
    "div",
    { class: "chat-msg", "data-loading": "true" },
    el("span", { class: "chat-avatar" }, icon("sparkles")),
    el(
      "div",
      { class: "chat-bubble" },
      el("span", { class: "typing", "aria-label": "Thinking" }, el("i"), el("i"), el("i")),
    ),
  );
}

export async function askAndRemember(question, ctx) {
  try {
    const { reply, source } = await askAssistant(question, ctx);
    remember(question, reply, source);
    return { reply, source };
  } catch (err) {
    toast(String(err?.message || "The assistant could not answer."), "error");
    throw err;
  }
}
