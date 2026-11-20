# RTM Export Builder

Standalone read-only Chrome extension for configurable Remember The Milk CSV and TSV exports.

**Version 0.1.0: initial test build, not yet verified against a live RTM account.**

## Install

1. Download or clone [rtm-chrome-tools](https://github.com/jcamp/rtm-chrome-tools).
2. Open `chrome://extensions`, enable **Developer mode** and select **Load unpacked**.
3. Choose `projects/export-builder` (the folder containing its `manifest.json`).
4. Click the extension icon, then **Open Export Builder**.
5. Enter your RTM API key and shared secret, authorise read-only access, then click **I've authorised access**.

Each extension is independent. API authorisation must be performed separately for each extension because Chrome isolates extension storage.

## Export workflow

1. Choose a **List**, **Tag**, **All tasks** or **Selected RTM tasks**.
2. Optionally include nested subtasks and completed tasks.
3. Tick and drag fields to arrange the export columns.
4. Select CSV or TSV and click **Preview**.
5. Copy tab-delimited text to the clipboard or download a CSV/TSV file.

Preview shows up to 10 rows. Clipboard and file actions contain the complete prepared export.

The hierarchy field expands to `Task`, `Subtask 1`, `Subtask 2`, etc. according to the maximum depth actually included. One task occupies each row. For tag exports, tagged tasks are starting points and their untagged descendants are included when subtasks are enabled.

Notes are combined in one cell with titles and separators. Multiline fields use quoted CSV/TSV escaping. Spreadsheet formula-looking values are prefixed with an apostrophe to reduce formula-injection risk. This protection intentionally modifies the exported representation, not the original RTM data.

## Important limitations

- **Selected RTM tasks are experimental.** Browser selection is not part of the RTM API. This build looks for selected task IDs exposed as `data-task-id` in the current RTM web interface. RTM may not expose selection in that form. If not, the exporter fails explicitly instead of exporting the wrong tasks. This needs live testing before release.
- **Original sibling order** follows task ordering in the RTM API response. Whether it matches drag-and-drop order in all RTM views needs live verification.
- **Completed history** is available only to the extent returned by RTM's API and its filters. Completed and incomplete tasks are fetched separately for each regular list.
- **RTM Smart Lists** aren't separate physical lists. Export a regular list, a tag, or the whole account instead.
- Some API properties may be absent. Blank cells are used for those values. The field catalogue needs a live-data audit before the extension can claim complete RTM field coverage.
- The RTM series `url` property may be a user-supplied URL, not a dependable RTM task permalink.
- Large exports fetch each list sequentially and may take time. A failed request stops the export rather than silently returning incomplete results.
- Clipboard multiline-note behaviour requires verification in Excel and Google Sheets.
- Exported data is held only in the extension tab while previewing. Do not leave sensitive exports open on shared computers.

## Shared authentication source

`shared/rtm.js` and `shared/md5.js` are the canonical copies of the existing authentication implementation. Run:

```sh
node scripts/sync-rtm-auth.mjs
```

from the repository root to copy them into the individual extension folders before packaging. This keeps each extension independently installable without duplicating maintenance. The existing Tags and Lists extension was not modified in this initial build.

The RTM API key, secret and token use Chrome's local extension storage, following the existing extension's security model. They are not committed to GitHub and are cleared on Disconnect. This is browser storage, not a credential vault.

## Project status

Core UI, RTM API access, recursive column builder, preview, CSV/TSV export and clipboard operations are implemented. API integration, task selection, export accuracy and browser downloads still require live Chrome testing.

This extension performs **no RTM write API operations**.

Not endorsed or certified by Remember The Milk.
