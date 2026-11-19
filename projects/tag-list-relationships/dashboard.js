// Read-only RTM analysis. Fast initial scan, with a reliable per-list fallback.
import {
  startAuthorisation, finishAuthorisation, getLists, getTags,
  getTasksForList, getAllIncompleteTasks
} from './rtm.js';
import { analyse, tasksFromResponse } from './analysis.js';

const el = id => document.getElementById(id);
const state = {
  lists: [], tags: [], tasks: [], failures: [],
  selected: null, completed: false, running: false,
  sort: { field: 'name', descending: false },
  overviewSort: {
    list: { field: 'name', descending: false },
    tag: { field: 'name', descending: false }
  }
};

function status(message) {
  el('status').textContent = message;
}

async function settings() {
  return chrome.storage.local.get(['apiKey', 'secret', 'token', 'username']);
}

async function pendingConnection() {
  const data = await chrome.storage.session.get('pendingConnection');
  return data.pendingConnection || null;
}

function showConnection(data) {
  const connected = Boolean(data.apiKey && data.secret && data.token);
  el('setup').hidden = connected;
  el('connected').hidden = !connected;
  el('username').textContent = data.username || 'RTM user';
}

function node(tag, content) {
  const element = document.createElement(tag);
  element.textContent = String(content);
  return element;
}

function clear(id) {
  el(id).replaceChildren();
}

function renderTable(id, rows) {
  const table = el(id);
  table.replaceChildren();
  for (const item of rows) {
    const tr = document.createElement('tr');
    for (const value of item.values) tr.append(node('td', value));
    if (item.select) {
      tr.dataset.key = item.select;
      tr.tabIndex = 0;
      tr.setAttribute('role', 'button');
      tr.addEventListener('click', () => select(item.select));
      tr.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          select(item.select);
        }
      });
    }
    table.append(tr);
  }
}

// The two overview tables have independent sort selections.
// Unknown or unscanned counts always remain at the end.
function sortOverviewRows(rows, type) {
  const { field, descending } = state.overviewSort[type];
  return rows.sort((a, b) => {
    const left = field === 'name' ? a.name : a[field];
    const right = field === 'name' ? b.name : b[field];
    if (left == null || right == null) {
      if (left == null && right == null) return a.name.localeCompare(b.name, 'en-GB');
      return left == null ? 1 : -1;
    }
    const comparison = field === 'name'
      ? String(left).localeCompare(String(right), 'en-GB', { numeric: true })
      : Number(left) - Number(right);
    return (descending ? -1 : 1) * comparison ||
      a.name.localeCompare(b.name, 'en-GB', { numeric: true });
  });
}

function updateOverviewHeaders() {
  const titles = { name: { list: 'List', tag: 'Tag' }, incomplete: 'Incomplete', completed: 'Completed' };
  for (const button of document.querySelectorAll('button[data-overview-sort]')) {
    const type = button.dataset.overviewSort;
    const current = state.overviewSort[type];
    const active = button.dataset.field === current.field;
    const title = button.dataset.field === 'name' ? titles.name[type] : titles[button.dataset.field];
    button.textContent = title + (active ? (current.descending ? ' ▼' : ' ▲') : '');
    button.closest('th').setAttribute('aria-sort', active ?
      (current.descending ? 'descending' : 'ascending') : 'none');
  }
}

