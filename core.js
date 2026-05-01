// Core: storage, keys, auth, PIN, biometric, launch menu, drawer, theme

/* My Dashboard V34 — Application Logic */
/* Auto-extracted from single-file HTML */

// ── Robust storage: tries localStorage → sessionStorage → memory ──
// MUST be defined first — used by PIN system and everything else.
//
// Returns true if the write succeeded to a persistent layer (localStorage
// or sessionStorage), false if it only made it to in-memory. Callers that
// care about durability can check the return value, but most don't need to —
// lsSet itself surfaces failures via showStorageError().
const _lsMem = {};
const _lsState = {
  // Throttle so we don't spam the user with toasts when every save is failing.
  lastQuotaWarnAt: 0,
  lastGenericWarnAt: 0,
  // Track whether the most recent attempt landed in a persistent store. Used
  // by callers like lsUsage() to surface a subtle "memory only" indicator.
  lastWriteWasPersistent: true
};
const STORAGE_WARN_THROTTLE_MS = 60 * 1000; // 1 minute between toasts

function lsSet(key, val){
  _lsMem[key] = val;
  // Try localStorage first
  try {
    localStorage.setItem(key, val);
    _lsState.lastWriteWasPersistent = true;
    return true;
  } catch(e){
    // Quota exceeded is the most likely cause — different browsers throw
    // slightly different things, so check by name and code.
    if(_isQuotaError(e)){
      _onStorageQuotaError(key, val);
    } else {
      _onStorageGenericError(key, e);
    }
  }
  // Fall back to sessionStorage (cleared when tab closes — better than nothing)
  try {
    sessionStorage.setItem(key, val);
    _lsState.lastWriteWasPersistent = true;
    return true;
  } catch(e){ /* same quota likely applies; in-memory is the last resort */ }

  // In-memory only — survives until the page is reloaded or closed.
  _lsState.lastWriteWasPersistent = false;
  return false;
}

function lsGet(key, fallback){
  try{ const v = localStorage.getItem(key); if(v !== null) return v; } catch(e){}
  try{ const v = sessionStorage.getItem(key); if(v !== null) return v; } catch(e){}
  return (_lsMem[key] !== undefined) ? _lsMem[key] : (fallback || null);
}

