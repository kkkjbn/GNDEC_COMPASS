/**
 * Build every JSON file the app needs from official GNDEC sources.
 *
 *   node scripts/build-data.mjs            full build (PDFs included)
 *   node scripts/build-data.mjs --skip-pdf fast build, keeps previous rosters
 *
 * Sources are re-fetched on every run. Nothing is invented: when the college
 * does not publish something, the output says so explicitly.
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  fetchText,
  fetchBuffer,
  writeJson,
  titleCaseName,
  slugify,
  uniqueBy,
  decodeEntities,
  stripTags,
} from "./lib/util.mjs";
import {
  parseTimetableHtml,
  splitTeachers,
  cleanTeacherName,
  teacherKey,
  parseGroupMeta,
} from "./lib/timetable.mjs";
import { parseRosterPdf, pdfText } from "./lib/pdf.mjs";
import {
  PLACE_PHOTOS,
  EXTRA_PLACES,
  GALLERY,
  roomPhoto,
  ROOM_PHOTO_CREDIT,
} from "./lib/photos.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "data");
const SKIP_PDF = process.argv.includes("--skip-pdf");

const SOURCES = [];
function source(label, url, kind, extra = {}) {
  const record = { label, url, kind, fetchedAt: new Date().toISOString(), ...extra };
  SOURCES.push(record);
  return record;
}

const TIMETABLE = {
  sections: "https://appsc.gndec.ac.in/sites/default/files/2026-09/17_09_2026_groups_days_horizontal.html",
  subgroups: "https://appsc.gndec.ac.in/sites/default/files/2026-09/17_09_2026_subgroups_days_horizontal.html",
  teachers: "https://appsc.gndec.ac.in/sites/default/files/2026-09/17_09_2026_teachers_days_horizontal.html",
  rooms: "https://appsc.gndec.ac.in/sites/default/files/2026-09/17_09_2026_rooms_days_horizontal.html",
  index: "https://appsc.gndec.ac.in/time_tables",
};

const ROSTERS = [
  // 2026 admitted batch — currently 1st year
  ...["CE", "CS", "EC", "EE", "IT", "ME", "RAI"].map((b) => ({
    branch: b,
    batch: "2026",
    year: 1,
    url: `https://appsc.gndec.ac.in/sites/default/files/2026-09/${b}%20Permanent%20Section%2015_09_2026${b === "ME" ? "_0" : ""}.pdf`,
  })),
  // 2025 admitted batch — currently 2nd year
  ...["CE", "CS", "EC", "EE", "IT", "ME", "RAI"].map((b) => ({
    branch: b,
    batch: "2025",
    year: 2,
    url: `https://appsc.gndec.ac.in/sites/default/files/2026-02/${b}%20Sections%20sem-2%202025.pdf`,
  })),
  { branch: "EC", batch: "2025", year: 2, section: "ECBITD", url: "https://appsc.gndec.ac.in/sites/default/files/2026-02/ECBITD%20Section%20sem-2%202025.pdf" },
  { branch: "MX", batch: "2025", year: 2, section: "MX", url: "https://appsc.gndec.ac.in/sites/default/files/2026-02/MX%20Section%20sem-2%202025.pdf" },
];

const FACULTY_DEPTS = [
  [1, "Applied Science", "AS"],
  [2, "Computer Centre", "CC"],
  [3, "Workshops", "WS"],
  [4, "Sports", "SP"],
  [14, "Civil Engineering", "CE"],
  [15, "Computer Science & Engineering", "CSE"],
  [16, "Electrical Engineering", "EE"],
  [17, "Electronics & Communication", "ECE"],
  [21, "Information Technology", "IT"],
  [28, "Business Administration", "MBA"],
  [29, "Computer Applications", "MCA"],
  [30, "Mechanical Engineering", "ME"],
  [31, "Production Engineering", "PE"],
  [99, "School of Architecture", "ARCH"],
];

const SYLLABUS_SEED = [
  {
    branch: "ALL",
    program: "B.Tech",
    semester: "1–2",
    scheme: "2026",
    title: "B.Tech 1st Year Study Scheme & Syllabus (Dec 2025)",
    url: "https://appsc.gndec.ac.in/sites/default/files/2026-03/ss%20and%20Syllabus%20sem1%2C2%20Dec%202025%20unsigned.pdf",
  },
  {
    branch: "ALL",
    program: "B.Tech",
    semester: "1–2",
    scheme: "2018",
    title: "B.Tech 1st Year Study Scheme & Syllabus (2018 onward)",
    url: "https://appsc.gndec.ac.in/sites/default/files/2024-08/B.Tech_1st_year_SS_and_syllabus_2018_onward.pdf",
  },
  {
    branch: "ALL",
    program: "B.Tech",
    semester: "1–2",
    scheme: "2017",
    title: "Study Scheme & Syllabus 2017",
    url: "https://appsc.gndec.ac.in/sites/default/files/2024-08/SS%2BSyllabus2017.pdf",
  },
  {
    branch: "ALL",
    program: "B.Tech",
    semester: "1–2",
    scheme: "2014",
    title: "Study Scheme & Syllabus 2014",
    url: "https://appsc.gndec.ac.in/sites/default/files/2024-08/2014%20ss%20and%20syllabus.pdf",
  },
  {
    branch: "IT",
    program: "B.Tech",
    semester: "3–8",
    scheme: "2014",
    title: "IT Syllabus 3rd to 8th Semester (Scheme 2014)",
    url: "https://it.gndec.ac.in/sites/default/files/Syllabus%203rd%20to%208th%20semester%20of%20Scheme%202014%20website%20upload.pdf",
  },
  {
    branch: "IT",
    program: "B.Tech",
    semester: "3–8",
    scheme: "2014",
    title: "IT Scheme 2014 — Annexure I",
    url: "https://it.gndec.ac.in/sites/default/files/ANNEXURE-I%20Scheme%202014.pdf",
  },
];

const CRAWL_PAGES = [
  { url: "https://it.gndec.ac.in/?q=academics", branch: "IT", host: "it.gndec.ac.in" },
  { url: "https://ce.gndec.ac.in/?q=node/2", branch: "CE", host: "ce.gndec.ac.in" },
  { url: "https://cse.gndec.ac.in/?q=node/14", branch: "CSE", host: "cse.gndec.ac.in" },
  { url: "https://ece.gndec.ac.in/?q=node/2", branch: "ECE", host: "ece.gndec.ac.in" },
  { url: "https://me.gndec.ac.in/?q=node/2", branch: "ME", host: "me.gndec.ac.in" },
  { url: "https://ee.gndec.ac.in/", branch: "EE", host: "ee.gndec.ac.in" },
  { url: "https://mba.gndec.ac.in/?q=node/11", branch: "MBA", host: "mba.gndec.ac.in" },
  { url: "https://mca.gndec.ac.in/?q=node/12", branch: "MCA", host: "mca.gndec.ac.in" },
];

const NEXT = "https://nextlecture.vercel.app";
const trpc = (path, input) => {
  const entry = input === null ? { json: null, meta: { values: ["undefined"] } } : { json: input };
  const payload = JSON.stringify({ 0: entry });
  return `${NEXT}/api/trpc/${path}?batch=1&input=${encodeURIComponent(payload)}`;
};

async function nextTrpc(path, input) {
  const data = JSON.parse(await fetchText(trpc(path, input)));
  return data[0]?.result?.data?.json;
}

function hash(input) {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

/* ------------------------------------------------------------------ */
/* Shared classifiers                                                  */
/* ------------------------------------------------------------------ */

