// ~/background.js
//
//  * Copyright (C) Mohammad (Sina) Jalalvandi 2024-2025 <jalalvandi.sina@gmail.com>
//  * Package : FireFox-RTL-Content-Fixer
//  * License : Apache-2.0
//  * Version : 1.2.0
//  * URL     : https://github.com/jalalvandi/firefox-rtl-content-fixer
//  * Sign: FireFox-RTL-Content-Fixer-20250411-287207ba638e-2735c9d4aa25b5d556a8fca6a2f78a4a
//
// this file contains the background script for the extension.

const DEFAULT_SETTINGS = {
    isEnabled: true,
    excludedSites: []
};

// --- Initialization ---
browser.runtime.onInstalled.addListener(async () => {
    console.log("RTL Fixer Pro Background: Extension installed/updated.");
    try {
        let settings = await browser.storage.local.get(DEFAULT_SETTINGS);
        settings = { ...DEFAULT_SETTINGS, ...settings }; // Ensure all keys exist
        await browser.storage.local.set(settings);
        console.log("RTL Fixer Pro Background: Initial settings applied:", settings);
    } catch (error) {
        console.error("RTL Fixer Pro Background: Error setting initial settings:", error);
    }
});

// --- Get Settings Utility ---
async function getSettings() {
    try {
        const settings = await browser.storage.local.get(DEFAULT_SETTINGS);
        return { ...DEFAULT_SETTINGS, ...settings }; // Return merged settings
    } catch (error) {
        console.error("RTL Fixer Pro Background: Error getting settings:", error);
        return { ...DEFAULT_SETTINGS }; // Return defaults on error
    }
}

// --- Message Handling ---
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("RTL Fixer Pro Background: Received message:", message.action);

    // Use an async IIFE (Immediately Invoked Function Expression) to handle async operations
    // and ensure sendResponse is called correctly, even on errors.
    (async () => {
        try {
            if (message.action === 'getSettings') {
                const settings = await getSettings();
                sendResponse(settings);
            } else if (message.action === 'toggleEnabled') {
                let settings = await getSettings();
                settings.isEnabled = !!message.payload; // Ensure boolean
                await browser.storage.local.set({ isEnabled: settings.isEnabled });
                console.log("RTL Fixer Pro Background: isEnabled set to:", settings.isEnabled);
                await notifyAllTabs({ action: 'updateState', payload: { isEnabled: settings.isEnabled } });
                sendResponse({ success: true, isEnabled: settings.isEnabled });
            } else if (message.action === 'addExcludedSite') {
                let settings = await getSettings();
                const hostname = message.payload;
                if (hostname && !settings.excludedSites.includes(hostname)) {
                    settings.excludedSites.push(hostname);
                    await browser.storage.local.set({ excludedSites: settings.excludedSites });
                    console.log(`RTL Fixer Pro Background: Added "${hostname}" to exclusion list.`);
                    await notifyAllTabs({ action: 'updateState', payload: { excludedSites: settings.excludedSites } }); // Notify immediately
                    sendResponse({ success: true, excludedSites: settings.excludedSites });
                } else {
                    console.warn(`RTL Fixer Pro Background: Hostname "${hostname}" already excluded or invalid.`);
                    sendResponse({ success: false, reason: hostname ? 'Already excluded' : 'Invalid hostname' });
                }
            } else if (message.action === 'removeExcludedSite') {
                let settings = await getSettings();
                const hostname = message.payload;
                const index = settings.excludedSites.indexOf(hostname);
                if (hostname && index > -1) {
                    settings.excludedSites.splice(index, 1);
                    await browser.storage.local.set({ excludedSites: settings.excludedSites });
                    console.log(`RTL Fixer Pro Background: Removed "${hostname}" from exclusion list.`);
                    await notifyAllTabs({ action: 'updateState', payload: { excludedSites: settings.excludedSites } }); // Notify immediately
                    sendResponse({ success: true, excludedSites: settings.excludedSites });
                } else {
                    console.warn(`RTL Fixer Pro Background: Hostname "${hostname}" not found.`);
                    sendResponse({ success: false, reason: 'Hostname not found' });
                }
            } else {
                // Optional: handle unknown actions if needed
                console.log("RTL Fixer Pro Background: Unknown action received.");
                // sendResponse({ success: false, reason: 'Unknown action' }); // Decide if you need to respond
            }
        } catch (error) {
            console.error(`RTL Fixer Pro Background: Error processing action "${message.action}":`, error);
            // Send an error response if something failed internally
            sendResponse({ success: false, reason: `Internal error: ${error.message}` });
        }
    })(); // Immediately invoke the async function

    // Crucially, return true to indicate that sendResponse will be called asynchronously.
    return true;
});


// --- Helper Function to Notify Content Scripts ---
async function notifyAllTabs(message) {
    console.log("RTL Fixer Pro Background: Notifying tabs with message:", message.action);
    try {
        const tabs = await browser.tabs.query({ url: ["http://*/*", "https://*/*"] }); // Only query relevant tabs
        let notifiedCount = 0;
        for (const tab of tabs) {
            if (tab.id) {
                try {
                    // console.log(`Attempting to send message to Tab ID: ${tab.id}`);
                    await browser.tabs.sendMessage(tab.id, message);
                    notifiedCount++;
                } catch (error) {
                    // This error is expected if the content script isn't injected/active on a tab
                    // console.warn(`RTL Fixer Pro: Could not send message to Tab ${tab.id} (${tab.url || 'N/A'}): ${error.message}`);
                }
            }
        }
        console.log(`RTL Fixer Pro Background: Message send attempt finished. Potentially notified ${notifiedCount} tabs.`);
    } catch (error) {
        console.error("RTL Fixer Pro Background: Error querying or sending message to tabs:", error);
    }
}


console.log("RTL Fixer Pro: Background script (non-service worker) started.");