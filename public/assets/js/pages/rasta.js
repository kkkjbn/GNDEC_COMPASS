import { el, icon, setPageMeta, emptyState, toast, copyText, debounce, safeUrl } from "../ui.js";
import { load, findPlaces, getPlace, placeForRoom } from "../data.js";
import { pageHead, callout, breadcrumb } from "../components.js";
import { shortestRoute, matchPlacesInText } from "../logic.js";

const NS = "http://www.w3.org/2000/svg";

function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    node.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    if (child instanceof Node) node.appendChild(child);
    else node.appendChild(document.createTextNode(String(child)));
  }
  return node;
}

const px = (value) => Math.round(value * 1000) / 10;

function polygon(points, className, extra = {}) {
  return svg("polygon", {
    points: points.map(([x, y]) => `${px(x)},${px(y)}`).join(" "),
    class: className,
    ...extra,
  });
}

function centroid(points) {
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point[0];
    y += point[1];
  }
  return [x / points.length, y / points.length];
}

function haversineM(a, b) {
  if (!a || !b) return 0;
  const R = 6371000;
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const CATEGORY_ICON = {
  gate: "navigation",
  admin: "shield",
  library: "book",
  academic: "building",
  lab: "layers",
  landmark: "star",
  sports: "heart",
  hostel: "home",
  food: "coffee",
  health: "plus",
  bank: "building",
};

function buildMap(campus, state, handlers) {
  const wrap = el("div", { class: "map-card" });
  const map = svg("svg", {
    class: "campus-map",
    viewBox: "-4 -4 112 112",
    role: "img",
    "aria-label": "Map of the GNDEC and GND Polytechnic campus",
    preserveAspectRatio: "xMidYMid meet",
  });

  map.appendChild(svg("rect", { x: "-20", y: "-20", width: "160", height: "160", fill: "transparent" }));

  const ground = svg("g", { class: "map-ground" });
  const labels = svg("g", { class: "map-labels" });
  const roads = svg("g", { class: "map-roads" });
  const routeGroup = svg("g", { class: "map-route" });
  const markers = svg("g", { class: "map-markers" });

  for (const shape of campus.geometry || []) {
    if (!shape.pts?.length) continue;
    const isWater = shape.type === "leisure" && shape.kind === "swimming_pool";
    const isGreen = shape.type === "leisure" && ["pitch", "park", "track", "stadium"].includes(shape.kind);
    const isParking = shape.type === "amenity" && shape.kind === "parking";
    if (isWater) ground.appendChild(polygon(shape.pts, "map-water"));
    else if (isGreen || isParking) ground.appendChild(polygon(shape.pts, "map-green"));
    else if (shape.type === "building" || shape.type === "amenity") ground.appendChild(polygon(shape.pts, "map-building"));
    if (shape.name && shape.type === "building" && shape.name.length <= 28 && !/^(G\d|S\d|F\d|A\d)$/i.test(shape.name)) {
      const [x, y] = centroid(shape.pts);
      labels.appendChild(svg("text", { x: px(x), y: px(y), class: "map-label map-label--small" }, shape.name));
    }
  }

  const junctionById = new Map((campus.junctions || []).map((j) => [j.id, j]));
  for (const edge of campus.edges || []) {
    const a = junctionById.get(edge.a);
    const b = junctionById.get(edge.b);
    if (!a || !b || !a.pos || !b.pos) continue;
    roads.appendChild(
      svg("line", {
        x1: px(a.pos[0]),
        y1: px(a.pos[1]),
        x2: px(b.pos[0]),
        y2: px(b.pos[1]),
        class: "map-road",
      }),
    );
  }

  for (const place of campus.places || []) {
    if (!place.pos) continue;
    const showLabel = ["gate", "admin", "library", "landmark", "sports", "hostel", "food", "health", "bank"].includes(place.category) || state.selected === place.id || state.to === place.id;
    const marker = svg(
      "g",
      {
        class: `marker ${state.selected === place.id ? "is-selected" : ""}`.trim(),
        "data-category": place.category,
        "data-id": place.id,
        transform: `translate(${px(place.pos[0])} ${px(place.pos[1])})`,
        tabindex: "0",
        role: "button",
        "aria-label": place.name,
      },
      svg("title", {}, place.name),
      svg("circle", { r: state.to === place.id ? 3.5 : 2.4 }),
      showLabel ? svg("text", { y: -3.6 }, place.name.replace(/\s*\([^)]*\)/, "")) : null,
    );
    marker.addEventListener("click", (event) => {
      event.stopPropagation();
      handlers.onPlace(place);
    });
    marker.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handlers.onPlace(place);
      }
    });
    markers.appendChild(marker);
  }

  if (state.route) {
    const points = state.route.points || [];
    if (points.length > 1) {
      routeGroup.appendChild(
        svg("polyline", { points: points.map(([x, y]) => `${px(x)},${px(y)}`).join(" "), class: "route-halo" }),
      );
      routeGroup.appendChild(
        svg("polyline", { points: points.map(([x, y]) => `${px(x)},${px(y)}`).join(" "), class: "route-line" }),
      );
      for (const point of [points[0], points[points.length - 1]]) {
        routeGroup.appendChild(svg("circle", { cx: px(point[0]), cy: px(point[1]), r: 2, class: "route-pin" }));
      }
    }
  }

  map.append(ground, roads, routeGroup, labels, markers);

  /* pan */
  let drag = null;
  const viewBox = () => map.getAttribute("viewBox").split(" ").map(Number);
  const setViewBox = ([x, y, w, h]) => map.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);

  map.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".marker")) return;
    const [x, y, w, h] = viewBox();
    drag = { startX: event.clientX, startY: event.clientY, x, y, w, h };
    map.classList.add("is-dragging");
    map.setPointerCapture?.(event.pointerId);
  });
  map.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const rect = map.getBoundingClientRect();
    const dx = ((event.clientX - drag.startX) / rect.width) * drag.w;
    const dy = ((event.clientY - drag.startY) / rect.height) * drag.h;
    setViewBox([drag.x - dx, drag.y - dy, drag.w, drag.h]);
  });
  const endDrag = () => {
    drag = null;
    map.classList.remove("is-dragging");
  };
  map.addEventListener("pointerup", endDrag);
  map.addEventListener("pointercancel", endDrag);
  map.addEventListener("pointerleave", endDrag);

  const zoom = (factor) => {
    const [x, y, w, h] = viewBox();
    const cx = x + w / 2;
    const cy = y + h / 2;
    const nw = Math.max(24, Math.min(160, w * factor));
    const nh = Math.max(24, Math.min(160, h * factor));
    setViewBox([cx - nw / 2, cy - nh / 2, nw, nh]);
  };

  const controls = el(
    "div",
    { class: "map-controls" },
    el("button", { type: "button", "aria-label": "Zoom in", onclick: () => zoom(0.78) }, icon("plus")),
    el("button", { type: "button", "aria-label": "Zoom out", onclick: () => zoom(1.28) }, icon("minus")),
    el("button", { type: "button", "aria-label": "Reset map", onclick: () => setViewBox([-4, -4, 112, 112]) }, icon("refresh")),
    el(
      "button",
      {
        type: "button",
        "aria-label": "Use my location",
        onclick: () => {
          if (!navigator.geolocation) {
            toast("Location is not available on this device.", "error");
            return;
          }
          toast("Finding your location…");
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const here = { lat: position.coords.latitude, lon: position.coords.longitude };
              const nearest = [...(campus.places || [])].sort((a, b) => haversineM(here, a) - haversineM(here, b))[0];
              if (nearest) {
                handlers.onPlace(nearest);
                toast(`Nearest: ${nearest.name} (${Math.round(haversineM(here, nearest))} m)`);
              }
            },
            () => toast("Location permission was denied.", "error"),
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
          );
        },
      },
      icon("locate"),
    ),
  );

  const badge = el("span", { class: "map-badge" }, icon("compass"), "GNDEC + GND Polytechnic");
  const legend = el(
    "div",
    { class: "map-legend" },
    el("span", {}, el("i"), "Academic"),
    el("span", {}, el("i", { class: "food" }), "Food"),
    el("span", {}, el("i", { class: "sports" }), "Sports"),
    el("span", {}, el("i", { class: "hostel" }), "Hostel"),
    el("span", {}, el("i", { class: "gate" }), "Gate"),
  );

  wrap.append(map, badge, controls, legend);
  return { wrap, map, routeGroup, markers };
}