const BRANCH_LABELS = {
  ALL: "All branches",
  CE: "Civil Engineering",
  CS: "Computer Science & Engineering",
  IT: "Information Technology",
  EC: "Electronics & Communication",
  EE: "Electrical Engineering",
  ME: "Mechanical Engineering",
  RAI: "Robotics & Artificial Intelligence",
  ARCH: "Architecture",
  AS: "Applied Science",
  MBA: "Business Administration (MBA)",
  MCA: "Computer Applications (MCA)",
  BBA: "Business Administration (BBA)",
  BCOM: "B.Com",
  BVOC: "B.Voc",
};

const PAPER_DEPARTMENTS = [
  [/^BTAM|^AM|^BTMA/, "Applied Mathematics"],
  [/^BTCH|^CH/, "Applied Chemistry"],
  [/^BTPH|^PH/, "Applied Physics"],
  [/^BTHU|^HU|^HS/, "Humanities & Management"],
  [/^BTCE|^BCTE/, "Civil Engineering"],
  [/^BTCS|^BCS/, "Computer Science & Engineering"],
  [/^BTIT|^IT/, "Information Technology"],
  [/^BTEC|^EC/, "Electronics & Communication"],
  [/^BTEE|^EE/, "Electrical Engineering"],
  [/^BTME|^ME/, "Mechanical Engineering"],
  [/^BTRAI|^RAI/, "Robotics & AI"],
  [/^BTAR|^AR/, "Architecture"],
];

/**
 * Paper file names in the shared GNDEC archive look like
 *   AM-101_A0111.pdf · BTCS-304_DATA STRUCTURES.pdf · BTCE-401.PDF
 * Pull the course code out and keep any human title that follows it.
 */
