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
  notes: ''
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
        notes: saved.notes || ''
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
    return '<option value="'+f.id+'"'+(f.id===selectedId?' selected':'')+'>'+_escHtml(f.emoji||'')+' '+_escHtml(f.name)+'</option>';
  }).join('');
}
function _planDebtorOptions(selectedKey){
  var ext = (typeof loadExternalBorrows === 'function') ? loadExternalBorrows() : {};
  return Object.keys(ext).map(function(key){
    var name = (ext[key] && ext[key].name) ? ext[key].name : key;
    return '<option value="'+key+'"'+(key===selectedKey?' selected':'')+'>'+_escHtml(name)+'</option>';
  }).join('');
}

function togglePlanEdit(){ _planEditMode = !_planEditMode; renderPlan(); }

function renderPlan(){
  var container = document.getElementById('planContent');
  if(!container) return;
  var plan = loadPlan();

  if(_planEditMode){ container.innerHTML = _planRenderEditForm(plan); return; }

  var cardsHtml = plan.savingsCards.map(function(c){
    var fund = (typeof funds !== 'undefined' ? funds : []).find(function(f){ return f.id === c.pocketId; });
    var bal = fund ? fundTotal(fund) : 0;
    var pct = c.target > 0 ? Math.min(100, (bal/c.target)*100) : 0;
    var pocketMissing = !fund;
    return ''
      + '<div class="home-plan-card" style="border-left:3px solid '+(pocketMissing?'#f2a830':'#c8f230')+';">'
      +   '<div class="home-plan-card-title">'+_escHtml(c.label.toUpperCase())+'</div>'
      +   '<div class="home-plan-card-bal" style="color:'+(pocketMissing?'#f2a830':'#c8f230')+';">'+(pocketMissing?'Pocket not found':fmtR(bal))+'</div>'
      +   '<div class="home-plan-card-sub">Target '+fmtR(c.target)+' · '+pct.toFixed(1)+'%'+(fund?' · '+_escHtml(fund.name):'')+'</div>'
      +   '<div class="home-plan-bar"><div class="home-plan-bar-fill" style="width:'+pct+'%;background:#c8f230;"></div></div>'
      +   (c.monthly ? '<div class="home-plan-card-rule">Commitment: '+fmtR(c.monthly)+'/month</div>' : '')
      + '</div>';
  }).join('');

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
  var debtCardHtml = ''
    + '<div class="home-plan-card" style="border-left:3px solid #f23060;">'
    +   '<div class="home-plan-card-title">'+_escHtml(debtName.toUpperCase())+'</div>'
    +   '<div class="home-plan-card-bal" style="color:#f23060;">'+fmtR(debtOwing)+'</div>'
    +   '<div class="home-plan-card-sub">'+fmtR(plan.debtCard.monthly)+'/month · don\'t accelerate yet</div>'
    + '</div>';

  var totalMonthly = plan.savingsCards.reduce(function(s,c){return s+(c.monthly||0);}, 0);
  var actionParts = plan.savingsCards.filter(function(c){return c.monthly>0;}).map(function(c){ return fmtR(c.monthly)+' → '+c.label; });
  var actionLine = actionParts.length ? actionParts.join(' · ')+' · remainder of Net → savings' : 'No monthly commitments set yet';

  var auditFails = 0;
  if(typeof _auditResults !== 'undefined' && Array.isArray(_auditResults)){
    _auditResults.forEach(function(g){ (g.rows||[]).forEach(function(r){ if(r.status==='fail') auditFails++; }); });
  }
  var auditBadge = (typeof _auditResults !== 'undefined' && _auditResults)
    ? (auditFails === 0 ? 'Self-Audit clean' : 'Self-Audit has open items')
    : 'Self-Audit not yet run this session';

  container.innerHTML = ''
    + '<div class="home-zone">'
    +   '<div class="home-zone-hdr">'
    +     '<div class="home-zone-title">🎯 Plan</div>'
    +     '<button class="pane-toggle" onclick="togglePlanEdit()" title="Edit Plan">✎</button>'
    +   '</div>'
    +   '<div class="home-zone-meta">Live from pockets · pick which pocket/person each card tracks in Edit</div>'
    +   '<div class="home-plan-cards">'+cardsHtml+debtCardHtml+'</div>'
    +   '<div class="home-plan-action">THIS MONTH — '+actionLine+'</div>'
    +   '<div class="home-plan-footer">'+auditBadge+' · figures live · plan notes below</div>'
    +   (plan.notes ? '<div class="home-plan-card-rule" style="margin-top:8px;">'+_escHtml(plan.notes)+'</div>' : '')
    + '</div>';
}

