# RTM Export Builder

**Version 0.2.4** | Chrome extension | Read-only Remember The Milk exports | CSV and TSV

RTM Export Builder exports tasks from [Remember The Milk](https://www.rememberthemilk.com/) into spreadsheet-friendly files. You can export one list, all tasks carrying a particular tag, or **one selected RTM task together with its nested subtasks**.

The extension runs locally in Google Chrome and uses the official Remember The Milk API with **read-only permission**. It does not add, complete, move, delete or otherwise modify RTM tasks.

## Contents

1. [Download the extension from GitHub](#1-download-the-extension-from-github)
2. [Install the extension in Google Chrome](#2-install-the-extension-in-google-chrome)
3. [Obtain an RTM API key and connect your account](#3-obtain-an-rtm-api-key-and-connect-your-account)
4. [Using RTM Export Builder](#4-using-rtm-export-builder)
5. [Update or remove the extension](#5-update-or-remove-the-extension)
6. [Troubleshooting](#6-troubleshooting)
7. [Privacy, permissions and limitations](#7-privacy-permissions-and-limitations)
8. [Developer information](#8-developer-information)

## Before you begin

You need:

- Google Chrome on a desktop or laptop.
- A Remember The Milk account.
- An **RTM API key and shared secret**, which you can request from Remember The Milk.
- A local folder where you can keep the downloaded extension files.

**Important:** This is an **unpacked extension**, not a Chrome Web Store installation. Chrome loads it from the folder on your computer. **Do not delete or move that folder after installation.** Updates are manual.

## 1. Download the extension from GitHub

### Recommended: download only the Export Builder folder

GitHub displays individual project folders but does not provide a normal **Download ZIP** button for each folder. You can download just the extension files using [Download GitHub Directory](https://download-directory.github.io/).

1. Open the **[RTM Export Builder folder on GitHub](https://github.com/jcamp/rtm-chrome-tools/tree/main/projects/export-builder)**.
2. Copy the complete GitHub folder URL from Chrome's address bar:

   ```text
   https://github.com/jcamp/rtm-chrome-tools/tree/main/projects/export-builder
   ```

3. Open **[download-directory.github.io](https://download-directory.github.io/)** in another browser tab.
4. Paste the GitHub folder URL into the box labelled **Paste GitHub.com folder URL**, then press **Enter**.
5. Save the resulting ZIP file. The downloader's interface may change or request a GitHub token. **Do not enter your RTM API key or RTM shared secret into this website.** If you do not want to give a third-party downloader a GitHub token, use the full-repository method below instead.
6. **Extract** the ZIP file to a permanent location, for example `Documents/Chrome Extensions/RTM Export Builder/`.
7. Open the extracted folder and make sure it contains **`manifest.json`**, **`export.html`**, **`export.js`**, **`rtm.js`** and **`md5.js`**.

You need the actual extracted folder containing `manifest.json`, not the ZIP file itself or a folder above it.

### Alternative: download the whole repository

This avoids the third-party folder downloader.

1. Open [github.com/jcamp/rtm-chrome-tools](https://github.com/jcamp/rtm-chrome-tools).
2. Select **Code → Download ZIP**.
3. Extract the downloaded repository ZIP.
4. Open **`projects/export-builder/`** within the extracted repository.
5. Keep the extracted repository at a permanent location. You will select its `projects/export-builder/` folder in Chrome.

You can also clone the repository with Git if you are familiar with Git.

## 2. Install the extension in Google Chrome

1. Open a new Chrome tab and enter **`chrome://extensions`** in the address bar.
2. Turn on **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Browse to the downloaded **`export-builder`** folder containing `manifest.json`, and select that folder.
5. Check that **RTM Export Builder** now appears on Chrome's Extensions page. The displayed version should match the version in the downloaded `manifest.json`.
6. Optional: click Chrome's **Extensions** (puzzle-piece) icon and **pin** RTM Export Builder to the toolbar.

To open the utility, click the extension icon and then **Open Export Builder**. The full interface opens in a separate tab so that you can move between RTM and the exporter.

If Chrome reports that the manifest is missing, you have selected the wrong folder or have not extracted the ZIP file.

Chrome's official instructions: [Load an unpacked extension](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).

## 3. Obtain an RTM API key and connect your account

### A. Request your RTM API credentials

RTM Export Builder requires **two separate values**:

- **API key**, which identifies an RTM API application.
- **Shared secret**, which is used to sign requests to the RTM API.

These are **not** your RTM username and password.

1. Sign in to your Remember The Milk account in Chrome.
2. Open the official **[Remember The Milk API Keys page](https://www.rememberthemilk.com/services/api/keys.rtm)**.
3. Select **Apply for a non-commercial API key** if your intended use meets RTM's non-commercial criteria. RTM provides separate information for commercial use.
4. Follow RTM's application instructions. You may need to wait for a key to be issued.
5. Keep the **API key** and **shared secret** private. If you already have a suitable RTM API key and shared secret, you can use those.

See also the official [RTM API authentication documentation](https://www.rememberthemilk.com/services/api/authentication.rtm).

### B. Authorise Export Builder

1. Click the **RTM Export Builder** extension icon and choose **Open Export Builder**.
2. Under **Connect to RTM**, paste your **API key** and **Shared secret** into their corresponding fields.
3. Click **Authorise in RTM**.
4. A new RTM authorisation tab opens. Sign in if necessary and **approve read-only access**.
5. Return to the **Export Builder** tab. Click **I've authorised access**.
6. After successful authorisation, the extension displays **Connected as** followed by your RTM username.

The authorisation request uses RTM's **read** permission, not write or delete. The credentials and access token are held in Chrome extension storage on your computer. The exporter does not ask for your RTM account password.

If you disconnect, click **Disconnect** at the top of the exporter. This removes the locally stored API key, shared secret and access token. To reconnect, repeat the authorisation steps. Disconnecting does not necessarily revoke the token on RTM's servers.

Each independently installed extension has its own Chrome storage and requires its own authorisation.

## 4. Using RTM Export Builder

The interface has four numbered sections. Work through them in order.

### Step 1: Select tasks

Choose **one** of the following sources.

#### Option A: Export a list

1. Leave **Or source = Selected RTM task** **unticked**.
2. Set **Source** to **List**.
3. Choose the required list from **List or tag**.
4. Decide whether to include nested subtasks and completed tasks.

This option exports tasks in the chosen regular RTM list. RTM **Smart Lists** are saved searches rather than separate physical lists and are not offered as list sources.

#### Option B: Export tasks carrying a tag

1. Leave **Or source = Selected RTM task** **unticked**.
2. Set **Source** to **Tag**.
3. Choose the required tag from **List or tag**.
4. Choose whether to include nested subtasks and completed tasks.

The exporter starts from tasks matching that tag. If **Include nested subtasks** is selected, it also includes their descendants even when those subtasks do not themselves carry the tag.

#### Option C: Export one selected RTM task

This is useful when a parent task is effectively a project containing subtasks, including subtasks nested several levels deep.

1. Open Remember The Milk in a normal Chrome tab.
2. Find the **single task** you want to export and tick its selection checkbox in RTM.
3. Make sure **no other RTM task is checked** in that view.
4. Switch to RTM Export Builder and tick **Or source = Selected RTM task**. The List/Tag dropdowns remain visible but are disabled.
5. Under **RTM browser tab**, select the RTM tab containing that selected task. If it is not listed, click **Refresh tabs**.
6. Choose **Include nested subtasks** to export the task and all its descendants. Leave it unticked to export only the selected task.
7. Set **Include completed tasks** as required, then continue to **Preview**.

**Only one checked RTM task is supported.** Choosing a parent does not count its subtasks as separately selected unless you actually tick them in RTM.

The extension reads the selected checkbox from the RTM browser tab, then matches the task to RTM API data. If it cannot resolve the title uniquely, it stops rather than exporting a guessed task. This matching depends on RTM's web interface and remains an experimental part of the extension.

#### Common source options

- **Include nested subtasks:** Walk down through each level of the selected parents' subtask hierarchy. The export creates `Task`, `Subtask 1`, `Subtask 2` and further columns as needed.
- **Include completed tasks:** Request completed records as well as incomplete records. Availability of older completed data is subject to RTM's API response.

Both options apply to List, Tag and Selected RTM task modes. Changes to source options invalidate any previously prepared export. Click **Preview** again after changing them.

### Step 2: Choose fields and column order

In **2. Fields and order**, select the information you want in the output.

- Tick a field's checkbox to include it, or untick it to omit it.
- Drag the **handle** beside a field to change the column order.
- Click **Select all** to enable every available field.
- Click **Defaults** to restore the default field selection and ordering.

Available fields include task hierarchy, list, due date, priority, status, tags, start date, completed date, created/modified dates, estimate, location ID, postponed count, recurrence, notes, note count, URL, task ID, parent task ID and hierarchy level.

**Task hierarchy** expands automatically to one column per nesting depth. The separate **Hierarchy level (0 = root)** field is numeric.

If you need note text in your export, tick **Notes**. The **Note count** field gives the number of notes returned by RTM for each record.

### Step 3: Choose format

Under **3. Format**:

- **Download format:** Choose **Tab-delimited (TSV)** or **Comma-delimited (CSV)**.
- **Date format:** Choose **DD/MM/YYYY (UK)**, **MM/DD/YYYY (US)**, **YYYY-MM-DD (ISO 8601)** or **DD.MM.YYYY (European)**.

The date setting applies to **due, start, completed, created and modified** date fields. Date-only values retain their calendar day. Timestamp values use your browser's local timezone, and times are not included in the export.

New installations initially choose a date convention based on the browser's region where recognised, otherwise ISO. Existing users without a saved date-format preference keep the former UK convention until they change it.

### Step 4: Preview and export

1. Click **Preview**. The exporter retrieves the requested data using the RTM API and creates a spreadsheet-style table.
2. Review the table and status message. It shows **up to 10 rows** for convenience, regardless of how many rows the full export contains.
3. To copy, click **Copy TSV**. This copies the **entire export**, including column headings, as tab-separated text to the clipboard. Paste it into Excel or Google Sheets.
4. To save a file, click **Download**. Chrome downloads the **entire export** in the CSV or TSV format chosen above.

Downloaded filenames follow a pattern such as `rtm-export-2026-11-22.csv`.

**Copy TSV always uses TSV**, even when the download format is CSV. Both operations include all prepared rows, not just the first ten shown in Preview.

CSV/TSV quotation preserves commas, tabs and multiline notes. To reduce spreadsheet formula risks, values beginning with formula-like characters are prefixed with an apostrophe. This changes the exported representation, **not the underlying RTM task**.

### Preferences

The extension remembers the source selection, selected-task override, subtask and completed-task options, field selection/order, download format and date format.

After changing an option, run **Preview** again before copying or downloading.

## 5. Update or remove the extension

### Update

Unpacked Chrome extensions **do not update automatically from GitHub**.

1. Download the latest **`projects/export-builder`** folder using the method in [Section 1](#1-download-the-extension-from-github).
2. Extract the new files and replace the contents of your **existing installed extension folder**. Keep the same folder location.
3. Open **`chrome://extensions`**.
4. Find RTM Export Builder and click its **Reload** button.
5. Close any old Export Builder tabs and open it again from the extension icon.
6. Confirm the displayed version on Chrome's Extensions page matches the newly downloaded `manifest.json`.

Normally there is no need to reauthorise when the same installed extension and storage are preserved. If you remove and reinstall it, or change its extension identity, you may need to authorise again.

**Do not select Load unpacked again just to update the existing extension.** Replace the files in the installed folder, then use Reload.

### Remove

Open **`chrome://extensions`**, locate **RTM Export Builder** and select **Remove**. You can then delete its downloaded folder if you no longer need it. Removal clears the extension's Chrome-stored data.

## 6. Troubleshooting

| Problem | What to check |
| --- | --- |
| Chrome says the manifest is missing | Extract the ZIP and select the folder containing `manifest.json`, not the ZIP or repository root. |
| Extension still shows the previous version | Replace the files in the **installed** folder, use **Reload** in `chrome://extensions`, then open a fresh Export Builder tab. |
| No connected account is shown | Enter the correct API key and shared secret, authorise access in the RTM tab, then click **I've authorised access** back in the exporter. |
| A selected RTM task cannot be found | Make sure exactly **one** task is checked, select the correct RTM browser tab, and use **Refresh tabs** if necessary. |
| Selected task has no matching title | The RTM interface may be displaying the title differently, or multiple API tasks may have the same title. The exporter refuses ambiguous matches. Try a List or Tag export instead. |
| HTTP 502 from RTM | This is an RTM API/server response. The client retries once for supported read-only retrieval methods. Retry later, or try a smaller list or tag. |
| Export appears to have no notes | Tick **Notes** in the field chooser and inspect a task that actually has notes in RTM. The Preview status reports the number of notes returned. |
| Only ten tasks appear | The Preview is limited to ten rows. **Copy TSV** and **Download** use the complete prepared export. |
| Dates look wrong | Check **3. Format → Date format**, and remember timestamps use the browser's local timezone. |
| Copy/Download is disabled | Click **Preview** after changing options. The full export must prepare successfully first. |

For a selected-task identification issue, **Inspect selection** creates a diagnostic, and **Copy diagnostic** can copy it. The diagnostic may include **task names or other private text**. Review it carefully before sharing it with anyone.

## 7. Privacy, permissions and limitations

- The extension requests **read-only RTM authorisation**. It contains no workflow to modify RTM tasks.
- The API key, shared secret and authorisation token are held in local Chrome extension storage, not published to GitHub. Chrome's local extension storage is **not a dedicated secrets vault**.
- The API calls necessarily send authorised search and retrieval parameters to Remember The Milk. Export data is then processed locally in the browser.
- Task data and notes may be sensitive. Keep exported CSV/TSV files and diagnostics private.
- The selected-task feature relies on RTM's web page layout and can stop working if RTM changes its interface.
- Duplicate task titles and recurring instances can make selected-task matching ambiguous. The exporter stops rather than deliberately choosing an arbitrary result.
- Task ordering generally follows RTM API response order. It is not guaranteed to match every RTM view's manual sort order.
- The availability of completed history and certain fields depends on what RTM returns.
- This is an independently developed utility, **not endorsed or certified by Remember The Milk**.

## 8. Developer information

The extension uses plain JavaScript, HTML and CSS. No frameworks, build tools or package installation are needed to run it.

For code architecture, task-series identity, API failure handling, comments and regression tests, see **[DEVELOPMENT.md](DEVELOPMENT.md)**.

From the repository root, run the Node.js regression tests:

```sh
node --test tests/export-builder.test.mjs tests/export-builder-api.test.mjs
```

The source RTM client is kept in `shared/rtm.js` and synchronised into standalone extension folders with `node scripts/sync-rtm-auth.mjs`.

Licence: [MIT](../../LICENSE).