function paperMeta(name) {
  const raw = String(name || "").trim();
  const base = raw
    .replace(/\.pdf$/i, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .split(",")[0]
    .replace(/\s+/g, " ")
    .replace(/[.\s]+$/g, "")
    .trim();

  // Codes look like BTCE-302, BTAS-17101, BBA201, BSC -101, CE-14301.
  const match = base.match(/^([A-Z]{2,6})\s*-?\s*(\d{3,5})(.*)$/i);
  let code = "";
  let title = base.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();

  if (match) {
    code = `${match[1].toUpperCase()}-${match[2]}`;
    const remainder = match[3] || "";
    // A human title is separated by an underscore or a space, never by a dash
    // or another storage id (e.g. BTCS-402-A1184).
    const human = remainder.match(/^[_ ]+([A-Za-z][A-Za-z0-9 .&()/+-]*)$/);
    if (human) {
      const rest = human[1].replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
      const isNoise =
        !rest ||
        /^pdf$/i.test(rest) ||
        /^A[A-Z]{1,5}\d{2,}$/i.test(rest) ||
        /^[A-Z]{0,3}\d{3,}$/i.test(rest) ||
        /^[A-Z]+-\d+/i.test(rest);
      title = isNoise ? code : rest;
    } else {
      title = code;
    }
  }

  // Storage-first names: 15925_BSC_101_Nov_2025.pdf → BSC-101
  if (!code) {
    const alt = base.match(/([A-Z]{2,6})\s*[-_ ]\s*(\d{3,5})/i);
    if (alt) {
      code = `${alt[1].toUpperCase()}-${alt[2]}`;
      title = code;
    }
  }

  const department = code
    ? (PAPER_DEPARTMENTS.find(([re]) => re.test(code)) || [])[1] || ""
    : "";

  return { code, title, department };
}

function decodeFileName(url = "") {
  const raw = String(url).split("/").pop() || "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function semesterLabel(list = []) {
  if (!list.length) return "Not stated";
  if (list.length === 1) return `Sem ${list[0]}`;
  const contiguous = list.every((n, i) => i === 0 || n === list[i - 1] + 1);
  if (contiguous) return `Sem ${list[0]}–${list[list.length - 1]}`;
  return `Sem ${list.join(", ")}`;
}

/**
 * Best-effort classification of syllabus PDFs. The document is kept even when
 * the branch or semester is unclear; the UI shows "Not stated" instead of guessing.
 */
function classifySyllabus({ title = "", url = "", branch = "" } = {}) {
  const file = decodeFileName(url).replace(/\.pdf$/i, "");
  const hay = `${title} ${file} ${url}`.toLowerCase();
  const normalizeBranch = (code = "") =>
    ({
      CSE: "CS",
      ECE: "EC",
      CS: "CS",
      EC: "EC",
      CE: "CE",
      EE: "EE",
      ME: "ME",
      IT: "IT",
      RAI: "RAI",
      ARCH: "ARCH",
      AS: "AS",
      MBA: "MBA",
      MCA: "MCA",
      BBA: "BBA",
      BCOM: "BCOM",
      BVOC: "BVOC",
      ALL: "ALL",
    })[code] || code;

  // M.Tech / PhD documents are not part of the undergraduate study library.
  if (/m[.\-\s]?tech|ph[.\-\s]?d|doctoral|mtech/.test(hay)) return null;

  let program = "B.Tech";
  if (/\bbba\b/.test(hay)) program = "BBA";
  else if (/b\.?\s?com|bcom/.test(hay)) program = "BCOM";
  else if (/\bmba\b/.test(hay)) program = "MBA";
  else if (/\bmca\b/.test(hay)) program = "MCA";
  else if (/b\.?\s?arch|barch/.test(hay)) program = "ARCH";
  else if (/b\.?\s?voca?|bvoc/.test(hay)) program = "BVOC";

  let detected = "";
  if (/civil|btce|bcte|\bce\b/.test(hay)) detected = "CE";
  else if (/computer science|cse|btcs/.test(hay)) detected = "CS";
  else if (/information technology|btit|it syllabus|it scheme/.test(hay)) detected = "IT";
  else if (/electronics|ece|btec/.test(hay)) detected = "EC";
  else if (/electrical|btee/.test(hay)) detected = "EE";
  else if (/mechanical|btme/.test(hay)) detected = "ME";
  else if (/robotics|rai/.test(hay)) detected = "RAI";
  else if (/architecture|barch/.test(hay)) detected = "ARCH";
  else if (/applied science|physics|chemistry|mathematics/.test(hay)) detected = "AS";

  let code = normalizeBranch(detected || branch || (program === "B.Tech" ? "ALL" : program));
  if (program !== "B.Tech" && ["MBA", "MCA", "BBA", "BCOM", "ARCH", "BVOC"].includes(program)) {
    code = program;
  }
  if (!BRANCH_LABELS[code]) code = program === "B.Tech" ? "ALL" : program;

  const semesters = new Set();
  const range =
    hay.match(/sem(?:ester)?s?\s*(\d)\s*(?:to|[-–])\s*(\d)/i) ||
    file.match(/(\d)\s*(?:st|nd|rd|th)?\s*(?:to|[-–])\s*(\d)(?:st|nd|rd|th)?\s*sem/i);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (a >= 1 && b <= 8) for (let n = a; n <= b; n += 1) semesters.add(n);
  }

  for (const m of hay.matchAll(/(?:sem|semester|semester-)\s*[:\-]?\s*(\d(?:\s*(?:,|&|and|\/)\s*\d)*)/gi)) {
    for (const n of m[1].match(/\d/g) || []) semesters.add(Number(n));
  }
  for (const m of hay.matchAll(/(\d)(?:st|nd|rd|th)?\s*(?:,|&|and|\/)\s*(\d)(?:st|nd|rd|th)?\s*sem/gi)) {
    semesters.add(Number(m[1]));
    semesters.add(Number(m[2]));
  }
  for (const m of file.matchAll(/(?:^|[^0-9])([1-8])[_\- ]([1-8])[_\- ]([1-8])[_\- ]([1-8])(?:[^0-9]|$)/g)) {
    for (const n of m.slice(1)) semesters.add(Number(n));
  }
  if (/\b(?:1st|first)\s*year\b/.test(hay)) {
    semesters.add(1);
    semesters.add(2);
  }
  const semList = [...semesters].filter((n) => n >= 1 && n <= 8).sort((a, b) => a - b);

  const schemeMatch =
    hay.match(/(?:scheme|w\.?\s?e\.?\s?f\.?|onward[s]?|batch)[^0-9]{0,24}(20(?:0[0-9]|1[0-9]|2[0-6]))/i) ||
    hay.match(/(20(?:0[0-9]|1[0-9]|2[0-6]))[^0-9]{0,24}(?:scheme|onward[s]?|batch)/i);
  let scheme = schemeMatch ? schemeMatch[1] : "";
  if (!scheme) {
    const years = [...hay.matchAll(/\b(20(?:1[4-9]|2[0-6]))\b/g)].map((m) => m[1]);
    scheme = years[0] || "";
  }
  if (!schemeMatch && /draft/.test(hay)) scheme = "";

  const cleanTitle = (title || file)
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[-–\s]+|[-–\s]+$/g, "")
    .trim();

  return {
    code,
    branch: code,
    branchName: BRANCH_LABELS[code] || "Other",
    program,
    semesters: semList,
    semester: semesterLabel(semList),
    scheme: scheme ? String(scheme) : "",
    title: cleanTitle,
    file,
  };
}

