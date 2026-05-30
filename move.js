// ════════════════════════════════════════════════════════════════════════
// MOVE — Step 5 of the pocket-first build (deployed 2026-05-28)
// ════════════════════════════════════════════════════════════════════════
// Model: money lives in pockets. A Move shuffles money between TWO pockets.
// It is NOT income and NOT an expense — money never enters or leaves you, it
// just rebalances. Therefore:
//
//   • NO Cash Flow row is posted (a move never inflates income/expense totals)
//   • The bank (FNB/TymeBank/Cash) is NEVER touched — no doorway, no baseline
//     adjustment. Nothing can drift because nothing moved through a bank.
//
// Each move posts TWO pocket deposits, linked by a moveId:
//   • From pocket → txnType:'out'  (balance drops)
//   • To   pocket → txnType:'in'   (balance rises)
//
// Edit/delete reverses BOTH sides atomically — both deposits removed, the
// move record cleared. Banks stay exactly where they were.
//
// Hard-block guard: tapping ✕ on either pocket's deposit history fires the
// purple cascade dialog and reverses the WHOLE move (both sides), rather than
// orphaning one half. Same Case-A pattern as Money In / Spend / Repayment.
// ════════════════════════════════════════════════════════════════════════

var MOVE_KEY = 'yb_moves_v1';

// ── Storage ─────────────────────────────────────────────────────────────
function loadMoveData(){
  try { return JSON.parse(lsGet(MOVE_KEY) || '[]'); }
  catch(e){ return []; }
}
function saveMoveData(arr){ lsSet(MOVE_KEY, JSON.stringify(arr)); }

// ── State ───────────────────────────────────────────────────────────────
var _mvState = {
  editingId: null,
  fromId: null,
  toId: null,
  amount: 0,
  date: '',
  note: ''
};

// ── Open / close ──────────────────────────────────────────────────────────
function openMove(editingId){
  _mvState = {
    editingId: editingId || null,
    fromId: null,
    toId: null,
    amount: 0,
    date: localDateStr(new Date()),
    note: ''
  };

  // If editing, populate from the existing record
  if(editingId){
    var all = loadMoveData();
    var rec = all.find(function(r){ return r.id === editingId; });
    if(rec){
      _mvState.fromId = rec.fromId;
      _mvState.toId   = rec.toId;
      _mvState.amount = rec.amount;
      _mvState.date   = rec.date;
      _mvState.note   = rec.note || '';
    }
  }

  var titleEl = document.getElementById('mvModalTitle');
  if(titleEl) titleEl.textContent = editingId ? '🔄 Edit Move' : '🔄 Move';

  var amtEl  = document.getElementById('mvAmount');
  var dateEl = document.getElementById('mvDate');
  var noteEl = document.getElementById('mvNote');
  if(amtEl)  amtEl.value  = _mvState.amount > 0 ? _mvState.amount : '';
  if(dateEl) dateEl.value = _mvState.date;
  if(noteEl) noteEl.value = _mvState.note;

  _mvRenderPocketLists();
  _mvUpdateSaveButton();

  var modal = document.getElementById('moveModal');
  if(modal) modal.classList.add('active');
}

function closeMove(){
  var modal = document.getElementById('moveModal');
  if(modal) modal.classList.remove('active');
}

// ── Balance helper (works for normal + isExpense pockets via fundTotal) ────
function _mvBalance(f){
  return (typeof fundTotal === 'function') ? fundTotal(f) : 0;
}

// ── Render the From + To pocket pickers ───────────────────────────────────
function _mvRenderPocketLists(){
  var fromList = document.getElementById('mvFromList');
  var toList   = document.getElementById('mvToList');
  if(!fromList || !toList) return;

  var visible = (funds || []).filter(function(f){ return !f._deleted; });

  if(!visible.length){
    var empty = '<div style="padding:14px;color:var(--muted);font-size:11px;text-align:center;letter-spacing:1px;">No pockets yet. Create one on the Savings tab.</div>';
    fromList.innerHTML = empty;
    toList.innerHTML   = empty;
    return;
  }

  fromList.innerHTML = '';
  toList.innerHTML   = '';

  visible.forEach(function(f){
    fromList.appendChild(_mvPocketRow(f, 'from'));
    toList.appendChild(_mvPocketRow(f, 'to'));
  });
}

