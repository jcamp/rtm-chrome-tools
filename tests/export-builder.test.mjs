// Regression tests for the single-root RTM Export Builder.
// Run: node --test tests/export-builder.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const file = new URL('../projects/export-builder/export.js', import.meta.url)
const original = await readFile(file, 'utf8')
const body = original
  .replace(/^import .*?;$/gm, '')
  .replace(/init\(\)\.catch\(.*?\);\s*$/s, '')

const calls = []
let selectedRows = []
let apiHandler = () => ({ tasks: {} })
const call = async (method,params) => {
  calls.push({ method, params })
  return apiHandler(params)
}
const inputs = {
  scope: { value: 'list' }, target: { value: '1' },
  subtasks: { checked: true }, completed: { checked: false },
  rtmTab: { value: '9' },
  status: { textContent: '' }
}
const chrome = {
  tabs: { query: async () => [{ id: 9, url: 'https://www.rememberthemilk.com/app/' }] },
  scripting: { executeScript: async () => [{
    result: { checked: selectedRows.length, rows: selectedRows }
  }] }
}
const create = new Function(
  'document','chrome','startAuthorisation','finishAuthorisation',
  'getLists','getTags','getTasksForList','call',
  body + '\nreturn { normaliseResponse, selectRows, headersAndValues, serialise, state, matchSelectedTask, retrieve, selectedTaskRows };'
)
const exporter = create(
  { getElementById: id => inputs[id] || {} },
  chrome, () => {}, () => {}, () => {}, () => {}, () => {}, call
)
exporter.state.lists = [{ id: '1', name: 'Inbox' }, { id: '2', name: 'Other' }]

const response = { tasks: { list: { id: '1', taskseries: [
  { id: 'a', name: 'Parent', task: { id: '100', completed: '' } },
  { id: 'b', name: 'Child', parent_task_id: '100',
    notes: { note: { title: 'Info', _content: 'Line 1\nLine 2' } },
    task: { id: '101', completed: '' } },
  { id: 'c', name: 'Grandchild', parent_task_id: '101', task: { id: '102', completed: '' } }
] } } }

function root(title) {
  return { text:title, exactTexts:[title] }
}

test('recursive hierarchy uses a separate column for each level', () => {
  inputs.scope.value='list'
  const rows=exporter.selectRows(exporter.normaliseResponse(response,new Map([['1','Inbox']])))
  assert.deepEqual(rows.map(row=>row.level),[0,1,2])
  const out=exporter.headersAndValues(rows)
  assert.deepEqual(out.headings.slice(0,3),['Task','Subtask 1','Subtask 2'])
  assert.deepEqual(out.values.map(row=>row.slice(0,3)),
    [['Parent','',''],['','Child',''],['','','Grandchild']])
})

test('exactly one selected root can export recursive descendants', () => {
  inputs.scope.value='selected'
  inputs.subtasks.checked=true
  exporter.state.selectedKey='1:a:100'
  const rows=exporter.selectRows(exporter.normaliseResponse(response,new Map()))
  assert.deepEqual(rows.map(row=>row.id),['100','101','102'])
})

test('selected root without nested subtasks exports only that root', () => {
  inputs.scope.value='selected'
  inputs.subtasks.checked=false
  exporter.state.selectedKey='1:a:100'
  const rows=exporter.selectRows(exporter.normaliseResponse(response,new Map()))
  assert.deepEqual(rows.map(row=>row.id),['100'])
  inputs.subtasks.checked=true
})

test('selected task identity cannot match another list with the same task ID', () => {
  inputs.scope.value='selected'
  inputs.subtasks.checked=false
  exporter.state.selectedKey='1:a:10'
  const rows=[
    {key:'1:a:10',listId:'1',seriesId:'a',id:'10',parentId:'',name:'A'},
    {key:'2:b:10',listId:'2',seriesId:'b',id:'10',parentId:'',name:'B'}
  ]
  assert.deepEqual(exporter.selectRows(rows).map(row=>row.name),['A'])
  inputs.subtasks.checked=true
})

test('nested subtasks never cross RTM lists', () => {
  inputs.scope.value='selected'
  inputs.subtasks.checked=true
  exporter.state.selectedKey='1:a:1'
  const rows=[
    {key:'1:a:1',listId:'1',seriesId:'a',id:'1',parentId:'',name:'Parent'},
    {key:'2:b:2',listId:'2',seriesId:'b',id:'2',parentId:'1',name:'Unrelated'}
  ]
  assert.deepEqual(exporter.selectRows(rows).map(row=>row.name),['Parent'])
})

test('single selected task title resolves to one composite key', () => {
  const records=[
    {key:'1:a:10',id:'10',name:'Camera repair',completed:false},
    {key:'1:b:11',id:'11',name:'Post invoice',completed:false}
  ]
  assert.equal(exporter.matchSelectedTask(root('Camera repair'),records),'1:a:10')
})

