import type { Campus, Edge, Junction, Place, Room } from "./types";

export interface LatLon {
  lat: number;
  lon: number;
}

export interface RouteStep {
  index: number;
  title: string;
  detail: string;
  distance: number;
  photo?: string;
  node?: string;
  placeId?: string;
  turn?: "left" | "right" | "straight" | "start" | "arrive" | "indoor";
  indoor?: boolean;
}

export interface RouteResult {
  from: Place;
  to: Place;
  toRoom?: Room;
  distance: number;
  minutes: number;
  steps: RouteStep[];
  nodePath: string[];
  approximate: true;
  accessible: boolean;
  accessibleNote?: string;
  alternative: boolean;
}

export interface RouteOptions {
  accessible?: boolean;
  bannedEdges?: Set<string>;
}

const R = 6371000;
const PATH_FACTOR = 1.18;
const WALK_MPS = 1.25;

export function haversine(a: LatLon, b: LatLon): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function formatDistance(m: number): string {
  if (!Number.isFinite(m)) return "—";
  if (m < 950) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export function walkMinutes(m: number): number {
  return Math.max(1, Math.round(m / WALK_MPS / 60));
}

function bearing(a: LatLon, b: LatLon): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const toDeg = (x: number) => (x * 180) / Math.PI;
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lon - a.lon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function turnFrom(incoming: LatLon, at: LatLon, outgoing: LatLon): { turn: RouteStep["turn"]; text: string } {
  const delta = ((bearing(at, outgoing) - bearing(incoming, at) + 540) % 360) - 180;
  if (delta > 28) return { turn: "right", text: "Turn right" };
  if (delta < -28) return { turn: "left", text: "Turn left" };
  return { turn: "straight", text: "Continue straight" };
}

interface GraphEdge extends Edge {
  key: string;
  weight: number;
  from: string;
  to: string;
}

export function buildGraph(campus: Campus): { nodes: Map<string, Junction>; edges: GraphEdge[]; adjacency: Map<string, GraphEdge[]> } {
  const nodes = new Map(campus.junctions.map((j) => [j.id, j]));
  const edges: GraphEdge[] = [];
  campus.edges.forEach((edge, index) => {
    const a = nodes.get(edge.a);
    const b = nodes.get(edge.b);
    if (!a || !b) return;
    const weight = edge.distance || haversine(a, b) * PATH_FACTOR;
    const ab: GraphEdge = { ...edge, key: `${index}:${edge.a}>${edge.b}`, from: edge.a, to: edge.b, weight };
    const ba: GraphEdge = { ...edge, key: `${index}:${edge.b}>${edge.a}`, from: edge.b, to: edge.a, weight };
    edges.push(ab, ba);
  });
  const adjacency = new Map<string, GraphEdge[]>();
  for (const e of edges) {
    const list = adjacency.get(e.from) || [];
    list.push(e);
    adjacency.set(e.from, list);
  }
  return { nodes, edges, adjacency };
}

function nearestJunction(campus: Campus, place: Place): Junction | undefined {
  if (place.node) {
    const chosen = campus.junctions.find((j) => j.id === place.node);
    if (chosen) return chosen;
  }
  let best: Junction | undefined;
  let bestD = Infinity;
  for (const j of campus.junctions) {
    const d = haversine(place, j);
    if (d < bestD) {
      bestD = d;
      best = j;
    }
  }
  return best;
}

function currentNode(campus: Campus, place: Place): string | null {
  return nearestJunction(campus, place)?.id || null;
}

function dijkstra(
  nodes: Map<string, Junction>,
  adjacency: Map<string, GraphEdge[]>,
  start: string,
  end: string,
  options: RouteOptions = {},
): { path: string[]; edges: GraphEdge[]; cost: number } | null {
  const dist = new Map<string, number>();
  const prev = new Map<string, { node: string; edge: GraphEdge }>();
  const visited = new Set<string>();
  dist.set(start, 0);
  const queue = new Set<string>([start]);
  while (queue.size) {
    let current: string | null = null;
    let best = Infinity;
    for (const n of queue) {
      const d = dist.get(n) ?? Infinity;
      if (d < best) {
        best = d;
        current = n;
      }
    }
    if (!current || best === Infinity) break;
    queue.delete(current);
    if (current === end) break;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const edge of adjacency.get(current) || []) {
      if (options.bannedEdges?.has(edge.key)) continue;
      if (options.accessible && edge.accessible === false) continue;
      const next = edge.to;
      const nd = best + edge.weight;
      if (nd < (dist.get(next) ?? Infinity)) {
        dist.set(next, nd);
        prev.set(next, { node: current, edge });
        queue.add(next);
      }
    }
  }
  if (!dist.has(end)) return null;
  const path: string[] = [];
  const edges: GraphEdge[] = [];
  let cur = end;
  while (cur !== start) {
    const p = prev.get(cur);
    if (!p) return null;
    path.unshift(cur);
    edges.unshift(p.edge);
    cur = p.node;
  }
  path.unshift(start);
  return { path, edges, cost: dist.get(end) || 0 };
}

