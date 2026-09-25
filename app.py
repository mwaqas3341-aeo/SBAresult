import os
import shutil
import tempfile
from pathlib import Path

from flask import (
    Flask, after_this_request, flash, redirect,
    render_template, request, send_file, url_for,
)

from engine.generator import ParseError, generate

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-change-me")
app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024  # 25 MB upload cap

ALLOWED_EXTENSIONS = {".xlsx", ".xlsm"}


@app.route("/", methods=["GET"])
def index():
    return render_template("index.html")


@app.route("/generate", methods=["POST"])
def generate_route():
    file = request.files.get("logsheet")
    if not file or file.filename == "":
        flash("Please choose an Excel file to upload.", "error")
        return redirect(url_for("index"))

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        flash("Please upload a .xlsx or .xlsm file.", "error")
        return redirect(url_for("index"))

    workdir = Path(tempfile.mkdtemp(prefix="sba_"))
    upload_path = workdir / f"upload{ext}"
    file.save(upload_path)

    try:
        kind, out_path, download_name = generate(upload_path, workdir)
    except ParseError as e:
        shutil.rmtree(workdir, ignore_errors=True)
        flash(str(e), "error")
        return redirect(url_for("index"))
    except Exception as e:  # pragma: no cover - defensive catch-all
        shutil.rmtree(workdir, ignore_errors=True)
        flash(f"Something went wrong while generating the result card(s): {e}", "error")
        return redirect(url_for("index"))

    @after_this_request
    def cleanup(response):
        shutil.rmtree(workdir, ignore_errors=True)
        return response

    mimetype = "application/pdf" if kind == "pdf" else "application/zip"
    return send_file(out_path, mimetype=mimetype, as_attachment=True, download_name=download_name)


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
