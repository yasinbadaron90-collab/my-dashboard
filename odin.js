// Odin: command centre, alerts, tab render



// ══════════════════════════════════════════════════════════════
// 🧠 ODIN COMMAND CENTRE TAB
// ══════════════════════════════════════════════════════════════

// ── Odin auto-refresh — call after any save/delete ──
function odinRefreshIfOpen(){
  try{
    var odinPage = document.getElementById('page-odin');
    if(odinPage && odinPage.classList.contains('active')) renderOdinTab();
  }catch(e){}
}

function renderOdinTab(){
  var now = new Date();
  var mk  = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  var hour = now.getHours();
  var timeGreet = hour<12?'Good morning':hour<17?'Good afternoon':'Good evening';

  // Greeting
  var greetEl = document.getElementById('odinTabGreeting');
  if(greetEl) greetEl.textContent = timeGreet+', '+( currentUser||'Yasin')+'. Here\'s your financial overview.';

  // ── ALERTS ──
  _renderOdinTabAlerts(now, mk);

  // ── SNAPSHOT ──
  _renderOdinTabSnapshot(mk);

  // ── RECENT ACTIVITY ──
  _renderOdinTabActivity(mk);
}

function _renderOdinTabAlerts(now, mk){
  var container = document.getElementById('odinTabAlerts');
  if(!container) return;
  var alerts = buildOdinLaunchAlerts();
  container.innerHTML = '';

  if(!alerts.length){
    var ok = document.createElement('div');
    ok.style.cssText = 'background:#0d1a00;border:1px solid #1a3a00;border-radius:10px;padding:14px 16px;font-size:12px;color:#5a8800;';
    ok.textContent = '✅ All clear — nothing urgent right now.';
    container.appendChild(ok);
    return;
  }

  alerts.forEach(function(a){
    var bg     = a.level==='red'?'#1a0505':a.level==='amber'?'#1a1000':'#0d1a00';
    var border = a.level==='red'?'#3a1a1a':a.level==='amber'?'#3a2a00':'#1a3a00';
    var color  = a.level==='red'?'#f23060':a.level==='amber'?'#f2a830':'#5a8800';
    var dot    = a.level==='red'?'🔴':a.level==='amber'?'🟡':'🟢';

    var card = document.createElement('div');
    card.style.cssText = 'background:'+bg+';border:1px solid '+border+';border-radius:10px;padding:12px 14px;margin-bottom:10px;';

    // Main row — dot + text
    var mainRow = document.createElement('div');
    mainRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:'+(a.actions&&a.actions.length?'10px':'0')+';';

    var dotSpan = document.createElement('span');
    dotSpan.style.cssText = 'font-size:14px;flex-shrink:0;';
    dotSpan.textContent = dot;

    var textSpan = document.createElement('span');
    textSpan.style.cssText = 'font-size:12px;color:'+color+';flex:1;font-family:DM Mono,monospace;letter-spacing:0.3px;line-height:1.4;';
    textSpan.textContent = a.text;

    mainRow.appendChild(dotSpan);
    mainRow.appendChild(textSpan);
    card.appendChild(mainRow);

    // Action buttons row
    if(a.actions && a.actions.length){
      var actRow = document.createElement('div');
      actRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;padding-left:24px;';

      a.actions.forEach(function(action){
        var isDelete = action.label.toLowerCase().indexOf('delete') > -1;
        var btn = document.createElement('button');
        btn.style.cssText = 'background:none;border:1px solid '+(isDelete?'#5a1a1a':'#2a3a1a')+';border-radius:6px;'
          +'padding:5px 12px;color:'+(isDelete?'#f23060':color)+';font-family:DM Mono,monospace;'
          +'font-size:10px;letter-spacing:1px;cursor:pointer;transition:all .15s;';
        btn.onmouseover = function(){
          this.style.background = isDelete?'#2a0808':'#0d2000';
        };
        btn.onmouseout = function(){
          this.style.background = 'none';
        };
        btn.textContent = action.label;
        btn.addEventListener('click', action.fn);
        actRow.appendChild(btn);
      });

      card.appendChild(actRow);
    }

    container.appendChild(card);
  });
}

