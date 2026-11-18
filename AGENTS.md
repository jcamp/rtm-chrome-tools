# Development rules

This repository is intentionally small. Keep it that way.

## Code

- Use plain JavaScript, HTML and CSS.
- Do not add React, TypeScript, a bundler, npm, or third-party libraries without a clear requirement.
- Use functions rather than classes and keep functions short.
- Add comments explaining anything that is not obvious.
- Keep UI simple and accessible.
- Ask for the minimum Chrome permissions necessary.
- Use `textContent` for untrusted text, not `innerHTML`.

## RTM safety

- Do not store credentials in tracked files.
- Start new RTM features as read-only.
- For writes, provide a dry-run preview, confirmation and useful error reporting.
- Do not assume the RTM API supports an operation without checking its documentation.
- Do not silently skip failures or repeat non-idempotent requests.

## Changes

- Make only requested changes. Do not rewrite working code unnecessarily.
- Update README.md when functionality or installation steps change.
- Increase the manifest version for a released update.
- Test the popup manually in Chrome after each change.
- Keep commits small and give each a descriptive message.