function drawRoute(mapData, route, state) {
  const group = mapData.routeGroup;
  group.replaceChildren();
  if (!route?.points?.length) return;
  const points = route.points.map(([x, y]) => `${px(x)},${px(y)}`).join(" ");
  group.appendChild(svg("polyline", { points, class: "route-halo" }));
  group.appendChild(svg("polyline", { points, class: "route-line" }));
  for (const point of [route.points[0], route.points[route.points.length - 1]]) {
    group.appendChild(svg("circle", { cx: px(point[0]), cy: px(point[1]), r: 2, class: "route-pin" }));
  }
  for (const marker of mapData.markers.querySelectorAll(".marker")) {
    const id = marker.getAttribute("data-id");
    marker.classList.toggle("is-selected", id === state.to || id === state.from);
  }
}

function photoWalk(campus, route) {
  const places = (route.via && route.via.length ? route.via : [route.from, route.to]).filter(Boolean);
  if (!places.length) return null;
  let index = 0;

  const frame = el("div", { class: "walk-frame" });
  const progress = el("div", { class: "walk-progress" });
  const caption = el("div", { class: "walk-caption" });
  const counter = el("span", { class: "tiny faint" });
  const prev = el("button", { class: "btn btn--sm", type: "button" }, icon("chevron-left"), "Previous");
  const next = el("button", { class: "btn btn--sm btn--primary", type: "button" }, "Next", icon("chevron-right"));

  const report = el(
    "button",
    {
      class: "btn btn--sm btn--ghost",
      type: "button",
      onclick: async () => {
        const reason = window.prompt("What is wrong with this step? (wrong photo, blocked path, wrong location…)");
        if (!reason) return;
        const payload = {
          from: route.from?.id || "",
          to: route.to?.id || "",
          place: places[index]?.id || "",
          reason: String(reason).slice(0, 500),
          page: location.pathname,
          at: new Date().toISOString(),
        };
        try {
          const response = await fetch("/api/report-route", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!response.ok) throw new Error("report failed");
          toast("Thanks — the route report was sent for review.");
        } catch {
          try {
            const key = "gndec-one:route-reports";
            const list = JSON.parse(localStorage.getItem(key) || "[]");
            list.push(payload);
            localStorage.setItem(key, JSON.stringify(list.slice(-50)));
          } catch {}
          toast("Report saved on this device. It will be reviewed when you reconnect.");
        }
      },
    },
    icon("flag"),
    "Report this step",
  );

  const render = () => {
    const place = places[index];
    const photo = place.photo || campus.gallery?.find((item) => item.place === place.id)?.src || "";
    frame.replaceChildren(
      photo
        ? el("img", { src: photo, alt: place.name, loading: "lazy", decoding: "async" })
        : el(
            "div",
            { class: "walk-placeholder" },
            icon(CATEGORY_ICON[place.category] || "pin"),
            el("strong", { text: "Photo not published yet" }),
            el("small", { text: "Use the map and the written directions for this step." }),
          ),
      el("span", { class: "walk-badge" }, icon(CATEGORY_ICON[place.category] || "pin"), place.category || "place"),
    );
    const nextPlace = places[index + 1];
    const distance = nextPlace ? Math.round(haversineM(place, nextPlace)) : 0;
    caption.replaceChildren(
      el("strong", { text: place.name }),
      el("p", { class: "small muted", text: place.description || `Step ${index + 1} of the walking route.` }),
      nextPlace
        ? el("p", { class: "small", text: `Continue towards ${nextPlace.name} · about ${distance} m` })
        : el("p", { class: "small", text: "You have arrived. The destination is on your right/left according to the block entrance." }),
    );
    progress.replaceChildren(
      ...places.map((_, i) => el("span", { class: `walk-dot ${i <= index ? "is-done" : ""} ${i === index ? "is-current" : ""}`.trim() })),
    );
    counter.textContent = `Step ${index + 1} of ${places.length}`;
    prev.disabled = index === 0;
    next.disabled = index === places.length - 1;
  };

  prev.addEventListener("click", () => {
    if (index > 0) {
      index -= 1;
      render();
    }
  });
  next.addEventListener("click", () => {
    if (index < places.length - 1) {
      index += 1;
      render();
    }
  });

  render();

  return el(
    "div",
    { class: "photo-walk" },
    el("div", { class: "section-head" }, el("h3", { text: "Photo walk" }), counter),
    frame,
    progress,
    caption,
    el("div", { class: "row", style: { gap: "6px", flexWrap: "wrap" } }, prev, next, el("span", { class: "spacer" }), report),
  );
}