function photoForNode(campus: Campus, nodeId: string): string | undefined {
  const j = campus.junctions.find((x) => x.id === nodeId);
  if (!j) return undefined;
  let best: { d: number; photo?: string } = { d: Infinity };
  for (const p of campus.places) {
    if (!p.photo) continue;
    const d = haversine(j, p);
    if (d < best.d) best = { d, photo: p.photo };
  }
  return best.d < 180 ? best.photo : undefined;
}

function buildSteps(campus: Campus, placeA: Place, placeB: Place, nodeStart: Junction, nodeEnd: Junction, path: string[], edges: GraphEdge[], room?: Room): RouteStep[] {
  const steps: RouteStep[] = [];
  const startConnector = haversine(placeA, nodeStart);
  steps.push({
    index: 1,
    title: `Start at ${placeA.name}`,
    detail: `${placeA.description || "Begin here."} Walk about ${formatDistance(startConnector)} to the nearest campus path.`,
    distance: startConnector,
    photo: placeA.photo,
    node: nodeStart.id,
    placeId: placeA.id,
    turn: "start",
  });

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const from = campus.junctions.find((j) => j.id === edge.from)!;
    const to = campus.junctions.find((j) => j.id === edge.to)!;
    const nextEdge = edges[i + 1];
    const nextNode = nextEdge ? campus.junctions.find((j) => j.id === nextEdge.to) : nodeEnd;
    const turn = nextNode ? turnFrom(from, to, nextNode) : { turn: "arrive" as const, text: "Arrive" };
    const distance = edge.weight;
    const toward = nextNode?.name || nodeEnd.name;
    steps.push({
      index: steps.length + 1,
      title: i === 0 ? `Head towards ${toward}` : turn.text,
      detail: `${edge.note ? `${edge.note} ` : ""}Walk about ${formatDistance(distance)}${turn.turn === "straight" ? " and keep going" : ""}.`,
      distance,
      photo: photoForNode(campus, edge.to),
      node: edge.to,
      turn: turn.turn,
    });
  }

  const endConnector = haversine(nodeEnd, placeB);
  steps.push({
    index: steps.length + 1,
    title: `Arrive at ${placeB.name}`,
    detail: `${placeB.verified ? "Verified campus location." : "Location is approximate — check the entrance sign."} ${placeB.description || ""}`.trim(),
    distance: endConnector,
    photo: placeB.photo || photoForNode(campus, nodeEnd.id),
    node: nodeEnd.id,
    placeId: placeB.id,
    turn: "arrive",
  });

  if (room) {
    const floor = room.floor ?? 0;
    steps.push({
      index: steps.length + 1,
      title: `Find room ${room.name}`,
      detail:
        floor > 0
          ? `Enter ${placeB.name} and take the stairs to floor ${floor}. Room ${room.name} is on this floor. Lift access is not published, so step-free access is not verified.`
          : `Enter ${placeB.name} and look for room ${room.name} on the ground floor.`,
      distance: 0,
      photo: room.photo,
      node: nodeEnd.id,
      placeId: placeB.id,
      turn: "indoor",
      indoor: true,
    });
  }

  return steps.map((s, i) => ({ ...s, index: i + 1 }));
}

