// ============================================================================
//  My Dashboard V34 — school.js  (v88 rebuild, 2026-05-27)
// ============================================================================
//  REBUILD GOAL:
//  Replace the broken 1000-row append-on-save model with a clean
//  upsert-by-code model. One record per subject. Year filter chips dedupe
//  cleanly. Marks are inputs; Final % and Result are computed at render
//  time so the data never drifts.
//
//  STORAGE KEYS:
//    SCHOOL_RESULTS_KEY    = 'yasin_school_results_v1'   ← OLD, left alone
//    yasin_school_results_v2                              ← NEW canonical
//    yasin_school_results_v2_migrated                     ← migration flag
//    SCHOOL_EVENTS_KEY     = 'yasin_school_events_v1'    (events unchanged)
//    SCHOOL_DONE_KEY       = 'yasin_school_done_v1'      (done unchanged)
//
//  ON FIRST LOAD:
//    1. Check `yasin_school_results_v2` — if present, use it.
//    2. If absent → run migration from v1:
//       - Read v1 (could be 1000+ dirty rows)
//       - Build the canonical 15-subject list from known transcript data
//         (Year 1 + 2 confirmed, Year 2 second-half placeholder, Year 3
//          live including ENT-31 = Quiz 30 + Assignment 59)
//       - Write to v2
//       - Set migration flag so we never run it again
//    3. After migration, app reads v2 only. v1 is preserved for safety
//       and ignored.
//
//  RECORD SHAPE (canonical):
//    {
//      _id:         'uuid-v4-...'        // stable id for future cloud sync
//      code:        'BCOM_BC-101'        // unique primary key
//      name:        'Business Communication 101'
//      year:        1                    // 1 | 2 | 3 | 4
//      type:        'semester'           // 'semester' | 'annual'
//      period:      '2024 January'       // display label
//      credits:     15                   // 15 | 30
//      nqfLevel:    5                    // 5 | 6 | 7
//      quizRaw:     28                   // semester: number | null. annual: [n,n] | [n,null] | null
//      assignmentRaw: 65                 // same rules as quizRaw
//      examRaw:     73                   // number 0-100 | null
//      resultOverride: null              // null=auto | 'Exe'|'S'|'AEG'|'ABS'|'PS'|'PDS'|'PA'|'PDA'|'FSA'|'NDP'
//      isPlaceholder: false              // true → yellow "awaiting transcript" strip
//      notes:       ''                   // optional
//    }
//
//  RENDER-TIME CALCS:
//    yearMarkPct = sum of raw quiz scores + sum of raw assignment scores
//    finalPct    = Math.round(yearMarkPct * 0.40 + examRaw * 0.60)
//    result      = resultOverride OR
//                  (examRaw == null  → 'EXM') OR
//                  (finalPct >= 75   → 'PD')  OR
//                  (finalPct >= 50   → 'P')   OR
//                                      'F'
//
//  YEAR AVERAGE = mean of finalPct for subjects in that year where examRaw
//                 is filled (excludes EXM/Exe).
//
//  CREDIT PROGRESS = sum of credits where result is passing
//                    (PD, P, PS, PDS, PA, PDA, Exe).
// ============================================================================


// ── Storage keys ────────────────────────────────────────────────────────────
const SCHOOL_RESULTS_V2_KEY  = 'yasin_school_results_v2';
const SCHOOL_RESULTS_MIGRATED_FLAG = 'yasin_school_results_v2_migrated';

// ── Filter state ────────────────────────────────────────────────────────────
var _schoolFilter = 'all';
var _activeResultsYear = 3; // default to current year


// ============================================================================
//  EVENTS — UNCHANGED FROM v87
// ============================================================================
var SCHOOL_DATA_DEFAULT = [];

function loadSchoolEvents(){
  try{
    var d = JSON.parse(lsGet(SCHOOL_EVENTS_KEY) || 'null');
    if(d && Array.isArray(d)){
      // Self-healing dedup: remove duplicate events by date+type+title+time
      var seen = {};
      var deduped = d.filter(function(e){
        var key = (e.date||'')+'|'+(e.type||'')+'|'+(e.title||'')+'|'+(e.time||'');
        if(seen[key]) return false;
        seen[key] = true;
        return true;
      });
      if(deduped.length !== d.length){
        console.log('[school] Self-healed event duplicates: '+d.length+' -> '+deduped.length);
        lsSet(SCHOOL_EVENTS_KEY, JSON.stringify(deduped));
        return deduped;
      }
      return d;
    }
  }catch(e){}
  lsSet(SCHOOL_EVENTS_KEY, JSON.stringify(SCHOOL_DATA_DEFAULT));
  return SCHOOL_DATA_DEFAULT.slice();
}
function saveSchoolEvents(arr){ lsSet(SCHOOL_EVENTS_KEY, JSON.stringify(arr)); }

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
  var done = getSchoolDone().filter(function(d){ return d !== id; });
  saveSchoolDone(done);
  try { if(window.cloudSync && window.cloudSync.school) window.cloudSync.school.removeEvent(id); } catch(e){}
  renderSchool();
}

// Pull rest of events render from v87 — same shape
function renderSchool(){
  var el = document.getElementById('schoolList');
  if(!el) return;
  var events = loadSchoolEvents();
  var done = getSchoolDone();
  var today = new Date().toISOString().slice(0,10);

  // Filter
  var filtered = events.slice();
  if(_schoolFilter === 'upcoming') filtered = filtered.filter(function(e){ return e.date >= today; });
  else if(['webinar','assignment','quiz','exam'].indexOf(_schoolFilter) > -1){
    filtered = filtered.filter(function(e){ return e.type === _schoolFilter; });
  }

  // Sort by date
  filtered.sort(function(a,b){ return (a.date||'').localeCompare(b.date||''); });

  // Summary pills
  var upcomingCount = events.filter(function(e){ return e.date >= today && done.indexOf(e.id) === -1; }).length;
  var doneCount = events.filter(function(e){ return done.indexOf(e.id) > -1; }).length;
  var pillsEl = document.getElementById('schoolSummaryPills');
  if(pillsEl){
    pillsEl.innerHTML =
      '<span style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:100px;padding:6px 12px;font-size:10px;color:#888;letter-spacing:1px;">⏳ '+upcomingCount+' upcoming</span>'
     +'<span style="background:#1a2e00;border:1px solid #3a5a00;border-radius:100px;padding:6px 12px;font-size:10px;color:#c8f230;letter-spacing:1px;">✓ '+doneCount+' done</span>';
  }

  if(filtered.length === 0){
    el.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#444;font-size:12px;">Nothing here yet. Tap <b>+ Add Event</b> to add your first.</div>';
    return;
  }

  var html = '';
  filtered.forEach(function(e){
    var isDone = done.indexOf(e.id) > -1;
    var icon = TYPE_ICONS[e.type] || '📌';
    var color = SUBJECT_COLORS[e.subject] || '#888';
    html +=
      '<div style="background:var(--surface);border-left:3px solid '+color+';border-radius:10px;margin-bottom:10px;padding:14px;display:flex;align-items:center;gap:12px;'+(isDone?'opacity:.55;':'')+'">'
        +'<button onclick="toggleSchoolDone(\''+e.id+'\')" style="flex-shrink:0;width:28px;height:28px;border-radius:50%;border:2px solid '+(isDone?'#c8f230':'#333')+';background:'+(isDone?'#c8f230':'transparent')+';color:#000;font-size:14px;cursor:pointer;font-weight:bold;line-height:1;">'+(isDone?'✓':'')+'</button>'
        +'<div style="flex:1;min-width:0;">'
          +'<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:14px;margin-bottom:3px;'+(isDone?'text-decoration:line-through;':'')+'">'+icon+' '+(e.title||'(no title)')+'</div>'
          +'<div style="font-size:11px;color:#666;letter-spacing:0.5px;">'+(e.subject||'')+(e.subject&&e.date?' · ':'')+(e.date||'')+(e.time?' · '+e.time:'')+'</div>'
        +'</div>'
        +'<button onclick="deleteSchoolEvent(\''+e.id+'\')" style="background:transparent;border:1px solid #2a2a2a;border-radius:4px;width:26px;height:26px;color:#444;cursor:pointer;font-size:11px;">✕</button>'
      +'</div>';
  });
  el.innerHTML = html;
}

// ── Add/edit event modal (unchanged from v87) ──
function openAddSchoolEvent(){
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
    var ev = { id:'s_'+Date.now(), type:typeIn, subject:subject, title:title, date:dateIn, time:time };
    var arr = loadSchoolEvents();
    arr.push(ev);
    saveSchoolEvents(arr);
    SCHOOL_DATA = arr;
    renderSchool();
    try { odinRefreshIfOpen(); } catch(e){}
  } catch(e){ console.warn('openAddSchoolEvent failed:', e); }
}


