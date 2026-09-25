# SBA Result Card Generator

A small web app for Govt. school **School Based Assessment (SBA)** result
cards. Upload a Log Sheet (Excel), and it generates one PDF result card per
student — a single PDF for one student, or a ZIP (sorted into
`Class/Section/` folders) for several.

The result card **layout, formulas, and grading logic are the original
template, untouched** — this app just automates what the original Excel
macro did (stamp a student's row into the template, let the template's own
formulas calculate grades, export as PDF), so there is no risk of the
printed card ever drifting from the approved format.

## How it works

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

### Grading formula (from the template, unchanged)

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
If your school actually wants folder-grouping to use a *different* column,
that's a one-line change in `engine/generator.py` (`_map_headers`).

## Local development

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

## Deployment

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
app.py                    Flask routes (upload page, /generate)
engine/generator.py       Parsing, template stamping, PDF/ZIP generation
assets/master_template.xlsx   The untouched Result Card + Log Sheet template
fonts/                    Barlow Semi Condensed (template font, bundled for Docker)
templates/, static/       Upload page HTML/CSS
```
