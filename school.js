// School: calendar, events, results, grades

var _schoolFilter = 'all';

// ── School Calendar: localStorage-backed ──
// Defaults are intentionally empty so a fresh user starts with a clean slate.
// Existing data in localStorage takes precedence (see loadSchoolEvents). Odin
// detects an empty state and proactively offers a setup walkthrough on the
// dashboard tab, so new users aren't left staring at "Nothing here!".
var SCHOOL_DATA_DEFAULT = [];

function loadSchoolEvents(){
  try{
    var d=JSON.parse(lsGet(SCHOOL_EVENTS_KEY)||'null');
    if(d && Array.isArray(d)){
      // Self-healing dedup: remove duplicate events by date+type+title+time
      var seen={};
      var deduped=d.filter(function(e){
        var key=(e.date||'')+'|'+(e.type||'')+'|'+(e.title||'')+'|'+(e.time||'');
        if(seen[key]) return false;
        seen[key]=true;
        return true;
      });
      if(deduped.length !== d.length){
        console.log('[school] Self-healed duplicates: '+d.length+' -> '+deduped.length);
        lsSet(SCHOOL_EVENTS_KEY, JSON.stringify(deduped));
        return deduped;
      }
      return d;
    }
  }catch(e){}
  // First run — seed from default and persist
  lsSet(SCHOOL_EVENTS_KEY, JSON.stringify(SCHOOL_DATA_DEFAULT));
  return SCHOOL_DATA_DEFAULT.slice();
}
function saveSchoolEvents(arr){ lsSet(SCHOOL_EVENTS_KEY, JSON.stringify(arr)); }

// Live reference — always call loadSchoolEvents() to get current data
var SCHOOL_DATA = loadSchoolEvents();

var SUBJECT_COLORS = {
  'Entrepreneurship':        '#a78bfa',
  'International Business':  '#60a5fa',
  'BM':                      '#f2a830',
  'BI':                      '#34d399',
  'IT':                      '#f87171',
  'International Business & Entrepreneurship': '#818cf8',
  'BM & BI & IT':            '#fb923c',
};

var TYPE_ICONS = { webinar:'📡', assignment:'📝', quiz:'🧪', exam:'📋' };

function getSchoolDone(){
  try{ return JSON.parse(lsGet(SCHOOL_DONE_KEY)||'[]'); }catch(e){ return []; }
}
function saveSchoolDone(arr){ lsSet(SCHOOL_DONE_KEY, JSON.stringify(arr)); }

function toggleSchoolDone(id){
  var done = getSchoolDone();
  var idx = done.indexOf(id);
  if(idx > -1) done.splice(idx,1); else done.push(id);
  saveSchoolDone(done);
  // Phase G: sync the event's done-state to cloud
  try {
    if(window.cloudSync && window.cloudSync.school){
      var ev = loadSchoolEvents().find(function(e){ return e.id === id; });
      if(ev) window.cloudSync.school.upsertEvent(ev, done.indexOf(id) > -1);
    }
  } catch(e){}
  renderSchool();
}

function setSchoolFilter(f, btn){
  _schoolFilter = f;
  document.querySelectorAll('.school-filter').forEach(function(b){ b.classList.remove('active'); });
  btn.classList.add('active');
  var listEl = document.getElementById('schoolList');
  var resEl  = document.getElementById('schoolResults');
  if(f === 'results'){
    if(listEl) listEl.style.display = 'none';
    if(resEl)  resEl.style.display  = 'block';
    renderSchoolResults();
  } else {
    if(listEl) listEl.style.display = 'block';
    if(resEl)  resEl.style.display  = 'none';
    renderSchool();
  }
}

function deleteSchoolEvent(id){
  if(!confirm('Delete this event?')) return;
  var events = loadSchoolEvents();
  events = events.filter(function(e){ return e.id !== id; });
  saveSchoolEvents(events);
  SCHOOL_DATA = events;
  // Also remove from done list
  var done = getSchoolDone().filter(function(d){ return d !== id; });
  saveSchoolDone(done);
  // Phase G: soft-delete the event in the cloud
  try { if(window.cloudSync && window.cloudSync.school) window.cloudSync.school.removeEvent(id); } catch(e){}
  renderSchool();
}

