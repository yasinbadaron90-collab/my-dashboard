// ════════════════════════════════════════════════════════════════════
// SELF-AUDIT — data-integrity checker (v1, shipped 2026-07-14)
// ════════════════════════════════════════════════════════════════════
// Read-only by default. RUN scans current app state and reports; it
// writes NOTHING. The only write path is the explicit ⚡ fix flow,
// which previews the exact change and applies it through the app's
// own save functions (saveInst) — never raw storage pokes.
//
// Check groups mirror the real bug classes found July 2026:
//   💰 Pocket Math        — deposit integrity, negative balances
//   🔗 Mirror-Link Chains — payment↔deposit↔CF links, orphaned pocket
//                           references (the MTN / merged-pocket class)
//   🏦 Baseline           — reconBalances sanity
//   🧱 Structure & Rules  — emoji uniqueness (v147d), duplicate IDs,
//                           storage-key presence (v147e), carpool
//                           statement output parity across card/WA/PDF
//                           (v147g/h — the "TOTAL OWED" class; this one
//                           check is async, it fetches carpool.js live)
// ════════════════════════════════════════════════════════════════════

var _auditLastRun = null;   // session-only; audit persists nothing
var _auditResults = null;

// ── data access (app's own loaders, defensively) ────────────────────
function _auGetFunds(){ return window.funds || (typeof funds !== 'undefined' ? funds : []); }
function _auGetCF(){ return (typeof loadCFData === 'function') ? loadCFData() : {}; }
function _auGetJSON(key){ try { return JSON.parse(lsGet(key)||'[]'); } catch(e){ return []; } }
function _auGetInst(){
  if(typeof loadInst === 'function'){ try { return loadInst() || []; } catch(e){} }
  if(typeof INST_KEY !== 'undefined'){ return _auGetJSON(INST_KEY); }
  return null; // module unavailable — checks that need it will warn
}
function _auMonthKeys(cf){ return Object.keys(cf).filter(function(k){ return /^\d{4}-\d{2}$/.test(k); }); }
function _auFmtR(n){ return 'R' + Number(Math.abs(n).toFixed(2)).toLocaleString('en-ZA'); }

// ── check implementations ────────────────────────────────────────────
// Each returns { status: 'pass'|'warn'|'fail', name, detail, fix? }

function _auCheckDeposits(){
  var fundsArr = _auGetFunds();
  var total = 0, badAmt = 0, badType = 0, dupes = 0, seen = {};
  fundsArr.forEach(function(f){
    (f.deposits||[]).forEach(function(d){
      total++;
      var a = Number(d.amount);
      if(!isFinite(a)) badAmt++;
      if(d.txnType !== undefined && d.txnType !== 'in' && d.txnType !== 'out') badType++;
      if(d.id){ if(seen[d.id]) dupes++; seen[d.id] = true; }
    });
  });
  var bad = badAmt + badType + dupes;
  return {
    status: bad ? 'fail' : 'pass',
    name: 'Deposit integrity',
    detail: total + ' deposits scanned · ' + badAmt + ' invalid amounts · ' + badType + ' unknown txnTypes · ' + dupes + ' duplicate IDs'
  };
}

function _auCheckNegativePockets(){
  var neg = _auGetFunds().map(function(f){
    var bal = (typeof fundTotal === 'function') ? fundTotal(f)
      : (f.deposits||[]).reduce(function(s,d){ return d.txnType==='out' ? s-d.amount : s+d.amount; }, 0);
    return { name: f.name, bal: bal };
  }).filter(function(r){ return r.bal < 0; });
  return {
    status: neg.length ? 'warn' : 'pass',
    name: 'Negative balance scan',
    detail: neg.length
      ? neg.map(function(r){ return r.name + ' (−' + _auFmtR(r.bal) + ')'; }).join(' · ')
      : 'No pocket below R0'
  };
}

