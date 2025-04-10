// ~/content.js
//
//  * Copyright (C) Mohammad (Sina) Jalalvandi 2024-2025 <jalalvandi.sina@gmail.com>
//  * Package : firefox-RTL-Content-Fixer
//  * License : Apache-2.0
//  * Version : 1.1.2
//  * URL     : https://github.com/jalalvandi/firefox-rtl-content-fixer
//  * Sign: firefox-RTL-Content-Fixer-20250411-34b291c67838-e1983939d80718af0d479ae3613e95f1
//
// This file contains the content script for the RTL Content Fixer Addon.


console.log("RTL Content Fixer: Content script loading...");

// --- Constants --- 
const RTL_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LTR_REGEX = /[A-Za-z]/;
const DIGIT_REGEX = /[0-9]/;
const TARGET_TAGS = ['P', 'LI', 'TD', 'TH', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'ARTICLE', 'SECTION', 'ASIDE', 'SUMMARY', 'FIGCAPTION', 'DD', 'DT'];
const SKIP_SELECTORS = 'script, style, noscript, code, pre, kbd, var, samp, textarea, input, [contenteditable="true"], svg, math, iframe';
const PROCESSED_ATTR = 'data-rtl-fixer-processed';
const RTL_STYLE_ATTR = 'data-rtl-fixer-styled';

// --- State Variables --- 
let isEnabled = false;
let excludedSites = [];
let currentHostname = null;
let observer = null;
let observerActive = false;
let secondScanTimer = null; // Timer ID for the delayed second scan

// Get hostname early
try { if (window.location) currentHostname = window.location.hostname; }
catch (e) { console.error("RTL Fixer: Error getting hostname:", e); }

// --- Core Logic Functions (isPotentialCandidate, applyRtlStyle, checkAndFixNode) ---

function isPotentialCandidate(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE || element.matches(SKIP_SELECTORS) || !element.isConnected) return false;
    if (element.hasAttribute(PROCESSED_ATTR) || element.hasAttribute(RTL_STYLE_ATTR)) return false;
    let computedStyle; try { computedStyle = window.getComputedStyle(element); if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') { element.setAttribute(PROCESSED_ATTR, 'hidden'); return false; } } catch (e) { computedStyle = null; }
    const text = element.textContent; if (!text || !RTL_REGEX.test(text)) { element.setAttribute(PROCESSED_ATTR, 'no-rtl'); return false; }
    try { const direction = computedStyle ? computedStyle.direction : window.getComputedStyle(element).direction; if (direction === 'rtl') { element.setAttribute(PROCESSED_ATTR, 'already-rtl'); return false; } } catch (e) { element.setAttribute(PROCESSED_ATTR, 'style-error'); return false; }
    return true;
}
function applyRtlStyle(element) {
    element.style.direction = 'rtl'; element.style.textAlign = 'right'; element.setAttribute(RTL_STYLE_ATTR, 'true'); element.removeAttribute(PROCESSED_ATTR);
}
function checkAndFixNode(node) {
    if (!node) return; if (node.nodeType === Node.TEXT_NODE && node.parentElement) { node = node.parentElement; node.removeAttribute(PROCESSED_ATTR); }
    if (!node || node.nodeType !== Node.ELEMENT_NODE || node.matches(SKIP_SELECTORS) || !node.isConnected) return;
    if (isPotentialCandidate(node)) { applyRtlStyle(node); } else { if (!node.hasAttribute(PROCESSED_ATTR) && !node.hasAttribute(RTL_STYLE_ATTR)) node.setAttribute(PROCESSED_ATTR, 'checked-subtree'); }
    const children = node.children; for (let i = 0; i < children.length; i++) checkAndFixNode(children[i]);
}

// --- Scan and Observer Functions ---