function routePanel(campus, state, onChange) {
  const panel = el("div", { class: "card card--pad route-panel" });
  const fromSelect = el("select", { class: "select", "aria-label": "Start place" });
  const toSelect = el("select", { class: "select", "aria-label": "Destination" });
  const places = [...(campus.places || [])].sort((a, b) => a.name.localeCompare(b.name));
  fromSelect.appendChild(el("option", { value: "", text: "Choose a start…" }));
  toSelect.appendChild(el("option", { value: "", text: "Where to?" }));
  for (const place of places) {
    fromSelect.appendChild(el("option", { value: place.id, text: place.name }));
    toSelect.appendChild(el("option", { value: place.id, text: place.name }));
  }
  fromSelect.value = state.from || "";
  toSelect.value = state.to || "";

  const result = el("div", { style: { marginTop: "10px" } });

  const compute = () => {
    state.from = fromSelect.value;
    state.to = toSelect.value;
    if (!state.from || !state.to || state.from === state.to) {
      state.route = null;
      result.replaceChildren(
        callout(state.from && state.to ? "Pick two different places." : "Choose where you are and where you want to go. Walking times are estimates.", { iconName: "route" }),
      );
      onChange();
      return;
    }
    const route = shortestRoute(campus, state.from, state.to);
    state.route = route;
    if (!route) {
      result.replaceChildren(callout("No walking path is mapped between these places yet.", { iconName: "alert", variant: "warn" }));
      onChange();
      return;
    }
    const destination = getPlace(campus, state.to);
    result.replaceChildren(
      el(
        "div",
        { class: "route-result" },
        el(
          "div",
          { class: "route-summary" },
          el("div", {}, el("strong", { text: `${route.minutes} min` }), el("small", { text: "walking" })),
          el("div", {}, el("strong", { text: `${route.metres} m` }), el("small", { text: "distance" })),
          el("span", { class: "spacer" }),
          icon("foot"),
        ),
        el(
          "div",
          { class: "route-steps" },
          ...route.steps.map((step) =>
            el("div", { class: "route-step" }, el("span", { class: "step-dot" }), el("span", {}, step.text, step.metres ? el("small", { class: "faint", text: ` · ${step.metres} m` }) : null)),
          ),
        ),
        photoWalk(campus, route),
        el(
          "div",
          { class: "row", style: { gap: "6px", marginTop: "9px", flexWrap: "wrap" } },
          destination
            ? el("a", { class: "btn btn--sm", href: `https://www.google.com/maps/dir/?api=1&destination=${destination.lat},${destination.lon}&travelmode=walking`, target: "_blank", rel: "noopener" }, icon("navigation"), "Google Maps")
            : null,
          el(
            "button",
            {
              class: "btn btn--sm",
              type: "button",
              onclick: () =>
                copyText(
                  route.steps.map((step) => step.text).join("\n"),
                  "Directions copied",
                ),
            },
            icon("copy"),
            "Copy steps",
          ),
          el("a", { class: "btn btn--sm", href: `#/rasta/place/${state.to}` }, icon("info"), "Place details"),
        ),
      ),
    );
    onChange();
  };

  fromSelect.addEventListener("change", compute);
  toSelect.addEventListener("change", compute);

  const swap = el(
    "button",
    {
      class: "btn btn--sm",
      type: "button",
      onclick: () => {
        const from = fromSelect.value;
        fromSelect.value = toSelect.value;
        toSelect.value = from;
        compute();
      },
    },
    icon("refresh"),
    "Swap",
  );

  panel.append(
    el("div", { class: "section-head" }, el("h2", { text: "Walking route" }), el("span", { class: "badge badge--muted" }, icon("foot"), "on campus")),
    el(
      "div",
      { class: "route-selects" },
      el("div", { class: "field" }, el("label", { text: "From" }), fromSelect),
      el("div", { class: "field" }, el("label", { text: "To" }), toSelect),
    ),
    el("div", { class: "row", style: { marginTop: "8px" } }, swap, el("span", { class: "tiny faint", text: "Straight-line paths follow the mapped walkways." })),
    result,
  );

  compute();
  return panel;
}

