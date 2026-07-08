// Instalments: plans, payments, snowball


var _instShowCleared = false;

function loadInst(){
  try{
    var d = JSON.parse(lsGet(INST_KEY)||'[]');
    // ── Step 8 v93 migration (one-time, lazy on every read) ──
    // Existing plans get planType + fundingPocketId fields:
    //   • monthToMonth ⇒ 'autoDebit'  (MTN-style, auto-debits a bank)
    //   • everything else ⇒ 'revolving' (TFG-style, you manually pay)
    //   • fundingPocketId starts null (user picks it on first payment or via Edit)
    var changed = false;
    d.forEach(function(p){
      if(p.planType === undefined){
        p.planType = p.monthToMonth ? 'autoDebit' : 'revolving';
        changed = true;
      }
      if(p.fundingPocketId === undefined){
        p.fundingPocketId = null;
        changed = true;
      }
      // v115: optional monthly service / admin fee on top of plan.amt (TFG-style)
      if(p.serviceFee === undefined){
        p.serviceFee = 0;
        changed = true;
      }
    });
    if(changed){
      try{ lsSet(INST_KEY, JSON.stringify(d)); }catch(e){}
    }
    return d;
  }catch(e){ return []; }
}
function saveInst(d){ lsSet(INST_KEY, JSON.stringify(d)); }

// v115 helper: monthly total = principal + service fee
function _planMonthlyTotal(plan){
  return Number(plan.amt||0) + Number(plan.serviceFee||0);
}

// ── Step 8 v93: pocket helpers (read-only — never write funds here) ──
function _instLoadFunds(){
  // savings.js owns a global `funds` array. loadFunds() hydrates it as a
  // side-effect (returns undefined). Read the global first; if that's not
  // ready, fall back to lsGet(SK) so we still work pre-DOMContentLoaded.
  try{
    if(typeof loadFunds === 'function'){ loadFunds(); }
  }catch(e){}
  if(typeof funds !== 'undefined' && Array.isArray(funds) && funds.length){
    return funds;
  }
  try{
    var raw = (typeof SK === 'string' && SK) ? lsGet(SK) : lsGet('yasin_funds_v16');
    var arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr : [];
  }catch(e){ return []; }
}
function _instGetPocket(pid){
  if(!pid) return null;
  return _instLoadFunds().find(function(p){ return p && p.id === pid; }) || null;
}
function _instPocketLabel(pid){
  var p = _instGetPocket(pid);
  return p ? p.name : '';
}
function _instPocketBalance(p){
  if(!p) return 0;
  if(typeof fundTotal === 'function'){
    try{ return fundTotal(p); }catch(e){}
  }
  // Fallback math mirroring fundTotal
  return (p.deposits||[]).reduce(function(s,d){
    var amt = Number(d.amount)||0;
    return s + (d.txnType === 'out' ? -amt : amt);
  }, 0);
}

// ── Step 8 v93: builder for the funding-pocket dropdown in the Edit Plan modal ──
function _instBuildFundingPocketDropdown(selectedId){
  var sel = document.getElementById('instFundingPocketId');
  if(!sel) return;
  var funds = _instLoadFunds();
  sel.innerHTML = '';
  var optBlank = document.createElement('option');
  optBlank.value = '';
  optBlank.textContent = '— No default (pick each time) —';
  sel.appendChild(optBlank);
  funds.forEach(function(p){
    if(!p || !p.id) return;
    var opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    sel.appendChild(opt);
  });
  sel.value = selectedId || '';
}

// ── (seedMTNContract removed — all plans must be added manually via + Add Plan) ──

// Provider colours
var INST_PROV_COLORS = {
  TFG:        { bg:'#1a0a2e', border:'#5a2a8a', text:'#c8a0f0', badge:'#a070d0' },
  PayFlex:    { bg:'#0a1a2e', border:'#2a4a8a', text:'#70a0f0', badge:'#5080d0' },
  PayJustNow: { bg:'#1a1a00', border:'#5a5a00', text:'#d0d070', badge:'#a0a040' },
  MTN:        { bg:'#1a1000', border:'#6a4a00', text:'#f2c830', badge:'#d4a800' },
  Other:      { bg:'#1a1a1a', border:'#3a3a3a', text:'#aaaaaa', badge:'#888888' }
};
var INST_PROV_ICON = { TFG:'🛍', PayFlex:'⚡', PayJustNow:'🕐', MTN:'📱', Other:'📄' };

// ── Instalment number options per provider ──
var INST_NUM_OPTS = {
  TFG:        [6],
  PayFlex:    [3, 4],
  PayJustNow: [3],
  MTN:        [12, 24, 36],
  Other:      [3, 6, 12, 24, 36]
};

function selectInstProvider(el){
  document.querySelectorAll('.inst-prov-opt').forEach(function(o){
    o.style.borderColor = 'var(--border)';
    o.style.color = 'var(--muted)';
    o.style.background = 'none';
  });
  el.style.borderColor = '#c8f230';
  el.style.color = '#c8f230';
  el.style.background = '#0d1a00';
  document.getElementById('instProvider').value = el.dataset.val;
  buildInstNumButtons(el.dataset.val);
  // Show debit day field for contract-style providers
  var showDebit = (el.dataset.val === 'MTN' || el.dataset.val === 'Other');
  document.getElementById('debitDayField').style.display = showDebit ? 'block' : 'none';
}

function buildInstNumButtons(prov){
  var grid = document.getElementById('instNumGrid');
  var opts = INST_NUM_OPTS[prov] || [3, 4, 6];
  grid.innerHTML = '';
  opts.forEach(function(n){
    var btn = document.createElement('div');
    btn.className = 'inst-num-opt';
    btn.dataset.val = n;
    btn.style.cssText = 'padding:10px 16px;border:1px solid var(--border);border-radius:6px;cursor:pointer;text-align:center;font-family:\'Syne\',sans-serif;font-size:18px;font-weight:700;color:var(--muted);transition:all .15s;';
    btn.textContent = n;
    btn.onclick = function(){ selectInstNum(btn); instAutoCalc(); };
    grid.appendChild(btn);
  });
  // Auto-select first
  if(grid.firstChild){ selectInstNum(grid.firstChild); }
}

function selectInstNum(el){
  document.querySelectorAll('.inst-num-opt').forEach(function(o){
    o.style.borderColor = 'var(--border)';
    o.style.color = 'var(--muted)';
    o.style.background = 'none';
  });
  el.style.borderColor = '#c8f230';
  el.style.color = '#c8f230';
  el.style.background = '#0d1a00';
  document.getElementById('instNum').value = el.dataset.val;
}

function instAutoCalc(){
  var total = parseFloat(document.getElementById('instTotal').value) || 0;
  var num   = parseInt(document.getElementById('instNum').value)   || 0;
  if(total > 0 && num > 0){
    document.getElementById('instAmt').value = (total / num).toFixed(2);
  }
}

