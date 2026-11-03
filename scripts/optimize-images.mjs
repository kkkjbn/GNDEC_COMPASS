/**
 * Normalise the real campus photographs into web-ready WebP files and
 * rewrite the data references. No images are invented.
 */
import sharp from "sharp";
import { readdir, mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, basename } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "public", "assets", "img");
const OUT = join(ROOT, "public", "assets", "img", "webp");
await mkdir(OUT, { recursive: true });

const files = [];
async function walk(dir) {
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    const s = await stat(p);
    if (s.isDirectory()) {
      if (p !== OUT) await walk(p);
    } else if (/\.(jpe?g|png)$/i.test(name) && !name.startsWith("og")) {
      files.push(p);
    }
  }
}
await walk(SRC);

const map = {};
for (const file of files) {
  const rel = file.slice(SRC.length + 1).replace(/\\/g, "/");
  const name = basename(file, extname(file));
  let outName;
  if (rel.startsWith("gallery/")) outName = `gallery/${name}.webp`;
  else if (rel.startsWith("rooms/")) outName = `rooms/${name}.webp`;
  else outName = `hero/${name}.webp`;
  const outPath = join(OUT, outName);
  await mkdir(join(outPath, ".."), { recursive: true });
  const isRoom = rel.startsWith("rooms/");
  const isGallery = rel.startsWith("gallery/");
  await sharp(file)
    .rotate()
    .resize({ width: isRoom ? 1000 : isGallery ? 1500 : 1800, withoutEnlargement: true })
    .webp({ quality: isRoom ? 74 : 80 })
    .toFile(outPath);
  map[rel] = `/assets/img/webp/${outName}`;
}

// A custom OG card, built from the real main-gate photograph.
const gate = join(SRC, "gndec_2022_newgate.jpg");
if (existsSync(gate)) {
  const bg = await sharp(gate).resize(1200, 630, { fit: "cover" }).modulate({ brightness: 0.55 }).toBuffer();
  const overlay = Buffer.from(`
    <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#070b14" stop-opacity=".88"/>
          <stop offset="1" stop-color="#070b14" stop-opacity=".25"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#g)"/>
      <circle cx="96" cy="96" r="38" fill="#d7ff4f"/>
      <path d="M96 72l7 17 17 7-17 7-7 17-7-17-17-7 17-7z" fill="#0b1220"/>
      <text x="152" y="106" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#ffffff">GNDEC COMPASS</text>
      <text x="96" y="380" font-family="Arial, sans-serif" font-size="64" font-weight="800" fill="#ffffff">Your campus,</text>
      <text x="96" y="452" font-family="Arial, sans-serif" font-size="64" font-weight="800" fill="#d7ff4f">in one place.</text>
      <text x="96" y="512" font-family="Arial, sans-serif" font-size="24" fill="#dfe6f3">Timetable · free rooms · people · photo routes · papers · notices</text>
      <text x="96" y="574" font-family="Arial, sans-serif" font-size="18" fill="#9fb0ca">Guru Nanak Dev Engineering College, Ludhiana</text>
    </svg>`);
  await sharp(bg).composite([{ input: overlay }]).jpeg({ quality: 86 }).toFile(join(SRC, "og.jpg"));
}

await writeFile(join(OUT, "photo-map.json"), JSON.stringify(map, null, 2));

// Rewrite data references from .jpg/.JPG to the webp variants.
const replacements = [
  ["/assets/img/gallery/", "/assets/img/webp/gallery/"],
  ["/assets/img/rooms/", "/assets/img/webp/rooms/"],
];
const heroNames = ["library", "auditorium", "admissions", "workshop", "campus-life", "sports", "convocation", "lab"];
for (const dataFile of ["campus.json", "rooms.json"]) {
  const p = join(ROOT, "public", "data", dataFile);
  let text = await readFile(p, "utf8");
  for (const [from, to] of replacements) {
    text = text.split(from).join(to);
  }
  text = text.replace(/\/assets\/img\/([A-Za-z0-9_\-]+)\.(jpe?g|JPG|png)/g, (m, name) => {
    if (name === "og" || name === "college-logo" || name === "campus-map") return m;
    return `/assets/img/webp/hero/${name}.webp`;
  });
  // Point the main gate at the real gate photograph.
  text = text.replace(/\/assets\/img\/webp\/hero\/main-gate\.webp/g, "/assets/img/webp/hero/gndec_2022_newgate.webp");
  text = text.replace(/\/assets\/img\/webp\/hero\/new-gate\.webp/g, "/assets/img/webp/hero/gndec_2022_newgate.webp");
  await writeFile(p, text);
}

console.log(`optimised ${files.length} photographs`);
