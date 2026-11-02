/**
 * Pure domain logic: schedules, campus routing, and the grounded local assistant.
 *
 * This module never touches the DOM. That keeps it testable in Node and makes the
 * assistant work offline with the exact same code path as the UI.
 */

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function toMinutes(time) {
  const match = String(time || "").match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function fromMinutes(mins) {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function fmtTime(time) {
  const mins = toMinutes(time);
  if (mins == null) return String(time || "");
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h >= 12 ? "pm" : "am";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function fmtRange(start, end) {
  return start ? `${fmtTime(start)}${end ? ` – ${fmtTime(end)}` : ""}` : "";
}

export function todayIndex(date = new Date()) {
  const day = date.getDay();
  return day === 0 ? -1 : day - 1;
}

export function nowMinutes(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

export function fmtDuration(mins) {
  if (mins == null || !Number.isFinite(mins)) return "";
  if (mins < 1) return "under a minute";
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h} hr${h === 1 ? "" : "s"}${m ? ` ${m} min` : ""}`;
}

/* ------------------------------------------------------------------ */
/* Timetable                                                           */
/* ------------------------------------------------------------------ */

export function lecturesForDay(section, day, subgroup = "") {
  if (!section) return [];
  const sub = String(subgroup || "").toUpperCase();
  return (section.lectures || [])
    .filter((lecture) => {
      if (lecture.day !== day) return false;
      if (!sub) return true;
      return !lecture.subsection || lecture.subsection === sub;
    })
    .sort((a, b) => a.period - b.period || String(a.subsection || "").localeCompare(String(b.subsection || "")));
}

export function classState(lecture, now = new Date()) {
  const start = toMinutes(lecture.start);
  const end = toMinutes(lecture.end) || (start != null ? start + 60 : null);
  const mins = nowMinutes(now);
  if (start == null || end == null) return "unknown";
  if (mins >= end) return "done";
  if (mins >= start) return "now";
  return "upcoming";
}

/**
 * The next class, looking forward through the week.
 * Returns { lecture, day, dayOffset, kind: "now" | "today" | "later", startsIn }.
 */
export function nextLecture(section, subgroup = "", now = new Date()) {
  if (!section) return null;
  const startIndex = todayIndex(now);
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const mins = nowMinutes(now);

  for (let offset = 0; offset <= 8; offset += 1) {
    const date = new Date(base.getTime() + offset * 86400000);
    const day = todayIndex(date);
    if (day < 0) continue; // Sunday
    const lectures = lecturesForDay(section, day, subgroup);
    for (const lecture of lectures) {
      const start = toMinutes(lecture.start);
      const end = toMinutes(lecture.end);
      if (start == null) continue;
      if (offset === 0) {
        if (mins >= (end ?? start + 60)) continue;
        if (mins >= start && mins < (end ?? start + 60)) {
          return {
            lecture,
            day,
            dayOffset: 0,
            kind: "now",
            startsIn: 0,
            endsIn: (end ?? start + 60) - mins,
          };
        }
        return { lecture, day, dayOffset: 0, kind: "today", startsIn: start - mins };
      }
      return {
        lecture,
        day,
        dayOffset: offset,
        kind: "later",
        startsIn: offset * 1440 + start - mins,
      };
    }
  }
  return null;
}

export function dayPlan(section, subgroup = "", now = new Date()) {
  const day = todayIndex(now);
  if (!section || day < 0) return { day, lectures: [], isOff: true };
  const lectures = lecturesForDay(section, day, subgroup).map((lecture) => ({
    ...lecture,
    state: classState(lecture, now),
  }));
  return { day, lectures, isOff: false };
}

export function uniqueSubjects(section, subgroup = "") {
  if (!section) return [];
  const sub = String(subgroup || "").toUpperCase();
  const map = new Map();
  for (const lecture of section.lectures || []) {
    if (sub && lecture.subsection && lecture.subsection !== sub) continue;
    const key = lecture.subject;
    if (!map.has(key)) {
      map.set(key, {
        subject: lecture.subject,
        teachers: new Set(),
        rooms: new Set(),
        hours: 0,
        lab: /[ .]P$|LAB/i.test(lecture.subject),
      });
    }
    const item = map.get(key);
    for (const teacher of lecture.teachers || [lecture.teacher].filter(Boolean)) item.teachers.add(teacher);
    if (lecture.room) item.rooms.add(lecture.room);
    item.hours += 1;
  }
  return [...map.values()]
    .map((item) => ({
      ...item,
      teachers: [...item.teachers],
      rooms: [...item.rooms],
    }))
    .sort((a, b) => b.hours - a.hours || a.subject.localeCompare(b.subject));
}

export function sectionSummary(section, subgroup = "") {
  if (!section) return null;
  const labs = (section.lectures || []).filter((l) => /[ .]P$|LAB/i.test(l.subject)).length;
  return {
    total: (section.lectures || []).length,
    labs,
    subjects: uniqueSubjects(section, subgroup).length,
    teachers: new Set((section.lectures || []).flatMap((l) => l.teachers || [])).size,
    rooms: new Set((section.lectures || []).map((l) => l.room).filter(Boolean)).size,
  };
}

/** Case-insensitive match of a section id or branch/popular name inside free text. */
export function matchSection(timetable, text) {
  if (!timetable || !text) return null;
  const upper = String(text).toUpperCase();
  const ids = (timetable.sections || [])
    .map((section) => section.id)
    .sort((a, b) => b.length - a.length);
  for (const id of ids) {
    const pattern = new RegExp(`(^|[^A-Z0-9])${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Z0-9]|$)`);
    if (pattern.test(upper)) return (timetable.sections || []).find((section) => section.id === id) || null;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Campus routing                                                      */
/* ------------------------------------------------------------------ */

function haversine(a, b) {
  if (!a || !b) return 0;
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function buildCampusGraph(campus) {
  if (!campus) return { nodes: new Map(), adjacency: new Map() };
  const nodes = new Map();
  for (const junction of campus.junctions || []) nodes.set(junction.id, { ...junction, kind: "junction" });
  for (const place of campus.places || []) {
    nodes.set(place.id, { ...place, kind: "place" });
  }
  const adjacency = new Map();
  const link = (a, b, weight, note, kind) => {
    if (!adjacency.has(a)) adjacency.set(a, []);
    if (!adjacency.has(b)) adjacency.set(b, []);
    adjacency.get(a).push({ to: b, weight, note, kind });
    adjacency.get(b).push({ to: a, weight, note, kind });
  };

  for (const place of campus.places || []) {
    if (!place.node) continue;
    const junction = nodes.get(place.node);
    if (!junction) continue;
    // Keep the place's real coordinates so routes can draw the final leg, and
    // give the connector a small non-zero length instead of collapsing every
    // place onto the same junction point.
    const metres = Math.max(18, Math.round(haversine(place, junction) * 1.12));
    link(place.id, place.node, metres, `Leave ${place.name}`, "place");
  }
  for (const edge of campus.edges || []) {
    const a = nodes.get(edge.a);
    const b = nodes.get(edge.b);
    if (!a || !b) continue;
    const metres = Math.round(haversine(a, b) * 1.12);
    link(edge.a, edge.b, metres, edge.note || "Continue along the campus path.", "path");
  }
  return { nodes, adjacency };
}

export function shortestRoute(campus, fromId, toId) {
  if (!campus || !fromId || !toId) return null;
  const { nodes, adjacency } = buildCampusGraph(campus);
  if (!nodes.has(fromId) || !nodes.has(toId)) return null;

  if (fromId === toId) {
    const place = nodes.get(fromId);
    return {
      from: place,
      to: place,
      metres: 0,
      minutes: 0,
      steps: [{ text: `You are already at ${place.name}.`, metres: 0 }],
      points: place.pos ? [place.pos] : [],
    };
  }

  const dist = new Map([[fromId, 0]]);
  const prev = new Map();
  const visited = new Set();
  const queue = [{ id: fromId, d: 0 }];

  while (queue.length) {
    queue.sort((a, b) => a.d - b.d);
    const current = queue.shift();
    if (!current || visited.has(current.id)) continue;
    visited.add(current.id);
    if (current.id === toId) break;
    for (const edge of adjacency.get(current.id) || []) {
      const next = current.d + edge.weight;
      if (next < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, next);
        prev.set(edge.to, { id: current.id, edge });
        queue.push({ id: edge.to, d: next });
      }
    }
  }

  if (!dist.has(toId)) return null;

  const chain = [];
  let cursor = toId;
  while (cursor && cursor !== fromId) {
    const step = prev.get(cursor);
    if (!step) break;
    chain.unshift({ node: nodes.get(cursor), edge: step.edge, from: step.id });
    cursor = step.id;
  }
  chain.unshift({ node: nodes.get(fromId), edge: null, from: null });

  const metres = Math.round(dist.get(toId) * 1.1);
  const minutes = Math.max(1, Math.round(metres / 78)); // ~4.7 km/h on foot
  const steps = [];
  for (let i = 0; i < chain.length; i += 1) {
    const item = chain[i];
    const node = item.node;
    if (!node) continue;
    const next = chain[i + 1];
    if (node.kind === "place" && i === 0) {
      steps.push({ text: `Start at ${node.name}.`, metres: 0 });
    }
    if (next) {
      const edge = next.edge;
      const target = next.node;
      if (target?.kind === "place") {
        steps.push({
          text: edge?.note && edge.note.startsWith("Leave") ? edge.note : `Arrive at ${target.name}.`,
          metres: edge?.weight || 0,
        });
      } else if (edge?.note) {
        steps.push({ text: edge.note, metres: edge.weight });
      }
    }
  }

  const points = [];
  for (const item of chain) {
    const pos = item.node?.pos;
    if (pos && (!points.length || points[points.length - 1][0] !== pos[0] || points[points.length - 1][1] !== pos[1])) {
      points.push(pos);
    }
  }

  return {
    from: nodes.get(fromId),
    to: nodes.get(toId),
    metres,
    minutes,
    steps: steps.filter((step, index, list) => index === 0 || step.text !== list[index - 1].text),
    points,
  };
}

export function matchPlacesInText(campus, text) {
  if (!campus || !text) return [];
  const hay = String(text).toLowerCase();
  const hits = [];
  for (const place of campus.places || []) {
    const names = [place.name, ...(place.aliases || [])]
      .map((name) => String(name).toLowerCase())
      .filter((name) => name.length >= 3)
      .sort((a, b) => b.length - a.length);
    for (const name of names) {
      const index = hay.indexOf(name);
      if (index >= 0) {
        hits.push({ place, index, length: name.length });
        break;
      }
    }
  }
  return hits.sort((a, b) => a.index - b.index || b.length - a.length).map((hit) => hit.place);
}

/* ------------------------------------------------------------------ */
/* Assistant — local, grounded, offline-first                          */
/* ------------------------------------------------------------------ */

const MONTHS = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3,
  may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7,
  september: 8, sep: 8, sept: 8, october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11,
};

const DAY_ALIASES = {
  monday: 0, mon: 0, somvar: 0, somwar: 0, somvaar: 0,
  tuesday: 1, tue: 1, tues: 1, mangalvar: 1, mangalwar: 1, mangalvaar: 1,
  wednesday: 2, wed: 2, budhvar: 2, budhwar: 2, budhvaar: 2,
  thursday: 3, thu: 3, thur: 3, thurs: 3, veervar: 3, veerwar: 3, guruvar: 3, guruwar: 3,
  friday: 4, fri: 4, shukravar: 4, shukrawar: 4, shukravaar: 4,
  saturday: 5, sat: 5, shanivar: 5, shaniwar: 5, shanivaar: 5,
  sunday: -1, sun: -1, ravivar: -1, raviwar: -1, itvar: -1, itwar: -1, etvar: -1,
};

/** Common Hinglish / Punjabi / shorthand words mapped to plain English. */
const LEXICON = {
  kitne: "how many", kitni: "how many", kitna: "how many", kine: "how many", kinni: "how many",
  kiney: "how many", kitney: "how many", total: "total",
  kaun: "who", kon: "who", koun: "who", kisne: "who", kina: "who",
  kaha: "where", kahan: "where", kithe: "where", kithay: "where", kithon: "from",
  kab: "when", kado: "when", kadon: "when", kaddo: "when",
  kya: "what", ki: "what", ke: "what", kiddan: "how", kiven: "how", kivein: "how", kaise: "how", kaisay: "how",
  hai: "is", haan: "yes", nahi: "no", nhi: "no", na: "",
  mujhe: "me", mera: "my", meri: "my", mere: "my", apna: "my", apni: "my", apne: "my",
  batao: "tell", bata: "tell", btao: "tell", bta: "tell", das: "tell", daso: "tell", dasso: "tell",
  chahiye: "want", chahida: "want", chaida: "want",
  aaj: "today", ajj: "today",
  kal: "tomorrow", kl: "tomorrow", kalh: "tomorrow",
  abhi: "now", hun: "now", hune: "now", ab: "now",
  subah: "morning", savere: "morning", dopahar: "afternoon", dupahar: "afternoon",
  shaam: "evening", sham: "evening", raat: "night",
  ghanta: "hour", ghante: "hour", ghantey: "hour",
  minute: "minute", minat: "minute", mint: "minute",
  dur: "distance", duri: "distance", doori: "distance", door: "distance",
  rasta: "route", raasta: "route", raste: "route", rastay: "route", raaste: "route",
  kamra: "room", kamre: "room", kamray: "room", kaksha: "room",
  adhyapak: "teacher", vidyarthi: "student", bachche: "student", bachay: "student",
  vishay: "subject", subject: "subject",
  chhutti: "holiday", chutti: "holiday", chhutiyan: "holiday", chhutiyan: "holiday",
  pariksha: "exam", imtihan: "exam", parikshya: "exam",
  likhai: "notes", notes: "notes",
  samay: "time", waqt: "time", velaa: "time", vela: "time",
  din: "day", vaar: "day", var: "day",
  mahina: "month", mahine: "month", saal: "year", sal: "year",
  khali: "free", vacant: "free", empty: "free", available: "free",
  bhara: "busy", occupied: "busy", busy: "busy",
  baje: "oclock", bajay: "oclock", vaje: "oclock", vajay: "oclock",
  kaunsa: "which", konsa: "which", kaunsi: "which", konsi: "which",
  pura: "full", poori: "full", sab: "all", sabhi: "all", saare: "all", sare: "all",
  karo: "", karna: "", karni: "", kare: "", karta: "", karti: "", karte: "",
  chalo: "go", chal: "go", jana: "go", jaana: "go",
  milega: "find", milegi: "find", milta: "find", milti: "find",
  dikhao: "show", dikha: "show", dekh: "show", dekho: "show",
  help: "help", madad: "help", sahayata: "help",
  pata: "know", malum: "know", maalum: "know",
  padhai: "study", padhayi: "study", parhai: "study",
  bethe: "sit", baith: "sit", baitha: "sit",
  wala: "", wali: "", walay: "", vala: "", vali: "", valay: "",
};

const FILLER = new Set(["please", "plz", "pls", "yaar", "bhai", "bro", "zara", "thoda", "ji", "ok", "okay", "so", "then", "bas", "just", "actually", "hey", "hlo", "yr", "yrr"]);

function norm(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘`´]/g, "'")
    .replace(/[^a-z0-9@:\s./+()*^%-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalQuestion(text) {
  let out = norm(text)
    .replace(/\btime\s*table\b/g, "timetable")
    .replace(/\bdate\s*sheet\b/g, "datesheet")
    .replace(/\bquestion\s*papers?\b/g, "paper")
    .replace(/\bprevious\s*(?:year|years|yr)\b/g, "previous")
    .replace(/\bpast\s*(?:year|years)\b/g, "previous")
    .replace(/\bhow\s+much\s+(?:far|distance)\b/g, "how far")
    .replace(/\bkitna\s+dur\b/g, "how far")
    .replace(/\bkitni\s+dur\b/g, "how far")
    .replace(/\bhow\s+many\s+students\b/g, "how many students")
    .replace(/\bnext\s+(?:class|lecture|period)\b/g, "next class")
    .replace(/\bclass\s+timetable\b/g, "timetable");
  out = out
    .split(/\s+/)
    .map((word) => (LEXICON[word] == null ? word : LEXICON[word]))
    .filter((word) => word && !FILLER.has(word))
    .join(" ");
  return out.replace(/\s+/g, " ").trim();
}

function escapeRe(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function has(text, phrase) {
  if (!phrase) return false;
  if (phrase.includes(" ")) return text.includes(phrase);
  return new RegExp(`\\b${escapeRe(phrase)}\\b`, "i").test(text);
}

function hasAny(text, list) {
  return list.some((word) => has(text, word));
}

function reply(text, { bullets = [], actions = [], cites = [], media = null, entities, kind = "" } = {}) {
  return {
    text,
    bullets: bullets.filter(Boolean),
    actions: actions.filter(Boolean),
    cites: cites.filter(Boolean),
    ...(media ? { media } : {}),
    ...(entities ? { entities } : {}),
    kind,
  };
}

function cite(label, to, url = "") {
  return url ? { label, url } : { label, to };
}

function teacherLabel(teacher) {
  return [teacher?.designation, teacher?.department].filter(Boolean).join(" · ") || "Faculty";
}

function sectionLink(section) {
  return `#/timetable/${encodeURIComponent(section.id)}`;
}

function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function humanDate(date) {
  return date.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/* ---------------------------- entities ---------------------------- */

function extractDate(text, now = new Date()) {
  let m = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  m = text.match(/\b(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{4}|\d{2}))?\b/);
  if (m) {
    const year = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : now.getFullYear();
    const d = new Date(year, Number(m[2]) - 1, Number(m[1]));
    if (!Number.isNaN(d.getTime()) && d.getDate() === Number(m[1])) return d;
  }
  const monthNames = Object.keys(MONTHS).join("|");
  m = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames})\\b(?:\\s*,?\\s*(20\\d{2}))?`, "i"));
  if (m) {
    const d = new Date(Number(m[3] || now.getFullYear()), MONTHS[m[2].toLowerCase()], Number(m[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  m = text.match(new RegExp(`\\b(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:\\s*,?\\s*(20\\d{2}))?`, "i"));
  if (m) {
    const d = new Date(Number(m[3] || now.getFullYear()), MONTHS[m[1].toLowerCase()], Number(m[2]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function extractTime(text) {
  let m = text.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/);
  if (m) {
    let hour = Number(m[1]);
    const minute = Number(m[2]);
    if (m[3] === "pm" && hour < 12) hour += 12;
    if (m[3] === "am" && hour === 12) hour = 0;
    if (!m[3] && hour >= 1 && hour <= 7) hour += 12;
    return hour * 60 + minute;
  }
  m = text.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/);
  if (m) {
    let hour = Number(m[1]);
    const minute = Number(m[2] || 0);
    if (m[3] === "pm" && hour < 12) hour += 12;
    if (m[3] === "am" && hour === 12) hour = 0;
    return hour * 60 + minute;
  }
  m = text.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(?:oclock)\b/);
  if (m) {
    let hour = Number(m[1]);
    const minute = Number(m[2] || 0);
    if (hour >= 1 && hour <= 7) hour += 12;
    return hour * 60 + minute;
  }
  if (/\bhalf past (\d{1,2})\b/.test(text)) {
    const hour = Number(text.match(/\bhalf past (\d{1,2})\b/)[1]);
    return (hour <= 7 ? hour + 12 : hour) * 60 + 30;
  }
  if (/\bquarter past (\d{1,2})\b/.test(text)) {
    const hour = Number(text.match(/\bquarter past (\d{1,2})\b/)[1]);
    return (hour <= 7 ? hour + 12 : hour) * 60 + 15;
  }
  return null;
}

function extractExplicitDay(text) {
  for (const [name, index] of Object.entries(DAY_ALIASES)) {
    if (has(text, name)) return index;
  }
  return null;
}

function extractYear(text) {
  let m = text.match(/\b([1-4])(?:st|nd|rd|th)?\s*(?:year|yr)\b/);
  if (m) return Number(m[1]);
  m = text.match(/\b(?:year|yr)\s*([1-4])\b/);
  if (m) return Number(m[1]);
  m = text.match(/\bd\s?([1-4])\b/);
  if (m) return Number(m[1]);
  const words = { first: 1, second: 2, third: 3, fourth: 4, final: 4, pehla: 1, pehli: 1, doosra: 2, doosri: 2, dusra: 2, teesra: 3, teesri: 3, chautha: 4, chauthi: 4 };
  m = text.match(/\b(first|second|third|fourth|final|pehla|pehli|doosra|doosri|dusra|teesra|teesri|chautha|chauthi)\s*(?:year|yr)\b/);
  if (m) return words[m[1]];
  return null;
}

function extractSemester(text) {
  let m = text.match(/\b([1-8])(?:st|nd|rd|th)?\s*(?:sem|semester)\b/);
  if (m) return Number(m[1]);
  m = text.match(/\b(?:sem|semester)\s*[-:]?\s*([1-8])\b/);
  if (m) return Number(m[1]);
  return null;
}

const BRANCH_ALIASES = [
  ["information technology", "IT"],
  ["computer science and engineering", "CS"],
  ["computer science & engineering", "CS"],
  ["computer science", "CS"],
  ["computer engineering", "CS"],
  ["artificial intelligence", "RAI"],
  ["machine learning", "RAI"],
  ["robotics", "RAI"],
  ["mechanical engineering", "ME"],
  ["mechanical", "ME"],
  ["production engineering", "ME"],
  ["civil engineering", "CE"],
  ["civil", "CE"],
  ["electrical engineering", "EE"],
  ["electrical", "EE"],
  ["electronics and communication", "EC"],
  ["electronics & communication", "EC"],
  ["electronics", "EC"],
  ["computer applications", "MCA"],
  ["business administration", "BBA"],
  ["management", "BBA"],
  ["commerce", "BCOM"],
  ["architecture", "BARCH"],
  ["vocational", "BVOC"],
];

function extractBranch(text) {
  for (const [phrase, code] of BRANCH_ALIASES) {
    if (has(text, phrase)) return code;
  }
  if (/\bcse\b/.test(text)) return "CS";
  if (/\bcs\b/.test(text) && !/\bcs\s+[a-f]\b/.test(text)) return "CS";
  if (/\bbtech\s+cse\b/.test(text)) return "CS";
  if (/\bmech\b/.test(text)) return "ME";
  if (/\bece\b/.test(text)) return "EC";
  if (/\bbca\b/.test(text)) return "BCA";
  if (/\bmca\b/.test(text)) return "MCA";
  if (/\bbcom\b/.test(text) || /\bb\.com\b/.test(text)) return "BCOM";
  if (/\bbba\b/.test(text)) return "BBA";
  if (/\bbarch\b/.test(text) || /\bb\.arch\b/.test(text)) return "BARCH";
  if (/\bbvoc\b/.test(text) || /\bb\.voc\b/.test(text)) return "BVOC";
  if (/\brai\b/.test(text)) return "RAI";
  if (/\b(?:it)\s+(?:dept|department|branch|section|student|teacher|faculty|timetable|year)\b/.test(text)) return "IT";
  if (text.trim() === "it") return "IT";
  if (/\b(?:me)\s+(?:dept|department|branch|section|student|teacher|faculty|timetable|year)\b/.test(text)) return "ME";
  if (/\b(?:ce)\s+(?:dept|department|branch|section)\b/.test(text)) return "CE";
  if (/\b(?:ee)\s+(?:dept|department|branch|section)\b/.test(text)) return "EE";
  if (/\b(?:ec|ece)\s+(?:dept|department|branch|section)\b/.test(text)) return "EC";
  return "";
}

function branchMatchesSection(section, code) {
  if (!code) return true;
  if (section.branch === code) return true;
  if (code === "CS" && /CS/.test(section.branch)) return true;
  if (code === "MCA" && section.branch === "MCA") return true;
  return false;
}

function extractGroup(text) {
  let m = text.match(/\b(?:group|section|sec)\s*[-:]?\s*([a-f])\b/);
  if (m) return m[1].toUpperCase();
  m = text.match(/\b([a-f])\s*(?:group|section|sec)\b/);
  if (m) return m[1].toUpperCase();
  m = text.match(/\b(?:cse|cs|it|me|ce|ee|ec|ece|rai|bca|mca|bba|bcom)\s*[-:]?\s*([a-f])\b/);
  if (m) return m[1].toUpperCase();
  return "";
}

/**
 * Resolve a question to timetable sections: explicit ids first, then
 * year + branch + group filters. Ambiguous results are returned as a list so
 * the UI can ask a follow-up instead of guessing.
 */
export function findSections(timetable, text) {
  const list = timetable?.sections || [];
  const original = String(text || "");
  if (!list.length) return [];
  const upper = original.toUpperCase();

  const direct = list.filter((section) => {
    if (section.id === "CSE" && !/\b(section|sec|group)\b/i.test(original)) return false;
    const pattern = new RegExp(`(^|[^A-Z0-9])${escapeRe(section.id)}([^A-Z0-9]|$)`);
    return pattern.test(upper);
  });
  if (direct.length) return direct;

  // "2 cse b", "cse 2 b" and "2nd year cse b" style shorthand.
  const branch = extractBranch(original.toLowerCase());
  let year = extractYear(original.toLowerCase());
  const group = extractGroup(original.toLowerCase());
  const semester = extractSemester(original.toLowerCase());
  if (!year && branch) {
    const shorthand = original.toLowerCase().match(
      /\b([1-4])\s*(?:year\s*)?(?:cse|cs|it|me|ce|ee|ec|ece|rai|bca|mca|bba|bcom)\b|\b(?:cse|cs|it|me|ce|ee|ec|ece|rai|bca|mca|bba|bcom)\s*([1-4])\s*[a-f]?\b/,
    );
    if (shorthand) year = Number(shorthand[1] || shorthand[2]);
  }
  if (!year && semester) year = Math.ceil(semester / 2);

  let pool = list;
  if (year) pool = pool.filter((section) => section.year === year);
  if (branch) pool = pool.filter((section) => branchMatchesSection(section, branch));
  if (group) {
    pool = pool.filter((section) => section.group === group || section.id.endsWith(group) || section.id.endsWith(`${group}`));
  }
  if (year || branch || group) return pool;
  return [];
}

function sectionListReply(sections, query, { timetableIntent = false } = {}) {
  const byYear = new Map();
  for (const section of sections) byYear.set(section.year, (byYear.get(section.year) || []).concat(section));
  const bullets = [];
  for (const [year, items] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
    bullets.push(`${year}${year === 1 ? "st" : year === 2 ? "nd" : year === 3 ? "rd" : "th"} year: ${items.map((s) => s.id).join(", ")}`);
  }
  return reply(`I found ${sections.length} matching section${sections.length === 1 ? "" : "s"} for “${query}”.`, {
    bullets: [...bullets, "Tell me the group (A/B/C…) or pick a section below."],
    actions: sections.slice(0, 8).map((section) => ({ label: section.id, to: sectionLink(section) })),
    cites: [cite("Published FET timetable", "#/timetable", "https://appsc.gndec.ac.in/time_tables")],
    kind: timetableIntent ? "timetable" : "sections",
  });
}

/* ------------------------- date / time helpers -------------------- */

function resolveWhen(canon, now) {
  const date = extractDate(canon, now);
  if (date) {
    return { date, day: todayIndex(date), explicit: true, label: humanDate(date) };
  }
  if (has(canon, "day after tomorrow")) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
    return { date: d, day: todayIndex(d), explicit: true, label: humanDate(d) };
  }
  if (has(canon, "tomorrow")) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return { date: d, day: todayIndex(d), explicit: true, label: humanDate(d) };
  }
  if (has(canon, "yesterday")) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    return { date: d, day: todayIndex(d), explicit: true, label: humanDate(d) };
  }
  if (has(canon, "today")) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { date: d, day: todayIndex(d), explicit: true, label: "today" };
  }
  const day = extractExplicitDay(canon);
  if (day != null) {
    return {
      day,
      date: null,
      explicit: true,
      label: day < 0 ? "Sunday" : DAY_NAMES[day],
    };
  }
  return { day: todayIndex(now), date: null, explicit: false, label: "today" };
}

function holidayOn(when, notices) {
  if (!when?.date) return null;
  const key = ymd(when.date);
  return (notices?.holidays || []).find((holiday) => holiday.date === key) || null;
}

function dayLabel(day) {
  return day < 0 ? "Sunday" : DAY_NAMES[day] || "day";
}

function minuteLabel(mins) {
  return fmtTime(fromMinutes(mins));
}

/* --------------------------- scheduling --------------------------- */

function lecturesOn(section, subgroup, day) {
  if (!section || day < 0) return [];
  return lecturesForDay(section, day, subgroup);
}

function sectionScheduleReply(section, subgroup, when, now, notices) {
  const holiday = holidayOn(when, notices);
  const heading = `${section.label}${subgroup ? ` · ${subgroup}` : ""} — ${when.label}`;
  if (when.day < 0) {
    return reply(`${heading}: Sunday, no scheduled classes.`, {
      bullets: ["The published timetable runs Monday to Saturday."],
      actions: [{ label: "Open timetable", to: sectionLink(section) }],
      cites: [cite(section.id, sectionLink(section))],
      entities: { section: section.id, subgroup },
      kind: "timetable",
    });
  }
  if (holiday) {
    return reply(`${heading}: ${holiday.name} (holiday).`, {
      bullets: [`Official holiday list marks ${holiday.displayDate || holiday.date} as ${holiday.category || "a holiday"}. No classes are expected.`],
      actions: [{ label: "Holiday list", to: "#/notices?tab=holidays" }],
      cites: [cite("Official holiday list", "#/notices?tab=holidays", "https://gndec.ac.in/?q=holidays")],
      entities: { section: section.id, subgroup },
      kind: "timetable",
    });
  }
  const lectures = lecturesOn(section, subgroup, when.day);
  if (!lectures.length) {
    return reply(`${heading}: no classes scheduled.`, {
      bullets: ["The published timetable has no lecture for this section on this day."],
      actions: [{ label: "Open timetable", to: sectionLink(section) }],
      cites: [cite(section.id, sectionLink(section))],
      entities: { section: section.id, subgroup },
      kind: "timetable",
    });
  }
  const sameDay = when.day === todayIndex(now) && (!when.date || ymd(when.date) === ymd(now));
  const bullets = lectures.map((lecture) => {
    const state = sameDay ? classState(lecture, now) : "upcoming";
    const status = state === "now" ? " · in progress" : state === "done" ? " · finished" : "";
    return `${fmtTime(lecture.start)}–${fmtTime(lecture.end)} · ${lecture.subject}${lecture.teacher ? ` · ${lecture.teacher}` : ""}${lecture.room ? ` · ${lecture.room}` : ""}${status}`;
  });
  const gaps = freePeriods(section, subgroup, when.day);
  if (gaps.length) bullets.push(`Free gaps: ${gaps.map((gap) => `${minuteLabel(gap.start)}–${minuteLabel(gap.end)}`).join(", ")}`);
  return reply(`${heading}: ${lectures.length} lecture${lectures.length === 1 ? "" : "s"}.`, {
    bullets,
    actions: [
      { label: "Open timetable", to: sectionLink(section) },
      { label: "Route to campus", to: "#/rasta" },
    ],
    cites: [cite(section.id, sectionLink(section))],
    entities: { section: section.id, subgroup },
    kind: "timetable",
  });
}

function freePeriods(section, subgroup, day) {
  if (!section || day < 0) return [];
  const lectures = lecturesOn(section, subgroup, day)
    .map((lecture) => ({ start: toMinutes(lecture.start), end: toMinutes(lecture.end) }))
    .filter((item) => item.start != null && item.end != null)
    .sort((a, b) => a.start - b.start);
  if (!lectures.length) return [];
  const gaps = [];
  const dayStart = 8 * 60 + 30;
  const dayEnd = 16 * 60 + 30;
  let cursor = dayStart;
  for (const lecture of lectures) {
    if (lecture.start > cursor) gaps.push({ start: cursor, end: lecture.start });
    cursor = Math.max(cursor, lecture.end);
  }
  if (cursor < dayEnd) gaps.push({ start: cursor, end: dayEnd });
  return gaps.filter((gap) => gap.end - gap.start >= 30);
}

function nextClassReply(next, section, subgroup) {
  if (!next) {
    return reply("I could not find an upcoming class for this section in the published timetable.", {
      bullets: ["The published timetable covers the current FET release; it may not include a later change."],
      actions: [{ label: "Open timetable", to: sectionLink(section) }],
      cites: [cite(section.id, sectionLink(section))],
      entities: { section: section.id, subgroup },
      kind: "next-class",
    });
  }
  const { lecture, kind, startsIn, dayOffset, endsIn } = next;
  const when =
    kind === "now"
      ? `Happening now, until ${fmtTime(lecture.end)} (${fmtDuration(endsIn)} left).`
      : kind === "today"
        ? `Starts in ${fmtDuration(startsIn)} at ${fmtTime(lecture.start)}.`
        : `${dayOffset === 1 ? "Tomorrow" : DAY_NAMES[next.day]} at ${fmtTime(lecture.start)}.`;
  return reply(`Your next class is ${lecture.subject}.`, {
    bullets: [
      when,
      `${fmtTime(lecture.start)}–${fmtTime(lecture.end)}${lecture.room ? ` · Room ${lecture.room}` : ""}${lecture.teacher ? ` · ${lecture.teacher}` : ""}`,
      `${section.label}${subgroup ? ` · ${subgroup}` : ""}`,
    ],
    actions: [
      { label: "Open timetable", to: sectionLink(section) },
      lecture.room ? { label: `Find ${lecture.room}`, to: `#/rasta/room/${encodeURIComponent(slugifyRoom(lecture.room))}` } : null,
    ],
    cites: [cite(section.id, sectionLink(section))],
    entities: { section: section.id, subgroup, room: lecture.room || "" },
    kind: "next-class",
  });
}

