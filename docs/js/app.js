const fileInput = document.getElementById("file-input");
const dzText = document.getElementById("dz-text");
const generateBtn = document.getElementById("generate-btn");
const statusEl = document.getElementById("status");
const progressWrap = document.getElementById("progress-wrap");
const progressBar = document.getElementById("progress-bar");
const template = document.getElementById("card-template");
const renderRoot = document.getElementById("render-root");

let selectedFile = null;

fileInput.addEventListener("change", () => {
  selectedFile = fileInput.files[0] || null;
  dzText.textContent = selectedFile ? selectedFile.name : "Click to choose a file, or drag it here";
  generateBtn.disabled = !selectedFile;
  hideStatus();
});

function showStatus(kind, message) {
  statusEl.hidden = false;
  statusEl.className = `status ${kind}`;
  statusEl.textContent = message;
}
function hideStatus() {
  statusEl.hidden = true;
}
function setProgress(pct) {
  progressWrap.hidden = pct <= 0;
  progressBar.style.width = `${pct}%`;
}

function sanitize(value) {
  const text = String(value ?? "").trim();
  const cleaned = text.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
  return cleaned || "Unknown";
}

function studentFilename(student) {
  return `${sanitize(student.name)}_${sanitize(student.class)}_${sanitize(student.roll)}.pdf`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

generateBtn.addEventListener("click", async () => {
  if (!selectedFile) return;
  generateBtn.disabled = true;
  hideStatus();
  setProgress(1);

  try {
    const buffer = await selectedFile.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const students = extractStudents(workbook);
    const overrides = {
      district: window.currentAccount?.profile?.district || undefined,
    };

    showStatus("info", `Found ${students.length} student${students.length > 1 ? "s" : ""}. Generating PDF${students.length > 1 ? "s" : ""}...`);

    if (students.length === 1) {
      const blob = await renderStudentToPdfBlob(template, renderRoot, students[0], overrides);
      setProgress(100);
      const filename = studentFilename(students[0]);
      downloadBlob(blob, filename);
      showStatus("success", "Result card generated.");
      logHistoryIfSignedIn(students, filename);
    } else {
      const zip = new JSZip();
      for (let i = 0; i < students.length; i++) {
        const student = students[i];
        const blob = await renderStudentToPdfBlob(template, renderRoot, student, overrides);
        const path = `${sanitize(student.class)}/${sanitize(student.section)}/${studentFilename(student)}`;
        zip.file(path, blob);
        setProgress(Math.round(((i + 1) / students.length) * 100));
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      downloadBlob(zipBlob, "Result_Cards.zip");
      showStatus("success", `Generated ${students.length} result cards.`);
      logHistoryIfSignedIn(students, "Result_Cards.zip");
    }
  } catch (err) {
    console.error(err);
    showStatus("error", err.message || "Something went wrong while generating the result card(s).");
  } finally {
    setTimeout(() => setProgress(0), 1500);
    generateBtn.disabled = !selectedFile;
    renderRoot.innerHTML = "";
  }
});

function logHistoryIfSignedIn(students, fileName) {
  const session = window.currentAccount?.session;
  if (!session) return;
  const classes = [...new Set(students.map((s) => String(s.class)))];
  const sections = [...new Set(students.map((s) => String(s.section)))];
  addHistoryEntry(session.user.id, {
    student_count: students.length,
    class_label: classes.length === 1 ? classes[0] : `${classes.length} classes`,
    section_label: sections.length === 1 ? sections[0] : `${sections.length} sections`,
    file_name: fileName,
  }).then(() => {
    if (typeof refreshHistory === "function") refreshHistory(session.user.id);
  });
}
