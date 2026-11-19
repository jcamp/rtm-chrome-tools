// Read-only dashboard. Credentials are saved in this browser's extension storage.
import { startAuthorisation, finishAuthorisation, getLists, getTags, getIncompleteTasks } from './rtm.js';

const el = id => document.getElementById(id);
function status(message) {
  el('status').textContent = message;
}

async function settings() {
  return chrome.storage.local.get(['apiKey', 'secret', 'token', 'username']);
}

// Preserve an unfinished connection if the dashboard tab is closed.
// Session storage is cleared when the browser session ends.
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

function showItems(id, items) {
  const list = el(id);
  list.replaceChildren();
  for (const item of items) {
    const line = document.createElement('li');
    line.textContent = item;
    list.append(line);
  }
}

// Count each incomplete task once per list and once per distinct tag.
function countTasks(tasks) {
  const lists = new Map();
  const tags = new Map();

  for (const task of tasks) {
    lists.set(task.listId, (lists.get(task.listId) || 0) + 1);
    for (const tag of new Set(task.tags.map(name => name.toLocaleLowerCase()))) {
      tags.set(tag, (tags.get(tag) || 0) + 1);
    }
  }
  return { lists, tags };
}

// Process one list at a time. Show its count immediately when available.
// A failed list is marked as unavailable, not incorrectly counted as zero.
let refreshing = false;

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  el('refresh').disabled = true;
  status('Loading list and tag names…');

  try {
    const data = await settings();
    const results = await Promise.allSettled([getLists(data), getTags(data)]);
    const lists = results[0].status === 'fulfilled' ? results[0].value : null;
    const tags = results[1].status === 'fulfilled' ? results[1].value : null;

    if (lists === null) {
      showItems('lists', []);
      el('listCount').textContent = '?';
      showItems('tags', tags === null ? [] : tags.sort((a, b) => a.localeCompare(b)));
      el('tagCount').textContent = tags === null ? '?' : tags.length;
      status('Could not load regular lists: ' + results[0].reason.message);
      return;
    }

    lists.sort((a, b) => a.name.localeCompare(b.name));
    if (tags !== null) tags.sort((a, b) => a.localeCompare(b));
    const listCounts = new Map();
    const tagCounts = new Map();
    const failures = [];

    el('listCount').textContent = lists.length;
    el('tagCount').textContent = tags === null ? '?' : tags.length;

    function displayLists() {
      showItems('lists', lists.map(list => {
        const count = listCounts.get(String(list.id));
        return list.name + ' (' + (count === undefined ? '…' : count) + ')';
      }));
    }

    displayLists();
    showItems('tags', tags === null ? [] : tags.map(tag => tag + ' (…)' ));

    // Sequential requests reduce the size of each response and allow partial progress.
    for (let i = 0; i < lists.length; i++) {
      const list = lists[i];
      status('Counting incomplete tasks: ' + (i + 1) + ' of ' + lists.length +
        ' (' + list.name + ')');
      try {
        const tasks = await getIncompleteTasks(data, list.id);
        listCounts.set(String(list.id), tasks.length);
        for (const [tag, count] of countTasks(tasks).tags) {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + count);
        }
      } catch (error) {
        listCounts.set(String(list.id), 'unavailable');
        failures.push(list.name + ': ' + error.message);
      }
      displayLists();
    }

    // Tag totals cannot be complete if any list could not be read.
    if (tags !== null) {
      showItems('tags', tags.map(tag => {
        if (failures.length) return tag + ' (incomplete)';
        return tag + ' (' + (tagCounts.get(tag.toLocaleLowerCase()) || 0) + ')';
      }));
    }

    const messages = [];
    if (tags === null) messages.push('Tags could not be loaded: ' + results[1].reason.message);
    if (failures.length) messages.push(failures.length + ' list(s) failed: ' + failures.join(' | '));
    status(messages.length
      ? 'Partial results. ' + messages.join(' | ') + '. Refresh to try again.'
      : 'Complete. Counts show incomplete tasks. No tasks were changed.');
  } catch (error) {
    status('Could not refresh: ' + error.message);
  } finally {
    refreshing = false;
    el('refresh').disabled = false;
  }
}

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
  showItems('lists', []);
  showItems('tags', []);
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
