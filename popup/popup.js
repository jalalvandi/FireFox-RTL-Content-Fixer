// popup.js

const enabledToggle = document.getElementById('enabled-toggle');
const excludeButton = document.getElementById('exclude-button');
const unexcludeButton = document.getElementById('unexclude-button');
const currentSiteSpan = document.getElementById('current-site');
const statusMessage = document.getElementById('status-message');
const excludedListSection = document.getElementById('excluded-sites-section');
const excludedListUl = document.getElementById('excluded-sites-list');

// --- State ---
// It's better *not* to rely on a local 'currentSettings' variable in the popup
// as it can become stale. Always fetch fresh settings or rely on UI elements.
let currentTabHostname = null; // Keep track of the current tab's hostname

// --- Utility Functions ---

function showStatus(message, isError = false, duration = 3000) {
    statusMessage.textContent = message;
    statusMessage.style.color = isError ? 'red' : '#666'; // Style errors differently
    // Clear message after duration, only if it hasn't been replaced
    if (duration > 0) {
        setTimeout(() => {
            if (statusMessage.textContent === message) {
                statusMessage.textContent = '';
            }
        }, duration);
    }
}

function renderExcludedList(excludedSites) {
    excludedListUl.innerHTML = ''; // Clear previous list
    if (excludedSites && excludedSites.length > 0) {
        excludedSites.sort().forEach(site => {
            const li = document.createElement('li');
            const span = document.createElement('span');
            span.textContent = site;
            const button = document.createElement('button');
            button.textContent = '×';
            button.title = `Remove ${site} from exclusion list`;
            button.dataset.site = site;
            button.addEventListener('click', handleRemoveExclusion); // Listener attached here

            li.appendChild(span);
            li.appendChild(button);
            excludedListUl.appendChild(li);
        });
        excludedListSection.style.display = 'block';
    } else {
        excludedListSection.style.display = 'none';
    }
}

// --- Event Handlers ---

async function handleToggleChange() {
    const newState = enabledToggle.checked;
    // Disable toggle temporarily to prevent rapid clicking
    enabledToggle.disabled = true;
    try {
        // Send message and wait for confirmation
        const response = await browser.runtime.sendMessage({ action: 'toggleEnabled', payload: newState });
        if (response && response.success) {
            // The background script confirmed the change. UI state is now correct.
            showStatus(`Extension ${newState ? 'Enabled' : 'Disabled'}`);
            // No need to update a local 'currentSettings' variable here.
        } else {
            // If background failed, revert UI and show error
            enabledToggle.checked = !newState; // Revert toggle
            showStatus(response?.reason || "Error updating status.", true, 5000);
        }
    } catch (error) {
        console.error("Popup: Error sending toggle message:", error);
        enabledToggle.checked = !newState; // Revert toggle on communication error
        showStatus("Communication error with background.", true, 5000);
    } finally {
        // Re-enable toggle after operation completes
        enabledToggle.disabled = false;
    }
}

async function handleExcludeSite() {
    if (!currentTabHostname) return;
    excludeButton.disabled = true; // Disable button during operation
    unexcludeButton.disabled = true;
    showStatus("Excluding site...");

    try {
        const response = await browser.runtime.sendMessage({ action: 'addExcludedSite', payload: currentTabHostname });
        if (response && response.success) {
            // Update UI based on the *new* list from background
            renderExcludedList(response.excludedSites);
            updateExcludeButtons(true); // Update button visibility (now excluded)
            showStatus(`Site "${currentTabHostname}" excluded.`);
        } else {
            showStatus(response?.reason || "Error excluding site.", true, 5000);
            excludeButton.disabled = false; // Re-enable if it failed
        }
    } catch (error) {
        console.error("Popup: Error sending exclude message:", error);
        showStatus("Communication error.", true, 5000);
        excludeButton.disabled = false; // Re-enable on communication error
    }
    // Note: unexcludeButton remains disabled until page reloads or state changes
}

// Renamed for clarity and attached in renderExcludedList
async function handleRemoveExclusion(event) {
    const siteToRemove = event.target.dataset.site;
    if (!siteToRemove) return;

    // Disable the specific remove button clicked
    event.target.disabled = true;
    showStatus("Removing exclusion...");

    try {
        const response = await browser.runtime.sendMessage({ action: 'removeExcludedSite', payload: siteToRemove });
        if (response && response.success) {
            // Re-render list with updated data from background
            renderExcludedList(response.excludedSites);
            // Check if the *current* site was the one removed
            if (siteToRemove === currentTabHostname) {
                updateExcludeButtons(false); // Update main buttons (now not excluded)
            }
            showStatus(`Site "${siteToRemove}" re-included.`);
        } else {
            showStatus(response?.reason || "Error removing exclusion.", true, 5000);
            event.target.disabled = false; // Re-enable button on failure
        }
    } catch (error) {
        console.error("Popup: Error sending remove exclusion message:", error);
        showStatus("Communication error.", true, 5000);
        event.target.disabled = false; // Re-enable button on communication error
    }
}

