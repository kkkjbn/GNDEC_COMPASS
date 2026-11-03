import type { Lecture, Room, Section, Student, Teacher, Timetable } from "./types";
import { nowInCampus, timeToMinutes } from "./utils";

export interface Track {
  id: string;
  label: string;
  year: number;
  semester: number;
  branch: string;
  branchName: string;
  program: string;
  group?: string;
  kind: "section" | "subgroup";
  lectures: Lecture[];
}

export function allTracks(timetable: Timetable): Track[] {
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const s of [...timetable.sections, ...timetable.subgroups]) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out;
}

export function findTrack(timetable: Timetable, id?: string | null): Track | undefined {
  if (!id) return undefined;
  return [...timetable.sections, ...timetable.subgroups].find((s) => s.id.toLowerCase() === id.toLowerCase());
}

export function studentTrack(timetable: Timetable, student: Pick<Student, "section" | "subsection" | "subgroup">): Track | undefined {
  const candidates = [student.subgroup, student.subsection, student.section].filter(Boolean) as string[];
  for (const c of candidates) {
    const exact = timetable.subgroups.find((s) => s.id.toLowerCase() === c.toLowerCase());
    if (exact) return exact;
  }
  return findTrack(timetable, student.section);
}

export function profileTrack(timetable: Timetable, profile: { section?: string; subsection?: string } | null): Track | undefined {
  if (!profile) return undefined;
  for (const c of [profile.subsection, profile.section]) {
    if (!c) continue;
    const exact = timetable.subgroups.find((s) => s.id.toLowerCase() === c.toLowerCase());
    if (exact) return exact;
  }
  return findTrack(timetable, profile.section);
}

export function sectionOptions(timetable: Timetable, opts: { year?: number; branch?: string; program?: string } = {}): Track[] {
  return timetable.sections
    .filter((s) => (opts.year ? s.year === opts.year : true))
    .filter((s) => (opts.branch ? s.branch === opts.branch : true))
    .filter((s) => (opts.program ? s.program === opts.program : true))
    .sort((a, b) => a.year - b.year || a.branch.localeCompare(b.branch) || a.group?.localeCompare(b.group || "") || 0);
}

