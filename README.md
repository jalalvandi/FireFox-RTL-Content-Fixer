# Live RTL Fixer

A FireFox Addon designed to fix Right-to-Left (RTL) and Left-to-Right (LTR) text alignment issues in real-time, primarily for Persian users, with support for other RTL languages like Arabic. This tool ensures seamless text rendering on websites, especially when using browser translation tools (e.g., Google Translate) or LLM,s without requiring a page refresh.

## Features
- **Real-Time Fixes**: Automatically adjusts text direction and alignment as content changes (e.g., during translation).
- **Language Detection**: Smart detection of RTL (Persian, Arabic, etc.) and LTR (English, etc.) text with customizable thresholds.
- **Blacklist Management**: Add or remove websites from a blacklist to exclude them from processing.
- **User-Friendly Interface**: A sleek popup with toggle, blacklist view.
- **Optimized Performance**: Lightweight and efficient, with minimal resource usage.

## Installation
1. **Clone or Download**:
git clone https://github.com/jalalvandi/FireFox-RTL-Content-Fixer
Or download the ZIP file and extract it.

2. **Load in Chrome**:
- Open FireFox and go to addon manager (about:addons).
- Click on the gear icon and select the debug addon option.
- Click "Load temporary addon" and select the folder containing the extension files (manifest.json, etc.).
- Select manifest.json file.

3. **Verify**:
- The extension icon should appear in your firefox toolbar. Click it to access the popup.

## Usage
- **Toggle On/Off**: Enable or disable the extension with a single click.
- **Exclude Sites**: Add a site to the blacklist if you don’t want the extension to run on it.


### Example
1. Open a web page containing Persian and English texts.
2. Watch as the extension instantly adjusts the text direction to RTL—no refresh needed!

## Files
- manifest.json: Extension configuration.
- content.js: Core logic for real-time text fixing.
- styles.css: CSS overrides for RTL/LTR styling.
- popup.html: Popup interface.
- popup.js: Popup functionality and settings management.
- icon.png,: Extension icons (replace with your own if desired).

## Development
Want to contribute or customize? Here’s how:
1. **Fork the Repository**: Click "Fork" on GitHub and clone your fork.
2. **Modify the Code**: Edit the JavaScript, CSS, or HTML files as needed.
3. **Test Locally**: Reload the extension in FireFox after changes (about:addons > "Reload").
4. **Submit a Pull Request**: Share your improvements with the community!

## License
This project is open-source under the MIT License (LICENSE). Feel free to use, modify, and distribute it.

## Credits
Developed by Sina Jalalvandi (mailto:jalalvandi.sina@gmail.com). Contributions and feedback are welcome!

---