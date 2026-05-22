// ════════════════════════════════════════════════════════════════════════
// SPEND — Step 2 of the pocket-first build (deployed 2026-05-22)
// ════════════════════════════════════════════════════════════════════════
// Model: money lives in pockets. A Spend deducts from ONE pocket and posts
// ONE Cash Flow expense row. The bank (FNB/TymeBank/Cash) is just a doorway
// the money passes through — its baseline lands at exactly where it started.
//
// Bank doorway choice:
//   • "Direct" (default) → no bank baseline adjustment. Pocket → out.
//   • FNB / TymeBank / Cash → +amount (pocket pushes to bank) − amount (bank
//     pays merchant). Net bank delta = 0. Doorway honoured.
//
// Cash Flow row's "account" field stores the POCKET NAME (Style 3, locked).
// destBank stores the bank if one was picked; null if Direct.
//
// Edit/delete reverses everything atomically — pocket deposit removed, CF
// row purged, bank baseline restored. Same pattern as Money In.
// ════════════════════════════════════════════════════════════════════════

var SPEND_KEY = 'yb_spend_v1';

// ── Storage ────────────────────────────────────────────────────────────
function loadSpendData(){
  try { return JSON.parse(lsGet(SPEND_KEY) || '[]'); }
  catch(e){ return []; }
}
function saveSpendData(arr){ lsSet(SPEND_KEY, JSON.stringify(arr)); }

// ── State ──────────────────────────────────────────────────────────────
var _spState = {
  editingId: null,
  amount: 0,
  label: '',
  date: '',
  pocketId: null,
  doorway: 'DIRECT'   // 'FNB' | 'TymeBank' | 'Cash' | 'DIRECT'
};

// ── Open / close ───────────────────────────────────────────────────────
function openSpend(editingId){
  // Reset state
  _spState = {
    editingId: editingId || null,
    amount: 0,
    label: '',
    date: localDateStr(new Date()),
    pocketId: null,
    doorway: 'DIRECT'
  };

  // If editing, populate from the existing record
  if(editingId){
    var all = loadSpendData();
    var rec = all.find(function(r){ return r.id === editingId; });
    if(rec){
      _spState.amount   = rec.amount;
      _spState.label    = rec.label || '';
      _spState.date     = rec.date;
      _spState.pocketId = rec.pocketId;
      _spState.doorway  = rec.doorway || 'DIRECT';
    }
  }

  // Title
  var titleEl = document.getElementById('spModalTitle');
  if(titleEl) titleEl.textContent = editingId ? '↑ Edit Spend' : '↑ Spend';

  // Wire visible inputs to state
  var amtEl   = document.getElementById('spAmount');
  var lblEl   = document.getElementById('spLabel');
  var dateEl  = document.getElementById('spDate');
  if(amtEl)  amtEl.value  = _spState.amount > 0 ? _spState.amount : '';
  if(lblEl)  lblEl.value  = _spState.label;
  if(dateEl) dateEl.value = _spState.date;

  // Render pocket list + doorway buttons
  _spRenderPocketList();
  _spSetDoorway(_spState.doorway);
  _spUpdateSaveButton();

  // Show modal
  var modal = document.getElementById('spendModal');
  if(modal) modal.classList.add('active');

  setTimeout(function(){
    if(lblEl) lblEl.focus();
  }, 100);
}

function closeSpend(){
  var modal = document.getElementById('spendModal');
  if(modal) modal.classList.remove('active');
}

