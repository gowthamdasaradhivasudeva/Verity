"use strict";

// ============================================================
// VERITY - TWO ANSWER SHEET ANALYSIS
// ============================================================

const OCR_API_URL = "/api/ocr";
const SIMILARITY_API_URL = "/api/similarity";

const fileAInput = document.getElementById("similarityFile1");
const fileBInput = document.getElementById("similarityFile2");
const extractButton = document.getElementById("extractBothButton");
const analyzeButton = document.getElementById("analyzeSimilarityButton");

const fileAName = document.getElementById("similarityName1");
const fileBName = document.getElementById("similarityName2");
const previewA = document.getElementById("similarityPreview1");
const previewB = document.getElementById("similarityPreview2");

const textA = document.getElementById("similarityText1");
const textB = document.getElementById("similarityText2");
const statusElement = document.getElementById("similarityStatus");

const resultsElement = document.getElementById("similarityResults");
const scoreElement = document.getElementById("similarityScore");
const interpretationElement = document.getElementById("similarityInterpretation");
const evidenceElement = document.getElementById("similarityEvidence");
const outputElement = document.getElementById("similarityOutput");
const viewReportButton = document.getElementById("viewReportButton");
const downloadReportButton = document.getElementById("downloadReportButton");

let currentReportUrl = null;

const uploadedStat = document.getElementById("uploadedStat");
const reviewedStat = document.getElementById("reviewedStat");
const toast = document.getElementById("toast");

const cardActionsA = document.getElementById("cardActionsA");
const cardActionsB = document.getElementById("cardActionsB");
const countBadgeA = document.getElementById("countBadgeA");
const countBadgeB = document.getElementById("countBadgeB");

const state = {
    fileA: null,
    fileB: null,
    extractedA: "",
    extractedB: "",
    extracting: false,
    analyzing: false,
    previewUrlA: null,
    previewUrlB: null
};

let toastTimer = null;


// ============================================================
// AUTH & USER PROFILE INITIALIZATION
// ============================================================

(function initUserProfile() {
    try {
        const rawUser = sessionStorage.getItem("verityUser");
        if (!rawUser) {
            window.location.replace("/login");
            return;
        }

        const user = JSON.parse(rawUser);
        const nameEl = document.getElementById("userNameDisplay");
        const emailEl = document.getElementById("userEmailDisplay");
        const avatarEl = document.getElementById("userAvatar");

        if (nameEl && user.name) nameEl.textContent = user.name;
        if (emailEl && user.email) emailEl.textContent = user.email;
        if (avatarEl && user.name) {
            const initials = user.name.split(" ").map(p => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
            avatarEl.textContent = initials || "EX";
        }
    } catch (e) {
        console.warn("User auth parse error:", e);
    }

    const signOutBtn = document.getElementById("signOutBtn");
    signOutBtn?.addEventListener("click", () => {
        sessionStorage.removeItem("verityUser");
        window.location.replace("/login");
    });

    const themeToggleBtn = document.getElementById("themeToggleBtn");
    themeToggleBtn?.addEventListener("click", () => {
        const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem("verityTheme", next);
    });
})();


// ============================================================
// UI HELPERS
// ============================================================

function showToast(message, type = "info") {
    if (!toast) return;

    toast.textContent = message;
    toast.className = `toast ${type} show`;

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 3500);
}

function setStatus(message, type = "info") {
    if (!statusElement) return;

    statusElement.textContent = message;
    statusElement.className = `similarity-status ${type}`;
}

function updateWordCountBadges() {
    if (countBadgeA) {
        const wordsA = state.extractedA.trim() ? state.extractedA.trim().split(/\s+/).length : 0;
        countBadgeA.textContent = `${wordsA} word${wordsA === 1 ? "" : "s"}`;
    }
    if (countBadgeB) {
        const wordsB = state.extractedB.trim() ? state.extractedB.trim().split(/\s+/).length : 0;
        countBadgeB.textContent = `${wordsB} word${wordsB === 1 ? "" : "s"}`;
    }
}

