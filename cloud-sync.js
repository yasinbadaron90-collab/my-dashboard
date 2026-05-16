// =====================================================================
// cloud-sync.js — Supabase data sync engine for Yasin Dashboard
// =====================================================================
// Provides per-domain adapters that read/write to Supabase tables and
// sync with localStorage. Designed to be offline-first: every write
// hits localStorage immediately, and is queued for upload when offline.
//
// Public API:
//   window.cloudSync.isReady()             → bool (logged in + online)
//   window.cloudSync.status()              → { online, queueSize, lastSync, signedIn }
//   window.cloudSync.uploadAllLocal()      → push existing localStorage to cloud
//   window.cloudSync.pullAll()             → pull cloud → localStorage
//   window.cloudSync.queue(domain, op, payload) → queue a write
//   window.cloudSync.flush()               → process the queue now
//   window.cloudSync.onStatusChange(cb)    → register status listener
//
// Per-domain adapters (added later by passengers.js, carpool.js etc.):
//   window.cloudSync.passengers
//   window.cloudSync.carpool
// =====================================================================

// =====================================================================
// SHARED STORAGE HELPERS — must mirror core.js lsGet/lsSet behaviour.
// =====================================================================
// core.js wraps storage in a 3-layer fallback: localStorage →
// sessionStorage → in-memory (_lsMem). If the device ever hit a quota
// error, real user data can live in sessionStorage or memory, NOT in
// localStorage. Adapters that read raw localStorage.getItem() would then
// see nothing and report "0 rows" even though the data is right there.
//
// These helpers prefer the global lsGet/lsSet (defined in core.js) so
// every adapter reads/writes through the same fallback chain the rest of
// the app uses. They fall back to a local 3-layer implementation only if
// core.js hasn't loaded yet (shouldn't happen in practice).
function cloudLsGet(k){
  if(typeof window !== 'undefined' && typeof window.lsGet === 'function'){
    return window.lsGet(k);
  }
  try { var v = localStorage.getItem(k); if(v !== null) return v; } catch(e){}
  try { var s = sessionStorage.getItem(k); if(s !== null) return s; } catch(e){}
  return null;
}
function cloudLsSet(k, v){
  if(typeof window !== 'undefined' && typeof window.lsSet === 'function'){
    return window.lsSet(k, v);
  }
  try { localStorage.setItem(k, v); return true; } catch(e){}
  try { sessionStorage.setItem(k, v); return true; } catch(e){}
  return false;
}
function cloudLsRemove(k){
  // Remove from every layer so it can't resurrect from a fallback store.
  try { localStorage.removeItem(k); } catch(e){}
  try { sessionStorage.removeItem(k); } catch(e){}
  // core.js keeps an in-memory mirror (_lsMem) — clear it too if exposed.
  try { if(typeof window !== 'undefined' && window._lsMem) delete window._lsMem[k]; } catch(e){}
}