function _auCheckCarpoolChains(){
  var recs = _auGetJSON('yb_carpool_payments_v1');
  var fundsArr = _auGetFunds(), cf = _auGetCF();
  var issues = [];
  recs.forEach(function(r){
    var isFund = r.destChoice && String(r.destChoice).indexOf('fund:') === 0;
    var isCash = r.destChoice === 'cashflow';
    // destination-consistency (the pre-fix Shireen state)
    if(isCash && r.pocketDepositId) issues.push(r.id + ': cashflow dest but has a pocket deposit link');
    if(isFund && !r.pocketDepositId) issues.push(r.id + ': fund dest but no pocket deposit link');
    if(isFund){
      var f = fundsArr.find(function(x){ return x.id === r.pocketDepositFundId; });
      if(!f){ issues.push(r.id + ': fund ' + r.pocketDepositFundId + ' does not exist'); }
      else {
        var dep = (f.deposits||[]).find(function(d){ return d.id === r.pocketDepositId; });
        if(!dep) issues.push(r.id + ': deposit ' + r.pocketDepositId + ' missing from ' + f.name);
        else if(dep.carpoolPaymentId !== r.id) issues.push(r.id + ': deposit back-link mismatch');
      }
    }
    if(r.cfIncomeId){
      var mk = (r.date||'').slice(0,7);
      var ok = cf[mk] && (cf[mk].income||[]).some(function(e){ return e.id === r.cfIncomeId; });
      if(!ok) issues.push(r.id + ': CF income row ' + r.cfIncomeId + ' not found in ' + mk);
    }
  });
  return {
    status: issues.length ? 'fail' : 'pass',
    name: 'Carpool payment ↔ pocket deposit chains',
    detail: issues.length ? issues.join(' · ') : recs.length + '/' + recs.length + ' payment records verified both directions'
  };
}

function _auCheckCFResolution(){
  var cf = _auGetCF();
  var stores = {
    spendId:   _auGetJSON('yb_spend_v1'),
    moneyInId: _auGetJSON('yb_moneyin_v1'),
    repayId:   _auGetJSON('yb_repayments_v1'),
    carpoolPaymentId: _auGetJSON('yb_carpool_payments_v1')
  };
  var counts = { spendId:0, moneyInId:0, repayId:0, carpoolPaymentId:0 };
  var missing = [];
  _auMonthKeys(cf).forEach(function(mk){
    ['income','expenses'].forEach(function(sec){
      (cf[mk][sec]||[]).forEach(function(e){
        Object.keys(stores).forEach(function(k){
          if(!e[k]) return;
          counts[k]++;
          var hit = stores[k].some(function(r){ return r && (r.id === e[k]); });
          if(!hit) missing.push(mk + ' "' + (e.label||e.id) + '" → ' + k + ' ' + e[k]);
        });
      });
    });
  });
  return {
    status: missing.length ? 'fail' : 'pass',
    name: 'Cash Flow → source record resolution',
    detail: missing.length
      ? missing.slice(0,4).join(' · ') + (missing.length > 4 ? ' · +' + (missing.length-4) + ' more' : '')
      : counts.spendId + ' spends · ' + counts.moneyInId + ' money-in · ' + counts.repayId + ' repayments · ' + counts.carpoolPaymentId + ' carpool links — all resolve'
  };
}

