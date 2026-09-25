FROM python:3.11-slim

# LibreOffice Calc renders the result-card PDFs.
# fonts-crosextra-carlito is a metric-compatible substitute for Calibri
# (used by the template). Barlow Semi Condensed (the other template font)
# is bundled in ./fonts because it isn't packaged for Debian.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libreoffice-calc \
        fonts-crosextra-carlito \
        fontconfig \
    && rm -rf /var/lib/apt/lists/*

COPY fonts/*.ttf /usr/share/fonts/truetype/barlow-semi-condensed/
RUN fc-cache -f

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=5000
EXPOSE 5000
CMD ["gunicorn", "-b", "0.0.0.0:5000", "-w", "2", "--timeout", "120", "app:app"]
