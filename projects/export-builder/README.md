# RTM Export Builder

Standalone read-only Chrome extension for configurable Remember The Milk CSV and TSV exports.

**Version 0.1.0: initial test build, with fixes following first live user feedback.**

## Developer documentation

See [DEVELOPMENT.md](DEVELOPMENT.md) for module responsibilities, code flow, composite task identity, selected-task matching limitations, API failure handling, spreadsheet safety, and how to run the regression tests. The implementation also has function-level JSDoc comments.

## Install

1. Download or clone [rtm-chrome-tools](https://github.com/jcamp/rtm-chrome-tools).
2. Open `chrome://extensions`, enable **Developer mode** and select **Load unpacked**.
3. Choose `projects/export-builder` (the folder containing its `manifest.json`).
4. Click the extension icon, then **Open Export Builder**.
5. Enter your RTM API key and shared secret, authorise read-only access, then click **I've authorised access**.

Each extension is independent. API authorisation must be performed separately for each extension because Chrome isolates extension storage.

## Export workflow

1. Choose a **List** or **Tag**, or tick **Or source = Selected RTM task** to export exactly one checked task in the chosen RTM browser tab.
2. Optionally include nested subtasks and completed tasks.
3. Tick and drag fields to arrange the export columns.
4. Select CSV or TSV and click **Preview**.
5. Copy tab-delimited text to the clipboard or download a CSV/TSV file.

Preview shows up to 10 rows. Clipboard and file actions contain the complete prepared export.

The hierarchy field expands to `Task`, `Subtask 1`, `Subtask 2`, etc. according to the maximum depth actually included. One task occupies each row. For tag exports, tagged tasks are starting points and their untagged descendants are included when subtasks are enabled.

Notes are combined in one cell with titles and separators. Multiline fields use quoted CSV/TSV escaping. Spreadsheet formula-looking values are prefixed with an apostrophe to reduce formula-injection risk. This protection intentionally modifies the exported representation, not the original RTM data.

## Important limitations

- **Selected RTM task is experimental.** The extension requires exactly one checked task in a chosen RTM tab and looks up its title through the read-only RTM API. Multiple checked tasks are rejected. Title extraction and matching still require live RTM verification. Ambiguous or missing matches stop the export.
- **Original sibling order** follows task ordering in the RTM API response. Whether it matches drag-and-drop order in all RTM views needs live verification.
- **Completed history** is available only to the extent returned by RTM's API and its filters. Completed and incomplete tasks are fetched separately for each regular list.
- **RTM Smart Lists** aren't separate physical lists. Export a regular list, a tag, or one checked task instead.
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

## Feedback fixes (20 November 2026)

- Exported due, start, created, modified and completed dates are formatted as UK day/month/year dates using the Europe/London timezone. Time portions are intentionally omitted.
- Tag, all-task and selected-task previews attempt a single account-wide filtered request per status. If this fails, the extension falls back to sequential list retrieval. A single-list export uses only that list.
- The optional **Hierarchy level (0 = root)** field contains a number, not another visible indentation. Task, Subtask 1 and Subtask 2 columns remain the primary hierarchy display.
- RTM notes are read from each task series' notes array, including the documented JSON `content` field. When Notes is selected, the preview summary shows how many notes RTM returned, helping diagnose unexpectedly empty exports. This needs checking against a live task known to have notes.
- Priority `N` is presented as `None`.

These changes have synthetic regression coverage but have not yet been confirmed in Excel, Google Sheets or the user's RTM account.

## Version 0.1.2: selected RTM tab

The source dropdown now hides the List/Tag selector when **Selected RTM tasks** or **All tasks** is chosen. The CSS now respects HTML's hidden attribute on flex labels.

For **Selected RTM tasks**, explicitly choose the open RTM browser tab from the new dropdown, then select **Preview**. **Refresh tabs** updates the list if RTM was opened afterwards. No tab is chosen automatically, even if only one is open. The selection is read from the chosen tab at preview time.

Selection detection is still experimental: the extension needs RTM to expose its selected task IDs in recognisable DOM attributes. If that cannot be established, the exporter fails visibly rather than choosing arbitrary tasks.

## Version 0.1.3: diagnose selected tasks

RTM's visible checked rows do not expose the `data-task-id` values assumed by the initial experimental selection detector. When selected-task Preview fails, choose the relevant RTM tab and click **Inspect selection**, then **Copy diagnostic**. The report lists checkbox/selection element counts, tag names, CSS class names and attribute names for a small number of representative elements and ancestors. It excludes task names and attribute values. Share the diagnostic with the developer so the detection can be corrected from actual RTM markup instead of guessed selectors.

This update diagnoses the issue but does not yet claim that selected-task export works. List, tag and all-task export functionality is unchanged.

## Version 0.1.5: selected-task matching

The 0.1.4 diagnostic confirmed that RTM's selected tasks have a checked custom checkbox inside a `role="option"` row, but no API task ID appears in that DOM structure. This release reads those rows from the explicitly chosen RTM tab and matches their task titles to the authenticated RTM API response. An export is refused if any row has no unique match, including duplicate titles or ambiguous names. Task content is processed locally, and no task data is sent to external services besides the existing authorised RTM API requests.

**Known limitation:** Exact selected-task matching has synthetic tests but is not yet live-verified. It requires the checked row's text to contain a distinct API task title. If RTM structures a title differently or multiple API tasks share the name, the extension reports a matching error rather than exporting an arbitrary task. It still fetches the relevant account task data to resolve selected rows, which may be slower than a list export.

## Version 0.2.0: scoped selected-task requests

The Selected RTM tasks mode no longer queries all tasks in the RTM account. It issues filtered `name:"..."` searches based on individual checked-row text and then resolves exact names locally. When Include nested subtasks is on, full task trees are retrieved only for the lists containing matched tasks. Transient HTTP 502 responses are retried once by the existing read-only API client. Row text extraction remains dependent on RTM's live DOM and requires user verification.

## Experimental branch: single selected root (0.2.1)

This branch deliberately removes the **All tasks** source and the ability to select multiple RTM root tasks. The available sources are **List**, **Tag**, and **Selected RTM task**. For the selected-task source, exactly one task must be checked in the chosen RTM tab. Its descendants are still exported recursively when **Include nested subtasks** is enabled. Completed tasks remain controlled by the existing checkbox.

The list and tag sources can still export several tasks because those sources represent groups. This branch has not been merged into main. The selected-task title extraction uses the current experimental approach and is not claimed as verified against the live RTM browser interface. The read-only API does not provide an endpoint for asking which checkbox is selected in the web app.

## Selected RTM task checkbox (experimental 0.2.2)

The Source dropdown contains **List** and **Tag** only. Beneath it, a separate **Or source = Selected RTM task** checkbox makes a single checked RTM task the export source. When checked, the List/Tag controls are hidden and the RTM browser tab selector is shown. Unchecking restores the previous List/Tag choice. This setting is saved between uses. **Include nested subtasks** and **Include completed tasks** remain available for all three source modes. A previous saved `scope: selected` setting is migrated to the new checkbox on first load.

## Configurable date formats

Use **3. Format → Date format** to choose DD/MM/YYYY (UK), MM/DD/YYYY (US), YYYY-MM-DD (ISO 8601) or DD.MM.YYYY (European). The selection applies to due, start, completed, created and modified dates in both clipboard and downloaded exports. New installations use the browser's regional convention where recognised, otherwise ISO. Existing installations keep the former UK convention until the date setting is changed. Date-only fields are not timezone-shifted, and timestamp fields use the browser's local timezone.
