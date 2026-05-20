// Money In — pocket-first income flow (replaces MoneyMoveZ, 2026-05-20)
// ─────────────────────────────────────────────────────────────────────
// Locked design (per HANDOVER 2026-05-19 #3):
//   • Money lives in pockets; bank = doorway only (never stores a balance)
//   • Salary lands → "House expenses" comes off the top (typed fresh every
//     month, placeholder "Ask wife how much…", logged immediately as a Spend)
//   • Leftover (amount − house) splits across pockets
//   • Pre-fill uses existing Priority Rules (the suggestion)
//   • Every pocket box editable; live two-way total
//   • Save locked until "left to place" = R0 exactly
//   • Edit/delete reverses ALL linked records (income + house + every pocket
//     deposit + every linked CF entry) as one atomic action — no orphans
// ─────────────────────────────────────────────────────────────────────

const MONEYIN_KEY = 'yb_moneyin_v1';

// ── Daily pocket auto-creation ───────────────────────────────────────
// The new pocket-first model needs a "Daily" pocket for everyday spending
// that doesn't eat into goal pockets. We auto-create it on first open of
// Money In so the user doesn't have to.
function ensureDailyPocket(){
  if(!Array.isArray(funds)) return null;
  var existing = funds.find(function(f){
    return f.name && /^daily$/i.test(f.name.trim());
  });
  if(existing) return existing;

  var daily = {
    id: uid(),
    name: 'Daily',
    emoji: '🗓️',
    color: '#c8f230',
    goal: 0,
    weekly: 0,
    targetType: 'weekly',
    start: localDateStr(new Date()),
    deposits: [],
    // Marker so we know this was system-created (cosmetic only)
    _systemCreated: true
  };
  funds.unshift(daily);  // put it first — it's the everyday pocket
  saveFunds();
  return daily;
}

// ── Storage ──────────────────────────────────────────────────────────
function loadMoneyInData(){
  try{ return JSON.parse(lsGet(MONEYIN_KEY) || '[]'); }
  catch(e){ return []; }
}
function saveMoneyInData(arr){ lsSet(MONEYIN_KEY, JSON.stringify(arr)); }

// ── State for the modal ──────────────────────────────────────────────
var _miState = {
  editingId: null,
  amount: 0,
  date: '',
  note: '',
  sourceBank: 'FNB',
  house: 0,
  splits: {}  // { fundId: amount, ... }
};

// ── Modal: open ─────────────────────────────────────────────────────
function openMoneyIn(editingId){
  ensureDailyPocket();

  // Reset state
  _miState = {
    editingId: editingId || null,
    amount: 0,
    date: localDateStr(new Date()),
    note: '',
    sourceBank: 'FNB',
    house: 0,
    splits: {}
  };

  // If editing, hydrate from the saved record
  if(editingId){
    var all = loadMoneyInData();
    var rec = all.find(function(r){ return r.id === editingId; });
    if(rec){
      _miState.amount = rec.amount;
      _miState.date = rec.date;
      _miState.note = rec.note || '';
      _miState.sourceBank = rec.sourceBank || 'FNB';
      _miState.house = rec.house || 0;
      (rec.splits||[]).forEach(function(s){ _miState.splits[s.fundId] = s.amount; });
    }
  }

  document.getElementById('miModalTitle').textContent = editingId ? '✏️ Edit Money In' : '↓ Money In';
  document.getElementById('miAmount').value = _miState.amount || '';
  document.getElementById('miNote').value = _miState.note;
  document.getElementById('miDate').value = _miState.date;
  document.getElementById('miHouse').value = _miState.house || '';
  _miSetSourceBank(_miState.sourceBank);

  _miRenderPocketSplit();
  document.getElementById('moneyInModal').classList.add('active');
}

function closeMoneyIn(){
  document.getElementById('moneyInModal').classList.remove('active');
}

// ── Source bank picker ──────────────────────────────────────────────
function _miSetSourceBank(bank){
  _miState.sourceBank = bank;
  ['FNB','TymeBank','Cash'].forEach(function(b){
    var el = document.getElementById('miBank_'+b.replace(/[^A-Za-z]/g,''));
    if(!el) return;
    if(b === bank){
      el.style.background = '#1a2e00';
      el.style.borderColor = '#c8f230';
      el.style.color = '#c8f230';
    } else {
      el.style.background = '#0d0d0d';
      el.style.borderColor = '#2a2a2a';
      el.style.color = '#888';
    }
  });
}

