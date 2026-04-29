// db.js — storage abstraction layer
// ---------------------------------------------------------------------------
// Stage 0 of the Supabase migration. Every module in the app uses lsSet/lsGet
// directly, scattered across ~150 call sites. That makes a future swap to an
// async network backend (Supabase) a nightmare. This file collapses all of
// that into one consistent interface so the swap eventually becomes a
// one-file change.
//
// API summary (all methods are synchronous for now — async wrappers live below
// so future Supabase code drops in without touching call sites):
//
//   db.getJSON(key, fallback)   read + JSON.parse, returns `fallback` on miss
//   db.setJSON(key, value)      JSON.stringify + write
//   db.getRaw(key, fallback)    raw string read (no parsing)
//   db.setRaw(key, value)       raw string write (no stringify)
//   db.remove(key)              delete a key
//   db.has(key)                 boolean — does the key exist?
//   db.keys()                   list all known dashboard keys
//
// All methods delegate to the existing lsSet/lsGet helpers in core.js, which
// already implement the localStorage → sessionStorage → in-memory fallback
// chain. So behaviour is identical to what the app does today; this is purely
// a structural change. NO functional behaviour changes.
//
// When we wire up Supabase (Stage 1), the bodies of these methods change.
// The 150+ call sites in the rest of the app do not.
// ---------------------------------------------------------------------------

(function(){
  'use strict';

  // Small guard: lsSet / lsGet live in core.js, which loads first. If for some
  // reason this file is included before core.js, fail loudly rather than
  // silently use a broken stub.
  function ensureCore(){
    if(typeof lsSet !== 'function' || typeof lsGet !== 'function'){
      throw new Error('db.js: lsSet/lsGet not available. Ensure core.js loads before db.js.');
    }
  }

  // ── Reads ────────────────────────────────────────────────────────────────

  function getJSON(key, fallback){
    ensureCore();
    var raw = lsGet(key);
    if(raw === null || raw === undefined || raw === '') {
      return (fallback !== undefined) ? fallback : null;
    }
    try {
      return JSON.parse(raw);
    } catch(e){
      console.warn('db.getJSON: parse error for key "'+key+'" — returning fallback', e);
      return (fallback !== undefined) ? fallback : null;
    }
  }

  function getRaw(key, fallback){
    ensureCore();
    var v = lsGet(key);
    if(v === null || v === undefined) return (fallback !== undefined) ? fallback : null;
    return v;
  }

  // ── Writes ───────────────────────────────────────────────────────────────

  function setJSON(key, value){
    ensureCore();
    try {
      lsSet(key, JSON.stringify(value));
      return true;
    } catch(e){
      console.warn('db.setJSON: failed for key "'+key+'"', e);
      return false;
    }
  }

  function setRaw(key, value){
    ensureCore();
    try {
      // Coerce to string — lsSet expects a string. null/undefined become ''.
      var s = (value === null || value === undefined) ? '' : String(value);
      lsSet(key, s);
      return true;
    } catch(e){
      console.warn('db.setRaw: failed for key "'+key+'"', e);
      return false;
    }
  }

  // ── Delete / inspect ─────────────────────────────────────────────────────

  function remove(key){
    ensureCore();
    // The existing lsSet helper in core.js writes to localStorage, sessionStorage,
    // AND an in-memory map. To fully delete, we need to clear all three layers.
    try { localStorage.removeItem(key); }   catch(e){}
    try { sessionStorage.removeItem(key); } catch(e){}
    // The in-memory map is module-private inside core.js (_lsMem), so we can't
    // reach it directly. Best we can do is set the key to null which lsGet
    // treats as absent on the next read.
    try { lsSet(key, null); } catch(e){}
    return true;
  }

  function has(key){
    ensureCore();
    var v = lsGet(key);
    return v !== null && v !== undefined && v !== '';
  }

  // List of all storage keys the dashboard uses. Kept here so a future
  // wipe / export / debug tool can iterate every namespace cleanly.
  // If you add a new module with a new storage key, register it here.
  var KNOWN_KEYS = [
    'yb_pins',
    'yasin_funds_v16',
    'yasin_carpool_v4',
    'yasin_borrows_v1',
    'yasin_sync_meta_v1',
    'yasin_prayer_v1',
    'yasin_maint_v1',
    'yasin_school_events_v1',
    'yasin_school_results_v1',
    'yasin_school_done_v1',
    'yasin_fuel_v1',
    'yb_daily_fuel',
    'yb_pricing_tank',
    'yb_pricing_private',
    'yb_passengers_v1',
    'yb_cashflow_v1',
    'yasin_maint_cards_v1',
    'yasin_cars_v1',
    'yasin_drivers_v1',
    'yasin_instalments_v1',
    'yb_external_borrows_v1',
    'yasin_routine_v2',
    'yasin_theme_light',
    'yb_biometric_registered',
    'yb_biometric_credid'
  ];

  function keys(){
    return KNOWN_KEYS.slice();
  }

  // ── Async wrappers ───────────────────────────────────────────────────────
  // These are no-ops over the sync versions today. The point is to give the
  // codebase a forward-compatible signature that already returns Promises, so
  // when Stage 1 lands, we can change ONLY these wrappers to hit Supabase
  // without touching call sites that use them.
  //
  // Use the async versions for new code where possible. Existing code can
  // continue calling getJSON/setJSON synchronously.

  function getJSONAsync(key, fallback){ return Promise.resolve(getJSON(key, fallback)); }
  function setJSONAsync(key, value)   { return Promise.resolve(setJSON(key, value));   }
  function getRawAsync(key, fallback) { return Promise.resolve(getRaw(key, fallback)); }
  function setRawAsync(key, value)    { return Promise.resolve(setRaw(key, value));    }
  function removeAsync(key)           { return Promise.resolve(remove(key));           }

  // ── Public surface ───────────────────────────────────────────────────────
  window.db = {
    getJSON: getJSON,
    setJSON: setJSON,
    getRaw:  getRaw,
    setRaw:  setRaw,
    remove:  remove,
    has:     has,
    keys:    keys,

    // Forward-compatible async surface (currently sync under the hood)
    getJSONAsync: getJSONAsync,
    setJSONAsync: setJSONAsync,
    getRawAsync:  getRawAsync,
    setRawAsync:  setRawAsync,
    removeAsync:  removeAsync,

    // Internal flag so other code can later detect which backend is active
    _backend: 'localStorage'
  };
})();