function _planRenderEditForm(plan){
  var rows = plan.savingsCards.map(function(c, i){
    return ''
      + '<div class="home-plan-card" style="border-left:3px solid #30c8f2;">'
      +   '<div class="field"><label>Label</label><input type="text" data-plan-card="'+i+'" data-field="label" value="'+_escAttr(c.label)+'"/></div>'
      +   '<div class="field"><label>Pocket</label><select data-plan-card="'+i+'" data-field="pocketId">'+_planPocketOptions(c.pocketId)+'</select></div>'
      +   '<div class="field"><label>Target (R)</label><input type="number" data-plan-card="'+i+'" data-field="target" value="'+c.target+'"/></div>'
      +   '<div class="field"><label>Monthly commitment (R)</label><input type="number" data-plan-card="'+i+'" data-field="monthly" value="'+c.monthly+'"/></div>'
      + '</div>';
  }).join('');

  var debtRow = ''
    + '<div class="home-plan-card" style="border-left:3px solid #f23060;">'
    +   '<div class="field"><label>Debt label</label><input type="text" id="planDebtLabel" value="'+_escAttr(plan.debtCard.label)+'"/></div>'
    +   '<div class="field"><label>Person</label><select id="planDebtorKey">'+_planDebtorOptions(plan.debtCard.debtorKey)+'</select></div>'
    +   '<div class="field"><label>Monthly repayment (R)</label><input type="number" id="planDebtMonthly" value="'+plan.debtCard.monthly+'"/></div>'
    + '</div>';

  return ''
    + '<div class="home-zone">'
    +   '<div class="home-zone-hdr"><div class="home-zone-title">🎯 Edit Plan</div>'
    +     '<button class="pane-toggle" onclick="togglePlanEdit()" title="Cancel">✕</button></div>'
    +   '<div class="home-plan-cards">'+rows+debtRow+'</div>'
    +   '<div class="field"><label>Stipend end date</label><input type="date" id="planStipendEnd" value="'+plan.stipendEnd+'"/></div>'
    +   '<div class="field"><label>Notes (optional)</label><input type="text" id="planNotesInput" value="'+_escAttr(plan.notes||'')+'" placeholder="e.g. reassess after provident fund payout"/></div>'
    +   '<button onclick="savePlanFromForm()" style="width:100%;padding:12px;background:#c8f230;border:none;border-radius:6px;color:#000;font-family:\'DM Mono\',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;font-weight:700;">💾 Save Plan</button>'
    + '</div>';
}

function savePlanFromForm(){
  var plan = loadPlan();
  document.querySelectorAll('[data-plan-card]').forEach(function(el){
    var i = parseInt(el.getAttribute('data-plan-card'), 10);
    var field = el.getAttribute('data-field');
    if(!plan.savingsCards[i]) return;
    plan.savingsCards[i][field] = (field==='target'||field==='monthly') ? (parseFloat(el.value)||0) : el.value;
  });
  plan.debtCard.label = document.getElementById('planDebtLabel').value;
  plan.debtCard.debtorKey = document.getElementById('planDebtorKey').value;
  plan.debtCard.monthly = parseFloat(document.getElementById('planDebtMonthly').value) || 0;
  plan.stipendEnd = document.getElementById('planStipendEnd').value || PLAN_DEFAULTS.stipendEnd;
  plan.notes = document.getElementById('planNotesInput').value.trim();
  savePlan(plan);
  _planEditMode = false;
  renderPlan();
}


function _renderHomeZone1Money(){
  // Source of truth: same fundTotal calc the savings tab uses.
  // Excludes soft-deleted funds (same as renderFunds).
  var visibleFunds = (typeof funds !== 'undefined' && funds)
    ? funds.filter(function(f){ return !f._deleted; })
    : [];

  var grandTotal = 0;
  var pocketCards = '';

  visibleFunds.forEach(function(f){
    var bal = (typeof fundTotal === 'function') ? fundTotal(f) : 0;
    grandTotal += bal;

    var isZero = bal === 0;
    var isExpense = !!f.isExpense;
    var balColor = isZero ? 'var(--muted2)'
                 : isExpense ? '#f2c830'
                 : 'var(--text)';
    var borderColor = isExpense ? '#3a2a00' : 'var(--border)';

    pocketCards += ''
      + '<div class="home-pocket-card" style="border-color:'+borderColor+';" onclick="_homeOpenPocket(\''+f.id+'\')">'
      +   '<span class="home-pocket-emoji">'+(f.emoji||'💰')+'</span>'
      +   '<div class="home-pocket-name" title="'+_escAttr(f.name)+'">'+_escHtml(f.name)+'</div>'
      +   '<div class="home-pocket-bal" style="color:'+balColor+';">'+fmtR(bal)+'</div>'
      + '</div>';
  });

  var bankNote = visibleFunds.length+' pockets · banks R0';

  return ''
    + '<div class="home-zone">'
    +   '<div class="home-zone-hdr">'
    +     '<div class="home-zone-title">💰 Your money'
    +       '<button class="info-btn" onclick="openInfo(\'Your Money\', \'Your money lives in pockets, not in your bank. Banks stay at R0 by design — money just passes through. Tap a pocket to see its history.\\n\\nUse the 3 buttons below: Money In when you get paid, Spend when you buy something, Move to shift money between pockets.\')">ⓘ</button>'
    +     '</div>'
    +     '<div class="home-zone-meta">'+bankNote+'</div>'
    +   '</div>'
    +   '<div class="home-total-line">'+fmtR(grandTotal)+'<small>across pockets</small></div>'
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
function _alertIsHidden(a, state){
  var k = _alertKey(a);
  var s = state[k];
  if(!s) return false;
  if(s.state === 'dismissed') return true;
  if(s.state === 'snoozed' && s.until){
    if(new Date(s.until) > new Date()) return true;
    // expired — caller should clean up
    return false;
  }
  return false;
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
function _alertUnsnooze(a){
  var state = _alertLoadState();
  delete state[_alertKey(a)];
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
        var label = _escHtml(act.label || 'Action');
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
      +       '<div class="home-alert-text">'+_escHtml(a.text||'')+'</div>'
      +       (tabName ? '<div class="home-alert-meta">'+_escHtml(tabName)+'</div>' : '')
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


// ════════════════════════════════════════════════════════════════════
// HELPERS — HTML escapers (defensive: pocket names are user-typed)
// ════════════════════════════════════════════════════════════════════
function _escHtml(s){
  return String(s||'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}
function _escAttr(s){
  return _escHtml(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