// ── Read inputs back into state on every change ─────────────────────
function _miSyncInputs(){
  _miState.amount = parseFloat(document.getElementById('miAmount').value) || 0;
  _miState.note   = document.getElementById('miNote').value.trim();
  _miState.date   = document.getElementById('miDate').value || localDateStr(new Date());
  _miState.house  = parseFloat(document.getElementById('miHouse').value) || 0;
}

// ── Build a priority-aware pre-fill ─────────────────────────────────
// Strategy: walk getActivePriorities() in order; for each rule that has a
// fund target (maint, savings, car_service) put the rule's monthly target
// into that target fund, capped at what's left. Anything remaining at the
// end goes into the Daily pocket. This is ONLY a suggestion — every box
// is editable below.
function _miBuildPrefill(leftover){
  var prefill = {};
  if(leftover <= 0) return prefill;
  var rem = leftover;

  try{
    var rules = (typeof getActivePriorities === 'function') ? getActivePriorities() : [];
    rules.forEach(function(rule){
      if(rem <= 0) return;
      var fundId = rule.targetId;
      if(!fundId) return;
      var fund = funds.find(function(f){ return f.id === fundId; });
      if(!fund) return;

      // Suggested amount: monthly target (weekly*4.33 if weekly, else weekly directly for monthly)
      var monthlyTarget = (rule.id === 'maint')
        ? (typeof getMaintTarget === 'function' ? getMaintTarget() : 1500)
        : (fund.targetType === 'monthly' ? (fund.weekly||0) : Math.round((fund.weekly||0) * 4.33));

      if(!monthlyTarget || monthlyTarget <= 0) return;
      var alloc = Math.min(monthlyTarget, rem);
      prefill[fundId] = (prefill[fundId]||0) + alloc;
      rem -= alloc;
    });

    // Spread anything remaining across savings funds by % behind (mirrors the
    // 'savings' rule). Skip the Ee90 isExpense pocket (it's a tracker, not a
    // savings goal) and skip Daily (we top it up last).
    if(rem > 0){
      var dailyFund = funds.find(function(f){ return f.name && /^daily$/i.test(f.name); });
      var dailyId = dailyFund ? dailyFund.id : null;
      var savingsTargets = funds.filter(function(f){
        if(f.isExpense) return false;
        if(f.id === dailyId) return false;
        if((prefill[f.id]||0) >= (f.goal||Infinity)) return false;
        return (f.goal||0) > 0;
      });

      // Sort by % behind (most behind first)
      savingsTargets.sort(function(a,b){
        var aPct = (fundTotal(a)+(prefill[a.id]||0)) / (a.goal||1);
        var bPct = (fundTotal(b)+(prefill[b.id]||0)) / (b.goal||1);
        return aPct - bPct;
      });

      // Distribute one pass at small increments so nothing eats everything
      savingsTargets.forEach(function(f){
        if(rem <= 0) return;
        var roomToGoal = Math.max(0, (f.goal||0) - fundTotal(f) - (prefill[f.id]||0));
        // Don't give any one pocket more than 30% of what's left this pass
        var capPerPocket = Math.min(roomToGoal, Math.max(100, Math.floor(rem * 0.3)));
        var alloc = Math.min(capPerPocket, rem);
        if(alloc > 0){
          prefill[f.id] = (prefill[f.id]||0) + alloc;
          rem -= alloc;
        }
      });
    }

    // Whatever is left goes to Daily — the everyday pocket catches the tail.
    if(rem > 0){
      var daily = funds.find(function(f){ return f.name && /^daily$/i.test(f.name); });
      if(daily){
        prefill[daily.id] = (prefill[daily.id]||0) + rem;
        rem = 0;
      }
    }
  }catch(e){
    console.warn('[moneyin] prefill error', e);
  }

  // Round each to 2 decimals (rands & cents)
  Object.keys(prefill).forEach(function(k){
    prefill[k] = Math.round(prefill[k] * 100) / 100;
  });
  return prefill;
}

