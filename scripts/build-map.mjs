/**
 * Build a local, offline campus map from OpenStreetMap raster tiles.
 * One-time fetch, respectful volume (z18, ~60 tiles), cached into the repo.
 */
import sharp from "sharp";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "public", "map");
const CACHE = join(OUT, "tiles");
const Z = 18;
const PAD = 0.0007;
const BOUNDS = {
  north: 30.8642 + PAD,
  south: 30.8548 - PAD,
  west: 75.8572 - PAD,
  east: 75.8658 + PAD,
};

const lon2tile = (lon) => Math.floor(((lon + 180) / 360) * 2 ** Z);
const lat2tile = (lat) => {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** Z);
};

const x0 = lon2tile(BOUNDS.west);
const x1 = lon2tile(BOUNDS.east);
const y0 = lat2tile(BOUNDS.north);
const y1 = lat2tile(BOUNDS.south);
const cols = x1 - x0 + 1;
const rows = y1 - y0 + 1;
const tilePx = 256;

console.log(`z${Z}: ${cols} x ${rows} tiles`);

const UA = "GNDEC-Compass/2.0 (student campus project; contact: gndec-compass@users.noreply.github.com)";

async function tile(x, y) {
  const file = join(CACHE, `${x}_${y}.png`);
  if (existsSync(file)) return readFile(file);
  const url = `https://tile.openstreetmap.org/${Z}/${x}/${y}.png`;
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "image/png" } });
  if (!res.ok) throw new Error(`tile ${x},${y}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(file, buf);
  await new Promise((r) => setTimeout(r, 60));
  return buf;
}

await mkdir(CACHE, { recursive: true });

const layers = [];
for (let x = x0; x <= x1; x++) {
  for (let y = y0; y <= y1; y++) {
    const buf = await tile(x, y);
    layers.push({ input: buf, left: (x - x0) * tilePx, top: (y - y0) * tilePx });
  }
}

const width = cols * tilePx;
const height = rows * tilePx;
const base = sharp({ create: { width, height, channels: 3, background: "#eef1f4" } }).composite(layers);

// Soft grade so the map feels designed, not like a raw screenshot.
const raw = await base.png().toBuffer();
await sharp(raw)
  .modulate({ saturation: 0.82, brightness: 1.04 })
  .sharpen({ sigma: 0.5 })
  .webp({ quality: 82 })
  .toFile(join(OUT, "campus-map.webp"));

// The stitched image spans whole tiles, so use the tile grid as the true bounds.
const tileX2lon = (x) => (x / 2 ** Z) * 360 - 180;
const tileY2lat = (y) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** Z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};
const west = tileX2lon(x0);
const east = tileX2lon(x1 + 1);
const north = tileY2lat(y0);
const south = tileY2lat(y1 + 1);
const mercY = (lat) => {
  const rad = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
};

const meta = {
  image: "/map/campus-map.webp",
  width,
  height,
  zoom: Z,
  bounds: { north, south, west, east },
  mercator: { north: mercY(north), south: mercY(south), west: (west + 180) / 360, east: (east + 180) / 360 },
  attribution: "Map data © OpenStreetMap contributors",
  generatedAt: new Date().toISOString(),
};
await writeFile(join(OUT, "campus-map.json"), JSON.stringify(meta, null, 2));
console.log(`wrote ${width}x${height} map, ${(raw.length / 1024).toFixed(0)}KB source`);
