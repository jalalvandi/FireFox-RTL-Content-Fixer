// content.js
console.log("RTL Content Fixer: Content script loaded.");

// --- Constants ---
// Unicode range for Persian/Arabic characters and common related marks
const RTL_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
// Basic Latin characters
const LTR_REGEX = /[A-Za-z]/;
// Digits (can appear in both LTR and RTL contexts)
const DIGIT_REGEX = /[0-9]/;

// Tags most likely to contain block-level or significant inline text
// Avoid overly broad selectors like 'div' or '*' if possible initially
const TARGET_TAGS = ['P', 'LI', 'TD', 'TH', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'ARTICLE', 'SECTION', 'ASIDE', 'SUMMARY', 'FIGCAPTION'];
// Selectors for elements to explicitly skip (optimization)
const SKIP_SELECTORS = 'script, style, noscript, code, pre, kbd, var, samp, textarea, input, [contenteditable="true"]'; // Added contenteditable

const PROCESSED_ATTR = 'data-rtl-fixer-processed';
const RTL_STYLE_ATTR = 'data-rtl-fixer-styled'; // Mark elements we styled

// --- State Variables ---
let isEnabled = true; // Assume enabled by default until settings are fetched
let excludedSites = [];
let currentHostname = window.location.hostname;
let observer = null; // MutationObserver instance
let observerActive = false;

// --- Core Logic Functions ---

/**
 * Checks if an element is a potential candidate for RTL fixing.
 * @param {Element} element The DOM element to check.
 * @returns {boolean} True if the element might need fixing, false otherwise.
 */
function isPotentialCandidate(element) {
    // 1. Basic checks: Must be an element node, not explicitly skipped, and visible.
    if (!element || element.nodeType !== Node.ELEMENT_NODE || element.matches(SKIP_SELECTORS)) {
        return false;
    }
    // Avoid checking hidden elements (optimization) - check offsetParent which is faster than getComputedStyle
    if (element.offsetParent === null && element.tagName !== 'BODY') { // Check visibility crudely
        // Note: This might miss elements initially hidden then shown later without DOM change triggering observer
        return false;
    }

    // 2. Check if already processed or styled by us
    if (element.hasAttribute(PROCESSED_ATTR) || element.hasAttribute(RTL_STYLE_ATTR)) {
        return false;
    }

    // 3. Check content: Must contain RTL characters.
    //    Checking textContent can be expensive repeatedly. Check basic presence first.
    const text = element.textContent; // Get text content once
    if (!text || !RTL_REGEX.test(text)) {
        element.setAttribute(PROCESSED_ATTR, 'no-rtl'); // Mark as checked, no RTL found
        return false;
    }

    // 4. Check direction: Only fix if current direction is LTR.
    //    getComputedStyle is expensive, do it last.
    try {
        if (window.getComputedStyle(element).direction === 'rtl') {
            element.setAttribute(PROCESSED_ATTR, 'already-rtl'); // Mark as checked, already RTL
            return false;
        }
    } catch (e) {
        console.warn("RTL Fixer: Could not get computed style for element:", element, e);
        element.setAttribute(PROCESSED_ATTR, 'style-error'); // Mark as checked, error occurred
        return false; // Skip if style cannot be determined
    }

    // 5. Content Mix Check (Refined):
    //    Only apply RTL if it *contains* RTL chars (checked above)
    //    AND it's currently LTR (checked above).
    //    We *don't* strictly need the LTR check (LTR_REGEX.test(text)) anymore,
    //    because if it was *purely* RTL, the site's CSS *should* handle it.
    //    Our goal is to fix mixed content or wrongly LTR'd RTL content.
    //    So, the conditions RTL_REGEX.test(text) and computedStyle.direction === 'ltr' are sufficient.

    return true; // Passed all checks, it's a candidate
}

/**
 * Applies RTL styling to an element.
 * @param {Element} element The DOM element to style.
 */
function applyRtlStyle(element) {
    // console.log("RTL Fixer: Applying RTL style to:", element);
    element.style.direction = 'rtl';
    // Using 'right' is generally safer than 'justify' for mixed content
    element.style.textAlign = 'right';
    element.setAttribute(RTL_STYLE_ATTR, 'true'); // Mark that *we* styled it
    element.removeAttribute(PROCESSED_ATTR); // Remove temporary processing mark
}

/**
 * Checks a specific node and its children recursively for potential RTL fixes.
 * More efficient than querying the whole document repeatedly.
 * @param {Node} node The starting node (Element or Text Node).
 */
