# Verity: Exam Intelligence

AI-assisted system that reads two handwritten answer sheets and compares them
to support examiner review of possible malpractice.

> Similarity scores are indicators for review, not proof of malpractice.

## Features

- Upload two answer-sheet photos (JPEG/PNG) with a live preview
- Handwriting OCR using the Google Gemini vision API
- Questions and headers are excluded, so only the answers are compared
- TF-IDF cosine similarity for overall paper similarity
- N-gram overlap and exact shared-phrase detection (4+ consecutive words)
- Sentence-level matching evidence
- Detailed HTML report with highlighted shared text (view, download or print)
- Examiner sign-in page

## How It Works

1. **Upload:** the examiner selects Sheet A and Sheet B.
2. **Extract:** each image is resized and sent to Gemini, which returns the text
   in reading order, keeps the student's spelling and skips crossed-out words.
3. **Separate:** labels such as `Q1:`, `1Q)`, `Ans:` and `1Ans:` are recognised
   and only the answer text is kept.
4. **Compare:** cosine, n-gram and phrase-matching scores are calculated.
5. **Report:** the score and a detailed report are shown.

| Overall similarity | Level |
|---|---|
| Below 50% | Low |
| 50% to 80% | Moderate |
| 80% and above | High |

## Tech Stack

| Area | Technology |
|---|---|
| OCR | Google Gemini API (`google-genai`) |
| Backend | Python, Flask, Flask-CORS |
| Similarity | scikit-learn, pandas, NumPy, matplotlib |
| Phrase matching | Python `difflib`, optional RapidFuzz |
| Frontend | HTML, CSS, JavaScript |

## Project Structure

```
verity/
├── demo_samples/              # sample extracted-text files for the quick demo
├── notebooks/                 # experiments and notes
├── outputs/                   # extracted text (created automatically)
├── src/
│   ├── api/
│   │   ├── __init__.py
│   │   └── app.py             # Flask server, routes and static file serving
│   ├── application/           # frontend (served by Flask)
│   │   ├── __init__.py
│   │   ├── login.html         # examiner sign-in
│   │   ├── index.html         # upload and analysis workspace
│   │   ├── report.html        # detailed similarity report
│   │   ├── 404.html           # page-not-found screen
│   │   ├── app.js             # upload, OCR and similarity flow
│   │   ├── auth-modal.js      # change-password modal
│   │   ├── report.js          # report rendering and highlighting
│   │   ├── ui.js              # drag-and-drop and loading states
│   │   ├── styles.css         # workspace styles
│   │   └── report.css         # report styles
│   ├── ocr/
│   │   ├── __init__.py
│   │   ├── ocr_extractor.py   # OCR entry point used by the API
│   │   └── ocr_gemini.py      # Gemini handwriting OCR
│   └── similarity/
│       ├── __init__.py
│       ├── similarity_analysis.py   # TF-IDF cosine and sentence matching
│       ├── ngram_analysis.py        # n-gram overlap and shared phrases
│       └── outputs/                 # analysis CSVs and HTML report (created automatically)
├── uploads/                   # uploaded images (created automatically)
├── .env                       # API key (never commit)
├── .gitignore
└── requirements.txt
```

## Installation

Requires Python 3.10 or newer (tested with 3.12) and a free Gemini API key
from [Google AI Studio](https://aistudio.google.com).

```bash
git clone https://github.com/<your-username>/verity.git
cd verity
python -m venv venv

# Windows (PowerShell)
.\venv\Scripts\Activate.ps1
# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
```

`requirements.txt`:

```
flask
flask-cors
google-genai
pillow
scikit-learn
pandas
numpy
matplotlib
rapidfuzz   # optional
```

## Configuration

Set your API key as an environment variable. Never commit it to GitHub.

```bash
# Windows (PowerShell)
$env:GEMINI_API_KEY="your-key"
# macOS / Linux
export GEMINI_API_KEY="your-key"
```

## Running the App

```bash
python src/api/app.py
```

Open http://127.0.0.1:5000/login in your browser.

| Page | URL |
|---|---|
| Sign in | `/login` |
| Upload and analysis | `/upload` |
| Report | `/report` |

## Usage

1. Sign in with the demo examiner credentials shown on the login page.
2. Choose Answer Sheet A and Answer Sheet B.
3. Click **Extract Text** and check the extracted text.
4. Click **Analyze Similarity** to see the score.
5. Click **View Detailed Report** or **Download Report**.

## Notes and Limitations

- Needs an internet connection; images are sent to the Gemini API.
- The free Gemini tier has rate limits. If you see `429` or `503`, wait a minute and retry.
- Handwriting OCR is not 100% accurate, so review the extracted text.
- Common textbook definitions can score high without any copying.
- Change the demo credentials before any real use.


## Disclaimer

This tool supports examiners and does not decide malpractice. Final decisions
must be made by a qualified examiner after reviewing the original answer sheets.
