from flask import Flask, request, jsonify, send_from_directory, redirect, abort
from flask_cors import CORS
from pathlib import Path
import sys
import uuid
import csv
import subprocess
import threading
import webbrowser


# ============================================================
# PROJECT PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parents[2]

UPLOAD_FOLDER = BASE_DIR / "uploads" / "images"
OUTPUT_FOLDER = BASE_DIR / "outputs" / "extracted_text"

UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
OUTPUT_FOLDER.mkdir(parents=True, exist_ok=True)


# ============================================================
# IMPORT OCR
# ============================================================

sys.path.insert(0, str(BASE_DIR))

from src.ocr.ocr_extractor import process_image


# ============================================================
# FLASK
# ============================================================

app = Flask(__name__)
CORS(app)
# Always load the newest HTML/CSS/JS (no stale cached files)
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0


def find_frontend_dir():
    """Find the folder that contains index.html and app.js."""
    skip = {"node_modules", "venv", ".venv", "env", "site-packages", ".git"}

    for path in BASE_DIR.rglob("index.html"):
        if skip & set(path.parts):
            continue
        if (path.parent / "app.js").exists():
            return path.parent

    return None


FRONTEND_DIR = find_frontend_dir()

# ============================================================
# HOME & CLEAN ROUTES
# ============================================================

@app.route("/", methods=["GET"])
def home():
    if FRONTEND_DIR is None:
        return jsonify({
            "status": "running",
            "message": "Exam Malpractice Detection API (index.html not found)"
        })

    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/upload", methods=["GET"])
def upload_page():
    if FRONTEND_DIR is None:
        abort(404)
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/login", methods=["GET"])
def login_page():
    if FRONTEND_DIR is None:
        abort(404)
    return send_from_directory(FRONTEND_DIR, "login.html")


@app.route("/report", methods=["GET"])
def report_page():
    if FRONTEND_DIR is None:
        abort(404)
    return send_from_directory(FRONTEND_DIR, "report.html")


@app.route("/index.html", methods=["GET"])
def index_redirect():
    return redirect("/upload")


@app.route("/login.html", methods=["GET"])
def login_redirect():
    return redirect("/login")


@app.route("/report.html", methods=["GET"])
def report_redirect():
    return redirect("/report")


@app.route("/<path:filename>", methods=["GET"])
def serve_project_file(filename):
    if any(part.startswith(".") for part in Path(filename).parts):
        abort(404)

    # Redirect .html requests to clean URLs
    if filename.endswith(".html"):
        if filename == "index.html":
            return redirect("/upload")
        if filename == "login.html":
            return redirect("/login")
        if filename == "report.html":
            return redirect("/report")
        clean_name = filename[:-5]
        return redirect(f"/{clean_name}")

    # Serve clean route if matching .html file exists in frontend
    if FRONTEND_DIR is not None and (FRONTEND_DIR / f"{filename}.html").is_file():
        return send_from_directory(FRONTEND_DIR, f"{filename}.html")

    # Frontend files (css, js, images) are served from the root
    if FRONTEND_DIR is not None and (FRONTEND_DIR / filename).is_file():
        return send_from_directory(FRONTEND_DIR, filename)

    # Everything else (demo samples, generated reports) from the project
    return send_from_directory(BASE_DIR, filename)


# ============================================================
# OCR
# ============================================================

@app.route("/api/ocr", methods=["POST"])
def ocr():

    if "file" not in request.files:
        return jsonify({
            "success": False,
            "error": "No file uploaded"
        }), 400


    file = request.files["file"]


    if file.filename == "":
        return jsonify({
            "success": False,
            "error": "No file selected"
        }), 400


    # Unique filename for uploaded image
    filename = f"{uuid.uuid4()}_{file.filename}"

    image_path = UPLOAD_FOLDER / filename


    try:

        # ----------------------------------------------------
        # Save uploaded image
        # ----------------------------------------------------

        file.save(image_path)

        print()
        print("========================================")
        print("NEW OCR REQUEST")
        print("========================================")
        print(f"Original file : {file.filename}")
        print(f"Saved image   : {image_path}")


        # ----------------------------------------------------
        # Run OCR
        # ----------------------------------------------------

        extracted_text = process_image(image_path)


        # Make sure result is a string
        if extracted_text is None:
            extracted_text = ""

        extracted_text = str(extracted_text)


        # ----------------------------------------------------
        # PRINT OCR RESULT
        # ----------------------------------------------------

        print()
        print("========================================")
        print("OCR RESULT")
        print("========================================")

        if extracted_text.strip():

            print(extracted_text)

        else:

            print("[EMPTY OCR RESULT]")


        print("========================================")
        print("END OCR RESULT")
        print("========================================")
        print()


        # ----------------------------------------------------
        # SAVE OCR TEXT TO OUTPUT FOLDER
        # ----------------------------------------------------

        output_filename = Path(file.filename).stem + ".txt"

        output_path = OUTPUT_FOLDER / output_filename

        output_path.write_text(
            extracted_text,
            encoding="utf-8"
        )


        print(f"OCR text saved to: {output_path}")


        # ----------------------------------------------------
        # SEND RESULT TO FRONTEND
        # ----------------------------------------------------

        return jsonify({
            "success": True,
            "filename": file.filename,
            "text": extracted_text
        })


    except Exception as e:

        print()
        print("========================================")
        print("OCR ERROR")
        print("========================================")
        print(str(e))
        print("========================================")
        print()


        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