function checkAndFixNode(node) {
    if (!node) return;

    // If it's a text node that changed, check its parent element
    if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
        node = node.parentElement;
        // Clear parent's processed status if text changes, it needs re-evaluation
        node.removeAttribute(PROCESSED_ATTR);
        node.removeAttribute(RTL_STYLE_ATTR); // Also remove our style if text changed
        // Note: Removing the style might cause flicker if it needs to be reapplied.
        // A better approach might be to re-evaluate without removing the style first.
        // Let's refine: only remove PROCESSED_ATTR
        node.removeAttribute(PROCESSED_ATTR);
    }

    // Only proceed if it's an Element node now
    if (!node || node.nodeType !== Node.ELEMENT_NODE || node.matches(SKIP_SELECTORS)) {
        return;
    }

    // Check the element itself
    if (isPotentialCandidate(node)) {
        applyRtlStyle(node);
    } else {
        // If not a candidate, mark as processed (if not already marked for a reason)
        if (!node.hasAttribute(PROCESSED_ATTR) && !node.hasAttribute(RTL_STYLE_ATTR)) {
            node.setAttribute(PROCESSED_ATTR, 'checked');
        }
    }

    // Recursively check children (only if the parent isn't explicitly skipped)
    // Use childNodes for direct children, including text nodes (though we primarily process elements)
    // Check element children more reliably:
    const children = node.children; // HTMLCollection of element children
    for (let i = 0; i < children.length; i++) {
        checkAndFixNode(children[i]);
    }
}


/**
 * Scans the entire document (or a container) for elements needing RTL fix.
 * Should be used sparingly, e.g., on initial load.
 * @param {Element} container The element to scan within (default: document.body).
 */
function initialScan(container = document.body) {
    if (!isEnabled || excludedSites.includes(currentHostname)) {
        console.log("RTL Fixer: Initial scan skipped (disabled or excluded).");
        return;
    }
    console.log("RTL Fixer: Starting initial scan...");
    // Query potential candidates directly
    const candidates = container.querySelectorAll(TARGET_TAGS.join(','));
    let fixCount = 0;
    candidates.forEach(el => {
        if (isPotentialCandidate(el)) {
            applyRtlStyle(el);
            fixCount++;
        } else {
            if (!el.hasAttribute(PROCESSED_ATTR) && !el.hasAttribute(RTL_STYLE_ATTR)) {
                el.setAttribute(PROCESSED_ATTR, 'initial-scan-checked');
            }
        }
    });
    console.log(`RTL Fixer: Initial scan completed. ${fixCount} elements styled.`);

    // Start observing *after* the initial scan seems reasonable
    startObserver();
}

// --- MutationObserver Logic ---

/** Debounce function to limit rapid calls */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

const handleMutations = debounce((mutationsList) => {
    if (!isEnabled || !observerActive) {
        // console.log("RTL Fixer: Mutation handling skipped (disabled or observer inactive).");
        return;
    }
    // console.log("RTL Fixer: Processing mutations...");
    let needsProcessing = false;
    mutationsList.forEach((mutation) => {
        if (mutation.type === 'childList') {
            // Check added nodes
            mutation.addedNodes.forEach(node => {
                // Check the node itself and its subtree
                checkAndFixNode(node);
                needsProcessing = true; // Mark that we did work
            });
            // Check removed nodes? Less critical for styling, but could clear attributes if needed.
        } else if (mutation.type === 'characterData') {
            // Check the parent element of the changed text node
            if (mutation.target.parentElement) {
                // Clear status so it gets re-evaluated fully
                mutation.target.parentElement.removeAttribute(PROCESSED_ATTR);
                mutation.target.parentElement.removeAttribute(RTL_STYLE_ATTR); // Remove style if text changed
                checkAndFixNode(mutation.target.parentElement);
                needsProcessing = true; // Mark that we did work
            }
        }
    });
    // if (needsProcessing) console.log("RTL Fixer: Mutation processing finished.");

}, 500); // Debounce delay in milliseconds (adjust as needed)


function startObserver() {
    if (observer || !isEnabled || excludedSites.includes(currentHostname)) {
        console.log("RTL Fixer: Observer not started (already running, disabled, or site excluded).");
        return;
    }
    if (!document.body) {
        console.warn("RTL Fixer: Document body not ready for observer.");
        // Retry shortly?
        setTimeout(startObserver, 100);
        return;
    }

    console.log("RTL Fixer: Starting MutationObserver.");
    observer = new MutationObserver(handleMutations);
    observer.observe(document.body, {
        childList: true,    // Detect added/removed nodes
        subtree: true,      // Observe the entire subtree under body
        characterData: true // Detect changes to text node content
        // We don't usually need attribute changes unless specific attributes affect layout/content significantly
        // attributes: false,
        // attributeOldValue: false,
        // characterDataOldValue: false
    });
    observerActive = true;
}