function slugifyRoom(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/* ---------------------------- occupancy --------------------------- */

function normRoom(name) {
  return String(name || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function overlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function roomLectures(timetable, roomName, day = null) {
  const target = normRoom(roomName);
  const items = [];
  for (const section of timetable?.sections || []) {
    for (const lecture of section.lectures || []) {
      if (normRoom(lecture.room) !== target) continue;
      if (day != null && lecture.day !== day) continue;
      items.push({ section: section.id, ...lecture });
    }
  }
  return items.sort((a, b) => a.day - b.day || a.period - b.period);
}

function freeRoomsAt(timetable, rooms, day, start, end) {
  const busy = new Set();
  for (const section of timetable?.sections || []) {
    for (const lecture of section.lectures || []) {
      if (lecture.day !== day) continue;
      const lectureStart = toMinutes(lecture.start);
      const lectureEnd = toMinutes(lecture.end) || (lectureStart != null ? lectureStart + 60 : null);
      if (lectureStart == null || lectureEnd == null) continue;
      if (overlap(start, end, lectureStart, lectureEnd)) busy.add(normRoom(lecture.room));
    }
  }
  return (rooms?.rooms || []).filter((room) => {
    if (!room.name || room.name === "---") return false;
    return !busy.has(normRoom(room.name));
  });
}

function roomIsFree(timetable, roomName, day, start, end) {
  const lectures = roomLectures(timetable, roomName, day);
  return !lectures.some((lecture) => {
    const lectureStart = toMinutes(lecture.start);
    const lectureEnd = toMinutes(lecture.end) || (lectureStart != null ? lectureStart + 60 : null);
    return lectureStart != null && lectureEnd != null && overlap(start, end, lectureStart, lectureEnd);
  });
}

function freeRoomsReply(timetable, rooms, when, start, end, now) {
  const day = when.day;
  const wholeDay = start == null;
  const list = wholeDay
    ? (rooms?.rooms || []).filter((room) => room.name !== "---" && roomLectures(timetable, room.name, day).length === 0)
    : freeRoomsAt(timetable, rooms, day, start, end);
  const label = wholeDay ? `all of ${when.label}` : `${when.label} at ${minuteLabel(start)}`;
  if (day < 0) {
    return reply("Sunday — the whole campus is free.", {
      bullets: ["No scheduled lectures are published for Sunday."],
      actions: [{ label: "Campus map", to: "#/rasta" }],
      kind: "free-rooms",
    });
  }
  if (!list.length) {
    return reply(`No free room found for ${label}.`, {
      bullets: ["Every published room is occupied in that slot, or the room list does not cover it."],
      actions: [{ label: "Open timetable", to: "#/timetable" }],
      kind: "free-rooms",
    });
  }
  const withBlocks = list.slice(0, 18).map((room) => `${room.name}${room.place ? ` · ${room.place.replace(/-/g, " ")}` : ""}`);
  return reply(`${list.length} room${list.length === 1 ? " is" : "s are"} free for ${label}.`, {
    bullets: [
      ...withBlocks,
      list.length > 18 ? `…and ${list.length - 18} more.` : "",
      "Free means no lecture from the published timetable. Labs and offices may still be in use.",
    ],
    actions: [{ label: "Campus map", to: "#/rasta" }],
    cites: [cite("Published room timetable", "#/timetable", "https://appsc.gndec.ac.in/time_tables")],
    kind: "free-rooms",
  });
}

function freePeriodsReply(section, subgroup, when, now) {
  if (!section) {
    return reply("Tell me your section and I can find your free periods.", {
      actions: [{ label: "Set my section", to: "#/settings" }],
      kind: "free-period",
    });
  }
  if (when.day < 0) return reply("Sunday — no classes, the whole day is free.", { kind: "free-period" });
  const gaps = freePeriods(section, subgroup, when.day);
  if (!gaps.length) return reply(`${section.label}${subgroup ? ` · ${subgroup}` : ""} has no free gap of 30 minutes or more on ${when.label}.`, {
    bullets: ["Back-to-back lectures are common on lab days."],
    actions: [{ label: "Open timetable", to: sectionLink(section) }],
    entities: { section: section.id, subgroup },
    kind: "free-period",
  });
  return reply(`${section.label}${subgroup ? ` · ${subgroup}` : ""} — free gaps on ${when.label}:`, {
    bullets: gaps.map((gap) => `${minuteLabel(gap.start)}–${minuteLabel(gap.end)} (${fmtDuration(gap.end - gap.start)})`),
    actions: [{ label: "Open timetable", to: sectionLink(section) }, { label: "Free rooms", to: "#/rasta" }],
    cites: [cite(section.id, sectionLink(section))],
    entities: { section: section.id, subgroup },
    kind: "free-period",
  });
}

function roomTimetableReply(timetable, roomName, when) {
  const day = when.day;
  const lectures = roomLectures(timetable, roomName, day);
  if (!lectures.length) {
    return reply(`${roomName} has no scheduled lecture on ${when.label}.`, {
      bullets: ["If you expected a class, check the official FET release; changes are not always mirrored here."],
      actions: [{ label: "Open timetable", to: "#/timetable" }],
      kind: "room-timetable",
    });
  }
  return reply(`${roomName} — ${lectures.length} lecture${lectures.length === 1 ? "" : "s"} on ${when.label}:`, {
    bullets: lectures.map((lecture) => `${fmtTime(lecture.start)}–${fmtTime(lecture.end)} · ${lecture.section} · ${lecture.subject}${lecture.teacher ? ` · ${lecture.teacher}` : ""}`),
    actions: [{ label: "Room on map", to: "#/rasta" }],
    cites: [cite("Published room timetable", "#/timetable", "https://appsc.gndec.ac.in/time_tables")],
    kind: "room-timetable",
  });
}

/* ----------------------------- people ----------------------------- */

const NAME_TITLES = new Set(["dr", "er", "mr", "mrs", "ms", "miss", "prof", "professor", "pf", "shri", "smt", "sh"]);
const NAME_INTENT_WORDS = new Set([
  "who", "is", "teaches", "teach", "the", "subject", "teacher", "faculty", "professor", "of", "for",
  "find", "profile", "email", "phone", "contact", "details", "detail", "sir", "mam", "madam", "about",
  "tell", "me", "what", "where", "when", "does", "do", "hod", "head", "department", "cabin", "room",
]);

function nameTokens(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word && !NAME_TITLES.has(word) && !NAME_INTENT_WORDS.has(word));
}

function sameNameToken(a, b) {
  if (a === b) return true;
  const shortest = Math.min(a.length, b.length);
  return shortest >= 4 && (a.startsWith(b) || b.startsWith(a));
}

function nameScore(queryTokens, personName) {
  const personTokens = nameTokens(personName);
  if (!queryTokens.length || !personTokens.length) return 0;
  let hits = 0;
  for (const word of queryTokens) {
    if (personTokens.some((token) => sameNameToken(word, token))) hits += 1;
  }
  if (!hits) return 0;
  const coverage = hits / personTokens.length;
  return hits * 10 + coverage * 5;
}

function bestPersonMatch(queryTokens, people) {
  const scored = [];
  for (const item of people) {
    const score = nameScore(queryTokens, item.name);
    if (score) scored.push({ item, score });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const personTokens = nameTokens(best.item.name);
  const hits = queryTokens.filter((word) => personTokens.some((token) => sameNameToken(word, token)));
  if (hits.length < 2) {
    const uniqueSurname =
      hits.length === 1 &&
      hits[0].length >= 5 &&
      scored.filter((entry) => nameTokens(entry.item.name).some((token) => sameNameToken(hits[0], token))).length === 1;
    if (!uniqueSurname) return null;
  }
  return best;
}

export function findTeacherByName(teachers, query) {
  const tokens = nameTokens(canonicalQuestion(query));
  if (!tokens.length) return null;
  return bestPersonMatch(tokens, teachers || [])?.item || null;
}

function findPerson(query, teachers = [], roles = []) {
  const queryTokens = nameTokens(canonicalQuestion(query));
  if (!queryTokens.length) return null;
  const teacherMatch = bestPersonMatch(queryTokens, teachers);
  const roleMatch = bestPersonMatch(queryTokens, roles);
  if (!teacherMatch && !roleMatch) return null;
  let role = roleMatch?.item || null;
  if (teacherMatch && roleMatch && roleMatch.score < teacherMatch.score - 8) role = null;
  return { teacher: teacherMatch?.item || null, role };
}

const DEPT_ALIASES = {
  it: "information technology",
  cse: "computer science",
  cs: "computer science",
  ce: "civil engineering",
  civil: "civil engineering",
  ee: "electrical engineering",
  electrical: "electrical engineering",
  ece: "electronics",
  ec: "electronics",
  electronics: "electronics",
  me: "mechanical",
  mechanical: "mechanical",
  mba: "business administration",
  mca: "computer applications",
  rai: "artificial intelligence",
  bba: "business administration",
};

function roleForQuery(lower, contacts) {
  const roles = contacts?.roles || [];
  const wantsPrincipal = /\bprincipal\b/.test(lower);
  const wantsHod = /\b(hod|head of department|head of the department|head)\b/.test(lower);
  const wantsDean = /\bdean\b/.test(lower);
  const wantsWarden = /\b(warden|hostel)\b/.test(lower);
  if (wantsPrincipal) return roles.find((role) => /principal/i.test(role.role)) || null;
  if (wantsWarden) return roles.find((role) => /warden/i.test(role.role)) || null;
  if (wantsHod || wantsDean) {
    const words = String(lower)
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((word) => word && !["hod", "head", "department", "dean", "of", "the", "who", "is", "a", "an", "and", "ka", "ki", "ke"].includes(word))
      .map((word) => DEPT_ALIASES[word] || word);
    if (!words.length) return null;
    return (
      roles.find((role) => {
        const hay = `${role.role} ${role.name}`.toLowerCase();
        return words.some((word) => hay.includes(word));
      }) || null
    );
  }
  return null;
}

function contactReply(role, teacher = null) {
  const phone = role?.landline || role?.phone;
  const bullets = [];
  if (role) {
    if (phone) bullets.push(`Phone: ${phone}`);
    if (role.email) bullets.push(`Email: ${role.email}`);
    if (role.office) bullets.push(`Office: ${role.office}`);
    if (role.contactScope) bullets.push(role.contactScope);
    if (role.conflict) bullets.push(`Note: ${role.conflict}`);
  }
  if (teacher) {
    if (teacher.department) bullets.push(`Department: ${teacher.department}`);
    if (teacher.teaches) {
      bullets.push(`Teaching load: ${teacher.hoursPerWeek} hours/week`);
      if (teacher.subjects?.length) bullets.push(`Subjects: ${teacher.subjects.slice(0, 6).join(", ")}`);
      if (teacher.rooms?.length) bullets.push(`Usually in: ${teacher.rooms.slice(0, 6).join(", ")}`);
    }
    if (teacher.email && teacher.email !== role?.email) bullets.push(`Email: ${teacher.email}`);
  }
  const title = teacher?.name || role?.name || "Administration";
  const sub = role && teacher ? `${teacherLabel(teacher)} · ${role.role}` : role ? role.role : teacherLabel(teacher);
  return reply(`${title} — ${sub}`, {
    bullets,
    actions: [
      teacher ? { label: "Open profile", to: `#/people/teacher/${encodeURIComponent(teacher.id)}` } : null,
      { label: "All contacts", to: "#/people?tab=contacts" },
    ],
    cites: [
      teacher ? cite(teacher.name, `#/people/teacher/${encodeURIComponent(teacher.id)}`) : null,
      role ? cite("Administration contacts", "#/people?tab=contacts", role.source || contactsSource(role)) : null,
    ],
    entities: teacher ? { teacher: teacher.name } : {},
    kind: "contact",
  });
}

function contactsSource(role) {
  return role?.source || "https://gndec.ac.in/?q=node/6";
}

function teacherReply(teacher, role = null) {
  if (role) return contactReply(role, teacher);
  const bullets = [];
  if (teacher.designation) bullets.push(teacher.designation);
  if (teacher.department) bullets.push(`Department: ${teacher.department}`);
  if (teacher.email) bullets.push(`Email: ${teacher.email}`);
  if (teacher.experience) bullets.push(`Experience: ${teacher.experience}`);
  if (teacher.teaches) {
    bullets.push(`Teaching load: ${teacher.hoursPerWeek} hours/week`);
    if (teacher.subjects?.length) bullets.push(`Subjects: ${teacher.subjects.slice(0, 6).join(", ")}`);
    if (teacher.sections?.length) bullets.push(`Sections: ${teacher.sections.slice(0, 10).join(", ")}`);
    if (teacher.rooms?.length) bullets.push(`Usually in: ${teacher.rooms.slice(0, 6).join(", ")}`);
  }
  if (teacher.researchInterests) bullets.push(`Research: ${String(teacher.researchInterests).slice(0, 220)}`);
  return reply(`${teacher.name} — ${teacherLabel(teacher)}`, {
    bullets,
    actions: [
      { label: "Open profile", to: `#/people/teacher/${encodeURIComponent(teacher.id)}` },
      teacher.email ? { label: "Send email", url: `mailto:${teacher.email}` } : null,
      teacher.teaches ? { label: "Teacher timetable", to: `#/people/teacher/${encodeURIComponent(teacher.id)}` } : null,
    ].filter(Boolean),
    cites: [cite(teacher.name, `#/people/teacher/${encodeURIComponent(teacher.id)}`)],
    entities: { teacher: teacher.name },
    kind: "teacher",
  });
}

function teacherTimetableReply(teacher, when, now) {
  const all = teacher.lectures || [];
  const lectures = when.explicit && when.day >= 0 ? all.filter((lecture) => lecture.day === when.day) : all;
  const heading = when.explicit ? `${teacher.name} — ${when.label}` : `${teacher.name} — weekly timetable`;
  if (!lectures.length) {
    return reply(`${heading}: no scheduled lecture.`, {
      bullets: [
        "The timetable may still list this teacher for a different day or group.",
        teacher.teaches ? `Overall load: ${teacher.hoursPerWeek} hours/week across ${(teacher.sections || []).length} group${(teacher.sections || []).length === 1 ? "" : "s"}.` : "",
      ],
      actions: [{ label: "Open profile", to: `#/people/teacher/${encodeURIComponent(teacher.id)}` }],
      cites: [cite(teacher.name, `#/people/teacher/${encodeURIComponent(teacher.id)}`)],
      entities: { teacher: teacher.name },
      kind: "teacher-timetable",
    });
  }
  const sorted = [...lectures].sort((a, b) => a.day - b.day || toMinutes(a.start) - toMinutes(b.start));
  const bullets = when.explicit
    ? sorted.map((lecture) => `${fmtTime(lecture.start)}–${fmtTime(lecture.end)} · ${lecture.group} · ${lecture.subject}${lecture.room ? ` · ${lecture.room}` : ""}`)
    : sorted.map((lecture) => `${DAY_SHORT[lecture.day] || "—"} ${fmtTime(lecture.start)}–${fmtTime(lecture.end)} · ${lecture.group} · ${lecture.subject}${lecture.room ? ` · ${lecture.room}` : ""}`);
  return reply(`${heading}: ${sorted.length} lecture${sorted.length === 1 ? "" : "s"}.`, {
    bullets: bullets.slice(0, 18),
    actions: [
      { label: "Open profile", to: `#/people/teacher/${encodeURIComponent(teacher.id)}` },
      ...(teacher.rooms || []).slice(0, 3).map((room) => ({ label: `Room ${room}`, to: "#/rasta" })),
    ],
    cites: [cite(teacher.name, `#/people/teacher/${encodeURIComponent(teacher.id)}`)],
    entities: { teacher: teacher.name },
    kind: "teacher-timetable",
  });
}

function teacherNowReply(teacher, now) {
  const day = todayIndex(now);
  const mins = nowMinutes(now);
  if (day < 0) return reply(`${teacher.name} — Sunday, no scheduled lecture.`, { entities: { teacher: teacher.name }, kind: "teacher-now" });
  const current = (teacher.lectures || []).find((lecture) => {
    if (lecture.day !== day) return false;
    const start = toMinutes(lecture.start);
    const end = toMinutes(lecture.end) || (start != null ? start + 60 : null);
    return start != null && end != null && mins >= start && mins < end;
  });
  if (current) {
    return reply(`${teacher.name} is teaching right now.`, {
      bullets: [
        `${fmtTime(current.start)}–${fmtTime(current.end)} · ${current.group} · ${current.subject}`,
        current.room ? `Room: ${current.room}` : "Room not published for this lecture.",
      ],
      actions: [{ label: "Open profile", to: `#/people/teacher/${encodeURIComponent(teacher.id)}` }],
      cites: [cite(teacher.name, `#/people/teacher/${encodeURIComponent(teacher.id)}`)],
      entities: { teacher: teacher.name, room: current.room || "" },
      kind: "teacher-now",
    });
  }
  const next = (teacher.lectures || [])
    .filter((lecture) => lecture.day === day && (toMinutes(lecture.start) ?? 0) > mins)
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start))[0];
  return reply(`${teacher.name} has no lecture in progress.`, {
    bullets: next ? [`Next today: ${fmtTime(next.start)} · ${next.group} · ${next.subject}${next.room ? ` · ${next.room}` : ""}`] : ["No further lecture listed today."],
    actions: [{ label: "Open profile", to: `#/people/teacher/${encodeURIComponent(teacher.id)}` }],
    cites: [cite(teacher.name, `#/people/teacher/${encodeURIComponent(teacher.id)}`)],
    entities: { teacher: teacher.name },
    kind: "teacher-now",
  });
}

/* ----------------------------- rooms ------------------------------ */

function findRoom(rooms, text) {
  const original = String(text || "").toUpperCase();
  const codes = [...original.matchAll(/\b([FSG])\s*-?\s*(\d{2,3})\b/g)].map((m) => `${m[1]}${m[2]}`);
  const automobile = [...original.matchAll(/\bA\s*-?\s*([69])\b/g)].map((m) => `A${m[1]}`);
  const wanted = [...codes, ...automobile];
  if (!wanted.length && /\bworkshop/i.test(original)) return { name: "WORKSHOPS", place: "workshops" };
  for (const code of wanted) {
    const match = (rooms?.rooms || []).find((room) => normRoom(room.name).startsWith(code));
    if (match) return match;
  }
  return null;
}

function roomReply(room, place, campus, extra = {}) {
  const bullets = [];
  if (place) {
    bullets.push(`Block: ${place.name}`);
    if (place.description) bullets.push(place.description);
  }
  if (room) {
    if (room.floor != null) bullets.push(`Floor: ${room.floor === 0 ? "ground" : room.floor}`);
    bullets.push(`${room.lecturesPerWeek} scheduled lecture${room.lecturesPerWeek === 1 ? "" : "s"} per week.`);
    if (room.sections?.length) bullets.push(`Used by: ${room.sections.join(", ")}`);
  }
  if (!place) {
    bullets.push("This room is in the timetable, but its block is not published. You can map it in the admin console.");
  }
  return reply(room ? `${room.name}` : "Room location", {
    bullets,
    actions: [
      place ? { label: "Show on map", to: `#/rasta/place/${place.id}` } : { label: "Open Rasta", to: "#/rasta" },
      place ? { label: "Route from main gate", to: `#/rasta?from=main-gate&to=${place.id}` } : null,
    ],
    cites: place ? [cite(place.name, `#/rasta/place/${place.id}`)] : [],
    media: place?.photo ? { src: place.photo, credit: place.photoCredit || "" } : room?.photo ? { src: room.photo, credit: room.photoCredit || "" } : null,
    entities: { room: room?.name || "", place: place?.id || "" },
    kind: "room",
    ...extra,
  });
}

/* ----------------------------- routes ----------------------------- */

function routeReply(route, { fromLabel = "", media = null } = {}) {
  if (!route) return null;
  return reply(`${route.from.name} → ${route.to.name}`, {
    bullets: [
      `About ${route.metres} m, roughly ${route.minutes} min on foot.`,
      ...route.steps.slice(1, 7).map((step) => step.text),
    ],
    actions: [
      { label: "Open route on map", to: `#/rasta?from=${route.from.id}&to=${route.to.id}` },
      { label: `Open ${route.to.name}`, to: `#/rasta/place/${route.to.id}` },
    ],
    cites: [cite(route.to.name, `#/rasta/place/${route.to.id}`)],
    media,
    entities: { place: route.to.id, from: route.from.id },
    kind: "route",
  });
}

function nearestGateReply(campus, place) {
  const gates = (campus?.places || []).filter((item) => item.category === "gate");
  let best = null;
  for (const gate of gates) {
    const route = shortestRoute(campus, gate.id, place.id);
    if (route && (!best || route.metres < best.route.metres)) best = { gate, route };
  }
  if (!best) return null;
  return reply(`The nearest gate to ${place.name} is ${best.gate.name}.`, {
    bullets: [`About ${best.route.metres} m, roughly ${best.route.minutes} min on foot.`, ...best.route.steps.slice(1, 5).map((step) => step.text)],
    actions: [{ label: "Show route on map", to: `#/rasta?from=${best.gate.id}&to=${place.id}` }],
    cites: [cite(best.gate.name, `#/rasta/place/${best.gate.id}`)],
    entities: { place: place.id, from: best.gate.id },
    kind: "route",
  });
}

/* ----------------------------- papers ----------------------------- */

function paperCodeFromText(text) {
  const m = String(text).match(/\b([A-Z]{2,7})[\s-]?(\d{3,4})\b/i);
  if (!m) return "";
  return `${m[1].toUpperCase()}-${m[2]}`;
}

function findPapers(papers, canon, original) {
  const code = paperCodeFromText(original) || paperCodeFromText(canon.toUpperCase());
  if (code) {
    const exact = (papers || []).filter((paper) => String(paper.code).toUpperCase() === code);
    if (exact.length) return { code, matches: exact, kind: "code" };
    const prefix = code.split("-")[0];
    const loose = (papers || []).filter((paper) => String(paper.code).toUpperCase().startsWith(prefix));
    return { code, matches: loose, kind: "prefix" };
  }
  const stop = new Set(["paper", "papers", "previous", "year", "question", "find", "show", "for", "of", "the", "please", "exam", "old", "pyq", "download", "link"]);
  const words = canon.split(/\s+/).filter((word) => word.length >= 2 && !stop.has(word));
  if (!words.length) return { code: "", matches: [], kind: "none" };
  const scored = [];
  for (const paper of papers || []) {
    const hay = `${paper.code} ${paper.title} ${paper.department}`.toLowerCase();
    const hits = words.filter((word) => hay.includes(word)).length;
    if (hits) scored.push({ paper, hits, coverage: hits / words.length });
  }
  scored.sort((a, b) => b.hits - a.hits || b.coverage - a.coverage);
  const best = scored[0];
  const matches = best ? scored.filter((item) => item.hits >= Math.max(1, best.hits - 1)).map((item) => item.paper) : [];
  return { code: "", matches, kind: "text" };
}

function papersReply(result, query) {
  const { code, matches } = result;
  if (!matches.length) {
    return reply(`I could not find a previous-year paper matching “${query}”.`, {
      bullets: [
        "The shared archive covers 2013–2025, but not every subject is uploaded.",
        "Papers are indexed by subject code (for example BTCS-304), not by full subject name.",
      ],
      actions: [{ label: "Browse papers", to: "#/study?tab=papers" }],
      cites: [cite("Shared paper archive", "#/study?tab=papers")],
      kind: "papers",
    });
  }
  const grouped = new Map();
  for (const paper of matches) {
    const key = paper.code || "Uncoded";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(paper);
  }
  const bullets = [];
  for (const [groupCode, items] of [...grouped.entries()].slice(0, 8)) {
    const sessions = items.length;
    const latest = [...items].sort((a, b) => String(b.session).localeCompare(String(a.session)))[0];
    bullets.push(`${groupCode} · ${sessions} paper${sessions === 1 ? "" : "s"} · latest ${latest?.session || ""}`);
  }
  return reply(
    code
      ? `${matches.length} paper${matches.length === 1 ? "" : "s"} found for ${code}.`
      : `${matches.length} paper${matches.length === 1 ? "" : "s"} matched “${query}”.`,
    {
      bullets: [...bullets, "Open the paper archive for the PDF links per session."],
      actions: [{ label: "Open papers", to: `#/study?tab=papers&q=${encodeURIComponent(code || query)}` }],
      cites: [cite("Shared paper archive", `#/study?tab=papers&q=${encodeURIComponent(code || query)}`)],
      kind: "papers",
    },
  );
}

function syllabusReply(docs, query, branchName, semester) {
  if (!docs.length) {
    return reply(`No syllabus document matched “${query}”.`, {
      bullets: [
        "First-year (Sem 1–2) syllabi are complete. Branch-wise documents exist for several schemes, but older or 4th-year documents are not all published.",
        branchName ? `${branchName} is not covered by a separate document in the public list.` : "",
      ],
      actions: [{ label: "Open syllabus library", to: "#/study?tab=syllabus" }],
      kind: "syllabus",
    });
  }
  return reply(`Syllabus document${docs.length === 1 ? "" : "s"} for “${query}”:`, {
    bullets: docs.slice(0, 7).map((doc) => `${doc.title} · ${doc.branchName} · ${doc.semester}${doc.scheme ? ` · ${doc.scheme} scheme` : ""}`),
    actions: [
      { label: "Open syllabus library", to: `#/study?tab=syllabus&q=${encodeURIComponent(query)}` },
      { label: "Read first year", to: "#/study?tab=first-year" },
    ],
    cites: docs.slice(0, 3).map((doc) => cite(doc.title.slice(0, 46), `#/study?tab=syllabus&q=${encodeURIComponent(doc.title)}`, doc.url)),
    kind: "syllabus",
  });
}

/* ------------------------------ math ------------------------------ */

function evaluateExpression(input) {
  const source = String(input || "")
    .toLowerCase()
    .replace(/\bplus\b/g, "+")
    .replace(/\bminus\b/g, "-")
    .replace(/\b(?:times|multiplied by|multiply by|x)\b/g, "*")
    .replace(/\b(?:divided by|divide by|over)\b/g, "/")
    .replace(/\bpower(?: of)?\b/g, "^")
    .replace(/\bsquare root of\b/g, "sqrt")
    .replace(/\broot\b/g, "sqrt")
    .replace(/%/g, " percent ")
    .replace(/,/g, "")
    .trim();

  const percentOf = source.match(/(\d+(?:\.\d+)?)\s*percent\s*(?:of)\s*(\d+(?:\.\d+)?)/);
  if (percentOf) {
    const value = (Number(percentOf[1]) / 100) * Number(percentOf[2]);
    return Number(value.toFixed(6));
  }

  const tokens = source.match(/sqrt|\d+(?:\.\d+)?|[()+\-*/^]/g);
  if (!tokens || !tokens.length) return null;
  let index = 0;

  function parsePrimary() {
    const token = tokens[index];
    if (token === "(") {
      index += 1;
      const value = parseExpression();
      if (tokens[index] === ")") index += 1;
      return value;
    }
    if (token === "-") {
      index += 1;
      return -parsePrimary();
    }
    if (token === "+") {
      index += 1;
      return parsePrimary();
    }
    if (token === "sqrt") {
      index += 1;
      return Math.sqrt(parsePrimary());
    }
    const value = Number(token);
    index += 1;
    return Number.isFinite(value) ? value : NaN;
  }

  function parsePower() {
    const base = parsePrimary();
    if (tokens[index] === "^") {
      index += 1;
      return base ** parsePower();
    }
    return base;
  }

  function parseTerm() {
    let value = parsePower();
    while (tokens[index] === "*" || tokens[index] === "/") {
      const operator = tokens[index];
      index += 1;
      const next = parsePower();
      value = operator === "*" ? value * next : value / next;
    }
    return value;
  }

  function parseExpression() {
    let value = parseTerm();
    while (tokens[index] === "+" || tokens[index] === "-") {
      const operator = tokens[index];
      index += 1;
      const next = parseTerm();
      value = operator === "+" ? value + next : value - next;
    }
    return value;
  }

  const result = parseExpression();
  if (index !== tokens.length || !Number.isFinite(result)) return null;
  return Number(result.toFixed(6));
}

/* ---------------------------- counting ---------------------------- */

function countReply(canon, ctx) {
  const { timetable, teachers, students, papers, notices, rooms, campus } = ctx;
  const wantsStudents = /\b(student|students|bachche|bachay|vidyarthi)\b/.test(canon);
  const wantsTeachers = /\b(teacher|teachers|faculty|professor|professors|staff)\b/.test(canon);
  const wantsSections = /\b(section|sections|group|groups|class|classes)\b/.test(canon);
  const wantsRooms = /\b(room|rooms|classroom|classrooms|lab|labs)\b/.test(canon);
  const wantsPapers = /\b(paper|papers)\b/.test(canon);
  const wantsNotices = /\b(notice|notices)\b/.test(canon);
  const wantsHolidays = /\b(holiday|holidays|chhutti)\b/.test(canon);
  const wantsBranches = /\b(branch|branches|department|departments|dept)\b/.test(canon);
  const sections = findSections(timetable, canon);
  const branch = extractBranch(canon);
  const year = extractYear(canon);

  if (wantsBranches && !wantsStudents && !wantsTeachers) {
    const branches = [...new Set((timetable?.sections || []).map((section) => section.branch))].sort();
    return reply(`${branches.length} branches have timetable data.`, {
      bullets: branches.map((code) => {
        const items = (timetable?.sections || []).filter((section) => section.branch === code);
        return `${code} — ${items.length} section${items.length === 1 ? "" : "s"}`;
      }),
      actions: [{ label: "Open timetable", to: "#/timetable" }],
      kind: "count",
    });
  }

  if (wantsStudents) {
    let pool = [...(students || [])];
    if (sections.length) {
      const ids = new Set(sections.map((section) => section.id));
      pool = pool.filter((student) => ids.has(student.section) || ids.has(student.group) || [...ids].some((id) => String(student.subgroup || "").startsWith(id)));
    }
    if (branch) pool = pool.filter((student) => student.branch === branch);
    if (year) pool = pool.filter((student) => student.year === year);
    const mentorMatch = bestPersonMatch(nameTokens(canon), (students || []).map((student) => ({ name: student.mentor, student })));
    if (mentorMatch && /\bmentor\b/.test(canon)) {
      const mentorName = mentorMatch.item.name;
      const mentored = (students || []).filter((student) => student.mentor === mentorName);
      return reply(`${mentored.length} students are listed under mentor ${mentorName}.`, {
        bullets: [
          ...mentored.slice(0, 8).map((student) => `${student.name} · ${student.crn} · ${student.branch} ${student.section}`),
          mentored.length > 8 ? `…and ${mentored.length - 8} more.` : "",
        ],
        actions: [{ label: "Search students", to: "#/people?tab=students" }],
        cites: [cite("Official student rosters", "#/people?tab=students")],
        entities: { mentor: mentorName },
        kind: "count",
      });
    }
    const label = sections.length ? sections.map((section) => section.id).join(", ") : branch || "all branches";
    const bullets = [`${pool.length} student record${pool.length === 1 ? "" : "s"} match ${label}${year ? ` · year ${year}` : ""}.`];
    if (sections.length && pool.length) {
      for (const section of sections.slice(0, 8)) {
        const count = pool.filter((student) => student.section === section.id || student.group === section.id).length;
        bullets.push(`${section.id}: ${count}`);
      }
    } else if (branch && pool.length) {
      const bySection = new Map();
      for (const student of pool) bySection.set(student.section, (bySection.get(student.section) || 0) + 1);
      for (const [section, count] of [...bySection.entries()].sort()) bullets.push(`${section}: ${count}`);
    }
    if (!pool.length) bullets.push("Published rosters currently cover first-year batches 2025 and 2026 only.");
    return reply(`${pool.length} students found.`, {
      bullets,
      actions: [{ label: "Browse students", to: "#/people?tab=students" }],
      cites: [cite("Official student rosters", "#/people?tab=students")],
      kind: "count",
    });
  }

  if (wantsTeachers) {
    let pool = [...(teachers || [])];
    const dept = extractDepartment(canon);
    if (dept) pool = pool.filter((teacher) => teacher.department === dept);
    if (/\bprofessor|professors\b/.test(canon)) pool = pool.filter((teacher) => /professor/i.test(teacher.designation || ""));
    return reply(`${pool.length} teacher${pool.length === 1 ? "" : "s"} found${dept ? ` in ${dept}` : ""}.`, {
      bullets: [
        dept ? "" : "Departments: " + [...new Set((teachers || []).map((teacher) => teacher.department).filter(Boolean))].slice(0, 12).join(", "),
        `Total public profiles: ${(teachers || []).length}.`,
      ],
      actions: [{ label: "Browse teachers", to: "#/people?tab=teachers" }],
      cites: [cite("Public faculty directory", "#/people?tab=teachers", "https://gndec.ac.in/faculty/")],
      kind: "count",
    });
  }

  if (wantsSections) {
    let pool = (timetable?.sections || []).filter((section) => (!branch || branchMatchesSection(section, branch)) && (!year || section.year === year));
    if (sections.length) pool = sections;
    return reply(`${pool.length} section${pool.length === 1 ? "" : "s"} match.`, {
      bullets: pool.slice(0, 20).map((section) => `${section.id} — ${section.label}`),
      actions: [{ label: "Open timetable", to: "#/timetable" }],
      kind: "count",
    });
  }

  if (wantsRooms) {
    return reply(`${(rooms?.rooms || []).length} rooms appear in the published timetable.`, {
      bullets: [
        `${(rooms?.rooms || []).filter((room) => room.photo).length} have an official photo.`,
        `${(rooms?.rooms || []).filter((room) => room.place).length} are linked to a block.`,
      ],
      actions: [{ label: "Open campus map", to: "#/rasta" }],
      kind: "count",
    });
  }

  if (wantsPapers) {
    return reply(`${(papers || []).length} previous-year papers are indexed.`, {
      bullets: ["Across sessions 2013–2025, grouped by subject code."],
      actions: [{ label: "Open papers", to: "#/study?tab=papers" }],
      kind: "count",
    });
  }

  if (wantsNotices) {
    return reply(`${(notices?.notices || []).length} notices are indexed.`, {
      actions: [{ label: "Open notices", to: "#/notices" }],
      kind: "count",
    });
  }

  if (wantsHolidays) {
    return reply(`${(notices?.holidays || []).length} holidays are listed for the published year.`, {
      actions: [{ label: "Holiday list", to: "#/notices?tab=holidays" }],
      kind: "count",
    });
  }

  return reply(`Sections ${(timetable?.sections || []).length} · rooms ${(rooms?.rooms || []).length} · teachers ${(teachers || []).length} · students ${(students || []).length} · papers ${(papers || []).length} · places ${(campus?.places || []).length}.`, {
    bullets: ["Ask a narrower question, for example “how many students in CS” or “how many teachers in IT”."],
    kind: "count",
  });
}

function extractDepartment(text) {
  const map = [
    ["information technology", "Information Technology"],
    ["computer science", "Computer Science & Engineering"],
    ["mechanical", "Mechanical Engineering"],
    ["civil", "Civil Engineering"],
    ["electrical", "Electrical Engineering"],
    ["electronics", "Electronics & Communication"],
    ["applied science", "Applied Science"],
    ["computer applications", "Computer Applications"],
    ["business administration", "Business Administration"],
    ["architecture", "School of Architecture"],
    ["workshop", "Workshops"],
    ["computer centre", "Computer Centre"],
    ["sports", "Sports"],
    ["production", "Production Engineering"],
  ];
  for (const [phrase, dept] of map) if (has(text, phrase)) return dept;
  if (/\bcse\b/.test(text)) return "Computer Science & Engineering";
  if (/\bit\s+(?:dept|department|branch|faculty)\b/.test(text)) return "Information Technology";
  if (/\bmech\b/.test(text)) return "Mechanical Engineering";
  if (/\bece\b/.test(text)) return "Electronics & Communication";
  return "";
}

/* ------------------------- general answers ------------------------ */

function identityReply(profile) {
  return reply("I am Ask GNDEC One — the campus assistant built into this app.", {
    bullets: [
      "I answer from GNDEC's public timetable, faculty directory, student rosters, paper archive, syllabus, notices and campus map.",
      "The same local engine works offline. When you are online, a cloud model can rephrase the verified answer, but it is not allowed to add facts.",
      profile?.section ? `Your saved section is ${profile.section}${profile.subgroup ? ` · ${profile.subgroup}` : ""}.` : "Set your section once to get personalised class answers.",
    ],
    actions: [
      { label: "What can you do?", to: "#/assistant?q=what%20can%20you%20do" },
      { label: "About the project", to: "#/about" },
    ],
    kind: "identity",
  });
}

function helpReply() {
  return reply("I can answer campus questions in English, Hinglish, Hindi-in-English or Punjabi-in-English.", {
    bullets: [
      "Classes: “my next class”, “aaj ka timetable”, “D2CSA wednesday”, “free periods tomorrow”.",
      "Rooms: “where is F107”, “is S201 free at 11:30”, “free rooms now”, “S201 timetable”.",
      "People: “who is Kiran Jyoti”, “timetable of Palwinder Kaur”, “who teaches data structures”, “mentor of <name>”.",
      "Counts: “how many students in CS”, “kitne students IT mein”, “how many teachers in CSE”.",
      "Papers and syllabus: “papers for BTCS-304”, “CSE 3rd sem syllabus”, “first year chemistry syllabus”.",
      "Routes: “route from main gate to library”, “library kithe hai”, “nearest gate to auditorium”, “distance to sports complex”.",
      "Dates and maths: “what day is 25 December 2026”, “days until 15 August”, “18% of 250”, “sqrt(144)”.",
      "Notices, holidays and exams: “latest notices”, “next holiday”, “exam date sheet”.",
    ],
    actions: [
      { label: "Open assistant", to: "#/assistant" },
      { label: "Search everything", to: "#/today" },
    ],
    kind: "help",
  });
}

function dateReply(canon, now) {
  if (
    /^(what time is it|what is the time|whats the time|current time|time now|abhi time|samay kya|time kya|kitne baje)\b/.test(canon) ||
    /\b(what|tell)\s+(?:is\s+)?(?:the\s+)?(?:current\s+)?time\s*(?:now|hai|is it)?$/.test(canon)
  ) {
    return reply(`It is ${fmtTime(`${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`)} on ${humanDate(now)}.`, {
      kind: "date",
    });
  }
  const date = extractDate(canon, now);
  if (date) {
    const diff = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
    const rel = diff === 0 ? "today" : diff === 1 ? "tomorrow" : diff === -1 ? "yesterday" : diff > 0 ? `in ${diff} days` : `${Math.abs(diff)} days ago`;
    return reply(`${humanDate(date)} — ${rel}.`, {
      bullets: [
        `Day: ${date.toLocaleDateString("en-IN", { weekday: "long" })}.`,
        diff >= 0 ? `${diff} day${diff === 1 ? "" : "s"} from today.` : "",
      ],
      kind: "date",
    });
  }
  if (hasAny(canon, ["what day", "which day", "day is", "din"])) {
    return reply(`Today is ${humanDate(now)}.`, {
      bullets: [`Day: ${now.toLocaleDateString("en-IN", { weekday: "long" })}.`],
      kind: "date",
    });
  }
  return null;
}

function mathReply(canon) {
  if (!/(\d|sqrt)/.test(canon)) return null;
  const hasOperator = /[+\-*/^%]|percent|sqrt|square|root|times|plus|minus|divided|multiplied/.test(canon);
  if (!hasOperator) return null;
  const cleaned = canon
    .replace(/^(what is|whats|calculate|solve|compute|evaluate|how much is|kitna hota|kitna h|answer)\s*/i, "")
    .replace(/\?+$/, "")
    .trim();
  // Reject anything that still contains prose. Only digits, operators, spaces,
  // parentheses, sqrt and percent are allowed.
  if (!/^(?:sqrt|percent|of|\d|\s|[()+\-*/^%.,])+$/.test(cleaned)) return null;
  const value = evaluateExpression(cleaned);
  if (value == null) return null;
  return reply(`That is ${value}.`, {
    bullets: ["Calculated locally on your device — no network needed."],
    kind: "math",
  });
}

function holidayReply(canon, notices, now) {
  const holidays = notices?.holidays || [];
  const specific = holidays.find((holiday) => has(canon.replace(/holiday|chhutti|when|is|next|date|of|the/g, " ").trim(), holiday.name.toLowerCase().split(" ")[0]));
  if (specific) {
    const date = new Date(`${specific.date}T00:00:00`);
    return reply(`${specific.name} — ${specific.displayDate || specific.date}.`, {
      bullets: [
        `Day: ${specific.weekday || date.toLocaleDateString("en-IN", { weekday: "long" })}.`,
        specific.category ? `Type: ${specific.category}.` : "",
      ],
      actions: [{ label: "Full holiday list", to: "#/notices?tab=holidays" }],
      cites: [cite("Official holiday list", "#/notices?tab=holidays", "https://gndec.ac.in/?q=holidays")],
      kind: "holiday",
    });
  }
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const upcoming = holidays
    .filter((holiday) => new Date(`${holiday.date}T00:00:00`) >= start)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6);
  return reply(upcoming.length ? "Upcoming holidays from the official list:" : "No upcoming holidays remain in the published list.", {
    bullets: upcoming.map((holiday) => `${holiday.displayDate || holiday.date} · ${holiday.name}${holiday.category ? ` (${holiday.category})` : ""}`),
    actions: [{ label: "All holidays", to: "#/notices?tab=holidays" }],
    cites: [cite("Official holiday list", "#/notices?tab=holidays", "https://gndec.ac.in/?q=holidays")],
    kind: "holiday",
  });
}

/* -------------------------- main answerer ------------------------- */

export function answerQuestion(question, ctx = {}) {
  const result = answerInner(question, ctx);
  if (!result) return answerInner("", ctx);
  result.bullets = result.bullets || [];
  result.actions = result.actions || [];
  result.cites = result.cites || [];
  return result;
}

function answerInner(question, ctx = {}) {
  const original = String(question || "").trim();
  const canon = canonicalQuestion(original);
  const lower = norm(original);
  const now = ctx.now || new Date();
  const { timetable, teachers, students, papers, syllabus, notices, campus, contacts, knowledge, rooms, profile, memory } = ctx;

  if (!canon) {
    return reply("Ask me about classes, teachers, rooms, routes, papers, syllabus, notices, holidays or exam rules.", {
      bullets: ["Try “my next class”, “where is F107”, “papers for BTCS-304”, or “route from main gate to library”."],
      actions: [{ label: "Open timetable", to: "#/timetable" }, { label: "Campus map", to: "#/rasta" }],
      kind: "empty",
    });
  }

  /* ---- identity, greeting, thanks ---- */
  if (/(who (made|created|built|developed)|kisne banaya|who are you|what are you|your name|tumhara naam|about you|are you (an )?(ai|real)|chatgpt|gemini|llm)/.test(canon)) {
    return identityReply(profile);
  }
  if (/^(hi|hello|hey|hlo|namaste|namaskar|sat sri akal|sat sri akaal|asalam|good morning|good afternoon|good evening)\b/.test(canon)) {
    return reply("Sat Sri Akal. I can help with timetables, teachers, rooms, campus routes, papers, syllabus and notices.", {
      bullets: profile?.section ? [`Your section is set to ${profile.section}. Ask “my next class”.`] : ["Set your section once in Settings to get personalised class answers."],
      actions: [
        { label: profile?.section ? "Today" : "Set my section", to: profile?.section ? "#/today" : "#/settings" },
        { label: "What can you do?", to: "#/assistant?q=what%20can%20you%20do" },
      ],
      kind: "greeting",
    });
  }
  if (/\b(thanks|thank you|thx|shukriya|dhanyavad|dhanyawad|meherbani)\b/.test(canon)) {
    return reply("You're welcome. Ask me anything else about the campus.", {
      actions: [{ label: "Back to Today", to: "#/today" }],
      kind: "thanks",
    });
  }
  if (/^(bye|goodbye|see you|ok bye|chalo|sat sri akal)\b/.test(canon)) {
    return reply("Sat Sri Akal. Your timetable and map will be here when you come back.", {
      actions: [{ label: "Back to Today", to: "#/today" }],
      kind: "bye",
    });
  }
  if (/(what can you do|how can you help|help me|capabilities|kya kar sakte|kya kar sakta|features|commands|how to use)/.test(canon)) {
    return helpReply();
  }

  /* ---- math ---- */
  const math = mathReply(canon);
  if (math) return math;

  /* ---- date / time ---- */
  const dateAnswer = dateReply(canon, now);
  if (dateAnswer) return dateAnswer;

  /* ---- counts ---- */
  if (/(how many|how much|count|total number|kitne|kine|number of)/.test(canon) && !/\b(distance|far|metre|meter|km|minute|min)\b/.test(canon)) {
    return countReply(canon, ctx);
  }

  /* ---- resolve timetable sections early ---- */
  const sectionHits = findSections(timetable, original);
  const branch = extractBranch(canon);
  const year = extractYear(canon);
  const subgroup = "";
  const personal = /\b(my|mera|meri|mujhe|i|am|apna|apni)\b/.test(canon) && !sectionHits.length;
  const memorySection = memory?.section ? (timetable?.sections || []).find((section) => section.id === memory.section) : null;
  const profileSection = profile?.section ? (timetable?.sections || []).find((section) => section.id === profile.section) : null;
  const followUp = /^(and|what about|uska|uski|iska|iski|same|also|aur|phir|fer|then)\b/.test(canon);
  let section = sectionHits.length === 1 ? sectionHits[0] : null;
  if (!section && sectionHits.length > 1) {
    if (/\btimetable|class|lecture|schedule|period\b/.test(canon)) return sectionListReply(sectionHits, original, { timetableIntent: true });
    section = sectionHits[0];
  }
  if (!section && personal) section = profileSection || memorySection || null;
  if (!section && followUp) section = memorySection || profileSection || null;
  if (!section && !sectionHits.length && (profileSection || memorySection)) {
    // Bare follow-ups like "wednesday?" or "and tomorrow" benefit from context.
    if (/^(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|somvar|mangalvar|budhvar|veervar|shukravar|shanivar)\b/.test(canon)) {
      section = memorySection || profileSection;
    }
  }
  const activeSubgroup = section && profile?.section === section.id ? profile.subgroup || "" : subgroup;
  const baseEntities = section ? { section: section.id, subgroup: activeSubgroup } : {};

  const timetableIntent = /\b(timetable|class|classes|lecture|lectures|period|periods|schedule|subject|subjects|padhai|study)\b/.test(canon);
  const when = resolveWhen(canon, now);

  /* ---- free periods for a section ---- */
  if (hasAny(canon, ["free", "free period", "free periods", "gap", "gaps"]) && !hasAny(canon, ["room", "rooms", "classroom", "lab"]) && (section || personal)) {
    return { ...freePeriodsReply(section, activeSubgroup, when, now), entities: baseEntities };
  }

  /* ---- free rooms ---- */
  if (hasAny(canon, ["free", "free room", "free rooms", "empty room", "vacant room", "available room", "khali room"]) && hasAny(canon, ["room", "rooms", "classroom", "lab", "labs"])) {
    let start = extractTime(canon);
    if (start == null && /\b(now|abhi)\b/.test(canon)) start = nowMinutes(now);
    const end = start == null ? null : start + 60;
    return freeRoomsReply(timetable, rooms, when, start, end, now);
  }
  if (hasAny(canon, ["free", "khali", "vacant"]) && !section && /\bnow\b|abhi/.test(canon)) {
    return freeRoomsReply(timetable, rooms, when, nowMinutes(now), nowMinutes(now) + 60, now);
  }

  /* ---- room queries ---- */
  const room = findRoom(rooms, original);
  const roomIntent = hasAny(canon, ["room", "rooms", "classroom", "lab", "block", "venue", "where"]);
  if (room) {
    if (hasAny(canon, ["free", "khali", "vacant", "busy", "occupied"])) {
      const start = extractTime(canon) ?? nowMinutes(now);
      const end = start + 60;
      const free = roomIsFree(timetable, room.name, when.day, start, end);
      return {
        ...reply(`${room.name} is ${free ? "free" : "busy"} on ${when.label} at ${minuteLabel(start)}.`, {
          bullets: [
            free ? "No published lecture overlaps this slot." : "A published lecture overlaps this slot.",
            "Labs and staff use are not always represented in the timetable.",
          ],
          actions: [{ label: "Room details", to: `#/rasta/room/${encodeURIComponent(room.id)}` }],
          entities: { room: room.name, ...baseEntities },
          kind: "room-free",
        }),
      };
    }
    if (hasAny(canon, ["timetable", "schedule", "classes", "lectures", "periods"])) {
      return roomTimetableReply(timetable, room.name, when);
    }
    if (roomIntent || /^(where|f|g|s)/.test(canon)) {
      const place = (campus?.places || []).find((item) => item.id === room.place) || null;
      const base = roomReply(room, place, campus);
      return { ...base, entities: { ...base.entities, ...baseEntities } };
    }
  }

  /* ---- teacher queries ---- */
  const person = findPerson(original, teachers, contacts?.roles || []);
  const teacher = person?.teacher || null;
  const role = person?.role || null;

  if (teacher) {
    if (hasAny(canon, ["free", "busy", "teaching", "now", "abhi", "where", "kaha", "kithe"])) return teacherNowReply(teacher, now);
    if (hasAny(canon, ["timetable", "schedule", "classes", "lectures", "periods", "when", "kab"])) return teacherTimetableReply(teacher, when, now);
    if (hasAny(canon, ["who teaches", "teaches"])) {
      const subjectWords = canonical(qWithoutIntent(canon)).split(/\s+/).filter((word) => word.length >= 3);
      const matches = (teachers || []).filter((candidate) =>
        (candidate.subjects || []).some((subject) => subjectWords.some((word) => subject.toLowerCase().includes(word))),
      );
      if (matches.length) return subjectTeachersReply(subjectWords.join(" "), matches);
    }
    return teacherReply(teacher, role);
  }
  if (role) return contactReply(role);

  const wantsRole = roleForQuery(canon, contacts);
  if (wantsRole) return contactReply(wantsRole);

  /* ---- who teaches a subject ---- */
  if (hasAny(canon, ["who teaches", "who teach", "which teacher", "teacher for", "faculty for", "kaun padhata", "kaun padhata"])) {
    const raw = canon
      .replace(/\b(who|teaches|teach|which|teacher|faculty|for|the|subject|of|is|kaun|padhata|padhata|hai)\b/g, " ")
      .trim();
    const words = raw.split(/\s+/).filter((word) => word.length >= 3);
    if (words.length) {
      const bySubject = new Map();
      for (const candidate of teachers || []) {
        for (const subject of candidate.subjects || []) {
          if (words.some((word) => subject.toLowerCase().includes(word))) {
            if (!bySubject.has(candidate.name)) bySubject.set(candidate.name, { teacher: candidate, subjects: new Set() });
            bySubject.get(candidate.name).subjects.add(subject);
          }
        }
      }
      for (const sectionItem of timetable?.sections || []) {
        for (const lecture of sectionItem.lectures || []) {
          if (words.some((word) => String(lecture.subject || "").toLowerCase().includes(word)) && lecture.teacher) {
            if (!bySubject.has(lecture.teacher)) bySubject.set(lecture.teacher, { teacher: { name: lecture.teacher, id: "" }, subjects: new Set() });
            bySubject.get(lecture.teacher).subjects.add(lecture.subject);
          }
        }
      }
      if (bySubject.size) {
        return subjectTeachersReply(words.join(" "), [...bySubject.values()].map((item) => item.teacher), [...bySubject.values()].map((item) => [...item.subjects]));
      }
    }
    return reply(`I could not match “${raw}” to a subject in the public data.`, {
      bullets: [
        "First-year subjects are named in the timetable; later-year lecture titles are often missing.",
        "Search the paper archive by subject code, or browse the faculty directory.",
      ],
      actions: [{ label: "Search teachers", to: "#/people?tab=teachers" }, { label: "Search papers", to: "#/study?tab=papers" }],
      kind: "subject-teacher",
    });
  }

  /* ---- mentor / student ---- */
  const crn = original.match(/\b(\d{7})\b/);
  if (crn) {
    const student = (students || []).find((item) => String(item.crn) === crn[1] || String(item.registrationNo) === crn[1]);
    if (student) return studentReply(student);
  }
  if (/\bmentor\b/.test(canon)) {
    const student = bestPersonMatch(nameTokens(canon), students || [])?.item || null;
    if (student) {
      return reply(`${student.name}'s mentor is ${student.mentor || "not published"}.`, {
        bullets: [
          `${student.branch} · ${student.section}${student.subgroup ? ` · ${student.subgroup}` : ""} · CRN ${student.crn}`,
          student.mentorPhone ? `Mentor phone: ${student.mentorPhone}` : "",
          student.venue ? `Mentor venue: ${student.venue}` : "",
        ],
        actions: [{ label: "Open student", to: `#/people/student/${student.crn}` }],
        cites: [cite(student.name, `#/people/student/${student.crn}`)],
        kind: "mentor",
      });
    }
    const mentorName = original.replace(/\b(who|is|mentor|of|the|for|students?|under|with)\b/gi, " ").trim();
    const mentorMatch = bestPersonMatch(nameTokens(canon), (students || []).map((item) => ({ name: item.mentor })));
    if (mentorMatch) {
      const mentored = (students || []).filter((item) => item.mentor === mentorMatch.item.name);
      return reply(`${mentored.length} students are listed under mentor ${mentorMatch.item.name}.`, {
        bullets: mentored.slice(0, 8).map((item) => `${item.name} · ${item.crn} · ${item.section}`),
        actions: [{ label: "Search students", to: "#/people?tab=students" }],
        entities: { mentor: mentorMatch.item.name },
        kind: "mentor",
      });
    }
    return reply("I could not match that mentor or student name.", {
      bullets: ["Try a fuller name or the 7-digit CRN."],
      actions: [{ label: "Search students", to: "#/people?tab=students" }],
      kind: "mentor",
    });
  }
  if (/\b(student|students)\b/.test(canon) && !sectionHits.length) {
    const student = bestPersonMatch(nameTokens(canon), students || [])?.item || null;
    if (student) return studentReply(student);
  }

  /* ---- route / places ---- */
  const placeHits = matchPlacesInText(campus, original);
  const routeIntent = hasAny(canon, ["route", "distance", "how far", "direction", "reach", "walk", "go to", "from", "to", "nearest", "which gate", "where"]);
  if (placeHits.length >= 2 && (routeIntent || hasAny(canon, ["route", "distance", "far", "between"]))) {
    const route = shortestRoute(campus, placeHits[0].id, placeHits[1].id);
    const answer = routeReply(route, { media: placeHits[1].photo ? { src: placeHits[1].photo, credit: placeHits[1].photoCredit || "" } : null });
    if (answer) return answer;
  }
  if (placeHits.length === 1 && hasAny(canon, ["nearest", "closest", "which gate"])) {
    const answer = nearestGateReply(campus, placeHits[0]);
    if (answer) return answer;
  }
  if (placeHits.length === 1 && routeIntent) {
    const place = placeHits[0];
    const fromPlace = placeHits.find((item) => item.id !== place.id);
    const fromId = fromPlace?.id || "main-gate";
    const route = shortestRoute(campus, fromId, place.id);
    if (route) {
      return reply(`${place.name}`, {
        bullets: [
          place.description || `${place.category} place on campus.`,
          `About ${route.metres} m from ${route.from.name}, roughly ${route.minutes} min on foot.`,
          ...route.steps.slice(1, 5).map((step) => step.text),
        ],
        actions: [
          { label: "Show on map", to: `#/rasta/place/${place.id}` },
          { label: "Open route", to: `#/rasta?from=${fromId}&to=${place.id}` },
        ],
        cites: [cite(place.name, `#/rasta/place/${place.id}`)],
        media: place.photo ? { src: place.photo, credit: place.photoCredit || "" } : null,
        entities: { place: place.id },
        kind: "place",
      });
    }
  }

  /* ---- timetable ---- */
  if (timetableIntent) {
    if (section) {
      if (hasAny(canon, ["next", "upcoming", "now"])) {
        return { ...nextClassReply(nextLecture(section, activeSubgroup, now), section, activeSubgroup), entities: baseEntities };
      }
      return { ...sectionScheduleReply(section, activeSubgroup, when, now, notices), entities: baseEntities };
    }
    if (sectionHits.length > 1) return sectionListReply(sectionHits, original, { timetableIntent: true });
    if (branch || year) {
      const pool = (timetable?.sections || []).filter((item) => (!branch || branchMatchesSection(item, branch)) && (!year || item.year === year));
      if (pool.length) return sectionListReply(pool, original, { timetableIntent: true });
      if (year === 4) {
        return reply("There is no 4th-year timetable in the public FET release.", {
          bullets: [
            "Published sections cover 1st, 2nd and 3rd year. 4th-year groups are not in the current public timetable feed.",
            "This is a known data gap, not a guess.",
          ],
          actions: [{ label: "Open timetable", to: "#/timetable" }],
          cites: [cite("Published FET timetable", "#/timetable", "https://appsc.gndec.ac.in/time_tables")],
          kind: "timetable-gap",
        });
      }
      return reply("I could not find that section in the published timetable.", {
        bullets: ["Published groups cover 1st, 2nd and 3rd year only."],
        actions: [{ label: "Browse all timetables", to: "#/timetable" }],
        kind: "timetable-gap",
      });
    }
    return reply("Tell me which section you are in, and I can read the timetable.", {
      bullets: [
        "Examples: “D2CSA timetable”, “next class for ITA”, “today classes for MEB”.",
        "Or set your section once in Settings.",
      ],
      actions: [
        { label: "Set my section", to: "#/settings" },
        { label: "Browse all timetables", to: "#/timetable" },
      ],
      kind: "timetable",
    });
  }

  /* ---- papers ---- */
  if (hasAny(canon, ["paper", "papers", "previous", "pyq", "past paper", "old paper"])) {
    const result = findPapers(papers, canon, original);
    return papersReply(result, original);
  }

  /* ---- syllabus ---- */
  if (hasAny(canon, ["syllabus", "syllabi", "curriculum", "scheme", "study scheme", "course content", "course"])) {
    const sem = extractSemester(canon);
    const codeMap = { CS: "CS", IT: "IT", EC: "EC", EE: "EE", ME: "ME", CE: "CE", RAI: "RAI", MBA: "MBA", MCA: "MCA", BBA: "BBA", BCOM: "BCOM", BARCH: "BARCH" };
    const code = codeMap[branch] || "";
    let matches = (syllabus?.documents || []).filter((doc) => {
      if (code && doc.branch !== code && doc.program !== code && doc.branch !== "ALL") return false;
      if (sem && doc.semesters?.length && !doc.semesters.includes(sem)) return false;
      return true;
    });
    if (!matches.length) matches = (syllabus?.documents || []).filter((doc) => doc.branch === "ALL" || !code);
    const subjectWords = canon
      .replace(/syllabus|syllabi|curriculum|scheme|study|course|content|of|for|the|sem|semester|first|second|third|fourth|year|1st|2nd|3rd|4th|\d+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const firstYearPages = syllabus?.firstYear?.pages || [];
    if (hasAny(canon, ["first year", "1st year"]) && firstYearPages.length && !subjectWords) {
      return reply("First-year (Sem 1–2) syllabus is available for all branches.", {
        bullets: [
          "The official study scheme covers the common first-year subjects and credits.",
          "Open the first-year reader to search the full official text page by page.",
        ],
        actions: [{ label: "Read first year", to: "#/study?tab=first-year" }, { label: "Syllabus library", to: "#/study?tab=syllabus" }],
        cites: [cite("First-year study scheme", "#/study?tab=first-year", syllabus?.firstYear?.source || "")],
        kind: "syllabus",
      });
    }
    if (hasAny(canon, ["first year", "1st year", "first", "1st"]) && firstYearPages.length) {
      const hits = subjectWords
        ? firstYearPages.filter((page) => page.text.toLowerCase().includes(subjectWords.split(/\s+/)[0]))
        : [];
      if (hits.length) {
        return reply(`First-year syllabus references “${subjectWords}”:`, {
          bullets: hits.slice(0, 4).map((page) => `Page ${page.number} of the official first-year study scheme.`),
          actions: [{ label: "Read first year", to: "#/study?tab=first-year" }, { label: "Open syllabus library", to: "#/study?tab=syllabus" }],
          cites: [cite("First-year study scheme", "#/study?tab=first-year", syllabus?.firstYear?.source || "")],
          kind: "syllabus",
        });
      }
    }
    return syllabusReply(matches, original.replace(/syllabus|syllabi|curriculum|scheme/gi, "").trim() || "all branches", code, sem);
  }

  /* ---- notices / holidays / exams ---- */
  if (hasAny(canon, ["holiday", "holidays", "chhutti", "closed", "off day", "vacation"])) {
    return holidayReply(canon, notices, now);
  }
  if (hasAny(canon, ["exam", "examination", "datesheet", "seating", "result", "reappear", "mst", "end term"])) {
    const examNotices = (notices?.notices || []).filter((notice) => notice.kind === "exam").slice(0, 4);
    return reply("Exam dates and seating plans are not published as open data by the college.", {
      bullets: [
        "Official exam notices appear on the notice board and the ERP portal (login required).",
        ...examNotices.map((notice) => `${notice.displayDate || notice.date} · ${notice.title}`),
        "This app links to the public notices it can verify, and shows study material and tips.",
      ],
      actions: [
        { label: "Exam help", to: "#/exams" },
        { label: "Latest papers", to: "#/study?tab=papers" },
        { label: "ERP notice board", url: "https://erp.gndec.ac.in/notice" },
      ],
      cites: [cite("Exam notices", "#/exams")],
      kind: "exams",
    });
  }
  if (hasAny(canon, ["notice", "circular", "announcement", "news", "latest", "update"])) {
    const words = canon
      .replace(/notices?|circulars?|latest|news|announcement|update|show|tell|me|the|all/g, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 3);
    const matches = (notices?.notices || []).filter((notice) => {
      if (!words.length) return true;
      const hay = notice.title.toLowerCase();
      return words.some((word) => hay.includes(word));
    });
    const list = matches.length ? matches : notices?.notices || [];
    return reply(matches.length ? `${matches.length} notice${matches.length === 1 ? "" : "s"} matched.` : "No notice matched those words. Here are the latest notices.", {
      bullets: list.slice(0, 5).map((notice) => `${notice.displayDate || notice.date} · ${notice.title}`),
      actions: [{ label: "Open notices", to: "#/notices" }],
      cites: list.slice(0, 2).map((notice) => cite(notice.title.slice(0, 44), `#/notices/${notice.id}`, notice.url)),
      kind: "notices",
    });
  }

  /* ---- campus facts / contacts ---- */
  if (hasAny(canon, ["hostel", "campus", "acre", "established", "history", "address", "bus", "bank", "dispensary", "canteen", "sports", "swimming", "library", "mess", "gym", "ground"])) {
    const facts = campus?.facts || knowledge?.campusFacts || {};
    return reply("GNDEC campus facts", {
      bullets: [
        facts.established ? `Established in ${facts.established}.` : "",
        facts.campusAcres ? `${facts.campusAcres} acres on Gill Road, Ludhiana.` : "",
        facts.address ? `Address: ${facts.address}.` : "",
        facts.hostels ? `Hostels: ${facts.hostels}.` : "",
        facts.distanceBusStandKm ? `About ${facts.distanceBusStandKm} km from the bus stand and ${facts.distanceRailwayStationKm} km from the railway station.` : "",
        "GNDEC and GND Polytechnic share the same campus and several facilities.",
      ],
      actions: [
        { label: "Explore campus map", to: "#/rasta" },
        { label: "About the college", to: "#/about" },
      ],
      cites: [cite("Campus facts", "#/about", "https://gndec.ac.in/?q=node/58")],
      kind: "campus",
    });
  }
  if (hasAny(canon, ["principal", "hod", "head of", "contact", "phone", "landline", "admission", "office", "email", "warden", "dean"])) {
    const roleWords = canon.split(/\s+/).filter((word) => word.length >= 3);
    const roles = (contacts?.roles || []).filter((item) => {
      const hay = `${item.role} ${item.name}`.toLowerCase();
      return roleWords.some((word) => hay.includes(word)) || hasAny(canon, ["principal", "admission"]);
    });
    return reply(roles.length ? "Published office contacts:" : "Published office contacts and role emails:", {
      bullets: (roles.length ? roles : contacts?.roles || []).slice(0, 6).map((item) => {
        const phone = item.landline || item.phone;
        return `${item.role} — ${item.name}${phone ? ` · ${phone}` : ""}${item.email ? ` · ${item.email}` : ""}`;
      }),
      actions: [{ label: "All contacts", to: "#/people?tab=contacts" }],
      cites: [cite("Administration contacts", "#/people?tab=contacts", contacts?.source || "")],
      kind: "contact",
    });
  }

  /* ---- light small talk ---- */
  if (/\b(joke|funny|hasao|hansao)\b/.test(canon)) {
    return reply("Campus joke: a free period is never free — it always costs one assignment.", {
      bullets: ["I am better at timetables than comedy. Ask me “where is F107” or “my next class”."],
      actions: [{ label: "My next class", to: "#/assistant?q=my%20next%20class" }],
      kind: "smalltalk",
    });
  }
  if (/\b(love you|marry|date|girlfriend|boyfriend|crush)\b/.test(canon)) {
    return reply("I am a campus assistant, not a matchmaker.", {
      bullets: ["But I can tell you which room your next class is in, and how long the walk takes."],
      actions: [{ label: "My next class", to: "#/assistant?q=my%20next%20class" }],
      kind: "smalltalk",
    });
  }

  /* ---- fallback: suggestions ---- */
  const words = canon.split(/\s+/).filter((word) => word.length >= 3).slice(0, 8);
  const suggestions = [];
  if (words.length) {
    const sections = (timetable?.sections || []).filter((item) =>
      words.some((word) => `${item.id} ${item.branchName} ${item.label}`.toLowerCase().includes(word)),
    );
    for (const item of sections.slice(0, 3)) suggestions.push({ label: `${item.id} timetable`, to: sectionLink(item) });
    const places = matchPlacesInText(campus, original);
    for (const place of places.slice(0, 2)) suggestions.push({ label: place.name, to: `#/rasta/place/${place.id}` });
    const teachersFound = (teachers || []).filter((item) => words.some((word) => item.name.toLowerCase().includes(word)));
    for (const item of teachersFound.slice(0, 2)) suggestions.push({ label: item.name, to: `#/people/teacher/${item.id}` });
  }
  return reply("I could not find that in the verified college data.", {
    bullets: [
      "I answer from the app's public data: timetable, faculty directory, rosters, papers, syllabus, notices and the campus map.",
      "I will not invent a room number, a teacher name or an exam date.",
      suggestions.length ? "Maybe you meant one of these:" : "Try “my next class”, “where is F107”, “papers for BTCS-304” or “route to library”.",
    ],
    actions: suggestions.length ? suggestions : [{ label: "What can you do?", to: "#/assistant?q=what%20can%20you%20do" }, { label: "Search everything", to: "#/today" }],
    kind: "fallback",
  });
}

function qWithoutIntent(text) {
  return canonicalQuestion(text)
    .replace(/\b(who|teaches|teach|which|teacher|faculty|for|the|subject|of|is|kaun|padhata|hai)\b/g, " ")
    .trim();
}

function subjectTeachersReply(subject, matches, subjects = []) {
  const bullets = matches.slice(0, 8).map((teacher, index) => {
    const list = subjects[index]?.length ? ` · ${subjects[index].slice(0, 3).join(", ")}` : "";
    return `${teacher.name}${teacher.designation ? ` — ${teacher.designation}` : ""}${teacher.department ? ` · ${teacher.department}` : ""}${list}`;
  });
  return reply(`Teacher${matches.length === 1 ? "" : "s"} linked to “${subject}”:`, {
    bullets: [...bullets, "Teaching links come from the published timetable and public faculty directory."],
    actions: matches.filter((teacher) => teacher.id).slice(0, 3).map((teacher) => ({ label: teacher.name, to: `#/people/teacher/${encodeURIComponent(teacher.id)}` })),
    cites: [cite("Public faculty directory", "#/people?tab=teachers", "https://gndec.ac.in/faculty/")],
    kind: "subject-teacher",
  });
}

function studentReply(student) {
  return reply(`${student.name} · CRN ${student.crn}`, {
    bullets: [
      `${student.branch} · Section ${student.section}${student.subgroup ? ` · ${student.subgroup}` : ""}`,
      `Batch ${student.batch}${student.mentor ? ` · Mentor ${student.mentor}` : ""}`,
      student.venue ? `Mentor venue: ${student.venue}` : "",
      student.registrationNo ? `University registration: ${student.registrationNo}` : "",
    ].filter(Boolean),
    actions: [
      { label: "Open student", to: `#/people/student/${student.crn}` },
      { label: "Open section timetable", to: sectionLink({ id: student.section }) },
    ],
    cites: [cite(student.name, `#/people/student/${student.crn}`)],
    entities: { student: student.crn, section: student.section },
    kind: "student",
  });
}

/* ----------------------- cloud grounding block -------------------- */

export function buildAssistantContext(question, ctx = {}) {
  const { timetable, teachers, papers, syllabus, notices, campus, contacts, profile } = ctx;
  const parts = [];
  const section = profile?.section ? (timetable?.sections || []).find((s) => s.id === profile.section) : null;

  parts.push("ABOUT: GNDEC One covers Guru Nanak Dev Engineering College, Ludhiana. Public data only.");
  if (section) {
    const plan = dayPlan(section, profile.subgroup, new Date());
    parts.push(`USER SECTION: ${section.id} — ${section.label}; subgroup ${profile.subgroup || "none"}.`);
    parts.push(
      `TODAY: ${(plan.lectures || [])
        .map((lecture) => `${lecture.start}-${lecture.end} ${lecture.subject} ${lecture.teacher || ""} ${lecture.room || ""}`)
        .join(" | ") || "no classes"}`,
    );
  }

  const q = String(question).toLowerCase();
  const teacherHits = (teachers || [])
    .filter((teacher) => q.includes(teacher.name.toLowerCase().replace(/^(dr|er|ms|mrs|mr|prof)\.?\s+/i, "")))
    .slice(0, 2);
  for (const teacher of teacherHits) {
    parts.push(
      `TEACHER: ${teacher.name} | ${teacher.designation} | ${teacher.department} | ${teacher.email} | subjects ${(teacher.subjects || []).join(", ")}`,
    );
  }

  const placeHits = matchPlacesInText(campus, question).slice(0, 3);
  for (const place of placeHits) {
    parts.push(`PLACE: ${place.name} | ${place.category} | ${place.description || ""} | lat ${place.lat}, lon ${place.lon}`);
  }

  const codeMatch = question.match(/\b([A-Z]{2,6})[\s-]?(\d{3,5})\b/i);
  if (codeMatch) {
    const code = `${codeMatch[1].toUpperCase()}-${codeMatch[2]}`;
    const papersFound = (papers || []).filter((paper) => paper.code === code).slice(0, 6);
    for (const paper of papersFound) parts.push(`PAPER: ${paper.code} | ${paper.title} | ${paper.session}`);
    const docs = (syllabus?.documents || []).filter((doc) => doc.title.toLowerCase().includes(code.toLowerCase())).slice(0, 2);
    for (const doc of docs) parts.push(`SYLLABUS: ${doc.title} | ${doc.branchName} | ${doc.semester}`);
  }

  const canonical = canonicalQuestion(question);
  const words = canonical.split(/\s+/).filter((word) => word.length >= 3);
  if (hasAny(canonical, ["notice", "latest", "exam", "holiday"])) {
    for (const notice of (notices?.notices || []).slice(0, 6)) parts.push(`NOTICE: ${notice.date} | ${notice.title} | ${notice.url}`);
  }
  if (hasAny(canonical, ["contact", "principal", "hod", "phone"])) {
    for (const role of (contacts?.roles || []).slice(0, 8)) {
      parts.push(`CONTACT: ${role.role} | ${role.name} | ${role.landline || role.phone || ""} | ${role.email || ""}`);
    }
  }
  if (words.length) {
    const sectionHits = findSections(timetable, question).slice(0, 3);
    for (const hit of sectionHits) {
      parts.push(
        `SECTION: ${hit.id} | ${hit.label} | ${hit.lectures.length} lectures/week | ${uniqueSubjects(hit).map((item) => item.subject).join(", ")}`,
      );
    }
  }

  return parts.join("\n").slice(0, 14000);
}

/* ------------------------------------------------------------------ */
/* Exam tips (static, deliberately practical)                          */
/* ------------------------------------------------------------------ */

export const EXAM_TIPS = [
  {
    title: "Start with the official scheme",
    body: "Open the study scheme for your branch and semester first. It lists the official unit weightage, so you do not waste time on topics that carry no marks.",
    to: "#/study?tab=syllabus",
  },
  {
    title: "Read two past papers before revising",
    body: "Skim the last two question papers for the same code. Notice repeated units and the marks split between short and long questions, then revise in that order.",
    to: "#/study?tab=papers",
  },
  {
    title: "Make one A4 sheet per subject",
    body: "Write formulas, definitions, diagrams and the exact question patterns you keep missing. A single revision sheet is easier to revisit the night before than a full notebook.",
  },
  {
    title: "Practise writing, not only reading",
    body: "Pick one 10-mark question and write it in exam time without notes. Most marks are lost to incomplete steps and unlabelled diagrams, not to unknown theory.",
  },
  {
    title: "Protect the first 10 minutes",
    body: "Read the full paper, mark the questions you can answer well, and start there. This banks marks early and removes panic before the long answers.",
  },
  {
    title: "Check the room and reporting time",
    body: "Seating plans are published on the ERP notice board, not as open data. Confirm your room and reporting time there at least a day before the exam.",
    to: "#/exams",
  },
  {
    title: "Use the library's quiet hours",
    body: "The central library reading rooms are the most reliable quiet space on campus. Carry only the subject you are revising, and leave the phone in your bag.",
    to: "#/rasta/place/library",
  },
  {
    title: "Sleep beats a last-minute cram",
    body: "A fixed sleep window protects recall more than two extra hours of half-focused revision. Plan the last night to end early.",
  },
];
