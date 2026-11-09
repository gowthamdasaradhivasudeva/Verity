
import re
from difflib import SequenceMatcher
from collections import Counter

# RapidFuzz is optional. The fallback works without installation.
try:
    from rapidfuzz import fuzz

    def _ratio(x, y):
        return fuzz.ratio(x, y)

except ImportError:

    def _ratio(x, y):
        return SequenceMatcher(None, x, y, autojunk=False).ratio() * 100


# --------------------------------------------------
# 1. TEXT NORMALIZATION
# --------------------------------------------------

def normalize(text):
    """Normalize text while preserving word order."""
    text = re.sub(r"[^a-z0-9\s]", " ", text.lower())
    return re.sub(r"\s+", " ", text).strip()


def tokenize(text):
    """Convert text into normalized word tokens."""
    return normalize(text).split()


# --------------------------------------------------
# 2. N-GRAM GENERATION
# --------------------------------------------------

def ngrams(words, n):
    """Generate consecutive n-word sequences."""
    if n <= 0:
        raise ValueError("n must be greater than zero")

    return [
        " ".join(words[i:i + n])
        for i in range(len(words) - n + 1)
    ]


# --------------------------------------------------
# 3. N-GRAM OVERLAP
# --------------------------------------------------

def ngram_overlap(a, b, n=3):
    """
    Calculate the percentage of unique n-grams
    in the smaller set that also appear in the other.
    """
    ga = set(ngrams(a, n))
    gb = set(ngrams(b, n))

    if not ga or not gb:
        return 0.0, []

    shared = ga & gb

    score = len(shared) / min(len(ga), len(gb))

    return score, sorted(shared)


# --------------------------------------------------
# 4. LONG SHARED PHRASE DETECTION
# --------------------------------------------------

def common_runs(a, b, min_words=4):
    """
    Find exact consecutive matching word sequences.

    Overlapping matching runs are merged to prevent
    double-counting in copied-text calculations.
    """
    if min_words <= 0:
        raise ValueError("min_words must be greater than zero")

    matcher = SequenceMatcher(
        None, a, b, autojunk=False
    )

    blocks = [
        block
        for block in matcher.get_matching_blocks()
        if block.size >= min_words
    ]

    runs = []

    for block in blocks:
        start_a = block.a
        start_b = block.b
        end_a = block.a + block.size
        end_b = block.b + block.size

        # Merge overlapping or adjacent runs when their
        # positions in both texts remain aligned.
        if (
            runs
            and start_a <= runs[-1]["pos_a"] + runs[-1]["words"]
            and start_b <= runs[-1]["pos_b"] + runs[-1]["words"]
            and (
                start_a - runs[-1]["pos_a"]
                == start_b - runs[-1]["pos_b"]
            )
        ):
            previous = runs[-1]

            previous_end_a = previous["pos_a"] + previous["words"]
            previous_end_b = previous["pos_b"] + previous["words"]

            previous["words"] = max(
                previous_end_a, end_a
            ) - previous["pos_a"]

            previous["text"] = " ".join(
                a[previous["pos_a"]:
                  previous["pos_a"] + previous["words"]]
            )

        else:
            runs.append({
                "text": " ".join(a[start_a:end_a]),
                "words": block.size,
                "pos_a": start_a,
                "pos_b": start_b
            })

    return sorted(
        runs,
        key=lambda r: (-r["words"], r["pos_a"])
    )


# --------------------------------------------------
# 5. FUZZY PHRASE MATCHING
# --------------------------------------------------

def fuzzy_phrases(
    a,
    b,
    n=4,
    threshold=88,
    skip=(),
    max_candidates=5000
):
    """
    Find near-identical n-word phrases.

    Useful for detecting similarities despite small OCR errors.
    Exact matches are excluded.

    max_candidates limits comparisons to avoid excessive
    processing time on large answer papers.
    """
    ga = list(dict.fromkeys(ngrams(a, n)))
    gb = list(dict.fromkeys(ngrams(b, n)))

    skip = set(skip)

    results = []
    seen = set()
    comparisons = 0

    if not ga or not gb:
        return results

    # Compare only phrases with the same first word.
    # This reduces unnecessary comparisons.
    candidates = {}

    for phrase in gb:
        first_word = phrase.split()[0]
        candidates.setdefault(first_word, []).append(phrase)

    for phrase_a in ga:

        if phrase_a in skip:
            continue

        first_word = phrase_a.split()[0]

        possible_matches = candidates.get(first_word, [])

        best_match = None
        best_score = 0

        for phrase_b in possible_matches:

            if phrase_a == phrase_b:
                continue

            comparisons += 1

            if comparisons > max_candidates:
                return results

            score = _ratio(phrase_a, phrase_b)

            if score > best_score:
                best_score = score
                best_match = phrase_b

        if best_match and best_score >= threshold:

            pair = tuple(sorted((phrase_a, best_match)))

            if pair not in seen:
                seen.add(pair)

                results.append({
                    "text_a": phrase_a,
                    "text_b": best_match,
                    "similarity": round(best_score, 2)
                })

    return sorted(
        results,
        key=lambda item: -item["similarity"]
    )