function stopObserver() {
    if (observer) {
        console.log("RTL Fixer: Stopping MutationObserver.");
        observer.disconnect();
        observer = null;
        observerActive = false;
        // Optionally: Revert styles applied by the extension?
        // revertAllStyles(); // See function below
    }
}

/**
 * Optional: Function to remove styles applied by this extension.
 */
function revertAllStyles() {
    console.log("RTL Fixer: Reverting applied styles...");
    const styledElements = document.querySelectorAll(`[${RTL_STYLE_ATTR}]`);
    styledElements.forEach(el => {
        el.style.direction = ''; // Reset to default/CSS value
        el.style.textAlign = ''; // Reset to default/CSS value
        el.removeAttribute(RTL_STYLE_ATTR);
        el.removeAttribute(PROCESSED_ATTR); // Clear processing state too
    });
    console.log(`RTL Fixer: Reverted styles for ${styledElements.length} elements.`);
}

// --- Initialization and Message Handling ---

async function initialize() {
    try {
        const settings = await browser.runtime.sendMessage({ action: 'getSettings' });
        if (settings) {
            isEnabled = settings.isEnabled;
            excludedSites = settings.excludedSites || [];
            currentHostname = window.location.hostname; // Ensure it's fresh
            console.log("RTL Fixer: Initial settings received:", settings, "Current Host:", currentHostname);

            if (isEnabled && !excludedSites.includes(currentHostname)) {
                // Use requestIdleCallback for non-critical initial scan
                if ('requestIdleCallback' in window) {
                    window.requestIdleCallback(initialScan, { timeout: 2000 }); // Run when idle, max delay 2s
                } else {
                    setTimeout(initialScan, 500); // Fallback timeout
                }
            } else {
                console.log("RTL Fixer: Extension is disabled or site is excluded. Initial scan and observer skipped.");
            }
        } else {
            console.warn("RTL Fixer: Could not retrieve settings from background.");
            // Proceed with defaults (likely enabled) but log warning
            if (isEnabled) setTimeout(initialScan, 500); // Fallback scan
        }
    } catch (error) {
        console.error("RTL Fixer: Error initializing or contacting background script:", error);
        // Attempt initial scan with default assumption (enabled) as a fallback
        console.warn("RTL Fixer: Proceeding with default state (enabled) due to error.");
        setTimeout(initialScan, 500);
    }
}

// Listen for messages from the background script (e.g., state changes)
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("RTL Fixer Content: Received message:", message);
    if (message.action === 'updateState') {
        let stateChanged = false;
        if (typeof message.payload.isEnabled === 'boolean' && isEnabled !== message.payload.isEnabled) {
            isEnabled = message.payload.isEnabled;
            stateChanged = true;
            console.log("RTL Fixer: Enabled state updated to:", isEnabled);
        }
        if (Array.isArray(message.payload.excludedSites) && JSON.stringify(excludedSites) !== JSON.stringify(message.payload.excludedSites)) {
            excludedSites = message.payload.excludedSites;
            stateChanged = true;
            console.log("RTL Fixer: Exclusion list updated.");
        }

        if (stateChanged) {
            currentHostname = window.location.hostname; // Re-check hostname just in case
            const shouldBeActive = isEnabled && !excludedSites.includes(currentHostname);
            const isCurrentlyActive = observerActive;

            if (shouldBeActive && !isCurrentlyActive) {
                console.log("RTL Fixer: Enabling observer and running initial scan due to state change.");
                initialScan(); // Run scan and start observer
            } else if (!shouldBeActive && isCurrentlyActive) {
                console.log("RTL Fixer: Disabling observer due to state change.");
                stopObserver();
                // revertAllStyles(); // Decide if disabling should revert styles
            } else if (shouldBeActive && isCurrentlyActive) {
                console.log("RTL Fixer: State changed but current active status remains correct. Re-evaluating existing elements might be needed if exclusion changed.");
                // Optional: Force a re-scan if the exclusion list was modified to *remove* the current site.
                if (message.payload.excludedSites && !message.payload.excludedSites.includes(currentHostname)) {
                    // If current site was just removed from exclusion, trigger a scan.
                    revertAllStyles(); // Clean slate before scan
                    initialScan();
                }
            }
        }
        sendResponse({ success: true }); // Acknowledge message
        return true; // Indicate async potential if needed later
    }
    // Handle other message types if necessary
});

// Start the initialization process
initialize();

// Cleanup observer on page unload (good practice)
window.addEventListener('beforeunload', () => {
    stopObserver();
});