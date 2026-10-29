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
    return f.name && /^daily$/i.test(f.name.trim()) && !f._deleted;
  });
  if(existing) return existing;

  // Don't auto-create if the user already has their own spending pockets —
  // they may have renamed Daily to something else (e.g. "date night spenD").
  // Only auto-create if there are NO non-expense, non-deleted pockets at all.
  var hasOwnPockets = funds.some(function(f){
    return !f._deleted && !f.isExpense;
  });
  if(hasOwnPockets) return null;

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
  houseCash: 0,      // v150t: part of the house money paid from a pocket
  cashFundId: null,  // v150t: that pocket
  subsOn: true,      // v150t: add her subscriptions on top
  subsTouched: false,
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
    houseCash: 0,
    cashFundId: null,
    subsOn: true,
    subsTouched: false,
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
      _miState.house = (rec.houseTotal != null ? rec.houseTotal : rec.house) || 0;   // v150t
      _miState.houseCash = rec.houseCash ? (rec.houseCash.amount || 0) : 0;
      _miState.cashFundId = rec.houseCash ? rec.houseCash.fundId : null;
      _miState.subsOn = (rec.subs||[]).length > 0;
      _miState.subsTouched = true;
      (rec.splits||[]).forEach(function(s){ _miState.splits[s.fundId] = s.amount; });
    }
  }

  document.getElementById('miModalTitle').textContent = editingId ? '✏️ Edit Money In' : '↓ Money In';
  document.getElementById('miAmount').value = _miState.amount || '';
  document.getElementById('miNote').value = _miState.note;
  document.getElementById('miDate').value = _miState.date;
  document.getElementById('miHouse').value = _miState.house || '';
  _miEnsureHouseExtra();
  if(!_miState.cashFundId) _miState.cashFundId = _miDefaultCashPocket();
  var _cashInp = document.getElementById('miHouseCash');
  if(_cashInp) _cashInp.value = _miState.houseCash || '';
  var _infoBox = document.getElementById('miHouseInfo');
  if(_infoBox) _infoBox.style.display = 'none';
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
  try{ if(document.getElementById('miHouseSummary')) _miRenderHouseExtra(); }catch(e){}
}

// ── Read inputs back into state on every change ─────────────────────
function _miSyncInputs(){
  _miState.amount = parseFloat(document.getElementById('miAmount').value) || 0;
  _miState.note   = document.getElementById('miNote').value.trim();
  _miState.date   = document.getElementById('miDate').value || localDateStr(new Date());
  _miState.house  = parseFloat(document.getElementById('miHouse').value) || 0;
  var _c = document.getElementById('miHouseCash');
  if(_c) _miState.houseCash = Math.max(0, parseFloat(_c.value) || 0);
  var _p = document.getElementById('miCashPocket');
  if(_p && _p.value) _miState.cashFundId = _p.value;
}

// ── v150t: House money = house amount + optional cash part + her subscriptions ──
// Yasin gives his wife a monthly house amount on salary day. From Nov 2026 she
// also pays MTN and Claude out of it, so those are added ON TOP of the house
// amount he types. Part of the house money can be paid from a pocket (e.g. Cash
// wallet) instead of the bank.
//
//   House amount typed (H)           -> what she gets for the house
//   Part paid from a pocket (C)      -> a Spend from that pocket, linked here
//   Subscriptions (S, from the Plan) -> added on top, bank doorway
//   Off the top of the bank          =  (H - C) + S
//
// Stored on the record (old records have none of these and work as before):
//   house      = H - C      (the bank part; the meaning "house" always had)
//   houseTotal = H
//   houseCash  = { fundId, amount, depositId, cfId } or null
//   subs       = [ { id, label, amount, cfId } ]
// Every row this creates carries moneyInId, so the existing hard-block guards
// route any delete of a piece back to reversing the whole Money In.

var MI_SUB_DEFAULTS = [
  { id:'ws_mtn',    label:'MTN SuperFlex', amount:209,    day:28 },
  { id:'ws_claude', label:'Claude Pro',    amount:399.99, day:26 }
];

function _miR2(n){ return Math.round((Number(n)||0) * 100) / 100; }

function _miSubsConfig(){
  try {
    var plan = (typeof loadPlan === 'function') ? loadPlan() : null;
    var list = (plan && Array.isArray(plan.wifeSubs)) ? plan.wifeSubs : MI_SUB_DEFAULTS;
    return list.filter(function(s){ return s && String(s.label||'').trim() && Number(s.amount) > 0; });
  } catch(e){ return MI_SUB_DEFAULTS.slice(); }
}

// Another Money In in the same month that already added the subscriptions.
// v150u: per pay cycle (salary day → salary day); calendar month if the Plan helpers are missing.
function _miSubsAlreadyIn(entryDate, excludeId){
  var isSalary = (_miState.house > 0) || /salary/i.test(_miState.note||'');
  var cyc = (typeof planCycleFor === 'function')
    ? planCycleFor(entryDate, { excludeId:excludeId, startOverride: isSalary ? entryDate : null }) : null;
  var hit = loadMoneyInData().find(function(r){
    if(r.id === excludeId || !r.date || !(r.subs||[]).length) return false;
    return cyc ? planInCycle(r.date, cyc) : r.date.slice(0,7) === entryDate.slice(0,7);
  });
  return hit || null;
}

// Most recent earlier Money In that had house money (for the example text).
function _miLastHouseRec(excludeId){
  var list = loadMoneyInData().filter(function(r){
    return r.id !== excludeId && ((r.houseTotal != null ? r.houseTotal : r.house) > 0);
  }).sort(function(a,b){ return (b.date||'').localeCompare(a.date||''); });
  return list[0] || null;
}

function _miHouseTotalOf(r){ return r ? _miR2(r.houseTotal != null ? r.houseTotal : r.house) : 0; }

