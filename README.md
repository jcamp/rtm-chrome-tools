# RTM Chrome Tools

A lightweight Google Chrome extension for utilities that work with [Remember The Milk](https://www.rememberthemilk.com/).

**Version:** 0.1.0

This is an initial extension skeleton. It provides a popup with a test button, but does not yet connect to Remember The Milk or access or modify tasks.

## Installation

1. Select **Code → Download ZIP** on GitHub and extract the files.
2. Open `chrome://extensions` in Google Chrome.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Select the extracted folder containing `manifest.json` (not its parent folder).
6. Optionally pin the extension using Chrome's Extensions menu.

The extension is installed locally and does not require publication in the Chrome Web Store.

## Usage

Click the extension icon, then select **Test extension**.

The message `Extension is working.` confirms that the popup and JavaScript are running.

No Remember The Milk account or API credentials are required for this version.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | Chrome extension configuration. |
| `popup.html` | Popup layout and basic styling. |
| `popup.js` | Test button behaviour. |
| `README.md` | Project documentation. |
| `AGENTS.md` | Contributor and development guidance. |
| `LICENSE` | MIT licence. |

The extension uses plain HTML and JavaScript with no build process or third-party dependencies.

## Updating

For an extension installed using **Load unpacked**:

1. Download or pull the updated project files into the same folder.
2. Visit `chrome://extensions`.
3. Select **Reload** for RTM Chrome Tools.

Changes made on GitHub are not automatically installed in Chrome.

## Troubleshooting

If the popup does not work, open it, right-click and select **Inspect**, then check the **Console** for errors.

## Licence

MIT. See [LICENSE](LICENSE).

This project uses the Remember The Milk API but is not endorsed or certified by Remember The Milk.
