import { el, icon, setPageMeta, toast, confirmSheet, copyText, debounce, timeAgo, fmtDate, emptyState } from "../ui.js";
import { load } from "../data.js";
import { roomOverrides, setRoomOverride } from "../store.js";
import { pageHead, callout } from "../components.js";

const TOKEN_KEY = "gndec-one:admin-token";

function status(text, kind = "ok") {
  return el("span", { class: "row", style: { gap: "6px", alignItems: "center" } }, el("span", { class: `status-dot is-${kind}` }), el("span", { class: "small", text }));
}

function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function saveToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* private mode */
  }
}

function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

async function api(path, token, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      accept: "application/json",
      "x-admin-token": token,
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  if (response.status === 401) return { __unauthorized: true };
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) return { __error: data?.error || `HTTP ${response.status}`, status: response.status };
  return data;
}

function gate(root, message = "") {
  const input = el("input", {
    class: "input",
    type: "password",
    placeholder: "Admin token",
    autocomplete: "current-password",
    "aria-label": "Admin token",
  });
  const submit = el("button", { class: "btn btn--primary btn--block", type: "submit" }, icon("lock"), "Unlock console");
  const error = el("p", { class: "small", style: { color: "var(--danger, #b42318)", margin: 0 }, text: message });

  const form = el(
    "form",
    {
      class: "admin-gate",
      onsubmit: async (event) => {
        event.preventDefault();
        const token = input.value.trim();
        if (!token) {
          input.focus();
          return;
        }
        submit.disabled = true;
        submit.textContent = "Checking…";
        const result = await api("/api/admin/login", token, { method: "POST" }).catch(() => null);
        submit.disabled = false;
        submit.replaceChildren(icon("lock"), "Unlock console");
        if (!result || result.__unauthorized) {
          error.textContent = "That token was rejected. Check the ADMIN_TOKEN secret set with Wrangler.";
          input.select();
          return;
        }
        if (result.__error) {
          error.textContent = `The console is not available: ${result.__error}`;
          return;
        }
        saveToken(token);
        toast("Admin console unlocked");
        render(root);
      },
    },
    el("span", { class: "more-icon", style: { width: "46px", height: "46px" } }, icon("shield")),
    el("h1", { style: { margin: 0, fontSize: "22px" }, text: "Editorial console" }),
    el("p", { class: "small muted", style: { margin: 0 }, text: "This page writes to D1. Enter the ADMIN_TOKEN you set as a Worker secret. The token is kept in this browser only." }),
    el("div", { class: "field" }, el("label", { for: "admin-token", text: "Admin token" }), input),
    error,
    submit,
    el(
      "p",
      { class: "tiny faint", style: { margin: 0 } },
      "Set it once with ",
      el("code", { class: "mono", text: "wrangler secret put ADMIN_TOKEN" }),
      ". The page is also excluded from search engines.",
    ),
    el("a", { class: "btn btn--sm btn--ghost", href: "#/about" }, icon("arrow-left"), "Back to About"),
  );

  root.replaceChildren(el("div", { class: "page-enter" }, form));
  input.id = "admin-token";
  setTimeout(() => input.focus(), 60);
}