function _renderOdinTabSnapshot(mk){
  var container = document.getElementById('odinTabSnapshot');
  if(!container) return;
  container.innerHTML = '';

  var snap = null;
  try{ snap = (typeof getLendingSnapshot==='function') ? getLendingSnapshot() : null; }catch(e){}

  var tiles = [];

  // Bank Balance — real money in your accounts now (FNB + Tyme).
  // Pulled from yb_recon_balances_v1 which the user maintains via the
  // inputs at the bottom of Cash Flow tab. This is the most actionable
  // number on the dashboard so it goes first.
  try{
    var bb = (typeof loadReconBalances === 'function') ? loadReconBalances() : {};
    var bbTotal = (Number(bb.fnb)||0) + (Number(bb.tyme)||0);
    tiles.push({
      label: 'Bank Balance',
      value: bbTotal > 0 ? fmtR(bbTotal) : '— set in Cash Flow',
      color: bbTotal > 0 ? '#9be0e0' : '#5a8080',
      bg:'#0a1a1a', border:'#1a4040', tab:'cashflow'
    });
  }catch(e){}

  // Cash flow net
  if(snap){
    tiles.push({
      label:'Net Cash Flow',
      value:(snap.net>=0?'+':'')+fmtR(snap.net),
      color: snap.net>=0?'#c8f230':'#f23060',
      bg: snap.net>=0?'#0d1a00':'#1a0505',
      border: snap.net>=0?'#1a3a00':'#5a1a1a',
      tab:'cashflow'
    });
  }

  // Maintenance fund this month
  try{
    var mdata = getMaintData();
    var mThisMonth = mdata.filter(function(e){ return e.date&&e.date.startsWith(mk); }).reduce(function(s,e){ return s+e.amount; },0);
    var liveMaintLabel = (typeof getMaintFundName === 'function') ? getMaintFundName() : 'Maintenance Fund';
    tiles.push({
      label: liveMaintLabel,
      value: fmtR(mThisMonth)+' / '+fmtR(MAINT_TARGET),
      color: mThisMonth>=MAINT_TARGET?'#c8f230':'#f2a830',
      bg:'#1a1000', border:'#3a2a00', tab:'savings'
    });
  }catch(e){}

  // Total owed to you
  try{
    var totalOwed = 0;
    var pax = loadPassengers()||[];
    pax.forEach(function(p){
      var ents = (borrowData&&borrowData[p.name])||[];
      var b=0,r=0;
      ents.forEach(function(e){ if(e.type==='repay') r+=Number(e.amount||0); else b+=Number(e.amount||0); });
      totalOwed += Math.max(0,b-r);
    });
    var extD = loadExternalBorrows();
    Object.values(extD).forEach(function(p){
      var b=0,r=0;
      (p.entries||[]).forEach(function(e){ if(e.type==='repay') r+=Number(e.amount||0); else b+=Number(e.amount||0); });
      totalOwed += Math.max(0,b-r);
    });
    tiles.push({
      label:'Owed to You',
      value: fmtR(totalOwed),
      color: totalOwed>0?'#a78bfa':'#555',
      bg:'#0d0a1a', border:'#2a1a4a', tab:'money'
    });
  }catch(e){}

  // Savings total
  try{
    var totalSaved = (funds||[]).filter(function(f){ return !f.isExpense; }).reduce(function(s,f){ return s+fundTotal(f); },0);
    tiles.push({
      label:'Total Saved',
      value: fmtR(totalSaved),
      color:'#c8f230', bg:'#0d1a00', border:'#1a3a00', tab:'savings'
    });
  }catch(e){}

  tiles.forEach(function(t){
    var tile = document.createElement('div');
    tile.style.cssText = 'background:'+t.bg+';border:1px solid '+t.border+';border-radius:10px;padding:14px 12px;cursor:pointer;transition:opacity .15s;';
    tile.onmouseover = function(){ this.style.opacity='0.8'; };
    tile.onmouseout  = function(){ this.style.opacity='1'; };
    tile.addEventListener('click', (function(tab){ return function(){ goToTab(tab); }; })(t.tab));
    tile.innerHTML = '<div style="font-size:9px;color:#555;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">'+t.label+'</div>'
      +'<div style="font-family:Syne,sans-serif;font-weight:800;font-size:18px;color:'+t.color+';">'+t.value+'</div>';
    container.appendChild(tile);
  });
}

