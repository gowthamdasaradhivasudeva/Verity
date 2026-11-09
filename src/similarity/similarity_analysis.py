try:
    from src.similarity.ngram_analysis import compare as compare_ngrams
except ModuleNotFoundError:
    from ngram_analysis import compare as compare_ngrams
from pathlib import Path
from collections import Counter
from difflib import SequenceMatcher
from html import escape
import re

import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


# ==================================================
# 1. CONFIGURATION
# ==================================================

INPUT_FOLDER = Path(__file__).resolve().parents[2] / "outputs" / "extracted_text"
import sys

if len(sys.argv) == 3:
    INPUT_FILES = [Path(sys.argv[1]), Path(sys.argv[2])]
else:
    INPUT_FILES = None

OUTPUT_FOLDER = Path(__file__).parent / "outputs"
OUTPUT_FOLDER.mkdir(parents=True, exist_ok=True)

# Sentence matches below this score are omitted from the report.
# This is a display filter, not a validated malpractice threshold.
MIN_SENTENCE_SIMILARITY = 0.20

MAX_SENTENCE_MATCHES = 15


# ==================================================
# 2. TEXT PREPROCESSING
# ==================================================

QUESTION_MARKER = re.compile(
    r"^\s*(?:q(?:uestion)?\s*\d+\b|\d+\s*q\b)\s*[:.)-]?\s*",
    re.IGNORECASE
)
ANSWER_MARKER = re.compile(
    r"^\s*ans(?:wer)?\s*[:.)-]\s*",
    re.IGNORECASE
)


def extract_answers(text):
    """
    Keep only answer text. Question markers (Q1:, Question 1) and the
    question text that follows them are excluded, because both papers
    contain the same questions.
    """
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")

    has_answer_markers = any(ANSWER_MARKER.match(l) for l in lines)

    answers = []
    in_answer = False
    seen_question = False

    for raw in lines:
        line = raw.strip()

        if not line:
            continue

        # A question marker starts a new question: skip it and its text
        if QUESTION_MARKER.match(line):
            in_answer = False
            seen_question = True
            continue

        if ANSWER_MARKER.match(line):
            in_answer = True
            line = ANSWER_MARKER.sub("", line, count=1).strip()

        elif not has_answer_markers:
            # Papers without "Answer:" labels: text after a question
            # marker counts as the answer.
            if not seen_question:
                continue
            in_answer = True

        if in_answer and line:
            answers.append(line)

    return "\n".join(answers)