// ============================================================================
//  RESULTS — V88 REBUILD
// ============================================================================

// ── UUID generator (matches cloud-sync style) ──
function _schoolUuid(){
  if(typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){
    var r = Math.random()*16|0;
    return (c==='x' ? r : (r&0x3|0x8)).toString(16);
  });
}

// ── Canonical seed: the 15 subjects from Yasin's real transcript ──
// Used only when migrating for the first time OR when v2 is completely empty.
function _schoolSeed(){
  return [
    // ── YEAR 1 (2024 January) — CONFIRMED FROM TRANSCRIPT ───────────────────
    { _id:_schoolUuid(), code:'BCOM_BC-101',   name:'Business Communication 101',  year:1, type:'semester', period:'2024 January', credits:15, nqfLevel:5,
      quizRaw:null, assignmentRaw:null, examRaw:73, resultOverride:null, isPlaceholder:false, notes:'',
      _legacyYearPct:92, _legacyFinalPct:81 },
    { _id:_schoolUuid(), code:'BCOM_BM-1',     name:'Business Management 1',       year:1, type:'annual',   period:'2024 January', credits:30, nqfLevel:5,
      quizRaw:null, assignmentRaw:null, examRaw:64, resultOverride:null, isPlaceholder:false, notes:'',
      _legacyYearPct:74, _legacyFinalPct:68 },
    { _id:_schoolUuid(), code:'BCOM_ACC-1',    name:'Accounting 1',                year:1, type:'annual',   period:'2024 January', credits:30, nqfLevel:5,
      quizRaw:null, assignmentRaw:null, examRaw:66, resultOverride:null, isPlaceholder:false, notes:'',
      _legacyYearPct:83, _legacyFinalPct:73 },
    { _id:_schoolUuid(), code:'BCOM_ECO-1',    name:'Economics 1',                 year:1, type:'annual',   period:'2024 January', credits:30, nqfLevel:5,
      quizRaw:null, assignmentRaw:null, examRaw:67, resultOverride:null, isPlaceholder:false, notes:'',
      _legacyYearPct:84, _legacyFinalPct:74 },
    { _id:_schoolUuid(), code:'BCOM_STAT-102', name:'Statistics 102',              year:1, type:'semester', period:'2024 January', credits:15, nqfLevel:5,
      quizRaw:null, assignmentRaw:null, examRaw:null, resultOverride:'Exe', isPlaceholder:false, notes:'Exemption granted' },

    // ── YEAR 2 (2025) — semester subjects confirmed, annual placeholders ────
    { _id:_schoolUuid(), code:'BCOM_CL-201',   name:'Commercial Law 201',          year:2, type:'semester', period:'2025 January', credits:15, nqfLevel:6,
      quizRaw:null, assignmentRaw:null, examRaw:55, resultOverride:null, isPlaceholder:false, notes:'',
      _legacyYearPct:78, _legacyFinalPct:65 },
    { _id:_schoolUuid(), code:'BCOM_IS-202',   name:'Information Systems 202',     year:2, type:'semester', period:'2025 January', credits:15, nqfLevel:6,
      quizRaw:null, assignmentRaw:null, examRaw:64, resultOverride:null, isPlaceholder:false, notes:'',
      _legacyYearPct:95, _legacyFinalPct:77 },
    { _id:_schoolUuid(), code:'BCOM_BIN-2',    name:'Business Intelligence 2',     year:2, type:'annual',   period:'2025 January', credits:30, nqfLevel:6,
      quizRaw:null, assignmentRaw:null, examRaw:72, resultOverride:null, isPlaceholder:true, notes:'Awaiting transcript',
      _legacyYearPct:79, _legacyFinalPct:75 },
    { _id:_schoolUuid(), code:'BCOM_BM-2',     name:'Business Management 2',       year:2, type:'annual',   period:'2025 January', credits:30, nqfLevel:6,
      quizRaw:null, assignmentRaw:null, examRaw:65, resultOverride:null, isPlaceholder:true, notes:'Awaiting transcript',
      _legacyYearPct:96, _legacyFinalPct:78 },
    { _id:_schoolUuid(), code:'BCOM_IT-2',     name:'Information Technology 2',    year:2, type:'annual',   period:'2025 January', credits:30, nqfLevel:6,
      quizRaw:null, assignmentRaw:null, examRaw:69, resultOverride:null, isPlaceholder:true, notes:'Awaiting transcript',
      _legacyYearPct:92, _legacyFinalPct:79 },

    // ── YEAR 3 (2026) — in progress ────────────────────────────────────────
    { _id:_schoolUuid(), code:'BCOM_ENT-31',   name:'Entrepreneurship 301',        year:3, type:'semester', period:'2026 January Semester', credits:15, nqfLevel:7,
      quizRaw:30, assignmentRaw:59, examRaw:null, resultOverride:null, isPlaceholder:false, notes:'Exam 23 July 2026' },
    { _id:_schoolUuid(), code:'BCOM_IBS-31',   name:'International Business 302',  year:3, type:'semester', period:'2026 January Semester', credits:15, nqfLevel:7,
      quizRaw:null, assignmentRaw:null, examRaw:null, resultOverride:null, isPlaceholder:false, notes:'In progress' },
    { _id:_schoolUuid(), code:'BCOM_BIN-3',    name:'Business Intelligence 3',     year:3, type:'annual',   period:'2026 January Annual', credits:30, nqfLevel:7,
      quizRaw:null, assignmentRaw:null, examRaw:null, resultOverride:null, isPlaceholder:false, notes:'In progress' },
    { _id:_schoolUuid(), code:'BCOM_BM-3',     name:'Business Management 3',       year:3, type:'annual',   period:'2026 January Annual', credits:30, nqfLevel:7,
      quizRaw:null, assignmentRaw:null, examRaw:null, resultOverride:null, isPlaceholder:false, notes:'In progress' },
    { _id:_schoolUuid(), code:'BCOM_IT-3',     name:'Information Technology 3',    year:3, type:'annual',   period:'2026 January Annual', credits:30, nqfLevel:7,
      quizRaw:null, assignmentRaw:null, examRaw:null, resultOverride:null, isPlaceholder:false, notes:'In progress' }
  ];
}

// ── For Years 1 & 2 confirmed transcript rows, we don't have raw quiz/assignment
//    scores (only the aggregated Year %). To make the math work, we store the
//    Year % directly as `_legacyYearPct` and let the calc function prefer it
//    over quizRaw+assignmentRaw when present. Same for `_legacyFinalPct` (used
//    only as a sanity reference — actual Final % is always computed).

// ── Load + migration ────────────────────────────────────────────────────────
function loadSchoolSubjects(){
  // Already migrated? Just load v2.
  try {
    var raw = lsGet(SCHOOL_RESULTS_V2_KEY);
    if(raw){
      var arr = JSON.parse(raw);
      if(Array.isArray(arr) && arr.length > 0) return arr;
    }
  } catch(e){
    console.warn('[school] v2 read failed, will re-seed:', e);
  }

  // Not migrated → seed and write
  console.log('[school] First-time migration to v2 — seeding from transcript data');
  var seed = _schoolSeed();
  lsSet(SCHOOL_RESULTS_V2_KEY, JSON.stringify(seed));
  lsSet(SCHOOL_RESULTS_MIGRATED_FLAG, JSON.stringify({ migratedAt: new Date().toISOString(), seedCount: seed.length }));
  return seed;
}

function saveSchoolSubjects(arr){
  lsSet(SCHOOL_RESULTS_V2_KEY, JSON.stringify(arr));
}

// Live cache
var SCHOOL_SUBJECTS = loadSchoolSubjects();

// Called by cloud-sync after a pull (if you ever re-enable it)
function reloadSchoolSubjects(){
  SCHOOL_SUBJECTS = loadSchoolSubjects();
}

// ── Calculation helpers ─────────────────────────────────────────────────────
function _sumRaw(val){
  if(val === null || val === undefined) return null;
  if(typeof val === 'number') return val;
  if(Array.isArray(val)){
    var any = false, total = 0;
    val.forEach(function(v){ if(v !== null && v !== undefined){ total += v; any = true; } });
    return any ? total : null;
  }
  return null;
}

function calcYearMarkPct(sub){
  // Prefer raw scores if any are present
  var qSum = _sumRaw(sub.quizRaw);
  var aSum = _sumRaw(sub.assignmentRaw);
  if(qSum !== null || aSum !== null){
    return (qSum || 0) + (aSum || 0);
  }
  // Fall back to legacy stored Year %
  if(sub._legacyYearPct != null) return sub._legacyYearPct;
  return null;
}

function calcFinalPct(sub){
  var ymp = calcYearMarkPct(sub);
  if(ymp === null || sub.examRaw === null || sub.examRaw === undefined) return null;
  return Math.round(ymp * 0.40 + sub.examRaw * 0.60);
}

