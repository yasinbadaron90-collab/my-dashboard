// Routine: recurring tasks + priority system. (MoneyMoveZ removed 2026-05-20 — replaced by Money In.)


var DEFAULT_TASKS = [
  { id:'r1', emoji:'💈', name:'Haircut',    category:'personal', freq:'monthly',     lastDone:null },
  { id:'r2', emoji:'🚿', name:'Wash EE90', category:'car',      freq:'fortnightly', lastDone:null },
  { id:'r3', emoji:'🚿', name:'Wash Kia',  category:'car',      freq:'fortnightly', lastDone:null },
];

var FREQ_DAYS = { daily:1, weekly:7, fortnightly:14, monthly:30 };
var FREQ_LABELS = { daily:'Daily', weekly:'Weekly', fortnightly:'Fortnightly', monthly:'Monthly' };
var CAT_COLORS = { personal:'#a78bfa', car:'#60a5fa', home:'#f2a830', health:'#34d399', other:'#888' };
var CAT_ICONS  = { personal:'👤', car:'🚗', home:'🏠', health:'❤️', other:'📌' };

function loadRoutineTasks(){
  try{
    var saved = JSON.parse(lsGet(ROUTINE_KEY)||'null');
    if(saved && Array.isArray(saved)) return saved;
  }catch(e){}
  return DEFAULT_TASKS.map(function(t){ return Object.assign({},t); });
}
function saveRoutineTasks(tasks){ lsSet(ROUTINE_KEY, JSON.stringify(tasks)); }

function getNextDue(task){
  if(!task.lastDone) return null; // never done — no next due, show as pending
  var last = new Date(task.lastDone+'T00:00:00');
  var days = FREQ_DAYS[task.freq] || 30;
  last.setDate(last.getDate() + days);
  return last;
}

// ── Step 11c: mark a task done WITHOUT any prompt (used by saveSpend after a routine-prefilled spend) ──
function _routineMarkDoneRaw(id){
  var tasks = loadRoutineTasks();
  var t = tasks.find(function(x){ return x.id===id; });
  if(!t) return;
  var today = new Date();
  t.lastDone = today.toISOString().slice(0,10);
  saveRoutineTasks(tasks);
  renderRoutine();
}

function markRoutineDone(id){
  var tasks = loadRoutineTasks();
  var t = tasks.find(function(x){ return x.id===id; });
  if(!t) return;

  // Step 11c — if the task has a cost + pocket configured AND the pocket still
  // exists, offer the user a 3-way choice: log spend / skip spend / cancel.
  // Anything missing falls through to the original silent mark-done.
  var hasCost = (t.cost != null) && (Number(t.cost) > 0);
  var pocket = null;
  if(hasCost && t.pocketId){
    try {
      pocket = (typeof funds !== 'undefined' ? funds : []).find(function(f){ return f && f.id === t.pocketId && !f._deleted; });
    } catch(e){}
  }
  if(hasCost && pocket){
    _routineSpendConfirm(t, pocket);
    return;
  }

  // No cost set — original behaviour preserved
  _routineMarkDoneRaw(id);
}