function updateStepper() {
    const step1 = document.getElementById("step1Item");
    const step2 = document.getElementById("step2Item");
    const step3 = document.getElementById("step3Item");
    const conn1 = document.getElementById("connector1");
    const conn2 = document.getElementById("connector2");
    const step3Badge = document.getElementById("step3StatusBadge");

    const bothSelected = Boolean(state.fileA && state.fileB);
    const bothExtracted = Boolean(state.extractedA.trim() && state.extractedB.trim());
    const hasResults = Boolean(resultsElement && !resultsElement.hidden);

    // Step 1 status
    if (step1) {
        step1.classList.toggle("is-complete", bothSelected);
        step1.classList.toggle("is-active", !bothSelected);
    }
    if (conn1) conn1.classList.toggle("is-complete", bothSelected);

    // Step 2 status
    if (step2) {
        step2.classList.toggle("is-complete", bothExtracted);
        step2.classList.toggle("is-active", bothSelected && !bothExtracted);
    }
    if (conn2) conn2.classList.toggle("is-complete", bothExtracted);

    // Step 3 status
    if (step3) {
        step3.classList.toggle("is-complete", hasResults);
        step3.classList.toggle("is-active", bothExtracted && !hasResults);
    }

    if (step3Badge) {
        if (hasResults) {
            step3Badge.textContent = "Analyzed";
            step3Badge.className = "step-stat-badge tag-success";
        } else if (bothExtracted) {
            step3Badge.textContent = "Ready to Compare";
            step3Badge.className = "step-stat-badge tag-active";
        } else {
            step3Badge.textContent = "Pending";
            step3Badge.className = "step-stat-badge";
        }
    }
}

function updateStats() {
    const selectedCount = Number(Boolean(state.fileA)) +
        Number(Boolean(state.fileB));

    const extractedCount = Number(Boolean(state.extractedA.trim())) +
        Number(Boolean(state.extractedB.trim()));

    if (uploadedStat) {
        uploadedStat.textContent = String(selectedCount).padStart(2, "0");
    }

    if (reviewedStat) {
        reviewedStat.textContent = String(extractedCount).padStart(2, "0");
    }

    // Update file action buttons visibility
    if (cardActionsA) cardActionsA.hidden = !state.fileA;
    if (cardActionsB) cardActionsB.hidden = !state.fileB;

    updateWordCountBadges();
    updateStepper();
}

function updateButtons() {
    const bothSelected = Boolean(state.fileA && state.fileB);
    const busy = state.extracting || state.analyzing;

    if (extractButton) {
        extractButton.disabled = !bothSelected || busy;
    }

    if (analyzeButton) {
        analyzeButton.disabled =
            !bothSelected ||
            !state.extractedA.trim() ||
            !state.extractedB.trim() ||
            busy;
    }
}

function resetResults() {
    if (resultsElement) resultsElement.hidden = true;
    if (scoreElement) scoreElement.textContent = "—";

    if (interpretationElement) {
        interpretationElement.textContent =
            "Run the analysis to view the result.";
    }

    const decisionPill = document.getElementById("scoreDecisionPill");
    const decisionText = document.getElementById("scoreDecisionText");
    if (decisionPill) decisionPill.className = "score-decision-pill";
    if (decisionText) decisionText.textContent = "Awaiting calculation";

    if (evidenceElement) {
        evidenceElement.textContent =
            "Sentence matching details will appear here.";
    }

    if (outputElement) outputElement.textContent = "";
    currentReportUrl = null;

    if (viewReportButton) {
        viewReportButton.disabled = true;
    }

    if (downloadReportButton) {
        downloadReportButton.disabled = true;
    }

    updateStepper();
}


// ============================================================
// IMAGE SELECTION AND PREVIEW
// ============================================================