// ── Render the pocket split UI ──────────────────────────────────────
function _miRenderPocketSplit(){
  _miSyncInputs();
  var leftover = Math.max(0, _miState.amount - _miState.house);

  // First render only: if not editing and no manual edits yet, use prefill
  var hasUserEdits = Object.keys(_miState.splits).length > 0;
  if(!hasUserEdits && !_miState.editingId && leftover > 0){
    _miState.splits = _miBuildPrefill(leftover);
  }

  var c = document.getElementById('miPocketList');
  if(!c) return;
  c.innerHTML = '';

  // Show every pocket, in their current funds[] order
  funds.forEach(function(f){
    var amt = _miState.splits[f.id] || 0;
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:9px;padding:8px 0;border-bottom:1px solid #161616;';

    // Name + emoji
    var nameCol = document.createElement('div');
    nameCol.style.cssText = 'flex:1;min-width:0;display:flex;align-items:center;gap:7px;';
    var emoji = document.createElement('span');
    emoji.style.cssText = 'font-size:14px;flex-shrink:0;';
    emoji.textContent = f.emoji || '💰';
    var name = document.createElement('span');
    name.style.cssText = 'font-size:12px;color:#bbb;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    name.textContent = f.name;
    nameCol.appendChild(emoji);
    nameCol.appendChild(name);

    // Amount input
    var inp = document.createElement('input');
    inp.type = 'number';
    inp.step = '0.01';
    inp.min = '0';
    inp.value = amt > 0 ? amt : '';
    inp.placeholder = 'R0';
    inp.style.cssText = 'width:88px;text-align:right;padding:7px 9px;background:#0d0d0d;border:1px solid #333;border-radius:5px;color:'+(amt>0?'#c8f230':'#444')+';font-family:DM Mono,monospace;font-size:12px;font-weight:700;outline:none;';
    inp.dataset.fundId = f.id;
    inp.addEventListener('input', _miOnPocketEdit);
    inp.addEventListener('focus', function(){ this.select(); });

    row.appendChild(nameCol);
    row.appendChild(inp);
    c.appendChild(row);
  });

  _miUpdateLiveTotal();
}

// ── Live two-way total: recalculates on every input ─────────────────
function _miOnPocketEdit(e){
  var fundId = e.target.dataset.fundId;
  var val = parseFloat(e.target.value) || 0;
  if(val < 0) val = 0;
  _miState.splits[fundId] = val;
  // Repaint colour without rebuilding the whole list (preserves focus)
  e.target.style.color = val > 0 ? '#c8f230' : '#444';
  _miUpdateLiveTotal();
}

// Re-run prefill if the user changes amount/house AFTER initial prefill.
function _miOnHeaderEdit(){
  var oldAmount = _miState.amount;
  var oldHouse = _miState.house;
  _miSyncInputs();
  // If amount or house changed materially, blow away splits and re-prefill.
  if(Math.abs(_miState.amount - oldAmount) > 0.001 || Math.abs(_miState.house - oldHouse) > 0.001){
    _miState.splits = {};  // forget manual edits — header changed
    _miRenderPocketSplit();
  } else {
    _miUpdateLiveTotal();
  }
}

function _miUpdateLiveTotal(){
  _miSyncInputs();
  var leftover = Math.max(0, _miState.amount - _miState.house);
  var placed = 0;
  Object.keys(_miState.splits).forEach(function(k){ placed += (_miState.splits[k]||0); });
  placed = Math.round(placed * 100) / 100;
  var left = Math.round((leftover - placed) * 100) / 100;

  var leftEl = document.getElementById('miLeftToPlace');
  var placedEl = document.getElementById('miPlacedTotal');
  var leftoverEl = document.getElementById('miLeftoverHint');
  var saveBtn = document.getElementById('miSaveBtn');
  var bar = document.getElementById('miProgBar');

  if(placedEl) placedEl.textContent = fmtR(placed);
  if(leftoverEl) leftoverEl.textContent = fmtR(leftover) + ' to place';

  if(leftEl){
    if(Math.abs(left) < 0.005){
      leftEl.textContent = 'R0 ✓';
      leftEl.style.color = '#c8f230';
    } else if(left > 0){
      leftEl.textContent = fmtR(left) + ' left';
      leftEl.style.color = '#f2a830';
    } else {
      leftEl.textContent = fmtR(Math.abs(left)) + ' over ⚠';
      leftEl.style.color = '#f23060';
    }
  }

  if(bar){
    var pct = leftover > 0 ? Math.min(100, (placed/leftover)*100) : 0;
    bar.style.width = pct + '%';
    bar.style.background = Math.abs(left) < 0.005 ? '#c8f230' : (left < 0 ? '#f23060' : '#f2a830');
  }

  if(saveBtn){
    var ok = _miState.amount > 0 && Math.abs(left) < 0.005;
    saveBtn.disabled = !ok;
    saveBtn.style.opacity = ok ? '1' : '.45';
    saveBtn.style.cursor = ok ? 'pointer' : 'not-allowed';
    saveBtn.textContent = ok ? '✓ Save Money In' : (left > 0 ? '🔒 ' + fmtR(left) + ' still to place' : '🔒 ' + fmtR(Math.abs(left)) + ' over — fix it');
  }
}

