// Read-only dashboard. All task analysis happens locally after RTM responds.
import { startAuthorisation, finishAuthorisation, getLists, getTags, getTasksForList } from './rtm.js';
import { analyse, tasksFromResponse } from './analysis.js';

const el = id => document.getElementById(id);
const state = { lists: [], tags: [], tasks: [], failures: [], selected: null, completed: true, running: false };

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
  element.textContent = content;
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
    for (const value of item.values) tr.append(node('td', String(value)));
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

// Count data is labelled unknown until the corresponding request succeeds.
function renderOverview() {
  const results = analyse(state.lists, state.tags, state.tasks, !state.failures.length);
  const showCompleted = state.completed;
  el('listCount').textContent = state.lists.length;
  el('tagCount').textContent = state.tags.length;
  const failed = new Set(state.failures.map(item => item.listId + ':' + item.status));
  function value(amount, unknown) {
    return unknown ? '?' : amount;
  }

  renderTable('lists', state.lists.map(list => {
    const count = results.byList.get(String(list.id)) || { incomplete: 0, completed: 0 };
    return {
      select: 'list:' + list.id,
      values: [list.name,
        value(count.incomplete, !list.loadedIncomplete),
        showCompleted ? value(count.completed, !list.loadedCompleted) : 'not scanned']
    };
  }));

  const unknownIncomplete = state.lists.some(list => !list.loadedIncomplete);
  const unknownCompleted = showCompleted && state.lists.some(list => !list.loadedCompleted);
  renderTable('tags', state.tags.map(tag => {
    const count = results.byTag.get(tag.toLowerCase()) || { incomplete: 0, completed: 0 };
    return {
      select: 'tag:' + tag,
      values: [tag,
        value(count.incomplete, unknownIncomplete),
        showCompleted ? value(count.completed, unknownCompleted) : 'not scanned']
    };
  }));

  renderFindings(results, showCompleted && !unknownCompleted && !unknownIncomplete);
  renderTasks();
}

function renderFindings(results, allStatusesComplete) {
  clear('suggestions');
  clear('emptyLists');
  if (!allStatusesComplete) {
    el('summary').textContent = 'Full findings are available after every list has been scanned successfully for both statuses. ' +
      'Similar names can still be investigated manually in the tag table.';
    return;
  }

  const unused = results.suggestions.filter(item => item.type === 'Unused tag').length;
  const single = results.suggestions.filter(item => item.type === 'Single-task tag').length;
  el('summary').textContent = state.tasks.length + ' task instances checked. ' +
    results.untagged.length + ' untagged. ' + unused + ' unused tags. ' + single + ' single-task tags.';

  const suggestions = el('suggestions');
  for (const suggestion of results.suggestions) {
    const li = node('li', suggestion.type + ': ' + suggestion.tag + ' (' + suggestion.detail + ')');
    suggestions.append(li);
  }
  if (!results.suggestions.length) suggestions.append(node('li', 'No suggestions found.'));

  let emptyCount = 0;
  for (const list of state.lists) {
    const count = results.byList.get(String(list.id));
    if (count && count.incomplete + count.completed === 0) {
      el('emptyLists').append(node('li', list.name));
      emptyCount++;
    }
  }
  if (!emptyCount) el('emptyLists').append(node('li', 'None.'));
}

function select(key) {
  const index = key.indexOf(':');
  state.selected = { type: key.slice(0, index), value: key.slice(index + 1) };
  renderTasks();
}

function renderTasks() {
  clear('tasks');
  if (!state.selected) {
    el('selection').textContent = 'Nothing selected.';
    return;
  }

  const filter = el('search').value.trim().toLowerCase();
  const selection = state.selected;
  const matches = state.tasks.filter(task => {
    const selected = selection.type === 'list'
      ? task.listId === selection.value
      : task.tags.some(tag => tag.toLowerCase() === selection.value.toLowerCase());
    return selected && task.name.toLowerCase().includes(filter);
  });
  const listNames = new Map(state.lists.map(list => [String(list.id), list.name]));
  el('selection').textContent = matches.length + ' loaded task instance(s) in ' + selection.type + ': ' +
    (selection.type === 'list' ? listNames.get(selection.value) || selection.value : selection.value) +
    '. Results may be partial while scanning or if requests failed.';
  renderTable('tasks', matches.slice(0, 500).map(task => ({
    values: [task.name + (task.parentId ? ' (subtask)' : ''), listNames.get(task.listId) || task.listId,
      task.completed ? 'Completed' : 'Incomplete', task.tags.join(', ') || '(none)', task.due || '']
  })));
  if (matches.length > 500) el('selection').textContent += ' Showing the first 500 matches.';
}

// Sequential API requests are deliberate. Partial results remain visible.
async function refresh() {
  if (state.running) return;
  state.running = true;
  el('refresh').disabled = true;
  el('showCompleted').disabled = true;
  status('Loading regular lists…');

  try {
    const data = await settings();
    const lists = await getLists(data);
    const tags = await getTags(data);
    state.lists = lists.sort((a, b) => a.name.localeCompare(b.name))
      .map(list => ({ ...list, loadedIncomplete: false, loadedCompleted: false }));
    state.tags = [...new Set(tags)].sort((a, b) => a.localeCompare(b));
    state.tasks = [];
    state.failures = [];
    state.completed = el('showCompleted').checked;
    renderOverview();

    for (let i = 0; i < state.lists.length; i++) {
      const list = state.lists[i];
      const statuses = state.completed ? [false, true] : [false];
      for (const completed of statuses) {
        const label = completed ? 'completed' : 'incomplete';
        status('Reading ' + label + ' tasks: list ' + (i + 1) + ' of ' + state.lists.length +
          ' (' + list.name + ')');
        try {
          const response = await getTasksForList(data, list.id, completed);
          state.tasks.push(...tasksFromResponse(response, list.id, completed));
          if (completed) list.loadedCompleted = true;
          else list.loadedIncomplete = true;
        } catch (error) {
          state.failures.push({ listId: String(list.id), status: label, message: error.message });
        }
        renderOverview();
      }
    }

    if (state.failures.length) {
      status('Partial analysis. ' + state.failures.length + ' request(s) failed:\n' +
        state.failures.map(item => {
          const list = state.lists.find(x => String(x.id) === item.listId);
          return (list?.name || item.listId) + ' (' + item.status + '): ' + item.message;
        }).join('\n') + '\nRefresh to try again.');
    } else {
      status('Scan complete. ' + state.tasks.length + ' task instances retrieved. No RTM tasks were changed.');
    }
  } catch (error) {
    status('Unable to start analysis: ' + error.message);
  } finally {
    state.running = false;
    el('refresh').disabled = false;
    el('showCompleted').disabled = false;
  }
}

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
