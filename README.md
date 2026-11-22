# RTM Chrome Tools

A collection of small Google Chrome extensions for [Remember The Milk](https://www.rememberthemilk.com/).

Each extension lives in its own folder and can be installed independently. The repository also includes a generic Chrome extension starter.

## Extensions

| Extension | Description |
| --- | --- |
| [RTM Chrome Tools starter](projects/rtm-chrome-tools/) | Initial working test popup. Does not connect to RTM or change tasks. |
| [Tag & List Relationships](projects/tag-list-relationships/) | Read-only RTM lists and tags dashboard (initial version). |
| [RTM Export Builder](projects/export-builder/README.md) | Read-only List, Tag or single selected-task export to CSV/TSV, with nested subtasks and configurable date formats. |

## Reusable skeleton

[Basic Chrome Extension](archive/base-chrome-extension/) is a generic starter for other projects, including projects unrelated to RTM.

## Installing an extension

1. Download or clone the repository.
2. Open `chrome://extensions` in Google Chrome and enable **Developer mode**.
3. Select **Load unpacked**.
4. Select the folder of the extension you want to install, containing its own `manifest.json` (for the RTM starter: `projects/rtm-chrome-tools`).

For complete RTM Export Builder download, API setup and operating instructions, see **[RTM Export Builder: Installation and User Guide](projects/export-builder/README.md)**. Its folder can also be downloaded separately using [Download GitHub Directory](https://download-directory.github.io/).

## Licence

MIT. See [LICENSE](LICENSE).