(function(){
  'use strict';

  var QUEUE_KEY     = 'yb_cloud_queue_v1';
  var LAST_SYNC_KEY = 'yb_cloud_lastsync_v1';
  var statusListeners = [];

  // --- helpers --------------------------------------------------------
  function _lsGet(k){ return cloudLsGet(k); }
  function _lsSet(k, v){ return cloudLsSet(k, v); }

  function _readQueue(){
    try {
      var raw = _lsGet(QUEUE_KEY);
      if(!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch(e){ return []; }
  }
  function _writeQueue(arr){ _lsSet(QUEUE_KEY, JSON.stringify(arr || [])); }

  function _notifyStatus(){
    var s = api.status();
    for(var i=0;i<statusListeners.length;i++){
      try { statusListeners[i](s); } catch(e){}
    }
  }

  // --- public API -----------------------------------------------------
  var api = {};

  api.isReady = function(){
    return !!(window.sb && window.sbAuth && window.sbAuth.householdId && navigator.onLine);
  };

  api.status = function(){
    return {
      online:    !!navigator.onLine,
      signedIn:  !!(window.sbAuth && window.sbAuth.householdId),
      queueSize: _readQueue().length,
      lastSync:  _lsGet(LAST_SYNC_KEY) || null
    };
  };

  api.onStatusChange = function(cb){
    if(typeof cb === 'function') statusListeners.push(cb);
  };

  api.queue = function(domain, op, payload){
    var q = _readQueue();
    q.push({ domain: domain, op: op, payload: payload, ts: Date.now() });
    _writeQueue(q);
    _notifyStatus();
    // Try to flush right away if we're online
    if(api.isReady()) api.flush();
  };

  // Process the queue: pop items in order, run them against Supabase.
  // If an item fails, leave it at the front of the queue and stop.
  api.flush = async function(){
    if(!api.isReady()) return { ok: false, reason: 'not ready' };
    var q = _readQueue();
    if(!q.length) return { ok: true, processed: 0 };
    var processed = 0;
    while(q.length){
      var item = q[0];
      var adapter = api[item.domain];
      if(!adapter || typeof adapter._apply !== 'function'){
        console.warn('[cloud-sync] no adapter for domain', item.domain);
        q.shift(); // drop poison messages
        continue;
      }
      try {
        await adapter._apply(item.op, item.payload);
        q.shift();
        processed++;
        _writeQueue(q);
      } catch(e){
        console.warn('[cloud-sync] queue item failed', item, e);
        // Stop processing; will retry on next flush
        break;
      }
    }
    if(processed > 0){
      _lsSet(LAST_SYNC_KEY, new Date().toISOString());
    }
    _notifyStatus();
    return { ok: true, processed: processed, remaining: q.length };
  };

  api.pullAll = async function(){
    if(!api.isReady()) return { ok: false, reason: 'not ready' };
    var results = {};
    var order = ['passengers', 'carpool'];
    for(var key in api){
      if(api.hasOwnProperty(key) && order.indexOf(key) === -1 &&
         api[key] && typeof api[key].pull === 'function'){
        order.push(key);
      }
    }
    for(var idx=0; idx<order.length; idx++){
      var name = order[idx];
      var adapter = api[name];
      if(adapter && typeof adapter.pull === 'function'){
        try {
          results[name] = await adapter.pull();
        } catch(e){
          console.warn('[cloud-sync] pull failed for', name, e);
          results[name] = { ok: false, error: String(e) };
        }
      }
    }
    _lsSet(LAST_SYNC_KEY, new Date().toISOString());
    _notifyStatus();
    return { ok: true, results: results };
  };

  api.uploadAllLocal = async function(){
    if(!api.isReady()){
      return { ok: false, reason: 'Not signed in or offline' };
    }
    var results = {};
    // Order matters: passengers MUST upload first because carpool entries
    // reference passenger UUIDs, which may have been freshly minted during
    // the passengers upload (legacy IDs were not UUIDs).
    var order = ['passengers', 'carpool'];
    // Append any other adapters that get added later (settings, etc.)
    for(var key in api){
      if(api.hasOwnProperty(key) && order.indexOf(key) === -1 &&
         api[key] && typeof api[key].uploadLocal === 'function'){
        order.push(key);
      }
    }
    for(var idx=0; idx<order.length; idx++){
      var name = order[idx];
      var adapter = api[name];
      if(adapter && typeof adapter.uploadLocal === 'function'){
        try {
          results[name] = await adapter.uploadLocal();
        } catch(e){
          console.warn('[cloud-sync] uploadLocal failed for', name, e);
          results[name] = { ok: false, error: String(e && e.message || e) };
        }
      }
    }
    _lsSet(LAST_SYNC_KEY, new Date().toISOString());
    _notifyStatus();
    return { ok: true, results: results };
  };

  // --- ONLINE / OFFLINE listeners ------------------------------------
  window.addEventListener('online',  function(){
    _notifyStatus();
    if(api.isReady()) api.flush();
  });
  window.addEventListener('offline', function(){ _notifyStatus(); });

  // --- expose ---------------------------------------------------------
  window.cloudSync = api;

  // --- AUTO-PULL ON LOGIN --------------------------------------------
  // When the auth state flips to signed-in, do a pull + flush.
  if(typeof window.sbOnAuthChange === 'function'){
    window.sbOnAuthChange(function(auth){
      if(!auth || !auth.householdId) return;
      // Wait a tick for adapters to have registered themselves
      setTimeout(function(){
        api.flush();
      }, 500);
      _notifyStatus();
    });
  }

  console.log('[cloud-sync] engine ready');
})();

// =====================================================================
// PASSENGERS adapter
// =====================================================================
// localStorage shape: array of {id, name, defaultAmt, color, _deleted}
// Supabase row shape: {id, household_id, name, default_amt, color, deleted_at}
// =====================================================================
(function(){
  'use strict';
  if(!window.cloudSync) return;

  var PASSENGERS_KEY = 'yb_passengers_v1';

  function _lsGet(k){ return cloudLsGet(k); }
  function _lsSet(k, v){ return cloudLsSet(k, v); }

  function _isUuid(s){
    return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  }
  function _newUuid(){
    if(window.crypto && typeof window.crypto.randomUUID === 'function'){
      return window.crypto.randomUUID();
    }
    // RFC4122 v4 fallback
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function _toRow(p, householdId){
    return {
      id:           p.id,
      household_id: householdId,
      name:         p.name,
      default_amt:  typeof p.defaultAmt === 'number' ? p.defaultAmt : 52,
      color:        p.color || '#c8f230',
      deleted_at:   p._deleted ? new Date().toISOString() : null,
      updated_at:   new Date().toISOString()
    };
  }

  function _fromRow(r){
    return {
      id:         r.id,
      name:       r.name,
      defaultAmt: typeof r.default_amt === 'string' ? parseFloat(r.default_amt) : (r.default_amt || 52),
      color:      r.color || '#c8f230',
      _deleted:   !!r.deleted_at
    };
  }

  function _readLocal(){
    try {
      var raw = _lsGet(PASSENGERS_KEY);
      if(!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch(e){ return []; }
  }

  function _writeLocal(list){
    _lsSet(PASSENGERS_KEY, JSON.stringify(list || []));
    // Keep in-memory globals in sync if loadPassengers() exists
    try {
      if(typeof window.loadPassengers === 'function') window.loadPassengers();
      if(typeof window.renderPassengersList === 'function') window.renderPassengersList();
      if(typeof window.renderCarpool === 'function') window.renderCarpool();
    } catch(e){}
  }

  var adapter = {};

  // Apply a queued op against Supabase
  adapter._apply = async function(op, payload){
    var hh = window.sbHouseholdId();
    if(op === 'upsert'){
      // If the local id isn't a UUID (legacy data), generate one and
      // patch the localStorage record so the carpool-side resolution
      // by-name → id continues to work.
      if(!_isUuid(payload.id)){
        var newId = _newUuid();
        var list = _readLocal();
        var found = false;
        for(var i=0;i<list.length;i++){
          if(list[i].id === payload.id){ list[i].id = newId; found = true; break; }
        }
        if(found) _writeLocal(list);
        payload = Object.assign({}, payload, { id: newId });
      }
      var row = _toRow(payload, hh);
      var res = await window.sb.from('passengers').upsert(row, { onConflict: 'id' });
      if(res.error) throw res.error;
    } else if(op === 'delete'){
      var res2 = await window.sb.from('passengers')
        .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', payload.id);
      if(res2.error) throw res2.error;
    } else {
      throw new Error('Unknown op: ' + op);
    }
  };

  // Pull all passengers from cloud → localStorage
  adapter.pull = async function(){
    var res = await window.sb.from('passengers').select('*');
    if(res.error) throw res.error;
    var list = (res.data || []).map(_fromRow);
    _writeLocal(list);
    return { ok: true, count: list.length };
  };

  // Push entire local passengers list to cloud (one-time migration).
  // Any passenger whose `id` is not a valid UUID gets a fresh UUID
  // generated; the localStorage record is rewritten with the new id so
  // subsequent writes (and the carpool entries that reference this
  // passenger by name) line up. Returns a map of oldId → newId so
  // carpool uploadLocal can use it too if needed.
  adapter.uploadLocal = async function(){
    var hh = window.sbHouseholdId();
    var list = _readLocal();
    if(!list.length) return { ok: true, count: 0, note: 'empty' };
    var idMap = {};
    var migrated = 0;
    var rewritten = list.map(function(p){
      if(!_isUuid(p.id)){
        var oldId = p.id;
        var newId = _newUuid();
        idMap[oldId] = newId;
        migrated++;
        return Object.assign({}, p, { id: newId });
      }
      return p;
    });
    if(migrated > 0){
      // Persist the rewritten list back to localStorage so the in-memory
      // PASSENGER_DATA and any future carpool resolutions use the new ids.
      _writeLocal(rewritten);
    }
    var rows = rewritten.map(function(p){ return _toRow(p, hh); });
    var res = await window.sb.from('passengers').upsert(rows, { onConflict: 'id' });
    if(res.error) throw res.error;
    return { ok: true, count: rows.length, migrated: migrated };
  };

  // Public helpers used by passengers.js (in Phase B2)
  adapter.upsert = function(passenger){
    window.cloudSync.queue('passengers', 'upsert', passenger);
  };
  adapter.remove = function(passenger){
    window.cloudSync.queue('passengers', 'delete', { id: passenger.id });
  };

  window.cloudSync.passengers = adapter;
})();

// =====================================================================
// CARPOOL adapter
// =====================================================================
// localStorage shape:  cpData = { "2026-05": { "2026-05-06": { "David": {amt, paid}, ... } } }
// Supabase row shape: { id, household_id, entry_date, passenger_id, amt, paid, notes, updated_at }
//
// Note: The local format keys entries by passenger NAME, but Supabase
// requires a passenger UUID. We resolve names → UUIDs via the local
// PASSENGER_DATA cache. Passengers must be uploaded BEFORE carpool entries.
// =====================================================================
(function(){
  'use strict';
  if(!window.cloudSync) return;

  var CPK = 'yasin_carpool_v4';

  function _lsGet(k){ return cloudLsGet(k); }
  function _lsSet(k, v){ return cloudLsSet(k, v); }

  function _readLocal(){
    try {
      var raw = _lsGet(CPK);
      if(!raw) return {};
      var obj = JSON.parse(raw);
      return (obj && typeof obj === 'object') ? obj : {};
    } catch(e){ return {}; }
  }
  function _writeLocal(obj){
    _lsSet(CPK, JSON.stringify(obj || {}));
    try {
      if(typeof window.loadCP === 'function') window.loadCP();
      if(typeof window.renderCarpool === 'function') window.renderCarpool();
    } catch(e){}
  }

  function _passengerIdByName(name){
    var list = window.PASSENGER_DATA || [];
    for(var i=0;i<list.length;i++){
      if(list[i].name === name) return list[i].id;
    }
    return null;
  }
  function _passengerNameById(id){
    var list = window.PASSENGER_DATA || [];
    for(var i=0;i<list.length;i++){
      if(list[i].id === id) return list[i].name;
    }
    return null;
  }

  function _flatten(cpData, householdId){
    // Convert nested {month: {date: {name: {amt, paid}}}} into flat rows
    var rows = [];
    var nowIso = new Date().toISOString();
    for(var monthKey in cpData){
      if(!cpData.hasOwnProperty(monthKey)) continue;
      var days = cpData[monthKey] || {};
      for(var dateKey in days){
        if(!days.hasOwnProperty(dateKey)) continue;
        var dayObj = days[dateKey] || {};
        for(var name in dayObj){
          if(!dayObj.hasOwnProperty(name)) continue;
          var entry = dayObj[name] || {};
          var pid = _passengerIdByName(name);
          if(!pid) continue; // skip orphaned entries
          var amt = entry.amt;
          if(typeof amt === 'string') amt = parseFloat(amt) || 0;
          rows.push({
            household_id: householdId,
            entry_date:   dateKey,
            passenger_id: pid,
            amt:          amt || 0,
            paid:         !!entry.paid,
            notes:        entry.notes || null,
            updated_at:   nowIso
          });
        }
      }
    }
    return rows;
  }

  function _unflatten(rows){
    // Convert flat rows back into nested {month: {date: {name: {amt, paid}}}}
    var cp = {};
    for(var i=0;i<rows.length;i++){
      var r = rows[i];
      var date = r.entry_date;
      if(!date) continue;
      var monthKey = date.substring(0, 7); // "YYYY-MM"
      var name = _passengerNameById(r.passenger_id);
      if(!name) continue;
      if(!cp[monthKey]) cp[monthKey] = {};
      if(!cp[monthKey][date]) cp[monthKey][date] = {};
      cp[monthKey][date][name] = {
        amt:  typeof r.amt === 'string' ? parseFloat(r.amt) : (r.amt || 0),
        paid: !!r.paid
      };
      if(r.notes) cp[monthKey][date][name].notes = r.notes;
    }
    return cp;
  }

  var adapter = {};

  adapter._apply = async function(op, payload){
    var hh = window.sbHouseholdId();
    if(op === 'upsert'){
      // payload: { date: 'YYYY-MM-DD', passengerName, amt, paid, notes }
      var pid = _passengerIdByName(payload.passengerName);
      if(!pid) throw new Error('Passenger not found: ' + payload.passengerName);
      var row = {
        household_id: hh,
        entry_date:   payload.date,
        passenger_id: pid,
        amt:          payload.amt || 0,
        paid:         !!payload.paid,
        notes:        payload.notes || null,
        updated_at:   new Date().toISOString()
      };
      var res = await window.sb.from('carpool_entries')
        .upsert(row, { onConflict: 'household_id,entry_date,passenger_id' });
      if(res.error) throw res.error;
    } else if(op === 'delete'){
      var pid2 = _passengerIdByName(payload.passengerName);
      if(!pid2) return; // nothing to delete
      var res2 = await window.sb.from('carpool_entries')
        .delete()
        .eq('household_id', hh)
        .eq('entry_date', payload.date)
        .eq('passenger_id', pid2);
      if(res2.error) throw res2.error;
    } else {
      throw new Error('Unknown op: ' + op);
    }
  };

  adapter.pull = async function(){
    var res = await window.sb.from('carpool_entries').select('*');
    if(res.error) throw res.error;
    var cp = _unflatten(res.data || []);
    _writeLocal(cp);
    return { ok: true, count: (res.data || []).length };
  };

  adapter.uploadLocal = async function(){
    var hh = window.sbHouseholdId();
    var cp = _readLocal();
    var rows = _flatten(cp, hh);
    if(!rows.length) return { ok: true, count: 0, note: 'empty' };
    // Batch in chunks of 500 to avoid hitting payload limits
    var chunkSize = 500, total = 0;
    for(var i=0;i<rows.length;i+=chunkSize){
      var chunk = rows.slice(i, i+chunkSize);
      var res = await window.sb.from('carpool_entries')
        .upsert(chunk, { onConflict: 'household_id,entry_date,passenger_id' });
      if(res.error) throw res.error;
      total += chunk.length;
    }
    return { ok: true, count: total };
  };

  // Public helpers (used by carpool.js in Phase B2)
  adapter.upsert = function(date, passengerName, amt, paid, notes){
    window.cloudSync.queue('carpool', 'upsert', {
      date: date, passengerName: passengerName, amt: amt, paid: paid, notes: notes
    });
  };
  adapter.remove = function(date, passengerName){
    window.cloudSync.queue('carpool', 'delete', { date: date, passengerName: passengerName });
  };

  window.cloudSync.carpool = adapter;
})();

// =====================================================================
// SETTINGS adapter — Phase H (May 2026)
// =====================================================================
// Syncs lightweight app preferences across devices via a singleton row
// in the app_settings table per household.
//
// Local keys synced:
//   yasin_theme_light       → "1" / "0"           (theme.light)
//   yb_priority_rules_v1    → JSON array          (priorityRules)
//   yb_show_maint_card_v1   → "1" / "0"           (showMaintCard)
//
// Supabase row:
//   { household_id, key: 'app_prefs', data: <JSON>, updated_at }
//
// Conflict strategy: last-write-wins on the whole blob. We don't try to
// merge per-key because the data is small and per-key conflicts are rare
// in a two-device household. Future refinement: per-key updated_at if it
// becomes a problem.

(function(){
  var KEY_NAME = 'app_prefs';

  // Per-setting local keys + how to parse/serialize each one.
  // Adding a new pref later: add a row here, and uploadLocal/applyToLocal pick it up automatically.
  var PREFS = [
    { id: 'theme.light',     localKey: 'yasin_theme_light',      parse: function(v){ return v === '1'; },         dump: function(v){ return v ? '1' : '0'; } },
    { id: 'showMaintCard',   localKey: 'yb_show_maint_card_v1',  parse: function(v){ return v === '1'; },         dump: function(v){ return v ? '1' : '0'; } },
    { id: 'priorityRules',   localKey: 'yb_priority_rules_v1',
      parse: function(v){ try { return v ? JSON.parse(v) : null; } catch(e){ return null; } },
      dump:  function(v){ return v === null || v === undefined ? null : JSON.stringify(v); } }
  ];

  function _localGet(k){ return cloudLsGet(k); }
  function _localSet(k, v){
    if(v === null || v === undefined) cloudLsRemove(k);
    else cloudLsSet(k, v);
  }

  // Build the data blob from current localStorage state
  function _collectLocal(){
    var blob = {};
    for(var i=0;i<PREFS.length;i++){
      var p = PREFS[i];
      var raw = _localGet(p.localKey);
      // Only include keys that are actually set locally — avoids blowing
      // away another device's value with a default we never explicitly chose.
      if(raw !== null && raw !== undefined){
        blob[p.id] = p.parse(raw);
      }
    }
    return blob;
  }

  // Write a blob back into localStorage, then refresh UI bits that depend
  // on these prefs (theme class on <html>, maint-card visibility, etc.)
  function _applyToLocal(blob){
    if(!blob || typeof blob !== 'object') return;
    for(var i=0;i<PREFS.length;i++){
      var p = PREFS[i];
      if(p.id in blob){
        var serialised = p.dump(blob[p.id]);
        _localSet(p.localKey, serialised);
      }
    }
    // Re-apply runtime side-effects of these prefs. Each is safe to call
    // even if the corresponding DOM/function isn't ready yet.
    try {
      var isLight = _localGet('yasin_theme_light') === '1';
      document.documentElement.classList.toggle('light', isLight);
      var lbl = document.getElementById('themeLabel');
      if(lbl) lbl.textContent = isLight ? 'Dark Mode' : 'Light Mode';
    } catch(e){}
    try { if(typeof window.applyMaintCardVisibility === 'function') window.applyMaintCardVisibility(); } catch(e){}
    try { if(typeof window.renderPriorityRulesList === 'function') window.renderPriorityRulesList(); } catch(e){}
  }

  var adapter = {};

  adapter._apply = async function(op, payload){
    var hh = window.sbHouseholdId();
    if(op === 'upsert'){
      var row = {
        household_id: hh,
        key: KEY_NAME,
        data: payload && payload.data ? payload.data : _collectLocal(),
        updated_at: new Date().toISOString()
      };
      var res = await window.sb.from('app_settings')
        .upsert(row, { onConflict: 'household_id,key' });
      if(res.error) throw res.error;
    } else {
      throw new Error('Unknown op: ' + op);
    }
  };

  adapter.pull = async function(){
    var hh = window.sbHouseholdId();
    var res = await window.sb.from('app_settings')
      .select('data, updated_at')
      .eq('household_id', hh)
      .eq('key', KEY_NAME)
      .maybeSingle();
    if(res.error) throw res.error;
    if(!res.data){
      return { ok: true, applied: 0, note: 'no remote settings yet' };
    }
    _applyToLocal(res.data.data || {});
    var count = 0;
    if(res.data.data) count = Object.keys(res.data.data).length;
    return { ok: true, applied: count };
  };

  adapter.uploadLocal = async function(){
    var blob = _collectLocal();
    if(Object.keys(blob).length === 0){
      return { ok: true, count: 0, note: 'no local settings to upload' };
    }
    var hh = window.sbHouseholdId();
    var row = {
      household_id: hh,
      key: KEY_NAME,
      data: blob,
      updated_at: new Date().toISOString()
    };
    var res = await window.sb.from('app_settings')
      .upsert(row, { onConflict: 'household_id,key' });
    if(res.error) throw res.error;
    return { ok: true, count: Object.keys(blob).length };
  };

  // Public helper — called by toggleTheme, toggleMaintCardVisibility, and
  // the priority rule editor whenever a setting changes locally. Queues a
  // single upsert that will sync the whole blob next time the queue flushes.
  adapter.push = function(){
    window.cloudSync.queue('settings', 'upsert', { data: _collectLocal() });
  };

  window.cloudSync.settings = adapter;
})();

// =====================================================================
// BORROWS adapter — Phase D (May 2026)
// =====================================================================
// localStorage shape:
//   borrowData = { "Lezaun": [ {id, type, amount, date, note, account, bank, paid, cfId}, ... ] }
//
// Supabase table borrow_entries: one row per borrow/repay event.
// person_name carries the passenger name (matches the localStorage key);
// passenger_id is set when a passenger row with that name exists.
// Soft delete via deleted_at so undo works after a sync.
(function(){
  var BORROW_KEY = 'yasin_borrows_v1';

  function _readLocal(){
    try { return JSON.parse(cloudLsGet(BORROW_KEY) || '{}') || {}; }
    catch(e){ return {}; }
  }
  function _writeLocal(obj){
    cloudLsSet(BORROW_KEY, JSON.stringify(obj || {}));
    try { if(typeof window.loadBorrows === 'function') window.loadBorrows(); } catch(e){}
    try { if(typeof window.renderCarpool === 'function') window.renderCarpool(); } catch(e){}
    try { if(typeof window.renderMoneyOwed === 'function') window.renderMoneyOwed(); } catch(e){}
  }
  function _isUuid(s){
    return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  }
  function _newUuid(){
    if(typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){
      var r = Math.random()*16|0; return (c === 'x' ? r : (r&0x3|0x8)).toString(16);
    });
  }

  // Resolve a passenger row id by name (if one exists). Best-effort — if
  // there's no matching passenger row, passenger_id stays null and the
  // entry is still valid via person_name.
  function _passengerIdForName(name){
    try {
      var raw = cloudLsGet('yasin_passengers_v1');
      if(!raw) return null;
      var list = JSON.parse(raw);
      var found = (list || []).find(function(p){
        return p && !p._deleted && p.name === name && _isUuid(p.id);
      });
      return found ? found.id : null;
    } catch(e){ return null; }
  }

  function _toRow(personName, entry, hh){
    return {
      id:           entry.id,
      household_id: hh,
      person_name:  personName,
      passenger_id: _passengerIdForName(personName),
      type:         entry.type === 'repay' ? 'repay' : 'borrow',
      amount:       Number(entry.amount) || 0,
      entry_date:   entry.date,
      note:         entry.note || null,
      account:      entry.account || null,
      bank:         entry.bank || null,
      paid:         !!entry.paid,
      cf_id:        entry.cfId || null,
      deleted_at:   entry._deleted ? new Date().toISOString() : null,
      updated_at:   new Date().toISOString()
    };
  }

  function _fromRow(row){
    var entry = {
      id:     row.id,
      type:   row.type,
      amount: Number(row.amount) || 0,
      date:   row.entry_date,
      paid:   !!row.paid
    };
    if(row.note)    entry.note = row.note;
    if(row.account) entry.account = row.account;
    if(row.bank)    entry.bank = row.bank;
    if(row.cf_id)   entry.cfId = row.cf_id;
    if(row.deleted_at) entry._deleted = true;
    return { personName: row.person_name, entry: entry };
  }

  var adapter = {};

  adapter._apply = async function(op, payload){
    var hh = window.sbHouseholdId();
    if(op === 'upsert'){
      // Ensure the id is a UUID — legacy local data used short string ids.
      if(!_isUuid(payload.entry.id)){
        var newId = _newUuid();
        var data = _readLocal();
        var list = data[payload.personName] || [];
        for(var i=0;i<list.length;i++){
          if(list[i].id === payload.entry.id){ list[i].id = newId; break; }
        }
        data[payload.personName] = list;
        _writeLocal(data);
        payload = Object.assign({}, payload, { entry: Object.assign({}, payload.entry, { id: newId }) });
      }
      var row = _toRow(payload.personName, payload.entry, hh);
      var res = await window.sb.from('borrow_entries').upsert(row, { onConflict: 'id' });
      if(res.error) throw res.error;
    } else if(op === 'delete'){
      var res2 = await window.sb.from('borrow_entries')
        .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', payload.id);
      if(res2.error) throw res2.error;
    } else {
      throw new Error('Unknown op: ' + op);
    }
  };

  adapter.pull = async function(){
    var res = await window.sb.from('borrow_entries').select('*');
    if(res.error) throw res.error;
    var grouped = {};
    (res.data || []).forEach(function(row){
      var u = _fromRow(row);
      if(!grouped[u.personName]) grouped[u.personName] = [];
      grouped[u.personName].push(u.entry);
    });
    _writeLocal(grouped);
    return { ok: true, count: (res.data || []).length };
  };

  adapter.uploadLocal = async function(){
    var hh = window.sbHouseholdId();
    var data = _readLocal();
    var names = Object.keys(data);
    if(!names.length) return { ok: true, count: 0, note: 'empty' };
    var idMap = {};
    var migrated = 0;
    names.forEach(function(name){
      var list = data[name] || [];
      list.forEach(function(entry){
        if(!_isUuid(entry.id)){
          var oldId = entry.id;
          entry.id = _newUuid();
          idMap[oldId] = entry.id;
          migrated++;
        }
      });
    });
    if(migrated > 0) _writeLocal(data);
    var rows = [];
    names.forEach(function(name){
      (data[name] || []).forEach(function(entry){
        rows.push(_toRow(name, entry, hh));
      });
    });
    if(!rows.length) return { ok: true, count: 0 };
    // Supabase upsert has a payload-size limit; chunk if huge. 500 is generous.
    var CHUNK = 500;
    for(var i=0;i<rows.length;i+=CHUNK){
      var slice = rows.slice(i, i+CHUNK);
      var res = await window.sb.from('borrow_entries').upsert(slice, { onConflict: 'id' });
      if(res.error) throw res.error;
    }
    return { ok: true, count: rows.length, migrated: migrated };
  };

  // Public helpers used by borrow.js
  adapter.upsert = function(personName, entry){
    window.cloudSync.queue('borrows', 'upsert', { personName: personName, entry: entry });
  };
  adapter.remove = function(entryId){
    window.cloudSync.queue('borrows', 'delete', { id: entryId });
  };

  window.cloudSync.borrows = adapter;
})();


// =====================================================================
// EXTERNAL BORROWS adapter — Phase D (May 2026)
// =====================================================================
// localStorage shape:
//   externalBorrows = {
//     "tariq": { name: "Tariq", entries: [ {id, type, amount, date, note, paid}, ... ] },
//     ...
//   }
//
// Two Supabase tables — external_borrowers (the person) and
// external_borrow_entries (each event). On upload we generate UUIDs and
// rewrite localStorage to keep ids stable across sessions.
(function(){
  var EXT_KEY = 'yb_external_borrows_v1';

  function _readLocal(){
    try { return JSON.parse(cloudLsGet(EXT_KEY) || '{}') || {}; }
    catch(e){ return {}; }
  }
  function _writeLocal(obj){
    cloudLsSet(EXT_KEY, JSON.stringify(obj || {}));
    try { if(typeof window.loadExternalBorrows === 'function') window.loadExternalBorrows(); } catch(e){}
    try { if(typeof window.renderMoneyOwed === 'function') window.renderMoneyOwed(); } catch(e){}
  }
  function _isUuid(s){
    return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  }
  function _newUuid(){
    if(typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){
      var r = Math.random()*16|0; return (c === 'x' ? r : (r&0x3|0x8)).toString(16);
    });
  }

  // Ensure every borrower has a `borrowerId` UUID in localStorage. Without
  // this we can't reference them from external_borrow_entries rows. Returns
  // a count of newly minted ids.
  function _ensureBorrowerIds(data){
    var minted = 0;
    Object.keys(data).forEach(function(key){
      var b = data[key];
      if(!b || typeof b !== 'object') return;
      if(!_isUuid(b.borrowerId)){
        b.borrowerId = _newUuid();
        minted++;
      }
      (b.entries || []).forEach(function(e){
        if(!_isUuid(e.id)){
          e.id = _newUuid();
          minted++;
        }
      });
    });
    return minted;
  }

  var adapter = {};

  adapter._apply = async function(op, payload){
    var hh = window.sbHouseholdId();
    if(op === 'upsertBorrower'){
      var row = {
        id: payload.borrowerId,
        household_id: hh,
        key: payload.key,
        display_name: payload.displayName || payload.key,
        deleted_at: payload._deleted ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      };
      var res = await window.sb.from('external_borrowers')
        .upsert(row, { onConflict: 'id' });
      if(res.error) throw res.error;
    } else if(op === 'upsertEntry'){
      var entryRow = {
        id:           payload.entry.id,
        household_id: hh,
        borrower_id:  payload.borrowerId,
        type:         payload.entry.type === 'repay' ? 'repay' : 'borrow',
        amount:       Number(payload.entry.amount) || 0,
        entry_date:   payload.entry.date,
        note:         payload.entry.note || null,
        paid:         !!payload.entry.paid,
        deleted_at:   payload.entry._deleted ? new Date().toISOString() : null,
        updated_at:   new Date().toISOString()
      };
      var res2 = await window.sb.from('external_borrow_entries')
        .upsert(entryRow, { onConflict: 'id' });
      if(res2.error) throw res2.error;
    } else if(op === 'deleteEntry'){
      var res3 = await window.sb.from('external_borrow_entries')
        .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', payload.id);
      if(res3.error) throw res3.error;
    } else if(op === 'deleteBorrower'){
      var res4 = await window.sb.from('external_borrowers')
        .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', payload.borrowerId);
      if(res4.error) throw res4.error;
    } else {
      throw new Error('Unknown op: ' + op);
    }
  };

  adapter.pull = async function(){
    var hh = window.sbHouseholdId();
    var br = await window.sb.from('external_borrowers').select('*').eq('household_id', hh);
    if(br.error) throw br.error;
    var en = await window.sb.from('external_borrow_entries').select('*').eq('household_id', hh);
    if(en.error) throw en.error;
    var data = {};
    (br.data || []).forEach(function(row){
      data[row.key] = {
        borrowerId:  row.id,
        name:        row.display_name,
        entries:     [],
        _deleted:    !!row.deleted_at
      };
    });
    (en.data || []).forEach(function(row){
      // Find which key this entry belongs to
      var ownerKey = null;
      Object.keys(data).forEach(function(k){
        if(data[k].borrowerId === row.borrower_id) ownerKey = k;
      });
      if(!ownerKey) return;
      var entry = {
        id:     row.id,
        type:   row.type,
        amount: Number(row.amount) || 0,
        date:   row.entry_date,
        paid:   !!row.paid
      };
      if(row.note) entry.note = row.note;
      if(row.deleted_at) entry._deleted = true;
      data[ownerKey].entries.push(entry);
    });
    _writeLocal(data);
    return { ok: true, borrowers: (br.data||[]).length, entries: (en.data||[]).length };
  };

  adapter.uploadLocal = async function(){
    var hh = window.sbHouseholdId();
    var data = _readLocal();
    var keys = Object.keys(data);
    if(!keys.length) return { ok: true, count: 0, note: 'empty' };
    var minted = _ensureBorrowerIds(data);
    if(minted > 0) _writeLocal(data);
    // Step 1: upload borrowers
    var borrowerRows = keys.map(function(k){
      var b = data[k];
      return {
        id: b.borrowerId,
        household_id: hh,
        key: k,
        display_name: b.name || k,
        deleted_at: b._deleted ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      };
    });
    var res1 = await window.sb.from('external_borrowers')
      .upsert(borrowerRows, { onConflict: 'id' });
    if(res1.error) throw res1.error;
    // Step 2: upload entries
    var entryRows = [];
    keys.forEach(function(k){
      var b = data[k];
      (b.entries || []).forEach(function(e){
        entryRows.push({
          id:           e.id,
          household_id: hh,
          borrower_id:  b.borrowerId,
          type:         e.type === 'repay' ? 'repay' : 'borrow',
          amount:       Number(e.amount) || 0,
          entry_date:   e.date,
          note:         e.note || null,
          paid:         !!e.paid,
          deleted_at:   e._deleted ? new Date().toISOString() : null,
          updated_at:   new Date().toISOString()
        });
      });
    });
    if(entryRows.length){
      var CHUNK = 500;
      for(var i=0;i<entryRows.length;i+=CHUNK){
        var slice = entryRows.slice(i, i+CHUNK);
        var res2 = await window.sb.from('external_borrow_entries').upsert(slice, { onConflict: 'id' });
        if(res2.error) throw res2.error;
      }
    }
    return { ok: true, borrowers: borrowerRows.length, entries: entryRows.length, minted: minted };
  };

  // Public helpers — called by borrow.js when user adds/edits/deletes
  adapter.upsertBorrower = function(key, displayName, borrowerId, isDeleted){
    window.cloudSync.queue('externalBorrows', 'upsertBorrower', {
      key: key, displayName: displayName, borrowerId: borrowerId, _deleted: !!isDeleted
    });
  };
  adapter.upsertEntry = function(borrowerId, entry){
    window.cloudSync.queue('externalBorrows', 'upsertEntry', {
      borrowerId: borrowerId, entry: entry
    });
  };
  adapter.removeEntry = function(entryId){
    window.cloudSync.queue('externalBorrows', 'deleteEntry', { id: entryId });
  };
  adapter.removeBorrower = function(borrowerId){
    window.cloudSync.queue('externalBorrows', 'deleteBorrower', { borrowerId: borrowerId });
  };

  window.cloudSync.externalBorrows = adapter;
})();

// =====================================================================
// SCHOOL adapter — Phase G Part 1 (May 2026)
// =====================================================================
// Three Supabase tables behind one adapter:
//   school_events          — webinars/assignments/quizzes/exams
//   school_results         — year/period containers (Year 1, Year 2, ...)
//   school_result_subjects — subjects nested inside each result period
//
// localStorage:
//   yasin_school_events_v1  — array of {id,type,subject,title,date,time}
//   yasin_school_done_v1    — array of event ids that are marked done
//   yasin_school_results_v1 — array of {year,period,subjects:[...]}
//
// "done" lives in a separate localStorage array but maps onto a boolean
// column on school_events. The adapter merges them on the way up and
// splits them on the way down.
(function(){
  var EVENTS_KEY  = 'yasin_school_events_v1';
  var DONE_KEY    = 'yasin_school_done_v1';
  var RESULTS_KEY = 'yasin_school_results_v1';

  function _read(k, fallback){
    try { var v = JSON.parse(cloudLsGet(k) || 'null'); return v == null ? fallback : v; }
    catch(e){ return fallback; }
  }
  function _write(k, v){ cloudLsSet(k, JSON.stringify(v)); }
  function _isUuid(s){
    return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  }
  function _newUuid(){
    if(typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){
      var r = Math.random()*16|0; return (c === 'x' ? r : (r&0x3|0x8)).toString(16);
    });
  }
  function _num(v){ return (v === null || v === undefined || v === '') ? null : Number(v); }

  function _refreshUI(){
    try { if(typeof window.SCHOOL_DATA !== 'undefined' && typeof window.loadSchoolEvents === 'function'){ window.SCHOOL_DATA = window.loadSchoolEvents(); } } catch(e){}
    try { if(typeof window.reloadSchoolResults === 'function') window.reloadSchoolResults(); } catch(e){}
    try { if(typeof window.renderSchool === 'function') window.renderSchool(); } catch(e){}
    try { if(typeof window.renderSchoolResults === 'function') window.renderSchoolResults(); } catch(e){}
  }

  var adapter = {};

  adapter._apply = async function(op, payload){
    var hh = window.sbHouseholdId();
    if(op === 'upsertEvent'){
      var row = {
        id:           payload.event.id,
        household_id: hh,
        type:         payload.event.type,
        subject:      payload.event.subject || null,
        title:        payload.event.title || null,
        event_date:   payload.event.date || null,
        event_time:   payload.event.time || null,
        done:         !!payload.event.done,
        deleted_at:   payload.event._deleted ? new Date().toISOString() : null,
        updated_at:   new Date().toISOString()
      };
      var r = await window.sb.from('school_events').upsert(row, { onConflict: 'id' });
      if(r.error) throw r.error;
    } else if(op === 'deleteEvent'){
      var r2 = await window.sb.from('school_events')
        .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', payload.id);
      if(r2.error) throw r2.error;
    } else if(op === 'upsertResult'){
      var rr = {
        id:           payload.result.id,
        household_id: hh,
        year_label:   payload.result.year_label,
        period:       payload.result.period || null,
        sort_order:   payload.result.sort_order || 0,
        deleted_at:   null,
        updated_at:   new Date().toISOString()
      };
      var r3 = await window.sb.from('school_results').upsert(rr, { onConflict: 'id' });
      if(r3.error) throw r3.error;
    } else if(op === 'upsertSubject'){
      var sr = {
        id:               payload.subject.id,
        household_id:     hh,
        result_id:        payload.subject.result_id,
        name:             payload.subject.name,
        code:             payload.subject.code || null,
        color:            payload.subject.color || null,
        year_pct:         _num(payload.subject.yearPct),
        exam_pct:         _num(payload.subject.examPct),
        final_pct:        _num(payload.subject.finalPct),
        result:           payload.subject.result || null,
        quiz_score:       _num(payload.subject.quizScore),
        assessment_score: _num(payload.subject.assessmentScore),
        sort_order:       payload.subject.sort_order || 0,
        deleted_at:       null,
        updated_at:       new Date().toISOString()
      };
      var r4 = await window.sb.from('school_result_subjects').upsert(sr, { onConflict: 'id' });
      if(r4.error) throw r4.error;
    } else {
      throw new Error('Unknown op: ' + op);
    }
  };

  adapter.pull = async function(){
    var hh = window.sbHouseholdId();
    // ── Events ──
    var ev = await window.sb.from('school_events').select('*').eq('household_id', hh);
    if(ev.error) throw ev.error;
    var events = [];
    var done = [];
    (ev.data || []).forEach(function(row){
      if(row.deleted_at) return;
      events.push({
        id: row.id, type: row.type, subject: row.subject || '',
        title: row.title || '', date: row.event_date || '', time: row.event_time || ''
      });
      if(row.done) done.push(row.id);
    });
    _write(EVENTS_KEY, events);
    _write(DONE_KEY, done);
    // ── Results + Subjects ──
    var res = await window.sb.from('school_results').select('*').eq('household_id', hh);
    if(res.error) throw res.error;
    var subs = await window.sb.from('school_result_subjects').select('*').eq('household_id', hh);
    if(subs.error) throw subs.error;
    var resultsArr = (res.data || [])
      .filter(function(r){ return !r.deleted_at; })
      .sort(function(a,b){ return (a.sort_order||0) - (b.sort_order||0); })
      .map(function(r){
        var mySubs = (subs.data || [])
          .filter(function(s){ return s.result_id === r.id && !s.deleted_at; })
          .sort(function(a,b){ return (a.sort_order||0) - (b.sort_order||0); })
          .map(function(s){
            var resultVal = (s.result && s.result !== 'null') ? s.result : null;
            return {
              name: s.name, code: s.code || '', color: s.color || '#a78bfa',
              yearPct: s.year_pct, examPct: s.exam_pct, finalPct: s.final_pct,
              result: resultVal, quizScore: s.quiz_score, assessmentScore: s.assessment_score
            };
          });
        return { year: r.year_label, period: r.period || '', subjects: mySubs };
      });
    if(resultsArr.length) _write(RESULTS_KEY, resultsArr);
    _refreshUI();
    return { ok: true, events: events.length, results: resultsArr.length };
  };

  adapter.uploadLocal = async function(){
    var hh = window.sbHouseholdId();
    // ── Events: mint UUIDs for legacy short ids (s1, s2...) ──
    var events = _read(EVENTS_KEY, []);
    var doneArr = _read(DONE_KEY, []);
    var idMap = {};
    var migrated = 0;
    events.forEach(function(e){
      if(!_isUuid(e.id)){
        var oldId = e.id;
        e.id = _newUuid();
        idMap[oldId] = e.id;
        migrated++;
      }
    });
    // Re-map the done array to new ids
    if(migrated > 0){
      doneArr = doneArr.map(function(oldId){ return idMap[oldId] || oldId; });
      _write(EVENTS_KEY, events);
      _write(DONE_KEY, doneArr);
    }
    var doneSet = {};
    doneArr.forEach(function(id){ doneSet[id] = true; });
    var eventRows = events.map(function(e){
      return {
        id: e.id, household_id: hh, type: e.type,
        subject: e.subject || null, title: e.title || null,
        event_date: e.date || null, event_time: e.time || null,
        done: !!doneSet[e.id], deleted_at: null, updated_at: new Date().toISOString()
      };
    });
    if(eventRows.length){
      var er = await window.sb.from('school_events').upsert(eventRows, { onConflict: 'id' });
      if(er.error) throw er.error;
    }
    // ── Results + Subjects: these have no ids locally, so we mint them
    //    and persist back so future syncs are stable. ──
    var results = _read(RESULTS_KEY, []);
    var resultRows = [];
    var subjectRows = [];
    var dirty = false;
    results.forEach(function(r, ri){
      if(!_isUuid(r._id)){ r._id = _newUuid(); dirty = true; }
      resultRows.push({
        id: r._id, household_id: hh,
        year_label: r.year || ('Year ' + (ri+1)),
        period: r.period || null, sort_order: ri,
        deleted_at: null, updated_at: new Date().toISOString()
      });
      (r.subjects || []).forEach(function(s, si){
        if(!_isUuid(s._id)){ s._id = _newUuid(); dirty = true; }
        subjectRows.push({
          id: s._id, household_id: hh, result_id: r._id,
          name: s.name, code: s.code || null, color: s.color || null,
          year_pct: _num(s.yearPct), exam_pct: _num(s.examPct), final_pct: _num(s.finalPct),
          result: s.result || null,
          quiz_score: _num(s.quizScore), assessment_score: _num(s.assessmentScore),
          sort_order: si, deleted_at: null, updated_at: new Date().toISOString()
        });
      });
    });
    if(dirty) _write(RESULTS_KEY, results);
    if(resultRows.length){
      var rr = await window.sb.from('school_results').upsert(resultRows, { onConflict: 'id' });
      if(rr.error) throw rr.error;
    }
    if(subjectRows.length){
      var CHUNK = 500;
      for(var i=0;i<subjectRows.length;i+=CHUNK){
        var slice = subjectRows.slice(i, i+CHUNK);
        var sr = await window.sb.from('school_result_subjects').upsert(slice, { onConflict: 'id' });
        if(sr.error) throw sr.error;
      }
    }
    return { ok: true, events: eventRows.length, results: resultRows.length,
             subjects: subjectRows.length, migrated: migrated };
  };

  // ── Public helpers used by school.js ──
  // Events
  adapter.upsertEvent = function(eventObj, isDone){
    var e = Object.assign({}, eventObj, { done: !!isDone });
    window.cloudSync.queue('school', 'upsertEvent', { event: e });
  };
  adapter.removeEvent = function(eventId){
    window.cloudSync.queue('school', 'deleteEvent', { id: eventId });
  };
  // Results + subjects — school.js passes the local index, we resolve ids.
  // To keep school.js changes minimal, these helpers accept the in-memory
  // objects and ensure they carry a stable _id before queueing.
  adapter.syncResultsArray = function(resultsArray){
    function ensureId(o){
      if(!_isUuid(o._id)){
        o._id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID()
              : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0;return (c==='x'?r:(r&0x3|0x8)).toString(16);});
      }
      return o._id;
    }
    (resultsArray || []).forEach(function(r, ri){
      ensureId(r);
      window.cloudSync.queue('school', 'upsertResult', {
        result: { id: r._id, year_label: r.year || ('Year '+(ri+1)), period: r.period || '', sort_order: ri }
      });
      (r.subjects || []).forEach(function(s, si){
        ensureId(s);
        window.cloudSync.queue('school', 'upsertSubject', {
          subject: Object.assign({}, s, { id: s._id, result_id: r._id, sort_order: si })
        });
      });
    });
    // Persist the newly-minted _id fields so they stay stable.
    cloudLsSet(RESULTS_KEY, JSON.stringify(resultsArray));
  };

  window.cloudSync.school = adapter;
})();

