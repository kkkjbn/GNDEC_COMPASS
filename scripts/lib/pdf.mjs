import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/** Extract positioned text runs from a PDF, grouped into visual lines. */
export async function pdfLines(buffer) {
  const data = new Uint8Array(buffer);
  const doc = await getDocument({ data, disableWorker: true, useSystemFonts: true }).promise;
  const pages = [];

  for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();
    const items = content.items
      .filter((item) => typeof item.str === "string" && item.str.trim())
      .map((item) => ({
        text: item.str.replace(/\s+/g, " ").trim(),
        x: item.transform[4],
        y: item.transform[5],
        width: item.width || 0,
      }));
    if (!items.length) continue;

    const tolerance = 3.2;
    const lines = [];
    for (const item of items) {
      let line = lines.find((l) => Math.abs(l.y - item.y) <= tolerance);
      if (!line) {
        line = { y: item.y, items: [] };
        lines.push(line);
      }
      line.items.push(item);
    }

    const shaped = lines
      .sort((a, b) => b.y - a.y)
      .map((line) => {
        line.items.sort((a, b) => a.x - b.x);
        const runs = [];
        for (const item of line.items) {
          const prev = runs[runs.length - 1];
          if (prev && item.x - (prev.x1 || prev.x) <= 2.5) {
            prev.text = `${prev.text} ${item.text}`.replace(/\s+/g, " ").trim();
            prev.x1 = item.x + item.width;
          } else {
            runs.push({ text: item.text, x: item.x, x1: item.x + item.width });
          }
        }
        return { y: line.y, runs, text: runs.map((r) => r.text).join("  ") };      });

    pages.push({ pageNo, lines: shaped });
  }

  return pages;
}

