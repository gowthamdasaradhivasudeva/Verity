// ============================================================
// VERITY - CHANGE PASSWORD & SIDEBAR ACCOUNT LOGIC
// Client-side demo authentication storage
// (To be replaced by real server-side authentication later)
// ============================================================
(function() {
    "use strict";

    // Web Crypto SHA-256 hashing
    async function hashPassword(salt, password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(salt + password);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    }

    function generateSalt() {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        return Array.from(array).map(b => b.toString(16).padStart(2, "0")).join("");
    }

    function getAccounts() {
        try {
            return JSON.parse(localStorage.getItem("verityAccounts") || "{}");
        } catch (e) {
            return {};
        }
    }

    function saveAccounts(accounts) {
        localStorage.setItem("verityAccounts", JSON.stringify(accounts));
    }

    function getCurrentUser() {
        try {
            return JSON.parse(sessionStorage.getItem("verityUser") || "null");
        } catch (e) {
            return null;
        }
    }

    // Populate signed-in email in sidebar
    const user = getCurrentUser();
    const sidebarEmailEl = document.getElementById("sidebarAccountEmail");
    if (sidebarEmailEl && user && user.email) {
        sidebarEmailEl.textContent = user.email;
        sidebarEmailEl.setAttribute("title", user.email);
    }

    // Modal elements
    const modal = document.getElementById("changePasswordModal");
    const openBtn = document.getElementById("openChangePasswordBtn");
    const closeBtn = document.getElementById("closeChangePasswordBtn");
    const cancelBtn = document.getElementById("cancelChangePasswordBtn");
    const form = document.getElementById("changePasswordForm");
    const currentInput = document.getElementById("currentPassword");
    const newInput = document.getElementById("newPassword");
    const confirmInput = document.getElementById("confirmPassword");
    const errorAlert = document.getElementById("changePasswordError");
    const errorText = document.getElementById("changePasswordErrorText");
    const submitBtn = document.getElementById("submitChangePasswordBtn");

    if (!modal || !openBtn || !form) return;

    function showError(message) {
        if (!errorAlert || !errorText) return;
        errorText.textContent = message;
        errorAlert.hidden = false;
    }

    function hideError() {
        if (errorAlert) errorAlert.hidden = true;
    }

    function openModal() {
        modal.hidden = false;
        form.reset();
        hideError();
        // Reset password visibility toggles
        modal.querySelectorAll(".pwd-toggle-btn").forEach(btn => {
            btn.classList.remove("is-showing");
            const targetId = btn.getAttribute("data-target");
            const input = document.getElementById(targetId);
            if (input) input.type = "password";
        });
        currentInput?.focus();
        document.addEventListener("keydown", handleKeydown);
    }

    function closeModal() {
        modal.hidden = true;
        document.removeEventListener("keydown", handleKeydown);
        openBtn?.focus();
    }

    // Focus trap & Escape key
    function handleKeydown(e) {
        if (e.key === "Escape") {
            closeModal();
            return;
        }

        if (e.key === "Tab") {
            const focusables = modal.querySelectorAll(
                'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
            );
            if (focusables.length === 0) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];

            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    }

    // Password visibility toggles inside modal
    modal.querySelectorAll(".pwd-toggle-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const targetId = btn.getAttribute("data-target");
            const input = document.getElementById(targetId);
            if (!input) return;
            const isPassword = input.type === "password";
            input.type = isPassword ? "text" : "password";
            btn.classList.toggle("is-showing", isPassword);
        });
    });

    [currentInput, newInput, confirmInput].forEach(inp => {
        inp?.addEventListener("input", hideError);
    });

    openBtn.addEventListener("click", openModal);
    closeBtn?.addEventListener("click", closeModal);
    cancelBtn?.addEventListener("click", closeModal);

    // Click outside modal dialog to close
    modal.addEventListener("click", (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    // Form submission
    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const currentUser = getCurrentUser();
        if (!currentUser || !currentUser.email) {
            showError("User session expired. Please sign in again.");
            return;
        }

        const emailLower = currentUser.email.trim().toLowerCase();
        const currentVal = currentInput.value;
        const newVal = newInput.value;
        const confirmVal = confirmInput.value;

        // 1. Required fields
        if (!currentVal) {
            showError("Enter your current password");
            currentInput.focus();
            return;
        }

        if (!newVal) {
            showError("Enter a new password");
            newInput.focus();
            return;
        }

        if (!confirmVal) {
            showError("Confirm your new password");
            confirmInput.focus();
            return;
        }

        // 2. Validate current password
        const accounts = getAccounts();
        const record = accounts[emailLower];
        let isCurrentValid = false;

        if (record) {
            const hash = await hashPassword(record.salt, currentVal);
            isCurrentValid = (hash === record.passwordHash);
        } else {
            // First time user (never changed password): current must be verity2026
            isCurrentValid = (currentVal === "verity2026");
        }

        if (!isCurrentValid) {
            showError("Current password is incorrect");
            currentInput.focus();
            return;
        }

        // 3. New password validation:
        // - At least 8 characters
        if (newVal.length < 8) {
            showError("New password must be at least 8 characters long");
            newInput.focus();
            return;
        }

        // - At least one letter and one number
        if (!/[a-zA-Z]/.test(newVal) || !/[0-9]/.test(newVal)) {
            showError("New password must contain at least one letter and one number");
            newInput.focus();
            return;
        }

        // - Must not be verity2026
        if (newVal === "verity2026") {
            showError("New password cannot be the default password (verity2026)");
            newInput.focus();
            return;
        }

        // - Must not equal the current password
        if (newVal === currentVal) {
            showError("New password must be different from current password");
            newInput.focus();
            return;
        }

        // - Confirm must match
        if (newVal !== confirmVal) {
            showError("New password and confirmation do not match");
            confirmInput.focus();
            return;
        }

        // 4. Save new salted hash for this email
        submitBtn.disabled = true;
        try {
            const salt = generateSalt();
            const passwordHash = await hashPassword(salt, newVal);
            accounts[emailLower] = { salt, passwordHash };
            saveAccounts(accounts);

            closeModal();

            // Display toast using existing toast element
            const toastEl = document.getElementById("toast");
            if (toastEl) {
                toastEl.textContent = "Password updated. Use your new password next time you sign in.";
                toastEl.className = "toast success show";
                setTimeout(() => {
                    toastEl.classList.remove("show");
                }, 4000);
            }
        } finally {
            submitBtn.disabled = false;
        }
    });
})();
