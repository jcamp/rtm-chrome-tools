// Read-only dashboard. Credentials are saved in this browser's extension storage.
import { startAuthorisation, finishAuthorisation, getLists, getTags } from './rtm.js';

const el = id => document.getElementById(id);
let pendingFrob = '';

function status(message) {
  el('status').textContent = message;
}

async function settings() {
  return chrome.storage.local.get(['apiKey', 'secret', 'token', 'username']);
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

async function refresh() {
  status('Loading lists and tags…');
  try {
    const data = await settings();
    const [lists, tags] = await Promise.all([getLists(data), getTags(data)]);
    showItems('lists', lists.map(list => list.name + (list.smart === '1' ? ' (Smart List)' : '')));
    showItems('tags', tags.sort((a, b) => a.localeCompare(b)));
    el('listCount').textContent = lists.length;
    el('tagCount').textContent = tags.length;
    status('Updated. Read-only: no tasks were changed.');
  } catch (error) {
    status('Could not load data: ' + error.message);
  }
}

el('connect').addEventListener('click', async () => {
  const apiKey = el('apiKey').value.trim();
  const secret = el('secret').value.trim();
  if (!apiKey || !secret) return status('Enter both the API key and shared secret.');
  el('connect').disabled = true;
  status('Opening RTM authorisation…');
  try {
    // Keep credentials in memory until the user confirms authorisation.
    const result = await startAuthorisation({ apiKey, secret });
    pendingFrob = result.frob;
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
  if (!pendingFrob) return status('Start authorisation again.');
  el('authorised').disabled = true;
  status('Checking authorisation…');
  try {
    const apiKey = el('apiKey').value.trim();
    const secret = el('secret').value.trim();
    const auth = await finishAuthorisation(pendingFrob, { apiKey, secret });
    await chrome.storage.local.set({ apiKey, secret, token: auth.token, username: auth.user?.username || '' });
    pendingFrob = '';
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
  pendingFrob = '';
  showItems('lists', []);
  showItems('tags', []);
  showConnection({});
  status('Disconnected. Saved credentials cleared.');
});

const initial = await settings();
showConnection(initial);
if (initial.token) await refresh();
