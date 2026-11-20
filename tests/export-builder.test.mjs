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
const inputs = {
  scope: { value: 'all' }, target: { value: '' },
  subtasks: { checked: true }, completed: { checked: false }
};
const create = new Function('document', 'chrome', 'startAuthorisation', 'finishAuthorisation',
  'getLists', 'getTags', 'getTasksForList',
  body + '\nreturn { normaliseResponse, selectRows, headersAndValues, serialise, state };');
const exporter = create({ getElementById: id => inputs[id] || {} }, {},
  () => {}, () => {}, () => {}, () => {}, () => {});

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
  exporter.state.selectedIds = ['100','101'];
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