// ── Save: write the linked group of records ─────────────────────────
function saveMoneyIn(){
  _miSyncInputs();
  // Sync splits from the live inputs (last write wins)
  document.querySelectorAll('#miPocketList input').forEach(function(inp){
    var v = parseFloat(inp.value) || 0;
    if(v < 0) v = 0;
    _miState.splits[inp.dataset.fundId] = v;
  });

  var amount = _miState.amount;
  var house = _miState.house;
  var leftover = Math.max(0, amount - house);
  var placed = 0;
  Object.keys(_miState.splits).forEach(function(k){ placed += (_miState.splits[k]||0); });
  placed = Math.round(placed * 100) / 100;
  leftover = Math.round(leftover * 100) / 100;

  if(amount <= 0){ alert('Enter the amount received.'); return; }
  if(Math.abs(placed - leftover) > 0.005){
    alert('Split must total exactly ' + fmtR(leftover) + '. Currently ' + fmtR(placed) + '.');
    return;
  }

  // If editing, reverse the old record first
  if(_miState.editingId){
    _moneyInReverse(_miState.editingId, { silent:true });
  }

  // ── Build the new linked record ──
  var miId = 'mi_' + uid();
  var rec = {
    id: miId,
    amount: amount,
    date: _miState.date,
    note: _miState.note || '',
    sourceBank: _miState.sourceBank || 'FNB',
    house: house,
    splits: [],
    cfIncomeId: null,
    cfHouseId: null,
    createdAt: new Date().toISOString()
  };

  // 1) Post the income to Cash Flow
  rec.cfIncomeId = _moneyInPostIncome(rec);

  // 2) House expense, if any
  if(house > 0){
    rec.cfHouseId = _moneyInPostHouse(rec);
  }

  // 3) Pocket splits — push deposits + post linked CF entries
  Object.keys(_miState.splits).forEach(function(fundId){
    var amt = _miState.splits[fundId];
    if(!amt || amt <= 0) return;
    var f = funds.find(function(x){ return x.id === fundId; });
    if(!f) return;

    var depositId = uid();
    var cfId = null;
    try{
      cfId = postToCF({
        label: 'Savings - ' + f.name,
        amount: amt,
        date: rec.date,
        icon: 'savings',
        type: 'expense',
        sourceType: 'savings_deposit',
        sourceId: fundId,
        sourceCardName: f.name,
        note: 'Money In · ' + (rec.note || rec.date),
        destBank: rec.sourceBank
      });
    }catch(e){ console.warn('[moneyin] postToCF failed', e); }

    // For isExpense pockets (the car fund), record as txnType:'in' so the
    // existing isExpense math (balance = totalIn - totalOut) sees it.
    var deposit = {
      id: depositId,
      amount: amt,
      note: 'Money In · ' + (rec.note || rec.date),
      date: rec.date,
      cfId: cfId,
      fromBank: rec.sourceBank,
      moneyInId: miId
    };
    if(f.isExpense) deposit.txnType = 'in';
    f.deposits.push(deposit);

    rec.splits.push({ fundId: fundId, amount: amt, depositId: depositId, cfId: cfId });
  });

  saveFunds();

  // 4) Save the Money In record itself
  var all = loadMoneyInData();
  all.push(rec);
  saveMoneyInData(all);

  // 5) Bank baseline math (the doorway):
  //    Money lands (+amount), then immediately:
  //      - house leaves (-house)              [if house > 0]
  //      - each pocket split drains it (-amt) [matches confirmDeposit pattern]
  //    Because we enforce house + sum(splits) = amount, the bank ends at
  //    EXACTLY where it started. The doorway is honoured: nothing rests.
  try{
    if(typeof window._adjustBaselineForBank === 'function'){
      window._adjustBaselineForBank(rec.sourceBank, amount);          // +income
      if(house > 0) window._adjustBaselineForBank(rec.sourceBank, -house); // -house
      rec.splits.forEach(function(s){
        window._adjustBaselineForBank(rec.sourceBank, -s.amount);     // -pocket drain
      });
      // Net: +amount - house - sum(splits) = 0. Bank stays at prior balance.
    }
  }catch(e){ console.warn('[moneyin] baseline adjust failed', e); }

  // 6) Refresh UI
  closeMoneyIn();
  try{ renderFunds(); }catch(e){}
  try{ if(typeof renderCashFlow === 'function') renderCashFlow(); }catch(e){}
  try{ if(typeof renderBankBalanceCard === 'function') renderBankBalanceCard(); }catch(e){}
  try{ if(typeof odinRefreshIfOpen === 'function') odinRefreshIfOpen(); }catch(e){}

  // Toast
  if(typeof softDeleteToast === 'function'){
    softDeleteToast({
      message: 'Money In saved · ' + fmtR(amount) + (house>0 ? ' (R'+house+' house)' : ''),
      duration: 3500
    });
  }
}

