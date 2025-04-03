// content.js
console.log("RTL Content Fixer: Content script loading...");

// --- Constants ---
const RTL_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LTR_REGEX = /[A-Za-z]/;
const DIGIT_REGEX = /[0-9]/;
const TARGET_TAGS = ['P', 'LI', 'TD', 'TH', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'ARTICLE', 'SECTION', 'ASIDE', 'SUMMARY', 'FIGCAPTION', 'DD', 'DT'];
const SKIP_SELECTORS = 'script, style, noscript, code, pre, kbd, var, samp, textarea, input, [contenteditable="true"], svg, math, iframe'; // Added iframe
const PROCESSED_ATTR = 'data-rtl-fixer-processed';
const RTL_STYLE_ATTR = 'data-rtl-fixer-styled';

// --- State Variables ---
let isEnabled = false; // Default to false until settings are confirmed
let excludedSites = [];
let currentHostname = null;
let observer = null;
let observerActive = false;

// Get hostname early
try {
    if (window.location) {
        currentHostname = window.location.hostname;
    }
} catch (e) {
    console.error("RTL Fixer: Error getting hostname:", e);
}

// --- Core Logic Functions (isPotentialCandidate, applyRtlStyle, checkAndFixNode) ---
// These functions remain unchanged from the previous complete version.
// They assume the decision to run has already been made based on isEnabled/excludedSites.

function isPotentialCandidate(element) {
    // Basic checks
    if (!element || element.nodeType !== Node.ELEMENT_NODE || element.matches(SKIP_SELECTORS) || !element.isConnected) {
        return false;
    }
    if (element.hasAttribute(PROCESSED_ATTR) || element.hasAttribute(RTL_STYLE_ATTR)) {
        return false;
    }
    let computedStyle;
    try {
        computedStyle = window.getComputedStyle(element);
        if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') {
            element.setAttribute(PROCESSED_ATTR, 'hidden');
            return false;
        }
    } catch (e) { /* Ignore style errors */ computedStyle = null; }
    const text = element.textContent;
    if (!text || !RTL_REGEX.test(text)) {
        element.setAttribute(PROCESSED_ATTR, 'no-rtl');
        return false;
    }
    try {
        const direction = computedStyle ? computedStyle.direction : window.getComputedStyle(element).direction;
        if (direction === 'rtl') {
            element.setAttribute(PROCESSED_ATTR, 'already-rtl');
            return false;
        }
    } catch (e) {
        element.setAttribute(PROCESSED_ATTR, 'style-error'); return false;
    }
    return true;
}

function applyRtlStyle(element) {
    element.style.direction = 'rtl';
    element.style.textAlign = 'right';
    element.setAttribute(RTL_STYLE_ATTR, 'true');
    element.removeAttribute(PROCESSED_ATTR);
}

function checkAndFixNode(node) {
    if (!node) return;
    if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
        node = node.parentElement;
        node.removeAttribute(PROCESSED_ATTR);
    }
    if (!node || node.nodeType !== Node.ELEMENT_NODE || node.matches(SKIP_SELECTORS) || !node.isConnected) {
        return;
    }
    if (isPotentialCandidate(node)) {
        applyRtlStyle(node);
    } else {
        if (!node.hasAttribute(PROCESSED_ATTR) && !node.hasAttribute(RTL_STYLE_ATTR)) {
            node.setAttribute(PROCESSED_ATTR, 'checked-subtree');
        }
    }
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
        checkAndFixNode(children[i]);
    }
}


// --- Scan and Observer Functions ---

function runScan(container = document.body) {
    if (!container || typeof container.querySelectorAll !== 'function') return;
    console.log("RTL Fixer: Running scan...");
    const candidates = container.querySelectorAll(TARGET_TAGS.join(','));
    let fixCount = 0;
    candidates.forEach(el => {
        if (isPotentialCandidate(el)) { applyRtlStyle(el); fixCount++; }
        else if (!el.hasAttribute(PROCESSED_ATTR) && !el.hasAttribute(RTL_STYLE_ATTR)) {
            el.setAttribute(PROCESSED_ATTR, 'scan-checked');
        }
    });
    console.log(`RTL Fixer: Scan completed. ${fixCount} elements styled.`);
}

function debounce(func, wait) { /* Debounce implementation (unchanged) */
    let timeout; return function (...args) { const later = () => { clearTimeout(timeout); func(...args); }; clearTimeout(timeout); timeout = setTimeout(later, wait); };
}

const handleMutations = debounce((mutationsList) => {
    if (!isEnabled || !observerActive || (currentHostname && excludedSites.includes(currentHostname))) return;
    mutationsList.forEach((mutation) => {
        if (mutation.type === 'childList') { mutation.addedNodes.forEach(checkAndFixNode); }
        else if (mutation.type === 'characterData' && mutation.target.parentElement) {
            mutation.target.parentElement.removeAttribute(PROCESSED_ATTR);
            checkAndFixNode(mutation.target.parentElement);
        }
    });
}, 400);

function startObserver() {
    if (observer || !isEnabled || (currentHostname && excludedSites.includes(currentHostname))) return;
    if (!document.body) { setTimeout(startObserver, 100); return; }
    console.log("RTL Fixer: Starting MutationObserver for", currentHostname);
    observer = new MutationObserver(handleMutations);
    try {
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        observerActive = true;
    } catch (error) { console.error("RTL Fixer: Failed to start observer:", error); observer = null; observerActive = false; }
}

function stopObserver() {
    if (observer) { console.log("RTL Fixer: Stopping observer"); observer.disconnect(); observer = null; observerActive = false; }
}