// ── Render the pocket picker (one row per pocket, balance shown) ───────
function _spRenderPocketList(){
  var list = document.getElementById('spPocketList');
  if(!list) return;
  list.innerHTML = '';

  var visible = (funds || []).filter(function(f){ return !f._deleted; });
  if(!visible.length){
    list.innerHTML = '<div style="padding:14px;color:#555;font-size:11px;text-align:center;letter-spacing:1px;">No pockets yet. Create one on the Savings tab.</div>';
    return;
  }

  visible.forEach(function(f){
    var bal;
    if(f.isExpense){
      var totalIn  = (f.deposits||[]).filter(function(d){ return d.txnType === 'in'; })
                                     .reduce(function(s,d){ return s + d.amount; }, 0);
      var totalOut = (f.deposits||[]).filter(function(d){ return d.txnType === 'out' || !d.txnType; })
                                     .reduce(function(s,d){ return s + d.amount; }, 0);
      bal = totalIn - totalOut;
    } else {
      bal = fundTotal(f);
    }

    var selected = (_spState.pocketId === f.id);
    var balColor = bal <= 0 ? '#555' : '#c8f230';

    var row = document.createElement('button');
    row.type = 'button';
    row.dataset.fundId = f.id;
    row.onclick = function(){ _spPickPocket(f.id); };
    row.style.cssText = 'width:100%;text-align:left;background:' +
      (selected ? '#1a2e00' : '#0a0a0a') +
      ';border:1px solid ' + (selected ? '#5a8800' : '#1a1a1a') +
      ';border-radius:7px;padding:10px 12px;margin-bottom:6px;cursor:pointer;display:flex;align-items:center;gap:10px;font-family:DM Mono,monospace;';
    row.innerHTML =
      '<span style="font-size:18px;flex-shrink:0;">' + (f.emoji || '💰') + '</span>' +
      '<span style="flex:1;font-size:12px;color:' + (selected ? '#c8f230' : '#efefef') + ';">' + escapeSpHTML(f.name) + '</span>' +
      '<span style="font-size:11px;color:' + balColor + ';font-family:Syne,sans-serif;font-weight:700;">' + fmtR(bal) + '</span>';
    list.appendChild(row);
  });
}

function _spPickPocket(fundId){
  _spState.pocketId = fundId;
  _spRenderPocketList();
  _spUpdateSaveButton();
}

// ── Doorway picker (FNB / TymeBank / Cash / Direct) ────────────────────
function _spSetDoorway(d){
  _spState.doorway = d;
  ['FNB','TymeBank','Cash','DIRECT'].forEach(function(b){
    var btn = document.getElementById('spDoor_' + b);
    if(!btn) return;
    var on = (b === d);
    if(on){
      btn.style.background   = '#1a2e00';
      btn.style.borderColor  = '#c8f230';
      btn.style.color        = '#c8f230';
    } else {
      btn.style.background   = '#0d0d0d';
      btn.style.borderColor  = '#2a2a2a';
      btn.style.color        = '#888';
    }
  });
}

// ── Header-edit handlers ───────────────────────────────────────────────
function _spOnLabelEdit(){
  _spState.label = (document.getElementById('spLabel').value || '').trim();
  _spUpdateSaveButton();
}
function _spOnAmountEdit(){
  var v = parseFloat(document.getElementById('spAmount').value);
  _spState.amount = (isFinite(v) && v > 0) ? v : 0;
  _spUpdateSaveButton();
}
function _spOnDateEdit(){
  _spState.date = document.getElementById('spDate').value || localDateStr(new Date());
}

// ── Save button state machine ──────────────────────────────────────────
function _spUpdateSaveButton(){
  var btn = document.getElementById('spSaveBtn');
  if(!btn) return;

  var amount  = _spState.amount;
  var label   = (_spState.label || '').trim();
  var pocket  = _spState.pocketId ? funds.find(function(x){ return x.id === _spState.pocketId; }) : null;

  // Validation states
  if(!label){
    _spLockButton(btn, '🔒 Enter what it was for');
    return;
  }
  if(!amount || amount <= 0){
    _spLockButton(btn, '🔒 Enter an amount');
    return;
  }
  if(!pocket){
    _spLockButton(btn, '🔒 Pick a pocket');
    return;
  }

  // Compute pocket balance (read-only check — we do NOT block negative; Option A)
  var bal;
  if(pocket.isExpense){
    var inSum  = (pocket.deposits||[]).filter(function(d){ return d.txnType === 'in'; })
                                      .reduce(function(s,d){ return s + d.amount; }, 0);
    var outSum = (pocket.deposits||[]).filter(function(d){ return d.txnType === 'out' || !d.txnType; })
                                      .reduce(function(s,d){ return s + d.amount; }, 0);
    bal = inSum - outSum;
  } else {
    bal = fundTotal(pocket);
  }

  // If editing, the original Spend was already deducted — add it back so we
  // compare against the "pre-spend" balance.
  if(_spState.editingId){
    var all = loadSpendData();
    var oldRec = all.find(function(r){ return r.id === _spState.editingId; });
    if(oldRec && oldRec.pocketId === _spState.pocketId){
      bal += oldRec.amount;
    }
  }

  // Soft warning if pocket would go negative (allowed per Option A, but flag it)
  if(amount > bal){
    btn.disabled = false;
    btn.style.cursor = 'pointer';
    btn.style.opacity = '1';
    btn.style.background = '#f2a830';
    btn.style.color = '#000';
    btn.textContent = '⚠ Pocket short — save anyway · ' + fmtR(amount);
    return;
  }

  // All good
  btn.disabled = false;
  btn.style.cursor = 'pointer';
  btn.style.opacity = '1';
  btn.style.background = '#c8f230';
  btn.style.color = '#000';
  btn.textContent = (_spState.editingId ? '✓ Save changes · ' : '↑ Spend ') + fmtR(amount);
}
function _spLockButton(btn, label){
  btn.disabled = true;
  btn.style.cursor = 'not-allowed';
  btn.style.opacity = '.45';
  btn.style.background = '#2a2a2a';
  btn.style.color = '#888';
  btn.textContent = label;
}