def normalize_text(text):
    """Normalize OCR text while retaining usable answer content."""

    extracted_answers = extract_answers(text)

    # If answer markers were not detected, preserve the OCR text.
    if not extracted_answers.strip():
        extracted_answers = text

    text = extracted_answers.lower()

    text = re.sub(r"[^a-z0-9.,;:!?()\-\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()

    return text


def split_sentences(text):
    """Split answer text into approximate sentences."""
    parts = re.split(r"(?<=[.!?])\s+|\n+", text)

    return [
        part.strip()
        for part in parts
        if len(part.split()) >= 3
    ]


def word_tokens(text):
    return re.findall(r"\b[a-z0-9]+\b", text.lower())


# ==================================================
# 3. LOAD ANSWER PAPERS
# ==================================================

if not INPUT_FOLDER.is_dir():
    raise SystemExit(
        f"OCR folder does not exist:\n{INPUT_FOLDER}"
    )

documents = {}

if INPUT_FILES:
    files_to_load = INPUT_FILES
else:
    files_to_load = sorted(INPUT_FOLDER.glob("*.txt"))

for file_path in files_to_load:
    raw_text = file_path.read_text(
        encoding="utf-8",
        errors="replace"
    )

    cleaned = normalize_text(raw_text)

    if cleaned:
        documents[file_path.stem] = cleaned
        (OUTPUT_FOLDER / f"cleaned_{file_path.stem}.txt").write_text(cleaned, encoding="utf-8")


student_ids = list(documents)

if len(documents) < 2:
    raise SystemExit(
        "Please add at least two non-empty OCR .txt files to:\n"
        f"{INPUT_FOLDER}"
    )

print(f"\nLoaded {len(documents)} answer papers.")


# ==================================================
# 4. OVERALL PAPER SIMILARITY
# ==================================================

document_vectorizer = TfidfVectorizer(
    lowercase=False,
    ngram_range=(1, 1),
    token_pattern=r"(?u)\b\w+\b"
)

try:
    document_vectors = document_vectorizer.fit_transform(
        documents.values()
    )
except ValueError as error:
    raise SystemExit(f"TF-IDF could not process the papers: {error}")

document_scores = cosine_similarity(document_vectors)

matrix_df = pd.DataFrame(
    document_scores * 100,
    index=student_ids,
    columns=student_ids
)

matrix_path = OUTPUT_FOLDER / "paper_similarity_matrix.csv"
matrix_df.to_csv(matrix_path, float_format="%.2f")


# ==================================================
# 5. SENTENCE-LEVEL SIMILARITY
# ==================================================

sentences_by_student = {
    student: split_sentences(text)
    for student, text in documents.items()
}

all_sentences = []
sentence_owner = []

for student, sentences in sentences_by_student.items():
    for sentence in sentences:
        all_sentences.append(sentence)
        sentence_owner.append(student)

sentence_vectorizer = TfidfVectorizer(
    lowercase=False,
    ngram_range=(1, 2),
    token_pattern=r"(?u)\b\w+\b"
)

try:
    sentence_vectors = sentence_vectorizer.fit_transform(
        all_sentences
    )
except ValueError:
    raise SystemExit(
        "Could not extract usable words from the OCR text."
    )

sentence_scores = cosine_similarity(sentence_vectors)


# Store each sentence's location in the combined sentence list.
sentence_indices = {}

for index, student in enumerate(sentence_owner):
    sentence_indices.setdefault(student, []).append(index)


def match_sentences(student_a, student_b):
    """
    Find high-similarity sentence pairs using greedy one-to-one
    matching, so one sentence is not repeatedly paired with many
    sentences from the other paper.
    """
    indices_a = sentence_indices[student_a]
    indices_b = sentence_indices[student_b]

    candidates = []

    for i in indices_a:
        for j in indices_b:
            score = float(sentence_scores[i, j])

            if score >= MIN_SENTENCE_SIMILARITY:
                candidates.append((score, i, j))

    candidates.sort(reverse=True)

    used_a = set()
    used_b = set()
    matches = []

    for score, i, j in candidates:
        if i in used_a or j in used_b:
            continue

        used_a.add(i)
        used_b.add(j)

        matches.append({
            "Student A": student_a,
            "Student B": student_b,
            "Sentence A": all_sentences[i],
            "Sentence B": all_sentences[j],
            "Sentence Similarity (%)": round(score * 100, 2)
        })

    return matches


# ==================================================
# 6. COMPARE EVERY STUDENT PAIR
# ==================================================

pair_rows = []
sentence_rows = []
evidence_by_pair = {}
ngram_rows = []

for i in range(len(student_ids)):
    for j in range(i + 1, len(student_ids)):
        student_a = student_ids[i]
        student_b = student_ids[j]

        overall_score = float(document_scores[i, j] * 100)
        ngram_result = compare_ngrams(
            documents[student_a],
            documents[student_b]
        )
        ngram_rows.append({
            "Student A": student_a,
            "Student B": student_b,
            "Trigram Overlap (%)": ngram_result["trigram_overlap"],
            "Fourgram Overlap (%)": ngram_result["fourgram_overlap"],
            "Copied Text (%)": ngram_result["copied_text_percent"],
            "Longest Shared Phrase (Words)": ngram_result["longest_shared_run_words"],
            "Near Matches Found": len(ngram_result["near_matches"])
        })

        matches = match_sentences(student_a, student_b)
        matches.sort(
            key=lambda item: item["Sentence Similarity (%)"],
            reverse=True
        )

        evidence_by_pair[(student_a, student_b)] = matches

        pair_rows.append({
            "Student A": student_a,
            "Student B": student_b,
            "Overall Paper Similarity (%)": round(overall_score, 2),
            "Sentence Matches Found": len(matches)
        })

        sentence_rows.extend(matches)

pair_df = pd.DataFrame(pair_rows).sort_values(
    "Overall Paper Similarity (%)",
    ascending=False
)

sentence_columns = [
    "Student A",
    "Student B",
    "Sentence A",
    "Sentence B",
    "Sentence Similarity (%)"
]

sentence_df = pd.DataFrame(
    sentence_rows,
    columns=sentence_columns
)
ngram_df = pd.DataFrame(ngram_rows)
pair_path = OUTPUT_FOLDER / "paper_pair_scores.csv"
sentence_path = OUTPUT_FOLDER / "sentence_comparison.csv"
ngram_path = OUTPUT_FOLDER / "ngram_comparison.csv"

pair_df.to_csv(pair_path, index=False)
sentence_df.to_csv(sentence_path, index=False)
ngram_df.to_csv(ngram_path, index=False)


# ==================================================
# 7. WORD-LEVEL EVIDENCE HIGHLIGHTING
# ==================================================

def highlight_shared_words(text_a, text_b):
    """
    Highlight words shared between two sentences.
    Repeated words are highlighted as shared vocabulary,
    not necessarily as matching sequences.
    """
    tokens_a = set(word_tokens(text_a))
    tokens_b = set(word_tokens(text_b))
    shared = tokens_a & tokens_b

    def mark(text):
        pieces = re.split(r"(\b[a-zA-Z0-9]+\b)", text)
        output = []

        for piece in pieces:
            if piece.lower() in shared and piece.strip():
                output.append(
                    '<span class="shared">'
                    + escape(piece)
                    + "</span>"
                )
            else:
                output.append(escape(piece))

        return "".join(output)

    return mark(text_a), mark(text_b), sorted(shared)


# ==================================================
# 8. PROFESSIONAL SIMILARITY HEATMAP
# ==================================================

fig, ax = plt.subplots(
    figsize=(max(8, len(student_ids) * 1.1),
             max(6, len(student_ids) * 0.8))
)

image = ax.imshow(
    document_scores * 100,
    cmap="YlOrRd",
    vmin=0,
    vmax=100
)

ax.set_title(
    "Answer Paper Similarity",
    fontsize=17,
    fontweight="bold",
    pad=20
)

ax.set_xticks(range(len(student_ids)))
ax.set_yticks(range(len(student_ids)))

ax.set_xticklabels(student_ids, rotation=40, ha="right")
ax.set_yticklabels(student_ids)

for i in range(len(student_ids)):
    for j in range(len(student_ids)):
        ax.text(
            j, i,
            f"{document_scores[i, j] * 100:.1f}%",
            ha="center",
            va="center",
            fontsize=9,
            color="black"
        )

colorbar = fig.colorbar(image, ax=ax, shrink=0.85)
colorbar.set_label("Overall lexical similarity (%)")

fig.tight_layout()

heatmap_path = OUTPUT_FOLDER / "paper_similarity_heatmap.png"
fig.savefig(heatmap_path, dpi=250, bbox_inches="tight")
plt.close(fig)


# ==================================================
# 9. PROFESSIONAL PAIRWISE BAR CHART
# ==================================================

plot_df = pair_df.head(15).copy()

if not plot_df.empty:
    plot_df["Pair"] = (
        plot_df["Student A"] + "  vs  " + plot_df["Student B"]
    )
    plot_df = plot_df.sort_values(
        "Overall Paper Similarity (%)"
    )

    fig, ax = plt.subplots(
        figsize=(11, max(4.5, len(plot_df) * 0.55))
    )

    bars = ax.barh(
        plot_df["Pair"],
        plot_df["Overall Paper Similarity (%)"],
        color="#4776A8",
        height=0.65
    )

    ax.set_title(
        "Most Similar Answer Paper Pairs",
        fontsize=16,
        fontweight="bold",
        pad=18
    )

    ax.set_xlabel("Overall lexical similarity (%)")
    ax.set_xlim(0, 110)
    ax.grid(axis="x", linestyle="--", alpha=0.25)
    ax.set_axisbelow(True)

    for bar, value in zip(
        bars, plot_df["Overall Paper Similarity (%)"]
    ):
        ax.text(
            value + 1,
            bar.get_y() + bar.get_height() / 2,
            f"{value:.1f}%",
            va="center",
            fontsize=9
        )

    fig.tight_layout()

    bar_path = OUTPUT_FOLDER / "paper_pair_comparison.png"
    fig.savefig(bar_path, dpi=250, bbox_inches="tight")
    plt.close(fig)


# ==================================================
# 10. GENERATE HTML EVIDENCE REPORT
# ==================================================

html_parts = ["""
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Answer Paper Similarity Report</title>
<style>
body {
    font-family: Segoe UI, Arial, sans-serif;
    background: #f3f6fb;
    color: #172033;
    margin: 0;
    padding: 28px;
}
.container { max-width: 1200px; margin: auto; }
header {
    background: #182b49;
    color: white;
    padding: 28px;
    border-radius: 14px;
    margin-bottom: 24px;
}
header h1 { margin: 0 0 8px; }
.muted { color: #64748b; font-size: 13px; }
header .muted { color: #d7e2f1; }
.cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
}
.card, .panel {
    background: white;
    border: 1px solid #e0e7f0;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 20px;
}
.metric { font-size: 27px; font-weight: 700; margin-top: 8px; }
h2 { margin-top: 0; }
.pair-title { color: #234c7a; }
.match {
    border: 1px solid #e0e7f0;
    border-radius: 10px;
    margin: 14px 0;
    padding: 16px;
}
.score {
    font-size: 19px;
    font-weight: bold;
    color: #234c7a;
}
.columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
}
.paper {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    padding: 14px;
    border-radius: 8px;
    overflow-wrap: anywhere;
}
.shared {
    background: #ffe29a;
    color: #573b00;
    font-weight: bold;
    border-radius: 3px;
}
img { max-width: 100%; height: auto; border-radius: 8px; }
table { border-collapse: collapse; width: 100%; }
th, td {
    text-align: left;
    padding: 10px;
    border-bottom: 1px solid #e2e8f0;
}
th { background: #f1f5f9; }
@media(max-width: 700px) {
    body { padding: 12px; }
    .columns { grid-template-columns: 1fr; }
}
@media print {
    body { background: white; padding: 0; }
    .card, .panel, .match { break-inside: avoid; }
}
</style>
</head>
<body>
<div class="container">
<header>
<h1>Answer Paper Similarity Report</h1>
<p>TF-IDF and cosine similarity with sentence-level comparison evidence</p>
<p class="muted">For examiner review — not an automatic malpractice verdict</p>
</header>
"""]

html_parts.append(f"""
<div class="cards">
<div class="card">
<div class="muted">Answer papers analysed</div>
<div class="metric">{len(student_ids)}</div>
</div>
<div class="card">
<div class="muted">Student pairs compared</div>
<div class="metric">{len(pair_df)}</div>
</div>
<div class="card">
<div class="muted">Sentence matches reported</div>
<div class="metric">{len(sentence_df)}</div>
</div>
</div>
""")

html_parts.append("""
<div class="panel">
<h2>Overall Paper Similarity</h2>
<p class="muted">
Scores represent TF-IDF cosine similarity across complete papers.
They are not probabilities of malpractice.
</p>
<img src="paper_similarity_heatmap.png" alt="Paper similarity heatmap">
</div>
""")

if not pair_df.empty:
    html_parts.append("""
<div class="panel">
<h2>Highest Similarity Pairs</h2>
<img src="paper_pair_comparison.png" alt="Pairwise similarity chart">
</div>
""")

html_parts.append("<div class='panel'><h2>Pairwise Results</h2><table>")
html_parts.append(
    "<tr><th>Student A</th><th>Student B</th>"
    "<th>Paper Similarity</th><th>Sentence Matches</th></tr>"
)

for _, row in pair_df.iterrows():
    html_parts.append(
        "<tr>"
        f"<td>{escape(str(row['Student A']))}</td>"
        f"<td>{escape(str(row['Student B']))}</td>"
        f"<td>{row['Overall Paper Similarity (%)']:.2f}%</td>"
        f"<td>{int(row['Sentence Matches Found'])}</td>"
        "</tr>"
    )

html_parts.append("</table></div>")
html_parts.append("<div class='panel'><h2>Sentence-by-Sentence Evidence</h2>")

for (student_a, student_b), matches in evidence_by_pair.items():
    overall = float(
        document_scores[
            student_ids.index(student_a),
            student_ids.index(student_b)
        ] * 100
    )

    html_parts.append(
        f"<h3 class='pair-title'>{escape(student_a)} vs "
        f"{escape(student_b)}</h3>"
        f"<p>Overall paper similarity: <b>{overall:.2f}%</b></p>"
    )

    if not matches:
        html_parts.append(
            "<p class='muted'>No sentence pairs met the configured "
            "display threshold. This does not rule out similarity.</p>"
        )
        continue

    for match in matches[:MAX_SENTENCE_MATCHES]:
        text_a = match["Sentence A"]
        text_b = match["Sentence B"]

        highlighted_a, highlighted_b, shared = highlight_shared_words(
            text_a, text_b
        )

        html_parts.append(f"""
<div class="match">
<div class="score">
Sentence similarity: {match['Sentence Similarity (%)']:.2f}%
</div>
<div class="columns">
<div class="paper">
<b>{escape(student_a)}</b><br><br>{highlighted_a}
</div>
<div class="paper">
<b>{escape(student_b)}</b><br><br>{highlighted_b}
</div>
</div>
<p class="muted">
Shared words: {escape(", ".join(shared) if shared else "None")}
</p>
</div>
""")

html_parts.append("""
</div>
<div class="panel">
<h2>How to interpret this report</h2>
<ul>
<li>Overall paper similarity compares the complete papers using TF-IDF.</li>
<li>Sentence similarity compares individual sentence vectors using TF-IDF
with unigrams and bigrams.</li>
<li>Yellow highlighting marks shared individual words, not proof of copied
word order.</li>
<li>OCR errors, common definitions, and standard terminology can affect scores.</li>
<li>Review the original answer sheets before drawing any conclusion.</li>
</ul>
<p class="muted">Sentence matching uses a greedy one-to-one assignment.
It may miss paraphrases or matching passages split differently by OCR.</p>
</div>
</div>
</body>
</html>
""")

report_path = OUTPUT_FOLDER / "similarity_evidence_report.html"
report_path.write_text(
    "\n".join(html_parts),
    encoding="utf-8"
)



# ==================================================
# 11. DETAILED TERMINAL OUTPUT + HTML REPORT
# ==================================================

print("\n" + "=" * 70)
print("       AI EXAMINATION MALPRACTICE DETECTION")
print("       TF-IDF + COSINE SIMILARITY ANALYSIS")
print("=" * 70)

print(f"\nTotal answer papers analysed: {len(student_ids)}")
print(f"Total student pairs compared: {len(pair_df)}")

# Overall similarity matrix
print("\n" + "-" * 70)
print("1. OVERALL PAPER SIMILARITY MATRIX (%)")
print("-" * 70)
print(matrix_df.round(2).to_string())

# Pairwise comparison
print("\n" + "-" * 70)
print("2. STUDENT-PAIR COMPARISON")
print("-" * 70)

if pair_df.empty:
    print("No student pairs available.")
else:
    print(pair_df.to_string(index=False))

# Sentence-level evidence
print("\n" + "-" * 70)
print("3. SENTENCE-LEVEL MATCHING EVIDENCE")
print("-" * 70)

if sentence_df.empty:
    print("No sentence pairs met the configured similarity threshold.")
else:
    for pair, matches in evidence_by_pair.items():
        student_a, student_b = pair

        print(f"\n{student_a} vs {student_b}")

        overall = document_scores[
            student_ids.index(student_a),
            student_ids.index(student_b)
        ] * 100

        print(f"Overall paper similarity: {overall:.2f}%")

        for number, match in enumerate(
            matches[:MAX_SENTENCE_MATCHES], start=1
        ):
            print(f"\n  Match {number}")
            print(
                f"  Sentence similarity: "
                f"{match['Sentence Similarity (%)']:.2f}%"
            )
            print(f"  {student_a}: {match['Sentence A']}")
            print(f"  {student_b}: {match['Sentence B']}")

            _, _, shared = highlight_shared_words(
                match["Sentence A"],
                match["Sentence B"]
            )

            print(
                "  Shared words: "
                + (", ".join(shared) if shared else "None")
            )

print(f"N-gram comparison saved to: {ngram_path}")
print("Similarity scores are indicators for examiner review, not proof.")
print("=" * 70)