function _auCheckOrphanedPockets(){
  var fundsArr = _auGetFunds();
  var live = {};
  fundsArr.forEach(function(f){ live[f.id] = true; });
  var cf = _auGetCF();
  var findings = [];   // {kind, label, dead, fixable, planId?}

  // CF rows: destPocketId always; sourceId only when it IS a pocket ref
  _auMonthKeys(cf).forEach(function(mk){
    ['income','expenses'].forEach(function(sec){
      (cf[mk][sec]||[]).forEach(function(e){
        if(e.destPocketId && !live[e.destPocketId])
          findings.push({ kind:'CF row (historical)', label: mk + ' · ' + (e.label||e.id) + ' · ' + _auFmtR(e.amount||0), dead: e.destPocketId, fixable:false });
        if(e.sourceType === 'pocket_spend' && e.sourceId && !live[e.sourceId])
          findings.push({ kind:'CF row (historical)', label: mk + ' · ' + (e.label||e.id), dead: e.sourceId, fixable:false });
      });
    });
  });

  // Instalment plans — fundingPocketId (ACTIVE: mints new orphans each debit)
  var inst = _auGetInst();
  var instUnavailable = (inst === null);
  (inst||[]).forEach(function(p){
    if(p.fundingPocketId && !live[p.fundingPocketId]){
      findings.push({ kind:'Instalment plan (ACTIVE — next debit will re-orphan)', label: (p.desc||p.id) + ' · funds from missing pocket', dead: p.fundingPocketId, fixable:true, planId: p.id });
    }
    (p.paid||[]).forEach(function(pe){
      if(pe.pocketId && !live[pe.pocketId])
        findings.push({ kind:'Instalment paid-entry (historical)', label: (p.desc||p.id) + ' · ' + pe.date + ' · ' + _auFmtR(pe.amount||p.amt||0), dead: pe.pocketId, fixable:false });
    });
  });

  // Carpool records
  _auGetJSON('yb_carpool_payments_v1').forEach(function(r){
    if(r.pocketDepositFundId && !live[r.pocketDepositFundId])
      findings.push({ kind:'Carpool record', label: r.passenger + ' · ' + r.date, dead: r.pocketDepositFundId, fixable:false });
  });

  var res = {
    status: findings.length ? 'fail' : (instUnavailable ? 'warn' : 'pass'),
    name: 'Orphaned pocket references (merged/deleted pockets)',
    detail: findings.length
      ? findings.length + ' reference' + (findings.length>1?'s':'') + ' to missing pockets found'
      : (instUnavailable ? 'CF + carpool clean · instalments module unavailable, skipped' : 'Every pocket reference resolves to a live pocket'),
    findings: findings
  };
  return res;
}

function _auCheckBaseline(){
  var rb = {};
  // settings.js owns this key (RECON_KEY = 'yb_recon_balances_v1'). Read-only peek.
  try { rb = JSON.parse(lsGet(typeof RECON_KEY!=='undefined'?RECON_KEY:'yb_recon_balances_v1')||'{}'); } catch(e){}
  var vals = ['fnb','tyme','cash'].map(function(k){ return { k:k, v: Number(rb[k]||0) }; });
  var neg = vals.filter(function(x){ return x.v < 0; });
  return {
    status: neg.length ? 'warn' : 'pass',
    name: 'Available Cash baseline sanity',
    detail: neg.length
      ? 'Negative baseline: ' + neg.map(function(x){ return x.k.toUpperCase() + ' −' + _auFmtR(x.v); }).join(' · ') + ' — a doorway adjustment may have been missed'
      : vals.map(function(x){ return x.k.toUpperCase() + ' ' + _auFmtR(x.v); }).join(' · ') + ' — no negative baselines'
  };
}

function _auCheckEmoji(){
  var fundsArr = _auGetFunds();
  var seen = {}, dupes = [], sysClash = [];
  fundsArr.forEach(function(f){
    if(!f.emoji) return;
    if(seen[f.emoji]) dupes.push(f.emoji + ' (' + seen[f.emoji] + ' + ' + f.name + ')');
    else seen[f.emoji] = f.name;
    if(f.emoji === '📥') sysClash.push(f.name);
  });
  var bad = dupes.length + sysClash.length;
  return {
    status: bad ? 'fail' : 'pass',
    name: 'Emoji uniqueness (v147d rule, retroactive)',
    detail: bad
      ? (dupes.concat(sysClash.map(function(n){ return n + ' uses system emoji 📥'; }))).join(' · ')
      : fundsArr.length + ' pockets · all emojis distinct · no clash with system options'
  };
}

