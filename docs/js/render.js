function fillCard(container, student) {
  const set = (field, text) => {
    const el = container.querySelector(`[data-field="${field}"]`);
    if (el) el.textContent = text;
  };

  set("school", student.school);
  set("district", "LAYYAH");
  set("name", student.name);
  set("father", student.father);
  set("bform", student.bform);
  set("class", student.class);
  set("roll", student.roll);
  set("section", student.section);
  set("dob", student.dobShort);
  set("dobWords", student.dobWords);

  const tbody = container.querySelector('[data-field="subjectRows"]');
  tbody.innerHTML = "";
  student.subjects.forEach((s, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${i + 1}</td><td>${s.label}</td><td>${s.max}</td><td>${s.obtained}</td><td>${s.grade}</td>`;
    tbody.appendChild(tr);
  });

  set("grandTotalMax", student.grandTotalMax);
  set("grandTotalObtained", student.grandTotalObtained);
  set("grandTotalGrade", student.grandTotalGrade);
}

async function renderStudentToPdfBlob(template, root, student) {
  const node = template.content.firstElementChild.cloneNode(true);
  root.innerHTML = "";
  root.appendChild(node);
  fillCard(node, student);

  // Let fonts/images settle before rasterizing.
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }
  await new Promise((resolve) => setTimeout(resolve, 30));

  const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
  const imgData = canvas.toDataURL("image/jpeg", 0.92);

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const maxW = pageWidth - margin * 2;
  const maxH = pageHeight - margin * 2;

  const ratio = Math.min(maxW / canvas.width, maxH / canvas.height);
  const drawW = canvas.width * ratio;
  const drawH = canvas.height * ratio;
  const x = (pageWidth - drawW) / 2;
  const y = margin;

  pdf.addImage(imgData, "JPEG", x, y, drawW, drawH);
  return pdf.output("blob");
}