// ── Step 11c: the 3-way confirm bubble ──
function _routineSpendConfirm(task, pocket){
  // Avoid stacking bubbles if one is already open
  var existing = document.getElementById('routineSpendConfirmOverlay');
  if(existing) existing.remove();

  var pocketLabel = (pocket.emoji ? pocket.emoji + ' ' : '') + pocket.name;
  var amt = Number(task.cost);
  var amtStr = (typeof fmtR === 'function') ? fmtR(amt) : ('R' + amt);

  var overlay = document.createElement('div');
  overlay.id = 'routineSpendConfirmOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1100;display:flex;align-items:center;justify-content:center;padding:20px;';
  overlay.innerHTML =
    '<div style="background:#111;border:1px solid #2a2a2a;border-radius:14px;padding:22px 22px 18px;max-width:380px;width:100%;">'
      +'<div style="font-family:\'Syne\',sans-serif;font-weight:800;font-size:17px;color:var(--text);margin-bottom:4px;">'+task.emoji+' '+task.name+'</div>'
      +'<div style="font-size:12px;color:#888;margin-bottom:18px;line-height:1.5;">Mark this done — log a Spend?</div>'
      +'<div style="background:#0a0a0a;border:1px solid #2a2a2a;border-radius:8px;padding:14px 16px;">'
        +'<div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#555;margin-bottom:2px;">Amount</div>'
        +'<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:24px;color:#c8f230;">'+amtStr+'</div>'
        +'<div style="font-size:11px;color:#888;margin-top:2px;">from '+pocketLabel+'</div>'
      +'</div>'
      +'<div style="display:flex;flex-direction:column;gap:8px;margin-top:16px;">'
        +'<button id="rsYes" style="background:#1a2e00;border:1px solid #c8f230;border-radius:8px;padding:13px;color:#c8f230;font-family:\'DM Mono\',monospace;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;font-weight:700;">✓ Yes — log '+amtStr+' spend</button>'
        +'<button id="rsNo" style="background:#0a0a0a;border:1px solid #444;border-radius:8px;padding:13px;color:#888;font-family:\'DM Mono\',monospace;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;">Just mark done — no spend this time</button>'
        +'<button id="rsCancel" style="background:none;border:none;padding:6px;color:#555;font-family:\'DM Mono\',monospace;font-size:11px;cursor:pointer;letter-spacing:1px;">Cancel</button>'
      +'</div>'
    +'</div>';

  overlay.querySelector('#rsYes').addEventListener('click', function(){
    overlay.remove();
    // Open Spend modal pre-filled. saveSpend will mark the task done on success;
    // closeSpend without saving leaves the task NOT marked done (safe back-out).
    try {
      if(typeof openSpend === 'function'){
        openSpend(null, {
          label: task.name,
          amount: amt,
          pocketId: pocket.id,
          doorway: 'DIRECT',
          _fromRoutineTaskId: task.id
        });
      } else {
        alert('Spend not available — falling back to mark-done only.');
        _routineMarkDoneRaw(task.id);
      }
    } catch(e){
      console.warn('[routine] openSpend failed', e);
      _routineMarkDoneRaw(task.id);
    }
  });
  overlay.querySelector('#rsNo').addEventListener('click', function(){
    overlay.remove();
    _routineMarkDoneRaw(task.id);
  });
  overlay.querySelector('#rsCancel').addEventListener('click', function(){ overlay.remove(); });
  overlay.addEventListener('click', function(e){ if(e.target===overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function deleteRoutineTask(id){
  var tasks = loadRoutineTasks();
  tasks = tasks.filter(function(x){ return x.id!==id; });
  saveRoutineTasks(tasks);
  renderRoutine();
}

function openAddRoutineTask(editId){
  var tasks = loadRoutineTasks();
  var existing = editId ? tasks.find(function(x){ return x.id===editId; }) : null;

  var freqOpts = ['daily','weekly','fortnightly','monthly'].map(function(f){
    var sel = existing ? existing.freq===f : f==='monthly';
    return '<button onclick="selectRoutineFreq(this,\''+f+'\')" data-freq="'+f+'" style="padding:7px 12px;border:1px solid '+(sel?'#c8f230':'#2a2a2a')+';border-radius:6px;background:'+(sel?'#1a2e00':'none')+';color:'+(sel?'#c8f230':'#555')+';font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1px;cursor:pointer;transition:all .15s;">'+FREQ_LABELS[f]+'</button>';
  }).join('');

  var catOpts = ['personal','car','home','health','other'].map(function(c){
    var sel = existing ? existing.category===c : c==='personal';
    return '<button onclick="selectRoutineCat(this,\''+c+'\')" data-cat="'+c+'" style="padding:7px 12px;border:1px solid '+(sel?CAT_COLORS[c]:'#2a2a2a')+';border-radius:6px;background:'+(sel?CAT_COLORS[c]+'22':'none')+';color:'+(sel?CAT_COLORS[c]:'#555')+';font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1px;cursor:pointer;transition:all .15s;">'+CAT_ICONS[c]+' '+c+'</button>';
  }).join('');

  // Pocket dropdown options for the "Default pocket" picker (Step 11c)
  var pocketOpts = '<option value="">— None (no spend) —</option>';
  try {
    var visiblePockets = (typeof funds !== 'undefined' ? funds : []).filter(function(f){ return f && !f._deleted; });
    visiblePockets.forEach(function(f){
      var sel = existing && existing.pocketId === f.id ? ' selected' : '';
      var label = (f.emoji ? f.emoji + ' ' : '') + f.name;
      pocketOpts += '<option value="'+f.id+'"'+sel+'>'+label+'</option>';
    });
  } catch(e){ console.warn('[routine] pocket list build failed', e); }
  var costVal = (existing && existing.cost) ? existing.cost : '';

  var overlay = document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1000;display:flex;align-items:flex-end;justify-content:center;';
  overlay.innerHTML =
    '<div style="background:#111;border:1px solid #2a2a2a;border-radius:16px 16px 0 0;width:100%;max-width:480px;max-height:85vh;overflow-y:auto;">'
      +'<div style="padding:20px 20px 12px;border-bottom:1px solid var(--border);">'
        +'<div style="font-family:\'Syne\',sans-serif;font-weight:800;font-size:18px;color:var(--text);">'+(existing?'Edit Task':'+ New Task')+'</div>'
      +'</div>'
      +'<div style="padding:16px 20px;display:grid;gap:14px;">'
        +'<div><label style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:6px;">Emoji</label>'
          +'<input id="rtEmoji" type="text" maxlength="2" value="'+(existing?existing.emoji:'✅')+'" style="width:60px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:6px;padding:10px 12px;color:#efefef;font-size:20px;text-align:center;"></div>'
        +'<div><label style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:6px;">Task Name</label>'
          +'<input id="rtName" type="text" value="'+(existing?existing.name:'')+'" placeholder="e.g. Wash EE90" style="width:100%;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:6px;padding:10px 12px;color:#efefef;font-family:\'DM Mono\',monospace;font-size:13px;"></div>'
        +'<div><label style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:8px;">Category</label>'
          +'<div id="rtCatPicker" style="display:flex;flex-wrap:wrap;gap:6px;">'+catOpts+'</div>'
          +'<input type="hidden" id="rtCat" value="'+(existing?existing.category:'personal')+'"></div>'
        +'<div><label style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:8px;">Frequency</label>'
          +'<div id="rtFreqPicker" style="display:flex;flex-wrap:wrap;gap:6px;">'+freqOpts+'</div>'
          +'<input type="hidden" id="rtFreq" value="'+(existing?existing.freq:'monthly')+'"></div>'

        // ── Step 11c: optional Cost + Default Pocket. Both blank = current behaviour (no spend on tick) ──
        +'<div style="border-top:1px solid #222;padding-top:14px;margin-top:4px;">'
          +'<label style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:6px;">💰 Cost per tick (R) <span style="text-transform:none;letter-spacing:0;color:#555;font-size:9px;">— optional</span></label>'
          +'<input id="rtCost" type="number" min="0" step="0.01" inputmode="decimal" value="'+costVal+'" placeholder="e.g. 44 — leave blank for no spend" style="width:100%;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:6px;padding:10px 12px;color:#efefef;font-family:\'DM Mono\',monospace;font-size:13px;">'
          +'<div style="font-size:10px;color:#555;margin-top:4px;letter-spacing:0.5px;">When set, ticking ✓ will offer to log a Spend</div>'
        +'</div>'
        +'<div>'
          +'<label style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:6px;">💰 Default pocket <span style="text-transform:none;letter-spacing:0;color:#555;font-size:9px;">— where the money comes from</span></label>'
          +'<select id="rtPocket" style="width:100%;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:6px;padding:10px 12px;color:#efefef;font-family:\'DM Mono\',monospace;font-size:13px;">'+pocketOpts+'</select>'
        +'</div>'
      +'</div>'
      +'<div style="display:flex;gap:8px;padding:12px 20px 20px;">'
        +'<button id="rtSaveBtn" style="flex:1;background:#1a2e00;border:1px solid #3a5a00;border-radius:8px;padding:12px;color:#c8f230;font-family:\'DM Mono\',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;">Save</button>'
        +(existing?'<button id="rtDeleteBtn" style="background:none;border:1px solid #2a1a1a;border-radius:8px;padding:12px 14px;color:var(--muted);font-family:\'DM Mono\',monospace;font-size:11px;cursor:pointer;" onmouseover="this.style.borderColor=\'#c0392b\';this.style.color=\'#c0392b\'" onmouseout="this.style.borderColor=\'#2a1a1a\';this.style.color=\'#555\'">Delete</button>':'')
        +'<button id="rtCancelBtn" style="background:none;border:1px solid #2a2a2a;border-radius:8px;padding:12px 14px;color:var(--muted);font-family:\'DM Mono\',monospace;font-size:11px;cursor:pointer;">Cancel</button>'
      +'</div>'
    +'</div>';

  overlay.querySelector('#rtSaveBtn').addEventListener('click', function(){
    var name = overlay.querySelector('#rtName').value.trim();
    var emoji = overlay.querySelector('#rtEmoji').value.trim() || '✅';
    var cat  = overlay.querySelector('#rtCat').value;
    var freq = overlay.querySelector('#rtFreq').value;
    if(!name) return;
    // Step 11c — optional cost + pocket
    var costRaw = (overlay.querySelector('#rtCost') ? overlay.querySelector('#rtCost').value : '').trim();
    var cost = costRaw ? parseFloat(costRaw) : null;
    if(cost != null && (!(cost > 0) || !isFinite(cost))) cost = null;
    var pocketId = (overlay.querySelector('#rtPocket') ? overlay.querySelector('#rtPocket').value : '') || null;
    var tasks = loadRoutineTasks();
    if(existing){
      var t = tasks.find(function(x){ return x.id===editId; });
      if(t){ t.name=name; t.emoji=emoji; t.category=cat; t.freq=freq; t.cost=cost; t.pocketId=pocketId; }
    } else {
      tasks.push({ id:'r'+Date.now(), emoji:emoji, name:name, category:cat, freq:freq, lastDone:null, cost:cost, pocketId:pocketId });
    }
    saveRoutineTasks(tasks);
    overlay.remove();
    renderRoutine();
  });
  if(existing){
    overlay.querySelector('#rtDeleteBtn').addEventListener('click', function(){
      deleteRoutineTask(editId);
      overlay.remove();
    });
  }
  overlay.querySelector('#rtCancelBtn').addEventListener('click', function(){ overlay.remove(); });
  overlay.addEventListener('click', function(e){ if(e.target===overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function selectRoutineFreq(btn, freq){
  btn.parentElement.querySelectorAll('button').forEach(function(b){
    b.style.borderColor='#2a2a2a'; b.style.background='none'; b.style.color='#555';
  });
  btn.style.borderColor='#c8f230'; btn.style.background='#1a2e00'; btn.style.color='#c8f230';
  document.getElementById('rtFreq').value = freq;
}

function selectRoutineCat(btn, cat){
  var color = CAT_COLORS[cat] || '#888';
  btn.parentElement.querySelectorAll('button').forEach(function(b){
    b.style.borderColor='#2a2a2a'; b.style.background='none'; b.style.color='#555';
  });
  btn.style.borderColor=color; btn.style.background=color+'22'; btn.style.color=color;
  document.getElementById('rtCat').value = cat;
}

function renderRoutine(){
  var today = new Date(); today.setHours(0,0,0,0);
  var tasks = loadRoutineTasks();
  var list = document.getElementById('routineList');
  if(!list) return;

  // Sort: overdue first, then by days until due
  tasks.sort(function(a,b){
    function score(t){
      var nd = getNextDue(t);
      if(!nd) return -9999; // never done = top
      return Math.round((nd-today)/86400000);
    }
    return score(a)-score(b);
  });

  var html = '';
  var overdueCount=0, dueCount=0;

  tasks.forEach(function(task){
    var color = CAT_COLORS[task.category] || '#888';
    var nextDue = getNextDue(task);
    var diff = nextDue ? Math.round((nextDue-today)/86400000) : null;
    var neverDone = !task.lastDone;

    var statusClass = 'ok';
    var badge = '';
    var progressPct = 0;
    var freqDays = FREQ_DAYS[task.freq] || 30;

    if(neverDone){
      statusClass = '';
      badge = '<span style="color:var(--muted);font-size:10px;letter-spacing:1px;">Never done — tap ✓ to start</span>';
    } else if(diff !== null && diff < 0){
      statusClass = 'overdue';
      badge = '<span style="color:#f23060;font-size:10px;letter-spacing:1px;">⚠ Overdue '+Math.abs(diff)+'d</span>';
      overdueCount++;
      progressPct = 100;
    } else if(diff === 0){
      statusClass = 'due-today';
      badge = '<span style="color:#f2a830;font-size:10px;letter-spacing:1px;">⚡ Due today!</span>';
      dueCount++;
      progressPct = 100;
    } else if(diff <= 3){
      statusClass = 'due-soon';
      badge = '<span style="color:#d4a800;font-size:10px;letter-spacing:1px;">⏰ In '+diff+'d</span>';
      dueCount++;
      progressPct = Math.round(((freqDays-diff)/freqDays)*100);
    } else {
      badge = '<span style="color:#3a5a00;font-size:10px;letter-spacing:1px;">In '+diff+'d</span>';
      progressPct = Math.round(((freqDays-diff)/freqDays)*100);
    }

    var lastDoneStr = task.lastDone
      ? 'Last done: '+new Date(task.lastDone+'T00:00:00').toLocaleDateString('en-ZA',{day:'numeric',month:'short',year:'numeric'})
      : '';

    var progColor = diff!==null&&diff<0 ? '#f23060' : diff===0 ? '#f2a830' : '#c8f230';

    html +=
      '<div class="routine-card '+statusClass+'" style="border-left:3px solid '+color+';">'
        +'<div style="padding:14px 16px 10px;display:flex;align-items:center;gap:14px;">'
          +'<div style="font-size:26px;flex-shrink:0;">'+task.emoji+'</div>'
          +'<div style="flex:1;min-width:0;">'
            +'<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:14px;color:var(--text);">'+task.name+'</div>'
            +'<div style="display:flex;align-items:center;gap:8px;margin-top:3px;flex-wrap:wrap;">'
              +'<span style="font-size:9px;background:'+color+'22;border:1px solid '+color+'44;border-radius:100px;padding:1px 7px;color:'+color+';letter-spacing:0.5px;">'+FREQ_LABELS[task.freq].toUpperCase()+'</span>'
              +'<span style="font-size:9px;background:var(--muted2);border-radius:100px;padding:1px 7px;color:var(--muted);letter-spacing:0.5px;">'+CAT_ICONS[task.category]+' '+(task.category||'other')+'</span>'
              +(function(){
                // Step 11c — cost badge if task has cost + a still-existing pocket
                if(task.cost == null || !(Number(task.cost) > 0)) return '';
                var p = null;
                try { p = (typeof funds !== 'undefined' ? funds : []).find(function(f){ return f && f.id === task.pocketId && !f._deleted; }); } catch(e){}
                var amtStr = (typeof fmtR === 'function') ? fmtR(Number(task.cost)) : ('R'+task.cost);
                var pocketBit = p ? ((p.emoji?p.emoji+' ':'') + p.name) : '⚠ pocket missing';
                return '<span style="font-size:9px;background:#0a1a2e;border:1px solid #3a5a8a;border-radius:100px;padding:1px 7px;color:#5fa0f0;letter-spacing:0.5px;font-weight:700;">'+amtStr+' · '+pocketBit+'</span>';
              })()
              +badge
            +'</div>'
            +(lastDoneStr?'<div style="font-size:9px;color:var(--muted);margin-top:4px;letter-spacing:0.5px;">'+lastDoneStr+'</div>':'')
          +'</div>'
          +'<div style="display:flex;gap:6px;flex-shrink:0;">'
            +'<button onclick="markRoutineDone(\''+task.id+'\')" style="background:#0d1a00;border:1px solid #3a5a00;border-radius:6px;width:34px;height:34px;cursor:pointer;font-size:16px;color:#c8f230;display:flex;align-items:center;justify-content:center;transition:all .15s;" onmouseover="this.style.opacity=\'.8\'" onmouseout="this.style.opacity=\'1\'" title="Mark as done">✓</button>'
            +'<button onclick="openAddRoutineTask(\''+task.id+'\')" style="background:none;border:1px solid #2a2a2a;border-radius:6px;width:34px;height:34px;cursor:pointer;font-size:13px;color:var(--muted);display:flex;align-items:center;justify-content:center;transition:all .15s;" onmouseover="this.style.borderColor=\'#444\';this.style.color=\'#888\'" onmouseout="this.style.borderColor=\'#2a2a2a\';this.style.color=\'#555\'" title="Edit">✎</button>'
          +'</div>'
        +'</div>'
        // Progress bar
        +'<div style="padding:0 16px 14px;">'
          +'<div style="height:4px;background:#1a1a1a;border-radius:2px;overflow:hidden;">'
            +'<div style="height:100%;width:'+Math.min(progressPct,100)+'%;background:'+progColor+';border-radius:2px;transition:width .5s cubic-bezier(.16,1,.3,1);"></div>'
          +'</div>'
        +'</div>'
      +'</div>';
  });

  if(tasks.length === 0){
    html = (typeof buildEmptyState === 'function')
      ? buildEmptyState({
          icon: '🔁',
          title: 'No recurring tasks yet',
          subtitle: 'Track daily, weekly or monthly habits — gym, prayer, bills, anything.',
          ctaLabel: '+ Add Task',
          ctaOnclick: 'openAddRoutineTask()'
        })
      : '<div style="padding:40px 16px;text-align:center;color:var(--muted);font-size:13px;background:var(--surface);border:1px dashed var(--border);border-radius:10px;">No tasks yet — tap + Add Task to get started</div>';
  }

  list.innerHTML = html;

  // Summary pills
  var pills = document.getElementById('routineSummaryPills');
  if(pills){
    pills.innerHTML =
      (overdueCount>0?'<span style="background:#2a0000;border:1px solid #f23060;border-radius:100px;padding:5px 12px;font-size:10px;color:#f23060;letter-spacing:1px;">⚠ '+overdueCount+' overdue</span>':'')
      +(dueCount>0?'<span style="background:#2a1a00;border:1px solid #f2a830;border-radius:100px;padding:5px 12px;font-size:10px;color:#f2a830;letter-spacing:1px;">⏰ '+dueCount+' due soon</span>':'')
      +'<span style="background:var(--surface);border:1px solid var(--border);border-radius:100px;padding:5px 12px;font-size:10px;color:var(--muted);letter-spacing:1px;">'+tasks.length+' tasks</span>';
  }
}


// ════════════════════════════════════════════════════════
// MoneyMoveZ / Smart Allocation removed 2026-05-20 — replaced by Money In.
// See moneyin.js for the pocket-first replacement.
// ════════════════════════════════════════════════════════

// ── PRIORITY RULES SYSTEM (kept — read by Money In) ──
const PRIORITY_KEY = 'yb_priority_rules_v1';

var DEFAULT_PRIORITY_RULES = [
  { id:'cf_deficit',     name:'Cash Flow Deficit',  desc:'Cover monthly deficit first',           enabled:true, priority:1, color:'#f23060' },
  { id:'car_service',    name:'Car Service',         desc:'Cars due for service within 4 months',  enabled:true, priority:2, color:'#f2a830' },
  { id:'maint',          name:'Maintenance Fund',    desc:'Monthly R1500 target',                  enabled:true, priority:3, color:'#f2a830' },
  { id:'borrow_repay',   name:'Borrow Repayments',   desc:'Settle borrowed money first',           enabled:true, priority:4, color:'#a78bfa' },
  { id:'carpool_income', name:'Carpool Arrears',     desc:'Carpool earnings owed by passengers',   enabled:true, priority:5, color:'#7090f0' },
  { id:'instalments',    name:'Instalment Plans',    desc:'Active plans due within 14 days',       enabled:true, priority:6, color:'#7090f0' },
  { id:'savings',        name:'Savings Funds',       desc:'Personal savings goals (by % behind)',  enabled:true, priority:7, color:'#c8f230' }
];

function loadPriorityRules(){
  try{
    var saved = JSON.parse(lsGet(PRIORITY_KEY)||'null');
    if(saved && Array.isArray(saved) && saved.length){
      // Merge: for any default rule the user doesn't have yet (e.g. new
      // borrow_repay / carpool_income rules added in a later version),
      // append it at the end so existing users still get the new options.
      var existingIds = saved.map(function(r){ return r.id; });
      var maxPriority = saved.reduce(function(m, r){ return Math.max(m, r.priority||0); }, 0);
      DEFAULT_PRIORITY_RULES.forEach(function(def){
        if(existingIds.indexOf(def.id) === -1){
          var copy = JSON.parse(JSON.stringify(def));
          copy.priority = ++maxPriority;
          saved.push(copy);
        }
      });
      return saved;
    }
  }catch(e){}
  return JSON.parse(JSON.stringify(DEFAULT_PRIORITY_RULES));
}

function savePriorityRules(rules){
  lsSet(PRIORITY_KEY, JSON.stringify(rules));
  if(typeof _odinOpenTab !== 'undefined' && _odinOpenTab) try{ renderOdinInsights(_odinOpenTab); }catch(e){}
  var am = document.getElementById('allocateModal');
  if(am && am.classList.contains('active')) try{ recalcAllocation(); }catch(e){}
}

function getActivePriorities(){
  return loadPriorityRules().filter(function(r){ return r.enabled; }).sort(function(a,b){ return a.priority-b.priority; });
}

var _prDragId = null;

function openPriorityEditor(){
  renderPriorityList();
  document.getElementById('priorityEditorModal').classList.add('active');
}


// Returns available targets for a priority rule that supports targeting
function getPriorityTargetOptions(ruleId){
  var opts = [];
  if(ruleId === 'maint'){
    var liveMaintName = (typeof getMaintFundName === 'function') ? getMaintFundName() : 'Maintenance Fund';
    opts.push({ value:'__maint__', label: liveMaintName });
    try{
      var cards = JSON.parse(lsGet(CUSTOM_MAINT_KEY)||'[]');
      cards.forEach(function(c){ opts.push({ value:c.id, label:c.name }); });
    }catch(e){}
    // Also include expense-type funds (e.g. Ee90 car fund) as valid maint targets
    try{
      (funds||[]).filter(function(f){ return f.isExpense; }).forEach(function(f){
        opts.push({ value:f.id, label:(f.emoji||'')+' '+f.name });
      });
    }catch(e){}
  } else if(ruleId === 'car_service'){
    opts.push({ value:'__all__', label:'All Cars (whichever is most urgent)' });
    try{
      loadCarsData().forEach(function(c){ opts.push({ value:c.id, label:c.name }); });
    }catch(e){}
  } else if(ruleId === 'savings'){
    opts.push({ value:'__all__', label:'All Savings (by % behind)' });
    try{
      // Include all funds — both savings and expense-type (e.g. Ee90 car fund)
      (funds||[]).forEach(function(f){
        opts.push({ value:f.id, label:(f.emoji||'')+' '+f.name });
      });
    }catch(e){}
  }
  return opts;
}

// Rules that support specific targeting
var TARGETABLE_RULES = ['maint','car_service','savings'];

function prSetTarget(ruleId, targetId){
  var rules = loadPriorityRules();
  var r = rules.find(function(x){ return x.id===ruleId; });
  if(r){ r.targetId = targetId; }
  savePriorityRules(rules);
}

function renderPriorityList(){
  var rules = loadPriorityRules().sort(function(a,b){ return a.priority-b.priority; });
  var c = document.getElementById('priorityRulesList');
  if(!c) return;
  c.innerHTML = '';
  rules.forEach(function(rule){
    // Outer wrapper (not draggable — contains both drag row and target row)
    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-bottom:8px;';

    // Drag row
    var div = document.createElement('div');
    div.className = 'pr-rule';
    div.dataset.id = rule.id;
    div.draggable = true;
    div.setAttribute('ondragstart','prDragStart(event)');
    div.setAttribute('ondragover','prDragOver(event)');
    div.setAttribute('ondrop','prDrop(event)');
    div.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 14px;background:#111;border:1px solid '+(rule.enabled?rule.color+'55':'#2a2a2a')+';border-radius:8px '+(TARGETABLE_RULES.indexOf(rule.id)>-1?'8px 0 0':'8px')+';cursor:grab;transition:border-color .2s;';

    var grip = document.createElement('span');
    grip.style.cssText = 'color:var(--muted);font-size:16px;cursor:grab;user-select:none;';
    grip.textContent = '⋮⋮';

    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = rule.enabled;
    cb.style.cssText = 'accent-color:'+rule.color+';width:16px;height:16px;flex-shrink:0;';
    cb.addEventListener('change', (function(id){ return function(){ prToggle(id, this.checked); }; })(rule.id));

    var info = document.createElement('div');
    info.style.flex = '1';
    var title = document.createElement('div');
    title.style.cssText = 'font-family:Syne,sans-serif;font-weight:700;font-size:13px;color:'+(rule.enabled?'#efefef':'#555')+';';
    title.textContent = rule.name;
    var desc = document.createElement('div');
    desc.style.cssText = 'font-size:10px;color:var(--muted);margin-top:2px;';
    desc.textContent = rule.desc;
    info.appendChild(title);
    info.appendChild(desc);

    var badge = document.createElement('span');
    badge.style.cssText = 'background:#1a1a1a;border:1px solid #2a2a2a;border-radius:4px;padding:3px 10px;font-family:DM Mono,monospace;font-size:10px;color:'+rule.color+';flex-shrink:0;';
    badge.textContent = '#'+rule.priority;

    div.appendChild(grip);
    div.appendChild(cb);
    div.appendChild(info);
    div.appendChild(badge);
    wrapper.appendChild(div);

    // Target selector row — only for maint, car_service, savings
    if(TARGETABLE_RULES.indexOf(rule.id) > -1){
      var targetRow = document.createElement('div');
      targetRow.style.cssText = 'background:#0d0d0d;border:1px solid '+(rule.enabled?rule.color+'33':'#1a1a1a')+';border-top:none;border-radius:0 0 8px 8px;padding:8px 14px;display:flex;align-items:center;gap:8px;';

      var targetLabel = document.createElement('span');
      targetLabel.style.cssText = 'font-size:9px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;white-space:nowrap;';
      targetLabel.textContent = 'Target:';

      var sel = document.createElement('select');
      sel.style.cssText = 'flex:1;background:#111;border:1px solid #2a2a2a;border-radius:4px;color:#efefef;padding:4px 8px;font-family:DM Mono,monospace;font-size:10px;';

      var opts = getPriorityTargetOptions(rule.id);
      opts.forEach(function(opt){
        var o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if(opt.value === (rule.targetId || opts[0].value)) o.selected = true;
        sel.appendChild(o);
      });

      sel.addEventListener('change', (function(id){ return function(){ prSetTarget(id, this.value); }; })(rule.id));

      targetRow.appendChild(targetLabel);
      targetRow.appendChild(sel);
      wrapper.appendChild(targetRow);
    }

    c.appendChild(wrapper);
  });
}

function prDragStart(e){ _prDragId = e.currentTarget.dataset.id; e.dataTransfer.effectAllowed='move'; }
function prDragOver(e){ e.preventDefault(); e.dataTransfer.dropEffect='move'; }
function prDrop(e){
  e.preventDefault();
  var targetId = e.currentTarget.dataset.id;
  if(!_prDragId || _prDragId===targetId) return;
  var rules = loadPriorityRules();
  var si = rules.findIndex(function(r){ return r.id===_prDragId; });
  var ti = rules.findIndex(function(r){ return r.id===targetId; });
  if(si===-1||ti===-1) return;
  var tmp = rules[si].priority; rules[si].priority=rules[ti].priority; rules[ti].priority=tmp;
  savePriorityRules(rules);
  renderPriorityList();
  _prDragId = null;
}
function prToggle(id, enabled){
  var rules = loadPriorityRules();
  var r = rules.find(function(x){ return x.id===id; });
  if(r) r.enabled = enabled;
  savePriorityRules(rules);
  renderPriorityList();
}
function prResetDefaults(){
  if(!confirm('Reset priority order to defaults?')) return;
  lsSet(PRIORITY_KEY, JSON.stringify(JSON.parse(JSON.stringify(DEFAULT_PRIORITY_RULES))));
  renderPriorityList();
  savePriorityRules(loadPriorityRules());
}


function renderOdinInsights(tabId){
  var el = document.getElementById('odinInsights-'+tabId);
  if(!el) return;
  var insights = [];

  if(tabId === 'carpool'){
    // Who owes you from borrows
    var passengers = [];
    try{ passengers = loadPassengers()||[]; }catch(e){}
    var totalOwed = 0;
    passengers.forEach(function(p){
      var entries = borrowData[p.name]||[];
      var b=0,r=0;
      entries.forEach(function(e){ if(e.type==='repay') r+=Number(e.amount||0); else b+=Number(e.amount||0); });
      var owed = Math.max(0, b - r);
      if(owed > 0){
        totalOwed += owed;
        insights.push({ text: '💸 '+p.name+' owes you '+fmtR(owed)+' in borrowed money', cls:'urgent' });
      }
    });
    // This month carpool income
    var now = new Date();
    var mk = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
    var monthIncome = 0;
    if(cpData && cpData[mk]){
      Object.keys(cpData[mk]).forEach(function(ds){
        var dd = cpData[mk][ds];
        if(!dd) return;
        passengers.forEach(function(p){
          if(dd[p.name] && typeof dd[p.name]==='object') monthIncome += Number(dd[p.name].amt||0);
        });
      });
    }
    if(monthIncome > 0) insights.push({ text: '🚗 Carpool income this month: '+fmtR(monthIncome), cls:'good' });
    if(!insights.length) insights.push({ text: '✅ No outstanding borrows. All clear.', cls:'good' });

  } else if(tabId === 'savings'){
    // Fund progress
    var allFunds = funds||[];
    allFunds.forEach(function(f){
      if(f.isExpense) return;
      var saved = fundTotal(f);
      var pct = f.goal > 0 ? Math.round(saved/f.goal*100) : 0;
      var cls = pct >= 100 ? 'good' : pct < 30 ? 'urgent' : '';
      insights.push({ text: (f.emoji||'💰')+' '+f.name+': '+fmtR(saved)+' saved · '+pct+'% of goal', cls:cls });
    });
    if(!allFunds.filter(function(f){return !f.isExpense;}).length)
      insights.push({ text: 'No savings funds yet. Create one below.', cls:'' });

  } else if(tabId === 'cashflow'){
    // This month net
    try{
      var snap = (typeof getLendingSnapshot==='function') ? getLendingSnapshot() : null;
      if(snap){
        var cls = snap.net >= 0 ? 'good' : 'urgent';
        insights.push({ text: (snap.net>=0?'✅':'⚠️')+' This month net: '+fmtR(Math.abs(snap.net))+(snap.net>=0?' surplus':' deficit'), cls:cls });
      }
    }catch(e){}
    // Last CF entries
    try{
      var cfData = loadCFData();
      var now2 = new Date();
      var mk2 = now2.getFullYear()+'-'+String(now2.getMonth()+1).padStart(2,'0');
      var entries = cfData[mk2]||{};
      var inc = (entries.income||[]).slice(-3).reverse();
      inc.forEach(function(e){
        insights.push({ text: '💵 '+e.label+': +'+fmtR(e.amount), cls:'good' });
      });
    }catch(e){}
    if(!insights.length) insights.push({ text: 'No entries this month yet.', cls:'' });

  } else if(tabId === 'money'){
    // ── ODIN: MONEY OWED TAB ──
    try{
      var moAll = [];
      var moPax = [];
      try{ moPax = loadPassengers()||[]; }catch(e){}
      moPax.forEach(function(p){
        var entries = (borrowData&&borrowData[p.name])||[];
        var b=0,r=0;
        entries.forEach(function(e){ if(e.type==='repay') r+=Number(e.amount||0); else b+=Number(e.amount||0); });
        if(b > 0) moAll.push({ name:p.name, tag:'carpool', borrowed:b, repaid:r, owing:Math.max(0,b-r) });
      });
      var extD = loadExternalBorrows();
      Object.values(extD).forEach(function(p){
        var b=0,r=0;
        (p.entries||[]).forEach(function(e){ if(e.type==='repay') r+=Number(e.amount||0); else b+=Number(e.amount||0); });
        if(b > 0) moAll.push({ name:p.name, tag:'personal', borrowed:b, repaid:r, owing:Math.max(0,b-r) });
      });
      var grandOwing = moAll.reduce(function(s,p){ return s+p.owing; },0);
      var grandLent  = moAll.reduce(function(s,p){ return s+p.borrowed; },0);
      if(moAll.length === 0){
        insights.push({ text:'✅ Nobody owes you anything right now.', cls:'good' });
      } else {
        insights.push({ text:'💰 Total still owed: '+fmtR(grandOwing)+' (of '+fmtR(grandLent)+' lent)', cls: grandOwing>0?'urgent':'good' });
        moAll.sort(function(a,b){ return b.owing - a.owing; });
        moAll.forEach(function(p){
          if(p.owing > 0){
            var pct = p.borrowed > 0 ? Math.round(p.repaid/p.borrowed*100) : 0;
            insights.push({ text:(p.tag==='carpool'?'🚗':'👤')+' '+p.name+' owes you '+fmtR(p.owing)+' · '+pct+'% repaid', cls:'urgent' });
          } else {
            insights.push({ text:'✅ '+p.name+' is fully settled', cls:'good' });
          }
        });
      }
      // Priority routing when repayment arrives
      try{
        var instPlans = loadInst ? loadInst() : [];
        var urgentInst = instPlans.filter(function(p){ return p.active !== false; }).sort(function(a,b){ return (b.amt||0)-(a.amt||0); });
        var snap2 = (typeof getLendingSnapshot==='function') ? getLendingSnapshot() : null;
        if(grandOwing > 0){
          insights.push({ text:'📋 When repayment arrives — priority order:', cls:'' });
          var fnbInst = urgentInst.filter(function(p){ return !p.account || p.account==='FNB'; });
          var tymInst = urgentInst.filter(function(p){ return p.account==='TymeBank'; });
          if(fnbInst.length){
            insights.push({ text:'  1️⃣ FNB → '+fnbInst[0].desc+' ('+fmtR(fnbInst[0].amt)+'/mo)', cls:'urgent' });
          } else if(tymInst.length){
            insights.push({ text:'  1️⃣ TymeBank → '+tymInst[0].desc+' ('+fmtR(tymInst[0].amt)+'/mo)', cls:'urgent' });
          } else {
            insights.push({ text:'  1️⃣ No active instalments — allocate to FNB savings', cls:'' });
          }
          if(snap2 && snap2.net < 0){
            insights.push({ text:'  2️⃣ Cover cash flow deficit: '+fmtR(Math.abs(snap2.net)), cls:'urgent' });
          } else if(snap2){
            insights.push({ text:'  2️⃣ Cash flow OK ('+fmtR(snap2.net)+' surplus)', cls:'good' });
          }
          insights.push({ text:'  3️⃣ Remainder → savings or keep in wallet', cls:'' });
        }
      }catch(e2){}
      // CF sync — what you lent this month
      try{
        var cfD2 = loadCFData();
        var nowM = new Date();
        var mkM = nowM.getFullYear()+'-'+String(nowM.getMonth()+1).padStart(2,'0');
        var lentEntries = ((cfD2[mkM]&&cfD2[mkM].expenses)||[]).filter(function(e){ return e.label&&e.label.indexOf('Lent to')>-1; });
        if(lentEntries.length){
          var lentTotal = lentEntries.reduce(function(s,e){ return s+e.amount; },0);
          insights.push({ text:'📤 Lent out this month: '+fmtR(lentTotal)+' ('+lentEntries.length+' transaction'+(lentEntries.length>1?'s':'')+')', cls:'' });
        }
      }catch(e3){}
    }catch(eMain){ insights.push({ text:'Could not load money owed data.', cls:'' }); }
    if(!insights.length) insights.push({ text:'No money owed data yet.', cls:'' });

  } else if(tabId === 'cars'){
    try{
      loadCarsData().forEach(function(car){
        var carName = car.name || 'Car';

        // ── Smart service intelligence ──
        if(car.lastServiceDate || car.lastServiceKm){
          var svc = calcNextService(car);
          if(svc.daysUntilNext != null){
            var urgCls = svc.daysUntilNext < 14 ? 'urgent' : svc.daysUntilNext < 60 ? '' : 'good';
            var svcLabel = svc.nextType + ' Service';
            var daysText = svc.daysUntilNext < 0 ? 'OVERDUE by '+Math.abs(svc.daysUntilNext)+' days' : svc.daysUntilNext+' days';
            var kmText = svc.kmUntilNext != null ? ' or '+Math.max(0,svc.kmUntilNext).toLocaleString('en-ZA')+' km left' : '';
            insights.push({ text: '🔧 '+carName+' — '+svcLabel+': '+daysText+kmText, cls: urgCls });
            if(svc.reason) insights.push({ text: '   Trigger: '+svc.reason, cls: urgCls });
          }
          // Show both minor and major countdowns
          if(svc.minorDue && svc.minorDue.effectiveDays != null && svc.nextType === 'Major'){
            insights.push({ text: '   Minor also due in ~'+Math.max(0,svc.minorDue.effectiveDays)+' days', cls:'' });
          }
        } else if(car.nextService){
          // Fallback: manually set nextService date
          var now3 = new Date();
          var svcDate = new Date(car.nextService+'T00:00:00');
          var daysLeft = Math.round((svcDate-now3)/86400000);
          var cls = daysLeft < 30 ? 'urgent' : daysLeft < 90 ? '' : 'good';
          insights.push({ text: '🔧 '+carName+' service: '+car.nextService+' ('+daysLeft+' days)', cls:cls });
        }

        // ── Maintenance fund savings progress ──
        var target = car.serviceTargetCost||0;
        if(target>0){
          var savedAmt = 0; var fundLabel = '';
          if(car.maintenanceFundId === '__maint__'){
            try{ var mdata=getMaintData(); savedAmt=mdata.reduce(function(s,e){return s+Number(e.amount||0);},0); fundLabel='Maintenance Fund'; }catch(e){}
          } else if(car.maintenanceFundId){
            try{
              var cards=JSON.parse(lsGet(CUSTOM_MAINT_KEY)||'[]');
              var mcard=cards.find(function(c){return c.id===car.maintenanceFundId;});
              if(mcard){ savedAmt=(mcard.entries||[]).reduce(function(s,e){return s+Number(e.amount||0);},0); fundLabel=mcard.name; }
            }catch(e){}
          } else {
            var sfund=(funds||[]).find(function(f){return f.id===car.serviceTargetFundId;});
            savedAmt=sfund?fundTotal(sfund):0; fundLabel=sfund?sfund.name:'';
          }
          var pct=target>0?Math.round(savedAmt/target*100):0;
          var shortfall=Math.max(0,target-savedAmt);
          var fundTxt=fundLabel?' ('+fundLabel+')':'';
          insights.push({ text:'💰 Service fund'+fundTxt+': '+fmtR(savedAmt)+' / '+fmtR(target)+' — '+pct+'% saved', cls:pct>=100?'good':pct<50?'urgent':'' });
          if(shortfall>0){
            var daysRef = (car.lastServiceDate||car.nextService) ? (function(){
              var svc2=calcNextService(car); return svc2.daysUntilNext||90;
            })() : 90;
            var monthsLeft=Math.max(1,Math.round(daysRef/30));
            insights.push({ text:'📋 Need ~'+fmtR(Math.ceil(shortfall/monthsLeft))+'/mo for '+monthsLeft+' month'+(monthsLeft===1?'':'s'), cls:pct<50?'urgent':'' });
          }
        }

        // ── Carpool usage badge ──
        if(car.carpoolUsage){
          insights.push({ text:'🚗 Severe usage mode active — 5,000km service intervals', cls:'' });
        }
      });
    }catch(e){ console.warn('Odin cars error',e); }
    if(!insights.length) insights.push({ text: 'No cars added yet. Add a car to get service insights.', cls:'' });
  }

  el.innerHTML = insights.map(function(i){
    return '<div class="odin-insight-card '+i.cls+'">'+i.text+'</div>';
  }).join('');
}

// ── Odin panel toggle (Savings/Carpool/Cash Flow/Money Owed/Cars bars) ──
function toggleOdinPanel(tabId){
  var panel = document.getElementById('odinPanel-'+tabId);
  var chev  = document.getElementById('odinChev-'+tabId);
  var sub   = document.getElementById('odinSub-'+tabId);
  if(!panel) return;
  var opening = !panel.classList.contains('open');
  panel.classList.toggle('open', opening);
  if(chev) chev.classList.toggle('open', opening);
  if(sub) sub.textContent = opening ? 'Tap to close' : 'Tap to open';
  if(opening){
    try{ renderOdinInsights(tabId); }catch(e){ console.warn('renderOdinInsights error', e); }
  }
}
window.toggleOdinPanel = toggleOdinPanel;