// ── Error classification ────────────────────────────────────────────────
function _isQuotaError(e){
  if(!e) return false;
  // Standard name (Chrome, Firefox, Safari)
  if(e.name === 'QuotaExceededError') return true;
  // Older Firefox
  if(e.name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
  // Some browsers report by code only
  if(e.code === 22 || e.code === 1014) return true;
  return false;
}

function _onStorageQuotaError(key, val){
  console.warn('[storage] Quota exceeded saving "'+key+'" ('+_approxSize(val)+' bytes)');
  var now = Date.now();
  if(now - _lsState.lastQuotaWarnAt < STORAGE_WARN_THROTTLE_MS) return;
  _lsState.lastQuotaWarnAt = now;
  showStorageError('quota');
}

function _onStorageGenericError(key, err){
  console.warn('[storage] Failed to persist "'+key+'":', err);
  var now = Date.now();
  if(now - _lsState.lastGenericWarnAt < STORAGE_WARN_THROTTLE_MS) return;
  _lsState.lastGenericWarnAt = now;
  showStorageError('generic');
}

function _approxSize(val){
  try { return new Blob([String(val)]).size; } catch(e){ return String(val).length; }
}

// ── Storage usage helper ────────────────────────────────────────────────
// Returns an estimate of how full localStorage is. Quotas vary by browser
// (5MB Chrome/Firefox, 10MB Safari mobile, etc.) so we use a conservative
// 5MB assumption unless the browser exposes a real quota via storage API.
function lsUsage(){
  var used = 0;
  try {
    for(var i=0; i<localStorage.length; i++){
      var k = localStorage.key(i);
      if(!k) continue;
      var v = localStorage.getItem(k);
      // 2 bytes per char (UTF-16 worst-case) + key length
      used += (k.length + (v ? v.length : 0)) * 2;
    }
  } catch(e){ return null; }
  var quota = 5 * 1024 * 1024; // conservative 5 MB
  return {
    usedBytes: used,
    quotaBytes: quota,
    percent: Math.round((used / quota) * 100),
    persistent: _lsState.lastWriteWasPersistent
  };
}

// ── User-facing storage error toast ─────────────────────────────────────
// Persistent (non-auto-dismiss) so the user can't miss it. Includes a
// "Download Backup Now" button that triggers backupData() if available.
function showStorageError(reason){
  // Defer until DOM is ready — lsSet can fire during script-parse via the
  // eager loadCP/loadFunds/loadBorrows hooks, before document.body exists.
  if(!document.body){
    document.addEventListener('DOMContentLoaded', function(){ showStorageError(reason); });
    return;
  }
  // Don't stack toasts — replace any existing one
  var existing = document.getElementById('storageErrorToast');
  if(existing) existing.remove();

  var msg, hint;
  if(reason === 'quota'){
    msg = '⚠️ Storage full — your last change may not have saved.';
    hint = 'Download a backup, then clear old months from Cash Flow or delete unused funds to free space.';
  } else {
    msg = '⚠️ Could not save your last change.';
    hint = 'Your browser is blocking storage. Download a backup so you don\'t lose data, then try again.';
  }

  var toast = document.createElement('div');
  toast.id = 'storageErrorToast';
  toast.style.cssText = 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:99999;background:#1a0a0a;border:1px solid #5a1010;border-radius:8px;padding:14px 16px;max-width:340px;width:calc(100% - 40px);box-shadow:0 4px 20px rgba(0,0,0,0.6);font-family:DM Mono,monospace;color:#efefef;';
  toast.innerHTML =
    '<div style="font-size:13px;font-weight:700;color:#f23060;margin-bottom:6px;">'+msg+'</div>'
    + '<div style="font-size:10px;color:#888;line-height:1.5;margin-bottom:12px;letter-spacing:0.5px;">'+hint+'</div>'
    + '<div style="display:flex;gap:6px;">'
    +   '<button id="storageErrorBackupBtn" style="flex:1;padding:9px 10px;background:#c8f230;border:none;border-radius:5px;color:#000;font-family:DM Mono,monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;font-weight:700;">Download Backup</button>'
    +   '<button id="storageErrorDismissBtn" style="padding:9px 12px;background:none;border:1px solid #2a2a2a;border-radius:5px;color:#666;font-family:DM Mono,monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;">Dismiss</button>'
    + '</div>';
  document.body.appendChild(toast);

  document.getElementById('storageErrorBackupBtn').onclick = function(){
    if(typeof backupData === 'function'){
      try { backupData(); } catch(e){ console.warn('backupData failed:', e); }
    } else {
      alert('Backup function not available right now. Please open Settings and tap Backup.');
    }
    // Don't auto-dismiss after backup — let the user verify the file downloaded
    // before closing the warning.
  };
  document.getElementById('storageErrorDismissBtn').onclick = function(){
    toast.remove();
  };
}

// ── Console testing helpers ────────────────────────────────────────────
// yb_storageStatus()    — print current usage summary
// yb_simulateQuotaErr() — show the quota toast WITHOUT actually filling storage
window.yb_storageStatus = function(){
  var u = lsUsage();
  if(!u){ console.warn('Could not measure storage.'); return; }
  console.log('Storage: '+(u.usedBytes/1024).toFixed(1)+' KB used of ~'+(u.quotaBytes/1024/1024)+' MB ('+u.percent+'%)');
  console.log('Last write was persistent:', u.persistent);
  return u;
};
window.yb_simulateQuotaErr = function(){
  // Reset throttle so the toast fires regardless of when one last appeared
  _lsState.lastQuotaWarnAt = 0;
  showStorageError('quota');
};

// ════════════════════════════════════════════════════════════════════
// SOFT-DELETE + UNDO SYSTEM (item 10)
// ════════════════════════════════════════════════════════════════════
// Reusable mechanism for destructive actions that should be undoable.
// Instead of removing items from arrays/objects, callers flag them with
// `_deleted: true` and call softDeleteToast() to show the undo prompt.
// If the user taps Undo within 8 seconds, the flag is cleared. Otherwise
// a background sweep purges flagged items from storage permanently.
//
// Render functions need to filter out items where _deleted === true so
// they don't appear during the undo window.
//
// Usage:
//   softDeleteToast({
//     label: 'Lezaun',                       // shown in toast: "Deleted Lezaun"
//     onUndo:   function(){ ... },           // called if user taps undo
//     onPurge:  function(){ ... }            // called when timer expires (optional)
//   });
//
// The pattern is intentionally lightweight — it does NOT perform the
// soft-delete itself. Callers are responsible for setting/clearing the
// _deleted flag and calling save() functions. This keeps each call site
// in control of its own data shape.

var _softDeletePending = null;        // { timeoutId, onPurge, toast }

function softDeleteToast(opts){
  opts = opts || {};
  var label   = opts.label   || 'item';
  var onUndo  = opts.onUndo  || function(){};
  var onPurge = opts.onPurge || function(){};
  var ms      = opts.ms      || 8000;

  // If a previous undo toast was still showing, fire its purge handler now
  // — the user moved on without undoing it, so honour the deletion.
  if(_softDeletePending){
    try { _softDeletePending.onPurge(); } catch(e){ console.warn('Prior purge failed:', e); }
    if(_softDeletePending.timeoutId) clearTimeout(_softDeletePending.timeoutId);
    if(_softDeletePending.toast && _softDeletePending.toast.parentNode){
      _softDeletePending.toast.parentNode.removeChild(_softDeletePending.toast);
    }
    _softDeletePending = null;
  }

  // Build the toast — sits at the bottom centre so it doesn't block taps
  // on common controls. Higher z-index than other toasts so it wins.
  var toast = document.createElement('div');
  toast.id = 'softDeleteToast';
  toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);'
    + 'background:#1a0d0d;border:1px solid #5a2a2a;border-radius:10px;padding:12px 16px;'
    + 'display:flex;align-items:center;gap:14px;z-index:10000;'
    + 'box-shadow:0 6px 24px rgba(0,0,0,.6);max-width:90vw;'
    + 'font-family:DM Mono,monospace;animation:sdSlideUp .25s ease-out;';
  toast.innerHTML = ''
    + '<span style="font-size:16px;flex-shrink:0;">🗑</span>'
    + '<div style="flex:1;min-width:0;">'
    +   '<div style="font-size:12px;color:#efefef;letter-spacing:0.3px;">Deleted '+_escSDLabel(label)+'</div>'
    +   '<div style="font-size:9px;color:#666;letter-spacing:1.5px;text-transform:uppercase;margin-top:2px;" id="softDeleteCountdown">'+(ms/1000)+'s to undo</div>'
    + '</div>'
    + '<button id="softDeleteUndoBtn" style="flex-shrink:0;background:#c8f230;border:none;color:#000;font-family:DM Mono,monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;padding:8px 14px;border-radius:5px;cursor:pointer;font-weight:700;">Undo</button>';

  // Once-only animation styles
  if(!document.getElementById('softDeleteAnimStyle')){
    var sty = document.createElement('style');
    sty.id = 'softDeleteAnimStyle';
    sty.textContent = '@keyframes sdSlideUp{from{transform:translateX(-50%) translateY(20px);opacity:0;}to{transform:translateX(-50%) translateY(0);opacity:1;}}';
    document.head.appendChild(sty);
  }

  document.body.appendChild(toast);

  // Countdown ticker — updates the small "Ns to undo" text every second
  var remaining = Math.floor(ms / 1000);
  var tickerId = setInterval(function(){
    remaining--;
    if(remaining <= 0){ clearInterval(tickerId); return; }
    var el = document.getElementById('softDeleteCountdown');
    if(el) el.textContent = remaining + 's to undo';
  }, 1000);

  // Wire the Undo button — clears the timeout, removes the toast, runs
  // the caller's restore handler.
  var undoBtn = toast.querySelector('#softDeleteUndoBtn');
  undoBtn.onclick = function(){
    if(_softDeletePending && _softDeletePending.timeoutId){
      clearTimeout(_softDeletePending.timeoutId);
    }
    clearInterval(tickerId);
    if(toast.parentNode) toast.parentNode.removeChild(toast);
    _softDeletePending = null;
    try { onUndo(); } catch(e){ console.error('Undo handler failed:', e); }
  };

  // Schedule the purge — only fires if user doesn't tap Undo
  var timeoutId = setTimeout(function(){
    clearInterval(tickerId);
    if(toast.parentNode) toast.parentNode.removeChild(toast);
    _softDeletePending = null;
    try { onPurge(); } catch(e){ console.error('Purge handler failed:', e); }
  }, ms);

  _softDeletePending = { timeoutId: timeoutId, onPurge: onPurge, toast: toast };
}

