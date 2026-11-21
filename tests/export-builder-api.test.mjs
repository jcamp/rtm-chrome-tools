// Integration tests for the signed RTM request wrapper, without network access.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../projects/export-builder/rtm.js', import.meta.url), 'utf8')
const clientCode = source.replace("import md5 from './md5.js';", '').replace(/^export /gm, '')
const createClient = new Function(
  'md5', 'fetch', 'setTimeout', 'URLSearchParams',
  clientCode + '\nreturn { call };'
)

function clientWithResponses(statuses) {
  const requests = []
  const fetchMock = async (_url, options) => {
    requests.push(options)
    const status = statuses[requests.length - 1]
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => ({ rsp: { stat: 'ok', tasks: {} } })
    }
  }
  const client = createClient(() => 'test-signature', fetchMock, callback => callback(), URLSearchParams)
  return { client, requests }
}

const auth = { apiKey: 'test', secret: 'test', token: 'test' }

test('read-only task request retries one 502 and succeeds', async () => {
  const { client, requests } = clientWithResponses([502, 200])
  await client.call('rtm.tasks.getList', { filter: 'status:incomplete' }, auth)
  assert.equal(requests.length, 2)
  assert.equal(requests[0].method, 'POST')
  assert.equal(requests[1].body.get('filter'), 'status:incomplete')
})

test('persistent 502 fails after exactly one retry', async () => {
  const { client, requests } = clientWithResponses([502, 502])
  await assert.rejects(() => client.call('rtm.tasks.getList', {}, auth), /HTTP error 502/)
  assert.equal(requests.length, 2)
})

test('non-read-only requests are not retried', async () => {
  const { client, requests } = clientWithResponses([502, 200])
  await assert.rejects(() => client.call('rtm.tasks.complete', {}, auth), /HTTP error 502/)
  assert.equal(requests.length, 1)
})