function runScan(scanReason = "Initial", container = document.body) { // Add reason for logging
    // ** Check if active before running any scan **
    if (!isEnabled || (currentHostname && excludedSites.includes(currentHostname))) {
        console.log(`RTL Fixer: Scan (${scanReason}) skipped (disabled or excluded).`);
        return;
    }
    if (!container || typeof container.querySelectorAll !== 'function') return;
    console.log(`RTL Fixer: Running scan (${scanReason})...`);
    const candidates = container.querySelectorAll(TARGET_TAGS.join(','));
    let fixCount = 0;
    candidates.forEach(el => {
        try { // Add try-catch around candidate processing
            if (isPotentialCandidate(el)) { applyRtlStyle(el); fixCount++; }
            else if (!el.hasAttribute(PROCESSED_ATTR) && !el.hasAttribute(RTL_STYLE_ATTR)) {
                el.setAttribute(PROCESSED_ATTR, 'scan-checked');
            }
        } catch (scanError) {
            console.error(`RTL Fixer: Error processing candidate during ${scanReason} scan:`, el, scanError);
        }
    });
    console.log(`RTL Fixer: Scan (${scanReason}) completed. ${fixCount} elements styled.`);
}

function debounce(func, wait) { /* Debounce implementation*/
    let timeout; return function (...args) { const later = () => { clearTimeout(timeout); func(...args); }; clearTimeout(timeout); timeout = setTimeout(later, wait); };
}

// Make mutation handler slightly more robust
const handleMutations = debounce((mutationsList) => {
    if (!isEnabled || !observerActive || (currentHostname && excludedSites.includes(currentHostname))) return;
    // console.log("RTL Fixer: Processing mutations...");
    mutationsList.forEach((mutation) => {
        try { // Add try-catch around mutation processing
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    try { checkAndFixNode(node); } // Inner try-catch for added nodes
                    catch (nodeError) { console.error("RTL Fixer: Error in checkAndFixNode for added node:", node, nodeError); }
                });
            } else if (mutation.type === 'characterData' && mutation.target.parentElement) {
                mutation.target.parentElement.removeAttribute(PROCESSED_ATTR);
                checkAndFixNode(mutation.target.parentElement);
            }
        } catch (mutationError) {
            console.error("RTL Fixer: Error processing mutation:", mutation, mutationError);
        }
    });
    // console.log("RTL Fixer: Mutation processing finished.");
}, 400);


function startObserver() {
    if (observer || !isEnabled || (currentHostname && excludedSites.includes(currentHostname))) return;
    if (!document.body) { setTimeout(startObserver, 100); return; }
    console.log("RTL Fixer: Starting MutationObserver for", currentHostname);
    observer = new MutationObserver(handleMutations);
    try { observer.observe(document.body, { childList: true, subtree: true, characterData: true }); observerActive = true; }
    catch (error) { console.error("RTL Fixer: Failed to start observer:", error); observer = null; observerActive = false; }
}

function stopObserver() {
    if (observer) { console.log("RTL Fixer: Stopping observer"); observer.disconnect(); observer = null; observerActive = false; }
    // Clear the second scan timer if we stop the observer
    if (secondScanTimer) {
        clearTimeout(secondScanTimer);
        secondScanTimer = null;
        console.log("RTL Fixer: Cleared delayed second scan timer.");
    }
}

function revertAllStyles() {
    console.log("RTL Fixer: Reverting styles..."); const styled = document.querySelectorAll(`[${RTL_STYLE_ATTR}]`); styled.forEach(el => { el.style.direction = ''; el.style.textAlign = ''; el.removeAttribute(RTL_STYLE_ATTR); el.removeAttribute(PROCESSED_ATTR); }); console.log(`Reverted ${styled.length} elements.`);
}


// --- Initialization and Message Handling ---

