# Export Builder: developer notes

This file describes the current code in `projects/export-builder`. It is a maintenance reference, not a claim that all features have been verified against live RTM data.

## Files and responsibilities

| File | Responsibility |
| --- | --- |
| `manifest.json` | Chrome Manifest V3 permissions and extension entry point |
| `popup.html`, `popup.js` | Open the export interface in a normal Chrome tab |
| `export.html`, `export.css` | Export form, field chooser, diagnostics and table preview |
| `export.js` | UI state, browser selection, RTM data normalisation, hierarchy and export formatting |
| `rtm.js` | Signed, read-only RTM API client, synced from `shared/rtm.js` |
| `md5.js` | Hash helper used for RTM API signatures, synced from `shared/md5.js` |

Code is procedural JavaScript. Each function has a discrete job. The exporter does not require React or a build tool.

## Export data flow

1. `sourceMode()` returns `list`, `tag` or `selected`. The **Selected RTM task** checkbox overrides, but does not change, the List/Tag dropdown.
2. `retrieve(auth)` requests relevant RTM data. It does not modify tasks. When the selected-task source is active, exactly one task must be checked in the chosen RTM browser tab.
3. `normaliseResponse(response, names)` flattens the API's list, task-series and task-instance levels into records.
4. `selectRows(records)` chooses roots according to the source, optionally traversing nested subtasks to any depth.
5. `headersAndValues(rows)` expands the chosen field order. The hierarchy field creates Task, Subtask 1, Subtask 2, etc.
6. `serialise()` produces CSV or TSV. `renderPreview()` renders up to ten rows, while `state.output` keeps the complete export.

## Task identity

RTM data is organised as **list > task series > task instance**.

- The normalised `key` is `listId:seriesId:taskId`.
- `parentId` is interpreted **within the same list**.
- A task title is not a unique identifier. It may be shared by recurring instances and unrelated tasks.
- A visited set prevents double export when an ancestor and descendant are both matched by a tag.
- The recursive walker preserves the order of records returned by RTM. The order may differ from the ordering shown in some RTM views.

Do not replace the composite `key` with `taskId` alone, or attach a child to a parent from a different list.

## Selected task: known limitation

There is no API endpoint that returns which checkbox is ticked in an open RTM web browser tab. `selectedTaskRows()` inspects the user-chosen RTM tab through `chrome.scripting.executeScript`. The inspected `role="option"` row does not expose a verified RTM task ID.

The exporter currently uses the longest visible direct-text fragment as a `name:` API search **hint**. This is not a verified task-title selector. The subsequent matching routine checks exact fragments and rejects an ambiguous result. The heuristic can still fail to find a task if the chosen hint was not its title.

The **Inspect selection** diagnostic can include private task titles in candidate fragments. It must not transmit them automatically, and the user should review the diagnostic before sharing it.

Exactly one checked task is allowed in selected mode. **Include nested subtasks** controls whether its descendants are included. Completed-task inclusion is controlled separately. Never silently ignore extra checked tasks or choose an ambiguous task.

## API behaviour and failures

`rtm.js` signs HTTPS POST calls to the official RTM REST API. Authorisation requests read-only permissions. `rtm.tasks.getList`, `rtm.lists.getList` and `rtm.tags.getList` are retried once on HTTP 502. Repeated failure aborts the operation.

List mode fetches the chosen list. Tag mode fetches matching tasks and, when needed, the lists containing those tasks for untagged descendants. Selected mode performs one name-filtered search per requested status, then fetches the selected task's list if nested subtasks are requested.

Keep the API client in `shared/rtm.js` synchronised with each standalone extension by running:

```sh
node scripts/sync-rtm-auth.mjs
```

Never log API secrets or the user's access token.

## Export safety

- Task data is processed locally after the RTM read-only API request.
- `safeCell()` prefixes formula-like spreadsheet values with a literal apostrophe. This intentionally changes the exported representation, not the original task.
- `serialise()` quotes delimiters and newlines. Both CSV and TSV are exported with CRLF row endings.
- Date output uses the Europe/London calendar day and British DD/MM/YYYY formatting.
- The copy action always uses TSV, while the download action uses the chosen file format.
- The preview may truncate display text. Copy and Download use the complete prepared table.

## Tests and release checks

From the repository root, run:

```sh
node --test tests/export-builder.test.mjs tests/export-builder-api.test.mjs
```

GitHub Actions runs the same tests on changes to the exporter. These tests use synthetic RTM data and mocked browser/API responses. They cannot prove the title selector works with live RTM HTML.

Before merging changes, review that List/Tag exports still work, exactly one selected task can be exported with and without nested subtasks, duplicate names are rejected, notes and dates are represented correctly, and no task-changing RTM method has been added. Record live browser checks separately from automated tests.