function _renderOdinTabActivity(mk){
  var container = document.getElementById('odinTabActivity');
  if(!container) return;
  container.innerHTML = '';

  var activity = [];

  // Recent CF entries
  try{
    var cfData = loadCFData();
    var monthData = cfData[mk]||{};
    var inc = (monthData.income||[]).slice(-3).reverse();
    var exp = (monthData.expenses||[]).slice(-3).reverse();
    // Fallback label helper — if the entry's label is empty after stripping
    // emojis (or was never set), derive something readable from category /
    // note / sourceType so the user sees what the row is actually for.
    var deriveLabel = function(e, defaultText){
      var stripped = stripEmojiCF(e.label||'');
      if(stripped) return stripped;
      if(e.note)         return stripEmojiCF(e.note);
      if(e.category)     return e.category;
      if(e.sourceType)   return String(e.sourceType).replace(/_/g,' ');
      return defaultText;
    };
    inc.forEach(function(e){
      activity.push({ date:e.date||'', text:deriveLabel(e,'Income'), amount:'+'+fmtR(e.amount), color:'#c8f230', tab:'cashflow' });
    });
    exp.forEach(function(e){
      activity.push({ date:e.date||'', text:deriveLabel(e,'Expense'), amount:'-'+fmtR(e.amount), color:'#f23060', tab:'cashflow' });
    });
  }catch(e){}

  // Sort by date desc
  activity.sort(function(a,b){ return b.date.localeCompare(a.date); });
  activity = activity.slice(0,8);

  if(!activity.length){
    var none = document.createElement('div');
    none.style.cssText = 'font-size:11px;color:#333;padding:8px 0;';
    none.textContent = 'No activity this month yet.';
    container.appendChild(none);
    return;
  }

  activity.forEach(function(a){
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #161616;cursor:pointer;';
    row.addEventListener('click', (function(tab){ return function(){ goToTab(tab); }; })(a.tab));
    row.innerHTML = '<div><div style="font-size:12px;color:#efefef;font-family:DM Mono,monospace;">'+a.text+'</div>'
      +'<div style="font-size:10px;color:#333;margin-top:2px;">'+a.date+'</div></div>'
      +'<span style="font-size:13px;font-weight:700;color:'+a.color+';">'+a.amount+'</span>';
    container.appendChild(row);
  });
}

