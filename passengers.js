// Passengers: shared module owning the PASSENGERS / PASSENGER_DATA globals
// and all passenger CRUD (add/edit/delete/render).
//
// MUST load AFTER core.js (needs PASSENGERS_KEY, lsGet/lsSet, uid)
// and BEFORE carpool.js, maint.js, cashflow.js, borrow.js, sync.js,
// prayer.js, odin.js, odin_chat.js, routine.js — all of which read
// PASSENGERS / PASSENGER_DATA at script load time or via loadPassengers().

// ── Defaults used on first run before any saved data exists ──
var DEFAULT_PASSENGERS = [
  { name: 'David',   defaultAmt: 44, color: '#c8f230' },
  { name: 'Lezaun',  defaultAmt: 44, color: '#f2a830' },
  { name: 'Shireen', defaultAmt: 44, color: '#7090f0' }
];

// Palette for the colour picker in the passenger modal
var PASSENGER_COLORS = [
  '#c8f230', // lime
  '#f2a830', // amber
  '#7090f0', // blue
  '#f23060', // red
  '#a060f0', // purple
  '#30c8f0', // cyan
  '#f0c830', // yellow
  '#60d090', // mint
  '#f06090', // pink
  '#80a0c0'  // slate
];

// ── Globals consumed across the app ──
// PASSENGER_DATA = full objects [{id, name, defaultAmt, color}, ...]
// PASSENGERS     = just the names ['David', 'Lezaun', ...]
// pmSelColor     = currently-selected colour in the Add/Edit modal
var PASSENGER_DATA = [];
var PASSENGERS = [];
var pmSelColor = '#c8f230';

// uid() may not exist yet (defined in money.js, which loads later) — provide
// a safe local fallback so passengers.js never crashes during initial load.
function _passengerUid(){
  if(typeof uid === 'function') return uid();
  return Math.random().toString(36).slice(2, 9);
}

// ── Load / Save ──
// loadPassengers() always returns the array. It also keeps the PASSENGER_DATA
// and PASSENGERS globals in sync so callers that read the globals don't need
// to call loadPassengers() first.
function loadPassengers(){
  var list = [];
  try {
    var raw = lsGet(PASSENGERS_KEY);
    if(raw){
      var parsed = JSON.parse(raw);
      if(Array.isArray(parsed) && parsed.length){
        list = parsed.map(function(p){
          return {
            id:         p.id || _passengerUid(),
            name:       p.name,
            defaultAmt: typeof p.defaultAmt === 'number' ? p.defaultAmt : 44,
            color:      p.color || '#c8f230',
            // Preserve soft-delete flag so undo can find and clear it.
            _deleted:   p._deleted || false
          };
        });
      }
    }
  } catch(e){ console.warn('loadPassengers parse error:', e); }

  // First run / empty / corrupt → seed with defaults and persist
  if(!list.length){
    list = DEFAULT_PASSENGERS.map(function(p){
      return { id: _passengerUid(), name: p.name, defaultAmt: p.defaultAmt, color: p.color };
    });
    try { lsSet(PASSENGERS_KEY, JSON.stringify(list)); } catch(e){}
  }

  // Sync globals — exclude soft-deleted from the active PASSENGERS array
  // so they don't appear in dropdowns or carpool grids during the undo
  // window. The full list (with flags) is still in storage and returned
  // from this fn so the delete handler can flip the flag.
  PASSENGER_DATA = list;
  var visible = list.filter(function(p){ return !p._deleted; });
  PASSENGERS = visible.map(function(p){ return p.name; });
  window.PASSENGER_DATA = PASSENGER_DATA;
  window.PASSENGERS     = PASSENGERS;
  return list;
}

function savePassengers(list){
  PASSENGER_DATA = list || [];
  // Active PASSENGERS array excludes soft-deleted entries so dropdowns and
  // carpool grids stop showing them immediately on save.
  var visible = PASSENGER_DATA.filter(function(p){ return !p._deleted; });
  PASSENGERS = visible.map(function(p){ return p.name; });
  window.PASSENGER_DATA = PASSENGER_DATA;
  window.PASSENGERS     = PASSENGERS;
  lsSet(PASSENGERS_KEY, JSON.stringify(PASSENGER_DATA));
}