// ═══════════════════════════════════════════════════════════════════════════
// PRAYER adapter — Phase G Part 2 (May 2026)
// Data shape in localStorage (PRAYER_KEY = 'yasin_prayer_v1'):
//   { '2026-05-15': { t:0, f:1, d:1, a:1, m:1, i:1, j:0 }, ... }
// Supabase table: prayer_entries (household_id, date, t,f,d,a,m,i,j)
// ═══════════════════════════════════════════════════════════════════════════
(function(){
  if(!window.cloudSync) return;

  var PRAYER_KEY = 'yasin_prayer_v1';

  function _read(){
    try { return JSON.parse(cloudLsGet(PRAYER_KEY) || '{}'); } catch(e){ return {}; }
  }
  function _write(obj){
    cloudLsSet(PRAYER_KEY, JSON.stringify(obj || {}));
    try { if(typeof window.renderPrayer === 'function') window.renderPrayer(); } catch(e){}
  }

  var adapter = {};

  // ── Upload local → Supabase ──────────────────────────────────────────────
  adapter.uploadLocal = async function(){
    var hh = window.sbHouseholdId();
    if(!hh) return { ok:false, error:'not signed in' };
    var data = _read();
    var rows = Object.keys(data).map(function(dateStr){
      var d = data[dateStr] || {};
      return {
        household_id: hh,
        date: dateStr,
        t: d.t || 0,
        f: d.f || 0,
        d: d.d || 0,
        a: d.a || 0,
        m: d.m || 0,
        i: d.i || 0,
        j: d.j || 0,
        updated_at: new Date().toISOString()
      };
    });
    if(!rows.length) return { ok:true, count:0 };
    var CHUNK = 100;
    for(var i = 0; i < rows.length; i += CHUNK){
      var slice = rows.slice(i, i + CHUNK);
      var res = await window.sb
        .from('prayer_entries')
        .upsert(slice, { onConflict: 'household_id,date' });
      if(res.error) return { ok:false, error:res.error.message };
    }
    return { ok:true, count:rows.length };
  };

  // ── Pull Supabase → local ────────────────────────────────────────────────
  adapter.pull = async function(){
    var hh = window.sbHouseholdId();
    if(!hh) return { ok:false, error:'not signed in' };
    var res = await window.sb
      .from('prayer_entries')
      .select('date,t,f,d,a,m,i,j')
      .eq('household_id', hh);
    if(res.error) return { ok:false, error:res.error.message };
    var obj = {};
    (res.data || []).forEach(function(r){
      obj[r.date] = { t:r.t||0, f:r.f||0, d:r.d||0, a:r.a||0, m:r.m||0, i:r.i||0, j:r.j||0 };
    });
    _write(obj);
    return { ok:true, count:(res.data||[]).length };
  };

  // ── Queue a single day update ────────────────────────────────────────────
  adapter.syncDay = function(dateStr){
    var data = _read();
    var d = data[dateStr] || {};
    window.cloudSync.queue('prayer', 'upsertDay', { date: dateStr, entry: d });
  };

  // ── Apply queued operations ──────────────────────────────────────────────
  adapter._apply = async function(op, payload){
    var hh = window.sbHouseholdId();
    if(!hh) return;
    if(op === 'upsertDay'){
      var d = payload.entry || {};
      await window.sb
        .from('prayer_entries')
        .upsert({
          household_id: hh,
          date: payload.date,
          t: d.t||0, f: d.f||0, d: d.d||0,
          a: d.a||0, m: d.m||0, i: d.i||0, j: d.j||0,
          updated_at: new Date().toISOString()
        }, { onConflict: 'household_id,date' });
    }
  };

  window.cloudSync.prayer = adapter;
})();

