// inbox.js: Quick Add inbox (v152c).
// quick.html drops small notes (type, amount, note, date) into yb_inbox_v1.
// This file shows them on Home and opens the REAL form prefilled, so every
// rand still goes through saveSpend / saveMove / saveMoneyIn. Nothing here
// writes to pockets, Cash Flow or banks. The key is device-local (not synced).
var INBOX_KEY = 'yb_inbox_v1';
var _inboxPendingId = null;

function inboxLoad(){ try { return JSON.parse(localStorage.getItem(INBOX_KEY) || '[]') || []; } catch(e){ return []; } }
function inboxStore(a){ try { localStorage.setItem(INBOX_KEY, JSON.stringify(a)); } catch(e){} }
function inboxRemove(id){
  inboxStore(inboxLoad().filter(function(e){ return e.id !== id; }));
  try { if(typeof renderHome === 'function') renderHome(); } catch(e){}
}

function inboxHomeHtml(){
  var a = inboxLoad();
  if(!a.length) return '';
  var names = { spend:'↑ Spend', move:'🔄 Move', moneyin:'↓ Money in' };
  var rows = a.map(function(e){
    var id = escHtml(e.id);
    return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid #2a2a2a;">'
      + '<div style="flex:1;min-width:0;"><div style="font-family:Syne,sans-serif;font-weight:700;font-size:16px;color:#efefef;">'+fmtR(e.amount)+'</div>'
      + '<div style="font-size:11px;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+(names[e.type]||'')+(e.note ? ' · '+escHtml(e.note) : '')+' · '+escHtml(e.date||'')+'</div></div>'
      + '<button onclick="inboxOpen(\''+id+'\')" style="background:#c8f230;border:none;border-radius:8px;padding:9px 14px;color:#000;font-family:\'DM Mono\',monospace;font-size:11px;font-weight:700;letter-spacing:1px;cursor:pointer;">LOG IT</button>'
      + '<button onclick="inboxRemove(\''+id+'\')" aria-label="Discard note" style="background:none;border:1px solid #333;border-radius:8px;padding:8px 10px;color:#888;cursor:pointer;">✕</button>'
      + '</div>';
  }).join('');
  return '<div style="background:#1a1a1a;border:1px solid #6a3aa0;border-radius:16px;padding:16px;margin-bottom:16px;">'
    + '<div style="font-size:10px;letter-spacing:3px;color:#c890ff;text-transform:uppercase;margin-bottom:6px;">Quick add · '+a.length+' waiting</div>'
    + rows + '</div>';
}

// Open the app's own form with the note filled in. The note is removed only
// after that form really saves (see the wrappers below).
function inboxOpen(id){
  var e = inboxLoad().find(function(x){ return x.id === id; });
  if(!e) return;
  function setVal(elId, v){
    var el = document.getElementById(elId);
    if(!el) return;
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles:true }));
    el.dispatchEvent(new Event('change', { bubbles:true }));
  }
  if(e.type === 'spend'){
    openSpend(null, { amount:e.amount, label:e.note || '' });
    setVal('spDate', e.date);
  } else if(e.type === 'move'){
    openMove();
    setVal('mvAmount', e.amount); setVal('mvNote', e.note || ''); setVal('mvDate', e.date);
  } else if(e.type === 'moneyin'){
    openMoneyIn();
    setVal('miAmount', e.amount); setVal('miNote', e.note || ''); setVal('miDate', e.date);
  }
  _inboxPendingId = id;   // set last: opening any form clears it (see below)
}

// Wrap each save: if a new record exists afterwards, the note is done.
(function(){
  function wrap(saveName, loadName){
    var orig = window[saveName];
    if(typeof orig !== 'function') return;
    window[saveName] = function(){
      var id = _inboxPendingId, before = id ? window[loadName]().length : 0;
      var out = orig.apply(this, arguments);
      if(id && window[loadName]().length > before){ _inboxPendingId = null; inboxRemove(id); }
      return out;
    };
  }
  wrap('saveSpend', 'loadSpendData');
  wrap('saveMove', 'loadMoveData');
  wrap('saveMoneyIn', 'loadMoneyInData');
  // Opening a form any other way (the + buttons, an edit) is not an inbox note.
  ['openSpend','openMove','openMoneyIn'].forEach(function(n){
    var o = window[n]; if(typeof o !== 'function') return;
    window[n] = function(){ _inboxPendingId = null; return o.apply(this, arguments); };
  });
  // Closing a form without saving keeps the note.
  ['closeSpend','closeMove','closeMoneyIn'].forEach(function(n){
    var o = window[n]; if(typeof o !== 'function') return;
    window[n] = function(){ var r = o.apply(this, arguments); setTimeout(function(){ _inboxPendingId = null; }, 0); return r; };
  });
  // Notes added in Quick Add while the dashboard was in the background.
  document.addEventListener('visibilitychange', function(){
    if(!document.hidden){ try { if(typeof renderHome === 'function') renderHome(); } catch(e){} }
  });
})();
