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
  },
  findingSort: {
    similar: { field: 'names', descending: false },
    singleTask: { field: 'tag', descending: false },
    singleList: { field: 'tag', descending: false }
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

// RTM web app routes supplied by the user. Encode tag names for the URL.
function rtmWebUrl(key) {
  const split = key.indexOf(':');
  const type = key.slice(0, split);
  const value = key.slice(split + 1);
  if (type === 'list') return 'https://www.rememberthemilk.com/app/#list/' + encodeURIComponent(value);
  if (type === 'tag') return 'https://www.rememberthemilk.com/app/#tag/' +
    encodeURIComponent(value.toLowerCase());
  return '';
}

function renderTable(id, rows) {
  const table = el(id);
  table.replaceChildren();
  for (const item of rows) {
    const tr = document.createElement('tr');
    for (const value of item.values) tr.append(node('td', value));
    if (item.externalUrl) {
      // Add an independent link within the first cell of each overview row.
      const link = document.createElement('a');
      link.href = item.externalUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'rtm-link';
      link.textContent = '↗';
      link.title = 'Open ' + item.values[0] + ' in Remember The Milk';
      link.setAttribute('aria-label', link.title);
      link.addEventListener('click', event => event.stopPropagation());
      link.addEventListener('keydown', event => event.stopPropagation());
      tr.firstElementChild.append(' ', link);
    }
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
    externalUrl: rtmWebUrl(row.key),
    values: [row.name, row.incomplete ?? '?', completedValue(row.completed)]
  })));
  renderTable('tags', sortOverviewRows(tagRows, 'tag').map(row => ({
    select: row.key,
    externalUrl: rtmWebUrl(row.key),
    values: [row.name, row.incomplete ?? '?', completedValue(row.completed)]
  })));

  updateOverviewHeaders();
  renderFindings(results, validIncomplete, validCompleted);
  renderTasks();
}

// Findings share one compact table design and sort entirely in memory.
function sortFindingRows(rows, order) {
  return [...rows].sort((a, b) => {
    const left = a[order.field];
    const right = b[order.field];
    if (left == null || right == null) {
      if (left == null && right == null) return 0;
      return left == null ? 1 : -1;
    }
    const comparison = typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left).localeCompare(String(right), 'en-GB', { numeric: true });
    return (order.descending ? -1 : 1) * comparison ||
      String(a.tag || a.names || '').localeCompare(String(b.tag || b.names || ''), 'en-GB');
  });
}

function inspectorLink(label, key) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'finding-link';
  button.textContent = label;
  button.title = 'Show tasks in the Task Inspector';
  button.addEventListener('click', () => select(key));
  return button;
}

function renderFindingTable(parent, group) {
  if (!group.rows.length) return;
  const section = document.createElement('section');
  section.append(node('h4', group.title + ' (' + group.rows.length + ')'));
  const box = document.createElement('div');
  box.className = 'finding-scroll';
  box.tabIndex = 0;
  box.setAttribute('role', 'region');
  box.setAttribute('aria-label', group.title);
  const table = document.createElement('table');
  const header = document.createElement('tr');
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');
  const order = state.findingSort[group.id];

  function drawRows() {
    tbody.replaceChildren();
    for (const item of sortFindingRows(group.rows, order)) {
      const row = document.createElement('tr');
      for (const [field] of group.columns) {
        const cell = document.createElement('td');
        if (field === 'names') {
          item.tags.forEach((tag, index) => {
            if (index) cell.append(', ');
            cell.append(inspectorLink(tag, 'tag:' + tag));
          });
        } else if (field === 'tag') {
          cell.append(inspectorLink(item.tag, 'tag:' + item.tag));
        } else if (field === 'list') {
          if (item.listId) cell.append(inspectorLink(item.list, 'list:' + item.listId));
          else cell.textContent = item.list;
        } else {
          cell.textContent = item[field] == null ? 'not scanned' : String(item[field]);
        }
        row.append(cell);
      }
      tbody.append(row);
    }
  }

  function updateHeadings() {
    for (const button of header.querySelectorAll('button')) {
      const active = button.dataset.field === order.field;
      button.textContent = button.dataset.title +
        (active ? (order.descending ? ' ▼' : ' ▲') : '');
      button.closest('th').setAttribute('aria-sort', active ?
        (order.descending ? 'descending' : 'ascending') : 'none');
    }
  }

  for (const [field, label] of group.columns) {
    const th = document.createElement('th');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.field = field;
    button.dataset.title = label;
    button.addEventListener('click', () => {
      order.descending = order.field === field ? !order.descending : false;
      order.field = field;
      drawRows();
      updateHeadings();
    });
    th.append(button);
    header.append(th);
  }
  thead.append(header);
  table.append(thead, tbody);
  box.append(table);
  section.append(box);
  parent.append(section);
  drawRows();
  updateHeadings();
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

  const suggestions = results.suggestions;
  const counts = tag => results.byTag.get(tag.toLowerCase());
  const completed = count => state.completed ? count?.completed || 0 : null;
  const groups = [
    {
      id: 'similar', title: 'Similar tag names', columns: [['names', 'Tags to review']],
      rows: [...new Set(suggestions.filter(item => item.type === 'Similar names').map(item => item.detail))]
        .map(names => ({ names, tags: names.split(', ').filter(Boolean) }))
    },
    {
      id: 'singleTask', title: 'Tags used by one task',
      columns: [['tag', 'Tag'], ['incomplete', 'Incomplete'], ['completed', 'Completed']],
      rows: suggestions.filter(item => item.type === 'Single-task tag').map(item => ({
        tag: item.tag, incomplete: counts(item.tag)?.incomplete || 0,
        completed: completed(counts(item.tag))
      }))
    },
    {
      id: 'singleList', title: 'Tags used in one list',
      columns: [['tag', 'Tag'], ['list', 'List'], ['incomplete', 'Incomplete'], ['completed', 'Completed']],
      rows: suggestions.filter(item => item.type === 'Single-list tag').map(item => {
        const count = counts(item.tag);
        const listId = count ? [...count.lists][0] : '';
        const list = state.lists.find(entry => String(entry.id) === listId);
        return {
          tag: item.tag, listId: list ? String(list.id) : '',
          list: list?.name || '', incomplete: count?.incomplete || 0,
          completed: completed(count)
        };
      })
    }
  ];

  const output = el('suggestions');
  for (const group of groups) renderFindingTable(output, group);

  // No matching tasks means there is nothing to inspect in the current scan.
  // Show these as a compact group of direct RTM links instead of a tall table.
  const unmatched = suggestions.filter(item => item.type === 'No matching tasks')
    .map(item => item.tag).sort((a, b) => a.localeCompare(b, 'en-GB', { numeric: true }));
  if (unmatched.length) {
    const section = document.createElement('section');
    section.append(node('h4', 'Tags without matching tasks (' + unmatched.length + ')'));
    const paragraph = document.createElement('p');
    paragraph.className = 'unmatched-tags';
    unmatched.forEach((tag, index) => {
      if (index) paragraph.append(', ');
      const link = document.createElement('a');
      link.href = rtmWebUrl('tag:' + tag);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = tag;
      link.title = 'Open tag in Remember The Milk';
      paragraph.append(link);
    });
    section.append(paragraph);
    output.append(section);
  }
  if (!groups.some(group => group.rows.length) && !unmatched.length) {
    output.append(node('p', 'No relationships suggested.'));
  }

  let found = false;
  for (const list of state.lists) {
    const count = results.byList.get(String(list.id));
    if (count && count.incomplete === 0 && (!state.completed || count.completed === 0)) {
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
