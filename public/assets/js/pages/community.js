import { el, icon, setPageMeta, emptyState, toast } from "../ui.js";
import { load } from "../data.js";
import { pageHead, callout } from "../components.js";

const FALLBACK_ICON = { "Uniformed service": "shield", "Community service": "heart", "Arts & culture": "music", Sports: "trophy", "Technical society": "cpu", Innovation: "lightbulb" };

function cardForClub(club) {
  return el(
    "article",
    { class: "community-card" },
    club.photo ? el("div", { class: "photo-hero", style: { borderRadius: "12px", overflow: "hidden", aspectRatio: "16/9" } }, el("img", { src: club.photo, alt: club.name, loading: "lazy", decoding: "async" })) : null,
    el("div", { class: "community-top" }, el("span", { class: "more-icon", style: { width: "30px", height: "30px" } }, icon(FALLBACK_ICON[club.category] || "users")), el("strong", { text: club.name })),
    el("p", { text: club.description }),
    el(
      "div",
      { class: "chip-row" },
      el("span", { class: "badge", text: club.category }),
      club.verified ? el("span", { class: "badge badge--ok", text: "Official" }) : el("span", { class: "badge badge--muted", text: "Confirm with college" }),
    ),
    el("p", { class: "tiny faint", text: `Meets: ${club.meets || "See notice board"}` }),
    el("a", { class: "btn btn--sm", href: club.url, target: "_blank", rel: "noopener" }, icon("external"), "Official page"),
  );
}

function cardForEvent(event) {
  return el(
    "article",
    { class: "community-card" },
    event.photo ? el("div", { class: "photo-hero", style: { borderRadius: "12px", overflow: "hidden", aspectRatio: "16/9" } }, el("img", { src: event.photo, alt: event.name, loading: "lazy", decoding: "async" })) : null,
    el("div", { class: "community-top" }, el("span", { class: "more-icon", style: { width: "30px", height: "30px" } }, icon("calendar")), el("strong", { text: event.name })),
    el("p", { text: event.description }),
    el("div", { class: "chip-row" }, el("span", { class: "badge", text: event.kind }), el("span", { class: "badge badge--muted", text: event.when })),
    el("a", { class: "btn btn--sm", href: event.url, target: "_blank", rel: "noopener" }, icon("external"), "Details"),
  );
}

function cardForResource(resource) {
  const external = /^https?:/i.test(resource.url);
  return el(
    "article",
    { class: "community-card" },
    el("div", { class: "community-top" }, el("span", { class: "more-icon", style: { width: "30px", height: "30px" } }, icon(resource.kind === "Library" ? "book" : resource.kind === "Career" ? "briefcase" : "sparkles")), el("strong", { text: resource.title })),
    el("p", { text: resource.description }),
    el("div", { class: "chip-row" }, el("span", { class: "badge badge--muted", text: resource.kind })),
    el("a", { class: "btn btn--sm", href: resource.url, ...(external ? { target: "_blank", rel: "noopener" } : {}) }, icon(external ? "external" : "arrow-right"), external ? "Open source" : "Open in app"),
  );
}

export async function render(root) {
  setPageMeta({ kicker: "Campus life", title: "Clubs, events & resources" });
  let community;
  try {
    community = await load("community");
  } catch {
    root.replaceChildren(emptyState({ iconName: "wifi-off", title: "Campus life data unavailable", text: "Reconnect once to cache clubs, events and resources.", actionLabel: "Retry", onAction: () => location.reload() }));
    return;
  }

  const clubs = community.clubs || [];
  const events = community.events || [];
  const resources = community.resources || [];
  const categories = ["All", ...new Set(clubs.map((club) => club.category))];
  let activeCategory = "All";

  const clubGrid = el("div", { class: "community-grid" });
  const drawClubs = () => {
    const list = activeCategory === "All" ? clubs : clubs.filter((club) => club.category === activeCategory);
    clubGrid.replaceChildren(...list.map(cardForClub));
  };
  const chips = el(
    "div",
    { class: "chip-row" },
    ...categories.map((category) =>
      el(
        "button",
        {
          class: `chip ${category === activeCategory ? "is-active" : ""}`.trim(),
          type: "button",
          onclick: (event) => {
            activeCategory = category;
            for (const chip of chips.querySelectorAll(".chip")) chip.classList.toggle("is-active", chip === event.currentTarget);
            drawClubs();
          },
        },
        icon(category === "All" ? "grid" : FALLBACK_ICON[category] || "users"),
        category,
      ),
    ),
  );
  drawClubs();

  const unverified = clubs.filter((club) => !club.verified).length;

  root.replaceChildren(
    el(
      "div",
      { class: "page-enter stack", style: { gap: "16px" } },
      pageHead({
        kicker: "Campus life",
        title: "More than lectures",
        lede: "NCC, NSS, cultural, sports and technical societies — plus the festivals and resources that make campus feel like home.",
        actions: [
          el("a", { class: "btn btn--soft btn--sm", href: "#/notices" }, icon("bell"), "Latest notices"),
          el("a", { class: "btn btn--sm", href: "#/rasta/place/auditorium" }, icon("map"), "Auditorium on map"),
        ],
      }),
      el("section", { class: "section" }, el("div", { class: "section-head" }, el("h2", { text: "Clubs & societies" }), el("span", { class: "small muted", text: `${clubs.length} listed` })), chips, el("div", { style: { marginTop: "10px" } }, clubGrid)),
      el("section", { class: "section" }, el("div", { class: "section-head" }, el("h2", { text: "Events & festivals" }), el("span", { class: "small muted", text: `${events.length} recurring` })), el("div", { class: "community-grid" }, ...events.map(cardForEvent))),
      el("section", { class: "section" }, el("div", { class: "section-head" }, el("h2", { text: "Study & campus resources" })), el("div", { class: "community-grid" }, ...resources.map(cardForResource))),
      unverified
        ? callout(`${unverified} student chapter${unverified === 1 ? " is" : "s are"} listed without an official college page. Confirm the current office-bearers on the department notice board before relying on the name.`, { iconName: "info" })
        : null,
      el(
        "div",
        { class: "card card--pad" },
        el("div", { class: "section-head" }, el("h2", { text: "Run a club?" })),
        el("p", { class: "small muted", text: "Send the official page, faculty coordinator and meeting slot. Verified entries are marked with an Official badge." }),
        el("button", { class: "btn btn--sm", type: "button", onclick: () => toast("Ask the admin to add it from Admin → Content, or email principal@gndec.ac.in.") }, icon("plus"), "How to add a club"),
      ),
    ),
  );
}
