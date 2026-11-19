# Tag & List Relationships

A read-only Chrome extension for browsing the lists and tags in a Remember The Milk account.

**Version:** 0.1.4. The extension retrieves regular lists and tags alphabetically, with the number of incomplete tasks beside each. Smart Lists are excluded because they are saved searches rather than task storage lists. It does not calculate task counts, merge tags or change tasks.

## Installation

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** and click **Load unpacked**.
4. Select the `projects/tag-list-relationships` folder containing `manifest.json`.
5. Pin the extension if you wish.

## First use

1. Click the extension's icon, then **Open dashboard**.
2. Obtain an API key and shared secret from [RTM API Keys](https://www.rememberthemilk.com/services/api/keys.rtm) by registering an application. An existing application key that you own can also be reused. Enter both values in the dashboard.
3. Click **Authorise in RTM** and approve **read-only** access in the RTM browser tab.
4. Return to the dashboard and click **I've authorised access**.
5. Your lists and tags should appear. Use **Refresh** to fetch them again.

**Important:** You need an API key and shared secret for an RTM application. Neither is provided in this repository.

## Task counts

Counts show **incomplete tasks**, including subtasks. Each task is counted once for its list and once for each tag assigned to it. An untagged task contributes to its list count but not to any tag count. Recurring task instances are counted separately when incomplete.

The extension reads tasks with the RTM `rtm.tasks.getList` API using `status:incomplete`, so counts require one additional API request on each refresh. It does not change any tasks. Completed tasks are not included.

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

An unfinished authorisation is stored temporarily in Chrome session storage so you can close and reopen the dashboard. Once authorisation succeeds, the credentials are stored locally. If Chrome ends the session before you finish, begin authorisation again.

The counts do not include completed-task history. The extension still needs testing against an RTM account with nested subtasks and recurring tasks.

The dashboard checks for an existing connection before showing the sign-in form, avoiding a brief sign-in screen on repeat visits.

## Troubleshooting

Right-click inside the dashboard and select **Inspect**, then look at the Console for JavaScript errors. API failures are shown on the page.

After pulling updates from GitHub, reload this extension at `chrome://extensions`. If Chrome is still loading an earlier copy of the extension from a different folder, check its installed path.

## Licence

MIT. See the repository [LICENSE](../../LICENSE). This project uses the Remember The Milk API but is not endorsed or certified by Remember The Milk.