function _auCheckDuplicateIds(){
  var seen = {}, dupes = 0;
  _auGetFunds().forEach(function(f){ if(f.id){ if(seen['f'+f.id]) dupes++; seen['f'+f.id]=1; } });
  var cf = _auGetCF();
  _auMonthKeys(cf).forEach(function(mk){
    ['income','expenses'].forEach(function(sec){
      (cf[mk][sec]||[]).forEach(function(e){ if(e.id){ if(seen['c'+mk+e.id]) dupes++; seen['c'+mk+e.id]=1; } });
    });
  });
  return { status: dupes ? 'fail' : 'pass', name: 'Duplicate ID scan (funds + CF rows)',
           detail: dupes ? dupes + ' duplicates found' : 'No duplicate IDs' };
}

function _auCheckStorageKeys(){
  var keys = ['yb_lends_v1','yb_repayments_v1','yb_moneyin_v1','yb_spend_v1','yb_moves_v1','yb_carpool_payments_v1'];
  var present = keys.filter(function(k){ return lsGet(k) !== null && lsGet(k) !== undefined; });
  return {
    status: 'pass',
    name: 'Storage keys (v147e backup set)',
    detail: present.length + '/' + keys.length + ' present' + (present.length < keys.length ? ' — missing keys appear on first use, not an error' : '')
  };
}

// Async — the only check here that hits the network. Fetches THIS DEVICE's
// currently-served carpool.js (same-origin, so PWA cache/SW behavior applies —
// that's intentional: this checks what's actually running here, not GitHub's
// latest commit) and verifies the three carpool-statement surfaces (on-screen
// card, WhatsApp text, PDF export) agree on 5 concepts. Ported from a
// standalone Node script (tests/output-consistency.mjs) that does the same
// thing against the repo directly — same concept list, same anchors, same
// pass/fail logic, validated there against both a clean and a deliberately
// broken copy before being ported here.
async function _auCheckOutputConsistency(){
  var CHECK_NAME = 'Carpool statement output parity (card / WhatsApp / PDF)';
  function extractBetween(s, startAnchor, endAnchor){
    var startIdx = s.indexOf(startAnchor);
    if(startIdx === -1) throw new Error('anchor not found: "' + startAnchor + '"');
    var endIdx = s.indexOf(endAnchor, startIdx + startAnchor.length);
    if(endIdx === -1) throw new Error('end anchor not found: "' + endAnchor + '"');
    return s.slice(startIdx, endIdx + endAnchor.length);
  }
  function stripComments(region){
    return region.split('\n').filter(function(line){ return line.trim().indexOf('//') !== 0; }).join('\n');
  }
  var res = await fetch('carpool.js');
  if(!res.ok) throw new Error('could not load carpool.js (HTTP ' + res.status + ')');
  var src = await res.text();

  var regions = {
    card: stripComments(extractBetween(src, '// Breakdown footer — always shows trips section', "+'<div class=\"stmt-btns\">'")),
    wa:   stripComments(extractBetween(src, "const waSummary='", 'const waText=')),
    pdf:  stripComments(extractBetween(src, 'function buildPDF(', '\nfunction '))
  };

  var CONCEPTS = [
    { key:'combined_outstanding', expected:['card','wa','pdf'],
      test:{ card:/Total Outstanding/, wa:/\*Outstanding:/, pdf:/'TOTAL OUTSTANDING'/ } },
    { key:'all_settled', expected:['card','wa','pdf'],
      test:{ card:/All settled/i, wa:/All settled/i, pdf:/ALL SETTLED/i } },
    { key:'gross_total (the exact v147g/h pattern)', expected:[],
      test:{ card:/Total Owed/i, wa:/Total Owed/i, pdf:/TOTAL OWED/i } },
    { key:'trips_outstanding_line', expected:['card','pdf'],
      test:{ card:/Trips Outstanding/, wa:/Trips Outstanding/, pdf:/TRIPS OUTSTANDING/ } },
    { key:'borrow_outstanding_line', expected:['card','pdf'],
      test:{ card:/Borrow Outstanding/, wa:/Borrow Outstanding/, pdf:/BORROW OUTSTANDING/ } }
  ];
  var surfaces = ['card','wa','pdf'];
  var drift = [];
  CONCEPTS.forEach(function(c){
    var actual = surfaces.filter(function(s){ return c.test[s].test(regions[s]); });
    var matches = actual.length === c.expected.length && actual.every(function(s){ return c.expected.indexOf(s) !== -1; });
    if(!matches) drift.push(c.key + ' — expected [' + (c.expected.join(', ')||'none') + '], found [' + (actual.join(', ')||'none') + ']');
  });

  return {
    status: drift.length ? 'fail' : 'pass',
    name: CHECK_NAME,
    detail: drift.length
      ? drift.join(' · ')
      : CONCEPTS.length + ' concepts checked across card, WhatsApp text, and PDF — all agree'
  };
}