// HTML-safe label escape — small enough to inline so callers don't need
// to remember to escape their own labels.
function _escSDLabel(s){
  if(s == null) return '';
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Console helper — tells you if there's a pending soft-delete and how
// much time is left before purge.
window.yb_softDeletePending = function(){
  if(!_softDeletePending) return 'No pending soft-delete.';
  return _softDeletePending;
};
// ════════════════════════════════════════════════════════════════════
// END SOFT-DELETE SYSTEM
// ════════════════════════════════════════════════════════════════════

// ── All storage keys — defined early to avoid ReferenceError ──
const PIN_STORE_KEY      = 'yb_pins';
const SK                 = 'yasin_funds_v16';
const CPK                = 'yasin_carpool_v4';
const BORROW_KEY         = 'yasin_borrows_v1';
const SYNC_KEY           = 'yasin_sync_meta_v1';
const PRAYER_KEY         = 'yasin_prayer_v1';
const MAINT_KEY          = 'yasin_maint_v1';
// MAINT_SETTINGS_KEY holds { name: string, target: number } for the original
// maintenance fund. Previously MAINT_TARGET was a hardcoded 1500 constant.
// Now it's a stored, editable value with the same default for existing users.
const MAINT_SETTINGS_KEY = 'yb_maint_settings_v1';
const MAINT_TARGET_DEFAULT = 1500;
const MAINT_NAME_DEFAULT   = 'Maintenance Fund';

function getMaintSettings(){
  try {
    var raw = lsGet(MAINT_SETTINGS_KEY);
    if(raw){
      var parsed = JSON.parse(raw);
      return {
        name:   (typeof parsed.name === 'string' && parsed.name.trim()) ? parsed.name : MAINT_NAME_DEFAULT,
        target: (typeof parsed.target === 'number' && parsed.target > 0) ? parsed.target : MAINT_TARGET_DEFAULT
      };
    }
  } catch(e){}
  return { name: MAINT_NAME_DEFAULT, target: MAINT_TARGET_DEFAULT };
}
function getMaintTarget(){ return getMaintSettings().target; }
function getMaintFundName(){ return getMaintSettings().name; }
function setMaintSettings(name, target){
  var current = getMaintSettings();
  var next = {
    name:   (typeof name   === 'string' && name.trim())  ? name.trim() : current.name,
    target: (typeof target === 'number' && target > 0)   ? target      : current.target
  };
  var ok = lsSet(MAINT_SETTINGS_KEY, JSON.stringify(next));
  // Diagnostic — helps debug "rename reverts" issues. Run yb_debugMaint()
  // in the console to see the latest state.
  console.debug('[setMaintSettings] saved:', next, 'persisted:', ok);
  return next;
}

// Console diagnostic — run yb_debugMaint() to see the actual stored fund
// name + target. Helps confirm whether a rename truly persisted.
window.yb_debugMaint = function(){
  var raw = lsGet(MAINT_SETTINGS_KEY);
  var live = getMaintSettings();
  console.log('Raw stored:', raw);
  console.log('Live getter:', live);
  console.log('Live name shown in UI:', getMaintFundName());
  return live;
};

// Backwards-compatibility shim: MAINT_TARGET is referenced by older code paths
// across multiple files. We can't make a real `const` reactive, but we can use
// a getter on `window` so any read of MAINT_TARGET returns the current stored
// value. Going forward, prefer getMaintTarget() in new code.
try {
  Object.defineProperty(window, 'MAINT_TARGET', {
    configurable: true,
    get: function(){ return getMaintTarget(); }
  });
} catch(e){
  // Fallback if defineProperty fails for some reason
  window.MAINT_TARGET = getMaintTarget();
}

const SCHOOL_EVENTS_KEY  = 'yasin_school_events_v1';
const SCHOOL_RESULTS_KEY = 'yasin_school_results_v1';
const SCHOOL_DONE_KEY    = 'yasin_school_done_v1';
const FUEL_KEY           = 'yasin_fuel_v1';
const DAILY_FUEL_KEY     = 'yb_daily_fuel';
const PRICING_TANK_KEY   = 'yb_pricing_tank';
const PRICING_PRIVATE_KEY= 'yb_pricing_private';
const PASSENGERS_KEY     = 'yb_passengers_v1';
const CF_KEY             = 'yb_cashflow_v1';
const CUSTOM_MAINT_KEY   = 'yasin_maint_cards_v1';
const CARS_KEY           = 'yasin_cars_v1';
const DRIVER_KEY         = 'yasin_drivers_v1';
const INST_KEY           = 'yasin_instalments_v1';
const EXTERNAL_BORROW_KEY= 'yb_external_borrows_v1';

// Seed memory from whatever storage is available
(function seedMem(){
  const keys = [SK,CPK,BORROW_KEY,FUEL_KEY,PRAYER_KEY,MAINT_KEY,SYNC_KEY,PIN_STORE_KEY,INST_KEY,DRIVER_KEY,CARS_KEY,SCHOOL_EVENTS_KEY,SCHOOL_RESULTS_KEY,SCHOOL_DONE_KEY,PASSENGERS_KEY,CF_KEY,CUSTOM_MAINT_KEY,EXTERNAL_BORROW_KEY,DAILY_FUEL_KEY,PRICING_TANK_KEY,PRICING_PRIVATE_KEY];
  keys.forEach(function(k){
    try{ const v=localStorage.getItem(k); if(v){ _lsMem[k]=v; return; } }catch(e){}
    try{ const v=sessionStorage.getItem(k); if(v) _lsMem[k]=v; }catch(e){}
  });
})();


// PINs are intentionally empty by default. On first launch (no PINs in
// localStorage) the app shows a setup screen where the user creates the first
// admin account. Existing installations keep their saved PINs unchanged.
const PIN_DEFAULTS = { "admin": "1234" };

function loadPINS(){
  try {
    const saved = JSON.parse(lsGet(PIN_STORE_KEY));
    return saved || PIN_DEFAULTS;
  } catch(e){ return PIN_DEFAULTS; }
}
function savePINS(pins){ lsSet(PIN_STORE_KEY, JSON.stringify(pins)); }

// Has the user completed first-run setup? True if at least one PIN exists.
function isFirstRun(){
  try {
    var saved = JSON.parse(lsGet(PIN_STORE_KEY));
    if(!saved) return true;
    return Object.keys(saved).length === 0;
  } catch(e){ return true; }
}

// Create the first admin account from the setup screen. Validates the PIN
// and name, persists, and returns true on success. Caller handles the UI
// transition (closing the setup screen, showing the wizard).
function createFirstAdmin(name, pin){
  if(!name || !name.trim()) return { ok:false, error:'Name is required.' };
  if(!/^\d{4}$/.test(pin || '')) return { ok:false, error:'PIN must be exactly 4 digits.' };
  var trimmed = name.trim().slice(0, 30);
  var newPins = {};
  newPins[pin] = { role:'admin', name: trimmed };
  savePINS(newPins);
  PINS = newPins;
  // Mark first-run as complete so the wizard knows to fire on next applyRole().
  lsSet('yb_first_run_pending_wizard', '1');
  return { ok:true };
}

let PINS = loadPINS();
let currentRole = 'guest';
let currentUser = null;
let pinEntry = "";

function pinPress(n){if(pinEntry.length>=4)return;pinEntry+=String(n);updateDots();if(pinEntry.length===4)setTimeout(checkPin,150);}
function pinDel(){pinEntry=pinEntry.slice(0,-1);updateDots();document.getElementById("pinError").textContent="";}
function updateDots(){for(let i=0;i<4;i++){const d=document.getElementById("dot"+i);if(i<pinEntry.length){d.style.background="#c8f230";d.style.borderColor="#c8f230";}else{d.style.background="transparent";d.style.borderColor="#333";}}}
document.addEventListener('keydown',function(e){
  const screen=document.getElementById('loginScreen');
  if(!screen||screen.style.display==='none')return;
  if(e.key>='0'&&e.key<='9'){pinPress(parseInt(e.key));}
  else if(e.key==='Backspace'){pinDel();}
});
function checkPin(){
  const match = PINS[pinEntry];
  if(match){
    currentRole = match.role;
    currentUser = match.name;
    const s=document.getElementById("loginScreen");
    s.style.opacity="0";
    setTimeout(function(){
      s.style.display="none";
      applyRole();
      document.getElementById('drawerLogoutBtn').style.display = 'flex';
      // After successful PIN login, offer to register biometric if admin
      if(currentRole === 'admin' && window.PublicKeyCredential && !lsGet('yb_biometric_registered')){
        setTimeout(offerBiometricRegistration, 800);
      }
      showLaunchMenu();
    },400);
  } else {
    document.getElementById("pinError").textContent="Incorrect PIN. Try again.";
    pinEntry="";updateDots();
    const dots=document.getElementById("pinDots");
    dots.style.transition="transform 0.1s";
    dots.style.transform="translateX(10px)";
    setTimeout(function(){dots.style.transform="translateX(-10px)";},100);
    setTimeout(function(){dots.style.transform="translateX(0)";},200);
  }
}

// ══ WEBAUTHN BIOMETRIC ══
const BIOMETRIC_KEY = 'yb_biometric_registered';
const BIOMETRIC_CRED_KEY = 'yb_biometric_credid';
const RP_ID = 'yasinbadaron90-collab.github.io';
const RP_NAME = 'YB Dashboard';

function biometricSupported(){
  return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
}

function showPinFallback(){
  document.getElementById('biometricSection').style.display = 'none';
  document.getElementById('pinSection').style.display = 'block';
  document.getElementById('loginSubtitle').textContent = 'Enter PIN to continue';
}

function loginSuccess(name, role){
  currentRole = role;
  currentUser = name;
  // Expose role on window so role-based access guards in other modules
  // (e.g. _roleCanAccessTab in money.js) can read the current user's role.
  window.currentRole = role;
  window.currentUser = name;
  const s = document.getElementById('loginScreen');
  s.style.opacity = '0';
  setTimeout(function(){
    s.style.display = 'none';
    applyRole();
    document.getElementById('drawerLogoutBtn').style.display = 'flex';
    showLaunchMenu();
  }, 400);
}

// ── Called on page load — check if biometric is registered ──
function initBiometricLogin(){
  // First-run detection takes priority — if no admin exists yet, show the
  // setup screen instead of PIN/biometric. This handles fresh installs and
  // restored localStorage where PINs got wiped.
  if(isFirstRun()){
    showFirstRunSetup();
    return;
  }
  if(!biometricSupported()) return;
  const registered = lsGet(BIOMETRIC_KEY);
  if(registered === 'true'){
    // Show fingerprint button, hide PIN by default
    document.getElementById('biometricSection').style.display = 'block';
    document.getElementById('pinSection').style.display = 'none';
    document.getElementById('loginSubtitle').textContent = 'Use fingerprint or PIN to continue';
    // Auto-trigger biometric after short delay
    setTimeout(biometricLogin, 400);
  }
}

// ── First-run setup screen ──────────────────────────────────────────────
function showFirstRunSetup(){
  // Hide the PIN/biometric sections, show the setup section
  var bio = document.getElementById('biometricSection'); if(bio) bio.style.display = 'none';
  var pin = document.getElementById('pinSection');       if(pin) pin.style.display = 'none';
  var setup = document.getElementById('firstRunSection');
  if(setup) setup.style.display = 'block';
  var sub = document.getElementById('loginSubtitle');
  if(sub) sub.textContent = 'Create your account to get started';
  // Reset the entry state
  pinEntry = '';
  updateSetupDots();
  var nameEl = document.getElementById('frName');
  if(nameEl) setTimeout(function(){ nameEl.focus(); }, 200);
}

// PIN entry buttons used during first-run setup. They share the same pinEntry
// variable as the regular PIN flow; we just rebind the visual dots and
// completion handler.
function setupPinPress(n){
  if(pinEntry.length >= 4) return;
  pinEntry += String(n);
  updateSetupDots();
  if(pinEntry.length === 4){
    // Don't auto-submit — wait for the Create button so the user has a chance
    // to type their name first.
  }
}
function setupPinDel(){
  pinEntry = pinEntry.slice(0, -1);
  updateSetupDots();
  var err = document.getElementById('frError'); if(err) err.textContent = '';
}
function updateSetupDots(){
  for(var i=0; i<4; i++){
    var d = document.getElementById('frDot'+i);
    if(!d) continue;
    if(i < pinEntry.length){ d.style.background = '#c8f230'; d.style.borderColor = '#c8f230'; }
    else { d.style.background = 'transparent'; d.style.borderColor = '#333'; }
  }
}

// Submit handler for the "Create Account" button.
function submitFirstRunSetup(){
  var nameEl = document.getElementById('frName');
  var errEl  = document.getElementById('frError');
  var name = nameEl ? nameEl.value.trim() : '';
  if(!name){
    if(errEl) errEl.textContent = 'Please enter your name.';
    if(nameEl) nameEl.focus();
    return;
  }
  if(pinEntry.length !== 4){
    if(errEl) errEl.textContent = 'Please enter a 4-digit PIN.';
    return;
  }
  var result = createFirstAdmin(name, pinEntry);
  if(!result.ok){
    if(errEl) errEl.textContent = result.error;
    return;
  }
  // Success — log them in directly, no need to re-enter the PIN.
  if(errEl) errEl.textContent = '';
  loginSuccess(name, 'admin');
}

// ── Trigger fingerprint authentication ──
async function biometricLogin(){
  const statusEl = document.getElementById('biometricStatus');
  const btn = document.getElementById('biometricBtn');
  if(statusEl) statusEl.textContent = 'Scanning…';
  if(btn){ btn.style.borderColor = '#f2a830'; btn.style.background = '#1a1200'; }

  try {
    const credIdB64 = lsGet(BIOMETRIC_CRED_KEY);
    if(!credIdB64){ showPinFallback(); return; }

    // Decode stored credential ID
    const credIdBytes = Uint8Array.from(atob(credIdB64), function(c){ return c.charCodeAt(0); });

    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: RP_ID,
        allowCredentials: [{ id: credIdBytes, type: 'public-key' }],
        userVerification: 'required',
        timeout: 60000
      }
    });

    if(assertion){
      if(statusEl) statusEl.textContent = '✓ Unlocked!';
      if(btn){ btn.style.borderColor = '#c8f230'; btn.style.background = '#0d1a00'; }
      setTimeout(function(){
        loginSuccess('Yasin', 'admin');
      }, 300);
    }
  } catch(err){
    if(err.name === 'NotAllowedError'){
      if(statusEl) statusEl.textContent = 'Cancelled — try again';
    } else {
      if(statusEl) statusEl.textContent = 'Biometric failed — use PIN';
      setTimeout(showPinFallback, 1500);
    }
    if(btn){ btn.style.borderColor = '#f23060'; btn.style.background = '#1a0505'; }
    setTimeout(function(){
      if(btn){ btn.style.borderColor = '#c8f230'; btn.style.background = '#0d1a00'; }
      if(statusEl) statusEl.textContent = 'Touch to unlock';
    }, 2000);
  }
}