// Updated logic for enabling/disabling buttons based on hostname and exclusion status
function updateExcludeButtons(isCurrentlyExcluded) {
    // Always reset state first
    excludeButton.style.display = 'none';
    excludeButton.disabled = true;
    unexcludeButton.style.display = 'none';
    unexcludeButton.disabled = true;
    currentSiteSpan.textContent = '...'; // Default loading text

    if (currentTabHostname) {
        currentSiteSpan.textContent = currentTabHostname; // Display the hostname
        if (isCurrentlyExcluded) {
            unexcludeButton.style.display = 'inline-block'; // Show 'Re-include'
            unexcludeButton.disabled = false;               // Enable it
        } else {
            excludeButton.style.display = 'inline-block';   // Show 'Exclude'
            excludeButton.disabled = false;                 // Enable it
        }
    } else {
        // Handle cases where hostname is invalid or not applicable (e.g., about:blank)
        currentSiteSpan.textContent = 'N/A';
        // Keep buttons hidden and disabled
    }
}


// --- Initialization ---

async function initializePopup() {
    // 1. Get current settings (including enabled state and exclusion list)
    let settings;
    try {
        settings = await browser.runtime.sendMessage({ action: 'getSettings' });
        if (!settings) throw new Error("Popup: No settings received from background.");

        // Set the toggle based *only* on the fetched settings
        enabledToggle.checked = settings.isEnabled;
        enabledToggle.disabled = false; // Ensure toggle is usable

        // Render the initial exclusion list
        renderExcludedList(settings.excludedSites);

    } catch (error) {
        console.error("Popup: Error getting initial settings:", error);
        showStatus("Could not load settings from background.", true, 0); // Persistent error
        enabledToggle.disabled = true; // Disable controls if settings fail
        excludeButton.disabled = true;
        unexcludeButton.disabled = true;
        return; // Stop initialization
    }

    // 2. Get current tab info (URL and hostname) - Independent of settings fetch
    let activeTabHostname = null; // Use a local variable for this scope
    try {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (tabs.length > 0 && tabs[0] && tabs[0].url) {
            const currentUrl = tabs[0].url;
            console.log("Popup: Current Tab URL:", currentUrl); // Log URL for debugging
            // Only try to get hostname for http/https URLs
            if (currentUrl.startsWith('http:') || currentUrl.startsWith('https:')) {
                try {
                    const urlObject = new URL(currentUrl);
                    activeTabHostname = urlObject.hostname; // Extract hostname
                } catch (urlError) {
                    console.error("Popup: Error parsing URL:", currentUrl, urlError);
                    activeTabHostname = null; // Treat parse errors as invalid
                }
            } else {
                console.log("Popup: Tab URL is not http/https:", currentUrl);
                activeTabHostname = null; // Not a site we can exclude by hostname
            }
        } else {
            console.warn("Popup: Could not get active tab or URL.");
            activeTabHostname = null;
        }
    } catch (error) {
        console.error("Popup: Error querying active tab:", error);
        activeTabHostname = null; // Indicate error getting tab info
    }

    // Store the determined hostname globally for button handlers
    currentTabHostname = activeTabHostname;
    console.log("Popup: Determined hostname:", currentTabHostname); // Log determined hostname

    // 3. Update Exclude buttons based on fetched settings and determined hostname
    const isExcluded = currentTabHostname ? settings.excludedSites.includes(currentTabHostname) : false;
    updateExcludeButtons(isExcluded);

    // 4. Add event listeners *after* initial state is set
    //    Remove previous listeners first to prevent duplicates if init runs multiple times (unlikely but safe)
    enabledToggle.removeEventListener('change', handleToggleChange);
    enabledToggle.addEventListener('change', handleToggleChange);

    excludeButton.removeEventListener('click', handleExcludeSite);
    excludeButton.addEventListener('click', handleExcludeSite);

    unexcludeButton.removeEventListener('click', handleRemoveExclusion); // Listener for re-include
    // Note: The remove listener for individual list items is added in renderExcludedList
    unexcludeButton.addEventListener('click', () => {
        // The 'Re-include' button acts like removing the current site from the list
        // Find the corresponding 'x' button logic or call handleRemoveExclusion directly
        handleRemoveExclusion({ target: { dataset: { site: currentTabHostname }, closest: () => null } }); // Simulate event
    });

    console.log("Popup: Initialization complete.");
}

// Run initialization when the popup DOM is ready
document.addEventListener('DOMContentLoaded', initializePopup);