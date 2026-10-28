// firebase-sync.js — Firebase Firestore sync layer
// Wraps lsSet/lsGet to automatically mirror localStorage to Firestore.
// All existing code continues to use lsSet/lsGet unchanged.
// This layer silently syncs to the cloud in the background.
//
// Architecture:
//   - lsSet() still writes to localStorage first (instant, offline-safe)
//   - After every lsSet(), we queue a Firestore write (debounced 2s)
//   - On app load, we check Firestore for newer data and merge it in
//   - User ID comes from Firebase Auth (Google sign-in or anonymous)
//
// Firestore structure:
//   users/{uid}/data/{storageKey}  →  { value: "...", updatedAt: timestamp }
//
// Storage keys synced (see FB_SYNC_KEYS below). Intentionally excluded:
//   PIN / lock-screen secrets, bank-feed API keys, pure UI/session state,
//   and dead Maintenance Fund keys (yasin_maint_v1 / yasin_maint_cards_v1).

'use strict';

// ── Firebase config (your project) ───────────────────────────────────────────
var FB_CONFIG = {
  apiKey:            "AIzaSyDF8tMtpqWufVg71B5LIVU4M-sEIo0mK3o",
  authDomain:        "my-dashboard-b3483.firebaseapp.com",
  projectId:         "my-dashboard-b3483",
  storageBucket:     "my-dashboard-b3483.firebasestorage.app",
  messagingSenderId: "914527720822",
  appId:             "1:914527720822:web:dc7ba9fd9ae164ee3e1657"
};

// ── Keys to sync ──────────────────────────────────────────────────────────────
var FB_SYNC_KEYS = [
  // Savings/pockets
  'yasin_funds_v16',
  // Cash Flow
  'yb_cashflow_v1',
  // Carpool
  'yasin_carpool_v4',
  // Borrowing
  'yasin_borrows_v1',
  'yb_external_borrows_v1',
  // Cars
  'yasin_cars_v1',
  // Instalments
  'yasin_instalments_v1',
  // School
  'yb_school_results_v2',
  'yasin_school_results_v1', // legacy fallback -- do not remove, see note below
  'yasin_school_results_v2', // *** the REAL current key (SCHOOL_RESULTS_V2_KEY
                              // in school.js) -- found 2026-09-02 by testing the
                              // new _auCheckLiveWriteKeysInSync logic against
                              // real constants. Same bug class as the routine
                              // key: yb_school_results_v2 has the wrong prefix,
                              // never matched what the app actually writes.
                              // School results have likely never synced.
  // Prayer
  'yasin_prayer_v1',
  // Passengers
  'yb_passengers_v1',
  // Routine
  'yb_routine_v1',
  'routine',           // legacy fallback -- do not remove, see note below
  'yasin_routine_v2',  // *** this is the CURRENT live key (ROUTINE_KEY in
                        // instalments.js) -- removing this specific one isn't
                        // cleanup, it's the exact bug fixed as v148f. A prior
                        // pass removed it as an "obvious legacy duplicate" and
                        // broke live sync again until this restore.
  // Priority Rules
  'yb_priority_rules_v1',
  'priorityRules',     // legacy fallback -- do not remove, see note below
  // Settings
  'yb_maint_settings_v1',
  'yb_push_subscription',
  // New pocket-first flows
  'yb_moneyin_v1',
  'yb_spend_v1',
  'yb_moves_v1',
  'yb_lends_v1',
  'yb_repayments_v1',
  'yb_carpool_payments_v1',
  'yb_forecast_v1',          // v150f: Reports > Forecast income/spending lines + Vault goal
  'yb_bankfeed_merchants_v1',
  'yb_alert_state_v1',
  // School extras
  'yasin_school_events_v1',
  'yasin_school_done_v1',
  // Carpool archived
  'yb_carpool_archived',
  // Manual balances
  'yb_manual_balances_v1',
  // Fuel Log -- FIX 2026-07-07: this was never in the sync list at all,
  // so fuel entries stayed 100% device-local.
  'yasin_fuel_v1',
  // FIX 2026-07-07 (broader audit) -- these four were also missing.
  // All are genuine user-entered data, not UI/device state, so they
  // should sync same as everything else above.
  'yasin_drivers_v1',        // carpool driver profiles
  'yb_daily_fuel',           // daily fuel cost estimate (used by Odin)
  'yb_recon_balances_v1',    // manually-entered FNB/Tyme reconciliation balances
  'yb_spend_merchant_cats_v1', // merchant -> category mappings for spend categorization
  // FIX 2026-09-01 (audit-report follow-up) -- confirmed live/active in
  // carpool.js, borrow.js, money.js, core.js, odin_chat.js, settings.js
  // (grepped, not assumed), real settings a user would expect on every
  // device, and simply never added when they were built.
  'yb_carpool_tariff_v1',    // carpool per-trip pricing tariff
  'yb_fuel_budget',          // monthly fuel budget setting
  'yb_pricing_tank',         // fuel price, full-tank fill-ups
  'yb_pricing_private',      // fuel price, private/personal fill-ups
  // Plan (Plan Integration Brief, 2026-09-05) -- editable rules, not
  // hardcoded balances, so this genuinely needs to sync like real data.
  'yb_plan_v1'
  // NOT added: yasin_maint_v1 / yasin_maint_cards_v1 (MAINT_KEY /
  // CUSTOM_MAINT_KEY in maint.js) -- grepped for real usage beyond their
  // own definition line and found none. These are dead keys left over
  // from the removed Maintenance Fund feature (stubbed out per the
  // existing "Stubs from Removed Features" note) -- syncing genuinely
  // dead storage would just be sync traffic for nothing.
];

