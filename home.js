// ════════════════════════════════════════════════════════════════════
// HOME.JS — Step 10 home screen
// ════════════════════════════════════════════════════════════════════
//
// Three-zone landing that replaces "default to Carpool tab" behaviour.
//
//   Zone 1: YOUR MONEY    — pocket-balance strip + 3 action buttons
//   Zone 2: NEEDS ATTENTION — Odin alerts (collapses to "all good")
//   Zone 3: EVERYWHERE ELSE — 11 tabs in 3 collapsible folders
//
// All data comes from live calls (fundTotal, buildOdinLaunchAlerts).
// Folder state persists per-device in localStorage.
//
// Wired into:
//   - index.html: <button id="navHome"> + <div id="page-home">
//   - money.js   switchTab / _renderTabSafely / _roleCanAccessTab
//   - core.js    applyRole (admin starts on home, not carpool)
//   - sw.js      SHELL_ASSETS list
// ════════════════════════════════════════════════════════════════════

// ── Folder state persistence ──
// Stored as JSON: { money:true, life:false, tools:false }
// Defaults: Money OPEN, Life + Tools collapsed (per locked design).
var HOME_FOLDER_KEY = 'yb_home_folder_state_v1';

function _homeLoadFolderState(){
  try {
    var raw = lsGet(HOME_FOLDER_KEY);
    if(!raw) return { money:true, life:false, tools:false };
    var s = JSON.parse(raw);
    return {
      money: s.money !== false,  // default open
      life:  s.life  === true,   // default closed
      tools: s.tools === true    // default closed
    };
  } catch(e){
    return { money:true, life:false, tools:false };
  }
}

function _homeSaveFolderState(state){
  try { lsSet(HOME_FOLDER_KEY, JSON.stringify(state)); } catch(e){}
}

function toggleHomeFolder(name){
  var s = _homeLoadFolderState();
  s[name] = !s[name];
  _homeSaveFolderState(s);
  // Update DOM directly — no re-render needed
  var folder = document.getElementById('home-folder-'+name);
  if(folder){
    folder.classList.toggle('open', s[name]);
  }
}


// ════════════════════════════════════════════════════════════════════
// MAIN RENDER
// ════════════════════════════════════════════════════════════════════
function renderHome(){
  var container = document.getElementById('homeContent');
  if(!container) return;

  // Build all 3 zones, concatenate, set innerHTML once (fewer reflows).
  var html = ''
    + _renderHomeZone1Money()
    + _renderHomeZone2Alerts()
    + _renderHomeZone3Folders();

  container.innerHTML = html;
}


// ════════════════════════════════════════════════════════════════════
// PLAN — dedicated tab, stored rules + live readouts + pickable sources
// (Plan Integration Brief 2026-09-05; moved off Home and made fully
// pickable 2026-09-05 per Yasin: "editable like any pocket can be picked
// ... its own tab, not the home screen"). Nothing below is hardcoded to a
// specific pocket or person -- WHICH pocket/debtor each card reads is
// itself stored data (pocketId/debtorKey), changeable via Edit Plan,
// exactly like the target numbers already were.
// ════════════════════════════════════════════════════════════════════
var PLAN_KEY = 'yb_plan_v1';
var PLAN_DEFAULTS = {
  savingsCards: [
    { id:'c1', pocketId:'lyvyib7', label:'Emergency Vault', target:63000, monthly:0 },
    { id:'c2', pocketId:'murqfqm', label:'Ee90 Car Fund',   target:5000,  monthly:1200 }
  ],
  debtCard: { debtorKey:'nuri', label:'Nuri Debt', monthly:1000 },
  stipendEnd: '2026-10-31',
  decPayDay: 18,   // v150v: December salary comes early for Christmas
  notes: '',
  // v150t: subscriptions his wife pays out of the house money (added on top in Money In)
  wifeSubs: [
    { id:'ws_mtn',    label:'MTN SuperFlex', amount:209,    day:28 },
    { id:'ws_claude', label:'Claude Pro',    amount:399.99, day:26 }
  ]
};
function loadPlan(){
  try {
    var saved = JSON.parse(lsGet(PLAN_KEY) || 'null');
    if(saved && typeof saved === 'object'){
      // Migration: v148n/v148o briefly used a flat shape (vaultTarget,
      // ee90Target, ee90Monthly, nuriMonthly as top-level numbers, no
      // savingsCards/debtCard). Detected by exactly that absence. Converts
      // any real values saved during that window instead of silently
      // reverting them to today's defaults.
      if(saved.savingsCards === undefined && typeof saved.vaultTarget === 'number'){
        saved = {
          savingsCards: [
            { id:'c1', pocketId:PLAN_DEFAULTS.savingsCards[0].pocketId, label:'Emergency Vault', target: saved.vaultTarget, monthly: 0 },
            { id:'c2', pocketId:PLAN_DEFAULTS.savingsCards[1].pocketId, label:'Ee90 Car Fund',   target: saved.ee90Target, monthly: saved.ee90Monthly }
          ],
          debtCard: { debtorKey:'nuri', label:'Nuri Debt', monthly: saved.nuriMonthly },
          stipendEnd: saved.stipendEnd,
          notes: saved.notes
        };
        savePlan(saved); // persist the migrated shape so this only ever runs once
      }
      return {
        savingsCards: Array.isArray(saved.savingsCards) ? saved.savingsCards : PLAN_DEFAULTS.savingsCards,
        debtCard: saved.debtCard || PLAN_DEFAULTS.debtCard,
        stipendEnd: saved.stipendEnd || PLAN_DEFAULTS.stipendEnd,
        notes: saved.notes || '',
        wifeSubs: Array.isArray(saved.wifeSubs) ? saved.wifeSubs : JSON.parse(JSON.stringify(PLAN_DEFAULTS.wifeSubs)),
        wifePocketId: saved.wifePocketId || null,   // v150u: pocket that carpool fills for her monthly money
        decPayDay: saved.decPayDay || PLAN_DEFAULTS.decPayDay   // v150v
      };
    }
  } catch(e){}
  return JSON.parse(JSON.stringify(PLAN_DEFAULTS)); // deep copy, defaults are nested objects/arrays now
}
function savePlan(p){ lsSet(PLAN_KEY, JSON.stringify(p)); }

var _planEditMode = false;

function _planPocketOptions(selectedId){
  var list = (typeof funds !== 'undefined' ? funds : []).filter(function(f){ return !f._deleted; });
  return list.map(function(f){
    return '<option value="'+f.id+'"'+(f.id===selectedId?' selected':'')+'>'+escHtml(f.emoji||'')+' '+escHtml(f.name)+'</option>';
  }).join('');
}
function _planDebtorOptions(selectedKey){
  var ext = (typeof loadExternalBorrows === 'function') ? loadExternalBorrows() : {};
  return Object.keys(ext).map(function(key){
    var name = (ext[key] && ext[key].name) ? ext[key].name : key;
    return '<option value="'+key+'"'+(key===selectedKey?' selected':'')+'>'+escHtml(name)+'</option>';
  }).join('');
}

function togglePlanEdit(){ _planEditMode = !_planEditMode; renderPlan(); }