function _mvPocketRow(f, side){
  var bal = _mvBalance(f);
  var isFromSide = (side === 'from');
  var selected = isFromSide ? (_mvState.fromId === f.id) : (_mvState.toId === f.id);

  // The opposite side's pick is disabled here (can't move into the same pocket).
  var disabled = isFromSide
    ? (_mvState.toId === f.id)
    : (_mvState.fromId === f.id);

  var balColor = bal <= 0 ? '#555' : '#c8f230';
  var row = document.createElement('button');
  row.type = 'button';
  row.dataset.fundId = f.id;

  if(disabled){
    row.style.cssText = 'width:100%;text-align:left;background:#0a0a0a;border:1px solid #1a1a1a;border-radius:7px;padding:10px 12px;margin-bottom:6px;cursor:not-allowed;opacity:.32;display:flex;align-items:center;gap:10px;font-family:DM Mono,monospace;';
    row.disabled = true;
    var dimLabel = isFromSide ? ' · (the To pocket)' : ' · (the From pocket)';
    row.innerHTML =
      '<span style="font-size:18px;flex-shrink:0;">' + (f.emoji || '💰') + '</span>' +
      '<span style="flex:1;font-size:12px;color:#777;">' + escapeMvHTML(f.name) + dimLabel + '</span>' +
      '<span style="font-size:11px;color:var(--muted);font-family:Syne,sans-serif;font-weight:700;">—</span>';
    return row;
  }

  row.onclick = function(){ _mvPick(side, f.id); };
  row.style.cssText = 'width:100%;text-align:left;background:' +
    (selected ? '#1a1030' : '#0a0a0a') +
    ';border:1px solid ' + (selected ? '#6a4ac0' : '#1a1a1a') +
    ';border-radius:7px;padding:10px 12px;margin-bottom:6px;cursor:pointer;display:flex;align-items:center;gap:10px;font-family:DM Mono,monospace;';
  row.innerHTML =
    '<span style="font-size:18px;flex-shrink:0;">' + (f.emoji || '💰') + '</span>' +
    '<span style="flex:1;font-size:12px;color:' + (selected ? '#a78bfa' : '#efefef') + ';">' + escapeMvHTML(f.name) + '</span>' +
    '<span style="font-size:11px;color:' + balColor + ';font-family:Syne,sans-serif;font-weight:700;">' + fmtR(bal) + '</span>';
  return row;
}

function _mvPick(side, fundId){
  if(side === 'from'){
    _mvState.fromId = fundId;
    // If they picked the same pocket on both sides somehow, clear To.
    if(_mvState.toId === fundId) _mvState.toId = null;
  } else {
    _mvState.toId = fundId;
    if(_mvState.fromId === fundId) _mvState.fromId = null;
  }
  _mvRenderPocketLists();
  _mvUpdateSaveButton();
}

// ── Header-edit handlers ──────────────────────────────────────────────────
function _mvOnAmountEdit(){
  var v = parseFloat(document.getElementById('mvAmount').value);
  _mvState.amount = (isFinite(v) && v > 0) ? v : 0;
  _mvUpdateSaveButton();
}
function _mvOnDateEdit(){
  _mvState.date = document.getElementById('mvDate').value || localDateStr(new Date());
}
function _mvOnNoteEdit(){
  _mvState.note = (document.getElementById('mvNote').value || '').trim();
}