// ── Save ───────────────────────────────────────────────────────────────
function saveSpend(){
  // Sync from visible inputs (last write wins)
  _spState.label   = (document.getElementById('spLabel').value || '').trim();
  _spState.amount  = parseFloat(document.getElementById('spAmount').value) || 0;
  _spState.date    = document.getElementById('spDate').value || localDateStr(new Date());

  // Final validation
  if(!_spState.label){ alert('Enter what it was for.'); return; }
  if(_spState.amount <= 0){ alert('Enter a valid amount.'); return; }
  if(!_spState.pocketId){ alert('Pick a pocket.'); return; }

  var pocket = funds.find(function(x){ return x.id === _spState.pocketId; });
  if(!pocket){ alert('Pocket not found.'); return; }

  // If editing, reverse the old record first (silent — we rebuild now)
  if(_spState.editingId){
    _spendReverse(_spState.editingId, { silent: true });
  }

  // ── Build the new linked record ──
  var spId = 'sp_' + uid();
  var doorway = _spState.doorway || 'DIRECT';
  var bankForCF = (doorway === 'DIRECT') ? null : doorway;

  // The badge / Cash Flow "account" field = pocket name with emoji (Style 3)
  var pocketLabel = (pocket.emoji ? pocket.emoji + ' ' : '') + pocket.name;

  // 1) Push the deposit onto the pocket (txnType:'out' deducts balance)
  var depositId = uid();
  var deposit = {
    id: depositId,
    txnType: 'out',
    amount: _spState.amount,
    date: _spState.date,
    note: '↑ ' + _spState.label,
    cfPosted: true,
    spendId: spId
  };
  pocket.deposits.push(deposit);
  saveFunds();

  // 2) Post the Cash Flow expense
  //    account = pocket label (Style 3)
  //    destBank = the doorway IF one was picked (so bank-baseline reversal
  //               works on delete via removeFromCF)
  var cfId = null;
  try {
    var cfData = loadCFData();
    var mk = (_spState.date || localDateStr(new Date())).slice(0, 7);
    if(!cfData[mk]) cfData[mk] = { income: [], expenses: [] };
    cfId = uid();
    var cfRec = {
      id: cfId,
      label: _spState.label,
      amount: _spState.amount,
      date: _spState.date,
      icon: '↑',
      auto: false,
      account: pocketLabel,
      sourceType: 'pocket_spend',
      sourceId: _spState.pocketId,
      sourceCardName: pocket.name,
      note: 'Spend · from ' + pocket.name + (bankForCF ? ' via ' + bankForCF : ' (direct)'),
      spendId: spId,
      createdAt: new Date().toISOString()
    };
    if(bankForCF) cfRec.destBank = bankForCF;
    cfData[mk].expenses.push(cfRec);
    saveCFData(cfData);
  } catch(e){ console.warn('[spend] CF post failed', e); }

  // 3) Bank baseline math
  //    Direct (no bank): no adjustment — money never touched the bank.
  //    Bank picked: pocket pushes money to bank (+amount), then bank pays
  //                 merchant (-amount). Net delta = 0. Doorway honoured.
  if(bankForCF){
    try {
      if(typeof window._adjustBaselineForBank === 'function'){
        window._adjustBaselineForBank(bankForCF, _spState.amount);   // pocket → bank
        window._adjustBaselineForBank(bankForCF, -_spState.amount);  // bank → out
        // Net: 0. Bank tile shows the same balance as before.
      }
    } catch(e){ console.warn('[spend] baseline adjust failed', e); }
  }

  // 4) Save the Spend record itself
  var all = loadSpendData();
  var rec = {
    id: spId,
    label: _spState.label,
    amount: _spState.amount,
    date: _spState.date,
    pocketId: _spState.pocketId,
    doorway: doorway,
    depositId: depositId,
    cfId: cfId,
    createdAt: new Date().toISOString()
  };
  all.push(rec);
  saveSpendData(all);

  // 5) Refresh UI
  closeSpend();
  try { renderFunds(); } catch(e){}
  try { if(typeof renderCashFlow === 'function') renderCashFlow(); } catch(e){}
  try { if(typeof renderBankBalanceCard === 'function') renderBankBalanceCard(); } catch(e){}
  try { if(typeof odinRefreshIfOpen === 'function') odinRefreshIfOpen(); } catch(e){}

  // Toast
  if(typeof softDeleteToast === 'function'){
    softDeleteToast({
      message: '↑ Spend logged · ' + fmtR(_spState.amount) + ' from ' + pocket.name,
      duration: 3500
    });
  }
}

