// Money Owed: external borrows, borrow logging, PDF export

// ══ MONEY OWED ══

function loadExternalBorrows(){
  try{ return JSON.parse(lsGet(EXTERNAL_BORROW_KEY)||'{}'); }catch(e){ return {}; }
}
function saveExternalBorrows(data){ lsSet(EXTERNAL_BORROW_KEY, JSON.stringify(data)); }

function openExternalBorrowModal(){
  document.getElementById('extBorrowName').value = '';
  document.getElementById('extBorrowAmt').value = '';
  document.getElementById('extBorrowDate').value = localDateStr(new Date());
  document.getElementById('extBorrowNote').value = '';
  _extLendSelectedPocketId = null;               // v90 — reset pocket choice
  _extHistoricalMode = false;                    // v142c — reset historical toggle
  _applyExtHistoricalUI();
  renderExtLendPocketPicker();                    // v90 — show pockets
  document.getElementById('externalBorrowModal').classList.add('active');
  setTimeout(updateExtLendingGuardrail,100);
}

// ── v142c — Historical debt toggle ────────────────────────────────────────
var _extHistoricalMode = false;

function toggleExtHistorical(){
  _extHistoricalMode = !_extHistoricalMode;
  _applyExtHistoricalUI();
}

function _applyExtHistoricalUI(){
  var tog    = document.getElementById('extHistoricalToggle');
  var knob   = document.getElementById('extHistoricalKnob');
  var section = document.getElementById('extLendPocketSection');
  var guardrail = document.getElementById('extLendingGuardrail');
  if(tog){
    tog.style.background  = _extHistoricalMode ? '#3a1a5a' : '#2a2a2a';
    tog.style.borderColor = _extHistoricalMode ? '#7a3aba' : '#333';
  }
  if(knob){
    knob.style.left       = _extHistoricalMode ? '18px' : '2px';
    knob.style.background = _extHistoricalMode ? '#a78bfa' : '#555';
  }
  if(section)  section.style.display  = _extHistoricalMode ? 'none' : 'block';
  if(guardrail) guardrail.style.display = _extHistoricalMode ? 'none' : 'block';
}

// ── v90 Step 6 — pocket picker for Log Money Lent ─────────────────────────
// A personal lend pulls money OUT of a chosen pocket (and through a bank
// doorway). Default = the Daily pocket if it exists, else first pocket.
// The chosen pocket is stored as originPocket on the borrow entry so the
// repayment flow can auto-suggest it later (closing the lend↔repay loop).
var _extLendSelectedPocketId = null;

function _extLendBalance(f){
  return (f.deposits||[]).reduce(function(s,d){
    return s + (d.txnType==='out' ? -Number(d.amount||0) : Number(d.amount||0));
  }, 0);
}

function renderExtLendPocketPicker(){
  var picker = document.getElementById('extLendPocketPicker');
  if(!picker) return;
  var list = (funds||[]).filter(function(f){ return !f._deleted; });
  // Default selection: Daily if present, else first pocket
  if(!_extLendSelectedPocketId){
    var daily = list.find(function(f){ return /daily/i.test(f.name||''); });
    _extLendSelectedPocketId = daily ? daily.id : (list[0] ? list[0].id : null);
  }
  if(!list.length){
    picker.innerHTML = '<div style="font-size:11px;color:var(--muted);padding:10px;text-align:center;">No pockets exist yet — create one on the Savings tab first.</div>';
    return;
  }
  picker.innerHTML = list.map(function(f){
    var bal = _extLendBalance(f);
    var isSel = (f.id === _extLendSelectedPocketId);
    var border = isSel ? '#a78bfa' : '#1a1a1a';
    var bg     = isSel ? '#1a1030' : '#0e0e0e';
    var nameC  = isSel ? '#a78bfa' : '#efefef';
    var balC   = bal <= 0 ? '#555' : '#c8f230';
    return '<div onclick="selectExtLendPocket(\''+f.id+'\')" '
      + 'style="display:flex;justify-content:space-between;align-items:center;padding:9px 10px;border-radius:5px;margin-bottom:4px;cursor:pointer;border:1px solid '+border+';background:'+bg+';">'
      + '<span style="font-size:12px;color:'+nameC+';"><span style="margin-right:8px;">'+(f.emoji||'💰')+'</span>'+escapeHtmlSafe(f.name)+'</span>'
      + '<span style="font-size:11px;color:'+balC+';font-family:Syne,sans-serif;font-weight:700;">'+fmtR(bal)+'</span>'
      + '</div>';
  }).join('');
}

function selectExtLendPocket(id){
  _extLendSelectedPocketId = id;
  renderExtLendPocketPicker();
  if(typeof updateExtLendingGuardrail === 'function') try{ updateExtLendingGuardrail(); }catch(e){}
}