const FIELD_ALIASES = [
  ["serial", /^sr\.?\s*no\.?$/i],
  ["serial", /^global\s+sr/i],
  ["classSerial", /^class\s+sr/i],
  ["registrationNo", /^registration/i],
  ["crn", /^college\s+roll/i],
  ["universityRoll", /^university\s+roll/i],
  ["name", /^student\s+name$/i],
  ["name", /^candidate\s+name$/i],
  ["motherName", /^mother/i],
  ["fatherName", /^father/i],
  ["branch", /^branch$/i],
  ["section", /^section$/i],
  ["subsection", /^sub\s*-?\s*section$/i],
  ["academicGroup", /^(mentoring|mentor)\s+group$/i],
  ["mentor", /^mentor\s+name$/i],
  ["mentor", /^mentor'?s?\s+name$/i],
  ["mentorPhone", /mobile|phone/i],
  ["venue", /^venue$/i],
  ["coordinator", /coordinator/i],
  ["email", /e-?mail/i],
  ["designation", /designation/i],
];

function fieldFor(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  for (const [field, re] of FIELD_ALIASES) if (re.test(clean)) return field;
  return null;
}

/** Merge a two-deck header (e.g. "Registration" / "No.") into one line of columns. */
function mergeLines(a, b) {
  const runs = [];
  const all = [...a.runs.map((r) => ({ ...r, deck: 0 })), ...b.runs.map((r) => ({ ...r, deck: 1 }))];
  for (const run of all.sort((x, y) => x.x - y.x || x.deck - y.deck)) {
    const prev = runs[runs.length - 1];
    if (prev && Math.abs(prev.x - run.x) < 6) {
      prev.text = `${prev.text} ${run.text}`.replace(/\s+/g, " ").trim();
      prev.x1 = Math.max(prev.x1, run.x1);
    } else {
      runs.push({ ...run });
    }
  }
  return { y: a.y, runs, text: runs.map((r) => r.text).join("  ") };
}

/** Find the header line (or two-line header) and its column anchors. */
export function findHeader(lines) {
  const candidates = [];
  for (let i = 0; i < lines.length; i += 1) {
    candidates.push({ line: lines[i], index: i, consumed: 1 });
    if (i + 1 < lines.length && Math.abs(lines[i].y - lines[i + 1].y) < 14) {
      candidates.push({ line: mergeLines(lines[i], lines[i + 1]), index: i, consumed: 2 });
    }
  }

  let best = null;
  for (const candidate of candidates) {
    const fields = candidate.line.runs.map((run) => fieldFor(run.text));
    const hits = fields.filter(Boolean).length;
    if (hits >= 5 && fields.includes("name")) {
      if (!best || hits > best.hits) {
        best = {
          index: candidate.index,
          consumed: candidate.consumed,
          hits,
          columns: candidate.line.runs.map((run, idx) => ({
            field: fields[idx] || `extra${idx}`,
            x: run.x,
            x1: run.x1,
            label: run.text,
          })),
        };
      }
    }
  }
  return best;
}

function assignColumns(columns, runs) {
  const bounds = columns.map((col, i) => {
    const prev = columns[i - 1];
    const next = columns[i + 1];
    const left = prev ? (prev.x + col.x) / 2 : col.x - 30;
    const right = next ? (col.x + next.x) / 2 : col.x1 + 400;
    return { left, right };
  });
  const out = {};
  for (const run of runs) {
    let best = 0;
    let bestDist = Infinity;
    columns.forEach((col, i) => {
      const dist = Math.abs(run.x - col.x);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    // Prefer an interval match when the run clearly starts inside one.
    const inInterval = bounds.findIndex((b) => run.x >= b.left && run.x < b.right);
    const idx = inInterval >= 0 ? inInterval : best;
    const field = columns[idx]?.field || `extra${idx}`;
    out[field] = out[field] ? `${out[field]} ${run.text}`.trim() : run.text;
  }
  return out;
}

const BRANCH_RE = /^(CE|CS|EC|EE|IT|ME|RAI|BCOM|BBA|BCA|MCA|ARCH|BVOC)$/i;
const SECTION_RE = /^[A-Z]{2,5}\d?[A-Z]?\d?$/i;

/** Parse roster PDF pages into student records. */
export async function parseRosterPdf(buffer, { batch = "", sourceUrl = "" } = {}) {
  const pages = await pdfLines(buffer);
  const records = [];
  let header = null;

  for (const page of pages) {
    const h = findHeader(page.lines);
    if (h) header = h;
    if (!header) continue;

    for (let i = h ? h.index + h.consumed : 0; i < page.lines.length; i += 1) {
      const line = page.lines[i];
      if (findHeader([line])) continue;
      if (line.runs.length < 4) continue;
      const row = assignColumns(header.columns, line.runs);

      // Phone + venue sometimes collapse into one run when they are close together.
      const phoneRun = (row.mentorPhone || "").trim();
      const phoneSplit = phoneRun.match(/^([+\d][\d\s+-]{7,})\s+(.+)$/);
      if (phoneSplit) {
        row.mentorPhone = phoneSplit[1].trim();
        if (!row.venue) row.venue = phoneSplit[2].trim();
      }

      // A run like "2514001 Aalamjit Singh" can hold both the CRN and the name.
      const crnRun = (row.crn || "").trim();
      const crnSplit = crnRun.match(/^(\d{7})\s+(.+)$/);
      if (crnSplit) {
        row.crn = crnSplit[1];
        if (!row.name) row.name = crnSplit[2].trim();
      }

      const crn = (row.crn || "").match(/\b\d{7}\b/)?.[0] || "";
      const registrationNo = (row.registrationNo || "").match(/\b\d{8,12}\b/)?.[0] || "";
      const name = (row.name || "").replace(/\s+/g, " ").trim();
      if (!name || (!crn && !registrationNo)) continue;
      if (/^(student\s+name|name)$/i.test(name)) continue;

      const branch = (row.branch || "").toUpperCase().replace(/[^A-Z]/g, "");
      const section = (row.section || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const subsection = (row.subsection || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

      records.push({
        crn,
        registrationNo,
        name,
        branch: BRANCH_RE.test(branch) ? branch : branch.slice(0, 4),
        section,
        subsection,
        academicGroup: (row.academicGroup || "").trim(),
        mentor: (row.mentor || "").replace(/\s+/g, " ").trim(),
        mentorPhone: (row.mentorPhone || "").replace(/[^\d+]/g, ""),
        venue: (row.venue || "").replace(/\s+/g, " ").trim(),
        coordinator: (row.coordinator || "").replace(/\s+/g, " ").trim(),
        universityRoll: (row.universityRoll || "").trim(),
        batch,
        sourceUrl,
      });
    }
  }

  // De-duplicate rows that repeat across page headers.
  const seen = new Set();
  return records.filter((r) => {
    const key = r.crn || `${r.registrationNo}|${r.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Plain text of a PDF, page by page — used for searchable syllabus text. */
export async function pdfText(buffer, { maxPages = 40 } = {}) {
  const data = new Uint8Array(buffer);
  const doc = await getDocument({ data, disableWorker: true, useSystemFonts: true }).promise;
  const pages = [];
  for (let n = 1; n <= Math.min(doc.numPages, maxPages); n += 1) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const text = content.items
      .map((i) => i.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) pages.push({ page: n, text });
  }
  return { pageCount: doc.numPages, pages };
}
