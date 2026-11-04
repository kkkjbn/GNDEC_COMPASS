import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { answerQuestion, findSections, shortestRoute, matchSection } from "../public/assets/js/logic.js";

const read = (name) => JSON.parse(fs.readFileSync(new URL(`../public/data/${name}.json`, import.meta.url), "utf8"));

const timetable = read("timetable");
const campus = read("campus");
const rooms = read("rooms");

const baseContext = {
  timetable,
  teachers: read("teachers").teachers,
  students: read("students").students,
  papers: read("papers").papers,
  syllabus: read("syllabus"),
  notices: read("notices"),
  campus,
  contacts: read("contacts"),
  knowledge: read("knowledge"),
  rooms,
  now: new Date("2026-11-02T10:05:00"),
  profile: { section: "", subgroup: "", crn: "" },
  memory: {},
};

const profileContext = {
  ...baseContext,
  profile: {
    name: "Aaditya Koundal",
    crn: "2621001",
    section: "ITA",
    subgroup: "ITA1",
    branch: "IT",
    year: 1,
    mentor: "Dr. Palwinder Kaur",
    mentorPhone: "9814828414",
    mentorVenue: "S213",
  },
};

test("section ids resolve exactly (no substring collisions)", () => {
  assert.deepEqual(findSections(timetable, "D2CSA timetable").map((s) => s.id), ["D2CSA"]);
  assert.deepEqual(findSections(timetable, "D2CSB timetable").map((s) => s.id), ["D2CSB"]);
});

test("shorthand year + branch + group + day resolves", () => {
  assert.deepEqual(findSections(timetable, "2 cse b monday").map((s) => s.id), ["D2CSB"]);
  assert.deepEqual(findSections(timetable, "second year CSE B timetable").map((s) => s.id), ["D2CSB"]);
});

test("section matcher ignores the bare CSE branch id", () => {
  assert.equal(matchSection(timetable, "how many sections in IT"), null);
});

test("personal timetable defaults to the saved profile", () => {
  const reply = answerQuestion("aaj ka timetable", profileContext);
  assert.equal(reply.kind, "timetable");
  assert.match(reply.text, /ITA/);
});

test("explicit section overrides the profile", () => {
  const reply = answerQuestion("D2CSA timetable", profileContext);
  assert.match(reply.text, /2nd Year/);
  assert.match(reply.text, /Group A/);
});

test("student counts are scoped to the profile until the user says all", () => {
  const scoped = answerQuestion("how many students", profileContext);
  assert.match(scoped.text, /191/);
  const all = answerQuestion("how many students all branches", profileContext);
  assert.match(all.text, /2108/);
});

test("branch totals use the right filter", () => {
  const reply = answerQuestion("kitne students IT mein", baseContext);
  assert.match(reply.text, /349/);
  const sections = answerQuestion("how many sections in IT", baseContext);
  assert.match(sections.text, /7 sections/);
});

test("free rooms returns real rooms", () => {
  const reply = answerQuestion("free rooms now", baseContext);
  assert.equal(reply.kind, "free-rooms");
  assert.ok(reply.bullets.length > 2);
  assert.ok(reply.bullets.some((line) => line.includes("Central Library")));
  assert.ok(reply.bullets.some((line) => line.includes("year timetable")));
});

test("room lookups show a block instead of a bare code", () => {
  const reply = answerQuestion("where is F107", baseContext);
  assert.match(reply.text, /F-Block/);
});

test("routes are non-zero and end with an arrival step", () => {
  const route = shortestRoute(campus, "admin-block", "auditorium");
  assert.ok(route.metres > 20);
  const reply = answerQuestion("distance between admin block and auditorium", baseContext);
  assert.match(reply.text, /Administration Block/);
  assert.ok(reply.bullets.some((line) => /Arrive at College Auditorium/.test(line)));
});

test("library hours come from the verified source", () => {
  const reply = answerQuestion("library timing", baseContext);
  assert.match(reply.text, /Central Library timings/);
  assert.ok(reply.bullets.some((line) => /8:00 am/.test(line)));
});

test("math is computed locally", () => {
  assert.match(answerQuestion("18% of 250", baseContext).text, /45/);
  assert.match(answerQuestion("sqrt(144)", baseContext).text, /12/);
});

test("unknown facts are not invented", () => {
  const reply = answerQuestion("what is the capital of india", baseContext);
  assert.equal(reply.kind, "fallback");
  assert.match(reply.text, /could not find/i);
});

test("my mentor uses the saved profile", () => {
  const reply = answerQuestion("who is my mentor", profileContext);
  assert.match(reply.text, /Palwinder Kaur/);
});

test("attendance is not fabricated", () => {
  const reply = answerQuestion("my attendance", profileContext);
  assert.equal(reply.kind, "attendance");
  assert.match(reply.text, /not published/i);
});