function calcResult(sub){
  if(sub.resultOverride) return sub.resultOverride;
  var ymp = calcYearMarkPct(sub);
  if(sub.examRaw === null || sub.examRaw === undefined){
    // No exam yet
    if(ymp !== null) return 'EXM'; // year mark in, awaiting exam
    return null; // nothing entered
  }
  var f = calcFinalPct(sub);
  if(f === null) return null;
  if(f >= 75) return 'PD';
  if(f >= 50) return 'P';
  return 'F';
}

function isPassingResult(r){
  if(!r) return false;
  return ['PD','P','PS','PDS','PA','PDA','Exe'].indexOf(r) > -1;
}

function calcYearAverage(year){
  var subs = SCHOOL_SUBJECTS.filter(function(s){ return s.year === year; });
  var withFinals = subs.filter(function(s){ return calcFinalPct(s) !== null; });
  if(withFinals.length === 0) return null;
  var sum = withFinals.reduce(function(acc, s){ return acc + calcFinalPct(s); }, 0);
  return Math.round(sum / withFinals.length);
}

function calcCreditsEarned(){
  return SCHOOL_SUBJECTS.reduce(function(acc, s){
    return isPassingResult(calcResult(s)) ? acc + (s.credits || 0) : acc;
  }, 0);
}

function calcTotalCredits(){
  return SCHOOL_SUBJECTS.reduce(function(acc, s){ return acc + (s.credits || 0); }, 0);
}


// ── Grade key (full list from official transcript) ──────────────────────────
var GRADE_KEY = [
  { group:'Auto-derived from Final %' },
  { symbol:'PD',  meaning:'Pass Distinction (Final ≥ 75)' },
  { symbol:'P',   meaning:'Pass (Final 50–74)' },
  { symbol:'F',   meaning:'Fail (Final < 50)' },
  { symbol:'EXM', meaning:'Examination pending' },
  { group:'Manual overrides (you select)' },
  { symbol:'Exe', meaning:'Exemption (credits granted)' },
  { symbol:'S',   meaning:'Supplementary Granted' },
  { symbol:'PS',  meaning:'Passed Supplementary' },
  { symbol:'PDS', meaning:'Passed Distinction Supplementary' },
  { symbol:'AEG', meaning:'Aegrotat Granted' },
  { symbol:'PA',  meaning:'Passed Aegrotat' },
  { symbol:'PDA', meaning:'Passed Distinction Aegrotat' },
  { symbol:'ABS', meaning:'Absent Examination' },
  { symbol:'FSA', meaning:'Failed Assignment' },
  { symbol:'NDP', meaning:'Non Degree Purpose' }
];

var RESULT_OVERRIDE_OPTIONS = ['Exe','S','PS','PDS','AEG','PA','PDA','ABS','FSA','NDP'];

function getResultColor(r){
  if(!r) return '#666';
  if(r === 'PD' || r === 'PDS' || r === 'PDA') return '#c8f230';
  if(r === 'P'  || r === 'PS'  || r === 'PA')  return '#30c8f2';
  if(r === 'F')  return '#f23060';
  if(r === 'Exe') return '#a830f2';
  if(r === 'EXM') return '#888';
  return '#f2a830';
}
function getResultLabel(r){
  var lookup = {
    PD:'Pass with Distinction', P:'Pass', F:'Fail', EXM:'Exam pending',
    Exe:'Exemption', S:'Supp granted', PS:'Passed Supp', PDS:'Pass Dist Supp',
    AEG:'Aegrotat granted', PA:'Passed Aeg', PDA:'Pass Dist Aeg',
    ABS:'Absent exam', FSA:'Failed assignment', NDP:'Non-degree'
  };
  return lookup[r] || r;
}


// ── Subject colour by name (for left-border accent) ─────────────────────────
function _subjectColor(code){
  // Simple deterministic hash → palette
  var palette = ['#c8f230','#30c8f2','#f2a830','#a830f2','#f23060','#30f2a8','#f230c8','#f5a460','#7ad7f0','#9affa0','#f87171'];
  var h = 0;
  for(var i = 0; i < code.length; i++){ h = ((h<<5) - h) + code.charCodeAt(i); h |= 0; }
  return palette[Math.abs(h) % palette.length];
}


// ── Year tab switch ─────────────────────────────────────────────────────────
function switchResultsYear(yearNum){
  _activeResultsYear = yearNum;
  renderSchoolResults();
}


// ============================================================================
//  EDIT MODAL
// ============================================================================
var _editingSubjectCode = null;