// Build payment schedule dates
function buildInstSchedule(startDate, num, freq){
  var dates = [];
  var d = new Date(startDate + 'T00:00:00');
  for(var i = 0; i < num; i++){
    dates.push(localDateStr(d));
    if(freq === 'fortnightly'){
      d.setDate(d.getDate() + 14);
    } else {
      d.setMonth(d.getMonth() + 1);
    }
  }
  return dates;
}

function openInstModal(editId){
  document.getElementById('instEditId').value = editId || '';
  document.getElementById('instModalTitle').textContent = editId ? '✏️ Edit Instalment Plan' : '+ New Instalment Plan';
  document.getElementById('instSaveBtn').textContent = editId ? 'Save Changes' : 'Save Plan';

  // Reset provider selection
  document.querySelectorAll('.inst-prov-opt').forEach(function(o){
    o.style.borderColor = 'var(--border)';
    o.style.color = 'var(--muted)';
    o.style.background = 'none';
  });
  document.getElementById('instProvider').value = '';
  document.getElementById('instNumGrid').innerHTML = '';
  document.getElementById('instNum').value = '';

  if(editId){
    var plans = loadInst();
    var plan  = plans.find(function(p){ return p.id === editId; });
    if(!plan) return;

    // Pre-select provider
    var provEl = document.querySelector('.inst-prov-opt[data-val="'+plan.provider+'"]');
    if(provEl){ selectInstProvider(provEl); }
    buildInstNumButtons(plan.provider);
    // Pre-select num
    setTimeout(function(){
      var numEl = document.querySelector('.inst-num-opt[data-val="'+plan.num+'"]');
      if(numEl){ selectInstNum(numEl); }
    }, 50);

    document.getElementById('instDesc').value      = plan.desc || '';
    document.getElementById('instTotal').value     = plan.total || '';
    document.getElementById('instAmt').value       = plan.amt || '';
    document.getElementById('instFreq').value      = plan.freq || 'monthly';
    document.getElementById('instStartDate').value = (plan.dates && plan.dates[0]) || localDateStr(new Date());
    document.getElementById('instDebitDay').value  = plan.debitDay || '';
    document.getElementById('instServiceFee').value = (plan.serviceFee && plan.serviceFee > 0) ? plan.serviceFee : '';
    // Store M2M flag so confirmInstalment can preserve it
    document.getElementById('instEditId').dataset.m2m = plan.monthToMonth ? '1' : '';
    // Step 8 v93: load funding pocket
    _instBuildFundingPocketDropdown(plan.fundingPocketId || '');
  } else {
    document.getElementById('instDesc').value      = '';
    document.getElementById('instTotal').value     = '';
    document.getElementById('instAmt').value       = '';
    document.getElementById('instFreq').value      = 'monthly';
    document.getElementById('instStartDate').value = localDateStr(new Date());
    document.getElementById('instServiceFee').value = '';
    // Step 8 v93: reset funding pocket dropdown
    _instBuildFundingPocketDropdown('');
  }

  document.getElementById('instModal').classList.add('active');
  setTimeout(function(){ document.getElementById('instDesc').focus(); }, 100);
}

function confirmInstalment(){
  var prov  = document.getElementById('instProvider').value;
  var desc  = document.getElementById('instDesc').value.trim();
  var total = parseFloat(document.getElementById('instTotal').value);
  var num   = parseInt(document.getElementById('instNum').value);
  var amt   = parseFloat(document.getElementById('instAmt').value);
  var freq  = document.getElementById('instFreq').value;
  var start = document.getElementById('instStartDate').value;
  var editId= document.getElementById('instEditId').value;
  var debitDay = parseInt(document.getElementById('instDebitDay').value) || null;

  if(!prov)  { alert('Please select a provider.'); return; }
  if(!desc)  { alert('Please enter a description.'); return; }
  var isEditingM2M = document.getElementById('instEditId').dataset.m2m === '1';
  var isM2MProvider = (prov === 'MTN' || prov === 'Other') && !num && !total;
  // For M2M plans: total and num can be blank
  if(!isEditingM2M && !total || (!isEditingM2M && total <= 0)){ alert('Please enter the total amount.'); return; }
  if(!isEditingM2M && !num)   { alert('Please select number of instalments.'); return; }
  if(!start) { alert('Please select the first payment date.'); return; }
  if(!amt || amt <= 0) amt = (total && num) ? total / num : 0;
  if(!amt || amt <= 0) { alert('Please enter the instalment amount (R).'); return; }

  var plans = loadInst();
  var dates = (num && start) ? buildInstSchedule(start, num, freq) : [];
  // Step 8 v93: read funding pocket from modal
  var fundingPocketId = (document.getElementById('instFundingPocketId')||{}).value || null;
  // v115: read optional service fee
  var serviceFee = parseFloat(document.getElementById('instServiceFee').value) || 0;
  if(serviceFee < 0) serviceFee = 0;

  if(editId){
    var idx = plans.findIndex(function(p){ return p.id === editId; });
    if(idx > -1){
      // Preserve existing payments and M2M flag
      var oldPlan = plans[idx];
      plans[idx] = {
        id: editId,
        provider: prov,
        desc: desc,
        total: total || null,
        num: num || null,
        amt: amt,
        freq: freq,
        debitDay: debitDay || oldPlan.debitDay || null,
        monthToMonth: oldPlan.monthToMonth || false,
        planType: oldPlan.planType || (oldPlan.monthToMonth ? 'autoDebit' : 'revolving'),
        fundingPocketId: fundingPocketId,
        serviceFee: serviceFee,
        dates: dates,
        paid: oldPlan.paid || []
      };
    }
  } else {
    plans.push({
      id: uid(),
      provider: prov,
      desc: desc,
      total: total,
      num: num,
      amt: amt,
      freq: freq,
      debitDay: debitDay,
      planType: 'revolving',
      fundingPocketId: fundingPocketId,
      serviceFee: serviceFee,
      dates: dates,
      paid: []   // array of { index, date, note, cfId, instalmentPayId, depositId, pocketId, amount }
    });
  }

  saveInst(plans);
  closeModal('instModal');
  renderInst();
}

function deleteInstPlan(id){
  var plans = loadInst();
  var plan = plans.find(function(p){ return p.id === id; });
  if(!plan) return;
  
  // ── HARD-BLOCK GUARD: Cannot delete plan with paid entries ────────────
  // If payments have been made against this plan, they exist as CF rows +
  // pocket deposits linked via cfId/depositId. Deleting the plan orphans them
  // with no parent. The user must delete each payment first to cascade cleanup.
  var hasPaid = plan.paid && plan.paid.length > 0;
  if(hasPaid){
    var _body = '🚫 Cannot remove this plan — ' + plan.paid.length + ' payment(s) already made.\n\n'
              + 'The payments remain in your Cash Flow & pockets.\n'
              + 'Delete each payment first, then the plan will be removable.';
    if(typeof mihbConfirm === 'function'){
      mihbConfirm({
        title: '🚫 Plan has payments',
        body: _body,
        primaryBtn: 'Got it',
        onConfirm: function(){}
      });
    } else {
      alert(_body);
    }
    return;
  }
  
  // Safe to delete — no payments exist
  var filtered = plans.filter(function(p){ return p.id !== id; });
  saveInst(filtered);
  renderInst();
}

