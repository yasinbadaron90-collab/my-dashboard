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
  'yb_pricing_private'       // fuel price, private/personal fill-ups
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
  // Load Firebase SDK from CDN (compat version — works with vanilla JS)
  var script1 = document.createElement('script');
  script1.src = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js';
  script1.onload = function(){
    var script2 = document.createElement('script');
    script2.src = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js';
    script2.onload = function(){
      var script3 = document.createElement('script');
      script3.src = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js';
      script3.onload = _fbStart;
      document.head.appendChild(script3);
    };
    document.head.appendChild(script2);
  };
  document.head.appendChild(script1);
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
        _fbPullAll(); // pull latest from cloud on startup
        _fbPatchLsSet(); // intercept lsSet calls
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
function fbSignOut(){
  if(!_fb.auth) return;
  if(!confirm('Sign out? Your data is safely backed up in Firebase.')) return;
  _fb.auth.signOut().then(function(){
    _fb.uid   = null;
    _fb.ready = false;
    _fbUpdateStatus('offline');
    // Show login screen again
    var screen = document.getElementById('loginScreen');
    if(screen){
      screen.style.display = 'flex';
      screen.style.opacity = '1';
    }
  });
}

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
  'yasin_maint_cards_v1'            // dead key, removed Maintenance Fund feature
];

// ── Patch lsSet to also write to Firestore ────────────────────────────────────
var _originalLsSet = null;
function _fbPatchLsSet(){
  if(_originalLsSet) return; // already patched
  _originalLsSet = window.lsSet;
  window.lsSet = function(key, val){
    var result = _originalLsSet(key, val);
    if(FB_SYNC_KEYS.indexOf(key) >= 0){
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
    })
    .catch(function(e){
      console.warn('[Firebase] Write failed for', key, e);
      _fbUpdateStatus('error');
    });
}

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
      snapshot.forEach(function(doc){
        var key = doc.id;
        var data = doc.data();
        if(!data || !data.value) return;
        if(FB_SYNC_KEYS.indexOf(key) < 0) return;

        // Cloud always wins on manual pull — this is intentional
        // Auto-pull on startup still uses the cautious strategy (see _fbPullAll)
        _originalLsSet(key, data.value);
        merged++;
      });
      _fbUpdateStatus('synced');
      if(merged > 0){
        console.log('[Firebase] Merged', merged, 'keys from cloud');
        // Only reload once — set a flag first so the next load skips the reload
        if(!sessionStorage.getItem('_fbPullDone')){
          sessionStorage.setItem('_fbPullDone', '1');
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
        });
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