function openEditSubject(code){
  var sub = SCHOOL_SUBJECTS.find(function(s){ return s.code === code; });
  if(!sub) return;
  _editingSubjectCode = code;

  // Build override pills
  var overrideOpts = ['(auto)'].concat(RESULT_OVERRIDE_OPTIONS);
  var overridePills = overrideOpts.map(function(opt){
    var val = (opt === '(auto)') ? null : opt;
    var sel = (sub.resultOverride === val) || (sub.resultOverride == null && opt === '(auto)');
    var label = (opt === '(auto)') ? '(auto)' : opt;
    return '<button onclick="_selectResultOverride(this,'+JSON.stringify(val)+')" data-v="'+(val||'')+'" style="padding:5px 10px;background:'+(sel?'#1a2e00':'#1a1a1a')+';border:1px solid '+(sel?'#5a8800':'#2a2a2a')+';border-radius:4px;color:'+(sel?'#c8f230':'#888')+';font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1px;cursor:pointer;">'+label+'</button>';
  }).join('');

  // Quiz/Assignment inputs differ by type
  var quizFields = '', assignFields = '';
  if(sub.type === 'semester'){
    var qVal = (typeof sub.quizRaw === 'number') ? sub.quizRaw : (Array.isArray(sub.quizRaw) ? (sub.quizRaw[0] || '') : '');
    var aVal = (typeof sub.assignmentRaw === 'number') ? sub.assignmentRaw : (Array.isArray(sub.assignmentRaw) ? (sub.assignmentRaw[0] || '') : '');
    quizFields =
      '<div style="margin-bottom:10px;"><label style="display:block;font-size:9px;letter-spacing:2px;color:#888;text-transform:uppercase;margin-bottom:5px;">🧪 Quiz Raw Score</label>'
      +'<div style="display:flex;gap:8px;align-items:center;"><input id="rQ1" type="number" min="0" max="30" step="any" value="'+qVal+'" placeholder="—" style="flex:1;background:#1a1a1a;border:1px solid #333;color:#efefef;padding:9px 11px;border-radius:5px;font-family:\'DM Mono\',monospace;font-size:14px;outline:none;"><span style="font-size:10px;color:#666;letter-spacing:1px;">/ 30</span></div></div>';
    assignFields =
      '<div style="margin-bottom:10px;"><label style="display:block;font-size:9px;letter-spacing:2px;color:#888;text-transform:uppercase;margin-bottom:5px;">📝 Assignment Raw Score</label>'
      +'<div style="display:flex;gap:8px;align-items:center;"><input id="rA1" type="number" min="0" max="70" step="any" value="'+aVal+'" placeholder="—" style="flex:1;background:#1a1a1a;border:1px solid #333;color:#efefef;padding:9px 11px;border-radius:5px;font-family:\'DM Mono\',monospace;font-size:14px;outline:none;"><span style="font-size:10px;color:#666;letter-spacing:1px;">/ 70</span></div></div>';
  } else {
    // annual — 2 quizzes (15 each), 2 assignments (35 each)
    var q1 = '', q2 = '', a1 = '', a2 = '';
    if(Array.isArray(sub.quizRaw)){ q1 = sub.quizRaw[0] || ''; q2 = sub.quizRaw[1] || ''; }
    else if(typeof sub.quizRaw === 'number'){ q1 = sub.quizRaw; }
    if(Array.isArray(sub.assignmentRaw)){ a1 = sub.assignmentRaw[0] || ''; a2 = sub.assignmentRaw[1] || ''; }
    else if(typeof sub.assignmentRaw === 'number'){ a1 = sub.assignmentRaw; }
    quizFields =
      '<div style="margin-bottom:10px;"><label style="display:block;font-size:9px;letter-spacing:2px;color:#888;text-transform:uppercase;margin-bottom:5px;">🧪 Quizzes (2 × out of 15)</label>'
      +'<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;"><input id="rQ1" type="number" min="0" max="15" step="any" value="'+q1+'" placeholder="Quiz 1" style="flex:1;background:#1a1a1a;border:1px solid #333;color:#efefef;padding:9px 11px;border-radius:5px;font-family:\'DM Mono\',monospace;font-size:14px;outline:none;"><span style="font-size:10px;color:#666;letter-spacing:1px;">/ 15</span></div>'
      +'<div style="display:flex;gap:8px;align-items:center;"><input id="rQ2" type="number" min="0" max="15" step="any" value="'+q2+'" placeholder="Quiz 2" style="flex:1;background:#1a1a1a;border:1px solid #333;color:#efefef;padding:9px 11px;border-radius:5px;font-family:\'DM Mono\',monospace;font-size:14px;outline:none;"><span style="font-size:10px;color:#666;letter-spacing:1px;">/ 15</span></div></div>';
    assignFields =
      '<div style="margin-bottom:10px;"><label style="display:block;font-size:9px;letter-spacing:2px;color:#888;text-transform:uppercase;margin-bottom:5px;">📝 Assignments (2 × out of 35)</label>'
      +'<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;"><input id="rA1" type="number" min="0" max="35" step="any" value="'+a1+'" placeholder="Assign 1" style="flex:1;background:#1a1a1a;border:1px solid #333;color:#efefef;padding:9px 11px;border-radius:5px;font-family:\'DM Mono\',monospace;font-size:14px;outline:none;"><span style="font-size:10px;color:#666;letter-spacing:1px;">/ 35</span></div>'
      +'<div style="display:flex;gap:8px;align-items:center;"><input id="rA2" type="number" min="0" max="35" step="any" value="'+a2+'" placeholder="Assign 2" style="flex:1;background:#1a1a1a;border:1px solid #333;color:#efefef;padding:9px 11px;border-radius:5px;font-family:\'DM Mono\',monospace;font-size:14px;outline:none;"><span style="font-size:10px;color:#666;letter-spacing:1px;">/ 35</span></div></div>';
  }

  // Legacy Year % field (only shown if subject was migrated with one)
  var legacyField = '';
  if(sub._legacyYearPct != null){
    legacyField =
      '<div style="background:#1a1500;border:1px solid #4a3a00;border-radius:6px;padding:10px 12px;margin-bottom:10px;">'
        +'<div style="font-size:10px;color:#f2c830;letter-spacing:1px;margin-bottom:6px;">📜 Transcript Year % (legacy)</div>'
        +'<div style="display:flex;gap:8px;align-items:center;">'
          +'<input id="rLegacyYearPct" type="number" min="0" max="100" step="any" value="'+sub._legacyYearPct+'" style="flex:1;background:#0a0a0a;border:1px solid #4a3a00;color:#f2c830;padding:9px 11px;border-radius:5px;font-family:\'DM Mono\',monospace;font-size:14px;outline:none;">'
          +'<span style="font-size:10px;color:#876500;letter-spacing:1px;">/ 100</span>'
        +'</div>'
        +'<div style="font-size:9px;color:#876500;margin-top:6px;line-height:1.4;">Year % from official transcript. The app uses this when raw quiz/assignment scores aren\'t available. Enter raws above to override.</div>'
      +'</div>';
  }

  var examVal = (sub.examRaw == null) ? '' : sub.examRaw;
  var examPlaceholder = (sub.notes && sub.notes.indexOf('July') > -1) ? 'Exam 23 July 2026' : '— not yet written';

  var placeholderToggle =
    '<div style="background:#1a1500;border:1px dashed #5a4a00;border-radius:6px;padding:10px 12px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;">'
      +'<div><div style="font-size:11px;color:#f2c830;letter-spacing:0.5px;">🟡 Placeholder marks</div>'
      +'<div style="font-size:9px;color:#876500;margin-top:2px;">Tag as placeholder until transcript confirms</div></div>'
      +'<button onclick="_togglePlaceholder(this)" data-on="'+(sub.isPlaceholder?'1':'0')+'" style="padding:6px 12px;background:'+(sub.isPlaceholder?'#f2c830':'#1a1a1a')+';border:1px solid '+(sub.isPlaceholder?'#876500':'#2a2a2a')+';border-radius:4px;color:'+(sub.isPlaceholder?'#000':'#888')+';font-family:\'DM Mono\',monospace;font-size:10px;cursor:pointer;font-weight:'+(sub.isPlaceholder?'700':'400')+';">'+(sub.isPlaceholder?'ON':'OFF')+'</button>'
    +'</div>';

  var overlay = document.createElement('div');
  overlay.className = 'school-edit-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:1000;display:flex;align-items:flex-end;justify-content:center;';
  overlay.innerHTML =
    '<div style="background:#0a0a0a;border-top:2px solid #c8f230;border-radius:16px 16px 0 0;width:100%;max-width:480px;max-height:90vh;overflow-y:auto;">'
      +'<div style="padding:18px 18px 12px;border-bottom:1px solid #1a1a1a;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">'
        +'<div style="flex:1;min-width:0;">'
          +'<div style="font-family:\'Syne\',sans-serif;font-weight:800;font-size:18px;color:#c8f230;">✏️ Edit Marks</div>'
          +'<div style="font-size:11px;color:#aaa;margin-top:3px;">'+sub.name+'</div>'
          +'<div style="font-size:10px;color:#666;letter-spacing:1px;margin-top:3px;">'+sub.code+' · '+(sub.type==='semester'?'📆 Semester':'📅 Annual')+' · '+sub.credits+'cr · NQF '+sub.nqfLevel+'</div>'
        +'</div>'
        +'<button onclick="this.closest(\'.school-edit-overlay\').remove()" style="background:none;border:1px solid #2a2a2a;border-radius:6px;width:28px;height:28px;color:#666;cursor:pointer;font-size:16px;flex-shrink:0;">×</button>'
      +'</div>'
      +'<div style="padding:14px 18px;">'

        // YEAR MARK SECTION
        +'<div style="font-size:9px;letter-spacing:2px;color:#5a8800;text-transform:uppercase;margin-bottom:8px;">📝 Year Mark Assessments</div>'
        +legacyField
        +quizFields
        +assignFields

        // EXAM
        +'<div style="font-size:9px;letter-spacing:2px;color:#5a8800;text-transform:uppercase;margin-bottom:8px;margin-top:14px;">📋 Exam</div>'
        +'<div style="margin-bottom:10px;"><label style="display:block;font-size:9px;letter-spacing:2px;color:#888;text-transform:uppercase;margin-bottom:5px;">Exam Raw Score</label>'
        +'<div style="display:flex;gap:8px;align-items:center;"><input id="rExam" type="number" min="0" max="100" step="any" value="'+examVal+'" placeholder="'+examPlaceholder+'" style="flex:1;background:#1a1a1a;border:1px solid #333;color:#efefef;padding:9px 11px;border-radius:5px;font-family:\'DM Mono\',monospace;font-size:14px;outline:none;"><span style="font-size:10px;color:#666;letter-spacing:1px;">/ 100</span></div></div>'

        // PLACEHOLDER TOGGLE
        +placeholderToggle

        // LIVE CALC
        +'<div id="liveCalcBlock" style="background:#0d1a00;border:1px solid #2a4a00;border-radius:6px;padding:10px 12px;margin-top:14px;"></div>'

        // RESULT OVERRIDE
        +'<div style="margin-top:14px;">'
          +'<div style="font-size:9px;letter-spacing:2px;color:#888;text-transform:uppercase;margin-bottom:5px;">Result Code</div>'
          +'<div style="font-size:10px;color:#666;margin-bottom:6px;">Auto-suggested from Final %. Pick another to override:</div>'
          +'<div style="display:flex;flex-wrap:wrap;gap:5px;" id="overridePills">'+overridePills+'</div>'
        +'</div>'

        // NOTES
        +'<div style="margin-top:14px;">'
          +'<label style="display:block;font-size:9px;letter-spacing:2px;color:#888;text-transform:uppercase;margin-bottom:5px;">Notes (optional)</label>'
          +'<input id="rNotes" type="text" value="'+(sub.notes || '').replace(/"/g,'&quot;')+'" style="width:100%;background:#1a1a1a;border:1px solid #333;color:#efefef;padding:9px 11px;border-radius:5px;font-family:\'DM Mono\',monospace;font-size:12px;outline:none;">'
        +'</div>'

      +'</div>'
      +'<div style="display:flex;gap:8px;padding:14px 18px 18px;border-top:1px solid #1a1a1a;">'
        +'<button onclick="this.closest(\'.school-edit-overlay\').remove()" style="flex:1;background:transparent;border:1px solid #2a2a2a;border-radius:6px;padding:11px;color:#888;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;">Cancel</button>'
        +'<button onclick="saveEditedSubject()" style="flex:2;background:#c8f230;border:none;border-radius:6px;padding:11px;color:#000;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;font-weight:700;">💾 Save</button>'
      +'</div>'
    +'</div>';

  overlay.addEventListener('click', function(e){ if(e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);

  // Wire live calc
  ['rQ1','rQ2','rA1','rA2','rExam','rLegacyYearPct'].forEach(function(id){
    var el = document.getElementById(id);
    if(el) el.addEventListener('input', _updateLiveCalc);
  });
  _updateLiveCalc();
}

function _updateLiveCalc(){
  var sub = SCHOOL_SUBJECTS.find(function(s){ return s.code === _editingSubjectCode; });
  if(!sub) return;
  var snap = _readEditInputs();
  var preview = Object.assign({}, sub, snap);

  var ymp = calcYearMarkPct(preview);
  var fp  = calcFinalPct(preview);
  var rslt = calcResult(preview);

  var block = document.getElementById('liveCalcBlock');
  if(!block) return;
  block.innerHTML =
    '<div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;"><span style="color:#888;">Year Mark %</span><span style="color:#efefef;font-weight:500;">'+(ymp !== null ? ymp : '—')+'</span></div>'
   +'<div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;"><span style="color:#888;">Year contribution (40%)</span><span style="color:#efefef;">'+(ymp !== null ? (ymp * 0.40).toFixed(1) : '—')+'</span></div>'
   +'<div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;"><span style="color:#888;">Exam contribution (60%)</span><span style="color:#efefef;">'+(snap.examRaw !== null && snap.examRaw !== undefined ? (snap.examRaw * 0.60).toFixed(1) : '<span style="color:#444;">— pending</span>')+'</span></div>'
   +'<div style="display:flex;justify-content:space-between;align-items:baseline;border-top:1px dashed #2a4a00;padding-top:6px;margin-top:4px;"><span style="color:#5a8800;font-weight:700;font-size:12px;">Final %</span><span style="color:#c8f230;font-family:\'Syne\',sans-serif;font-weight:800;font-size:18px;">'+(fp !== null ? fp : 'TBD')+'</span></div>'
   +'<div style="display:flex;justify-content:space-between;align-items:baseline;padding-top:4px;"><span style="color:#5a8800;font-weight:700;font-size:11px;">Result</span><span style="color:'+getResultColor(rslt)+';font-family:\'Syne\',sans-serif;font-weight:700;font-size:14px;">'+(rslt || '—')+'</span></div>';

  // Highlight matching override pill if not manual
  var pillsBox = document.getElementById('overridePills');
  if(pillsBox && !sub.resultOverride){
    pillsBox.querySelectorAll('button').forEach(function(b){
      var v = b.getAttribute('data-v');
      var isAuto = (v === '');
      b.style.background = isAuto ? '#1a2e00' : '#1a1a1a';
      b.style.border = '1px solid '+(isAuto ? '#5a8800' : '#2a2a2a');
      b.style.color = isAuto ? '#c8f230' : '#888';
    });
  }
}

function _readEditInputs(){
  var sub = SCHOOL_SUBJECTS.find(function(s){ return s.code === _editingSubjectCode; });
  if(!sub) return {};

  function num(id){
    var el = document.getElementById(id);
    if(!el || el.value === '') return null;
    var v = parseFloat(el.value);
    return isNaN(v) ? null : v;
  }

  var out = {};
  if(sub.type === 'semester'){
    out.quizRaw       = num('rQ1');
    out.assignmentRaw = num('rA1');
  } else {
    var q1 = num('rQ1'), q2 = num('rQ2');
    var a1 = num('rA1'), a2 = num('rA2');
    out.quizRaw       = (q1 === null && q2 === null) ? null : [q1, q2];
    out.assignmentRaw = (a1 === null && a2 === null) ? null : [a1, a2];
  }
  out.examRaw = num('rExam');

  var lyEl = document.getElementById('rLegacyYearPct');
  if(lyEl) out._legacyYearPct = (lyEl.value === '') ? null : parseFloat(lyEl.value);

  var notesEl = document.getElementById('rNotes');
  if(notesEl) out.notes = notesEl.value;

  return out;
}

function _selectResultOverride(btn, val){
  // Update sub temporarily for live calc; persist on Save
  var sub = SCHOOL_SUBJECTS.find(function(s){ return s.code === _editingSubjectCode; });
  if(!sub) return;
  sub.resultOverride = val;
  // re-render pills
  var pills = btn.parentElement.querySelectorAll('button');
  pills.forEach(function(b){
    var v = b.getAttribute('data-v');
    var sel = (v === '' && val === null) || (v === val);
    b.style.background = sel ? '#1a2e00' : '#1a1a1a';
    b.style.border = '1px solid '+(sel ? '#5a8800' : '#2a2a2a');
    b.style.color = sel ? '#c8f230' : '#888';
  });
  _updateLiveCalc();
}

function _togglePlaceholder(btn){
  var sub = SCHOOL_SUBJECTS.find(function(s){ return s.code === _editingSubjectCode; });
  if(!sub) return;
  sub.isPlaceholder = !sub.isPlaceholder;
  btn.setAttribute('data-on', sub.isPlaceholder ? '1' : '0');
  btn.textContent = sub.isPlaceholder ? 'ON' : 'OFF';
  btn.style.background = sub.isPlaceholder ? '#f2c830' : '#1a1a1a';
  btn.style.border = '1px solid '+(sub.isPlaceholder ? '#876500' : '#2a2a2a');
  btn.style.color = sub.isPlaceholder ? '#000' : '#888';
  btn.style.fontWeight = sub.isPlaceholder ? '700' : '400';
}

function saveEditedSubject(){
  var idx = SCHOOL_SUBJECTS.findIndex(function(s){ return s.code === _editingSubjectCode; });
  if(idx < 0) return;
  var snap = _readEditInputs();
  Object.assign(SCHOOL_SUBJECTS[idx], snap);
  saveSchoolSubjects(SCHOOL_SUBJECTS);

  // Optional future cloud sync — preserved for compatibility
  try {
    if(window.cloudSync && window.cloudSync.school){
      // Skip cloud during local-only era — could be re-enabled when Firebase lands
    }
  } catch(e){}

  // Close modal
  var ov = document.querySelector('.school-edit-overlay');
  if(ov) ov.remove();
  renderSchoolResults();
}


// ============================================================================
//  ADD NEW SUBJECT MODAL
// ============================================================================
function openAddSubject(){
  var overlay = document.createElement('div');
  overlay.className = 'school-add-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:1000;display:flex;align-items:flex-end;justify-content:center;';
  overlay.innerHTML =
    '<div style="background:#0a0a0a;border-top:2px solid #c8f230;border-radius:16px 16px 0 0;width:100%;max-width:480px;max-height:90vh;overflow-y:auto;">'
      +'<div style="padding:18px 18px 12px;border-bottom:1px solid #1a1a1a;display:flex;justify-content:space-between;align-items:center;">'
        +'<div><div style="font-family:\'Syne\',sans-serif;font-weight:800;font-size:18px;color:#c8f230;">➕ Add Subject</div>'
        +'<div style="font-size:10px;color:#666;margin-top:2px;letter-spacing:1px;">Fill in what you know — all marks editable later</div></div>'
        +'<button onclick="this.closest(\'.school-add-overlay\').remove()" style="background:none;border:1px solid #2a2a2a;border-radius:6px;width:28px;height:28px;color:#666;cursor:pointer;font-size:16px;">×</button>'
      +'</div>'
      +'<div style="padding:14px 18px;">'
        +'<div style="margin-bottom:10px;"><label style="display:block;font-size:9px;letter-spacing:2px;color:#888;text-transform:uppercase;margin-bottom:5px;">Course Code</label>'
        +'<input id="addCode" type="text" placeholder="e.g. BCOM_MKT-201" style="width:100%;background:#1a1a1a;border:1px solid #333;color:#efefef;padding:9px 11px;border-radius:5px;font-family:\'DM Mono\',monospace;font-size:13px;outline:none;"></div>'

        +'<div style="margin-bottom:10px;"><label style="display:block;font-size:9px;letter-spacing:2px;color:#888;text-transform:uppercase;margin-bottom:5px;">Course Name</label>'
        +'<input id="addName" type="text" placeholder="e.g. Marketing 201" style="width:100%;background:#1a1a1a;border:1px solid #333;color:#efefef;padding:9px 11px;border-radius:5px;font-family:\'DM Mono\',monospace;font-size:13px;outline:none;"></div>'

        +'<div style="margin-bottom:10px;"><label style="display:block;font-size:9px;letter-spacing:2px;color:#888;text-transform:uppercase;margin-bottom:5px;">Year</label>'
        +'<div id="addYear" data-v="3" style="display:flex;gap:5px;flex-wrap:wrap;">'
        +[1,2,3,4].map(function(y){
          return '<button onclick="_pickAdd(this,\'addYear\','+y+')" style="padding:6px 12px;background:'+(y===3?'#1a2e00':'#1a1a1a')+';border:1px solid '+(y===3?'#5a8800':'#2a2a2a')+';border-radius:4px;color:'+(y===3?'#c8f230':'#888')+';font-family:\'DM Mono\',monospace;font-size:11px;cursor:pointer;">Year '+y+'</button>';
        }).join('')+'</div></div>'

        +'<div style="margin-bottom:10px;"><label style="display:block;font-size:9px;letter-spacing:2px;color:#888;text-transform:uppercase;margin-bottom:5px;">Course Type</label>'
        +'<div id="addType" data-v="semester" style="display:flex;gap:5px;flex-wrap:wrap;">'
        +'<button onclick="_pickAdd(this,\'addType\',\'semester\')" style="padding:6px 12px;background:#1a2e00;border:1px solid #5a8800;border-radius:4px;color:#c8f230;font-family:\'DM Mono\',monospace;font-size:11px;cursor:pointer;">📆 Semester (1Q+1A)</button>'
        +'<button onclick="_pickAdd(this,\'addType\',\'annual\')" style="padding:6px 12px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:4px;color:#888;font-family:\'DM Mono\',monospace;font-size:11px;cursor:pointer;">📅 Annual (2Q+2A)</button>'
        +'</div></div>'

        +'<div style="margin-bottom:10px;"><label style="display:block;font-size:9px;letter-spacing:2px;color:#888;text-transform:uppercase;margin-bottom:5px;">Credits</label>'
        +'<div id="addCredits" data-v="15" style="display:flex;gap:5px;flex-wrap:wrap;">'
        +'<button onclick="_pickAdd(this,\'addCredits\',15)" style="padding:6px 12px;background:#1a2e00;border:1px solid #5a8800;border-radius:4px;color:#c8f230;font-family:\'DM Mono\',monospace;font-size:11px;cursor:pointer;">15</button>'
        +'<button onclick="_pickAdd(this,\'addCredits\',30)" style="padding:6px 12px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:4px;color:#888;font-family:\'DM Mono\',monospace;font-size:11px;cursor:pointer;">30</button>'
        +'</div></div>'

        +'<div style="margin-bottom:10px;"><label style="display:block;font-size:9px;letter-spacing:2px;color:#888;text-transform:uppercase;margin-bottom:5px;">NQF Level</label>'
        +'<div id="addNqf" data-v="7" style="display:flex;gap:5px;flex-wrap:wrap;">'
        +[5,6,7].map(function(n){
          return '<button onclick="_pickAdd(this,\'addNqf\','+n+')" style="padding:6px 12px;background:'+(n===7?'#1a2e00':'#1a1a1a')+';border:1px solid '+(n===7?'#5a8800':'#2a2a2a')+';border-radius:4px;color:'+(n===7?'#c8f230':'#888')+';font-family:\'DM Mono\',monospace;font-size:11px;cursor:pointer;">'+n+'</button>';
        }).join('')+'</div></div>'

        +'<div style="margin-bottom:10px;"><label style="display:block;font-size:9px;letter-spacing:2px;color:#888;text-transform:uppercase;margin-bottom:5px;">Period</label>'
        +'<input id="addPeriod" type="text" placeholder="e.g. 2026 January Semester" value="2026 January Semester" style="width:100%;background:#1a1a1a;border:1px solid #333;color:#efefef;padding:9px 11px;border-radius:5px;font-family:\'DM Mono\',monospace;font-size:13px;outline:none;"></div>'

        +'<div style="padding:10px;background:#1a1a00;border:1px dashed #4a3a00;border-radius:6px;font-size:10px;color:#876500;text-align:center;margin-top:10px;">💡 Marks come later via Edit</div>'

      +'</div>'
      +'<div style="display:flex;gap:8px;padding:14px 18px 18px;border-top:1px solid #1a1a1a;">'
        +'<button onclick="this.closest(\'.school-add-overlay\').remove()" style="flex:1;background:transparent;border:1px solid #2a2a2a;border-radius:6px;padding:11px;color:#888;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;">Cancel</button>'
        +'<button onclick="saveNewSubject()" style="flex:2;background:#c8f230;border:none;border-radius:6px;padding:11px;color:#000;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;font-weight:700;">💾 Save Subject</button>'
      +'</div>'
    +'</div>';
  overlay.addEventListener('click', function(e){ if(e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function _pickAdd(btn, groupId, val){
  var box = document.getElementById(groupId);
  if(!box) return;
  box.setAttribute('data-v', val);
  box.querySelectorAll('button').forEach(function(b){
    b.style.background = '#1a1a1a';
    b.style.border = '1px solid #2a2a2a';
    b.style.color = '#888';
  });
  btn.style.background = '#1a2e00';
  btn.style.border = '1px solid #5a8800';
  btn.style.color = '#c8f230';
}

function saveNewSubject(){
  var code = (document.getElementById('addCode').value || '').trim();
  var name = (document.getElementById('addName').value || '').trim();
  if(!code || !name){ alert('Code and name are required.'); return; }
  if(SCHOOL_SUBJECTS.some(function(s){ return s.code === code; })){
    alert('A subject with code "'+code+'" already exists.');
    return;
  }
  var year    = parseInt(document.getElementById('addYear').getAttribute('data-v'),10) || 3;
  var type    = document.getElementById('addType').getAttribute('data-v') || 'semester';
  var credits = parseInt(document.getElementById('addCredits').getAttribute('data-v'),10) || 15;
  var nqf     = parseInt(document.getElementById('addNqf').getAttribute('data-v'),10) || 7;
  var period  = (document.getElementById('addPeriod').value || '').trim() || (year===3 ? '2026 January Semester' : '');

  SCHOOL_SUBJECTS.push({
    _id: _schoolUuid(),
    code: code,
    name: name,
    year: year,
    type: type,
    period: period,
    credits: credits,
    nqfLevel: nqf,
    quizRaw: null,
    assignmentRaw: null,
    examRaw: null,
    resultOverride: null,
    isPlaceholder: false,
    notes: ''
  });
  saveSchoolSubjects(SCHOOL_SUBJECTS);
  var ov = document.querySelector('.school-add-overlay');
  if(ov) ov.remove();
  _activeResultsYear = year;
  renderSchoolResults();
}


// ============================================================================
//  DELETE SUBJECT (long-press style: confirm + remove)
// ============================================================================
function deleteSubject(code){
  var sub = SCHOOL_SUBJECTS.find(function(s){ return s.code === code; });
  if(!sub) return;
  if(!confirm('Delete "'+sub.name+'"?\n\nThis removes the subject from your records. You can re-add it later.')) return;
  SCHOOL_SUBJECTS = SCHOOL_SUBJECTS.filter(function(s){ return s.code !== code; });
  saveSchoolSubjects(SCHOOL_SUBJECTS);
  renderSchoolResults();
}


// ============================================================================
//  GRADE KEY MODAL
// ============================================================================
function openGradeKey(){
  var rows = GRADE_KEY.map(function(g){
    if(g.group){
      return '<tr><td colspan="2" style="padding:10px 12px 6px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#5a8800;font-weight:700;">'+g.group+'</td></tr>';
    }
    return '<tr style="border-bottom:1px solid #1a1a1a;">'
      +'<td style="padding:9px 12px;font-family:\'Syne\',sans-serif;font-weight:700;font-size:13px;color:'+getResultColor(g.symbol)+';white-space:nowrap;width:70px;">'+g.symbol+'</td>'
      +'<td style="padding:9px 12px;font-size:12px;color:#aaa;">'+g.meaning+'</td>'
      +'</tr>';
  }).join('');

  var overlay = document.createElement('div');
  overlay.className = 'gk-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1000;display:flex;align-items:flex-end;justify-content:center;';
  overlay.innerHTML =
    '<div style="background:#0a0a0a;border-top:2px solid #c8f230;border-radius:16px 16px 0 0;width:100%;max-width:480px;max-height:80vh;display:flex;flex-direction:column;">'
      +'<div style="padding:18px 18px 12px;border-bottom:1px solid #1a1a1a;display:flex;justify-content:space-between;align-items:center;">'
        +'<div><div style="font-family:\'Syne\',sans-serif;font-weight:800;font-size:18px;color:#c8f230;">📋 Grade Key</div>'
        +'<div style="font-size:10px;color:#666;margin-top:2px;letter-spacing:1px;">All result codes &amp; meanings</div></div>'
        +'<button onclick="this.closest(\'.gk-overlay\').remove()" style="background:none;border:1px solid #2a2a2a;border-radius:6px;width:28px;height:28px;color:#666;cursor:pointer;font-size:16px;">×</button>'
      +'</div>'
      +'<div style="overflow-y:auto;flex:1;">'
        +'<table style="width:100%;border-collapse:collapse;">'+rows+'</table>'
      +'</div>'
      +'<div style="padding:12px 16px;border-top:1px solid #1a1a1a;">'
        +'<button onclick="this.closest(\'.gk-overlay\').remove()" style="width:100%;background:#1a2e00;border:1px solid #3a5a00;border-radius:8px;padding:12px;color:#c8f230;font-family:\'DM Mono\',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;">Close</button>'
      +'</div>'
    +'</div>';
  overlay.addEventListener('click', function(e){ if(e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}


// ============================================================================
//  MAIN RENDER
// ============================================================================
function renderSchoolResults(){
  var el = document.getElementById('schoolResults');
  if(!el) return;

  // Distinct years that exist in the data
  var distinctYears = Array.from(new Set(SCHOOL_SUBJECTS.map(function(s){ return s.year; }))).sort();
  if(distinctYears.length === 0){
    el.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#444;font-size:12px;">No subjects yet. Tap <b>+ Add Subject</b>.</div>';
    return;
  }
  // Make sure active year exists
  if(distinctYears.indexOf(_activeResultsYear) === -1) _activeResultsYear = distinctYears[distinctYears.length-1];

  // Year chip strip — EXACTLY one chip per distinct year
  var chips = distinctYears.map(function(y){
    var subs = SCHOOL_SUBJECTS.filter(function(s){ return s.year === y; });
    var active = (y === _activeResultsYear);
    return '<button onclick="switchResultsYear('+y+')" style="padding:8px 16px;border:1px solid '+(active?'#c8f230':'#2a2a2a')+';border-radius:100px;background:'+(active?'#1a2e00':'transparent')+';color:'+(active?'#c8f230':'#888')+';font-family:\'DM Mono\',monospace;font-size:11px;letter-spacing:1px;cursor:pointer;white-space:nowrap;flex-shrink:0;">Year '+y+' <span style="font-size:9px;color:'+(active?'#5a8800':'#555')+';margin-left:6px;">'+subs.length+'</span></button>';
  }).join('');

  // Degree progress card
  var creditsEarned = calcCreditsEarned();
  var totalCredits  = calcTotalCredits();
  var progressPct   = totalCredits > 0 ? Math.round(creditsEarned / totalCredits * 100 * 10) / 10 : 0;

  // Year average card
  var yearSubs = SCHOOL_SUBJECTS.filter(function(s){ return s.year === _activeResultsYear; });
  var withFinals = yearSubs.filter(function(s){ return calcFinalPct(s) !== null; });
  var avgFinal = calcYearAverage(_activeResultsYear);

  // Group by period within year
  var periodGroups = {};
  yearSubs.forEach(function(s){
    var p = s.period || 'Unspecified';
    if(!periodGroups[p]) periodGroups[p] = [];
    periodGroups[p].push(s);
  });

  // Sort periods alphabetically (year strings sort fine)
  var periodKeys = Object.keys(periodGroups).sort();

  var html =
    // Action buttons row
    '<div style="display:flex;gap:8px;margin-bottom:16px;">'
      +'<button onclick="openAddSubject()" style="flex:1;background:#c8f230;border:none;border-radius:8px;padding:10px;color:#000;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;font-weight:700;">+ Add Subject</button>'
      +'<button onclick="openGradeKey()" style="background:transparent;border:1px solid #2a4a00;border-radius:8px;padding:10px 14px;color:#5a8800;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;">📋 Key</button>'
      +'<button onclick="exportResults()" style="background:transparent;border:1px solid #2a4a00;border-radius:8px;padding:10px 14px;color:#5a8800;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;">📄 Export</button>'
    +'</div>'

    // Degree progress
    +'<div style="background:#0d1a00;border:1px solid #2a4a00;border-radius:10px;padding:14px;margin-bottom:14px;">'
      +'<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">'
        +'<span style="font-size:10px;letter-spacing:2px;color:#5a8800;text-transform:uppercase;">📊 Degree Progress</span>'
        +'<span style="font-family:\'Syne\',sans-serif;font-weight:700;color:#c8f230;font-size:14px;">'+progressPct+'%</span>'
      +'</div>'
      +'<div style="height:8px;background:#1a1a1a;border-radius:4px;overflow:hidden;margin-bottom:8px;">'
        +'<div style="height:100%;background:#c8f230;border-radius:4px;width:'+progressPct+'%;transition:width .5s;"></div>'
      +'</div>'
      +'<div style="display:flex;justify-content:space-between;font-size:11px;">'
        +'<span style="color:#efefef;"><strong style="font-family:\'Syne\',sans-serif;font-size:14px;color:#c8f230;">'+creditsEarned+'</strong> of '+totalCredits+' credits</span>'
        +'<span style="color:#666;">'+(totalCredits - creditsEarned)+' to go</span>'
      +'</div>'
    +'</div>'

    // Year chips
    +'<div style="display:flex;gap:8px;margin-bottom:14px;overflow-x:auto;padding-bottom:4px;">'+chips+'</div>'

    // Year average card
    +'<div style="background:var(--surface);border:1px solid #2a2a2a;border-radius:10px;padding:14px;margin-bottom:14px;">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
        +'<span style="font-size:10px;letter-spacing:2px;color:#666;text-transform:uppercase;">Year '+_activeResultsYear+' Average</span>'
        +'<span style="font-size:10px;color:'+(withFinals.length===yearSubs.length?'#c8f230':'#f2c830')+';background:'+(withFinals.length===yearSubs.length?'#1a2e00':'#1a1500')+';padding:3px 10px;border-radius:100px;border:1px solid '+(withFinals.length===yearSubs.length?'#3a5a00':'#4a3a00')+';letter-spacing:1px;">'+withFinals.length+' of '+yearSubs.length+' final</span>'
      +'</div>'
      +'<div style="font-family:\'Syne\',sans-serif;font-weight:800;font-size:42px;color:'+(avgFinal!==null?'#c8f230':'#444')+';letter-spacing:-1px;line-height:1;">'+(avgFinal!==null ? avgFinal : '—')+'<span style="font-size:18px;color:#666;">%</span></div>'
      +'<div style="font-size:10px;color:#666;margin-top:4px;letter-spacing:1px;">'+(withFinals.length===0?'Awaiting first final mark':'Average of '+withFinals.length+' final results')+'</div>'
    +'</div>';

  // Subject cards grouped by period
  periodKeys.forEach(function(period){
    html += '<div style="font-size:10px;letter-spacing:2px;color:#666;text-transform:uppercase;margin:18px 0 10px 4px;">▼ '+period+'</div>';
    periodGroups[period].forEach(function(sub){
      html += _renderSubjectCard(sub);
    });
  });

  el.innerHTML = html;
}

function _renderSubjectCard(sub){
  var color = _subjectColor(sub.code);
  var ymp = calcYearMarkPct(sub);
  var fp  = calcFinalPct(sub);
  var rslt = calcResult(sub);
  var rsltColor = getResultColor(rslt);
  var typeIcon = (sub.type === 'semester') ? '📆' : '📅';

  var badge;
  if(sub.isPlaceholder){
    badge = '<div style="font-family:\'Syne\',sans-serif;font-weight:800;font-size:13px;padding:7px 12px;border-radius:6px;background:#1a1500;color:#f2c830;border:1px dashed #876500;flex-shrink:0;">'+(rslt || '?')+'</div>';
  } else if(rslt){
    var bg, fg, border = 'none';
    if(rslt === 'PD' || rslt === 'PDS' || rslt === 'PDA'){ bg = '#c8f230'; fg = '#000'; }
    else if(rslt === 'P' || rslt === 'PS' || rslt === 'PA'){ bg = '#30c8f2'; fg = '#000'; }
    else if(rslt === 'F'){ bg = '#f23060'; fg = '#fff'; }
    else if(rslt === 'EXM'){ bg = '#2a2a2a'; fg = '#888'; border = '1px solid #444'; }
    else if(rslt === 'Exe'){ bg = '#a830f2'; fg = '#fff'; }
    else { bg = '#1a1a1a'; fg = '#f2a830'; border = '1px solid #4a3a00'; }
    badge = '<div style="font-family:\'Syne\',sans-serif;font-weight:800;font-size:13px;padding:7px 12px;border-radius:6px;background:'+bg+';color:'+fg+';border:'+border+';flex-shrink:0;">'+rslt+'</div>';
  } else {
    badge = '<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:11px;padding:7px 12px;border-radius:6px;background:#1a1a1a;color:#444;border:1px solid #2a2a2a;flex-shrink:0;">—</div>';
  }

  var placeholderStrip = sub.isPlaceholder
    ? '<div style="background:#1a1500;border-bottom:1px dashed #4a3a00;padding:7px 14px;font-size:10px;color:#f2c830;display:flex;align-items:center;gap:8px;">🟡 Placeholder — confirm against transcript when released</div>'
    : '';

  var marksHtml;
  if(sub.resultOverride === 'Exe'){
    marksHtml =
      '<div style="display:flex;justify-content:space-between;padding:10px 16px;border-top:1px solid #0f0f0f;font-size:13px;align-items:center;">'
        +'<span style="color:#a830f2;letter-spacing:0.5px;">Exemption</span>'
        +'<span style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:14px;color:#a830f2;">Credits granted</span>'
      +'</div>';
  } else {
    var phColor = sub.isPlaceholder ? '#f2c830' : '#efefef';
    var ympDisp = (ymp !== null) ? ymp : '—';
    var examDisp = (sub.examRaw !== null && sub.examRaw !== undefined) ? sub.examRaw : '—';
    var fpDisp = (fp !== null) ? fp : 'TBD';
    marksHtml =
      '<div style="display:flex;justify-content:space-between;padding:10px 16px;border-top:1px solid #0f0f0f;font-size:13px;align-items:center;">'
        +'<span style="color:#666;letter-spacing:0.5px;font-size:13px;">Year %</span>'
        +'<span style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:18px;color:'+phColor+';">'+ympDisp+'</span>'
      +'</div>'
      +'<div style="display:flex;justify-content:space-between;padding:10px 16px;border-top:1px solid #0f0f0f;font-size:13px;align-items:center;">'
        +'<span style="color:#666;letter-spacing:0.5px;font-size:13px;">Exam %'+(sub.notes && sub.notes.indexOf('July')>-1 ? '<span style="color:#f2c830;font-size:10px;margin-left:6px;">⏰ '+sub.notes+'</span>':'')+'</span>'
        +'<span style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:18px;color:'+(examDisp==='—'?'#444':phColor)+';">'+examDisp+'</span>'
      +'</div>'
      +'<div style="display:flex;justify-content:space-between;padding:10px 16px;border-top:1px solid #0f0f0f;font-size:13px;align-items:center;background:#0a0a0a;">'
        +'<span style="color:#666;letter-spacing:0.5px;font-size:13px;">Final %</span>'
        +'<span style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:20px;color:'+(fp===null?'#444':(sub.isPlaceholder?'#f2c830':'#c8f230'))+';">'+fpDisp+'</span>'
      +'</div>'
      +'<div style="display:flex;justify-content:space-between;padding:10px 16px;border-top:1px solid #0f0f0f;font-size:13px;align-items:center;">'
        +'<span style="color:#666;letter-spacing:0.5px;font-size:13px;">Result</span>'
        +'<span style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:14px;color:'+rsltColor+';">'+(rslt ? getResultLabel(rslt) : '—')+(sub.isPlaceholder?' (placeholder)':'')+'</span>'
      +'</div>';
  }

  // Assessment breakdown row (only if quiz/assignment present)
  var breakdown = '';
  if(sub.quizRaw !== null || sub.assignmentRaw !== null){
    var qParts = [], aParts = [];
    if(Array.isArray(sub.quizRaw)){
      sub.quizRaw.forEach(function(v,i){ if(v!==null && v!==undefined) qParts.push('Q'+(i+1)+': '+v+'/15'); });
    } else if(typeof sub.quizRaw === 'number'){ qParts.push(sub.quizRaw+'/30'); }
    if(Array.isArray(sub.assignmentRaw)){
      sub.assignmentRaw.forEach(function(v,i){ if(v!==null && v!==undefined) aParts.push('A'+(i+1)+': '+v+'/35'); });
    } else if(typeof sub.assignmentRaw === 'number'){ aParts.push(sub.assignmentRaw+'/70'); }
    if(qParts.length || aParts.length){
      breakdown =
        '<div style="padding:8px 16px;border-top:1px solid #0f0f0f;background:#0a0a0a;font-size:10px;color:#5a8800;letter-spacing:1px;">'
          +(qParts.length ? '🧪 '+qParts.join(' · ') : '')
          +(qParts.length && aParts.length ? ' &nbsp;·&nbsp; ' : '')
          +(aParts.length ? '📝 '+aParts.join(' · ') : '')
        +'</div>';
    }
  }

  return ''
    +'<div style="background:var(--surface);border-radius:10px;margin-bottom:10px;overflow:hidden;border-left:3px solid '+color+';">'
      +placeholderStrip
      +'<div style="padding:14px 16px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">'
        +'<div style="flex:1;min-width:0;">'
          +'<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:15px;line-height:1.2;margin-bottom:3px;">'+sub.name+'</div>'
          +'<div style="font-size:10px;color:#666;letter-spacing:1px;margin-bottom:5px;">'+sub.code+' · '+sub.credits+'cr · NQF '+sub.nqfLevel+'</div>'
          +'<span style="display:inline-block;font-size:9px;letter-spacing:1px;color:#888;background:#0f0f0f;padding:3px 8px;border-radius:4px;border:1px solid #2a2a2a;">'+typeIcon+' '+(sub.type==='semester'?'Semester':'Annual')+'</span>'
        +'</div>'
        +badge
      +'</div>'
      +marksHtml
      +breakdown
      +'<div style="display:flex;border-top:1px dashed #2a2a2a;">'
        +'<button onclick="openEditSubject(\''+sub.code+'\')" style="flex:1;background:transparent;border:none;padding:10px;color:#666;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;">✏️ Edit</button>'
        +'<button onclick="deleteSubject(\''+sub.code+'\')" style="background:transparent;border:none;border-left:1px dashed #2a2a2a;padding:10px 14px;color:#444;font-family:\'DM Mono\',monospace;font-size:10px;cursor:pointer;">🗑</button>'
      +'</div>'
    +'</div>';
}


// ============================================================================
//  ODIN / FIRST-RUN HELPERS — unchanged
// ============================================================================
function askOdinAboutSchool(){
  try {
    if(typeof goToTab === 'function') goToTab('odin');
    setTimeout(function(){
      if(typeof odinChatAsk === 'function'){
        odinChatAsk('How do I set up my school tab?');
      } else if(typeof openOdinChat === 'function'){
        openOdinChat('How do I set up my school tab?');
      }
    }, 250);
  } catch(e){ console.warn('askOdinAboutSchool failed:', e); }
}

function quickAddSchoolEvent(){
  openAddSchoolEvent();
}

function isSchoolEmpty(){
  try {
    var events = loadSchoolEvents() || [];
    return events.length === 0 && SCHOOL_SUBJECTS.length === 0;
  } catch(e){ return false; }
}


// ============================================================================
//  BACKWARDS-COMPAT SHIMS — keeps old code paths from crashing
// ============================================================================
//
// The old school.js exposed ALL_YEARS_DATA, RESULTS_DATA, _activeYearIdx and
// helpers like openAddResult / switchResultsYear (already redefined above).
// Some other modules (core.js exportResults, cloud-sync.js syncResultsArray)
// still reference the old shape. We expose a synthetic ALL_YEARS_DATA that
// reconstructs the old shape at read time so those work without edits.

Object.defineProperty(window, 'ALL_YEARS_DATA', {
  configurable: true,
  get: function(){
    var byYear = {};
    SCHOOL_SUBJECTS.forEach(function(s){
      var key = 'Year '+s.year;
      if(!byYear[key]){
        byYear[key] = { year:key, period:s.period || '', subjects:[] };
      }
      var fp = calcFinalPct(s);
      var rslt = calcResult(s);
      byYear[key].subjects.push({
        code: s.code,
        name: s.name,
        color: _subjectColor(s.code),
        yearPct:  calcYearMarkPct(s),
        examPct:  s.examRaw,
        finalPct: fp,
        result:   rslt,
        quizScore: (typeof s.quizRaw === 'number') ? s.quizRaw : (Array.isArray(s.quizRaw) ? _sumRaw(s.quizRaw) : null),
        assessmentScore: (typeof s.assignmentRaw === 'number') ? s.assignmentRaw : (Array.isArray(s.assignmentRaw) ? _sumRaw(s.assignmentRaw) : null),
        _id: s._id
      });
    });
    var sortedYears = Object.keys(byYear).sort();
    return sortedYears.map(function(k){ return byYear[k]; });
  }
});

Object.defineProperty(window, '_activeYearIdx', {
  configurable: true,
  get: function(){ return Math.max(0, _activeResultsYear - 1); },
  set: function(v){ _activeResultsYear = (typeof v === 'number') ? v + 1 : 3; }
});

Object.defineProperty(window, 'RESULTS_DATA', {
  configurable: true,
  get: function(){
    var all = window.ALL_YEARS_DATA;
    return all[_activeResultsYear - 1] || { year:'Year '+_activeResultsYear, period:'', subjects:[] };
  }
});

// Old function name still referenced from core.js exportResults
function reloadSchoolResults(){
  reloadSchoolSubjects();
}


// ── INSTALMENT-RELATED CACHE FIX — kept for back-compat ─────────────────────
function fixSchoolCache(){
  try {
    var raw = lsGet(SCHOOL_EVENTS_KEY);
    var events = raw ? JSON.parse(raw) : [];
    var before = events.length;
    var seen = {};
    var deduped = events.filter(function(e){
      var key = (e.date||'')+'|'+(e.type||'')+'|'+(e.title||'')+'|'+(e.time||'');
      if(seen[key]) return false;
      seen[key] = true;
      return true;
    });
    lsSet(SCHOOL_EVENTS_KEY, JSON.stringify(deduped));
    alert('School cache fixed!\nBefore: '+before+' events\nAfter: '+deduped.length+' events');
  } catch(e) {
    alert('Error: '+e.message);
  }
}
window.fixSchoolCache = fixSchoolCache;
