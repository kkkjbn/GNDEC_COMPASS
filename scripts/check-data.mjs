import fs from "node:fs";
import path from "node:path";

const DATA = "public/data";
const problems = [];
const notes = [];

function read(name) {
  const file = path.join(DATA, `${name}.json`);
  if (!fs.existsSync(file)) {
    problems.push(`missing ${file}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    problems.push(`${file} is not valid JSON: ${err.message}`);
    return null;
  }
}

function check(condition, message) {
  if (!condition) problems.push(message);
}

function scanText(value, where) {
  if (typeof value === "string") {
    if (value.includes("\uFFFD")) problems.push(`replacement character in ${where}: ${value.slice(0, 90)}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanText(item, `${where}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) scanText(item, `${where}.${key}`);
  }
}

const timetable = read("timetable");
const students = read("students");
const teachers = read("teachers");
const papers = read("papers");
const syllabus = read("syllabus");
const rooms = read("rooms");
const notices = read("notices");
const campus = read("campus");
const meta = read("meta");
const contacts = read("contacts");
const knowledge = read("knowledge");

for (const [name, data] of Object.entries({ timetable, students, teachers, papers, syllabus, rooms, notices, campus, meta, contacts, knowledge })) {
  if (data) scanText(data, name);
}

if (timetable) {
  check(timetable.sections?.length >= 50, `expected at least 50 timetable sections, found ${timetable.sections?.length}`);
  const sectionIds = new Set((timetable.sections || []).map((section) => section.id));
  check(sectionIds.size === timetable.sections?.length, "duplicate section ids in timetable");
  const valid = { "1": true, "2": true, "3": true, "4": true };
  for (const section of timetable.sections || []) {
    check(Boolean(section.id), "section without id");
    check(valid[String(section.year)], `section ${section.id} has invalid year ${section.year}`);
    check(Boolean(section.branch), `section ${section.id} has no branch`);
    for (const lecture of section.lectures || []) {
      check(Array.isArray(lecture) || typeof lecture === "object", `malformed lecture in ${section.id}`);
    }
  }
  for (const subgroup of timetable.subgroups || []) {
    check(Boolean(subgroup.id), "subgroup without id");
  }
}

if (students) {
  check(students.students?.length === students.count, `students.count ${students.count} does not match ${students.students?.length}`);
  const crns = new Set();
  for (const student of students.students || []) {
    check(/^\d{7}$/.test(String(student.crn)), `student ${student.name} has an invalid CRN ${student.crn}`);
    check(!crns.has(student.crn), `duplicate CRN ${student.crn}`);
    crns.add(student.crn);
    check(Boolean(student.name), `student ${student.crn} has no name`);
    check(Boolean(student.branch), `student ${student.crn} has no branch`);
    check(Boolean(student.section), `student ${student.crn} has no section`);
  }
}

if (teachers) {
  check(teachers.teachers?.length === teachers.count, `teachers.count ${teachers.count} does not match ${teachers.teachers?.length}`);
  const ids = new Set();
  for (const teacher of teachers.teachers || []) {
    check(!ids.has(teacher.id), `duplicate teacher id ${teacher.id}`);
    ids.add(teacher.id);
    check(Boolean(teacher.name), `teacher ${teacher.id} has no name`);
  }
}

if (papers) {
  check(papers.papers?.length === papers.count, `papers.count ${papers.count} does not match ${papers.papers?.length}`);
  for (const paper of papers.papers || []) {
    check(Boolean(paper.code), "paper without subject code");
    check(Boolean(paper.title), `paper ${paper.code} has no title`);
  }
}

if (rooms) {
  const names = new Set();
  for (const room of rooms.rooms || []) {
    check(Boolean(room.name), "room without a name");
    check(room.name !== "---", "placeholder room name --- leaked into rooms.json");
    check(!names.has(room.name), `duplicate room ${room.name}`);
    names.add(room.name);
    if (room.photo) {
      const file = path.join("public", room.photo.replace(/^\//, ""));
      check(fs.existsSync(file), `room ${room.name} points at missing photo ${room.photo}`);
    }
  }
}

if (campus) {
  const ids = new Set();
  for (const place of campus.places || []) {
    check(!ids.has(place.id), `duplicate place id ${place.id}`);
    ids.add(place.id);
    check(Number.isFinite(place.lat) && Number.isFinite(place.lon), `place ${place.id} has no coordinates`);
    if (place.photo) {
      const file = path.join("public", place.photo.replace(/^\//, ""));
      check(fs.existsSync(file), `place ${place.id} points at missing photo ${place.photo}`);
    }
  }
  for (const edge of campus.edges || []) {
    check(ids.has(edge.a) || (campus.junctions || []).some((node) => node.id === edge.a), `edge references unknown node ${edge.a}`);
    check(ids.has(edge.b) || (campus.junctions || []).some((node) => node.id === edge.b), `edge references unknown node ${edge.b}`);
  }
  for (const item of campus.gallery || []) {
    if (item.src) {
      const file = path.join("public", item.src.replace(/^\//, ""));
      check(fs.existsSync(file), `gallery item ${item.id || item.title} points at missing image ${item.src}`);
    }
  }
}

if (meta && timetable) {
  const counts = meta.counts || {};
  check(counts.sections === timetable.sections?.length, `meta.counts.sections ${counts.sections} != ${timetable.sections?.length}`);
  check(counts.students === students?.students?.length, `meta.counts.students ${counts.students} != ${students?.students?.length}`);
  check(counts.teachers === teachers?.teachers?.length, `meta.counts.teachers ${counts.teachers} != ${teachers?.teachers?.length}`);
}

notes.push(`sections ${timetable?.sections?.length ?? 0}`);
notes.push(`students ${students?.students?.length ?? 0}`);
notes.push(`teachers ${teachers?.teachers?.length ?? 0}`);
notes.push(`rooms ${rooms?.rooms?.length ?? 0}`);
notes.push(`papers ${papers?.papers?.length ?? 0}`);
notes.push(`places ${campus?.places?.length ?? 0}`);
notes.push(`notices ${notices?.notices?.length ?? 0}`);

if (problems.length) {
  console.error("Data check failed:\n");
  for (const problem of problems.slice(0, 80)) console.error(`  - ${problem}`);
  if (problems.length > 80) console.error(`  …and ${problems.length - 80} more`);
  process.exit(1);
}

console.log(`Data check passed. ${notes.join(" · ")}`);
