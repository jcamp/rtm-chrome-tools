// Small read-only RTM API client. Signed requests use the official RTM API.
import md5 from './md5.js';

const API = 'https://api.rememberthemilk.com/services/rest/';
const AUTHORISE = 'https://www.rememberthemilk.com/services/auth/';

function sign(params, secret) {
  const input = Object.keys(params).sort().map(key => key + params[key]).join('');
  return md5(secret + input);
}

export async function call(method, params, credentials) {
  const values = { ...params, method, api_key: credentials.apiKey, format: 'json', v: '2' };
  if (credentials.token) values.auth_token = credentials.token;
  values.api_sig = sign(values, credentials.secret);
  // Retry a transient gateway failure once. Never retry task-changing operations.
  let response = await fetch(API, { method: 'POST', body: new URLSearchParams(values) });
  if (response.status === 502 && ['rtm.tasks.getList', 'rtm.lists.getList', 'rtm.tags.getList'].includes(method)) {
    await new Promise(resolve => setTimeout(resolve, 1200));
    response = await fetch(API, { method: 'POST', body: new URLSearchParams(values) });
  }
  if (!response.ok) throw new Error(method + ': RTM HTTP error ' + response.status);
  const data = (await response.json()).rsp;
  if (!data || data.stat !== 'ok') {
    throw new Error(data?.err?.msg || 'Unexpected RTM response');
  }
  return data;
}

export async function startAuthorisation(credentials) {
  const frob = (await call('rtm.auth.getFrob', {}, credentials)).frob;
  const params = { api_key: credentials.apiKey, perms: 'read', frob };
  const url = AUTHORISE + '?' + new URLSearchParams({ ...params, api_sig: sign(params, credentials.secret) });
  return { frob, url };
}

export async function finishAuthorisation(frob, credentials) {
  return (await call('rtm.auth.getToken', { frob }, credentials)).auth;
}

export async function getLists(credentials) {
  const result = await call('rtm.lists.getList', {}, credentials);
  // Smart Lists are saved searches, not physical lists containing tasks.
  return toArray(result.lists?.list).filter(list => list.deleted !== '1' && list.smart !== '1');
}

// Fetch one status for one list. The response is passed to the pure parser.
// Never request all account tasks in a single call.
export async function getTasksForList(credentials, listId, completed) {
  const result = await call('rtm.tasks.getList', {
    list_id: String(listId),
    filter: completed ? 'status:completed' : 'status:incomplete'
  }, credentials);
  return result;
}

export async function getTags(credentials) {
  const result = await call('rtm.tags.getList', {}, credentials);
  return toArray(result.tags?.tag).map(tag => typeof tag === 'string' ? tag : tag.name).filter(Boolean);
}

// RTM represents one item as an object, several as an array, and none as absent.
function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}
