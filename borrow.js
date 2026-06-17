// Borrow: lending guardrail, edit borrows, archive


let borrowData = {};

function loadBorrows(){
  try{ borrowData = JSON.parse(lsGet(BORROW_KEY)||'{}'); }catch(e){ borrowData={}; }
}
function saveBorrows(){ lsSet(BORROW_KEY, JSON.stringify(borrowData)); odinRefreshIfOpen(); }

// ── Eager load on script parse ─────────────────────────────────────────────
// Also called from core.js DOMContentLoaded, but parsing this here removes
// the race window where a save could fire on empty `borrowData` before DOM ready.
try { loadBorrows(); } catch(e){}

// ════════════════════════════════════════════════════════════════════════════
// v108 ISSUE-3 — Carpool-borrow pocket picker (mirrors money.js _extLend*).
// When you lend cash to a passenger (David / Lezaun / Shireen), the money has
// to come OUT of a pocket and the bank tile must stay net 0 via the doorway.
// Pre-v108 the modal had no picker → bank drifted on every loan.
// ════════════════════════════════════════════════════════════════════════════
var _cpLendSelectedPocketId = null;

function _cpLendBalance(f){
  if(!f) return 0;
  if(f.isExpense){
    var tin  = (f.deposits||[]).filter(function(d){return d.txnType==='in';}).reduce(function(s,d){return s+d.amount;},0);
    var tout = (f.deposits||[]).filter(function(d){return d.txnType==='out'||!d.txnType;}).reduce(function(s,d){return s+d.amount;},0);
    return tin - tout;
  }
  return (typeof fundTotal === 'function') ? fundTotal(f) : 0;
}

