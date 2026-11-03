/**
 * Build a complete sitemap from the published data.
 *
 * Usage:
 *   node scripts/build-sitemap.mjs
 *   SITE_URL=https://example.com node scripts/build-sitemap.mjs
 *
 * Student profile pages are deliberately excluded: they are useful inside the
 * app but should not be indexed by search engines.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "public", "data");
const OUT = path.join(ROOT, "public", "sitemap.xml");
const SITE = (process.env.SITE_URL || "https://gndec-compass.koushikjain2007.workers.dev").replace(/\/+$/, "");

const read = (name) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA, `${name}.json`), "utf8"));
  } catch {
    return null;
  }
};

const escapeXml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const urls = [];
const add = (loc, { changefreq = "monthly", priority = 0.5, lastmod = null } = {}) => {
  const clean = loc.startsWith("/") ? loc : `/${loc}`;
  urls.push({ loc: `${SITE}${clean === "/" ? "/" : clean}`, changefreq, priority, lastmod });
};

const meta = read("meta") || {};
const lastmod = (meta.generatedAt || new Date().toISOString()).slice(0, 10);

/* Core pages */
for (const [loc, priority, changefreq] of [
  ["/", 1.0, "daily"],
  ["/today", 0.9, "daily"],
  ["/timetable", 0.9, "weekly"],
  ["/people", 0.8, "weekly"],
  ["/rasta", 0.9, "weekly"],
  ["/study", 0.8, "weekly"],
  ["/community", 0.7, "monthly"],
  ["/notices", 0.8, "daily"],
  ["/exams", 0.7, "weekly"],
  ["/assistant", 0.6, "monthly"],
  ["/about", 0.5, "monthly"],
  ["/more", 0.4, "monthly"],
]) {
  add(loc, { priority, changefreq, lastmod });
}

/* Timetable sections */
const timetable = read("timetable");
for (const section of timetable?.sections || []) {
  if (!section?.id) continue;
  add(`/timetable/${encodeURIComponent(section.id)}`, { priority: 0.7, changefreq: "weekly", lastmod });
}

/* Faculty */
const teachers = read("teachers");
for (const teacher of teachers?.teachers || []) {
  if (!teacher?.id) continue;
  add(`/people/teacher/${encodeURIComponent(teacher.id)}`, { priority: 0.5, changefreq: "monthly", lastmod });
}

/* Rooms */
const rooms = read("rooms");
for (const room of rooms?.rooms || []) {
  if (!room?.id) continue;
  add(`/rasta/room/${encodeURIComponent(room.id)}`, { priority: 0.4, changefreq: "monthly", lastmod });
}

/* Campus places */
const campus = read("campus");
for (const place of campus?.places || []) {
  if (!place?.id) continue;
  add(`/rasta/place/${encodeURIComponent(place.id)}`, { priority: 0.6, changefreq: "monthly", lastmod });
}

/* Notices */
const notices = read("notices");
for (const notice of notices?.notices || []) {
  if (notice?.id == null) continue;
  const date = String(notice.displayDate || notice.date || lastmod).slice(0, 10);
  add(`/notices/${encodeURIComponent(notice.id)}`, { priority: 0.5, changefreq: "yearly", lastmod: date });
}

/* Deduplicate */
const seen = new Set();
const unique = urls.filter((item) => {
  if (seen.has(item.loc)) return false;
  seen.add(item.loc);
  return true;
});

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${unique
  .map(
    (item) => `  <url>
    <loc>${escapeXml(item.loc)}</loc>
    <lastmod>${item.lastmod}</lastmod>
    <changefreq>${item.changefreq}</changefreq>
    <priority>${item.priority.toFixed(1)}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>
`;

fs.writeFileSync(OUT, xml, "utf8");
console.log(`Sitemap written: ${path.relative(ROOT, OUT)} · ${unique.length} URLs · ${SITE}`);
