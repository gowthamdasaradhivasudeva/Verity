"use strict";

// ============================================
// VERITY - DETAILED SIMILARITY REPORT
// ============================================
// Return to home page when report page is refreshed
const navigationEntry = performance.getEntriesByType("navigation")[0];

if (navigationEntry && navigationEntry.type === "reload") {
    setTimeout(() => {
        sessionStorage.removeItem("verityReportData");
        window.location.replace("/upload");
    }, 1000);
}
// Retrieve analysis data from the main application
const reportData = JSON.parse(
    sessionStorage.getItem("verityReportData") || "null"
);


// ============================================
// BACK TO WORKSPACE
// ============================================

const backButton = document.getElementById("backToWorkspace");

if (backButton) {
    backButton.addEventListener("click", () => {
        window.location.href = "/upload";
    });
}


// ============================================
// HELPER FUNCTIONS
// ============================================

function setText(elementId, value) {
    const element = document.getElementById(elementId);

    if (element) {
        element.textContent = value;
    }
}

function generateAnalysisId() {
    return "VERITY-" + Date.now().toString(36).toUpperCase();
}


// ============================================
// REPORT INITIALIZATION
// ============================================

function initializeReport() {

    if (!reportData) {
        const container = document.querySelector(".report-container");

        if (container) {
            container.innerHTML = `
                <section class="report-section">
                    <h2>Report data unavailable</h2>
                    <p>Please return to the workspace and run the
                       similarity analysis again.</p>
                    <button onclick="window.location.href='/upload'">
                        Back to Workspace
                    </button>
                </section>
            `;
        }

        return;
    }

    // Get extracted answer text
    const rawA = reportData.textA;
    const rawB = reportData.textB;
    const textA = typeof rawA === "string" ? rawA : (rawA && typeof rawA.value === "string" ? rawA.value : (rawA ? String(rawA) : ""));
    const textB = typeof rawB === "string" ? rawB : (rawB && typeof rawB.value === "string" ? rawB.value : (rawB ? String(rawB) : ""));

    // Calculate word counts from extracted text
    const wordsA = textA.trim() ? textA.trim().split(/\s+/).length : 0;
    const wordsB = textB.trim() ? textB.trim().split(/\s+/).length : 0;


    // ========================================
    // REPORT HEADER INFORMATION
    // ========================================

    setText("analysisId", reportData.analysisId || generateAnalysisId());

    setText(
        "generatedDate",
        reportData.generatedDate || new Date().toLocaleString()
    );

    setText(
        "paperAMetadata",
        `${reportData.fileA || "Answer Sheet A"} (${wordsA} words)`
    );

    setText(
        "paperBMetadata",
        `${reportData.fileB || "Answer Sheet B"} (${wordsB} words)`
    );


    // ========================================
    // STUDENT COMPARISON CARD
    // ========================================

    setText("studentARoll", reportData.rollA || "Not provided");
    setText("studentBRoll", reportData.rollB || "Not provided");
    setText("studentAFile", reportData.fileA || "Answer Sheet A");
    setText("studentBFile", reportData.fileB || "Answer Sheet B");
    setText("studentAWordCount", wordsA);
    setText("studentBWordCount", wordsB);


    // ========================================
    // OVERALL SIMILARITY SCORE & DECISION
    // ========================================

    const score = Number(reportData.score);

    const progressBar = document.getElementById("overallProgress");

    if (Number.isFinite(score) && score >= 0 && score <= 100) {

        // Dark-card score (the gauge number is handled by animateGauge)
        setText("overallScoreValue", `${score}%`);

        if (progressBar) {
            requestAnimationFrame(() => {
                progressBar.style.width = `${score}%`;
            });
        }

        let decision = "";
        let decisionClass = "";

        if (score >= 80) {
            decision = "Likely Malpractice";
            decisionClass = "high";
        } else if (score >= 50) {
            decision = "Human Review Required";
            decisionClass = "medium";
        } else {
            decision = "Not Likely Malpractice";
            decisionClass = "low";
        }

        // Semicircle gauge: animated fill, knob and count-up
        animateGauge(score);

        const finalDecisionElement = document.getElementById("finalDecision");

        if (finalDecisionElement) {
            finalDecisionElement.textContent = decision;
            finalDecisionElement.className = decisionClass;
        }

        setText("similarityStatus", "Similarity Analysis Completed");

        setText(
            "similarityExplanation",
            `The overall similarity score is ${score}%. Classification: ${decision}. This is a preliminary project-defined assessment and requires human examiner review.`
        );

    } else {
        setText("reportSimilarityScore", "—");
        setText("overallScoreValue", "—");
        setText("finalDecision", "Score Unavailable");
        setText("similarityStatus", "Score Unavailable");
        setText(
            "similarityExplanation",
            "The similarity score could not be extracted from the analysis output."
        );
    }


    // Similarity Breakdown
    const ngram = reportData.ngramResults || {};

    const metrics = [
        {
            valueId: "cosineValue",
            barId: "cosineBar",
            value: reportData.score
        },
        {
            valueId: "ngramValue",
            barId: "ngramBar",
            value: ngram["Trigram Overlap (%)"]
        },
        {
            valueId: "phraseValue",
            barId: "phraseBar",
            value: ngram["Copied Text (%)"]
        }
    ];

    metrics.forEach(metric => {
        const value = Number(metric.value);
        const valueElement = document.getElementById(metric.valueId);
        const barElement = document.getElementById(metric.barId);

        if (Number.isFinite(value) && value >= 0 && value <= 100) {
            if (valueElement) valueElement.textContent = `${value}%`;

            if (barElement) {
                requestAnimationFrame(() => {
                    barElement.style.width = `${value}%`;
                });
            }
        } else {
            if (valueElement) valueElement.textContent = "N/A";
        }
    });


    // FULL DOCUMENT COMPARISON
    const comparison = highlightSharedText(textA, textB);
    const documentA = document.getElementById("documentTextA");
    const documentB = document.getElementById("documentTextB");

    if (documentA) documentA.innerHTML = comparison.htmlA;
    if (documentB) documentB.innerHTML = comparison.htmlB;
}