// What this entry takes off the top of the bank, worked out from the current state.
function _miOffTop(){
  var H = _miR2(_miState.house);
  var C = _miR2(_miState.houseCash);
  var subs = (H > 0 && _miState.subsOn) ? _miSubsConfig() : [];
  var subsTotal = _miR2(subs.reduce(function(s,x){ return s + Number(x.amount); }, 0));
  // v150u: the pocket part can cover the house AND her subscriptions (cap = house + subs).
  // It pays the house first; anything over the house pays the subscriptions, first one first.
  var cashOk = C <= H + subsTotal + 0.005;
  var c = cashOk ? C : 0;
  var houseFromPocket = _miR2(Math.min(c, H));
  var subsFromPocket = _miR2(c - houseFromPocket);
  var rem = subsFromPocket;
  var subsAlloc = subs.map(function(x){
    var amt = _miR2(x.amount);
    var fromPocket = _miR2(Math.min(amt, rem));
    rem = _miR2(rem - fromPocket);
    return { sub:x, amount:amt, pocket:fromPocket, bank:_miR2(amt - fromPocket) };
  });
  var subsBank = _miR2(subsAlloc.reduce(function(t,a){ return t + a.bank; }, 0));
  var houseBank = _miR2(Math.max(0, H - houseFromPocket));
  return {
    house: H, cash: c, cashTyped: C, cashOk: cashOk,
    houseFromPocket: houseFromPocket, subsFromPocket: subsFromPocket,
    houseBank: houseBank, subs: subs, subsAlloc: subsAlloc, subsTotal: subsTotal, subsBank: subsBank,
    offTop: _miR2(houseBank + subsBank),
    toHer: _miR2(H + subsTotal)
  };
}

// Pocket balance available for the cash part. When editing, the old cash part
// from the same pocket goes back first, so it counts as available.
function _miCashAvailable(fundId){
  var f = funds.find(function(x){ return x.id === fundId && !x._deleted; });
  if(!f) return null;
  var bal = fundTotal(f);
  if(_miState.editingId){
    var old = loadMoneyInData().find(function(r){ return r.id === _miState.editingId; });
    if(old && old.houseCash && old.houseCash.fundId === fundId) bal += Number(old.houseCash.amount) || 0;
  }
  return _miR2(bal);
}

// Problem that must block Save, or '' when the house part is fine.
function _miHouseProblem(){
  var o = _miOffTop();
  if(o.cashTyped > 0 && !o.cashOk) return 'Pocket part is more than house' + (o.subsTotal > 0 ? ' + subscriptions' : '');
  if(o.cash > 0){
    if(!_miState.cashFundId) return 'Pick the pocket the cash part comes from';
    var avail = _miCashAvailable(_miState.cashFundId);
    if(avail === null) return 'Cash pocket not found';
    if(o.cash > avail + 0.005) return 'Only ' + fmtR(avail) + ' in that pocket';
  }
  return '';
}

function _miWifePocket(){
  try {
    var plan = (typeof loadPlan === 'function') ? loadPlan() : null;
    var id = plan && plan.wifePocketId;
    return id ? (funds.find(function(f){ return f.id === id && !f._deleted; }) || null) : null;
  } catch(e){ return null; }
}

function _miDefaultCashPocket(){
  var wp = _miWifePocket();               // v150u: the pocket carpool fills for her comes first
  if(wp) return wp.id;
  var last = _miLastHouseRec(_miState.editingId);
  if(last && last.houseCash && funds.some(function(f){ return f.id === last.houseCash.fundId && !f._deleted; })) return last.houseCash.fundId;
  var cw = funds.find(function(f){ return !f._deleted && /cash/i.test(f.name||''); });
  if(cw) return cw.id;
  var any = funds.find(function(f){ return !f._deleted; });
  return any ? any.id : null;
}

// Build the extra House controls once, under the existing House field.
function _miEnsureHouseExtra(){
  var houseInp = document.getElementById('miHouse');
  if(!houseInp) return;
  var field = houseInp.closest('.field') || houseInp.parentNode;
  if(!document.getElementById('miHouseInfoBtn')){
    var lbl = field.querySelector('label');
    if(lbl){
      var b = document.createElement('button');
      b.type = 'button';
      b.id = 'miHouseInfoBtn';
      b.setAttribute('aria-label', 'How the house money works');
      b.textContent = 'ⓘ';
      b.style.cssText = 'background:none;border:1px solid #5a3a00;border-radius:50%;width:20px;height:20px;line-height:16px;padding:0;margin-left:8px;color:#f2a830;font-size:12px;cursor:pointer;vertical-align:middle;';
      b.onclick = function(){
        var box = document.getElementById('miHouseInfo');
        if(box) box.style.display = (box.style.display === 'none') ? 'block' : 'none';
      };
      lbl.appendChild(b);
    }
  }
  if(document.getElementById('miHouseExtra')) return;
  var wrap = document.createElement('div');
  wrap.id = 'miHouseExtra';
  wrap.innerHTML = ''
    + '<div id="miHouseInfo" style="display:none;background:#1a1200;border:1px solid #5a3a00;border-radius:6px;padding:10px 12px;margin-top:8px;font-size:11.5px;color:#f2a830;line-height:1.6;"></div>'
    + '<div style="font-size:10px;letter-spacing:1px;color:var(--muted);margin-top:12px;margin-bottom:4px;">PART PAID FROM A POCKET (OPTIONAL)</div>'
    + '<div style="display:flex;gap:8px;">'
    +   '<input type="number" id="miHouseCash" step="0.01" min="0" placeholder="Cash part" oninput="_miOnHeaderEdit()" style="flex:0 0 34%;min-width:0;width:auto;"/>'
    +   '<select id="miCashPocket" onchange="_miOnHeaderEdit()" style="flex:1;min-width:0;width:auto;"></select>'
    + '</div>'
    + '<div id="miUseSaved"></div>'
    + '<label style="display:flex;align-items:center;gap:8px;margin-top:12px;font-size:11px;letter-spacing:1px;color:var(--muted);text-transform:none;cursor:pointer;">'
    +   '<input type="checkbox" id="miSubsOn" onchange="_miOnSubsToggle()" style="width:16px;height:16px;margin:0;padding:0;flex-shrink:0;accent-color:#f2a830;"/>'
    +   '<span>Add her subscriptions on top</span>'
    + '</label>'
    + '<div id="miSubsLines" style="margin-top:4px;"></div>'
    + '<div id="miHouseSummary" style="margin-top:8px;"></div>';
  field.appendChild(wrap);
  var dateInp = document.getElementById('miDate');
  if(dateInp && !dateInp._miHooked){
    dateInp._miHooked = true;
    dateInp.addEventListener('change', function(){ _miOnHeaderEdit(); });
  }
}