// ── State ─────────────────────────────────────────────────────────────────────
var _fb = {
  app:      null,
  db:       null,
  auth:     null,
  uid:      null,
  ready:    false,
  queue:    {},    // key → debounce timer
  status:   'offline'  // 'offline' | 'syncing' | 'synced' | 'error'
};

// ── Init ──────────────────────────────────────────────────────────────────────
function fbInit(){
  // Load Firebase SDK from CDN (compat version — works with vanilla JS).
  // All three download in PARALLEL. async=false keeps execution in the
  // order they were appended (app → firestore → auth), which the compat
  // SDKs need. Previously each script waited for the one before it to
  // finish, costing two extra network round trips on every cold launch.
  var base = 'https://www.gstatic.com/firebasejs/10.12.0/';
  ['firebase-app-compat.js','firebase-firestore-compat.js','firebase-auth-compat.js'].forEach(function(name, i, all){
    var s = document.createElement('script');
    s.src = base + name;
    s.async = false;
    if(i === all.length - 1) s.onload = _fbStart;  // auth runs last, after app + firestore
    document.head.appendChild(s);
  });
}

function _fbStart(){
  try{
    // Avoid double-init
    if(firebase.apps && firebase.apps.length){
      _fb.app = firebase.apps[0];
    } else {
      _fb.app = firebase.initializeApp(FB_CONFIG);
    }
    _fb.db   = firebase.firestore();
    _fb.auth = firebase.auth();

        // Handle redirect result (called after returning from Google sign-in page)
    _fb.auth.getRedirectResult().then(function(result){
      if(result && result.user){
        console.log('[Firebase] Redirect sign-in successful:', result.user.displayName);
      }
    }).catch(function(e){
      console.warn('[Firebase] Redirect result error:', e);
      var errEl = document.getElementById('googleLoginError');
      if(errEl && e.message) errEl.textContent = 'Sign-in failed: ' + e.message;
    });

    // Google Sign-In auth state listener
    _fb.auth.onAuthStateChanged(function(user){
      if(user){
        _fb.uid   = user.uid;
        _fb.ready = true;
        _fbUpdateStatus('synced');
        _fbPatchLsSet(); // already installed at load (v150r); kept as a no-op safety
        _fbPullAll(); // pull latest from cloud on startup (uploads this device's unsynced edits too)
        // Show user name in settings if available
        var nameEl = document.getElementById('fbUserName');
        if(nameEl) nameEl.textContent = user.displayName || user.email || 'Signed in';
        console.log('[Firebase] Ready, uid:', _fb.uid, 'name:', user.displayName);
        // Google Sign-In is the only auth — go straight into the app as admin
        if(typeof loginSuccess === 'function') loginSuccess(user.displayName || user.email || 'User', 'admin');
      } else {
        // Not signed in — make sure login screen is visible
        _fbUpdateStatus('offline');
        var screen = document.getElementById('loginScreen');
        if(screen){ screen.style.display = 'flex'; screen.style.opacity = '1'; }
      }
    });
  } catch(e){
    console.warn('[Firebase] Init failed:', e);
    _fbUpdateStatus('error');
  }
}