function parseTimeToMinutes(t) {
  const m = String(t).match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/* ------------------------------------------------------------------ */
/* 1. Timetable                                                        */
/* ------------------------------------------------------------------ */

console.log("→ timetable");
const sectionHtml = await fetchText(TIMETABLE.sections);
const subgroupHtml = await fetchText(TIMETABLE.subgroups);
source("Section-wise timetable (FET)", TIMETABLE.sections, "timetable", { contentHash: hash(sectionHtml) });
source("Sub-section-wise timetable (FET)", TIMETABLE.subgroups, "timetable");
source("Faculty timetable (FET)", TIMETABLE.teachers, "timetable");
source("Room timetable (FET)", TIMETABLE.rooms, "timetable");
source("Timetable index (APPSC)", TIMETABLE.index, "index");

const sectionsParsed = parseTimetableHtml(sectionHtml, { kind: "section" });
const subgroupsParsed = parseTimetableHtml(subgroupHtml, { kind: "subgroup" });

const normalizeTeacher = (name) =>
  titleCaseName(cleanTeacherName(name))
    .replace(/\b(Dr|Er|Ms|Mrs|Mr|Prof|Sh|Smt)\.{2,}/gi, "$1.")
    .replace(/\(\s*ta\s*\)/gi, "(TA)")
    .replace(/\s+/g, " ")
    .trim();

const sectionIndex = new Map(sectionsParsed.groups.map((g) => [g.id, g]));

function hydrate(group, kind) {
  return {
    id: group.id,
    year: group.year,
    semester: group.semester,
    branch: group.branch,
    branchName: group.branchName,
    program: group.program,
    group: group.group,
    label: group.label,
    kind,
    lectures: group.entries.map((e, i) => {
      const teachers = splitTeachers(e.teacher).map(normalizeTeacher);
      return {
        id: `${group.id}-${e.day}-${e.period}-${i}`,
        day: e.day,
        period: e.period,
        start: e.start,
        end: e.end,
        subject: e.subject.replace(/\s+/g, " ").trim(),
        teacher: teachers.join(", "),
        teachers,
        room: e.room || "",
        ...(e.subsection && kind === "section" ? { subsection: e.subsection } : {}),
      };
    }),
  };
}

const sections = sectionsParsed.groups.map((g) => hydrate(g, "section"));
const subgroups = subgroupsParsed.groups.map((g) => hydrate(g, "subgroup"));

const periods = sectionsParsed.periods;

const days = {
  0: "Monday",
  1: "Tuesday",
  2: "Wednesday",
  3: "Thursday",
  4: "Friday",
  5: "Saturday",
};

/* ------------------------------------------------------------------ */
/* 2. Rooms                                                            */
/* ------------------------------------------------------------------ */

console.log("→ rooms");
const roomsHtml = await fetchText(TIMETABLE.rooms);
const roomNames = [...roomsHtml.matchAll(/<span class="name">([\s\S]*?)<\/span>/gi)]
  .map((m) => m[1].replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").trim())
  .filter(Boolean);

function roomPlace(room) {
  const r = room.toUpperCase().replace(/\s+/g, " ").trim();
  if (/^F\d{2,4}/.test(r)) return "f-block";
  if (/^S-?\d{2,4}/.test(r)) return "s-block";
  if (/^G\s?\d+/.test(r)) return "g-block";
  if (/^A\d+/.test(r)) return "automobile-block";
  if (/IT DEPT|OS1|PL1|WD LAB|HPC LAB|DBMS LAB IT/.test(r)) return "it-dept";
  if (/CSE DEPT|SL-|SL I|R LAB|OS LAB|PL LAB/.test(r)) return "cse-dept";
  if (/MBA/.test(r)) return "business-admin";
  if (/COMP LAB EC|S & R|PS LAB|ID LAB|TI\/L|COMM\/L|MWR\/L|HW LAB/.test(r)) return "ec-dept";
  if (/COMP LAB EE|BEE LAB|PE LAB/.test(r)) return "ee-dept";
  if (/COMP LAB CE|GEOTECH|SURVEY/.test(r)) return "ce-dept";
  if (/HT LAB|HE LAB|DOMS|IAR|CGL|ME DEPT/.test(r)) return "me-dept";
  if (/ENG LAB|PHY LAB|CHEM LAB|MEASUREMENT LAB|ADVANCE MEASUREMENT/.test(r)) return "applied-science";
  if (/WORKSHOP|W\/S/.test(r)) return "workshops";
  if (/TNP/.test(r)) return "admin-block";
  if (/SEMINAR HALL BA/.test(r)) return "business-admin";
  return null;
}

function roomFloor(room) {
  const r = room.toUpperCase().trim();
  if (/^F(\d)/.test(r)) return Number(r[1]);
  if (/^S-?(\d)/.test(r)) return Number(r[1]);
  if (/^G/.test(r)) return 0;
  if (/^A\d/.test(r)) return 0;
  return null;
}

const roomSet = new Set([...roomNames, ...sections.flatMap((s) => s.lectures.map((l) => l.room)).filter(Boolean)]);
const rooms = [...roomSet]
  .filter((r) => r && r !== "---")
  .sort((a, b) => a.localeCompare(b))
  .map((room) => {
    const usage = sections.flatMap((s) =>
      s.lectures.filter((l) => l.room === room).map((l) => ({ section: s.id, ...l })),
    );
    return {
      id: slugify(room) || room.toLowerCase(),
      name: room,
      place: roomPlace(room),
      floor: roomFloor(room),
      inferred: true,
      photo: roomPhoto(room),
      photoCredit: roomPhoto(room) ? ROOM_PHOTO_CREDIT : "",
      lecturesPerWeek: usage.length,
      sections: [...new Set(usage.map((u) => u.section))].slice(0, 20),
    };
  });

/* ------------------------------------------------------------------ */
/* 3. Faculty                                                          */
/* ------------------------------------------------------------------ */

console.log("→ faculty");
const faculty = [];
for (const [deptId, deptName, code] of FACULTY_DEPTS) {
  try {
    const html = await fetchText(`https://gndec.ac.in/faculty/?deptt=${deptId}`);
    source(`Faculty directory — ${deptName}`, `https://gndec.ac.in/faculty/?deptt=${deptId}`, "faculty");
    const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    for (const row of rows) {
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
        stripTags(m[1]),
      );
      if (cells.length < 3) continue;
      const [name, designation, email] = cells;
      if (!name || !email.includes("@")) continue;
      const idMatch = row[1].match(/faculty\/\?id=(\d+)/);
      faculty.push({
        id: `fac-${deptId}-${idMatch ? idMatch[1] : slugify(name)}`,
        name: normalizeTeacher(name),
        rawName: name,
        designation: designation.replace(/\.$/, ""),
        email,
        department: deptName,
        deptCode: code,
        deptId,
        profileUrl: idMatch ? `https://gndec.ac.in/faculty/?id=${idMatch[1]}` : "",
      });
    }
  } catch (err) {
    console.warn(`  ! faculty dept ${deptName}: ${err.message}`);
  }
}

// Snapshot of the public faculty directory (with photos and profiles).
const directoryFile = join(ROOT, "scripts", "seed", "faculty-directory.json");
const directoryRaw = JSON.parse(await readFile(directoryFile, "utf8"));
const directory = Array.isArray(directoryRaw) ? directoryRaw : directoryRaw.records || [];
source(
  "Public faculty directory with photos and profiles",
  "https://gndec.ac.in/faculty/",
  "faculty-profiles",
  { count: directory.length },
);

const DEPT_CODE_BY_NAME = {
  "Applied Science": "AS",
  "Computer Center": "CC",
  "Computer Centre": "CC",
  Workshops: "WS",
  Sports: "SP",
  "Civil Engineering": "CE",
  "Computer Science & Engg.": "CSE",
  "Computer Science & Engineering": "CSE",
  "Electrical Engineering": "EE",
  "Electronics & Communication Engineering": "ECE",
  "Electronics & Communication": "EC",
  "Information Technology": "IT",
  "Business Administration": "MBA",
  "Computer Applications": "MCA",
  "Mechanical Engineering": "ME",
  "Production Engineering": "PE",
  "School of Architecture": "ARCH",
};

const DEPT_LABEL_BY_CODE = {
  AS: "Applied Science",
  CC: "Computer Centre",
  WS: "Workshops",
  SP: "Sports",
  CE: "Civil Engineering",
  CSE: "Computer Science & Engineering",
  EE: "Electrical Engineering",
  ECE: "Electronics & Communication",
  IT: "Information Technology",
  MBA: "Business Administration",
  MCA: "Computer Applications",
  ME: "Mechanical Engineering",
  PE: "Production Engineering",
  ARCH: "School of Architecture",
};

const cleanDept = (name = "") => {
  const key = String(name).trim();
  if (DEPT_CODE_BY_NAME[key]) return DEPT_LABEL_BY_CODE[DEPT_CODE_BY_NAME[key]];
  if (/Computer Science/i.test(key)) return "Computer Science & Engineering";
  if (/Electronics/i.test(key)) return "Electronics & Communication";
  return key;
};

const directoryPeople = directory
  .map((f) => {
    const deptCode = DEPT_CODE_BY_NAME[String(f.department || "").trim()] || "";
    return {
      id: `fac-${f.profileId || slugify(f.name)}`,
      name: normalizeTeacher(f.name),
      rawName: f.name,
      designation: String(f.designation || "").replace(/\.$/, ""),
      email: f.email || "",
      department: cleanDept(f.department),
      deptCode,
      profileUrl: f.profileUrl || "",
      photoUrl: f.photoUrl || "",
      experience: f.experience || "",
      qualifications: f.qualifications || "",
      researchInterests: f.researchInterests || "",
      publications: {
        journals: f.journalPublications || "",
        conferences: f.conferencePublications || "",
      },
      memberships: f.memberships || "",
      source: "official-directory",
      verifiedProfile: true,
      teaches: false,
      hoursPerWeek: 0,
      subjects: [],
      rooms: [],
      sections: [],
      lectures: [],
    };
  })
  .filter((p) => p.name);

const teacherMap = new Map();
const directoryByKey = new Map();
for (const person of directoryPeople) {
  const key = teacherKey(person.name);
  if (!key) continue;
  if (!directoryByKey.has(key)) directoryByKey.set(key, person);
  if (!teacherMap.has(key)) teacherMap.set(key, { ...person });
}
// Department-page rows add anyone who is not in the snapshot yet.
for (const f of faculty) {
  const key = teacherKey(f.name);
  if (!key || teacherMap.has(key)) continue;
  const person = {
    id: f.id,
    name: f.name,
    rawName: f.rawName,
    designation: f.designation,
    email: f.email,
    department: cleanDept(f.department),
    deptCode: f.deptCode,
    profileUrl: f.profileUrl,
    photoUrl: "",
    experience: "",
    qualifications: "",
    researchInterests: "",
    publications: { journals: "", conferences: "" },
    memberships: "",
    source: "official-directory",
    verifiedProfile: true,
    teaches: false,
    hoursPerWeek: 0,
    subjects: [],
    rooms: [],
    sections: [],
    lectures: [],
  };
  directoryByKey.set(key, person);
  teacherMap.set(key, { ...person });
}

function findPerson(name) {
  const key = teacherKey(name);
  if (!key) return null;
  if (directoryByKey.has(key)) return directoryByKey.get(key);
  const parts = key.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    const surname = parts[parts.length - 1];
    const initial = parts[0][0];
    const candidates = directoryPeople.filter((p) => {
      const fk = teacherKey(p.name).split(" ").filter(Boolean);
      return fk[fk.length - 1] === surname && fk[0][0] === initial;
    });
    if (candidates.length === 1) return candidates[0];
  }
  return null;
}

