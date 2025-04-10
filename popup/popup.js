// ~/popup/popup.js
//
//  * Copyright (C) Mohammad (Sina) Jalalvandi 2024-2025 <jalalvandi.sina@gmail.com>
//  * Package : firefox-RTL-Content-Fixer
//  * License : Apache-2.0
//  * Version : 1.1.2
//  * URL     : https://github.com/jalalvandi/firefox-rtl-content-fixer
//  * Sign: firefox-RTL-Content-Fixer-20250411-34b291c67838-e1983939d80718af0d479ae3613e95f1
//
// This file contains the JavaScript code for the popup UI of the Firefox extension.


// --- DOM Elements ---
const enabledToggle = document.getElementById('enabled-toggle');
const excludeButton = document.getElementById('exclude-button');
const unexcludeButton = document.getElementById('unexclude-button');
const currentSiteSpan = document.getElementById('current-site');
const statusMessage = document.getElementById('status-message');
const excludedListSection = document.getElementById('excluded-sites-section');
const excludedListUl = document.getElementById('excluded-sites-list');

// --- State ---
// Store the current tab's hostname retrieved during initialization.
let currentTabHostname = null;

// --- Utility Functions ---

/**
 * Displays a status message to the user.
 * @param {string} message - The message to display.
 * @param {boolean} [isError=false] - True if the message indicates an error.
 * @param {number} [duration=3000] - Duration in ms to show the message (0 for persistent).
 */
function showStatus(message, isError = false, duration = 3000) {
    statusMessage.textContent = message;
    statusMessage.className = isError ? 'status-error' : 'status-info'; // Use classes for styling
    statusMessage.style.display = 'block'; // Make sure it's visible

    // Clear message after duration, only if it hasn't been replaced
    if (duration > 0) {
        setTimeout(() => {
            // Only clear if the current message is still the one we set
            if (statusMessage.textContent === message) {
                statusMessage.textContent = '';
                statusMessage.style.display = 'none';
            }
        }, duration);
    }
}

/**
 * Renders the list of excluded sites in the UI.
 * Attaches event listeners to the remove buttons.
 * @param {string[]} excludedSites - Array of excluded hostnames.
 */
function renderExcludedList(excludedSites) {
    excludedListUl.innerHTML = ''; // Clear previous list
    if (excludedSites && excludedSites.length > 0) {
        // Sort alphabetically for consistent order
        excludedSites.sort().forEach(site => {
            const li = document.createElement('li');
            li.className = 'excluded-site-item';

            const span = document.createElement('span');
            span.textContent = site;
            span.className = 'excluded-site-name';

            const button = document.createElement('button');
            button.textContent = '×'; // Use a standard 'remove' symbol
            button.title = `Remove ${site} from exclusion list`;
            button.className = 'remove-exclusion-button';
            button.dataset.site = site; // Store site name for the handler
            // *** Attach listener directly here ***
            button.addEventListener('click', handleRemoveSpecificExclusion);

            li.appendChild(span);
            li.appendChild(button);
            excludedListUl.appendChild(li);
        });
        excludedListSection.style.display = 'block'; // Show the section
    } else {
        // Hide the section if the list is empty
        excludedListSection.style.display = 'none';
    }
}

/**
 * Updates the main "Exclude Site" / "Re-include Site" buttons
 * based on the current tab's hostname and whether it's in the list.
 * @param {boolean} isCurrentlyExcluded - Is the currentTabHostname in the excluded list?
 */
function updateExcludeControlButtons(isCurrentlyExcluded) {
    // Always reset state first
    excludeButton.style.display = 'none';
    excludeButton.disabled = true;
    unexcludeButton.style.display = 'none';
    unexcludeButton.disabled = true;
    currentSiteSpan.textContent = '...'; // Default/loading text

    if (currentTabHostname) {
        currentSiteSpan.textContent = currentTabHostname;
        if (isCurrentlyExcluded) {
            unexcludeButton.style.display = 'inline-block'; // Show 'Re-include'
            unexcludeButton.disabled = false;               // Enable it
        } else {
            excludeButton.style.display = 'inline-block';   // Show 'Exclude'
            excludeButton.disabled = false;                 // Enable it
        }
    } else {
        // Handle cases where hostname is invalid or not applicable (e.g., about:blank, file://)
        currentSiteSpan.textContent = '(No valid site)'; // More descriptive
        // Keep buttons hidden and disabled
    }
}

// --- Event Handlers ---

