# Tag & List Relationships

**Version:** 0.2.6, Stage 1 read-only analysis.

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

The dashboard displays regular lists (not Smart Lists), tags and separate incomplete/completed instance counts. Both overview tables have clickable List/Tag, Incomplete and Completed headings to sort in either direction, independently. Unknown and unscanned counts always sort last. Each table scrolls within a fixed-height area so Findings stays close to the top of the page. Incomplete tasks are fetched with one filtered API request for speed. If it fails, the extension retries by regular list, one at a time. Completed-task scanning is **off by default** because historical requests can be very slow or fail. You can explicitly enable it, at which point completed tasks are retrieved by regular list. A failed request leaves that count unknown (`?`) rather than claiming zero. Tag counts are unknown if any required list request failed.

Select a list or tag to inspect matching loaded tasks. The Task Inspector now has a searchable list/tag field with built-in suggestions, so you can switch directly between any loaded list or tag without returning to the overview. Enter a full list/tag name or choose a suggestion. If a list and tag share the same name, use the prefixed List: or Tag: suggestion. The existing task-name filter remains independent. The selection is displayed as a heading above the inspector, so the List column is omitted. Click Task, Status, Tags or Due to sort results. Clicking again reverses the order. Dates sort chronologically, with undated tasks last. The search field filters task names and the inspector displays up to 500 matching instances. It shows completion status, assigned tags, due date in UK day/month/year format (without time), and a marker when RTM returns a parent task ID. The API returns task series and task instances separately, so recurring instances can be counted individually. Subtask and completed-history coverage must be verified with real RTM data.

When all requested statuses have been retrieved successfully, the tool identifies unused tags, single-task tags, tags confined to one list, numbered similar tag names, untagged task counts and empty regular lists. The findings are displayed in separate tables for similar names, single-task tags, tags used within one list and tags without matching tasks. **Suggestions are not automatic merge instructions.** If a request fails, findings needing full coverage are withheld.

The extension is **read-only**. It does not merge tags, move tasks, alter lists or modify RTM data.

The task inspector uses four columns with fixed proportions to fit the available page width, giving task names most of the space and keeping dates on one line. UTC timestamps are converted to the Europe/London calendar date before display.

## Reliability

A transient HTTP 502 response is retried once for read methods. The normal incomplete-task scan is one filtered request. Only if that fails does the extension fall back to sequential per-list requests. Completed history is optional, sequential and may be much slower. The task counts shown for tags and findings describe only the statuses actually scanned. Refresh fetches everything again. Partial results remain visible, with the failed list and status displayed.

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
- Deeply nested subtasks, recurring history and completed-task API coverage require real-account validation. Any tag listed as having no matching tasks is not necessarily unused in completed history unless that history was scanned.
- No exported reports or remembered suggestion exclusions yet.

## Local parser tests

The parser has dependency-free tests using sample RTM responses. Run:

```sh
node --experimental-default-type=module --test tests/analysis.test.mjs
```

These tests validate basic counting, completion-state handling and duplicate avoidance. They are not a substitute for a live API test.

## Licence

MIT, see [LICENSE](../../LICENSE). Uses the Remember The Milk API but is not endorsed or certified by Remember The Milk.
