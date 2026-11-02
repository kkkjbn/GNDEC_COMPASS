/**
 * Photo map for campus places and rooms.
 *
 * Rules:
 *  - Only photographs that genuinely exist in `public/assets/img` are listed.
 *  - A place with no honest photograph is left without one. The UI then shows a
 *    neutral icon instead of a misleading image (for example: the Admission
 *    Cell has no published interior photograph, so it stays photo-less).
 *  - `credit` is shown on every photo. "verified" means the image is an actual
 *    GNDEC photograph; it does not mean the exact geographic position of the
 *    building was surveyed.
 */
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PUBLIC = join(ROOT, "public");

const ROOM_CREDIT = "GNDEC official room gallery";
const SITE_CREDIT = "GNDEC website";
const COMMONS_CREDIT = "Wikimedia Commons (CC)";
const GALLERY_CREDIT = "GNDEC gallery";

/** Places that have a real, correctly identified photograph. */
export const PLACE_PHOTOS = {
  "main-gate": ["/assets/img/main-gate.jpg", SITE_CREDIT],
  library: ["/assets/img/library.jpg", SITE_CREDIT],
  auditorium: ["/assets/img/gallery/auditorium-a.jpg", GALLERY_CREDIT],
  workshops: ["/assets/img/workshop.jpg", "GNDEC Mechanical department"],
  "it-dept": ["/assets/img/lab.jpg", SITE_CREDIT],
  "cse-dept": ["/assets/img/lab.jpg", SITE_CREDIT],
  "sports-complex": ["/assets/img/gallery/sports-complex.jpg", GALLERY_CREDIT],
  "open-air-theatre": ["/assets/img/gallery/open-air-theatre.jpg", GALLERY_CREDIT],
  "swimming-pool": ["/assets/img/gallery/swimming-pool.jpg", GALLERY_CREDIT],
  "football-ground": ["/assets/img/gallery/football-ground.jpg", GALLERY_CREDIT],
  "tennis-courts": ["/assets/img/gallery/tennis-courts.jpg", GALLERY_CREDIT],
  gym: ["/assets/img/gallery/gym-a.jpg", GALLERY_CREDIT],
  "principal-bungalow": ["/assets/img/gallery/principal-bungalow.jpg", COMMONS_CREDIT],
  "g-block": ["/assets/img/rooms/g1.jpg", ROOM_CREDIT],
  "f-block": ["/assets/img/rooms/f107.jpg", ROOM_CREDIT],
  "s-block": ["/assets/img/rooms/s201.jpg", ROOM_CREDIT],
};

/** Places added to the seed map for photo-guided navigation. */
export const EXTRA_PLACES = [
  {
    id: "principal-bungalow",
    name: "Principal's Bungalow",
    category: "landmark",
    lat: 30.85882,
    lon: 75.85928,
    node: "j-westgate",
    description:
      "The heritage white residence with the blue dome near the staff-colony gate. The sign in the photograph identifies it as the Principal's Bungalow.",
    aliases: ["principal house", "principal residence", "white bungalow", "dome building"],
    verified: false,
  },
  {
    id: "tennis-courts",
    name: "Tennis Courts",
    category: "sports",
    lat: 30.85958,
    lon: 75.86308,
    node: "j-sports",
    description: "Outdoor tennis courts beside the sports complex.",
    aliases: ["tennis", "lawn tennis"],
    verified: false,
  },
  {
    id: "gym",
    name: "College Gym",
    category: "sports",
    lat: 30.85942,
    lon: 75.86292,
    node: "j-sports",
    description: "Indoor gym with weights and cardio equipment, inside the sports complex.",
    aliases: ["gymnasium", "fitness", "weight room"],
    verified: false,
  },
];