function openInstPayModal(planId, idx){
  var plans = loadInst();
  var plan  = plans.find(function(p){ return p.id === planId; });
  if(!plan) return;
  document.getElementById('instPayPlanId').value = planId;
  document.getElementById('instPayIndex').value  = idx;
  document.getElementById('instPayDate').value   = localDateStr(new Date());
  document.getElementById('instPayNote').value   = '';

  // Build the info banner (plan + amount + scheduled date)
  var _fee = Number(plan.serviceFee||0);
  var _amtHtml = _fee > 0
    ? '<span style="color:#f2a830;">'+fmtR(_planMonthlyTotal(plan))+'</span> &nbsp;<span style="color:var(--muted);font-size:11px;">(R'+plan.amt+' + R'+_fee+' fee)</span>'
    : '<span style="color:#f2a830;">'+fmtR(plan.amt)+'</span>';
  document.getElementById('instPayInfo').innerHTML =
    '<strong style="color:#c8f230;">'+plan.desc+'</strong><br>'
    +'Payment '+(idx+1)+' of '+plan.num+' &nbsp;·&nbsp; '+_amtHtml+'<br>'
    +'Scheduled: '+formatDisplayDate(plan.dates[idx]);

  // Populate pocket picker (default = plan.fundingPocketId)
  _instPopulatePocketPicker(plan);

  document.getElementById('instPayModal').classList.add('active');
}

// ── Step 8 v93: populate the pocket dropdown on the pay modal ──
function _instPopulatePocketPicker(plan){
  var sel = document.getElementById('instPayPocketId');
  if(!sel) return;
  var funds = _instLoadFunds();
  sel.innerHTML = '';

  // First option = blank prompt (forces a choice if no default)
  var optBlank = document.createElement('option');
  optBlank.value = '';
  optBlank.textContent = '— Pick a pocket —';
  sel.appendChild(optBlank);

  funds.forEach(function(p){
    if(!p || !p.id) return;
    var bal = _instPocketBalance(p);
    var opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name + '  ·  ' + fmtR(bal);
    sel.appendChild(opt);
  });

  // Default to plan's funding pocket if set
  if(plan && plan.fundingPocketId){
    sel.value = plan.fundingPocketId;
  } else {
    sel.value = '';
  }

  // Hint line under picker
  var hint = document.getElementById('instPayPocketHint');
  if(hint){
    if(plan && plan.fundingPocketId){
      var pname = _instPocketLabel(plan.fundingPocketId) || 'this pocket';
      hint.innerHTML = '<span style="color:#5fe0a0;">✓ Default = '+pname+'</span> · change for this payment only, or set a new default in Edit Plan';
      hint.style.color = '#5fe0a0';
    } else {
      hint.innerHTML = 'Pick the pocket this payment comes from. We\'ll remember it as the default for this plan next time.';
      hint.style.color = '#888';
    }
  }
}

function confirmInstPay(){
  var planId   = document.getElementById('instPayPlanId').value;
  var idx      = parseInt(document.getElementById('instPayIndex').value);
  var date     = document.getElementById('instPayDate').value || localDateStr(new Date());
  var note     = document.getElementById('instPayNote').value.trim();
  var pocketId = (document.getElementById('instPayPocketId')||{}).value || '';

  if(!pocketId){
    alert('Please pick the pocket this payment comes from.');
    return;
  }

  var plans = loadInst();
  var plan  = plans.find(function(p){ return p.id === planId; });
  if(!plan) return;

  // Hydrate the global funds array and look up the pocket *inside* it so
  // mutations land on the real object that saveFunds() will write.
  try{ if(typeof loadFunds === 'function') loadFunds(); }catch(e){}
  var pocket = (typeof funds !== 'undefined' && Array.isArray(funds))
    ? funds.find(function(p){ return p && p.id === pocketId; })
    : null;
  if(!pocket){ alert('Pocket not found. Please pick another.'); return; }

  if(!plan.paid) plan.paid = [];

  // v115: total = principal + optional service fee
  var monthlyTotal = _planMonthlyTotal(plan);
  var fee = Number(plan.serviceFee||0);
  var feeBreakdown = (fee > 0) ? ' (R'+plan.amt+' + R'+fee+' fee)' : '';

  // ── v117: HARD-BLOCK on pocket short (mirrors v109 spend hard-block) ──
  try{
    var bal = _instPocketBalance(pocket);
    if(bal < monthlyTotal){
      alert('🔒 '+pocket.name+' only has '+fmtR(bal)+' — payment is '+fmtR(monthlyTotal)+feeBreakdown+' (short by '+fmtR(monthlyTotal - bal)+').\n\nFund the pocket first (Money In or 🔄 Move from another pocket), then try again.');
      return;
    }
  }catch(e){}

  // ── Stamp this payment with a stable id ──
  var instPayId = uid();
  var depositId = uid();

  // 1) Pocket deposit (out) — mirrors the spend.js pattern, source of truth
  var payLabel = plan.desc + (idx === -1 ? ' (monthly)' : ' - payment '+(idx+1));
  var deposit = {
    id: depositId,
    txnType: 'out',
    amount: monthlyTotal,
    date: date,
    note: '🛍 ' + payLabel + feeBreakdown + (note ? ' · ' + note : ''),
    cfPosted: true,
    instalmentPayId: instPayId,
    planId: planId
  };
  pocket.deposits = pocket.deposits || [];
  pocket.deposits.push(deposit);
  // saveFunds() takes no args — it writes the global funds array
  try{
    if(typeof saveFunds === 'function'){ saveFunds(); }
    else { lsSet(SK, JSON.stringify(funds)); }
  }catch(e){ console.warn('[inst] saveFunds failed', e); }

  // 2) Cash Flow row — tagged to the pocket (account = pocket name) so the
  //    CF renderer shows the purple "🛍 [Pocket]" badge.
  //    sourceType:'instalment_pay' is recognised as a pocket-row by settings.js.
  var cfId = null;
  try{
    cfId = postToCF({
      label: payLabel + feeBreakdown,
      amount: monthlyTotal,
      date: date,
      type: 'expense',
      account: pocket.name,
      sourceType: 'instalment_pay',
      sourceId: planId,
      note: 'Instalment'+feeBreakdown+' · from ' + pocket.name + (note ? ' · ' + note : ''),
      instalmentPayId: instPayId,
      planId: planId,
      destPocketId: pocketId
    });
  }catch(e){ console.warn('[inst] postToCF failed', e); }

  // 3) Mark the instalment month paid + remember the new default pocket
  var paidRec = {
    index: (idx === -1)
      ? (plan.paid.length > 0 ? Math.max.apply(null, plan.paid.map(function(x){ return x.index; })) + 1 : 0)
      : idx,
    date: date,
    note: note,
    cfId: cfId,
    instalmentPayId: instPayId,
    depositId: depositId,
    pocketId: pocketId,
    amount: monthlyTotal,
    feeCharged: fee   // v115: capture fee snapshot at time of payment
  };
  if(idx !== -1){
    plan.paid = plan.paid.filter(function(x){ return x.index !== idx; });
  }
  plan.paid.push(paidRec);

  // Remember pocket as default for next time
  plan.fundingPocketId = pocketId;

  saveInst(plans);

  // 4) Refresh
  closeModal('instPayModal');
  try{ renderInst(); }catch(e){}
  try{ if(typeof renderFunds === 'function') renderFunds(); }catch(e){}
  try{ if(typeof renderCashFlow === 'function') renderCashFlow(); }catch(e){}
  try{ if(typeof renderBankBalanceCard === 'function') renderBankBalanceCard(); }catch(e){}
  try{ if(typeof odinRefreshIfOpen === 'function') odinRefreshIfOpen(); }catch(e){}

  if(typeof softDeleteToast === 'function'){
    softDeleteToast({ message: 'Paid · '+fmtR(monthlyTotal)+' from '+pocket.name, duration:2500 });
  }
}

