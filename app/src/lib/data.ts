import type {
  Campus,
  ContactData,
  CoreData,
  Knowledge,
  Meta,
  NoticeData,
  PaperData,
  RoomData,
  SearchData,
  StudentData,
  SyllabusData,
  TeacherData,
  Timetable,
} from "./types";

const cache = new Map<string, Promise<unknown>>();

export function dataUrl(name: string): string {
  return `/data/${name}.json`;
}

export function loadData<T>(name: string, signal?: AbortSignal): Promise<T> {
  if (!cache.has(name)) {
    const p = fetch(dataUrl(name), { signal, cache: "no-cache" }).then(async (res) => {
      if (!res.ok) throw new Error(`Could not load ${name} (${res.status})`);
      return res.json() as Promise<T>;
    });
    p.catch(() => cache.delete(name));
    cache.set(name, p as Promise<unknown>);
  }
  return cache.get(name) as Promise<T>;
}

export function clearDataCache() {
  cache.clear();
}

export const loadMeta = () => loadData<Meta>("meta");
export const loadTimetable = () => loadData<Timetable>("timetable");
export const loadStudents = () => loadData<StudentData>("students");
export const loadTeachers = () => loadData<TeacherData>("teachers");
export const loadRooms = () => loadData<RoomData>("rooms");
export const loadPapers = () => loadData<PaperData>("papers");
export const loadNotices = () => loadData<NoticeData>("notices");
export const loadSyllabus = () => loadData<SyllabusData>("syllabus");
export const loadCampus = () => loadData<Campus>("campus");
export const loadContacts = () => loadData<ContactData>("contacts");
export const loadKnowledge = () => loadData<Knowledge>("knowledge");
export const loadSources = () => loadData<{ sources: unknown[] }>("sources");
export const loadSearch = () => loadData<SearchData>("search");

export const ASSISTANT_DATA = [
  "meta",
  "timetable",
  "students",
  "teachers",
  "rooms",
  "papers",
  "notices",
  "syllabus",
  "campus",
  "contacts",
  "knowledge",
] as const;

export const OFFLINE_PACK = [
  ...ASSISTANT_DATA,
  "search",
  "sources",
] as const;

export async function loadCore(): Promise<CoreData> {
  const [meta, timetable, notices, campus, rooms, syllabus, contacts, knowledge, sources] = await Promise.all([
    loadMeta(),
    loadTimetable(),
    loadNotices(),
    loadCampus(),
    loadRooms(),
    loadSyllabus(),
    loadContacts(),
    loadKnowledge(),
    loadSources() as Promise<CoreData["sources"]>,
  ]);
  return { meta, timetable, notices, campus, rooms, syllabus, contacts, knowledge, sources };
}