async function getSettingsWithRetry(maxRetries = 5, initialDelay = 200) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try { /* console.log(`Attempt ${attempt}/${maxRetries}...`); */
            const settings = await browser.runtime.sendMessage({ action: 'getSettings' });
            if (settings && typeof settings.isEnabled !== 'undefined' && Array.isArray(settings.excludedSites)) {
                /* console.log("Settings received:", settings); */ return settings;
            } else {
                /* console.warn(`Invalid settings on attempt ${attempt}:`, settings); */
                if (attempt === maxRetries) throw new Error("Invalid settings after max retries.");
            }
        } catch (error) {
            /* console.warn(`Error on attempt ${attempt}:`, error.message); */
            if (attempt === maxRetries) { /* console.error("Failed after retries."); */ return null; }
        }
        const delay = initialDelay * Math.pow(4, attempt - 1);
        /* console.log(`Waiting ${delay}ms...`); */
        await new Promise(resolve => setTimeout(resolve, delay));
    } return null;
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
        excludedSites = settings.excludedSites;

        console.log("RTL Fixer Content: Checking final settings.", { /* ... detailed log ... */ });

        // 3. Decide whether to proceed
        if (isEnabled && currentHostname && !excludedSites.includes(currentHostname)) {
            console.log("RTL Fixer Content: Extension ACTIVE. Proceeding with scan and observer.");

            // 4. Run initial scan when ready (with small delay)
            const runInitialScan = () => setTimeout(() => {
                if (document.body) runScan("Initial DOM Ready"); // Pass reason
            }, 50);
            if (document.readyState === 'complete' || document.readyState === 'interactive') { runInitialScan(); }
            else { document.addEventListener('DOMContentLoaded', runInitialScan, { once: true }); }

            // 5. Schedule a DELAYED SECOND SCAN as a fallback
            // Clear any previous timer first (though unlikely at this stage)
            if (secondScanTimer) clearTimeout(secondScanTimer);
            const secondScanDelay = 3750; // Delay in milliseconds (e.g., 1.75 seconds)
            console.log(`RTL Fixer: Scheduling delayed second scan in ${secondScanDelay}ms.`);
            secondScanTimer = setTimeout(() => {
                console.log("RTL Fixer: Running delayed second scan...");
                // Check state *again* before running the delayed scan
                if (isEnabled && currentHostname && !excludedSites.includes(currentHostname) && document.body) {
                    runScan("Delayed Second Scan");
                } else {
                    console.log("RTL Fixer: Delayed second scan skipped (state changed or body missing).");
                }
                secondScanTimer = null; // Clear timer ID after execution
            }, secondScanDelay);


            // 6. Start the observer (happens quickly, observes future changes)
            startObserver();

        } else {
            // Log reason for not proceeding 
            // ...
            stopObserver();
        }
    } else {
        // Failed to get settings after retries 
        // ...
        isEnabled = false; stopObserver();
    }
}

// --- Listener for Background Updates ---
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const action = message?.action; if (!action) return false;
    // console.log(`RTL Fixer Content: Received message: ${action}`); // Less verbose logging
    if (action === 'updateState') {
        let needsReCheck = false;
        if (typeof message.payload?.isEnabled === 'boolean' && isEnabled !== message.payload.isEnabled) { isEnabled = message.payload.isEnabled; console.log("isEnabled updated to:", isEnabled); needsReCheck = true; }
        if (Array.isArray(message.payload?.excludedSites) && JSON.stringify(excludedSites) !== JSON.stringify(message.payload.excludedSites)) { excludedSites = message.payload.excludedSites; console.log("Exclusion list updated"); needsReCheck = true; }
        if (needsReCheck) {
            const shouldBeActive = isEnabled && currentHostname && !excludedSites.includes(currentHostname);
            // console.log("Re-checking activity state. Should be active:", shouldBeActive, "Observer active:", observerActive);
            if (shouldBeActive && !observerActive) { console.log("Enabling scan/observer due to state update."); if (document.body) runScan("State Update Re-enable"); startObserver(); } // Run scan on re-enable
            else if (!shouldBeActive && observerActive) { console.log("Disabling observer/reverting due to state update."); stopObserver(); revertAllStyles(); }
        }
        sendResponse({ success: true }); return true;
    } return false;
});

// --- Start Initialization ---
initialize();

// Cleanup observer & timer on page unload
window.addEventListener('beforeunload', () => {
    stopObserver(); // This now also clears the secondScanTimer
});

console.log("RTL Fixer Content: Script loaded and initialization sequence started.");