function unmarkInstPay(planId, idx){
  _instalmentPayReverse(planId, idx, { silent: false });
}

// ── Step 8 v93: atomic reverse of an instalment payment ──
// Used by:  ① Mark-Unpaid (Undo) button on the plan card
//           ② Deposit-side hard-block in savings.js (delete deposit ✕)
//           ③ CF-side hard-block in cashflow.js (delete CF row ✕ / edit ✕)
// All three call here. Always reverses the pocket deposit, the CF row,
// and the paid entry as a single unit. Idempotent against partial state.
function _instalmentPayReverse(planId, idx, opts){
  opts = opts || {};
  var plans = loadInst();
  var plan  = plans.find(function(p){ return p.id === planId; });
  if(!plan) return false;
  var payEntry = (plan.paid||[]).find(function(x){ return x.index === idx; });
  if(!payEntry) return false;

  // v116: if this is a settle anchor, gather ALL sibling settle markers (same settleId)
  // so we can wipe them together. If it's a non-anchor settle marker, find the anchor first
  // so the cascade still works from any entry point.
  var settleId = payEntry.settleId || null;
  var anchorEntry = payEntry;
  var siblings = [];
  if(settleId){
    var settleSiblings = (plan.paid||[]).filter(function(x){ return x.settleId === settleId; });
    anchorEntry = settleSiblings.find(function(x){ return x.isSettleAnchor; }) || payEntry;
    siblings = settleSiblings;
  }

  // 1) Remove the CF row (anchor only — non-anchors don't have cfId)
  try{
    if(anchorEntry.cfId && typeof removeFromCF === 'function'){
      removeFromCF(anchorEntry.cfId);
    }
  }catch(e){ console.warn('[instReverse] removeFromCF failed', e); }

  // 2) Remove the pocket deposit (anchor only — non-anchors don't have depositId)
  try{
    if(anchorEntry.depositId && anchorEntry.pocketId){
      try{ if(typeof loadFunds === 'function') loadFunds(); }catch(e){}
      if(typeof funds !== 'undefined' && Array.isArray(funds)){
        var pk = funds.find(function(f){ return f && f.id === anchorEntry.pocketId; });
        if(pk && Array.isArray(pk.deposits)){
          pk.deposits = pk.deposits.filter(function(d){ return d.id !== anchorEntry.depositId; });
          try{
            if(typeof saveFunds === 'function'){ saveFunds(); }
            else { lsSet(SK, JSON.stringify(funds)); }
          }catch(e){}
        }
      }
    }
  }catch(e){ console.warn('[instReverse] pocket deposit removal failed', e); }

  // 3) Remove the paid entry (or ALL sibling settle markers when this was a settle)
  if(settleId){
    plan.paid = (plan.paid||[]).filter(function(x){ return x.settleId !== settleId; });
  } else {
    plan.paid = (plan.paid||[]).filter(function(x){ return x.index !== idx; });
  }
  saveInst(plans);

  // 4) Refresh UI (skip when silent — caller handles it)
  if(!opts.silent){
    try{ renderInst(); }catch(e){}
    try{ if(typeof renderFunds === 'function') renderFunds(); }catch(e){}
    try{ if(typeof renderCashFlow === 'function') renderCashFlow(); }catch(e){}
    try{ if(typeof renderBankBalanceCard === 'function') renderBankBalanceCard(); }catch(e){}
    if(typeof softDeleteToast === 'function'){
      var amt = anchorEntry.amount || plan.amt;
      var pkName = _instPocketLabel(anchorEntry.pocketId) || 'the pocket';
      var msg = settleId
        ? 'Reversed settlement · '+fmtR(amt)+' back to '+pkName+' · '+siblings.length+' payment'+(siblings.length!==1?'s':'')+' unmarked'
        : 'Reversed · '+fmtR(amt)+' back to '+pkName;
      softDeleteToast({ message: msg, duration: 2800 });
    }
  }
  return true;
}

// v116 ── Settle in Full action (for revolving plans) ─────────────────
function openInstSettleModal(planId){
  var plans = loadInst();
  var plan  = plans.find(function(p){ return p.id === planId; });
  if(!plan) return;
  if(plan.monthToMonth){ alert('Settle in Full is for fixed-schedule (revolving) plans only — month-to-month plans don\'t have a closing balance.'); return; }

  var paidIdxs = (plan.paid||[]).map(function(x){ return x.index; });
  var unpaidIdxs = [];
  for(var i = 0; i < (plan.num||0); i++){
    if(paidIdxs.indexOf(i) < 0) unpaidIdxs.push(i);
  }
  if(unpaidIdxs.length === 0){ alert('All payments already marked paid — nothing to settle.'); return; }

  // Build info banner — show what's outstanding (principal × remaining + fee × remaining)
  var perPayment = _planMonthlyTotal(plan);
  var outstanding = unpaidIdxs.length * perPayment;
  var feeNote = (plan.serviceFee && plan.serviceFee > 0)
    ? ' (R'+plan.amt+' principal + R'+plan.serviceFee+' fee × '+unpaidIdxs.length+' remaining)'
    : ' (R'+plan.amt+' × '+unpaidIdxs.length+' remaining)';
  document.getElementById('instSettleInfo').innerHTML =
    '<strong style="color:#c8f230;">'+plan.desc+'</strong><br>'
    +'<span style="color:var(--muted);">Scheduled outstanding:</span> <span style="color:#f2a830;">'+fmtR(outstanding)+'</span>'+feeNote+'<br>'
    +'<span style="color:var(--muted);">Marking as settled:</span> '+unpaidIdxs.length+' payment'+(unpaidIdxs.length!==1?'s':'')+' (#'+(unpaidIdxs[0]+1)+'–'+(unpaidIdxs[unpaidIdxs.length-1]+1)+')';

  // Prefill closing balance with scheduled outstanding (user usually overrides with actual)
  document.getElementById('instSettleAmt').value = outstanding;
  document.getElementById('instSettleHint').textContent = 'Real closing balance is often less than scheduled (credits, settlement discounts). Type the actual amount you paid.';
  document.getElementById('instSettleDate').value = localDateStr(new Date());
  document.getElementById('instSettleNote').value = '';
  document.getElementById('instSettlePlanId').value = planId;

  // Reuse the pay pocket picker logic but target settle dropdown
  _instPopulateSettlePocketPicker(plan);
  document.getElementById('instSettleModal').classList.add('active');
}

