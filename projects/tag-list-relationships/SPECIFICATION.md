# Tag & List Relationships: Specification

**Status:** Agreed baseline, 19 November 2026.

## Purpose

Tag & List Relationships is a Chrome extension for examining and improving the organisation of Remember The Milk (RTM) tags and regular lists. It identifies unused or rarely used tags, overlapping tag names, inconsistent tag/list relationships, empty lists and untagged tasks. Users must be able to understand how their tasks are distributed without having to write MilkScript or edit configuration files. The extension uses the official RTM API, opens in a full browser tab and keeps the interface understandable to non-programmers.

## Analysis and reporting

Display all non-deleted regular lists and tags alphabetically. Smart Lists are saved searches and are not included in the regular list view. Show separate incomplete and completed task counts where the API provides reliable data. Include task instances and subtasks at any level, avoiding double counting by their API identifiers. Read data sequentially by list instead of downloading the entire account in one response. Show progress, preserve successful results when individual requests fail, and mark unknown or partial totals explicitly. A zero count must mean that the relevant data was actually checked.

Show potentially redundant tags, including tags used by only one task, similar names such as `flat`, `flat-1` and `flat-2`, tasks with no tag, and empty lists. Show which lists contain tasks with a particular tag, including tags used exclusively within a single list. These are suggestions, never automatic decisions. Selecting a list or tag should display the underlying task names and useful details, with links to RTM where a dependable link is available. Completed tasks and deeply nested subtasks must not be silently omitted.

## Consolidation (future stage)

Support merging source tags into a destination tag, removing tags from selected tasks or list scopes, and moving selected tasks from a tag to a regular list. Include completed tasks only when explicitly selected. Preserve completion state, hierarchy, due dates, notes, URLs, priorities, recurrence and unrelated tags. Show all affected tasks, out-of-scope uses and possible conflicts before making changes. The required process is **Select → Preview → Confirm → Apply**. Record every attempted change and report partial failures. Never imply an undo is possible unless the operation has an established reversal procedure.

## Usability, reliability and maintenance

The application should require no configuration files, commands or technical knowledge beyond first-time RTM authorisation. Provide searchable, clear lists, task counts, meaningful progress and understandable error messages. Do not request or store more RTM permissions than needed. Prefer reliability and accurate results over speed. Use plain HTML, CSS and JavaScript, small functions, few dependencies and explicit comments. Reuse established authentication code where practical. Keep a public README, separate development rules, version history and Git commits. Test a representative account and difficult cases before declaring a release stable.

## Delivery stages

1. **Read-only analysis:** counts, task inspection, relationships, suggestions, progress and partial failure reporting.
2. **Controlled consolidation:** operations with preview, explicit approval, verification and audit.
3. **Refinement:** remembered exclusions, export and audit history, usability improvements and public release.

This specification describes the intended finished tool. Individual releases may implement only part of it, and must state their limitations accurately. The specification is changed only deliberately, not as a side effect of bug fixes.