export async function render(root, params = {}) {
  let campus;
  let rooms;
  try {
    [campus, rooms] = await Promise.all([load("campus"), load("rooms")]);
  } catch (err) {
    console.error(err);
    root.replaceChildren(emptyState({ iconName: "wifi-off", title: "Campus map unavailable", text: "Reconnect once to cache the map and place data.", actionLabel: "Retry", onAction: () => location.reload() }));
    return;
  }

  if (params.kind === "place" && params.id) return renderPlace(root, decodeURIComponent(params.id), campus, rooms);
  if (params.kind === "room" && params.id) return renderRoom(root, decodeURIComponent(params.id), campus, rooms);

  setPageMeta({ kicker: "Rasta", title: "Campus map" });

  const from = params.from && getPlace(campus, params.from) ? params.from : "main-gate";
  const to = params.to && getPlace(campus, params.to) ? params.to : "";
  const state = { from, to, selected: to || "", route: null, query: params.q || "" };

  const mapData = buildMap(campus, state, {
    onPlace: (place) => {
      if (!state.from) state.from = "main-gate";
      state.to = state.to === place.id ? "" : place.id;
      state.selected = place.id;
      routeHost.replaceChildren();
      const panel = routePanel(campus, state, () => {
        state.selected = state.to || state.from;
        drawRoute(mapData, state.route, state);
      });
      routeHost.appendChild(panel);
      drawRoute(mapData, state.route, state);
      if (state.to) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    },
  });

  const routeHost = el("div", { class: "stack" });
  const initialPanel = routePanel(campus, state, () => drawRoute(mapData, state.route, state));
  routeHost.appendChild(initialPanel);
  drawRoute(mapData, state.route, state);

  const searchInput = el("input", { class: "input", type: "search", placeholder: "Search places, e.g. library, canteen, S-block…", value: state.query, "aria-label": "Search campus places" });
  const placeList = el("div", { class: "place-list" });

  const drawPlaces = () => {
    const list = findPlaces(campus, searchInput.value);
    if (!list.length) {
      placeList.replaceChildren(emptyState({ iconName: "pin", title: "No place matches", text: "Try a building name, a room code or a facility." }));
      return;
    }
    placeList.replaceChildren(
      ...list.map((place) =>
        el(
          "button",
          {
            class: `place-row ${state.to === place.id ? "is-selected" : ""}`.trim(),
            type: "button",
            onclick: () => {
              state.to = place.id;
              state.selected = place.id;
              routeHost.replaceChildren(routePanel(campus, state, () => drawRoute(mapData, state.route, state)));
              drawPlaces();
              drawRoute(mapData, state.route, state);
            },
          },
          el("span", { class: "place-icon" }, icon(CATEGORY_ICON[place.category] || "pin")),
          el("span", { class: "place-main" }, el("strong", { text: place.name }), el("small", { text: place.description || place.category })),
          icon("arrow-right"),
        ),
      ),
    );
  };
  searchInput.addEventListener("input", debounce(drawPlaces, 100));
  drawPlaces();

  const placeCard = el(
    "div",
    { class: "card card--pad" },
    el("div", { class: "section-head" }, el("h2", { text: "Find a place" }), el("span", { class: "small muted", text: `${campus.places.length} places` })),
    el("div", { class: "input-icon" }, icon("search"), searchInput),
    el("div", { style: { marginTop: "10px" } }, placeList),
  );

  root.replaceChildren(
    el(
      "div",
      { class: "page-enter" },
      pageHead({
        kicker: "Rasta · campus navigation",
        title: "Find your way",
        lede: "A hand-mapped guide to classrooms, departments, hostels, food and the gates. Tap any marker to route there.",
        actions: [
          el("a", { class: "btn btn--soft btn--sm", href: "#/timetable" }, icon("calendar"), "My rooms"),
          el("a", { class: "btn btn--sm", href: "https://www.gndpoly.org/CollegeMap2.php", target: "_blank", rel: "noopener" }, icon("external"), "GND Poly map"),
        ],
      }),
      el(
        "div",
        { class: "rasta-layout" },
        mapData.wrap,
        el("aside", { class: "stack" }, routeHost, placeCard),
      ),
      callout(campus.disclaimer, { iconName: "info" }),
    ),
  );
}

