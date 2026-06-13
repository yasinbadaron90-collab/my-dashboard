// Core: storage, keys, auth, PIN, launch menu, drawer, theme

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
    + '<div style="font-size:10px;color:var(--muted);line-height:1.5;margin-bottom:12px;letter-spacing:0.5px;">'+hint+'</div>'
    + '<div style="display:flex;gap:6px;">'
    +   '<button id="storageErrorBackupBtn" style="flex:1;padding:9px 10px;background:#c8f230;border:none;border-radius:5px;color:#000;font-family:DM Mono,monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;font-weight:700;">Download Backup</button>'
    +   '<button id="storageErrorDismissBtn" style="padding:9px 12px;background:none;border:1px solid #2a2a2a;border-radius:5px;color:var(--muted);font-family:DM Mono,monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;">Dismiss</button>'
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
    +   '<div style="font-size:12px;color:var(--text);letter-spacing:0.3px;">Deleted '+_escSDLabel(label)+'</div>'
    +   '<div style="font-size:9px;color:var(--muted);letter-spacing:1.5px;text-transform:uppercase;margin-top:2px;" id="softDeleteCountdown">'+(ms/1000)+'s to undo</div>'
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
// ════════════════════════════════════════════════════════════════════
// SPINNER OVERLAY (item 12 — loading indicators)
// ════════════════════════════════════════════════════════════════════
// Shows a centred overlay with a spinner + message during slow operations
// (PDF generation, backup export, etc.). The spinner is a single shared
// DOM element that gets created on first call and reused — multiple calls
// to showSpinner stack the message but only show one overlay at a time.
//
// Usage:
//   showSpinner('Generating PDF…');
//   try { /* slow work */ } finally { hideSpinner(); }
//
// Always wrap slow work in try/finally so an error doesn't leave the
// spinner stuck on screen. setTimeout 0 around the slow work also lets
// the browser paint the spinner before blocking the main thread.
function _ensureSpinnerEl(){
  var el = document.getElementById('ybSpinnerOverlay');
  if(el) return el;
  el = document.createElement('div');
  el.id = 'ybSpinnerOverlay';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:none;align-items:center;justify-content:center;z-index:99999;backdrop-filter:blur(2px);';
  el.innerHTML = '<div style="background:#0d0d0d;border:1px solid #2a2a2a;border-radius:12px;padding:24px 32px;display:flex;flex-direction:column;align-items:center;gap:14px;min-width:200px;max-width:80vw;">'
    + '<div style="width:32px;height:32px;border:3px solid #1a2e00;border-top-color:#c8f230;border-radius:50%;animation:ybSpin 0.8s linear infinite;"></div>'
    + '<div id="ybSpinnerMsg" style="font-family:DM Mono,monospace;font-size:11px;letter-spacing:1px;color:var(--muted);text-align:center;line-height:1.5;">Working…</div>'
    + '</div>';
  document.body.appendChild(el);
  // Inject the keyframes once
  if(!document.getElementById('ybSpinnerStyle')){
    var style = document.createElement('style');
    style.id = 'ybSpinnerStyle';
    style.textContent = '@keyframes ybSpin { to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
  }
  return el;
}

function showSpinner(msg){
  try {
    var el = _ensureSpinnerEl();
    var msgEl = document.getElementById('ybSpinnerMsg');
    if(msgEl) msgEl.textContent = msg || 'Working…';
    el.style.display = 'flex';
  } catch(e){ console.warn('showSpinner failed', e); }
}

function hideSpinner(){
  try {
    var el = document.getElementById('ybSpinnerOverlay');
    if(el) el.style.display = 'none';
  } catch(e){ /* ignore */ }
}

// Helper that wraps a slow synchronous function in a spinner. The
// setTimeout gives the browser one paint cycle to draw the spinner
// before the heavy work blocks the thread.
function withSpinner(msg, fn){
  showSpinner(msg);
  setTimeout(function(){
    try { fn(); }
    catch(e){ console.error('withSpinner work failed', e); alert('Something went wrong — '+(e.message||'see console for details')); }
    finally { hideSpinner(); }
  }, 50);
}

