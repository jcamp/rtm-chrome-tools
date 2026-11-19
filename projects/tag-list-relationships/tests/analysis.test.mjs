// Run with: node --experimental-default-type=module --test tests/analysis.test.mjs
// These tests use invented API responses. No RTM account or API credentials needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tasksFromResponse, analyse, hasRecurrence } from '../analysis.js';

const sample = {
  tasks: {
    list: {
      id: '5',
      taskseries: [
        { id: '10', name: 'Repair camera', tags: { tag: ['camera', 'flat-1'] },
          task: [{ id: '100', completed: '', deleted: '' }, { id: '101', completed: '2026-11-01T10:00:00Z', deleted: '' }] },
        { id: '11', name: 'Untagged item', tags: {},
          task: { id: '102', completed: '', deleted: '' } }
      ]
    }
  }
};

test('incomplete and completed tasks are separated', () => {
  assert.equal(tasksFromResponse(sample, '5', false).length, 2);
  assert.equal(tasksFromResponse(sample, '5', true).length, 1);
});

test('tag and list counts use task instances', () => {
  const tasks = tasksFromResponse(sample, '5', false);
  const output = analyse([{ id: '5', name: 'Camera' }], ['camera', 'flat-1'], tasks, true);
  assert.equal(output.byList.get('5').incomplete, 2);
  assert.equal(output.byTag.get('camera').incomplete, 1);
  assert.equal(output.untagged.length, 1);
});

test('empty results do not invent tasks', () => {
  assert.deepEqual(tasksFromResponse({ tasks: {} }, '5', false), []);
});

test('duplicate task instances in one response are not counted twice', () => {
  const duplicated = structuredClone(sample);
  duplicated.tasks.list.taskseries.push(structuredClone(duplicated.tasks.list.taskseries[0]));
  assert.equal(tasksFromResponse(duplicated, '5', false).length, 2);
});

test('recurrence detected from rule rather than future due date', () => {
  assert.equal(hasRecurrence({ rrule: { every: '1', _content: 'FREQ=MONTHLY;INTERVAL=1' } }), true);
  assert.equal(hasRecurrence({ rrule: 'FREQ=DAILY;INTERVAL=1' }), true);
  assert.equal(hasRecurrence({ rrule: {} }), false);
  assert.equal(hasRecurrence({}), false);
  const response = {
    tasks: { list: { id: '5', taskseries: [
      { id: '20', name: 'Repeats', rrule: { every: '1', _content: 'FREQ=YEARLY' },
        task: { id: '200', due: '2027-12-01T00:00:00Z', completed: '' } },
      { id: '21', name: 'Future one-off',
        task: { id: '201', due: '2027-12-01T00:00:00Z', completed: '' } }
    ] } }
  };
  const tasks = tasksFromResponse(response, '5', false);
  assert.equal(tasks[0].recurring, true);
  assert.equal(tasks[1].recurring, false);
});