// ── Reverse a Spend (used by edit-replay and delete) ───────────────────
function _spendReverse(spId, opts){
  opts = opts || {};
  var all = loadSpendData();
  var rec = all.find(function(r){ return r.id === spId; });
  if(!rec) return false;

  // 1) Remove the pocket deposit
  var pocket = funds.find(function(f){ return f.id === rec.pocketId; });
  if(pocket && rec.depositId){
    pocket.deposits = (pocket.deposits || []).filter(function(d){
      return d.id !== rec.depositId;
    });
  }

  // 2) Remove the Cash Flow expense (use direct filter so the bank-baseline
  //    auto-reversal in removeFromCF doesn't double-fire — we already netted
  //    the bank to zero, so removing the CF row must not adjust the bank.)
  if(rec.cfId){
    try {
      var cfData = loadCFData();
      var mk = (rec.date || '').slice(0, 7);
      if(cfData[mk] && cfData[mk].expenses){
        cfData[mk].expenses = cfData[mk].expenses.filter(function(e){
          return e.id !== rec.cfId;
        });
        saveCFData(cfData);
      }
    } catch(e){}
  }

  // 3) Reverse the bank baseline IF a doorway was used
  //    The save did +amount then -amount (net 0). Reversing means undoing
  //    BOTH — which is also net 0. So… nothing to do. The doorway is symmetric.
  //
  //    (We intentionally bypass removeFromCF above to avoid it trying to
  //    reverse a "phantom" baseline effect that was already netted out.)

  // 4) Remove the Spend record itself
  all = all.filter(function(r){ return r.id !== spId; });
  saveSpendData(all);
  saveFunds();

  if(!opts.silent){
    try { renderFunds(); } catch(e){}
    try { if(typeof renderCashFlow === 'function') renderCashFlow(); } catch(e){}
    try { if(typeof renderBankBalanceCard === 'function') renderBankBalanceCard(); } catch(e){}
  }
  return true;
}

// ── Public delete (with confirm) ───────────────────────────────────────
function deleteSpend(spId){
  var all = loadSpendData();
  var rec = all.find(function(r){ return r.id === spId; });
  if(!rec) return;

  var pocket = funds.find(function(f){ return f.id === rec.pocketId; });
  var pname = pocket ? pocket.name : 'pocket';
  var label = (rec.label || 'Spend') + ' · ' + fmtR(rec.amount) + ' · ' + rec.date;

  function doDelete(){
    _spendReverse(spId);
    if(typeof softDeleteToast === 'function'){
      softDeleteToast({ message: 'Spend reversed · ' + fmtR(rec.amount) + ' back to ' + pname, duration: 3000 });
    }
  }

  // Custom dialog if available; native confirm() fallback
  if(typeof mihbConfirm === 'function'){
    mihbConfirm({
      title:       'Delete this Spend?',
      message:     label + '\n\nThis returns ' + fmtR(rec.amount) + ' to ' + pname + ' and removes the Cash Flow row. The bank stays where it is.',
      dangerLabel: '↩ Delete & return to pocket',
      safeLabel:   'Leave it alone'
    }, function(go){ if(go) doDelete(); });
  } else {
    if(confirm('Delete this Spend?\n\n' + label + '\n\n' + fmtR(rec.amount) + ' returns to ' + pname + '.')){
      doDelete();
    }
  }
}

// ── Edit (re-opens the Spend modal with the record loaded) ─────────────
function editSpend(spId){
  openSpend(spId);
}

// ── HTML escape (small util — keep local so we don't depend on core) ───
function escapeSpHTML(s){
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