function _cpLendRenderPocketList(){
  var box = document.getElementById('cpLendPocketPicker');
  if(!box) return;
  var list = (typeof funds !== 'undefined' ? funds : []).filter(function(f){ return f && !f._deleted; });
  if(!_cpLendSelectedPocketId){
    // Default to Daily if present, else first pocket with positive balance, else first.
    var daily = list.find(function(f){ return f.name === 'Daily'; });
    if(daily) _cpLendSelectedPocketId = daily.id;
    else {
      var firstWithBal = list.find(function(f){ return _cpLendBalance(f) > 0; });
      _cpLendSelectedPocketId = firstWithBal ? firstWithBal.id : (list[0] ? list[0].id : null);
    }
  }
  box.innerHTML = '';
  if(!list.length){
    box.innerHTML = '<div style="padding:14px;color:var(--muted);font-size:11px;text-align:center;letter-spacing:1px;">No pockets yet. Create one on the Savings tab.</div>';
    return;
  }
  list.forEach(function(f){
    var bal = _cpLendBalance(f);
    var isSel = (f.id === _cpLendSelectedPocketId);
    var balColor = bal <= 0 ? '#555' : '#c8f230';
    var row = document.createElement('button');
    row.type = 'button';
    row.dataset.fundId = f.id;
    row.onclick = function(){ _cpLendPickPocket(f.id); };
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

function _cpLendPickPocket(id){
  _cpLendSelectedPocketId = id;
  _cpLendRenderPocketList();
}

if(typeof window !== 'undefined'){
  window._cpLendPickPocket = _cpLendPickPocket;
  window._cpLendRenderPocketList = _cpLendRenderPocketList;
}

// ══ LENDING GUARDRAIL ══
function getLendingSnapshot(){
  var now=new Date();
  var mk=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  var cfData=loadCFData();
  var rI=(cfData.recurring&&cfData.recurring.income)||[];
  var rE=(cfData.recurring&&cfData.recurring.expenses)||[];
  var mI=(cfData[mk]&&cfData[mk].income)||[];
  var mE=(cfData[mk]&&cfData[mk].expenses)||[];
  var ids=new Set([...mI,...mE].map(function(e){return e.id;}));
  var allI=[...rI.filter(function(e){return !ids.has(e.id);}),...mI];
  var allE=[...rE.filter(function(e){return !ids.has(e.id);}),...mE];
  var SAVINGS_SRC=['savings_deposit','car_add','maint','custommaint','car_service_save','savings'];
  var SAVINGS_CAT=['Savings','Cars','Maintenance'];
  function _bIsSav(e){
    if(typeof cfIsSavingsAlloc === 'function') return cfIsSavingsAlloc(e);
    if(e.sourceType && SAVINGS_SRC.indexOf(e.sourceType) > -1) return true;
    if(e.category   && SAVINGS_CAT.indexOf(e.category)  > -1) return true;
    return false;
  }
  var inc=allI.reduce(function(s,e){return s+e.amount;},0);
  // Only count real expenses — not savings allocations (those are still your money)
  var exp=allE.filter(function(e){return !_bIsSav(e);}).reduce(function(s,e){return s+e.amount;},0);
  // Auto-pull of instalments removed for parity with in-app and PDF.
  // Instalment payments are logged manually when actually paid.
  // Auto-pulling them here was making the deficit alert fire incorrectly
  // at month-start (e.g. May 1 showed -R209 deficit just from MTN even
  // though no expenses had been entered).
  var net=inc-exp;
  var buf=Math.max(500,inc*0.1);
  return{net:net,totalIncome:inc,maxSafeLend:Math.max(0,net-buf)};
}
function getPersonOwing(name){
  var o=0;
  // FIX 2026-05-26: borrows with paid:true (set by Carpool's Mark Paid)
  // contribute 0 to owing, not their amount. Same fix applied in money.js
  // calcPersonTotals — keeps both calculations consistent.
  if(borrowData&&borrowData[name]) borrowData[name].forEach(function(e){o+=e.type==='borrow'?(e.paid?0:e.amount):-e.amount;});
  var ext=loadExternalBorrows();
  Object.values(ext).forEach(function(p){
    if(p.name&&p.name.toLowerCase()===name.toLowerCase())
      (p.entries||[]).forEach(function(e){o+=e.type==='borrow'?(e.paid?0:e.amount):-e.amount;});
  });
  return Math.max(0,o);
}
function renderGuardrail(vEl,dEl,mEl,pEl,name,amt){
  var s=getLendingSnapshot();
  var owing=name?getPersonOwing(name):0;
  pEl.style.display='block';
  var lines=['Net this month: '+(s.net>=0?'+':'-')+'R'+Math.abs(s.net).toFixed(2)];
  if(owing>0) lines.push(name+' still owes you R'+owing.toFixed(2));
  var v,vc,bc,bg;
  if(s.net<0){v='Do not lend - you are in the red';vc='#f23060';bc='#5a1a1a';bg='#1a0505';mEl.textContent='Safe to lend: R0';mEl.style.color='#f23060';}
  else if(s.maxSafeLend<=0){v='Caution - very little room';vc='#f2a830';bc='#5a3a00';bg='#1a1000';mEl.textContent='Safe to lend: R0';mEl.style.color='#f2a830';}
  else{v='Safe to lend up to R'+s.maxSafeLend.toFixed(2);vc='#c8f230';bc='#3a5a00';bg='#0d1a00';mEl.textContent='Max safe: R'+s.maxSafeLend.toFixed(2);mEl.style.color='#c8f230';}
  if(amt>0){
    if(amt>s.maxSafeLend){v='R'+amt.toFixed(2)+' is too much';vc='#f23060';bc='#5a1a1a';bg='#1a0505';mEl.textContent='Max safe: R'+s.maxSafeLend.toFixed(2);mEl.style.color='#f2a830';}
    else{v='R'+amt.toFixed(2)+' is fine to lend';vc='#c8f230';bc='#3a5a00';bg='#0d1a00';}
  }
  pEl.style.background=bg;pEl.style.borderColor=bc;
  vEl.style.color=vc;vEl.textContent=v;
  dEl.innerHTML=lines.map(function(l){return '· '+l;}).join('<br>');
}
function updateLendingGuardrail(){
  var p=document.getElementById('borrowPassenger');
  var a=parseFloat(document.getElementById('borrowAmt').value)||0;
  renderGuardrail(document.getElementById('guardrailVerdict'),document.getElementById('guardrailDetail'),document.getElementById('guardrailMax'),document.getElementById('lendingGuardrail'),p?p.value:'',a);
}
function updateExtLendingGuardrail(){
  var n=(document.getElementById('extBorrowName').value||'').trim();
  var a=parseFloat(document.getElementById('extBorrowAmt').value)||0;
  renderGuardrail(document.getElementById('extGuardrailVerdict'),document.getElementById('extGuardrailDetail'),document.getElementById('extGuardrailMax'),document.getElementById('extLendingGuardrail'),n,a);
}
function openBorrowModal(){
  document.getElementById('borrowAmt').value='';
  document.getElementById('borrowDate').value=localDateStr(new Date());
  document.getElementById('borrowNote').value='';

  // v109 ISSUE-5 — populate passenger dropdown from live PASSENGERS array
  // (mirrors openRepayModal pattern, line 597+). Previously hardcoded to
  // David/Lezaun/Shireen in index.html — new passengers never showed up.
  // Refresh globals first in case anything was edited mid-session.
  try { if(typeof loadPassengers === 'function') loadPassengers(); } catch(e){}
  var bSel = document.getElementById('borrowPassenger');
  var pList = (typeof PASSENGERS !== 'undefined' && PASSENGERS.length)
    ? PASSENGERS
    : (window.PASSENGERS || ['David','Lezaun','Shireen']);
  bSel.innerHTML = pList.map(function(p){
    return '<option value="'+p+'">'+p+'</option>';
  }).join('');

  // v108 — reset + render the pocket picker (mirrors openExternalBorrowModal)
  _cpLendSelectedPocketId = null;
  try { _cpLendRenderPocketList(); } catch(e){ console.warn('[v108] picker render failed', e); }
  document.getElementById('borrowModal').classList.add('active');
  setTimeout(updateLendingGuardrail,100);
}

function confirmBorrow(){
  const passenger = document.getElementById('borrowPassenger').value;
  const amount = parseFloat(document.getElementById('borrowAmt').value);
  const date = document.getElementById('borrowDate').value || localDateStr(new Date());
  const note = document.getElementById('borrowNote').value.trim();
  const account = document.getElementById('borrowAccount').value || 'FNB';
  if(!passenger || isNaN(amount) || amount<=0){ alert('Enter a valid amount.'); return; }

  // ── v108 ISSUE-3 — pocket-first: the lent money leaves a pocket ──────────
  var pocket = funds.find(function(f){ return f.id === _cpLendSelectedPocketId; });
  if(!pocket){ alert('Pick which pocket the money comes out of.'); return; }
  var pocketBal = _cpLendBalance(pocket);
  if(amount > pocketBal){
    alert('Only R' + Number(pocketBal).toLocaleString('en-ZA',{minimumFractionDigits:2,maximumFractionDigits:2})
      + ' available in ' + pocket.name + '. Pick another pocket or a smaller amount.');
    return;
  }

  if(!borrowData[passenger]) borrowData[passenger]=[];

  // v108: lendId links the borrow entry ↔ pocket deposit ↔ CF row for the
  //       hard-block guard + atomic reverse via _lendReverse.
  var lendId = 'ln_' + uid();
  var entryId = uid();
  var newEntry = {
    id: entryId, type:'borrow', amount, date, note, account, paid:false,
    originPocket: pocket.id,   // lets repayment auto-suggest the source pocket
    lendId: lendId
  };
  borrowData[passenger].push(newEntry);
  saveBorrows();

  // 1) Deduct the pocket (money genuinely leaves you)
  var pocketDepId = uid();
  pocket.deposits.push({
    id: pocketDepId,
    txnType: 'out',
    amount: amount,
    date: date,
    note: '💸 Lent to ' + passenger + (note ? ' · ' + note : ''),
    lendId: lendId,
    borrowEntryId: passenger + ':' + entryId
  });
  saveFunds();

  // 2) Log as expense in cashflow — stamp cfId + destBank for the reverse path
  var cfId = logBorrowToCashflow(passenger, amount, date, account, 'carpool', lendId);
  if(cfId){ newEntry.cfId = cfId; saveBorrows(); }

  // 3) Bank doorway (+amount in, -amount out → net 0). Bank tile unaffected.
  if(typeof window._adjustBaselineForBank === 'function'){
    window._adjustBaselineForBank(account, amount);    // doorway IN
    window._adjustBaselineForBank(account, -amount);   // doorway OUT
  }

  // 4) Stash the lend record so the hard-block guard + _lendReverse can find it.
  //    isCarpool:true tells _lendReverse to remove from borrowData (not external).
  var lendRecs = [];
  try { lendRecs = JSON.parse(lsGet('yb_lends_v1')||'[]'); } catch(e){}
  lendRecs.push({
    id: lendId,
    isCarpool: true,
    passenger: passenger,
    personName: passenger,
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

  closeModal('borrowModal');
  renderCarpool();
  if(typeof renderBankBalanceCard === 'function') try { renderBankBalanceCard(); } catch(e){}
}

// ── EDIT BORROW ENTRY ──
function openEditBorrowModal(passenger, entryId){
  const entries = borrowData[passenger] || [];
  const entry = entries.find(function(e){ return e.id === entryId; });
  if(!entry) return;
  document.getElementById('editBorrowPassenger').value  = passenger;
  document.getElementById('editBorrowId').value         = entryId;
  document.getElementById('editBorrowAmt').value        = entry.amount;
  document.getElementById('editBorrowDate').value       = entry.date;
  document.getElementById('editBorrowNote').value       = entry.note || '';
  document.getElementById('editBorrowTypeLabel').textContent = entry.type === 'repay' ? '↩ Repayment' : '💸 Borrow';
  document.getElementById('editBorrowModal').classList.add('active');
}

function confirmEditBorrow(){
  const passenger = document.getElementById('editBorrowPassenger').value;
  const entryId   = document.getElementById('editBorrowId').value;
  const amount    = parseFloat(document.getElementById('editBorrowAmt').value);
  const date      = document.getElementById('editBorrowDate').value;
  const note      = document.getElementById('editBorrowNote').value.trim();
  if(!amount || amount <= 0){ alert('Enter a valid amount.'); return; }
  const entries = borrowData[passenger] || [];
  const idx = entries.findIndex(function(e){ return e.id === entryId; });
  if(idx === -1) return;
  entries[idx].amount = amount;
  entries[idx].date   = date;
  entries[idx].note   = note;
  saveBorrows();
  // Keep the linked Cash Flow expense in sync (amount/date) + adjust the
  // bank tile by the difference. No-op if this entry has no cfId.
  try { updateLinkedCFEntry(entries[idx].cfId, amount, date, passenger); } catch(e){}
  closeModal('editBorrowModal');
  renderCarpool();
  renderMoneyOwed();
  const stmtArea = document.getElementById('stmtArea');
  if(stmtArea && stmtArea.style.display !== 'none') generateStatements();
}

function deleteBorrowEntry(passenger, entryId){
  var _entry = (borrowData[passenger]||[]).find(function(e){ return e.id === entryId; });
  if(!_entry) return;

  // ── v108-patch1 — carpool lend entries reverse atomically via _lendReverse ─
  // A pocket-first carpool lend links pocket deposit ↔ CF row ↔ borrow entry
  // via a lendId. Going through soft-delete + removeFromCF would orphan the
  // pocket OUT-deposit AND drift the bank baseline. Exact mirror of the
  // __ext__ branch in deleteBorrowEntryUnified (added in v90).
  if(_entry.lendId){
    var _lrec = [];
    try { _lrec = JSON.parse(lsGet('yb_lends_v1')||'[]'); } catch(e){}
    var _live = _lrec.find(function(r){ return r.id === _entry.lendId; });
    if(_live){
      var _pk = funds.find(function(f){ return f.id === _live.pocketId; });
      var _pn = _pk ? _pk.name : 'its pocket';
      var _body = '💸 Lent ' + fmtR(_live.amount) + ' to ' + passenger + ' · ' + _live.date +
                  '\n\nReversing puts ' + fmtR(_live.amount) + ' back into ' + _pn + ', removes the Cash Flow record, and clears the loan. The bank stays at R0.';
      if(typeof mihbConfirm === 'function'){
        mihbConfirm({
          title: 'Reverse this loan?',
          body: _body,
          dangerLabel: '↩ Reverse the whole loan',
          safeLabel: 'Leave it alone'
        }, function(go){
          if(go){
            _lendReverse(_entry.lendId);
            if(typeof softDeleteToast === 'function') softDeleteToast({ message:'Loan reversed · '+fmtR(_live.amount)+' back to '+_pn, duration:3000 });
          }
        });
      } else {
        if(confirm('Reverse this loan?\n\n'+_body)) _lendReverse(_entry.lendId);
      }
      return;
    }
    // Live lend record gone → orphan → fall through to normal soft-delete below.
  }

  var hasCF = !!_entry.cfId;
  // Build a meaningful label for the toast — use type + amount + person
  var typeLabel = _entry.iOwe ? 'refund-owed' : (_entry.type === 'repay' ? 'repayment' : 'borrow');
  var amtStr = (typeof fmtR === 'function') ? fmtR(Math.abs(_entry.amount||0)) : ('R'+Math.abs(_entry.amount||0));
  var label = passenger + ' ' + typeLabel + ' ' + amtStr;
  // Soft-delete: flag the entry rather than remove it. The cash flow side
  // we leave alone for now — purge handler removes both at the same time.
  _entry._deleted = true;
  saveBorrows();
  renderCarpool();
  renderMoneyOwed();
  if(typeof renderOdinInsights === 'function') try{ renderOdinInsights('money'); }catch(e){}
  var stmtArea = document.getElementById('stmtArea');
  if(stmtArea && stmtArea.style.display !== 'none') generateStatements();

  softDeleteToast({
    label: label,
    onUndo: function(){
      var e = (borrowData[passenger]||[]).find(function(x){ return x.id === entryId; });
      if(e){
        delete e._deleted;
        saveBorrows();
      }
      renderCarpool();
      renderMoneyOwed();
      if(typeof renderOdinInsights === 'function') try{ renderOdinInsights('money'); }catch(e){}
      if(stmtArea && stmtArea.style.display !== 'none') generateStatements();
    },
    onPurge: function(){
      // Now remove for real, including the linked CF record
      if(hasCF) try{ removeFromCF(_entry.cfId); }catch(e){}
      borrowData[passenger] = (borrowData[passenger]||[]).filter(function(e){ return e.id !== entryId; });
      saveBorrows();
      // Cloud-side stays soft-deleted (deleted_at set) — keeps an audit trail.
    }
  });
}

// ── EDIT EXTERNAL BORROW ENTRY ──
function openEditExternalBorrowModal(personKey, entryId){
  const data   = loadExternalBorrows();
  const person = data[personKey];
  if(!person) return;
  const entry = (person.entries||[]).find(function(e){ return e.id === entryId; });
  if(!entry) return;
  document.getElementById('editBorrowPassenger').value  = '__ext__' + personKey;
  document.getElementById('editBorrowId').value         = entryId;
  document.getElementById('editBorrowAmt').value        = entry.amount;
  document.getElementById('editBorrowDate').value       = entry.date;
  document.getElementById('editBorrowNote').value       = entry.note || '';
  document.getElementById('editBorrowTypeLabel').textContent = (entry.type === 'repay' ? '↩ Repayment' : '💸 Borrow') + ' — ' + person.name;
  document.getElementById('editBorrowModal').classList.add('active');
}

function confirmEditBorrowUnified(){
  const passengerVal = document.getElementById('editBorrowPassenger').value;
  const entryId      = document.getElementById('editBorrowId').value;
  const amount       = parseFloat(document.getElementById('editBorrowAmt').value);
  const date         = document.getElementById('editBorrowDate').value;
  const note         = document.getElementById('editBorrowNote').value.trim();
  if(!amount || amount <= 0){ alert('Enter a valid amount.'); return; }

  if(passengerVal.startsWith('__ext__')){
    const personKey = passengerVal.replace('__ext__','');
    const data = loadExternalBorrows();
    if(!data[personKey]) return;
    const idx = data[personKey].entries.findIndex(function(e){ return e.id === entryId; });
    if(idx === -1) return;
    var _editingEntry = data[personKey].entries[idx];
    data[personKey].entries[idx].amount = amount;
    data[personKey].entries[idx].date   = date;
    data[personKey].entries[idx].note   = note;
    saveExternalBorrows(data);
    // Sync linked savings deposit
    updateSavingsDepositByBorrowId(personKey + ':' + entryId, amount, date, note);
    // ── v90 — pocket-first lend: update the CF row amount/date DIRECTLY,
    //    WITHOUT touching the bank baseline. The doorway is always net 0, so
    //    changing the loan amount must not move the bank tile. (Calling
    //    updateLinkedCFEntry here would re-credit/debit the bank → drift.)
    if(_editingEntry && _editingEntry.lendId){
      try{
        if(typeof loadCFData === 'function' && _editingEntry.cfId){
          var _cfd = loadCFData();
          Object.keys(_cfd).forEach(function(mk){
            ['expenses'].forEach(function(sec){
              if(_cfd[mk] && _cfd[mk][sec]){
                _cfd[mk][sec].forEach(function(e){
                  if(e.id === _editingEntry.cfId){ e.amount = amount; if(date) e.date = date; }
                });
              }
            });
          });
          if(typeof saveCFData === 'function') saveCFData(_cfd);
        }
        // Keep the lend record's amount in sync for correct future reverse.
        var _lr = []; try { _lr = JSON.parse(lsGet('yb_lends_v1')||'[]'); } catch(e){}
        _lr.forEach(function(r){ if(r.id === _editingEntry.lendId){ r.amount = amount; r.date = date; } });
        lsSet('yb_lends_v1', JSON.stringify(_lr));
      }catch(e){ console.warn('[lend-edit] cf sync failed', e); }
    } else {
      // Non-lend external entry (legacy) — keep old behaviour.
      try { updateLinkedCFEntry(data[personKey].entries[idx].cfId, amount, date, personKey); } catch(e){}
    }
  } else {
    const entries = borrowData[passengerVal] || [];
    const idx = entries.findIndex(function(e){ return e.id === entryId; });
    if(idx === -1) return;
    var _editingCpEntry = entries[idx];
    entries[idx].amount = amount;
    entries[idx].date   = date;
    entries[idx].note   = note;
    saveBorrows();

    // Sync linked savings deposit (works for v108 pocket-first AND legacy linked)
    updateSavingsDepositByBorrowId(passengerVal + ':' + entryId, amount, date, note);

    // ── v108c — pocket-first carpool lend: update CF row DIRECTLY without
    //    touching the bank baseline. Mirrors the external branch's v90 logic.
    //    The doorway is always net 0, so changing the loan amount must not
    //    move the bank tile. (updateLinkedCFEntry would re-credit/debit → drift.)
    if(_editingCpEntry.lendId){
      try{
        if(typeof loadCFData === 'function' && _editingCpEntry.cfId){
          var _cfd2 = loadCFData();
          Object.keys(_cfd2).forEach(function(mk){
            ['expenses'].forEach(function(sec){
              if(_cfd2[mk] && _cfd2[mk][sec]){
                _cfd2[mk][sec].forEach(function(e){
                  if(e.id === _editingCpEntry.cfId){ e.amount = amount; if(date) e.date = date; }
                });
              }
            });
          });
          if(typeof saveCFData === 'function') saveCFData(_cfd2);
        }
        // Keep the lend record's amount in sync for correct future reverse.
        var _lr2 = []; try { _lr2 = JSON.parse(lsGet('yb_lends_v1')||'[]'); } catch(e){}
        _lr2.forEach(function(r){ if(r.id === _editingCpEntry.lendId){ r.amount = amount; r.date = date; } });
        lsSet('yb_lends_v1', JSON.stringify(_lr2));
      }catch(e){ console.warn('[lend-edit-carpool] cf sync failed', e); }
    } else {
      // Legacy non-lend carpool entry (pre-v108) — keep old behaviour.
      try { updateLinkedCFEntry(entries[idx].cfId, amount, date, passengerVal); } catch(e){}
    }
  }
  closeModal('editBorrowModal');
  renderCarpool();
  renderMoneyOwed();
  const stmtArea = document.getElementById('stmtArea');
  if(stmtArea && stmtArea.style.display !== 'none') generateStatements();
}

function removeSavingsDepositByBorrowId(linkedId){
  // Remove from regular funds
  let changed = false;
  funds.forEach(function(f){
    const before = f.deposits.length;
    f.deposits = f.deposits.filter(function(d){ return d.borrowEntryId !== linkedId; });
    if(f.deposits.length !== before) changed = true;
  });
  if(changed){ saveFunds(); renderFunds(); }
  // Remove from Maintenance Fund
  const mdata = getMaintData();
  const mBefore = mdata.length;
  const mNew = mdata.filter(function(e){ return e.borrowEntryId !== linkedId; });
  if(mNew.length !== mBefore){ saveMaintData(mNew); renderMaintCard(); }
}

function updateSavingsDepositByBorrowId(linkedId, newAmount, newDate, newNote){
  let changed = false;
  funds.forEach(function(f){
    f.deposits.forEach(function(d){
      if(d.borrowEntryId === linkedId){
        d.amount = newAmount; d.date = newDate;
        if(newNote) d.note = d.note.replace(/·.*$/, '') + (newNote ? ' · ' + newNote : '');
        changed = true;
      }
    });
  });
  if(changed){ saveFunds(); renderFunds(); }
  const mdata = getMaintData();
  let mChanged = false;
  mdata.forEach(function(e){
    if(e.borrowEntryId === linkedId){
      e.amount = newAmount; e.date = newDate;
      mChanged = true;
    }
  });
  if(mChanged){ saveMaintData(mdata); renderMaintCard(); }
}

function deleteBorrowEntryUnified(passengerVal, entryId){
  // ── v90 — personal lend entries reverse atomically via _lendReverse ────
  // A pocket-first lend links pocket deposit ↔ CF row ↔ borrow entry via a
  // lendId. Routing through _lendReverse keeps the bank untouched (the
  // forward doorway already netted to 0). Going through the old path would
  // call removeFromCF and re-credit the bank → +amount drift.
  if(passengerVal.startsWith('__ext__')){
    var _lk = passengerVal.replace('__ext__','');
    var _ld = loadExternalBorrows();
    var _le = (_ld[_lk]&&_ld[_lk].entries||[]).find(function(e){ return e.id === entryId; });
    if(_le && _le.lendId){
      var _lrec = [];
      try { _lrec = JSON.parse(lsGet('yb_lends_v1')||'[]'); } catch(e){}
      var _live = _lrec.find(function(r){ return r.id === _le.lendId; });
      if(_live){
        var _pk = funds.find(function(f){ return f.id === _live.pocketId; });
        var _pn = _pk ? _pk.name : 'its pocket';
        var _body = '🤝 Lent ' + fmtR(_live.amount) + ' to ' + _live.personName + ' · ' + _live.date +
                    '\n\nReversing puts ' + fmtR(_live.amount) + ' back into ' + _pn + ', removes the Cash Flow record, and clears the loan. The bank stays at R0.';
        if(typeof mihbConfirm === 'function'){
          mihbConfirm({
            title: 'Reverse this loan?',
            body: _body,
            dangerLabel: '↩ Reverse the whole loan',
            safeLabel: 'Leave it alone'
          }, function(go){
            if(go){
              _lendReverse(_le.lendId);
              if(typeof softDeleteToast === 'function') softDeleteToast({ message:'Loan reversed · '+fmtR(_live.amount)+' back to '+_pn, duration:3000 });
            }
          });
        } else {
          if(confirm('Reverse this loan?\n\n'+_body)) _lendReverse(_le.lendId);
        }
        return;
      }
      // Live lend record gone → orphan → fall through to normal delete below.
    }
  }

  var hasCF = false;
  if(passengerVal.startsWith('__ext__')){
    var _ck = passengerVal.replace('__ext__','');
    var _cd = loadExternalBorrows();
    var _ce = (_cd[_ck]&&_cd[_ck].entries||[]).find(function(e){ return e.id === entryId; });
    hasCF = _ce && !!_ce.cfId;
  } else {
    var _ie = (borrowData[passengerVal]||[]).find(function(e){ return e.id === entryId; });
    hasCF = _ie && !!_ie.cfId;
  }
  var msg = 'Delete this entry?' + (hasCF ? '\n\nThis will also remove the linked Cash Flow record.' : '') + '\n\nThis cannot be undone.';
  if(!confirm(msg)) return;
  if(passengerVal.startsWith('__ext__')){
    const personKey = passengerVal.replace('__ext__','');
    const data = loadExternalBorrows();
    if(data[personKey]){
      var _extEntry = (data[personKey].entries||[]).find(function(e){ return e.id === entryId; });
      if(_extEntry && _extEntry.cfId) removeFromCF(_extEntry.cfId);
      removeSavingsDepositByBorrowId(personKey + ':' + entryId);
      data[personKey].entries = data[personKey].entries.filter(function(e){ return e.id !== entryId; });
    }
    saveExternalBorrows(data);
  } else {
    var _intEntry = (borrowData[passengerVal]||[]).find(function(e){ return e.id === entryId; });
    if(_intEntry && _intEntry.cfId) removeFromCF(_intEntry.cfId);
    borrowData[passengerVal] = (borrowData[passengerVal]||[]).filter(function(e){ return e.id !== entryId; });
    saveBorrows();
  }
  renderCarpool();
  renderMoneyOwed();
  if(typeof renderOdinInsights === 'function') try{ renderOdinInsights('money'); }catch(e){}
  const stmtArea = document.getElementById('stmtArea');
  if(stmtArea && stmtArea.style.display !== 'none') generateStatements();
}

function openRepayModal(){
  document.getElementById('repayAmt').value='';
  document.getElementById('repayDate').value=localDateStr(new Date());
  document.getElementById('repayNote').value='';
  const sel = document.getElementById('repayPassenger');
  // Populate dynamically
  sel.innerHTML = PASSENGERS.map(function(p){ return '<option value="'+p+'">'+p+'</option>'; }).join('');
  // Default to first passenger who actually owes something
  const firstOwing = PASSENGERS.find(function(p){
    const entries = borrowData[p] || [];
    let b=0,r=0;
    entries.forEach(function(e){ if(e.type==='repay') r+=Number(e.amount||0); else b+=Number(e.amount||0); });
    return (b-r) > 0;
  });
  sel.value = firstOwing || PASSENGERS[0];
  updateRepayOwingSummary();
  renderRepayPocketPicker();   // v84 — Step 4
  document.getElementById('repayModal').classList.add('active');
}

// ── Step 4 (v84) — pocket picker ───────────────────────────────────────
// Repayment money has to go back into a pocket. Auto-suggest the pocket
// the loan originally came from (originPocket on borrow entry); if no
// origin recorded (legacy loans), no suggestion — user picks manually.
// Same doorway-out pattern as Money In / Spend / Carpool (v83).
var _repaySelectedPocketId = null;

function _findOriginPocketForPassenger(passenger){
  // Look at oldest unpaid borrow for this passenger; if it has an
  // originPocket field, use it. Future Step 6 will guarantee origin on
  // new loans; for legacy loans this returns null.
  if(!borrowData[passenger]) return null;
  var unpaid = borrowData[passenger].filter(function(e){
    return e.type !== 'repay' && !e.paid && e.originPocket;
  });
  if(unpaid.length === 0) return null;
  // Oldest first → most likely the loan being repaid
  unpaid.sort(function(a,b){ return (a.date||'') < (b.date||'') ? -1 : 1; });
  return unpaid[0].originPocket;
}

function renderRepayPocketPicker(){
  var picker = document.getElementById('repayPocketPicker');
  if(!picker) return;
  var passenger = document.getElementById('repayPassenger').value;
  var originId = _findOriginPocketForPassenger(passenger);
  // Default selection: origin if present, else first pocket
  if(originId && funds.find(function(f){ return f.id === originId; })){
    _repaySelectedPocketId = originId;
  } else if(funds.length > 0){
    _repaySelectedPocketId = funds[0].id;
  } else {
    _repaySelectedPocketId = null;
  }
  picker.innerHTML = funds.map(function(f){
    var bal = (f.deposits||[]).reduce(function(s,d){
      return s + (d.txnType==='out' ? -Number(d.amount||0) : Number(d.amount||0));
    }, 0);
    var isOrigin = (f.id === originId);
    var isSelected = (f.id === _repaySelectedPocketId);
    var borderColor = isSelected ? '#7090f0' : (isOrigin ? '#5a8800' : 'transparent');
    var bgColor = isSelected ? '#0a1a2e' : (isOrigin ? '#0d1a00' : '#0e0e0e');
    var nameColor = isSelected ? '#7090f0' : '#efefef';
    var tag = isOrigin
      ? '<span style="font-size:8px;background:#3a5a00;color:#c8f230;border-radius:3px;padding:1px 5px;margin-left:6px;letter-spacing:1px;">ORIGIN</span>'
      : '';
    return '<div onclick="selectRepayPocket(\''+f.id+'\')" '
      + 'style="display:flex;justify-content:space-between;align-items:center;padding:9px 10px;border-radius:5px;margin-bottom:4px;cursor:pointer;border:1px solid '+borderColor+';background:'+bgColor+';">'
      + '<span style="font-size:12px;color:'+nameColor+';"><span style="margin-right:8px;">'+(f.emoji||'💰')+'</span>'+f.name+tag+'</span>'
      + '<span style="font-size:10px;color:var(--muted);">R'+bal.toLocaleString('en-ZA')+'</span>'
      + '</div>';
  }).join('') || '<div style="font-size:11px;color:var(--muted);padding:8px;text-align:center;">No pockets exist yet.</div>';
}

function selectRepayPocket(id){
  _repaySelectedPocketId = id;
  renderRepayPocketPicker();
}

function updateRepayOwingSummary(){
  const passenger = document.getElementById('repayPassenger').value;
  const summary = document.getElementById('repayOwingSummary');
  const entries = borrowData[passenger] || [];
  let totalBorrowed = 0, totalRepaid = 0;
  entries.forEach(function(b){
    if(b.type === 'repay'){
      totalRepaid += Number(b.amount || 0);
    } else {
      totalBorrowed += Number(b.amount || 0);
      if(b.paid) totalRepaid += Number(b.amount || 0);
    }
  });
  const owing = totalBorrowed - totalRepaid;
  if(owing <= 0){
    summary.innerHTML = '<span style="color:#c8f230;">✓ ' + passenger + ' has no outstanding balance.</span>';
  } else {
    summary.innerHTML = passenger + ' currently owes <strong style="color:#f2a830;font-size:13px;">R' + owing.toLocaleString('en-ZA') + '</strong>';
  }
}

// Wire up passenger change on repay modal
document.addEventListener('DOMContentLoaded', function(){
  const sel = document.getElementById('repayPassenger');
  if(sel) sel.addEventListener('change', function(){
    updateRepayOwingSummary();
    renderRepayPocketPicker();   // v84 — re-suggest origin pocket
  });
});

function confirmRepay(){
  const passenger = document.getElementById('repayPassenger').value;
  const amount = parseFloat(document.getElementById('repayAmt').value);
  const date = document.getElementById('repayDate').value || localDateStr(new Date());
  const bank = document.getElementById('repayBank') ? document.getElementById('repayBank').value : 'TymeBank';
  const noteRaw = document.getElementById('repayNote').value.trim();
  if(!passenger || isNaN(amount) || amount <= 0){ alert('Enter a valid repayment amount.'); return; }

  // ── v84 Step 4 — pocket-first repayment ─────────────────────────────
  // Money repaid to you goes back into a pocket (NOT the bank). The bank
  // acts as a doorway: +amount in, -amount out, net 0. The pocket grows
  // by amount. Repayment record links the borrow + CF row + pocket
  // deposit so hard-block guard can reverse all 3 atomically.
  var pocketId = _repaySelectedPocketId;
  var pocket = pocketId ? funds.find(function(f){ return f.id === pocketId; }) : null;
  if(!pocket){
    alert('Pick a pocket for the repayment to go into.');
    return;
  }

  if(!borrowData[passenger]) borrowData[passenger] = [];

  // 1. Unique ID linking all 3 records
  var repayId = 'rp_' + uid();

  // 2. CF income row (doorway IN)
  const cfLabel = '↩ Repayment from ' + passenger + ' → ' + pocket.name;
  const cfNote = 'Borrowed money repaid by ' + passenger + ' (via ' + bank + ') into pocket: ' + pocket.name + (noteRaw ? ' · ' + noteRaw : '');
  var cfId_repay = postToCF({
    label: cfLabel,
    amount: amount,
    date: date,
    icon: 'repay',
    type: 'income',
    sourceType: 'borrow_repaid',
    sourceId: passenger,
    sourceCardName: bank,
    note: cfNote,
    account: bank,           // tag the bank as the doorway
    repayId: repayId,        // link for hard-block guard
    destPocketId: pocket.id  // remember which pocket the money went to
  });

  // 3. Pocket deposit (where the money actually lives)
  var pocketDepId = uid();
  pocket.deposits.push({
    id: pocketDepId,
    amount: amount,
    date: date,
    note: '↩ Repaid by ' + passenger + (noteRaw ? ' · ' + noteRaw : ''),
    txnType: 'in',
    repayId: repayId,        // link for hard-block guard
    cfRowId: cfId_repay      // link back to CF row
  });
  saveFunds();

  // 4. Borrow repay entry (audit trail)
  var repayEntry = {
    id: uid(),
    type: 'repay',
    amount: amount,
    date: date,
    note: cfNote,
    paid: true,
    cfId: cfId_repay,
    bank: bank,
    repayId: repayId,        // link for hard-block guard
    destPocketId: pocket.id,
    destPocketDepId: pocketDepId
  };
  borrowData[passenger].push(repayEntry);
  saveBorrows();

  // 5. Bank doorway (+amount in, -amount out → net 0)
  if(typeof window._adjustBaselineForBank === 'function'){
    var _bankBefore = (typeof loadReconBalances === 'function') ? loadReconBalances() : {};
    var _kBefore = (bank==='FNB')?'fnb':(bank==='TymeBank')?'tyme':(bank==='Cash')?'cash':null;
    var _vBefore = _kBefore ? Number(_bankBefore[_kBefore]||0) : null;
    window._adjustBaselineForBank(bank, amount);    // doorway IN
    window._adjustBaselineForBank(bank, -amount);   // doorway OUT
    var _bankAfter = (typeof loadReconBalances === 'function') ? loadReconBalances() : {};
    var _vAfter = _kBefore ? Number(_bankAfter[_kBefore]||0) : null;
    console.log('[repay-forward] bank', bank, 'before:', _vBefore, 'after doorway in+out:', _vAfter, '(should match)');
  }

  // 6. Stash a payment record so hard-block guards can reverse atomically
  try {
    var allReps = [];
    try { allReps = JSON.parse(lsGet('yb_repayments_v1')||'[]'); } catch(e){}
    allReps.push({
      id: repayId,
      passenger: passenger,
      amount: amount,
      date: date,
      bank: bank,
      pocketId: pocket.id,
      pocketDepId: pocketDepId,
      cfRowId: cfId_repay,
      borrowRepayEntryId: repayEntry.id,
      createdAt: new Date().toISOString()
    });
    lsSet('yb_repayments_v1', JSON.stringify(allReps));
  } catch(e){ console.warn('[repay] save payment record failed', e); }

  closeModal('repayModal');

  // Refresh UI
  if(typeof renderFunds === 'function') try{ renderFunds(); }catch(e){}
  renderCarpool();
  renderMoneyOwed();
  if(typeof renderCashFlow === 'function') try{ renderCashFlow(); }catch(e){}
  if(typeof renderOdinInsights === 'function') try{ renderOdinInsights('money'); }catch(e){}
  const stmtArea = document.getElementById('stmtArea');
  if(stmtArea && stmtArea.style.display !== 'none') generateStatements();
  loadBorrowReport();

  // Toast
  try{
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:#0d1a00;border:1px solid #c8f230;border-radius:8px;padding:12px 20px;z-index:9999;font-family:DM Mono,monospace;font-size:11px;color:#c8f230;letter-spacing:1px;white-space:nowrap;';
    toast.textContent = '✓ R'+amount+' from '+passenger+' → '+pocket.name;
    document.body.appendChild(toast);
    setTimeout(function(){ toast.remove(); }, 4000);
  }catch(e){}
}

// ── v84-patch1 (2026-05-27) — atomic reverse of a repayment ───────────
// Called by hard-block guards when user tries to delete the CF row OR
// the pocket deposit. Undoes all 4 legs:
//   (a) borrow repay entry → removed
//   (b) original borrow.paid flag → reset to false
//   (c) pocket deposit → removed via saveFunds
//   (d) CF row → removed via loadCFData/saveCFData (the proper API)
// Bank doorway: forward did +amount IN then -amount OUT = net 0 on the
// stored reconBalances. Reverse must also be net 0 → so we apply +amount
// then -amount to UNDO each side symmetrically. (Doing nothing only works
// if no upstream cascade ran an extra adjust; safer to be explicit.)
window._repaymentReverse = function(repayId, opts){
  opts = opts || {};
  var allReps = [];
  try { allReps = JSON.parse(lsGet('yb_repayments_v1')||'[]'); } catch(e){}
  var rec = allReps.find(function(r){ return r.id === repayId; });
  if(!rec){ console.warn('[repay-reverse] no record for', repayId); return false; }

  // DIAG: snapshot state before any changes
  function _diagRepayCount(){
    if(rec.isExternal && rec.externalKey){
      try {
        var ed = (typeof loadExternalBorrows === 'function') ? loadExternalBorrows() : {};
        var entries = (ed[rec.externalKey] && ed[rec.externalKey].entries) || [];
        return entries.filter(function(e){ return e.type==='repay'; }).length;
      } catch(e){ return 'n/a'; }
    }
    return (borrowData[rec.passenger]||[]).filter(function(e){return e.type==='repay';}).length;
  }
  var _diagBefore = {
    pocketDeposits: ((funds.find(function(f){return f.id===rec.pocketId;})||{}).deposits||[]).length,
    bankRecon: (typeof loadReconBalances === 'function') ? loadReconBalances() : 'n/a',
    repayCount: _diagRepayCount(),
    cfCount: (function(){
      try {
        var cfd = (typeof loadCFData === 'function') ? loadCFData() : {};
        var mk = (rec.date||'').slice(0,7);
        return ((cfd[mk]||{}).income||[]).length;
      } catch(e){ return 'n/a'; }
    })()
  };
  console.log('[repay-reverse] BEFORE', repayId, JSON.parse(JSON.stringify(_diagBefore)));

  // 1. Remove the borrow repay entry (the type:'repay' one we added).
  //    v86 branch: external (personal) repayments live in loadExternalBorrows()
  //    keyed by externalKey. Carpool repayments live in borrowData[passenger].
  if(rec.isExternal && rec.externalKey){
    try {
      var extData = (typeof loadExternalBorrows === 'function') ? loadExternalBorrows() : {};
      if(extData[rec.externalKey] && extData[rec.externalKey].entries){
        var beforeLen = extData[rec.externalKey].entries.length;
        extData[rec.externalKey].entries = extData[rec.externalKey].entries.filter(function(e){
          return e.repayId !== repayId;
        });
        var removed = beforeLen - extData[rec.externalKey].entries.length;
        console.log('[repay-reverse] removed external repay entries:', removed, 'for key', rec.externalKey);
        if(typeof saveExternalBorrows === 'function') saveExternalBorrows(extData);
      }
    } catch(e){ console.warn('[repay-reverse] external reverse failed', e); }
  } else if(borrowData && borrowData[rec.passenger]){
    var bBefore = borrowData[rec.passenger].length;
    borrowData[rec.passenger] = borrowData[rec.passenger].filter(function(e){
      return e.repayId !== repayId;
    });
    var bRemoved = bBefore - borrowData[rec.passenger].length;
    console.log('[repay-reverse] removed borrow repay entries:', bRemoved);
    saveBorrows();
  }

  // 2. NEW (patch1) — If forward had flipped an original borrow's .paid flag
  //    as part of this repayment, flip it back. We store origBorrowFlipIds
  //    on the payment record for exactly this purpose. (Step 4 v84 forward
  //    does NOT flip any flag — pure additive — so this is a no-op today.
  //    Defensive for future multi-debt split flow.)
  //    v86: handle external side too.
  if(rec.origBorrowFlipIds && rec.origBorrowFlipIds.length){
    if(rec.isExternal && rec.externalKey){
      try {
        var extD = (typeof loadExternalBorrows === 'function') ? loadExternalBorrows() : {};
        if(extD[rec.externalKey] && extD[rec.externalKey].entries){
          extD[rec.externalKey].entries.forEach(function(e){
            if(e && rec.origBorrowFlipIds.indexOf(e.id) > -1){ e.paid = false; }
          });
          if(typeof saveExternalBorrows === 'function') saveExternalBorrows(extD);
        }
      } catch(e){ console.warn('[repay-reverse] external flip-back failed', e); }
    } else if(borrowData && borrowData[rec.passenger]){
      borrowData[rec.passenger].forEach(function(e){
        if(e && rec.origBorrowFlipIds.indexOf(e.id) > -1){ e.paid = false; }
      });
      saveBorrows();
    }
  }

  // 3. Remove the pocket deposit. Match by stored dep ID (precise) OR by
  //    repayId (defensive — old records may not have pocketDepId stored).
  var pocket = funds.find(function(f){ return f.id === rec.pocketId; });
  if(pocket){
    var pdBefore = (pocket.deposits||[]).length;
    pocket.deposits = (pocket.deposits||[]).filter(function(d){
      var matchById = rec.pocketDepId && d.id === rec.pocketDepId;
      var matchByRepayId = d.repayId === repayId;
      return !matchById && !matchByRepayId;
    });
    var pdRemoved = pdBefore - pocket.deposits.length;
    console.log('[repay-reverse] removed pocket deposits:', pdRemoved, 'from pocket', pocket.name);
    if(pdRemoved > 0) saveFunds();
  } else {
    console.warn('[repay-reverse] pocket not found:', rec.pocketId);
  }

  // 4. Remove the CF row using the proper API (loadCFData/saveCFData).
  //    My previous version used raw lsGet/lsSet on 'yb_cashflow_v1' which
  //    bypassed any caching/state hooks. Mirror carpool v83 exactly.
  if(typeof loadCFData === 'function' && typeof saveCFData === 'function'){
    var cfData = loadCFData();
    var mk = (rec.date||'').slice(0,7);
    var cfRemovedTotal = 0;
    if(cfData[mk] && cfData[mk].income){
      var cfBefore = cfData[mk].income.length;
      cfData[mk].income = cfData[mk].income.filter(function(e){
        return e.id !== rec.cfRowId && e.repayId !== repayId;
      });
      cfRemovedTotal += (cfBefore - cfData[mk].income.length);
    }
    if(cfData.recurring && cfData.recurring.income){
      var rcBefore = cfData.recurring.income.length;
      cfData.recurring.income = cfData.recurring.income.filter(function(e){
        return e.id !== rec.cfRowId && e.repayId !== repayId;
      });
      cfRemovedTotal += (rcBefore - cfData.recurring.income.length);
    }
    if(cfRemovedTotal > 0) saveCFData(cfData);
    console.log('[repay-reverse] removed CF rows:', cfRemovedTotal);
  }

  // 5. Remove the payment record itself
  allReps = allReps.filter(function(r){ return r.id !== repayId; });
  lsSet('yb_repayments_v1', JSON.stringify(allReps));

  // 6. DIAG: snapshot state after, and warn if anything weird
  var _diagAfter = {
    pocketDeposits: ((funds.find(function(f){return f.id===rec.pocketId;})||{}).deposits||[]).length,
    bankRecon: (typeof loadReconBalances === 'function') ? loadReconBalances() : 'n/a',
    repayCount: _diagRepayCount(),
    cfCount: (function(){
      try {
        var cfd = (typeof loadCFData === 'function') ? loadCFData() : {};
        var mk = (rec.date||'').slice(0,7);
        return ((cfd[mk]||{}).income||[]).length;
      } catch(e){ return 'n/a'; }
    })()
  };
  console.log('[repay-reverse] AFTER', repayId, JSON.parse(JSON.stringify(_diagAfter)));

  // Check bank baseline drift for the doorway bank — if it differs from
  // expected, surface a visible warning so Yasin can use Settings → 0 to
  // recalibrate before more state changes pile on.
  if(rec.bank && _diagBefore.bankRecon && _diagAfter.bankRecon){
    var key = (rec.bank === 'FNB') ? 'fnb' : (rec.bank === 'TymeBank') ? 'tyme' : (rec.bank === 'Cash') ? 'cash' : null;
    if(key){
      var before = Number(_diagBefore.bankRecon[key]||0);
      var after  = Number(_diagAfter.bankRecon[key]||0);
      if(Math.abs(before - after) > 0.01){
        console.warn('[repay-reverse] BANK DRIFT on', key, 'before:', before, 'after:', after);
        try {
          var msg = '⚠ Bank '+rec.bank+' drifted by R'+(after-before).toFixed(2)+' after reverse. Settings → Account Balances → set to 0 to fix.';
          if(typeof softDeleteToast === 'function'){ softDeleteToast({message: msg, duration: 6000}); }
        } catch(e){}
      }
    }
  }

  // 7. Refresh UI unless silent
  if(!opts.silent){
    try { if(typeof loadFunds === 'function') loadFunds(); }catch(e){}      // re-sync in-memory from disk
    try { if(typeof renderFunds === 'function') renderFunds(); }catch(e){}
    try { if(typeof renderCashFlow === 'function') renderCashFlow(); }catch(e){}
    try { if(typeof renderMoneyOwed === 'function') renderMoneyOwed(); }catch(e){}
    try { if(typeof renderCarpool === 'function') renderCarpool(); }catch(e){}
    try { if(typeof renderBankBalanceCard === 'function') renderBankBalanceCard(); }catch(e){}
  }
  return true;
};

function getBorrowTotal(passenger){
  if(!borrowData[passenger]) return { borrowTotal:0, borrowPaid:0 };
  let borrowTotal=0, borrowPaid=0;
  borrowData[passenger].forEach(function(b){
    if(b.type === 'repay'){
      // Repayments reduce what they owe
      borrowPaid += Number(b.amount || 0);
    } else {
      borrowTotal += Number(b.amount || 0);
      if(b.paid) borrowPaid += Number(b.amount || 0);
    }
  });
  return { borrowTotal, borrowPaid };
}


// ── Archive settled external borrow person ──

// ── Show/Hide archived people in Money Owed ──
var _moShowArchived = false;

function toggleArchivedMoney(){
  _moShowArchived = !_moShowArchived;
  var section = document.getElementById('moArchivedSection');
  var btn = document.getElementById('moToggleArchived');
  if(section) section.style.display = _moShowArchived ? 'block' : 'none';
  if(btn) btn.textContent = _moShowArchived ? '📦 Hide Archived' : '📦 Show Archived';
  if(_moShowArchived) renderArchivedMoney();
}

function renderArchivedMoney(){
  var container = document.getElementById('moArchivedList');
  if(!container) return;
  container.innerHTML = '';
  var hasAny = false;

  // Carpool archived
  var carpoolArchived = JSON.parse(lsGet('yb_carpool_archived')||'[]');
  carpoolArchived.forEach(function(name){
    hasAny = true;
    var d = document.createElement('div');
    d.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:#111;border:1px solid #2a2a2a;border-radius:8px;margin-bottom:8px;';
    d.innerHTML = '<div><div style="font-size:13px;color:var(--muted);">'+name+'</div><div style="font-size:9px;color:var(--muted2);letter-spacing:1px;">CARPOOL</div></div>'
      +'<button onclick="unarchivePerson(\''+name+'\',\'carpool\')" style="background:none;border:1px solid #2a3a1a;border-radius:6px;padding:5px 12px;color:#5a8800;font-family:DM Mono,monospace;font-size:10px;cursor:pointer;">Restore</button>';
    container.appendChild(d);
  });

  // External archived
  var extData = loadExternalBorrows();
  Object.keys(extData).forEach(function(key){
    var p = extData[key];
    if(!p.archived) return;
    hasAny = true;
    var d = document.createElement('div');
    d.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:#111;border:1px solid #2a2a2a;border-radius:8px;margin-bottom:8px;';
    d.innerHTML = '<div><div style="font-size:13px;color:var(--muted);">'+p.name+'</div><div style="font-size:9px;color:var(--muted2);letter-spacing:1px;">PERSONAL</div></div>'
      +'<button onclick="unarchivePerson(\''+key+'\',\'external\')" style="background:none;border:1px solid #2a3a1a;border-radius:6px;padding:5px 12px;color:#5a8800;font-family:DM Mono,monospace;font-size:10px;cursor:pointer;">Restore</button>';
    container.appendChild(d);
  });

  if(!hasAny){
    container.innerHTML = '<div style="font-size:11px;color:var(--muted2);padding:8px 0;">No archived people.</div>';
  }
}

function unarchivePerson(key, tag){
  if(tag === 'carpool'){
    var archived = JSON.parse(lsGet('yb_carpool_archived')||'[]');
    archived = archived.filter(function(n){ return n !== key; });
    lsSet('yb_carpool_archived', JSON.stringify(archived));
  } else {
    var data = loadExternalBorrows();
    if(data[key]){ data[key].archived = false; saveExternalBorrows(data); }
  }
  renderMoneyOwed();
  if(_moShowArchived) renderArchivedMoney();
}

function archiveExternalPerson(key, tag){
  if(!confirm('Archive this person? Their history will be hidden but not deleted.')) return;
  if(tag === 'carpool'){
    var archived = JSON.parse(lsGet('yb_carpool_archived')||'[]');
    if(archived.indexOf(key) === -1) archived.push(key);
    lsSet('yb_carpool_archived', JSON.stringify(archived));
  } else {
    var data = loadExternalBorrows();
    if(data[key]){ data[key].archived = true; saveExternalBorrows(data); }
  }
  renderMoneyOwed();
  odinRefreshIfOpen();
}

// ── Odin: open repayment from command centre ──
function odinOpenRepayment(name, isExternal, extKey){
  if(isExternal){
    openExternalRepayModal(extKey);
  } else {
    openRepayModal();
    // Pre-select the passenger
    setTimeout(function(){
      var sel = document.getElementById('repayPassenger');
      if(sel){ sel.value = name; sel.dispatchEvent(new Event('change')); }
    }, 100);
  }
}

// ── Odin: open borrow from command centre ──
function odinOpenBorrow(name, isExternal, extKey){
  if(isExternal){
    // Open external borrow modal
    var modal = document.getElementById('externalBorrowModal');
    if(modal){
      var nameEl = document.getElementById('extBorrowPersonName');
      if(nameEl) nameEl.value = name;
      modal.classList.add('active');
    }
  } else {
    // Open carpool borrow modal pre-selected
    // v109 ISSUE-5 — must call openBorrowModal() first so the dropdown is
    // populated from live PASSENGERS, otherwise setting .value silently fails
    // for any passenger added after first page load.
    try { openBorrowModal(); } catch(e){ console.warn('[v109] openBorrowModal threw', e); }
    var bSel = document.getElementById('borrowPassenger');
    if(bSel){ bSel.value = name; }
  }
}

// ── SMART PRICING CALCULATOR ──
var _pricingTripsPerTank = 0;
var _pricingCurrentAvg = 0;

function recalcPricing(){
  const tankCostEl     = document.getElementById('tankCost');
  const privateUseEl   = document.getElementById('privateUseAmt');
  const manualTripsEl  = document.getElementById('manualTripsPerTank');
  if(!tankCostEl) return;

  const tankCost      = parseFloat(tankCostEl.value)    || 0;
  const privateUseAmt = parseFloat(privateUseEl.value)  || 0;
  const manualTrips   = parseFloat(manualTripsEl.value) || 0;
  const tripsPerTank  = manualTrips > 0 ? manualTrips : _pricingTripsPerTank;

  // Update auto trips display
  const autoEl = document.getElementById('autoTripsPerTank');
  if(autoEl) autoEl.textContent = _pricingTripsPerTank > 0 ? _pricingTripsPerTank + ' trips' : 'No data yet';

  // Live split summary
  const splitSummary = document.getElementById('splitSummary');
  const splitWarning = document.getElementById('splitWarning');
  const carpoolCost   = Math.max(0, tankCost - privateUseAmt);
  if(tankCost > 0){
    if(splitSummary) splitSummary.style.display = 'flex';
    const sp = document.getElementById('splitPrivate');
    const sc = document.getElementById('splitCarpool');
    const st = document.getElementById('splitTank');
    if(sp) sp.textContent = 'R' + privateUseAmt.toLocaleString('en-ZA');
    if(sc) sc.textContent = 'R' + carpoolCost.toLocaleString('en-ZA');
    if(st) st.textContent = 'R' + tankCost.toLocaleString('en-ZA');
    if(splitWarning) splitWarning.style.display = privateUseAmt > tankCost ? 'block' : 'none';
  } else {
    if(splitSummary) splitSummary.style.display = 'none';
  }

  const resYourCost    = document.getElementById('resYourCost');
  const resBreakEven   = document.getElementById('resBreakEven');
  const resRecommended = document.getElementById('resRecommended');
  const resStatus      = document.getElementById('resStatus');
  const resExplain     = document.getElementById('resExplain');
  const result         = document.getElementById('pricingResult');

  if(tankCost <= 0 || tripsPerTank <= 0){
    if(resStatus){ resStatus.textContent = '⏳ Enter your tank cost' + (tripsPerTank<=0?' and trips per tank':'') + ' to see your recommended price'; resStatus.style.color='#555'; resStatus.style.background='#111'; resStatus.style.border='1px solid #222'; }
    if(resYourCost)    resYourCost.textContent    = '—';
    if(resBreakEven)   resBreakEven.textContent   = '—';
    if(resRecommended) resRecommended.textContent = '—';
    if(resExplain)     resExplain.textContent     = '';
    return;
  }

  // Maths
  const breakEven   = carpoolCost / tripsPerTank;
  const recommended = Math.ceil(breakEven * 1.10 / 5) * 5;

  if(resYourCost)    resYourCost.textContent    = 'R' + Math.round(privateUseAmt);
  if(resBreakEven)   resBreakEven.textContent   = 'R' + breakEven.toFixed(2);
  if(resRecommended) resRecommended.textContent = 'R' + recommended;

  // Status vs what passengers currently pay
  const currentAvg = _pricingCurrentAvg || 0;
  let statusText, statusColor, bgColor, borderColor;
  if(currentAvg <= 0){
    statusText='⏳ No current trip data to compare yet'; statusColor='#555'; bgColor='#111'; borderColor='#222';
  } else {
    const gap = currentAvg - breakEven;
    if(gap < -10){
      statusText='⚠️ Undercharging by R'+Math.abs(gap).toFixed(0)+'/trip — raise to at least R'+recommended;
      statusColor='#f23060'; bgColor='#1a0808'; borderColor='#5a1010';
    } else if(gap < 0){
      statusText='⚠️ Slightly under break-even by R'+Math.abs(gap).toFixed(0)+' — consider R'+recommended;
      statusColor='#f2a830'; bgColor='#1a1000'; borderColor='#5a3a00';
    } else if(gap < 10){
      statusText='✅ Just covering costs — R'+recommended+' gives you a safety buffer';
      statusColor='#c8f230'; bgColor='#0d1a00'; borderColor='#3a5a00';
    } else {
      statusText='✅ Profitable — R'+recommended+' keeps your buffer solid';
      statusColor='#c8f230'; bgColor='#0d1a00'; borderColor='#3a5a00';
    }
  }
  if(resStatus){ resStatus.textContent=statusText; resStatus.style.color=statusColor; resStatus.style.background=bgColor; resStatus.style.border='1px solid '+borderColor; }
  if(result){ result.style.background=bgColor; result.style.borderColor=borderColor; }

  if(resExplain) resExplain.innerHTML =
    'Tank <strong style="color:var(--text);">R'+tankCost+'</strong>'
    +' − Private use <strong style="color:#f2a830;">R'+Math.round(privateUseAmt)+'</strong>'
    +' = Carpool share <strong style="color:#c8f230;">R'+Math.round(carpoolCost)+'</strong><br>'
    +'R'+Math.round(carpoolCost)+' ÷ '+tripsPerTank+' trips'
    +' = <strong style="color:var(--text);">R'+breakEven.toFixed(2)+' break-even</strong>'
    +' + 10% → <strong style="color:#c8f230;">R'+recommended+' recommended</strong>';

  try{
    lsSet(PRICING_TANK_KEY,    tankCost);
    lsSet(PRICING_PRIVATE_KEY, privateUseAmt);
  }catch(e){}
}

function restorePricingSettings(){
  try{
    const tank    = lsGet(PRICING_TANK_KEY);
    const priv    = lsGet(PRICING_PRIVATE_KEY);
    if(tank){ const el=document.getElementById('tankCost');     if(el) el.value=tank; }
    if(priv){ const el=document.getElementById('privateUseAmt'); if(el) el.value=priv; }
  }catch(e){}
  recalcPricing();
}

// ══ GOOGLE DRIVE SYNC ══