export function findPlace(campus: Campus, idOrName: string): Place | undefined {
  const q = idOrName.trim().toLowerCase();
  return (
    campus.places.find((p) => p.id.toLowerCase() === q) ||
    campus.places.find((p) => p.name.toLowerCase() === q) ||
    campus.places.find((p) => p.aliases?.some((a) => a.toLowerCase() === q)) ||
    campus.places.find((p) => p.name.toLowerCase().includes(q)) ||
    campus.places.find((p) => p.aliases?.some((a) => a.includes(q)))
  );
}

export function findRoom(rooms: Room[], idOrName: string): Room | undefined {
  const q = idOrName.trim().toLowerCase().replace(/\s+/g, "");
  return rooms.find((r) => r.id.toLowerCase() === q || r.name.toLowerCase().replace(/\s+/g, "") === q);
}

export function placeForRoom(campus: Campus, room: Room): Place | undefined {
  return campus.places.find((p) => p.id === room.place);
}

export function routeBetween(
  campus: Campus,
  from: Place,
  to: Place,
  options: RouteOptions & { room?: Room; alternative?: boolean } = {},
): RouteResult | null {
  const graph = buildGraph(campus);
  const startJ = nearestJunction(campus, from);
  const endJ = nearestJunction(campus, to);
  if (!startJ || !endJ) return null;
  const path = dijkstra(graph.nodes, graph.adjacency, startJ.id, endJ.id, options);
  if (!path) return null;
  const startConnector = haversine(from, startJ);
  const endConnector = haversine(endJ, to);
  const distance = path.cost + startConnector + endConnector * PATH_FACTOR;
  const steps = buildSteps(campus, from, to, startJ, endJ, path.path, path.edges, options.room);
  const floor = options.room?.floor ?? 0;
  const accessible = options.accessible !== false;
  return {
    from,
    to,
    toRoom: options.room,
    distance,
    minutes: walkMinutes(distance),
    steps,
    nodePath: path.path,
    approximate: true,
    accessible,
    accessibleNote: floor > 0 ? "This route ends on an upper floor. Lift access is not verified, so it is not guaranteed step-free." : undefined,
    alternative: Boolean(options.alternative),
  };
}

export function alternativeRoutes(campus: Campus, from: Place, to: Place, options: RouteOptions & { room?: Room } = {}, count = 2): RouteResult[] {
  const first = routeBetween(campus, from, to, options);
  if (!first) return [];
  const results = [first];
  const graph = buildGraph(campus);
  const seen = new Set<string>([first.nodePath.join(">")]);
  const edgeKeys = new Set<string>();
  // Ban one edge at a time from the best route, then keep distinct paths.
  for (const node of first.nodePath) {
    for (const edge of graph.adjacency.get(node) || []) {
      if (!first.nodePath.includes(edge.to)) continue;
      edgeKeys.add(edge.key);
    }
  }
  for (const key of edgeKeys) {
    if (results.length >= count + 1) break;
    const banned = new Set([key]);
    const alt = routeBetween(campus, from, to, { ...options, bannedEdges: banned, alternative: true });
    if (!alt) continue;
    const signature = alt.nodePath.join(">");
    if (seen.has(signature)) continue;
    seen.add(signature);
    results.push(alt);
  }
  return results.sort((a, b) => a.distance - b.distance);
}

export function routeToRoom(campus: Campus, rooms: Room[], from: Place, room: Room): RouteResult | null {
  const to = placeForRoom(campus, room);
  if (!to) return null;
  return routeBetween(campus, from, to, { room });
}

export function roomFloorLabel(room: Room): string {
  if (room.floor === null || room.floor === undefined) return "Floor not published";
  if (room.floor === 0) return "Ground floor";
  return `Floor ${room.floor}`;
}

export function roomBlockLabel(campus: Campus, room: Room): string {
  return campus.places.find((p) => p.id === room.place)?.name || "Campus";
}