test('similar titles do not cause prefix matching', () => {
  const records=[
    {key:'1:a:10',id:'10',name:'Pay',completed:false},
    {key:'1:b:11',id:'11',name:'Pay rent',completed:false}
  ]
  assert.equal(exporter.matchSelectedTask(root('Pay rent'),records),'1:b:11')
})

test('missing and duplicated task titles cannot be silently exported', () => {
  const records=[
    {key:'1:a:10',id:'10',name:'Same',completed:false},
    {key:'2:b:11',id:'11',name:'Same',completed:false}
  ]
  assert.throws(()=>exporter.matchSelectedTask(root('Same'),records),/different task records/)
  assert.throws(()=>exporter.matchSelectedTask(root('Missing'),records),/not found/)
})

test('one incomplete recurring instance is chosen over older completed occurrences', () => {
  const records=[
    {key:'1:a:10',id:'10',name:'Annual renewal',completed:true},
    {key:'1:a:11',id:'11',name:'Annual renewal',completed:false}
  ]
  assert.equal(exporter.matchSelectedTask(root('Annual renewal'),records),'1:a:11')
})

test('selected zero or multiple tasks are rejected before any API call', async () => {
  inputs.scope.value='selected'
  inputs.subtasks.checked=false
  calls.length=0
  selectedRows=[]
  await assert.rejects(()=>exporter.retrieve({}),/exactly one RTM task/)
  selectedRows=[root('A'),root('B')]
  await assert.rejects(()=>exporter.retrieve({}),/exactly one RTM task/)
  assert.equal(calls.length,0)
})

test('one selected task uses a name-filtered API request', async () => {
  inputs.scope.value='selected'
  inputs.subtasks.checked=false
  inputs.completed.checked=false
  calls.length=0
  selectedRows=[root('Parent')]
  apiHandler=()=>({tasks:{list:{id:'1',taskseries:{
    id:'a',name:'Parent',task:{id:'100',completed:''}
  }}}})
  const rows=await exporter.retrieve({})
  assert.equal(exporter.state.selectedKey,'1:a:100')
  assert.equal(rows.length,1)
  assert.equal(calls.length,1)
  assert.match(calls[0].params.filter,/name:"Parent"/)
  inputs.subtasks.checked=true
})

test('selected root fetches descendants from its list only', async () => {
  inputs.scope.value='selected'
  inputs.subtasks.checked=true
  inputs.completed.checked=false
  calls.length=0
  selectedRows=[root('Parent')]
  apiHandler=params => params.list_id
    ? response
    : {tasks:{list:{id:'1',taskseries:{id:'a',name:'Parent',task:{id:'100',completed:''}}}}}
  const rows=await exporter.retrieve({})
  exporter.state.selectedKey='1:a:100'
  assert.deepEqual(exporter.selectRows(rows).map(row=>row.id),['100','101','102'])
  assert.equal(calls.length,2)
  assert.equal(calls[1].params.list_id,'1')
})

test('list and tag sources retain scoped API requests', async () => {
  inputs.scope.value='list'
  inputs.target.value='1'
  inputs.subtasks.checked=false
  calls.length=0
  apiHandler=()=>({tasks:{}})
  await exporter.retrieve({})
  assert.equal(calls.length,1)
  assert.equal(calls[0].params.list_id,'1')

  inputs.scope.value='tag'
  inputs.target.value='will'
  calls.length=0
  await exporter.retrieve({})
  assert.equal(calls.length,1)
  assert.match(calls[0].params.filter,/tag:"will"/)
})

test('API 502 failure stops the export and reports the error', async () => {
  inputs.scope.value='list'
  inputs.target.value='1'
  calls.length=0
  apiHandler=()=>{throw new Error('RTM HTTP error 502')}
  await assert.rejects(()=>exporter.retrieve({}),/502/)
  assert.equal(calls.length,1)
})

test('notes and spreadsheet escaping are preserved', () => {
  inputs.scope.value='list'
  const rows=exporter.normaliseResponse(response,new Map())
  assert.equal(rows[1].notes[0].body,'Line 1\nLine 2')
  const csv=exporter.serialise(['Name','Notes'],[['a,b','one\n"two"']],'csv')
  assert.equal(csv,'Name,Notes\r\n"a,b","one\n""two"""\r\n')
  assert.match(exporter.serialise(['Task'],[['=1+1']],'csv'),/'=1\+1/)
})

test('UK date fields omit time and preserve the UK calendar date', () => {
  inputs.scope.value='list'
  const source={tasks:{list:{id:'1',taskseries:[
    {id:'s',name:'Summer',task:{id:'201',due:'2026-08-24T23:00:00Z',priority:'N'}},
    {id:'w',name:'Winter',task:{id:'202',due:'2026-11-25T00:00:00Z',priority:'1'}}
  ]}}}
  const rows=exporter.selectRows(exporter.normaliseResponse(source,new Map()))
  const out=exporter.headersAndValues(rows)
  const due=out.headings.indexOf('Due date')
  assert.deepEqual(out.values.map(row=>row[due]),['25/08/2026','25/11/2026'])
})
