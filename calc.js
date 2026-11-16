// calc.js: the one place for money maths (v151y).
// Every tab reads pocket balances and pay-cycle numbers from here.
// Do not re-add inline deposit sums in other files: call fundTotal(f).

// ── fundTotal: balance of a pocket (deposits in minus out), rounded to cents ──
function fundTotal(f){
  // Rounded to cents: summing many 2-decimal amounts in binary floating point drifts
  // (a real R17.95 balance came out as 17.94999999999999, which made "move R17.95" fail).
  var t = ((f && f.deposits)||[]).reduce(function(s,d){
    var amt = Number(d.amount) || 0;
    return d.txnType==='out' ? s - amt : s + amt;
  }, 0);
  return Math.round(t * 100) / 100 + 0;   // "+ 0" turns -0 into 0
}

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
    var fromIn = mi.filter(function(r){ return planInCycle(r.date, cyc); })
      .reduce(function(s,r){
        var sp = (r.splits||[]).find(function(x){ return x.fundId === card.pocketId; });
        return s + (sp ? sp.amount : 0);
      }, 0);
    // v151s: money moved INTO this pocket from another pocket/bank this cycle also counts
    // v151x: a move only counts if made AFTER the pocket's last spend/move-out this cycle.
    // Top-ups that were then spent are not savings.
    var lastOut = '';
    // Masud monthly is an allowance meant to be spent: every move in counts.
    if(card.pocketId !== 'mm48mhq') try {
      var fl = (typeof funds !== 'undefined' ? funds : []);
      var fd = fl.find(function(f){ return f.id === card.pocketId; });
      ((fd && fd.deposits) || []).forEach(function(d){
        var dd = (d.date||'').slice(0,10);
        if(d.txnType === 'out' && planInCycle(dd, cyc) && dd > lastOut) lastOut = dd;
      });
    } catch(e){}
    var mv = (typeof loadMoveData === 'function') ? loadMoveData() : [];
    var fromMove = mv.filter(function(m){ return m.toId === card.pocketId && planInCycle(m.date, cyc) && (!lastOut || m.date.slice(0,10) > lastOut); })
      .reduce(function(s,m){ return s + (Number(m.amount)||0); }, 0);
    return Math.round((fromIn + fromMove) * 100) / 100;
  } catch(e){ return 0; }
}