const timetableTeachers = new Map();
for (const group of sections) {
  for (const lecture of group.lectures) {
    for (const name of lecture.teachers) {
      const key = teacherKey(name);
      if (!key) continue;
      if (!timetableTeachers.has(key)) {
        timetableTeachers.set(key, {
          name,
          lectures: [],
          subjects: new Set(),
          rooms: new Set(),
          groups: new Set(),
        });
      }
      const t = timetableTeachers.get(key);
      t.lectures.push({ group: group.id, day: lecture.day, start: lecture.start, end: lecture.end, subject: lecture.subject, room: lecture.room });
      t.subjects.add(lecture.subject);
      if (lecture.room) t.rooms.add(lecture.room);
      t.groups.add(group.id);
    }
  }
}

for (const t of timetableTeachers.values()) {
  const match = findPerson(t.name);
  const key = match ? teacherKey(match.name) : teacherKey(t.name);
  let entry = teacherMap.get(key);
  if (!entry) {
    entry = {
      id: `t-${slugify(t.name)}`,
      name: t.name,
      rawName: t.name,
      designation: "",
      email: "",
      department: "",
      deptCode: "",
      profileUrl: "",
      photoUrl: "",
      experience: "",
      qualifications: "",
      researchInterests: "",
      publications: { journals: "", conferences: "" },
      memberships: "",
      source: "timetable-only",
      verifiedProfile: false,
      teaches: false,
      hoursPerWeek: 0,
      subjects: [],
      rooms: [],
      sections: [],
      lectures: [],
    };
    teacherMap.set(key, entry);
  }

  const hours = t.lectures.reduce((sum, l) => {
    const a = parseTimeToMinutes(l.start);
    const b = parseTimeToMinutes(l.end);
    return sum + (a != null && b != null ? (b - a) / 60 : 1);
  }, 0);

  entry.teaches = true;
  entry.hoursPerWeek = Math.round(hours * 10) / 10;
  entry.subjects = [...new Set([...entry.subjects, ...t.subjects])].sort();
  entry.rooms = [...new Set([...entry.rooms, ...t.rooms])].sort();
  entry.sections = [...new Set([...entry.sections, ...t.groups])].sort();
  entry.lectures = t.lectures.sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
}

const teachers = [...teacherMap.values()].sort((a, b) => {
  if (a.teaches !== b.teaches) return a.teaches ? -1 : 1;
  return a.name.localeCompare(b.name);
});

/* ------------------------------------------------------------------ */
/* 4. Students                                                         */
/* ------------------------------------------------------------------ */

console.log("→ students");
let students = [];
const rosterFiles = [];
if (SKIP_PDF && existsSync(join(OUT, "students.json"))) {
  students = JSON.parse(await readFile(join(OUT, "students.json"), "utf8")).students || [];
  console.log("  (kept previous students.json)");
} else {
  for (const spec of ROSTERS) {
    try {
      const buf = await fetchBuffer(spec.url);
      const rows = await parseRosterPdf(buf, { batch: spec.batch, sourceUrl: spec.url });
      rosterFiles.push({ ...spec, count: rows.length });
      source(`Student roster — ${spec.branch} ${spec.batch}`, spec.url, "roster", { count: rows.length });
      for (const row of rows) {
        const section = (row.section || spec.section || "").toUpperCase();
        const tableGroup =
          spec.year === 1
            ? section
            : section.startsWith("D")
              ? section
              : section
                ? `D${spec.year}${section}`
                : "";
        const subgroup =
          spec.year === 1
            ? row.subsection
            : row.subsection
              ? row.subsection.startsWith("D")
                ? row.subsection
                : `D${spec.year}${row.subsection}`
              : "";
        students.push({
          ...row,
          batch: spec.batch,
          year: spec.year,
          branch: row.branch || spec.branch,
          section,
          subgroup,
          group: tableGroup,
          sourceUrl: spec.url,
        });
      }
    } catch (err) {
      console.warn(`  ! roster ${spec.branch} ${spec.batch}: ${err.message}`);
      SOURCES.push({ label: `Student roster — ${spec.branch} ${spec.batch}`, url: spec.url, kind: "roster", error: String(err.message), fetchedAt: new Date().toISOString() });
    }
  }
  students = uniqueBy(students, (s) => s.crn || `${s.registrationNo}-${s.name}`);
  students.sort((a, b) => (a.year - b.year) || a.name.localeCompare(b.name));
}