// ── Helpers: post CF income/house bypassing the bank-baseline (we do it manually) ──
function _moneyInPostIncome(rec){
  var cfData = loadCFData();
  var mk = (rec.date||localDateStr(new Date())).slice(0,7);
  if(!cfData[mk]) cfData[mk] = { income:[], expenses:[] };
  var cfId = uid();
  cfData[mk].income.push({
    id: cfId,
    label: rec.note || 'Money In',
    amount: rec.amount,
    icon: '💰',
    auto: false,
    account: rec.sourceBank,
    destBank: rec.sourceBank,
    date: rec.date,
    moneyInId: rec.id,
    createdAt: rec.createdAt
  });
  saveCFData(cfData);
  return cfId;
}

function _moneyInPostHouse(rec){
  var cfData = loadCFData();
  var mk = (rec.date||localDateStr(new Date())).slice(0,7);
  if(!cfData[mk]) cfData[mk] = { income:[], expenses:[] };
  var cfId = uid();
  cfData[mk].expenses.push({
    id: cfId,
    label: 'House expenses',
    amount: rec.house,
    icon: '⌂',
    auto: false,
    account: rec.sourceBank,
    destBank: rec.sourceBank,
    date: rec.date,
    moneyInId: rec.id,
    sourceType: 'house_expense',
    createdAt: rec.createdAt
  });
  saveCFData(cfData);
  return cfId;
}

// ── Reverse a Money In record (internal helper used by edit + delete) ──
function _moneyInReverse(miId, opts){
  opts = opts || {};
  var all = loadMoneyInData();
  var rec = all.find(function(r){ return r.id === miId; });
  if(!rec) return false;

  // 1) Reverse each pocket split: remove deposit from fund + remove its CF
  //    mirror + restore the bank baseline (+amount each, undoing the drain).
  (rec.splits||[]).forEach(function(s){
    var f = funds.find(function(x){ return x.id === s.fundId; });
    if(f){
      f.deposits = (f.deposits||[]).filter(function(d){ return d.id !== s.depositId; });
    }
    if(s.cfId && typeof removeFromCF === 'function'){
      try{ removeFromCF(s.cfId); }catch(e){}
    }
    // Restore the bank baseline (undo the -s.amount drain from save)
    try{
      if(typeof window._adjustBaselineForBank === 'function'){
        window._adjustBaselineForBank(rec.sourceBank, s.amount);
      }
    }catch(e){}
  });

  // 2) Reverse the house expense (if any)
  if(rec.cfHouseId){
    var cfData = loadCFData();
    var mk = (rec.date||'').slice(0,7);
    if(cfData[mk] && cfData[mk].expenses){
      cfData[mk].expenses = cfData[mk].expenses.filter(function(e){ return e.id !== rec.cfHouseId; });
    }
    saveCFData(cfData);
    // Reverse the house bank baseline effect: -(-house) = +house back
    try{
      if(typeof window._adjustBaselineForBank === 'function'){
        window._adjustBaselineForBank(rec.sourceBank, rec.house);
      }
    }catch(e){}
  }

  // 3) Reverse the income line
  if(rec.cfIncomeId){
    var cfData2 = loadCFData();
    var mk2 = (rec.date||'').slice(0,7);
    if(cfData2[mk2] && cfData2[mk2].income){
      cfData2[mk2].income = cfData2[mk2].income.filter(function(e){ return e.id !== rec.cfIncomeId; });
    }
    saveCFData(cfData2);
    // Reverse the income bank baseline effect: -(+amount) = -amount
    try{
      if(typeof window._adjustBaselineForBank === 'function'){
        window._adjustBaselineForBank(rec.sourceBank, -rec.amount);
      }
    }catch(e){}
  }

  // 4) Remove the Money In record itself
  all = all.filter(function(r){ return r.id !== miId; });
  saveMoneyInData(all);
  saveFunds();

  if(!opts.silent){
    try{ renderFunds(); }catch(e){}
    try{ if(typeof renderCashFlow === 'function') renderCashFlow(); }catch(e){}
    try{ if(typeof renderBankBalanceCard === 'function') renderBankBalanceCard(); }catch(e){}
  }
  return true;
}