// ── v150v: pay cycle = 25th → 24th ────────────────────────────────────
// Every Plan card counts "this cycle", not the calendar month. The cycle is
// always labelled 25th → 24th. It switches on the 25th by date, OR earlier on
// the day a salary Money In is logged before the 25th (weekend pay, December
// Christmas pay). A salary Money In = one with house money, or a note that says
// "salary". A salary logged on/after the 10th pays for the cycle starting the
// 25th of that month; before the 10th it's a late salary for last month's cycle.
// Expected payday (for the countdown): the 25th, or plan.decPayDay (default 18)
// in December; Saturday/Sunday moves to the Friday before.
function _planDS(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function planSalaryDates(excludeId){
  var mi = (typeof loadMoneyInData === 'function') ? loadMoneyInData() : [];
  var seen = {};
  mi.forEach(function(r){
    if(!r || !r.date || r.id === excludeId) return;
    var h = Number(r.houseTotal != null ? r.houseTotal : r.house) || 0;
    if(h > 0 || /salary/i.test(r.note||'')) seen[r.date.slice(0,10)] = true;
  });
  return Object.keys(seen).sort();
}
function _planDecPayDay(){
  try { var d = parseInt(JSON.parse(lsGet(PLAN_KEY)||'null').decPayDay, 10); return (d>=1 && d<=31) ? d : 18; } catch(e){ return 18; }
}
function _planMonth25(ds, shift){ var t = new Date(ds.slice(0,10)+'T00:00:00'); return _planDS(new Date(t.getFullYear(), t.getMonth()+(shift||0), 25)); }
// Cycle (its 25th) that a date falls in purely by the calendar.
function _planNominal(ds){ var t = new Date(ds+'T00:00:00'); return _planMonth25(ds, t.getDate() >= 25 ? 0 : -1); }
// Cycle (its 25th) that a salary logged on this date pays for.
function _planSalaryCycle(ds){ var t = new Date(ds+'T00:00:00'); return _planMonth25(ds, t.getDate() >= 10 ? 0 : -1); }
// Real start of a cycle: its 25th, or an earlier salary logged for it.
function _planEffStart(nom, dates){
  var eff = nom;
  dates.forEach(function(d){ if(d < eff && _planSalaryCycle(d) === nom) eff = d; });
  return eff;
}
function _planExpectedPay(nom){
  var t = new Date(nom+'T00:00:00');
  var p = new Date(t.getFullYear(), t.getMonth(), t.getMonth() === 11 ? _planDecPayDay() : 25);
  if(p.getDay() === 6) p.setDate(p.getDate()-1); else if(p.getDay() === 0) p.setDate(p.getDate()-2);
  return _planDS(p);
}
// opts.startOverride: treat this date as a salary day (a salary being typed right now).
function planCycleFor(dateStr, opts){
  opts = opts || {};
  var ds = (dateStr || _planDS(new Date())).slice(0,10);
  var dates = planSalaryDates(opts.excludeId);
  var ov = opts.startOverride ? opts.startOverride.slice(0,10) : null;
  if(ov && dates.indexOf(ov) < 0) dates.push(ov);
  var nom = _planNominal(ds);
  if(ov && ov === ds) nom = _planSalaryCycle(ds);                       // the salary being typed decides its own cycle
  else if(_planEffStart(_planMonth25(nom, 1), dates) <= ds) nom = _planMonth25(nom, 1);   // early salary already logged
  var nextNom = _planMonth25(nom, 1);
  var endD = new Date(nextNom+'T00:00:00'); endD.setDate(endD.getDate()-1);
  return { start:_planEffStart(nom, dates), next:_planEffStart(nextNom, dates),
           label:nom, labelEnd:_planDS(endD), nextLabel:nextNom,
           early: ds < nom, payNext:_planExpectedPay(nextNom), guessed:false };
}
function planInCycle(ds, cyc){
  if(!ds || !cyc) return false;
  ds = ds.slice(0,10);
  return ds >= cyc.start && (!cyc.next || ds < cyc.next);
}
function planCycleLabel(cyc){
  var f = function(d){ return new Date(d+'T00:00:00').toLocaleDateString('en-ZA',{day:'numeric',month:'short'}); };
  var days = Math.round((new Date(cyc.payNext+'T00:00:00') - new Date(_planDS(new Date())+'T00:00:00'))/86400000);
  return { from:f(cyc.label), to:f(cyc.labelEnd), nextFrom:f(cyc.nextLabel), pay:f(cyc.payNext),
           estimated:false, early:!!cyc.early, days:days, guessed:false };
}
// Money routed into a pocket during a cycle: carpool payments for carpool-only
// cards, Money In splits for the rest (same sources as before, cycle not month).
function planRoutedInCycle(card, cyc){
  try {
    if(card && card.source === 'carpool'){
      var pm = []; try { pm = JSON.parse(lsGet('yb_carpool_payments_v1')||'[]'); } catch(e){}
      return Math.round(pm.filter(function(p){ return planInCycle(p.date, cyc) && p.destChoice === 'fund:'+card.pocketId; })
        .reduce(function(s,p){ return s + (Number(p.amount)||0); }, 0) * 100) / 100;
    }
    var mi = (typeof loadMoneyInData === 'function') ? loadMoneyInData() : [];
    return Math.round(mi.filter(function(r){ return planInCycle(r.date, cyc); })
      .reduce(function(s,r){
        var sp = (r.splits||[]).find(function(x){ return x.fundId === card.pocketId; });
        return s + (sp ? sp.amount : 0);
      }, 0) * 100) / 100;
  } catch(e){ return 0; }
}

// ── v150t: Wife monthly card ─────────────────────────────────────────
// Reads the house money from Money In (nothing typed on the Plan tab).
// Shows the current calendar month; if nothing yet, the latest month that had house money.
var _planWifeTab = 'house';
try { _planWifeTab = localStorage.getItem('yb_plan_wife_tab') || 'house'; } catch(e){}
function setPlanWifeTab(t){
  _planWifeTab = (t === 'subs') ? 'subs' : 'house';
  try { localStorage.setItem('yb_plan_wife_tab', _planWifeTab); } catch(e){}
  renderPlan();
}
function _planWifeData(cyc){
  // v150u: by pay cycle (salary day → salary day), not calendar month.
  var mi = (typeof loadMoneyInData === 'function') ? loadMoneyInData() : [];
  var houseOf = function(r){ return Number(r.houseTotal != null ? r.houseTotal : r.house) || 0; };
  var withHouse = mi.filter(function(r){ return r.date && houseOf(r) > 0; });
  if(!withHouse.length) return null;
  var isCurrent = true;
  var inCyc = withHouse.filter(function(r){ return planInCycle(r.date, cyc); });
  if(!inCyc.length){
    isCurrent = false;
    var lastDate = withHouse.map(function(r){ return r.date.slice(0,10); }).sort().pop();
    cyc = planCycleFor(lastDate);
    inCyc = withHouse.filter(function(r){ return planInCycle(r.date, cyc); });
  }
  var r2 = function(n){ return Math.round(n*100)/100; };
  var d = { cycle:cyc, isCurrent:isCurrent, house:0, bank:0, pockets:{}, subs:[], subsTotal:0, dates:[] };
  inCyc.sort(function(a,b){ return (a.date||'').localeCompare(b.date||''); }).forEach(function(r){
    d.house += houseOf(r);
    d.bank  += Number(r.house) || 0;
    var fromPocket = houseOf(r) - (Number(r.house) || 0);   // house part paid from a pocket
    if(r.houseCash && fromPocket > 0.004){
      var pf = (typeof funds !== 'undefined' ? funds : []).find(function(f){ return f.id === r.houseCash.fundId; });
      var nm = pf ? pf.name : 'Pocket';
      d.pockets[nm] = (d.pockets[nm]||0) + fromPocket;
    }
    (r.subs||[]).forEach(function(s){ d.subs.push({ label:s.label, amount:Number(s.amount)||0 }); d.subsTotal += Number(s.amount)||0; });
    d.dates.push(r.date);
  });
  d.house = r2(d.house); d.bank = r2(d.bank); d.subsTotal = r2(d.subsTotal);
  Object.keys(d.pockets).forEach(function(k){ d.pockets[k] = r2(d.pockets[k]); });
  return d;
}
function _planWifeCardHtml(plan, cyc, cardBox, secHdr){
  var L='#c8f230', A='#f2a830', M='#888';
  var d = _planWifeData(cyc);
  var conf = (plan.wifeSubs||[]).filter(function(s){ return s && Number(s.amount) > 0; });
  var tabBtn = function(id, lbl){
    var on = _planWifeTab === id;
    return '<button onclick="setPlanWifeTab(\''+id+'\')" style="flex:1;padding:8px;border-radius:6px;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;'
      + (on ? 'background:#1a2e00;border:1px solid '+L+';color:'+L+';' : 'background:transparent;border:1px solid #2a2a2a;color:'+M+';') + '">'+lbl+'</button>';
  };
  var row = function(l, v, col){
    return '<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;color:'+(col||'#efefef')+';"><span>'+l+'</span><span>'+v+'</span></div>';
  };
  var title = 'WIFE MONTHLY';
  if(!d){
    return '<div style="'+cardBox+'">'+secHdr(title)
      + '<div style="font-size:12px;color:'+M+';line-height:1.6;">Nothing yet. Type her house money in ↓ Money In on salary day and it shows here.</div></div>';
  }
  var cl = planCycleLabel(d.cycle);
  var sub = (d.isCurrent ? 'This cycle · ' : 'Last cycle · ') + cl.from + ' → ' + cl.to;
  var total = _planWifeTab === 'subs' ? Math.round((d.house + d.subsTotal)*100)/100 : d.house;
  var head = '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">'
    + '<div><div style="font-size:12px;color:#aaa;">'+escHtml(sub)+'</div>'
    +   '<div style="font-size:10px;color:#555;margin-top:2px;letter-spacing:1px;">from Money In · '+d.dates.length+' entr'+(d.dates.length===1?'y':'ies')+'</div></div>'
    + '<div style="text-align:right;"><div style="font-size:10px;color:'+M+';letter-spacing:1px;">'+(_planWifeTab==='subs'?'TOTAL TO HER':'HOUSE')+'</div>'
    +   '<div style="font-family:Syne,sans-serif;font-weight:700;font-size:24px;color:#efefef;">'+fmtR(total)+'</div></div>'
    + '</div>';
  var tabs = '<div style="display:flex;gap:8px;margin-bottom:12px;">'+tabBtn('house','House')+tabBtn('subs','Subs added')+'</div>';
  var body = '';
  if(_planWifeTab === 'house'){
    body += row('Via bank', fmtR(d.bank));
    Object.keys(d.pockets).forEach(function(nm){ body += row('From '+escHtml(nm), fmtR(d.pockets[nm])); });
  } else {
    var pct = (d.house + d.subsTotal) > 0 ? (d.subsTotal / (d.house + d.subsTotal)) * 100 : 0;
    body += '<div style="display:flex;height:8px;border-radius:4px;overflow:hidden;background:#2a2a2a;margin-bottom:12px;">'
      + '<div style="width:'+(100-pct)+'%;background:'+L+';"></div><div style="width:'+pct+'%;background:'+A+';"></div></div>';
    body += '<div style="background:#111a00;border:1px solid #3a5a00;border-radius:8px;padding:8px 12px;margin-bottom:8px;">'
      + row('⌂ House', fmtR(d.house), L) + '</div>';
    body += '<div style="background:#1a1200;border:1px solid #5a3a00;border-radius:8px;padding:8px 12px;">';
    if(d.subs.length){
      body += row('🔒 Subscriptions', fmtR(d.subsTotal), A);
      d.subs.forEach(function(s){
        var c = conf.find(function(x){ return x.label === s.label; });
        body += row(escHtml(s.label) + (c && c.day ? ' · debits '+c.day+'th' : ''), fmtR(s.amount), '#bbb');
      });
    } else {
      body += '<div style="font-size:12px;color:'+A+';line-height:1.6;">No subscriptions were added with this cycle\'s Money In.</div>';
    }
    body += '</div>';
  }
  return '<div style="'+cardBox+'">'+secHdr(title)+head+tabs+body+'</div>';
}

function renderPlan(){
  var container = document.getElementById('planContent');
  if(!container) return;
  var plan = loadPlan();

  if(_planEditMode){ container.innerHTML = _planRenderEditForm(plan); return; }

  // ── v149q: visual redesign (display only — no data model or money logic changes) ──
  var L='#c8f230', R='#f23060', A='#f2a830', M='#888';
  var now = new Date();
  var cyc = planCycleFor(_planDS(now));   // v150v: pay cycle 25th → 24th (early salary flips it sooner)
  var cycL = planCycleLabel(cyc);
  var monthLbl = (cycL.from+' – '+cycL.to).toUpperCase();
  var cycLine = cycL.early
    ? 'Salary in early · next cycle '+cycL.from+' → '+cycL.to
    : 'Pay cycle · '+cycL.from+' → '+cycL.to+(cycL.days > 0 ? ' · payday '+(cycL.pay !== cycL.nextFrom ? cycL.pay+', ' : '')+'in '+cycL.days+' day'+(cycL.days===1?'':'s') : cycL.days === 0 ? ' · payday today' : ' · salary due');
  var allFunds = (typeof funds !== 'undefined' ? funds : []);
  var cardBox = 'background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:14px;margin-bottom:12px;';
  var secHdr = function(t, right){
    return '<div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;letter-spacing:2px;color:'+M+';margin-bottom:12px;"><span>'+t+'</span>'+(right||'')+'</div>';
  };

  // WHERE YOU STAND
  var standHtml = plan.savingsCards.map(function(c, i){
    var fund = allFunds.find(function(f){ return f.id === c.pocketId && !f._deleted; });
    var label = escHtml(String(c.label||'').trim());
    if(!fund){
      return '<div style="'+(i>0?'margin-top:16px;':'')+'font-size:12px;color:'+A+';">⚠ '+label+' — pocket not found. Tap ✎ to pick one.</div>';
    }
    var bal = fundTotal(fund);
    var pct = c.target > 0 ? Math.max(0, Math.min(100, (bal/c.target)*100)) : 0;
    var toGo = c.target > 0 ? Math.max(0, c.target - bal) : 0;
    var done = c.target > 0 && bal >= c.target;
    var right = c.target > 0 ? (done ? '<span style="color:'+L+';">Target reached</span>' : '<span style="color:'+R+';">'+fmtR(toGo)+' to go</span>') : '';
    return '<div style="'+(i>0?'margin-top:18px;':'')+'">'
      + '<div style="display:flex;justify-content:space-between;font-size:12px;"><span style="color:#aaa;">'+label+'</span>'+right+'</div>'
      + '<div style="display:flex;justify-content:space-between;align-items:baseline;margin:3px 0 8px;">'
      +   '<span style="font-family:Syne,sans-serif;font-weight:700;font-size:24px;color:#efefef;">'+fmtR(bal)+'</span>'
      +   (c.target>0 ? '<span style="font-size:11px;color:'+M+';">of '+fmtR(c.target)+' · '+pct.toFixed(1)+'%</span>' : '<span style="font-size:11px;color:'+M+';">no target set</span>')
      + '</div>'
      + (c.target>0 ? '<div style="height:8px;background:#2a2a2a;border-radius:4px;overflow:hidden;"><div style="width:'+pct+'%;height:100%;background:'+L+';border-radius:4px;"></div></div>' : '')
      + '</div>';
  }).join('');

  // Debt card
  var debtOwing = 0, debtName = plan.debtCard.label;
  try {
    var ext = (typeof loadExternalBorrows === 'function') ? loadExternalBorrows() : {};
    var person = ext[plan.debtCard.debtorKey];
    if(person){
      var totals = calcPersonTotals(person.entries || [], false);
      debtOwing = totals.borrowed - totals.repaid;
      debtName = person.name || plan.debtCard.label;
    }
  } catch(e){}
  var debtHtml = '<div style="margin-top:18px;padding-top:14px;border-top:1px solid #2a2a2a;">'
    + '<div style="display:flex;justify-content:space-between;font-size:12px;"><span style="color:#aaa;">'+escHtml(String(debtName))+'</span><span style="color:'+M+';">'+fmtR(plan.debtCard.monthly)+'/month · don\'t accelerate yet</span></div>'
    + '<div style="font-family:Syne,sans-serif;font-weight:700;font-size:24px;color:'+R+';margin-top:3px;">'+fmtR(debtOwing)+'</div>'
    + '</div>';

  // WHERE NEW MONEY GOES (same card order the Money In waterfall walks)
  var stepsHtml = '';
  plan.savingsCards.forEach(function(c, i){
    var label = escHtml(String(c.label||'').trim());
    var right, rcol = M;
    if(!c.monthly || c.monthly <= 0){ right = 'no monthly set'; }
    else {
      var rt = planRoutedInCycle(c, cyc);   // v150u: this pay cycle, not calendar month
      var srcTag = c.source === 'carpool' ? ' · carpool' : '';
      if(rt >= c.monthly){ right = fmtR(rt)+' of '+fmtR(c.monthly)+' · done this cycle'+srcTag; rcol = L; }
      else { right = fmtR(rt)+' of '+fmtR(c.monthly)+' this cycle'+srcTag; }
    }
    var dim = (!c.monthly || c.monthly <= 0) ? 'opacity:.55;' : '';
    stepsHtml += '<div style="display:flex;align-items:center;gap:12px;background:#222;border-radius:8px;padding:11px 12px;margin-bottom:6px;'+dim+'">'
      + '<span style="width:22px;height:22px;border-radius:50%;background:#2e2e2e;color:#efefef;font-size:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">'+(i+1)+'</span>'
      + '<span style="flex:1;font-size:14px;color:#efefef;">'+label+'</span>'
      + '<span style="font-size:11px;color:'+rcol+';text-align:right;">'+right+'</span></div>';
  });
  stepsHtml += '<div style="display:flex;align-items:center;gap:12px;background:'+L+';border-radius:8px;padding:11px 12px;">'
    + '<span style="width:22px;height:22px;border-radius:50%;background:#000;color:'+L+';font-size:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">'+(plan.savingsCards.length+1)+'</span>'
    + '<span style="flex:1;font-size:14px;font-weight:700;color:#000;">Everything left</span>'
    + '<span style="font-size:11px;color:#000;">your priority rules</span></div>';

  // THE MONTH (uses the stipend end date already stored in the plan)
  var monthHtml = '';
  try {
    var se = new Date(plan.stipendEnd+'T00:00:00');
    if(!isNaN(se.getTime())){
      var days = Math.round((se - new Date(now.getFullYear(), now.getMonth(), now.getDate()))/86400000);
      var seLbl = se.toLocaleDateString('en-ZA',{day:'numeric',month:'short',year:'numeric'});
      var dLbl = days > 0 ? days+' day'+(days===1?'':'s')+' to go' : (days === 0 ? 'today' : 'ended');
      monthHtml = '<div style="'+cardBox+'">'+secHdr('THE MONTH')
        + '<div style="display:flex;gap:12px;align-items:flex-start;"><span style="width:10px;height:10px;border-radius:50%;background:'+L+';margin-top:4px;flex-shrink:0;"></span>'
        + '<div><div style="font-size:14px;color:#efefef;">Stipend ends · '+seLbl+'</div><div style="font-size:11px;color:'+M+';margin-top:2px;">'+dLbl+'</div></div></div></div>';
    }
  } catch(e){}

  var auditFails = 0;
  if(typeof _auditResults !== 'undefined' && Array.isArray(_auditResults)){
    _auditResults.forEach(function(g){ (g.rows||[]).forEach(function(r){ if(r.status==='fail') auditFails++; }); });
  }
  var auditBadge = (typeof _auditResults !== 'undefined' && _auditResults)
    ? (auditFails === 0 ? 'Self-Audit clean' : 'Self-Audit has open items')
    : 'Self-Audit not yet run this session';

  container.innerHTML = ''
    + '<div class="home-zone">'
    +   '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;">'
    +     '<div><div style="font-size:10px;letter-spacing:3px;color:var(--accent);">'+monthLbl+'</div>'
    +     '<div style="font-family:Syne,sans-serif;font-weight:800;font-size:30px;color:var(--text);line-height:1.1;margin-top:2px;">The plan</div>'
    +     '<div style="font-size:11px;color:var(--muted);margin-top:6px;letter-spacing:0.5px;">'+escHtml(cycLine)+'</div></div>'
    +     '<button class="pane-toggle" onclick="togglePlanEdit()" title="Edit Plan">✎</button>'
    +   '</div>'
    +   '<div style="'+cardBox+'">'+secHdr('WHERE YOU STAND', '<span style="color:'+L+';">LIVE</span>')+standHtml+debtHtml+'</div>'
    +   _planWifeCardHtml(plan, cyc, cardBox, secHdr)
    +   '<div style="'+cardBox+'">'+secHdr('WHERE NEW MONEY GOES')+stepsHtml+'</div>'
    +   monthHtml
    +   (plan.notes ? '<div style="'+cardBox+'font-size:12px;color:#aaa;">'+escHtml(plan.notes)+'</div>' : '')
    +   '<div style="font-size:10px;color:#555;text-align:center;letter-spacing:1px;margin-top:4px;">'+auditBadge+' · figures live</div>'
    + '</div>';
}

function _planRenderEditForm(plan){
  var rows = plan.savingsCards.map(function(c, i){
    var carpool = c.source === 'carpool';
    return ''
      + '<div class="home-plan-card" data-plan-card-box="'+i+'" style="border-left:3px solid '+(carpool?'#7090f0':'#30c8f2')+';">'
      +   '<div style="display:flex;justify-content:flex-end;margin-bottom:4px;"><button type="button" onclick="planToggleRemoveCard('+i+')" data-remove-btn="'+i+'" style="background:none;border:1px solid #3a1a1a;border-radius:4px;color:#f23060;font-size:10px;letter-spacing:1px;padding:3px 8px;cursor:pointer;">✕ REMOVE CARD</button></div>'
      +   '<div class="field"><label>Label</label><input type="text" data-plan-card="'+i+'" data-field="label" value="'+escHtml(c.label)+'"/></div>'
      +   '<div class="field"><label>Pocket</label><select data-plan-card="'+i+'" data-field="pocketId">'+_planPocketOptions(c.pocketId)+'</select></div>'
      +   '<div class="field"><label>Target (R)</label><input type="number" data-plan-card="'+i+'" data-field="target" value="'+c.target+'"/></div>'
      +   '<div class="field"><label>Per pay cycle (R)</label><input type="number" data-plan-card="'+i+'" data-field="monthly" value="'+c.monthly+'"/></div>'
      +   '<div class="field"><label>Filled by</label><select data-plan-card="'+i+'" data-field="source">'
      +     '<option value=""'+(carpool?'':' selected')+'>Salary (Money In) + carpool</option>'
      +     '<option value="carpool"'+(carpool?' selected':'')+'>Carpool only</option>'
      +   '</select></div>'
      + '</div>';
  }).join('')
    + '<button type="button" onclick="planAddCard()" style="width:100%;padding:10px;margin-bottom:12px;background:none;border:1px dashed #30c8f2;border-radius:6px;color:#30c8f2;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;">＋ Add savings card</button>';

  var debtRow = ''
    + '<div class="home-plan-card" style="border-left:3px solid #f23060;">'
    +   '<div class="field"><label>Debt label</label><input type="text" id="planDebtLabel" value="'+escHtml(plan.debtCard.label)+'"/></div>'
    +   '<div class="field"><label>Person</label><select id="planDebtorKey">'+_planDebtorOptions(plan.debtCard.debtorKey)+'</select></div>'
    +   '<div class="field"><label>Monthly repayment (R)</label><input type="number" id="planDebtMonthly" value="'+plan.debtCard.monthly+'"/></div>'
    + '</div>';

  // v150t: wife's subscriptions (added on top of the house money in Money In).
  // Blank label or R0 removes a row; the empty last row adds a new one.
  var subRows = (plan.wifeSubs||[]).concat([{ id:'', label:'', amount:'', day:'' }]).map(function(s, i){
    return '<div style="display:flex;gap:6px;margin-bottom:6px;">'
      + '<input type="text" data-wife-sub="'+i+'" data-field="label" data-id="'+escHtml(s.id||'')+'" value="'+escHtml(s.label||'')+'" placeholder="New subscription" style="flex:2;min-width:0;"/>'
      + '<input type="number" step="0.01" data-wife-sub="'+i+'" data-field="amount" value="'+(s.amount===''?'':s.amount)+'" placeholder="R" style="flex:1;min-width:0;"/>'
      + '<input type="number" min="1" max="31" data-wife-sub="'+i+'" data-field="day" value="'+(s.day||'')+'" placeholder="Day" style="width:58px;"/>'
      + '</div>';
  }).join('');
  // v150u: the pocket carpool fills for her monthly money (used by Money In's "part paid from a pocket").
  var wifePocketOpts = '<option value="">— none —</option>' + (typeof funds !== 'undefined' ? funds : []).filter(function(f){ return !f._deleted; }).map(function(f){
    return '<option value="'+f.id+'"'+(f.id===plan.wifePocketId?' selected':'')+'>'+escHtml((f.emoji||'')+' '+f.name)+'</option>';
  }).join('');
  var wifeSetupBtn = plan.wifePocketId ? '' :
    '<button type="button" onclick="planSetupWifePocket()" style="width:100%;padding:10px;margin-top:8px;background:#1a1200;border:1px solid #5a3a00;border-radius:6px;color:#f2a830;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;">＋ Create "Wife monthly" pocket + card</button>'
    + '<div style="font-size:10px;color:var(--muted);margin-top:6px;letter-spacing:0.5px;line-height:1.5;">Makes a new pocket and a carpool-only Plan card with target house + subscriptions.</div>';
  var subsBox = ''
    + '<div class="home-plan-card" style="border-left:3px solid #f2a830;">'
    +   '<div class="field"><label>Wife monthly · subscriptions she pays</label>'
    +   '<div style="font-size:10px;color:var(--muted);margin-bottom:8px;letter-spacing:1px;">Added on top of the house money in Money In. Clear a name to remove it.</div>'
    +   subRows + '</div>'
    +   '<div class="field"><label>Pocket you save her money in</label><select id="planWifePocket">'+wifePocketOpts+'</select>'
    +   wifeSetupBtn + '</div>'
    + '</div>';

  return ''
    + '<div class="home-zone">'
    +   '<div class="home-zone-hdr"><div class="home-zone-title">🎯 Edit Plan</div>'
    +     '<button class="pane-toggle" onclick="togglePlanEdit()" title="Cancel">✕</button></div>'
    +   '<div class="home-plan-cards">'+rows+debtRow+subsBox+'</div>'
    +   '<div class="field"><label>Stipend end date</label><input type="date" id="planStipendEnd" value="'+plan.stipendEnd+'"/></div>'
    +   '<div class="field"><label>December pay day</label><input type="number" min="1" max="31" id="planDecPayDay" value="'+(plan.decPayDay||18)+'"/>'
    +   '<div style="font-size:10px;color:var(--muted);margin-top:4px;letter-spacing:0.5px;">Christmas pay comes early. Only moves the countdown; logging the salary starts the new cycle.</div></div>'
    +   '<div class="field"><label>Notes (optional)</label><input type="text" id="planNotesInput" value="'+escHtml(plan.notes||'')+'" placeholder="e.g. reassess after provident fund payout"/></div>'
    +   '<button onclick="savePlanFromForm()" style="width:100%;padding:12px;background:#c8f230;border:none;border-radius:6px;color:#000;font-family:\'DM Mono\',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;font-weight:700;">💾 Save Plan</button>'
    + '</div>';
}

// v150u: read the edit form into a plan object (shared by Save, Add card, Set up pocket).
function _planCollectForm(plan){
  var removed = {};
  document.querySelectorAll('[data-plan-card-box]').forEach(function(box){
    if(box.getAttribute('data-removed') === '1') removed[box.getAttribute('data-plan-card-box')] = true;
  });
  document.querySelectorAll('[data-plan-card]').forEach(function(el){
    var i = parseInt(el.getAttribute('data-plan-card'), 10);
    var field = el.getAttribute('data-field');
    if(!plan.savingsCards[i]) return;
    plan.savingsCards[i][field] = (field==='target'||field==='monthly') ? (parseFloat(el.value)||0) : el.value;
  });
  plan.savingsCards = plan.savingsCards.filter(function(c, i){ return !removed[i]; });
  plan.savingsCards.forEach(function(c){ if(!c.source) delete c.source; });
  plan.debtCard.label = document.getElementById('planDebtLabel').value;
  plan.debtCard.debtorKey = document.getElementById('planDebtorKey').value;
  plan.debtCard.monthly = parseFloat(document.getElementById('planDebtMonthly').value) || 0;
  plan.stipendEnd = document.getElementById('planStipendEnd').value || PLAN_DEFAULTS.stipendEnd;
  var dpd = document.getElementById('planDecPayDay');
  if(dpd){ var dv = parseInt(dpd.value,10); plan.decPayDay = (dv>=1 && dv<=31) ? dv : 18; }
  plan.notes = document.getElementById('planNotesInput').value.trim();
  // v150t: wife's subscriptions
  var subs = {};
  document.querySelectorAll('[data-wife-sub]').forEach(function(el){
    var i = el.getAttribute('data-wife-sub');
    subs[i] = subs[i] || {};
    var f = el.getAttribute('data-field');
    if(f === 'label'){ subs[i].label = el.value.trim(); subs[i].id = el.getAttribute('data-id') || ''; }
    else subs[i][f] = el.value;
  });
  plan.wifeSubs = Object.keys(subs).sort(function(a,b){ return a-b; }).map(function(k){
    var s = subs[k];
    var amt = Math.round((parseFloat(s.amount)||0)*100)/100;
    var day = parseInt(s.day,10);
    return { id: s.id || ('ws_'+uid()), label: s.label||'', amount: amt, day: (day>=1 && day<=31) ? day : null };
  }).filter(function(s){ return s.label && s.amount > 0; });
  var wp = document.getElementById('planWifePocket');
  if(wp) plan.wifePocketId = wp.value || null;
  return plan;
}

function savePlanFromForm(){
  var plan = _planCollectForm(loadPlan());
  savePlan(plan);
  _planEditMode = false;
  renderPlan();
}

function planToggleRemoveCard(i){
  var box = document.querySelector('[data-plan-card-box="'+i+'"]');
  if(!box) return;
  var on = box.getAttribute('data-removed') !== '1';
  box.setAttribute('data-removed', on ? '1' : '0');
  box.style.opacity = on ? '.35' : '1';
  var b = document.querySelector('[data-remove-btn="'+i+'"]');
  if(b) b.textContent = on ? '↺ KEEP CARD' : '✕ REMOVE CARD';
}

function planAddCard(){
  var plan = _planCollectForm(loadPlan());
  var first = (typeof funds !== 'undefined' ? funds : []).find(function(f){ return !f._deleted; });
  plan.savingsCards.push({ id:'c'+uid(), pocketId: first ? first.id : '', label:'New card', target:0, monthly:0 });
  savePlan(plan);
  renderPlan();   // stays in edit mode
}

// One tap: new pocket "Wife monthly" + carpool-only Plan card, target = last house amount + subscriptions.
function planSetupWifePocket(){
  var plan = _planCollectForm(loadPlan());
  if(typeof funds === 'undefined' || !Array.isArray(funds)) return;
  var used = {}; funds.forEach(function(f){ if(f.emoji) used[f.emoji] = true; });
  var pick = ['💍','🎁','🛒','💎','🔑'].find(function(e){ return !used[e]; }) || '💍';
  var subsTotal = (plan.wifeSubs||[]).reduce(function(s,x){ return s + (Number(x.amount)||0); }, 0);
  var lastHouse = 0;
  try {
    var mi = (typeof loadMoneyInData === 'function') ? loadMoneyInData() : [];
    var last = mi.filter(function(r){ return (r.houseTotal != null ? r.houseTotal : r.house) > 0; })
                 .sort(function(a,b){ return (b.date||'').localeCompare(a.date||''); })[0];
    if(last) lastHouse = Number(last.houseTotal != null ? last.houseTotal : last.house) || 0;
  } catch(e){}
  var target = Math.round((lastHouse + subsTotal) * 100) / 100;
  var input = prompt('Target for her monthly money (house + subscriptions):', target ? String(target) : '');
  if(input === null) return;
  target = Math.round((parseFloat(input) || 0) * 100) / 100;
  if(!(target > 0)){ alert('Enter a target above R0.'); return; }
  var f = {
    id: uid(), name: 'Wife monthly', emoji: pick, color: '#f2a830',
    goal: target, weekly: 0, targetType: 'monthly',
    start: _planDS(new Date()), deadline: '2050-12-31',
    deposits: [], isExpense: false
  };
  funds.push(f);
  saveFunds();
  plan.savingsCards.push({ id:'c'+uid(), pocketId: f.id, label:'Wife monthly', target: target, monthly: target, source:'carpool' });
  plan.wifePocketId = f.id;
  savePlan(plan);
  try { renderFunds(); } catch(e){}
  renderPlan();
}

function _renderHomeZone1Money(){
  // Source of truth: same fundTotal calc the savings tab uses.
  // Excludes soft-deleted funds (same as renderFunds).
  var visibleFunds = (typeof funds !== 'undefined' && funds)
    ? funds.filter(function(f){ return !f._deleted; })
    : [];

  var grandTotal = 0;
  var heldMap = {};          // v149w: name -> money held for someone else
  var pocketCards = '';

  visibleFunds.forEach(function(f){
    var bal = (typeof fundTotal === 'function') ? fundTotal(f) : 0;
    var heldName = (f.heldFor || '').trim();
    if(heldName){ heldMap[heldName] = (heldMap[heldName] || 0) + bal; }
    else { grandTotal += bal; }

    var isZero = bal === 0;
    var isExpense = !!f.isExpense;
    var balColor = isZero ? 'var(--muted2)'
                 : isExpense ? '#f2c830'
                 : 'var(--text)';
    var borderColor = isExpense ? '#3a2a00' : 'var(--border)';

    pocketCards += ''
      + '<div class="home-pocket-card'+(heldName?' home-pocket-held':'')+'" style="border-color:'+(heldName?'#4a3000':borderColor)+';" onclick="_homeOpenPocket(\''+f.id+'\')">'
      +   '<span class="home-pocket-emoji">'+(f.emoji||'💰')+'</span>'
      +   '<div class="home-pocket-name" title="'+escHtml(f.name)+'">'+escHtml(f.name)+'</div>'
      +   '<div class="home-pocket-bal" style="color:'+(heldName?'#f2a830':balColor)+';">'+fmtR(bal)+'</div>'
      +   (heldName ? '<div class="home-pocket-held-tag">HELD · '+escHtml(heldName)+'</div>' : '')
      + '</div>';
  });
  grandTotal = Math.round(grandTotal * 100) / 100;
  var heldLine = Object.keys(heldMap).map(function(n){
    return '+ '+fmtR(Math.round(heldMap[n]*100)/100)+' held for '+escHtml(n);
  }).join(' · ');

  var bankNote = visibleFunds.length+' pockets · banks R0';

  return ''
    + '<div class="home-zone">'
    +   '<div class="home-zone-hdr">'
    +     '<div class="home-zone-title">💰 Your money'
    +       '<button class="info-btn" onclick="openInfo(\'Your Money\', \'Your money lives in pockets, not in your bank. Banks stay at R0 by design — money just passes through. Tap a pocket to see its history.\\n\\nUse the 3 buttons below: Money In when you get paid, Spend when you buy something, Move to shift money between pockets.\')">ⓘ</button>'
    +     '</div>'
    +     '<div class="home-zone-meta">'+bankNote+'</div>'
    +   '</div>'
    +   '<div class="home-total-line">'+fmtR(grandTotal)+'<small>'+(heldLine ? 'your own money' : 'across pockets')+'</small></div>'
    +   (heldLine ? '<div style="font-size:12px;color:#f2a830;margin:-4px 0 10px;">'+heldLine+'</div>' : '')
    +   '<div class="home-pocket-strip">'+pocketCards+'</div>'
    +   '<div class="home-money-actions">'
    +     '<button class="home-money-btn in"    onclick="openMoneyIn()"><span class="home-money-btn-icon">↓</span>Money In</button>'
    +     '<button class="home-money-btn spend" onclick="openSpend()"><span class="home-money-btn-icon">↑</span>Spend</button>'
    +     '<button class="home-money-btn move"  onclick="openMove()"><span class="home-money-btn-icon">🔄</span>Move</button>'
    +   '</div>'
    + '</div>';
}

// Tapping a pocket card jumps to the Savings tab and scrolls to that fund.
function _homeOpenPocket(fundId){
  try {
    goToTab('savings');
    setTimeout(function(){
      var card = document.querySelector('.fund-card[data-fund-id="'+fundId+'"]');
      if(card){
        card.scrollIntoView({behavior:'smooth', block:'center'});
        card.style.transition = 'box-shadow .5s';
        card.style.boxShadow = '0 0 18px rgba(200,242,48,.4)';
        setTimeout(function(){ card.style.boxShadow = ''; }, 1200);
      }
    }, 200);
  } catch(e){}
}


// ════════════════════════════════════════════════════════════════════
// ALERT STATE (snooze + dismiss) — v112
// ════════════════════════════════════════════════════════════════════
// Storage: { [alertKey]: { state: 'snoozed'|'dismissed', until: ISO|null } }
// alertKey = tab + '|' + text. Text-based means amount change = new alert.
var _ALERT_STATE_KEY = 'yb_alert_state_v1';

function _alertKey(a){
  return (a.tab || '') + '|' + (a.text || '');
}
function _alertLoadState(){
  try { return JSON.parse(lsGet(_ALERT_STATE_KEY) || '{}') || {}; }
  catch(e){ return {}; }
}
function _alertSaveState(s){
  try { lsSet(_ALERT_STATE_KEY, JSON.stringify(s)); } catch(e){}
}
function _alertSnooze(a, days){
  var state = _alertLoadState();
  var until = new Date();
  until.setDate(until.getDate() + days);
  state[_alertKey(a)] = { state:'snoozed', until: until.toISOString() };
  _alertSaveState(state);
}
function _alertDismiss(a){
  var state = _alertLoadState();
  state[_alertKey(a)] = { state:'dismissed', until:null };
  _alertSaveState(state);
}
function _alertGarbageCollect(state, currentAlerts){
  // Lazy cleanup: remove expired snoozes; also drop dismiss/snooze entries
  // for alerts that no longer appear at all (situation resolved naturally)
  var now = new Date();
  var liveKeys = {};
  currentAlerts.forEach(function(a){ liveKeys[_alertKey(a)] = true; });
  var changed = false;
  Object.keys(state).forEach(function(k){
    var s = state[k];
    if(s.state === 'snoozed' && s.until && new Date(s.until) <= now){
      delete state[k]; changed = true;
    } else if(!liveKeys[k]){
      // Alert isn't being generated anymore — situation resolved
      delete state[k]; changed = true;
    }
  });
  if(changed) _alertSaveState(state);
  return state;
}

// ════════════════════════════════════════════════════════════════════
// ZONE 2: NEEDS ATTENTION (Odin alerts)
// ════════════════════════════════════════════════════════════════════
function _renderHomeZone2Alerts(){
  var allAlerts = [];
  try {
    if(typeof buildOdinLaunchAlerts === 'function'){
      allAlerts = buildOdinLaunchAlerts() || [];
    }
  } catch(e){ allAlerts = []; }

  // Filter to red/amber/green (visible levels)
  allAlerts = allAlerts.filter(function(a){
    return a && (a.level === 'red' || a.level === 'amber' || a.level === 'green');
  });

  // v112: filter snoozed/dismissed, count snoozed for footer indicator
  var state = _alertLoadState();
  state = _alertGarbageCollect(state, allAlerts);
  var snoozedCount = 0;
  var dismissedCount = 0;
  var alerts = allAlerts.filter(function(a){
    var s = state[_alertKey(a)];
    if(s && s.state === 'dismissed'){ dismissedCount++; return false; }
    if(s && s.state === 'snoozed' && s.until && new Date(s.until) > new Date()){
      snoozedCount++; return false;
    }
    return true;
  });

  // "All good" state — no alerts at all
  if(alerts.length === 0){
    return ''
      + '<div class="home-zone">'
      +   '<div class="home-zone-hdr">'
      +     '<div class="home-zone-title">⚠ Needs attention<button class="info-btn" onclick="openInfo(\'Needs Attention\', \'Odin watches for things that need your attention — upcoming debits, services due, money people owe you.\\n\\nRed dot = action soon. Amber = keep an eye. Green = nice to know.\\n\\nTap any alert to open the specific item, not the generic tab.\')">ⓘ</button></div>'
      +     '<div class="home-zone-meta">all clear</div>'
      +   '</div>'
      +   '<div class="home-alerts home-all-good">'
      +     '<div class="home-ok-line">✓ <strong>All good</strong> — nothing needs your attention</div>'
      +   '</div>'
      + '</div>';
  }

  // Show first 3, with "View all" link if more
  var visibleAlerts = alerts.slice(0, 3);
  var hiddenCount = alerts.length - visibleAlerts.length;

  var alertRows = visibleAlerts.map(function(a, i){
    var dotClass = a.level;  // red/amber/green
    var tabName = a.tab || '';
    // Build action buttons row (only if alert has actions)
    var actionsHtml = '';
    var btns = '';
    if(a.actions && a.actions.length){
      btns = a.actions.map(function(act, j){
        var label = escHtml(act.label || 'Action');
        return '<button class="home-alert-btn" onclick="event.stopPropagation();_homeAlertAction('+i+','+j+')">'+label+'</button>';
      }).join('');
    }
    // Always show snooze + dismiss
    btns += '<span class="home-alert-spacer"></span>';
    btns += '<button class="home-alert-mbtn" title="Snooze" onclick="event.stopPropagation();_homeAlertSnoozeOpen('+i+')">😴</button>';
    btns += '<button class="home-alert-mbtn" title="Dismiss" onclick="event.stopPropagation();_homeAlertDismiss('+i+')">✕</button>';
    actionsHtml = '<div class="home-alert-actions">'+btns+'</div>';
    actionsHtml += '<div class="home-alert-snooze-picker" id="snoozePick_'+i+'" style="display:none;">'
      + '<span class="home-alert-snooze-lbl">Snooze for:</span>'
      + '<button class="home-alert-btn" onclick="event.stopPropagation();_homeAlertSnoozeDo('+i+',1)">1 day</button>'
      + '<button class="home-alert-btn" onclick="event.stopPropagation();_homeAlertSnoozeDo('+i+',3)">3 days</button>'
      + '<button class="home-alert-btn" onclick="event.stopPropagation();_homeAlertSnoozeDo('+i+',7)">1 week</button>'
      + '<button class="home-alert-mbtn" onclick="event.stopPropagation();_homeAlertSnoozeCancel('+i+')">✕</button>'
      + '</div>';
    return ''
      + '<div class="home-alert-row" data-idx="'+i+'">'
      +   '<div class="home-alert-main" onclick="_homeAlertClick('+i+')">'
      +     '<div class="home-alert-dot '+dotClass+'"></div>'
      +     '<div class="home-alert-body">'
      +       '<div class="home-alert-text">'+escHtml(a.text||'')+'</div>'
      +       (tabName ? '<div class="home-alert-meta">'+escHtml(tabName)+'</div>' : '')
      +     '</div>'
      +     '<span class="home-alert-chev">›</span>'
      +   '</div>'
      +   actionsHtml
      + '</div>';
  }).join('');

  var footRow = '';
  // v112: snoozed-count indicator (so user knows things are hidden)
  if(snoozedCount > 0){
    footRow += '<div class="home-alerts-foot home-alerts-snoozed"><a onclick="_homeAlertWakeAll()">🕓 '+snoozedCount+' snoozed — tap to wake</a></div>';
  }
  if(hiddenCount > 0){
    footRow += '<div class="home-alerts-foot"><a onclick="goToTab(\'odin\')">View all ('+hiddenCount+' more) →</a></div>';
  } else {
    footRow += '<div class="home-alerts-foot"><a onclick="goToTab(\'odin\')">Open Odin insights →</a></div>';
  }

  // Stash alerts on window so click handlers can fire their action fn
  window._homeAlertsCache = alerts;

  return ''
    + '<div class="home-zone">'
    +   '<div class="home-zone-hdr">'
    +     '<div class="home-zone-title">⚠ Needs attention<button class="info-btn" onclick="openInfo(\'Needs Attention\', \'Odin watches for things that need your attention — upcoming debits, services due, money people owe you.\\n\\nRed dot = action soon. Amber = keep an eye. Green = nice to know.\\n\\nTap any alert to open the specific item, not the generic tab.\')">ⓘ</button></div>'
    +     '<div class="home-zone-meta">'+alerts.length+(alerts.length===1?' item':' items')+'</div>'
    +   '</div>'
    +   '<div class="home-alerts">'+alertRows+footRow+'</div>'
    + '</div>';
}

function _homeAlertClick(idx){
  try {
    var a = (window._homeAlertsCache||[])[idx];
    if(!a) return;
    // Prefer the alert's primary action; fall back to goToTab(a.tab)
    if(a.actions && a.actions.length && typeof a.actions[0].fn === 'function'){
      a.actions[0].fn();
    } else if(a.tab){
      goToTab(a.tab);
    }
  } catch(e){}
}

function _homeAlertAction(alertIdx, actionIdx){
  // v111: fire a specific action button on an alert row
  try {
    var a = (window._homeAlertsCache||[])[alertIdx];
    if(!a || !a.actions || !a.actions[actionIdx]) return;
    var act = a.actions[actionIdx];
    if(typeof act.fn === 'function') act.fn();
  } catch(e){}
}

// ── v112: Snooze + Dismiss handlers ───────────────────────────────
function _homeAlertSnoozeOpen(idx){
  // Show the inline snooze picker for this alert
  var p = document.getElementById('snoozePick_'+idx);
  if(p) p.style.display = 'flex';
}
function _homeAlertSnoozeCancel(idx){
  var p = document.getElementById('snoozePick_'+idx);
  if(p) p.style.display = 'none';
}
function _homeAlertSnoozeDo(idx, days){
  try {
    var a = (window._homeAlertsCache||[])[idx];
    if(!a) return;
    _alertSnooze(a, days);
    if(typeof renderHome === 'function') renderHome();
    // Brief feedback toast
    _homeToast('Snoozed for ' + days + (days===1?' day':' days'));
  } catch(e){}
}
function _homeAlertDismiss(idx){
  try {
    var a = (window._homeAlertsCache||[])[idx];
    if(!a) return;
    _alertDismiss(a);
    if(typeof renderHome === 'function') renderHome();
    _homeToast('Dismissed');
  } catch(e){}
}
function _homeAlertWakeAll(){
  // Clear all snoozes (keep dismisses — those are deliberate)
  var state = _alertLoadState();
  var changed = false;
  Object.keys(state).forEach(function(k){
    if(state[k].state === 'snoozed'){ delete state[k]; changed = true; }
  });
  if(changed){
    _alertSaveState(state);
    if(typeof renderHome === 'function') renderHome();
    _homeToast('All snoozed alerts woken');
  }
}
function _homeToast(msg){
  // Lightweight toast — auto-fades after 2s
  var t = document.createElement('div');
  t.className = 'home-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function(){ t.style.opacity = '0'; }, 1500);
  setTimeout(function(){ if(t.parentNode) t.parentNode.removeChild(t); }, 2000);
}


// ════════════════════════════════════════════════════════════════════
// ZONE 3: EVERYWHERE ELSE (3 collapsible folders, 11 tabs)
// ════════════════════════════════════════════════════════════════════
function _renderHomeZone3Folders(){
  var state = _homeLoadFolderState();

  // Tab layout per locked design
  var folders = [
    {
      key: 'money', icon: '💵', name: 'Money', open: state.money,
      tabs: [
        { id:'cashflow',    icon:'💵', label:'Cash Flow' },
        { id:'savings',     icon:'💰', label:'Savings' },
        { id:'money',       icon:'🤝', label:'Money Owed' },
        { id:'instalments', icon:'💳', label:'Instalments' },
        { id:'carpool',     icon:'🚗', label:'Carpool' }
      ]
    },
    {
      key: 'life', icon: '🌱', name: 'Life', open: state.life,
      tabs: [
        { id:'prayer',  icon:'🕌', label:'Prayer Tracker' },
        { id:'routine', icon:'🔁', label:'Routine' },
        { id:'school',  icon:'🎓', label:'School' }
      ]
    },
    {
      key: 'tools', icon: '🔧', name: 'Tools', open: state.tools,
      tabs: [
        { id:'cars',    icon:'🚗', label:'Cars' },
        { id:'reports', icon:'📊', label:'Reports' },
        // Odin Chat — opens the AI modal, not a tab
        { id:'__odinchat__', icon:'🧠', label:'Odin Chat' }
      ]
    }
  ];

  var html = ''
    + '<div class="home-zone">'
    +   '<div class="home-zone-hdr">'
    +     '<div class="home-zone-title">📁 Everywhere else'
    +       '<button class="info-btn" onclick="openInfo(\'Everywhere Else\', \'All your tabs grouped into 3 folders by purpose.\\n\\nMoney tabs are open by default. Life and Tools are collapsed to keep things tidy.\\n\\nTap any folder header to expand or collapse. Your choice gets saved — next time you open the app, folders are how you left them.\')">ⓘ</button>'
    +     '</div>'
    +     '<div class="home-zone-meta">11 tabs · 3 folders</div>'
    +   '</div>';

  folders.forEach(function(folder){
    var openCls = folder.open ? ' open' : '';
    var tabRows = folder.tabs.map(function(t){
      var onclickFn = (t.id === '__odinchat__')
        ? "if(typeof openAIAssistant==='function') openAIAssistant();"
        : "goToTab('"+t.id+"')";
      return ''
        + '<div class="home-tab-row" onclick="'+onclickFn+'">'
        +   '<span class="home-tab-icon">'+t.icon+'</span>'
        +   '<span class="home-tab-label">'+t.label+'</span>'
        +   '<span class="home-tab-arrow">›</span>'
        + '</div>';
    }).join('');

    html += ''
      + '<div class="home-folder'+openCls+'" id="home-folder-'+folder.key+'">'
      +   '<div class="home-folder-hdr" onclick="toggleHomeFolder(\''+folder.key+'\')">'
      +     '<div class="home-folder-title">'
      +       '<span class="home-folder-icon">'+folder.icon+'</span>'
      +       '<span class="home-folder-name">'+folder.name+'</span>'
      +       '<span class="home-folder-count">'+folder.tabs.length+'</span>'
      +     '</div>'
      +     '<span class="home-folder-chev">▶</span>'
      +   '</div>'
      +   '<div class="home-folder-body">'+tabRows+'</div>'
      + '</div>';
  });

  html += '</div>';
  return html;
}

