import { el, icon, setPageMeta, toast, confirmSheet, copyText, debounce, timeAgo, fmtDate } from "../ui.js";
import { load } from "../data.js";
import { roomOverrides, setRoomOverride } from "../store.js";
import { pageHead, callout } from "../components.js";

function status(text, kind = "ok") {
  return el("span", { class: "row", style: { gap: "6px", alignItems: "center" } }, el("span", { class: `status-dot is-${kind}` }), el("span", { class: "small", text }));
}

const ADMIN_HASH = "e2f527cd57b562ce5917e90f32d6814efd332d8e702ebf23dff1165dd80549cc";
const UNLOCK_KEY = "gndec-compass:admin-unlocked";

async function digest(value) {
  const bytes = new TextEncoder().encode(String(value));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function adminGate(root, onUnlock) {
  const input = el("input", { class: "input", type: "password", placeholder: "Editorial passphrase", autocomplete: "off", "aria-label": "Editorial passphrase" });
  const error = el("p", { class: "small", style: { color: "var(--bad)", minHeight: "1.2em" }, text: "" });
  const form = el(
    "form",
    {
      class: "card card--pad stack",
      style: { maxWidth: "420px", margin: "8vh auto" },
      onsubmit: async (event) => {
        event.preventDefault();
        const hash = await digest(input.value.trim());
        if (hash !== ADMIN_HASH) {
          error.textContent = "That passphrase is not recognised.";
          input.select();
          return;
        }
        sessionStorage.setItem(UNLOCK_KEY, "1");
        onUnlock();
      },
    },
    el("div", { class: "section-head" }, el("h2", { text: "Restricted console" }), el("span", { class: "badge badge--muted", text: "Not indexed" })),
    el("p", { class: "small muted", text: "This console is only for maintaining room-to-block corrections and checking official-source health. It is not linked from the public navigation." }),
    el("div", { class: "field" }, el("label", { for: "admin-pass", text: "Passphrase" }), input),
    error,
    el("button", { class: "btn btn--primary btn--block", type: "submit" }, icon("shield"), "Unlock"),
    el("p", { class: "tiny faint", text: "Five failed attempts lock this tab for a minute." }),
  );
  input.id = "admin-pass";
  let attempts = 0;
  form.addEventListener("submit", () => {
    attempts += 1;
    if (attempts >= 5) {
      input.disabled = true;
      setTimeout(() => {
        input.disabled = false;
        attempts = 0;
      }, 60000);
    }
  });
  root.replaceChildren(form);
  setTimeout(() => input.focus(), 50);
}

export async function render(root) {
  setPageMeta({ kicker: "Admin", title: "Data & coverage" });
  if (sessionStorage.getItem(UNLOCK_KEY) !== "1") {
    adminGate(root, () => render(root));
    return;
  }
  let meta;
  let rooms;
  let campus;
  let sources;
  try {
    [meta, rooms, campus, sources] = await Promise.all([load("meta"), load("rooms"), load("campus"), load("sources")]);
  } catch (err) {
    console.error(err);
    root.replaceChildren(
      el("div", { class: "empty" }, el("strong", { text: "Admin data unavailable" }), el("small", { text: "Reconnect once and reload." })),
    );
    return;
  }

  const counts = meta.counts || {};
  const coverage = meta.coverage || {};
  const overrides = roomOverrides();
  const places = [...(campus.places || [])].sort((a, b) => a.name.localeCompare(b.name));
  const roomList = [...(rooms.rooms || [])].sort((a, b) => a.name.localeCompare(b.name));

  let query = "";
  let limit = 30;
  let live = null;

  const liveNode = el("div", { class: "small muted", text: "Checking the live Worker…" });
  fetch("/api/health", { headers: { accept: "application/json" } })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      live = data;
      if (!data) {
        liveNode.textContent = "Static preview: the /api/health endpoint is only available on the deployed Worker.";
        return;
      }
      const check = data.lastCheck;
      liveNode.replaceChildren(
        el("div", { class: "row row--wrap", style: { gap: "10px" } }, status(data.ok ? "Worker healthy" : "Worker issue", data.ok ? "ok" : "bad"), status(data.ai ? "AI binding available" : "AI binding off", data.ai ? "ok" : "warn"), status(check?.changed ? "Timetable changed upstream" : "Sources unchanged", check?.changed ? "warn" : "ok")),
        el("p", { class: "tiny faint", style: { marginTop: "6px" }, text: check ? `Last source check ${timeAgo(check.checkedAt)}${check.error ? ` · ${check.error}` : ""}.` : "No scheduled check has run yet." }),
      );
    })
    .catch(() => {
      liveNode.textContent = "Static preview: the /api/health endpoint is only available on the deployed Worker.";
    });

  const countGrid = el(
    "div",
    { class: "stat-grid" },
    ...[
      ["Sections", counts.sections],
      ["Lectures", counts.lectures],
      ["Subgroups", counts.subgroups],
      ["Teachers", counts.teachers],
      ["Students", counts.students],
      ["Rooms", counts.rooms],
      ["Papers", counts.papers],
      ["Notices", counts.notices],
    ].map(([label, value]) => el("div", { class: "stat" }, el("strong", { text: String(value ?? "—") }), el("small", { text: label }))),
  );

  const coverageNodes = el(
    "div",
    { class: "stack", style: { gap: "7px" } },
    ...[
      ["Timetable years", (coverage.timetableYears || []).join(", ") || "—", (coverage.timetableYears || []).includes(4)],
      ["Timetable branches", (coverage.timetableBranches || []).join(", ") || "—", true],
      ["Student batches", (coverage.studentBatches || []).join(", ") || "—", (coverage.studentBatches || []).length >= 3],
      ["Programs", (coverage.programs || []).join(", ") || "—", true],
    ].map(([label, value, ok]) =>
      el(
        "div",
        { class: "source-row" },
        el("div", { class: "source-main" }, el("strong", { text: label }), el("small", { text: value })),
        status(ok ? "Published" : "Partial", ok ? "ok" : "warn"),
      ),
    ),
  );

  const missing = coverage.missing || [];

  const mapRows = el("div", { class: "stack", style: { gap: "6px" } });
  const mapSearch = el("input", { class: "input", type: "search", placeholder: "Filter rooms, e.g. F1, S2, G…", "aria-label": "Filter rooms" });

  const drawRooms = () => {
    const q = query.trim().toLowerCase();
    const list = roomList.filter((room) => !q || `${room.name} ${room.place || ""}`.toLowerCase().includes(q));
    const shown = list.slice(0, limit);
    mapRows.replaceChildren();
    if (!list.length) {
      mapRows.appendChild(el("p", { class: "small muted", text: "No room matches." }));
      return;
    }
    for (const room of shown) {
      const effective = overrides[room.name] || room.place || "";
      const custom = Boolean(overrides[room.name]);
      const select = el("select", { class: "select", style: { maxWidth: "240px" }, "aria-label": `Block for ${room.name}` });
      select.appendChild(el("option", { value: "", text: "Not mapped" }));
      for (const place of places) select.appendChild(el("option", { value: place.id, text: place.name }));
      select.value = effective;

      const badgeNode = el(
        "span",
        { class: `badge ${custom ? "badge--accent" : effective ? "badge--muted" : "badge--danger"}`.trim() },
        custom ? "Edited" : effective ? "Inferred" : "Unmapped",
      );

      select.addEventListener("change", () => {
        setRoomOverride(room.name, select.value);
        const now = select.value;
        badgeNode.textContent = now ? (now === room.place ? "Inferred" : "Edited") : "Unmapped";
        badgeNode.className = `badge ${now ? (now === room.place ? "badge--muted" : "badge--accent") : "badge--danger"}`;
        toast(now ? `${room.name} → ${places.find((place) => place.id === now)?.name || now}` : `${room.name} unmapped`);
      });

      mapRows.appendChild(
        el(
          "div",
          { class: "source-row" },
          el(
            "div",
            { class: "source-main" },
            el("strong", { text: room.name }),
            el("small", { text: `${room.lecturesPerWeek || 0} lectures/week${room.roomType ? ` · ${room.roomType}` : ""}` }),
          ),
          badgeNode,
          select,
        ),
      );
    }
    if (list.length > shown.length) {
      mapRows.appendChild(
        el("button", { class: "btn btn--soft btn--sm", type: "button", onclick: () => { limit += 30; drawRooms(); } }, `Show ${Math.min(30, list.length - shown.length)} more`),
      );
    }
  };
  mapSearch.addEventListener("input", debounce(() => { query = mapSearch.value; limit = 30; drawRooms(); }, 100));
  drawRooms();

  const mappedCount = roomList.filter((room) => overrides[room.name] || room.place).length;
  const editedCount = Object.keys(overrides).length;

  const mappingCard = el(
    "div",
    { class: "card card--pad" },
    el(
      "div",
      { class: "section-head" },
      el("h2", { text: "Room → block mapping" }),
      el("span", { class: "badge badge--muted", text: `${mappedCount}/${roomList.length} mapped` }),
    ),
    el("p", { class: "small muted", text: "The college does not publish an official room-to-building table. Codes are inferred: F = first-year block, S = second-year block, G = ground-floor rooms, A6/A9 = automobile block. Correct any room here; corrections stay on this device." }),
    el("div", { class: "row", style: { gap: "8px", marginTop: "10px", flexWrap: "wrap" } }, el("div", { class: "input-icon", style: { flex: "1 1 230px" } }, icon("search"), mapSearch), el(
      "button",
      {
        class: "btn btn--sm btn--ghost",
        type: "button",
        disabled: editedCount === 0,
        onclick: () =>
          confirmSheet({
            title: "Reset room corrections?",
            message: "All rooms go back to the inferred block. Timetable data itself is unchanged.",
            confirmLabel: "Reset corrections",
            danger: true,
            onConfirm: () => {
              for (const name of Object.keys(roomOverrides())) setRoomOverride(name, "");
              toast("Room corrections reset");
              setTimeout(() => location.reload(), 300);
            },
          }),
      },
      icon("refresh"),
      `Reset ${editedCount} edit${editedCount === 1 ? "" : "s"}`,
    )),
    el("div", { style: { marginTop: "10px", maxHeight: "440px", overflow: "auto" } }, mapRows),
  );

  const sourceRows = el(
    "div",
    { class: "stack", style: { gap: "4px" } },
    ...(sources.sources || []).map((source) =>
      el(
        "div",
        { class: "source-row" },
        el(
          "div",
          { class: "source-main" },
          el("strong", { text: source.label }),
          el("small", { text: `${source.kind || "source"}${source.fetchedAt ? ` · fetched ${timeAgo(source.fetchedAt)}` : ""}${source.contentHash ? ` · hash ${source.contentHash.slice(0, 8)}` : ""}` }),
        ),
        el(
          "div",
          { class: "row", style: { gap: "4px" } },
          el("button", { class: "icon-btn", type: "button", "aria-label": "Copy source URL", onclick: () => copyText(source.url, "Source URL copied") }, icon("copy")),
          source.url ? el("a", { class: "icon-btn", href: source.url, target: "_blank", rel: "noopener", "aria-label": "Open source" }, icon("external")) : null,
        ),
      ),
    ),
  );

  const rosterRows = (sources.rosterFiles || []).slice(0, 20);

  root.replaceChildren(
    el(
      "div",
      { class: "page-enter stack", style: { gap: "16px" } },
      pageHead({
        kicker: "Editorial console",
        title: "Data & coverage",
        lede: "Everything the app knows, where it came from, and what is still missing. This page never edits the official source — it only reports and lets you correct room links locally.",
        actions: [
          el("a", { class: "btn btn--soft btn--sm", href: "#/about" }, icon("info"), "Sources & credits"),
          el("button", { class: "btn btn--sm", type: "button", onclick: () => copyText(JSON.stringify(meta, null, 2), "Data report copied") }, icon("copy"), "Copy report"),
        ],
      }),
      el(
        "div",
        { class: "grid grid--2", style: { alignItems: "start" } },
        el(
          "div",
          { class: "stack" },
          el(
            "div",
            { class: "card card--pad" },
            el("div", { class: "section-head" }, el("h2", { text: "Build" }), el("span", { class: "badge badge--muted", text: meta.dataVersion || "—" })),
            el(
              "dl",
              { class: "kv" },
              el("dt", { text: "Generated" }),
              el("dd", { text: `${fmtDate(meta.generatedAt)} · ${timeAgo(meta.generatedAt)}` }),
              el("dt", { text: "Timetable release" }),
              el("dd", { text: meta.timetableVersion || "—" }),
              el("dt", { text: "Source hash" }),
              el("dd", {}, el("code", { class: "mono", text: meta.sourceHash || "—" })),
              el("dt", { text: "Data version" }),
              el("dd", { text: meta.dataVersion || "—" }),
            ),
            countGrid,
          ),
          el(
            "div",
            { class: "card card--pad" },
            el("div", { class: "section-head" }, el("h2", { text: "Live worker" })),
            liveNode,
          ),
          el(
            "div",
            { class: "card card--pad" },
            el("div", { class: "section-head" }, el("h2", { text: "Coverage" })),
            coverageNodes,
          ),
        ),
        el(
          "div",
          { class: "stack" },
          el(
            "div",
            { class: "card card--pad" },
            el("div", { class: "section-head" }, el("h2", { text: "What is missing" }), el("span", { class: "badge badge--danger", text: `${missing.length} gaps` })),
            el(
              "ul",
              { class: "small muted", style: { margin: "0 0 0 16px", lineHeight: "1.75" } },
              ...(missing.length ? missing.map((item) => el("li", { text: item })) : [el("li", { text: "No documented gaps." })]),
            ),
          ),
          el(
            "div",
            { class: "card card--pad" },
            el("div", { class: "section-head" }, el("h2", { text: "Official sources" }), el("span", { class: "small muted", text: `${(sources.sources || []).length} tracked` })),
            sourceRows,
          ),
        ),
      ),
      mappingCard,
      rosterRows.length
        ? el(
            "div",
            { class: "card card--pad" },
            el("div", { class: "section-head" }, el("h2", { text: "Roster files used" }), el("span", { class: "small muted", text: `${rosterRows.length} of ${(sources.rosterFiles || []).length}` })),
            el(
              "div",
              { class: "stack", style: { gap: "5px" } },
              ...rosterRows.map((file) =>
                el(
                  "div",
                  { class: "source-row" },
                  el("div", { class: "source-main" }, el("strong", { text: file.label || file.branch || "Roster" }), el("small", { text: file.url || "" })),
                  file.url ? el("a", { class: "icon-btn", href: file.url, target: "_blank", rel: "noopener", "aria-label": "Open roster PDF" }, icon("external")) : null,
                ),
              ),
            ),
          )
        : null,
      callout("Local corrections are stored in this browser only. They improve routes for you and are never pushed to the public data or to other users.", { iconName: "lock" }),
    ),
  );
}