function _instPopulateSettlePocketPicker(plan){
  var sel = document.getElementById('instSettlePocketId');
  if(!sel) return;
  var funds = _instLoadFunds();
  sel.innerHTML = '';
  var optBlank = document.createElement('option');
  optBlank.value = '';
  optBlank.textContent = '— Pick a pocket —';
  sel.appendChild(optBlank);
  funds.forEach(function(p){
    if(!p || !p.id) return;
    var bal = _instPocketBalance(p);
    var opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name + '  ·  ' + fmtR(bal);
    sel.appendChild(opt);
  });
  if(plan && plan.fundingPocketId){
    sel.value = plan.fundingPocketId;
  } else {
    sel.value = '';
  }
}

function confirmInstSettle(){
  var planId  = document.getElementById('instSettlePlanId').value;
  var amount  = parseFloat(document.getElementById('instSettleAmt').value);
  var pocketId = document.getElementById('instSettlePocketId').value;
  var date    = document.getElementById('instSettleDate').value || localDateStr(new Date());
  var note    = document.getElementById('instSettleNote').value.trim();

  if(!planId){ alert('Plan not found — close and reopen the modal.'); return; }
  if(!amount || amount <= 0){ alert('Please enter the actual closing balance amount.'); return; }
  if(!pocketId){ alert('Please pick a pocket.'); return; }

  var plans = loadInst();
  var plan  = plans.find(function(p){ return p.id === planId; });
  if(!plan) return;

  // Find unpaid indexes
  var paidIdxs = (plan.paid||[]).map(function(x){ return x.index; });
  var unpaidIdxs = [];
  for(var i = 0; i < (plan.num||0); i++){
    if(paidIdxs.indexOf(i) < 0) unpaidIdxs.push(i);
  }
  if(unpaidIdxs.length === 0){ alert('Nothing left to settle.'); return; }

  // Locate the pocket
  try{ if(typeof loadFunds === 'function') loadFunds(); }catch(e){}
  var pocket = (typeof funds !== 'undefined' && Array.isArray(funds))
    ? funds.find(function(f){ return f && f.id === pocketId; })
    : null;
  if(!pocket){ alert('Pocket not found.'); return; }

  // v117: HARD-BLOCK on pocket short (mirrors v109 spend hard-block, never lets pocket go negative)
  try{
    var bal = _instPocketBalance(pocket);
    if(bal < amount){
      alert('🔒 '+pocket.name+' only has '+fmtR(bal)+' — settlement is '+fmtR(amount)+' (short by '+fmtR(amount - bal)+').\n\nFund the pocket first (Money In or 🔄 Move from another pocket), then try again.');
      return;
    }
  }catch(e){}

  // ── Generate IDs ──
  var settleId    = uid();
  var anchorInstPayId = uid();
  var depositId   = uid();
  var settleLabel = plan.desc + ' — Settle in Full ('+unpaidIdxs.length+' payment'+(unpaidIdxs.length!==1?'s':'')+')';

  // 1) ONE pocket deposit for the actual amount
  var deposit = {
    id: depositId,
    txnType: 'out',
    amount: amount,
    date: date,
    note: '🎯 ' + settleLabel + (note ? ' · ' + note : ''),
    cfPosted: true,
    instalmentPayId: anchorInstPayId,
    planId: planId,
    settleId: settleId
  };
  pocket.deposits = pocket.deposits || [];
  pocket.deposits.push(deposit);
  try{
    if(typeof saveFunds === 'function'){ saveFunds(); }
    else { lsSet(SK, JSON.stringify(funds)); }
  }catch(e){ console.warn('[settle] saveFunds failed', e); }

  // 2) ONE CF row for the actual amount
  var cfId = null;
  try{
    cfId = postToCF({
      label: settleLabel,
      amount: amount,
      date: date,
      type: 'expense',
      account: pocket.name,
      sourceType: 'instalment_pay',
      sourceId: planId,
      note: '🎯 Settled in full · '+unpaidIdxs.length+' payment'+(unpaidIdxs.length!==1?'s':'')+' closed · from ' + pocket.name + (note ? ' · ' + note : ''),
      instalmentPayId: anchorInstPayId,
      planId: planId,
      destPocketId: pocketId,
      settleId: settleId
    });
  }catch(e){ console.warn('[settle] postToCF failed', e); }

  // 3) Mark every unpaid slot as settled — first is the anchor with all the money IDs,
  //    rest are placeholders (amount:0) that link back via settleId.
  if(!plan.paid) plan.paid = [];
  unpaidIdxs.forEach(function(idx, n){
    if(n === 0){
      plan.paid.push({
        index: idx,
        date: date,
        note: note,
        cfId: cfId,
        instalmentPayId: anchorInstPayId,
        depositId: depositId,
        pocketId: pocketId,
        amount: amount,
        settleId: settleId,
        isSettleAnchor: true
      });
    } else {
      plan.paid.push({
        index: idx,
        date: date,
        note: '',
        cfId: null,
        instalmentPayId: null,
        depositId: null,
        pocketId: pocketId,
        amount: 0,
        settleId: settleId,
        isSettleAnchor: false
      });
    }
  });

  // Remember this pocket as the default for future payments on this plan
  plan.fundingPocketId = pocketId;
  saveInst(plans);

  closeModal('instSettleModal');
  try{ renderInst(); }catch(e){}
  try{ if(typeof renderFunds === 'function') renderFunds(); }catch(e){}
  try{ if(typeof renderCashFlow === 'function') renderCashFlow(); }catch(e){}
  try{ if(typeof renderBankBalanceCard === 'function') renderBankBalanceCard(); }catch(e){}

  if(typeof softDeleteToast === 'function'){
    softDeleteToast({ message: '🎯 Settled · '+fmtR(amount)+' from '+pocket.name+' · '+unpaidIdxs.length+' payment'+(unpaidIdxs.length!==1?'s':'')+' closed', duration:3000 });
  }
}