// ══ ODIN LAUNCH ALERTS ══
function buildOdinLaunchAlerts(){
  var alerts = [];
  var now = new Date();
  var mk = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');

  // ── Car service ──
  try{
    loadCarsData().forEach(function(car){
      var daysLeft = null;
      var svcResult = calcNextService(car);
      daysLeft = svcResult.daysUntilNext;
      if(daysLeft === null) return;
      var level = daysLeft < 0 ? 'red' : daysLeft <= 30 ? 'red' : daysLeft <= 90 ? 'amber' : null;
      if(!level) return;
      var text = daysLeft < 0
        ? car.name+' service OVERDUE by '+Math.abs(daysLeft)+' days'
        : car.name+' service due in '+daysLeft+' days';
      alerts.push({ level:level, text:text, tab:'cars',
        actions:[{ label:'Go to Cars', fn: function(){ goToTab('cars'); } }]
      });
    });
  }catch(e){}

  // ── Cash flow ──
  try{
    var snap = (typeof getLendingSnapshot==='function') ? getLendingSnapshot() : null;
    if(snap && snap.net < 0){
      alerts.push({ level:'red', text:'Cash flow deficit — '+fmtR(Math.abs(snap.net))+' over budget', tab:'cashflow',
        actions:[{ label:'Allocate', fn: function(){ openAllocateModal('odin'); } },
                 { label:'View', fn: function(){ goToTab('cashflow'); } }]
      });
    } else if(snap && snap.net > 0){
      alerts.push({ level:'green', text:'Cash flow positive — '+fmtR(snap.net)+' surplus this month', tab:'cashflow',
        actions:[{ label:'Allocate surplus', fn: function(){ openAllocateModal('odin'); } }]
      });
    }
  }catch(e){}

  // ── Carpool borrows ──
  try{
    var passengers = loadPassengers()||[];
    passengers.forEach(function(p){
      var entries = (borrowData&&borrowData[p.name])||[];
      var b=0,r=0;
      entries.forEach(function(e){ if(e.type==='repay') r+=Number(e.amount||0); else b+=Number(e.amount||0); });
      var owed = Math.max(0,b-r);
      if(owed>0){
        // Find the latest unpaid borrow entry for delete
        var unpaid = entries.filter(function(e){ return e.type!=='repay'; });
        var latest = unpaid.length ? unpaid[unpaid.length-1] : null;
        var pName = p.name;
        var latestId = latest ? latest.id : null;
        var pNameCopy = pName;
        alerts.push({ level:'amber', text: p.name+' owes you '+fmtR(owed), tab:'carpool',
          actions:[
            { label:'↩ Repayment', fn: (function(n){ return function(){ odinOpenRepayment(n,false,null); }; })(pNameCopy) },
            { label:'+ Borrow', fn: (function(n){ return function(){ odinOpenBorrow(n,false,null); }; })(pNameCopy) },
            { label:'View', fn: function(){ goToTab('carpool'); } }
          ]
        });
      }
    });
  }catch(e){}

  // ── External borrows ──
  try{
    var extD = loadExternalBorrows();
    Object.keys(extD).forEach(function(key){
      var p = extD[key];
      var b=0,r=0;
      (p.entries||[]).forEach(function(e){ if(e.type==='repay') r+=Number(e.amount||0); else b+=Number(e.amount||0); });
      var owed = Math.max(0,b-r);
      if(owed>0){
        var unpaid = (p.entries||[]).filter(function(e){ return e.type!=='repay'; });
        var latest = unpaid.length ? unpaid[unpaid.length-1] : null;
        var pKey = key;
        var latestId = latest ? latest.id : null;
        var pKeyCopy = pKey;
        var pNameExtCopy = p.name;
        alerts.push({ level:'amber', text: p.name+' owes you '+fmtR(owed), tab:'money',
          actions:[
            { label:'↩ Repayment', fn: (function(k,n){ return function(){ odinOpenRepayment(n,true,k); }; })(pKeyCopy,pNameExtCopy) },
            { label:'+ Borrow', fn: (function(k,n){ return function(){ odinOpenBorrow(n,true,k); }; })(pKeyCopy,pNameExtCopy) },
            { label:'View', fn: function(){ goToTab('money'); } }
          ]
        });
      }
    });
  }catch(e){}

  // ── Instalments due ──
  try{
    var plans = (typeof loadInst==='function') ? loadInst() : [];
    plans.forEach(function(plan){
      if(plan.monthToMonth) return;
      var paidIdxs = (plan.paid||[]).map(function(p){ return p.index; });
      (plan.dates||[]).forEach(function(ds,i){
        if(paidIdxs.indexOf(i)>-1) return;
        var dueDate = new Date(ds+'T00:00:00');
        var daysLeft = Math.round((dueDate-now)/86400000);
        if(daysLeft>=0 && daysLeft<=14){
          var planId = plan.id;
          alerts.push({ level:'red', text: plan.desc+' — '+fmtR(plan.amt)+' due in '+daysLeft+' days', tab:'instalments',
            actions:[
              { label:'View', fn: function(){ goToTab('instalments'); } },
              { label:'Delete plan', fn: function(){
                if(confirm('Delete instalment plan "'+plan.desc+'"? This cannot be undone.')){
                  deleteInstPlan(planId);
                  renderOdinTab();
                }
              }}
            ]
          });
        }
      });
    });
  }catch(e){}

  // ── Savings funds low ──
  try{
    (funds||[]).filter(function(f){ return !f.isExpense&&f.goal>0; }).forEach(function(f){
      var saved = fundTotal(f);
      var pct = saved/f.goal;
      if(pct >= 1){
        alerts.push({ level:'green', text:(f.emoji||'💰')+' '+f.name+' — Goal reached!', tab:'savings',
          actions:[{ label:'View', fn: function(){ goToTab('savings'); } }]
        });
      } else if(pct < 0.2){
        var fId = f.id;
        alerts.push({ level:'amber', text:(f.emoji||'💰')+' '+f.name+' — only '+Math.round(pct*100)+'% saved', tab:'savings',
          actions:[
            { label:'Deposit', fn: function(){ goToTab('savings'); } },
            { label:'Delete fund', fn: function(){
              if(confirm('Delete fund "'+f.name+'"? All deposits will be lost.')){
                deleteFund(fId);
                renderOdinTab();
              }
            }}
          ]
        });
      }
    });
  }catch(e){}

  // ── Maintenance fund ──
  try{
    var mdata = getMaintData();
    var mThisMonth = mdata.filter(function(e){ return e.date&&e.date.startsWith(mk); }).reduce(function(s,e){ return s+e.amount; },0);
    var liveMaintNameOdin = (typeof getMaintFundName === 'function') ? getMaintFundName() : 'Maintenance Fund';
    var mShort = Math.max(0, MAINT_TARGET - mThisMonth);
    if(mShort > 0){
      alerts.push({ level:'amber', text:liveMaintNameOdin+' — R'+mShort.toFixed(0)+' short this month', tab:'savings',
        actions:[{ label:'View', fn: function(){ goToTab('savings'); } }]
      });
    } else {
      alerts.push({ level:'green', text:liveMaintNameOdin+' — target met this month', tab:'savings',
        actions:[{ label:'View', fn: function(){ goToTab('savings'); } }]
      });
    }
  }catch(e){}

  // ── School onboarding (first-run) ──
  // Fires only when the school tab is completely empty — no events, no
  // results. Once the user adds anything, this alert disappears. Green-level
  // (informational) so it doesn't compete with urgent stuff.
  try{
    if(typeof isSchoolEmpty === 'function' && isSchoolEmpty()){
      alerts.push({ level:'green',
        text:'📚 Set up your school tab — add subjects and deadlines so I can remind you',
        tab:'school',
        actions:[
          { label:'Show me how', fn: function(){
              if(typeof odinChatAsk === 'function'){
                odinChatAsk('How do I set up my school tab?');
              } else if(typeof openOdinChat === 'function'){
                openOdinChat('How do I set up my school tab?');
              } else {
                goToTab('school');
              }
            }
          },
          { label:'Go to School', fn: function(){ goToTab('school'); } }
        ]
      });
    }
  }catch(e){}

  // ── Storage usage (warn at 80%, urgent at 95%) ──
  // localStorage has a fixed quota (5–10MB depending on browser). Once full,
  // saves silently fail unless the new lsSet error path catches them. This
  // proactive warning gives the user a chance to back up + clean up before
  // anything actually breaks.
  try {
    if(typeof lsUsage === 'function'){
      var u = lsUsage();
      if(u && u.percent >= 95){
        alerts.push({ level:'red',
          text:'⚠️ Storage almost full ('+u.percent+'%) — back up now and delete old data',
          tab:'settings',
          actions:[
            { label:'Backup now', fn: function(){ if(typeof backupData==='function') backupData(); } }
          ]
        });
      } else if(u && u.percent >= 80){
        alerts.push({ level:'amber',
          text:'📦 Storage at '+u.percent+'% — consider downloading a backup',
          tab:'settings',
          actions:[
            { label:'Backup', fn: function(){ if(typeof backupData==='function') backupData(); } }
          ]
        });
      }
    }
  } catch(e){}

  return alerts;
}


