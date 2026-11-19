# Development rules

Keep this tool simple, practical and well documented.

- Use plain HTML, CSS and JavaScript. No React, classes, build tools or unnecessary dependencies.
- Use short functions with clear names and comments where behaviour is not obvious.
- Keep the interface usable without editing configuration files.
- Use `textContent`, not `innerHTML`, for data received from RTM.
- Do not add write permissions or modify RTM tasks without a separate, explicit requirement.
- Any future modification feature must have a preview, confirmation, error reporting and audit record.
- Keep API credentials out of tracked files.
- Update this project's README whenever behaviour, permissions or installation changes.
- Make small commits with meaningful messages and test manually in Chrome.
