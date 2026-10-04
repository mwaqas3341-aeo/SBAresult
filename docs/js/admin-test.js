// A sandbox copy of the main generator for the admin account only, so the
// system can be exercised end to end without touching any real account's
// credits, package, or history. Reuses the same parsing/rendering engine
// (extractStudents, renderStudentToPdfBlob, the missing-info modal) as the
// real builder in app.js - this is deliberately NOT a reimplementation, so
// it keeps testing the actual code path schools use, not a copy that could
// drift out of sync with it.

const adminTestFileInput = document.getElementById("admin-test-file-input");
const adminTestDzText = document.getElementById("admin-test-dz-text");
const adminTestGenerateBtn = document.getElementById("admin-test-generate-btn");
const adminTestStatusEl = document.getElementById("admin-test-status");
const adminTestProgressWrap = document.getElementById("admin-test-progress-wrap");
const adminTestProgressBar = document.getElementById("admin-test-progress-bar");

let adminTestSelectedFile = null;

adminTestFileInput.addEventListener("change", () => {
  adminTestSelectedFile = adminTestFileInput.files[0] || null;
  adminTestDzText.textContent = adminTestSelectedFile ? adminTestSelectedFile.name : "Click to choose a file, or drag it here";
  adminTestGenerateBtn.disabled = !adminTestSelectedFile;
  adminTestStatusEl.hidden = true;
});

function adminTestShowStatus(kind, message) {
  adminTestStatusEl.hidden = false;
  adminTestStatusEl.className = `status ${kind}`;
  adminTestStatusEl.textContent = message;
}
function adminTestSetProgress(pct) {
  adminTestProgressWrap.hidden = pct <= 0;
  adminTestProgressBar.style.width = `${pct}%`;
}

adminTestGenerateBtn.addEventListener("click", async () => {
  if (!adminTestSelectedFile) return;
  adminTestGenerateBtn.disabled = true;
  adminTestStatusEl.hidden = true;
  adminTestSetProgress(1);

  try {
    const buffer = await adminTestSelectedFile.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const students = extractStudents(workbook); // shared with the real builder (parse.js)

    const overrides = {
      school_name: document.getElementById("admin-test-school").value.trim(),
      district: document.getElementById("admin-test-district").value.trim(),
      heading: document.getElementById("admin-test-heading").value.trim() || "REPORT CARD SCHOOL BASED ASSESSMENT (SBA)",
      year: document.getElementById("admin-test-year").value.trim(),
    };

    // Reuses the exact same missing-info modal the real builder uses, so
    // that feature gets exercised here too - but nothing is deducted either way.
    const missingCount = students.filter((s) => s.missingFields.length).length;
    if (missingCount) {
      const shouldContinue = await showMissingInfoModal(students);
      if (!shouldContinue) {
        adminTestShowStatus("info", "Test cancelled at the missing-information step.");
        return;
      }
    }

    adminTestShowStatus("info", `Test mode: generating ${students.length} result card${students.length > 1 ? "s" : ""} (no credits used)...`);

    let blob, filename;
    if (students.length === 1) {
      blob = await renderStudentToPdfBlob(template, renderRoot, students[0], overrides);
      filename = studentFilename(students[0]);
      adminTestSetProgress(100);
    } else {
      const zip = new JSZip();
      for (let i = 0; i < students.length; i++) {
        const student = students[i];
        const pdfBlob = await renderStudentToPdfBlob(template, renderRoot, student, overrides);
        const path = `${sanitize(student.class)}/${sanitize(student.section)}/${studentFilename(student)}`;
        zip.file(path, pdfBlob);
        adminTestSetProgress(Math.round(((i + 1) / students.length) * 90));
      }
      blob = await zip.generateAsync({ type: "blob" });
      filename = "Test_Result_Cards.zip";
      adminTestSetProgress(100);
    }

    downloadBlob(blob, filename);
    adminTestShowStatus("success", `Test generation complete: ${students.length} card${students.length > 1 ? "s" : ""}. No credits were used and nothing was logged.`);
  } catch (err) {
    console.error(err);
    adminTestShowStatus("error", err.message || "Test generation failed.");
  } finally {
    setTimeout(() => adminTestSetProgress(0), 1500);
    adminTestGenerateBtn.disabled = !adminTestSelectedFile;
    renderRoot.innerHTML = "";
  }
});
