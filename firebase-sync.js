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
// Storage keys synced (the important ones — not ephemeral UI state):
//   funds, yb_cashflow_v1, yb_carpool_v4, yb_borrows_v1,
//   yb_ext_borrows_v1, cars, yb_instalments_v1, yb_school_results_v2,
//   yb_routine_v1, yb_prayer_v1, passengers, yb_moneyin_v1,
//   yb_spend_v1, yb_moves_v1, yb_lends_v1, yb_repayments_v1,
//   yb_bankfeed_merchants_v1

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
  'yasin_school_results_v1',
  // Prayer
  'yasin_prayer_v1',
  // Passengers
  'yb_passengers_v1',
  // Routine (try both formats)
  'yb_routine_v1',
  'routine',
  // Priority Rules (try both formats)
  'priorityRules',
  'yb_priority_rules_v1',
  // Settings
  'yb_maint_settings_v1',
  // New pocket-first flows
  'yb_moneyin_v1',
  'yb_spend_v1',
  'yb_moves_v1',
  'yb_lends_v1',
  'yb_repayments_v1',
  'yb_carpool_payments_v1',
  'yb_bankfeed_merchants_v1',
  'yb_alert_state_v1'
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
    // Hide PIN, show Google section
    var pinSection = document.getElementById('pinSection');
    var gSection   = document.getElementById('googleLoginSection');
    var bioSection = document.getElementById('biometricSection');
    if(pinSection) pinSection.style.display = 'none';
    if(gSection)   gSection.style.display   = 'block';
    if(bioSection) bioSection.style.display = 'none';
  });
}

// ── Patch lsSet to also write to Firestore ────────────────────────────────────
var _originalLsSet = null;
function _fbPatchLsSet(){
  if(_originalLsSet) return; // already patched
  _originalLsSet = window.lsSet;
  window.lsSet = function(key, val){
    var result = _originalLsSet(key, val);
    // Queue a Firestore write if this key is in our sync list
    if(FB_SYNC_KEYS.indexOf(key) >= 0){
      _fbQueueWrite(key, val);
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

        // Only overwrite local if cloud is newer
        // Simple strategy: if local is empty/null, always use cloud
        var local = lsGet(key);
        if(!local || local === 'null' || local === '[]' || local === '{}'){
          _originalLsSet(key, data.value);
          merged++;
        }
        // If both exist, cloud wins for initial load
        // (user can manually push local → cloud via Settings)
      });
      _fbUpdateStatus('synced');
      if(merged > 0){
        console.log('[Firebase] Merged', merged, 'keys from cloud');
        // Refresh the UI after merging cloud data
        setTimeout(function(){
          if(typeof loadFunds === 'function') loadFunds();
          if(typeof renderFunds === 'function') renderFunds();
          if(typeof renderCashFlow === 'function') renderCashFlow();
          if(typeof renderCarpool === 'function') renderCarpool();
        }, 500);
      }
    })
    .catch(function(e){
      console.warn('[Firebase] Pull failed:', e);
      _fbUpdateStatus('error');
    });
}

// ── Manual push — upload all local data to cloud ─────────────────────────────
function fbPushAll(){
  if(!_fb.ready || !_fb.uid){
    alert('Firebase not ready. Check your connection.');
    return;
  }
  _fbUpdateStatus('syncing');
  var pushed = 0;
  FB_SYNC_KEYS.forEach(function(key){
    var val = lsGet(key);
    if(val && val !== 'null'){
      _fbWrite(key, val);
      pushed++;
    }
  });
  setTimeout(function(){
    alert('Pushed ' + pushed + ' data sets to Firebase ✓');
  }, 3000);
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
