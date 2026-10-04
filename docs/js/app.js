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

// ---------- Modal helpers (each resolves true = continue, false = cancel/go back) ----------

function showMissingInfoModal(students) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("modal-missing");
    const body = document.getElementById("missing-info-body");
    const affected = students.filter((s) => s.missingFields.length);

    body.innerHTML = affected.map((s) =>
      `<tr><td>${s.name}</td><td>${s.missingFields.join(", ")}</td></tr>`
    ).join("");

    overlay.hidden = false;

    const goBackBtn = document.getElementById("missing-go-back-btn");
    const continueBtn = document.getElementById("missing-continue-btn");

    function cleanup(result) {
      overlay.hidden = true;
      goBackBtn.removeEventListener("click", onGoBack);
      continueBtn.removeEventListener("click", onContinue);
      resolve(result);
    }
    function onGoBack() { cleanup(false); }
    function onContinue() { cleanup(true); }

    goBackBtn.addEventListener("click", onGoBack);
    continueBtn.addEventListener("click", onContinue);
  });
}

function showReviewModal({ schoolName, emis, heading, year, count, available, missingCount }) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("modal-review");
    document.getElementById("review-school").textContent = schoolName || "(not set)";
    document.getElementById("review-emis").textContent = emis || "(not set)";
    document.getElementById("review-heading").textContent = heading;
    document.getElementById("review-year").textContent = year || "(not set)";
    document.getElementById("review-count").textContent = count;
    document.getElementById("review-available").textContent = available;
    const after = available - count;
    document.getElementById("review-after").textContent = after;
    document.getElementById("review-missing").textContent = missingCount ? `${missingCount} record(s)` : "None";

    const insufficientEl = document.getElementById("review-insufficient");
    const confirmBtn = document.getElementById("review-confirm-btn");
    const cancelBtn = document.getElementById("review-cancel-btn");
    const insufficient = available < count;
    insufficientEl.hidden = !insufficient;
    confirmBtn.disabled = insufficient;

    overlay.hidden = false;

    function cleanup(result) {
      overlay.hidden = true;
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      resolve(result);
    }
    function onConfirm() { if (!confirmBtn.disabled) cleanup(true); }
    function onCancel() { cleanup(false); }

    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
  });
}

// ---------- Main flow ----------

generateBtn.addEventListener("click", async () => {
  if (!selectedFile) return;
  const session = window.currentAccount.session;
  if (!session) { showStatus("error", "Please sign in first."); return; }

  generateBtn.disabled = true;
  hideStatus();
  setProgress(1);

  try {
    const buffer = await selectedFile.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const students = extractStudents(workbook);

    const profile = window.currentAccount.profile || {};
    const heading = document.getElementById("builder-heading").value.trim() || "REPORT CARD SCHOOL BASED ASSESSMENT (SBA)";
    const year = document.getElementById("builder-year").value.trim();
    const overrides = { school_name: profile.school_name, district: profile.district, heading, year };

    // Missing-information review (before any credits are touched)
    const missingCount = students.filter((s) => s.missingFields.length).length;
    if (missingCount) {
      const shouldContinue = await showMissingInfoModal(students);
      if (!shouldContinue) {
        showStatus("info", "No credits were used. Correct the file and upload again when ready.");
        return;
      }
    }

    // Pre-generation review + soft credit check (the real check is server-side in deduct_credits)
    const available = profile.remaining_generations ?? 0;
    const proceed = await showReviewModal({
      schoolName: profile.school_name, emis: profile.emis_or_registration_no,
      heading, year, count: students.length, available, missingCount,
    });
    if (!proceed) {
      showStatus("info", "Cancelled. No credits were used.");
      return;
    }

    showStatus("info", `Generating ${students.length} result card${students.length > 1 ? "s" : ""}...`);

    let blob, filename, kind;
    if (students.length === 1) {
      blob = await renderStudentToPdfBlob(template, renderRoot, students[0], overrides);
      filename = studentFilename(students[0]);
      kind = "pdf";
      setProgress(90);
    } else {
      const zip = new JSZip();
      for (let i = 0; i < students.length; i++) {
        const student = students[i];
        const pdfBlob = await renderStudentToPdfBlob(template, renderRoot, student, overrides);
        const path = `${sanitize(student.class)}/${sanitize(student.section)}/${studentFilename(student)}`;
        zip.file(path, pdfBlob);
        setProgress(Math.round(((i + 1) / students.length) * 85));
      }
      blob = await zip.generateAsync({ type: "blob" });
      filename = "Result_Cards.zip";
      kind = "zip";
      setProgress(90);
    }

    // Credit deduction is the real gate: the download only happens if this succeeds.
    const classes = [...new Set(students.map((s) => String(s.class)))];
    const sections = [...new Set(students.map((s) => String(s.section)))];
    try {
      const remaining = await deductCredits(students.length, {
        year, heading, file_name: filename,
        class_label: classes.length === 1 ? classes[0] : `${classes.length} classes`,
        section_label: sections.length === 1 ? sections[0] : `${sections.length} sections`,
      });
      setProgress(100);
      downloadBlob(blob, filename);
      showStatus("success", `Generated ${students.length} result card${students.length > 1 ? "s" : ""}. ${remaining} credit(s) remaining.`);
      if (typeof onCreditsDeducted === "function") onCreditsDeducted(remaining);
    } catch (err) {
      if (String(err.message || "").includes("INSUFFICIENT_CREDITS")) {
        showStatus("error", "You do not have enough result-card generations remaining. Please contact the administrator to purchase/add another package.");
      } else {
        showStatus("error", err.message || "Could not finalize generation.");
      }
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
