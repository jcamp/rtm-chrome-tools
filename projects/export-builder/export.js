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
  ['taskId','Task ID'],['parentId','Parent task ID'],['level','Hierarchy level']
];
const DEFAULT_FIELDS = ['hierarchy','list','due','priority','status','tags'];
const state = { lists: [], tags: [], fields: FIELDS.map(([id,label]) => ({ id,label,enabled:DEFAULT_FIELDS.includes(id) })),
  records: null, output: null, dragging: null, selectedIds: [] };

function message(text) { $('status').textContent = text; }
async function credentials() { return chrome.storage.local.get(['apiKey','secret','token','username']); }
async function savePreferences() {
  await chrome.storage.local.set({ exportPreferences: {
    fields: state.fields.map(({id,enabled}) => ({id,enabled})),
    scope:$('scope').value, subtasks:$('subtasks').checked, completed:$('completed').checked, format:$('format').value
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
  const scope=$('scope').value;
  $('targetWrap').hidden = scope==='all'||scope==='selected';
  $('selectionHelp').hidden = scope!=='selected';
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
        const notes=asArray(series.notes?.note??series.notes).filter(note=>note && typeof note==='object' || typeof note==='string').map(note=>({
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
// Detect explicit selections in a live RTM tab. Never guess from focused text or sidebar links.
async function selectedTaskIds() {
  const tabs=await chrome.tabs.query({url:'https://www.rememberthemilk.com/*'});
  const candidates=tabs.filter(tab=>tab.url?.includes('/app/')).sort((a,b)=>(b.lastAccessed||0)-(a.lastAccessed||0));
  if(!candidates.length)throw new Error('Open the RTM web app and select tasks first.');
  const result=await chrome.scripting.executeScript({target:{tabId:candidates[0].id},func:() => {
    const ids=new Set();
    for(const node of document.querySelectorAll('[aria-selected="true"][data-task-id], input[type="checkbox"]:checked[data-task-id], [data-task-id].selected')){
      const id=node.getAttribute('data-task-id');if(id&&/^\d+$/.test(id))ids.add(id);
    }
    return [...ids];
  }});
  const ids=result[0]?.result||[];
  if(!ids.length)throw new Error('Could not read the selected tasks. RTM selection detection needs live interface verification. Choose a list or tag for now.');
  return ids;
}
async function retrieve(auth) {
  const scope=$('scope').value, completed=$('completed').checked;
  const names=new Map(state.lists.map(list=>[String(list.id),list.name]));
  const lists=scope==='list' ? state.lists.filter(item=>String(item.id)===$('target').value) : state.lists;
  if(!lists.length)throw new Error('No lists available for this selection.');
  if(scope==='selected')state.selectedIds=await selectedTaskIds();
  const records=[];
  const statuses=completed?[false,true]:[false];

  // One filtered call is enough for all lists or tags. RTM documents this behaviour.
  // Keep the existing per-list call for list scope, with a safe fallback if a
  // global query fails. Never silently return a partial account export.
  if(scope!=='list'){
    let globalSucceeded=true;
    for(const status of statuses){
      message('Retrieving '+(status?'completed':'incomplete')+' tasks across all lists…');
      try {
        const response=await call('rtm.tasks.getList',
          {filter:status?'status:completed':'status:incomplete'},auth);
        records.push(...normaliseResponse(response,names).filter(row=>row.completed===status));
      }catch(error){
        globalSucceeded=false;
        message('Account-wide request failed. Retrying individual lists…');
        break;
      }
    }
    if(globalSucceeded)return records;
    records.length=0;
  }
  for(let index=0;index<lists.length;index++){
    const list=lists[index];
    for(const status of statuses){
      message('Retrieving '+(index+1)+' of '+lists.length+': '+list.name+(status?' (completed)':'')+'…');
      const response=await getTasksForList(auth,list.id,status);
      records.push(...normaliseResponse(response,names).filter(row=>row.completed===status));
    }
  }
  return records;
}
function selectRows(records) {
  const scope=$('scope').value, includeChildren=$('subtasks').checked;
  const byId=new Map(), children=new Map();
  for(const row of records){
    if(!byId.has(row.id))byId.set(row.id,row);
    if(!children.has(row.parentId))children.set(row.parentId,[]);
    children.get(row.parentId).push(row);
  }
  const isMatch=row=>scope==='all'||scope==='list'||
    (scope==='tag'&&row.tags.some(t=>t.toLowerCase()===$('target').value.toLowerCase()))||
    (scope==='selected'&&state.selectedIds.includes(row.id));
  const matched=records.filter(isMatch);
  const output=[],visited=new Set();
  function visit(row,level) {
    if(visited.has(row.key))return;
    visited.add(row.key);output.push({...row,level});
    if(includeChildren)for(const child of children.get(row.id)||[])visit(child,level+1);
  }
  // A matching descendant of a matching ancestor belongs to that ancestor's subtree.
  const matching=new Set(matched.map(row=>row.key));
  for(const row of matched){
    let parent=row.parentId,hasSelectedAncestor=false;
    const guard=new Set();
    while(parent&&byId.has(parent)&&!guard.has(parent)){
      guard.add(parent);
      const ancestor=byId.get(parent);
      if(matching.has(ancestor.key)){hasSelectedAncestor=true;break;}
      parent=ancestor.parentId;
    }
    if(!hasSelectedAncestor || !includeChildren)visit(row,0);
  }
  // Missing filtered ancestors may cause an otherwise matched task to be unvisited.
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
    message('Ready. No RTM tasks have been changed.');
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
  $('scope').value=pref.scope||'list';$('subtasks').checked=pref.subtasks!==false;
  $('completed').checked=Boolean(pref.completed);$('format').value=pref.format||'tsv';
  renderFields();
  $('scope').addEventListener('change',()=>{updateTargets();markStale();});
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