function renderOverview() {
  const validIncomplete = state.lists.every(list => list.loadedIncomplete);
  const validCompleted = state.lists.every(list => list.loadedCompleted);
  const results = analyse(state.lists, state.tags, state.tasks,
    validIncomplete && (!state.completed || validCompleted));

  el('listCount').textContent = state.lists.length;
  el('tagCount').textContent = state.tags.length;
  updateTargets();

  const listRows = state.lists.map(list => {
    const count = results.byList.get(String(list.id)) || { incomplete: 0, completed: 0 };
    return {
      name: list.name,
      key: 'list:' + list.id,
      incomplete: list.loadedIncomplete ? count.incomplete : null,
      completed: state.completed && list.loadedCompleted ? count.completed : null
    };
  });
  const tagRows = state.tags.map(tag => {
    const count = results.byTag.get(tag.toLowerCase()) || { incomplete: 0, completed: 0 };
    return {
      name: tag,
      key: 'tag:' + tag,
      incomplete: validIncomplete ? count.incomplete : null,
      completed: state.completed && validCompleted ? count.completed : null
    };
  });
  const completedValue = value => !state.completed ? 'not scanned' : value ?? '?';
  renderTable('lists', sortOverviewRows(listRows, 'list').map(row => ({
    select: row.key,
    values: [row.name, row.incomplete ?? '?', completedValue(row.completed)]
  })));
  renderTable('tags', sortOverviewRows(tagRows, 'tag').map(row => ({
    select: row.key,
    values: [row.name, row.incomplete ?? '?', completedValue(row.completed)]
  })));

  updateOverviewHeaders();
  renderFindings(results, validIncomplete, validCompleted);
  renderTasks();
}

function renderFindings(results, validIncomplete, validCompleted) {
  clear('suggestions');
  clear('emptyLists');

  if (!validIncomplete || (state.completed && !validCompleted)) {
    el('summary').textContent = 'Some data is unavailable. Confirmed counts remain visible. ' +
      'Full relationship findings need a successful scan of the selected statuses.';
    return;
  }

  const scope = state.completed ? 'incomplete and completed' : 'incomplete';
  el('summary').textContent = state.tasks.length + ' ' + scope + ' task instances checked. ' +
    results.untagged.length + ' untagged. Suggestions are based on ' + scope + ' tasks only.';

  // Separate categories into readable tables instead of one long bullet list.
  const groups = [
    { type: 'Similar names', columns: ['Tags to review'], values: item => [item.detail] },
    { type: 'Single-task tag', columns: ['Tag', 'Incomplete', 'Completed'], values: item => {
      const count = results.byTag.get(item.tag.toLowerCase());
      return [item.tag, count?.incomplete || 0, state.completed ? count?.completed || 0 : 'not scanned'];
    } },
    { type: 'Single-list tag', columns: ['Tag', 'List', 'Incomplete', 'Completed'], values: item => {
      const count = results.byTag.get(item.tag.toLowerCase());
      const listId = count ? [...count.lists][0] : '';
      const listName = state.lists.find(list => String(list.id) === listId)?.name || '';
      return [item.tag, listName, count?.incomplete || 0, state.completed ? count?.completed || 0 : 'not scanned'];
    } },
    { type: 'No matching tasks', columns: ['Tag'], values: item => [item.tag] }
  ];

  const headings = {
    'Similar names': 'Similar tag names',
    'Single-task tag': 'Tags used by one task',
    'Single-list tag': 'Tags used in one list',
    'No matching tasks': 'Tags without matching tasks'
  };

  const output = el('suggestions');
  let displayed = 0;
  for (const group of groups) {
    let items = results.suggestions.filter(item => item.type === group.type);
    // Similar names are already presented as a group in the detail field.
    if (group.type === 'Similar names') {
      items = items.filter((item, index, array) =>
        array.findIndex(other => other.detail === item.detail) === index);
    }
    if (!items.length) continue;

    const section = document.createElement('section');
    const heading = node('h4', headings[group.type] + ' (' + items.length + ')');
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headingRow = document.createElement('tr');
    for (const column of group.columns) headingRow.append(node('th', column));
    thead.append(headingRow);
    table.append(thead);
    const tbody = document.createElement('tbody');
    for (const item of items) {
      const row = document.createElement('tr');
      for (const value of group.values(item)) row.append(node('td', value));
      tbody.append(row);
    }
    table.append(tbody);
    section.append(heading, table);
    output.append(section);
    displayed += items.length;
  }
  if (!displayed) output.append(node('p', 'No relationships suggested.'));

  let found = false;
  for (const list of state.lists) {
    const counts = results.byList.get(String(list.id));
    if (counts && counts.incomplete === 0 && (!state.completed || counts.completed === 0)) {
      el('emptyLists').append(node('li', list.name));
      found = true;
    }
  }
  if (!found) el('emptyLists').append(node('li', 'None for the selected statuses.'));
}