function openAddSchoolEvent(existingEvent){
  var isEdit = !!existingEvent;
  var ev = existingEvent || { id:'', type:'webinar', subject:'', title:'', date:'', time:'' };
  var typeOpts = ['webinar','assignment','quiz','exam'];
  var overlay = document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:1000;display:flex;align-items:flex-end;justify-content:center;';
  var typeButtons = typeOpts.map(function(t){
    var sel = ev.type===t;
    return '<button data-type="'+t+'" onclick="selectSchoolEventType(this,\''+t+'\')" style="padding:6px 12px;border:1px solid '+(sel?'#c8f230':'#2a2a2a')+';border-radius:6px;background:'+(sel?'#1a2e00':'none')+';color:'+(sel?'#c8f230':'#555')+';font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1px;cursor:pointer;text-transform:uppercase;">'+t+'</button>';
  }).join('');
  overlay.innerHTML =
    '<div style="background:#111;border:1px solid #2a2a2a;border-radius:16px 16px 0 0;width:100%;max-width:480px;max-height:85vh;overflow-y:auto;">'
      +'<div style="padding:20px 20px 14px;border-bottom:1px solid #1a1a1a;display:flex;align-items:center;justify-content:space-between;">'
        +'<div style="font-family:\'Syne\',sans-serif;font-weight:800;font-size:18px;color:#efefef;">'+(isEdit?'Edit Event':'Add Event')+'</div>'
        +'<button onclick="this.closest(\'[data-overlay]\').remove()" style="background:none;border:1px solid #2a2a2a;border-radius:6px;width:28px;height:28px;color:#555;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;">×</button>'
      +'</div>'
      +'<div style="padding:16px 20px;display:grid;gap:14px;">'
        +'<div><div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#555;margin-bottom:8px;">Type</div>'
          +'<div id="seTypePicker" style="display:flex;gap:6px;flex-wrap:wrap;">'+typeButtons+'</div>'
          +'<input type="hidden" id="seType" value="'+ev.type+'">'
        +'</div>'
        +'<div><label style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#555;display:block;margin-bottom:6px;">Subject</label>'
          +'<input id="seSubject" type="text" value="'+ev.subject+'" placeholder="e.g. Business Intelligence 3" style="width:100%;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:6px;padding:10px 12px;color:#efefef;font-family:\'DM Mono\',monospace;font-size:12px;">'
        +'</div>'
        +'<div><label style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#555;display:block;margin-bottom:6px;">Title</label>'
          +'<input id="seTitle" type="text" value="'+ev.title+'" placeholder="e.g. Webinar 1" style="width:100%;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:6px;padding:10px 12px;color:#efefef;font-family:\'DM Mono\',monospace;font-size:12px;">'
        +'</div>'
        +'<div><label style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#555;display:block;margin-bottom:6px;">Date</label>'
          +'<input id="seDate" type="date" value="'+ev.date+'" style="width:100%;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:6px;padding:10px 12px;color:#efefef;font-family:\'DM Mono\',monospace;font-size:12px;">'
        +'</div>'
        +'<div><label style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#555;display:block;margin-bottom:6px;">Time <span style="color:#444;">(optional, e.g. 18:30-19:30)</span></label>'
          +'<input id="seTime" type="text" value="'+ev.time+'" placeholder="e.g. 18:30-19:30 or Due Date" style="width:100%;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:6px;padding:10px 12px;color:#efefef;font-family:\'DM Mono\',monospace;font-size:12px;">'
        +'</div>'
      +'</div>'
      +'<div style="display:flex;gap:8px;padding:12px 20px 20px;">'
        +'<button id="seSaveBtn" style="flex:1;background:#1a2e00;border:1px solid #3a5a00;border-radius:8px;padding:12px;color:#c8f230;font-family:\'DM Mono\',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;">Save Event</button>'
        +'<button id="seCancelBtn" style="background:none;border:1px solid #2a2a2a;border-radius:8px;padding:12px 16px;color:#555;font-family:\'DM Mono\',monospace;font-size:11px;cursor:pointer;">Cancel</button>'
      +'</div>'
    +'</div>';
  overlay.setAttribute('data-overlay','1');
  overlay.querySelector('#seSaveBtn').addEventListener('click', function(){
    var type    = overlay.querySelector('#seType').value;
    var subject = overlay.querySelector('#seSubject').value.trim();
    var title   = overlay.querySelector('#seTitle').value.trim();
    var date    = overlay.querySelector('#seDate').value;
    var time    = overlay.querySelector('#seTime').value.trim();
    if(!subject || !title || !date){ alert('Subject, Title and Date are required.'); return; }
    var events = loadSchoolEvents();
    var savedEvent = null;
    if(isEdit){
      var idx = events.findIndex(function(e){ return e.id===ev.id; });
      if(idx > -1){
        events[idx] = { id:ev.id, type:type, subject:subject, title:title, date:date, time:time };
        savedEvent = events[idx];
      }
    } else {
      var newId = 'se_' + Date.now();
      savedEvent = { id:newId, type:type, subject:subject, title:title, date:date, time:time };
      events.push(savedEvent);
    }
    saveSchoolEvents(events);
    SCHOOL_DATA = events;
    // Phase G: sync the new/edited event to cloud (preserve its done-state)
    try {
      if(window.cloudSync && window.cloudSync.school && savedEvent){
        var isDone = getSchoolDone().indexOf(savedEvent.id) > -1;
        window.cloudSync.school.upsertEvent(savedEvent, isDone);
      }
    } catch(e){}
    overlay.remove();
    renderSchool();
  });
  overlay.querySelector('#seCancelBtn').addEventListener('click', function(){ overlay.remove(); });
  overlay.addEventListener('click', function(e){ if(e.target===overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function selectSchoolEventType(btn, type){
  var picker = btn.parentElement;
  picker.querySelectorAll('button').forEach(function(b){
    b.style.borderColor='#2a2a2a'; b.style.background='none'; b.style.color='#555';
  });
  btn.style.borderColor='#c8f230'; btn.style.background='#1a2e00'; btn.style.color='#c8f230';
  document.getElementById('seType').value = type;
}

function renderSchool(){
  var today = new Date(); today.setHours(0,0,0,0);
  var done = getSchoolDone();
  var list = document.getElementById('schoolList');
  if(!list) return;

  SCHOOL_DATA = loadSchoolEvents(); // always fresh from storage
  var items = SCHOOL_DATA.slice();

  // Apply filter
  if(_schoolFilter === 'upcoming'){
    items = items.filter(function(i){
      var d = new Date(i.date+'T00:00:00');
      return d >= today && done.indexOf(i.id) === -1;
    });
  } else if(_schoolFilter !== 'all'){
    items = items.filter(function(i){ return i.type === _schoolFilter; });
  }

  // Sort by date
  items.sort(function(a,b){ return a.date.localeCompare(b.date); });

  if(items.length === 0){
    var totalEvents = SCHOOL_DATA.length;
    if(totalEvents === 0){
      list.innerHTML =
        '<div style="padding:32px 20px;text-align:center;background:var(--surface);border:1px dashed var(--border);border-radius:10px;">'
          +'<div style="font-size:32px;margin-bottom:10px;">📚</div>'
          +'<div style="font-size:14px;color:#efefef;font-weight:600;margin-bottom:6px;">Your school calendar is empty</div>'
          +'<div style="font-size:11px;color:#666;letter-spacing:0.5px;line-height:1.6;margin-bottom:16px;">Add webinars, assignments, quizzes and exams here. Odin will remind you about deadlines and show you what\'s coming up.</div>'
          +'<button onclick="askOdinAboutSchool()" style="background:#c8f230;border:none;border-radius:6px;color:#000;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;padding:9px 14px;cursor:pointer;font-weight:700;margin-right:6px;">💬 Ask Odin how</button>'
          +'<button onclick="quickAddSchoolEvent()" style="background:none;border:1px solid #2a2a2a;border-radius:6px;color:#888;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;padding:9px 14px;cursor:pointer;">＋ Quick add</button>'
        +'</div>';
    } else {
      list.innerHTML = '<div style="padding:40px 16px;text-align:center;color:#333;font-size:13px;background:var(--surface);border:1px dashed var(--border);border-radius:10px;">No events match this filter.</div>';
    }
    return;
  }

  var html = '';
  var lastMonth = '';

  items.forEach(function(item){
    var d = new Date(item.date+'T00:00:00');
    var diff = Math.round((d - today)/86400000);
    var isDone = done.indexOf(item.id) > -1;
    var subColor = SUBJECT_COLORS[item.subject] || '#888';

    // Month separator
    var monthLabel = d.toLocaleString('en-ZA',{month:'long',year:'numeric'});
    if(monthLabel !== lastMonth){
      html += '<div style="font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#444;margin:16px 0 8px;padding-left:2px;">'+monthLabel+'</div>';
      lastMonth = monthLabel;
    }

    // Status
    var statusClass = '';
    var badge = '';
    if(isDone){
      badge = '<span style="background:#1a2e00;border:1px solid #3a5a00;border-radius:100px;padding:2px 8px;font-size:9px;color:#c8f230;letter-spacing:1px;">✓ Done</span>';
    } else if(diff < 0){
      statusClass = 'overdue';
      badge = '<span style="color:#f23060;font-size:10px;letter-spacing:1px;">⚠ Overdue '+Math.abs(diff)+'d</span>';
    } else if(diff === 0){
      statusClass = 'today';
      badge = '<span style="color:#f2a830;font-size:10px;letter-spacing:1px;">⚡ TODAY</span>';
    } else if(diff <= 7){
      statusClass = 'soon';
      badge = '<span style="color:#d4a800;font-size:10px;letter-spacing:1px;">⏰ In '+diff+'d</span>';
    } else if(diff <= 30){
      badge = '<span style="color:#5a8800;font-size:10px;letter-spacing:1px;">In '+diff+'d</span>';
    } else {
      badge = '<span style="color:#2a4a00;font-size:10px;letter-spacing:1px;">In '+diff+'d</span>';
    }

    var dateStr = d.getDate()+' '+d.toLocaleString('en-ZA',{month:'short'});

    html +=
      '<div class="school-card '+(isDone?'done':statusClass)+'" style="border-left:3px solid '+subColor+';">'
        +'<div style="text-align:center;min-width:38px;flex-shrink:0;">'
          +'<div style="font-size:20px;">'+TYPE_ICONS[item.type]+'</div>'
          +'<div style="font-size:9px;color:#555;margin-top:2px;letter-spacing:0.5px;">'+dateStr+'</div>'
        +'</div>'
        +'<div style="flex:1;min-width:0;">'
          +'<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:13px;color:#efefef;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+item.subject+' — '+item.title+'</div>'
          +'<div style="display:flex;align-items:center;gap:8px;margin-top:3px;flex-wrap:wrap;">'
            +(item.time && item.time !== 'Due Date' ? '<span style="font-size:10px;color:#555;">🕐 '+item.time+'</span>' : '')
            +'<span style="font-size:9px;background:'+subColor+'22;border:1px solid '+subColor+'44;border-radius:100px;padding:1px 7px;color:'+subColor+';letter-spacing:0.5px;">'+item.type.toUpperCase()+'</span>'
            +badge
          +'</div>'
        +'</div>'
        +'<button onclick="toggleSchoolDone(\''+item.id+'\')" style="background:none;border:1px solid '+(isDone?'#3a5a00':'#2a2a2a')+';border-radius:4px;width:28px;height:28px;cursor:pointer;font-size:13px;color:'+(isDone?'#c8f230':'#444')+';flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:all .15s;" onmouseover="this.style.borderColor=\'#c8f230\';this.style.color=\'#c8f230\'" onmouseout="this.style.borderColor=\''+(isDone?'#3a5a00':'#2a2a2a')+'\';this.style.color=\''+(isDone?'#c8f230':'#444')+'\'">'+( isDone?'✓':'○')+'</button>'
      +'<button onclick="deleteSchoolEvent(\''+item.id+'\')" style="background:none;border:1px solid #2a2a2a;border-radius:4px;width:28px;height:28px;cursor:pointer;font-size:13px;color:#444;flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:all .15s;" onmouseover="this.style.borderColor=\'#f23060\';this.style.color=\'#f23060\'" onmouseout="this.style.borderColor=\'#2a2a2a\';this.style.color=\'#444\'">×</button>'
      +'</div>';
  });

  list.innerHTML = html;

  // Hide results panel
  var resEl = document.getElementById('schoolResults');
  if(resEl) resEl.style.display = 'none';

  // Summary pills
  var upcoming = SCHOOL_DATA.filter(function(i){
    var d = new Date(i.date+'T00:00:00');
    return d >= today && done.indexOf(i.id) === -1;
  }).length;
  var overdueCount = SCHOOL_DATA.filter(function(i){
    var d = new Date(i.date+'T00:00:00');
    return d < today && done.indexOf(i.id) === -1;
  }).length;
  var doneCount = done.length;
  var pills = document.getElementById('schoolSummaryPills');
  if(pills){
    pills.innerHTML =
      (overdueCount > 0 ? '<span style="background:#2a0000;border:1px solid #f23060;border-radius:100px;padding:5px 12px;font-size:10px;color:#f23060;letter-spacing:1px;">⚠ '+overdueCount+' overdue</span>' : '')
      +'<span style="background:var(--surface);border:1px solid var(--border);border-radius:100px;padding:5px 12px;font-size:10px;color:#888;letter-spacing:1px;">⏳ '+upcoming+' upcoming</span>'
      +'<span style="background:#1a2e00;border:1px solid #3a5a00;border-radius:100px;padding:5px 12px;font-size:10px;color:#c8f230;letter-spacing:1px;">✓ '+doneCount+' done</span>';
  }
}

/* ══════════════════════════════════ */

// ── Results / Grades: localStorage-backed ──
// Default is a single empty year that the user can edit, so the UI always has
// something to render rather than crashing on missing data. New users will
// fill this in via the in-app editor; existing users keep their saved data
// because loadSchoolResults prefers stored over default (see below).
var ALL_YEARS_DATA_DEFAULT = [
  {
    year: 'Year 1',
    period: '',
    subjects: []
  }
];

function loadSchoolResults(){
  try{ var d=JSON.parse(lsGet(SCHOOL_RESULTS_KEY)||'null'); if(d) return d; }catch(e){}
  // First run — seed from default and persist
  lsSet(SCHOOL_RESULTS_KEY, JSON.stringify(ALL_YEARS_DATA_DEFAULT));
  return JSON.parse(JSON.stringify(ALL_YEARS_DATA_DEFAULT)); // deep copy
}
function saveSchoolResults(){ lsSet(SCHOOL_RESULTS_KEY, JSON.stringify(ALL_YEARS_DATA)); }

var ALL_YEARS_DATA = loadSchoolResults();
var _activeYearIdx = 2; // default to Year 3 (current)
var RESULTS_DATA = ALL_YEARS_DATA[_activeYearIdx];

// Called by cloud-sync after a pull so in-memory data stays in sync with localStorage
function reloadSchoolResults(){
  ALL_YEARS_DATA = loadSchoolResults();
  if(_activeYearIdx >= ALL_YEARS_DATA.length) _activeYearIdx = ALL_YEARS_DATA.length - 1;
  RESULTS_DATA = ALL_YEARS_DATA[_activeYearIdx] || { subjects: [] };
}

var GRADE_KEY = [
  { group: 'Main Exams' },
  { symbol:'PD',  meaning:'Pass Distinction' },
  { symbol:'P',   meaning:'Pass' },
  { symbol:'S',   meaning:'Supplementary Granted' },
  { symbol:'DS',  meaning:'Discretionary Supplementary' },
  { symbol:'ABS', meaning:'Absent Examination' },
  { symbol:'AEG', meaning:'Aegrotat Granted' },
  { symbol:'Exe', meaning:'Exemption' },
  { symbol:'F',   meaning:'Fail' },
  { group: 'Supplementary Exams' },
  { symbol:'PDS', meaning:'Passed Distinction Supplementary' },
  { symbol:'PDA', meaning:'Passed Distinction Aegrotat' },
  { symbol:'PS',  meaning:'Passed Supplementary' },
  { symbol:'PA',  meaning:'Passed Aegrotat' },
  { symbol:'FS',  meaning:'Failed Supplementary' },
  { symbol:'FA',  meaning:'Failed Aegrotat' },
];

function getBadgeClass(r){
  if(!r) return 'other';
  var rv = r.toLowerCase();
  if(rv==='pd'||rv==='pds'||rv==='pda') return 'pd';
  if(rv==='p'||rv==='ps'||rv==='pa')   return 'p';
  if(rv==='s'||rv==='ds')              return 's';
  if(rv==='f'||rv==='fs'||rv==='fa')   return 'f';
  return 'other';
}

function openGradeKey(){
  var rows = GRADE_KEY.map(function(g){
    if(g.group) return '<tr><td colspan="2" style="padding:8px 12px 4px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#555;font-weight:700;">'+g.group+'</td></tr>';
    return '<tr style="border-bottom:1px solid #1a1a1a;">'
      +'<td style="padding:9px 12px;font-family:\'Syne\',sans-serif;font-weight:700;font-size:13px;color:#efefef;white-space:nowrap;">'+g.symbol+'</td>'
      +'<td style="padding:9px 12px;font-size:12px;color:#888;">'+g.meaning+'</td>'
      +'</tr>';
  }).join('');

  var overlay = document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1000;display:flex;align-items:flex-end;justify-content:center;';
  overlay.innerHTML =
    '<div style="background:#111;border:1px solid #2a2a2a;border-radius:16px 16px 0 0;width:100%;max-width:480px;max-height:80vh;display:flex;flex-direction:column;">'
      +'<div style="padding:20px 20px 12px;border-bottom:1px solid #1a1a1a;display:flex;align-items:center;justify-content:space-between;">'
        +'<div>'
          +'<div style="font-family:\'Syne\',sans-serif;font-weight:800;font-size:20px;color:#efefef;">Grade Key</div>'
          +'<div style="font-size:11px;color:#555;margin-top:2px;">All possible grade symbols and their meanings.</div>'
        +'</div>'
        +'<button onclick="this.closest(\'.gk-overlay\').remove()" style="background:none;border:1px solid #2a2a2a;border-radius:6px;width:30px;height:30px;color:#555;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;">×</button>'
      +'</div>'
      +'<div style="overflow-y:auto;flex:1;">'
        +'<table style="width:100%;border-collapse:collapse;">'+rows+'</table>'
      +'</div>'
      +'<div style="padding:12px 16px;border-top:1px solid #1a1a1a;">'
        +'<button onclick="this.closest(\'.gk-overlay\').remove()" style="width:100%;background:#1a2e00;border:1px solid #3a5a00;border-radius:8px;padding:12px;color:#c8f230;font-family:\'DM Mono\',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;">Close</button>'
      +'</div>'
    +'</div>';
  overlay.classList.add('gk-overlay');
  overlay.addEventListener('click', function(e){ if(e.target===overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  // fix close button reference
  overlay.querySelector('button[onclick*="gk-overlay"]').onclick = function(){ overlay.remove(); };
  overlay.querySelectorAll('button').forEach(function(b){ if(b.textContent.trim()==='Close'||b.textContent.trim()==='×') b.onclick=function(){ overlay.remove(); }; });
}


function switchResultsYear(idx){
  _activeYearIdx = idx;
  RESULTS_DATA = ALL_YEARS_DATA[idx];
  renderSchoolResults();
}

function openAddResult(subjectIndex){
  var sub = RESULTS_DATA.subjects[subjectIndex];
  var isY3 = _activeYearIdx === 2;
  var resultOpts = ['PD','P','S','DS','ABS','AEG','Exe','F','PDS','PDA','PS','PA','FS','FA'];
  var resultBtns = resultOpts.map(function(r){
    var sel = sub.result === r;
    return '<button onclick="selectResultGrade(this,\''+r+'\')" data-grade="'+r+'" style="padding:6px 10px;border:1px solid '+(sel?'#c8f230':'#2a2a2a')+';border-radius:6px;background:'+(sel?'#1a2e00':'none')+';color:'+(sel?'#c8f230':'#555')+';font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1px;cursor:pointer;transition:all .15s;">'+r+'</button>';
  }).join('');

  var overlay = document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1000;display:flex;align-items:flex-end;justify-content:center;';
  overlay.innerHTML =
    '<div style="background:#111;border:1px solid #2a2a2a;border-radius:16px 16px 0 0;width:100%;max-width:480px;max-height:85vh;overflow-y:auto;">'
      +'<div style="padding:20px 20px 12px;border-bottom:1px solid #1a1a1a;">'
        +'<div style="font-family:\'Syne\',sans-serif;font-weight:800;font-size:18px;color:#efefef;margin-bottom:2px;">Edit Results</div>'
        +'<div style="font-size:11px;color:#555;">'+sub.name+' · '+RESULTS_DATA.year+'</div>'
      +'</div>'
      +'<div style="padding:16px 20px;display:grid;gap:14px;">'
        +(isY3
          ? '<div><label style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#555;display:block;margin-bottom:6px;">Year %</label>'
            +'<input id="rYearPct" type="number" min="0" max="100" value="'+(sub.yearPct!==null?sub.yearPct:'')+'" placeholder="e.g. 85" style="width:100%;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:6px;padding:10px 12px;color:#efefef;font-family:\'DM Mono\',monospace;font-size:13px;"></div>'
            +'<div><label style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#555;display:block;margin-bottom:6px;">Exam %</label>'
            +'<input id="rExamPct" type="number" min="0" max="100" value="'+(sub.examPct!==null?sub.examPct:'')+'" placeholder="e.g. 72" style="width:100%;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:6px;padding:10px 12px;color:#efefef;font-family:\'DM Mono\',monospace;font-size:13px;"></div>'
            +'<div><label style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#555;display:block;margin-bottom:6px;">Final %</label>'
            +'<input id="rFinalPct" type="number" min="0" max="100" value="'+(sub.finalPct!==null?sub.finalPct:'')+'" placeholder="e.g. 78" style="width:100%;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:6px;padding:10px 12px;color:#efefef;font-family:\'DM Mono\',monospace;font-size:13px;"></div>'
            +'<div><label style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#555;display:block;margin-bottom:8px;">Result</label>'
            +'<div id="rGradePicker" style="display:flex;flex-wrap:wrap;gap:6px;">'+resultBtns+'</div>'
            +'<input type="hidden" id="rGradeVal" value="'+(sub.result||'')+'"></div>'
          : '')
        +'<div style="'+(isY3?'border-top:1px solid #1a1a1a;padding-top:14px;':'')+'">'
          +(isY3?'<div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#555;margin-bottom:10px;">Quiz & Assignment Scores</div>':'')
          +'<div style="display:grid;gap:10px;">'
            +'<div><label style="font-size:10px;color:#444;display:block;margin-bottom:4px;">🧪 Quiz / Assessment Score (%)</label>'
              +'<input id="rqScore" type="number" min="0" max="100" value="'+(sub.quizScore!==null?sub.quizScore:'')+'" placeholder="e.g. 85" style="width:100%;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:6px;padding:10px 12px;color:#efefef;font-family:\'DM Mono\',monospace;font-size:13px;"></div>'
            +'<div><label style="font-size:10px;color:#444;display:block;margin-bottom:4px;">📝 Assignment Score (%)</label>'
              +'<input id="raScore" type="number" min="0" max="100" value="'+(sub.assessmentScore!==null?sub.assessmentScore:'')+'" placeholder="e.g. 78" style="width:100%;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:6px;padding:10px 12px;color:#efefef;font-family:\'DM Mono\',monospace;font-size:13px;"></div>'
          +'</div>'
        +'</div>'
      +'</div>'
      +'<div style="display:flex;gap:8px;padding:12px 20px 20px;">'
        +'<button id="rSaveBtn" style="flex:1;background:#1a2e00;border:1px solid #3a5a00;border-radius:8px;padding:12px;color:#c8f230;font-family:\'DM Mono\',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;">Save</button>'
        +'<button id="rCancelBtn" style="background:none;border:1px solid #2a2a2a;border-radius:8px;padding:12px 16px;color:#555;font-family:\'DM Mono\',monospace;font-size:11px;letter-spacing:1px;cursor:pointer;">Cancel</button>'
      +'</div>'
    +'</div>';

  overlay.querySelector('#rSaveBtn').addEventListener('click', function(){
    if(isY3){
      var y = overlay.querySelector('#rYearPct').value;
      var e = overlay.querySelector('#rExamPct').value;
      var f = overlay.querySelector('#rFinalPct').value;
      var g = overlay.querySelector('#rGradeVal').value;
      RESULTS_DATA.subjects[subjectIndex].yearPct  = y!==''?parseFloat(y):null;
      RESULTS_DATA.subjects[subjectIndex].examPct  = e!==''?parseFloat(e):null;
      RESULTS_DATA.subjects[subjectIndex].finalPct = f!==''?parseFloat(f):null;
      RESULTS_DATA.subjects[subjectIndex].result   = g!==''?g:null;
    }
    var qs = overlay.querySelector('#rqScore').value;
    var as = overlay.querySelector('#raScore').value;
    RESULTS_DATA.subjects[subjectIndex].quizScore       = qs!==''?parseFloat(qs):null;
    RESULTS_DATA.subjects[subjectIndex].assessmentScore = as!==''?parseFloat(as):null;
    overlay.remove();
    saveSchoolResults();
    // Phase G: sync the full results structure to cloud (results + subjects)
    try { if(window.cloudSync && window.cloudSync.school) window.cloudSync.school.syncResultsArray(ALL_YEARS_DATA); } catch(e){}
    renderSchoolResults();
  });
  overlay.querySelector('#rCancelBtn').addEventListener('click', function(){ overlay.remove(); });
  overlay.addEventListener('click', function(e){ if(e.target===overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function selectResultGrade(btn, grade){
  var picker = btn.parentElement;
  picker.querySelectorAll('button').forEach(function(b){
    b.style.borderColor='#2a2a2a'; b.style.background='none'; b.style.color='#555';
  });
  btn.style.borderColor='#c8f230'; btn.style.background='#1a2e00'; btn.style.color='#c8f230';
  var inp = document.getElementById('rGradeVal');
  if(inp) inp.value = grade;
}

function renderSchoolResults(){
  var el = document.getElementById('schoolResults');
  if(!el) return;

  var subjects = RESULTS_DATA.subjects;
  var withResults = subjects.filter(function(x){ return x.finalPct !== null; });
  var avgFinal = withResults.length > 0 ? withResults.reduce(function(s,x){ return s+x.finalPct; },0) / withResults.length : null;
  var allPD = withResults.length > 0 && withResults.every(function(x){ return x.result==='PD'; });
  var isY3 = _activeYearIdx === 2;

  // Year switcher tabs
  var tabs = ALL_YEARS_DATA.map(function(y, i){
    var active = i === _activeYearIdx;
    return '<button onclick="switchResultsYear('+i+')" style="padding:8px 16px;border:1px solid '+(active?'#c8f230':'#2a2a2a')+';border-radius:100px;background:'+(active?'#1a2e00':'none')+';color:'+(active?'#c8f230':'#555')+';font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1.5px;cursor:pointer;transition:all .15s;white-space:nowrap;">'+y.year+'</button>';
  }).join('');

  var html =
    '<div style="display:flex;gap:8px;margin-bottom:16px;">'+tabs+'</div>'
    +'<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px 18px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;gap:12px;">'
      +'<div>'
        +'<div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#555;margin-bottom:4px;">'+RESULTS_DATA.year+' Average</div>'
        +'<div style="font-family:\'Syne\',sans-serif;font-weight:800;font-size:36px;color:#c8f230;line-height:1;">'+(avgFinal!==null?Math.round(avgFinal)+'<span style="font-size:16px;color:#555;">%</span>':'<span style="font-size:20px;color:#333;">—</span>')+'</div>'
        +'<div style="font-size:10px;color:#555;margin-top:4px;letter-spacing:1px;">'+RESULTS_DATA.period+'</div>'
      +'</div>'
      +'<div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:8px;">'
        +'<span style="background:'+(withResults.length===0?'#1a1a1a':'#1a2e00')+';border:1px solid '+(withResults.length===0?'#2a2a2a':'#3a5a00')+';border-radius:100px;padding:5px 14px;font-size:10px;color:'+(withResults.length===0?'#333':'#c8f230')+';letter-spacing:1px;">'+(withResults.length===0?'Results pending':allPD?'✓ All Distinctions':withResults.length+' of '+subjects.length+' in')+'</span>'
        +'<button onclick="openGradeKey()" style="background:none;border:1px solid #2a2a2a;border-radius:6px;padding:5px 10px;color:#555;font-family:\'DM Mono\',monospace;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;" onmouseover="this.style.borderColor=\'#444\';this.style.color=\'#888\'" onmouseout="this.style.borderColor=\'#2a2a2a\';this.style.color=\'#555\'">Grade Key ↗</button>'
        +'<button onclick="exportResults()" style="background:#1a2e00;border:1px solid #3a5a00;border-radius:6px;padding:5px 10px;color:#c8f230;font-family:\'DM Mono\',monospace;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;" onmouseover="this.style.opacity=\'.8\'" onmouseout="this.style.opacity=\'1\'">📄 Export</button>'
      +'</div>'
    +'</div>';

  html += '<div class="results-section-label">'+RESULTS_DATA.period+'</div>';

  subjects.forEach(function(sub, idx){
    var subResult = (sub.result && sub.result !== 'null') ? sub.result : null;
    var hasMainResults = sub.finalPct !== null || subResult === 'EXM';
    var badgeCls = getBadgeClass(subResult);
    var hasExtra = sub.quizScore !== null || sub.assessmentScore !== null;
    var isExm = subResult === 'EXM';

    html +=
      '<div class="results-card" style="border-left:3px solid '+sub.color+';">'
        +'<div class="results-card-header">'
          +'<div>'
            +'<div class="results-card-title">'+sub.name+'</div>'
            +'<div class="results-card-code">'+sub.code+'</div>'
            +'<span class="results-period-tag">'+RESULTS_DATA.period+'</span>'
          +'</div>'
          +(subResult
            ? '<span class="results-badge '+badgeCls+'" style="'+(isExm?'background:#1a1a1a;border:1px solid #333;color:#888;':'')+'">'+subResult+'</span>'
            : '<span style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:6px;padding:6px 10px;font-size:10px;color:#333;letter-spacing:1px;">Pending</span>')
        +'</div>'
        +'<div class="results-table">'
          +(!isExm && hasMainResults
            ? '<div class="results-row"><span class="results-row-label">Year %</span><span class="results-row-val">'+sub.yearPct+'</span></div>'
             +'<div class="results-row"><span class="results-row-label">Exam %</span><span class="results-row-val">'+sub.examPct+'</span></div>'
             +'<div class="results-row highlight"><span class="results-row-label">Final %</span><span class="results-row-val" style="color:#c8f230;">'+sub.finalPct+'</span></div>'
             +(subResult ? '<div class="results-row highlight"><span class="results-row-label">Result</span><span class="results-row-val">'+subResult+'</span></div>' : '')
            : isExm
              ? '<div class="results-row"><span class="results-row-label" style="color:#555;">Exemption granted</span></div>'
              : '<div class="results-row"><span class="results-row-label" style="color:#333;">No results yet — tap below to enter</span></div>')
          +(hasExtra
            ? (sub.quizScore!==null?'<div class="results-row"><span class="results-row-label">🧪 Quiz / Assessment</span><span class="results-row-val" style="color:#a78bfa;">'+sub.quizScore+'%</span></div>':'')
            +(sub.assessmentScore!==null?'<div class="results-row"><span class="results-row-label">📝 Assignment</span><span class="results-row-val" style="color:#60a5fa;">'+sub.assessmentScore+'%</span></div>':'')
            : '')
        +'</div>'
        +(!isExm
          ? '<div style="padding:8px 16px 12px;">'
              +'<button onclick="openAddResult('+idx+')" style="background:none;border:1px dashed #2a2a2a;border-radius:6px;padding:6px 14px;color:#555;font-family:\'DM Mono\',monospace;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;width:100%;transition:all .15s;" onmouseover="this.style.borderColor=\'#444\';this.style.color=\'#888\'" onmouseout="this.style.borderColor=\'#2a2a2a\';this.style.color=\'#555\'">'+(hasExtra||hasMainResults?'✏️ Edit':'+ Add Scores')+'</button>'
            +'</div>'
          : '')
      +'</div>';
  });

  el.innerHTML = html;
}

/* ══════════════════════════════════ */

// ── First-run helpers ──────────────────────────────────────────────────
// Route the user to Odin with the school onboarding question pre-filled.
function askOdinAboutSchool(){
  try {
    if(typeof goToTab === 'function') goToTab('odin');
    // Send a message to Odin chat after the tab transition completes.
    setTimeout(function(){
      if(typeof odinChatAsk === 'function'){
        odinChatAsk('How do I set up my school tab?');
      } else if(typeof openOdinChat === 'function'){
        openOdinChat('How do I set up my school tab?');
      }
    }, 250);
  } catch(e){ console.warn('askOdinAboutSchool failed:', e); }
}

// Minimal "quick add" — uses sequential prompts so we don't need a full modal.
// New users get a usable path even before any UI is built. Power users can
// edit the JSON directly in Settings → backup if they prefer.
function quickAddSchoolEvent(){
  try {
    var typeIn = (prompt('What type of event?\n\nwebinar / assignment / quiz / exam') || '').trim().toLowerCase();
    if(!typeIn) return;
    if(['webinar','assignment','quiz','exam'].indexOf(typeIn) === -1){
      alert('Type must be webinar, assignment, quiz, or exam.');
      return;
    }
    var subject = (prompt('Subject (e.g. Maths, Business)?') || '').trim();
    if(!subject) return;
    var title = (prompt('Title (e.g. Webinar 1, Assignment Due)?') || '').trim();
    if(!title) return;
    var dateIn = (prompt('Date (YYYY-MM-DD)?') || '').trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(dateIn)){
      alert('Date must be in YYYY-MM-DD format (e.g. 2026-05-15).');
      return;
    }
    var time = (prompt('Time (optional, e.g. 18:30-19:30)?') || '').trim();

    var ev = {
      id: 's_' + Date.now(),
      type: typeIn,
      subject: subject,
      title: title,
      date: dateIn,
      time: time
    };
    var arr = loadSchoolEvents();
    arr.push(ev);
    saveSchoolEvents(arr);
    SCHOOL_DATA = arr;
    renderSchool();
    try { odinRefreshIfOpen(); } catch(e){}
  } catch(e){ console.warn('quickAddSchoolEvent failed:', e); }
}

// Has the user added any school data yet? Used by Odin to decide whether to
// show the onboarding alert.
function isSchoolEmpty(){
  try {
    var events  = loadSchoolEvents() || [];
    var results = loadSchoolResults() || [];
    var hasResults = results.some(function(yr){
      return yr && Array.isArray(yr.subjects) && yr.subjects.length > 0;
    });
    return events.length === 0 && !hasResults;
  } catch(e){ return false; }
}

// ══ INSTALMENT TRACKER ══
