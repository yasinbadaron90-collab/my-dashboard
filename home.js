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
// ZONE 1: YOUR MONEY (pocket strip + 3 buttons)
// ════════════════════════════════════════════════════════════════════
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
  try { return JSON.parse(localStorage.getItem(_ALERT_STATE_KEY) || '{}') || {}; }
  catch(e){ return {}; }
}
function _alertSaveState(s){
  try { localStorage.setItem(_ALERT_STATE_KEY, JSON.stringify(s)); } catch(e){}
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
    if(a.actions && a.actions.length){
      var btns = a.actions.map(function(act, j){
        var label = _escHtml(act.label || 'Action');
        return '<button class="home-alert-btn" onclick="event.stopPropagation();_homeAlertAction('+i+','+j+')">'+label+'</button>';
      }).join('');
      // v112: add snooze + dismiss icon buttons after action buttons
      btns += '<span class="home-alert-spacer"></span>';
      btns += '<button class="home-alert-mbtn" title="Snooze" onclick="event.stopPropagation();_homeAlertSnoozeOpen('+i+')">😴</button>';
      btns += '<button class="home-alert-mbtn" title="Dismiss" onclick="event.stopPropagation();_homeAlertDismiss('+i+')">✕</button>';
      actionsHtml = '<div class="home-alert-actions">'+btns+'</div>';
      // Snooze picker (hidden by default, shown by _homeAlertSnoozeOpen)
      actionsHtml += '<div class="home-alert-snooze-picker" id="snoozePick_'+i+'" style="display:none;">'
        + '<span class="home-alert-snooze-lbl">Snooze for:</span>'
        + '<button class="home-alert-btn" onclick="event.stopPropagation();_homeAlertSnoozeDo('+i+',1)">1 day</button>'
        + '<button class="home-alert-btn" onclick="event.stopPropagation();_homeAlertSnoozeDo('+i+',3)">3 days</button>'
        + '<button class="home-alert-btn" onclick="event.stopPropagation();_homeAlertSnoozeDo('+i+',7)">1 week</button>'
        + '<button class="home-alert-mbtn" onclick="event.stopPropagation();_homeAlertSnoozeCancel('+i+')">✕</button>'
        + '</div>';
    }
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