function escapeHtmlSafe(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function confirmExternalBorrow(){
  const name   = document.getElementById('extBorrowName').value.trim();
  const amount = parseFloat(document.getElementById('extBorrowAmt').value);
  const date   = document.getElementById('extBorrowDate').value || localDateStr(new Date());
  const note   = document.getElementById('extBorrowNote').value.trim();
  const account = document.getElementById('extBorrowAccount').value || 'FNB';
  if(!name){ alert('Please enter a name.'); return; }
  if(!amount || amount <= 0){ alert('Please enter a valid amount.'); return; }

  // ── v90 Step 6 / v142c — pocket-first OR historical (no pocket deduction) ─
  var isHistorical = _extHistoricalMode || false;
  var pocket = null;
  if(!isHistorical){
    pocket = funds.find(function(f){ return f.id === _extLendSelectedPocketId; });
    if(!pocket){ alert('Pick which pocket the money comes out of.'); return; }
    var pocketBal = _extLendBalance(pocket);
    if(amount > pocketBal){
      alert('Only ' + fmtR(pocketBal) + ' available in ' + pocket.name + '. Pick another pocket or a smaller amount.');
      return;
    }
  }

  const data = loadExternalBorrows();
  const key  = name.toLowerCase().replace(/\s+/g,'_');
  // ── Phase D: every borrower needs a UUID so cloud-sync can reference them ──
  var isNew = !data[key];
  if(!data[key]) data[key] = { name: name, entries: [] };
  if(!data[key].borrowerId){
    data[key].borrowerId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : uid();
  }
  // v90: lendId links the borrow entry ↔ pocket deposit ↔ CF row for the
  //      hard-block guard + atomic reverse. originPocket lets the repayment
  //      flow auto-suggest where the money should come back to.
  var lendId = 'ln_' + uid();
  var entryId = uid();
  var newEntry = {
    id: entryId, type:'borrow', amount, date, note, account,
    originPocket: pocket ? pocket.id : null,   // Step 6 — null for historical
    lendId: isHistorical ? null : lendId,       // no lendId for historical
    isHistorical: isHistorical || undefined
  };
  data[key].entries.push(newEntry);
  saveExternalBorrows(data);

  if(!isHistorical){
    // 1) Deduct the pocket (money genuinely leaves you)
    var pocketDepId = uid();
    pocket.deposits.push({
      id: pocketDepId,
      txnType: 'out',
      amount: amount,
      date: date,
      note: '🤝 Lent to ' + name + (note ? ' · ' + note : ''),
      lendId: lendId,
      borrowEntryId: key + ':' + entryId
    });
    saveFunds();

    // 2) Log as expense in cashflow
    var cfId = logBorrowToCashflow(name, amount, date, account, 'personal', lendId);
    if(cfId){ newEntry.cfId = cfId; saveExternalBorrows(data); }

    // 3) Bank doorway (+amount in, -amount out → net 0)
    if(typeof window._adjustBaselineForBank === 'function'){
      window._adjustBaselineForBank(account, amount);
      window._adjustBaselineForBank(account, -amount);
    }

    // 4) Stash the lend record for hard-block guard + reverse
    var lendRecs = [];
    try { lendRecs = JSON.parse(lsGet('yb_lends_v1')||'[]'); } catch(e){}
    lendRecs.push({
      id: lendId,
      key: key,
      personName: name,
      entryId: entryId,
      amount: amount,
      date: date,
      bank: account,
      pocketId: pocket.id,
      pocketDepId: pocketDepId,
      cfId: cfId,
      createdAt: new Date().toISOString()
    });
    lsSet('yb_lends_v1', JSON.stringify(lendRecs));
  }
  // Historical debt: only the borrow entry exists — no pocket, no CF, no lend record.
  // Deletion is allowed directly from Money Owed (no hard-block needed — nothing to cascade).

  closeModal('externalBorrowModal');
  renderMoneyOwed();
  try { renderFunds(); } catch(e){}
  try { if(typeof renderBankBalanceCard === 'function') renderBankBalanceCard(); } catch(e){}
  odinRefreshIfOpen();
  if(typeof renderOdinInsights === 'function') try{ renderOdinInsights('money'); }catch(e){}
  if(typeof softDeleteToast === 'function'){
    var toastMsg = isHistorical
      ? '📋 Logged R' + amount.toLocaleString('en-ZA') + ' historical debt for ' + name
      : '🤝 Lent ' + fmtR(amount) + ' to ' + name + ' · from ' + (pocket ? pocket.name : '');
    softDeleteToast({ message: toastMsg, duration: 3500 });
  }
}

// ── v90 — Reverse a personal lend atomically ─────────────────────────────
// Mirrors _repaymentReverse's discipline: remove the CF row DIRECTLY (via
// loadCFData/saveCFData), NOT through removeFromCF — because the forward
// doorway already netted the bank to 0, so we must NOT touch the bank
// baseline again (that would create a +amount drift). Removes: pocket
// deposit, CF expense row, borrow entry, and the lend record.
function _lendReverse(lendId, opts){
  opts = opts || {};
  var lendRecs = [];
  try { lendRecs = JSON.parse(lsGet('yb_lends_v1')||'[]'); } catch(e){}
  var rec = lendRecs.find(function(r){ return r.id === lendId; });
  if(!rec){ console.warn('[lend-reverse] no record for', lendId); return false; }

  // 1) Remove the pocket deposit (gives the money back to the pocket)
  var pocket = funds.find(function(f){ return f.id === rec.pocketId; });
  if(pocket){
    pocket.deposits = (pocket.deposits||[]).filter(function(d){
      var byId      = rec.pocketDepId && d.id === rec.pocketDepId;
      var byLendId  = d.lendId === lendId;
      return !byId && !byLendId;
    });
    saveFunds();
  }

  // 2) Remove the CF expense row DIRECTLY (no removeFromCF → no bank touch)
  if(typeof loadCFData === 'function' && typeof saveCFData === 'function'){
    var cfData = loadCFData();
    var mk = (rec.date||'').slice(0,7);
    var removed = 0;
    ['expenses'].forEach(function(sec){
      if(cfData[mk] && cfData[mk][sec]){
        var b = cfData[mk][sec].length;
        cfData[mk][sec] = cfData[mk][sec].filter(function(e){
          return e.id !== rec.cfId && e.lendId !== lendId;
        });
        removed += (b - cfData[mk][sec].length);
      }
      if(cfData.recurring && cfData.recurring[sec]){
        var rb = cfData.recurring[sec].length;
        cfData.recurring[sec] = cfData.recurring[sec].filter(function(e){
          return e.id !== rec.cfId && e.lendId !== lendId;
        });
        removed += (rb - cfData.recurring[sec].length);
      }
    });
    if(removed > 0) saveCFData(cfData);
  }

  // 3) Remove the borrow entry — v108: branch on isCarpool flag.
  //    Carpool borrows live in borrowData (yasin_borrows_v1).
  //    External lends live in loadExternalBorrows().
  if(rec.isCarpool){
    try {
      if(typeof borrowData !== 'undefined' && rec.passenger && borrowData[rec.passenger]){
        borrowData[rec.passenger] = borrowData[rec.passenger].filter(function(e){ return e.id !== rec.entryId; });
        if(typeof saveBorrows === 'function') saveBorrows();
      }
    } catch(e){ console.warn('[lend-reverse] carpool borrow remove failed', e); }
  } else {
    try {
      var data = loadExternalBorrows();
      if(data[rec.key] && data[rec.key].entries){
        data[rec.key].entries = data[rec.key].entries.filter(function(e){ return e.id !== rec.entryId; });
        saveExternalBorrows(data);
      }
    } catch(e){ console.warn('[lend-reverse] external borrow entry remove failed', e); }
  }

  // 4) Remove the lend record itself
  lendRecs = lendRecs.filter(function(r){ return r.id !== lendId; });
  lsSet('yb_lends_v1', JSON.stringify(lendRecs));

  // 5) Bank baseline: NOT touched (forward doorway was net 0). Nothing to do.

  if(!opts.silent){
    try { renderMoneyOwed(); } catch(e){}
    try { renderFunds(); } catch(e){}
    try { if(typeof renderCarpool === 'function') renderCarpool(); } catch(e){}
    try { if(typeof renderBankBalanceCard === 'function') renderBankBalanceCard(); } catch(e){}
    try { if(typeof odinRefreshIfOpen === 'function') odinRefreshIfOpen(); } catch(e){}
  }
  return true;
}
if(typeof window !== 'undefined') window._lendReverse = _lendReverse;


// ── LOG BORROW AS CASHFLOW EXPENSE ──
// Returns the CF entry id so callers can stamp cfId onto the borrow entry for cascade delete
function logBorrowToCashflow(personName, amount, date, account, tag, lendId){
  try{
    var data = loadCFData();
    var d = new Date(date + 'T00:00:00');
    var mk = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    if(!data[mk]) data[mk] = { income:[], expenses:[] };
    if(!data[mk].expenses) data[mk].expenses = [];
    var acctLabel = account === 'TymeBank' ? 'TymeBank' : (account === 'Cash' ? 'Cash' : 'FNB');
    var tagLabel  = tag === 'carpool' ? '🚗 Carpool' : '👤 Personal';
    var cfEntryId = uid();
    var row = {
      id: cfEntryId,
      label: '💸 Lent to ' + personName + ' [' + acctLabel + ']',
      amount: amount,
      icon: '🤝',
      auto: false,
      account: account,
      borrowTag: tagLabel,
      date: date
    };
    // v90: personal lends carry lendId so _lendReverse can find & remove this
    // row directly. destBank is informational; the bank baseline is handled by
    // the doorway dance in confirmExternalBorrow (net 0), NOT by this row.
    if(lendId) row.lendId = lendId;
    data[mk].expenses.push(row);
    saveCFData(data);
    return cfEntryId;
  }catch(e){ console.warn('Could not log borrow to cashflow:', e); return null; }
}

// ── ADD MORE BORROW (top-up existing person) ──
// ════════════════════════════════════════════════════════════════════════════
// v108b — Add More Borrow pocket picker (mirrors _cpLend* / _extLend*).
// The "+ More Borrowed" flow on a borrower card tops up an existing person's
// outstanding loan. Pre-v108b it drifted the bank exactly the same way
// confirmExternalBorrow did pre-v90: no pocket deduction, no doorway dance,
// no lendId. Now it does the full pocket-first dance for both branches.
// ════════════════════════════════════════════════════════════════════════════
var _amLendSelectedPocketId = null;

function _amLendBalance(f){
  if(!f) return 0;
  if(f.isExpense){
    var tin  = (f.deposits||[]).filter(function(d){return d.txnType==='in';}).reduce(function(s,d){return s+d.amount;},0);
    var tout = (f.deposits||[]).filter(function(d){return d.txnType==='out'||!d.txnType;}).reduce(function(s,d){return s+d.amount;},0);
    return tin - tout;
  }
  return (typeof fundTotal === 'function') ? fundTotal(f) : 0;
}

function _amLendRenderPocketList(){
  var box = document.getElementById('amLendPocketPicker');
  if(!box) return;
  var list = (typeof funds !== 'undefined' ? funds : []).filter(function(f){ return f && !f._deleted; });
  if(!_amLendSelectedPocketId){
    var daily = list.find(function(f){ return f.name === 'Daily'; });
    if(daily) _amLendSelectedPocketId = daily.id;
    else {
      var firstWithBal = list.find(function(f){ return _amLendBalance(f) > 0; });
      _amLendSelectedPocketId = firstWithBal ? firstWithBal.id : (list[0] ? list[0].id : null);
    }
  }
  box.innerHTML = '';
  if(!list.length){
    box.innerHTML = '<div style="padding:14px;color:var(--muted);font-size:11px;text-align:center;letter-spacing:1px;">No pockets yet. Create one on the Savings tab.</div>';
    return;
  }
  list.forEach(function(f){
    var bal = _amLendBalance(f);
    var isSel = (f.id === _amLendSelectedPocketId);
    var balColor = bal <= 0 ? '#555' : '#c8f230';
    var row = document.createElement('button');
    row.type = 'button';
    row.dataset.fundId = f.id;
    row.onclick = function(){ _amLendPickPocket(f.id); };
    row.style.cssText = 'width:100%;text-align:left;background:' + (isSel?'#1a2e00':'#0a0a0a') +
      ';border:1px solid ' + (isSel?'#5a8800':'#1a1a1a') +
      ';border-radius:7px;padding:10px 12px;margin-bottom:6px;cursor:pointer;display:flex;align-items:center;gap:10px;font-family:DM Mono,monospace;';
    row.innerHTML =
      '<span style="font-size:18px;">' + (f.emoji||'💰') + '</span>'
      + '<span style="flex:1;color:' + (isSel?'#c8f230':'#efefef') + ';font-size:13px;">' + f.name + '</span>'
      + '<span style="color:' + balColor + ';font-size:11px;font-weight:700;">R' + Number(bal).toLocaleString('en-ZA',{minimumFractionDigits:2,maximumFractionDigits:2}) + '</span>';
    box.appendChild(row);
  });
}

function _amLendPickPocket(id){
  _amLendSelectedPocketId = id;
  _amLendRenderPocketList();
}

if(typeof window !== 'undefined'){
  window._amLendPickPocket = _amLendPickPocket;
  window._amLendRenderPocketList = _amLendRenderPocketList;
}

function openAddMoreBorrowModal(key, tag){
  var personName = '';
  var currentTotal = 0;
  if(tag === 'carpool'){
    personName = key;
    var entries = borrowData[key] || [];
    var ct = calcPersonTotals(entries);
    currentTotal = ct.borrowed - ct.repaid;
  } else {
    var extData = loadExternalBorrows();
    var p = extData[key];
    if(!p){ alert('Person not found.'); return; }
    personName = p.name;
    var ct2 = calcPersonTotals(p.entries);
    currentTotal = ct2.borrowed - ct2.repaid;
  }
  document.getElementById('addMoreBorrowKey').value   = key;
  document.getElementById('addMoreBorrowTag').value   = tag;
  document.getElementById('addMoreBorrowPersonName').textContent = personName;
  document.getElementById('addMoreBorrowCurrentTotal').textContent = 'R' + currentTotal.toLocaleString('en-ZA') + ' still owed';
  document.getElementById('addMoreBorrowAmt').value   = '';
  document.getElementById('addMoreBorrowDate').value  = localDateStr(new Date());
  document.getElementById('addMoreBorrowNote').value  = '';
  document.getElementById('addMoreBorrowAccount').value = 'FNB';
  _amLendSelectedPocketId = null;
  _amLendRenderPocketList();
  document.getElementById('addMoreBorrowModal').classList.add('active');
}

function confirmAddMoreBorrow(){
  var key     = document.getElementById('addMoreBorrowKey').value;
  var tag     = document.getElementById('addMoreBorrowTag').value;
  var amount  = parseFloat(document.getElementById('addMoreBorrowAmt').value);
  var date    = document.getElementById('addMoreBorrowDate').value || localDateStr(new Date());
  var note    = document.getElementById('addMoreBorrowNote').value.trim();
  var account = document.getElementById('addMoreBorrowAccount').value || 'FNB';
  if(!amount || amount <= 0){ alert('Enter a valid amount to add.'); return; }
  var personName = document.getElementById('addMoreBorrowPersonName').textContent;

  // ── v108b — pocket-first: the topped-up money leaves a pocket ──────────────
  // Same dance as confirmBorrow (carpool) and confirmExternalBorrow (external).
  // Branches differ only in storage layer + cashflow tag + lendRec shape.
  var pocket = funds.find(function(f){ return f.id === _amLendSelectedPocketId; });
  if(!pocket){ alert('Pick which pocket the money comes out of.'); return; }
  var pocketBal = _amLendBalance(pocket);
  if(amount > pocketBal){
    alert('Only R' + Number(pocketBal).toLocaleString('en-ZA',{minimumFractionDigits:2,maximumFractionDigits:2})
      + ' available in ' + pocket.name + '. Pick another pocket or a smaller amount.');
    return;
  }

  var lendId = 'ln_' + uid();
  var entryId = uid();
  var cfTag = (tag === 'carpool') ? 'carpool' : 'personal';
  var lendNotePrefix = (tag === 'carpool') ? '💸 Lent to ' : '🤝 Lent to ';

  if(tag === 'carpool'){
    if(!borrowData[key]) borrowData[key] = [];
    var cpEntry = {
      id: entryId, type:'borrow', amount: amount, date: date, note: note, account: account, paid: false,
      originPocket: pocket.id,
      lendId: lendId
    };
    borrowData[key].push(cpEntry);
    saveBorrows();
  } else {
    var extData = loadExternalBorrows();
    if(!extData[key]){ alert('Person not found.'); return; }
    if(!extData[key].borrowerId){
      extData[key].borrowerId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : uid();
    }
    var extEntry = {
      id: entryId, type:'borrow', amount: amount, date: date, note: note, account: account,
      originPocket: pocket.id,
      lendId: lendId
    };
    extData[key].entries.push(extEntry);
    saveExternalBorrows(extData);
  }

  // 1) Deduct the pocket (money genuinely leaves you)
  var pocketDepId = uid();
  pocket.deposits.push({
    id: pocketDepId,
    txnType: 'out',
    amount: amount,
    date: date,
    note: lendNotePrefix + personName + (note ? ' · ' + note : ''),
    lendId: lendId,
    borrowEntryId: key + ':' + entryId
  });
  saveFunds();

  // 2) Log as expense in cashflow — stamp cfId + destBank for the reverse path
  var cfId = logBorrowToCashflow(personName, amount, date, account, cfTag, lendId);
  if(cfId){
    if(tag === 'carpool'){
      var cpList = borrowData[key] || [];
      var cpRow = cpList.find(function(e){ return e.id === entryId; });
      if(cpRow){ cpRow.cfId = cfId; saveBorrows(); }
    } else {
      var ed2 = loadExternalBorrows();
      var extRow = (ed2[key] && ed2[key].entries) ? ed2[key].entries.find(function(e){ return e.id === entryId; }) : null;
      if(extRow){ extRow.cfId = cfId; saveExternalBorrows(ed2); }
    }
  }

  // 3) Bank doorway (+amount in, -amount out → net 0). Bank tile unaffected.
  if(typeof window._adjustBaselineForBank === 'function'){
    window._adjustBaselineForBank(account, amount);    // doorway IN
    window._adjustBaselineForBank(account, -amount);   // doorway OUT
  }

  // 4) Stash the lend record. Shape differs by branch so _lendReverse can route.
  var lendRecs = [];
  try { lendRecs = JSON.parse(lsGet('yb_lends_v1')||'[]'); } catch(e){}
  var rec = {
    id: lendId,
    entryId: entryId,
    amount: amount,
    date: date,
    bank: account,
    pocketId: pocket.id,
    pocketDepId: pocketDepId,
    cfId: cfId,
    createdAt: new Date().toISOString()
  };
  if(tag === 'carpool'){
    rec.isCarpool = true;
    rec.passenger = key;
    rec.personName = personName;
  } else {
    rec.key = key;
    rec.personName = personName;
  }
  lendRecs.push(rec);
  lsSet('yb_lends_v1', JSON.stringify(lendRecs));

  closeModal('addMoreBorrowModal');
  if(tag === 'carpool'){ try { renderCarpool(); } catch(e){} }
  else { try { renderMoneyOwed(); } catch(e){} if(typeof renderOdinInsights === 'function') try{ renderOdinInsights('money'); }catch(e){} }
  try { renderFunds(); } catch(e){}
  try { if(typeof renderBankBalanceCard === 'function') renderBankBalanceCard(); } catch(e){}

  var old = document.getElementById('borrowAddToast');
  if(old) old.remove();
  var toast = document.createElement('div');
  toast.id = 'borrowAddToast';
  toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1a0e2e;border:1px solid #a78bfa;border-radius:8px;padding:12px 16px;z-index:9999;display:flex;align-items:center;gap:10px;font-family:DM Mono,monospace;font-size:11px;letter-spacing:1px;color:#a78bfa;box-shadow:0 4px 20px rgba(0,0,0,.6);min-width:260px;';
  toast.innerHTML = '<span>💸 R'+Number(amount).toLocaleString('en-ZA')+' added to <strong style="color:var(--text);">'+personName+'</strong> · from '+account+' · logged to cashflow</span><button onclick="document.getElementById(\'borrowAddToast\').remove();" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;padding:0 2px;">✕</button>';
  document.body.appendChild(toast);
  setTimeout(function(){ if(toast.parentNode) toast.remove(); }, 5000);
}

function buildFundSelectOptions(selectId){
  const sel = document.getElementById(selectId);
  if(!sel) return;
  // Only FNB funds (exclude TymeBank and Kids funds)
  const tymeFundNames=['The Vault (Tax)','Traffic Infractions'];
  const kidsFundNames=["Masud's Fund"];
  const fnbFunds = funds.filter(function(f){
    return kidsFundNames.indexOf(f.name) < 0 && tymeFundNames.indexOf(f.name) < 0;
  });
  sel.innerHTML = '<option value="">— Don\'t add to savings —</option>'
    + fnbFunds.map(function(f){
        return '<option value="'+f.id+'">'+f.emoji+' '+f.name+'</option>';
      }).join('')
    + '<option value="__maint__">🔧 Maintenance Fund</option>';
  sel.value = '';
}

// ══ v86 (2026-05-27) — POCKET-FIRST external repay ═════════════════════
// Mirror of carpool confirmRepay flow. Same data shape, same hard-block,
// same atomic reverse. Differences from carpool:
//   - Stores person record in loadExternalBorrows() not borrowData
//   - Payment record carries isExternal:true + externalKey for _repaymentReverse
//   - Origin pocket lookup walks data[key].entries not borrowData[passenger]
//
// State for the pocket picker (separate from carpool's _repaySelectedPocketId
// so opening one modal doesn't pollute the other).
var _extRepaySelectedPocketId = null;

function _findOriginPocketForExternal(key){
  // Look at oldest unpaid borrow on this person; if it has an originPocket
  // field, use it. Pre-Step-6 personal loans won't have one → returns null
  // and picker falls back to Daily (or first pocket).
  var data = loadExternalBorrows();
  if(!data[key] || !data[key].entries) return null;
  var unpaid = data[key].entries.filter(function(e){
    return e.type !== 'repay' && !e.paid && !e.iOwe && !e.completed && e.originPocket;
  });
  if(unpaid.length === 0) return null;
  unpaid.sort(function(a,b){ return (a.date||'') < (b.date||'') ? -1 : 1; });
  return unpaid[0].originPocket;
}

function _findDailyPocketId(){
  // Used as fallback default. Matches the pattern in Spend.
  var daily = (funds||[]).find(function(f){ return (f.name||'').toLowerCase() === 'daily'; });
  return daily ? daily.id : (funds && funds.length > 0 ? funds[0].id : null);
}

function renderExtRepayPocketPicker(){
  var picker = document.getElementById('extRepayPocketPicker');
  if(!picker) return;
  var key = document.getElementById('extRepayPersonKey').value;
  var originId = _findOriginPocketForExternal(key);
  // Default selection: origin → daily → first pocket
  if(originId && funds.find(function(f){ return f.id === originId; })){
    _extRepaySelectedPocketId = originId;
  } else {
    _extRepaySelectedPocketId = _findDailyPocketId();
  }
  picker.innerHTML = (funds||[]).map(function(f){
    var bal = (f.deposits||[]).reduce(function(s,d){
      return s + (d.txnType==='out' ? -Number(d.amount||0) : Number(d.amount||0));
    }, 0);
    var isOrigin = (f.id === originId);
    var isSelected = (f.id === _extRepaySelectedPocketId);
    var borderColor = isSelected ? '#a78bfa' : (isOrigin ? '#5a8800' : 'transparent');
    var bgColor = isSelected ? '#0d0a1a' : (isOrigin ? '#0d1a00' : '#0e0e0e');
    var nameColor = isSelected ? '#a78bfa' : '#efefef';
    var tag = isOrigin
      ? '<span style="font-size:8px;background:#3a5a00;color:#c8f230;border-radius:3px;padding:1px 5px;margin-left:6px;letter-spacing:1px;">ORIGIN</span>'
      : '';
    return '<div onclick="selectExtRepayPocket(\''+f.id+'\')" '
      + 'style="display:flex;justify-content:space-between;align-items:center;padding:9px 10px;border-radius:5px;margin-bottom:4px;cursor:pointer;border:1px solid '+borderColor+';background:'+bgColor+';">'
      + '<span style="font-size:12px;color:'+nameColor+';"><span style="margin-right:8px;">'+(f.emoji||'💰')+'</span>'+f.name+tag+'</span>'
      + '<span style="font-size:10px;color:var(--muted);">R'+bal.toLocaleString('en-ZA')+'</span>'
      + '</div>';
  }).join('') || '<div style="font-size:11px;color:var(--muted);padding:8px;text-align:center;">No pockets exist yet.</div>';
}

function selectExtRepayPocket(id){
  _extRepaySelectedPocketId = id;
  renderExtRepayPocketPicker();
}

function openExternalRepayModal(key){
  const data   = loadExternalBorrows();
  const person = data[key];
  if(!person) return;
  document.getElementById('extRepayPersonKey').value = key;
  document.getElementById('extRepayNameDisplay').textContent = person.name;
  document.getElementById('extRepayAmt').value = '';
  document.getElementById('extRepayDate').value = localDateStr(new Date());
  document.getElementById('extRepayNote').value = '';
  // Reset bank dropdown to default
  var bankSel = document.getElementById('extRepayBank');
  if(bankSel) bankSel.value = 'TymeBank';
  // Show owing
  const { borrowed, repaid } = calcPersonTotals(person.entries);
  const owing = borrowed - repaid;
  if(owing <= 0){
    document.getElementById('extRepayOwingSummary').innerHTML =
      '<span style="color:#c8f230;">✓ ' + person.name + ' has no outstanding balance.</span>';
  } else {
    document.getElementById('extRepayOwingSummary').innerHTML =
      person.name + ' currently owes <strong style="color:#f2a830;font-size:13px;">R' + owing.toLocaleString('en-ZA') + '</strong>';
  }
  renderExtRepayPocketPicker();
  document.getElementById('externalRepayModal').classList.add('active');
}

function confirmExternalRepay(){
  const key    = document.getElementById('extRepayPersonKey').value;
  const amount = parseFloat(document.getElementById('extRepayAmt').value);
  const date   = document.getElementById('extRepayDate').value || localDateStr(new Date());
  const bankEl = document.getElementById('extRepayBank');
  const bank   = bankEl ? bankEl.value : 'TymeBank';
  const noteRaw = document.getElementById('extRepayNote').value.trim();
  if(!amount || amount <= 0){ alert('Enter a valid repayment amount.'); return; }

  // ── v86 — pocket-first ──
  var pocketId = _extRepaySelectedPocketId;
  var pocket = pocketId ? funds.find(function(f){ return f.id === pocketId; }) : null;
  if(!pocket){
    alert('Pick a pocket for the repayment to go into.');
    return;
  }

  const data = loadExternalBorrows();
  if(!data[key]) return;
  const personName = data[key].name || key;
  if(!data[key].borrowerId){
    data[key].borrowerId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : uid();
  }

  // 1. Unique ID linking all records
  var repayId = 'rp_' + uid();

  // 2. CF income row (doorway IN)
  const cfLabel = '↩ Repayment from ' + personName + ' → ' + pocket.name;
  const cfNote = 'Borrowed money repaid by ' + personName + ' (via ' + bank + ') into pocket: ' + pocket.name + (noteRaw ? ' · ' + noteRaw : '');
  var cfId_repay = postToCF({
    label: cfLabel,
    amount: amount,
    date: date,
    icon: 'repay',
    type: 'income',
    sourceType: 'borrow_repaid',
    sourceId: key,
    sourceCardName: bank,
    note: cfNote,
    destBank: bank,
    repayId: repayId,
    destPocketId: pocket.id
  });

  // 3. Pocket deposit (where the money actually lives)
  var pocketDepId = uid();
  pocket.deposits.push({
    id: pocketDepId,
    amount: amount,
    date: date,
    note: '↩ Repaid by ' + personName + (noteRaw ? ' · ' + noteRaw : ''),
    txnType: 'in',
    repayId: repayId,
    cfRowId: cfId_repay
  });
  saveFunds();

  // 4. External borrow repay entry (audit trail)
  var borrowEntryId = uid();
  var repayEntry = {
    id: borrowEntryId,
    type: 'repay',
    amount: amount,
    date: date,
    note: cfNote,
    paid: true,
    cfId: cfId_repay,
    bank: bank,
    repayId: repayId,
    destPocketId: pocket.id,
    destPocketDepId: pocketDepId
  };
  data[key].entries.push(repayEntry);
  saveExternalBorrows(data);

  // 5. Bank doorway (+amount in, -amount out → net 0)
  if(typeof window._adjustBaselineForBank === 'function'){
    var _bankBefore = (typeof loadReconBalances === 'function') ? loadReconBalances() : {};
    var _kBefore = (bank==='FNB')?'fnb':(bank==='TymeBank')?'tyme':(bank==='Cash')?'cash':null;
    var _vBefore = _kBefore ? Number(_bankBefore[_kBefore]||0) : null;
    window._adjustBaselineForBank(bank, amount);    // doorway IN
    window._adjustBaselineForBank(bank, -amount);   // doorway OUT
    var _bankAfter = (typeof loadReconBalances === 'function') ? loadReconBalances() : {};
    var _vAfter = _kBefore ? Number(_bankAfter[_kBefore]||0) : null;
    console.log('[ext-repay-forward] bank', bank, 'before:', _vBefore, 'after doorway in+out:', _vAfter, '(should match)');
  }

  // 6. Stash payment record (carries isExternal flag for _repaymentReverse)
  try {
    var allReps = [];
    try { allReps = JSON.parse(lsGet('yb_repayments_v1')||'[]'); } catch(e){}
    allReps.push({
      id: repayId,
      isExternal: true,
      externalKey: key,
      passenger: personName,   // for display only; reverse uses externalKey
      amount: amount,
      date: date,
      bank: bank,
      pocketId: pocket.id,
      pocketDepId: pocketDepId,
      cfRowId: cfId_repay,
      borrowRepayEntryId: borrowEntryId,
      createdAt: new Date().toISOString()
    });
    lsSet('yb_repayments_v1', JSON.stringify(allReps));
  } catch(e){ console.warn('[ext-repay] save payment record failed', e); }

  closeModal('externalRepayModal');

  // Refresh UI
  if(typeof renderFunds === 'function') try{ renderFunds(); }catch(e){}
  renderMoneyOwed();
  if(typeof renderCashFlow === 'function') try{ renderCashFlow(); }catch(e){}
  if(typeof renderOdinInsights === 'function') try{ renderOdinInsights('money'); }catch(e){}

  // Toast
  try{
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:#0d0a1a;border:1px solid #a78bfa;border-radius:8px;padding:12px 20px;z-index:9999;font-family:DM Mono,monospace;font-size:11px;color:#a78bfa;letter-spacing:1px;white-space:nowrap;';
    toast.textContent = '✓ R'+amount+' from '+personName+' → '+pocket.name;
    document.body.appendChild(toast);
    setTimeout(function(){ toast.remove(); }, 4000);
  }catch(e){}
}

function showRepayToast(name, amount, fundName){
  const old = document.getElementById('repayFundToast');
  if(old) old.remove();
  const toast = document.createElement('div');
  toast.id = 'repayFundToast';
  toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#0a1a2e;border:1px solid #7090f0;border-radius:8px;padding:12px 16px;z-index:9999;display:flex;align-items:center;gap:10px;font-family:DM Mono,monospace;font-size:11px;letter-spacing:1px;color:#7090f0;box-shadow:0 4px 20px rgba(0,0,0,.6);min-width:260px;';
  toast.innerHTML = '<span>✓ R'+Number(amount).toLocaleString('en-ZA')+' from '+name+' added to <strong style="color:var(--text);">'+fundName+'</strong></span><button onclick="document.getElementById(\'repayFundToast\').remove();" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;padding:0 2px;">✕</button>';
  document.body.appendChild(toast);
  setTimeout(function(){ if(toast.parentNode) toast.remove(); }, 5000);
}

function calcPersonTotals(entries){
  let borrowed = 0, repaid = 0;
  (entries||[]).forEach(function(e){
    // Skip "I owe them" refund entries — those are debts in the OTHER
    // direction and are rendered in a separate section.
    if(e.iOwe || e.type === 'iowe') return;
    if(e.type === 'repay') repaid += Number(e.amount||0);
    else {
      borrowed += Number(e.amount||0);
      // ── FIX 2026-05-26 ──
      // A borrow with paid:true (set by Carpool's Mark Paid flow) is
      // equivalent to a full repayment. Without this, the Money Owed UI
      // shows borrows as still owed even after they've been marked paid
      // via carpool. type:'repay' entries (manual Repayment button) are
      // already handled above.
      if(e.paid) repaid += Number(e.amount||0);
    }
  });
  return { borrowed, repaid };
}

// Helper: extract iOwe entries (refunds I owe back to a person) for one set
// of borrow entries. Used by the "You owe these people" section.
function calcIOweEntries(entries){
  return (entries||[]).filter(function(e){
    return (e.iOwe || e.type === 'iowe') && !e.completed;
  });
}

// ── v142d — PAY DEBT (I owe someone, paying them back) ──────────────────
var _payDebtSelectedPocketId = null;

function openPayDebtModal(key){
  var data = loadExternalBorrows();
  var person = data[key];
  if(!person) return;
  document.getElementById('payDebtPersonKey').value = key;
  document.getElementById('payDebtNameDisplay').textContent = person.name;
  document.getElementById('payDebtAmt').value = '';
  document.getElementById('payDebtDate').value = localDateStr(new Date());
  document.getElementById('payDebtNote').value = '';
  // Show owing
  var totals = calcPersonTotals(person.entries || []);
  var owing = totals.borrowed - totals.repaid;
  var summaryEl = document.getElementById('payDebtOwingSummary');
  if(summaryEl){
    summaryEl.innerHTML = 'You still owe <strong style="color:#f23060;font-size:13px;">R' + Math.max(0,owing).toLocaleString('en-ZA') + '</strong> to ' + person.name;
  }
  // Reset pocket picker — default to Daily
  _payDebtSelectedPocketId = null;
  var daily = (funds||[]).find(function(f){ return /daily/i.test(f.name||''); });
  _payDebtSelectedPocketId = daily ? daily.id : ((funds||[])[0] ? (funds||[])[0].id : null);
  _renderPayDebtPocketPicker();
  document.getElementById('payDebtModal').classList.add('active');
}

function _renderPayDebtPocketPicker(){
  var picker = document.getElementById('payDebtPocketPicker');
  if(!picker) return;
  var list = (funds||[]).filter(function(f){ return !f._deleted; });
  picker.innerHTML = list.map(function(f){
    var bal = (f.deposits||[]).reduce(function(s,d){ return s + (d.txnType==='out' ? -Number(d.amount||0) : Number(d.amount||0)); }, 0);
    var isSel = (f.id === _payDebtSelectedPocketId);
    var border = isSel ? '#8a1010' : '#1a1a1a';
    var bg     = isSel ? '#1a0808' : '#0e0e0e';
    var nameC  = isSel ? '#f23060' : '#efefef';
    var balC   = bal <= 0 ? '#555' : '#c8f230';
    return '<div onclick="selectPayDebtPocket(\''+f.id+'\');updatePayDebtGuardrail();" '
      + 'style="display:flex;justify-content:space-between;align-items:center;padding:9px 10px;border-radius:5px;margin-bottom:4px;cursor:pointer;border:1px solid '+border+';background:'+bg+';">'
      + '<span style="font-size:12px;color:'+nameC+';">'+(f.emoji||'💰')+' '+f.name+'</span>'
      + '<span style="font-size:11px;color:'+balC+';font-family:Syne,sans-serif;font-weight:700;">R'+bal.toLocaleString('en-ZA')+'</span>'
      + '</div>';
  }).join('');
}

function selectPayDebtPocket(id){
  _payDebtSelectedPocketId = id;
  _renderPayDebtPocketPicker();
}

function updatePayDebtGuardrail(){
  var amt = parseFloat(document.getElementById('payDebtAmt').value) || 0;
  var pocket = _payDebtSelectedPocketId ? (funds||[]).find(function(f){ return f.id === _payDebtSelectedPocketId; }) : null;
  var bal = pocket ? (pocket.deposits||[]).reduce(function(s,d){ return s + (d.txnType==='out' ? -Number(d.amount||0) : Number(d.amount||0)); }, 0) : 0;
  var guardrail = document.getElementById('payDebtGuardrail');
  var btn = document.getElementById('payDebtConfirmBtn');
  if(amt > 0 && pocket && amt > bal){
    if(guardrail){ guardrail.style.display='block'; guardrail.textContent = '🔒 Only R'+bal.toLocaleString('en-ZA')+' in '+pocket.name+' — pick another pocket or a smaller amount.'; }
    if(btn){ btn.disabled=true; btn.style.opacity='.4'; }
  } else {
    if(guardrail){ guardrail.style.display='none'; }
    if(btn){ btn.disabled=false; btn.style.opacity='1'; }
  }
}

function confirmPayDebt(){
  var key    = document.getElementById('payDebtPersonKey').value;
  var amount = parseFloat(document.getElementById('payDebtAmt').value);
  var date   = document.getElementById('payDebtDate').value || localDateStr(new Date());
  var note   = document.getElementById('payDebtNote').value.trim();
  if(!amount || amount <= 0){ alert('Enter a valid amount.'); return; }

  // Pocket check — hard block
  var pocket = _payDebtSelectedPocketId ? (funds||[]).find(function(f){ return f.id === _payDebtSelectedPocketId; }) : null;
  if(!pocket){ alert('Pick a pocket to pay from.'); return; }
  var pocketBal = (pocket.deposits||[]).reduce(function(s,d){ return s + (d.txnType==='out' ? -Number(d.amount||0) : Number(d.amount||0)); }, 0);
  if(amount > pocketBal){
    alert('Only R'+pocketBal.toLocaleString('en-ZA')+' in '+pocket.name+'. Pick another pocket or smaller amount.');
    return;
  }

  var data = loadExternalBorrows();
  if(!data[key]) return;
  var personName = data[key].name || key;

  // Unique link ID
  var payDebtId = 'pd_' + uid();
  var entryId = uid();

  // 1. Add repay entry to the debt (reduces what you owe)
  var repayEntry = {
    id: entryId,
    type: 'repay',
    amount: amount,
    date: date,
    note: note || ('Paid ' + personName),
    payDebtId: payDebtId,
    pocketId: pocket.id
  };
  data[key].entries.push(repayEntry);
  saveExternalBorrows(data);

  // 2. Deduct from pocket (money leaves you)
  var pocketDepId = uid();
  pocket.deposits.push({
    id: pocketDepId,
    txnType: 'out',
    amount: amount,
    date: date,
    note: '↑ Paid ' + personName + (note ? ' · ' + note : ''),
    payDebtId: payDebtId
  });
  saveFunds();

  // 3. Log as Cash Flow expense
  if(typeof postToCF === 'function'){
    postToCF({
      label: '↑ Paid ' + personName + (note ? ' · ' + note : ''),
      amount: amount,
      date: date,
      icon: 'expense',
      type: 'expense',
      sourceType: 'debt_payment',
      sourceId: key,
      sourceCardName: pocket.name,
      account: pocket.name,
      note: 'Debt payment to ' + personName + ' from ' + pocket.name + (note ? ' · ' + note : ''),
      payDebtId: payDebtId,
      destPocketId: pocket.id
    });
  }

  closeModal('payDebtModal');
  if(typeof renderFunds === 'function') try{ renderFunds(); }catch(e){}
  renderMoneyOwed();
  if(typeof renderCashFlow === 'function') try{ renderCashFlow(); }catch(e){}
  if(typeof renderOdinInsights === 'function') try{ renderOdinInsights('money'); }catch(e){}
  if(typeof softDeleteToast === 'function'){
    softDeleteToast({ message: '↑ Paid R' + amount.toLocaleString('en-ZA') + ' to ' + personName + ' from ' + pocket.name, duration: 3500 });
  }
}

function renderMoneyOwed(){
  const container = document.getElementById('moneyOwedList');
  if(!container) return;
  window._moPersonMap = {}; // reset map on each render
  if(typeof renderOdinInsights === 'function') try{ renderOdinInsights('money'); }catch(e){}

  // ── Build combined list: carpool borrows + external ──
  const people = [];

  // 1) Carpool passengers — pull from borrowData
  loadBorrows();
  const PASSENGERS = window.PASSENGERS || ['David','Lezaun','Shireen'];
  PASSENGERS.forEach(function(name){
    // Filter out soft-deleted entries — they're hidden during the 8s undo
    // window. If user undoes, _deleted flag is removed and they reappear
    // on the next render.
    const entries = (borrowData[name] || []).filter(function(e){ return !e._deleted; });
    if(entries.length === 0) return;
    const { borrowed, repaid } = calcPersonTotals(entries);
    if(borrowed === 0) return;
    // Check if archived
    var carpoolArchived = JSON.parse(lsGet('yb_carpool_archived')||'[]');
    if(carpoolArchived.indexOf(name) > -1) return;
    people.push({ name, tag:'carpool', entries: entries, borrowed, repaid, key: name });
  });

  // 2) External people
  const extData = loadExternalBorrows();
  Object.keys(extData).forEach(function(key){
    const p = extData[key];
    if(p.archived) return; // skip archived
    // Same filter for external borrowers
    const visEntries = (p.entries || []).filter(function(e){ return !e._deleted; });
    const { borrowed, repaid } = calcPersonTotals(visEntries);
    if(borrowed === 0) return;
    people.push({ name: p.name, tag:'external', entries: visEntries, borrowed, repaid, key });
  });

  // ── Summary totals ──
  let grandLent = 0, grandRepaid = 0;
  people.forEach(function(p){ grandLent += p.borrowed; grandRepaid += p.repaid; });
  const grandOwing = grandLent - grandRepaid;
  const moTL = document.getElementById('moTotalLent');
  const moTR = document.getElementById('moTotalRepaid');
  const moTO = document.getElementById('moTotalOwing');
  if(moTL) moTL.textContent = 'R' + grandLent.toLocaleString('en-ZA');
  if(moTR) moTR.textContent = 'R' + grandRepaid.toLocaleString('en-ZA');
  var displayOwing = Math.max(0, grandOwing);
  if(moTO) moTO.textContent = 'R' + displayOwing.toLocaleString('en-ZA');

  if(people.length === 0){
    container.innerHTML = (typeof buildEmptyState === 'function')
      ? buildEmptyState({
          icon: '🤝',
          title: 'Nobody owes you anything 🎉',
          subtitle: 'Lent someone money? Add them here to track repayments.',
          ctaLabel: '+ Add Person',
          ctaOnclick: 'openExternalBorrowModal()'
        })
      : '<div style="color:var(--muted);font-size:13px;text-align:center;padding:40px 0;">No one owes you anything right now 🎉</div>';
    return;
  }

  container.innerHTML = '';
  people.forEach(function(p){
    const owing   = p.borrowed - p.repaid;
    const pct     = p.borrowed > 0 ? Math.min(100, Math.round((p.repaid/p.borrowed)*100)) : 0;
    const settled = owing <= 0;
    const tagHtml = p.tag === 'carpool'
      ? '<span style="font-size:9px;padding:2px 8px;border-radius:100px;background:#1a2e00;color:#c8f230;border:1px solid #3a5a00;letter-spacing:1px;">🚗 CARPOOL</span>'
      : '<span style="font-size:9px;padding:2px 8px;border-radius:100px;background:#1a1a2e;color:#7090f0;border:1px solid #2a2a5a;letter-spacing:1px;">👤 PERSONAL</span>';

    // Entry rows
    const entryRows = (p.entries||[]).slice().sort(function(a,b){ return a.date < b.date ? -1 : 1; }).map(function(e){
      const editFn   = p.tag === 'carpool'
        ? 'openEditBorrowModal(\''+p.key+'\',\''+e.id+'\')'
        : 'openEditExternalBorrowModal(\''+p.key+'\',\''+e.id+'\')';
      const delFn    = p.tag === 'carpool'
        ? 'deleteBorrowEntry(\''+p.key+'\',\''+e.id+'\')'
        : 'deleteBorrowEntryUnified(\'__ext__'+p.key+'\',\''+e.id+'\')';
      const actionBtns = '<span onclick="'+editFn+'" style="cursor:pointer;color:var(--muted);font-size:13px;padding:2px 5px;" title="Edit">✏️</span>'
        +'<span onclick="'+delFn+'" style="cursor:pointer;color:var(--muted);font-size:13px;padding:2px 5px;" title="Delete">🗑</span>';
      if(e.type==='repay') return ''; // repayments hidden from mini statement
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;font-size:11px;border-bottom:1px solid var(--border);">'
        +'<span style="color:#555;">'+e.date+(e.note?' · '+e.note:'')+(e.account?' <span style="font-size:9px;background:#1a0e2e;border:1px solid #3a2060;border-radius:3px;padding:1px 4px;color:#a78bfa;">'+e.account+'</span>':'')+' </span>'
        +'<span style="display:flex;align-items:center;gap:4px;"><span style="color:#a78bfa;">💸 R'+Number(e.amount).toLocaleString('en-ZA')+'</span>'+actionBtns+'</span>'
        +'</div>';
    }).join('');

    const repayBtn = p.tag === 'external' && !settled
      ? '<button onclick="openExternalRepayModal(\''+p.key+'\')" style="padding:7px 14px;background:#0e1a2e;border:1px solid #7090f0;border-radius:6px;color:#7090f0;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1px;cursor:pointer;">↩ They paid me</button>'
      : (p.tag === 'carpool' && !settled
          ? '<button onclick="openRepayModal(\''+p.key+'\')" style="padding:7px 14px;background:#0e1a2e;border:1px solid #7090f0;border-radius:6px;color:#7090f0;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1px;cursor:pointer;">↩ Repayment</button>'
          : '');
    // v142d — "↑ Pay Debt" button for historical debts (I owe them)
    const hasHistorical = (p.entries||[]).some(function(e){ return e.isHistorical; });
    const payDebtBtn = (p.tag === 'external' && !settled && hasHistorical)
      ? '<button onclick="openPayDebtModal(\''+p.key+'\')" style="padding:7px 14px;background:#2e0a0a;border:1px solid #8a1010;border-radius:6px;color:#f23060;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1px;cursor:pointer;font-weight:700;">↑ Pay her</button>'
      : '';

    const cardIdx = window._moPersonMap ? Object.keys(window._moPersonMap).length : 0;
    if(!window._moPersonMap) window._moPersonMap = {};
    window._moPersonMap[cardIdx] = p;

    const card = document.createElement('div');
    card.style.cssText = 'background:var(--surface);border:1px solid '+(settled?'#2a2a2a':'#3a2000')+';border-radius:10px;overflow:hidden;';
    card.setAttribute('data-mo-idx', cardIdx);
    card.innerHTML =
      // Top
      '<div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">'
        +'<div style="display:flex;align-items:center;gap:10px;">'
          +'<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:16px;color:var(--text);">'+p.name+'</div>'
          +tagHtml
        +'</div>'
        +'<div style="text-align:right;">'
          +'<div style="font-size:9px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;">'+(settled?'Settled':'Owes you')+'</div>'
          +'<div style="font-family:\'Syne\',sans-serif;font-weight:800;font-size:22px;color:'+(settled?'#c8f230':'#f2a830')+';">'+(settled?'✓ Settled':'R'+owing.toLocaleString('en-ZA'))+'</div>'
        +'</div>'
      +'</div>'
      // Progress bar
      +'<div style="padding:10px 16px;border-bottom:1px solid var(--border);background:#0a0a0a;">'
        +'<div style="display:flex;justify-content:space-between;font-size:9px;color:var(--muted);margin-bottom:4px;letter-spacing:1px;">'
          +'<span>Lent R'+p.borrowed.toLocaleString('en-ZA')+'</span>'
          +'<span>'+pct+'% repaid</span>'
          +'<span>Repaid R'+p.repaid.toLocaleString('en-ZA')+'</span>'
        +'</div>'
        +'<div style="height:4px;background:#1a1a1a;border-radius:2px;overflow:hidden;">'
          +'<div style="height:100%;width:'+pct+'%;background:'+(settled?'#c8f230':'#7090f0')+';border-radius:2px;transition:width .5s;"></div>'
        +'</div>'
      +'</div>'
      // Entry history
      +'<div style="padding:8px 16px 0;">'
        +entryRows
      +'</div>'
      // Actions
      +'<div style="padding:10px 16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'
        +(payDebtBtn ? payDebtBtn : '')
        +(repayBtn ? repayBtn : '')
        +(function(){
          // Count repayment-type entries (hidden from the rows above). If any
          // exist, surface a manager so they can be viewed/deleted — without
          // this, a stale repayment silently distorts the running total.
          var _rc = (p.entries||[]).filter(function(e){ return !e._deleted && e.type==='repay'; }).length;
          if(_rc === 0) return '';
          return '<button onclick="openRepaymentsManager(\''+p.key+'\',\''+p.tag+'\')" style="padding:7px 14px;background:#0e2e1a;border:1px solid #3a5a00;border-radius:6px;color:#c8f230;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1px;cursor:pointer;">↩ Repayments ('+_rc+')</button>';
        })()
        +'<button onclick="openAddMoreBorrowModal(\''+p.key+'\',\''+p.tag+'\')" style="padding:7px 14px;background:#1a0e2e;border:1px solid #a78bfa;border-radius:6px;color:#a78bfa;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1px;cursor:pointer;">➕ More Borrowed</button>'
        +'<button onclick="exportPersonPDF(this)" style="padding:7px 14px;background:#1a1a00;border:1px solid #5a4a00;border-radius:6px;color:#f2a830;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1px;cursor:pointer;transition:opacity .15s;" onmouseover="this.style.opacity=\'.75\'" onmouseout="this.style.opacity=\'1\'">⬇ PDF</button>'
        +(settled && p.key ? '<button onclick="archiveExternalPerson(\''+p.key+'\',\''+p.tag+'\')" style="padding:7px 14px;background:#1a1a1a;border:1px solid #333;border-radius:6px;color:#555;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1px;cursor:pointer;" onmouseover="this.style.color=\'#888\'" onmouseout="this.style.color=\'#555\'">📦 Archive</button>' : '')
      +'</div>';
    container.appendChild(card);
  });

  // After the "owes you" cards, render the parallel "you owe these people"
  // section if any iOwe entries exist (refunds you owe back).
  try { renderIOweSection(container); } catch(e){ console.warn('renderIOweSection failed:', e); }
}

// ════════════════════════════════════════════════════════════════════
// "YOU OWE THESE PEOPLE" SECTION (refunds owed back from overpayments)
// ════════════════════════════════════════════════════════════════════
// Reads borrowData for entries flagged iOwe:true (created by the Money In
// overpayment flow when someone pays you more than they owe). Each row
// shows the amount + a "Pay back" button that opens the outgoing flow.
function renderIOweSection(container){
  if(!container) return;

  // Remove any prior render of this section so we don't stack
  var prior = document.getElementById('iOweSection');
  if(prior) prior.remove();

  // Collect iOwe entries across both passenger borrowData and external
  var rows = [];
  try {
    if(borrowData && typeof borrowData === 'object'){
      Object.keys(borrowData).forEach(function(name){
        var entries = borrowData[name] || [];
        var iow = calcIOweEntries(entries);
        iow.forEach(function(e){
          rows.push({ name: name, store: 'carpool', entry: e });
        });
      });
    }
  } catch(e){}
  try {
    var extD = (typeof loadExternalBorrows === 'function') ? loadExternalBorrows() : {};
    Object.keys(extD).forEach(function(key){
      var p = extD[key];
      if(!p) return;
      var iow = calcIOweEntries(p.entries);
      iow.forEach(function(e){
        rows.push({ name: p.name, store: 'external', extKey: key, entry: e });
      });
    });
  } catch(e){}

  if(rows.length === 0) return; // nothing to show

  var totalOwed = rows.reduce(function(s, r){ return s + Number(r.entry.amount||0); }, 0);

  var section = document.createElement('div');
  section.id = 'iOweSection';
  section.style.cssText = 'margin-top:24px;padding-top:20px;border-top:1px dashed #2a2a2a;';

  var html = ''
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">'
    +   '<div>'
    +     '<div style="font-family:Syne,sans-serif;font-weight:800;font-size:18px;color:#f2a830;letter-spacing:0.5px;">↩ YOU OWE</div>'
    +     '<div style="font-size:10px;color:var(--muted);letter-spacing:1.5px;text-transform:uppercase;margin-top:2px;">Refunds from overpayments</div>'
    +   '</div>'
    +   '<div style="background:#1a0f00;border:1px solid #5a3a00;border-radius:6px;padding:6px 12px;color:#f2a830;font-family:DM Mono,monospace;font-size:13px;font-weight:700;">R'+totalOwed.toFixed(2)+'</div>'
    + '</div>';

  rows.forEach(function(r){
    var amt = Number(r.entry.amount||0);
    var dateStr = r.entry.date || '';
    var noteStr = r.entry.note || '';
    var idAttr  = r.entry.id || '';
    var storeAttr = r.store;
    var keyAttr = r.store === 'external' ? (r.extKey || '') : (r.name || '');
    html += ''
      + '<div style="background:#1a0f00;border:1px solid #5a3a00;border-radius:8px;padding:12px 14px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:10px;">'
      +   '<div style="flex:1;min-width:0;">'
      +     '<div style="font-family:Syne,sans-serif;font-weight:700;font-size:14px;color:#f2a830;">'+escHtml(r.name)+'</div>'
      +     '<div style="font-size:10px;color:#aa7a00;letter-spacing:0.5px;margin-top:2px;">'+escHtml(noteStr || ('Owe back to '+r.name))+(dateStr ? ' · '+dateStr : '')+'</div>'
      +   '</div>'
      +   '<div style="font-family:DM Mono,monospace;font-size:14px;font-weight:700;color:#f2a830;flex-shrink:0;">R'+amt.toFixed(2)+'</div>'
      +   '<button onclick="openIOwePayBack(\''+storeAttr+'\',\''+keyAttr.replace(/\'/g,"\\'")+'\',\''+idAttr+'\')" '
      +     'style="flex-shrink:0;background:#f2a830;border:none;color:#000;font-family:DM Mono,monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;padding:8px 12px;border-radius:5px;cursor:pointer;font-weight:700;">Pay back</button>'
      + '</div>';
  });

  section.innerHTML = html;
  container.appendChild(section);
}

// Tiny HTML escape utility for safe concatenation. Some modules already
// define escHtml; only declare it here if it doesn't exist.
if(typeof escHtml === 'undefined'){
  window.escHtml = function(s){
    if(s == null) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  };
}

// ── EXPORT INDIVIDUAL PERSON PDF ──
function exportPersonPDF(btn){
  var card = btn.closest('[data-mo-idx]');
  var idx = card ? card.getAttribute('data-mo-idx') : null;
  var p = (idx !== null && window._moPersonMap) ? window._moPersonMap[idx] : null;
  if(!p){ alert('Could not find person data. Please try again.'); return; }

  var orig = btn.textContent;
  btn.textContent = '⏳…';
  btn.disabled = true;
  setTimeout(function(){ btn.textContent = orig; btn.disabled = false; }, 4000);

  if(typeof window.jspdf === 'undefined'){
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = function(){ _buildPersonPDF(p); };
    document.head.appendChild(s);
  } else {
    _buildPersonPDF(p);
  }
}

function _buildPersonPDF(p){
  var owing = p.borrowed - p.repaid;
  var settled = owing <= 0;
  var pct = p.borrowed > 0 ? Math.min(100, Math.round((p.repaid/p.borrowed)*100)) : 0;
  var today = new Date().toLocaleDateString('en-ZA');

  var {jsPDF} = window.jspdf;
  var doc = new jsPDF({unit:'mm', format:'a4'});

  function newPage(){
    doc.addPage();
    doc.setFillColor(10,10,10); doc.rect(0,0,210,297,'F');
    doc.setFillColor(167,139,250); doc.rect(0,0,210,2,'F');
    doc.setTextColor(50,50,50); doc.setFontSize(8); doc.setFont('helvetica','normal');
    doc.text(p.name+' (cont.) · '+today, 105, 12, {align:'center'});
    return 22;
  }

  // Background + stripe
  doc.setFillColor(10,10,10); doc.rect(0,0,210,297,'F');
  doc.setFillColor(167,139,250); doc.rect(0,0,210,2,'F');

  // Header
  doc.setTextColor(107,79,168); doc.setFontSize(9); doc.setFont('helvetica','normal');
  doc.text('MONEY OWED · '+(p.tag==='carpool'?'CARPOOL':'PERSONAL'), 105, 16, {align:'center'});
  doc.setTextColor(167,139,250); doc.setFontSize(28); doc.setFont('helvetica','bold');
  doc.text(p.name, 105, 30, {align:'center'});
  doc.setTextColor(85,85,85); doc.setFontSize(10); doc.setFont('helvetica','normal');
  doc.text('Generated: '+today, 105, 38, {align:'center'});
  doc.setDrawColor(167,139,250); doc.setLineWidth(0.5); doc.line(20,43,190,43);

  // Summary
  var y = 52;
  doc.setFontSize(9);
  doc.setTextColor(107,79,168); doc.text('Total Lent', 20, y);
  doc.setTextColor(167,139,250); doc.setFont('helvetica','bold');
  doc.text('R'+p.borrowed.toLocaleString('en-ZA'), 70, y, {align:'right'});
  doc.setFont('helvetica','normal');
  doc.setTextColor(90,136,0); doc.text('Repaid', 105, y, {align:'center'});
  doc.setTextColor(200,242,48); doc.setFont('helvetica','bold');
  doc.text('R'+p.repaid.toLocaleString('en-ZA'), 145, y, {align:'right'});
  doc.setFont('helvetica','normal');
  doc.setTextColor(settled?90:180, settled?136:120, settled?0:40);
  doc.text(settled?'✓ Settled':'Still Owed', 155, y);
  if(settled){
    doc.setTextColor(200,242,48); doc.setFont('helvetica','bold');
    doc.text('Settled', 190, y, {align:'right'});
  } else {
    doc.setTextColor(242,168,48); doc.setFont('helvetica','bold');
    doc.text('R'+owing.toLocaleString('en-ZA'), 190, y, {align:'right'});
  }
  doc.setFont('helvetica','normal');
  y += 5;

  // Progress bar
  doc.setFillColor(30,30,30); doc.rect(20,y,170,3,'F');
  var barW = Math.round((pct/100)*170);
  if(barW > 0){
    if(settled) doc.setFillColor(200,242,48);
    else doc.setFillColor(112,144,240);
    doc.rect(20,y,barW,3,'F');
  }
  doc.setTextColor(60,60,60); doc.setFontSize(8);
  doc.text(pct+'% repaid', 105, y+8, {align:'center'});
  y += 14;

  doc.setDrawColor(40,40,40); doc.setLineWidth(0.3); doc.line(20,y,190,y);
  y += 8;

  var bottomMargin = 270;
  var sortedEntries = (p.entries||[]).slice().sort(function(a,b){ return a.date < b.date ? -1 : 1; });

  if(sortedEntries.length === 0){
    doc.setTextColor(60,60,60); doc.setFontSize(11);
    doc.text('No transactions recorded.', 105, y+10, {align:'center'});
    y += 20;
  }

  sortedEntries.forEach(function(e){
    if(y > bottomMargin){ y = newPage(); }
    var label = e.date + (e.note ? ' · '+e.note : '');
    doc.setFontSize(11); doc.setFont('helvetica','normal');
    if(e.type === 'repay'){
      doc.setTextColor(85,85,85); doc.text(label, 20, y);
      doc.setTextColor(112,144,240); doc.text('Repaid -R'+Number(e.amount).toLocaleString('en-ZA'), 190, y, {align:'right'});
    } else {
      doc.setTextColor(85,85,85); doc.text(label, 20, y);
      doc.setTextColor(167,139,250); doc.text('Lent R'+Number(e.amount).toLocaleString('en-ZA'), 190, y, {align:'right'});
    }
    doc.setDrawColor(25,25,25); doc.setLineWidth(0.2); doc.line(20,y+3,190,y+3);
    y += 12;
  });

  // Totals
  if(y + 30 > bottomMargin){ y = newPage(); }
  y += 4;
  doc.setDrawColor(167,139,250); doc.setLineWidth(0.5); doc.line(20,y,190,y); y += 8;
  doc.setFontSize(9); doc.setFont('helvetica','normal');
  doc.setTextColor(107,79,168); doc.text('Total Lent', 20, y);
  doc.setTextColor(167,139,250); doc.setFont('helvetica','bold');
  doc.text('R'+p.borrowed.toLocaleString('en-ZA'), 190, y, {align:'right'}); y += 7;
  doc.setFont('helvetica','normal');
  doc.setTextColor(90,136,0); doc.text('Repaid', 20, y);
  doc.setTextColor(200,242,48); doc.setFont('helvetica','bold');
  doc.text('R'+p.repaid.toLocaleString('en-ZA'), 190, y, {align:'right'}); y += 7;
  if(!settled){
    doc.setFont('helvetica','normal');
    doc.setTextColor(180,120,40); doc.text('OUTSTANDING', 20, y);
    doc.setTextColor(242,168,48); doc.setFont('helvetica','bold');
    doc.setFontSize(14);
    doc.text('R'+owing.toLocaleString('en-ZA'), 190, y+1, {align:'right'});
  } else {
    doc.setTextColor(200,242,48); doc.setFont('helvetica','bold');
    doc.setFontSize(14); doc.text('✓ FULLY SETTLED', 190, y+1, {align:'right'});
  }

  // Footer
  doc.setTextColor(50,50,50); doc.setFontSize(8); doc.setFont('helvetica','normal');
  doc.text('Generated by My Dashboard · '+today, 105, 285, {align:'center'});

  doc.save('Borrowed_'+p.name+'_'+today.replace(/\//g,'-')+'.pdf');
}

// Patch openRepayModal to accept an optional passenger name
var _origOpenRepayModal = null;
function openRepayModalFor(passengerName){
  const sel = document.getElementById('repayPassenger');
  if(sel) sel.value = passengerName;
  openRepayModal();
}
function saveDailyFuel(){
  try{ var el=document.getElementById('dailyFuelCost'); if(el) lsSet(DAILY_FUEL_KEY, el.value); }catch(e){}
}
function restoreDailyFuel(){
  try{ var v=lsGet(DAILY_FUEL_KEY); var el=document.getElementById('dailyFuelCost'); if(v&&el) el.value=v; }catch(e){}
}
function loadBorrowReport() {
  // Read carpool borrows — yasin_borrows_v1 is a {passenger: [...entries]} object
  const raw = JSON.parse(lsGet(BORROW_KEY) || '{}');

  let totalBorrowed = 0;
  let totalRepaid = 0;
  const byPerson = {}; // { name: { borrowed, repaid, tag } }

  // 1) Carpool passengers
  Object.keys(raw).forEach(function(passenger) {
    const entries = raw[passenger] || [];
    entries.forEach(function(b) {
      if(b.type === 'repay'){
        totalRepaid += Number(b.amount || 0);
        if (!byPerson[passenger]) byPerson[passenger] = { borrowed: 0, repaid: 0, tag: 'carpool' };
        byPerson[passenger].repaid += Number(b.amount || 0);
      } else {
        const amount = Number(b.amount || 0);
        const repaid = b.paid ? amount : 0;
        totalBorrowed += amount;
        totalRepaid += repaid;
        if (!byPerson[passenger]) byPerson[passenger] = { borrowed: 0, repaid: 0, tag: 'carpool' };
        byPerson[passenger].borrowed += amount;
        byPerson[passenger].repaid += repaid;
      }
    });
  });

  // 2) External / Personal borrows — yb_external_borrows_v1
  const extData = loadExternalBorrows();
  Object.keys(extData).forEach(function(key) {
    const p = extData[key];
    const entries = p.entries || [];
    const displayName = p.name || key;
    entries.forEach(function(b) {
      if(b.type === 'repay'){
        totalRepaid += Number(b.amount || 0);
        if (!byPerson[displayName]) byPerson[displayName] = { borrowed: 0, repaid: 0, tag: 'personal' };
        byPerson[displayName].repaid += Number(b.amount || 0);
      } else {
        const amount = Number(b.amount || 0);
        totalBorrowed += amount;
        if (!byPerson[displayName]) byPerson[displayName] = { borrowed: 0, repaid: 0, tag: 'personal' };
        byPerson[displayName].borrowed += amount;
      }
    });
  });

  const el = function(id){ return document.getElementById(id); };
  el('rptBorrowTotal').textContent  = fmtR(totalBorrowed);
  el('rptBorrowRepaid').textContent = fmtR(totalRepaid);
  // Clamp owing at 0 — repayments can exceed borrows in normal usage
  // (e.g. when a passenger settles old debts via carpool credits) and
  // a negative number in the report is just confusing.
  el('rptBorrowOwing').textContent  = fmtR(Math.max(0, totalBorrowed - totalRepaid));

  const container = el('rptBorrowRows');
  container.innerHTML = '';

  const names = Object.keys(byPerson);
  if (names.length === 0) {
    container.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:8px 0;">No borrow records yet.</div>';
    return;
  }

  names.forEach(function(name) {
    const b = byPerson[name];
    const rawOwing = b.borrowed - b.repaid;
    const owing    = Math.max(0, rawOwing);   // never display negatives
    const settled  = rawOwing <= 0;
    const tagBadge = b.tag === 'personal'
      ? '<span style="font-size:9px;padding:1px 7px;border-radius:100px;background:#1a1a2e;color:#7090f0;border:1px solid #2a2a5a;letter-spacing:1px;margin-left:6px;">👤 PERSONAL</span>'
      : '<span style="font-size:9px;padding:1px 7px;border-radius:100px;background:#1a2e00;color:#c8f230;border:1px solid #3a5a00;letter-spacing:1px;margin-left:6px;">🚗 CARPOOL</span>';
    const row = document.createElement('div');
    row.className = 'rpt-row';
    row.style.gridTemplateColumns = '1.5fr 1fr 1fr 1fr';
    // Settled balances show "✓ Settled" in green; outstanding balances
    // show the amount in orange. Either way, no negatives ever leak out.
    const owingCell = settled
      ? '<span style="color:#c8f230;font-weight:500">✓ Settled</span>'
      : '<span style="color:#f2a830;font-weight:500">' + fmtR(owing) + '</span>';
    row.innerHTML =
      '<span style="color:var(--text);display:flex;align-items:center;">' + name + tagBadge + '</span>' +
      '<span style="color:var(--muted)">' + fmtR(b.borrowed) + '</span>' +
      '<span style="color:#c8f230">' + fmtR(b.repaid) + '</span>' +
      owingCell;
    container.appendChild(row);
  });
}


/* ══════════════════════════════════ */

// UTILS
function uid(){return Math.random().toString(36).slice(2,9);}
function stripEmoji(s){
  if(!s) return '';
  var r='';
  for(var i=0;i<s.length;i++){ var code=s.charCodeAt(i); if(code>=55296&&code<=57343){i++;}else if(code<=127){r+=s[i];} }
  return r.replace(/s+/g,' ').trim();
}

function fmtR(n){return 'R'+Number(n).toLocaleString('en-ZA');}
// ════════════════════════════════════════════════════════════════════
// ROLE-BASED TAB ACCESS GUARD
// ════════════════════════════════════════════════════════════════════
// Returns true if the current user is allowed to navigate to the given tab.
// Used by switchTab and goToTab to prevent restricted users (passengers,
// carservice) from reaching admin-only areas via any code path — including
// drawer items, Odin chat commands, and direct function calls.
//
// admin       → full access to everything
// carservice  → only the cars page (Munier's role)
// passenger   → only the carpool page (David, Lezaun, Shireen)
function _roleCanAccessTab(tab){
  try {
    var role = window.currentRole || 'admin';
    if(role === 'admin') return true;
    if(role === 'carservice'){
      // Munier should only see Cars. Allow only that single tab.
      return tab === 'cars';
    }
    if(role === 'passenger'){
      // Passengers should only see their own carpool view.
      return tab === 'carpool';
    }
    // Unknown role — fail closed
    return false;
  } catch(e){ return false; }
}

// ════════════════════════════════════════════════════════════════════
// DEFENSIVE TAB RENDER DISPATCHER (item 12)
// ════════════════════════════════════════════════════════════════════
// Centralises all per-tab render calls and wraps each one in a try/catch.
// Used by both switchTab and goToTab so that a single failed render
// (missing function, undefined ref, throw inside a render) doesn't break
// navigation or prevent sibling renders in the same tab from running.
function _renderTabSafely(tab){
  if(tab==='home')       _safeCall(typeof renderHome==='function'?renderHome:null, 'renderHome');
  if(tab==='carpool')    _safeCall(typeof renderCarpool==='function'?renderCarpool:null, 'renderCarpool');
  if(tab==='savings'){
    _safeCall(typeof renderFunds==='function'?renderFunds:null, 'renderFunds');
    _safeCall(typeof renderCustomMaintCards==='function'?renderCustomMaintCards:null, 'renderCustomMaintCards');
    _safeCall(typeof renderMaintCard==='function'?renderMaintCard:null, 'renderMaintCard');
  }
  if(tab==='reports'){
    _safeCall(typeof renderReportFilters==='function'?renderReportFilters:null, 'renderReportFilters');
    _safeCall(typeof renderReports==='function'?renderReports:null, 'renderReports');
    _safeCall(typeof loadBorrowReport==='function'?loadBorrowReport:null, 'loadBorrowReport');
    _safeCall(typeof restoreDailyFuel==='function'?restoreDailyFuel:null, 'restoreDailyFuel');
    _safeCall(typeof loadFuelReport==='function'?loadFuelReport:null, 'loadFuelReport');
    _safeCall(typeof restorePricingSettings==='function'?restorePricingSettings:null, 'restorePricingSettings');
    _safeCall(typeof runSmartEngine==='function'?runSmartEngine:null, 'runSmartEngine');
    _safeCall(typeof initCFReportPickers==='function'?initCFReportPickers:null, 'initCFReportPickers');
  }
  if(tab==='prayer'){ pDayOffset=0; _safeCall(typeof renderPrayer==='function'?renderPrayer:null, 'renderPrayer'); }
  if(tab==='money'){
    _safeCall(typeof renderMoneyOwed==='function'?renderMoneyOwed:null, 'renderMoneyOwed');
    _safeCall(function(){ if(typeof renderOdinInsights==='function') renderOdinInsights('money'); }, 'renderOdinInsights(money)');
  }
  if(tab==='cars')        _safeCall(typeof renderCars==='function'?renderCars:null, 'renderCars');
  if(tab==='instalments') _safeCall(typeof renderInst==='function'?renderInst:null, 'renderInst');
  if(tab==='school')      _safeCall(typeof renderSchool==='function'?renderSchool:null, 'renderSchool');
  if(tab==='routine')     _safeCall(typeof renderRoutine==='function'?renderRoutine:null, 'renderRoutine');
  if(tab==='cashflow')    _safeCall(typeof renderCashFlow==='function'?renderCashFlow:null, 'renderCashFlow');
  if(tab==='odin'){
    _safeCall(typeof renderOdinTab==='function'?renderOdinTab:null, 'renderOdinTab');
    // The Odin tab page also embeds report-style sections (🔧 Maintenance,
    // 💸 Borrowed, 🚗 Car Expenses, ⛽ Fuel). These are populated by the
    // Reports renderers — not by renderOdinTab — so we call them here too.
    // Otherwise the embedded sections show R0 forever.
    _safeCall(typeof renderReports==='function'?renderReports:null, 'renderReports (for odin tab)');
    _safeCall(typeof loadBorrowReport==='function'?loadBorrowReport:null, 'loadBorrowReport (for odin tab)');
    _safeCall(typeof loadFuelReport==='function'?loadFuelReport:null, 'loadFuelReport (for odin tab)');
    _safeCall(typeof renderMaintReport==='function'?renderMaintReport:null, 'renderMaintReport (for odin tab)');
  }
}

function _safeCall(fn, label){
  try {
    if(typeof fn === 'function') fn();
    else if(fn !== null) console.warn('[_safeCall] not a function:', label);
  } catch(e){
    console.warn('[_safeCall] '+label+' threw:', e);
  }
}

function switchTab(tab,btn){
  // Enforce role — silently ignore attempts to switch to disallowed tabs.
  // Without this, drawer items and Odin chat commands could navigate
  // restricted users into admin areas even when buttons are hidden.
  if(!_roleCanAccessTab(tab)){
    console.warn('[role guard] Blocked switchTab to:', tab, 'role:', window.currentRole);
    return;
  }
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('navSavings').classList.remove('active');
  document.getElementById('navCarpool').classList.remove('active');
  var navHome = document.getElementById('navHome');
  if(navHome) navHome.classList.remove('active');
  var navCars = document.getElementById('navCars');
  if(navCars) navCars.classList.remove('active');
  var navInst = document.getElementById('navInstalments');
  if(navInst) navInst.classList.remove('active');
  var navSchool = document.getElementById('navSchool');
  if(navSchool) navSchool.classList.remove('active');
  var navRoutine = document.getElementById('navRoutine');
  if(navRoutine) navRoutine.classList.remove('active');
  var navCf = document.getElementById('navCashflow');
  if(navCf) navCf.classList.remove('active');
  var navOdin = document.getElementById('navOdin');
  if(navOdin) navOdin.classList.remove('active');
  if(tab==='home' && navHome) navHome.classList.add('active');
  if(tab==='savings') document.getElementById('navSavings').classList.add('active');
  if(tab==='carpool') document.getElementById('navCarpool').classList.add('active');
  if(tab==='cars' && navCars) navCars.classList.add('active');
  if(tab==='instalments' && navInst) navInst.classList.add('active');
  if(tab==='school' && navSchool) navSchool.classList.add('active');
  if(tab==='routine' && navRoutine) navRoutine.classList.add('active');
  if(tab==='cashflow' && navCf) navCf.classList.add('active');
  if(tab==='odin' && navOdin) navOdin.classList.add('active');
  document.getElementById('page-'+tab).classList.add('active');
  // Defensive render dispatch — each render call wrapped so a single
  // failure (missing function, ReferenceError) doesn't halt others or
  // break tab navigation. Same pattern as the maintenance card boot fix.
  _renderTabSafely(tab);
}

// Navigate to a tab without needing a button reference
function goToTab(tab){
  // Enforce role — same guard as switchTab so all programmatic navigation
  // respects access control.
  if(!_roleCanAccessTab(tab)){
    console.warn('[role guard] Blocked goToTab to:', tab, 'role:', window.currentRole);
    return;
  }
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('navSavings').classList.remove('active');
  document.getElementById('navCarpool').classList.remove('active');
  var navHome = document.getElementById('navHome');
  if(navHome) navHome.classList.remove('active');
  var navCars = document.getElementById('navCars');
  if(navCars) navCars.classList.remove('active');
  var navInst = document.getElementById('navInstalments');
  if(navInst) navInst.classList.remove('active');
  var navSchool = document.getElementById('navSchool');
  if(navSchool) navSchool.classList.remove('active');
  var navRoutine = document.getElementById('navRoutine');
  if(navRoutine) navRoutine.classList.remove('active');
  var navCf = document.getElementById('navCashflow');
  if(navCf) navCf.classList.remove('active');
  if(tab==='home' && navHome) navHome.classList.add('active');
  if(tab==='savings') document.getElementById('navSavings').classList.add('active');
  if(tab==='carpool') document.getElementById('navCarpool').classList.add('active');
  if(tab==='cars' && navCars) navCars.classList.add('active');
  if(tab==='instalments' && navInst) navInst.classList.add('active');
  if(tab==='school' && navSchool) navSchool.classList.add('active');
  if(tab==='routine' && navRoutine) navRoutine.classList.add('active');
  if(tab==='cashflow' && navCf) navCf.classList.add('active');
  document.getElementById('page-'+tab).classList.add('active');
  // Defensive render dispatch — each render call wrapped so a single
  // failure (missing function, ReferenceError) doesn't halt others or
  // break tab navigation. Same pattern as the maintenance card boot fix.
  _renderTabSafely(tab);
}

// ── POST-LOGIN LAUNCH MENU ──

// ════════════════════════════════════════════════════════════════════
// "PAY BACK" OUTGOING FLOW (refunds owed to a person)
// ════════════════════════════════════════════════════════════════════
// Opens a small modal asking which bank source to pay from + date, then
// logs the payment as a Cash Flow expense, marks the iOwe entry as
// completed (so it disappears from the "You owe" section), and refreshes
// the Money tab.
//
// Why a full modal instead of one-click "Done"? So your Cash Flow stays
// accurate. A one-click would leave the refund untracked in your books.
function openIOwePayBack(store, key, entryId){
  if(!store || !key || !entryId){ alert('Could not identify that refund.'); return; }
  // Look up the entry to confirm it still exists and get the amount
  var entry = _findIOweEntry(store, key, entryId);
  if(!entry){
    alert('That refund record could not be found. It may have been resolved already.');
    try { renderMoneyOwed(); } catch(e){}
    return;
  }
  // Stash for the submit handler so we don't have to re-look-up by element ids
  window._iOwePending = { store: store, key: key, entryId: entryId, entry: entry };

  // Inline modal — kept tight, no chrome — replaces a heavier overlay so
  // the flow feels fast.
  var existing = document.getElementById('iOweModal');
  if(existing) existing.remove();
  var displayName = (store === 'external') ? entry.__personName : key;
  var amt = Number(entry.amount||0);
  var todayStr = (typeof localDateStr === 'function') ? localDateStr(new Date()) : new Date().toISOString().slice(0,10);

  var modal = document.createElement('div');
  modal.id = 'iOweModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9000;display:flex;align-items:flex-end;justify-content:center;';
  modal.innerHTML = ''
    + '<div style="background:#0d0d0d;border:1px solid #2a2a2a;border-radius:14px 14px 0 0;width:100%;max-width:480px;padding:18px;color:#efefef;font-family:DM Mono,monospace;">'
    +   '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">'
    +     '<div>'
    +       '<div style="font-family:Syne,sans-serif;font-weight:800;font-size:18px;color:#f2a830;">↩ Pay back '+escHtml(displayName)+'</div>'
    +       '<div style="font-size:10px;color:var(--muted);letter-spacing:1.5px;text-transform:uppercase;margin-top:2px;">Refund owed: R'+amt.toFixed(2)+'</div>'
    +     '</div>'
    +     '<button onclick="document.getElementById(\'iOweModal\').remove();" style="background:none;border:none;color:var(--muted);font-size:22px;cursor:pointer;">&times;</button>'
    +   '</div>'
    +   '<div style="margin-bottom:10px;">'
    +     '<div style="font-size:9px;color:var(--muted);letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">Amount paid</div>'
    +     '<input type="number" id="iOweAmt" value="'+amt.toFixed(2)+'" step="0.01" '
    +       'style="width:100%;background:#111;border:1px solid #2a2a2a;color:#c8f230;font-family:DM Mono,monospace;font-size:16px;font-weight:700;padding:10px 12px;border-radius:6px;outline:none;box-sizing:border-box;"/>'
    +   '</div>'
    +   '<div style="margin-bottom:10px;">'
    +     '<div style="font-size:9px;color:var(--muted);letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">Paid from</div>'
    +     '<select id="iOweBank" style="width:100%;background:#111;border:1px solid #2a2a2a;color:#efefef;font-family:DM Mono,monospace;font-size:13px;padding:10px 12px;border-radius:6px;outline:none;">'
    +       '<option value="TymeBank">TymeBank</option>'
    +       '<option value="FNB">FNB</option>'
    +       '<option value="Cash">Cash</option>'
    +       '<option value="Other">Other</option>'
    +     '</select>'
    +   '</div>'
    +   '<div style="margin-bottom:14px;">'
    +     '<div style="font-size:9px;color:var(--muted);letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">Date</div>'
    +     '<input type="date" id="iOweDate" value="'+todayStr+'" '
    +       'style="width:100%;background:#111;border:1px solid #2a2a2a;color:#efefef;font-family:DM Mono,monospace;font-size:13px;padding:10px 12px;border-radius:6px;outline:none;box-sizing:border-box;"/>'
    +   '</div>'
    +   '<div style="display:flex;gap:8px;">'
    +     '<button onclick="document.getElementById(\'iOweModal\').remove();" style="flex:1;padding:11px;background:none;border:1px solid #2a2a2a;border-radius:6px;color:var(--muted);font-family:DM Mono,monospace;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;">Cancel</button>'
    +     '<button onclick="confirmIOwePayBack()" style="flex:2;padding:11px;background:#f2a830;border:none;border-radius:6px;color:#000;font-family:DM Mono,monospace;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;font-weight:700;">✓ Confirm payment</button>'
    +   '</div>'
    + '</div>';
  document.body.appendChild(modal);
}

// Submit handler for the pay-back modal.
function confirmIOwePayBack(){
  var pending = window._iOwePending;
  if(!pending){ alert('Session lost — please try again.'); return; }
  var amt = parseFloat(document.getElementById('iOweAmt').value)||0;
  var bank = document.getElementById('iOweBank').value || 'TymeBank';
  var date = document.getElementById('iOweDate').value || (typeof localDateStr === 'function' ? localDateStr(new Date()) : new Date().toISOString().slice(0,10));
  if(amt <= 0){ alert('Enter the amount you paid.'); return; }
  var owed = Number(pending.entry.amount||0);
  if(amt > owed + 0.001){
    if(!confirm('You\'re paying back R'+amt.toFixed(2)+' but only R'+owed.toFixed(2)+' is owed. Continue?')) return;
  }

  try {
    // (1) Log Cash Flow expense
    var personName = (pending.store === 'external') ? pending.entry.__personName : pending.key;
    if(typeof postToCF === 'function'){
      postToCF({
        label: 'Refund to ' + personName,
        amount: amt,
        date: date,
        icon: 'expense',
        type: 'expense',
        sourceType: 'refund_paid',
        sourceId: pending.entryId,
        sourceCardName: personName,
        note: 'Refund of overpayment ('+bank+')'
      });
    }

    // (2) Mark the iOwe entry as completed (or partially settled if underpaid)
    if(pending.store === 'carpool'){
      var arr = borrowData[pending.key] || [];
      var idx = arr.findIndex(function(e){ return e.id === pending.entryId; });
      if(idx > -1){
        if(amt >= owed - 0.001){
          arr[idx].completed = true;
          arr[idx].paid = true;
          arr[idx].paidDate = date;
          arr[idx].paidBank = bank;
        } else {
          // Partial payment — reduce the owed amount
          arr[idx].amount = owed - amt;
          arr[idx].note = (arr[idx].note||'') + ' (R'+amt.toFixed(2)+' partial '+date+')';
        }
        if(typeof saveBorrows === 'function') saveBorrows();
      }
    } else if(pending.store === 'external'){
      var extD = loadExternalBorrows();
      var person = extD[pending.key];
      if(person && person.entries){
        var idx2 = person.entries.findIndex(function(e){ return e.id === pending.entryId; });
        if(idx2 > -1){
          if(amt >= owed - 0.001){
            person.entries[idx2].completed = true;
            person.entries[idx2].paidDate = date;
            person.entries[idx2].paidBank = bank;
          } else {
            person.entries[idx2].amount = owed - amt;
            person.entries[idx2].note = (person.entries[idx2].note||'') + ' (R'+amt.toFixed(2)+' partial '+date+')';
          }
          saveExternalBorrows(extD);
        }
      }
    }

    // (3) Cleanup + refresh
    var modal = document.getElementById('iOweModal'); if(modal) modal.remove();
    window._iOwePending = null;
    try { renderMoneyOwed(); } catch(e){}
    try { if(typeof odinRefreshIfOpen === 'function') odinRefreshIfOpen(); } catch(e){}

    // (4) Toast
    var toast = document.createElement('div');
    toast.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1a0f00;border:1px solid #f2a830;border-radius:10px;padding:12px 20px;z-index:9999;font-family:DM Mono,monospace;font-size:11px;color:#f2a830;letter-spacing:1px;box-shadow:0 4px 24px rgba(0,0,0,.6);';
    toast.textContent = '✓ R'+amt.toFixed(2)+' refunded to '+personName+' via '+bank;
    document.body.appendChild(toast);
    setTimeout(function(){ toast.remove(); }, 3500);

  } catch(err){
    console.error('Pay-back failed:', err);
    alert('Something went wrong saving the refund. Your data is unchanged.');
  }
}

// Helper: locate an iOwe entry across both stores by id.
function _findIOweEntry(store, key, entryId){
  try {
    if(store === 'carpool'){
      var arr = (borrowData && borrowData[key]) || [];
      var hit = arr.find(function(e){ return e.id === entryId; });
      return hit || null;
    }
    if(store === 'external'){
      var extD = (typeof loadExternalBorrows === 'function') ? loadExternalBorrows() : {};
      var person = extD[key];
      if(!person) return null;
      var hit2 = (person.entries||[]).find(function(e){ return e.id === entryId; });
      if(!hit2) return null;
      hit2.__personName = person.name; // attach for label use
      return hit2;
    }
  } catch(e){}
  return null;
}
// ════════════════════════════════════════════════════════════════════
// END PAY-BACK FLOW
// ════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════
// MANAGE REPAYMENTS (May 2026 — fixes hidden-repayment problem)
// Repayment-type entries are hidden from the person card (intentional —
// keeps the mini-statement clean). But that meant a wrongly-logged or
// stale repayment could silently distort the running total with NO way
// to view or remove it. This modal exposes every repayment for a person
// and lets you delete individual ones, reusing the SAME delete functions
// the card already uses (so cloud soft-delete + linked Cash Flow reversal
// all happen correctly — no new delete logic, just visibility).
// ════════════════════════════════════════════════════════════════════
function openRepaymentsManager(personKey, tag){
  var entries = [];
  var name = personKey;
  if(tag === 'carpool'){
    if(typeof loadBorrows === 'function') loadBorrows();
    entries = (borrowData[personKey] || [])
      .filter(function(e){ return !e._deleted && e.type === 'repay'; });
    name = personKey;
  } else {
    var d = loadExternalBorrows();
    var person = d[personKey];
    if(person){
      name = person.name || personKey;
      entries = (person.entries || [])
        .filter(function(e){ return !e._deleted && e.type === 'repay'; });
    }
  }

  var modal = document.getElementById('repayMgrModal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'repayMgrModal';
    modal.className = 'overlay';
    modal.innerHTML =
      '<div class="modal" style="max-width:420px;">'
      + '<h2 style="font-family:\'Syne\',sans-serif;font-weight:800;font-size:20px;color:var(--text);margin-bottom:4px;">↩ Repayments</h2>'
      + '<div id="repayMgrSub" style="font-size:10px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:16px;"></div>'
      + '<div id="repayMgrList"></div>'
      + '<div class="modal-btns" style="margin-top:18px;">'
      + '<button class="btn ghost" onclick="closeModal(\'repayMgrModal\')">Close</button>'
      + '</div>'
      + '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function(ev){ if(ev.target === modal) modal.classList.remove('active'); });
  }

  document.getElementById('repayMgrSub').textContent = name + ' · ' + entries.length + ' repayment' + (entries.length === 1 ? '' : 's');

  var listEl = document.getElementById('repayMgrList');
  if(!entries.length){
    listEl.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:20px 0;text-align:center;">No repayments logged for ' + name + '.</div>';
  } else {
    listEl.innerHTML = entries
      .slice()
      .sort(function(a,b){ return a.date < b.date ? -1 : 1; })
      .map(function(e){
        var delFn = tag === 'carpool'
          ? "deleteRepayFromManager('" + personKey + "','" + e.id + "','carpool')"
          : "deleteRepayFromManager('" + personKey + "','" + e.id + "','external')";
        var acct = e.account
          ? ' <span style="font-size:9px;background:#1a0e2e;border:1px solid #3a2060;border-radius:3px;padding:1px 4px;color:#a78bfa;">' + e.account + '</span>'
          : '';
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);">'
          + '<div style="display:flex;flex-direction:column;gap:2px;">'
          + '<span style="font-size:12px;color:#c8f230;font-weight:500;">+R' + Number(e.amount).toLocaleString('en-ZA') + '</span>'
          + '<span style="font-size:10px;color:var(--muted);">' + (e.date || '—') + (e.note ? ' · ' + e.note : '') + acct + '</span>'
          + '</div>'
          + '<button onclick="' + delFn + '" style="background:#1a0000;border:1px solid #5a1a1a;border-radius:6px;color:#f23060;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1px;padding:6px 12px;cursor:pointer;">🗑 Delete</button>'
          + '</div>';
      }).join('');
  }

  modal.classList.add('active');
}

// Bridges the manager's delete button to the existing, proven delete
// functions, then refreshes the manager so the list updates in place.
function deleteRepayFromManager(personKey, entryId, tag){
  if(tag === 'carpool'){
    if(typeof deleteBorrowEntry === 'function') deleteBorrowEntry(personKey, entryId);
  } else {
    if(typeof deleteBorrowEntryUnified === 'function') deleteBorrowEntryUnified('__ext__' + personKey, entryId);
  }
  // Re-render the manager so the deleted repayment drops out of the list.
  // Small delay lets the underlying save/render settle first.
  setTimeout(function(){
    if(document.getElementById('repayMgrModal') && document.getElementById('repayMgrModal').classList.contains('active')){
      openRepaymentsManager(personKey, tag);
    }
  }, 120);
}

if(typeof window !== 'undefined'){
  window.openRepaymentsManager = openRepaymentsManager;
  window.deleteRepayFromManager = deleteRepayFromManager;
}

// ════════════════════════════════════════════════════════════════════
// LINK BORROW EDIT → CASH FLOW (May 2026 — closes the last gap)
// A loan creates a linked CF expense (logBorrowToCashflow stamps cfId
// onto the borrow entry). Deleting the loan already removes that CF
// record. But EDITING the loan amount left the CF entry stale — the
// bug behind the Lezaun R110/R100 confusion. This finds the linked CF
// entry by cfId, updates its amount/date/label, and adjusts the bank
// baseline by the difference (so the bank tile stays correct — same
// reverse-old/apply-new pattern used in cashflow.js saveCfEntry).
// Safe no-op if the entry has no cfId (older entries / repayments).
// ════════════════════════════════════════════════════════════════════
function updateLinkedCFEntry(cfId, newAmount, newDate, personName){
  if(!cfId) return;                       // not linked — nothing to do
  if(typeof loadCFData !== 'function') return;
  try{
    var cfData = loadCFData();
    var found  = null, foundMk = null, foundSec = null;
    Object.keys(cfData).forEach(function(mk){
      ['income','expenses'].forEach(function(sec){
        if(found) return;
        var arr = cfData[mk] && cfData[mk][sec];
        if(!arr) return;
        var hit = arr.find(function(e){ return e.id === cfId; });
        if(hit){ found = hit; foundMk = mk; foundSec = sec; }
      });
    });
    if(!found) return;                    // linked CF entry not present

    var oldAmount = Number(found.amount) || 0;
    var newAmt    = Number(newAmount)    || 0;
    if(oldAmount === newAmt && (!newDate || newDate === found.date)) return; // no change

    // Adjust the bank baseline by the delta. A loan CF entry is an EXPENSE
    // (money left your account), so increasing the loan removes more, etc.
    // direction: expense => negative effect. delta in effect = -(new-old).
    if(typeof window._adjustBaselineForBank === 'function'){
      var bank = found.destBank
        || (['FNB','TymeBank','Cash'].indexOf(found.account) > -1 ? found.account : null);
      if(bank){
        var effectOld = -oldAmount;       // expense reduced the bank by oldAmount
        var effectNew = -newAmt;          // expense should reduce by newAmt
        window._adjustBaselineForBank(bank, (effectNew - effectOld));
      }
    }

    found.amount = newAmt;
    if(newDate) found.date = newDate;
    // Keep the label's amount-free wording; logBorrowToCashflow builds it
    // without the number, so no relabel needed. Leave label as-is.
    cfData[foundMk][foundSec] = cfData[foundMk][foundSec].map(function(e){
      return e.id === cfId ? found : e;
    });
    saveCFData(cfData);
    if(typeof renderCashFlow === 'function'){ try{ renderCashFlow(); }catch(e){} }
  }catch(e){ console.warn('updateLinkedCFEntry failed:', e); }
}
if(typeof window !== 'undefined') window.updateLinkedCFEntry = updateLinkedCFEntry;
