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
  document.getElementById('externalBorrowModal').classList.add('active');
  setTimeout(updateExtLendingGuardrail,100);
}

function confirmExternalBorrow(){
  const name   = document.getElementById('extBorrowName').value.trim();
  const amount = parseFloat(document.getElementById('extBorrowAmt').value);
  const date   = document.getElementById('extBorrowDate').value || localDateStr(new Date());
  const note   = document.getElementById('extBorrowNote').value.trim();
  const account = document.getElementById('extBorrowAccount').value || 'FNB';
  if(!name){ alert('Please enter a name.'); return; }
  if(!amount || amount <= 0){ alert('Please enter a valid amount.'); return; }
  const data = loadExternalBorrows();
  const key  = name.toLowerCase().replace(/\s+/g,'_');
  if(!data[key]) data[key] = { name: name, entries: [] };
  var newEntry = { id: uid(), type:'borrow', amount, date, note, account };
  data[key].entries.push(newEntry);
  saveExternalBorrows(data);
  // Log as expense in cashflow — stamp cfId back for cascade delete
  var cfId = logBorrowToCashflow(name, amount, date, account, 'personal');
  if(cfId){ newEntry.cfId = cfId; saveExternalBorrows(data); }
  closeModal('externalBorrowModal');
  renderMoneyOwed();
  odinRefreshIfOpen();
  if(typeof renderOdinInsights === 'function') try{ renderOdinInsights('money'); }catch(e){}
}

// ── LOG BORROW AS CASHFLOW EXPENSE ──
// Returns the CF entry id so callers can stamp cfId onto the borrow entry for cascade delete
function logBorrowToCashflow(personName, amount, date, account, tag){
  try{
    var data = loadCFData();
    var d = new Date(date + 'T00:00:00');
    var mk = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    if(!data[mk]) data[mk] = { income:[], expenses:[] };
    if(!data[mk].expenses) data[mk].expenses = [];
    var acctLabel = account === 'TymeBank' ? 'TymeBank' : 'FNB';
    var tagLabel  = tag === 'carpool' ? '🚗 Carpool' : '👤 Personal';
    var cfEntryId = uid();
    data[mk].expenses.push({
      id: cfEntryId,
      label: '💸 Lent to ' + personName + ' [' + acctLabel + ']',
      amount: amount,
      icon: '🤝',
      auto: false,
      account: account,
      borrowTag: tagLabel,
      date: date
    });
    saveCFData(data);
    return cfEntryId;
  }catch(e){ console.warn('Could not log borrow to cashflow:', e); return null; }
}

// ── ADD MORE BORROW (top-up existing person) ──
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

  if(tag === 'carpool'){
    if(!borrowData[key]) borrowData[key] = [];
    var cpEntry = { id: uid(), type:'borrow', amount: amount, date: date, note: note, account: account, paid: false };
    borrowData[key].push(cpEntry);
    var cpCfId = logBorrowToCashflow(personName, amount, date, account, tag);
    if(cpCfId){ cpEntry.cfId = cpCfId; }
    saveBorrows();
    renderCarpool();
  } else {
    var extData = loadExternalBorrows();
    if(!extData[key]){ alert('Person not found.'); return; }
    var extEntry = { id: uid(), type:'borrow', amount: amount, date: date, note: note, account: account };
    extData[key].entries.push(extEntry);
    var extCfId = logBorrowToCashflow(personName, amount, date, account, tag);
    if(extCfId){ extEntry.cfId = extCfId; }
    saveExternalBorrows(extData);
    renderMoneyOwed();
    if(typeof renderOdinInsights === 'function') try{ renderOdinInsights('money'); }catch(e){}
  }
  closeModal('addMoreBorrowModal');

  var old = document.getElementById('borrowAddToast');
  if(old) old.remove();
  var toast = document.createElement('div');
  toast.id = 'borrowAddToast';
  toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1a0e2e;border:1px solid #a78bfa;border-radius:8px;padding:12px 16px;z-index:9999;display:flex;align-items:center;gap:10px;font-family:DM Mono,monospace;font-size:11px;letter-spacing:1px;color:#a78bfa;box-shadow:0 4px 20px rgba(0,0,0,.6);min-width:260px;';
  toast.innerHTML = '<span>💸 R'+Number(amount).toLocaleString('en-ZA')+' added to <strong style="color:#efefef;">'+personName+'</strong> · from '+account+' · logged to cashflow</span><button onclick="document.getElementById(\'borrowAddToast\').remove();" style="background:none;border:none;color:#555;cursor:pointer;font-size:16px;padding:0 2px;">✕</button>';
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

