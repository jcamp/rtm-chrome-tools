# RTM Export Builder audit (21 November 2026)

Status: **audit branch only, not ready to merge or release**.

The review covers the exporter UI, RTM API wrapper, selection processing, task hierarchy and CSV/TSV generation. No RTM tasks were modified and no live account credentials were used.

## Verified from code and reproduced by tests

1. **Task identity was under-specified.** Export mode `selected` matched by `task.id` alone. RTM's documented identity consists of `list_id`, `taskseries_id` and `task_id`. A second API record with the same task ID could be exported unintentionally. The audit branch now matches full composite keys.
2. **Hierarchy could attach across unrelated lists.** The original child index used the parent task ID without list context. The audit branch scopes child-to-parent links to the same RTM list.
3. **Selected root task order was lost.** The original `selectRows` iterated API response order instead of checkbox order. The audit branch preserves the selected order.
4. **The broad account lookup was an avoidable failure mode.** v0.2.0 uses `name:` filters instead of an all-account request for checked tasks, but this is only a partial solution (see below).
5. **The API wrapper retries a 502 once.** Both the successful second attempt and a repeated 502 were reproduced against a mocked client. A persistent 502 must be shown to the user rather than silently returning a partial export.
6. **Read-only request behaviour** is supported by the set of API calls made by the exporter. The wrapper can technically call other methods, but the extension requests read-only RTM permissions, and no task-changing method is invoked by the exporter.

## Still unverified: do not claim selected-task export is complete

1. **Unique task title extraction from the actual RTM page.** The supplied diagnostics show checked custom checkboxes nested in `role="option"` rows. They do *not* identify the specific title element. v0.2.0 selects the longest direct text fragment for its `name:` API search. A date, tag or other label could be chosen instead. A unique title in the user's screenshot does not prove this fragment is extracted correctly.
2. **Search semantics.** Official RTM documentation confirms `name:` searches *containing* text or phrases rather than unique exact task identifiers. The extension must verify each returned API candidate against the actual selected row and must never treat `name:` as a unique ID.
3. **Duplicate task names and recurrence.** Identical titles across unrelated lists and recurring instances remain possible. Choosing the only incomplete instance is not proof it is the selected one in every view.
4. **Actual nested-subtask response scope.** Filtered searches may omit descendants. The extension separately fetches matching lists, but must be checked against real completed and incomplete hierarchies.
5. **Notes and complex fields.** Parser unit tests cover synthetic note formats only. Actual RTM note presence, field coverage and dates need live fixture comparison.
6. **Transient server errors and performance.** Mock tests cannot reproduce real RTM API gateway behaviour or actual response sizes.
7. **Download/clipboard spreadsheet behaviour.** A browser-level test in Chrome, Google Sheets and Excel is needed before final release.

## Regression checks

- Parent > child > grandchild expands to separate columns, and parent/child selection does not double-count descendants.
- Exported dates format in British calendar order; CSV quotes and newline escaping are checked.
- Formula-looking spreadsheet input is text-protected.
- Multi-selection title matching refuses incomplete or ambiguous matches.
- Cross-list task identity and parent collisions are covered.
- Selected root ordering is covered.
- Scoped name API requests and propagating 502 errors are covered through mocks.
- The signed API client has retry-limit tests.

The existing test suite and audit-branch additions were exercised in a V8 test harness: **18/18 exporter tests passed**. The API retry client was separately exercised with mocked responses. GitHub Actions is configured to run the actual Node tests on branch pushes and pull requests. CI results and live Chrome/RTM tests must be checked before merging.

## Next engineering decision

Do not add more title-matching heuristics. First confirm a trustworthy title element or task identity in the selected RTM DOM using an opt-in, privacy-conscious targeted inspection. If no stable identifier is available, the interface should offer explicit disambiguation for any duplicate API candidate. A full browser-based integration pass is required before shipping another numbered release.

The published `main` branch remains at **0.2.0 experimental**. This branch intentionally does not bump the manifest version.