function revertAllStyles() { /* Revert styles implementation (unchanged) */
    console.log("RTL Fixer: Reverting styles..."); const styled = document.querySelectorAll(`[${RTL_STYLE_ATTR}]`); styled.forEach(el => { el.style.direction = ''; el.style.textAlign = ''; el.removeAttribute(RTL_STYLE_ATTR); el.removeAttribute(PROCESSED_ATTR); }); console.log(`Reverted ${styled.length} elements.`);
}


// --- Initialization and Message Handling ---

/**
 * Attempts to get settings from the background script with retries.
 * @param {number} maxRetries Maximum number of attempts.
 * @param {number} initialDelay Delay before the first retry (ms).
 * @returns {Promise<object|null>} Resolves with settings object or null on failure.
 */
async function getSettingsWithRetry(maxRetries = 5, initialDelay = 200) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`RTL Fixer Content: Attempt ${attempt}/${maxRetries} to get settings...`);
            const settings = await browser.runtime.sendMessage({ action: 'getSettings' });

            // **Crucial Check:** Ensure the response is valid and contains expected data.
            if (settings && typeof settings.isEnabled !== 'undefined' && Array.isArray(settings.excludedSites)) {
                console.log("RTL Fixer Content: Settings received successfully:", settings);
                return settings; // Success! Return the settings.
            } else {
                // Received something, but it's not valid settings object
                console.warn(`RTL Fixer Content: Received invalid settings object on attempt ${attempt}:`, settings);
                // Treat as failure and proceed to retry (or throw error if last attempt)
                if (attempt === maxRetries) throw new Error("Invalid settings received after max retries.");
            }
        } catch (error) {
            console.warn(`RTL Fixer Content: Error getting settings on attempt ${attempt}:`, error.message);
            if (attempt === maxRetries) {
                console.error("RTL Fixer Content: Failed to get settings after multiple retries.");
                return null; // Indicate final failure
            }
        }
        // Wait before the next attempt
        const delay = initialDelay * Math.pow(2, attempt - 1); // Exponential backoff
        console.log(`RTL Fixer Content: Waiting ${delay}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    return null; // Should not be reached if maxRetries > 0, but acts as safeguard
}


/**
 * Main initialization function.
 */
async function initialize() {
    console.log("RTL Fixer Content: Initializing for hostname:", currentHostname);

    // 1. Fetch settings using the retry mechanism
    const settings = await getSettingsWithRetry();

    // 2. Process the fetched settings (or handle failure)
    if (settings) {
        isEnabled = settings.isEnabled;
        excludedSites = settings.excludedSites; // Already checked if array in retry function

        console.log("RTL Fixer Content: Checking final settings.", {
            isEnabled: isEnabled,
            currentHostname: currentHostname,
            isExcluded: currentHostname ? excludedSites.includes(currentHostname) : 'N/A',
            excludedList: excludedSites
        });

        // 3. Decide whether to proceed
        if (isEnabled && currentHostname && !excludedSites.includes(currentHostname)) {
            console.log("RTL Fixer Content: Extension ACTIVE. Proceeding with scan and observer.");

            // 4. Run initial scan when ready (with small delay)
            const runDelayedScan = () => setTimeout(() => {
                if (document.body) runScan(document.body);
            }, 50);
            if (document.readyState === 'complete' || document.readyState === 'interactive') { runDelayedScan(); }
            else { document.addEventListener('DOMContentLoaded', runDelayedScan, { once: true }); }

            // 5. Start the observer
            startObserver();

        } else {
            // Log reason for not proceeding
            if (!isEnabled) console.log("RTL Fixer Content: Extension is DISABLED.");
            else if (!currentHostname) console.log("RTL Fixer Content: No valid hostname.");
            else console.log(`RTL Fixer Content: Site "${currentHostname}" is EXCLUDED.`);
            stopObserver(); // Ensure observer is stopped
        }
    } else {
        // Failed to get settings after retries
        console.error("RTL Fixer Content: INITIALIZATION FAILED - Could not retrieve settings. Extension inactive.");
        isEnabled = false; // Ensure state reflects failure
        stopObserver();
    }
}

// --- Listener for Background Updates ---
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const action = message?.action;
    if (!action) return false; // Ignore messages without action

    console.log(`RTL Fixer Content: Received message: ${action}`);
    if (action === 'updateState') {
        let needsReCheck = false;
        // Update state if provided and changed
        if (typeof message.payload?.isEnabled === 'boolean' && isEnabled !== message.payload.isEnabled) {
            isEnabled = message.payload.isEnabled; console.log("isEnabled updated to:", isEnabled); needsReCheck = true;
        }
        if (Array.isArray(message.payload?.excludedSites) && JSON.stringify(excludedSites) !== JSON.stringify(message.payload.excludedSites)) {
            excludedSites = message.payload.excludedSites; console.log("Exclusion list updated:", excludedSites); needsReCheck = true;
        }
        // Re-evaluate activity if state changed
        if (needsReCheck) {
            const shouldBeActive = isEnabled && currentHostname && !excludedSites.includes(currentHostname);
            console.log("Re-checking activity state. Should be active:", shouldBeActive, "Observer currently active:", observerActive);
            if (shouldBeActive && !observerActive) {
                console.log("Enabling scan/observer due to state update.");
                if (document.body) runScan(document.body); // Run scan now
                startObserver();
            } else if (!shouldBeActive && observerActive) {
                console.log("Disabling observer due to state update.");
                stopObserver();
                revertAllStyles(); // Revert styles on dynamic disable/exclude
            }
        }
        sendResponse({ success: true });
        return true; // Async response possible
    }
    return false; // No async response for other actions
});

// --- Start Initialization ---
initialize(); // Call the main async initialization function

// Cleanup observer on page unload
window.addEventListener('beforeunload', stopObserver);

console.log("RTL Fixer Content: Script loaded and initialization sequence started.");