/** Curated campus gallery. `place` is optional. */
export const GALLERY = [
  {
    src: "/assets/img/main-gate.jpg",
    title: "College main entrance",
    caption: "The GNDEC portico on Gill Road — the landmark most visitors use.",
    credit: SITE_CREDIT,
    place: "main-gate",
  },
  {
    src: "/assets/img/library.jpg",
    title: "Central Library",
    caption: "The library building, reading rooms and reference section.",
    credit: SITE_CREDIT,
    place: "library",
  },
  {
    src: "/assets/img/gallery/auditorium-a.jpg",
    title: "Auditorium",
    caption: "Red seating and the main stage inside the college auditorium.",
    credit: GALLERY_CREDIT,
    place: "auditorium",
  },
  {
    src: "/assets/img/gallery/auditorium-b.jpg",
    title: "Auditorium balcony",
    caption: "Another view of the auditorium seating.",
    credit: GALLERY_CREDIT,
    place: "auditorium",
  },
  {
    src: "/assets/img/gallery/sports-complex.jpg",
    title: "Sports complex",
    caption: "The indoor sports hall used for badminton and college tournaments.",
    credit: GALLERY_CREDIT,
    place: "sports-complex",
  },
  {
    src: "/assets/img/gallery/gym-a.jpg",
    title: "College gym",
    caption: "Weights and training equipment inside the gym.",
    credit: GALLERY_CREDIT,
    place: "gym",
  },
  {
    src: "/assets/img/gallery/swimming-pool.jpg",
    title: "Swimming pool",
    caption: "The campus swimming pool beside the sports area.",
    credit: GALLERY_CREDIT,
    place: "swimming-pool",
  },
  {
    src: "/assets/img/gallery/open-air-theatre.jpg",
    title: "Open Air Theatre",
    caption: "The stepped OAT used for cultural nights and college events.",
    credit: GALLERY_CREDIT,
    place: "open-air-theatre",
  },
  {
    src: "/assets/img/gallery/tennis-courts.jpg",
    title: "Tennis courts",
    caption: "Outdoor tennis courts near the sports complex.",
    credit: GALLERY_CREDIT,
    place: "tennis-courts",
  },
  {
    src: "/assets/img/gallery/football-ground.jpg",
    title: "Football ground",
    caption: "The main playing field on campus.",
    credit: GALLERY_CREDIT,
    place: "football-ground",
  },
  {
    src: "/assets/img/rooms/f107.jpg",
    title: "Classroom F107",
    caption: "A first-year classroom, photographed from the official room gallery.",
    credit: ROOM_CREDIT,
    place: "f-block",
  },
  {
    src: "/assets/img/rooms/s201.jpg",
    title: "Classroom S201",
    caption: "A second-year classroom with the room number painted on the wall.",
    credit: ROOM_CREDIT,
    place: "s-block",
  },
  {
    src: "/assets/img/rooms/g1.jpg",
    title: "Classroom G1",
    caption: "A ground-floor classroom in G-Block.",
    credit: ROOM_CREDIT,
    place: "g-block",
  },
  {
    src: "/assets/img/gallery/campus-road.jpg",
    title: "Tree-lined campus road",
    caption: "The shaded main walk through the campus.",
    credit: COMMONS_CREDIT,
  },
  {
    src: "/assets/img/gallery/academic-block.jpg",
    title: "Academic block courtyard",
    caption: "The red-brick academic block around the central lawn and fountain.",
    credit: COMMONS_CREDIT,
  },
  {
    src: "/assets/img/gallery/red-corridor.jpg",
    title: "Red-pillared corridor",
    caption: "A covered corridor between academic blocks.",
    credit: COMMONS_CREDIT,
  },
  {
    src: "/assets/img/gallery/campus-courtyard.jpg",
    title: "Campus courtyard",
    caption: "The central courtyard and photostat shop.",
    credit: COMMONS_CREDIT,
  },
  {
    src: "/assets/img/gallery/principal-bungalow.jpg",
    title: "Principal's Bungalow",
    caption: "The heritage white residence with the blue dome, near the west gate.",
    credit: COMMONS_CREDIT,
    place: "principal-bungalow",
  },
  {
    src: "/assets/img/gallery/night-campus.jpg",
    title: "Campus at night",
    caption: "The illuminated fountain and lawns after dark.",
    credit: COMMONS_CREDIT,
  },
  {
    src: "/assets/img/gallery/sports-field.jpg",
    title: "Sports field",
    caption: "The college playing field.",
    credit: COMMONS_CREDIT,
  },
];

export const GALLERY_PATHS = [...new Set(GALLERY.map((item) => item.src))];

/** Photograph for a room name, or "" when no official photograph exists. */
export function roomPhoto(roomName = "") {
  const base = String(roomName)
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]/g, "");
  if (!/^(f|g|s)\d{1,4}$/.test(base)) return "";
  const relative = `/assets/img/rooms/${base}.jpg`;
  return existsSync(join(PUBLIC, relative)) ? relative : "";
}

export const ROOM_PHOTO_CREDIT = ROOM_CREDIT;