// ── Snowball: skip M2M plans, focus on fixed-term ones ──
function getSnowballOrder(plans){
  var active = plans.filter(function(p){
    return !p.monthToMonth && p.num && (p.paid||[]).length < p.num;
  });
  return active.slice().sort(function(a, b){
    var remA = (a.num - (a.paid||[]).length) * a.amt;
    var remB = (b.num - (b.paid||[]).length) * b.amt;
    return remA - remB;
  });
}

function renderInst(){
  var plans   = loadInst();
  var now     = new Date();
  var thisMonth = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');

  var active  = [];
  var cleared = [];

  plans.forEach(function(p){
    var paidIdxs = (p.paid||[]).map(function(x){ return x.index; });
    var done = !p.monthToMonth && p.num && paidIdxs.length >= p.num;
    if(done) cleared.push(p);
    else     active.push(p);
  });

  // Summary
  var totalDueMonth = 0;
  var totalRem      = 0;
  active.forEach(function(p){
    var paidIdxs = (p.paid||[]).map(function(x){ return x.index; });
    var monthlyTotal = _planMonthlyTotal(p); // includes service fee
    
    if(p.monthToMonth){
      // Month-to-month plans: due every month on debitDay
      totalRem += monthlyTotal;
      if(p.debitDay) totalDueMonth += monthlyTotal;
    } else {
      // Fixed-term plans: iterate through scheduled dates
      p.dates.forEach(function(ds, i){
        if(paidIdxs.indexOf(i) > -1) return;
        totalRem += p.amt;
        if(ds.slice(0,7) === thisMonth) totalDueMonth += p.amt;
      });
    }
  });

  document.getElementById('instActiveCnt').textContent = active.length;
  document.getElementById('instDueMonth').textContent  = fmtR(totalDueMonth);
  document.getElementById('instTotalRem').textContent  = fmtR(totalRem);

  // Snowball banner
  var banner = document.getElementById('instSnowballBanner');
  var sbOrder = getSnowballOrder(plans);
  if(sbOrder.length >= 2){
    banner.style.display = 'block';
    var first = sbOrder[0];
    var remPays = first.num - (first.paid||[]).length;
    document.getElementById('instSnowballMsg').innerHTML =
      'Focus on clearing <strong style="color:#c8f230;">'+first.desc+'</strong> ('+INST_PROV_ICON[first.provider]+' '+first.provider+') first — only <strong style="color:#f2a830;">'+remPays+' payment'+(remPays!==1?'s':'')+' left</strong> ('+fmtR(remPays*first.amt)+'). Finish it, then roll that money into your next plan.';
  } else {
    banner.style.display = 'none';
  }

  // Cards
  var container = document.getElementById('instCards');
  container.innerHTML = '';

  if(active.length === 0){
    container.innerHTML = '<div style="padding:48px 16px;text-align:center;color:var(--muted);font-size:13px;background:var(--surface);border:1px dashed var(--border);border-radius:10px;">No active instalment plans — tap <strong style="color:#c8f230;">+ Add Plan</strong> to get started</div>';
  } else {
    // Separate M2M (ongoing) plans from fixed-term plans
    var m2mPlans = active.filter(function(p){ return !!p.monthToMonth; });
    var fixedPlans = getSnowballOrder(active); // excludes M2M, sorted smallest-remaining-first
    // Render fixed-term plans first (snowball order), then M2M ongoing plans
    fixedPlans.forEach(function(plan, cardIdx){
      container.appendChild(buildInstCard(plan, cardIdx === 0 && fixedPlans.length > 1));
    });
    m2mPlans.forEach(function(plan){
      container.appendChild(buildInstCard(plan, false));
    });
  }

  // Cleared section
  var clearedWrap = document.getElementById('instClearedWrap');
  var clearedList = document.getElementById('instClearedList');
  if(cleared.length > 0){
    clearedWrap.style.display = 'block';
    document.getElementById('instClearedBtn').textContent = _instShowCleared
      ? 'Hide Cleared Plans ('+cleared.length+')'
      : 'Show Cleared Plans ('+cleared.length+')';
    if(_instShowCleared){
      clearedList.style.display = 'block';
      clearedList.innerHTML = '';
      cleared.forEach(function(plan){ clearedList.appendChild(buildInstCard(plan, false, true)); });
    } else {
      clearedList.style.display = 'none';
    }
  } else {
    clearedWrap.style.display = 'none';
  }
}