# --------------------------------------------------
# 6. MAIN COMPARISON FUNCTION
# --------------------------------------------------

def compare(
    text_a,
    text_b,
    min_run=4,
    fuzzy_threshold=88
):
    """
    Compare two answer papers using:
    - Trigram overlap
    - Four-gram overlap
    - Long exact shared phrases
    - Fuzzy phrase matching
    - Copied-text coverage
    """

    a = tokenize(text_a)
    b = tokenize(text_b)

    # N-gram comparisons
    o3, shared3 = ngram_overlap(a, b, 3)
    o4, shared4 = ngram_overlap(a, b, 4)

    # Exact shared consecutive phrases
    runs = common_runs(a, b, min_run)

    # Calculate union coverage in each paper.
    # Each word position is counted only once.
    positions_a = set()
    positions_b = set()

    for run in runs:
        positions_a.update(
            range(run["pos_a"], run["pos_a"] + run["words"])
        )

        positions_b.update(
            range(run["pos_b"], run["pos_b"] + run["words"])
        )

    covered_a = len(positions_a)
    covered_b = len(positions_b)

    coverage_a = (
        covered_a / len(a) * 100 if a else 0
    )

    coverage_b = (
        covered_b / len(b) * 100 if b else 0
    )

    shorter_coverage = (
        min(covered_a, covered_b) / min(len(a), len(b)) * 100
        if a and b else 0
    )

    longest = runs[0]["words"] if runs else 0

    # Near-identical phrases that may contain OCR errors
    near_matches = fuzzy_phrases(
        a,
        b,
        n=4,
        threshold=fuzzy_threshold,
        skip=shared4
    )

    return {
        "trigram_overlap": round(o3 * 100, 2),
        "fourgram_overlap": round(o4 * 100, 2),

        "copied_text_percent": round(shorter_coverage, 2),
        "paper_a_coverage": round(coverage_a, 2),
        "paper_b_coverage": round(coverage_b, 2),

        "longest_shared_run_words": longest,
        "shared_runs": runs,

        "shared_trigrams": shared3,
        "shared_fourgrams": shared4,

        "near_matches": near_matches,

        "words_a": len(a),
        "words_b": len(b)
    }


# --------------------------------------------------
# 7. HIGHLIGHT SHARED TEXT
# --------------------------------------------------

def highlight(text, runs, side="a"):
    """
    Highlight exact shared word sequences.

    Uses the original text's word positions so punctuation
    and capitalization are preserved.

    Returns HTML-safe text with <mark> tags.
    """
    from html import escape

    # Keep original word positions while normalizing
    # individual words for matching.
    matches = list(re.finditer(r"\b[a-zA-Z0-9]+\b", text))

    original_words = [
        match.group() for match in matches
    ]

    normalized_words = [
        word.lower() for word in original_words
    ]

    key = "pos_a" if side == "a" else "pos_b"

    marked_positions = set()

    for run in runs:
        start = run[key]
        end = start + run["words"]

        marked_positions.update(range(start, end))

    output = []
    i = 0

    while i < len(matches):

        if i in marked_positions:
            j = i

            while j + 1 < len(matches) and j + 1 in marked_positions:
                j += 1

            start_char = matches[i].start()
            end_char = matches[j].end()

            # Preserve original punctuation and spacing
            # inside the highlighted section.
            highlighted_text = text[start_char:end_char]

            output.append(
                "<mark>" + escape(highlighted_text) + "</mark>"
            )

            i = j + 1

        else:
            # Preserve all text before the next word,
            # including punctuation and whitespace.
            if i == 0:
                start_char = 0
            else:
                start_char = matches[i - 1].end()

            end_char = matches[i].end()

            output.append(
                escape(text[start_char:end_char])
            )

            i += 1

    if matches:
        output.append(escape(text[matches[-1].end():]))
    else:
        output.append(escape(text))

    return "".join(output)
