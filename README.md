# SBA Result Card Generator

A web app for Govt. school **School Based Assessment (SBA)** result cards.
Upload a Log Sheet (Excel), and it generates one PDF result card per
student — a single PDF for one student, or a ZIP (sorted into
`Class/Section/` folders) for several.

**Live, ready to use — no hosting, no server, no cost:** the app in
[`docs/`](docs/) runs **entirely in your browser** and is served for free
by GitHub Pages straight from this repo. Enable it once under
**Settings → Pages → Deploy from a branch → `main` / `docs`**, and your
copy is live at `https://<you>.github.io/<repo>/`.

## How it works (docs/ — the GitHub Pages app)

Nothing is uploaded anywhere. When you choose a Log Sheet file, the page:

1. Parses it in-browser with [SheetJS](https://sheetjs.com/) — finds the
   `Log Sheet` tab, maps its columns, and reads one row per student.
2. Fills an HTML/CSS recreation of the original Result Card (same text,
   layout, colors, grading table, and the official Punjab government
   banner image) with that student's data, and computes each subject's
   grade with the **same percentage bands as the original template's
   formulas**.
3. Rasterizes that card to a crisp PDF page with `html2canvas` + `jsPDF`.
4. One student → downloads a single PDF. Several → zips them (via
   `JSZip`) into `Class/Section/StudentName_Class_Roll.pdf` and downloads
   the ZIP.

All four libraries (`xlsx`, `jszip`, `html2canvas`, `jspdf`) are vendored
in `docs/js/vendor/` — the page loads no external CDN at runtime, so it
keeps working even if a CDN is down or blocked.

**Note:** this recreates the card's appearance in HTML/CSS rather than
reusing the original Excel formulas directly, so it is a very close but
not pixel-identical match to the source workbook. If you need the literal
original template rendered (formulas and formatting untouched, byte-for-byte
the same file), use the Flask/LibreOffice version below instead.

### Grading formula (same bands as the original template)

| Grade | Percentage    |
|-------|---------------|
| A+    | Above 80%     |
| A     | 70% – 79%     |
| B     | 60% – 69%     |
| C     | 50% – 59%     |
| D     | 40% – 49%     |
| E     | 33% – 39%     |
| F     | Below 33%     |

## Expected input format

The uploaded `.xlsx`/`.xlsm` needs a sheet (named with "Log" in it, e.g.
`Log Sheet`; otherwise the sheet whose header row best matches is used)
with a header row and one student per row below it:

`SCHOOL NAME | CLASS | ROLL NO. | B.Form No. | STUDENT NAME | FATHER NAME |
Date Of Birth | Section | English | URDU | MATHEMATICS |
GENERAL KNOWLEDGE/GENERAL SCIENCE | SOCIAL STUDIES/HISTORY/GEOGHRAGHY |
ISLAMIAT/ETHICS | HOLY QURAN | COMPUTER EDUCATION | OTHER SUBJECT`

Header matching is case/spacing-insensitive, so minor formatting
differences are fine, but the *fields* need to be present. A row is
treated as a student row when its Student Name cell is non-empty (so a
"Total Marks" summary row or a blank row is skipped automatically).

**Note on `Section`:** the original template's Log Sheet has two columns
both headed "Section" (one used on the printed card, one — column R — that
in the sample data contained stray test values). This app uses the
**first** "Section" column (the one that also appears on the printed
card) for both the card and the Class/Section folder grouping in the ZIP.

## Trying it locally

```bash
cd docs
python3 -m http.server 8080
# open http://localhost:8080
```

## Using this as a template for another school

This repo is meant to be copied via GitHub's **"Use this template"** button
(if you don't see that button, ask the repo owner to enable it under
*Settings → General → Template repository*), so any school can stand up
their own copy, enable Pages on it, and be live in a couple of minutes.

**If your result card uses the exact same official SBA layout** as
`original_template/Auto_Result_Card.xlsm`, you don't need to change
anything — enable Pages and start uploading your own Log Sheets.

**If your school's card design is different**, the parts to change are:

- `docs/index.html` — the `<template id="card-template">` markup (the
  card's structure/labels) and the static `LAYYAH` district text.
- `docs/css/style.css` — the `.rc-*` rules (colors, fonts, sizing).
- `docs/js/parse.js` — `HEADER_SYNONYMS` (your Log Sheet's column names)
  and `SUBJECT_DEFS` (your subjects and their max marks).
- `docs/assets/header-banner.jpg` — swap in your own header image.

The grading bands live in `docs/js/grading.js` if your school uses a
different scale.

---

## Alternative: self-hosted Flask + LibreOffice version

The root of this repo also contains a second implementation that reuses
the **actual original Excel file** (formulas and all) via LibreOffice
headless, for anyone who wants byte-for-byte fidelity to the source
workbook instead of an HTML recreation. This one needs a server (it's not
free/static like the Pages app above) — see below.

### How it works

1. `assets/master_template.xlsx` is the original `Result Card` +
   `Log Sheet` workbook (VBA stripped — it's not needed since the app does
   the work server-side), with the staging row blanked out.
2. For each student row found in the **uploaded** file's Log Sheet, the app:
   - copies that row's 17 fields into `Result Card!A41:Q41` of a fresh copy
     of the template (same cells the original VBA macro used),
   - hides the `Log Sheet` tab so only the Result Card exports,
   - converts the workbook to PDF with LibreOffice headless, which
     recalculates every formula (subject grades, grand total, overall
     grade) using the template's own formulas.
3. One PDF → returned directly. Multiple PDFs → zipped into
   `Class/Section/StudentName_Class_Roll.pdf`.

### Local development

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# LibreOffice must be installed locally too:
#   Debian/Ubuntu: sudo apt install libreoffice-calc fonts-crosextra-carlito
# The template also uses "Barlow Semi Condensed" (not a default OS font) —
# install the .ttf files in ./fonts (e.g. copy them into ~/.fonts, then
# run `fc-cache -f`) or PDFs will render with a wider substitute font and
# some labels will clip.

python app.py   # http://localhost:5000
```

### Deployment

A `Dockerfile` is included — it installs LibreOffice, the Calibri-compatible
`fonts-crosextra-carlito` package, and bundles the Barlow Semi Condensed
font family from `./fonts`, so the container renders PDFs identically to
the reference build. Any host that runs a Dockerfile (Render, Railway,
Fly.io, a VPS, etc.) will work:

```bash
docker build -t sba-result-card .
docker run -p 5000:5000 sba-result-card
```

## Project layout

```
docs/                     The GitHub Pages app (client-side, no server)
  index.html                Upload page + off-screen card template
  css/style.css              Styles for the page and the result card
  js/parse.js                Log Sheet parsing (SheetJS)
  js/grading.js               Grading formula
  js/render.js                 Card fill-in + PDF rasterization
  js/app.js                     UI wiring, single/ZIP output
  js/vendor/                     Vendored xlsx/jszip/html2canvas/jspdf
  assets/header-banner.jpg        Punjab government header image
  fonts/                           Barlow Semi Condensed (template font)

app.py                    Flask routes (upload page, /generate) — alternative
engine/generator.py       Parsing, template stamping, PDF/ZIP generation
assets/master_template.xlsx   The untouched Result Card + Log Sheet template
fonts/                    Barlow Semi Condensed (template font, bundled for Docker)
templates/, static/       Upload page HTML/CSS for the Flask version
original_template/        The original Excel/VBA workbook, kept for reference
```