function buildInstCard(plan, isTarget, isCleared){
  var c = INST_PROV_COLORS[plan.provider] || INST_PROV_COLORS.TFG;
  var paidIdxs = (plan.paid||[]).map(function(x){ return x.index; });
  var paidCount = paidIdxs.length;
  var isM2M = !!plan.monthToMonth;
  var pct = isM2M ? 0 : Math.round((paidCount / plan.num) * 100);
  var remAmt = isM2M ? null : (plan.num - paidCount) * _planMonthlyTotal(plan);
  // v115: sum actual paid amounts (each paid record has its own .amount including any fee at time of payment)
  var totalPaid = (plan.paid||[]).reduce(function(s,p){ return s + (Number(p.amount)||Number(plan.amt)||0); }, 0);

  var card = document.createElement('div');
  card.style.cssText = 'background:var(--surface);border:1px solid '+(isCleared?'#2a2a2a':c.border)+';border-radius:10px;overflow:hidden;margin-bottom:14px;'+(isTarget?'box-shadow:0 0 0 2px #c8f23044;':'');

  // Header
  var _feeHint = (plan.serviceFee && plan.serviceFee > 0) ? ' + R'+plan.serviceFee+' fee' : '';
  var subLabel = isM2M
    ? 'Month to Month · R' + plan.amt + _feeHint + '/month · Debit day ' + (plan.debitDay || '—')
    : plan.freq.charAt(0).toUpperCase() + plan.freq.slice(1) + ' · ' + plan.num + ' instalments' + (_feeHint ? ' · '+_feeHint.substring(3) : '');

  var headerHtml =
    '<div style="background:'+c.bg+';padding:14px 16px;border-bottom:1px solid '+c.border+';display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">'
      +'<div>'
        +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">'
          +'<span style="font-size:9px;padding:2px 9px;border-radius:100px;background:'+c.border+';color:'+c.text+';letter-spacing:1.5px;text-transform:uppercase;">'+INST_PROV_ICON[plan.provider]+' '+plan.provider+'</span>'
          +(isM2M ? '<span style="font-size:9px;padding:2px 9px;border-radius:100px;background:#1a1000;color:#f2c830;border:1px solid #6a4a00;letter-spacing:1.5px;">∞ ONGOING</span>' : '')
          +(isTarget && !isM2M ? '<span style="font-size:9px;padding:2px 9px;border-radius:100px;background:#0d1a00;color:#c8f230;border:1px solid #3a5a00;letter-spacing:1.5px;">❄️ ATTACK FIRST</span>' : '')
          +(isCleared ? '<span style="font-size:9px;padding:2px 9px;border-radius:100px;background:#0d1a00;color:#c8f230;border:1px solid #3a5a00;letter-spacing:1.5px;">✓ CLEARED</span>' : '')
        +'</div>'
        +'<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:17px;color:var(--text);">'+plan.desc+'</div>'
        +'<div style="font-size:10px;color:var(--muted);margin-top:2px;letter-spacing:1px;">'+subLabel+'</div>'
      +'</div>'
      +'<div style="text-align:right;flex-shrink:0;">'
        +'<div style="font-size:9px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:2px;">'+(isM2M ? 'Total Paid' : isCleared ? 'Paid off' : 'Remaining')+'</div>'
        +'<div style="font-family:\'Syne\',sans-serif;font-weight:800;font-size:22px;color:'+(isM2M?'#f2c830':isCleared?'#c8f230':'#f2a830')+';">'+(isM2M ? fmtR(totalPaid) : isCleared ? fmtR(plan.total) : fmtR(remAmt))+'</div>'
      +'</div>'
    +'</div>';

  // Progress bar — skip for month-to-month
  var _payDisplay = (plan.serviceFee && plan.serviceFee > 0)
    ? fmtR(_planMonthlyTotal(plan)) + '/payment'
    : fmtR(plan.amt) + '/payment';
  var _m2mDebitStr = (plan.serviceFee && plan.serviceFee > 0)
    ? 'R'+plan.amt+' + R'+plan.serviceFee+' fee debited on the '+( plan.debitDay || '?')+'th'
    : 'R'+plan.amt+' debited on the '+( plan.debitDay || '?')+'th each month';
  var progHtml = isM2M
    ? '<div style="padding:10px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;font-size:10px;color:var(--muted);letter-spacing:1px;">'
        +'<span>'+paidCount+' payment'+(paidCount!==1?'s':'')+' logged</span>'
        +'<span>'+_m2mDebitStr+'</span>'
      +'</div>'
    : '<div style="padding:12px 16px;border-bottom:1px solid var(--border);">'
        +'<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-bottom:6px;letter-spacing:1px;">'
          +'<span>'+paidCount+' of '+plan.num+' paid</span>'
          +'<span>'+pct+'%</span>'
          +'<span>'+_payDisplay+'</span>'
        +'</div>'
        +'<div style="height:6px;background:#1a1a1a;border-radius:3px;overflow:hidden;">'
        +'<div style="height:100%;width:'+pct+'%;background:'+(isCleared?'#c8f230':c.badge)+';border-radius:3px;transition:width .5s cubic-bezier(.16,1,.3,1);box-shadow:0 0 8px '+(isCleared?'#c8f23044':c.badge+'44')+';"></div>'
      +'</div>'
    +'</div>';

  // Payment rows
  var rowsHtml = '<div style="padding:8px 16px 4px;">';
  var now2 = new Date(); now2.setHours(0,0,0,0);

  if(isM2M){
    // Month-to-month: show paid history + next due
    var nextDue = new Date(now2.getFullYear(), now2.getMonth(), plan.debitDay || 20);
    if(nextDue < now2) nextDue = new Date(now2.getFullYear(), now2.getMonth()+1, plan.debitDay || 20);
    var isToday2 = nextDue.getTime() === now2.getTime();
    rowsHtml += '<div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:8px;padding-top:4px;">Next debit</div>';
    rowsHtml += '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px;">'
      +'<span style="width:10px;height:10px;border-radius:50%;background:'+(isToday2?'#f2a830':'#333')+';display:inline-block;flex-shrink:0;"></span>'
      +'<div style="flex:1;"><span style="color:var(--muted);font-size:11px;">'+(isToday2?'Today!':nextDue.toLocaleDateString('en-ZA',{day:'2-digit',month:'short',year:'numeric'}))+'</span></div>'
      +'<span style="color:#f2c830;font-weight:700;">'+fmtR(_planMonthlyTotal(plan))+'</span>'
      +'<button onclick="openInstM2MPay(\''+plan.id+'\')" style="background:#0d1a00;border:1px solid #3a5a00;border-radius:4px;padding:3px 10px;color:#c8f230;font-family:\'DM Mono\',monospace;font-size:9px;letter-spacing:1px;cursor:pointer;">Mark Paid</button>'
    +'</div>';
    if(plan.paid && plan.paid.length > 0){
      rowsHtml += '<div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin:10px 0 6px;">Payment history</div>';
      var sortedPaid = plan.paid.slice().sort(function(a,b){ return b.date > a.date ? 1 : -1; });
      sortedPaid.slice(0,6).forEach(function(p){
        var _histAmt = p.amount || plan.amt;
        rowsHtml += '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;">'
          +'<span style="width:10px;height:10px;border-radius:50%;background:#c8f230;display:inline-block;flex-shrink:0;"></span>'
          +'<div style="flex:1;"><span style="color:var(--muted);font-size:10px;">'+p.date+'</span>'+(p.note?'<span style="color:var(--muted);font-size:10px;"> · '+p.note+'</span>':'')+'</div>'
          +'<span style="color:#c8f230;font-weight:700;">'+fmtR(_histAmt)+'</span>'
        +'</div>';
      });
    }
  } else {
    plan.dates.forEach(function(ds, i){
      var isPaid = paidIdxs.indexOf(i) > -1;
      var paidEntry = isPaid ? plan.paid.find(function(x){ return x.index === i; }) : null;
      var dDate = new Date(ds+'T00:00:00');
      var isOverdue = !isPaid && dDate < now2;
      var isToday   = !isPaid && dDate.getTime() === now2.getTime();

      var isSettled = isPaid && paidEntry && paidEntry.settleId;
      var statusDot = isPaid
        ? (isSettled
            ? '<span style="width:10px;height:10px;border-radius:50%;background:#c890ff;display:inline-block;flex-shrink:0;" title="Settled in full"></span>'
            : '<span style="width:10px;height:10px;border-radius:50%;background:#c8f230;display:inline-block;flex-shrink:0;"></span>')
        : (isOverdue
            ? '<span style="width:10px;height:10px;border-radius:50%;background:#f23060;display:inline-block;flex-shrink:0;"></span>'
            : (isToday
                ? '<span style="width:10px;height:10px;border-radius:50%;background:#f2a830;display:inline-block;flex-shrink:0;"></span>'
                : '<span style="width:10px;height:10px;border-radius:50%;border:2px solid #333;display:inline-block;flex-shrink:0;"></span>'));

      var label = isPaid
        ? (isSettled
            ? '<span style="color:#c890ff;">🎯 Settled in full</span>'+(paidEntry.date?' <span style="color:var(--muted);font-size:10px;">'+paidEntry.date+'</span>':'')+(paidEntry.note?' · <span style="color:var(--muted);font-size:10px;">'+paidEntry.note+'</span>':'')
            : '<span style="color:#c8f230;">✓ Paid</span>'+(paidEntry&&paidEntry.date?' <span style="color:var(--muted);font-size:10px;">'+paidEntry.date+'</span>':'')+(paidEntry&&paidEntry.note?' · <span style="color:var(--muted);font-size:10px;">'+paidEntry.note+'</span>':''))
        : (isOverdue ? '<span style="color:#f23060;">Overdue</span>' : (isToday ? '<span style="color:#f2a830;">Due today!</span>' : '<span style="color:var(--muted);">'+formatDisplayDate(ds)+'</span>'));

      var actionBtn = isPaid
        ? '<button onclick="unmarkInstPay(\''+plan.id+'\','+i+')" style="background:none;border:1px solid #2a2a2a;border-radius:4px;padding:3px 8px;color:var(--muted);font-family:\'DM Mono\',monospace;font-size:9px;letter-spacing:1px;cursor:pointer;transition:all .15s;" onmouseover="this.style.borderColor=\'#555\';this.style.color=\'#888\'" onmouseout="this.style.borderColor=\'#2a2a2a\';this.style.color=\'#444\'" title="'+(isSettled?'Reverse the whole settlement':'Unmark this payment')+'">Undo</button>'
        : '<button onclick="openInstPayModal(\''+plan.id+'\','+i+')" style="background:#0d1a00;border:1px solid #3a5a00;border-radius:4px;padding:3px 10px;color:#c8f230;font-family:\'DM Mono\',monospace;font-size:9px;letter-spacing:1px;cursor:pointer;transition:all .15s;" onmouseover="this.style.opacity=\'.8\'" onmouseout="this.style.opacity=\'1\'">Mark Paid</button>';

      // Display amount: anchor shows the real paid amount; non-anchor settle rows show a dash
      var _rowAmt;
      if(isSettled && paidEntry.isSettleAnchor){
        _rowAmt = paidEntry.amount;
      } else if(isSettled){
        _rowAmt = null; // non-anchor → display "—"
      } else if(isPaid){
        _rowAmt = paidEntry.amount || _planMonthlyTotal(plan);
      } else {
        _rowAmt = _planMonthlyTotal(plan);
      }
      var _rowAmtHtml = (_rowAmt === null)
        ? '<span style="color:var(--muted2);font-weight:400;font-size:13px;white-space:nowrap;" title="Covered by settlement above">—</span>'
        : '<span style="color:var(--text);font-weight:700;font-size:13px;white-space:nowrap;">'+fmtR(_rowAmt)+'</span>';

      rowsHtml +=
        '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px;">'
          +statusDot
          +'<span style="color:var(--muted);min-width:24px;font-size:10px;">'+(i+1)+'</span>'
          +'<div style="flex:1;">'
            +'<span style="color:var(--muted);font-size:10px;letter-spacing:0.5px;">'+formatDisplayDate(ds)+'</span>'
            +'<div style="margin-top:1px;">'+label+'</div>'
          +'</div>'
          +_rowAmtHtml
          +(!isCleared ? actionBtn : '')
        +'</div>';
    });
  }
  rowsHtml += '</div>';

  // Action buttons
  // v116: Settle in Full button — only for revolving plans with at least one unpaid scheduled payment
  var canSettle = !isCleared && !isM2M && plan.num && (paidIdxs.length < plan.num);
  var settleBtnHtml = canSettle
    ? '<button onclick="openInstSettleModal(\''+plan.id+'\')" style="background:#1a0d24;border:1px solid #4a2a6a;border-radius:6px;padding:7px 14px;color:#c890ff;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;" onmouseover="this.style.opacity=\'.8\'" onmouseout="this.style.opacity=\'1\'">🎯 Settle</button>'
    : '';

  var actionsHtml = !isCleared
    ? '<div style="display:flex;gap:8px;padding:10px 16px;border-top:1px solid var(--border);flex-wrap:wrap;">'
        +'<button onclick="openInstModal(\''+plan.id+'\')" style="background:#1a1a00;border:1px solid #3a3a00;border-radius:6px;padding:7px 14px;color:#888;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;" onmouseover="this.style.opacity=\'.8\'" onmouseout="this.style.opacity=\'1\'">✏️ Edit</button>'
        +settleBtnHtml
        +'<button onclick="deleteInstPlan(\''+plan.id+'\')" style="margin-left:auto;background:none;border:1px solid #2a1a1a;border-radius:6px;padding:7px 12px;color:var(--muted);font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;cursor:pointer;" onmouseover="this.style.borderColor=\'#c0392b\';this.style.color=\'#c0392b\'" onmouseout="this.style.borderColor=\'#2a1a1a\';this.style.color=\'#555\'">Remove</button>'
      +'</div>'
    : '<div style="display:flex;justify-content:flex-end;padding:10px 16px;border-top:1px solid var(--border);">'
        +'<button onclick="deleteInstPlan(\''+plan.id+'\')" style="background:none;border:1px solid #2a1a1a;border-radius:6px;padding:7px 12px;color:var(--muted);font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;cursor:pointer;" onmouseover="this.style.borderColor=\'#c0392b\';this.style.color=\'#c0392b\'" onmouseout="this.style.borderColor=\'#2a1a1a\';this.style.color=\'#555\'">Remove</button>'
      +'</div>';

  card.innerHTML = headerHtml + progHtml + rowsHtml + actionsHtml;
  return card;
}