// ════════════════════════════════════════════════════════════════════
// END SOFT-DELETE SYSTEM
// ════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════
// EMPTY STATE BUILDER (item 11)
// ════════════════════════════════════════════════════════════════════
// Renders a consistent "this section has no data yet" block. Used across
// the app so every empty list looks and behaves the same way: a friendly
// icon, a one-line message, an optional sub-explanation, and an optional
// call-to-action button.
//
// Usage:
//   container.innerHTML = buildEmptyState({
//     icon: '🤝',                          // single emoji or short string
//     title: 'Nobody owes you yet',         // headline
//     subtitle: 'Add someone you\'ve lent to', // optional explanation
//     ctaLabel: '+ Add Person',             // optional button text
//     ctaOnclick: 'openAddPersonModal()',   // optional inline handler
//     compact: false                        // use compact padding for inline
//   });
function buildEmptyState(opts){
  opts = opts || {};
  var icon      = opts.icon      || '📭';
  var title     = opts.title     || 'Nothing here yet';
  var subtitle  = opts.subtitle  || '';
  var ctaLabel  = opts.ctaLabel  || '';
  var ctaClick  = opts.ctaOnclick|| '';
  var compact   = !!opts.compact;
  var pad       = compact ? '20px 16px' : '40px 24px';

  var html = '<div style="text-align:center;padding:'+pad+';background:var(--surface);border:1px dashed var(--border);border-radius:10px;">'
    +   '<div style="font-size:'+(compact?'28':'42')+'px;line-height:1;margin-bottom:'+(compact?'8':'12')+'px;opacity:0.7;">'+icon+'</div>'
    +   '<div style="font-family:Syne,sans-serif;font-weight:700;font-size:'+(compact?'13':'15')+'px;color:var(--muted);letter-spacing:0.5px;">'+_eEsc(title)+'</div>';
  if(subtitle){
    html += '<div style="font-size:11px;color:var(--muted);letter-spacing:0.5px;margin-top:6px;line-height:1.5;">'+_eEsc(subtitle)+'</div>';
  }
  if(ctaLabel && ctaClick){
    html += '<button onclick="'+ctaClick+'" style="margin-top:'+(compact?'10':'16')+'px;background:#1a2e00;border:1px solid #3a5a00;border-radius:6px;padding:8px 18px;color:#c8f230;font-family:DM Mono,monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;font-weight:700;">'+_eEsc(ctaLabel)+'</button>';
  }
  html += '</div>';
  return html;
}

// Tiny escape helper local to the empty-state builder.
function _eEsc(s){
  if(s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
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


// Auth state — set by loginSuccess (Google Sign-In via firebase-sync.js)
let currentRole = 'guest';
let currentUser = null;

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
    // v101.1: launch menu replaced by Home page (Step 10). applyRole now
    // lands admin on page-home directly. Old call removed:
  }, 400);
}

document.addEventListener('DOMContentLoaded', function(){
  // Load all persisted in-memory state into globals before anything renders or saves.
  // Modules that hold their data in a top-level variable (cpData, funds, borrowData)
  // start empty at boot — if a save fires before the corresponding load runs, the
  // empty in-memory copy overwrites the real saved data. Loading them all here
  // prevents that.
  try { if(typeof loadCP       === 'function') loadCP();       } catch(e){}
  try { if(typeof loadFunds    === 'function') loadFunds();    } catch(e){}
  try { if(typeof loadBorrows  === 'function') loadBorrows();  } catch(e){}
  // Old PIN-era init removed — login is now Google Sign-In only (handled in firebase-sync.js)
});


function applyRole(){
  if(currentRole==='admin'){
    // Admin: start on HOME (Step 10 landing), show all nav tabs
    document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
    document.getElementById('page-home').classList.add('active');
    var navH = document.getElementById('navHome'); if(navH) navH.classList.add('active');
    document.getElementById('navCarpool').classList.remove('active');
    document.getElementById('navSavings').classList.remove('active');
    // Render home + pre-render commonly-visited tabs so navigation feels instant
    try { if(typeof renderHome    === 'function') renderHome();    } catch(e){}
    try { if(typeof renderCarpool === 'function') renderCarpool(); } catch(e){}
    try { if(typeof renderFunds   === 'function') renderFunds();   } catch(e){}
    try { if(typeof renderMaintCard === 'function') renderMaintCard(); } catch(e){}
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
  // Sign out of Firebase Google auth
  try {
    if(window._fb && window._fb.auth) window._fb.auth.signOut().catch(function(e){ console.warn('Firebase signOut', e); });
  } catch(e){ console.warn('Firebase signOut threw', e); }

  currentRole = 'guest';
  currentUser = null;
  // Clear cloud login form
  var em = document.getElementById('loginEmail'); if(em) em.value = '';
  var pw = document.getElementById('loginPassword'); if(pw) pw.value = '';
  var le = document.getElementById('loginError'); if(le) le.textContent = '';
  var ls = document.getElementById('loginStatus'); if(ls) ls.textContent = '';
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
  // Phase H: sync theme across devices
  try { if(window.cloudSync && window.cloudSync.settings) window.cloudSync.settings.push(); } catch(e){}
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
    +'<div><div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:13px;color:var(--text);">Generating PDF...</div>'
    +'<div style="font-size:10px;color:var(--muted);margin-top:2px;letter-spacing:1px;">'+yearData.year+' · Yasin Badaron</div></div>';
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
      +'<div style="font-size:10px;color:var(--muted);margin-top:2px;letter-spacing:1px;">Saved to your Downloads folder</div></div>';
    toast.style.borderColor = '#3a5a00';
    setTimeout(function(){
      toast.style.transition='opacity .4s'; toast.style.opacity='0';
      setTimeout(function(){ if(toast.parentNode) toast.parentNode.removeChild(toast); },400);
    },2500);
  },800);
}

