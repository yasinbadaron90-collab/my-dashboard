// Routine: recurring tasks, priority system, MoneyMoveZ


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

function markRoutineDone(id){
  var tasks = loadRoutineTasks();
  var t = tasks.find(function(x){ return x.id===id; });
  if(!t) return;
  var today = new Date();
  t.lastDone = today.toISOString().slice(0,10);
  saveRoutineTasks(tasks);
  try { if(window.cloudSync && window.cloudSync.routine) window.cloudSync.routine.syncTask(t); } catch(e){}
  renderRoutine();
}

function deleteRoutineTask(id){
  var tasks = loadRoutineTasks();
  tasks = tasks.filter(function(x){ return x.id!==id; });
  saveRoutineTasks(tasks);
  try { if(window.cloudSync && window.cloudSync.routine) window.cloudSync.routine.deleteTask(id); } catch(e){}
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

  var overlay = document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1000;display:flex;align-items:flex-end;justify-content:center;';
  overlay.innerHTML =
    '<div style="background:#111;border:1px solid #2a2a2a;border-radius:16px 16px 0 0;width:100%;max-width:480px;max-height:85vh;overflow-y:auto;">'
      +'<div style="padding:20px 20px 12px;border-bottom:1px solid #1a1a1a;">'
        +'<div style="font-family:\'Syne\',sans-serif;font-weight:800;font-size:18px;color:#efefef;">'+(existing?'Edit Task':'+ New Task')+'</div>'
      +'</div>'
      +'<div style="padding:16px 20px;display:grid;gap:14px;">'
        +'<div><label style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#555;display:block;margin-bottom:6px;">Emoji</label>'
          +'<input id="rtEmoji" type="text" maxlength="2" value="'+(existing?existing.emoji:'✅')+'" style="width:60px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:6px;padding:10px 12px;color:#efefef;font-size:20px;text-align:center;"></div>'
        +'<div><label style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#555;display:block;margin-bottom:6px;">Task Name</label>'
          +'<input id="rtName" type="text" value="'+(existing?existing.name:'')+'" placeholder="e.g. Wash EE90" style="width:100%;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:6px;padding:10px 12px;color:#efefef;font-family:\'DM Mono\',monospace;font-size:13px;"></div>'
        +'<div><label style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#555;display:block;margin-bottom:8px;">Category</label>'
          +'<div id="rtCatPicker" style="display:flex;flex-wrap:wrap;gap:6px;">'+catOpts+'</div>'
          +'<input type="hidden" id="rtCat" value="'+(existing?existing.category:'personal')+'"></div>'
        +'<div><label style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#555;display:block;margin-bottom:8px;">Frequency</label>'
          +'<div id="rtFreqPicker" style="display:flex;flex-wrap:wrap;gap:6px;">'+freqOpts+'</div>'
          +'<input type="hidden" id="rtFreq" value="'+(existing?existing.freq:'monthly')+'"></div>'
      +'</div>'
      +'<div style="display:flex;gap:8px;padding:12px 20px 20px;">'
        +'<button id="rtSaveBtn" style="flex:1;background:#1a2e00;border:1px solid #3a5a00;border-radius:8px;padding:12px;color:#c8f230;font-family:\'DM Mono\',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;">Save</button>'
        +(existing?'<button id="rtDeleteBtn" style="background:none;border:1px solid #2a1a1a;border-radius:8px;padding:12px 14px;color:#555;font-family:\'DM Mono\',monospace;font-size:11px;cursor:pointer;" onmouseover="this.style.borderColor=\'#c0392b\';this.style.color=\'#c0392b\'" onmouseout="this.style.borderColor=\'#2a1a1a\';this.style.color=\'#555\'">Delete</button>':'')
        +'<button id="rtCancelBtn" style="background:none;border:1px solid #2a2a2a;border-radius:8px;padding:12px 14px;color:#555;font-family:\'DM Mono\',monospace;font-size:11px;cursor:pointer;">Cancel</button>'
      +'</div>'
    +'</div>';

  overlay.querySelector('#rtSaveBtn').addEventListener('click', function(){
    var name = overlay.querySelector('#rtName').value.trim();
    var emoji = overlay.querySelector('#rtEmoji').value.trim() || '✅';
    var cat  = overlay.querySelector('#rtCat').value;
    var freq = overlay.querySelector('#rtFreq').value;
    if(!name) return;
    var tasks = loadRoutineTasks();
    if(existing){
      var t = tasks.find(function(x){ return x.id===editId; });
      if(t){ t.name=name; t.emoji=emoji; t.category=cat; t.freq=freq; }
    } else {
      tasks.push({ id:'r'+Date.now(), emoji:emoji, name:name, category:cat, freq:freq, lastDone:null });
    }
    saveRoutineTasks(tasks);
    var saved = tasks.find(function(x){ return existing ? x.id===editId : !x.lastDone && x.name===name; });
    try { if(window.cloudSync && window.cloudSync.routine && saved) window.cloudSync.routine.syncTask(saved); } catch(e){}
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
      badge = '<span style="color:#555;font-size:10px;letter-spacing:1px;">Never done — tap ✓ to start</span>';
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
            +'<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:14px;color:#efefef;">'+task.name+'</div>'
            +'<div style="display:flex;align-items:center;gap:8px;margin-top:3px;flex-wrap:wrap;">'
              +'<span style="font-size:9px;background:'+color+'22;border:1px solid '+color+'44;border-radius:100px;padding:1px 7px;color:'+color+';letter-spacing:0.5px;">'+FREQ_LABELS[task.freq].toUpperCase()+'</span>'
              +'<span style="font-size:9px;background:var(--muted2);border-radius:100px;padding:1px 7px;color:#555;letter-spacing:0.5px;">'+CAT_ICONS[task.category]+' '+(task.category||'other')+'</span>'
              +badge
            +'</div>'
            +(lastDoneStr?'<div style="font-size:9px;color:#444;margin-top:4px;letter-spacing:0.5px;">'+lastDoneStr+'</div>':'')
          +'</div>'
          +'<div style="display:flex;gap:6px;flex-shrink:0;">'
            +'<button onclick="markRoutineDone(\''+task.id+'\')" style="background:#0d1a00;border:1px solid #3a5a00;border-radius:6px;width:34px;height:34px;cursor:pointer;font-size:16px;color:#c8f230;display:flex;align-items:center;justify-content:center;transition:all .15s;" onmouseover="this.style.opacity=\'.8\'" onmouseout="this.style.opacity=\'1\'" title="Mark as done">✓</button>'
            +'<button onclick="openAddRoutineTask(\''+task.id+'\')" style="background:none;border:1px solid #2a2a2a;border-radius:6px;width:34px;height:34px;cursor:pointer;font-size:13px;color:#555;display:flex;align-items:center;justify-content:center;transition:all .15s;" onmouseover="this.style.borderColor=\'#444\';this.style.color=\'#888\'" onmouseout="this.style.borderColor=\'#2a2a2a\';this.style.color=\'#555\'" title="Edit">✎</button>'
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
      : '<div style="padding:40px 16px;text-align:center;color:#333;font-size:13px;background:var(--surface);border:1px dashed var(--border);border-radius:10px;">No tasks yet — tap + Add Task to get started</div>';
  }

  list.innerHTML = html;

  // Summary pills
  var pills = document.getElementById('routineSummaryPills');
  if(pills){
    pills.innerHTML =
      (overdueCount>0?'<span style="background:#2a0000;border:1px solid #f23060;border-radius:100px;padding:5px 12px;font-size:10px;color:#f23060;letter-spacing:1px;">⚠ '+overdueCount+' overdue</span>':'')
      +(dueCount>0?'<span style="background:#2a1a00;border:1px solid #f2a830;border-radius:100px;padding:5px 12px;font-size:10px;color:#f2a830;letter-spacing:1px;">⏰ '+dueCount+' due soon</span>':'')
      +'<span style="background:var(--surface);border:1px solid var(--border);border-radius:100px;padding:5px 12px;font-size:10px;color:#888;letter-spacing:1px;">'+tasks.length+' tasks</span>';
  }
}

// ════════════════════════════════════════════════════════
// SMART ALLOCATION ENGINE  — Source-Aware Central Router
// ════════════════════════════════════════════════════════
var _allocPlan      = [];
var _allocObligations = []; // obligations to log on confirm

// ── Source rules ─────────────────────────────────────────
// maintEligible : may fund the maintenance reserve
// carpoolIncome : direct cost-recovery (passengers)
// hasObligations: triggers the obligations step before routing
var SA_SOURCE_RULES = {
  // Generic source labels — kept neutral so they make sense for any user
  // and don't go stale when employers/stipends change. Per-user custom
  // income source lists will be added during the Supabase migration so
  // each user can define their own (their own job name, their own
  // stipend type, their own passengers, etc.).
  salary:   { label:'Salary',                maintEligible:true,  carpoolIncome:false, hasObligations:true  },
  stipend:  { label:'Stipend',               maintEligible:true,  carpoolIncome:false, hasObligations:true  },
  David:    { label:'David (Carpool)',       maintEligible:true,  carpoolIncome:true,  hasObligations:false },
  Lezaun:   { label:'Lezaun (Carpool)',      maintEligible:true,  carpoolIncome:true,  hasObligations:false },
  Shireen:  { label:'Shireen (Carpool)',     maintEligible:true,  carpoolIncome:true,  hasObligations:false },
  repayment:{ label:'Debt Repayment',        maintEligible:true,  carpoolIncome:false, hasObligations:false },
  other:    { label:'Cash / Other',          maintEligible:false, carpoolIncome:false, hasObligations:false },
  gift:     { label:'Gift / Windfall',       maintEligible:false, carpoolIncome:false, hasObligations:false }
};
function saRule(src){ return SA_SOURCE_RULES[src] || SA_SOURCE_RULES.other; }

// Default obligation presets (user can edit them in the modal inputs)
var SA_OBLIGATION_PRESETS = {
  salary:  [
    { id:'obl_wife_house', label:'Wife — Household',    default:6600 },
  ],
  stipend: [
    { id:'obl_wife_debt',  label:'Wife — Debt Repayment', default:1000 },
    { id:'obl_son',        label:'Son (nappies etc.)',     default:1500 },
    { id:'obl_tax',        label:'Tax',                    default:800  }
  ]
};

// ── Modal open ───────────────────────────────────────────
function openAllocateModal(callerTab){
  document.getElementById('allocAmount').value = '';
  document.getElementById('allocDate').value = localDateStr(new Date());
  document.getElementById('allocPlanWrap').style.display = 'none';
  document.getElementById('allocEmptyState').style.display = 'block';
  var _btns = document.getElementById('allocActionBtns');
  if(_btns) _btns.style.display = 'none';
  var _oblSec=document.getElementById('allocOblSection'); _oblSec.style.display='none'; _oblSec.dataset.renderedFor='';
  var _dpSec=document.getElementById('allocDebtorPicker'); if(_dpSec) _dpSec.style.display='none';
  _allocPlan = []; _allocObligations = [];
  // Refresh dropdown — pass caller so money tab gets real debtors
  _saRefreshSourceDropdown(callerTab || _odinCallerTab);
  document.getElementById('allocateModal').classList.add('active');
  setTimeout(function(){ document.getElementById('allocAmount').focus(); }, 200);
}

function _saRefreshSourceDropdown(callerTab){
  var sel = document.getElementById('allocSource');
  if(!sel) return;
  var passengers = [];
  try{ passengers = loadPassengers()||[]; }catch(e){}

  if(callerTab === 'money'){
    // Build dropdown from ALL actual debtors: external/personal + carpool combined
    var html = '';
    // ── Personal / external borrows (correct key: yb_external_borrows_v1) ──
    try{
      var extBorrows = JSON.parse(lsGet('yb_external_borrows_v1')||'{}');
      Object.values(extBorrows).forEach(function(person){
        var lent   = (person.entries||[]).filter(function(e){ return e.type!=='repay'; }).reduce(function(s,e){ return s+Number(e.amount||0); },0);
        var repaid = (person.entries||[]).filter(function(e){ return e.type==='repay';  }).reduce(function(s,e){ return s+Number(e.amount||0); },0);
        var owing  = lent - repaid;
        if(owing > 0){
          var safeName = (person.name||'').replace(/'/g,"\'");
          html += '<option value="repay_personal_'+safeName+'">👤 '+person.name+' — owes '+fmtR(owing)+' (personal)</option>';
          if(!SA_SOURCE_RULES['repay_personal_'+safeName]){
            SA_SOURCE_RULES['repay_personal_'+safeName] = { label:person.name+' (Personal)', maintEligible:true, carpoolIncome:false, hasObligations:false };
          }
        }
      });
    }catch(e){ console.warn('MoneyMoveZ personal dropdown error:', e); }
    // ── Passengers: combined-debt option (carpool arrears + borrow debt) ──
    // Always show every passenger so the user can also log income from a
    // passenger who has no current debt (it'll show the empty-state message
    // and let them allocate to savings/refund).
    passengers.forEach(function(p){
      var debts = { borrowOwed: 0, carpoolUnpaid: 0, totalOwed: 0 };
      try {
        if(typeof _saGetPassengerDebts === 'function'){
          debts = _saGetPassengerDebts(p.name);
        }
      } catch(e){}
      var label = p.name + ' (Carpool)';
      if(debts.totalOwed > 0){
        var parts = [];
        if(debts.carpoolUnpaid > 0) parts.push(fmtR(debts.carpoolUnpaid)+' carpool');
        if(debts.borrowOwed   > 0) parts.push(fmtR(debts.borrowOwed)+' borrow');
        label = '🚗 ' + p.name + ' — owes ' + fmtR(debts.totalOwed) + ' (' + parts.join(' + ') + ')';
      }
      html += '<option value="'+p.name+'">'+label+'</option>';
    });
    // Fallback generic option (always available)
    html += '<option value="repayment">Debt Repayment received</option>';
    html += '<option value="other">Other / Mixed</option>';
    sel.innerHTML = html;

  } else {
    var html = '<option value="salary">My Salary</option>'
             + '<option value="stipend">Stipend</option>';
    // Each passenger appears once with their combined debt info shown inline.
    // Selecting them auto-populates allocation rows for both carpool arrears
    // and borrow debt — see _saRenderPassengerAllocation. The redundant
    // "repay_carpool_*" entries below are skipped for any passenger covered
    // here (avoids showing them twice in the dropdown).
    var paxWithCombinedView = {};
    passengers.forEach(function(p){
      var debts = { borrowOwed: 0, carpoolUnpaid: 0, totalOwed: 0 };
      try {
        if(typeof _saGetPassengerDebts === 'function'){
          debts = _saGetPassengerDebts(p.name);
        }
      } catch(e){}
      var label = p.name + ' (Carpool)';
      if(debts.totalOwed > 0){
        var parts = [];
        if(debts.carpoolUnpaid > 0) parts.push(fmtR(debts.carpoolUnpaid)+' carpool');
        if(debts.borrowOwed   > 0) parts.push(fmtR(debts.borrowOwed)+' borrow');
        label = '🚗 ' + p.name + ' — owes ' + fmtR(debts.totalOwed) + ' (' + parts.join(' + ') + ')';
        paxWithCombinedView[p.name] = true;
      }
      html += '<option value="'+p.name+'">'+label+'</option>';
    });
    // ── Debt repayments: one option per actual debtor (personal + carpool borrows) ──
    var hasDebtor = false;
    try{
      var extB2 = JSON.parse(lsGet('yb_external_borrows_v1')||'{}');
      Object.values(extB2).forEach(function(p){
        var lent   = (p.entries||[]).filter(function(e){ return e.type!=='repay'; }).reduce(function(s,e){ return s+Number(e.amount||0); },0);
        var repaid = (p.entries||[]).filter(function(e){ return e.type==='repay';  }).reduce(function(s,e){ return s+Number(e.amount||0); },0);
        var owing  = lent - repaid;
        if(owing > 0){
          var safeName = (p.name||'').replace(/'/g,"\'");
          html += '<option value="repay_personal_'+safeName+'">👤 '+p.name+' — owes '+fmtR(owing)+'</option>';
          if(!SA_SOURCE_RULES['repay_personal_'+safeName]){
            SA_SOURCE_RULES['repay_personal_'+safeName] = { label:p.name+' (Personal Repayment)', maintEligible:true, carpoolIncome:false, hasObligations:false };
          }
          hasDebtor = true;
        }
      });
    }catch(e){}
    try{
      passengers.forEach(function(p){
        // Skip if already covered by the combined-view passenger option above
        if(paxWithCombinedView[p.name]) return;
        var entries = (borrowData&&borrowData[p.name])||[];
        var b=0,r=0;
        entries.forEach(function(e){ if(e.type==='repay') r+=Number(e.amount||0); else{ b+=Number(e.amount||0); if(e.paid) r+=Number(e.amount||0); } });
        var owed = b - r;
        if(owed > 0){
          html += '<option value="repay_carpool_'+p.name+'">🚗 '+p.name+' — owes '+fmtR(owed)+' (carpool borrow)</option>';
          if(!SA_SOURCE_RULES['repay_carpool_'+p.name]){
            SA_SOURCE_RULES['repay_carpool_'+p.name] = { label:p.name+' (Carpool Borrow)', maintEligible:true, carpoolIncome:false, hasObligations:false };
          }
          hasDebtor = true;
        }
      });
    }catch(e){}
    // Fallback generic option if nobody owes anything
    if(!hasDebtor) html += '<option value="repayment">Debt Repayment received</option>';
    html += '<option value="other">Other / Mixed</option>'
          + '<option value="gift">Gift / Windfall</option>';
    sel.innerHTML = html;
  }
}

// ── Obligation section renderer ──────────────────────────
function _saRenderObligations(source){
  // ── Debtor picker: show when generic "repayment" selected ──
  var dp = document.getElementById('allocDebtorPicker');
  var ds = document.getElementById('allocDebtorSelect');
  if(dp && ds){
    if(source === 'repayment'){
      dp.style.display = 'block';
      // Populate with all current debtors
      var dpHtml = '<option value="">— Select person —</option>';
      try{
        var extB = JSON.parse(lsGet('yb_external_borrows_v1')||'{}');
        Object.values(extB).forEach(function(p){
          var lent   = (p.entries||[]).filter(function(e){ return e.type!=='repay'; }).reduce(function(s,e){ return s+Number(e.amount||0); },0);
          var repaid = (p.entries||[]).filter(function(e){ return e.type==='repay';  }).reduce(function(s,e){ return s+Number(e.amount||0); },0);
          var owing  = lent - repaid;
          if(owing > 0) dpHtml += '<option value="ext_'+p.name+'">👤 '+p.name+' — owes '+fmtR(owing)+'</option>';
        });
      }catch(e){}
      try{
        var pax = loadPassengers()||[];
        pax.forEach(function(p){
          var entries = (borrowData&&borrowData[p.name])||[];
          var b=0,r=0;
          entries.forEach(function(e){ if(e.type==='repay') r+=Number(e.amount||0); else{ b+=Number(e.amount||0); if(e.paid) r+=Number(e.amount||0); } });
          var owed = b - r;
          if(owed > 0) dpHtml += '<option value="cp_'+p.name+'">🚗 '+p.name+' — owes '+fmtR(owed)+' (carpool)</option>';
        });
      }catch(e){}
      dpHtml += '<option value="other">Other / Unknown</option>';
      ds.innerHTML = dpHtml;
    } else {
      dp.style.display = 'none';
    }
  }

  var sec = document.getElementById('allocOblSection');

  // ── Passenger source: combined carpool arrears + borrow debt ──
  // When the source is a passenger name (e.g. "Lezaun"), render two
  // allocation rows for that person's two debt types. Order follows the
  // user's priority list. Each row is editable so the user can override.
  if(_saIsPassengerSource(source)){
    _saRenderPassengerAllocation(sec, source);
    return;
  }

  var presets = SA_OBLIGATION_PRESETS[source];
  if(!presets || !presets.length){ sec.innerHTML=''; sec.style.display='none'; return; }
  // Guard: only rebuild DOM when source actually changes — preserves input values mid-type
  if(sec.dataset.renderedFor === source) return;
  sec.dataset.renderedFor = source;
  var html = '<div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#555;margin-bottom:8px;padding-top:10px;border-top:1px solid var(--border);">Fixed Obligations — adjust if needed</div>';
  presets.forEach(function(obl){
    html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;background:#111;border:1px solid #2a5a00;border-radius:6px;padding:8px 12px;margin-bottom:6px;">'
          +   '<div style="font-size:11px;color:#888;flex:1;">'+obl.label+'</div>'
          +   '<div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">'
          +     '<span style="font-size:11px;color:#555;">R</span>'
          +     '<input type="number" id="'+obl.id+'" value="'+obl.default+'" oninput="recalcAllocation()" '
          +       'style="width:90px;background:#1a1a1a;border:2px solid #2a7a00;color:#c8f230;font-family:\'DM Mono\',monospace;font-size:14px;font-weight:700;padding:6px 8px;border-radius:4px;outline:none;text-align:right;" />'
          +   '</div>'
          + '</div>';
  });
  sec.innerHTML = html;
  sec.style.display = 'block';
}

// ── Passenger-source helpers ────────────────────────────────────────────
// Returns true if the given source value is the name of a known passenger.
// We look up against the live PASSENGERS list (via loadPassengers) so this
// stays correct as people are added or renamed.
function _saIsPassengerSource(source){
  if(!source) return false;
  try {
    var pax = (typeof loadPassengers === 'function') ? loadPassengers() : [];
    return pax.some(function(p){ return p.name === source; });
  } catch(e){ return false; }
}

// Compute what a passenger currently owes, split by debt type.
// Returns: { borrowOwed: R, carpoolUnpaid: R, totalOwed: R }
function _saGetPassengerDebts(name){
  var borrowOwed = 0;
  var carpoolUnpaid = 0;

  // ── Carpool-side borrow debt (stored in borrowData[name]) ──
  try {
    var entries = (borrowData && borrowData[name]) || [];
    var b = 0, r = 0;
    entries.forEach(function(e){
      // Skip "I owe them" refund entries — those are debts in the OTHER direction
      if(e.iOwe) return;
      if(e.type === 'repay'){
        r += Number(e.amount || 0);
      } else {
        b += Number(e.amount || 0);
        // Some entries get pre-marked paid via the carpool flow; treat as repaid
        if(e.paid) r += Number(e.amount || 0);
      }
    });
    borrowOwed += Math.max(0, b - r);
  } catch(e){}

  // ── Personal/external borrow debt for the same person ──
  // A passenger may also have an entry in the external borrows store (e.g. if
  // you lent them money outside of carpool context and logged it via the Money
  // Owed → Add Person flow). Match by name (case-insensitive) and add it.
  try {
    var ext = JSON.parse(lsGet('yb_external_borrows_v1') || '{}');
    var nameLower = (name || '').toLowerCase();
    Object.values(ext).forEach(function(person){
      if(!person || !person.name) return;
      if(person.name.toLowerCase() !== nameLower) return;
      var lent = 0, repaid = 0;
      (person.entries || []).forEach(function(e){
        if(e.iOwe) return;
        if(e.type === 'repay') repaid += Number(e.amount || 0);
        else                   lent   += Number(e.amount || 0);
      });
      borrowOwed += Math.max(0, lent - repaid);
    });
  } catch(e){}

  // ── Carpool arrears (sum of unpaid trip cells across all months) ──
  // Walks every stored carpool day for this person, totals the amounts that
  // haven't been marked paid. This is the same calculation the carpool tab
  // uses for its "unpaid" totals.
  try {
    if(typeof cpData === 'object' && cpData){
      Object.keys(cpData).forEach(function(monthKey){
        var month = cpData[monthKey];
        if(!month || typeof month !== 'object') return;
        Object.keys(month).forEach(function(dayKey){
          var day = month[dayKey];
          if(!day || typeof day !== 'object') return;
          var cell = day[name];
          if(!cell || typeof cell !== 'object') return;
          var amt = Number(cell.amt || 0);
          if(amt > 0 && !cell.paid){
            carpoolUnpaid += amt;
          }
        });
      });
    }
  } catch(e){}

  return {
    borrowOwed: borrowOwed,
    carpoolUnpaid: carpoolUnpaid,
    totalOwed: borrowOwed + carpoolUnpaid
  };
}

// Render the allocation rows for a passenger source. Two rows: borrow + carpool.
// The order they appear follows the priority list — whichever the user has
// ranked higher gets the input focus and the larger default allocation if
// the received amount doesn't cover both.
function _saRenderPassengerAllocation(sec, name){
  var debts = _saGetPassengerDebts(name);
  var key = 'passenger:' + name; // dataset.renderedFor key
  // Skip rebuild if we already rendered for this same source (preserves typed values)
  if(sec.dataset.renderedFor === key) return;
  sec.dataset.renderedFor = key;

  // Determine ordering by priority list. Default: borrow before carpool, but
  // user can flip via the Priority editor (see priority rule 'borrow_repay'
  // and 'carpool_income' once added in step 2).
  var order = _saPassengerRowOrder();

  var rows = [
    {
      id: 'allocPaxCarpool',
      key: 'carpool',
      icon: '🚗',
      label: 'Carpool arrears' + (debts.carpoolUnpaid > 0 ? '' : ' (none)'),
      defaultAmt: debts.carpoolUnpaid,
      maxAmt: debts.carpoolUnpaid
    },
    {
      id: 'allocPaxBorrow',
      key: 'borrow',
      icon: '💵',
      label: 'Borrowed money' + (debts.borrowOwed > 0 ? '' : ' (none)'),
      defaultAmt: debts.borrowOwed,
      maxAmt: debts.borrowOwed
    }
  ];

  // Sort rows by the priority order
  rows.sort(function(a, b){
    var ai = order.indexOf(a.key);
    var bi = order.indexOf(b.key);
    if(ai === -1) ai = 99;
    if(bi === -1) bi = 99;
    return ai - bi;
  });

  var totalPill = '<span style="background:#0d1228;border:1px solid #2a3a6a;border-radius:4px;padding:2px 8px;color:#7090f0;font-size:10px;letter-spacing:1px;margin-left:8px;">Total owed: '+fmtR(debts.totalOwed)+'</span>';

  var html = '<div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#555;margin-bottom:8px;padding-top:10px;border-top:1px solid var(--border);">Allocation — adjust if needed' + totalPill + '</div>';

  if(debts.totalOwed === 0){
    html += '<div style="background:#0d1a00;border:1px solid #2a5a00;border-radius:6px;padding:11px 14px;color:#5a8800;font-size:11px;line-height:1.5;">'
         + '✓ ' + name + ' has no outstanding carpool arrears or borrow debt right now.'
         + '<br><span style="color:#888;">Anything received will need to be allocated to a savings fund or marked as a refund.</span>'
         + '</div>';
  } else {
    rows.forEach(function(row){
      var disabled = row.maxAmt <= 0;
      var borderColor = disabled ? '#2a2a2a' : '#2a5a00';
      var inputColor = disabled ? '#444' : '#c8f230';
      var inputBorderColor = disabled ? '#1a1a1a' : '#2a7a00';
      var labelColor = disabled ? '#444' : '#888';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;background:#111;border:1px solid '+borderColor+';border-radius:6px;padding:8px 12px;margin-bottom:6px;'+(disabled?'opacity:.55;':'')+'">'
            +   '<div style="font-size:11px;color:'+labelColor+';flex:1;">'+row.icon+' '+row.label+'</div>'
            +   '<div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">'
            +     '<span style="font-size:11px;color:#555;">R</span>'
            +     '<input type="number" id="'+row.id+'" data-paxrow="'+row.key+'" data-pax="'+name+'" data-max="'+row.maxAmt+'" value="'+row.defaultAmt+'" '+(disabled?'disabled ':'')+'oninput="recalcAllocation()" '
            +       'style="width:90px;background:#1a1a1a;border:2px solid '+inputBorderColor+';color:'+inputColor+';font-family:\'DM Mono\',monospace;font-size:14px;font-weight:700;padding:6px 8px;border-radius:4px;outline:none;text-align:right;" />'
            +   '</div>'
            + '</div>';
    });
  }

  sec.innerHTML = html;
  sec.style.display = 'block';
}

// Returns the order ['borrow','carpool'] or ['carpool','borrow'] based on
// the user's priority list. Priority rule IDs 'borrow_repay' and
// 'carpool_income' will be added to DEFAULT_PRIORITY_RULES in the next step.
function _saPassengerRowOrder(){
  try {
    var rules = (typeof getActivePriorities === 'function') ? getActivePriorities() : [];
    var order = [];
    rules.forEach(function(r){
      if(r.id === 'borrow_repay'   && order.indexOf('borrow')  === -1) order.push('borrow');
      if(r.id === 'carpool_income' && order.indexOf('carpool') === -1) order.push('carpool');
    });
    // Fill in anything missing with a sensible default (borrow first — usually
    // the older debt, more important to settle).
    if(order.indexOf('borrow')  === -1) order.push('borrow');
    if(order.indexOf('carpool') === -1) order.push('carpool');
    return order;
  } catch(e){
    return ['borrow', 'carpool'];
  }
}

// ════════════════════════════════════════════════════════════════════
// PASSENGER-SOURCE SUBMIT HANDLER (Turn 2 of the 7.5 series)
// ════════════════════════════════════════════════════════════════════
// When the income source is a passenger, this handler reads the two
// allocation row inputs (Carpool / Borrow), validates that they sum to a
// reasonable subset of the amount received, and writes the appropriate
// records: borrow repay entries + cashflow income.
//
// Returns one of:
//   'ok'      → submission complete, modal can close
//   'pending' → overpayment detected, warning banner is showing, user needs
//               to either reallocate or tap to mark refund owed
//   'error'   → validation failed, user-visible error already shown
// ════════════════════════════════════════════════════════════════════
function _saSubmitPassengerAllocation(name, gross, date){
  // ── Read the two row inputs ──
  var carpoolEl = document.getElementById('allocPaxCarpool');
  var borrowEl  = document.getElementById('allocPaxBorrow');
  var carpoolAmt = carpoolEl ? (parseFloat(carpoolEl.value)||0) : 0;
  var borrowAmt  = borrowEl  ? (parseFloat(borrowEl.value)||0)  : 0;
  // Clamp negatives — the user shouldn't be able to enter negative amounts but
  // input type=number allows it on some browsers.
  if(carpoolAmt < 0 || borrowAmt < 0){
    alert('Allocation amounts cannot be negative.');
    return 'error';
  }
  var allocated = carpoolAmt + borrowAmt;

  // ── Validate against received amount ──
  if(allocated > gross + 0.001){
    alert('Allocation total (R'+allocated.toFixed(2)+') exceeds amount received (R'+gross.toFixed(2)+'). Reduce one of the rows.');
    return 'error';
  }

  // ── Detect overpayment ──
  // If they sent more than the rows account for, the difference goes to the
  // refund-owed banner. If allocated == gross within a tiny tolerance, no
  // banner — proceed straight through.
  var unallocated = gross - allocated;
  var hasOverpayment = unallocated > 0.005;

  if(hasOverpayment){
    // Render the warning banner with two actions:
    //   (a) Auto-fill the difference into the larger debt row, or
    //   (b) Mark as refund owed → creates iOwe entry, then submits the rest
    _saRenderOverpaymentBanner(name, gross, carpoolAmt, borrowAmt, date);
    return 'pending';
  }

  // ── Everything balanced — write the records ──
  return _saPerformPassengerWrite(name, gross, carpoolAmt, borrowAmt, 0, date);
}

// Render the warning banner inside the obligations section. Two action
// buttons, plus a Continue button for "yes, log a refund of Rx and the rest
// in their categories."
function _saRenderOverpaymentBanner(name, gross, carpoolAmt, borrowAmt, date){
  var sec = document.getElementById('allocOblSection');
  if(!sec) return;
  var unallocated = gross - carpoolAmt - borrowAmt;

  // Remove any prior banner so we don't stack
  var existing = document.getElementById('allocOverpayBanner');
  if(existing) existing.remove();

  var html = ''
    + '<div id="allocOverpayBanner" style="background:#1a0f00;border:1px solid #5a3a00;border-radius:8px;padding:12px;margin:10px 0;color:#f2a830;font-size:11px;line-height:1.5;letter-spacing:0.5px;">'
    +   '<div style="font-weight:700;margin-bottom:6px;">⚠ R'+unallocated.toFixed(2)+' unallocated</div>'
    +   '<div style="color:#aa7a00;margin-bottom:10px;">Allocate it across the rows above, or mark it as a refund owed back to '+name+'. You\'ll be reminded to pay it back.</div>'
    +   '<button onclick="_saMarkAsRefund(\''+name+'\','+gross+','+carpoolAmt+','+borrowAmt+',\''+date+'\')" '
    +     'style="background:#f2a830;border:none;color:#000;font-family:DM Mono,monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;padding:8px 12px;border-radius:5px;cursor:pointer;font-weight:700;">'
    +     'Mark R'+unallocated.toFixed(2)+' as refund owed'
    +   '</button>'
    + '</div>';
  sec.insertAdjacentHTML('beforeend', html);
  // Reset rendered key so input edits don't bypass the next render
  sec.dataset.renderedFor = 'overpay:'+name+':'+Date.now();
}

// User clicked "Mark as refund owed". Submits the carpool + borrow rows
// normally, then creates an iOwe entry on this person for the remainder.
function _saMarkAsRefund(name, gross, carpoolAmt, borrowAmt, date){
  var unallocated = gross - carpoolAmt - borrowAmt;
  if(unallocated <= 0){ closeModal('allocateModal'); return; }
  var result = _saPerformPassengerWrite(name, gross, carpoolAmt, borrowAmt, unallocated, date);
  if(result === 'ok'){
    closeModal('allocateModal');
  }
}

// Atomic write helper — does all the data mutations for a passenger
// allocation in one place so success/failure is consistent across modules.
//
//   carpoolAmt → cashflow income labelled as carpool earnings
//   borrowAmt  → repay entry on the right borrow store + cashflow income
//   refundOwed → iOwe entry on borrow store + nothing on cashflow yet (gets
//                logged when user actually pays back via the outgoing flow)
function _saPerformPassengerWrite(name, gross, carpoolAmt, borrowAmt, refundOwed, date){
  try {
    var noteSuffix = '— MoneyMoveZ split allocation';

    // (1) BORROW REPAYMENT — handle whichever store the debt lives in.
    // Prefer carpool (borrowData) first, then top up from external if needed.
    if(borrowAmt > 0){
      var remainingBorrow = borrowAmt;

      // Carpool-side store
      try {
        if(borrowData && borrowData[name]){
          var carpoolBorrowOwed = _saComputeBorrowDebt(borrowData[name]);
          if(carpoolBorrowOwed > 0){
            var applyHere = Math.min(remainingBorrow, carpoolBorrowOwed);
            if(applyHere > 0){
              borrowData[name].push({
                id: uid(),
                type: 'repay',
                amount: applyHere,
                date: date,
                note: 'Repayment '+noteSuffix,
                paid: true
              });
              remainingBorrow -= applyHere;
            }
          }
        }
      } catch(e){ console.warn('Carpool-borrow write failed:', e); }

      // External / personal store
      try {
        if(remainingBorrow > 0){
          var extD = (typeof loadExternalBorrows === 'function') ? loadExternalBorrows() : {};
          var extKey = Object.keys(extD).find(function(k){
            return extD[k] && (extD[k].name||'').toLowerCase() === (name||'').toLowerCase();
          });
          if(extKey){
            var extLent = 0, extRepaid = 0;
            (extD[extKey].entries||[]).forEach(function(e){
              if(e.iOwe) return;
              if(e.type === 'repay') extRepaid += Number(e.amount||0);
              else                   extLent   += Number(e.amount||0);
            });
            var extOwed = Math.max(0, extLent - extRepaid);
            if(extOwed > 0){
              var applyExt = Math.min(remainingBorrow, extOwed);
              extD[extKey].entries.push({
                id: uid(),
                type: 'repay',
                amount: applyExt,
                date: date,
                note: 'Repayment '+noteSuffix
              });
              if(typeof saveExternalBorrows === 'function') saveExternalBorrows(extD);
              remainingBorrow -= applyExt;
            }
          }
        }
      } catch(e){ console.warn('External-borrow write failed:', e); }

      if(typeof saveBorrows === 'function') try { saveBorrows(); } catch(e){}
    }

    // (2) iOWE ENTRY for refund owed — stored in borrowData[name] with the
    // iOwe flag so the existing borrow render path can pick it up. The Money
    // tab will render these in a separate "You owe these people" section.
    if(refundOwed > 0){
      if(!borrowData[name]) borrowData[name] = [];
      borrowData[name].push({
        id: uid(),
        type: 'iowe',
        iOwe: true,
        amount: refundOwed,
        date: date,
        note: 'Overpayment by '+name+' — refund owed',
        paid: false,
        completed: false
      });
      if(typeof saveBorrows === 'function') try { saveBorrows(); } catch(e){}
    }

    // (3) CASHFLOW INCOME ENTRY — single line item for the FULL gross,
    // categorised based on the split. We don't post separate carpool vs
    // borrow lines — one transaction = one bank deposit = one income entry.
    var bestLabel;
    if(carpoolAmt > 0 && borrowAmt > 0){
      bestLabel = name + ' — Carpool + Borrow Repayment';
    } else if(borrowAmt > 0){
      bestLabel = name + ' — Borrow Repayment';
    } else if(carpoolAmt > 0){
      bestLabel = name + ' — Carpool Income';
    } else {
      bestLabel = name + ' — Payment';
    }
    var noteParts = [];
    if(carpoolAmt > 0) noteParts.push('R'+carpoolAmt.toFixed(2)+' carpool');
    if(borrowAmt  > 0) noteParts.push('R'+borrowAmt.toFixed(2) +' borrow');
    if(refundOwed > 0) noteParts.push('R'+refundOwed.toFixed(2)+' refund owed');

    if(typeof postToCF === 'function'){
      // Income amount = gross MINUS refund-owed portion. The refund portion
      // is technically still in your account but it's earmarked for paying
      // them back, so it shouldn't inflate your real income.
      var realIncome = gross - refundOwed;
      if(realIncome > 0){
        postToCF({
          label: bestLabel,
          amount: realIncome,
          date: date,
          icon: 'income',
          type: 'income',
          sourceType: (borrowAmt > 0 && carpoolAmt === 0) ? 'borrow_repaid' : 'carpool_income',
          sourceId: name,
          sourceCardName: name,
          note: noteParts.join(' + ')
        });
      }
    }

    // (4) UI refresh hooks
    // Render every surface that might be visible underneath. Without these,
    // the user has to tap into a card and out for the new amount to show up.
    try { if(typeof renderMoneyOwed       === 'function') renderMoneyOwed(); } catch(e){}
    try { if(typeof renderCarpool         === 'function') renderCarpool();   } catch(e){}
    try { if(typeof renderFunds           === 'function') renderFunds();     } catch(e){}
    try { if(typeof renderMaintCard       === 'function') renderMaintCard(); } catch(e){}
    try { if(typeof renderCustomMaintCards=== 'function') renderCustomMaintCards(); } catch(e){}
    try { if(typeof renderCashFlow        === 'function') renderCashFlow();  } catch(e){}
    try { if(typeof odinRefreshIfOpen     === 'function') odinRefreshIfOpen(); } catch(e){}
    try { if(typeof renderOdinInsights    === 'function') renderOdinInsights(_odinCallerTab||'money'); } catch(e){}

    // (5) Toast confirmation
    var summary = [];
    if(borrowAmt  > 0) summary.push('R'+borrowAmt.toFixed(2)+' borrow settled');
    if(carpoolAmt > 0) summary.push('R'+carpoolAmt.toFixed(2)+' carpool logged');
    if(refundOwed > 0) summary.push('R'+refundOwed.toFixed(2)+' refund owed');
    var toast = document.createElement('div');
    toast.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#0d1a00;border:1px solid #c8f230;border-radius:10px;padding:12px 20px;z-index:9999;font-family:DM Mono,monospace;font-size:11px;color:#c8f230;letter-spacing:1px;box-shadow:0 4px 24px rgba(0,0,0,.6);max-width:90vw;text-align:center;line-height:1.5;';
    toast.innerHTML = '✓ R'+gross.toFixed(2)+' from '+name+'<br><span style="color:#9bd400;font-size:10px;">'+summary.join(' · ')+'</span>';
    document.body.appendChild(toast);
    setTimeout(function(){ toast.remove(); }, 4500);

    return 'ok';
  } catch(err){
    console.error('Passenger allocation failed:', err);
    alert('Something went wrong saving the allocation. Check the console for details. Your data has not been changed.');
    return 'error';
  }
}

// Helper used by the borrow write — sums net debt from borrow entries,
// excluding iOwe entries (which are debts in the OTHER direction).
function _saComputeBorrowDebt(entries){
  if(!Array.isArray(entries)) return 0;
  var b = 0, r = 0;
  entries.forEach(function(e){
    if(e.iOwe) return;
    if(e.type === 'repay'){
      r += Number(e.amount||0);
    } else {
      b += Number(e.amount||0);
      if(e.paid) r += Number(e.amount||0);
    }
  });
  return Math.max(0, b - r);
}
// ════════════════════════════════════════════════════════════════════
// END PASSENGER-SOURCE SUBMIT HANDLER
// ════════════════════════════════════════════════════════════════════

// ── Priority builder (source-aware) ─────────────────────

// ══════════════════════════════════════════════════════════════════
// ⚡ PRIORITY RULES SYSTEM — editable by user, read by Odin & MoneyMoveZ
// ══════════════════════════════════════════════════════════════════
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
  // Phase H: sync rules across devices
  try { if(window.cloudSync && window.cloudSync.settings) window.cloudSync.settings.push(); } catch(e){}
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
    grip.style.cssText = 'color:#444;font-size:16px;cursor:grab;user-select:none;';
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
    desc.style.cssText = 'font-size:10px;color:#555;margin-top:2px;';
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
      targetLabel.style.cssText = 'font-size:9px;color:#555;letter-spacing:1px;text-transform:uppercase;white-space:nowrap;';
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

function buildAllocPriorities(source, routeableAmount){
  var rule       = saRule(source);
  var now        = new Date();
  var mk         = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  var activePri  = getActivePriorities();
  var priorities = [];

  activePri.forEach(function(prRule){
    try{
      switch(prRule.id){

        case 'cf_deficit':
          var snap = (typeof getLendingSnapshot==='function') ? getLendingSnapshot() : null;
          if(snap && snap.net < 0){
            priorities.push({ type:'cf_deficit', label:'Clear Cash Flow Deficit',
              subLabel:'You are R'+Math.abs(snap.net).toFixed(2)+' over budget',
              urgency:100-(prRule.priority-1)*2, needed:Math.abs(snap.net),
              color:prRule.color, bg:'#1a0505', border:'#5a1a1a' });
          }
          break;

        case 'car_service':
          var csTargetId = prRule.targetId || '__all__';
          var carsToCheck = loadCarsData();
          if(csTargetId !== '__all__'){
            carsToCheck = carsToCheck.filter(function(c){ return c.id===csTargetId; });
          }
          carsToCheck.forEach(function(car){
            // Use smart service intelligence if available
            var daysUntil = null, monthlyNeeded = 0, subLbl = '';
            if(car.lastServiceDate || car.lastServiceKm){
              try{
                var svcCalc = calcNextService(car);
                daysUntil = svcCalc.daysUntilNext;
                var monthsLeft2 = daysUntil != null ? Math.max(1, Math.round(daysUntil/30)) : 4;
                var target2 = car.serviceTargetCost||2000;
                monthlyNeeded = target2/monthsLeft2;
                subLbl = svcCalc.nextType+' Service in '+daysUntil+' days — R'+monthlyNeeded.toFixed(0)+'/mo';
              }catch(e){}
            } else if(car.nextService){
              var svcDate2 = new Date(car.nextService+'T00:00:00');
              var monthsLeft3 = (svcDate2.getFullYear()-now.getFullYear())*12+(svcDate2.getMonth()-now.getMonth());
              if(monthsLeft3<0) monthsLeft3=0;
              daysUntil = monthsLeft3*30;
              var target3 = car.serviceTargetCost||2000;
              monthlyNeeded = monthsLeft3>0?target3/monthsLeft3:target3;
              subLbl = car.nextService+' — R'+target3.toLocaleString('en-ZA')+' target — R'+monthlyNeeded.toFixed(0)+'/mo';
            }
            if(daysUntil!=null && daysUntil<=120 && monthlyNeeded>0){
              priorities.push({ type:'car_service', label:car.name+' Service',
                subLabel:subLbl,
                urgency:90-(prRule.priority-1)*2-Math.round(daysUntil/4), needed:monthlyNeeded,
                color:prRule.color, bg:'#1a1000', border:'#5a3a00', carId:car.id, carName:car.name });
            }
          });
          break;

        case 'maint':
          if(rule.maintEligible){
            var mTargetId = prRule.targetId || '__maint__';
            if(mTargetId === '__maint__'){
              // Original maintenance fund
              var mdata = getMaintData();
              var mThisMonth = mdata.filter(function(e){ return e.date&&e.date.startsWith(mk); }).reduce(function(s,e){ return s+e.amount; },0);
              var mShort = Math.max(0, MAINT_TARGET-mThisMonth);
              if(mShort>0){
                var mUrgency = rule.carpoolIncome ? 80-(prRule.priority-1)*2 : 65-(prRule.priority-1)*2;
                priorities.push({ type:'maint', label:'Maintenance Fund',
                  subLabel:'R'+mThisMonth.toFixed(0)+' of R'+MAINT_TARGET+' this month — R'+mShort.toFixed(0)+' short'+(rule.carpoolIncome?'':' (salary supplement)'),
                  urgency:mUrgency, needed:mShort, color:prRule.color, bg:'#1a1000', border:'#5a3a00' });
              }
            } else {
              // Specific custom maintenance card
              try{
                var mcards = JSON.parse(lsGet(CUSTOM_MAINT_KEY)||'[]');
                var mcard = mcards.find(function(c){ return c.id===mTargetId; });
                if(mcard){
                  var mcSaved = (mcard.entries||[]).reduce(function(s,e){ return s+Number(e.amount||0); },0);
                  var mcTarget = Number(mcard.target||0);
                  var mcShort = Math.max(0, mcTarget-mcSaved);
                  if(mcShort>0){
                    var mcUrgency = rule.carpoolIncome ? 80-(prRule.priority-1)*2 : 65-(prRule.priority-1)*2;
                    priorities.push({ type:'maint', label:mcard.name,
                      subLabel:'R'+mcSaved.toFixed(0)+' of R'+mcTarget+' saved — R'+mcShort.toFixed(0)+' to go',
                      urgency:mcUrgency, needed:mcShort, color:prRule.color, bg:'#1a1000', border:'#5a3a00',
                      maintCardId:mcard.id });
                  }
                }
              }catch(e){}
            }
          }
          break;

        case 'instalments':
          var plans = (typeof loadInst==='function') ? loadInst() : [];
          var today2 = new Date();
          plans.forEach(function(plan){
            if(plan.monthToMonth) return;
            var paidIdxs = (plan.paid||[]).map(function(p){ return p.index; });
            (plan.dates||[]).forEach(function(dateStr,i){
              if(paidIdxs.indexOf(i)>-1) return;
              var dueDate  = new Date(dateStr+'T00:00:00');
              var daysLeft = Math.round((dueDate-today2)/86400000);
              if(daysLeft>=0 && daysLeft<=14){
                priorities.push({ type:'instalments', label:plan.desc||'Instalment',
                  subLabel:fmtR(plan.amt)+' due in '+daysLeft+' day'+(daysLeft===1?'':'s'),
                  urgency:75-(prRule.priority-1)*2-daysLeft, needed:plan.amt,
                  color:prRule.color, bg:'#1a1000', border:'#4a3a00', planId:plan.id, instalmentIndex:i });
              }
            });
          });
          break;

        case 'savings':
          var svTargetId = prRule.targetId || '__all__';
          var savingsFunds = (funds||[]);
          if(svTargetId !== '__all__'){
            savingsFunds = savingsFunds.filter(function(f){ return f.id===svTargetId; });
          }
          savingsFunds.forEach(function(f){
            var total = fundTotal(f);
            var rem   = Math.max(0, f.goal-total);
            if(rem<=0) return;
            var pct     = total/f.goal;
            var monthly = f.weekly ? (f.targetType==='monthly'?f.weekly:f.weekly*4.33) : Math.min(rem,500);
            priorities.push({ type:'savings', label:f.name,
              subLabel:(f.emoji||'💰')+' '+Math.round(pct*100)+'% saved — R'+rem.toLocaleString('en-ZA')+' to go',
              urgency:50-(prRule.priority-1)*2-Math.round(pct*30), needed:monthly,
              color:prRule.color, bg:'#0d1a00', border:'#3a5a00',
              fundId:f.id, fundName:f.name, fundEmoji:f.emoji });
          });
          break;
      }
    }catch(e){ console.warn('Priority eval error for '+prRule.id, e); }
  });

  priorities.sort(function(a,b){ return b.urgency-a.urgency; });
  return priorities;
}

function computeAllocation(routeableAmount, source){
  var priorities = buildAllocPriorities(source, routeableAmount);
  var remaining  = routeableAmount;
  var plan = [];
  priorities.forEach(function(p){
    if(remaining<=0) return;
    var alloc = Math.min(remaining, p.needed);
    if(alloc<1) return;
    plan.push({ priority:p, allocated:Math.round(alloc*100)/100 });
    remaining -= alloc;
  });
  return { plan:plan, leftover:Math.max(0,Math.round(remaining*100)/100) };
}

// ── Live recalc ──────────────────────────────────────────
function recalcAllocation(){
  var gross  = parseFloat(document.getElementById('allocAmount').value)||0;
  var source = document.getElementById('allocSource').value;
  var rule   = saRule(source);
  var wrap   = document.getElementById('allocPlanWrap');
  var empty  = document.getElementById('allocEmptyState');
  var btns   = document.getElementById('allocActionBtns');

  // Show/hide obligation inputs (passenger sources render their own rows)
  _saRenderObligations(source);

  if(gross<=0){
    wrap.style.display='none';
    empty.style.display='block';
    if(btns) btns.style.display='none';
    return;
  }

  // ── Passenger source: skip the legacy savings/maint plan UI ──
  // For passenger sources we only show the Carpool/Borrow allocation rows
  // (rendered by _saRenderPassengerAllocation). The legacy "Allocation Plan"
  // card with auto-routed savings/maint logic doesn't apply — passenger
  // payments are routed via _saSubmitPassengerAllocation when Approve is
  // tapped, and any leftover becomes a refund (iOwe), not an auto-saving.
  if(_saIsPassengerSource(source)){
    _allocPlan = []; _allocObligations = [];
    wrap.style.display = 'none';   // hide "Allocation Plan" header + cards
    empty.style.display = 'none';
    if(btns) btns.style.display='flex';   // show Cancel + Approve regardless
    // Show a small total-logged summary so user has the whole picture
    var carpoolEl = document.getElementById('allocPaxCarpool');
    var borrowEl  = document.getElementById('allocPaxBorrow');
    var carpoolAmt = carpoolEl ? (parseFloat(carpoolEl.value)||0) : 0;
    var borrowAmt  = borrowEl  ? (parseFloat(borrowEl.value)||0)  : 0;
    var allocated = carpoolAmt + borrowAmt;
    var unalloc = Math.max(0, gross - allocated);
    var summary = document.getElementById('allocPaxSummary');
    if(!summary){
      summary = document.createElement('div');
      summary.id = 'allocPaxSummary';
      var oblSec = document.getElementById('allocOblSection');
      if(oblSec && oblSec.parentNode){ oblSec.parentNode.insertBefore(summary, oblSec.nextSibling); }
    }
    summary.style.cssText = 'margin:14px 0 8px;padding:11px 14px;background:#0d1a00;border:1px solid #2a5a00;border-radius:8px;display:flex;justify-content:space-between;align-items:center;font-family:DM Mono,monospace;';
    var summaryLeft = '<div><div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#5a8800;">Total Allocated</div>';
    if(unalloc > 0.005){
      summaryLeft += '<div style="font-size:9px;letter-spacing:1.5px;color:#aa7a00;margin-top:3px;">⚠ R'+unalloc.toFixed(2)+' unallocated</div>';
    }
    summaryLeft += '</div>';
    summary.innerHTML = summaryLeft + '<div style="font-family:Syne,sans-serif;font-weight:800;font-size:18px;color:#c8f230;">R'+allocated.toFixed(2)+'</div>';
    return;
  }
  // Clear any passenger summary if source switched away from a passenger
  var staleSummary = document.getElementById('allocPaxSummary');
  if(staleSummary) staleSummary.remove();

  // Collect obligations (editable by user)
  var oblTotal = 0;
  _allocObligations = [];
  var presets = SA_OBLIGATION_PRESETS[source]||[];
  presets.forEach(function(obl){
    var inp = document.getElementById(obl.id);
    var amt = inp ? (parseFloat(inp.value)||0) : obl.default;
    if(amt>0){ oblTotal += amt; _allocObligations.push({ label:obl.label, amount:amt }); }
  });

  var routeable = Math.max(0, gross - oblTotal);

  wrap.style.display='block'; empty.style.display='none';
  if(btns) btns.style.display='flex';

  // ── Obligation summary row ───────────────────────────
  var oblSummary = document.getElementById('allocOblSummary');
  if(oblSummary){
    if(oblTotal>0){
      oblSummary.style.display='flex';
      oblSummary.innerHTML =
        '<div style="flex:1;">'
        +'<div style="font-size:11px;color:#888;font-family:\'Syne\',sans-serif;font-weight:700;">Fixed Obligations</div>'
        +'<div style="font-size:9px;color:#555;margin-top:2px;">'+_allocObligations.map(function(o){return o.label+' R'+o.amount.toLocaleString('en-ZA');}).join(' · ')+'</div>'
        +'</div>'
        +'<div style="text-align:right;flex-shrink:0;">'
        +'<div style="font-family:\'Syne\',sans-serif;font-weight:800;font-size:16px;color:#f23060;">−R'+oblTotal.toLocaleString('en-ZA')+'</div>'
        +'<div style="font-size:9px;color:#555;margin-top:2px;">DEDUCTED</div>'
        +'</div>';
    } else {
      oblSummary.style.display='none';
    }
  }

  // ── Routeable badge ──────────────────────────────────
  var routeBadge = document.getElementById('allocRouteableBadge');
  if(routeBadge){
    if(oblTotal>0){
      routeBadge.style.display='block';
      routeBadge.textContent = 'Routing R'+routeable.toLocaleString('en-ZA')+' (after obligations)';
    } else {
      routeBadge.style.display='none';
    }
  }

  // Compute allocation on the routeable amount
  var result = computeAllocation(routeable, source);
  _allocPlan = result.plan;

  // ── Alert banner ─────────────────────────────────────
  var alertEl = document.getElementById('allocPriorityAlert');
  var deficit = result.plan.find(function(r){ return r.priority.type==='cf_deficit'; });
  var svc     = result.plan.find(function(r){ return r.priority.type==='car_service'; });
  var noMaint = rule.maintEligible===false;
  if(deficit){
    alertEl.style.display='block'; alertEl.style.color='#f23060';
    alertEl.style.background='#1a0505'; alertEl.style.borderColor='#5a1a1a';
    alertEl.textContent='Cash flow deficit detected — plugging it first.';
  } else if(noMaint){
    alertEl.style.display='block'; alertEl.style.color='#888';
    alertEl.style.background='#111'; alertEl.style.borderColor='#2a2a2a';
    alertEl.textContent='Gift / Other sources don\'t touch the Maintenance Fund — going to savings only.';
  } else if(svc){
    alertEl.style.display='block'; alertEl.style.color='#f2a830';
    alertEl.style.background='#1a1000'; alertEl.style.borderColor='#5a3a00';
    alertEl.textContent=svc.priority.carName+' service coming up — saving toward it first.';
  } else {
    alertEl.style.display='none';
  }

  // ── Plan rows ────────────────────────────────────────
  var rowsEl = document.getElementById('allocRows');
  rowsEl.innerHTML='';
  var total=0;
  var labels=['FIRST','SECOND','THIRD','NEXT'];
  result.plan.forEach(function(item,idx){
    total += item.allocated;
    var p   = item.priority;
    var row = document.createElement('div');
    row.style.cssText='background:'+p.bg+';border:1px solid '+p.border+';border-radius:8px;padding:11px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;';
    row.innerHTML =
      '<div style="flex:1;min-width:0;">'
      +'<div style="font-size:12px;color:#efefef;font-family:Syne,sans-serif;font-weight:700;">'+p.label+'</div>'
      +'<div style="font-size:9px;color:'+p.color+';opacity:.75;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+p.subLabel+'</div>'
      +'</div>'
      +'<div style="text-align:right;flex-shrink:0;">'
      +'<div style="font-family:Syne,sans-serif;font-weight:800;font-size:16px;color:'+p.color+';">R'+item.allocated.toFixed(2)+'</div>'
      +'<div style="font-size:9px;color:#555;margin-top:2px;">'+(labels[idx]||'NEXT')+'</div>'
      +'</div>';
    rowsEl.appendChild(row);
  });

  // ── Leftover ─────────────────────────────────────────
  var leftBar = document.getElementById('allocLeftoverBar');
  if(result.leftover>0){
    leftBar.style.display='block';
    document.getElementById('allocLeftoverAmt').textContent='R'+result.leftover.toFixed(2);
  } else {
    leftBar.style.display='none';
  }

  // ── Total allocated ──────────────────────────────────
  document.getElementById('allocTotalAmt').textContent='R'+total.toFixed(2);
}

// ── Confirm & log ────────────────────────────────────────
function confirmAllocation(){
  var gross  = parseFloat(document.getElementById('allocAmount').value)||0;
  var source = document.getElementById('allocSource').value;
  var date   = document.getElementById('allocDate').value || localDateStr(new Date());
  if(!gross||gross<=0){ alert('Please enter the amount received.'); return; }

  // ── Passenger-source split-allocation flow ──────────────────────────────
  // Source = a passenger name → read the carpool/borrow row values, validate
  // sums, and route to the right destinations atomically. Submits even when
  // _allocPlan/_allocObligations are empty (which is normal for passenger
  // sources — they don't have fixed obligations).
  if(_saIsPassengerSource(source)){
    var paxResult = _saSubmitPassengerAllocation(source, gross, date);
    if(paxResult === 'pending') return; // user needs to handle warning banner
    if(paxResult === 'error')   return; // validation error already shown
    // 'ok' → continue below to also run any savings/maint plan rows for the
    // remainder. But for passenger sources, _allocPlan is usually empty so
    // we close out here.
    closeModal('allocateModal');
    return;
  }

  if(!_allocPlan.length && !_allocObligations.length){ alert('Nothing to log yet.'); return; }

  var rule     = saRule(source);
  var srcLabel = rule.label;

  // ── If generic repayment, link to debtor and update borrow record ──
  if(source === 'repayment'){
    var ds = document.getElementById('allocDebtorSelect');
    var debtorVal = ds ? ds.value : '';
    if(debtorVal && debtorVal !== 'other'){
      try{
        if(debtorVal.startsWith('ext_')){
          var extName = debtorVal.replace('ext_','');
          var extD2 = loadExternalBorrows();
          var extKey = Object.keys(extD2).find(function(k){ return extD2[k].name === extName; });
          if(extKey){
            extD2[extKey].entries.push({ id:uid(), type:'repay', amount:gross, date:date, note:'via MoneyMoveZ' });
            saveExternalBorrows(extD2);
            srcLabel = extName + ' — Repayment';
          }
        } else if(debtorVal.startsWith('cp_')){
          var cpName = debtorVal.replace('cp_','');
          if(!borrowData[cpName]) borrowData[cpName] = [];
          var cfIdRepay = postToCF({ label:cpName+' — Borrow Repayment', amount:gross, date:date,
            icon:'repay', type:'income', sourceType:'borrow_repaid', sourceId:cpName, note:'via MoneyMoveZ' });
          borrowData[cpName].push({ id:uid(), type:'repay', amount:gross, date:date, note:'via MoneyMoveZ', paid:true, cfId:cfIdRepay });
          saveBorrows();
          renderMoneyOwed();
          if(typeof renderOdinInsights==='function') try{ renderOdinInsights('money'); }catch(e){}
          closeModal('allocateModal');
          var t2=document.createElement('div');
          t2.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#0d1a00;border:1px solid #c8f230;border-radius:10px;padding:12px 20px;z-index:9999;font-family:DM Mono,monospace;font-size:11px;color:#c8f230;letter-spacing:1px;box-shadow:0 4px 24px rgba(0,0,0,.6);white-space:nowrap;';
          t2.textContent = 'R'+gross.toFixed(2)+' repayment from '+cpName+' logged';
          document.body.appendChild(t2); setTimeout(function(){ t2.remove(); },3000);
          return;
        }
      }catch(e){ console.warn('Debtor link error:', e); }
    }
  }

  // 1. Log gross income
  postToCF({ label:srcLabel, amount:gross, date:date, icon:'income', type:'income',
    sourceType:'allocation_income', sourceId:source, sourceCardName:srcLabel, note:'MoneyMoveZ' });

  // 2. Log each obligation as a Cash Flow expense
  _allocObligations.forEach(function(obl){
    postToCF({ label:obl.label, amount:obl.amount, date:date, icon:'expense', type:'expense',
      sourceType:'obligation', sourceId:source, sourceCardName:obl.label, note:'Fixed obligation from '+srcLabel });
  });

  // 3. Execute savings/maint/car_service routing
  _allocPlan.forEach(function(item){
    var p = item.priority;
    try{
      if(p.type==='savings' && p.fundId){
        // Always reload funds fresh to avoid stale reference
        var fIdx = funds.findIndex(function(x){ return x.id===p.fundId; });
        if(fIdx > -1){
          var fName = funds[fIdx].name;
          var cid = postToCF({ label:'Savings — '+fName, amount:item.allocated, date:date, icon:'savings', type:'expense',
            sourceType:'savings_deposit', sourceId:p.fundId, sourceCardName:fName, note:'MoneyMoveZ from '+srcLabel });
          if(!funds[fIdx].deposits) funds[fIdx].deposits = [];
          funds[fIdx].deposits.push({ id:uid(), amount:item.allocated, note:'MoneyMoveZ from '+srcLabel, date:date, cfId:cid });
          var m=loadManualBalances(); if(m[p.fundId]!==undefined){ delete m[p.fundId]; saveManualBalances(m); }
          saveFunds(); // Save immediately after each deposit to prevent data loss
        }
      } else if(p.type==='maint'){
        var mid = uid();
        var cid = postToCF({ label:'Maintenance Fund — Allocation', amount:item.allocated, date:date, icon:'maint', type:'expense',
          sourceType:'maint', sourceId:mid, sourceCardName:'Maintenance Fund', note:'MoneyMoveZ from '+srcLabel });
        var mdata=getMaintData();
        mdata.push({ id:mid, person:'MoneyMoveZ', amount:item.allocated, date:date, note:'From '+srcLabel, cfId:cid });
        saveMaintData(mdata);
      } else if(p.type==='car_service'){
        // Route to linked maintenance card or custom maint card
        var car = loadCarsData().find(function(c){ return c.id===p.carId; });
        var maintFundId = car ? car.maintenanceFundId : null;
        if(maintFundId && maintFundId !== '__maint__'){
          // Custom maintenance card
          try{
            var mcards = JSON.parse(lsGet(CUSTOM_MAINT_KEY)||'[]');
            var mcIdx = mcards.findIndex(function(c){ return c.id===maintFundId; });
            if(mcIdx>-1){
              var cid = postToCF({ label:p.carName+' Service Saving', amount:item.allocated, date:date, icon:'service', type:'expense',
                sourceType:'car_service_save', sourceId:p.carId, sourceCardName:p.carName, note:'Saving for service' });
              if(!mcards[mcIdx].entries) mcards[mcIdx].entries=[];
              mcards[mcIdx].entries.push({ id:uid(), personId:'MoneyMoveZ', person:'MoneyMoveZ', amount:item.allocated, date:date, note:'Service saving from '+srcLabel, cfId:cid });
              lsSet(CUSTOM_MAINT_KEY, JSON.stringify(mcards));
            }
          }catch(e){}
        } else if(maintFundId === '__maint__'){
          // Original maintenance fund
          var mid2 = uid();
          var cid = postToCF({ label:p.carName+' Service Saving', amount:item.allocated, date:date, icon:'service', type:'expense',
            sourceType:'car_service_save', sourceId:p.carId, sourceCardName:p.carName, note:'Saving for service' });
          var mdata2=getMaintData();
          mdata2.push({ id:mid2, person:'MoneyMoveZ', amount:item.allocated, date:date, note:'Service saving — '+p.carName, cfId:cid });
          saveMaintData(mdata2);
        }
      }
    }catch(err){}
  });

  saveFunds(); renderFunds(); renderMaintCard();
  if(typeof runSmartEngine==='function') try{ runSmartEngine(); }catch(e){}
  closeModal('allocateModal');

  var numActions = _allocPlan.length + _allocObligations.length;
  var toast = document.createElement('div');
  toast.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#0d1a00;border:1px solid #c8f230;border-radius:10px;padding:12px 20px;z-index:9999;font-family:DM Mono,monospace;font-size:11px;color:#c8f230;letter-spacing:1px;box-shadow:0 4px 24px rgba(0,0,0,.6);white-space:nowrap;';
  toast.textContent = 'R'+gross.toFixed(2)+' logged — '+numActions+' entr'+(numActions!==1?'ies':'y')+' created';
  document.body.appendChild(toast);
  setTimeout(function(){ toast.remove(); }, 3000);
}
// ════════════════════════════════════════════════════════
// END SMART ALLOCATION ENGINE
// ════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════
// ODIN TAB PANELS — context-aware per tab
// ════════════════════════════════════════════════════════
var _odinOpenTab = null;
var _odinCallerTab = null;

function closeAllocateAndReturn(){
  closeModal('allocateModal');
  // Re-open the Odin panel on the tab that launched it
  if(_odinCallerTab){
    var panel = document.getElementById('odinPanel-'+_odinCallerTab);
    var chev  = document.getElementById('odinChev-'+_odinCallerTab);
    var sub   = document.getElementById('odinSub-'+_odinCallerTab);
    if(panel && !panel.classList.contains('open')){
      panel.classList.add('open');
      if(chev) chev.classList.add('open');
      if(sub) sub.textContent = 'Overseeing this tab';
      renderOdinInsights(_odinCallerTab);
    }
  }
}

function toggleOdinPanel(tabId){
  var panel  = document.getElementById('odinPanel-'+tabId);
  var chev   = document.getElementById('odinChev-'+tabId);
  var sub    = document.getElementById('odinSub-'+tabId);
  if(!panel) return;
  var isOpen = panel.classList.contains('open');
  // Close all panels first
  document.querySelectorAll('.odin-panel').forEach(function(p){ p.classList.remove('open'); });
  document.querySelectorAll('.odin-bar-chev').forEach(function(c){ c.classList.remove('open'); });
  if(!isOpen){
    panel.classList.add('open');
    chev.classList.add('open');
    _odinOpenTab = tabId;
    renderOdinInsights(tabId);
    if(sub) sub.textContent = 'Overseeing this tab';
  } else {
    _odinOpenTab = null;
    if(sub) sub.textContent = 'Tap to open';
  }
}

function openAllocateModalFor(tabId){
  _odinCallerTab = tabId;
  // Pre-select source based on tab context
  openAllocateModal(tabId);
  var sel = document.getElementById('allocSource');
  if(!sel) return;
  if(tabId === 'carpool'){
    // Pick first passenger who owes something
    var passengers = [];
    try{ passengers = loadPassengers()||[]; }catch(e){}
    var owing = passengers.find(function(p){
      var entries = borrowData[p.name]||[];
      var b=0,r=0;
      entries.forEach(function(e){ if(e.type==='repay') r+=Number(e.amount||0); else b+=Number(e.amount||0); });
      return (b-r) > 0;
    });
    if(owing) sel.value = owing.name;
    else if(passengers.length) sel.value = passengers[0].name;
  } else if(tabId === 'money'){
    // Dropdown already built with real debtors by _saRefreshSourceDropdown
    // sel.value will default to first debtor automatically
  } else if(tabId === 'savings' || tabId === 'cashflow'){
    sel.value = 'salary';
  } else if(tabId === 'cars'){
    sel.value = 'salary';
  }
  if(typeof recalcAllocation === 'function') recalcAllocation();
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