function statGrid(counts = {}) {
  return el(
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
}

function overviewTab(data) {
  const meta = data.meta || {};
  const coverage = meta.coverage || {};
  const missing = coverage.missing || [];
  const sources = data.sources || [];
  const checks = data.checks || [];
  const builds = data.builds || [];

  return el(
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
        el("dd", { text: meta.generatedAt ? `${fmtDate(meta.generatedAt)} · ${timeAgo(meta.generatedAt)}` : "—" }),
        el("dt", { text: "Data version" }),
        el("dd", { text: meta.dataVersion || "—" }),
      ),
      statGrid(meta.counts || {}),
      el(
        "div",
        { class: "row row--wrap", style: { gap: "10px", marginTop: "10px" } },
        status(data.d1 ? "D1 connected" : "D1 missing", data.d1 ? "ok" : "bad"),
        status(data.kv ? "KV cache connected" : "KV cache missing", data.kv ? "ok" : "warn"),
        status(data.ai ? "Workers AI connected" : "Workers AI off", data.ai ? "ok" : "warn"),
      ),
    ),
    el(
      "div",
      { class: "card card--pad" },
      el("div", { class: "section-head" }, el("h2", { text: "Coverage" }), el("span", { class: "badge badge--danger", text: `${missing.length} gaps` })),
      el(
        "div",
        { class: "stack", style: { gap: "7px" } },
        ...[
          ["Timetable years", (coverage.timetableYears || []).join(", ") || "—", (coverage.timetableYears || []).includes(4)],
          ["Timetable branches", (coverage.timetableBranches || []).join(", ") || "—", true],
          ["Student batches", (coverage.studentBatches || []).join(", ") || "—", (coverage.studentBatches || []).length >= 3],
          ["Programs", (coverage.programs || []).join(", ") || "—", true],
        ].map(([label, value, ok]) =>
          el("div", { class: "source-row" }, el("div", { class: "source-main" }, el("strong", { text: label }), el("small", { text: value })), status(ok ? "Published" : "Partial", ok ? "ok" : "warn")),
        ),
      ),
      missing.length
        ? el(
            "ul",
            { class: "small muted", style: { margin: "10px 0 0 16px", lineHeight: "1.7" } },
            ...missing.map((item) => el("li", { text: item })),
          )
        : el("p", { class: "small muted", text: "No documented gaps." }),
    ),
    el(
      "div",
      { class: "card card--pad" },
      el("div", { class: "section-head" }, el("h2", { text: "Source checks" }), el("span", { class: "small muted", text: `${sources.length} tracked` })),
      sources.length
        ? el(
            "div",
            { class: "stack", style: { gap: "5px" } },
            ...sources.map((source) =>
              el(
                "div",
                { class: "source-row" },
                el(
                  "div",
                  { class: "source-main" },
                  el("strong", { text: source.source || "source" }),
                  el("small", { text: `${source.last_checked_at ? `checked ${timeAgo(source.last_checked_at)}` : "never checked"}${source.last_error ? ` · ${source.last_error}` : ""}` }),
                ),
                status(source.last_ok ? "OK" : source.last_checked_at ? "Failed" : "Pending", source.last_ok ? "ok" : source.last_checked_at ? "bad" : "warn"),
              ),
            ),
          )
        : el("p", { class: "small muted", text: "No source check has run yet. The cron runs every 4 hours (17 */4 * * *)." }),
      checks.length
        ? el(
            "div",
            { style: { marginTop: "10px", maxHeight: "220px", overflow: "auto" } },
            el(
              "table",
              { class: "admin-table" },
              el("thead", {}, el("tr", {}, el("th", { text: "When" }), el("th", { text: "Source" }), el("th", { text: "Changed" }), el("th", { text: "Detail" }))),
              el(
                "tbody",
                {},
                ...checks.map((check) =>
                  el(
                    "tr",
                    {},
                    el("td", { text: timeAgo(check.checked_at) }),
                    el("td", { text: check.source || "—" }),
                    el("td", { text: check.changed ? "yes" : "no" }),
                    el("td", { text: check.detail || (check.ok ? "ok" : "error") }),
                  ),
                ),
              ),
            ),
          )
        : null,
      builds.length
        ? el(
            "div",
            { style: { marginTop: "10px" } },
            el("div", { class: "section-head" }, el("h3", { text: "Build runs" })),
            el(
              "table",
              { class: "admin-table" },
              el("thead", {}, el("tr", {}, el("th", { text: "Started" }), el("th", { text: "Source" }), el("th", { text: "Dispatched" }), el("th", { text: "Status" }))),
              el(
                "tbody",
                {},
                ...builds.map((run) =>
                  el("tr", {}, el("td", { text: timeAgo(run.started_at) }), el("td", { text: run.source || "—" }), el("td", { text: run.dispatched ? "yes" : "no" }), el("td", { text: run.status || "—" })),
                ),
              ),
            ),
          )
        : null,
    ),
  );
}