# ============================================================
# SIMILARITY ANALYSIS — COMPARE ONLY TWO UPLOADED IMAGES
# ============================================================

@app.route("/api/similarity", methods=["POST"])
def similarity():
    script_path = BASE_DIR / "src" / "similarity" / "similarity_analysis.py"

    try:
        text_folder = BASE_DIR / "outputs" / "extracted_text"
        text_folder.mkdir(parents=True, exist_ok=True)

        # TEXT-ONLY MODE: used by demo presets and already-extracted text
        text_a = request.form.get("text1", "").strip()
        text_b = request.form.get("text2", "").strip()

        if text_a and text_b:
            filename_a = request.form.get("filename1", "Answer Sheet A")
            filename_b = request.form.get("filename2", "Answer Sheet B")

            text_path_a = text_folder / f"demo_{uuid.uuid4().hex}_a.txt"
            text_path_b = text_folder / f"demo_{uuid.uuid4().hex}_b.txt"

            text_path_a.write_text(text_a, encoding="utf-8")
            text_path_b.write_text(text_b, encoding="utf-8")

        else:
            # EXISTING IMAGE MODE: OCR uploaded images as before
            file_a = request.files.get("file1")
            file_b = request.files.get("file2")

            if not file_a or not file_b:
                return jsonify({
                    "success": False,
                    "error": "Please provide two images or two extracted text samples."
                }), 400

            text_paths = []

            for uploaded_file in (file_a, file_b):
                suffix = Path(uploaded_file.filename).suffix or ".png"
                unique_id = uuid.uuid4().hex
                image_path = UPLOAD_FOLDER / f"similarity_{unique_id}{suffix}"
                text_path = text_folder / f"similarity_{unique_id}.txt"

                uploaded_file.save(image_path)
                extracted_text = process_image(image_path)

                if not extracted_text or not extracted_text.strip():
                    return jsonify({
                        "success": False,
                        "error": f"OCR could not extract text from {uploaded_file.filename}."
                    }), 400

                text_path.write_text(extracted_text, encoding="utf-8")
                text_paths.append(text_path)

            text_path_a, text_path_b = text_paths
            filename_a = file_a.filename
            filename_b = file_b.filename

        # Run the existing similarity analysis on the two text files
        result = subprocess.run(
            [
                sys.executable,
                str(script_path),
                str(text_path_a),
                str(text_path_b)
            ],
            cwd=str(BASE_DIR),
            capture_output=True,
            text=True,
            timeout=180
        )

        if result.returncode != 0:
            return jsonify({
                "success": False,
                "error": result.stderr or result.stdout
            }), 500

        # Load N-gram comparison results
        ngram_path = (
            BASE_DIR / "src" / "similarity" / "outputs"
            / "ngram_comparison.csv"
        )

        ngram_results = []

        if ngram_path.exists():
            with open(ngram_path, "r", encoding="utf-8", newline="") as csv_file:
                reader = csv.DictReader(csv_file)
                ngram_results = list(reader)
        else:
            raise FileNotFoundError(
                "N-gram comparison CSV was not generated."
            )

        return jsonify({
            "success": True,
            "message": "Similarity analysis completed.",
            "ocr_texts": [
                {
                    "filename": filename_a,
                    "text": text_path_a.read_text(encoding="utf-8")
                },
                {
                    "filename": filename_b,
                    "text": text_path_b.read_text(encoding="utf-8")
                }
            ],
            "output": result.stdout,
            "ngram_results": ngram_results,
            "report": "/src/similarity/outputs/similarity_evidence_report.html",
        })

    except subprocess.TimeoutExpired:
        return jsonify({
            "success": False,
            "error": "Similarity analysis timed out."
        }), 500

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

if __name__ == "__main__":
    url = "http://127.0.0.1:5000/"

    print()
    print("=" * 50)
    print(f"  Verity is running: {url}")
    print(f"  Frontend folder : {FRONTEND_DIR}")
    print("=" * 50)
    print()

    # Opens the app in your browser automatically
    threading.Timer(1.0, lambda: webbrowser.open(url)).start()

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=False
    )