/* ------------------------------------------------------------------ */
/* 5. Notices, holidays, papers                                        */
/* ------------------------------------------------------------------ */

console.log("→ notices & holidays");
let notices = [];
let holidays = [];
try {
  const feed = await nextTrpc("campus.notices", null);
  notices = (feed?.notices || []).map((n) => ({
    id: n.id,
    title: n.title,
    date: n.publishedDate || "",
    displayDate: n.displayDate || "",
    url: n.url,
    author: n.author || "",
    source: n.source || "GNDEC",
    kind: classifyNotice(n.title),
  }));
  source("College notices (homepage + ERP)", "https://gndec.ac.in/ · https://erp.gndec.ac.in/notice", "notices", { count: notices.length });
} catch (err) {
  console.warn("  ! notices:", err.message);
}
try {
  const feed = await nextTrpc("campus.holidays", null);
  holidays = (feed?.holidays || []).map((h) => ({
    id: h.id,
    name: h.name,
    date: h.date,
    displayDate: h.displayDate,
    weekday: h.weekday,
    category: h.category,
    year: h.year,
    source: h.source,
  }));
  source("List of holidays 2026", "https://gndec.ac.in/?q=holidays", "holidays", { count: holidays.length });
} catch (err) {
  console.warn("  ! holidays:", err.message);
}

function classifyNotice(title = "") {
  const t = title.toLowerCase();
  if (/date sheet|datesheet|examination|exam form|mse|result|seating|makeup/.test(t)) return "exam";
  if (/fee|scholarship|pms|registration|detention|readmission|document|id card|struck/.test(t)) return "admin";
  if (/workshop|conference|seminar|fest|sports|cultural|hackathon|webinar|ncc|nss/.test(t)) return "event";
  if (/admission|counsel/.test(t)) return "admission";
  return "general";
}

console.log("→ papers");
let paperSessions = [];
let papers = [];
try {
  const sessions = await nextTrpc("previousPapers.sessions", null);
  paperSessions = sessions || [];
  for (const session of paperSessions) {
    try {
      const out = await nextTrpc("previousPapers.papers", { sessionId: session.id });
      const list = out?.papers || [];
      for (const p of list) {
        const meta = paperMeta(p.name);
        papers.push({
          id: p.id,
          name: p.name,
          code: meta.code,
          title: meta.title,
          department: meta.department,
          session: session.label,
          year: session.year,
          term: session.term,
          makeup: Boolean(session.makeup),
          view: p.viewUrl,
          download: p.downloadUrl,
        });
      }
    } catch (err) {
      console.warn(`  ! papers ${session.label}: ${err.message}`);
    }
  }
  source("Previous year papers (shared GNDEC archive)", "https://drive.google.com/drive/folders/11ywkOKyeixCPihsCzqZDyzy2msLXxx6w", "papers", {
    count: papers.length,
    note: "Folder metadata read through the public NextLecture index; every link opens the original PDF in the shared GNDEC Drive archive.",
  });
} catch (err) {
  console.warn("  ! papers:", err.message);
}

/* ------------------------------------------------------------------ */
/* 6. Syllabus + question banks                                        */
/* ------------------------------------------------------------------ */

console.log("→ syllabus");
const syllabusRaw = SYLLABUS_SEED.map((s) => ({ ...s, sourcePage: "official" }));
const discovered = new Set(syllabusRaw.map((s) => s.url));
for (const page of CRAWL_PAGES) {
  try {
    const html = await fetchText(page.url);
    source(`Academics page — ${page.branch}`, page.url, "syllabus-index");
    const links = [...html.matchAll(/href="([^"]+\.pdf)"/gi)].map((m) => m[1]);
    for (const raw of links) {
      const url = raw.startsWith("http") ? raw : new URL(raw, page.url).href;
      if (discovered.has(url)) continue;
      if (!/syllab|scheme|curric/i.test(url)) continue;
      if (/minor|mooc|nptel/i.test(url)) continue;
      discovered.add(url);
      syllabusRaw.push({
        branch: page.branch,
        title: decodeFileName(url).replace(/\.pdf$/i, ""),
        url,
        sourcePage: page.branch,
      });
    }
  } catch (err) {
    console.warn(`  ! syllabus ${page.branch}: ${err.message}`);
  }
}

const syllabus = [];
for (const doc of syllabusRaw) {
  const classified = classifySyllabus({ title: doc.title, url: doc.url, branch: doc.branch });
  if (!classified) continue;
  syllabus.push({
    id: `syl-${slugify(classified.file || doc.url).slice(0, 80)}`,
    ...classified,
    title: doc.title || classified.title,
    url: doc.url,
    scheme: doc.scheme || classified.scheme,
    sourcePage: doc.sourcePage || "",
  });
}

let questionBanks = [];
try {
  const html = await fetchText("https://it.gndec.ac.in/?q=sqb");
  source("Subject Question Bank — IT Department", "https://it.gndec.ac.in/?q=sqb", "notes");
  questionBanks = [...html.matchAll(/href="([^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => {
      const title = stripTags(m[2]);
      return {
        id: `qb-${slugify(title).slice(0, 70)}`,
        title,
        url: m[1].startsWith("http") ? m[1] : new URL(m[1], "https://it.gndec.ac.in/").href,
      };
    })
    .filter((q) => q.title && !/\.pdf$/i.test(q.title));
} catch (err) {
  console.warn("  ! question banks:", err.message);
}

