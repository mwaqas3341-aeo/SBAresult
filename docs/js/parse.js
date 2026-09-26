// Header synonyms: same field keys/aliases as engine/generator.py's HEADER_SYNONYMS,
// so a Log Sheet built for the Python/Flask version works here unchanged.
const HEADER_SYNONYMS = {
  school: ["school name"],
  class: ["class"],
  roll: ["roll no", "roll no.", "rollno", "roll number"],
  bform: ["b.form no", "b.form no.", "bform no", "b form no", "b-form no", "b.form number"],
  name: ["student name"],
  father: ["father name"],
  dob: ["date of birth", "d.o.b", "d.o.b.", "dob"],
  section: ["section"],
  english: ["english"],
  urdu: ["urdu"],
  maths: ["mathematics", "maths", "math"],
  gk: ["general knowledge/general science", "general knowledge / general science", "gk/gs", "gk / gs"],
  social: ["social studies/history/geoghraghy", "social studies/history/geography", "social studies / history / geography"],
  islamiat: ["islamiat/ethics", "islamiat / ethics", "islamiat"],
  quran: ["holy quran"],
  computer: ["computer education"],
  other: ["other subject"],
};

const REQUIRED_KEYS = ["name", "class", "section"];

const SUBJECT_DEFS = [
  { key: "english", label: "English", max: 100 },
  { key: "urdu", label: "URDU", max: 100 },
  { key: "maths", label: "MATHEMATICS", max: 100 },
  { key: "gk", label: "GENERAL KNOWLEDGE/GENERAL SCIENCE", max: 100 },
  { key: "social", label: "SOCIAL STUDIES/HISTORY/GEOGHRAGHY", max: 100 },
  { key: "islamiat", label: "ISLAMIAT/ETHICS", max: 100 },
  { key: "quran", label: "HOLY QURAN", max: 50 },
  { key: "computer", label: "COMPUTER EDUCATION", max: 100 },
  { key: "other", label: "OTHER SUBJECT", max: 100 },
];

class ParseError extends Error {}

function norm(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim().toLowerCase().replace(/:$/, "").replace(/\s+/g, " ");
}

function buildHeaderLookup() {
  const lookup = {};
  for (const [key, variants] of Object.entries(HEADER_SYNONYMS)) {
    for (const v of variants) lookup[norm(v)] = key;
  }
  return lookup;
}
const HEADER_LOOKUP = buildHeaderLookup();

function findLogSheet(workbook) {
  for (const name of workbook.SheetNames) {
    if (name.toLowerCase().includes("log")) return workbook.Sheets[name];
  }
  let best = null, bestScore = -1;
  for (const name of workbook.SheetNames) {
    const ws = workbook.Sheets[name];
    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
    let score = 0;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
      if (cell && HEADER_LOOKUP[norm(cell.v)]) score++;
    }
    if (score > bestScore) { best = ws; bestScore = score; }
  }
  if (!best) throw new ParseError("Could not find any sheet with recognizable columns in the uploaded file.");
  return best;
}

function mapHeaders(ws) {
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  const colMap = {};
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
    const key = cell ? HEADER_LOOKUP[norm(cell.v)] : undefined;
    if (key && !(key in colMap)) colMap[key] = c;
  }
  const missing = REQUIRED_KEYS.filter((k) => !(k in colMap));
  if (missing.length) {
    throw new ParseError(
      "Missing required column(s) in the uploaded sheet: " + missing.join(", ") +
      ". The uploaded file should use the same column headers as the original Log Sheet template."
    );
  }
  return { colMap, range };
}

function cellValue(ws, row, col) {
  if (col === undefined) return undefined;
  const cell = ws[XLSX.utils.encode_cell({ r: row, c: col })];
  return cell ? cell.v : undefined;
}

function toNum(v) {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function toText(v) {
  return v === undefined || v === null ? "" : String(v).trim();
}

function formatDob(v) {
  let d = null;
  if (v instanceof Date && !isNaN(v)) d = v;
  else if (typeof v === "number") d = XLSX.SSF ? new Date(XLSX.SSF.parse_date_code(v).y, XLSX.SSF.parse_date_code(v).m - 1, XLSX.SSF.parse_date_code(v).d) : null;
  else if (typeof v === "string" && v.trim()) {
    const parsed = new Date(v);
    if (!isNaN(parsed)) d = parsed;
  }
  if (!d) return { short: toText(v), words: "" };
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const short = `${dd}-${months[d.getMonth()].slice(0,3)}-${String(yyyy).slice(2)}`;
  const words = `${d.getDate()}  ${months[d.getMonth()]}  ${yyyy}`;
  return { short, words };
}

function extractStudents(workbook) {
  const ws = findLogSheet(workbook);
  const { colMap, range } = mapHeaders(ws);
  const students = [];

  for (let r = 1; r <= range.e.r; r++) {
    const nameVal = cellValue(ws, r, colMap.name);
    if (!toText(nameVal)) continue; // skip totals/blank rows

    const student = {
      school: toText(cellValue(ws, r, colMap.school)),
      class: toText(cellValue(ws, r, colMap.class)) || "Unknown_Class",
      roll: toText(cellValue(ws, r, colMap.roll)),
      bform: toText(cellValue(ws, r, colMap.bform)),
      name: toText(nameVal),
      father: toText(cellValue(ws, r, colMap.father)),
      section: toText(cellValue(ws, r, colMap.section)) || "Unknown_Section",
    };
    const dob = formatDob(cellValue(ws, r, colMap.dob));
    student.dobShort = dob.short;
    student.dobWords = dob.words;

    let obtainedTotal = 0, maxTotal = 0;
    student.subjects = SUBJECT_DEFS.map((def) => {
      const obtained = toNum(cellValue(ws, r, colMap[def.key]));
      obtainedTotal += obtained;
      maxTotal += def.max;
      return { label: def.label, max: def.max, obtained, grade: gradeForMarks(obtained, def.max) };
    });
    student.grandTotalObtained = obtainedTotal;
    student.grandTotalMax = maxTotal;
    student.grandTotalGrade = gradeForMarks(obtainedTotal, maxTotal);

    students.push(student);
  }

  if (!students.length) {
    throw new ParseError(
      "No student rows were found. Make sure data starts on the row right after " +
      "the header row, with the Student Name column filled in."
    );
  }
  return students;
}