// ── Register biometric — called after first successful PIN login ──
async function registerBiometric(){
  if(!biometricSupported()){
    alert('Your browser does not support biometric authentication.');
    return;
  }
  try {
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);
    const userId = new Uint8Array(16);
    crypto.getRandomValues(userId);

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { id: RP_ID, name: RP_NAME },
        user: { id: userId, name: 'yasin', displayName: 'Yasin' },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },   // ES256
          { alg: -257, type: 'public-key' }  // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred'
        },
        timeout: 60000,
        attestation: 'none'
      }
    });

    if(credential){
      // Store credential ID as base64
      const credIdArr = new Uint8Array(credential.rawId);
      const credIdB64 = btoa(String.fromCharCode.apply(null, credIdArr));
      lsSet(BIOMETRIC_CRED_KEY, credIdB64);
      lsSet(BIOMETRIC_KEY, 'true');
      return true;
    }
  } catch(err){
    console.warn('Biometric registration failed:', err);
    return false;
  }
}

// ── Offer to register biometric after first admin PIN login ──
function offerBiometricRegistration(){
  if(!biometricSupported()) return;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9998;display:flex;align-items:center;justify-content:center;padding:24px;';
  overlay.innerHTML =
    '<div style="background:#111;border:1px solid #2a2a2a;border-radius:14px;padding:28px 24px;max-width:320px;width:100%;text-align:center;">'
    +'<div style="font-size:48px;margin-bottom:16px;">👆</div>'
    +'<div style="font-family:\'Syne\',sans-serif;font-weight:800;font-size:18px;color:#efefef;margin-bottom:8px;">Enable Fingerprint Login?</div>'
    +'<div style="font-size:11px;color:#555;letter-spacing:0.5px;line-height:1.7;margin-bottom:24px;">Skip the PIN next time — just touch your fingerprint sensor to unlock your dashboard instantly.</div>'
    +'<button onclick="confirmBiometricSetup(this.parentElement.parentElement)" style="width:100%;padding:14px;background:#c8f230;border:none;border-radius:8px;color:#000;font-family:\'DM Mono\',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;font-weight:700;margin-bottom:10px;">👆 Enable Fingerprint</button>'
    +'<button onclick="this.parentElement.parentElement.remove()" style="width:100%;padding:12px;background:none;border:1px solid #2a2a2a;border-radius:8px;color:#555;font-family:\'DM Mono\',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;">Not Now</button>'
    +'</div>';
  document.body.appendChild(overlay);
}