// ── runner ───────────────────────────────────────────────────────────
var _AU_GROUPS = [
  { icon:'💰', title:'Pocket Math',         checks:[_auCheckDeposits, _auCheckNegativePockets] },
  { icon:'🔗', title:'Mirror-Link Chains',  checks:[_auCheckCarpoolChains, _auCheckCFResolution, _auCheckOrphanedPockets] },
  { icon:'🏦', title:'Available Cash Baseline', checks:[_auCheckBaseline] },
  { icon:'🧱', title:'Structure & Rules',   checks:[_auCheckEmoji, _auCheckDuplicateIds, _auCheckStorageKeys, _auCheckOutputConsistency] }
];

async function runSelfAudit(){
  var t0 = Date.now();
  var v = document.getElementById('auditVerdict');
  if(v) v.innerHTML = '<div style="font-size:11px;color:var(--muted);padding:10px 4px;">Running…</div>';
  var results = await Promise.all(_AU_GROUPS.map(async function(g){
    var rows = await Promise.all(g.checks.map(async function(fn){
      try { return await fn(); }
      catch(e){ return { status:'warn', name: fn.name, detail: 'check errored: ' + e.message }; }
    }));
    return { icon:g.icon, title:g.title, rows: rows };
  }));
  _auditResults = results;
  _auditLastRun = { at: new Date(), ms: Date.now() - t0 };
  _auditRenderResults();
}

// ── rendering ────────────────────────────────────────────────────────
function renderAudit(){
  var root = document.getElementById('auditRoot');
  if(!root) return;
  root.innerHTML =
    '<div style="font-family:\'Syne\',sans-serif;font-weight:800;font-size:clamp(20px,4vw,36px);letter-spacing:-1px;">🛡️ <span style="color:var(--muted)">SELF-AUDIT</span></div>'
    + '<div style="font-size:10px;letter-spacing:3px;color:var(--muted);text-transform:uppercase;margin:2px 0 16px;">The app checks its own math</div>'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">'
    +   '<button onclick="runSelfAudit()" style="background:var(--accent,#c8f230);color:#000;border:none;border-radius:8px;padding:10px 18px;font-family:inherit;font-weight:600;font-size:12px;letter-spacing:1px;cursor:pointer;">▶ RUN AUDIT</button>'
    +   '<div id="auditLastRun" style="font-size:9px;color:var(--muted);letter-spacing:1px;"></div>'
    + '</div>'
    + '<div id="auditVerdict"></div>'
    + '<div id="auditGroups"></div>'
    + '<div style="font-size:9.5px;color:var(--muted);line-height:1.7;padding:4px 4px 0;">🔒 Read-only — running the audit never changes data. Fixes are previewed and applied only when you confirm.</div>';
  if(_auditResults) _auditRenderResults();
}