function renderOdinLaunchAlerts(){
  var container = document.getElementById('odinLaunchAlerts');
  if(!container) return;
  var alerts = buildOdinLaunchAlerts();
  container.innerHTML = '';

  if(!alerts.length){
    var clear = document.createElement('div');
    clear.style.cssText = 'background:#0d1a00;border:1px solid #1a3a00;border-radius:10px;padding:12px 16px;font-size:12px;color:#5a8800;letter-spacing:0.5px;';
    clear.textContent = '✅ All clear — no urgent items today.';
    container.appendChild(clear);
    return;
  }

  var red   = alerts.filter(function(a){ return a.level==='red'; });
  var amber = alerts.filter(function(a){ return a.level==='amber'; });
  var green = alerts.filter(function(a){ return a.level==='green'; });

  // Summary line
  var summary = document.createElement('div');
  summary.style.cssText = 'font-size:10px;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;';
  if(red.length){
    summary.style.color = '#f23060';
    summary.textContent = '⚠ '+red.length+' urgent item'+(red.length>1?'s':'')+' need'+(red.length===1?'s':'')+' attention';
  } else if(amber.length){
    summary.style.color = '#f2a830';
    summary.textContent = amber.length+' item'+(amber.length>1?'s':'')+' to keep an eye on';
  } else {
    summary.style.color = '#5a8800';
    summary.textContent = 'Looking good today';
  }
  container.appendChild(summary);

  // Show only red alerts by default
  var defaultAlerts = red.length ? red : amber.length ? amber.slice(0,2) : green.slice(0,1);
  var hiddenAlerts  = red.length ? amber.concat(green) : amber.length ? amber.slice(2).concat(green) : green.slice(1);

  function buildAlertCard(a){
    var bg    = a.level==='red'?'#1a0505':a.level==='amber'?'#1a1000':'#0d1a00';
    var border= a.level==='red'?'#5a1a1a':a.level==='amber'?'#5a3a00':'#1a3a00';
    var color = a.level==='red'?'#f23060':a.level==='amber'?'#f2a830':'#5a8800';
    var dot   = a.level==='red'?'🔴':a.level==='amber'?'🟡':'🟢';
    var d = document.createElement('div');
    d.style.cssText = 'display:flex;align-items:center;gap:10px;background:'+bg+';border:1px solid '+border+';border-radius:8px;padding:10px 14px;margin-bottom:8px;cursor:pointer;transition:opacity .15s;';
    d.onmouseover = function(){ this.style.opacity='0.8'; };
    d.onmouseout  = function(){ this.style.opacity='1'; };
    d.addEventListener('click', (function(tab){ return function(){ closeLaunchMenu(); goToTab(tab); }; })(a.tab));
    var dotSpan = document.createElement('span');
    dotSpan.style.cssText = 'font-size:14px;flex-shrink:0;';
    dotSpan.textContent = dot;
    var textSpan = document.createElement('span');
    textSpan.style.cssText = 'font-size:12px;color:'+color+';flex:1;font-family:DM Mono,monospace;letter-spacing:0.3px;';
    textSpan.textContent = a.text;
    var arrow = document.createElement('span');
    arrow.style.cssText = 'color:#333;font-size:16px;';
    arrow.textContent = '›';
    d.appendChild(dotSpan);
    d.appendChild(textSpan);
    d.appendChild(arrow);
    return d;
  }

  // Render default (urgent) alerts
  defaultAlerts.forEach(function(a){ container.appendChild(buildAlertCard(a)); });

  // View all toggle
  if(hiddenAlerts.length){
    var extraWrap = document.createElement('div');
    extraWrap.style.display = 'none';
    hiddenAlerts.forEach(function(a){ extraWrap.appendChild(buildAlertCard(a)); });
    container.appendChild(extraWrap);

    var toggleBtn = document.createElement('button');
    toggleBtn.style.cssText = 'width:100%;background:none;border:1px solid #2a2a2a;border-radius:8px;padding:8px;color:#555;font-family:DM Mono,monospace;font-size:10px;letter-spacing:1px;cursor:pointer;margin-top:2px;transition:all .15s;';
    toggleBtn.textContent = 'View all ('+hiddenAlerts.length+' more)';
    var expanded = false;
    toggleBtn.addEventListener('click', function(){
      expanded = !expanded;
      extraWrap.style.display = expanded ? 'block' : 'none';
      toggleBtn.textContent = expanded ? 'Show less ↑' : 'View all ('+hiddenAlerts.length+' more)';
      toggleBtn.style.color = expanded ? '#888' : '#555';
    });
    container.appendChild(toggleBtn);
  }
}