async function renderPlace(root, placeId, campus, rooms) {
  const place = getPlace(campus, placeId);
  if (!place) {
    root.replaceChildren(emptyState({ iconName: "map", title: "Place not found", text: "This place is not in the campus map.", actionLabel: "Open Rasta", onAction: () => { window.gndecNavigate?.("/rasta") || (location.hash = "#/rasta"); } }));
    return;
  }
  setPageMeta({ kicker: "Rasta · place", title: place.name });
  const route = shortestRoute(campus, "main-gate", place.id);
  const relatedRooms = (rooms.rooms || []).filter((room) => room.place === place.id);
  const nearby = (campus.places || [])
    .filter((other) => other.id !== place.id)
    .map((other) => ({ place: other, metres: Math.round(haversineM(place, other)) }))
    .filter((row) => row.metres > 0 && row.metres < 450)
    .sort((a, b) => a.metres - b.metres)
    .slice(0, 6);

  const photo = place.photo || campus.gallery?.find((item) => item.place === place.id)?.src || "";

  const hero = el(
    "div",
    { class: "detail-hero" },
    photo
      ? el("div", { class: "photo-hero", style: { width: "min(100%, 330px)", flex: "0 1 330px" } }, el("img", { src: photo, alt: place.name, loading: "lazy" }), place.photoCredit ? el("span", { class: "photo-credit", text: place.photoCredit }) : null)
      : el("span", { class: "avatar avatar--xl", style: { background: "var(--primary-soft)" } }, icon(CATEGORY_ICON[place.category] || "pin")),
    el(
      "div",
      { class: "detail-main" },
      el("span", { class: "eyebrow" }, icon(CATEGORY_ICON[place.category] || "pin"), `${place.category} · ${place.verified ? "verified location" : "approximate location"}`),
      el("h2", { class: "display", text: place.name }),
      el("p", { class: "detail-sub", text: place.description || "" }),
      place.aliases?.length ? el("p", { class: "small faint", text: `Also called: ${place.aliases.join(", ")}` }) : null,
      el(
        "div",
        { class: "detail-actions" },
        el("a", { class: "btn btn--primary btn--sm", href: `#/rasta?from=main-gate&to=${place.id}` }, icon("route"), "Route from main gate"),
        el("a", { class: "btn btn--sm", href: `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lon}&travelmode=walking`, target: "_blank", rel: "noopener" }, icon("navigation"), "Google Maps"),
        el("a", { class: "btn btn--sm", href: `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=19/${place.lat}/${place.lon}`, target: "_blank", rel: "noopener" }, icon("external"), "OpenStreetMap"),
        el("button", { class: "btn btn--sm", type: "button", onclick: () => copyText(`${place.lat}, ${place.lon}`, "Coordinates copied") }, icon("copy"), "Coordinates"),
      ),
    ),
  );

  const routeCard = route
    ? el(
        "div",
        { class: "card card--pad" },
        el("div", { class: "section-head" }, el("h2", { text: "From the main gate" }), el("span", { class: "badge badge--muted", text: `${route.minutes} min · ${route.metres} m` })),
        el(
          "div",
          { class: "route-steps" },
          ...route.steps.map((step) => el("div", { class: "route-step" }, el("span", { class: "step-dot" }), el("span", {}, step.text, step.metres ? el("small", { class: "faint", text: ` · ${step.metres} m` }) : null))),
        ),
        photoWalk(campus, route),
      )
    : null;

  const roomsCard = relatedRooms.length
    ? el(
        "div",
        { class: "card card--pad" },
        el("div", { class: "section-head" }, el("h2", { text: "Rooms in this block" }), el("span", { class: "small muted", text: `${relatedRooms.length}` })),
        el(
          "div",
          { class: "chip-row" },
          ...relatedRooms.map((room) => el("a", { class: "chip", href: `#/rasta/room/${room.id}` }, icon("pin"), room.name.replace(/\s*\([^)]*\)/, ""), el("span", { class: "tiny faint", text: `${room.lecturesPerWeek}/wk` }))),
        ),
      )
    : null;

  const nearbyCard = el(
    "div",
    { class: "card card--pad" },
    el("div", { class: "section-head" }, el("h2", { text: "Nearby" })),
    nearby.length
      ? el(
          "div",
          { class: "stack", style: { gap: "4px" } },
          ...nearby.map((row) =>
            el(
              "a",
              { class: "result-row", href: `#/rasta/place/${row.place.id}` },
              el("span", { class: "place-icon", style: { width: "28px", height: "28px", borderRadius: "8px", display: "grid", placeItems: "center", background: "var(--card-2)" } }, icon(CATEGORY_ICON[row.place.category] || "pin")),
              el("span", { class: "result-main" }, el("strong", { text: row.place.name }), el("small", { text: `${row.metres} m away · ${row.place.category}` })),
              icon("chevron-right"),
            ),
          ),
        )
      : el("p", { class: "muted small", text: "No other mapped place within 450 m." }),
  );

  root.replaceChildren(
    el(
      "div",
      { class: "page-enter stack", style: { gap: "16px" } },
      breadcrumb("Back to Rasta", "#/rasta"),
      hero,
      el("div", { class: "grid grid--2", style: { alignItems: "start" } }, el("div", { class: "stack" }, routeCard, roomsCard), el("div", { class: "stack" }, nearbyCard, callout("Positions come from OpenStreetMap building footprints and the shared GND Polytechnic campus map. Indoor room locations are inferred from room codes.", { iconName: "info" }))),
    ),
  );
}

