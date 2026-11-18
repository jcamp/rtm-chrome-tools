# RTM Chrome Tools

A **very small Chrome extension skeleton** for future [Remember The Milk](https://www.rememberthemilk.com/) utilities.

**Current version:** 0.1.0. The popup opens and its test button works. This version does **not** connect to Remember The Milk, access browser tabs, read tasks, or change anything in an RTM account.

## Design principles

- Keep the code simple and easy to understand.
- Use plain HTML, CSS and JavaScript. No React, frameworks, build tools or dependencies.
- Prefer small functions with clear names and comments.
- Ask for Chrome permissions only when a feature genuinely needs them.
- Preview changes before any future feature modifies RTM tasks.
- Document every new feature and any installation changes.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | Tells Chrome the extension's name, version and popup file. |
| `popup.html` | Contains the user interface and its minimal CSS. |
| `popup.js` | Handles button clicks and updates the status message. |
| `README.md` | Installation and maintenance instructions. |
| `AGENTS.md` | Development rules for future work, including AI-assisted edits. |

There are no directories or extra configuration files yet.

## Install in Chrome

1. Download this project's files into a local folder, such as `rtm-chrome-tools`.
2. Open `chrome://extensions` in Chrome.
3. Switch on **Developer mode**.
4. Click **Load unpacked**.
5. Choose the folder containing `manifest.json`.
6. Pin **RTM Chrome Tools** using Chrome's Extensions (puzzle piece) menu if desired.
7. Click its icon and then **Test extension**. You should see `Extension is working.`

The extension is installed locally. It does not need Chrome Web Store approval.

## Make a change

1. Edit `popup.html` or `popup.js` with a text editor.
2. Open `chrome://extensions` and click the extension's **Reload** button.
3. Open the popup again and test your change.
4. Commit the change to GitHub with a descriptive commit message.

An extension installed using **Load unpacked** reads files from the local folder. Updating GitHub does not automatically update the installed extension. Download or pull new changes to that folder and reload the extension.

## Debugging

To inspect popup errors, open the popup, right-click inside it and select **Inspect**. Check the **Console** tab. A red error usually points to the file and line number.

Chrome extension popup windows close when they lose focus. This is normal.

## Next step: RTM connection

Only after this skeleton has been installed and tested:

1. Add a small `rtm.js` module for communication with the official RTM API.
2. Add a clear authorisation flow and request only the permissions required.
3. Start with a **read-only** action, such as listing the user's RTM lists.
4. Add a preview and explicit confirmation before any future tool modifies tasks.

Do not put an RTM API key, shared secret or authentication token in GitHub source files. Keep credentials out of the repository.

## Publishing to GitHub

Create an empty repository named `rtm-chrome-tools`, then upload these five files to the repository root. If GitHub offers to add a README automatically, leave that option unticked because one is already supplied.

## Licence

No licence has been chosen for this skeleton. Add one before inviting public reuse or contributions.