// Keep the selector and the overview table selections in sync.
function selectedLabel() {
  if (!state.selected) return '';
  if (state.selected.type === 'tag') return 'Tag: ' + state.selected.value;
  const list = state.lists.find(item => String(item.id) === state.selected.value);
  return list ? 'List: ' + list.name : '';
}

function updateTargets() {
  const options = el('targetOptions');
  options.replaceChildren();
  for (const list of state.lists) {
    const option = document.createElement('option');
    option.value = 'List: ' + list.name;
    options.append(option);
  }
  for (const tag of state.tags) {
    const option = document.createElement('option');
    option.value = 'Tag: ' + tag;
    options.append(option);
  }
  el('target').value = selectedLabel();
}

// Select an exact list or tag. Bare names are accepted when unambiguous.
function chooseTarget() {
  const typed = el('target').value.trim().toLocaleLowerCase();
  if (!typed) {
    el('targetMessage').textContent = 'Choose a list or tag from the suggestions.';
    return;
  }
  const choices = [
    ...state.lists.map(item => ({ label: 'List: ' + item.name, key: 'list:' + item.id, name: item.name })),
    ...state.tags.map(tag => ({ label: 'Tag: ' + tag, key: 'tag:' + tag, name: tag }))
  ];
  const matches = choices.filter(item =>
    item.label.toLocaleLowerCase() === typed || item.name.toLocaleLowerCase() === typed
  );
  if (matches.length === 1) {
    el('targetMessage').textContent = '';
    select(matches[0].key, false);
  } else {
    el('targetMessage').textContent = matches.length > 1
      ? 'Both a list and a tag have that name. Choose the prefixed suggestion.'
      : 'No matching list or tag. Choose a suggestion from the dropdown.';
  }
}

function select(key, scroll = true) {
  const index = key.indexOf(':');
  state.selected = { type: key.slice(0, index), value: key.slice(index + 1) };
  el('target').value = selectedLabel();
  el('targetMessage').textContent = '';
  renderTasks();
  if (scroll) el('selection').scrollIntoView({ block: 'nearest' });
}

// RTM timestamps are UTC. Show the calendar date in the user's UK timezone.
// Date-only values are already calendar dates, so do not shift them.
function formatDueDate(value) {
  if (!value) return '';
  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');
    return day + '/' + month + '/' + year;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/London'
  }).format(date);
}

// Sort the currently selected tasks locally. No additional RTM requests.
function sortTasks(tasks) {
  const { field, descending } = state.sort;
  const direction = descending ? -1 : 1;

  function sortKey(task) {
    if (field === 'completed') return task.completed ? 'completed' : 'incomplete';
    if (field === 'tags') return task.tags.join(', ').toLowerCase();
    if (field === 'due') {
      const parts = formatDueDate(task.due).split('/');
      return parts.length === 3 && parts[0].length === 2 && parts[1].length === 2
        ? parts[2] + parts[1] + parts[0] : '';
    }
    return task.name.toLowerCase();
  }

  return tasks.map((task, index) => ({ task, index })).sort((a, b) => {
    const left = sortKey(a.task);
    const right = sortKey(b.task);
    // Undated tasks always appear last.
    if (field === 'due' && (!left || !right)) {
      if (!left && !right) return a.index - b.index;
      return left ? -1 : 1;
    }
    return direction * left.localeCompare(right, 'en-GB', { numeric: true }) || a.index - b.index;
  }).map(item => item.task);
}

function updateSortHeaders() {
  const titles = { name: 'Task', completed: 'Status', tags: 'Tags', due: 'Due' };
  for (const button of document.querySelectorAll('#taskTable button[data-sort]')) {
    const active = button.dataset.sort === state.sort.field;
    button.closest('th').setAttribute('aria-sort', active ?
      (state.sort.descending ? 'descending' : 'ascending') : 'none');
    button.textContent = titles[button.dataset.sort] +
      (active ? (state.sort.descending ? ' ▼' : ' ▲') : '');
  }
}