let firstYearSyllabus = null;
try {
  const raw = JSON.parse(await readFile(join(ROOT, "scripts", "seed", "first-year-syllabus.json"), "utf8"));
  firstYearSyllabus = {
    source: raw.source,
    generatedAt: raw.generatedAt,
    pages: (raw.pages || []).map((p) => ({ number: p.number, text: p.text })),
  };
} catch (err) {
  console.warn(`  ! first-year syllabus text: ${err.message}`);
}

const contactsSeed = JSON.parse(await readFile(join(ROOT, "scripts", "seed", "contacts.json"), "utf8"));
const knowledgeSeed = JSON.parse(await readFile(join(ROOT, "scripts", "seed", "knowledge.json"), "utf8"));

/* ------------------------------------------------------------------ */
/* 7. Campus                                                           */
/* ------------------------------------------------------------------ */

console.log("→ campus");
const campus = JSON.parse(await readFile(join(ROOT, "scripts", "seed", "campus.json"), "utf8"));
const rawOsm = JSON.parse(await readFile(join(ROOT, "scripts", "seed", "osm.json"), "utf8"));
const B = { minLat: 30.8548, maxLat: 30.8642, minLon: 75.8572, maxLon: 75.8658 };
function project(lon, lat) {
  return [
    Math.round(((lon - B.minLon) / (B.maxLon - B.minLon)) * 10000) / 10000,
    Math.round(((B.maxLat - lat) / (B.maxLat - B.minLat)) * 10000) / 10000,
  ];
}
const geometry = [];
for (const el of rawOsm) {
  if (!el.geometry || el.geometry.length < 3 || !el.tags) continue;
  const type = el.tags.building ? "building" : el.tags.leisure ? "leisure" : el.tags.amenity ? "amenity" : null;
  if (!type) continue;
  if (el.tags.building === "house" || el.tags.building === "apartments") continue;
  const pts = el.geometry.map((p) => project(p.lon, p.lat));
  geometry.push({
    id: String(el.id),
    type,
    kind: el.tags.building || el.tags.leisure || el.tags.amenity || "",
    name: el.tags.name || "",
    pts,
  });
}
campus.geometry = geometry;
campus.bounds = B;
for (const place of campus.places) place.pos = project(place.lon, place.lat);
for (const junction of campus.junctions) junction.pos = project(junction.lon, junction.lat);

// Merge photo-guided places that are not in the hand-checked seed map yet.
for (const extra of EXTRA_PLACES) {
  if (!campus.places.some((place) => place.id === extra.id)) {
    campus.places.push({ ...extra, pos: project(extra.lon, extra.lat) });
  }
}

for (const place of campus.places) {
  const photo = PLACE_PHOTOS[place.id];
  if (photo) {
    place.photo = photo[0];
    place.photoCredit = photo[1];
  }
}

campus.gallery = GALLERY;

campus.facts = {
  established: 1953,
  campusAcres: 86,
  address: "Gill Park, Gill Road, Ludhiana, Punjab 141006",
  phone: "0161-5064501",
  email: "principal@gndec.ac.in",
  website: "https://gndec.ac.in/",
  autonomous: true,
  affiliatedTo: "IK Gujral Punjab Technical University (PTU)",
  distanceBusStandKm: 5,
  distanceRailwayStationKm: 8,
  hostels: "Three boys' hostels and one girls' hostel, about 1,200 residents",
  note: "Campus facts are from the official GNDEC Campus page. GNDEC and GND Polytechnic share the same campus and many facilities.",
};

campus.mapLinks = [
  { label: "OpenStreetMap campus polygon", url: "https://www.openstreetmap.org/way/38152756" },
  { label: "OpenStreetMap (main gate)", url: "https://www.openstreetmap.org/?mlat=30.8598&mlon=75.8637#map=18/30.8598/75.8637" },
  { label: "MapCarta — GNDEC", url: "https://mapcarta.com/W38152756" },
  { label: "Apple Maps", url: "https://maps.apple.com/place?place-id=I8189CCCAA7E0DDB0" },
  { label: "GND Polytechnic campus map", url: "https://www.gndpoly.org/CollegeMap2.php" },
  { label: "Google Maps directions to GNDEC", url: "https://www.google.com/maps/dir/?api=1&destination=30.8598,75.8637" },
];

campus.generatedAt = new Date().toISOString();

/* ------------------------------------------------------------------ */
/* 8. Write                                                            */
/* ------------------------------------------------------------------ */

console.log("→ writing");
const now = new Date().toISOString();
const syllabusDocs = uniqueBy(syllabus, (s) => s.url);
const timetable = {
  schemaVersion: 2,
  generatedAt: now,
  source: {
    label: "Official FET timetable export — 17 Sep 2026",
    url: TIMETABLE.sections,
    index: TIMETABLE.index,
    version: "17-09-2026",
  },
  days,
  periods,
  sections,
  subgroups,
};

const contacts = {
  generatedAt: now,
  checkedAt: contactsSeed.checkedAt || "",
  source: contactsSeed.source || "https://gndec.ac.in/?q=node/6",
  roles: contactsSeed.roles || [],
  people: contactsSeed.people || [],
};

const knowledge = {
  generatedAt: now,
  ...knowledgeSeed,
  campusFacts: campus.facts,
  mapLinks: campus.mapLinks,
  gallery: campus.gallery,
  emergencyNote:
    "The college publishes office landlines and role emails. Personal mobile numbers are not reproduced here.",
};

await writeJson(join(OUT, "timetable.json"), timetable);
await writeJson(join(OUT, "rooms.json"), { generatedAt: now, rooms });
await writeJson(join(OUT, "teachers.json"), {
  generatedAt: now,
  count: teachers.length,
  teachesCount: teachers.filter((t) => t.teaches).length,
  teachers,
});
await writeJson(join(OUT, "students.json"), {
  generatedAt: now,
  batches: [...new Set(students.map((s) => s.batch))].sort().reverse(),
  years: [...new Set(students.map((s) => s.year))].sort(),
  count: students.length,
  students,
});
await writeJson(join(OUT, "notices.json"), {
  generatedAt: now,
  notices,
  holidays,
  exams: notices.filter((n) => n.kind === "exam"),
});
await writeJson(join(OUT, "papers.json"), {
  generatedAt: now,
  sessions: paperSessions.map((s) => ({
    ...s,
    count: papers.filter((p) => p.session === s.label).length,
  })),
  count: papers.length,
  codes: [...new Set(papers.map((p) => p.code).filter(Boolean))].sort(),
  papers,
});
await writeJson(join(OUT, "syllabus.json"), {
  generatedAt: now,
  documents: syllabusDocs,
  questionBanks,
  firstYear: firstYearSyllabus,
  notes: [],
});
await writeJson(join(OUT, "campus.json"), campus);
await writeJson(join(OUT, "contacts.json"), contacts);
await writeJson(join(OUT, "knowledge.json"), knowledge);

