// RTM Export Builder. Read-only API and local spreadsheet generation.
import { startAuthorisation, finishAuthorisation, getLists, getTags, getTasksForList, call } from './rtm.js';

const $ = id => document.getElementById(id);
const asArray = value => value == null ? [] : Array.isArray(value) ? value : [value];
const FIELDS = [
  ['hierarchy','Task hierarchy'],['list','List'],['due','Due date'],['priority','Priority'],
  ['status','Status'],['tags','Tags'],['start','Start date'],['completed','Completed date'],
  ['created','Created date'],['modified','Modified date'],['estimate','Time estimate'],
  ['location','Location ID'],['postponed','Postponed count'],['recurrence','Recurrence'],
  ['notes','Notes'],['noteCount','Note count'],['url','Task URL'],
  ['taskId','Task ID'],['parentId','Parent task ID'],['level','Hierarchy level (0 = root)']
];
const DEFAULT_FIELDS = ['hierarchy','list','due','priority','status','tags'];
const state = { lists: [], tags: [], fields: FIELDS.map(([id,label]) => ({ id,label,enabled:DEFAULT_FIELDS.includes(id) })),
  records: null, output: null, dragging: null, selectedKey: '', selectedRow: null };

function message(text) { $('status').textContent = text; }
// The selected task checkbox overrides the List/Tag source dropdown.
function sourceMode() { return $('selectedSource').checked ? 'selected' : $('scope').value; }
async function credentials() { return chrome.storage.local.get(['apiKey','secret','token','username']); }
async function savePreferences() {
  await chrome.storage.local.set({ exportPreferences: {
    fields: state.fields.map(({id,enabled}) => ({id,enabled})),
    scope:$('scope').value, selectedSource:$('selectedSource').checked,
    subtasks:$('subtasks').checked, completed:$('completed').checked, format:$('format').value
  } });
}
function restoreFields(saved) {
  if (!Array.isArray(saved)) return;
  const map = new Map(state.fields.map(item => [item.id,item]));
  const ordered = [];
  for (const item of saved) if (map.has(item.id)) {
    ordered.push({ ...map.get(item.id), enabled: Boolean(item.enabled) });
    map.delete(item.id);
  }
  state.fields = [...ordered,...map.values()];
}
function markStale() {
  state.output = null;
  $('copy').disabled = true;
  $('download').disabled = true;
  $('summary').textContent = '';
  $('head').replaceChildren();
  $('rows').replaceChildren();
  message('Settings changed. Select Preview to prepare the export.');
  savePreferences().catch(error => message(error.message));
}
function renderFields() {
  $('fields').replaceChildren();
  for (const field of state.fields) {
    const row = document.createElement('div');
    row.className = 'field'; row.draggable = true; row.dataset.id = field.id;
    const handle = document.createElement('span'); handle.className = 'handle'; handle.textContent = '☰';
    handle.title = 'Drag to reorder'; row.append(handle);
    const label = document.createElement('label');
    const box = document.createElement('input'); box.type='checkbox'; box.checked=field.enabled;
    box.addEventListener('change', () => { field.enabled = box.checked; markStale(); });
    label.append(box, document.createTextNode(field.label)); row.append(label);
    row.addEventListener('dragstart', event => { state.dragging=field.id; row.classList.add('dragging'); event.dataTransfer.effectAllowed='move'; });
    row.addEventListener('dragend', () => { state.dragging=null; row.classList.remove('dragging'); });
    row.addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect='move'; });
    row.addEventListener('drop', event => {
      event.preventDefault(); const from=state.fields.findIndex(x=>x.id===state.dragging);
      const to=state.fields.findIndex(x=>x.id===field.id);
      if(from<0||to<0||from===to)return;
      const [moved]=state.fields.splice(from,1); state.fields.splice(to,0,moved);
      renderFields(); markStale();
    });
    $('fields').append(row);
  }
}
function updateTargets() {
  const scope=sourceMode();
  $('sourceControls').hidden = scope==='selected';
  $('selectionPanel').hidden = scope!=='selected';
  if (scope==='selected') refreshTabs().catch(error => message('Cannot list RTM tabs: '+error.message));
  const choices=scope==='tag' ? state.tags.map(tag=>({id:tag,name:tag})) : state.lists;
  const old=$('target').value;
  $('target').replaceChildren();
  for(const item of choices){
    const option=document.createElement('option');option.value=String(item.id);option.textContent=item.name;
    $('target').append(option);
  }
  if(choices.some(item=>String(item.id)===old)) $('target').value=old;
}
async function loadLists() {
  const auth=await credentials();
  if(!auth.token) { $('setup').hidden=false;$('connected').hidden=true;message('Connect to RTM to begin.');return; }
  $('setup').hidden=true;$('connected').hidden=false;$('username').textContent=auth.username||'RTM user';
  state.lists=await getLists(auth);
  state.tags=await getTags(auth);
  updateTargets();
  message('Ready to preview.');
}
function normaliseTags(value) {
  return asArray(value).map(tag=>typeof tag==='string'?tag:tag?.name||tag?._content||'').filter(Boolean);
}
function plainNote(note) {
  if (typeof note === 'string') return note;
  // RTM JSON uses content. Retain compatibility with other known serialisations.
  const value=note?.content??note?._content??note?.text??note?.['$t']??'';
  return typeof value === 'string' ? value : String(value ?? '');
}
function ukDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}
function taskPriority(value) {
  const text=String(value??'').trim();
  return text === 'N' || text === '0' ? 'None' : text;
}
function normaliseResponse(response, names) {
  const rows=[];const seen=new Set();
  for(const list of asArray(response.tasks?.list)){
    const listId=String(list.id||'');
    for(const series of asArray(list.taskseries)){
      for(const task of asArray(series.task)){
        if(task.deleted)continue;
        const id=String(task.id||''); if(!id)continue;
        const key=listId+':'+String(series.id||'')+':'+id;
        if(seen.has(key))continue;seen.add(key);
        const notes=asArray(series.notes?.note).filter(note=>note != null).map(note=>({
          title:String(note.title||''), body:plainNote(note)
        }));
        rows.push({key,id,listId,seriesId:String(series.id||''),
          name:String(series.name||'(untitled task)'),list:names.get(listId)||listId,
          parentId:String(series.parent_task_id||''),tags:normaliseTags(series.tags?.tag),
          completed:Boolean(task.completed),completedAt:String(task.completed||''),
          due:String(task.due||''),start:String(task.start||''),created:String(series.created||''),
          modified:String(series.modified||''),estimate:String(task.estimate||''),
          location:String(series.location_id||''),postponed:String(task.postponed??''),
          recurrence:typeof series.rrule==='string'?series.rrule:String(series.rrule?._content||series.rrule?.rule||''),
          priority:taskPriority(task.priority),notes,url:String(series.url||'')});
      }
    }
  }
  return rows;
}
// A user must explicitly identify the RTM tab whose selection should be exported.
async function refreshTabs() {
  const old = $('rtmTab').value;
  const tabs = await chrome.tabs.query({url:'https://www.rememberthemilk.com/*'});
  const candidates = tabs.filter(tab => tab.url?.includes('/app/'));
  $('rtmTab').replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose an open RTM tab';
  $('rtmTab').append(placeholder);
  for (const tab of candidates) {
    const option = document.createElement('option');
    option.value = String(tab.id);
    // The title distinguishes multiple RTM tabs showing different lists.
    option.textContent = (tab.title || 'Remember The Milk') + ' (tab ' + tab.id + ')';
    $('rtmTab').append(option);
  }
  if (candidates.some(tab => String(tab.id) === old)) $('rtmTab').value = old;
  else $('rtmTab').value = '';
  if (!candidates.length) message('No open RTM app tab found. Open RTM and refresh tabs.');
}
// Inspect selected checkbox structure without returning task names or other private content.
// Only tag names, class names and attribute *names* are returned.
async function inspectSelection() {
  const tabId = Number($('rtmTab').value);
  if (!Number.isSafeInteger(tabId) || tabId <= 0) throw new Error('Choose an RTM tab first.');
  const tabs = await chrome.tabs.query({url:'https://www.rememberthemilk.com/*'});
  if (!tabs.some(tab => tab.id === tabId && tab.url?.includes('/app/'))) {
    throw new Error('RTM tab not found. Refresh the tab list.');
  }
  const result=await chrome.scripting.executeScript({target:{tabId},func:() => {
    const selectors = [
      'input[type="checkbox"]',
      'input[type="checkbox"]:checked',
      '[role="checkbox"]',
      '[role="checkbox"][aria-checked="true"]',
      '[aria-selected="true"]',
      '[data-task-id]',
      '[data-task-id].selected',
      '[class*="selected"]',
      '[class*="checked"]'
    ];
    const counts=Object.fromEntries(selectors.map(selector=>[selector,document.querySelectorAll(selector).length]));
    // Inspect actual checked checkboxes, not unrelated aria-selected controls.
    const checked=[...document.querySelectorAll('[role="checkbox"][aria-checked="true"]')];
    const unchecked=[...document.querySelectorAll('[role="checkbox"][aria-checked="false"]')];
    const examples=[...checked.slice(0,5),...unchecked.slice(0,1)];
    const structure=examples.map((node,index)=>{
      const chain=[];let current=node;
      for(let depth=0;depth<9&&current;depth++,current=current.parentElement){
        const id=current.getAttribute('id')||'';
        chain.push({
          tag:current.tagName.toLowerCase(),
          classes:[...current.classList].slice(0,9),
          role:current.getAttribute('role')||'',
          ariaChecked:current.getAttribute('aria-checked'),
          ariaSelected:current.getAttribute('aria-selected'),
          idShape:id ? (id.replace(/[0-9]/g,'#').slice(0,100)) : '',
          idIsNumeric:/^\\d+$/.test(id),
          hasDataTaskId:current.hasAttribute('data-task-id'),
          attributeNames:[...current.attributes].map(attr=>attr.name).filter(name=>!name.startsWith('on')).slice(0,16)
        });
      }
      return {kind:index<checked.slice(0,5).length?'checked':'unchecked',chain};
    });
    return {checkedCheckboxes:checked.length,uncheckedCheckboxes:unchecked.length,
      note:'No task titles, ID values or note text are included.',counts,structure};
  }});
  const report=result[0]?.result||{};
  // Explicit diagnostic only. The report includes selected row text, which
  // can contain private task titles. Never send or copy it automatically.
  const rows=await selectedTaskRows();
  report.selectionCandidates=rows.map((row,index)=>{
    const fragments=row.exactTexts
      .map(value=>String(value).replace(/\\s+/g,' ').trim())
      .filter(value=>value.length>=4&&value.length<=250)
      .sort((a,b)=>b.length-a.length);
    return {
      row:index+1,
      fragments:row.exactTexts.slice(0,20),
      lookupHint:fragments[0]||null,
      hintMatchesOneFragment:fragments.includes(fragments[0])
    };
  });
  report.privacy='Selected task titles and row text may be included. Review before sharing.';
  return JSON.stringify(report,null,2);
}
async function runSelectionInspection() {
  try {
    const report=await inspectSelection();
    $('selectionDiagnostic').textContent=report;
    $('selectionDiagnostic').hidden=false;
    $('copyInspection').hidden=false;
    message('Diagnostic captured. Review selected task titles before copying or sharing.');
  } catch(error) {
    message('Selection inspection failed: '+error.message);
  }
}
// RTM uses checked custom controls inside selected task rows, not data-task-id.
// Capture row text locally, then match task names against the RTM API response.
// Ambiguous or unmatched rows are rejected. Never export a guessed task.
async function selectedTaskRows() {
  const tabId=Number($('rtmTab').value);
  if (!Number.isSafeInteger(tabId) || tabId <= 0) {
    throw new Error('Choose the RTM tab containing your selected tasks.');
  }
  const tabs=await chrome.tabs.query({url:'https://www.rememberthemilk.com/*'});
  if (!tabs.some(tab=>tab.id===tabId && tab.url?.includes('/app/'))) {
    throw new Error('The chosen RTM tab has closed. Refresh tabs and select it again.');
  }
  const injected=await chrome.scripting.executeScript({target:{tabId},func:()=>{
    // The checked control and its nearest role=option parent were confirmed
    // against the supplied RTM selection diagnostics (November 2026).
    const boxes=[...document.querySelectorAll('[role="checkbox"][aria-checked="true"]')];
    const rows=[];
    for(const box of boxes){
      const row=box.closest('[role="option"][aria-selected="true"]');
      if(!row) continue;
      // Text content stays in extension memory and is never sent anywhere
      // other than the local matching routine.
      const text=row.textContent.replace(/\s+/g,' ').trim();
      // Extract direct text nodes, rather than aggregated text from every
      // ancestor. Aggregated text can include other titles, tags and controls.
      const exactTexts=[];
      const walker=document.createTreeWalker(row,NodeFilter.SHOW_TEXT);
      while(walker.nextNode()){
        const node=walker.currentNode;
        if(node.parentElement?.closest('[role="checkbox"]'))continue;
        const value=(node.nodeValue||'').replace(/\s+/g,' ').trim();
        if(value && value.length<=500 && !exactTexts.includes(value))exactTexts.push(value);
      }
      rows.push({text, exactTexts});
    }
    return {checked:boxes.length,rows};
  }});
  const selection=injected[0]?.result;
  if(selection?.checked!==1 || selection.rows?.length!==1) {
    throw new Error('Select exactly one RTM task, not '+(selection?.checked??0)+'.');
  }
  return selection.rows[0];
}
// Resolve exactly one checked RTM task to one complete task identity.
// Never assume a title is unique across lists or recurring instances.
function matchSelectedTask(chosen,records) {
  const normalise=value=>String(value||'').replace(/\s+/g,' ').trim();
  const fragments=new Set(chosen.exactTexts.map(normalise).filter(Boolean));
  let matches=records.filter(record=>fragments.has(normalise(record.name)));
  if(matches.length){
    const longest=Math.max(...matches.map(row=>normalise(row.name).length));
    matches=matches.filter(row=>normalise(row.name).length===longest);
  }
  const unique=new Map(matches.map(row=>[row.key,row]));
  matches=[...unique.values()];
  if(matches.length>1){
    const incomplete=matches.filter(row=>!row.completed);
    if(incomplete.length===1)matches=incomplete;
  }
  if(matches.length!==1){
    const detail=matches.length
      ? matches.length+' different task records matched.'
      : 'The selected task title was not found in the API results.';
    throw new Error(detail+' Export stopped rather than guessing.');
  }
  return matches[0].key;
}
async function retrieve(auth) {
  const scope = sourceMode();
  const includeCompleted = $('completed').checked;
  const includeChildren = $('subtasks').checked;
  const names = new Map(state.lists.map(list => [String(list.id), list.name]));
  const statuses = includeCompleted ? [false, true] : [false];
  const results = [];

  // Each request is deliberately scoped. A failed request must be reported
  // rather than silently scanning every list in the account.
  async function fetchStatus(parameters, completed) {
    const filter = completed ? 'status:completed' : 'status:incomplete';
    const opts = { ...parameters, filter: parameters.filter ? parameters.filter + ' AND ' + filter : filter };
    let response;
    try {
      response = await call('rtm.tasks.getList', opts, auth);
    } catch (error) {
      if (error instanceof TypeError && /fetch/i.test(error.message)) {
        throw new Error('Could not reach the RTM API for this request. Check your connection and retry. No other lists were scanned.');
      }
      throw new Error('RTM rejected the requested task data: ' + error.message);
    }
    return normaliseResponse(response, names).filter(row => row.completed === completed);
  }

  if (scope === 'list') {
    const listId = $('target').value;
    if (!state.lists.some(list => String(list.id) === listId)) throw new Error('Select a list first.');
    for (const completed of statuses) {
      message('Retrieving ' + (completed ? 'completed' : 'incomplete') + ' tasks from the selected list…');
      results.push(...await fetchStatus({list_id:listId}, completed));
    }
    return results;
  }

  if(scope==='selected') {
    state.selectedRow=await selectedTaskRows();
    const candidates=state.selectedRow.exactTexts
      .map(value=>String(value).replace(/\s+/g,' ').trim())
      .filter(value=>value.length>=4 && value.length<=250)
      .sort((a,b)=>b.length-a.length);
    const hint=candidates[0];
    if(!hint)throw new Error('The selected RTM task has no readable title.');
    const safeHint=hint.replace(/\\/g,'\\\\').replace(/"/g,'\\"');
    for(const completed of statuses){
      message('Looking up the selected RTM task…');
      results.push(...await fetchStatus({filter:'name:"'+safeHint+'"'},completed));
    }
    const unique=new Map(results.map(row=>[row.key,row]));
    state.selectedKey=matchSelectedTask(state.selectedRow,[...unique.values()]);
    if(!includeChildren)return [...unique.values()];

    // Fetch descendants only from the chosen task's list.
    const chosen=unique.get(state.selectedKey);
    message('Loading nested subtasks from '+chosen.list+'…');
    for(const completed of statuses){
      for(const row of await fetchStatus({list_id:chosen.listId},completed)){
        unique.set(row.key,row);
      }
    }
    return [...unique.values()];
  }

  if (scope === 'tag') {
    const tag = $('target').value;
    if (!tag) throw new Error('Select a tag first.');
    // Double quotes are escaped for RTM's advanced-search syntax.
    const tagFilter = 'tag:"' + tag.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    for (const completed of statuses) {
      message('Retrieving tasks tagged ' + tag + ' (' + (completed ? 'completed' : 'incomplete') + ')…');
      results.push(...await fetchStatus({filter:tagFilter}, completed));
    }
    if (!includeChildren || !results.length) return results;

    // Tagged roots may have untagged descendants. Retrieve only the lists
    // containing matched tasks. Never scan unrelated lists.
    const matchingListIds = [...new Set(results.map(row => row.listId))];
    const listResults = [];
    for (let index = 0; index < matchingListIds.length; index++) {
      const listId = matchingListIds[index];
      message('Retrieving subtask context from list ' + (index + 1) + ' of ' + matchingListIds.length + '…');
      for (const completed of statuses) {
        listResults.push(...await fetchStatus({list_id:listId}, completed));
      }
    }
    return listResults;
  }


  throw new Error('Unknown export source.');
}
function selectRows(records) {
  const scope=sourceMode();
  const includeChildren=$('subtasks').checked;
  const selectedKey=state.selectedKey;
  const byScopedId=new Map();
  const children=new Map();

  // RTM task identity includes its list. A parent ID in another list
  // must never be treated as the parent of this task.
  const scopedId=row=>row.listId+':'+row.id;
  const scopedParent=row=>row.listId+':'+row.parentId;
  for(const row of records){
    if(!byScopedId.has(scopedId(row)))byScopedId.set(scopedId(row),row);
    if(row.parentId){
      const parent=scopedParent(row);
      if(!children.has(parent))children.set(parent,[]);
      children.get(parent).push(row);
    }
  }
  const isMatch=row=>scope==='list'||
    (scope==='tag'&&row.tags.some(t=>t.toLowerCase()===$('target').value.toLowerCase()))||
    (scope==='selected'&&selectedKey===row.key);
  const matched=records.filter(isMatch);

  const output=[],visited=new Set();
  function visit(row,level) {
    if(visited.has(row.key))return;
    visited.add(row.key);
    output.push({...row,level});
    if(includeChildren){
      for(const child of children.get(scopedId(row))||[])visit(child,level+1);
    }
  }
  const matching=new Set(matched.map(row=>row.key));
  for(const row of matched){
    let parent=scopedParent(row),hasSelectedAncestor=false;
    const guard=new Set();
    while(row.parentId&&byScopedId.has(parent)&&!guard.has(parent)){
      guard.add(parent);
      const ancestor=byScopedId.get(parent);
      if(matching.has(ancestor.key)){hasSelectedAncestor=true;break;}
      if(!ancestor.parentId)break;
      parent=scopedParent(ancestor);
    }
    if(!hasSelectedAncestor || !includeChildren)visit(row,0);
  }
  for(const row of matched)if(!visited.has(row.key))visit(row,0);
  return output;
}
function headersAndValues(rows) {
  const fields=state.fields.filter(field=>field.enabled);
  if(!fields.length)throw new Error('Select at least one field.');
  const depth=rows.reduce((n,row)=>Math.max(n,row.level),0);
  const headings=[],accessors=[];
  for(const field of fields){
    if(field.id==='hierarchy'){
      for(let level=0;level<=depth;level++){
        headings.push(level?'Subtask '+level:'Task');
        accessors.push(row=>row.level===level?row.name:'');
      }
    } else {
      headings.push(field.label);
      accessors.push(row=> {
        switch(field.id){
          case 'status':return row.completed?'Complete':'Incomplete';
          case 'tags':return row.tags.join(', ');
          case 'notes':return row.notes.map(note=>(note.title?note.title+'\n':'')+note.body).join('\n\n-----\n\n');
          case 'noteCount':return String(row.notes.length);
          case 'taskId':return row.id;
          case 'parentId':return row.parentId;
          case 'level':return String(row.level);
          case 'completed':return ukDate(row.completedAt);
          case 'due':case 'start':case 'created':case 'modified':return ukDate(row[field.id]);
          default:return row[field.id]??'';
        }
      });
    }
  }
  return { headings, values:rows.map(row=>accessors.map(get=>String(get(row)))) , depth };
}
// Spreadsheet applications may interpret leading formula characters as expressions.
// Prefix a single quote to force text, including when leading whitespace precedes it.
function safeCell(value) {
  const text=String(value??'');
  return /^[\s\uFEFF]*[=+@\-]/.test(text)?"'"+text:text;
}
function serialise(headings,rows,format) {
  const delimiter=format==='csv'?',':'\t';
  function escape(value) {
    const text=safeCell(value);
    if(/[\t\r\n",]/.test(text) && (format==='csv'||/[\t\r\n"]/.test(text)))
      return '"'+text.replace(/"/g,'""')+'"';
    return text;
  }
  return [headings,...rows].map(row=>row.map(escape).join(delimiter)).join('\r\n')+'\r\n';
}
function renderPreview(output) {
  $('head').replaceChildren();$('rows').replaceChildren();
  const header=document.createElement('tr');
  for(const title of output.headings){const th=document.createElement('th');th.textContent=title;header.append(th);}
  $('head').append(header);
  for(const line of output.values.slice(0,10)){
    const tr=document.createElement('tr');
    for(const value of line){const td=document.createElement('td');td.textContent=value.length>350?value.slice(0,350)+'…':value;tr.append(td);}
    $('rows').append(tr);
  }
  $('summary').textContent=output.values.length+' tasks · '+output.headings.length+' columns · deepest subtask level '+output.depth+' · showing up to 10 rows.';
}
async function preview() {
  if(state.running)return;state.running=true;
  $('preview').disabled=true;$('copy').disabled=true;$('download').disabled=true;
  state.output=null;
  try{
    const auth=await credentials();
    if(!auth.token)throw new Error('Please connect to RTM first.');
    const records=await retrieve(auth);
    const rows=selectRows(records);
    const result=headersAndValues(rows);
    state.output=result;renderPreview(result);
    if(state.fields.some(field=>field.id==='notes'&&field.enabled)) {
      const noteCount=rows.reduce((n,row)=>n+row.notes.length,0);
      $('summary').textContent += ' Notes returned by RTM: '+noteCount+'.';
      if(noteCount===0)message('No note data was returned for the selected tasks. Check a task known to have notes.');
    }
    $('copy').disabled=false;$('download').disabled=false;
    if (!($('summary').textContent.includes('Notes returned by RTM: 0.'))) message('Ready. No RTM tasks have been changed.');
  }catch(error){message('Export could not be prepared: '+error.message);}
  finally{state.running=false;$('preview').disabled=false;}
}
async function copy() {
  if(!state.output)return;
  try{await navigator.clipboard.writeText(serialise(state.output.headings,state.output.values,'tsv'));message('Copied full tab-delimited export to clipboard.');}
  catch(error){message('Clipboard failed: '+error.message);}
}
async function download(){
  if(!state.output)return;
  try{
    const format=$('format').value;
    const body='\uFEFF'+serialise(state.output.headings,state.output.values,format);
    const blob=new Blob([body],{type:'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const name='rtm-export-'+new Date().toISOString().slice(0,10)+'.'+format;
    const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    message('Download requested: '+name);
  }catch(error){message('Download failed: '+error.message);}
}
async function connectStart() {
  try {
    const auth={apiKey:$('apiKey').value.trim(),secret:$('secret').value.trim()};
    if(!auth.apiKey||!auth.secret)throw new Error('Enter both API key and shared secret.');
    const pending=await startAuthorisation(auth);
    await chrome.storage.session.set({pendingExportConnection:{...auth,frob:pending.frob}});
    chrome.tabs.create({url:pending.url});message('Approve read-only access in RTM, then return here and click I’ve authorised access.');
  }catch(error){message(error.message);}
}
async function connectFinish(){
  try{
    const stored=await chrome.storage.session.get('pendingExportConnection');
    const pending=stored.pendingExportConnection;
    if(!pending)throw new Error('First click Authorise in RTM.');
    const auth=await finishAuthorisation(pending.frob,pending);
    await chrome.storage.local.set({apiKey:pending.apiKey,secret:pending.secret,token:auth.token,username:auth.user?.username||''});
    await chrome.storage.session.remove('pendingExportConnection');await loadLists();
  }catch(error){message(error.message);}
}
async function init(){
  const stored=await chrome.storage.local.get('exportPreferences');
  const pref=stored.exportPreferences||{};
  restoreFields(pref.fields);
  $('scope').value=['list','tag'].includes(pref.scope)?pref.scope:'list';
  $('selectedSource').checked=pref.selectedSource===true || (pref.selectedSource===undefined && pref.scope==='selected');
  $('subtasks').checked=pref.subtasks!==false;
  $('completed').checked=Boolean(pref.completed);$('format').value=pref.format||'tsv';
  renderFields();
  $('scope').addEventListener('change',()=>{updateTargets();markStale();});
  $('selectedSource').addEventListener('change',()=>{updateTargets();markStale();});
  $('refreshTabs').addEventListener('click',()=>refreshTabs().catch(error=>message(error.message)));
  $('rtmTab').addEventListener('change',markStale);
  $('inspectSelection').addEventListener('click',runSelectionInspection);
  $('copyInspection').addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText($('selectionDiagnostic').textContent);message('Structural diagnostic copied.');}
    catch(error){message('Could not copy diagnostic: '+error.message);}
  });
  for(const id of ['target','subtasks','completed','format'])$(id).addEventListener('change',markStale);
  $('allFields').addEventListener('click',()=>{state.fields.forEach(field=>field.enabled=true);renderFields();markStale();});
  $('defaults').addEventListener('click',()=>{state.fields=FIELDS.map(([id,label])=>({id,label,enabled:DEFAULT_FIELDS.includes(id)}));renderFields();markStale();});
  $('authorise').addEventListener('click',connectStart);
  $('finish').addEventListener('click',connectFinish);
  $('disconnect').addEventListener('click',async()=>{await chrome.storage.local.remove(['apiKey','secret','token','username']);state.output=null;await loadLists();});
  $('preview').addEventListener('click',preview);
  $('copy').addEventListener('click',copy);
  $('download').addEventListener('click',download);
  try{await loadLists();}catch(error){message('Could not load RTM lists and tags: '+error.message);}
}
init().catch(error=>message(error.message));