// ── Google Sign-In ────────────────────────────────────────────────────────────
function fbSignInWithGoogle(){
  var errEl = document.getElementById('googleLoginError');
  var statusEl = document.getElementById('googleLoginStatus');
  if(errEl) errEl.textContent = '';
  if(!_fb.auth){
    if(errEl) errEl.textContent = 'Firebase not ready yet. Please wait and try again.';
    return;
  }
  var provider = new firebase.auth.GoogleAuthProvider();
  if(statusEl) statusEl.textContent = 'Opening Google sign-in...';
  _fb.auth.signInWithPopup(provider).then(function(result){
    if(statusEl) statusEl.textContent = '';
  }).catch(function(e){
    console.warn('[Firebase] Popup sign-in failed:', e.code, e.message);
    if(errEl) errEl.textContent = 'Sign-in failed: ' + e.code + ' — ' + e.message;
    if(statusEl) statusEl.textContent = '';
  });
}

// ── Sign Out ──────────────────────────────────────────────────────────────────

// Keys that intentionally never sync, verified against real usage this
// session -- NOT oversights. Checked against this list so the safety-net
// warning below only fires on genuine gaps, not on every PIN digit typed.
var FB_EXCLUDED_KEYS = [
  'yb_pins',                        // lock-screen PIN -- security, device-local by design
  'yb_bf_api_key_v1',               // bank-feed API credential -- security
  'yb_bankfeed_sessions_v1',        // in-progress import session state -- ephemeral
  'yasin_sync_meta_v1',             // sync's own bookkeeping -- syncing this would be circular
  'yb_cf_sourcetype_migration_v1',  // one-time migration flag -- per-device system state
  'yb_cfdata_premigration_backup_v1', // one-time migration backup -- per-device
  'yb_home_folder_state_v1',        // Home page UI expand/collapse state -- cosmetic
  'yb_rpt_folders_v1',              // Carpool report folder UI state -- cosmetic
  'yasin_theme_light',              // display preference, fine to differ per device
  'yasin_maint_v1',                 // dead key, removed Maintenance Fund feature
  'yasin_maint_cards_v1',           // dead key, removed Maintenance Fund feature
  'yb_audit_lastscan_v1',           // Self-Audit last-run timestamp -- per-device diagnostics
  'yb_sync_dirty_v1',               // v150r: this device's not-yet-uploaded keys -- per-device by definition
  'yb_sync_base_v1',                // v150r: what this device last knew the cloud held -- per-device
  'yb_sync_conflicts_v1'            // v150r: this device's copy saved when both devices changed the same data
];

// ── Patch lsSet to also write to Firestore ────────────────────────────────────
var _originalLsSet = null;
function _fbPatchLsSet(){
  if(_originalLsSet) return; // already patched
  _originalLsSet = window.lsSet;
  window.lsSet = function(key, val){
    var isSync = FB_SYNC_KEYS.indexOf(key) >= 0;
    // v150r: note whether this write actually CHANGES the data, before writing.
    var changed = isSync && (lsGet(key) !== String(val));
    var result = _originalLsSet(key, val);
    if(isSync){
      // Remember the key as "not in the cloud yet" until a write is confirmed.
      // This survives closing the app, so an edit made offline (or in the
      // first seconds before sign-in finishes) is uploaded next time instead
      // of being overwritten by the older cloud copy.
      if(changed) _fbMarkDirty(key);
      _fbQueueWrite(key, val);
    } else if (typeof key === 'string' &&
               (key.indexOf('yb_') === 0 || key.indexOf('yasin_') === 0) &&
               FB_EXCLUDED_KEYS.indexOf(key) < 0) {
      // Safety net: catch any future data key that was forgotten in FB_SYNC_KEYS
      console.warn('[Firebase] lsSet on non-synced key (add to FB_SYNC_KEYS?):', key);
    }
    return result;
  };
}