// ── Save button state machine ─────────────────────────────────────────────
function _mvUpdateSaveButton(){
  var btn = document.getElementById('mvSaveBtn');
  if(!btn) return;

  var from = _mvState.fromId ? funds.find(function(x){ return x.id === _mvState.fromId; }) : null;
  var to   = _mvState.toId   ? funds.find(function(x){ return x.id === _mvState.toId;   }) : null;
  var amount = _mvState.amount;

  if(!from){ _mvLockButton(btn, '🔒 Pick a From pocket'); return; }
  if(!to){   _mvLockButton(btn, '🔒 Pick a To pocket');   return; }
  if(from.id === to.id){ _mvLockButton(btn, '🔒 Pick two different pockets'); return; }
  if(!amount || amount <= 0){ _mvLockButton(btn, '🔒 Enter an amount'); return; }

  // From-pocket balance (add back the original amount if editing the same From)
  var fromBal = _mvBalance(from);
  if(_mvState.editingId){
    var all = loadMoveData();
    var oldRec = all.find(function(r){ return r.id === _mvState.editingId; });
    if(oldRec && oldRec.fromId === _mvState.fromId){
      fromBal += oldRec.amount;
    }
  }

  // Can't move more than the From pocket holds. (Hard limit — unlike Spend's
  // soft "save anyway", a move has no merchant; over-moving makes no sense.)
  if(amount > fromBal){
    _mvLockButton(btn, '🔒 Only ' + fmtR(fromBal) + ' in ' + from.name);
    return;
  }

  btn.disabled = false;
  btn.style.cursor = 'pointer';
  btn.style.opacity = '1';
  btn.style.background = '#a78bfa';
  btn.style.color = '#000';
  btn.textContent = (_mvState.editingId ? '✓ Save changes · ' : '🔄 Move ') + fmtR(amount);
}
function _mvLockButton(btn, label){
  btn.disabled = true;
  btn.style.cursor = 'not-allowed';
  btn.style.opacity = '.45';
  btn.style.background = '#2a2a2a';
  btn.style.color = '#888';
  btn.textContent = label;
}

// ── Save ────────────────────────────────────────────────────────────────
function saveMove(){
  // Sync from visible inputs (last write wins)
  _mvState.amount = parseFloat(document.getElementById('mvAmount').value) || 0;
  _mvState.date   = document.getElementById('mvDate').value || localDateStr(new Date());
  _mvState.note   = (document.getElementById('mvNote').value || '').trim();

  var from = funds.find(function(x){ return x.id === _mvState.fromId; });
  var to   = funds.find(function(x){ return x.id === _mvState.toId; });

  // Final validation
  if(!from){ alert('Pick a From pocket.'); return; }
  if(!to){ alert('Pick a To pocket.'); return; }
  if(from.id === to.id){ alert('Pick two different pockets.'); return; }
  if(_mvState.amount <= 0){ alert('Enter a valid amount.'); return; }

  var fromBalCheck = _mvBalance(from);
  if(_mvState.editingId){
    var allChk = loadMoveData();
    var oldChk = allChk.find(function(r){ return r.id === _mvState.editingId; });
    if(oldChk && oldChk.fromId === _mvState.fromId) fromBalCheck += oldChk.amount;
  }
  if(_mvState.amount > fromBalCheck){
    alert('Only ' + fmtR(fromBalCheck) + ' available in ' + from.name + '.');
    return;
  }

  // If editing, reverse the old record first (silent — we rebuild now)
  if(_mvState.editingId){
    _moveReverse(_mvState.editingId, { silent: true });
    // Re-resolve pockets after reverse (the deposits were removed)
    from = funds.find(function(x){ return x.id === _mvState.fromId; });
    to   = funds.find(function(x){ return x.id === _mvState.toId; });
  }

  var moveId = 'mv_' + uid();

  // 1) Out of the From pocket
  var fromDepId = uid();
  from.deposits.push({
    id: fromDepId,
    txnType: 'out',
    amount: _mvState.amount,
    date: _mvState.date,
    note: '🔄 Move → ' + to.name + (_mvState.note ? ' · ' + _mvState.note : ''),
    moveId: moveId
  });

  // 2) Into the To pocket
  var toDepId = uid();
  to.deposits.push({
    id: toDepId,
    txnType: 'in',
    amount: _mvState.amount,
    date: _mvState.date,
    note: '🔄 Move ← ' + from.name + (_mvState.note ? ' · ' + _mvState.note : ''),
    moveId: moveId
  });

  saveFunds();

  // 3) NO Cash Flow row. NO bank baseline adjustment. A move is internal.

  // 4) Save the Move record itself
  var all = loadMoveData();
  all.push({
    id: moveId,
    fromId: _mvState.fromId,
    toId: _mvState.toId,
    amount: _mvState.amount,
    date: _mvState.date,
    note: _mvState.note,
    fromDepId: fromDepId,
    toDepId: toDepId,
    createdAt: new Date().toISOString()
  });
  saveMoveData(all);

  // 5) Refresh UI
  closeMove();
  try { renderFunds(); } catch(e){}
  try { if(typeof renderBankBalanceCard === 'function') renderBankBalanceCard(); } catch(e){}
  try { if(typeof odinRefreshIfOpen === 'function') odinRefreshIfOpen(); } catch(e){}

  if(typeof softDeleteToast === 'function'){
    softDeleteToast({
      message: '🔄 Moved ' + fmtR(_mvState.amount) + ' · ' + from.name + ' → ' + to.name,
      duration: 3500
    });
  }
}