function selectImage(which, file) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
        setStatus("Please select a valid image for each answer sheet.", "error");
        showToast("Please select an image file.", "error");
        return;
    }

    if (which === "A") {
        state.fileA = file;
        state.extractedA = "";

        fileAName.textContent = file.name;
        textA.value = "";

        if (state.previewUrlA) {
            URL.revokeObjectURL(state.previewUrlA);
        }

        state.previewUrlA = URL.createObjectURL(file);
        previewA.src = state.previewUrlA;
        previewA.hidden = false;
    } else {
        state.fileB = file;
        state.extractedB = "";

        fileBName.textContent = file.name;
        textB.value = "";

        if (state.previewUrlB) {
            URL.revokeObjectURL(state.previewUrlB);
        }

        state.previewUrlB = URL.createObjectURL(file);
        previewB.src = state.previewUrlB;
        previewB.hidden = false;
    }

    resetResults();
    updateStats();
    updateButtons();

    if (state.fileA && state.fileB) {
        setStatus("Both images are selected. Click Extract Text to continue.");
    } else {
        setStatus("Select the other answer sheet to continue.");
    }
}

function removeFile(which) {
    if (which === "A") {
        state.fileA = null;
        state.extractedA = "";
        fileAName.textContent = "Choose first image";
        textA.value = "";
        if (state.previewUrlA) {
            URL.revokeObjectURL(state.previewUrlA);
            state.previewUrlA = null;
        }
        previewA.removeAttribute("src");
        previewA.hidden = true;
        fileAInput.value = "";
    } else {
        state.fileB = null;
        state.extractedB = "";
        fileBName.textContent = "Choose second image";
        textB.value = "";
        if (state.previewUrlB) {
            URL.revokeObjectURL(state.previewUrlB);
            state.previewUrlB = null;
        }
        previewB.removeAttribute("src");
        previewB.hidden = true;
        fileBInput.value = "";
    }

    resetResults();
    updateStats();
    updateButtons();
    setStatus("Select both answer-sheet images or a demonstration scenario to begin.");
    showToast(`Answer Sheet ${which} removed.`, "info");
}

fileAInput.addEventListener("change", () => {
    selectImage("A", fileAInput.files[0]);
    fileAInput.value = "";
});

fileBInput.addEventListener("change", () => {
    selectImage("B", fileBInput.files[0]);
    fileBInput.value = "";
});

// File action listeners
document.getElementById("replaceFileA")?.addEventListener("click", () => fileAInput.click());
document.getElementById("replaceFileB")?.addEventListener("click", () => fileBInput.click());
document.getElementById("removeFileA")?.addEventListener("click", () => removeFile("A"));
document.getElementById("removeFileB")?.addEventListener("click", () => removeFile("B"));


// ============================================================
// OCR EXTRACTION
// ============================================================

async function extractTextFromImage(file) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(OCR_API_URL, {
        method: "POST",
        body: formData
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
        throw new Error(data.error || `OCR failed for ${file.name}.`);
    }

    return (data.text || "").trim();
}

extractButton.addEventListener("click", async () => {
    if (!state.fileA || !state.fileB || state.extracting || state.analyzing) {
        return;
    }

    state.extracting = true;
    state.extractedA = "";
    state.extractedB = "";

    resetResults();
    updateButtons();

    extractButton.textContent = "Extracting...";
    setStatus("Extracting text from both answer sheets...");

    try {
        const [resultA, resultB] = await Promise.all([
            extractTextFromImage(state.fileA),
            extractTextFromImage(state.fileB)
        ]);

        if (!resultA || !resultB) {
            throw new Error(
                "OCR did not return readable text for both images. " +
                "Please try clearer images."
            );
        }

        state.extractedA = resultA;
        state.extractedB = resultB;

        textA.value = resultA;
        textB.value = resultB;

        setStatus(
            "Text extraction completed for both images. You can now analyze similarity.",
            "success"
        );

        showToast("Both answer sheets extracted successfully.", "success");
    } catch (error) {
        state.extractedA = "";
        state.extractedB = "";

        textA.value = "";
        textB.value = "";

        setStatus(error.message, "error");
        showToast(error.message, "error");
    } finally {
        state.extracting = false;
        extractButton.textContent = "Extract Text";

        updateStats();
        updateButtons();
    }
});


// ============================================================
// SIMILARITY ANALYSIS
// ============================================================

