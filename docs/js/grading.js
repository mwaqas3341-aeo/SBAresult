// Same grading ladder as the original template's IFERROR(IF(AND(...))) formulas.
function gradeForPercent(pct) {
  if (pct == null || isNaN(pct)) return "";
  if (pct > 80 && pct <= 100) return "A+";
  if (pct >= 70 && pct <= 79) return "A";
  if (pct >= 60 && pct <= 69) return "B";
  if (pct >= 50 && pct <= 59) return "C";
  if (pct >= 40 && pct <= 49) return "D";
  if (pct >= 33 && pct <= 39) return "E";
  return "F";
}

function gradeForMarks(obtained, total) {
  if (!total) return "";
  return gradeForPercent((obtained / total) * 100);
}