function _miFillCashPocketOptions(){
  var sel = document.getElementById('miCashPocket');
  if(!sel) return;
  var cur = _miState.cashFundId;
  sel.innerHTML = funds.filter(function(f){ return !f._deleted && !f.archived; }).map(function(f){
    var avail = _miCashAvailable(f.id);
    return '<option value="'+f.id+'"'+(f.id===cur?' selected':'')+'>'
      + escHtml((f.emoji||'')+' '+f.name) + ' · ' + fmtR(avail||0) + '</option>';
  }).join('');
  if(cur) sel.value = cur;
}

// v150u: one tap to pay her from what carpool saved in the Wife monthly pocket.
function _miUseSaved(){
  var wp = _miWifePocket();
  if(!wp) return;
  _miSyncInputs();
  var o = _miOffTop();
  var avail = _miCashAvailable(wp.id) || 0;
  var use = _miR2(Math.min(avail, o.toHer));
  if(!(use > 0)) return;
  _miState.cashFundId = wp.id;
  var sel = document.getElementById('miCashPocket'); if(sel) sel.value = wp.id;
  var inp = document.getElementById('miHouseCash'); if(inp) inp.value = use;
  _miOnHeaderEdit();
}

function _miOnSubsToggle(){
  var cb = document.getElementById('miSubsOn');
  _miState.subsOn = !!(cb && cb.checked);
  _miState.subsTouched = true;
  _miOnHeaderEdit(true);
}

function _miExampleText(){
  var subs = _miSubsConfig();
  var subsTxt = subs.map(function(s){ return s.label + ' ' + fmtR(s.amount); }).join(' + ');
  var subsTotal = _miR2(subs.reduce(function(s,x){ return s + Number(x.amount); }, 0));
  var last = _miLastHouseRec(_miState.editingId);
  var H = last ? _miHouseTotalOf(last) : 7550;
  var C = (last && last.houseCash) ? _miR2(last.houseCash.amount) : (last ? 0 : 570);
  var src = last ? 'Last time (' + last.date + ')' : 'Example';
  var pocketName = 'a pocket';
  if(last && last.houseCash){
    var pf = funds.find(function(f){ return f.id === last.houseCash.fundId; });
    if(pf) pocketName = pf.name;
  } else if(!last){ pocketName = 'Cash wallet'; }
  var t = 'Type what you\'re giving her for the house. '
    + (subs.length ? subsTxt + ' are added on top automatically (change them in Plan → ✎). ' : '')
    + 'If part of it comes out of a pocket, type that part below and pick the pocket.<br><br>'
    + '<b>' + src + ':</b> house ' + fmtR(H)
    + (C > 0 ? ', ' + fmtR(C) + ' from ' + escHtml(pocketName) : '')
    + (C > 0
        ? ' → ' + fmtR(_miR2(H - C + subsTotal)) + ' off the bank, ' + fmtR(C) + ' from the pocket, ' + fmtR(_miR2(H + subsTotal)) + ' total to her.'
        : ' → ' + fmtR(_miR2(H + subsTotal)) + ' to her, all off the bank.');
  return t;
}

// Repaint the House extras (placeholder, subs lines, summary, warnings).
function _miRenderHouseExtra(){
  _miEnsureHouseExtra();
  var houseInp = document.getElementById('miHouse');
  var last = _miLastHouseRec(_miState.editingId);
  if(houseInp){
    houseInp.placeholder = last ? ('e.g. ' + fmtR(_miHouseTotalOf(last)) + ' last time · ask wife') : 'Ask wife how much…';
  }
  var cashInp = document.getElementById('miHouseCash');
  if(cashInp){
    cashInp.placeholder = (last && last.houseCash) ? ('e.g. ' + fmtR(last.houseCash.amount)) : 'Cash part';
  }
  var info = document.getElementById('miHouseInfo');
  if(info) info.innerHTML = _miExampleText();
  _miFillCashPocketOptions();

  var already = _miSubsAlreadyIn(_miState.date || localDateStr(new Date()), _miState.editingId);
  if(!_miState.subsTouched && !_miState.editingId){
    _miState.subsOn = !already;
  }
  var cb = document.getElementById('miSubsOn');
  if(cb) cb.checked = !!_miState.subsOn;

  // v150u: "Use R… saved" button for the Wife monthly pocket
  var us = document.getElementById('miUseSaved');
  if(us){
    var uh = '';
    var wp = _miWifePocket();
    if(wp){
      var av = _miCashAvailable(wp.id) || 0;
      var o0 = _miOffTop();
      var useAmt = _miR2(Math.min(av, o0.toHer));
      var usedAlready = _miState.cashFundId === wp.id && Math.abs(o0.cash - useAmt) < 0.005;
      if(av > 0 && !usedAlready){
        uh = (o0.house > 0)
          ? '<button type="button" onclick="_miUseSaved()" style="width:100%;margin-top:8px;padding:9px;background:#1a1200;border:1px solid #f2a830;border-radius:6px;color:#f2a830;font-family:\'DM Mono\',monospace;font-size:10.5px;letter-spacing:1px;cursor:pointer;">Use '+fmtR(useAmt)+' saved in '+escHtml(wp.name)+'</button>'
          : '<div style="font-size:10.5px;color:#f2a830;margin-top:6px;">'+fmtR(av)+' saved in '+escHtml(wp.name)+'. Type the house amount to use it.</div>';
      }
    }
    us.innerHTML = uh;
  }

  var o = _miOffTop();
  var conf = _miSubsConfig();
  var linesEl = document.getElementById('miSubsLines');
  if(linesEl){
    var lh = '';
    if(already){
      lh += '<div style="font-size:10.5px;color:#f2a830;margin:2px 0 4px;">Already added with the Money In on ' + escHtml(already.date) + '. Tick only if you\'re paying them twice this cycle.</div>';
    }
    if(!conf.length){
      lh += '<div style="font-size:10.5px;color:var(--muted);">No subscriptions set. Add them in Plan → ✎.</div>';
    }
    conf.forEach(function(s){
      var on = _miState.subsOn && o.house > 0;
      lh += '<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0;color:'+(on?'var(--text)':'var(--muted)')+';'+(on?'':'text-decoration:line-through;')+'">'
        + '<span>🔒 ' + escHtml(s.label) + (s.day ? ' · ' + s.day + 'th' : '') + '</span><span>' + fmtR(s.amount) + '</span></div>';
    });
    linesEl.innerHTML = lh;
  }

  var sumEl = document.getElementById('miHouseSummary');
  if(sumEl){
    var prob = _miHouseProblem();
    var sh = '';
    if(o.house > 0){
      var bank = _miState.sourceBank || 'FNB';
      var row = function(l, v, col, bold){
        return '<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0;color:'+col+';'+(bold?'font-weight:700;':'')+'"><span>'+l+'</span><span>'+v+'</span></div>';
      };
      sh += '<div style="border-top:1px solid var(--border);margin-top:4px;padding-top:6px;">';
      sh += row('Off the top (' + escHtml(bank) + ')', fmtR(o.offTop), 'var(--text)');
      if(o.cash > 0){
        var pf = funds.find(function(f){ return f.id === _miState.cashFundId; });
        sh += row('From ' + escHtml(pf ? pf.name : 'pocket'), fmtR(o.cash), 'var(--text)');
      }
      sh += row('Total to her', fmtR(o.toHer), '#f2a830', true);
      sh += '</div>';
    }
    if(prob){
      sh += '<div style="font-size:11px;color:#f23060;margin-top:6px;">⚠ ' + escHtml(prob) + '</div>';
    }
    sumEl.innerHTML = sh;
  }
}