// ── Public delete (with confirm) ────────────────────────────────────
function deleteMoneyIn(miId){
  var all = loadMoneyInData();
  var rec = all.find(function(r){ return r.id === miId; });
  if(!rec) return;
  var label = (rec.note||'Money In') + ' · ' + fmtR(rec.amount) + ' · ' + rec.date;
  if(!confirm('Delete this Money In entry?\n\n'+label+'\n\nThis will also reverse the house expense and every pocket deposit linked to it. The bank will return to where it was before this entry.')) return;
  _moneyInReverse(miId);
  if(typeof softDeleteToast === 'function'){
    softDeleteToast({ message:'Money In reversed · '+fmtR(rec.amount), duration:3000 });
  }
}

// ── History list (for Money In tab / drawer) ────────────────────────
function renderMoneyInHistory(){
  var all = loadMoneyInData().slice().sort(function(a,b){
    return (b.date||'').localeCompare(a.date||'');
  });
  var c = document.getElementById('moneyInHistory');
  if(!c) return;
  if(!all.length){
    c.innerHTML = '<div style="text-align:center;color:#444;font-size:11px;padding:18px;">No Money In entries yet</div>';
    return;
  }
  c.innerHTML = '';
  all.forEach(function(rec){
    var row = document.createElement('div');
    row.style.cssText = 'background:#0d0d0d;border:1px solid #2a2a2a;border-radius:8px;padding:11px 13px;margin-bottom:7px;display:flex;align-items:center;gap:10px;';
    var info = document.createElement('div');
    info.style.cssText = 'flex:1;min-width:0;';
    var lbl = rec.note || 'Money In';
    var pocketsText = (rec.splits||[]).length + ' pocket' + ((rec.splits||[]).length===1?'':'s');
    info.innerHTML = '<div style="font-size:12.5px;color:#efefef;margin-bottom:3px;">'+lbl+'</div>'
                   + '<div style="font-size:10px;color:#555;letter-spacing:1px;">'+rec.date+' · '+rec.sourceBank+' · '+pocketsText+(rec.house>0 ? ' · house '+fmtR(rec.house) : '')+'</div>';
    var amt = document.createElement('div');
    amt.style.cssText = 'font-family:Syne,sans-serif;font-weight:700;font-size:15px;color:#c8f230;flex-shrink:0;';
    amt.textContent = fmtR(rec.amount);
    var actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:4px;flex-shrink:0;';
    var editBtn = document.createElement('button');
    editBtn.style.cssText = 'background:none;border:1px solid #2a2a2a;border-radius:5px;width:28px;height:28px;color:#888;font-size:12px;cursor:pointer;';
    editBtn.textContent = '✎';
    editBtn.onclick = function(){ openMoneyIn(rec.id); };
    var delBtn = document.createElement('button');
    delBtn.style.cssText = 'background:none;border:1px solid #2a2a2a;border-radius:5px;width:28px;height:28px;color:#555;font-size:12px;cursor:pointer;';
    delBtn.textContent = '✕';
    delBtn.onclick = function(){ deleteMoneyIn(rec.id); };
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    row.appendChild(info);
    row.appendChild(amt);
    row.appendChild(actions);
    c.appendChild(row);
  });
}

// Expose globals so onclick="" handlers in index.html can find them.
if(typeof window !== 'undefined'){
  window.openMoneyIn = openMoneyIn;
  window.closeMoneyIn = closeMoneyIn;
  window.saveMoneyIn = saveMoneyIn;
  window.deleteMoneyIn = deleteMoneyIn;
  window.renderMoneyInHistory = renderMoneyInHistory;
  window._miSetSourceBank = _miSetSourceBank;
  window._miOnHeaderEdit = _miOnHeaderEdit;
}