/**
 * Handles changes to the main enabled/disabled toggle switch.
 * Sends the new state to the background script and awaits confirmation.
 */
async function handleToggleChange() {
    const newState = enabledToggle.checked;
    enabledToggle.disabled = true; // Prevent rapid clicks
    showStatus(newState ? "Enabling..." : "Disabling..."); // Immediate feedback

    try {
        const response = await browser.runtime.sendMessage({ action: 'toggleEnabled', payload: newState });

        // IMPORTANT: Check the response from the background script
        if (response && response.success) {
            // Background confirmed. The UI state (enabledToggle.checked) is already correct due to the 'change' event.
            console.log(`Popup: Toggle successful. New state from background: ${response.isEnabled}`);
            showStatus(`Extension ${response.isEnabled ? 'Enabled' : 'Disabled'}`);
            // Ensure toggle state matches response, just in case
            enabledToggle.checked = response.isEnabled;
        } else {
            // Background reported failure
            console.error("Popup: Background failed to toggle state.", response);
            showStatus(response?.reason || "Error updating status.", true, 5000);
            // Revert the toggle switch to its previous state ONLY IF background failed
            enabledToggle.checked = !newState;
        }
    } catch (error) {
        // Error communicating with the background script
        console.error("Popup: Error sending toggleEnabled message:", error);
        showStatus("Communication error.", true, 5000);
        // Revert the toggle switch on communication error
        enabledToggle.checked = !newState;
    } finally {
        // Re-enable the toggle regardless of success or failure
        enabledToggle.disabled = false;
    }
}

/**
 * Handles clicking the "Exclude Site" button for the current tab's hostname.
 */
async function handleExcludeCurrentSite() {
    if (!currentTabHostname) {
        showStatus("No valid site to exclude.", true);
        return;
    }

    // Disable both buttons temporarily
    excludeButton.disabled = true;
    unexcludeButton.disabled = true; // Should already be hidden, but be safe
    showStatus(`Excluding ${currentTabHostname}...`);

    try {
        const response = await browser.runtime.sendMessage({ action: 'addExcludedSite', payload: currentTabHostname });

        if (response && response.success) {
            console.log("Popup: Exclusion successful. New list:", response.excludedSites);
            // Update UI based on the *new* list confirmed by the background
            renderExcludedList(response.excludedSites);
            updateExcludeControlButtons(true); // Update buttons (now excluded)
            showStatus(`Site "${currentTabHostname}" excluded.`);
        } else {
            console.error("Popup: Background failed to exclude site.", response);
            showStatus(response?.reason || "Error excluding site.", true, 5000);
            // Re-enable the correct button if exclusion failed
            updateExcludeControlButtons(false); // It's still not excluded
        }
    } catch (error) {
        console.error("Popup: Error sending addExcludedSite message:", error);
        showStatus("Communication error.", true, 5000);
        // Re-enable the correct button on communication error
        updateExcludeControlButtons(false); // It's still not excluded
    }
    // No finally block needed here as updateExcludeControlButtons handles enabling
}

/**
 * Handles clicking the "Re-include Site" button (for the current tab).
 * This simply calls the specific removal handler with the current hostname.
 */
async function handleReIncludeCurrentSite() {
    if (!currentTabHostname) {
        showStatus("No valid site to re-include.", true);
        return;
    }
    // Directly call the function that handles removing any specific site
    await removeSiteFromExclusion(currentTabHostname, unexcludeButton); // Pass the button for disabling
}

/**
 * Handles clicking the '×' button next to a specific site in the excluded list.
 * This is now called directly by the event listener set in renderExcludedList.
 * @param {Event} event - The click event object.
 */
async function handleRemoveSpecificExclusion(event) {
    const siteToRemove = event.target.dataset.site;
    if (!siteToRemove) return;

    // Call the reusable removal logic, passing the specific button clicked
    await removeSiteFromExclusion(siteToRemove, event.target);
}

/**
 * Reusable logic to remove a site from the exclusion list.
 * @param {string} siteToRemove - The hostname to remove.
 * @param {HTMLButtonElement} buttonElement - The button that was clicked (to disable it).
 */