// ── Reverse a Move (used by edit-replay and delete) ───────────────────────
function _moveReverse(moveId, opts){
  opts = opts || {};
  var all = loadMoveData();
  var rec = all.find(function(r){ return r.id === moveId; });
  if(!rec) return false;

  // 1) Remove the From-pocket deposit
  var from = funds.find(function(f){ return f.id === rec.fromId; });
  if(from && rec.fromDepId){
    from.deposits = (from.deposits || []).filter(function(d){ return d.id !== rec.fromDepId; });
  }

  // 2) Remove the To-pocket deposit
  var to = funds.find(function(f){ return f.id === rec.toId; });
  if(to && rec.toDepId){
    to.deposits = (to.deposits || []).filter(function(d){ return d.id !== rec.toDepId; });
  }

  // 3) No Cash Flow row was ever posted, and no bank baseline was touched.
  //    So there's nothing to reverse on those fronts. The pockets are symmetric.

  // 4) Remove the Move record itself
  all = all.filter(function(r){ return r.id !== moveId; });
  saveMoveData(all);
  saveFunds();

  if(!opts.silent){
    try { renderFunds(); } catch(e){}
    try { if(typeof renderBankBalanceCard === 'function') renderBankBalanceCard(); } catch(e){}
    try { if(typeof odinRefreshIfOpen === 'function') odinRefreshIfOpen(); } catch(e){}
  }
  return true;
}

// ── Public delete (with confirm) ──────────────────────────────────────────
function deleteMove(moveId){
  var all = loadMoveData();
  var rec = all.find(function(r){ return r.id === moveId; });
  if(!rec) return;

  var from = funds.find(function(f){ return f.id === rec.fromId; });
  var to   = funds.find(function(f){ return f.id === rec.toId; });
  var fname = from ? from.name : 'From pocket';
  var tname = to ? to.name : 'To pocket';
  var label = '🔄 ' + fname + ' → ' + tname + ' · ' + fmtR(rec.amount) + ' · ' + rec.date;

  function doDelete(){
    _moveReverse(moveId);
    if(typeof softDeleteToast === 'function'){
      softDeleteToast({ message: 'Move reversed · ' + fmtR(rec.amount) + ' back to ' + fname, duration: 3000 });
    }
  }

  if(typeof mihbConfirm === 'function'){
    mihbConfirm({
      title:       'Delete this Move?',
      body:        label + '\n\nThis puts ' + fmtR(rec.amount) + ' back in ' + fname + ' and removes it from ' + tname + '. Banks are untouched.',
      dangerLabel: '↩ Reverse the move',
      safeLabel:   'Leave it alone'
    }, function(go){ if(go) doDelete(); });
  } else {
    if(confirm('Delete this Move?\n\n' + label + '\n\n' + fmtR(rec.amount) + ' goes back to ' + fname + '.')){
      doDelete();
    }
  }
}

// ── Edit (re-opens the Move modal with the record loaded) ─────────────────
function editMove(moveId){ openMove(moveId); }

// ── HTML escape (local util) ──────────────────────────────────────────────
function escapeMvHTML(s){
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Expose globals so onclick="" handlers in index.html can find them ─────
if(typeof window !== 'undefined'){
  window.openMove        = openMove;
  window.closeMove       = closeMove;
  window.saveMove        = saveMove;
  window.deleteMove      = deleteMove;
  window.editMove        = editMove;
  window._moveReverse    = _moveReverse;
  window._mvOnAmountEdit = _mvOnAmountEdit;
  window._mvOnDateEdit   = _mvOnDateEdit;
  window._mvOnNoteEdit   = _mvOnNoteEdit;
}
