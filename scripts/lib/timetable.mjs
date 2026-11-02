import { decodeEntities, textLines } from "./util.mjs";

/** Extract the outermost <table>…</table> blocks (cells may contain nested tables). */
export function outerTables(html) {
  const tables = [];
  const openRe = /<table\b[^>]*>/gi;
  let match;
  while ((match = openRe.exec(html))) {
    const start = match.index;
    const openTagEnd = openRe.lastIndex;
    let depth = 1;
    const tagRe = /<\/?table\b[^>]*>/gi;
    tagRe.lastIndex = openTagEnd;
    let tag;
    while ((tag = tagRe.exec(html))) {
      if (/^<table/i.test(tag[0])) depth += 1;
      else depth -= 1;
      if (depth === 0) {
        tables.push(html.slice(start, tagRe.lastIndex));
        break;
      }
    }
    if (depth !== 0) break;
    openRe.lastIndex = tagRe.lastIndex;
  }
  return tables;
}

/** Split a row's HTML into its top-level <td> cells, preserving nested markup. */
export function topLevelCells(rowHtml) {
  const cells = [];
  const tdRe = /<td\b([^>]*)>/gi;
  let match;
  while ((match = tdRe.exec(rowHtml))) {
    const attrs = match[1] || "";
    const contentStart = tdRe.lastIndex;
    let depth = 1;
    const tagRe = /<\/?td\b[^>]*>/gi;
    tagRe.lastIndex = contentStart;
    let tag;
    while ((tag = tagRe.exec(rowHtml))) {
      if (/^<td/i.test(tag[0])) depth += 1;
      else depth -= 1;
      if (depth === 0) {
        cells.push({
          attrs,
          html: rowHtml.slice(contentStart, tag.index),
          rowspan: Number((attrs.match(/rowspan="?(\d+)/i) || [])[1] || 1),
          colspan: Number((attrs.match(/colspan="?(\d+)/i) || [])[1] || 1),
        });
        break;
      }
    }
    if (depth !== 0) break;
    tdRe.lastIndex = tagRe.lastIndex;
  }
  return cells;
}

/** Parse the nested "detailed" table used when one slot holds parallel sub-groups. */
export function parseDetailed(html) {
  const rows = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr;
  while ((tr = trRe.exec(html))) {
    const cells = [];
    const tdRe = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
    let td;
    while ((td = tdRe.exec(tr[1]))) cells.push(textLines(td[1]).join(" "));
    if (cells.length) rows.push(cells);
  }
  if (!rows.length) return [];
  const columns = Math.max(...rows.map((r) => r.length));
  const out = [];
  for (let col = 0; col < columns; col += 1) {
    const get = (rowIndex) => (rows[rowIndex] && rows[rowIndex][col]) || "";
    const lecture = {
      subsection: get(0),
      subject: get(1),
      teacher: get(2),
      room: get(3),
    };
    if (lecture.subject && lecture.subject !== "---") out.push(lecture);
  }
  return out;
}

const GROUP_TOKEN =
  /^(?:[A-Z]{2,6}\d{0,2}[A-Z]?|[A-Z]\d[A-Z]{2,6})(\s*,\s*(?:[A-Z]{2,6}\d{0,2}[A-Z]?|[A-Z]\d[A-Z]{2,6}))*[.\-]*$/;

const VENUE_HINT =
  /\b(LAB|HALL|WORKSHOP|WORKSHOPS|SEMINAR|GROUND|BLOCK|STUDIO|LIBRARY|AUDITORIUM|CANTEEN|ROOM)\b|^[A-Z]-?\d{2,4}$|^[A-Z]\d{2,4}$/i;

export function parseSlot(html) {
  if (/class="detailed"/i.test(html)) return parseDetailed(html);
  const lines = textLines(html).filter((line) => line !== "---" && line !== "-");
  if (!lines.length) return [];

  // Some cells start with the section/sub-group code, e.g. "D3CSA<br>Ind. IKS L<br>…"
  if (lines.length >= 3 && GROUP_TOKEN.test(lines[0])) lines.shift();

  if (lines.length === 1) return [{ subject: lines[0], teacher: "", room: "" }];
  if (lines.length === 2) {
    if (VENUE_HINT.test(lines[1]) && !VENUE_HINT.test(lines[0])) {
      return [{ subject: lines[0], teacher: "", room: lines[1] }];
    }
    return [{ subject: lines[0], teacher: lines[1], room: "" }];
  }

  const subject = lines[0];
  let teacher = lines[1];
  let room = lines.slice(2).join(" ");

  // A cell like "MANUFACTURING PRACTICES P / WORKSHOPS" has the venue where the teacher would be.
  if (!room && VENUE_HINT.test(teacher)) {
    room = teacher;
    teacher = "";
  }

  return [{ subject, teacher, room }];
}

const PREFIXES = [
  ["PROF", "Prof."],
  ["DR", "Dr."],
  ["ER", "Er."],
  ["MS", "Ms."],
  ["MRS", "Mrs."],
  ["MR", "Mr."],
  ["SH", "Sh."],
  ["SMT", "Smt."],
];

export function cleanTeacherName(raw = "") {
  return String(raw)
    .replace(/\((?:CE|CS|CSE|EC|ECE|EE|IT|ME|RAI|MBA|MCA|AS|HUM|PHY|CHEM|MATH|CP|M&PE|ARCH|BBA|BCOM|BVOC)\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitTeachers(raw = "") {
  return cleanTeacherName(raw)
    .split(/\s*,\s*|\s+and\s+/i)
    .map((name) => name.trim())
    .filter((name) => name.length > 2 && !/^-+$/.test(name));
}

export function teacherKey(name = "") {
  return String(name)
    .toLowerCase()
    .replace(/\b(dr|er|ms|mrs|mr|prof|sh|smt)\b\.?/g, "")
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseGroupMeta(id = "") {
  const clean = id.replace(/\s*Automatic Subgroup\s*/i, "").trim();
  const upper = clean.toUpperCase();

  const meta = {
    id: clean,
    year: null,
    semester: null,
    branch: "Other",
    branchName: "Other",
    program: "B.Tech",
    group: "",
  };

  if (/^D([123])/.test(upper)) {
    meta.year = Number(upper[1]);
    const rest = upper.slice(2);
    const branchMap = [
      ["CE", "CE", "Civil Engineering"],
      ["CS", "CS", "Computer Science & Engineering"],
      ["IT", "IT", "Information Technology"],
      ["EE", "EE", "Electrical Engineering"],
      ["EC", "EC", "Electronics & Communication"],
      ["ME", "ME", "Mechanical Engineering"],
      ["RAI", "RAI", "Robotics & AI"],
      ["BCOM", "BCOM", "B.Com"],
    ];
    for (const [code, short, name] of branchMap) {
      if (rest.startsWith(code)) {
        meta.branch = short;
        meta.branchName = name;
        meta.group = rest.slice(code.length).replace(/[^A-Z]/g, "");
        break;
      }
    }
  } else if (/^BARCH/.test(upper)) {
    meta.year = 1;
    meta.branch = "ARCH";
    meta.branchName = "Architecture";
    meta.program = "B.Arch";
  } else if (/^BVOC/.test(upper)) {
    meta.year = 1;
    meta.branch = "BVOC";
    meta.branchName = "B.Voc";
    meta.program = "B.Voc";
  } else if (/^BCA/.test(upper)) {
    meta.year = 1;
    meta.branch = "BCA";
    meta.branchName = "Computer Applications";
    meta.program = "BCA";
    meta.group = upper.slice(3).replace(/[^A-Z]/g, "");
  } else if (/^MCA/.test(upper)) {
    meta.year = 1;
    meta.branch = "MCA";
    meta.branchName = "Computer Applications";
    meta.program = "MCA";
  } else if (/^BCOM/.test(upper)) {
    meta.branch = "BCOM";
    meta.branchName = "B.Com";
    meta.program = "B.Com";
    const n = Number((upper.match(/\d+/) || [])[0] || 1);
    meta.year = n === 1 ? 1 : Math.ceil(n / 2);
    meta.group = String(n);
  } else if (/^BBA/.test(upper)) {
    meta.year = 1;
    meta.branch = "BBA";
    meta.branchName = "Business Administration";
    meta.program = "BBA";
  } else {
    const map = [
      ["ME", "ME", "Mechanical Engineering"],
      ["CE", "CE", "Civil Engineering"],
      ["EE", "EE", "Electrical Engineering"],
      ["EC", "EC", "Electronics & Communication"],
      ["RAI", "RAI", "Robotics & AI"],
      ["CS", "CS", "Computer Science & Engineering"],
      ["IT", "IT", "Information Technology"],
    ];
    for (const [code, short, name] of map) {
      if (upper.startsWith(code)) {
        meta.branch = short;
        meta.branchName = name;
        meta.year = 1;
        meta.group = upper.slice(code.length).replace(/[^A-Z]/g, "");
        break;
      }
    }
  }

  if (meta.year && !meta.semester) meta.semester = meta.year * 2 - 1;
  if (meta.branch === "BCOM" && /^BCOM3/.test(upper)) meta.semester = 3;
  meta.label = sectionLabel(meta);
  return meta;
}

const ORDINALS = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th" };

export function sectionLabel(meta) {
  if (meta.program === "B.Tech") {
    const group = meta.group ? ` · Group ${meta.group}` : "";
    return `${ORDINALS[meta.year] || ""} Year · ${meta.branch}${group}`;
  }
  if (meta.branch === "BCOM") return `B.Com · Sem ${meta.semester}`;
  const group = meta.group ? ` · Section ${meta.group}` : "";
  return `${meta.program}${group}`;
}

export function parseTimetableHtml(html, { kind = "section" } = {}) {
  const tables = outerTables(html);
  const groups = [];
  let periods = [];

  for (const table of tables) {
    const nameMatch = table.match(/<span class="name">([\s\S]*?)<\/span>/i);
    if (!nameMatch) continue;
    const id = decodeEntities(nameMatch[1].replace(/<[^>]*>/g, "")).trim();
    if (!id) continue;

    const headMatch = table.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/i);
    const days = headMatch
      ? [...headMatch[1].matchAll(/<th[^>]*xAxis[^>]*>([\s\S]*?)<\/th>/gi)].map((m) =>
          decodeEntities(m[1].replace(/<[^>]*>/g, "")).trim(),
        )
      : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

    const bodyMatch = table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i);
    const body = bodyMatch ? bodyMatch[1] : table;
    const timeChunks = body.split(/(?=<th[^>]*class="yAxis"[^>]*>)/i).slice(1);

    const grid = [];
    const times = [];
    const carry = new Map();

    for (const chunk of timeChunks) {
      const timeMatch = chunk.match(/<th[^>]*class="yAxis"[^>]*>([\s\S]*?)<\/th>/i);
      if (!timeMatch) continue;
      const time = decodeEntities(timeMatch[1].replace(/<[^>]*>/g, "")).trim();
      times.push(time);

      const rowHtml = chunk.slice(timeMatch.index + timeMatch[0].length);
      const cells = topLevelCells(rowHtml);
      const row = [];
      let col = 0;
      let cursor = 0;

      while (cursor < cells.length || [...carry.entries()].some(([c, v]) => c >= col && v.remaining > 0)) {
        const carried = carry.get(col);
        if (carried && carried.remaining > 0) {
          row[col] = carried.html;
          carried.remaining -= 1;
          if (carried.remaining === 0) carry.delete(col);
          col += 1;
          continue;
        }
        if (cursor >= cells.length) break;
        const cell = cells[cursor];
        cursor += 1;
        row[col] = cell.html;
        if (cell.rowspan > 1) carry.set(col, { html: cell.html, remaining: cell.rowspan - 1 });
        col += cell.colspan;
      }
      grid.push(row);
    }

    if (!periods.length) periods = times;
    const entries = [];
    for (let r = 0; r < grid.length; r += 1) {
      for (let c = 0; c < days.length; c += 1) {
        const html = grid[r] && grid[r][c];
        if (!html) continue;
        for (const slot of parseSlot(html)) {
          entries.push({
            day: c,
            period: r,
            start: times[r] || "",
            end: times[r + 1] || addHour(times[r] || ""),
            subject: slot.subject.trim(),
            teacher: slot.teacher.trim(),
            room: slot.room.replace(/\s+/g, " ").trim(),
            ...(slot.subsection ? { subsection: slot.subsection.trim() } : {}),
          });
        }
      }
    }

    groups.push({ id, ...parseGroupMeta(id), kind, days, entries });
  }

  return { periods, days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], groups };
}

function addHour(time) {
  const m = String(time).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "";
  const h = Number(m[1]) + 1;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/** A compact index used by the client search: one row per lecture. */
export function flattenLectures(groups, source = "section") {
  const out = [];
  for (const group of groups) {
    for (const entry of group.entries) {
      out.push({
        g: group.id,
        y: group.year,
        s: group.semester,
        b: group.branch,
        d: entry.day,
        p: entry.period,
        t: entry.start,
        e: entry.end,
        sub: entry.subject,
        tea: entry.teacher,
        r: entry.room,
        ...(entry.subsection ? { ss: entry.subsection } : {}),
        src: source,
      });
    }
  }
  return out;
}
