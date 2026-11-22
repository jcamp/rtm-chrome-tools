/**
 * Shared client for the Remember The Milk REST API.
 *
 * All requests are signed with the RTM shared secret, then sent by HTTPS POST.
 * The caller decides which API method to invoke. Export Builder only calls
 * read-only methods and requests a token with perms=read.
 *
 * Canonical file: shared/rtm.js. Run scripts/sync-rtm-auth.mjs after edits
 * to keep the standalone extension copies identical.
 */
import md5 from './md5.js';

const API = 'https://api.rememberthemilk.com/services/rest/';
const AUTHORISE = 'https://www.rememberthemilk.com/services/auth/';

/**
 * Create the RTM API signature by sorting parameter names and hashing the shared secret plus their concatenated values. Never log the secret.
 */
function sign(params, secret) {
  const input = Object.keys(params).sort().map(key => key + params[key]).join('');
  return md5(secret + input);
}

/**
 * Make a signed RTM REST request. Retry HTTP 502 once only for the three read-only list/tag/task retrieval methods. Throw on HTTP and RTM API errors so callers cannot mistake failure for an empty result.
 */
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

/**
 * Obtain an RTM frob and build a URL requesting read-only permissions. The user must approve access in RTM.
 */
export async function startAuthorisation(credentials) {
  const frob = (await call('rtm.auth.getFrob', {}, credentials)).frob;
  const params = { api_key: credentials.apiKey, perms: 'read', frob };
  const url = AUTHORISE + '?' + new URLSearchParams({ ...params, api_sig: sign(params, credentials.secret) });
  return { frob, url };
}

/**
 * Exchange an authorised frob for an RTM access token. The caller is responsible for local token storage.
 */
export async function finishAuthorisation(frob, credentials) {
  return (await call('rtm.auth.getToken', { frob }, credentials)).auth;
}

/**
 * Return non-deleted regular RTM lists. Smart Lists are saved searches, not independent physical task containers.
 */
export async function getLists(credentials) {
  const result = await call('rtm.lists.getList', {}, credentials);
  // Smart Lists are saved searches, not physical lists containing tasks.
  return toArray(result.lists?.list).filter(list => list.deleted !== '1' && list.smart !== '1');
}

// Fetch one status for one list. The response is passed to the pure parser.
// Never request all account tasks in a single call.
/**
 * Fetch complete or incomplete tasks for one physical list. Scoped calls avoid requesting the entire account.
 */
export async function getTasksForList(credentials, listId, completed) {
  const result = await call('rtm.tasks.getList', {
    list_id: String(listId),
    filter: completed ? 'status:completed' : 'status:incomplete'
  }, credentials);
  return result;
}

// One filtered request is much faster than one request for every list.
// RTM's completed history is deliberately excluded.
/**
 * Fetch incomplete tasks in a single filtered request. This helper is shared with another extension, not used by Export Builder's selected-task path.
 */
export async function getAllIncompleteTasks(credentials) {
  return call('rtm.tasks.getList', { filter: 'status:incomplete' }, credentials);
}

/**
 * Retrieve the user's RTM tag names. Convert single-item and array responses to the same output shape.
 */
export async function getTags(credentials) {
  const result = await call('rtm.tags.getList', {}, credentials);
  return toArray(result.tags?.tag).map(tag => typeof tag === 'string' ? tag : tag.name).filter(Boolean);
}

// RTM represents one item as an object, several as an array, and none as absent.
/**
 * Normalise RTM API fields that may be missing, one object or an array.
 */
function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}