async function confirmBiometricSetup(overlay){
  const btn = overlay.querySelector('button');
  if(btn){ btn.textContent = '⏳ Scanning…'; btn.disabled = true; }
  const success = await registerBiometric();
  if(overlay) overlay.remove();
  if(success){
    // Show success toast
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:#0d1a00;border:1px solid #c8f230;border-radius:8px;padding:12px 20px;z-index:9999;font-family:DM Mono,monospace;font-size:11px;color:#c8f230;letter-spacing:1px;white-space:nowrap;';
    toast.textContent = '✓ Fingerprint registered! Use it next time you open the app.';
    document.body.appendChild(toast);
    setTimeout(function(){ toast.remove(); }, 4000);
  } else {
    alert('Fingerprint setup failed. You can try again from Settings.');
  }
}

// ── Remove biometric (for Settings) ──
function removeBiometric(){
  if(!confirm('Remove fingerprint login? You\'ll need your PIN to log in again.')) return;
  try{ localStorage.removeItem(BIOMETRIC_KEY); }catch(e){}
  try{ localStorage.removeItem(BIOMETRIC_CRED_KEY); }catch(e){}
  lsSet(BIOMETRIC_KEY, null);
  lsSet(BIOMETRIC_CRED_KEY, null);
  alert('Fingerprint removed. PIN login will be used next time.');
}

// ── Run on page load ──
document.addEventListener('DOMContentLoaded', function(){
  // Load all persisted in-memory state into globals before anything renders or saves.
  // Modules that hold their data in a top-level variable (cpData, funds, borrowData)
  // start empty at boot — if a save fires before the corresponding load runs, the
  // empty in-memory copy overwrites the real saved data. Loading them all here
  // prevents that.
  try { if(typeof loadCP       === 'function') loadCP();       } catch(e){}
  try { if(typeof loadFunds    === 'function') loadFunds();    } catch(e){}
  try { if(typeof loadBorrows  === 'function') loadBorrows();  } catch(e){}
  initBiometricLogin();
});


function applyRole(){
  if(currentRole==='admin'){
    // Admin: start on carpool, show both nav tabs
    document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
    document.getElementById('page-carpool').classList.add('active');
    document.getElementById('navCarpool').classList.add('active');
    document.getElementById('navSavings').classList.remove('active');
    renderCarpool();
    // Pre-render the savings-tab cards so when the user navigates over,
    // they're already correct (no Loading...). Wrapped in try because
    // these may not be defined yet on edge cases.
    try { if(typeof renderFunds      === 'function') renderFunds();      } catch(e){}
    try { if(typeof renderMaintCard  === 'function') renderMaintCard();  } catch(e){}
    // Fire reminders after a short delay
    setTimeout(checkReminders, 800);
    // First-run wizard — triggered after createFirstAdmin sets the flag.
    // We fire it after a brief pause so the dashboard has time to render
    // underneath; the wizard then opens Odin chat with a welcome message.
    if(lsGet('yb_first_run_pending_wizard') === '1'){
      lsSet('yb_first_run_pending_wizard', null);
      setTimeout(function(){
        try {
          if(typeof startOdinFirstRunWizard === 'function'){
            startOdinFirstRunWizard(currentUser);
          }
        } catch(e){ console.warn('First-run wizard failed:', e); }
      }, 1200);
    }
    return;
  }

  // Car Service role — only show the Cars tab
  if(currentRole === 'carservice'){
    document.querySelectorAll('.admin-only').forEach(function(el){ el.style.display='none'; });
    // Reveal the data section for carservice users
    document.querySelectorAll('.carservice-show').forEach(function(el){ el.style.display=''; });
    // Show the Cars nav tab only
    document.getElementById('navSavings').style.display = 'none';
    document.getElementById('navCarpool').style.display = 'none';
    var navCars = document.getElementById('navCars');
    if(navCars){ navCars.style.display = ''; navCars.classList.add('active'); navCars.style.pointerEvents = 'none'; }
    // Show hamburger (so they can access data options)
    var hbg = document.getElementById('hbgBtn');
    if(hbg) hbg.style.display = '';
    // Show Cars page
    document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
    document.getElementById('page-cars').classList.add('active');
    document.getElementById('page-cars').style.display = 'block';
    renderCars();
    return;
  }

  // Passenger role
  // Hide admin-only elements
  document.querySelectorAll('.admin-only').forEach(function(el){ el.style.display='none'; });

  // Hide nav tabs entirely for passengers
  document.getElementById('navSavings').style.display = 'none';
  document.getElementById('navCarpool').style.display = 'none';

  // Also hide hamburger button for passengers
  var hbg = document.getElementById('hbgBtn');
  if(hbg) hbg.style.display = 'none';

  // Switch to carpool
  document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
  document.getElementById('page-carpool').classList.add('active');

  // Re-render carpool filtered to this user
  renderCarpool();

  // Open the left statement pane automatically
  const pane = document.getElementById('cpLeftPane');
  if(pane && pane.classList.contains('collapsed')) togglePane();

  // Lock passenger selector to only show current user, hide others
  document.querySelectorAll('.pass-opt').forEach(function(el){
    if(el.getAttribute('data-name') === currentUser){
      el.classList.add('selected');
      el.style.pointerEvents = 'none';
    } else {
      el.classList.remove('selected');
      el.style.display = 'none';
    }
  });

  // Auto-fill current month date range
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay  = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fmt = function(d){ return d.toISOString().slice(0,10); };
  const sfrom = document.getElementById('stmtFrom');
  const sto   = document.getElementById('stmtTo');
  if(sfrom) sfrom.value = fmt(firstDay);
  if(sto)   sto.value   = fmt(lastDay);

  // Auto-generate their statement
  setTimeout(generateStatements, 200);
}

function logout(){
  currentRole = 'guest';
  currentUser = null;
  pinEntry = '';
  updateDots();
  document.getElementById('pinError').textContent = '';
  document.getElementById('drawerLogoutBtn').style.display = 'none';
  // Restore hamburger button
  var hbg = document.getElementById('hbgBtn');
  if(hbg) hbg.style.display = '';
  // Restore savings + carpool nav tabs
  document.getElementById('navSavings').style.display = '';
  document.getElementById('navCarpool').style.display = '';
  // Restore Cars nav tab pointer events (in case carservice user was logged in)
  var navCars = document.getElementById('navCars');
  if(navCars){ navCars.style.pointerEvents = ''; navCars.classList.remove('active'); }
  // Restore admin-only elements (skip page divs — tab visibility controlled by CSS)
  document.querySelectorAll('.admin-only').forEach(function(el){
    if(el.classList.contains('page')) return;
    el.style.display='';
  });
  // Hide carservice-specific reveals (admin-only will re-show them properly)
  document.querySelectorAll('.carservice-show').forEach(function(el){ el.style.display=''; });
  // Show login screen
  const s = document.getElementById('loginScreen');
  s.style.display = 'flex';
  s.style.opacity = '1';
  // Reset to carpool page
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-carpool').classList.add('active');
  document.getElementById('navCarpool').classList.add('active');
  document.getElementById('navSavings').classList.remove('active');
  renderCarpool();
}

