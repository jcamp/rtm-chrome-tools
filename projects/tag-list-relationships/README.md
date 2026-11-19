# Tag & List Relationships

**Version:** 0.2.0, Stage 1 read-only analysis.

A Chrome extension for inspecting Remember The Milk's regular lists, tags and task relationships. This is an early test build and has not yet been verified against a representative RTM account.

## Install

1. Download this repository or pull the latest changes.
2. In Chrome, visit `chrome://extensions` and enable Developer mode.
3. Choose **Load unpacked** and select the `projects/tag-list-relationships` folder.
4. After updates, reload the extension from the same page.

## Connect

Open the extension dashboard. If needed, register an RTM application at [RTM API Keys](https://www.rememberthemilk.com/services/api/keys.rtm). Enter its API key and shared secret, choose **Authorise in RTM**, approve **read-only** access in RTM and then choose **I've authorised access**. Your own existing API key can be reused. Disconnect clears saved credentials.

The API key, shared secret and token are stored in Chrome's local extension storage, which is not a credential vault. Pending authorisation is temporarily stored in session storage. Never commit credentials to GitHub.

## Analysis

The dashboard displays alphabetical regular lists (not Smart Lists), tags and separate incomplete/completed instance counts. Each list is retrieved sequentially, with a separate request for each status. Completed-task scanning can be switched off, in which case completed counts say *not scanned*. A failed request leaves that count unknown (`?`) rather than claiming zero. Tag counts are unknown if any required list request failed.

Select a list or tag to inspect matching loaded tasks. The search field filters task names and the inspector displays up to 500 matching instances. It shows completion status, assigned tags, due date and a marker when RTM returns a parent task ID. The API returns task series and task instances separately, so recurring instances can be counted individually. Subtask and completed-history coverage must be verified with real RTM data.

When all incomplete and completed requests have succeeded, the tool identifies unused tags, single-task tags, tags confined to one list, numbered similar tag names, untagged task counts and empty regular lists. **Suggestions are not automatic merge instructions.** If a request fails, findings needing full coverage are withheld.

The extension is **read-only**. It does not merge tags, move tasks, alter lists or modify RTM data.

## Reliability

A transient HTTP 502 response is retried once for the API's read methods. Requests run sequentially by list and status, prioritising reliability over speed. Refresh fetches everything again. Partial results remain visible, with the failed list and status displayed.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | Chrome permissions and entry point. |
| `popup.html`, `popup.js` | Toolbar button opening the dashboard. |
| `dashboard.html`, `dashboard.js` | User interface and sequential scan. |
| `rtm.js` | RTM authentication and read-only API calls. |
| `analysis.js` | Task parsing, counting and relationship analysis. |
| `md5.js` | blueimp-md5 v2.19.0 (MIT), supplied via [Später](https://github.com/andygrunwald/spaeter). |
| `AGENTS.md` | Development guidance. |
| [`SPECIFICATION.md`](SPECIFICATION.md) | Agreed long-term behaviour and development stages. |

## Current limitations

- Read-only Stage 1 test build, not a release-ready consolidation tool.
- Direct, reliable deep links to individual RTM tasks have not been confirmed, so none are fabricated.
- Only the first 500 matches are displayed in the inspector.
- Tag counts cover returned RTM task instances, not necessarily distinct task titles.
- Deeply nested subtasks, recurring history and completed-task API coverage require real-account validation.
- No exported reports or remembered suggestion exclusions yet.

## Licence

MIT, see [LICENSE](../../LICENSE). Uses the Remember The Milk API but is not endorsed or certified by Remember The Milk.