// ========================================
// FULL DOCUMENT COMPARISON
// ========================================

function escapeHTML(value) {
    return value.replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function normalizeWord(word) {
    return word.toLowerCase().replace(/^[^\w]+|[^\w]+$/g, "");
}

// Word positions that belong to question lines (excluded from matching)
function getQuestionWordIndexes(text) {
    const excluded = new Set();
    const hasAnswerMarker = /^\s*ans(?:wer)?\s*[:.)-]/im.test(text);

    let wordIndex = 0;
    let inQuestion = false;

    text.split(/\r?\n/).forEach(line => {
        const count = (line.match(/\S+/g) || []).length;
        if (!count) return;

        const isQuestion = /^\s*(?:q(?:uestion)?\s*\d+\b|\d+\s*q\b)/i.test(line);
        const isAnswer = /^\s*ans(?:wer)?\s*[:.)-]/i.test(line);

        if (isQuestion) {
            inQuestion = true;
        } else if (isAnswer) {
            inQuestion = false;
        } else if (!hasAnswerMarker) {
            inQuestion = false;
        }

        if (inQuestion) {
            for (let k = 0; k < count; k++) excluded.add(wordIndex + k);
        }

        wordIndex += count;
    });

    return excluded;
}

function highlightSharedText(textA, textB) {
    const wordsA = textA.match(/\S+/g) || [];
    const wordsB = textB.match(/\S+/g) || [];

    const normalizedB = wordsB.map(normalizeWord);
    const matchedA = new Set();
    const matchedB = new Set();
    const excludedA = getQuestionWordIndexes(textA);
    const excludedB = getQuestionWordIndexes(textB);

    // Find shared consecutive four-word phrases
    for (let i = 0; i <= wordsA.length - 4; i++) {
        if ([0, 1, 2, 3].some(k => excludedA.has(i + k))) continue;

        const phrase = wordsA.slice(i, i + 4).map(normalizeWord);

        if (phrase.some(word => !word)) continue;

        for (let j = 0; j <= wordsB.length - 4; j++) {
            if ([0, 1, 2, 3].some(k => excludedB.has(j + k))) continue;

            const candidate = normalizedB.slice(j, j + 4);

            if (phrase.every((word, k) => word === candidate[k])) {
                for (let k = 0; k < 4; k++) {
                    matchedA.add(i + k);
                    matchedB.add(j + k);
                }
            }
        }
    }

    function render(text, matched, className) {
        const tokens = text.match(/\s+|\S+/g) || [];

        let html = "";
        let wordIndex = 0;
        let paragraphOpen = false;

        function closeParagraph() {
            if (paragraphOpen) {
                html += "</p>";
                paragraphOpen = false;
            }
        }

        function openParagraph(classValue = "") {
            if (!paragraphOpen) {
                html += classValue
                    ? `<p class="${classValue}">`
                    : "<p>";
                paragraphOpen = true;
            }
        }

        for (const token of tokens) {
            if (/^\s+$/.test(token)) {
                if (paragraphOpen) {
                    html += token.replace(/\r\n|\r|\n/g, "<br>");
                }
                continue;
            }

            const safeWord = escapeHTML(token);

            // Recognize Q1:, Q1), 1Q:, 1Q)
            const questionMatch = token.match(
                /^(?:Q\s*(\d+)|(\d+)\s*Q)\s*[:.)]$/i
            );

            if (questionMatch) {
                closeParagraph();

                const number = questionMatch[1] || questionMatch[2];

                html += `<h4 class="question-heading">Question ${escapeHTML(number)}</h4>`;
                openParagraph();

                wordIndex++;
                continue;
            }

            // Recognize Ans:, Answer:, 1Ans:, 1Answer:
            const answerMatch = token.match(
                /^(?:\d+\s*)?Ans(?:wer)?\s*:/i
            );

            if (answerMatch) {
                closeParagraph();
                openParagraph("answer-text");

                html += "<strong>Answer:</strong> ";

                wordIndex++;
                continue;
            }

            openParagraph();

            html += matched.has(wordIndex)
                ? `<mark class="${className}">${safeWord}</mark>`
                : safeWord;

            wordIndex++;
        }

        closeParagraph();

        return `<div class="structured-answer">${html}</div>`;
    }

    return {
        htmlA: render(textA, matchedA, "match-highlight-a"),
        htmlB: render(textB, matchedB, "match-highlight-b")
    };
}