export function branchOptions(timetable: Timetable): { code: string; name: string; years: number[] }[] {
  const map = new Map<string, { code: string; name: string; years: Set<number> }>();
  for (const s of timetable.sections) {
    const entry = map.get(s.branch) || { code: s.branch, name: s.branchName, years: new Set<number>() };
    entry.years.add(s.year);
    map.set(s.branch, entry);
  }
  return [...map.values()]
    .map((e) => ({ code: e.code, name: e.name, years: [...e.years].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function lecturesForDay(track: Track | undefined, day: number): Lecture[] {
  if (!track) return [];
  return track.lectures.filter((l) => l.day === day).sort((a, b) => a.period - b.period || timeToMinutes(a.start) - timeToMinutes(b.start));
}

export function lecturesForStudent(timetable: Timetable, student: Student, day?: number): Lecture[] {
  const track = studentTrack(timetable, student);
  return day === undefined ? track?.lectures || [] : lecturesForDay(track, day);
}

export interface ClassState {
  current: Lecture | null;
  next: Lecture | null;
  nextDay: number | null;
  minutesToNext: number | null;
  progress: number;
}

export function classState(timetable: Timetable, track: Track | undefined, now = nowInCampus()): ClassState {
  if (!track) return { current: null, next: null, nextDay: null, minutesToNext: null, progress: 0 };
  const today = now.weekday;
  const todayLectures = lecturesForDay(track, today);
  const current = todayLectures.find((l) => now.minutes >= timeToMinutes(l.start) && now.minutes < timeToMinutes(l.end)) || null;
  if (current) {
    const start = timeToMinutes(current.start);
    const end = timeToMinutes(current.end);
    return {
      current,
      next: todayLectures.find((l) => timeToMinutes(l.start) >= end) || null,
      nextDay: null,
      minutesToNext: 0,
      progress: Math.min(1, Math.max(0, (now.minutes - start) / Math.max(1, end - start))),
    };
  }
  const later = todayLectures.find((l) => timeToMinutes(l.start) > now.minutes);
  if (later) {
    return { current: null, next: later, nextDay: today, minutesToNext: timeToMinutes(later.start) - now.minutes, progress: 0 };
  }
  for (let offset = 1; offset <= 7; offset++) {
    const day = (today + offset) % 7;
    if (day === 6) continue;
    const list = lecturesForDay(track, day);
    if (list.length) {
      return { current: null, next: list[0], nextDay: day, minutesToNext: offset * 24 * 60 + timeToMinutes(list[0].start) - now.minutes, progress: 0 };
    }
  }
  return { current: null, next: null, nextDay: null, minutesToNext: null, progress: 0 };
}

export function dayName(timetable: Timetable, day: number): string {
  return timetable.days[String(day)] || ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][day] || "Day";
}

export function shortDay(timetable: Timetable, day: number): string {
  return dayName(timetable, day).slice(0, 3);
}

export function currentPeriodIndex(timetable: Timetable, now = nowInCampus()): number {
  return timetable.periods.findIndex((start, i) => {
    const end = timetable.periods[i + 1] || "16:30";
    return now.minutes >= timeToMinutes(start) && now.minutes < timeToMinutes(end);
  });
}

export function nextPeriodIndex(timetable: Timetable, now = nowInCampus()): number {
  const idx = timetable.periods.findIndex((start) => timeToMinutes(start) > now.minutes);
  return idx === -1 ? 0 : idx;
}

export function occupiedRooms(timetable: Timetable, day: number, period: number): Set<string> {
  const set = new Set<string>();
  for (const track of timetable.sections) {
    for (const l of track.lectures) {
      if (l.day === day && l.period === period && l.room) set.add(l.room.trim().toUpperCase());
    }
  }
  return set;
}

export function freeRooms(timetable: Timetable, rooms: Room[], day: number, period: number): Room[] {
  const occupied = occupiedRooms(timetable, day, period);
  return rooms
    .filter((r) => r.name && !occupied.has(r.name.trim().toUpperCase()))
    .filter((r) => !/^(WORKSHOPS|ENG LAB|W\/S|SEMINAR|LIBRARY|SPORTS)/i.test(r.name))
    .sort((a, b) => {
      const af = a.floor ?? 9;
      const bf = b.floor ?? 9;
      return af - bf || a.name.localeCompare(b.name);
    });
}

export function roomLectures(timetable: Timetable, room: string): { lecture: Lecture; track: Track }[] {
  const needle = room.trim().toUpperCase();
  const out: { lecture: Lecture; track: Track }[] = [];
  for (const track of timetable.sections) {
    for (const lecture of track.lectures) {
      if (lecture.room?.trim().toUpperCase() === needle) out.push({ lecture, track });
    }
  }
  return out.sort((a, b) => a.lecture.day - b.lecture.day || a.lecture.period - b.lecture.period);
}

export function teacherLectures(teacher: Teacher): { day: number; start: string; end: string; subject: string; room: string; group: string }[] {
  return (teacher.lectures || [])
    .map((l: unknown) => l as { day: number; start: string; end: string; subject: string; room: string; group?: string; section?: string })
    .map((l) => ({ ...l, group: l.group || l.section || "" }))
    .sort((a, b) => a.day - b.day || timeToMinutes(a.start) - timeToMinutes(b.start));
}

export interface Conflict {
  day: number;
  period: number;
  a: Lecture;
  b: Lecture;
}

export function compareTracks(a: Track | undefined, b: Track | undefined): { conflicts: Conflict[]; sharedFree: { day: number; period: number }[] } {
  if (!a || !b) return { conflicts: [], sharedFree: [] };
  const conflicts: Conflict[] = [];
  for (const la of a.lectures) {
    for (const lb of b.lectures) {
      if (la.day === lb.day && la.period === lb.period) conflicts.push({ day: la.day, period: la.period, a: la, b: lb });
    }
  }
  const busyA = new Set(a.lectures.map((l) => `${l.day}-${l.period}`));
  const busyB = new Set(b.lectures.map((l) => `${l.day}-${l.period}`));
  const sharedFree: { day: number; period: number }[] = [];
  for (let day = 0; day < 6; day++) {
    for (let period = 0; period < 8; period++) {
      if (!busyA.has(`${day}-${period}`) && !busyB.has(`${day}-${period}`)) sharedFree.push({ day, period });
    }
  }
  return { conflicts, sharedFree };
}

export function subjectNames(timetable: Timetable): string[] {
  const set = new Set<string>();
  for (const s of timetable.sections) for (const l of s.lectures) if (l.subject) set.add(l.subject.replace(/\s+[LP]$/, "").trim());
  return [...set].sort();
}

export function studentMatches(student: Student, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return student.name.toLowerCase().includes(q) || student.crn.includes(q) || (student.registrationNo || "").includes(q);
}