function parseSimilarityScore(output) {
    // Read the numeric score from the student-pair comparison table.
    const lines = output.split(/\r?\n/);

    for (const line of lines) {
        if (/Overall Paper Similarity \(%\)/i.test(line)) continue;

        const match = line.match(
            /^\s*\S+\s+\S+\s+(\d+(?:\.\d+)?)\s+(\d+)\s*$/
        );

        if (match) {
            const score = Number(match[1]);

            if (Number.isFinite(score) && score >= 0 && score <= 100) {
                return score.toFixed(2);
            }
        }
    }

    // Fallback for reports that have different table spacing.
    const fallback = output.match(
        /Student Pair Comparison[\s\S]*?(\d+\.\d{2})\s+\d+/i
    );

    return fallback ? fallback[1] : null;
}

function getEvidenceSummary(output) {
    const lines = output.split(/\r?\n/);

    const noMatchLine = lines.find(line =>
        /no sentence pairs met the configured similarity threshold/i.test(line)
    );

    if (noMatchLine) return noMatchLine.trim();

    const matchingLine = lines.find(line =>
        /sentence matches found/i.test(line)
    );

    if (matchingLine) {
        return `Sentence matching information is available in the full analysis output. ${matchingLine.trim()}`;
    }

    return "See the full analysis output for sentence-level evidence.";
}

analyzeButton.addEventListener("click", async () => {
    if (
        !state.fileA ||
        !state.fileB ||
        !state.extractedA.trim() ||
        !state.extractedB.trim() ||
        state.analyzing ||
        state.extracting
    ) {
        return;
    }

    state.analyzing = true;

    resetResults();
    updateButtons();

    analyzeButton.textContent = "Analyzing...";
    setStatus("Comparing only the two selected answer sheets...");

    try {
        const formData = new FormData();
        formData.append("text1", state.extractedA);
        formData.append("text2", state.extractedB);
        formData.append("filename1", state.fileA.name);
        formData.append("filename2", state.fileB.name);

        const response = await fetch(SIMILARITY_API_URL, {
            method: "POST",
            body: formData
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || "Similarity analysis failed.");
        }

        currentReportUrl = data.report || null;

        if (viewReportButton) {
            viewReportButton.disabled = !currentReportUrl;
        }

        if (downloadReportButton) {
            downloadReportButton.disabled = !currentReportUrl;
        }

        const output = data.output || "No analysis output was returned.";
        const score = parseSimilarityScore(output);
        const reportData = {
            score: score,
            textA: state.extractedA,
            textB: state.extractedB,
            fileA: state.fileA?.name || "Answer Sheet A",
            fileB: state.fileB?.name || "Answer Sheet B",
            ngramResults: data.ngram_results?.[0] || null,
            generatedDate: new Date().toLocaleString(),
            analysisId: `VERITY-${Date.now()}`
        };

        sessionStorage.setItem(
            "verityReportData",
            JSON.stringify(reportData)
        );

        scoreElement.textContent =
            score === null ? "—" : `${score}`;

        const numericScore = Number(score);
        const decisionPill = document.getElementById("scoreDecisionPill");
        const decisionText = document.getElementById("scoreDecisionText");

        if (Number.isFinite(numericScore)) {
            let decision = "";
            let pillClass = "";

            if (numericScore >= 80) {
                decision = "Likely Malpractice";
                pillClass = "score-decision-pill pill-danger";
            } else if (numericScore >= 50) {
                decision = "Human Review Required";
                pillClass = "score-decision-pill pill-warning";
            } else {
                decision = "Not Likely Malpractice";
                pillClass = "score-decision-pill pill-success";
            }

            if (decisionPill) decisionPill.className = pillClass;
            if (decisionText) decisionText.textContent = decision;

            interpretationElement.textContent =
                `Overall textual similarity is ${score}%. Assessment classification: ${decision}.`;
        } else {
            if (decisionPill) decisionPill.className = "score-decision-pill";
            if (decisionText) decisionText.textContent = "Score Unavailable";
            interpretationElement.textContent = "See the full output for comparison details.";
        }

        evidenceElement.textContent = getEvidenceSummary(output);
        outputElement.textContent = output;

        resultsElement.hidden = false;

        setStatus(
            "Similarity analysis completed for the selected pair.",
            "success"
        );

        showToast("Similarity analysis completed.", "success");
        updateStepper();

        resultsElement.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    } catch (error) {
        setStatus(error.message, "error");
        showToast(error.message, "error");
    } finally {
        state.analyzing = false;
        analyzeButton.textContent = "Analyze Similarity";
        updateButtons();
    }
});


