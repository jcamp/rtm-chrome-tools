// Pure analysis functions. No Chrome APIs or network requests in this file.

// RTM returns a single object instead of an array when there is one item.
export function asArray(value) {
  return value == null ? [] : Array.isArray(value) ? value : [value];
}

export function normaliseTags(value) {
  return asArray(value).map(item => typeof item === 'string' ? item : item?.name || item?._content || '')
    .map(name => String(name).trim()).filter(Boolean);
}

// A task is identified by list, task series and task instance.
// We retain the parent ID for future hierarchy inspection.
export function tasksFromResponse(response, fallbackListId, expectedCompleted) {
  const tasks = [];
  const seen = new Set();
  for (const list of asArray(response.tasks?.list)) {
    const listId = String(list.id || fallbackListId);
    for (const series of asArray(list.taskseries)) {
      const tags = normaliseTags(series.tags?.tag);
      for (const task of asArray(series.task)) {
        if (task.deleted) continue;
        const completed = Boolean(task.completed);
        if (completed !== expectedCompleted) continue;
        const id = String(task.id || '');
        const key = listId + ':' + series.id + ':' + id;
        if (seen.has(key)) continue;
        seen.add(key);
        tasks.push({
          key, id, listId,
          name: String(series.name || '(untitled task)'),
          tags: [...new Set(tags)],
          completed,
          due: String(task.due || ''),
          parentId: String(series.parent_task_id || ''),
          url: String(series.url || '')
        });
      }
    }
  }
  return tasks;
}

export function analyse(lists, tags, tasks, complete) {
  const byList = new Map(lists.map(list => [String(list.id), { incomplete: 0, completed: 0 }]));
  const byTag = new Map(tags.map(tag => [tag.toLowerCase(), { incomplete: 0, completed: 0, lists: new Set() }]));
  const untagged = [];
  for (const task of tasks) {
    const list = byList.get(task.listId);
    if (list) list[task.completed ? 'completed' : 'incomplete']++;
    if (!task.tags.length) untagged.push(task);
    for (const tagName of new Set(task.tags.map(tag => tag.toLowerCase()))) {
      if (!byTag.has(tagName)) byTag.set(tagName, { incomplete: 0, completed: 0, lists: new Set() });
      const tag = byTag.get(tagName);
      tag[task.completed ? 'completed' : 'incomplete']++;
      tag.lists.add(task.listId);
    }
  }

  const tagSuggestions = [];
  for (const tag of tags) {
    const entry = byTag.get(tag.toLowerCase());
    const total = (entry?.incomplete || 0) + (entry?.completed || 0);
    if (total === 0) tagSuggestions.push({ type: 'No matching tasks', tag, detail: 'No matching tasks in the selected statuses' });
    if (total === 1) tagSuggestions.push({ type: 'Single-task tag', tag, detail: 'Used by 1 task' });
    if (entry?.lists.size === 1 && total) {
      const list = lists.find(item => String(item.id) === [...entry.lists][0]);
      if (list) tagSuggestions.push({ type: 'Single-list tag', tag, detail: 'Used only in ' + list.name });
    }
  }

  // Group simple numbered variants without assuming they mean the same thing.
  const groups = new Map();
  for (const tag of tags) {
    const stem = tag.toLowerCase().replace(/[-_ ]+\d+$/, '');
    if (!groups.has(stem)) groups.set(stem, []);
    groups.get(stem).push(tag);
  }
  for (const group of groups.values()) {
    if (group.length > 1) {
      for (const tag of group) {
        tagSuggestions.push({ type: 'Similar names', tag, detail: group.join(', ') });
      }
    }
  }

  // Partial data makes zero counts, unused tags and single-list findings uncertain.
  return {
    byList, byTag, untagged,
    suggestions: complete ? tagSuggestions : tagSuggestions.filter(item => item.type === 'Similar names'),
    complete
  };
}