function renderTasks() {
  clear('tasks');
  updateSortHeaders();
  if (!state.selected) {
    el('selection').textContent = 'Nothing selected.';
    el('taskCount').textContent = 'Click a list or tag name above to inspect its tasks.';
    return;
  }

  const selection = state.selected;
  const filter = el('search').value.trim().toLowerCase();
  const matches = state.tasks.filter(task => {
    const belongs = selection.type === 'list'
      ? task.listId === selection.value
      : task.tags.some(tag => tag.toLowerCase() === selection.value.toLowerCase());
    return belongs && task.name.toLowerCase().includes(filter);
  });

  const names = new Map(state.lists.map(item => [String(item.id), item.name]));
  const label = selection.type === 'list' ? names.get(selection.value) || selection.value : selection.value;
  el('selection').textContent = (selection.type === 'list' ? 'List: ' : 'Tag: ') + label;
  el('taskCount').textContent = matches.length + ' matching task instances' +
    (selection.type === 'tag' ? ' (across lists)' : '') +
    (state.running ? ' (loading)' : '') +
    (state.failures.length ? ' (some requests failed)' : '');

  renderTable('tasks', sortTasks(matches).slice(0, 500).map(task => ({
    values: [
      (task.recurring ? '↻ ' : '') + task.name + (task.parentId ? ' (subtask)' : ''),
      task.completed ? 'Completed' : 'Incomplete',
      task.tags.join(', ') || '(none)',
      formatDueDate(task.due)
    ]
  })));
  if (matches.length > 500) el('taskCount').textContent += '. First 500 displayed.';
}

function addTasks(response, listId, completed) {
  const parsed = tasksFromResponse(response, listId, completed);
  const existing = new Set(state.tasks.map(task => task.key));
  for (const task of parsed) {
    if (!existing.has(task.key)) {
      state.tasks.push(task);
      existing.add(task.key);
    }
  }
}

// Complete incomplete tasks in a single filtered request where possible.
// Fall back to one list at a time only when that request fails.
async function loadIncomplete(credentials) {
  status('Loading incomplete tasks…');
  try {
    const response = await getAllIncompleteTasks(credentials);
    addTasks(response, '', false);
    for (const list of state.lists) list.loadedIncomplete = true;
    renderOverview();
    return;
  } catch (error) {
    status('Full incomplete-task request failed. Trying smaller lists individually…');
  }

  for (let i = 0; i < state.lists.length; i++) {
    const list = state.lists[i];
    status('Loading incomplete tasks: ' + (i + 1) + '/' + state.lists.length +
      ' (' + list.name + ')');
    try {
      addTasks(await getTasksForList(credentials, list.id, false), list.id, false);
      list.loadedIncomplete = true;
    } catch (error) {
      state.failures.push({ listId: String(list.id), status: 'incomplete', message: error.message });
    }
    renderOverview();
  }
}

// Completed history is optional, because large old histories can cause 502s.
async function loadCompleted(credentials) {
  for (let i = 0; i < state.lists.length; i++) {
    const list = state.lists[i];
    status('Optional completed history: ' + (i + 1) + '/' + state.lists.length +
      ' (' + list.name + ')');
    try {
      addTasks(await getTasksForList(credentials, list.id, true), list.id, true);
      list.loadedCompleted = true;
    } catch (error) {
      state.failures.push({ listId: String(list.id), status: 'completed', message: error.message });
    }
    renderOverview();
  }
}