/* A compact cross-app index. Loaded lazily the first time search opens. */
const searchIndex = [];
const addSearch = (type, id, title, sub, to, keywords = "") =>
  searchIndex.push({ t: type, id, title, sub, to, k: keywords });

for (const [label, to, keywords] of [
  ["Today", "#/today", "home dashboard next class"],
  ["Timetable", "#/timetable", "schedule classes periods week"],
  ["People", "#/people", "teachers faculty students search crn"],
  ["Rasta", "#/rasta", "map route directions campus places rooms"],
  ["Study", "#/study", "syllabus papers notes question bank"],
  ["Notices", "#/notices", "notice circular holidays"],
  ["Exams", "#/exams", "exam date sheet tips"],
  ["Assistant", "#/assistant", "ai ask compass help"],
  ["Settings", "#/settings", "theme offline install accessibility"],
  ["Admin", "#/admin", "data sources refresh export"],
  ["About", "#/about", "college campus facts credits"],
]) {
  addSearch("page", to, label, "Open section", to, keywords);
}

for (const s of sections) {
  addSearch("section", s.id, s.id, `${s.label} · ${s.lectures.length} lectures/week`, `#/timetable/${s.id}`, `${s.branch} ${s.branchName} ${s.year} ${s.group}`);
}
for (const t of teachers) {
  addSearch("teacher", t.id, t.name, [t.designation, t.department].filter(Boolean).join(" · ") || "Faculty", `#/people/teacher/${t.id}`, `${t.email} ${t.subjects.join(" ")} ${t.sections.join(" ")}`);
}
for (const s of students) {
  addSearch("student", s.crn || s.registrationNo, s.name, `${s.group} · ${s.batch} batch${s.mentor ? ` · ${s.mentor}` : ""}`, `#/people/student/${s.crn || s.registrationNo}`, `${s.registrationNo} ${s.section} ${s.subgroup} ${s.branch}`);
}
for (const r of rooms) {
  addSearch("room", r.id, r.name, r.place ? `Room · ${r.place}` : "Room", `#/rasta/room/${r.id}`, `${r.sections.join(" ")}`);
}
for (const p of campus.places) {
  addSearch("place", p.id, p.name, `${p.category}${p.description ? ` · ${p.description.slice(0, 80)}` : ""}`, `#/rasta/place/${p.id}`, `${p.aliases.join(" ")} ${p.category}`);
}
for (const p of papers) {
  addSearch("paper", p.id, p.code || p.title, `${p.session}${p.department ? ` · ${p.department}` : ""}`, `#/study?tab=papers&q=${encodeURIComponent(p.code || p.title)}`, `${p.title} ${p.code} ${p.session}`);
}
for (const n of notices) {
  addSearch("notice", n.id, n.title, `${n.kind} · ${n.displayDate || n.date}`, `#/notices/${n.id}`, `${n.kind} ${n.author} ${n.source}`);
}
for (const d of syllabusDocs) {
  addSearch("syllabus", d.id, d.title, `${d.branchName} · ${d.semester}${d.scheme ? ` · Scheme ${d.scheme}` : ""}`, `#/study?tab=syllabus&q=${encodeURIComponent(d.title)}`, `${d.branch} ${d.semester} ${d.scheme}`);
}
for (const q of questionBanks) {
  addSearch("notes", q.id, q.title, "Question bank · IT department", `#/study?tab=notes&q=${encodeURIComponent(q.title)}`, q.title);
}
await writeJson(join(OUT, "search.json"), {
  generatedAt: now,
  count: searchIndex.length,
  entries: searchIndex,
});

const counts = {
  sections: sections.length,
  subgroups: subgroups.length,
  lectures: sections.reduce((n, s) => n + s.lectures.length, 0),
  teachers: teachers.length,
  verifiedTeachers: teachers.filter((t) => t.verifiedProfile).length,
  teachingFaculty: teachers.filter((t) => t.teaches).length,
  students: students.length,
  rooms: rooms.length,
  notices: notices.length,
  holidays: holidays.length,
  papers: papers.length,
  paperCodes: new Set(papers.map((p) => p.code).filter(Boolean)).size,
  syllabus: syllabusDocs.length,
  questionBanks: questionBanks.length,
  places: campus.places.length,
  photos: campus.gallery.length,
  contacts: contacts.roles.length,
  firstYearSyllabusPages: firstYearSyllabus?.pages.length || 0,
  searchEntries: searchIndex.length,
};

const meta = {
  app: "gndec-one",
  dataVersion: new Date().toISOString().slice(0, 10).replace(/-/g, "."),
  generatedAt: new Date().toISOString(),
  sourceHash: hash(sectionHtml),
  timetableVersion: "17-09-2026",
  counts,
  coverage: {
    timetableYears: [...new Set(sections.map((s) => s.year))].sort(),
    timetableBranches: [...new Set(sections.map((s) => s.branch))].sort(),
    studentBatches: [...new Set(students.map((s) => s.batch))].sort().reverse(),
    programs: [...new Set(sections.map((s) => s.program))].sort(),
    missing: [
      "4th-year timetable is not present in the official FET export",
      "4th-year (2023 batch) student roster is not published",
      "3rd-year rosters are not published (the 2025-10 PDFs are Batch 2025, not Batch 2024)",
      "Exam seating plans and consolidated date sheets are login-only (not public)",
      "Faculty cabin numbers are not published",
      "Classroom interiors, library reading hall and admission cell photos are not published on the official site",
      "Official room-to-block mapping is not published; block links in the app are inferred from room codes",
      "Notes and question banks are only published by the IT department; other departments publish none publicly",
      "Attendance, internal marks and personalised exam data require the student ERP login",
      "Hostel allotment, mess menu and bus route timings are not published as live data",
    ],
  },
};
await writeJson(join(OUT, "meta.json"), meta);
await writeJson(join(OUT, "sources.json"), {
  generatedAt: meta.generatedAt,
  sources: uniqueBy(SOURCES, (s) => `${s.url}|${s.label}`),
  rosterFiles,
});

console.log("\nDone.");
console.log(counts);
console.log(`files → ${OUT}`);