// ============================================================
// INITIAL STATE
// ============================================================

updateStats();
updateButtons();
resetResults();

window.addEventListener("beforeunload", () => {
    if (state.previewUrlA) URL.revokeObjectURL(state.previewUrlA);
    if (state.previewUrlB) URL.revokeObjectURL(state.previewUrlB);
});


// ============================================================
// REPORT BUTTON ACTIONS
// ============================================================

if (viewReportButton) {
    viewReportButton.addEventListener("click", () => {
        if (!sessionStorage.getItem("verityReportData")) {
            showToast(
                "Report data is not available. Run analysis again.",
                "error"
            );
            return;
        }

        window.location.href = "/report";
    });
}


if (downloadReportButton) {
    downloadReportButton.addEventListener("click", () => {
        if (!currentReportUrl) {
            showToast("Report is not available.", "error");
            return;
        }

        const link = document.createElement("a");

        link.href = currentReportUrl;
        link.download = "verity_similarity_report.html";

        document.body.appendChild(link);
        link.click();
        link.remove();
    });
}

// ============================================================
// DEMO SAMPLES
// ============================================================

const DEMO_BASE = "/demo_samples/";
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];

const DEMO_SAMPLES = {
    aiMl: {
        txtA: "ai_ml_sheet_a.txt",
        txtB: "ai_ml_sheet_b.txt",
        nameA: "AI & ML — Sheet A",
        nameB: "AI & ML — Sheet B",
        imgA: "Image1",
        imgB: "Image2"
    },
    networks: {
        txtA: "computer_networks_sheet_a.txt",
        txtB: "computer_networks_sheet_b.txt",
        nameA: "Computer Networks — Sheet A",
        nameB: "Computer Networks — Sheet B",
        imgA: "CN_Image1",
        imgB: "CN_Image2"
    }
};

function showDemoPreview(img, baseName) {
    if (!img) return;

    img.hidden = true;
    img.onload = null;
    img.onerror = null;

    if (!baseName) {
        img.removeAttribute("src");
        return;
    }

    let index = 0;

    img.onload = () => { img.hidden = false; };

    img.onerror = () => {
        index += 1;
        if (index < IMAGE_EXTENSIONS.length) {
            img.src = `${DEMO_BASE}${baseName}.${IMAGE_EXTENSIONS[index]}`;
        } else {
            img.onerror = null;
            img.removeAttribute("src");
            img.hidden = true;
            console.warn(`Demo image not found: ${baseName}`);
        }
    };

    img.src = `${DEMO_BASE}${baseName}.${IMAGE_EXTENSIONS[0]}`;
}

async function loadDemoSample(sample) {
    try {
        const [responseA, responseB] = await Promise.all([
            fetch(`${DEMO_BASE}${sample.txtA}`),
            fetch(`${DEMO_BASE}${sample.txtB}`)
        ]);

        if (!responseA.ok || !responseB.ok) {
            throw new Error("Could not load demo sample files.");
        }

        state.extractedA = await responseA.text();
        state.extractedB = await responseB.text();
        state.fileA = { name: sample.nameA };
        state.fileB = { name: sample.nameB };

        textA.value = state.extractedA;
        textB.value = state.extractedB;

        if (fileAName) fileAName.textContent = sample.nameA;
        if (fileBName) fileBName.textContent = sample.nameB;

        showDemoPreview(previewA, sample.imgA);
        showDemoPreview(previewB, sample.imgB);

        resetResults();
        updateStats();
        updateButtons();
        setStatus("Demo samples loaded successfully. Ready for similarity analysis.", "success");
        showToast(`Loaded scenario: ${sample.nameA.split("—")[0].trim()}`, "success");

    } catch (error) {
        console.error(error);
        setStatus(error.message, "error");
        showToast(error.message, "error");
    }
}

document.getElementById("loadAiMlSample")?.addEventListener("click", () =>
    loadDemoSample(DEMO_SAMPLES.aiMl));

document.getElementById("loadNetworksSample")?.addEventListener("click", () =>
    loadDemoSample(DEMO_SAMPLES.networks));