// ════════════════════════════════════════════════════════════════════
// REPORTS TAB — section navigation
// ════════════════════════════════════════════════════════════════════
// Called by the section pill buttons at the top of the Reports tab.
// Smoothly scrolls to the requested section and highlights the active
// pill. Without this, the pills throw a ReferenceError on tap and the
// page stays still — which was the bug the user noticed when tapping
// the Fuel pill.
function rptScrollTo(sectionId){
  try {
    var el = document.getElementById(sectionId);
    if(!el){ console.warn('[rptScrollTo] Section not found:', sectionId); return; }
    // Smooth scroll with a small offset so the section heading isn't
    // jammed against the top nav bar.
    var rect = el.getBoundingClientRect();
    var scrollTarget = window.scrollY + rect.top - 80;
    window.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' });

    // Update pill active styles — the active pill gets the green
    // highlight, others go back to muted grey. Pills are identified by
    // their onclick attribute referring to this same function.
    try {
      document.querySelectorAll('button[onclick^="rptScrollTo("]').forEach(function(btn){
        var matches = btn.getAttribute('onclick').indexOf("'"+sectionId+"'") > -1;
        if(matches){
          btn.style.border  = '1px solid #2a5a00';
          btn.style.background = '#0d1a00';
          btn.style.color = '#c8f230';
        } else {
          btn.style.border  = '1px solid #333';
          btn.style.background = 'none';
          btn.style.color = '#888';
        }
      });
    } catch(e){ /* style update is non-critical */ }
  } catch(err){
    console.warn('[rptScrollTo] failed:', err);
  }
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
  // Use actual fuel log entries for the cycle instead of estimated daily rate
  var totalFuelCost = fuelTotal > 0 ? fuelTotal : drivingDayCount * dailyFuelCost;

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
      fuelRowsEl.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:12px 14px;">No fuel entries yet.</div>';
    } else {
      fuelData.slice().sort(function(a,b){ return b.date.localeCompare(a.date); }).forEach(function(x){
        var row = document.createElement('div');
        row.style.cssText = 'display:grid;grid-template-columns:1.5fr 1fr 1fr 28px;padding:9px 14px;border-bottom:1px solid var(--border);font-size:12px;align-items:center;';
        var litres = x.price > 0 ? (x.amount/x.price).toFixed(1)+'L' : '-';
        row.innerHTML = '<span style="color:var(--muted)">'+x.date+'</span>'
          +'<span style="color:var(--text)">R'+Number(x.price).toFixed(2)+' <span style="color:var(--muted);font-size:10px;">('+litres+')</span></span>'
          +'<span style="color:#a78bfa;font-weight:500">'+fmtR(x.amount)+'</span>'
          +'<span onclick="deleteFuelEntry(\''+x.id+'\')" style="color:var(--muted);cursor:pointer;font-size:18px;line-height:1;text-align:center;">&times;</span>';
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
      plRowsEl.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:12px 14px;">No carpool data this cycle yet.</div>';
    } else {
      plRowsEl.innerHTML = '';
      dayRows.forEach(function(d){
        var pct      = Math.min(100, Math.round((d.income / dailyFuelCost)*100));
        var dColor   = pct >= 100 ? '#c8f230' : pct >= 66 ? '#f2a830' : '#f23060';
        var pctLabel = pct >= 100 ? '✅ '+pct+'%' : pct+'%';
        var paxStr   = d.pax.length > 0 ? d.pax.join(', ') : '—';
        var row = document.createElement('div');
        row.style.cssText = 'padding:9px 14px;border-bottom:1px solid var(--border);';
        row.innerHTML =
          '<div style="display:grid;grid-template-columns:1.2fr 0.8fr 1fr 1fr 1fr;font-size:11px;align-items:center;margin-bottom:5px;">'
          +'<span style="color:var(--muted)">'+d.ds+'</span>'
          +'<span style="color:var(--muted);text-align:center;">'+paxStr+'</span>'
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
        '<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:14px;color:var(--text);margin-bottom:8px;">'+p+'</div>'
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

