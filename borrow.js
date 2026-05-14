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
  if(borrowData&&borrowData[name]) borrowData[name].forEach(function(e){o+=e.type==='borrow'?e.amount:-e.amount;});
  var ext=loadExternalBorrows();
  Object.values(ext).forEach(function(p){
    if(p.name&&p.name.toLowerCase()===name.toLowerCase())
      (p.entries||[]).forEach(function(e){o+=e.type==='borrow'?e.amount:-e.amount;});
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
  if(!borrowData[passenger]) borrowData[passenger]=[];
  var newEntry = { id: uid(), type:'borrow', amount, date, note, account, paid:false };
  borrowData[passenger].push(newEntry);
  saveBorrows();
  // Phase D: sync to cloud
  try { if(window.cloudSync && window.cloudSync.borrows) window.cloudSync.borrows.upsert(passenger, newEntry); } catch(e){}
  // Log as expense in cashflow
  logBorrowToCashflow(passenger, amount, date, account, 'carpool');
  closeModal('borrowModal');
  renderCarpool();
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
  // Phase D: sync to cloud
  try { if(window.cloudSync && window.cloudSync.borrows) window.cloudSync.borrows.upsert(passenger, entries[idx]); } catch(e){}
  closeModal('editBorrowModal');
  renderCarpool();
  renderMoneyOwed();
  const stmtArea = document.getElementById('stmtArea');
  if(stmtArea && stmtArea.style.display !== 'none') generateStatements();
}

function deleteBorrowEntry(passenger, entryId){
  var _entry = (borrowData[passenger]||[]).find(function(e){ return e.id === entryId; });
  if(!_entry) return;
  var hasCF = !!_entry.cfId;
  // Build a meaningful label for the toast — use type + amount + person
  var typeLabel = _entry.iOwe ? 'refund-owed' : (_entry.type === 'repay' ? 'repayment' : 'borrow');
  var amtStr = (typeof fmtR === 'function') ? fmtR(Math.abs(_entry.amount||0)) : ('R'+Math.abs(_entry.amount||0));
  var label = passenger + ' ' + typeLabel + ' ' + amtStr;
  // Soft-delete: flag the entry rather than remove it. The cash flow side
  // we leave alone for now — purge handler removes both at the same time.
  _entry._deleted = true;
  saveBorrows();
  // Phase D: mirror soft-delete to cloud as deleted_at timestamp.
  try { if(window.cloudSync && window.cloudSync.borrows) window.cloudSync.borrows.upsert(passenger, _entry); } catch(e){}
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
        // Re-sync the un-deleted entry to cloud.
        try { if(window.cloudSync && window.cloudSync.borrows) window.cloudSync.borrows.upsert(passenger, e); } catch(_e){}
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
    data[personKey].entries[idx].amount = amount;
    data[personKey].entries[idx].date   = date;
    data[personKey].entries[idx].note   = note;
    saveExternalBorrows(data);
    // Sync linked savings deposit
    updateSavingsDepositByBorrowId(personKey + ':' + entryId, amount, date, note);
  } else {
    const entries = borrowData[passengerVal] || [];
    const idx = entries.findIndex(function(e){ return e.id === entryId; });
    if(idx === -1) return;
    entries[idx].amount = amount;
    entries[idx].date   = date;
    entries[idx].note   = note;
    saveBorrows();
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
  document.getElementById('repayModal').classList.add('active');
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
  if(sel) sel.addEventListener('change', updateRepayOwingSummary);
});

function confirmRepay(){
  const passenger = document.getElementById('repayPassenger').value;
  const amount = parseFloat(document.getElementById('repayAmt').value);
  const date = document.getElementById('repayDate').value || localDateStr(new Date());
  const bank = document.getElementById('repayBank') ? document.getElementById('repayBank').value : 'Tymebank';
  const noteRaw = document.getElementById('repayNote').value.trim();
  if(!passenger || isNaN(amount) || amount <= 0){ alert('Enter a valid repayment amount.'); return; }
  if(!borrowData[passenger]) borrowData[passenger] = [];
  // Build enriched label and note for Cash Flow
  const cfLabel = passenger + ' – Borrow Repayment → ' + bank;
  const cfNote = 'Borrowed money repaid by ' + passenger + ' into ' + bank + (noteRaw ? ' · ' + noteRaw : '');
  var cfId_repay=postToCF({label:cfLabel,amount:amount,date:date,icon:'repay',type:'income',sourceType:'borrow_repaid',sourceId:passenger,sourceCardName:bank,note:cfNote});
  var repayEntry = { id: uid(), type:'repay', amount: amount, date: date, note: cfNote, paid: true, cfId:cfId_repay, bank:bank };
  borrowData[passenger].push(repayEntry);
  saveBorrows();
  // Phase D: sync to cloud
  try { if(window.cloudSync && window.cloudSync.borrows) window.cloudSync.borrows.upsert(passenger, repayEntry); } catch(e){}
  closeModal('repayModal');
  renderCarpool();
  renderMoneyOwed();
  if(typeof renderOdinInsights === 'function') try{ renderOdinInsights('money'); }catch(e){}
  const stmtArea = document.getElementById('stmtArea');
  if(stmtArea && stmtArea.style.display !== 'none') generateStatements();
  loadBorrowReport();
  // ── Open MoneyMoveZ to allocate the repayment ──
  setTimeout(function(){
    openAllocateModal('repayment');
    var amtEl = document.getElementById('allocAmount');
    if(amtEl){ amtEl.value = amount; }
    var srcEl = document.getElementById('allocSource');
    if(srcEl){ srcEl.value = 'repay_carpool_'+passenger; }
    if(typeof recalcAllocation === 'function') recalcAllocation();
  }, 300);
}

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
    d.innerHTML = '<div><div style="font-size:13px;color:#555;">'+name+'</div><div style="font-size:9px;color:#333;letter-spacing:1px;">CARPOOL</div></div>'
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
    d.innerHTML = '<div><div style="font-size:13px;color:#555;">'+p.name+'</div><div style="font-size:9px;color:#333;letter-spacing:1px;">PERSONAL</div></div>'
      +'<button onclick="unarchivePerson(\''+key+'\',\'external\')" style="background:none;border:1px solid #2a3a1a;border-radius:6px;padding:5px 12px;color:#5a8800;font-family:DM Mono,monospace;font-size:10px;cursor:pointer;">Restore</button>';
    container.appendChild(d);
  });

  if(!hasAny){
    container.innerHTML = '<div style="font-size:11px;color:#333;padding:8px 0;">No archived people.</div>';
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
    var bModal = document.getElementById('borrowModal');
    if(bModal){
      var bSel = document.getElementById('borrowPassenger');
      if(bSel){ bSel.value = name; }
      bModal.classList.add('active');
    }
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
    'Tank <strong style="color:#efefef;">R'+tankCost+'</strong>'
    +' − Private use <strong style="color:#f2a830;">R'+Math.round(privateUseAmt)+'</strong>'
    +' = Carpool share <strong style="color:#c8f230;">R'+Math.round(carpoolCost)+'</strong><br>'
    +'R'+Math.round(carpoolCost)+' ÷ '+tripsPerTank+' trips'
    +' = <strong style="color:#efefef;">R'+breakEven.toFixed(2)+' break-even</strong>'
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