// ── Build a priority-aware pre-fill ─────────────────────────────────
// Strategy: walk getActivePriorities() in order; for each rule that has a
// fund target (maint, savings, car_service) put the rule's monthly target
// into that target fund, capped at what's left. Anything remaining at the
// end goes into the Daily pocket. This is ONLY a suggestion — every box
// is editable below.
// ── Plan pre-allocation (Money In + Plan pre-select, 2026-09-08) ────────
// Runs BEFORE the Priority Rules pass below. If a Plan savings card
// (plan.savingsCards) still has room this month, that pocket gets first
// claim on the incoming money -- same "first eligible card wins" rule
// Carpool Mark Paid already uses. Deliberately scoped to Money In's OWN
// history only (never reads carpool's yb_carpool_payments_v1), same as
// Mark Paid only ever reads its own carpool log -- keeps the two features
// from double-counting each other's contribution toward the same monthly
// commitment. Whatever Plan doesn't claim falls through to Priority Rules
// exactly as before -- this is one more waterfall step, not a change to
// the locked "pre-fill uses Priority Rules" design.
var _miLastPlanRows = null;   // v149o: per-card status rows for the Plan panel (null = no plan cards)
var _miLastPlanLeft = 0;      // v149o: amount still unplaced after the plan waterfall
var _miLastPlanTotal = 0;     // v149o: amount the plan was asked to place
function _miPlanPreAllocate(leftover){
  // v149o: WATERFALL. Walks EVERY plan card in order (was: first eligible card only),
  // each takes min(what's open this month, what's left) until the money runs out.
  // Every card also records WHY it was filled or skipped, so the panel can show it.
  _miLastPlanRows = null; _miLastPlanLeft = leftover; _miLastPlanTotal = leftover;
  if(leftover <= 0) return [];
  try {
    var plan = (typeof loadPlan === 'function') ? loadPlan() : null;
    if(!plan || !(plan.savingsCards||[]).length) return [];
    // v150u: count by pay cycle (salary day → salary day), not calendar month.
    // A salary being typed right now (house money, or note says salary) starts a new cycle today.
    var entryDate = _miState.date || localDateStr(new Date());
    var isSalary = (_miState.house > 0) || /salary/i.test(_miState.note||'');
    var cyc = (typeof planCycleFor === 'function')
      ? planCycleFor(entryDate, { excludeId:_miState.editingId, startOverride: isSalary ? entryDate : null })
      : null;
    var inCyc = function(ds){
      if(cyc) return planInCycle(ds, cyc);
      return ds && ds.slice(0,7) === entryDate.slice(0,7);
    };
    var resetLbl = cyc ? planCycleLabel(cyc).to : 'next month';
    var allMi = loadMoneyInData().filter(function(r){ return r.id !== _miState.editingId; });
    var rem = leftover, planned = {}, picks = [], rows = [];

    plan.savingsCards.forEach(function(c){
      var label = String(c.label||'Plan card').trim();
      var pocket = funds.find(function(f){ return f.id === c.pocketId && !f._deleted; });
      if(!pocket){ rows.push({state:'warn', label:label, amt:0, why:'Pocket not found'}); return; }
      if(c.source === 'carpool'){ rows.push({state:'skip', label:label, amt:0, why:'Filled by carpool, not salary'}); return; }   // v150u
      if(!c.monthly || c.monthly <= 0){ rows.push({state:'warn', label:label, amt:0, why:'Monthly is R0, so this card can\'t fill'}); return; }
      if(c.target > 0 && fundTotal(pocket) >= c.target){ rows.push({state:'skip', label:label, amt:0, why:'Target of '+fmtR(c.target)+' reached'}); return; }
      var routed = allMi
        .filter(function(r){ return r.date && inCyc(r.date); })
        .reduce(function(s,r){
          var split = (r.splits||[]).find(function(sp){ return sp.fundId === c.pocketId; });
          return s + (split ? split.amount : 0);
        }, 0) + (planned[c.pocketId]||0);
      routed = Math.round(routed*100)/100;
      if(routed >= c.monthly){ rows.push({state:'skip', label:label, amt:0, why:fmtR(routed)+' of '+fmtR(c.monthly)+' already routed this cycle · resets '+resetLbl}); return; }
      var open = Math.round((c.monthly - routed)*100)/100;
      if(rem <= 0){ rows.push({state:'wait', label:label, amt:0, why:fmtR(open)+' still open, nothing left to place'}); return; }
      var alloc = Math.min(open, rem);
      rem = Math.round((rem - alloc)*100)/100;
      planned[c.pocketId] = (planned[c.pocketId]||0) + alloc;
      picks.push({ fundId: c.pocketId, alloc: alloc });
      rows.push({state:'fill', label:label, amt:alloc, why: alloc < open ? 'Part of '+fmtR(open)+' open this cycle, '+fmtR(open-alloc)+' still to go' : 'Fills this cycle\'s '+fmtR(c.monthly)});
    });

    _miLastPlanRows = rows;
    _miLastPlanLeft = rem;
    return picks;
  } catch(e){
    console.warn('[moneyin] Plan pre-allocate skipped:', e.message);
    _miLastPlanRows = null;
    return [];
  }
}

