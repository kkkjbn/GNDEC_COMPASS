import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (name) => JSON.parse(fs.readFileSync(new URL(`../public/data/${name}.json`, import.meta.url), "utf8"));

const timetable = read("timetable");
const students = read("students");
const teachers = read("teachers");
const papers = read("papers");
const rooms = read("rooms");
const campus = read("campus");
const meta = read("meta");
const notices = read("notices");

test("all published data files parse and carry counts", () => {
  assert.ok(timetable.sections.length >= 50);
  assert.equal(students.students.length, students.count);
  assert.equal(teachers.teachers.length, teachers.count);
  assert.equal(papers.papers.length, papers.count);
  assert.equal(meta.counts.students, students.students.length);
});

test("no duplicate ids", () => {
  assert.equal(new Set(timetable.sections.map((s) => s.id)).size, timetable.sections.length);
  assert.equal(new Set(students.students.map((s) => s.crn)).size, students.students.length);
  assert.equal(new Set(rooms.rooms.map((r) => r.name)).size, rooms.rooms.length);
});

test("room list has no placeholder rows and every photo exists", () => {
  for (const room of rooms.rooms) {
    assert.ok(room.name);
    assert.notEqual(room.name, "---");
    if (room.photo) {
      assert.ok(fs.existsSync(new URL(`../public${room.photo}`, import.meta.url)), `${room.name} photo missing`);
    }
  }
});

test("campus graph is connected for the main places", () => {
  const ids = new Set(campus.places.map((place) => place.id));
  assert.ok(ids.has("main-gate"));
  assert.ok(ids.has("library"));
  assert.ok(ids.has("auditorium"));
  for (const edge of campus.edges) {
    assert.ok(edge.a && edge.b);
  }
});

test("notices and holidays are separated", () => {
  assert.ok(notices.notices.length > 0);
  assert.ok(Array.isArray(notices.holidays));
});

test("no replacement characters leaked into user-facing data", () => {
  const raw = ["timetable", "students", "teachers", "papers", "rooms", "campus", "notices"]
    .map((name) => fs.readFileSync(new URL(`../public/data/${name}.json`, import.meta.url), "utf8"))
    .join("\n");
  assert.ok(!raw.includes("\uFFFD"), "mojibake replacement character found");
});