// Re-read from storage and update globals — used after edits / imports
function refreshPassengerGlobals(){
  loadPassengers();
}

// ── Settings UI: the list of passengers ──
function renderPassengerRows(){
  var container = document.getElementById('passengerRows');
  if(!container) return;
  // Hide soft-deleted passengers from the settings list during the undo window
  var list = loadPassengers().filter(function(p){ return !p._deleted; });
  if(!list.length){
    container.innerHTML = '<div style="font-size:11px;color:#333;padding:4px 0;">No passengers yet.</div>';
    return;
  }
  container.innerHTML = list.map(function(p){
    return '<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#0d1a10;border:1px solid #1a4028;border-radius:6px;">'
      + '<span style="width:10px;height:10px;border-radius:50%;background:' + p.color + ';flex-shrink:0;display:inline-block;"></span>'
      + '<span style="flex:1;font-family:\'DM Mono\',monospace;font-size:12px;color:#efefef;">' + p.name + '</span>'
      + '<span style="font-size:10px;color:#555;letter-spacing:1px;">R' + (p.defaultAmt || 44) + '/trip</span>'
      + '<button onclick="editPassenger(\'' + p.id + '\')" style="background:none;border:1px solid #2a2a2a;border-radius:4px;padding:3px 8px;color:#888;font-family:\'DM Mono\',monospace;font-size:9px;letter-spacing:1px;cursor:pointer;">Edit</button>'
      + '<button onclick="deletePassenger(\'' + p.id + '\')" style="background:none;border:1px solid #2a1a1a;border-radius:4px;padding:3px 8px;color:#555;font-family:\'DM Mono\',monospace;font-size:9px;letter-spacing:1px;cursor:pointer;">✕</button>'
      + '</div>';
  }).join('');
}

// ── Modal helpers ──
function buildPmColorGrid(){
  var g = document.getElementById('pmColorGrid');
  if(!g) return;
  g.innerHTML = '';
  PASSENGER_COLORS.forEach(function(c){
    var b = document.createElement('button');
    b.type = 'button';
    b.style.cssText = 'width:24px;height:24px;border-radius:50%;background:' + c
      + ';border:' + (c === pmSelColor ? '3px solid #fff' : '2px solid transparent')
      + ';cursor:pointer;transition:border .15s;';
    b.onclick = function(){ pmSelColor = c; buildPmColorGrid(); };
    g.appendChild(b);
  });
}

// ── CRUD ──
function addPassenger(){
  var list = loadPassengers();
  pmSelColor = PASSENGER_COLORS[list.length % PASSENGER_COLORS.length];
  document.getElementById('passengerModalTitle').textContent = '🚗 Add Passenger';
  document.getElementById('pmName').value  = '';
  document.getElementById('pmAmt').value   = '44';
  document.getElementById('pmEditId').value = '';
  buildPmColorGrid();
  document.getElementById('passengerModal').classList.add('active');
}

function editPassenger(id){
  var list = loadPassengers();
  var p = list.find(function(x){ return x.id === id; });
  if(!p) return;
  pmSelColor = p.color || '#c8f230';
  document.getElementById('passengerModalTitle').textContent = '✏️ Edit Passenger';
  document.getElementById('pmName').value  = p.name;
  document.getElementById('pmAmt').value   = p.defaultAmt || 44;
  document.getElementById('pmEditId').value = id;
  buildPmColorGrid();
  document.getElementById('passengerModal').classList.add('active');
}