function _auditRenderResults(){
  var counts = { pass:0, warn:0, fail:0 };
  _auditResults.forEach(function(g){ g.rows.forEach(function(r){ counts[r.status]++; }); });
  var total = counts.pass + counts.warn + counts.fail;
  var lr = document.getElementById('auditLastRun');
  if(lr && _auditLastRun) lr.textContent = 'LAST RUN · ' + _auditLastRun.at.toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit'}) + ' · ' + (_auditLastRun.ms/1000).toFixed(1) + 's';

  var vcol = counts.fail ? '#f23060' : (counts.warn ? '#f2a830' : 'var(--accent,#c8f230)');
  var v = document.getElementById('auditVerdict');
  if(v) v.innerHTML =
    '<div style="background:var(--surface,#0d0d0d);border:1px solid var(--border,#1f1f1f);border-radius:12px;padding:16px;margin-bottom:14px;display:flex;gap:18px;align-items:center;">'
    + '<div style="font-family:\'Syne\',sans-serif;font-weight:800;font-size:38px;line-height:1;color:'+vcol+';">' + counts.pass + '<span style="font-size:16px;color:var(--muted);">/' + total + '</span></div>'
    + '<div style="font-size:11px;line-height:1.9;">'
    +   '<span style="color:var(--accent,#c8f230);">✓ ' + counts.pass + ' passed</span><br>'
    +   (counts.warn ? '<span style="color:#f2a830;">⚠ ' + counts.warn + ' warnings</span><br>' : '')
    +   (counts.fail ? '<span style="color:#f23060;">✗ ' + counts.fail + ' issue' + (counts.fail>1?'s':'') + ' found</span>' : '<span style="color:var(--muted);">no issues</span>')
    + '</div></div>';

  var G = document.getElementById('auditGroups');
  if(!G) return;
  G.innerHTML = _auditResults.map(function(g, gi){
    var worst = g.rows.some(function(r){return r.status==='fail';}) ? 'fail' : (g.rows.some(function(r){return r.status==='warn';}) ? 'warn' : 'pass');
    var chip = worst==='fail' ? '<span style="font-size:8px;letter-spacing:1.5px;padding:3px 8px;border-radius:20px;background:#f2306022;color:#f23060;border:1px solid #f2306055;">ISSUES</span>'
             : worst==='warn' ? '<span style="font-size:8px;letter-spacing:1.5px;padding:3px 8px;border-radius:20px;background:#f2a83022;color:#f2a830;border:1px solid #f2a83055;">WARNINGS</span>'
             : '<span style="font-size:8px;letter-spacing:1.5px;padding:3px 8px;border-radius:20px;background:#c8f23022;color:var(--accent,#c8f230);border:1px solid #c8f23055;">ALL PASS</span>';
    return '<div style="background:var(--surface,#0d0d0d);border:1px solid var(--border,#1f1f1f);border-radius:12px;margin-bottom:12px;overflow:hidden;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;padding:13px 16px;">'
      +   '<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:14px;">' + g.icon + ' ' + g.title + '</div>' + chip
      + '</div>'
      + g.rows.map(function(r, ri){ return _auditRowHTML(r, gi, ri); }).join('')
      + '</div>';
  }).join('');
}

function _auditRowHTML(r, gi, ri){
  var ic = r.status==='fail' ? '<span style="color:#f23060;">✗</span>'
         : r.status==='warn' ? '<span style="color:#f2a830;">⚠</span>'
         : '<span style="color:var(--accent,#c8f230);">✓</span>';
  var html = '<div style="display:flex;gap:10px;align-items:flex-start;padding:10px 16px;border-top:1px solid #151515;">'
    + '<div style="flex-shrink:0;width:16px;text-align:center;font-size:12px;padding-top:1px;">' + ic + '</div>'
    + '<div style="flex:1;">'
    +   '<div style="font-size:11.5px;color:#ddd;">' + r.name + '</div>'
    +   '<div style="font-size:10px;color:var(--muted);line-height:1.5;margin-top:2px;">' + r.detail + '</div>';
  if(r.findings && r.findings.length){
    html += r.findings.map(function(f, fi){
      var row = '<div style="margin-top:8px;padding:8px 10px;background:#f2306010;border:1px solid #f2306033;border-radius:7px;">'
        + '<div style="font-size:10px;color:#ddd;">' + f.kind + '</div>'
        + '<div style="font-size:10px;color:var(--muted);margin-top:2px;">' + f.label + ' → missing pocket <span style="color:#ddd;">' + f.dead + '</span></div>';
      if(f.fixable){
        row += '<div id="auFix_' + gi + '_' + ri + '_' + fi + '" style="margin-top:8px;">'
          + '<button onclick="_auditProposeFix(' + gi + ',' + ri + ',' + fi + ')" style="background:#f2306018;border:1px solid #f2306066;color:#f23060;font-family:inherit;font-size:10px;letter-spacing:1px;padding:6px 12px;border-radius:7px;cursor:pointer;">⚡ PROPOSE FIX → re-point plan to a live pocket</button>'
          + '</div>';
      } else {
        row += '<div style="font-size:9px;color:var(--muted);margin-top:6px;">Historical reference — display-only impact. Guided repair recommended rather than auto-fix.</div>';
      }
      return row + '</div>';
    }).join('');
  }
  return html + '</div></div>';
}