// ── DRAWER ──
function openDrawer(){
  document.getElementById('hbgDrawer').classList.add('open');
  document.getElementById('hbgOverlay').classList.add('open');
}
function closeDrawer(){
  document.getElementById('hbgDrawer').classList.remove('open');
  document.getElementById('hbgOverlay').classList.remove('open');
}

// ── THEME TOGGLE ──
function toggleTheme(){
  var isLight = document.documentElement.classList.toggle('light');
  lsSet('yasin_theme_light', isLight ? '1' : '0');
  var lbl = document.getElementById('themeLabel');
  if(lbl) lbl.textContent = isLight ? 'Dark Mode' : 'Light Mode';
}
(function initTheme(){
  var saved = lsGet('yasin_theme_light');
  if(saved === '1'){
    document.documentElement.classList.add('light');
    var lbl = document.getElementById('themeLabel');
    if(lbl) lbl.textContent = 'Dark Mode';
  }
})();

// ── EXPORT RESULTS AS PDF-STYLE HTML ──
function exportResults(){
  if(typeof window.jspdf === 'undefined'){
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = function(){ buildResultsPDF(); };
    document.head.appendChild(s);
  } else {
    buildResultsPDF();
  }
}

function buildResultsPDF(){
  var yearData = ALL_YEARS_DATA[_activeYearIdx];
  var subjects = yearData.subjects;
  var withResults = subjects.filter(function(x){ return x.finalPct !== null; });
  var avgFinal = withResults.length > 0
    ? (withResults.reduce(function(s,x){ return s+x.finalPct; },0) / withResults.length).toFixed(1)
    : null;

  // Toast
  var toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1a1a1a;border:1px solid #3a5a00;border-radius:10px;padding:14px 20px;display:flex;align-items:center;gap:12px;z-index:9999;box-shadow:0 4px 24px rgba(0,0,0,.5);min-width:240px;';
  toast.innerHTML =
    '<div style="width:18px;height:18px;border:2px solid #3a5a00;border-top-color:#c8f230;border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0;"></div>'
    +'<div><div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:13px;color:#efefef;">Generating PDF...</div>'
    +'<div style="font-size:10px;color:#555;margin-top:2px;letter-spacing:1px;">'+yearData.year+' · Yasin Badaron</div></div>';
  if(!document.getElementById('spinStyle')){
    var sp=document.createElement('style');sp.id='spinStyle';
    sp.textContent='@keyframes spin{to{transform:rotate(360deg);}}';
    document.head.appendChild(sp);
  }
  document.body.appendChild(toast);

  var {jsPDF} = window.jspdf;
  var doc = new jsPDF({unit:'mm', format:'a4'});

  // Background
  doc.setFillColor(10,10,10); doc.rect(0,0,210,297,'F');
  // Accent top bar
  doc.setFillColor(200,242,48); doc.rect(0,0,210,2,'F');

  // Header
  doc.setTextColor(90,136,0); doc.setFontSize(8); doc.setFont('helvetica','normal');
  doc.text('STATEMENT OF RESULTS', 20, 14);
  doc.text('REGENT BUSINESS SCHOOL', 190, 14, {align:'right'});

  doc.setTextColor(200,242,48); doc.setFontSize(24); doc.setFont('helvetica','bold');
  doc.text('Yasin Badaron', 20, 26);

  doc.setTextColor(85,85,85); doc.setFontSize(9); doc.setFont('helvetica','normal');
  doc.text('Bachelor of Commerce · Student No: 12446490 · SAQA ID: 71778', 20, 33);

  // Year + avg (top right)
  doc.setTextColor(200,242,48); doc.setFontSize(18); doc.setFont('helvetica','bold');
  doc.text(yearData.year, 190, 22, {align:'right'});
  doc.setTextColor(85,85,85); doc.setFontSize(9); doc.setFont('helvetica','normal');
  doc.text(yearData.period, 190, 28, {align:'right'});
  if(avgFinal){
    doc.setTextColor(200,242,48); doc.setFontSize(22); doc.setFont('helvetica','bold');
    doc.text(avgFinal+'%', 190, 37, {align:'right'});
    doc.setTextColor(85,85,85); doc.setFontSize(7); doc.setFont('helvetica','normal');
    doc.text('AVERAGE', 190, 41, {align:'right'});
  }

  // Divider
  doc.setDrawColor(200,242,48); doc.setLineWidth(0.5); doc.line(20,44,190,44);

  // Table header
  var y = 52;
  var cols = {module:20, code:90, year:120, exam:138, final:156, result:172};
  doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(85,85,85);
  doc.text('MODULE',        cols.module, y);
  doc.text('CODE',          cols.code,   y);
  doc.text('YEAR %',        cols.year,   y, {align:'center'});
  doc.text('EXAM %',        cols.exam,   y, {align:'center'});
  doc.text('FINAL %',       cols.final,  y, {align:'center'});
  doc.text('RESULT',        cols.result, y, {align:'center'});
  doc.setDrawColor(40,40,40); doc.setLineWidth(0.3); doc.line(20,y+3,190,y+3);
  y += 10;

  // Rows
  subjects.forEach(function(sub){
    var isExm = sub.result === 'EXM';

    // Result badge color
    var rc = sub.result==='PD'||sub.result==='PDS' ? [200,242,48]
           : sub.result==='P'||sub.result==='PS'   ? [52,211,153]
           : sub.result==='F'||sub.result==='FS'   ? [242,48,96]
           : sub.result==='EXM'                    ? [136,136,136]
           : [136,136,136];

    // Module name (wrap if long)
    doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.setTextColor(239,239,239);
    var modName = doc.splitTextToSize(sub.name, 60);
    doc.text(modName, cols.module, y);

    doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(85,85,85);
    doc.text(sub.code, cols.code, y);

    // Year %
    doc.setFontSize(10); doc.setTextColor(239,239,239);
    doc.text(isExm||sub.yearPct===null ? '—' : sub.yearPct+'%', cols.year, y, {align:'center'});
    // Exam %
    doc.text(isExm||sub.examPct===null ? '—' : sub.examPct+'%', cols.exam, y, {align:'center'});
    // Final %
    if(sub.finalPct!==null){
      doc.setTextColor(200,242,48); doc.setFont('helvetica','bold');
      doc.text(sub.finalPct+'%', cols.final, y, {align:'center'});
    } else {
      doc.setTextColor(50,50,50); doc.setFont('helvetica','normal');
      doc.text('—', cols.final, y, {align:'center'});
    }

    // Result badge
    if(sub.result){
      var bw = 18; var bh = 6;
      var bx = cols.result - bw/2; var by = y - 4.5;
      doc.setFillColor(rc[0], rc[1], rc[2]);
      doc.setDrawColor(rc[0], rc[1], rc[2]);
      doc.roundedRect(bx, by, bw, bh, 1.5, 1.5, 'F');
      doc.setTextColor(isExm ? 255:10, isExm?255:10, isExm?255:10);
      doc.setFontSize(7); doc.setFont('helvetica','bold');
      doc.text(sub.result, cols.result, y, {align:'center'});
    } else {
      doc.setTextColor(50,50,50); doc.setFontSize(10);
      doc.text('—', cols.result, y, {align:'center'});
    }

    // Quiz & assignment scores as small note below if present
    var lineH = modName.length > 1 ? 7*modName.length : 7;
    if(sub.quizScore!==null || sub.assessmentScore!==null){
      doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(85,85,85);
      var extras = [];
      if(sub.quizScore!==null) extras.push('Quiz: '+sub.quizScore+'%');
      if(sub.assessmentScore!==null) extras.push('Assignment: '+sub.assessmentScore+'%');
      doc.text(extras.join('  ·  '), cols.module, y+lineH-2);
      lineH += 4;
    }

    doc.setDrawColor(30,30,30); doc.setLineWidth(0.2); doc.line(20, y+lineH, 190, y+lineH);
    y += lineH + 6;
  });

  // Footer
  doc.setDrawColor(200,242,48); doc.setLineWidth(0.3); doc.line(20,280,190,280);
  doc.setTextColor(50,50,50); doc.setFontSize(7); doc.setFont('helvetica','normal');
  doc.text('Exported from YB Dashboard · '+new Date().toLocaleDateString('en-ZA',{day:'numeric',month:'long',year:'numeric'}), 20, 285);
  doc.text('Regent Business School · SAQA ID: 71778', 190, 285, {align:'right'});

  // Save
  doc.save('Results_'+yearData.year.replace(' ','_')+'_Yasin_Badaron.pdf');

  // Update toast
  setTimeout(function(){
    toast.innerHTML =
      '<div style="width:18px;height:18px;background:#1a2e00;border:2px solid #3a5a00;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;color:#c8f230;">✓</div>'
      +'<div><div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:13px;color:#c8f230;">PDF Downloaded!</div>'
      +'<div style="font-size:10px;color:#555;margin-top:2px;letter-spacing:1px;">Saved to your Downloads folder</div></div>';
    toast.style.borderColor = '#3a5a00';
    setTimeout(function(){
      toast.style.transition='opacity .4s'; toast.style.opacity='0';
      setTimeout(function(){ if(toast.parentNode) toast.parentNode.removeChild(toast); },400);
    },2500);
  },800);
}