function savePassenger(){
  var name    = document.getElementById('pmName').value.trim();
  var amt     = parseFloat(document.getElementById('pmAmt').value) || 44;
  var editId  = document.getElementById('pmEditId').value;
  if(!name){ alert('Enter a passenger name.'); return; }

  var list = loadPassengers();

  if(editId){
    var idx = list.findIndex(function(p){ return p.id === editId; });
    if(idx > -1){
      var oldName = list[idx].name;
      // Block renames that would clash with another passenger
      var clash = list.find(function(p, i){
        return i !== idx && p.name.toLowerCase() === name.toLowerCase();
      });
      if(clash){ alert('A passenger named "' + name + '" already exists.'); return; }
      list[idx].name       = name;
      list[idx].defaultAmt = amt;
      list[idx].color      = pmSelColor;
      if(oldName !== name) migratePassengerName(oldName, name);
    }
  } else {
    if(list.find(function(p){ return p.name.toLowerCase() === name.toLowerCase(); })){
      alert('A passenger named "' + name + '" already exists.'); return;
    }
    list.push({ id: _passengerUid(), name: name, defaultAmt: amt, color: pmSelColor });
  }

  savePassengers(list);
  refreshPassengerGlobals();
  closeModal('passengerModal');
  renderPassengerRows();

  // Refresh dependent UI — all guarded so passengers.js never blows up if a
  // module isn't loaded yet
  try { if(typeof renderPassOptList === 'function') renderPassOptList(); } catch(e){}
  try { if(typeof loadCP === 'function') loadCP(); } catch(e){}
  try { if(typeof renderCarpool === 'function') renderCarpool(); } catch(e){}
  try { if(typeof renderMaintCard === 'function') renderMaintCard(); } catch(e){}
  try { if(typeof renderCustomMaintCards === 'function') renderCustomMaintCards(); } catch(e){}
  try { if(typeof showBackupReminder === 'function') showBackupReminder('Passenger list updated'); } catch(e){}
}

function deletePassenger(id){
  var list = loadPassengers();
  var p = list.find(function(x){ return x.id === id; });
  if(!p) return;
  if(!confirm('Remove ' + p.name + ' as a passenger? Their carpool history stays but they won\'t appear in new entries.')) return;
  // Soft-delete: flag the passenger. renderPassengerRows / refreshPassengerGlobals
  // skip _deleted so they vanish from the active passenger list immediately.
  // Carpool history (cpData) and borrow history (borrowData) keyed by name
  // are unaffected — historical data stays.
  p._deleted = true;
  savePassengers(list); // save with the flag applied (list already references p)
  refreshPassengerGlobals();
  renderPassengerRows();
  try { if(typeof renderPassOptList === 'function') renderPassOptList(); } catch(e){}
  try { if(typeof renderCarpool === 'function') renderCarpool(); } catch(e){}

  softDeleteToast({
    label: p.name,
    onUndo: function(){
      var l = loadPassengers();
      var ent = l.find(function(x){ return x.id === id; });
      if(ent){ delete ent._deleted; savePassengers(l); }
      refreshPassengerGlobals();
      renderPassengerRows();
      try { if(typeof renderPassOptList === 'function') renderPassOptList(); } catch(e){}
      try { if(typeof renderCarpool === 'function') renderCarpool(); } catch(e){}
    },
    onPurge: function(){
      var l = loadPassengers();
      var newList = l.filter(function(x){ return x.id !== id; });
      savePassengers(newList);
      refreshPassengerGlobals();
    }
  });
}

// When a passenger is renamed, rewrite their key inside cpData and borrowData
// so historical data isn't lost.
function migratePassengerName(oldName, newName){
  // Carpool data
  try {
    var raw = lsGet(CPK);
    if(raw){
      var cp = JSON.parse(raw);
      Object.keys(cp).forEach(function(mk){
        var month = cp[mk]; if(!month) return;
        Object.keys(month).forEach(function(ds){
          var day = month[ds]; if(!day) return;
          if(day[oldName] !== undefined){
            day[newName] = day[oldName];
            delete day[oldName];
          }
        });
      });
      lsSet(CPK, JSON.stringify(cp));
      // Update in-memory copy if carpool module is loaded
      if(typeof cpData !== 'undefined') cpData = cp;
    }
  } catch(e){ console.warn('migratePassengerName carpool error:', e); }

  // Borrows
  try {
    var bRaw = lsGet(BORROW_KEY);
    if(bRaw){
      var borrows = JSON.parse(bRaw);
      if(borrows[oldName]){
        borrows[newName] = borrows[oldName];
        delete borrows[oldName];
        lsSet(BORROW_KEY, JSON.stringify(borrows));
      }
    }
  } catch(e){ console.warn('migratePassengerName borrows error:', e); }
}

// ── Initial load — runs as soon as this script executes ──
loadPassengers();

// Render the settings list once the DOM is ready
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', renderPassengerRows);
} else {
  renderPassengerRows();
}