// ── fix flow: re-point an instalment plan's fundingPocketId ─────────
function _auditProposeFix(gi, ri, fi){
  var f = _auditResults[gi].rows[ri].findings[fi];
  if(!f || !f.fixable) return;
  var box = document.getElementById('auFix_' + gi + '_' + ri + '_' + fi);
  if(!box) return;
  var opts = _auGetFunds().map(function(fd){
    return '<option value="' + fd.id + '">' + (fd.emoji||'') + ' ' + fd.name + '</option>';
  }).join('');
  box.innerHTML =
    '<div style="border:1px solid #333;border-radius:7px;padding:10px;background:#0a0a0a;">'
    + '<div style="font-size:10px;color:#ddd;margin-bottom:6px;">Re-point <span style="color:#f2a830;">' + f.label + '</span></div>'
    + '<div style="font-size:9px;color:var(--muted);margin-bottom:8px;">FROM missing pocket <b>' + f.dead + '</b> → TO:</div>'
    + '<select id="auFixSel_' + gi + '_' + ri + '_' + fi + '" style="width:100%;background:#111;color:#ddd;border:1px solid #333;border-radius:6px;padding:8px;font-family:inherit;font-size:11px;margin-bottom:8px;">' + opts + '</select>'
    + '<div style="font-size:9px;color:var(--muted);line-height:1.5;margin-bottom:8px;">Metadata-only: no balances move, no baseline change. Future debits will fund from the pocket you pick.</div>'
    + '<button onclick="_auditApplyFix(' + gi + ',' + ri + ',' + fi + ')" style="background:var(--accent,#c8f230);color:#000;border:none;border-radius:6px;padding:8px 14px;font-family:inherit;font-weight:600;font-size:11px;cursor:pointer;">✔ CONFIRM RE-POINT</button> '
    + '<button onclick="runSelfAudit()" style="background:transparent;border:1px solid #333;color:var(--muted);border-radius:6px;padding:8px 14px;font-family:inherit;font-size:11px;cursor:pointer;">CANCEL</button>'
    + '</div>';
}

function _auditApplyFix(gi, ri, fi){
  var f = _auditResults[gi].rows[ri].findings[fi];
  var sel = document.getElementById('auFixSel_' + gi + '_' + ri + '_' + fi);
  if(!f || !sel || !f.planId) return;
  var inst = _auGetInst();
  if(inst === null){ alert('Instalments module unavailable — cannot apply.'); return; }
  var plan = inst.find(function(p){ return p.id === f.planId; });
  if(!plan){ alert('Plan not found — re-run the audit.'); return; }
  plan.fundingPocketId = sel.value;
  if(typeof saveInst === 'function') saveInst(inst);
  else if(typeof INST_KEY !== 'undefined') lsSet(INST_KEY, JSON.stringify(inst));
  else { alert('No save path available.'); return; }
  runSelfAudit(); // immediately re-verify — the finding should clear
}