function addFuelEntry() {
  var date = document.getElementById('fuelDate').value;
  var price = Number(document.getElementById('fuelPrice').value);
  var amount = Number(document.getElementById('fuelAmount').value);
  if (!date || !price || !amount) return;
  var data = JSON.parse(lsGet(FUEL_KEY) || '[]');
  data.push({ id: uid(), date: date, price: price, amount: amount });
  lsSet(FUEL_KEY, JSON.stringify(data));
  document.getElementById('fuelDate').value = '';
  document.getElementById('fuelPrice').value = '';
  document.getElementById('fuelAmount').value = '';
  loadFuelReport();
}
function deleteFuelEntry(id) {
  var data = JSON.parse(lsGet(FUEL_KEY) || '[]');
  data = data.filter(function(x){ return x.id !== id; });
  lsSet(FUEL_KEY, JSON.stringify(data));
  loadFuelReport();
}
function loadFuelReport() {
  var FUEL_BUDGET = 2800; // R per month
  var PASSENGERS = window.PASSENGERS || ['David','Lezaun','Shireen'];

  // ── Pay cycle: 25th of last month → 24th of this month ──
  var now = new Date();
  var cycleStart, cycleEnd;
  if(now.getDate() >= 25) {
    // We're past the 25th — cycle is 25th this month to 24th next month
    cycleStart = new Date(now.getFullYear(), now.getMonth(), 25);
    cycleEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 24);
  } else {
    // We're before the 25th — cycle is 25th last month to 24th this month
    cycleStart = new Date(now.getFullYear(), now.getMonth() - 1, 25);
    cycleEnd   = new Date(now.getFullYear(), now.getMonth(), 24);
  }
  function inCycle(ds) {
    var d = new Date(ds);
    return d >= cycleStart && d <= cycleEnd;
  }
  var cycleLabel =
    cycleStart.getDate() + ' ' + cycleStart.toLocaleString('en-ZA',{month:'short'}) +
    ' – ' +
    cycleEnd.getDate() + ' ' + cycleEnd.toLocaleString('en-ZA',{month:'short'});

  // ── Fuel data — filter to pay cycle ──
  var allFuelData = JSON.parse(lsGet(FUEL_KEY) || '[]');
  var fuelData = allFuelData.filter(function(x){ return inCycle(x.date); });
  var fuelTotal = 0;
  fuelData.forEach(function(x){ fuelTotal += Number(x.amount); });

  // ── Carpool data — filter to pay cycle ──
  var cp = {};
  try { cp = JSON.parse(lsGet(CPK) || '{}'); } catch(e){}

  // Data is stored as cp["2026-03"]["2026-03-10"] = {David:{amt:44,paid:false}, ...}
  var days = {};
  Object.keys(cp).forEach(function(mk){
    if(!/^\d{4}-\d{2}$/.test(mk)) return; // only month keys
    var monthData = cp[mk];
    if(typeof monthData !== 'object') return;
    Object.keys(monthData).forEach(function(ds){
      if(inCycle(ds)) days[ds] = monthData[ds];
    });
  });

  // ── Per-day P&L ──
  var totalIncome = 0;
  var drivingDayCount = 0;
  var passengerStats = {};
  PASSENGERS.forEach(function(p){ passengerStats[p] = { income: 0, trips: 0, absent: 0 }; });

  // First pass — count days where at least 1 passenger paid something
  Object.keys(days).forEach(function(ds){
    var dd = days[ds];
    var hasPassenger = false;
    PASSENGERS.forEach(function(p){
      var pdata = dd[p];
      if(pdata && typeof pdata === 'object' && Number(pdata.amt) > 0) hasPassenger = true;
    });
    if(hasPassenger) drivingDayCount++;
  });

  var fuelPerDay = drivingDayCount > 0
    ? fuelTotal / drivingDayCount
    : FUEL_BUDGET / 22;

  var dayRows = [];
  Object.keys(days).sort().reverse().forEach(function(ds){
    var dd = days[ds];
    var dayIncome = 0;
    var activePax = [];
    PASSENGERS.forEach(function(p){
      var pdata = dd[p];
      if(!pdata || typeof pdata !== 'object') {
        passengerStats[p].absent++;
        return;
      }
      var amt = Number(pdata.amt) || 0;
      if(amt === 0) {
        passengerStats[p].absent++;
        return;
      }
      dayIncome += amt;
      passengerStats[p].income += amt;
      passengerStats[p].trips++;
      activePax.push(p.charAt(0));
    });
    if(activePax.length === 0) return;
    totalIncome += dayIncome;
    var pl = dayIncome - fuelPerDay;
    dayRows.push({ ds: ds, pax: activePax, income: dayIncome, fuel: fuelPerDay, pl: pl });
  });

  var plCycleLabelEl = document.getElementById('plCycleLabel');
  if(plCycleLabelEl) plCycleLabelEl.textContent = 'Pay cycle: ' + cycleLabel;

  var netPL = totalIncome - fuelTotal;

  // ── Daily fuel cost (user-set) ──
  var dailyFuelCostEl = document.getElementById('dailyFuelCost');
  var dailyFuelCost = dailyFuelCostEl ? (parseFloat(dailyFuelCostEl.value) || 100) : 100;
  var totalFuelCost = drivingDayCount * dailyFuelCost;

  // ── Update Fuel log section ──
  var fuelTotalEl   = document.getElementById('fuelTotal');
  var fuelCountEl   = document.getElementById('fuelCount');
  var fuelSuggestEl = document.getElementById('fuelSuggest');
  var fuelRowsEl    = document.getElementById('fuelRows');
  if(fuelTotalEl) fuelTotalEl.textContent = fmtR(fuelTotal);
  if(fuelCountEl) fuelCountEl.textContent = fuelData.length;
  var budgetLeft = FUEL_BUDGET - fuelTotal;
  if(fuelSuggestEl){
    fuelSuggestEl.textContent = budgetLeft >= 0 ? fmtR(budgetLeft)+' left' : fmtR(Math.abs(budgetLeft))+' over';
    fuelSuggestEl.style.color = budgetLeft >= 0 ? '#c8f230' : '#f23060';
    fuelSuggestEl.previousElementSibling.textContent = 'Budget Remaining';
  }
  if(fuelRowsEl){
    fuelRowsEl.innerHTML = '';
    if(fuelData.length === 0){
      fuelRowsEl.innerHTML = '<div style="color:#555;font-size:13px;padding:12px 14px;">No fuel entries yet.</div>';
    } else {
      fuelData.slice().sort(function(a,b){ return b.date.localeCompare(a.date); }).forEach(function(x){
        var row = document.createElement('div');
        row.style.cssText = 'display:grid;grid-template-columns:1.5fr 1fr 1fr 28px;padding:9px 14px;border-bottom:1px solid #161616;font-size:12px;align-items:center;';
        var litres = x.price > 0 ? (x.amount/x.price).toFixed(1)+'L' : '-';
        row.innerHTML = '<span style="color:var(--muted)">'+x.date+'</span>'
          +'<span style="color:#ccc">R'+Number(x.price).toFixed(2)+' <span style="color:#555;font-size:10px;">('+litres+')</span></span>'
          +'<span style="color:#a78bfa;font-weight:500">'+fmtR(x.amount)+'</span>'
          +'<span onclick="deleteFuelEntry(\''+x.id+'\')" style="color:#555;cursor:pointer;font-size:18px;line-height:1;text-align:center;">&times;</span>';
        fuelRowsEl.appendChild(row);
      });
    }
  }

  // ── Fuel Savings hero card ──
  var plNetEl         = document.getElementById('plNet');
  var plVerdictEl     = document.getElementById('plVerdict');
  var plIncomeEl      = document.getElementById('plIncome');
  var plFuelEl        = document.getElementById('plFuel');
  var plRowsEl        = document.getElementById('plRows');
  var plPassCardsEl   = document.getElementById('plPassCards');
  var plCoveredPct    = document.getElementById('plCoveredPct');
  var plCoverageBar   = document.getElementById('plCoverageBar');
  var plCoverageLabel = document.getElementById('plCoverageLabel');
  if(!plNetEl) return;

  var coveredPct = totalFuelCost > 0 ? Math.min(100, Math.round((totalIncome/totalFuelCost)*100)) : 0;
  var barColor   = coveredPct >= 80 ? '#c8f230' : coveredPct >= 50 ? '#f2a830' : '#f23060';

  plNetEl.textContent    = fmtR(Math.round(totalIncome));
  plIncomeEl.textContent = fmtR(Math.round(totalIncome));
  plFuelEl.textContent   = fmtR(Math.round(totalFuelCost));
  if(plCoveredPct)    plCoveredPct.textContent    = coveredPct+'%';
  if(plCoverageBar){  plCoverageBar.style.width    = coveredPct+'%'; plCoverageBar.style.background = barColor; }
  if(plCoverageLabel) plCoverageLabel.textContent  = 'passengers covered '+coveredPct+'% of your fuel this cycle';
  if(plVerdictEl)     plVerdictEl.textContent      = 'in fuel costs covered this cycle 🎉';

  // ── Per-day coverage rows ──
  if(plRowsEl){
    if(dayRows.length === 0){
      plRowsEl.innerHTML = '<div style="color:#555;font-size:13px;padding:12px 14px;">No carpool data this cycle yet.</div>';
    } else {
      plRowsEl.innerHTML = '';
      dayRows.forEach(function(d){
        var pct      = Math.min(100, Math.round((d.income / dailyFuelCost)*100));
        var dColor   = pct >= 100 ? '#c8f230' : pct >= 66 ? '#f2a830' : '#f23060';
        var pctLabel = pct >= 100 ? '✅ '+pct+'%' : pct+'%';
        var paxStr   = d.pax.length > 0 ? d.pax.join(', ') : '—';
        var row = document.createElement('div');
        row.style.cssText = 'padding:9px 14px;border-bottom:1px solid #161616;';
        row.innerHTML =
          '<div style="display:grid;grid-template-columns:1.2fr 0.8fr 1fr 1fr 1fr;font-size:11px;align-items:center;margin-bottom:5px;">'
          +'<span style="color:var(--muted)">'+d.ds+'</span>'
          +'<span style="color:#888;text-align:center;">'+paxStr+'</span>'
          +'<span style="color:#c8f230;text-align:right;">'+fmtR(Math.round(d.income))+'</span>'
          +'<span style="color:#f2a830;text-align:right;">'+fmtR(Math.round(dailyFuelCost))+'</span>'
          +'<span style="color:'+dColor+';font-weight:700;text-align:right;">'+pctLabel+'</span>'
          +'</div>'
          +'<div style="height:3px;background:#1a1a1a;border-radius:2px;overflow:hidden;">'
          +'<div style="height:100%;width:'+pct+'%;background:'+dColor+';border-radius:2px;transition:width .5s;box-shadow:0 0 6px '+dColor+'44;"></div>'
          +'</div>';
        plRowsEl.appendChild(row);
      });
    }
  }

  // ── Per-passenger savings cards ──
  if(plPassCardsEl){
    plPassCardsEl.innerHTML = '';
    PASSENGERS.forEach(function(p){
      var s = passengerStats[p];
      var total_trips = s.trips + s.absent;
      var attendance  = total_trips > 0 ? Math.round((s.trips/total_trips)*100) : 0;
      var card = document.createElement('div');
      card.style.cssText = 'background:var(--surface);border:1px solid var(--border);padding:14px;border-radius:8px;';
      card.innerHTML =
        '<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:14px;color:#efefef;margin-bottom:8px;">'+p+'</div>'
        +'<div style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:3px;">Saved you</div>'
        +'<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:20px;color:#c8f230;margin-bottom:8px;">'+fmtR(s.income)+'</div>'
        +'<div style="font-size:10px;color:var(--muted);">'+s.trips+' trips &nbsp;·&nbsp; '+attendance+'% attendance</div>';
      plPassCardsEl.appendChild(card);
    });
  }

  // ── Feed Smart Pricing calculator ──
  var totalPricingTrips = 0, totalPricingIncome = 0;
  PASSENGERS.forEach(function(p){ totalPricingTrips += passengerStats[p].trips; totalPricingIncome += passengerStats[p].income; });
  _pricingTripsPerTank = totalPricingTrips;
  _pricingCurrentAvg   = totalPricingTrips > 0 ? totalPricingIncome/totalPricingTrips : 0;
  restorePricingSettings();
}

