// Dependency-free export engine tests. Run: node --test tests/export-builder.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Evaluate the browser module with a stubbed document so pure helper functions can
// be checked without starting Chrome or contacting RTM.
const file = new URL('../projects/export-builder/export.js', import.meta.url);
const original = await readFile(file, 'utf8');
const body = original
  .replace(/^import .*?;$/gm, '')
  .replace(/init\(\)\.catch\(.*?\);\s*$/s, '');
const apiCalls = [];
let apiHandler = () => ({rsp:{stat:'ok'}});
const call = async (method,params) => { apiCalls.push({method,params}); return apiHandler(method,params); };
const inputs = {
  scope: { value: 'all' }, target: { value: '' },
  subtasks: { checked: true }, completed: { checked: false },
  rtmTab: {value:'9'}
};
const create = new Function('document', 'chrome', 'startAuthorisation', 'finishAuthorisation',
  'getLists', 'getTags', 'getTasksForList', 'call',
  body + '\nreturn { normaliseResponse, selectRows, headersAndValues, serialise, state, matchSelectedTasks, retrieve };');
const exporter = create({getElementById:id=>inputs[id]||{}}, {
  tabs:{query:async()=>[{id:9,url:'https://www.rememberthemilk.com/app/'}]},
  scripting:{executeScript:async()=>[{result:{checked:2,rows:[
    {text:'Get ink',exactTexts:['Get ink']},
    {text:'Pay rent',exactTexts:['Pay rent']}
  ]}}]}
},()=>{},()=>{},()=>{},()=>{},()=>{},call);

const response = { tasks: { list: { id: '1', taskseries: [
  { id: 'a', name: 'Parent', task: { id: '100', completed: '' } },
  { id: 'b', name: 'Child', parent_task_id: '100',
    notes: { note: { title: 'Info', _content: 'Line 1\nLine 2' } },
    task: { id: '101', completed: '' } },
  { id: 'c', name: 'Grandchild', parent_task_id: '101',
    task: { id: '102', completed: '' } }
] } } };

test('recursive hierarchy creates separate columns', () => {
  const data = exporter.normaliseResponse(response, new Map([['1','Inbox']]));
  const rows = exporter.selectRows(data);
  assert.deepEqual(rows.map(row => row.level), [0,1,2]);
  const out = exporter.headersAndValues(rows);
  assert.deepEqual(out.headings.slice(0,3), ['Task','Subtask 1','Subtask 2']);
  assert.deepEqual(out.values.map(row => row.slice(0,3)),
    [['Parent','',''],['','Child',''],['','','Grandchild']]);
});

test('selected parent and descendant are exported once', () => {
  const data = exporter.normaliseResponse(response, new Map());
  inputs.scope.value = 'selected';
  exporter.state.selectedKeys = ['1:a:100','1:b:101'];
  const rows = exporter.selectRows(data);
  assert.deepEqual(rows.map(row => row.id), ['100','101','102']);
  inputs.scope.value = 'all';
});

test('notes preserve multiline text and quote delimiters', () => {
  const data = exporter.normaliseResponse(response, new Map());
  assert.equal(data[1].notes[0].body, 'Line 1\nLine 2');
  const csv = exporter.serialise(['Name','Notes'], [['a,b','one\n"two"']], 'csv');
  assert.equal(csv, 'Name,Notes\r\n"a,b","one\n""two"""\r\n');
});