var _miLastPrefillWarn = null;   // v149r: {unplaced, reason} when the pre-fill could not place everything
function _miBuildPrefill(leftover){
  var prefill = {};
  _miLastPrefillWarn = null;
  if(leftover <= 0) return prefill;
  var rem = leftover;

  // Plan gets first claim; whatever's left runs through Priority Rules
  // exactly as before.
  var planPicks = _miPlanPreAllocate(rem);
  planPicks.forEach(function(p){
    prefill[p.fundId] = (prefill[p.fundId]||0) + p.alloc;
    rem -= p.alloc;
  });

  try{
    var rules = (typeof getActivePriorities === 'function') ? getActivePriorities() : [];
    var savingsRule = null;
    rules.forEach(function(rule){
      if(rem <= 0) return;
      if(rule.id === 'savings'){ savingsRule = rule; return; }   // v149r: "remainder" rule, applied after the others
      var fundId = rule.targetId;
      if(!fundId) return;
      var fund = funds.find(function(f){ return f.id === fundId; });
      if(!fund) return;

      // v150q: the old 'maint' (Maintenance Fund) rule has no target any more.
      // Its target came from maint.js, which returned 0, so this rule was
      // already skipped every time — this line just says so directly.
      if(rule.id === 'maint') return;
      // Suggested amount: monthly target (weekly*4.33 if weekly, else weekly directly for monthly)
      var monthlyTarget = (fund.targetType === 'monthly' ? (fund.weekly||0) : Math.round((fund.weekly||0) * 4.33));

      if(!monthlyTarget || monthlyTarget <= 0) return;
      var alloc = Math.min(monthlyTarget, rem);
      prefill[fundId] = (prefill[fundId]||0) + alloc;
      rem -= alloc;
    });

    // v149r: NO automatic spreading. Yasin moves this money by hand in the FNB app, so
    // splitting it over many pockets creates work and surprises. Whatever is left after the
    // plan and the other rules goes to the Savings rule's TARGET pocket - all of it, with no
    // cap, even if that pocket is past its goal (change the target to stop it). If there is
    // no target (rule off / no pocket picked / pocket gone) nothing is placed and a warning
    // is shown; Save stays locked until the remainder is placed by hand.
    if(rem > 0){
      var tgt = (savingsRule && savingsRule.targetId)
        ? funds.find(function(f){ return f.id === savingsRule.targetId && !f._deleted; }) : null;
      if(tgt){
        prefill[tgt.id] = (prefill[tgt.id]||0) + rem;
        rem = 0;
      } else {
        var why = !savingsRule ? 'off' : (savingsRule.targetId ? 'target_missing' : 'no_target');
        _miLastPrefillWarn = { unplaced: Math.round(rem*100)/100, reason: why };
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
  _miRenderHouseExtra();   // v150t
  var leftover = Math.max(0, _miState.amount - _miOffTop().offTop);

  // First render only: if not editing and no manual edits yet, use prefill
  var hasUserEdits = Object.keys(_miState.splits).length > 0;
  if(!hasUserEdits && !_miState.editingId){ _miLastPlanRows = null; _miLastPrefillWarn = null; }   // v149o/r: never show a stale panel
  if(!hasUserEdits && !_miState.editingId && leftover > 0){
    _miState.splits = _miBuildPrefill(leftover);
  }

  var c = document.getElementById('miPocketList');
  if(!c) return;

  // Plan hint -- mirrors Carpool Mark Paid's payDestPlanHint styling.
  // Only on a fresh, un-edited open (same gate as the prefill call above).
  var existingHint = document.getElementById('miPlanHint');
  if(existingHint) existingHint.remove();
  if(_miLastPlanRows && _miLastPlanRows.length && !hasUserEdits && !_miState.editingId){
    var hint = document.createElement('div');
    hint.id = 'miPlanHint';
    hint.style.cssText = 'background:#111;border:1px solid #3a5a00;border-radius:6px;padding:10px 12px;margin-bottom:10px;';
    var hdr = document.createElement('div');
    hdr.style.cssText = 'font-size:10px;color:#c8f230;letter-spacing:1px;margin-bottom:6px;';
    hdr.textContent = 'PLAN — '+fmtR(_miLastPlanTotal)+' TO PLACE';
    hint.appendChild(hdr);
    var glyph = { fill:'✓', skip:'⏸', wait:'⏸', warn:'⚠' };
    var gcol  = { fill:'#c8f230', skip:'#f2a830', wait:'#888', warn:'#f2a830' };
    _miLastPlanRows.forEach(function(r, i){
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;align-items:flex-start;padding:6px 0;'+(i>0?'border-top:1px solid #1e1e1e;':'');
      var g = document.createElement('span');
      g.style.cssText = 'font-size:12px;color:'+gcol[r.state]+';flex-shrink:0;width:14px;';
      g.textContent = glyph[r.state];
      var body = document.createElement('div');
      body.style.cssText = 'flex:1;min-width:0;';
      var top = document.createElement('div');
      top.style.cssText = 'display:flex;justify-content:space-between;gap:8px;font-size:12px;color:#efefef;';
      var nm = document.createElement('span'); nm.textContent = r.label;
      var am = document.createElement('span');
      am.style.cssText = 'color:'+(r.state==='fill'?'#c8f230':'#666')+';font-weight:500;';
      am.textContent = r.state==='fill' ? fmtR(r.amt) : 'Skipped';
      top.appendChild(nm); top.appendChild(am);
      var why = document.createElement('div');
      why.style.cssText = 'font-size:10px;color:#888;margin-top:2px;letter-spacing:0.3px;';
      why.textContent = r.why;
      body.appendChild(top); body.appendChild(why);
      row.appendChild(g); row.appendChild(body);
      hint.appendChild(row);
    });
    if(_miLastPlanLeft > 0){
      var ft = document.createElement('div');
      ft.style.cssText = 'font-size:10px;color:#888;margin-top:6px;padding-top:6px;border-top:1px solid #1e1e1e;letter-spacing:0.3px;';
      ft.textContent = fmtR(_miLastPlanLeft)+' left for your priority rules';
      hint.appendChild(ft);
    }
    c.parentNode.insertBefore(hint, c);
  }

  // v149r: warning when the pre-fill could not place everything
  var existingWarn = document.getElementById('miPrefillWarn');
  if(existingWarn) existingWarn.remove();
  if(_miLastPrefillWarn && !hasUserEdits && !_miState.editingId){
    var wn = document.createElement('div');
    wn.id = 'miPrefillWarn';
    wn.style.cssText = 'background:#1a1200;border:1px solid #5a3a00;border-radius:6px;padding:10px 12px;margin-bottom:10px;font-size:12px;color:#f2a830;line-height:1.5;';
    var why = _miLastPrefillWarn.reason;
    var msg = fmtR(_miLastPrefillWarn.unplaced)+' not placed. ';
    if(why === 'no_target') msg += 'The Savings rule has no target pocket. Pick one in Priority Rules, or split it by hand.';
    else if(why === 'target_missing') msg += 'The Savings rule\'s target pocket no longer exists. Pick another in Priority Rules, or split it by hand.';
    else msg += 'The Savings rule is off, so nothing is set to take the rest. Turn it on with a target pocket in Priority Rules, or split it by hand.';
    wn.textContent = '⚠ '+msg;
    c.parentNode.insertBefore(wn, c);
  }

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
// v150t: compares what comes off the top (house bank part + subscriptions),
// so changing the cash part or the subscriptions tick also re-plans the split.
var _miLastOffTop = 0;
function _miOnHeaderEdit(force){
  var oldAmount = _miState.amount;
  var oldOff = _miLastOffTop;
  _miSyncInputs();
  var newOff = _miOffTop().offTop;
  if(force === true || Math.abs(_miState.amount - oldAmount) > 0.001 || Math.abs(newOff - oldOff) > 0.001){
    _miState.splits = {};  // forget manual edits — header changed
    _miRenderPocketSplit();
  } else {
    _miRenderHouseExtra();
    _miUpdateLiveTotal();
  }
}

function _miUpdateLiveTotal(){
  _miSyncInputs();
  var _off = _miOffTop();
  _miLastOffTop = _off.offTop;
  var _houseProb = _miHouseProblem();
  var leftover = Math.max(0, _miState.amount - _off.offTop);
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
    if(!(_miState.amount > 0)){
      // No amount entered yet — show a neutral hint, not a fake green tick
      leftEl.textContent = '—';
      leftEl.style.color = '#555';
    } else if(Math.abs(left) < 0.005){
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
    var ok = _miState.amount > 0 && Math.abs(left) < 0.005 && !_houseProb && _off.offTop <= _miState.amount + 0.005;
    var over = _miState.amount > 0 && left < -0.005 && !_houseProb;
    // The button has THREE active states: save (green, enabled), reset (orange,
    // enabled — appears when over), and locked (dim, disabled).
    saveBtn.disabled = !(ok || over);
    saveBtn.style.opacity = (ok || over) ? '1' : '.45';
    saveBtn.style.cursor = (ok || over) ? 'pointer' : 'not-allowed';
    // Colour the button by action: green for save, orange for reset, grey-green for locked.
    if(ok){
      saveBtn.style.background = '#c8f230';
      saveBtn.style.color = '#000';
    } else if(over){
      saveBtn.style.background = '#f2a830';
      saveBtn.style.color = '#000';
    } else {
      saveBtn.style.background = '#c8f230';
      saveBtn.style.color = '#000';
    }
    // Label resolution — most specific to least specific so the message matches reality:
    // 1) all good                → "✓ Save Money In"
    // 2) amount not entered yet  → "🔒 Enter amount to start"  (nothing to compare against)
    // 3) house exceeds amount    → "🔒 House is more than amount"
    // 4) more to place           → "🔒 R___ still to place"
    // 5) over-placed             → "↻ Clear & start over"  (tappable — wipes splits)
    if(ok){
      saveBtn.textContent = '✓ Save Money In';
    } else if(!(_miState.amount > 0)){
      saveBtn.textContent = '🔒 Enter amount to start';
    } else if(_houseProb){
      saveBtn.textContent = '🔒 ' + _houseProb;
    } else if(_off.offTop > _miState.amount + 0.005){
      saveBtn.textContent = '🔒 House money is more than amount';
    } else if(left > 0){
      saveBtn.textContent = '🔒 ' + fmtR(left) + ' still to place';
    } else {
      saveBtn.textContent = '↻ ' + fmtR(Math.abs(left)) + ' over — clear & start over';
    }
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
  var off = _miOffTop();               // v150t
  var house = off.houseBank;           // bank part of the house money (what "house" always meant)
  var leftover = Math.max(0, amount - off.offTop);
  var placed = 0;
  Object.keys(_miState.splits).forEach(function(k){ placed += (_miState.splits[k]||0); });
  placed = Math.round(placed * 100) / 100;
  leftover = Math.round(leftover * 100) / 100;

  if(amount <= 0){ alert('Enter the amount received.'); return; }
  var _hp = _miHouseProblem();
  if(_hp){ alert(_hp + '.'); return; }
  if(off.offTop > amount + 0.005){ alert('House money (' + fmtR(off.offTop) + ') is more than the amount received.'); return; }
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
    houseTotal: off.house,   // v150t: full house amount typed (bank part + pocket part)
    houseCash: null,         // v150t: { fundId, amount, depositId, cfId }
    subs: [],                // v150t: [ { id, label, amount, cfId } ]
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

  // 2b) v150t: her subscriptions, on top of the house money (bank doorway)
  //     v150u: only the bank part of each gets a bank row; a part paid from the pocket goes in 2c.
  off.subsAlloc.forEach(function(a){
    var cfId = a.bank > 0 ? _moneyInPostSub(rec, a.sub.label, a.bank) : null;
    rec.subs.push({ id: a.sub.id || uid(), label: a.sub.label, amount: a.amount, bank: a.bank, cfId: cfId });
  });

  // 2c) v150t: part of the house money paid from a pocket. Same shape as a
  //     Direct Spend (pocket out + Cash Flow row) but owned by this Money In.
  //     No bank baseline: the money was already sitting in the pocket.
  if(off.cash > 0 && _miState.cashFundId){
    var cf2 = funds.find(function(x){ return x.id === _miState.cashFundId; });
    if(cf2){
      var cDepId = uid();
      var cCfId = off.houseFromPocket > 0 ? _moneyInPostHouseCash(rec, cf2, off.houseFromPocket) : null;
      var sCfId = off.subsFromPocket > 0 ? _moneyInPostSubsCash(rec, cf2, off.subsFromPocket) : null;   // v150u
      cf2.deposits.push({
        id: cDepId,
        txnType: 'out',
        amount: _miR2(off.cash),
        date: rec.date,
        note: off.subsFromPocket > 0 ? '↑ House money + subscriptions (from pocket)' : '↑ House money (cash portion)',
        cfPosted: true,
        moneyInId: miId
      });
      rec.houseCash = { fundId: cf2.id, amount: _miR2(off.cash), depositId: cDepId, cfId: cCfId, subsCfId: sCfId };
    }
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
      rec.subs.forEach(function(s){                                    // v150t: -each subscription (bank part, v150u)
        var b = (s.bank != null) ? s.bank : s.amount;
        if(b > 0) window._adjustBaselineForBank(rec.sourceBank, -b);
      });
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
      message: 'Money In saved · ' + fmtR(amount) + (off.house>0 ? ' (' + fmtR(off.toHer) + ' to her)' : ''),
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

// v150t: one Cash Flow row per subscription she pays out of the house money.
function _moneyInPostSub(rec, label, amount){
  var cfData = loadCFData();
  var mk = (rec.date||localDateStr(new Date())).slice(0,7);
  if(!cfData[mk]) cfData[mk] = { income:[], expenses:[] };
  var cfId = uid();
  cfData[mk].expenses.push({
    id: cfId,
    label: label,
    amount: amount,
    icon: '📱',
    auto: false,
    account: rec.sourceBank,
    destBank: rec.sourceBank,
    date: rec.date,
    moneyInId: rec.id,
    sourceType: 'house_sub',
    category: 'Other',
    note: 'Money In · paid by wife from the house money',
    createdAt: rec.createdAt
  });
  saveCFData(cfData);
  return cfId;
}

// v150t: Cash Flow row for the part of the house money paid from a pocket.
// Shaped like a Direct Spend row (pocket badge, no bank) so it shows the same way.
function _moneyInPostHouseCash(rec, fund, amount){
  var cfData = loadCFData();
  var mk = (rec.date||localDateStr(new Date())).slice(0,7);
  if(!cfData[mk]) cfData[mk] = { income:[], expenses:[] };
  var cfId = uid();
  cfData[mk].expenses.push({
    id: cfId,
    label: 'House money (cash portion)',
    amount: _miR2(amount),
    icon: '⌂',
    auto: false,
    account: (fund.emoji ? fund.emoji + ' ' : '') + fund.name,
    date: rec.date,
    moneyInId: rec.id,
    sourceType: 'pocket_spend',
    sourceId: fund.id,
    sourceCardName: fund.name,
    category: 'Home',
    note: 'Money In · part of the house money, from ' + fund.name,
    createdAt: rec.createdAt
  });
  saveCFData(cfData);
  return cfId;
}

// v150u: Cash Flow row for the part of her subscriptions paid from the pocket.
function _moneyInPostSubsCash(rec, fund, amount){
  var cfData = loadCFData();
  var mk = (rec.date||localDateStr(new Date())).slice(0,7);
  if(!cfData[mk]) cfData[mk] = { income:[], expenses:[] };
  var cfId = uid();
  cfData[mk].expenses.push({
    id: cfId,
    label: 'Subscriptions (from ' + fund.name + ')',
    amount: _miR2(amount),
    icon: '📱',
    auto: false,
    account: (fund.emoji ? fund.emoji + ' ' : '') + fund.name,
    date: rec.date,
    moneyInId: rec.id,
    sourceType: 'pocket_spend',
    sourceId: fund.id,
    sourceCardName: fund.name,
    category: 'Other',
    note: 'Money In · subscriptions paid by wife, from ' + fund.name,
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

  // 2b) v150t: reverse her subscriptions (bank doorway: +amount back each)
  if((rec.subs||[]).length){
    var subIds = rec.subs.map(function(s){ return s.cfId; }).filter(Boolean);
    var cfS = loadCFData();
    var mkS = (rec.date||'').slice(0,7);
    if(cfS[mkS] && cfS[mkS].expenses){
      cfS[mkS].expenses = cfS[mkS].expenses.filter(function(e){ return subIds.indexOf(e.id) < 0; });
    }
    saveCFData(cfS);
    rec.subs.forEach(function(s){
      try{
        if(typeof window._adjustBaselineForBank === 'function'){
          var b = (s.bank != null) ? s.bank : s.amount;   // v150u: only the bank part touched the bank
          if(b > 0) window._adjustBaselineForBank(rec.sourceBank, b);
        }
      }catch(e){}
    });
  }

  // 2c) v150t: reverse the pocket part of the house money (no baseline: it never touched the bank)
  if(rec.houseCash){
    var hf = funds.find(function(x){ return x.id === rec.houseCash.fundId; });
    if(hf){
      hf.deposits = (hf.deposits||[]).filter(function(d){ return d.id !== rec.houseCash.depositId; });
    }
    var cfC = loadCFData();
    var mkC = (rec.date||'').slice(0,7);
    if(cfC[mkC] && cfC[mkC].expenses){
      cfC[mkC].expenses = cfC[mkC].expenses.filter(function(e){ return e.id !== rec.houseCash.cfId && e.id !== rec.houseCash.subsCfId; });
    }
    saveCFData(cfC);
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
                   + '<div style="font-size:10px;color:#555;letter-spacing:1px;">'+rec.date+' · '+rec.sourceBank+' · '+pocketsText+(_miHouseTotalOf(rec)>0 ? ' · house '+fmtR(_miHouseTotalOf(rec)) : '')+((rec.subs||[]).length ? ' + subs' : '')+'</div>';
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

// ── Save button dispatcher ──────────────────────────────────────────────
// The Save button serves three states:
//   - "Save Money In"          → calls saveMoneyIn()
//   - "Clear & start over"     → calls _miResetSplit() (when overflow)
//   - Anything else (locked)   → disabled, this dispatcher won't fire
// We pick the right action by re-checking the live state here, so the button
// always does what its current label says.
function _miOnActionTap(){
  if(!_miState) return;
  _miSyncInputs();
  var leftover = Math.max(0, (_miState.amount||0) - _miOffTop().offTop);
  var placed = 0;
  Object.keys(_miState.splits).forEach(function(k){ placed += (_miState.splits[k]||0); });
  placed = Math.round(placed * 100) / 100;
  var left = Math.round((leftover - placed) * 100) / 100;
  if(_miState.amount > 0 && left < -0.005){
    // Over → wipe splits, let user start the split again
    _miResetSplit();
    return;
  }
  // Otherwise default to the save action (its own checks will block invalid saves)
  saveMoneyIn();
}

// ── Reset/clear the pocket split (start over) ───────────────────────────
// One-tap "I typed the wrong amounts, let me start the split again."
// Wipes every pocket back to R0 — leaves amount/note/date/house alone.
// The button only appears when at least one pocket has a value typed in.
function _miResetSplit(){
  if(!_miState || !_miState.splits) return;
  Object.keys(_miState.splits).forEach(function(k){
    _miState.splits[k] = 0;
  });
  // Clear the visible input fields too
  var inputs = document.querySelectorAll('#miPocketList input');
  inputs.forEach(function(inp){ inp.value = ''; });
  // Refresh totals + button labels + reset-button visibility
  if(typeof _miUpdateLiveTotal === 'function') _miUpdateLiveTotal();
}

// ── Custom hard-block dialog (replaces native confirm) ──────────────────
// Option 1 (locked 2026-05-20): two clearly-labelled buttons — the dangerous
// action stated in plain English (red), and the safe default (grey).
// Button text IS the action; no need to read the message to know which to tap.
//
// Usage:
//   mihbConfirm({
//     title: '🔒 Can\'t delete it here',
//     body:  'long explanation…',
//     dangerLabel: '↩ Reverse the whole Money In',
//     safeLabel:   'Leave it alone'
//   }, function(userChoseDanger){ if(userChoseDanger){ ... } });
//
// The callback fires AFTER the user taps. Either button closes the modal.
// Tapping the dim background = same as "safe" (cancel).
function _mihbEnsureModal(){
  if(document.getElementById('mihbOverlay')) return;
  var ov = document.createElement('div');
  ov.id = 'mihbOverlay';
  ov.setAttribute('role','dialog');
  ov.setAttribute('aria-modal','true');
  ov.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:9000;align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);';
  ov.innerHTML =
    '<div id="mihbCard" role="document" style="background:#0d0d0d;border:1px solid #2a2a2a;border-radius:14px;padding:20px;width:100%;max-width:380px;box-shadow:0 18px 50px rgba(0,0,0,.6);">'+
      '<div id="mihbTitle" style="font-family:Syne,sans-serif;font-weight:800;font-size:17px;color:#efefef;margin-bottom:12px;line-height:1.3;"></div>'+
      '<div id="mihbBody" style="font-size:12.5px;color:#bbb;line-height:1.7;margin-bottom:18px;white-space:pre-wrap;"></div>'+
      '<div style="display:flex;flex-direction:column;gap:9px;">'+
        '<button id="mihbDanger" type="button" style="padding:13px;border-radius:8px;font-family:\'DM Mono\',monospace;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;border:1px solid #5a1a1a;background:#1a0808;color:#f23060;cursor:pointer;text-align:center;"></button>'+
        '<button id="mihbSafe" type="button" style="padding:13px;border-radius:8px;font-family:\'DM Mono\',monospace;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;border:1px solid #2a2a2a;background:#141414;color:#888;cursor:pointer;text-align:center;"></button>'+
      '</div>'+
    '</div>';
  document.body.appendChild(ov);
}

function mihbConfirm(opts, callback){
  _mihbEnsureModal();
  var ov = document.getElementById('mihbOverlay');
  var card = document.getElementById('mihbCard');
  document.getElementById('mihbTitle').textContent = opts.title || 'Confirm';
  document.getElementById('mihbBody').textContent = opts.body || '';
  var dBtn = document.getElementById('mihbDanger');
  var sBtn = document.getElementById('mihbSafe');
  dBtn.textContent = opts.dangerLabel || 'Yes';
  sBtn.textContent = opts.safeLabel || 'Cancel';

  // One-shot listeners — clean up after a decision is made.
  function done(choice){
    ov.style.display = 'none';
    dBtn.onclick = null;
    sBtn.onclick = null;
    ov.onclick = null;
    document.removeEventListener('keydown', onKey);
    if(typeof callback === 'function') callback(choice);
  }
  function onKey(e){
    if(e.key === 'Escape') done(false);
    if(e.key === 'Enter')  done(false); // Enter = safe default (don't surprise-reverse)
  }
  dBtn.onclick = function(){ done(true); };
  sBtn.onclick = function(){ done(false); };
  ov.onclick = function(e){ if(e.target === ov) done(false); }; // tap backdrop = safe
  document.addEventListener('keydown', onKey);

  ov.style.display = 'flex';
}

if(typeof window !== 'undefined'){ window.mihbConfirm = mihbConfirm; }

// Expose globals so onclick="" handlers in index.html can find them.
if(typeof window !== 'undefined'){
  window.openMoneyIn = openMoneyIn;
  window.closeMoneyIn = closeMoneyIn;
  window.saveMoneyIn = saveMoneyIn;
  window.deleteMoneyIn = deleteMoneyIn;
  window.renderMoneyInHistory = renderMoneyInHistory;
  window._miSetSourceBank = _miSetSourceBank;
  window._miOnHeaderEdit = _miOnHeaderEdit;
  window._miResetSplit = _miResetSplit;
  window._miOnActionTap = _miOnActionTap;
  window._miOnSubsToggle = _miOnSubsToggle;
  window._miUseSaved = _miUseSaved;
}