function openExternalRepayModal(key){
  const data   = loadExternalBorrows();
  const person = data[key];
  if(!person) return;
  document.getElementById('extRepayPersonKey').value = key;
  document.getElementById('extRepayNameDisplay').textContent = person.name;
  document.getElementById('extRepayAmt').value = '';
  document.getElementById('extRepayDate').value = localDateStr(new Date());
  document.getElementById('extRepayNote').value = '';
  // Show owing
  const { borrowed, repaid } = calcPersonTotals(person.entries);
  const owing = borrowed - repaid;
  document.getElementById('extRepayOwingSummary').innerHTML =
    person.name + ' currently owes <strong style="color:#f2a830;font-size:13px;">R' + owing.toLocaleString('en-ZA') + '</strong>';
  buildFundSelectOptions('extRepayFundSelect');
  document.getElementById('externalRepayModal').classList.add('active');
}

function confirmExternalRepay(){
  const key    = document.getElementById('extRepayPersonKey').value;
  const amount = parseFloat(document.getElementById('extRepayAmt').value);
  const date   = document.getElementById('extRepayDate').value || localDateStr(new Date());
  const note   = document.getElementById('extRepayNote').value.trim() || 'Repayment';
  if(!amount || amount <= 0){ alert('Enter a valid repayment amount.'); return; }
  const data = loadExternalBorrows();
  if(!data[key]) return;
  const personName = data[key].name || key;
  const borrowEntryId = uid();
  data[key].entries.push({ id: borrowEntryId, type:'repay', amount, date, note });
  saveExternalBorrows(data);
  // ── Optional: push repayment into a savings fund ──
  const fundSel = document.getElementById('extRepayFundSelect');
  if(fundSel && fundSel.value){
    const linkedId = key + ':' + borrowEntryId;
    if(fundSel.value === '__maint__'){
      const mdata = getMaintData();
      mdata.push({ id: uid(), borrowEntryId: linkedId, person: personName, amount, date, note: '↩ Repaid by ' + personName + (note && note !== 'Repayment' ? ' · ' + note : '') });
      saveMaintData(mdata);
      renderMaintCard();
  odinRefreshIfOpen();
      showRepayToast(personName, amount, 'Maintenance Fund');
    } else {
      const f = funds.find(x => x.id === fundSel.value);
      if(f){
        f.deposits.push({ id: uid(), borrowEntryId: linkedId, amount, date, note: '↩ Repaid by ' + personName + (note && note !== 'Repayment' ? ' · ' + note : ''), txnType: 'in' });
        saveFunds();
        renderFunds();
        showRepayToast(personName, amount, f.name);
      }
    }
  }
  closeModal('externalRepayModal');
  renderMoneyOwed();
  if(typeof renderOdinInsights === 'function') try{ renderOdinInsights('money'); }catch(e){}
}