function showLaunchMenu(){
  document.getElementById('launchMenuOverlay').style.display='flex';
  // Hide the nav and all pages until the user picks a section
  var nav = document.querySelector('.nav');
  if(nav) nav.style.visibility='hidden';
  document.querySelectorAll('.page').forEach(function(p){ p.style.visibility='hidden'; });
  // Build menu items based on role
  const list = document.getElementById('launchMenuList');
  list.innerHTML = '';

  const adminItems = [
    { icon:'🚗', label:'Carpool', sub:'Trips, payments & statements', tab:'carpool' },
    { icon:'💰', label:'Savings', sub:'Funds & deposit tracking', tab:'savings' },
    { icon:'💵', label:'Cash Flow', sub:'Income, expenses & net position', tab:'cashflow' },
    { icon:'💳', label:'Instalments', sub:'Payment plans & instalment tracking', tab:'instalments' },
    { icon:'🎓', label:'School', sub:'Webinars, assignments, exams & quizzes', tab:'school' },
    { icon:'🔧', label:'Car Service Tracker', sub:'Maintenance logs & expense history', tab:'cars' },
    { icon:'🤝', label:'Money Owed to Me', sub:'Loans, repayments & balances', tab:'money' },
    { icon:'📊', label:'Reports', sub:'Fuel savings & borrow summary', tab:'reports' },
    { icon:'🕌', label:'Prayer Tracker', sub:'Salah streaks & heatmap', tab:'prayer' },
    { icon:'🔁', label:'Routine', sub:'Daily tasks & habit tracking', tab:'routine' },
    { icon:'✦', label:'AI Assistant', sub:'Ask anything about your dashboard', tab:'ai' },
  ];
  const passengerItems = [
    { icon:'🚗', label:'Carpool', sub:'View your trips & statement', tab:'carpool' },
  ];
  const carserviceItems = [
    { icon:'🔧', label:'Car Service Tracker', sub:'Maintenance logs & expense history', tab:'cars' },
  ];

  const items = currentRole === 'admin' ? adminItems : currentRole === 'carservice' ? carserviceItems : passengerItems;
  items.forEach(function(item){
    const btn = document.createElement('button');
    btn.style.cssText = 'display:flex;align-items:center;gap:16px;width:100%;padding:16px 18px;background:#111;border:1px solid #2a2a2a;border-radius:10px;cursor:pointer;text-align:left;transition:all .18s;font-family:"DM Mono",monospace;margin-bottom:10px;';
    btn.onmouseover = function(){ this.style.borderColor='#c8f230'; this.style.background='#0d1a00'; };
    btn.onmouseout  = function(){ this.style.borderColor='#2a2a2a'; this.style.background='#111'; };
    btn.innerHTML =
      '<span style="font-size:28px;line-height:1;flex-shrink:0;">'+item.icon+'</span>'+
      '<div>'+
        '<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:15px;color:#efefef;margin-bottom:2px;">'+item.label+'</div>'+
        '<div style="font-size:10px;color:#555;letter-spacing:1px;">'+item.sub+'</div>'+
      '</div>'+
      '<span style="margin-left:auto;color:#333;font-size:18px;">›</span>';
    btn.onclick = function(){
      closeLaunchMenu();
      if(item.tab === 'ai'){ openAIAssistant(); } else { goToTab(item.tab); }
    };
    list.appendChild(btn);
  });

  // Greeting
  const greeting = document.getElementById('launchGreeting');
  const hour = new Date().getHours();
  const timeGreet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  greeting.textContent = timeGreet + ', ' + (currentUser || 'there') + ' 👋';

  // Odin alerts — only for admin
  if(currentRole === 'admin'){
    setTimeout(renderOdinLaunchAlerts, 50);
  } else {
    var alertsEl = document.getElementById('odinLaunchAlerts');
    if(alertsEl) alertsEl.innerHTML = '';
  }
}

function closeLaunchMenu(){
  document.getElementById('launchMenuOverlay').style.display='none';
  // Restore nav and pages
  var nav = document.querySelector('.nav');
  if(nav) nav.style.visibility='';
  document.querySelectorAll('.page').forEach(function(p){ p.style.visibility=''; });
}
function closeModal(id){document.getElementById(id).classList.remove('active');}
document.querySelectorAll('.overlay').forEach(o=>{o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('active');});});

// ══ SAVINGS ══
