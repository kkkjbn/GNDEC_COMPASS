import fs from "node:fs";
import {
  PLACE_PHOTOS,
  EXTRA_PLACES,
  GALLERY,
  roomPhoto,
  ROOM_PHOTO_CREDIT,
} from "./lib/photos.mjs";

const rooms = JSON.parse(fs.readFileSync("public/data/rooms.json", "utf8"));
for (const room of rooms.rooms) {
  const photo = roomPhoto(room.name);
  room.photo = photo;
  room.photoCredit = photo ? ROOM_PHOTO_CREDIT : "";
}
fs.writeFileSync("public/data/rooms.json", JSON.stringify(rooms, null, 2));

const campus = JSON.parse(fs.readFileSync("public/data/campus.json", "utf8"));
const have = new Set(campus.places.map((place) => place.id));
const B = campus.bounds || { minLat: 30.8548, maxLat: 30.8642, minLon: 75.8572, maxLon: 75.8658 };
const project = (lon, lat) => [
  Math.round(((lon - B.minLon) / (B.maxLon - B.minLon)) * 10000) / 10000,
  Math.round(((B.maxLat - lat) / (B.maxLat - B.minLat)) * 10000) / 10000,
];
for (const extra of EXTRA_PLACES) {
  if (!have.has(extra.id)) campus.places.push({ ...extra, pos: project(extra.lon, extra.lat) });
}
for (const place of campus.places) {
  const photo = PLACE_PHOTOS[place.id];
  if (photo) {
    place.photo = photo[0];
    place.photoCredit = photo[1];
  } else {
    delete place.photo;
    delete place.photoCredit;
  }
}
campus.gallery = GALLERY;
fs.writeFileSync("public/data/campus.json", JSON.stringify(campus, null, 2));

console.log("rooms with photo", rooms.rooms.filter((room) => room.photo).length, "/", rooms.rooms.length);
console.log("places", campus.places.length, "gallery", campus.gallery.length);
