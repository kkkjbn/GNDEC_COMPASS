export const CAMPUS_TZ = "Asia/Kolkata";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

export function humanDuration(mins: number): string {
  if (!Number.isFinite(mins) || mins < 0) return "—";
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

export function nowInCampus(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CAMPUS_TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const weekdays: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: weekdays[get("weekday")] ?? 0,
    weekdayName: get("weekday"),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")),
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

export function formatDate(value: string | Date, opts: Intl.DateTimeFormatOptions = {}): string {
  const date = typeof value === "string" ? new Date(value.length <= 10 ? `${value}T12:00:00` : value) : value;
  if (Number.isNaN(date.getTime())) return typeof value === "string" ? value : "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: CAMPUS_TZ,
    ...opts,
  }).format(date);
}

export function formatDay(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value.length <= 10 ? `${value}T12:00:00` : value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: CAMPUS_TZ }).format(date);
}

export function relativeDay(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value.length <= 10 ? `${value}T12:00:00` : value) : value;
  const now = new Date();
  const a = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((a.getTime() - b.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return `In ${diff} days`;
  if (diff < -1 && diff > -7) return `${Math.abs(diff)} days ago`;
  return formatDate(date, { year: undefined });
}

export function daysUntil(value: string): number {
  const target = new Date(`${value}T12:00:00`);
  const now = nowInCampus();
  const today = new Date(`${now.dateKey}T12:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function initials(name: string): string {
  return name
    .replace(/\(.*?\)/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(And|Of|The|In|For|To)\b/g, (m) => m.toLowerCase());
}

export function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9@.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(value: string): string[] {
  return normalize(value)
    .split(" ")
    .filter((t) => t.length > 1);
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function fuzzyScore(query: string, target: string): number {
  const q = normalize(query);
  const t = normalize(target);
  if (!q || !t) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.includes(q)) return 60;
  const qTokens = q.split(" ").filter(Boolean);
  const tTokens = t.split(" ").filter(Boolean);
  let matched = 0;
  for (const token of qTokens) {
    if (tTokens.some((tt) => tt.startsWith(token) || token.startsWith(tt) || levenshtein(token, tt) <= Math.max(1, Math.floor(token.length / 3)))) {
      matched++;
    }
  }
  return matched ? 20 + (matched / qTokens.length) * 30 : 0;
}

export function sanitizeText(value: string, max = 2000): string {
  return value.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function toQuery(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of items) (out[key(item)] ||= []).push(item);
  return out;
}

export function branchLabel(code: string): string {
  const map: Record<string, string> = {
    CS: "Computer Science & Engineering",
    CSE: "Computer Science & Engineering",
    IT: "Information Technology",
    EC: "Electronics & Communication",
    ECE: "Electronics & Communication",
    EE: "Electrical Engineering",
    ME: "Mechanical Engineering",
    CE: "Civil Engineering",
    RAI: "Robotics & AI",
    ARCH: "School of Architecture",
    BCA: "BCA",
    MCA: "MCA",
    BBA: "BBA",
    BCOM: "B.Com",
    BVOC: "B.Voc",
    MBA: "Business Administration",
  };
  return map[code] || code;
}

export function yearLabel(year: number): string {
  return ["", "1st year", "2nd year", "3rd year", "4th year"][year] || `${year} year`;
}

export function shortBranch(code: string): string {
  const map: Record<string, string> = {
    CS: "CSE",
    EC: "ECE",
    ARCH: "ARCH",
    RAI: "RAI",
    MBA: "MBA",
    MCA: "MCA",
    BCA: "BCA",
    BBA: "BBA",
    BCOM: "B.Com",
    BVOC: "B.Voc",
  };
  return map[code] || code;
}
