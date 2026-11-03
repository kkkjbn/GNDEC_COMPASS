export interface Lecture {
  id: string;
  day: number;
  period: number;
  start: string;
  end: string;
  subject: string;
  teacher?: string;
  teachers?: string[];
  room: string;
  subsection?: string;
}

export interface Section {
  id: string;
  year: number;
  semester: number;
  branch: string;
  branchName: string;
  program: string;
  group?: string;
  label: string;
  kind: "section" | "subgroup";
  lectures: Lecture[];
}

export interface Timetable {
  schemaVersion?: string;
  generatedAt: string;
  source: string;
  days: Record<string, string>;
  periods: string[];
  sections: Section[];
  subgroups: Section[];
}

export interface Student {
  crn: string;
  registrationNo?: string;
  name: string;
  branch: string;
  section: string;
  subsection?: string;
  academicGroup?: string;
  mentor?: string;
  mentorPhone?: string;
  venue?: string;
  coordinator?: string;
  universityRoll?: string;
  batch?: string;
  sourceUrl?: string;
  year: number;
  subgroup?: string;
  group?: string;
}

export interface StudentData {
  generatedAt: string;
  batches: string[];
  years: number[];
  count: number;
  students: Student[];
}

export interface Teacher {
  id: string;
  name: string;
  rawName: string;
  designation: string;
  email: string;
  department: string;
  deptCode: string;
  profileUrl: string;
  photoUrl: string;
  experience: string;
  qualifications: string | string[];
  researchInterests: string;
  publications: { journals?: string; conferences?: string };
  memberships: string;
  source: string;
  verifiedProfile: boolean;
  teaches: boolean;
  hoursPerWeek: number;
  subjects: string[];
  rooms: string[];
  sections: string[];
  lectures: Lecture[];
}

export interface TeacherData {
  generatedAt: string;
  count: number;
  teachesCount: number;
  teachers: Teacher[];
}

export interface Room {
  id: string;
  name: string;
  place: string;
  floor: number | null;
  inferred: boolean;
  lecturesPerWeek: number;
  sections: string[];
  photo?: string;
  photoCredit?: string;
}

export interface RoomData {
  generatedAt: string;
  rooms: Room[];
}

export interface Place {
  id: string;
  name: string;
  category: string;
  lat: number;
  lon: number;
  node?: string;
  description: string;
  aliases: string[];
  photo?: string;
  photoCredit?: string;
  verified: boolean;
  pos?: [number, number];
}

export interface Junction {
  id: string;
  name: string;
  lat: number;
  lon: number;
  pos: [number, number];
}

export interface Edge {
  a: string;
  b: string;
  note?: string;
  distance?: number;
  accessible?: boolean;
}

export interface GalleryItem {
  src: string;
  title: string;
  caption: string;
  credit: string;
  place: string;
}

export interface Campus {
  schemaVersion: string;
  name: string;
  disclaimer: string;
  center: [number, number];
  places: Place[];
  junctions: Junction[];
  edges: Edge[];
  geometry?: unknown;
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  gallery: GalleryItem[];
  mapLinks?: { label: string; url: string }[];
  generatedAt: string;
}

export interface Notice {
  id: string;
  title: string;
  date: string;
  displayDate?: string;
  url: string;
  author?: string;
  source: string;
  kind: string;
}

export interface Holiday {
  id: string;
  name: string;
  date: string;
  displayDate: string;
  weekday: string;
  category: string;
  year: number;
  source: string;
}

export interface NoticeData {
  generatedAt: string;
  notices: Notice[];
  holidays: Holiday[];
  exams: Notice[];
}

export interface Paper {
  id: string;
  name: string;
  code: string;
  title: string;
  department: string;
  session: string;
  year: number;
  term: string;
  makeup: boolean;
  view: string;
  download: string;
}

export interface PaperData {
  generatedAt: string;
  sessions: string[];
  count: number;
  codes: string[];
  papers: Paper[];
}

export interface SyllabusDoc {
  id: string;
  code: string;
  branch: string;
  branchName: string;
  program: string;
  semesters: number[];
  semester: string;
  scheme: string;
  title: string;
  file: string;
  url: string;
  sourcePage: string;
}

export interface QuestionBank {
  id: string;
  title: string;
  url: string;
}

export interface Note {
  id: string;
  title: string;
  url: string;
  branch?: string;
  semester?: number;
  subject?: string;
}

export interface SyllabusData {
  generatedAt: string;
  documents: SyllabusDoc[];
  questionBanks: QuestionBank[];
  notes: Note[];
}

export interface ContactRole {
  role: string;
  name: string;
  landline?: string;
  phone?: string;
  email?: string;
  source?: string;
  contactScope?: string;
  profileId?: string;
}

export interface ContactData {
  roles: ContactRole[];
  source?: string;
}

export interface Meta {
  app: string;
  dataVersion: string;
  generatedAt: string;
  sourceHash: string;
  timetableVersion: string;
  counts: Record<string, number>;
  coverage: {
    timetableYears: number[];
    timetableBranches: string[];
    studentBatches: string[];
    programs: string[];
    missing: string[];
  };
}

export interface Source {
  label: string;
  url: string;
  kind: string;
  fetchedAt?: string;
  contentHash?: string;
  count?: number;
}

export interface SearchEntry {
  t: string;
  id: string;
  title: string;
  sub: string;
  to: string;
  k: string;
}

export interface SearchData {
  generatedAt: string;
  count: number;
  entries: SearchEntry[];
}

export interface Knowledge {
  generatedAt: string;
  version: string;
  verifiedDate: string;
  policy: string;
  portalLinks: { category: string; items: { title: string; description: string; url: string }[] }[];
  hostelRules?: { title: string; summary: string; links: { title: string; url: string }[] };
  autonomousRegulations?: { sourceRequired: boolean; summary: string };
  [key: string]: unknown;
}

export interface CoreData {
  meta: Meta;
  timetable: Timetable;
  notices: NoticeData;
  campus: Campus;
  rooms: RoomData;
  syllabus: SyllabusData;
  contacts: ContactData;
  knowledge: Knowledge;
  sources: { sources: Source[]; generatedAt?: string };
}

export interface Profile {
  crn?: string;
  name: string;
  branch?: string;
  year?: number;
  section?: string;
  subsection?: string;
  program?: string;
  role: "student" | "guest";
  createdAt: string;
}