// ── Debounced write queue ─────────────────────────────────────────────────────
function _fbQueueWrite(key, val){
  if(!_fb.ready || !_fb.uid) return;
  if(_fb.queue[key]) clearTimeout(_fb.queue[key]);
  _fb.queue[key] = setTimeout(function(){
    delete _fb.queue[key];
    _fbWrite(key, val);
  }, 2000); // 2 second debounce — batches rapid saves
}

function _fbWrite(key, val){
  if(!_fb.ready || !_fb.uid) return;
  _fbUpdateStatus('syncing');
  _fb.db
    .collection('users').doc(_fb.uid)
    .collection('data').doc(key)
    .set({
      value:     val,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(function(){
      _fbUpdateStatus('synced');
      _fbConfirmWritten(key, val);   // v150r: cloud now holds val
    })
    .catch(function(e){
      console.warn('[Firebase] Write failed for', key, e);
      _fbUpdateStatus('error');      // key stays dirty → retried next sync
    });
}

// ══════════════════════════════════════════════════════════════════════════
// v150r — UNSYNCED-EDIT PROTECTION (audit item #16)
// ══════════════════════════════════════════════════════════════════════════
// Three small per-device records, kept in raw localStorage (never synced,
// never in backups — they describe THIS device's relationship to the cloud):
//
//   dirty  {key:1}     keys changed here that the cloud hasn't confirmed yet
//   base   {key:hash}  fingerprint of what this device last knew the cloud held
//   stash  [..]        this device's copy, saved when BOTH devices changed
//                      the same data (see conflict rule below)
//
// Startup rule for each key the cloud has, when cloud ≠ this device:
//   • not dirty                       → cloud is newer → take it (as before)
//   • dirty, cloud == base            → only THIS device changed it since the
//                                       last sync → keep ours, upload it
//   • dirty, cloud != base (or unknown)→ BOTH changed it → keep the cloud copy
//                                       (same as before, no regression), save
//                                       ours to the stash, show a notice
// Whole keys only — no field-level merging. A key is e.g. all of Cash Flow.
var _FB_DIRTY_KEY    = 'yb_sync_dirty_v1';
var _FB_BASE_KEY     = 'yb_sync_base_v1';
var _FB_CONFLICT_KEY = 'yb_sync_conflicts_v1';
var _FB_STASH_MAX    = 5;   // each entry can be ~100 KB; keep storage bounded

function _fbRawGet(k, fallback){
  try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch(e){ return fallback; }
}
function _fbRawSet(k, obj){
  try { localStorage.setItem(k, JSON.stringify(obj)); } catch(e){ /* storage full — protection degrades to old behaviour */ }
}
// Fingerprint, not security: detects "did the cloud copy change since I last saw it".
function _fbHash(str){
  str = String(str);
  var h = 5381;
  for(var i = 0; i < str.length; i++){ h = ((h << 5) + h + str.charCodeAt(i)) | 0; }
  return (h >>> 0).toString(36) + ':' + str.length;
}
function _fbMarkDirty(key){
  var d = _fbRawGet(_FB_DIRTY_KEY, {}); d[key] = 1; _fbRawSet(_FB_DIRTY_KEY, d);
}
function _fbConfirmWritten(key, val){
  var b = _fbRawGet(_FB_BASE_KEY, {}); b[key] = _fbHash(val); _fbRawSet(_FB_BASE_KEY, b);
  // Only clear dirty if nothing newer was written while this upload was in flight.
  if(lsGet(key) === String(val)){
    var d = _fbRawGet(_FB_DIRTY_KEY, {}); delete d[key]; _fbRawSet(_FB_DIRTY_KEY, d);
  }
}
function _fbStashConflict(key, localVal){
  var s = _fbRawGet(_FB_CONFLICT_KEY, []);
  s.push({ key: key, savedAt: new Date().toISOString(), value: localVal, seen: false });
  while(s.length > _FB_STASH_MAX) s.shift();
  _fbRawSet(_FB_CONFLICT_KEY, s);
}

// Small notice when this device's copy of something was set aside.
function _fbShowConflictNotice(){
  var s = _fbRawGet(_FB_CONFLICT_KEY, []);
  var unseen = s.filter(function(x){ return !x.seen; });
  if(!unseen.length || document.getElementById('fbConflictToast')) return;
  var LABELS = { yasin_funds_v16:'Savings pockets', yb_cashflow_v1:'Cash Flow', yasin_carpool_v4:'Carpool trips',
    yasin_borrows_v1:'Carpool borrows', yb_external_borrows_v1:'Money owed', yb_carpool_payments_v1:'Carpool payments',
    yb_moneyin_v1:'Money In', yb_spend_v1:'Spends', yb_moves_v1:'Moves', yasin_instalments_v1:'Instalments',
    yasin_cars_v1:'Cars', yb_recon_balances_v1:'Available Cash', yb_lends_v1:'Lends', yb_repayments_v1:'Repayments',
    yb_plan_v1:'Plan', yb_forecast_v1:'Forecast', yasin_routine_v2:'Routine', yasin_school_results_v2:'School results' };
  var names = unseen.map(function(x){ return LABELS[x.key] || x.key; }).filter(function(k, i, a){ return a.indexOf(k) === i; });
  var t = document.createElement('div');
  t.id = 'fbConflictToast';
  t.style.cssText = 'position:fixed;left:12px;right:12px;bottom:84px;z-index:10000;background:#1a0f00;border:1px solid #f2a830;border-radius:10px;padding:12px 14px;font-family:DM Mono,monospace;font-size:11px;line-height:1.5;color:#f2d8a0;box-shadow:0 6px 24px rgba(0,0,0,.5);';
  t.innerHTML = '<div style="font-weight:700;color:#f2a830;margin-bottom:4px;">⚠ Changed on two devices</div>'
    + '<div>' + escHtml(names.join(', ')) + ' changed here AND on another device before syncing. '
    + 'The cloud copy was kept. This device\'s version is saved — download it before re-entering anything.</div>'
    + '<div style="display:flex;gap:8px;margin-top:10px;">'
    + '<button id="fbConflictDl" style="flex:1;background:#f2a830;border:none;border-radius:6px;padding:8px;font-family:inherit;font-size:11px;color:#000;cursor:pointer;">Download saved copy</button>'
    + '<button id="fbConflictOk" style="background:none;border:1px solid #6a4a10;border-radius:6px;padding:8px 12px;font-family:inherit;font-size:11px;color:#f2d8a0;cursor:pointer;">Dismiss</button>'
    + '</div>';
  document.body.appendChild(t);
  document.getElementById('fbConflictDl').onclick = function(){ yb_syncConflicts(true); };
  document.getElementById('fbConflictOk').onclick = function(){
    var all = _fbRawGet(_FB_CONFLICT_KEY, []); all.forEach(function(x){ x.seen = true; }); _fbRawSet(_FB_CONFLICT_KEY, all);
    t.remove();
  };
}
// Console / button helper: list the stash, or download it as a JSON file.
window.yb_syncConflicts = function(download){
  var s = _fbRawGet(_FB_CONFLICT_KEY, []);
  if(download){
    try {
      var blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'YBDashboard_SyncConflict_' + new Date().toISOString().slice(0,16).replace(/[:T]/g,'-') + '.json';
      document.body.appendChild(a); a.click(); a.remove();
    } catch(e){ console.warn('[Firebase] conflict download failed', e); }
  }
  return s.map(function(x){ return { key: x.key, savedAt: x.savedAt, seen: x.seen, size: (x.value||'').length }; });
};

// ── Pull all keys from Firestore on startup ───────────────────────────────────
function _fbPullAll(){
  if(!_fb.ready || !_fb.uid) return;
  _fbUpdateStatus('syncing');

  _fb.db
    .collection('users').doc(_fb.uid)
    .collection('data')
    .get()
    .then(function(snapshot){
      var merged = 0;
      var dirty = _fbRawGet(_FB_DIRTY_KEY, {});
      var base  = _fbRawGet(_FB_BASE_KEY, {});
      var seen = {}, toPush = [], conflicts = 0, willReload = false;
      snapshot.forEach(function(doc){
        var key = doc.id;
        var data = doc.data();
        if(!data || !data.value) return;
        if(FB_SYNC_KEYS.indexOf(key) < 0) return;
        seen[key] = 1;
        var cloudHash = _fbHash(String(data.value));

        // v150r: this device has an edit the cloud never confirmed.
        if(dirty[key] && lsGet(key) !== String(data.value)){
          if(base[key] && base[key] === cloudHash){
            toPush.push(key);          // only we changed it → keep ours, upload
            return;
          }
          _fbStashConflict(key, lsGet(key));   // both changed it → save ours, take cloud below
          conflicts++;
        }
        delete dirty[key];
        base[key] = cloudHash;

        // v150o→v150p: compare BEFORE writing. Only a key whose cloud copy
        // is actually different from this device's copy counts as merged.
        // Before this, every key was rewritten and counted, so `merged` was
        // never 0 and the app reloaded itself on EVERY cold open, even when
        // nothing had changed anywhere (double boot + second full Firestore
        // read). Now: device already up to date → no write, no reload.
        // Device behind (e.g. laptop after phone edits) → write those keys
        // and reload once, exactly as before.
        // lsGet reads the same localStorage → sessionStorage → memory chain
        // that _originalLsSet writes to, so the comparison sees what the app sees.
        var cloudVal = String(data.value);
        if(lsGet(key) === cloudVal) return;   // identical — nothing to do (dirty/base already updated above)

        // Cloud wins for keys that differ (unchanged behaviour). Known gap,
        // audit item #16: an edit made on this device that never reached
        // the cloud (offline / before sign-in) also "differs" and gets
        // overwritten here.
        _originalLsSet(key, cloudVal);
        merged++;
      });
      // v150r: dirty keys the cloud doesn't have at all (brand-new data) → upload.
      Object.keys(dirty).forEach(function(k){
        if(!seen[k] && FB_SYNC_KEYS.indexOf(k) >= 0 && toPush.indexOf(k) < 0) toPush.push(k);
      });
      _fbRawSet(_FB_DIRTY_KEY, dirty);
      _fbRawSet(_FB_BASE_KEY, base);
      toPush.forEach(function(k){
        var v = lsGet(k);
        if(v !== null && v !== undefined) _fbWrite(k, v);
      });
      if(toPush.length) console.log('[Firebase] Uploaded', toPush.length, 'unsynced key(s) from this device:', toPush.join(', '));
      if(conflicts) console.warn('[Firebase]', conflicts, 'key(s) changed on two devices — cloud kept, local copy stashed');
      _fbUpdateStatus('synced');
      if(merged > 0){
        console.log('[Firebase] Merged', merged, 'keys from cloud');
        // Only reload once — set a flag first so the next load skips the reload
        if(!sessionStorage.getItem('_fbPullDone')){
          sessionStorage.setItem('_fbPullDone', '1');
          willReload = true;
          setTimeout(function(){ location.reload(); }, 800);
        } else {
          // Already reloaded once this session — just refresh UI without reload
          if(typeof loadFunds === 'function') loadFunds();
          if(typeof renderFunds === 'function') renderFunds();
          if(typeof renderCashFlow === 'function') renderCashFlow();
          if(typeof renderCarpool === 'function') renderCarpool();
          // v148f — renderRoutine was missing here. A background merge updates
          // loadRoutineTasks()'s underlying data, but without this the visible
          // Routine screen keeps its OLD render — including old task ids baked
          // into each checkmark's onclick. Tapping ✓ then calls markRoutineDone
          // with an id that no longer matches anything current, which silently
          // no-ops (tasks.find returns nothing, function just returns) — no
          // error, because there isn't one. This is what broke the checkmark.
          if(typeof loadRoutineTasks === 'function') loadRoutineTasks();
          if(typeof renderRoutine === 'function') renderRoutine();
        }
      }
      // v150r: shown now, or after the reload above (the stash survives it).
      if(!willReload) setTimeout(_fbShowConflictNotice, 1200);
    })
    .catch(function(e){
      console.warn('[Firebase] Pull failed:', e);
      _fbUpdateStatus('error');
    });
}

// ── Manual push — upload all local data to cloud ─────────────────────────────
function fbPushAll(silent, onDone){
  if(!_fb.ready || !_fb.uid){
    if(!silent) alert('Firebase not ready. Check your connection.');
    if(onDone) onDone();
    return;
  }
  _fbUpdateStatus('syncing');
  var promises = [];
  FB_SYNC_KEYS.forEach(function(key){
    var val = lsGet(key);
    if(val && val !== 'null'){
      var p = _fb.db
        .collection('users').doc(_fb.uid)
        .collection('data').doc(key)
        .set({
          value:     val,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        })
        .then(function(){ _fbConfirmWritten(key, val); });   // v150r
      promises.push(p);
    }
  });
  Promise.all(promises).then(function(){
    _fbUpdateStatus('synced');
    if(!silent) alert('Pushed ' + promises.length + ' data sets to Firebase ✓');
    if(onDone) onDone();
  }).catch(function(e){
    console.warn('[Firebase] Push failed:', e);
    _fbUpdateStatus('error');
    if(onDone) onDone();
  });
}

// ── Manual pull — download all cloud data to local ───────────────────────────
function fbPullAll(){
  if(!_fb.ready || !_fb.uid){
    alert('Firebase not ready. Check your connection.');
    return;
  }
  _fb.db
    .collection('users').doc(_fb.uid)
    .collection('data')
    .get()
    .then(function(snapshot){
      var pulled = 0;
      snapshot.forEach(function(doc){
        var key = doc.id;
        var data = doc.data();
        if(!data || !data.value) return;
        if(FB_SYNC_KEYS.indexOf(key) < 0) return;
        _originalLsSet(key, data.value);
        _fbConfirmWritten(key, data.value);   // v150r: manual pull = cloud wins, nothing dirty left
        pulled++;
      });
      alert('Pulled ' + pulled + ' data sets from Firebase ✓\nRefreshing...');
      setTimeout(function(){ location.reload(); }, 1000);
    })
    .catch(function(e){
      console.warn('[Firebase] Manual pull failed:', e);
      alert('Pull failed: ' + e.message);
    });
}

// ── Status indicator ──────────────────────────────────────────────────────────
function _fbUpdateStatus(status){
  _fb.status = status;
  var el = document.getElementById('fbSyncStatus');
  if(!el) return;
  var icons = { offline:'⚫', syncing:'🔄', synced:'🟢', error:'🔴' };
  var labels = { offline:'Offline', syncing:'Syncing...', synced:'Synced', error:'Sync error' };
  el.textContent = (icons[status]||'⚫') + ' ' + (labels[status]||status);
  el.style.color = status === 'synced' ? '#c8f230'
                 : status === 'syncing' ? '#f2a830'
                 : status === 'error'   ? '#f23060'
                 : '#555';
}

// ── Get current user UID (useful for debugging) ───────────────────────────────
function fbGetUid(){ return _fb.uid || 'not signed in'; }

// ── Expose globals ────────────────────────────────────────────────────────────
window.fbInit      = fbInit;
window.fbPushAll   = fbPushAll;
window.fbPullAll   = fbPullAll;
window.fbGetUid    = fbGetUid;

// v150r: track edits from the very first write, not only after sign-in.
// Before this, the lsSet wrapper was installed inside the sign-in callback,
// so anything saved in the first seconds (or while signed-out/offline) never
// reached the cloud and was later overwritten by the older cloud copy.
_fbPatchLsSet();
// Back online mid-session → run the startup sync again so any edits made
// while offline go up (and anything newer from the other device comes down).
window.addEventListener('online', function(){ if(_fb.ready && _fb.uid) _fbPullAll(); });