function contentTab(data, token, refresh) {
  const rows = data.content || [];
  const kind = el(
    "select",
    { class: "select", "aria-label": "Content kind" },
    ...["update", "notice", "event", "route", "faq", "club"].map((value) => el("option", { value, text: value })),
  );
  const title = el("input", { class: "input", type: "text", placeholder: "Title", "aria-label": "Title" });
  const body = el("textarea", { class: "input", rows: "4", placeholder: "Body (optional)", "aria-label": "Body" });
  const url = el("input", { class: "input", type: "text", inputmode: "url", placeholder: "Link (optional, absolute or /path)", "aria-label": "Link" });
  const published = el("input", { type: "checkbox", checked: true, "aria-label": "Published" });

  const table = el("div");

  const draw = () => {
    if (!rows.length) {
      table.replaceChildren(el("p", { class: "small muted", text: "No editorial content yet. Add a notice, event or route update above." }));
      return;
    }
    table.replaceChildren(
      el(
        "table",
        { class: "admin-table" },
        el("thead", {}, el("tr", {}, el("th", { text: "Kind" }), el("th", { text: "Title" }), el("th", { text: "Published" }), el("th", { text: "Updated" }), el("th", { text: "" }))),
        el(
          "tbody",
          {},
          ...rows.map((row) =>
            el(
              "tr",
              {},
              el("td", {}, el("span", { class: "badge badge--muted", text: row.kind })),
              el(
                "td",
                {},
                el("strong", { text: row.title }),
                row.body ? el("div", { class: "tiny faint", text: String(row.body).slice(0, 120) }) : null,
                row.url ? el("div", { class: "tiny" }, el("a", { href: row.url, target: "_blank", rel: "noopener", text: row.url })) : null,
              ),
              el("td", { text: row.published ? "yes" : "no" }),
              el("td", { text: timeAgo(row.updated_at) }),
              el(
                "td",
                {},
                el(
                  "div",
                  { class: "row", style: { gap: "4px", flexWrap: "wrap" } },
                  el(
                    "button",
                    {
                      class: "btn btn--sm btn--ghost",
                      type: "button",
                      onclick: async () => {
                        const result = await api(`/api/admin/content?id=${row.id}`, token, { method: "PATCH" }).catch(() => null);
                        if (!result || result.__error || result.__unauthorized) {
                          toast("Could not change visibility", "error");
                          return;
                        }
                        row.published = row.published ? 0 : 1;
                        draw();
                        toast(row.published ? "Published" : "Unpublished");
                      },
                    },
                    row.published ? "Unpublish" : "Publish",
                  ),
                  el(
                    "button",
                    {
                      class: "btn btn--sm btn--ghost",
                      type: "button",
                      onclick: () =>
                        confirmSheet({
                          title: "Delete this content?",
                          message: `“${row.title}” will be removed from D1. This cannot be undone.`,
                          confirmLabel: "Delete",
                          danger: true,
                          onConfirm: async () => {
                            const result = await api(`/api/admin/content?id=${row.id}`, token, { method: "DELETE" }).catch(() => null);
                            if (!result || result.__error || result.__unauthorized) {
                              toast("Could not delete", "error");
                              return;
                            }
                            const index = rows.findIndex((item) => item.id === row.id);
                            if (index >= 0) rows.splice(index, 1);
                            draw();
                            toast("Deleted");
                          },
                        }),
                    },
                    "Delete",
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  };
  draw();

  const form = el(
    "form",
    {
      class: "stack",
      onsubmit: async (event) => {
        event.preventDefault();
        if (!title.value.trim()) {
          title.focus();
          return;
        }
        const result = await api("/api/admin/content", token, {
          method: "POST",
          body: JSON.stringify({
            kind: kind.value,
            title: title.value.trim(),
            body: body.value.trim(),
            url: url.value.trim(),
            published: published.checked,
          }),
        }).catch(() => null);
        if (!result || result.__error || result.__unauthorized) {
          toast(result?.__error ? `Could not save: ${result.__error}` : "Could not save", "error");
          return;
        }
        title.value = "";
        body.value = "";
        url.value = "";
        toast("Content saved");
        refresh();
      },
    },
    el("div", { class: "grid grid--2", style: { alignItems: "end" } }, el("div", { class: "field" }, el("label", { text: "Kind" }), kind), el("div", { class: "field" }, el("label", { text: "Published" }), el("label", { class: "row", style: { gap: "8px", alignItems: "center" } }, published, el("span", { class: "small", text: "Visible in /api/content" })))),
    el("div", { class: "field" }, el("label", { text: "Title" }), title),
    el("div", { class: "field" }, el("label", { text: "Body" }), body),
    el("div", { class: "field" }, el("label", { text: "Link" }), url),
    el("button", { class: "btn btn--primary btn--sm", type: "submit" }, icon("plus"), "Add content"),
  );

  return el(
    "div",
    { class: "stack" },
    el("div", { class: "card card--pad" }, el("div", { class: "section-head" }, el("h2", { text: "New content" }), el("span", { class: "badge badge--muted", text: "D1" })), form),
    el("div", { class: "card card--pad" }, el("div", { class: "section-head" }, el("h2", { text: "Published content" }), el("span", { class: "small muted", text: `${rows.length} rows` })), table),
  );
}

function reportsTab(data, token, refresh) {
  const rows = data.reports || [];
  const open = rows.filter((row) => row.status !== "resolved").length;

  if (!rows.length) {
    return el("div", { class: "card card--pad" }, el("div", { class: "section-head" }, el("h2", { text: "Route reports" }), el("span", { class: "badge badge--ok", text: "0 open" })), el("p", { class: "small muted", text: "No photo-walk reports yet. Visitors can flag a wrong step from Rasta." }));
  }

  return el(
    "div",
    { class: "card card--pad" },
    el("div", { class: "section-head" }, el("h2", { text: "Route reports" }), el("span", { class: `badge ${open ? "badge--danger" : "badge--ok"}`, text: `${open} open` })),
    el("p", { class: "small muted", text: "Reports come from the “Report this step” button in Rasta photo walks. Resolve after fixing the photo or directions." }),
    el(
      "div",
      { style: { overflow: "auto" } },
      el(
        "table",
        { class: "admin-table" },
        el("thead", {}, el("tr", {}, el("th", { text: "When" }), el("th", { text: "Route" }), el("th", { text: "Reason" }), el("th", { text: "Status" }), el("th", { text: "" }))),
        el(
          "tbody",
          {},
          ...rows.map((row) =>
            el(
              "tr",
              {},
              el("td", { text: timeAgo(row.created_at) }),
              el("td", {}, el("strong", { text: `${row.from_place || "?"} → ${row.to_place || "?"}` }), el("div", { class: "tiny faint", text: row.place || row.page || "" })),
              el("td", { text: row.reason }),
              el("td", {}, el("span", { class: `badge ${row.status === "resolved" ? "badge--ok" : "badge--warn"}`, text: row.status })),
              el(
                "td",
                {},
                el(
                  "div",
                  { class: "row", style: { gap: "4px" } },
                  row.status !== "resolved"
                    ? el(
                        "button",
                        {
                          class: "btn btn--sm btn--ghost",
                          type: "button",
                          onclick: async () => {
                            const result = await api(`/api/admin/reports?id=${row.id}`, token, { method: "PATCH" }).catch(() => null);
                            if (!result || result.__error || result.__unauthorized) {
                              toast("Could not update", "error");
                              return;
                            }
                            row.status = "resolved";
                            refresh();
                            toast("Marked resolved");
                          },
                        },
                        "Resolve",
                      )
                    : null,
                  el(
                    "button",
                    {
                      class: "btn btn--sm btn--ghost",
                      type: "button",
                      onclick: async () => {
                        const result = await api(`/api/admin/reports?id=${row.id}`, token, { method: "DELETE" }).catch(() => null);
                        if (!result || result.__error || result.__unauthorized) {
                          toast("Could not delete", "error");
                          return;
                        }
                        refresh();
                        toast("Deleted");
                      },
                    },
                    "Delete",
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

async function roomMappingCard() {
  let rooms;
  let campus;
  try {
    [rooms, campus] = await Promise.all([load("rooms"), load("campus")]);
  } catch {
    return el("div", { class: "card card--pad" }, el("p", { class: "small muted", text: "Room data could not load. Reconnect once to cache it." }));
  }
  const overrides = roomOverrides();
  const places = [...(campus.places || [])].sort((a, b) => a.name.localeCompare(b.name));
  const roomList = [...(rooms.rooms || [])].sort((a, b) => a.name.localeCompare(b.name));
  const mapRows = el("div", { class: "stack", style: { gap: "6px" } });
  const mapSearch = el("input", { class: "input", type: "search", placeholder: "Filter rooms, e.g. F1, S2, G…", "aria-label": "Filter rooms" });
  let query = "";
  let limit = 30;

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
      const badgeNode = el("span", { class: `badge ${custom ? "badge--accent" : effective ? "badge--muted" : "badge--danger"}`.trim() }, custom ? "Edited" : effective ? "Inferred" : "Unmapped");
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
          el("div", { class: "source-main" }, el("strong", { text: room.name }), el("small", { text: `${room.lecturesPerWeek || 0} lectures/week${room.roomType ? ` · ${room.roomType}` : ""}` })),
          badgeNode,
          select,
        ),
      );
    }
    if (list.length > shown.length) {
      mapRows.appendChild(el("button", { class: "btn btn--soft btn--sm", type: "button", onclick: () => { limit += 30; drawRooms(); } }, `Show ${Math.min(30, list.length - shown.length)} more`));
    }
  };
  mapSearch.addEventListener("input", debounce(() => { query = mapSearch.value; limit = 30; drawRooms(); }, 100));
  drawRooms();

  const mappedCount = roomList.filter((room) => overrides[room.name] || room.place).length;
  const editedCount = Object.keys(overrides).length;

  return el(
    "div",
    { class: "card card--pad" },
    el("div", { class: "section-head" }, el("h2", { text: "Room → block mapping" }), el("span", { class: "badge badge--muted", text: `${mappedCount}/${roomList.length} mapped` })),
    el("p", { class: "small muted", text: "The college does not publish an official room-to-building table. Codes are inferred: F = first-year block, S = second-year block, G = ground-floor rooms, A6/A9 = automobile block. Correct any room here; corrections stay on this device." }),
    el(
      "div",
      { class: "row", style: { gap: "8px", marginTop: "10px", flexWrap: "wrap" } },
      el("div", { class: "input-icon", style: { flex: "1 1 230px" } }, icon("search"), mapSearch),
      el(
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
      ),
    ),
    el("div", { style: { marginTop: "10px", maxHeight: "440px", overflow: "auto" } }, mapRows),
  );
}

export async function render(root) {
  setPageMeta({ kicker: "Admin", title: "Editorial console" });
  const token = getToken();
  if (!token) {
    gate(root);
    return;
  }

  root.replaceChildren(el("div", { class: "page-enter stack" }, el("div", { class: "card card--pad" }, el("p", { class: "small muted", text: "Checking the admin token…" }))));

  const data = await api("/api/admin/overview", token).catch(() => null);
  if (!data || data.__unauthorized) {
    clearToken();
    gate(root, data?.__unauthorized ? "Your saved token was rejected. Enter the current ADMIN_TOKEN." : "The admin API could not be reached. Deploy the Worker and try again.");
    return;
  }
  if (data.__error) {
    gate(root, `The admin API returned an error: ${data.__error}`);
    return;
  }

  let active = "overview";
  let latest = data;

  const body = el("div", { class: "stack" });
  const tabs = [
    ["overview", "Overview", "grid"],
    ["content", "Content", "book"],
    ["reports", "Route reports", "flag"],
    ["sources", "Sources", "refresh"],
  ];
  const tabBar = el("div", { class: "chip-row" });

  const refresh = async () => {
    const next = await api("/api/admin/overview", token).catch(() => null);
    if (!next || next.__error || next.__unauthorized) {
      toast("Could not refresh the dashboard", "error");
      return;
    }
    latest = next;
    draw();
  };

  const draw = () => {
    for (const chip of tabBar.querySelectorAll(".chip")) chip.classList.toggle("is-active", chip.dataset.tab === active);
    if (active === "overview") body.replaceChildren(overviewTab(latest));
    else if (active === "content") body.replaceChildren(contentTab(latest, token, refresh));
    else if (active === "reports") body.replaceChildren(reportsTab(latest, token, refresh));
    else if (active === "sources") {
      body.replaceChildren(
        el(
          "div",
          { class: "card card--pad" },
          el("div", { class: "section-head" }, el("h2", { text: "Source registry" }), el("span", { class: "small muted", text: `${(latest.sources || []).length} tracked` })),
          (latest.sources || []).length
            ? el(
                "table",
                { class: "admin-table" },
                el("thead", {}, el("tr", {}, el("th", { text: "Source" }), el("th", { text: "Last checked" }), el("th", { text: "Last changed" }), el("th", { text: "OK" }), el("th", { text: "Error" }))),
                el(
                  "tbody",
                  {},
                  ...(latest.sources || []).map((source) =>
                    el("tr", {}, el("td", { text: source.source }), el("td", { text: source.last_checked_at ? timeAgo(source.last_checked_at) : "never" }), el("td", { text: source.last_changed_at ? timeAgo(source.last_changed_at) : "—" }), el("td", { text: source.last_ok ? "yes" : "no" }), el("td", { text: source.last_error || "—" })),
                  ),
                ),
              )
            : el("p", { class: "small muted", text: "No rows yet. Trigger the cron once with a manual deploy or wait for the next scheduled run." }),
        ),
        el(
          "div",
          { class: "card card--pad" },
          el("div", { class: "section-head" }, el("h2", { text: "Recent checks" })),
          (latest.checks || []).length
            ? el(
                "table",
                { class: "admin-table" },
                el("thead", {}, el("tr", {}, el("th", { text: "When" }), el("th", { text: "Source" }), el("th", { text: "Changed" }), el("th", { text: "Detail" }))),
                el(
                  "tbody",
                  {},
                  ...(latest.checks || []).map((check) => el("tr", {}, el("td", { text: timeAgo(check.checked_at) }), el("td", { text: check.source }), el("td", { text: check.changed ? "yes" : "no" }), el("td", { text: check.detail || "" }))),
                ),
              )
            : el("p", { class: "small muted", text: "No checks recorded yet." }),
        ),
      );
    }
  };

  for (const [id, label, iconName] of tabs) {
    tabBar.appendChild(
      el(
        "button",
        {
          class: `chip ${id === active ? "is-active" : ""}`.trim(),
          type: "button",
          "data-tab": id,
          onclick: () => {
            active = id;
            draw();
          },
        },
        icon(iconName),
        label,
      ),
    );
  }

  draw();

  root.replaceChildren(
    el(
      "div",
      { class: "page-enter stack", style: { gap: "16px" } },
      pageHead({
        kicker: "Editorial console",
        title: "Data & coverage",
        lede: "Token-gated D1 console for content, route reports and source health. Official data stays read-only; only editorial rows are written here.",
        actions: [
          el("button", { class: "btn btn--soft btn--sm", type: "button", onclick: refresh }, icon("refresh"), "Refresh"),
          el("button", { class: "btn btn--sm", type: "button", onclick: () => copyText(JSON.stringify(latest, null, 2), "Admin report copied") }, icon("copy"), "Copy report"),
          el(
            "button",
            {
              class: "btn btn--sm btn--ghost",
              type: "button",
              onclick: () => {
                clearToken();
                toast("Signed out of the admin console");
                render(root);
              },
            },
            icon("lock"),
            "Sign out",
          ),
        ],
      }),
      el("div", { class: "card card--pad" }, tabBar),
      body,
      el("div", { class: "card card--pad" }, el("div", { class: "section-head" }, el("h2", { text: "Local room corrections" }), el("span", { class: "badge badge--muted", text: "this device only" })), el("div", { class: "stack", id: "room-mapping-host" }, el("p", { class: "small muted", text: "Loading rooms…" }))),
      callout("Editorial content and route reports are stored in Cloudflare D1. Room corrections stay in this browser only. The admin page is marked noindex and excluded from the sitemap.", { iconName: "lock" }),
    ),
  );

  const host = root.querySelector("#room-mapping-host");
  if (host) {
    const card = await roomMappingCard();
    host.replaceChildren(card);
  }
}
