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
  scope: { value: 'list' }, selectedSource: { checked: false }, target: { value: '1' },
  subtasks: { checked: true }, completed: { checked: false },
  rtmTab: { value: '9' }, dateFormat: {value:'dmy'},
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
  body + '\nreturn { normaliseResponse, selectRows, headersAndValues, serialise, state, matchSelectedTask, retrieve, selectedTaskRows, sourceMode, formatDate, browserDateFormat };'
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
  inputs.selectedSource.checked=false
  inputs.selectedSource.checked=false
  inputs.scope.value='list'
  const rows=exporter.selectRows(exporter.normaliseResponse(response,new Map([['1','Inbox']])))
  assert.deepEqual(rows.map(row=>row.level),[0,1,2])
  const out=exporter.headersAndValues(rows)
  assert.deepEqual(out.headings.slice(0,3),['Task','Subtask 1','Subtask 2'])
  assert.deepEqual(out.values.map(row=>row.slice(0,3)),
    [['Parent','',''],['','Child',''],['','','Grandchild']])
})

test('exactly one selected root can export recursive descendants', () => {
  inputs.selectedSource.checked=true
  inputs.subtasks.checked=true
  exporter.state.selectedKey='1:a:100'
  const rows=exporter.selectRows(exporter.normaliseResponse(response,new Map()))
  assert.deepEqual(rows.map(row=>row.id),['100','101','102'])
})

test('selected root without nested subtasks exports only that root', () => {
  inputs.selectedSource.checked=true
  inputs.subtasks.checked=false
  exporter.state.selectedKey='1:a:100'
  const rows=exporter.selectRows(exporter.normaliseResponse(response,new Map()))
  assert.deepEqual(rows.map(row=>row.id),['100'])
  inputs.subtasks.checked=true
})

test('selected task identity cannot match another list with the same task ID', () => {
  inputs.selectedSource.checked=true
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
  inputs.selectedSource.checked=true
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
  inputs.selectedSource.checked=true
  inputs.subtasks.checked=false
  calls.length=0
  selectedRows=[]
  await assert.rejects(()=>exporter.retrieve({}),/exactly one RTM task/)
  selectedRows=[root('A'),root('B')]
  await assert.rejects(()=>exporter.retrieve({}),/exactly one RTM task/)
  assert.equal(calls.length,0)
})

test('one selected task uses a name-filtered API request', async () => {
  inputs.selectedSource.checked=true
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
  inputs.selectedSource.checked=true
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
  inputs.selectedSource.checked=false
  inputs.scope.value='list'
  inputs.target.value='1'
  inputs.subtasks.checked=false
  calls.length=0
  apiHandler=()=>({tasks:{}})
  await exporter.retrieve({})
  assert.equal(calls.length,1)
  assert.equal(calls[0].params.list_id,'1')

  inputs.selectedSource.checked=false
  inputs.scope.value='tag'
  inputs.target.value='will'
  calls.length=0
  await exporter.retrieve({})
  assert.equal(calls.length,1)
  assert.match(calls[0].params.filter,/tag:"will"/)
})

test('API 502 failure stops the export and reports the error', async () => {
  inputs.selectedSource.checked=false
  inputs.scope.value='list'
  inputs.target.value='1'
  calls.length=0
  apiHandler=()=>{throw new Error('RTM HTTP error 502')}
  await assert.rejects(()=>exporter.retrieve({}),/502/)
  assert.equal(calls.length,1)
})

