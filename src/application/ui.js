"use strict";

// Presentation-only helpers: drag-and-drop, card state, button spinners.
// Does not touch application logic; it reuses the existing file inputs.
(function () {
    [["similarityFile1", "similarityPreview1"], ["similarityFile2", "similarityPreview2"]]
        .forEach(([inputId, previewId]) => {
            const input = document.getElementById(inputId);
            const preview = document.getElementById(previewId);
            if (!input || !preview) return;

            const card = input.closest(".comparison-upload-card");
            const zone = card && card.querySelector(".comparison-dropzone");
            if (!zone) return;

            // Handle drag over both zone and card
            [zone, card].forEach(target => {
                ["dragenter", "dragover"].forEach(type =>
                    target.addEventListener(type, event => {
                        event.preventDefault();
                        zone.classList.add("is-dragover");
                        card.classList.add("is-drag-target");
                    })
                );

                ["dragleave"].forEach(type =>
                    target.addEventListener(type, event => {
                        event.preventDefault();
                        // only remove if left the card bounds
                        if (event.target === target) {
                            zone.classList.remove("is-dragover");
                            card.classList.remove("is-drag-target");
                        }
                    })
                );
            });

            zone.addEventListener("drop", event => {
                event.preventDefault();
                zone.classList.remove("is-dragover");
                card.classList.remove("is-drag-target");
                const file = event.dataTransfer && event.dataTransfer.files[0];
                if (!file) return;
                const transfer = new DataTransfer();
                transfer.items.add(file);
                input.files = transfer.files;
                input.dispatchEvent(new Event("change", { bubbles: true }));
            });

            card.addEventListener("drop", event => {
                event.preventDefault();
                zone.classList.remove("is-dragover");
                card.classList.remove("is-drag-target");
                const file = event.dataTransfer && event.dataTransfer.files[0];
                if (!file) return;
                const transfer = new DataTransfer();
                transfer.items.add(file);
                input.files = transfer.files;
                input.dispatchEvent(new Event("change", { bubbles: true }));
            });

            new MutationObserver(() => {
                card.classList.toggle("has-file", !preview.hidden);
            }).observe(preview, { attributes: true, attributeFilter: ["hidden"] });
        });

    // Show a spinner whenever app.js sets a "…ing..." label on a button.
    ["extractBothButton", "analyzeSimilarityButton"].forEach(id => {
        const button = document.getElementById(id);
        if (!button) return;
        new MutationObserver(() => {
            button.classList.toggle("is-loading", /\.\.\.$/.test(button.textContent.trim()));
        }).observe(button, { childList: true, characterData: true, subtree: true });
    });
})();