async function refresh() {
  if (state.running) return;
  state.running = true;
  el('refresh').disabled = true;
  el('showCompleted').disabled = true;
  status('Loading list and tag names…');

  try {
    const credentials = await settings();
    // Keep independent metadata reads separate from the potentially expensive task read.
    const lists = await getLists(credentials);
    const tags = await getTags(credentials);
    state.lists = lists.sort((a, b) => a.name.localeCompare(b.name))
      .map(list => ({ ...list, loadedIncomplete: false, loadedCompleted: false }));
    state.tags = [...new Set(tags)].sort((a, b) => a.localeCompare(b));
    state.tasks = [];
    state.failures = [];
    state.completed = el('showCompleted').checked;
    renderOverview();

    await loadIncomplete(credentials);
    if (state.completed) await loadCompleted(credentials);

    if (state.failures.length) {
      status('Partial analysis. ' + state.failures.length + ' request(s) failed:\n' +
        state.failures.map(item => {
          const list = state.lists.find(x => String(x.id) === item.listId);
          return (list?.name || item.listId) + ' (' + item.status + '): ' + item.message;
        }).join('\n') + '\nRefresh to retry.');
    } else {
      status('Analysis complete. ' + state.tasks.length +
        ' task instances loaded. No RTM tasks were changed.');
    }
  } catch (error) {
    status('Could not refresh: ' + error.message);
  } finally {
    state.running = false;
    el('refresh').disabled = false;
    el('showCompleted').disabled = false;
  }
}

for (const button of document.querySelectorAll('button[data-overview-sort]')) {
  button.addEventListener('click', () => {
    const type = button.dataset.overviewSort;
    const field = button.dataset.field;
    const current = state.overviewSort[type];
    current.descending = current.field === field ? !current.descending : false;
    current.field = field;
    renderOverview();
  });
}

for (const button of document.querySelectorAll('#taskTable button[data-sort]')) {
  button.addEventListener('click', () => {
    const field = button.dataset.sort;
    state.sort.descending = state.sort.field === field ? !state.sort.descending : false;
    state.sort.field = field;
    renderTasks();
  });
}

el('target').addEventListener('change', chooseTarget);
el('target').addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    chooseTarget();
  }
});

el('search').addEventListener('input', renderTasks);
el('showCompleted').addEventListener('change', refresh);

el('connect').addEventListener('click', async () => {
  const apiKey = el('apiKey').value.trim();
  const secret = el('secret').value.trim();
  if (!apiKey || !secret) return status('Enter both the API key and shared secret.');
  el('connect').disabled = true;
  status('Opening RTM authorisation…');
  try {
    const result = await startAuthorisation({ apiKey, secret });
    await chrome.storage.session.set({
      pendingConnection: { frob: result.frob, apiKey, secret }
    });
    await chrome.tabs.create({ url: result.url });
    el('authorised').hidden = false;
    status('Authorise read-only access in the new tab, then return here.');
  } catch (error) {
    status('Connection failed: ' + error.message);
  } finally {
    el('connect').disabled = false;
  }
});

el('authorised').addEventListener('click', async () => {
  const pending = await pendingConnection();
  if (!pending) return status('Start authorisation again.');
  el('authorised').disabled = true;
  status('Checking authorisation…');
  try {
    const { apiKey, secret, frob } = pending;
    const auth = await finishAuthorisation(frob, { apiKey, secret });
    await chrome.storage.local.set({ apiKey, secret, token: auth.token, username: auth.user?.username || '' });
    await chrome.storage.session.remove('pendingConnection');
    showConnection(await settings());
    await refresh();
  } catch (error) {
    status('Authorisation failed: ' + error.message);
  } finally {
    el('authorised').disabled = false;
  }
});

el('refresh').addEventListener('click', refresh);

el('disconnect').addEventListener('click', async () => {
  await chrome.storage.local.remove(['apiKey', 'secret', 'token', 'username']);
  el('apiKey').value = '';
  el('secret').value = '';
  el('authorised').hidden = true;
  await chrome.storage.session.remove('pendingConnection');
  state.lists = [];
  state.tags = [];
  state.tasks = [];
  state.failures = [];
  state.selected = null;
  el('target').value = '';
  el('targetMessage').textContent = '';
  renderOverview();
  showConnection({});
  status('Disconnected. Saved credentials cleared.');
});

// Keep both panels hidden until Chrome has returned the saved connection.
const initial = await settings();
showConnection(initial);
if (initial.token) {
  await refresh();
} else {
  const pending = await pendingConnection();
  if (pending) {
    el('apiKey').value = pending.apiKey;
    el('secret').value = pending.secret;
    el('authorised').hidden = false;
    status('Authorisation started. Approve access in RTM, then click "I\'ve authorised access".');
  } else {
    status('Ready to connect.');
  }
}