test('spreadsheet formulas are text-protected', () => {
  const csv = exporter.serialise(['Task'], [['=1+1'], ['+CMD'], ['Normal']], 'csv');
  assert.match(csv, /'=1\+1/);
  assert.match(csv, /'\+CMD/);
  assert.match(csv, /Normal/);
});

test('UK dates use local calendar day and omit time', () => {
  const data = {tasks:{list:{id:'1',taskseries:[
    {id:'summer',name:'Summer due',task:{id:'201',due:'2026-08-24T23:00:00Z',priority:'N'}},
    {id:'winter',name:'Winter due',task:{id:'202',due:'2026-11-25T00:00:00Z',priority:'1'}}
  ]}}};
  const rows = exporter.selectRows(exporter.normaliseResponse(data,new Map()));
  const out = exporter.headersAndValues(rows);
  const due = out.headings.indexOf('Due date');
  const priority = out.headings.indexOf('Priority');
  assert.deepEqual(out.values.map(row=>row[due]),['25/08/2026','25/11/2026']);
  assert.deepEqual(out.values.map(row=>row[priority]),['None','1']);
});

test('RTM JSON content note is included without inventing empty notes', () => {
  const source={tasks:{list:{id:'1',taskseries:[
    {id:'with',name:'With notes',notes:{note:[{title:'Memo',content:'First line\\nSecond line'}]},task:{id:'301'}},
    {id:'without',name:'Without notes',notes:{},task:{id:'302'}}
  ]}}};
  const rows=exporter.normaliseResponse(source,new Map());
  assert.deepEqual(rows[0].notes,[{title:'Memo',body:'First line\\nSecond line'}]);
  assert.deepEqual(rows[1].notes,[]);
});

test('selected task row matches a unique API task title', () => {
  const records=[{id:'101',name:'Repair camera'}, {id:'102',name:'Post invoice'}];
  const selected=[{text:'Repair camera workshop Today',exactTexts:['Repair camera','workshop']}];
  assert.deepEqual(exporter.matchSelectedTasks(selected,records),['::101']);
});

test('selected task matching prefers the longest exact title', () => {
  const records=[{id:'1',name:'Pay'}, {id:'2',name:'Pay rent'}];
  const selected=[{text:'Pay rent Today',exactTexts:['Pay rent']}];
  assert.deepEqual(exporter.matchSelectedTasks(selected,records),['::2']);
});

test('selected task matching rejects genuinely duplicated titles and missing titles', () => {
  const records=[{id:'1',name:'Pay rent'}, {id:'2',name:'Pay rent'}];
  const selected=[{text:'Pay rent Today',exactTexts:['Pay rent']}];
  assert.throws(()=>exporter.matchSelectedTasks(selected,records),/Selected row/);
  assert.throws(()=>exporter.matchSelectedTasks(
    [{text:'Missing task Today',exactTexts:['Missing task']}],records),/Selected row/);
});

test('selected recurring task prefers its unique incomplete instance', () => {
  const records=[
    {id:'11',name:'National Trust Payment',completed:true},
    {id:'12',name:'National Trust Payment',completed:false}
  ];
  const chosen=[{text:'National Trust Payment yearly',exactTexts:['National Trust Payment']}];
  assert.deepEqual(exporter.matchSelectedTasks(chosen,records),['::12']);
});

test('selected task refuses multiple incomplete records with same name', () => {
  const records=[
    {id:'11',name:'National Trust Payment',completed:false},
    {id:'12',name:'National Trust Payment',completed:false}
  ];
  assert.throws(()=>exporter.matchSelectedTasks(
    [{text:'National Trust Payment',exactTexts:['National Trust Payment']}],records),/Selected row/);
});

test('four selected rows map independently and in screen order', () => {
  const records=[
    {id:'40',name:'Pay rent',completed:false},
    {id:'10',name:'National Trust Payment',completed:false},
    {id:'20',name:'Get ink',completed:false},
    {id:'30',name:'Call solicitor',completed:false}
  ];
  const selection=[
    {text:'Get ink Today',exactTexts:['Get ink','Today']},
    {text:'Pay rent Tomorrow',exactTexts:['Pay rent','Tomorrow']},
    {text:'Call solicitor Friday',exactTexts:['Call solicitor','Friday']},
    {text:'National Trust Payment annually',exactTexts:['National Trust Payment','annually']}
  ];
  assert.deepEqual(exporter.matchSelectedTasks(selection,records),['::20','::40','::30','::10']);
});

test('unrelated row text must not match shorter API task title', () => {
  const records=[{id:'1',name:'Pay rent',completed:false}];
  assert.throws(()=>exporter.matchSelectedTasks(
    [{text:'Pay rent every month',exactTexts:['Pay rent every month']}],records),/Selected row/);
});

test('selected task identity never matches another list with the same task ID', () => {
  inputs.scope.value='selected';
  inputs.subtasks.checked=false;
  exporter.state.selectedKeys=['1:a:10'];
  const rows=[
    {key:'1:a:10',listId:'1',seriesId:'a',id:'10',parentId:'',name:'A'},
    {key:'2:b:10',listId:'2',seriesId:'b',id:'10',parentId:'',name:'B'}
  ];
  assert.deepEqual(exporter.selectRows(rows).map(row=>row.name),['A']);
  inputs.scope.value='all';
  inputs.subtasks.checked=true;
});

test('selected rows preserve checkbox order even when API order differs', () => {
  inputs.scope.value='selected';
  inputs.subtasks.checked=false;
  exporter.state.selectedKeys=['1:b:2','1:a:1'];
  const rows=[
    {key:'1:a:1',listId:'1',seriesId:'a',id:'1',parentId:'',name:'First'},
    {key:'1:b:2',listId:'1',seriesId:'b',id:'2',parentId:'',name:'Second'}
  ];
  assert.deepEqual(exporter.selectRows(rows).map(row=>row.name),['Second','First']);
  inputs.scope.value='all';
  inputs.subtasks.checked=true;
});

test('task hierarchy does not attach a child from another list', () => {
  inputs.scope.value='selected';
  inputs.subtasks.checked=true;
  exporter.state.selectedKeys=['1:a:1'];
  const rows=[
    {key:'1:a:1',listId:'1',seriesId:'a',id:'1',parentId:'',name:'Parent'},
    {key:'2:b:2',listId:'2',seriesId:'b',id:'2',parentId:'1',name:'Unrelated'}
  ];
  assert.deepEqual(exporter.selectRows(rows).map(row=>row.name),['Parent']);
  inputs.scope.value='all';
});

test('selected tasks use name-scoped requests, not whole-account scans', async () => {
  inputs.scope.value='selected';
  inputs.subtasks.checked=false;
  inputs.completed.checked=false;
  apiCalls.length=0;
  apiHandler=(method,params)=>{
    const title=params.filter.includes('Get ink')?'Get ink':'Pay rent';
    const id=title==='Get ink'?'100':'101';
    return {tasks:{list:{id:'1',taskseries:{id,title,name:title,task:{id}}}}};
  };
  exporter.state.lists=[{id:'1',name:'Inbox'}];
  const rows=await exporter.retrieve({apiKey:'test',secret:'test',token:'test'});
  assert.deepEqual(exporter.state.selectedKeys,['1:100:100','1:101:101']);
  assert.equal(apiCalls.length,2);
  assert.equal(apiCalls.every(entry=>entry.params.filter.includes('name:')),true);
  assert.equal(rows.length,2);
  inputs.scope.value='all';
  inputs.subtasks.checked=true;
});

test('list-only fetch uses list_id and propagates API failures', async () => {
  inputs.scope.value='list';
  inputs.target.value='1';
  inputs.completed.checked=false;
  exporter.state.lists=[{id:'1',name:'Inbox'}];
  apiCalls.length=0;
  apiHandler=()=>{throw new Error('RTM HTTP error 502');};
  let failed=false;
  try{await exporter.retrieve({apiKey:'test'})}catch(error){
    failed=error.message.includes('502');
  }
  assert.equal(failed,true);
  assert.equal(apiCalls.length,1);
  assert.equal(apiCalls[0].params.list_id,'1');
  inputs.scope.value='all';
});