// ============================================
// SEMICIRCLE GAUGE
// ============================================

const GAUGE = { cx: 170, cy: 170, r: 118, gap: 1.2 };

// Same thresholds as the decision logic above
const GAUGE_ZONES = [
    { from: 0,  to: 50,  key: "low"  },
    { from: 50, to: 80,  key: "mid"  },
    { from: 80, to: 100, key: "high" }
];

let gaugeSegments = null;

function gaugePoint(value, radius = GAUGE.r) {
    const angle = Math.PI * (1 - value / 100);
    return [
        GAUGE.cx + radius * Math.cos(angle),
        GAUGE.cy - radius * Math.sin(angle)
    ];
}

function gaugeArc(from, to) {
    const [x1, y1] = gaugePoint(from);
    const [x2, y2] = gaugePoint(to);
    return `M${x1} ${y1}A${GAUGE.r} ${GAUGE.r} 0 0 1 ${x2} ${y2}`;
}

function svgEl(name, attrs, parent) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    parent.appendChild(node);
    return node;
}

function buildGauge() {
    const tracks = document.getElementById("gaugeTracks");
    const fills = document.getElementById("gaugeFills");
    const ticks = document.getElementById("gaugeTicks");
    if (!tracks || !fills || !ticks) return null;

    const segments = GAUGE_ZONES.map((zone, i) => {
        const start = zone.from + (i > 0 ? GAUGE.gap : 0);
        const end = zone.to - (i < GAUGE_ZONES.length - 1 ? GAUGE.gap : 0);

        svgEl("path", { d: gaugeArc(start, end), class: `trk-${zone.key}` }, tracks);

        const fill = svgEl("path", {
            d: gaugeArc(start, end),
            class: `fil-${zone.key}`,
            pathLength: 100,
            "stroke-dasharray": 100,
            "stroke-dashoffset": 100
        }, fills);

        return { start, end, fill };
    });

    [0, 50, 80, 100].forEach(value => {
        const ends = value === 0 || value === 100;
        const [x, y] = ends
            ? [gaugePoint(value)[0], GAUGE.cy + 30]
            : gaugePoint(value, GAUGE.r + 30);
        const label = svgEl("text", { x, y }, ticks);
        label.textContent = `${value}%`;
    });

    return segments;
}

function drawGauge(value) {
    gaugeSegments.forEach(({ start, end, fill }) => {
        const fraction = Math.max(0, Math.min(1, (value - start) / (end - start)));
        fill.setAttribute("stroke-dashoffset", 100 * (1 - fraction));
    });

    const knob = document.getElementById("gaugeKnob");
    const [x, y] = gaugePoint(value);
    knob.setAttribute("cx", x);
    knob.setAttribute("cy", y);

    setText("reportSimilarityScore", `${value.toFixed(2)}%`);
}

function animateGauge(target, duration = 1800) {
    if (!gaugeSegments) gaugeSegments = buildGauge();
    if (!gaugeSegments) return;

    window.addEventListener('beforeprint', () => drawGauge(target));
    if (window.matchMedia) {
        window.matchMedia('print').addListener(mql => { if (mql.matches) drawGauge(target); });
    }

    const knob = document.getElementById("gaugeKnob");
    if (knob) knob.style.opacity = 1;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        drawGauge(target);
        return;
    }

    const startTime = performance.now();
    const ease = t => 1 - Math.pow(1 - t, 3);

    function frame(now) {
        const progress = Math.min(1, (now - startTime) / duration);
        drawGauge(target * ease(progress));
        if (progress < 1) requestAnimationFrame(frame);
        else drawGauge(target);
    }

    requestAnimationFrame(frame);
}


// ============================================
// START REPORT
// ============================================

document.addEventListener("DOMContentLoaded", initializeReport);