async function renderRoom(root, roomId, campus, rooms) {
  const room = (rooms.rooms || []).find((item) => item.id === roomId) || (rooms.rooms || []).find((item) => item.name.toLowerCase() === roomId.toLowerCase());
  if (!room) {
    root.replaceChildren(emptyState({ iconName: "pin", title: "Room not found", text: "This room does not appear in the current timetable.", actionLabel: "Open Rasta", onAction: () => { window.gndecNavigate?.("/rasta") || (location.hash = "#/rasta"); } }));
    return;
  }
  setPageMeta({ kicker: "Rasta · room", title: room.name });
  const place = getPlace(campus, room.place);
  const route = place ? shortestRoute(campus, "main-gate", place.id) : null;

  root.replaceChildren(
    el(
      "div",
      { class: "page-enter stack", style: { gap: "16px" } },
      breadcrumb("Back to Rasta", "#/rasta"),
      el(
        "div",
        { class: "detail-hero" },
        el("span", { class: "avatar avatar--xl", style: { background: "var(--primary-soft)" } }, icon("pin")),
        el(
          "div",
          { class: "detail-main" },
          el("span", { class: "eyebrow" }, icon("pin"), "Room / lab"),
          el("h2", { class: "display", text: room.name }),
          el("p", { class: "detail-sub", text: place ? `${place.name} · ${room.lecturesPerWeek} scheduled lectures per week` : `${room.lecturesPerWeek} scheduled lectures per week · block not published` }),
          el(
            "div",
            { class: "detail-actions" },
            place ? el("a", { class: "btn btn--primary btn--sm", href: `#/rasta/place/${place.id}` }, icon("map"), "Open block") : null,
            place ? el("a", { class: "btn btn--sm", href: `#/rasta?from=main-gate&to=${place.id}` }, icon("route"), "Walking route") : null,
          ),
        ),
      ),
      el(
        "div",
        { class: "grid grid--2", style: { alignItems: "start" } },
        el(
          "div",
          { class: "card card--pad" },
          el("div", { class: "section-head" }, el("h2", { text: "Used by" })),
          room.sections?.length
            ? el("div", { class: "chip-row" }, ...room.sections.map((section) => el("a", { class: "chip", href: `#/timetable/${section}` }, icon("calendar"), section)))
            : el("p", { class: "muted small", text: "No section is scheduled here in the current export." }),
        ),
        place && route
          ? el(
              "div",
              { class: "card card--pad" },
              el("div", { class: "section-head" }, el("h2", { text: "From the main gate" }), el("span", { class: "badge badge--muted", text: `${route.minutes} min · ${route.metres} m` })),
              el("div", { class: "route-steps" }, ...route.steps.map((step) => el("div", { class: "route-step" }, el("span", { class: "step-dot" }), el("span", { text: step.text })))),
            )
          : callout("The block for this room is not published. You can map it yourself in Admin → Room mapping.", { iconName: "alert", variant: "warn" }),
      ),
      callout("Room-to-block links are inferred from room codes (F = first-year block, S = second-year block, G = ground-floor rooms, A = automobile block). They can be corrected in Admin.", { iconName: "info" }),
    ),
  );
}