// ═══════════════════════════════════════════════════════════════════════════
// ROUTINE adapter — Phase G Part 2 (May 2026)
// Data shape in localStorage (ROUTINE_KEY = 'yasin_routine_v2'):
//   [ { id, emoji, name, category, freq, lastDone }, ... ]
// Supabase table: routine_tasks (household_id, id, emoji, name, category, freq, last_done)
// ═══════════════════════════════════════════════════════════════════════════
(function(){
  if(!window.cloudSync) return;

  var ROUTINE_KEY = 'yasin_routine_v2';

  function _read(){
    try { return JSON.parse(cloudLsGet(ROUTINE_KEY) || 'null') || []; } catch(e){ return []; }
  }
  function _write(arr){
    cloudLsSet(ROUTINE_KEY, JSON.stringify(arr || []));
    try { if(typeof window.renderRoutine === 'function') window.renderRoutine(); } catch(e){}
  }

  var adapter = {};

  // ── Upload local → Supabase ──────────────────────────────────────────────
  adapter.uploadLocal = async function(){
    var hh = window.sbHouseholdId();
    if(!hh) return { ok:false, error:'not signed in' };
    var tasks = _read();
    if(!tasks.length) return { ok:true, count:0 };
    var rows = tasks.map(function(t){
      return {
        id: t.id,
        household_id: hh,
        emoji: t.emoji || '',
        name: t.name || '',
        category: t.category || 'other',
        freq: t.freq || 'monthly',
        last_done: t.lastDone || null,
        updated_at: new Date().toISOString()
      };
    });
    var res = await window.sb
      .from('routine_tasks')
      .upsert(rows, { onConflict: 'household_id,id' });
    if(res.error) return { ok:false, error:res.error.message };
    return { ok:true, count:rows.length };
  };

  // ── Pull Supabase → local ────────────────────────────────────────────────
  adapter.pull = async function(){
    var hh = window.sbHouseholdId();
    if(!hh) return { ok:false, error:'not signed in' };
    var res = await window.sb
      .from('routine_tasks')
      .select('id,emoji,name,category,freq,last_done')
      .eq('household_id', hh);
    if(res.error) return { ok:false, error:res.error.message };
    var tasks = (res.data || []).map(function(r){
      return {
        id: r.id,
        emoji: r.emoji || '',
        name: r.name || '',
        category: r.category || 'other',
        freq: r.freq || 'monthly',
        lastDone: r.last_done || null
      };
    });
    if(tasks.length) _write(tasks);
    return { ok:true, count:tasks.length };
  };

  // ── Apply queued operations ──────────────────────────────────────────────
  adapter._apply = async function(op, payload){
    var hh = window.sbHouseholdId();
    if(!hh) return;
    if(op === 'upsertTask'){
      var t = payload.task;
      await window.sb
        .from('routine_tasks')
        .upsert({
          id: t.id,
          household_id: hh,
          emoji: t.emoji || '',
          name: t.name || '',
          category: t.category || 'other',
          freq: t.freq || 'monthly',
          last_done: t.lastDone || null,
          updated_at: new Date().toISOString()
        }, { onConflict: 'household_id,id' });
    } else if(op === 'deleteTask'){
      await window.sb
        .from('routine_tasks')
        .delete()
        .eq('household_id', hh)
        .eq('id', payload.id);
    }
  };

  // ── Queue helpers called from routine.js ─────────────────────────────────
  adapter.syncTask = function(task){
    window.cloudSync.queue('routine', 'upsertTask', { task: task });
  };
  adapter.deleteTask = function(id){
    window.cloudSync.queue('routine', 'deleteTask', { id: id });
  };

  window.cloudSync.routine = adapter;
})();