async function removeSiteFromExclusion(siteToRemove, buttonElement) {
    if (!siteToRemove) return;

    // Disable the button that triggered the action
    if (buttonElement) buttonElement.disabled = true;
    showStatus(`Removing ${siteToRemove}...`);

    try {
        const response = await browser.runtime.sendMessage({ action: 'removeExcludedSite', payload: siteToRemove });

        if (response && response.success) {
            console.log("Popup: Removal successful. New list:", response.excludedSites);
            // Re-render the list with updated data confirmed by the background
            renderExcludedList(response.excludedSites);
            // Check if the *current* site was the one removed & update main buttons
            if (siteToRemove === currentTabHostname) {
                updateExcludeControlButtons(false); // Update main buttons (now not excluded)
            }
            showStatus(`Site "${siteToRemove}" re-included.`);
            // Button will be removed/re-rendered by renderExcludedList, no need to re-enable here
        } else {
            console.error("Popup: Background failed to remove exclusion.", response);
            showStatus(response?.reason || "Error removing exclusion.", true, 5000);
            // Re-enable the button ONLY if the operation failed
            if (buttonElement) buttonElement.disabled = false;
        }
    } catch (error) {
        console.error("Popup: Error sending removeExcludedSite message:", error);
        showStatus("Communication error.", true, 5000);
        // Re-enable the button on communication error
        if (buttonElement) buttonElement.disabled = false;
    }
}


// --- Initialization ---

/**
 * Initializes the popup UI by fetching current settings and tab information.
 */
async function initializePopup() {
    console.log("Popup: Initializing...");
    // Disable controls initially until state is loaded
    enabledToggle.disabled = true;
    excludeButton.disabled = true;
    unexcludeButton.disabled = true;
    statusMessage.style.display = 'none'; // Hide status initially

    let settings = null;
    let hostnameFetchError = null;

    // --- Step 1: Fetch Settings and Current Tab Info (concurrently) ---
    try {
        // Promise.all allows fetching settings and tab info in parallel
        const [fetchedSettings, tabs] = await Promise.all([
            browser.runtime.sendMessage({ action: 'getSettings' }),
            browser.tabs.query({ active: true, currentWindow: true })
        ]);

        // Process Settings
        if (!fetchedSettings) throw new Error("Popup: No settings received from background.");
        settings = fetchedSettings;
        console.log("Popup: Settings received:", settings);
        enabledToggle.checked = settings.isEnabled; // Set toggle state

        // Process Tab Info
        currentTabHostname = null; // Reset before processing
        if (tabs.length > 0 && tabs[0]?.url) {
            const currentUrl = tabs[0].url;
            console.log("Popup: Current Tab URL:", currentUrl);
            if (currentUrl.startsWith('http:') || currentUrl.startsWith('https:')) {
                try {
                    currentTabHostname = new URL(currentUrl).hostname;
                } catch (urlError) {
                    console.error("Popup: Error parsing URL:", currentUrl, urlError);
                    hostnameFetchError = "Invalid URL";
                }
            } else {
                hostnameFetchError = "Non-HTTP(S) URL";
            }
        } else {
            hostnameFetchError = "No active tab URL";
        }
        console.log("Popup: Determined hostname:", currentTabHostname || `(${hostnameFetchError || 'None'})`);

    } catch (error) {
        console.error("Popup: Error during initialization fetch:", error);
        showStatus("Error loading extension data.", true, 0); // Persistent error
        // Keep controls disabled if initial fetch fails
        return; // Stop initialization
    }

    // --- Step 2: Update UI based on fetched data ---
    enabledToggle.disabled = false; // Enable toggle now that state is known
    renderExcludedList(settings.excludedSites); // Render the list

    // Determine if current site is excluded and update main buttons
    const isExcluded = currentTabHostname ? settings.excludedSites.includes(currentTabHostname) : false;
    updateExcludeControlButtons(isExcluded);

    // --- Step 3: Add Event Listeners (only once) ---
    // Remove potentially existing listeners before adding new ones (safety measure)
    enabledToggle.removeEventListener('change', handleToggleChange);
    enabledToggle.addEventListener('change', handleToggleChange);

    excludeButton.removeEventListener('click', handleExcludeCurrentSite);
    excludeButton.addEventListener('click', handleExcludeCurrentSite);

    unexcludeButton.removeEventListener('click', handleReIncludeCurrentSite);
    unexcludeButton.addEventListener('click', handleReIncludeCurrentSite);

    // Note: Listeners for individual '×' buttons are added in renderExcludedList

    console.log("Popup: Initialization complete.");
}

// --- Start Initialization ---
// Use DOMContentLoaded to ensure the HTML is parsed before running the script
document.addEventListener('DOMContentLoaded', initializePopup);