function toggleInstCleared(){
  _instShowCleared = !_instShowCleared;
  renderInst();
}

function openInstM2MPay(planId){
  var plans = loadInst();
  var plan  = plans.find(function(p){ return p.id === planId; });
  if(!plan) return;
  document.getElementById('instPayPlanId').value = planId;
  document.getElementById('instPayIndex').value = -1; // -1 = M2M
  document.getElementById('instPayDate').value = localDateStr(new Date());
  document.getElementById('instPayNote').value = '';
  var _fee = Number(plan.serviceFee||0);
  var _amtStr = _fee > 0
    ? '<strong style="color:#f2c830;">'+fmtR(_planMonthlyTotal(plan))+'</strong> <span style="color:var(--muted);font-size:11px;">(R'+plan.amt+' + R'+_fee+' fee)</span>'
    : '<strong style="color:#f2c830;">'+fmtR(plan.amt)+'</strong>';
  document.getElementById('instPayInfo').innerHTML = 'Log this month\'s '+plan.provider+' debit of '+_amtStr+'.';
  _instPopulatePocketPicker(plan);
  document.getElementById('instPayModal').classList.add('active');
}

// ── Wire into switchTab ──
var _origSwitchTab = typeof switchTab === 'function' ? switchTab : null;
// Patch: renderInst when instalments tab is opened
document.addEventListener('DOMContentLoaded', function(){
  // nothing needed — switchTab handles it
});

/* ══════════════════════════════════ */

var ROUTINE_KEY = 'yasin_routine_v2';