test('notes and spreadsheet escaping are preserved', () => {
  inputs.selectedSource.checked=false
  inputs.scope.value='list'
  const rows=exporter.normaliseResponse(response,new Map())
  assert.equal(rows[1].notes[0].body,'Line 1\nLine 2')
  const csv=exporter.serialise(['Name','Notes'],[['a,b','one\n"two"']],'csv')
  assert.equal(csv,'Name,Notes\r\n"a,b","one\n""two"""\r\n')
  assert.match(exporter.serialise(['Task'],[['=1+1']],'csv'),/'=1\+1/)
})

test('date-only values stay on their calendar day in every format', () => {
  assert.equal(exporter.formatDate('2026-08-24','dmy'),'24/08/2026')
  assert.equal(exporter.formatDate('2026-08-24','mdy'),'08/24/2026')
  assert.equal(exporter.formatDate('2026-08-24','iso'),'2026-08-24')
  assert.equal(exporter.formatDate('2026-08-24','dmy-dot'),'24.08.2026')
  assert.equal(exporter.formatDate('2026-02-30','iso'),'2026-02-30')
  assert.equal(exporter.formatDate('', 'iso'),'')
  assert.equal(exporter.formatDate('invalid', 'dmy'),'invalid')
})

test('the chosen date format applies to every date column', () => {
  inputs.selectedSource.checked=false
  inputs.scope.value='list'
  const source={tasks:{list:{id:'1',taskseries:[{
    id:'s',name:'One task',created:'2026-08-24',modified:'2026-08-25',
    task:{id:'201',due:'2026-08-26',start:'2026-08-27',
      completed:'2026-08-28',priority:'N'}
  }]}}}
  const rows=exporter.selectRows(exporter.normaliseResponse(source,new Map()))
  const priorFields=exporter.state.fields.map(field=>field.enabled)
  const dateFields=new Set(['due','start','completed','created','modified'])
  for(const field of exporter.state.fields)field.enabled=dateFields.has(field.id)
  const expected={
    dmy:['26/08/2026','27/08/2026','28/08/2026','24/08/2026','25/08/2026'],
    mdy:['08/26/2026','08/27/2026','08/28/2026','08/24/2026','08/25/2026'],
    iso:['2026-08-26','2026-08-27','2026-08-28','2026-08-24','2026-08-25'],
    'dmy-dot':['26.08.2026','27.08.2026','28.08.2026','24.08.2026','25.08.2026']
  }
  for(const [format,values] of Object.entries(expected)){
    inputs.dateFormat.value=format
    const out=exporter.headersAndValues(rows)
    const columns=['Due date','Start date','Completed date','Created date','Modified date']
    assert.deepEqual(columns.map(title=>out.values[0][out.headings.indexOf(title)]),values)
  }
  exporter.state.fields.forEach((field,index)=>field.enabled=priorFields[index])
  inputs.dateFormat.value='dmy'
})

test('timestamps use browser-local date instead of hard-coded UK timezone', () => {
  const timestamp='2026-08-24T23:00:00Z'
  const date=new Date(timestamp)
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
    year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(date).map(part=>[part.type,part.value]))
  assert.equal(exporter.formatDate(timestamp,'iso'),
    parts.year+'-'+parts.month+'-'+parts.day)
})

test('selected task checkbox overrides the List or Tag dropdown', () => {
  inputs.scope.value='tag'
  inputs.selectedSource.checked=false
  assert.equal(exporter.sourceMode(),'tag')
  inputs.selectedSource.checked=true
  assert.equal(exporter.sourceMode(),'selected')
  inputs.selectedSource.checked=false
  inputs.scope.value='list'
  assert.equal(exporter.sourceMode(),'list')
})

test('selected task mode ignores the current List or Tag value for retrieval', async () => {
  inputs.scope.value='tag'
  inputs.selectedSource.checked=true
  inputs.subtasks.checked=false
  inputs.completed.checked=false
  selectedRows=[root('Parent')]
  calls.length=0
  apiHandler=()=>({tasks:{list:{id:'1',taskseries:{
    id:'a',name:'Parent',task:{id:'100',completed:''}
  }}}})
  await exporter.retrieve({})
  assert.equal(calls.length,1)
  assert.match(calls[0].params.filter,/name:"Parent"/)
  assert.equal(exporter.state.selectedKey,'1:a:100')
  inputs.selectedSource.checked=false
})

test('source controls and all three checkboxes retain a fixed layout', async () => {
  const html=await readFile(new URL('../projects/export-builder/export.html',import.meta.url),'utf8')
  const css=await readFile(new URL('../projects/export-builder/export.css',import.meta.url),'utf8')

  // The controls are present regardless of the chosen source. Visibility
  // changes only for the optional browser-tab panel below the options.
  const source=html.indexOf('id="sourceControls"')
  const options=html.indexOf('class="options"')
  const selected=html.indexOf('id="selectedSource"')
  const nested=html.indexOf('id="subtasks"')
  const completed=html.indexOf('id="completed"')
  const panel=html.indexOf('id="selectionPanel"')

  assert.equal(source>=0 && source<options,true)
  assert.equal(options<selected && selected<nested && nested<completed,true)
  assert.equal(completed<panel,true)
  assert.match(css,/\.tab-row\s*\{[^}]*align-items:end/)
  assert.match(css,/\.options\s+label,\.field\s+label\s*\{[^}]*font-weight:400/)
})
