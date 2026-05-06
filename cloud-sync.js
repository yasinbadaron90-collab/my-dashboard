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

(function(){
  'use strict';

  var QUEUE_KEY     = 'yb_cloud_queue_v1';
  var LAST_SYNC_KEY = 'yb_cloud_lastsync_v1';
  var statusListeners = [];

  // --- helpers --------------------------------------------------------
  function _lsGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function _lsSet(k, v){ try { localStorage.setItem(k, v); } catch(e){} }

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
    for(var name in api){
      if(!api.hasOwnProperty(name)) continue;
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
    for(var name in api){
      if(!api.hasOwnProperty(name)) continue;
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

  function _lsGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function _lsSet(k, v){ try { localStorage.setItem(k, v); } catch(e){} }

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

  // Push entire local passengers list to cloud (one-time migration)
  adapter.uploadLocal = async function(){
    var hh = window.sbHouseholdId();
    var list = _readLocal();
    if(!list.length) return { ok: true, count: 0, note: 'empty' };
    var rows = list.map(function(p){ return _toRow(p, hh); });
    var res = await window.sb.from('passengers').upsert(rows, { onConflict: 'id' });
    if(res.error) throw res.error;
    return { ok: true, count: rows.length };
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

  function _lsGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function _lsSet(k, v){ try { localStorage.setItem(k, v); } catch(e){} }

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
