# Tag & List Relationships

A read-only Chrome extension for browsing the lists and tags in a Remember The Milk account.

**Version:** 0.1.0. The extension currently retrieves list names and tag names. It does not calculate task counts, merge tags or change tasks.

## Installation

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** and click **Load unpacked**.
4. Select the `projects/tag-list-relationships` folder containing `manifest.json`.
5. Pin the extension if you wish.

## First use

1. Click the extension's icon, then **Open dashboard**.
2. Enter an RTM API key and shared secret. See [RTM API key information](https://www.rememberthemilk.com/services/api/keys.rtm).
3. Click **Authorise in RTM** and approve **read-only** access in the RTM browser tab.
4. Return to the dashboard and click **I've authorised access**.
5. Your lists and tags should appear. Use **Refresh** to fetch them again.

**Important:** You need an API key and shared secret for an RTM application. Neither is provided in this repository.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | Chrome manifest and minimum permissions. |
| `popup.html`, `popup.js` | Toolbar popup that opens the dashboard. |
| `dashboard.html`, `dashboard.js` | Connection screen and list/tag display. |
| `rtm.js` | Signed, read-only RTM API requests. |
| `md5.js` | MIT-licensed MD5 dependency from blueimp-md5 v2.19.0, as bundled by [Später](https://github.com/andygrunwald/spaeter). |
| `AGENTS.md` | Development rules for this project. |

## Security and limits

The extension requests only RTM read permission and exposes no task-changing actions. It communicates directly with `api.rememberthemilk.com`.

The API key, shared secret and token are stored in `chrome.storage.local` so they persist across restarts. This is browser extension storage, **not an encrypted credential vault**. Do not add credentials to GitHub files. **Disconnect** clears the saved credentials.

The connection flow must be completed in a single open dashboard session. If you close the dashboard before finishing, start again.

The current list/tag view has no task counts and does not inspect tasks or completed-task history. This first version needs a live test with an RTM account.

## Troubleshooting

Right-click inside the dashboard and select **Inspect**, then look at the Console for JavaScript errors. API failures are shown on the page.

After pulling updates from GitHub, reload this extension at `chrome://extensions`.

## Licence

MIT. See the repository [LICENSE](../../LICENSE). This project uses the Remember The Milk API but is not endorsed or certified by Remember The Milk.