function showRepayToast(name, amount, fundName){
  const old = document.getElementById('repayFundToast');
  if(old) old.remove();
  const toast = document.createElement('div');
  toast.id = 'repayFundToast';
  toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#0a1a2e;border:1px solid #7090f0;border-radius:8px;padding:12px 16px;z-index:9999;display:flex;align-items:center;gap:10px;font-family:DM Mono,monospace;font-size:11px;letter-spacing:1px;color:#7090f0;box-shadow:0 4px 20px rgba(0,0,0,.6);min-width:260px;';
  toast.innerHTML = '<span>✓ R'+Number(amount).toLocaleString('en-ZA')+' from '+name+' added to <strong style="color:#efefef;">'+fundName+'</strong></span><button onclick="document.getElementById(\'repayFundToast\').remove();" style="background:none;border:none;color:#555;cursor:pointer;font-size:16px;padding:0 2px;">✕</button>';
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
    else borrowed += Number(e.amount||0);
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
      : '<div style="color:#555;font-size:13px;text-align:center;padding:40px 0;">No one owes you anything right now 🎉</div>';
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
      const actionBtns = '<span onclick="'+editFn+'" style="cursor:pointer;color:#444;font-size:13px;padding:2px 5px;" title="Edit">✏️</span>'
        +'<span onclick="'+delFn+'" style="cursor:pointer;color:#444;font-size:13px;padding:2px 5px;" title="Delete">🗑</span>';
      if(e.type==='repay') return ''; // repayments hidden from mini statement
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;font-size:11px;border-bottom:1px solid #161616;">'
        +'<span style="color:#555;">'+e.date+(e.note?' · '+e.note:'')+(e.account?' <span style="font-size:9px;background:#1a0e2e;border:1px solid #3a2060;border-radius:3px;padding:1px 4px;color:#a78bfa;">'+e.account+'</span>':'')+' </span>'
        +'<span style="display:flex;align-items:center;gap:4px;"><span style="color:#a78bfa;">💸 R'+Number(e.amount).toLocaleString('en-ZA')+'</span>'+actionBtns+'</span>'
        +'</div>';
    }).join('');

    const repayBtn = p.tag === 'external' && !settled
      ? '<button onclick="openExternalRepayModal(\''+p.key+'\')" style="padding:7px 14px;background:#0e1a2e;border:1px solid #7090f0;border-radius:6px;color:#7090f0;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1px;cursor:pointer;">↩ Repayment</button>'
      : (p.tag === 'carpool' && !settled
          ? '<button onclick="openRepayModal(\''+p.key+'\')" style="padding:7px 14px;background:#0e1a2e;border:1px solid #7090f0;border-radius:6px;color:#7090f0;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1px;cursor:pointer;">↩ Repayment</button>'
          : '');

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
          +'<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:16px;color:#efefef;">'+p.name+'</div>'
          +tagHtml
        +'</div>'
        +'<div style="text-align:right;">'
          +'<div style="font-size:9px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;">'+(settled?'Settled':'Owes you')+'</div>'
          +'<div style="font-family:\'Syne\',sans-serif;font-weight:800;font-size:22px;color:'+(settled?'#c8f230':'#f2a830')+';">'+(settled?'✓ Settled':'R'+owing.toLocaleString('en-ZA'))+'</div>'
        +'</div>'
      +'</div>'
      // Progress bar
      +'<div style="padding:10px 16px;border-bottom:1px solid var(--border);background:#0a0a0a;">'
        +'<div style="display:flex;justify-content:space-between;font-size:9px;color:#444;margin-bottom:4px;letter-spacing:1px;">'
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
        +(repayBtn ? repayBtn : '')
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
// Reads borrowData for entries flagged iOwe:true (created by the MoneyMoveZ
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
    +     '<div style="font-size:10px;color:#666;letter-spacing:1.5px;text-transform:uppercase;margin-top:2px;">Refunds from overpayments</div>'
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
  el('rptBorrowOwing').textContent  = fmtR(totalBorrowed - totalRepaid);

  const container = el('rptBorrowRows');
  container.innerHTML = '';

  const names = Object.keys(byPerson);
  if (names.length === 0) {
    container.innerHTML = '<div style="color:#555;font-size:13px;padding:8px 0;">No borrow records yet.</div>';
    return;
  }

  names.forEach(function(name) {
    const b = byPerson[name];
    const owing = b.borrowed - b.repaid;
    const tagBadge = b.tag === 'personal'
      ? '<span style="font-size:9px;padding:1px 7px;border-radius:100px;background:#1a1a2e;color:#7090f0;border:1px solid #2a2a5a;letter-spacing:1px;margin-left:6px;">👤 PERSONAL</span>'
      : '<span style="font-size:9px;padding:1px 7px;border-radius:100px;background:#1a2e00;color:#c8f230;border:1px solid #3a5a00;letter-spacing:1px;margin-left:6px;">🚗 CARPOOL</span>';
    const row = document.createElement('div');
    row.className = 'rpt-row';
    row.style.gridTemplateColumns = '1.5fr 1fr 1fr 1fr';
    row.innerHTML =
      '<span style="color:#ccc;display:flex;align-items:center;">' + name + tagBadge + '</span>' +
      '<span style="color:#888">' + fmtR(b.borrowed) + '</span>' +
      '<span style="color:#c8f230">' + fmtR(b.repaid) + '</span>' +
      '<span style="color:' + (owing > 0 ? '#f2a830' : '#c8f230') + ';font-weight:500">' + fmtR(owing) + '</span>';
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
  if(tab==='savings') document.getElementById('navSavings').classList.add('active');
  if(tab==='carpool') document.getElementById('navCarpool').classList.add('active');
  if(tab==='cars' && navCars) navCars.classList.add('active');
  if(tab==='instalments' && navInst) navInst.classList.add('active');
  if(tab==='school' && navSchool) navSchool.classList.add('active');
  if(tab==='routine' && navRoutine) navRoutine.classList.add('active');
  if(tab==='cashflow' && navCf) navCf.classList.add('active');
  if(tab==='odin' && navOdin) navOdin.classList.add('active');
  document.getElementById('page-'+tab).classList.add('active');
  if(tab==='carpool') renderCarpool();
  if(tab==='savings'){ renderFunds(); renderCustomMaintCards(); try { renderMaintCard(); } catch(e){} }
  if(tab==='reports'){ renderReportFilters(); renderReports(); loadBorrowReport(); restoreDailyFuel(); loadFuelReport(); restorePricingSettings(); runSmartEngine(); initCFReportPickers(); }
  if(tab==='prayer'){ pDayOffset=0; renderPrayer(); }
  if(tab==='money'){ renderMoneyOwed(); try{ renderOdinInsights('money'); }catch(e){} }
  if(tab==='cars'){ renderCars(); }
  if(tab==='instalments'){ renderInst(); }
  if(tab==='school'){ renderSchool(); }
  if(tab==='routine'){ renderRoutine(); }
  if(tab==='cashflow'){ renderCashFlow(); }
  if(tab==='odin'){ renderOdinTab(); }
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
  if(tab==='savings') document.getElementById('navSavings').classList.add('active');
  if(tab==='carpool') document.getElementById('navCarpool').classList.add('active');
  if(tab==='cars' && navCars) navCars.classList.add('active');
  if(tab==='instalments' && navInst) navInst.classList.add('active');
  if(tab==='school' && navSchool) navSchool.classList.add('active');
  if(tab==='routine' && navRoutine) navRoutine.classList.add('active');
  if(tab==='cashflow' && navCf) navCf.classList.add('active');
  document.getElementById('page-'+tab).classList.add('active');
  if(tab==='carpool') renderCarpool();
  if(tab==='savings'){ renderFunds(); renderCustomMaintCards(); try { renderMaintCard(); } catch(e){} }
  if(tab==='reports'){ renderReportFilters(); renderReports(); loadBorrowReport(); restoreDailyFuel(); loadFuelReport(); restorePricingSettings(); runSmartEngine(); initCFReportPickers(); }
  if(tab==='prayer'){ pDayOffset=0; renderPrayer(); }
  if(tab==='money'){ renderMoneyOwed(); try{ renderOdinInsights('money'); }catch(e){} }
  if(tab==='cars'){ renderCars(); }
  if(tab==='instalments'){ renderInst(); }
  if(tab==='school'){ renderSchool(); }
  if(tab==='routine'){ renderRoutine(); }
  if(tab==='cashflow'){ renderCashFlow(); }
  if(tab==='odin'){ renderOdinTab(); }
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
    +       '<div style="font-size:10px;color:#666;letter-spacing:1.5px;text-transform:uppercase;margin-top:2px;">Refund owed: R'+amt.toFixed(2)+'</div>'
    +     '</div>'
    +     '<button onclick="document.getElementById(\'iOweModal\').remove();" style="background:none;border:none;color:#666;font-size:22px;cursor:pointer;">&times;</button>'
    +   '</div>'
    +   '<div style="margin-bottom:10px;">'
    +     '<div style="font-size:9px;color:#666;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">Amount paid</div>'
    +     '<input type="number" id="iOweAmt" value="'+amt.toFixed(2)+'" step="0.01" '
    +       'style="width:100%;background:#111;border:1px solid #2a2a2a;color:#c8f230;font-family:DM Mono,monospace;font-size:16px;font-weight:700;padding:10px 12px;border-radius:6px;outline:none;box-sizing:border-box;"/>'
    +   '</div>'
    +   '<div style="margin-bottom:10px;">'
    +     '<div style="font-size:9px;color:#666;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">Paid from</div>'
    +     '<select id="iOweBank" style="width:100%;background:#111;border:1px solid #2a2a2a;color:#efefef;font-family:DM Mono,monospace;font-size:13px;padding:10px 12px;border-radius:6px;outline:none;">'
    +       '<option value="TymeBank">TymeBank</option>'
    +       '<option value="FNB">FNB</option>'
    +       '<option value="Cash">Cash</option>'
    +       '<option value="Other">Other</option>'
    +     '</select>'
    +   '</div>'
    +   '<div style="margin-bottom:14px;">'
    +     '<div style="font-size:9px;color:#666;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">Date</div>'
    +     '<input type="date" id="iOweDate" value="'+todayStr+'" '
    +       'style="width:100%;background:#111;border:1px solid #2a2a2a;color:#efefef;font-family:DM Mono,monospace;font-size:13px;padding:10px 12px;border-radius:6px;outline:none;box-sizing:border-box;"/>'
    +   '</div>'
    +   '<div style="display:flex;gap:8px;">'
    +     '<button onclick="document.getElementById(\'iOweModal\').remove();" style="flex:1;padding:11px;background:none;border:1px solid #2a2a2a;border-radius:6px;color:#888;font-family:DM Mono,monospace;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;">Cancel</button>'
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
