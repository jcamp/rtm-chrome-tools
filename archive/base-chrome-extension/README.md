# Basic Chrome Extension

A reusable, minimal Google Chrome extension starter. It has no external dependencies, build process or permissions.

## What it does

Displays a popup with a **Test extension** button. Clicking the button shows `Extension is working.`

It does not access websites, user data or external services.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | Chrome extension name, version and popup configuration. |
| `popup.html` | Popup interface and small amount of CSS. |
| `popup.js` | Button event handler and status message. |
| `README.md` | Installation and reuse instructions. |
| `AGENTS.md` | Development guidance. |

## Install and test

1. Copy this folder somewhere outside the repository if using it for another project.
2. Open `chrome://extensions` in Google Chrome.
3. Enable **Developer mode** and select **Load unpacked**.
4. Choose the folder containing `manifest.json`.
5. Open the extension popup and click **Test extension**.
6. Confirm that it displays `Extension is working.`

## Reuse in another project

1. Copy the five files into a new project folder.
2. Change the extension name, description and version in `manifest.json`.
3. Change the title and heading in `popup.html`.
4. Replace the sample button behaviour in `popup.js` with your feature.
5. Update the README to explain the new project's purpose and installation.

After editing files, select **Reload** on the extension's card at `chrome://extensions`.

This is an independent example. Editing it does not change the RTM Chrome Tools extension at the root of the repository.

## Troubleshooting

Open the popup, right-click and choose **Inspect** to view errors in Chrome DevTools.

## Licence

This starter is derived from RTM Chrome Tools, licensed under MIT. See the repository's root [LICENSE](../../LICENSE).
