// Savings: funds, deposits, use funds, manual balances


const EMOJIS=['🚗','🏠','🎉','💊','📚','✈️','👶','🛒','💎','🔧','🌙','💰','⚡','🎯','🛞','🏋️'];
const COLORS=['#c8f230','#f23060','#30c8f2','#f2a830','#a830f2','#30f2a8','#f230c8','#ffffff'];
let funds=[],editingId=null,depositingId=null,selEmoji='💰',selColor='#c8f230';

function loadFunds(){
  try{funds=JSON.parse(lsGet(SK)||'[]');}catch(e){funds=[];}
}
function saveFunds(){lsSet(SK,JSON.stringify(funds)); odinRefreshIfOpen();}

// ── Eager load on script parse ─────────────────────────────────────────────
// Also called from core.js DOMContentLoaded, but parsing this here removes
// the race window where a save could fire on empty `funds` before DOM ready.
try { loadFunds(); } catch(e){}

// ── fundTotal: sum all deposits for a fund ──
function fundTotal(f){
  return (f.deposits||[]).reduce(function(s,d){
    if(d.txnType==='out') return s - d.amount;
    return s + d.amount;
  }, 0);
}

function remaining(f){return Math.max(0,f.goal-fundTotal(f));}
function pct(f){return Math.min(100,(fundTotal(f)/f.goal)*100);}
function weeksLeft(f){return Math.ceil(remaining(f)/(f.weekly||200));}
function etaDate(f){const d=new Date();d.setDate(d.getDate()+weeksLeft(f)*7);return d.toLocaleDateString('en-ZA',{day:'2-digit',month:'short',year:'numeric'});}

// ── Deadline status for a fund ──────────────────────────────────────────────
// Returns { state, color, bg, border, label } where state is one of:
//   'done'    — goal already reached (lime, celebratory)
//   'on'      — on track at current contribution rate (green)
//   'behind'  — possible but needs higher contribution rate (orange)
//   'late'    — deadline passed AND goal not reached (red)
//   'unreachable' — too little time left to mathematically hit goal (red)
//   'none'    — card has no deadline yet (grey, prompts to set one)
// The label is what to show on the card under the title.
function deadlineStatus(f){
  if(!f) return { state:'none', color:'#555', label:'No deadline set' };
  // Expense cards don't have a deadline concept — they're trackers, not goals.
  if(f.isExpense) return { state:'none', color:'#555', label:'' };
  var total = fundTotal(f);
  var goal = f.goal || 0;
  // Already done — celebrate regardless of deadline
  if(goal > 0 && total >= goal){
    return { state:'done', color:'#c8f230', label:'🎉 Goal reached' };
  }
  if(!f.deadline){
    return { state:'none', color:'#888', label:'⚠️ Set a deadline' };
  }
  var today = new Date(); today.setHours(0,0,0,0);
  var dl = new Date(f.deadline+'T00:00:00');
  var msLeft = dl - today;
  var daysLeft = Math.ceil(msLeft / (1000*60*60*24));
  var weeksLeft = Math.max(0, Math.ceil(daysLeft / 7));
  var rem = Math.max(0, goal - total);
  // Past due
  if(msLeft < 0){
    return { state:'late', color:'#f23060', label:'🚨 Past due ('+fmtR(rem)+' short)' };
  }
  // No deposits yet → check feasibility based on goal alone
  // Calculate required weekly rate to hit goal by deadline
  var weeklyNeeded = weeksLeft > 0 ? rem / weeksLeft : rem;
  var weeklySet = f.weekly || 0;
  // Friendly deadline string
  var dlStr;
  if(daysLeft <= 7)       dlStr = daysLeft+' day'+(daysLeft===1?'':'s')+' left';
  else if(weeksLeft < 8)  dlStr = weeksLeft+' wk left';
  else                    dlStr = dl.toLocaleDateString('en-ZA',{day:'2-digit',month:'short',year:'2-digit'});
  // On track: current weekly rate is enough
  if(weeklySet >= weeklyNeeded * 0.95){ // 5% grace
    return { state:'on', color:'#c8f230', label:'🟢 On track · '+dlStr };
  }
  // Behind but reachable: needs more contribution
  // "Reachable" = required weekly is less than 5x the current rate, otherwise red
  if(weeklyNeeded <= Math.max(weeklySet*5, weeklySet+500) && weeksLeft >= 1){
    return { state:'behind', color:'#f2a830', label:'🟠 Behind · need '+fmtR(Math.ceil(weeklyNeeded))+'/wk · '+dlStr };
  }
  // Effectively unreachable
  return { state:'unreachable', color:'#f23060', label:'🔴 Need '+fmtR(Math.ceil(weeklyNeeded))+'/wk · '+dlStr };
}

function renderFunds(){
  const grid=document.getElementById('fundGrid');grid.innerHTML='';
  let grand=0;
  // Skip soft-deleted funds — they're hidden during the undo window
  // until either restored (flag removed) or purged (filtered from array).
  const visibleFunds = (funds||[]).filter(function(f){ return !f._deleted; });
  if(!visibleFunds.length){
    grid.innerHTML = (typeof buildEmptyState === 'function')
      ? '<div style="grid-column:1/-1;">'+buildEmptyState({
          icon: '💰',
          title: 'No savings funds yet',
          subtitle: 'Create a fund for emergencies, holidays, school fees, or anything you save toward.',
          ctaLabel: '+ New Savings Fund',
          ctaOnclick: 'openNewFund()'
        })+'</div>'
      : '<div style="grid-column:1/-1;text-align:center;padding:48px 24px;color:#333;font-size:13px;letter-spacing:1px;">No savings funds yet.<br><span style="font-size:11px;color:#2a2a2a;">Tap <strong style="color:#555;">+ New Savings Fund</strong> to get started.</span></div>';
    renderBankStrip();
    try { if(typeof renderMaintCard === 'function') renderMaintCard(); } catch(e){}
    return;
  }
  visibleFunds.forEach(f=>{
    grand+=fundTotal(f);
    const total=fundTotal(f),rem=remaining(f),p=pct(f),done=rem===0;
    const card=document.createElement('div');card.className='fund-card';
    const isExpense = f.isExpense || false;
    const weeklyLabel = f.targetType==='monthly' ? 'R'+Math.round(f.weekly*4.33)+'/month' : 'R'+f.weekly+'/week';
    const subtitleLabel = isExpense ? 'expense tracker' : weeklyLabel;
    const startedLabel = new Date(f.start).toLocaleDateString('en-ZA',{day:'2-digit',month:'short',year:'2-digit'});

    // Unified stats
    const totalIn = isExpense
      ? f.deposits.filter(function(d){return d.txnType==='in';}).reduce(function(s,d){return s+d.amount;},0)
      : total;
    const totalOut = isExpense
      ? f.deposits.filter(function(d){return d.txnType==='out'||!d.txnType;}).reduce(function(s,d){return s+d.amount;},0)
      : 0;
    const balance = isExpense ? totalIn - totalOut : total;
    const goalAmt = f.goal;
    const progPct = isExpense
      ? (totalIn > 0 ? Math.max(0, Math.min(100, (balance/totalIn)*100)) : 0)
      : Math.min(100, (total/goalAmt)*100);
    const progColor = isExpense
      ? (balance < 0 ? '#f23060' : balance < totalIn*0.2 ? '#f2a830' : '#c8f230')
      : f.color;
    const balColor = isExpense
      ? (balance < 0 ? '#f23060' : balance < totalIn*0.2 ? '#f2a830' : '#c8f230')
      : f.color;
    const barLabel = isExpense
      ? (totalIn===0 ? 'No funds added yet' : balance < 0 ? fmtR(Math.abs(balance))+' over budget' : fmtR(balance)+' remaining')
      : (done ? '🎉 Goal reached!' : p.toFixed(0)+'% · '+fmtR(rem)+' to go · '+etaDate(f));
    const barLabelColor = (isExpense && balance < 0) ? '#f23060' : '#444';

    // Transaction rows
    const txnRows = [...f.deposits].sort(function(a,b){return new Date(b.date)-new Date(a.date);}).slice(0,5).map(function(d){
      const isOut = d.txnType==='out';
      const amtColor = isOut ? '#f23060' : '#c8f230';
      const prefix = isOut ? '-' : '+';
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #161616"><div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:11px;color:#efefef">'+(d.note||'—')+'</span><span style="font-size:10px;color:#333">'+d.date+'</span></div><span style="font-size:12px;font-weight:500;color:'+amtColor+'">'+prefix+fmtR(d.amount)+'</span></div>';
    }).join('');

    const balColor2 = balance<0?'#f23060':balance<1000?'#f2a830':'#c8f230';
    const stat1Label = isExpense ? 'Available' : 'Saved';
    const stat1Val = isExpense ? fmtR(balance) : fmtR(total);
    const stat2Label = isExpense ? 'Added' : 'Goal';
    const stat2Val = isExpense ? fmtR(totalIn) : fmtR(goalAmt);
    const stat2Color = isExpense ? '#c8f230' : '#555';
    const stat3Label = isExpense ? 'Spent' : 'Remaining';
    const stat3Val = isExpense ? fmtR(totalOut) : (done ? '🎉' : fmtR(rem));
    const stat3Color = isExpense ? '#f23060' : (done ? '#c8f230' : '#f2a830');

    const bodyHtml = '<div class="fund-body">'
      +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:1px solid var(--border);margin:-16px -18px 0;padding:0">'
      +'<div style="padding:12px 14px;border-right:1px solid var(--border)"><div style="font-size:9px;color:#444;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px">'+stat1Label+'</div><div style="font-family:Syne,sans-serif;font-weight:700;font-size:15px;color:'+balColor+'">'+stat1Val+'</div></div>'
      +'<div style="padding:12px 10px;border-right:1px solid var(--border)"><div style="font-size:9px;color:#444;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px">'+stat2Label+'</div><div style="font-family:Syne,sans-serif;font-weight:700;font-size:15px;color:'+stat2Color+'">'+stat2Val+'</div></div>'
      +'<div style="padding:12px 10px"><div style="font-size:9px;color:#444;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px">'+stat3Label+'</div><div style="font-family:Syne,sans-serif;font-weight:700;font-size:15px;color:'+stat3Color+'">'+stat3Val+'</div></div>'
      +'</div>'
      +'<div style="padding:10px 0;border-bottom:1px solid var(--border)"><div style="height:5px;background:#2a2a2a;border-radius:3px;overflow:hidden"><div style="width:'+progPct+'%;height:100%;background:'+progColor+';border-radius:3px;transition:width .5s ease;box-shadow:0 0 8px '+progColor+'55"></div></div><div style="font-size:10px;color:'+barLabelColor+';margin-top:5px;letter-spacing:1px">'+barLabel+'</div></div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:1px solid var(--border);margin:0 -18px">'
      +'<button class="admin-only" onclick="'+(isExpense?'openCarTxn(\''+f.id+'\',\'in\')':'openDeposit(\''+f.id+'\')')+'" style="padding:11px;font-family:DM Mono,monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;border:none;background:#1a2e00;color:#c8f230;border-right:1px solid var(--border)">＋ '+(isExpense?'Add Funds':'Deposit')+'</button>'
      +(isExpense
        ? '<button class="admin-only" onclick="openUseFunds(\'savings\',\''+f.id+'\')" style="padding:11px;font-family:DM Mono,monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;border:none;background:#2a1000;color:#f2a830">💸 Use Funds</button>'
        : '<button class="admin-only" onclick="openUseFunds(\'savings\',\''+f.id+'\')" style="padding:11px;font-family:DM Mono,monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;border:none;background:#2a1500;color:#f2a830;border-right:1px solid var(--border)">💸 Use</button>'
         +'<button class="admin-only" onclick="openHistory(\''+f.id+'\')" style="padding:11px;font-family:DM Mono,monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;border:none;background:#1a0a00;color:#888">☰</button>'
      )
      +'</div>'
      +'<div style="padding-top:8px">'+txnRows+'</div>'
      +'</div>';

    const cardId = 'fc-'+f.id;
    const isCollapsed = false;
    const chevClass = isCollapsed ? 'collapse-btn collapsed' : 'collapse-btn';
    const wrapStyle = isCollapsed ? 'max-height:0;opacity:0;' : 'max-height:2000px;opacity:1;';
    // Deadline status badge — sits under the title for non-expense cards.
    // Tappable on the "no deadline" state so user can jump straight to edit.
    var _dl = deadlineStatus(f);
    var deadlineRow = '';
    if(!isExpense){
      if(_dl.state === 'none'){
        deadlineRow = '<div style="font-size:10px;margin-top:4px;letter-spacing:1px;"><button onclick="openEditFund(\''+f.id+'\')" style="background:#1a1000;border:1px dashed #5a4a00;border-radius:4px;padding:3px 8px;color:'+_dl.color+';font-family:DM Mono,monospace;font-size:10px;letter-spacing:1px;cursor:pointer;">'+_dl.label+'</button></div>';
      } else if(_dl.label){
        deadlineRow = '<div style="font-size:10px;margin-top:4px;color:'+_dl.color+';letter-spacing:1px;">'+_dl.label+'</div>';
      }
    }
    card.innerHTML = '<div class="fund-top"><div><span class="fund-emoji">'+f.emoji+'</span><div class="fund-name">'+f.name+'</div><div class="fund-weekly">'+subtitleLabel+' · started '+startedLabel+'</div>'+deadlineRow+'</div><div style="display:flex;align-items:center;gap:6px"><button class="'+chevClass+'" onclick="toggleFundCard(\''+f.id+'\',this)" title="Collapse"><span class="chev">&#8964;</span></button><div class="fund-actions admin-only" style="display:flex;gap:6px"><button class="icon-btn" onclick="openHistory(\''+f.id+'\')">☰</button><button class="icon-btn" onclick="openEditFund(\''+f.id+'\')">✎</button><button class="icon-btn danger" onclick="deleteFund(\''+f.id+'\')">✕</button></div></div></div>'
      + '<div class="fund-body-wrap '+(isCollapsed?'collapsed':'expanded')+'" id="'+cardId+'" style="'+wrapStyle+'">' + bodyHtml + '</div>';
    grid.appendChild(card);
  });
  renderBankStrip();
  setTimeout(()=>{document.querySelectorAll('.prog-fill').forEach((el,i)=>{el.style.transitionDelay=(i*.08)+'s';});},50);
  // Re-render the maintenance/car fund card alongside savings — they share
  // the Savings tab and any data change should refresh both. Defensive guard
  // inside renderMaintCard handles the case where it's called too early.
  try { if(typeof renderMaintCard === 'function') renderMaintCard(); } catch(e){}
}

// ── Manual bank balances — stored per fund id ──
const MANUAL_BAL_KEY = 'yb_manual_balances_v1';
function loadManualBalances(){ try{ return JSON.parse(lsGet(MANUAL_BAL_KEY)||'{}'); }catch(e){ return {}; } }
function saveManualBalances(data){ lsSet(MANUAL_BAL_KEY, JSON.stringify(data)); }

function getFundTrackedBal(f){
  if(f.name === 'Car Fund (EE90)'){
    const totalIn  = (f.deposits||[]).filter(function(d){ return d.txnType === 'in'; }).reduce(function(s,d){ return s + d.amount; }, 0);
    const totalOut = (f.deposits||[]).filter(function(d){ return d.txnType === 'out' || !d.txnType; }).reduce(function(s,d){ return s + d.amount; }, 0);
    return totalIn - totalOut;
  }
  return fundTotal(f);
}

function openBalanceEdit(fundId){
  const f = funds.find(function(x){ return x.id === fundId; });
  if(!f) return;
  const manuals = loadManualBalances();
  const tracked = getFundTrackedBal(f);
  const current = manuals[fundId] !== undefined ? manuals[fundId] : tracked;

  // Build modal
  const old = document.getElementById('balEditModal');
  if(old) old.remove();

  const modal = document.createElement('div');
  modal.id = 'balEditModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:500;display:flex;align-items:center;justify-content:center;padding:16px;';
  modal.innerHTML =
    '<div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:20px;width:100%;max-width:340px;">'
    + '<div style="font-family:\'Syne\',sans-serif;font-weight:800;font-size:16px;color:#efefef;margin-bottom:4px;">' + f.emoji + ' ' + f.name + '</div>'
    + '<div style="font-size:10px;color:#555;letter-spacing:1px;margin-bottom:16px;">Set the actual balance in your bank account</div>'
    + '<div style="margin-bottom:6px;">'
    + '<label style="display:block;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#555;margin-bottom:6px;">Actual Bank Balance (R)</label>'
    + '<input id="balEditInput" type="number" inputmode="decimal" value="' + current.toFixed(2) + '" '
    + 'style="width:100%;background:#111;border:1px solid #333;color:#efefef;font-family:\'DM Mono\',monospace;font-size:18px;padding:12px;border-radius:4px;outline:none;box-sizing:border-box;"/>'
    + '</div>'
    + '<div style="font-size:10px;color:#444;margin-bottom:18px;letter-spacing:0.5px;">Tracked by deposits: <span style="color:#888;">' + fmtR(tracked) + '</span></div>'
    + '<div style="display:flex;gap:10px;">'
    + '<button onclick="document.getElementById(\'balEditModal\').remove();" style="flex:1;padding:11px;background:none;border:1px solid #2a2a2a;color:#555;font-family:\'DM Mono\',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;border-radius:4px;cursor:pointer;">Cancel</button>'
    + '<button onclick="saveBalanceEdit(\''+fundId+'\')" style="flex:1;padding:11px;background:#c8f230;border:none;color:#000;font-family:\'DM Mono\',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;border-radius:4px;cursor:pointer;font-weight:700;">Save</button>'
    + '</div>'
    + '</div>';
  document.body.appendChild(modal);
  setTimeout(function(){ document.getElementById('balEditInput').select(); }, 50);

  // Close on backdrop click
  modal.addEventListener('click', function(e){ if(e.target === modal) modal.remove(); });
}

function saveBalanceEdit(fundId){
  const input = document.getElementById('balEditInput');
  const val = parseFloat(input ? input.value : '');
  if(isNaN(val)){ return; }

  // ── #8 fix: store manualBalance directly on the fund, no fake deposits ──
  const manuals = loadManualBalances();
  manuals[fundId] = val;
  saveManualBalances(manuals);

  // Clean up any old isBalanceCorrection deposits from previous approach
  const f = funds.find(function(x){ return x.id === fundId; });
  if(f && f.deposits){
    const before = f.deposits.length;
    f.deposits = f.deposits.filter(function(d){ return !d.isBalanceCorrection; });
    if(f.deposits.length !== before) saveFunds();
  }

  const modal = document.getElementById('balEditModal');
  if(modal) modal.remove();
  renderFunds();
}

function renderBankStrip(){
  const strip = document.getElementById('bankStrip');
  if(!strip) return;

  const tymeFundNames = ['The Vault (Tax)', 'Traffic Infractions'];
  const kidsFundNames = ["Masud's Fund"];
  const manuals = loadManualBalances();

  strip.innerHTML = '';

  if(!funds.length){
    strip.innerHTML = '<div style="padding:10px 14px;font-size:11px;color:#333;">No funds yet</div>';
    return;
  }

  funds.forEach(function(f, i){
    const tracked = getFundTrackedBal(f);
    const bal = manuals[f.id] !== undefined ? manuals[f.id] : tracked;
    const hasManual = manuals[f.id] !== undefined;

    let color;
    if(kidsFundNames.indexOf(f.name) >= 0)      color = '#ffb830';
    else if(tymeFundNames.indexOf(f.name) >= 0) color = '#c8f230';
    else                                          color = 'var(--text)';

    const isLast = (i === funds.length - 1);
    const row = document.createElement('div');
    row.style.cssText =
      'display:flex;justify-content:space-between;align-items:center;padding:8px 14px;cursor:pointer;transition:background .15s;'
      + (isLast ? '' : 'border-bottom:1px solid var(--border);');
    row.title = 'Tap to edit balance';
    row.onmouseenter = function(){ this.style.background='#222'; };
    row.onmouseleave = function(){ this.style.background=''; };
    row.onclick = function(){ openBalanceEdit(f.id); };
    row.innerHTML =
      '<span style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);'
      + 'max-width:130px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="'+f.name+'">'
      + f.emoji + ' ' + f.name
      + '</span>'
      + '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">'
      + (hasManual ? '<span style="font-size:9px;color:#555;" title="Manually set">✎</span>' : '')
      + '<strong style="font-size:13px;color:' + color + ';">' + fmtR(bal) + '</strong>'
      + '</div>';
    strip.appendChild(row);
  });
}

function toggleBankPanel(){
  const body = document.getElementById('bankPanelBody');
  const chev = document.getElementById('bankChev');
  if(!body) return;
  const isCollapsed = body.style.maxHeight === '0px' || body.style.maxHeight === '0';
  if(isCollapsed){
    body.style.maxHeight = '600px';
    body.style.opacity = '1';
    if(chev) chev.style.transform = 'rotate(0deg)';
    lsSet('collapse_bankpanel','0');
  } else {
    body.style.maxHeight = '0px';
    body.style.opacity = '0';
    if(chev) chev.style.transform = 'rotate(-90deg)';
    lsSet('collapse_bankpanel','1');
  }
}
function toggleMaintCard(btn){
  const wrap = document.getElementById('maintBodyWrap');
  if(!wrap) return;
  const isNowCollapsed = !wrap.classList.contains('collapsed');
  if(isNowCollapsed){
    wrap.style.maxHeight = wrap.scrollHeight+'px';
    requestAnimationFrame(function(){
      wrap.classList.add('collapsed');
      wrap.classList.remove('expanded');
      wrap.style.maxHeight = '0';
      btn.classList.add('collapsed');
    });
  } else {
    wrap.classList.remove('collapsed');
    wrap.classList.add('expanded');
    wrap.style.maxHeight = wrap.scrollHeight+'px';
    btn.classList.remove('collapsed');
    setTimeout(function(){ wrap.style.maxHeight = '2000px'; }, 360);
  }
  lsSet('collapse_maint', isNowCollapsed ? '1' : '0');
}
function toggleFundCard(id, btn){
  var cardId = 'fc-'+id;
  var wrap = document.getElementById(cardId);
  if(!wrap) return;
  var isNowCollapsed = !wrap.classList.contains('collapsed');
  if(isNowCollapsed){
    wrap.style.maxHeight = wrap.scrollHeight+'px';
    requestAnimationFrame(function(){
      wrap.classList.add('collapsed');
      wrap.classList.remove('expanded');
      wrap.style.maxHeight = '0';
      btn.classList.add('collapsed');
    });
  } else {
    wrap.classList.remove('collapsed');
    wrap.classList.add('expanded');
    wrap.style.maxHeight = wrap.scrollHeight+'px';
    btn.classList.remove('collapsed');
    setTimeout(function(){ wrap.style.maxHeight = '2000px'; }, 360);
  }
  lsSet('collapse_fund_'+id, isNowCollapsed ? '1' : '0');
}

function setTargetType(t){
  targetType=t;
  const bw=document.getElementById('btnWeekly');
  const bm=document.getElementById('btnMonthly');
  if(t==='weekly'){
    bw.style.border='1px solid #c8f230';bw.style.background='#1a2e00';bw.style.color='#c8f230';
    bm.style.border='1px solid var(--border)';bm.style.background='none';bm.style.color='var(--muted)';
    document.getElementById('fWeekly').placeholder='e.g. 200';
  } else {
    bm.style.border='1px solid #c8f230';bm.style.background='#1a2e00';bm.style.color='#c8f230';
    bw.style.border='1px solid var(--border)';bw.style.background='none';bw.style.color='var(--muted)';
    document.getElementById('fWeekly').placeholder='e.g. 800';
  }
  updateTargetHint();
}
function updateTargetHint(){
  const val=parseFloat(document.getElementById('fWeekly').value);
  const hint=document.getElementById('fTargetHint');
  if(!val||!hint)return;
  if(targetType==='weekly'){hint.textContent='= approx R'+(val*4.33).toFixed(0)+'/month';}
  else{hint.textContent='= approx R'+(val/4.33).toFixed(0)+'/week';}
}
function openNewFund(){
  // Show type picker first
  document.getElementById('cardTypePicker').classList.add('active');
}
function openNewFundDirect(){
  // Original new fund logic
  editingId=null;selEmoji='💰';selColor=COLORS[0];
  document.getElementById('modalTitle').textContent='New Fund';
  document.getElementById('fName').value='';
  document.getElementById('fGoal').value='';
  document.getElementById('fWeekly').value='';
  document.getElementById('fTargetHint').textContent='';
  setTargetType('weekly');
  document.getElementById('fStart').value=localDateStr(new Date());
  // Deadline: blank by default for new cards — user must pick.
  document.getElementById('fDeadline').value='';
  var hint = document.getElementById('fDeadlineHint');
  if(hint) hint.textContent = '';
  buildEmojiGrid();buildColorGrid();
  document.getElementById('fundModal').classList.add('active');
  // Wire the deadline preview (updates the hint to "X weeks away" as the user types).
  _wireDeadlineHint();
}
function openEditFund(id){
  const f=funds.find(x=>x.id===id);if(!f)return;
  editingId=id;selEmoji=f.emoji;selColor=f.color;
  document.getElementById('modalTitle').textContent='Edit Fund';
  document.getElementById('fName').value=f.name;
  document.getElementById('fGoal').value=f.goal;
  targetType=f.targetType||'weekly';
  document.getElementById('fWeekly').value=f.targetType==='monthly'?Math.round(f.weekly*4.33):f.weekly;
  document.getElementById('fStart').value=f.start;
  // Pre-fill deadline if the card already has one.
  document.getElementById('fDeadline').value=f.deadline||'';
  setTargetType(targetType);updateTargetHint();
  buildEmojiGrid();buildColorGrid();
  document.getElementById('fundModal').classList.add('active');
  _wireDeadlineHint();
  // Trigger an initial hint render for the loaded deadline.
  _renderDeadlineHint();
}
// Show "X weeks away" preview under the deadline input so the user understands
// what they're choosing. Plain wiring + render; safe to call multiple times.
function _wireDeadlineHint(){
  var inp = document.getElementById('fDeadline');
  if(!inp || inp._hintBound) return;
  inp._hintBound = true;
  inp.addEventListener('input', _renderDeadlineHint);
  inp.addEventListener('change', _renderDeadlineHint);
}
function _renderDeadlineHint(){
  var inp = document.getElementById('fDeadline');
  var hint = document.getElementById('fDeadlineHint');
  if(!inp || !hint) return;
  if(!inp.value){ hint.textContent = ''; return; }
  var today = new Date(); today.setHours(0,0,0,0);
  var dl = new Date(inp.value+'T00:00:00');
  var diffMs = dl - today;
  var weeks = Math.round(diffMs / (1000*60*60*24*7));
  if(diffMs < 0) hint.textContent = '⚠️ Already past — pick a future date';
  else if(weeks === 0) hint.textContent = '= less than a week away';
  else if(weeks === 1) hint.textContent = '= 1 week away';
  else if(weeks < 8) hint.textContent = '= '+weeks+' weeks away';
  else hint.textContent = '= '+weeks+' weeks (~'+Math.round(weeks/4.33)+' months) away';
}
function saveFund(){
  const name=document.getElementById('fName').value.trim();
  const goal=parseFloat(document.getElementById('fGoal').value);
  const rawAmt=parseFloat(document.getElementById('fWeekly').value)||0;
  const weekly=targetType==='monthly'?parseFloat((rawAmt/4.33).toFixed(2)):rawAmt;
  const start=document.getElementById('fStart').value;
  const deadline=document.getElementById('fDeadline').value;
  if(!name||!goal||!start){ alert('Please fill in name, goal, and start date.'); return; }
  if(!deadline){ alert('Please pick a deadline — when do you need this money by?'); return; }
  // Sanity: deadline must be in the future at creation time
  if(new Date(deadline+'T23:59:59') < new Date()){
    if(!confirm('That deadline is in the past. Save anyway?')) return;
  }
  const isNew=!editingId;
  if(editingId){
    const f=funds.find(x=>x.id===editingId);
    Object.assign(f,{name,emoji:selEmoji,color:selColor,goal,weekly,targetType,start,deadline,isExpense:f.isExpense||false});
  } else {
    funds.push({id:uid(),name,emoji:selEmoji,color:selColor,goal,weekly:weekly||200,targetType,start,deadline,deposits:[]});
  }
  saveFunds();closeModal('fundModal');renderFunds();
  showBackupReminder(isNew?'New savings card created':'Savings card updated');
}
function buildEmojiGrid(){const g=document.getElementById('emojiGrid');g.innerHTML='';EMOJIS.forEach(e=>{const b=document.createElement('button');b.className='emoji-opt'+(e===selEmoji?' selected':'');b.textContent=e;b.onclick=()=>{selEmoji=e;buildEmojiGrid();};g.appendChild(b);});}
function buildColorGrid(){const g=document.getElementById('colorGrid');g.innerHTML='';COLORS.forEach(c=>{const b=document.createElement('button');b.className='color-opt'+(c===selColor?' selected':'');b.style.background=c;b.onclick=()=>{selColor=c;buildColorGrid();};g.appendChild(b);});}
function deleteFund(id){
  if(!confirm('Delete this fund?')) return;
  // Find the fund first so we can use its name in the toast
  var fund = funds.find(function(f){ return f.id===id; });
  if(!fund) return;
  // Soft-delete: flag the item rather than removing it. renderFunds skips
  // _deleted entries, so it disappears from the UI immediately.
  fund._deleted = true;
  saveFunds();
  renderFunds();
  // Wire up undo + purge
  softDeleteToast({
    label: fund.emoji ? (fund.emoji+' '+fund.name) : fund.name,
    onUndo: function(){
      // Restore — clear the flag and re-render
      var f = funds.find(function(x){ return x.id===id; });
      if(f){ delete f._deleted; saveFunds(); renderFunds(); }
    },
    onPurge: function(){
      // User didn't undo — purge for real
      funds = funds.filter(function(x){ return x.id!==id; });
      saveFunds();
      // No need to re-render — the item was already hidden
    }
  });
}
function openDeposit(id){
  depositingId=id;
  const f=funds.find(x=>x.id===id);
  document.getElementById('depFundName').textContent=f.emoji+' '+f.name;
  document.getElementById('depAmount').value=f.weekly||200;
  document.getElementById('depDate').value=localDateStr(new Date());
  document.getElementById('depNote').value='';
  // Default the From-bank picker to FNB (matches the default on cash-flow entries).
  setDepBank('FNB', null);
  document.getElementById('depModal').classList.add('active');
}

// Highlight the picked button in the deposit modal's From-bank picker.
// Mirrors setCfBank exactly so the visual style stays consistent.
function setDepBank(bank, btn){
  var hidden = document.getElementById('depBank');
  if(hidden) hidden.value = bank;
  var fnbBtn  = document.getElementById('depBankFNB');
  var tymeBtn = document.getElementById('depBankTyme');
  var cashBtn = document.getElementById('depBankCash');
  if(fnbBtn){  fnbBtn.style.borderColor  = bank==='FNB'     ? '#4a7aaa' : 'var(--border)';
               fnbBtn.style.background   = bank==='FNB'     ? '#0a0f1a' : 'none';
               fnbBtn.style.color        = bank==='FNB'     ? '#4a9aff' : 'var(--muted)'; }
  if(tymeBtn){ tymeBtn.style.borderColor = bank==='TymeBank'? '#aa8a00' : 'var(--border)';
               tymeBtn.style.background  = bank==='TymeBank'? '#1a1000' : 'none';
               tymeBtn.style.color       = bank==='TymeBank'? '#f2a830' : 'var(--muted)'; }
  if(cashBtn){ cashBtn.style.borderColor = bank==='Cash'    ? '#3a5a00' : 'var(--border)';
               cashBtn.style.background  = bank==='Cash'    ? '#0d1a00' : 'none';
               cashBtn.style.color       = bank==='Cash'    ? '#c8f230' : 'var(--muted)'; }
}

function confirmDeposit(){
  const amount=parseFloat(document.getElementById('depAmount').value);
  const date=document.getElementById('depDate').value||localDateStr(new Date());
  const note=document.getElementById('depNote').value.trim();
  if(!amount||amount<=0)return;
  // From-bank — the savings allocation drains this bucket on the Available
  // Cash card. Defaults to FNB if the user somehow skipped the picker.
  var depBankEl = document.getElementById('depBank');
  var fromBank = depBankEl ? (depBankEl.value || 'FNB') : 'FNB';
  const f=funds.find(x=>x.id===depositingId);
  // Post to Cash Flow as an expense WITH destBank so the bank bucket math
  // can see it. sourceType keeps the savings filter logic working.
  const cfId_dep=postToCF({label:'Savings - '+f.name,amount:amount,date:date,icon:'savings',type:'expense',sourceType:'savings_deposit',sourceId:depositingId,sourceCardName:f.name,note:note,destBank:fromBank});
  f.deposits.push({id:uid(),amount,note,date,cfId:cfId_dep,fromBank:fromBank});
  const manuals=loadManualBalances();
  if(manuals[depositingId]!==undefined){delete manuals[depositingId];saveManualBalances(manuals);}
  saveFunds();closeModal('depModal');renderFunds();
  // ── Adjust live bank-bucket baseline (May 2026 Round 2) ──
  // Moving money INTO a savings pot drains the source bank. The savings pot
  // grows; the bank bucket shrinks. We push the negative delta to the
  // baseline so the Available Cash card reflects it instantly.
  if(typeof window._adjustBaselineForBank === 'function'){
    window._adjustBaselineForBank(fromBank, -amount);
  }
  // Refresh the Available Cash card so the drained bucket updates live.
  try { if(typeof renderBankBalanceCard === 'function') renderBankBalanceCard(); } catch(e){}
}
function openHistory(id){const f=funds.find(x=>x.id===id);document.getElementById('histTitle').textContent=f.emoji+' '+f.name;const deps=[...f.deposits].reverse();let html='';if(!deps.length){html='<p style="color:var(--muted);font-size:12px">No deposits yet.</p>';}else{html='<table style="width:100%;border-collapse:collapse;font-size:12px"><tr><th style="text-align:left;font-size:9px;letter-spacing:2px;color:var(--muted);padding:4px 6px;border-bottom:1px solid var(--border);font-weight:400">DATE</th><th style="text-align:left;font-size:9px;letter-spacing:2px;color:var(--muted);padding:4px 6px;border-bottom:1px solid var(--border);font-weight:400">AMOUNT</th><th style="text-align:left;font-size:9px;letter-spacing:2px;color:var(--muted);padding:4px 6px;border-bottom:1px solid var(--border);font-weight:400">NOTE</th><th style="padding:4px 6px;border-bottom:1px solid var(--border)"></th></tr>';deps.forEach(d=>{const isOut=d.txnType==='out';const amtColor=isOut?'#f23060':'#c8f230';const prefix=isOut?'-':'+';html+=`<tr><td style="padding:9px 6px;border-bottom:1px solid #1a1a1a;color:var(--muted)">${d.date}</td><td style="padding:9px 6px;border-bottom:1px solid #1a1a1a;color:${amtColor};font-weight:500">${prefix}${fmtR(d.amount)}</td><td style="padding:9px 6px;border-bottom:1px solid #1a1a1a;color:var(--muted)">${d.note||'—'}</td><td style="padding:9px 6px;border-bottom:1px solid #1a1a1a"><button onclick="deleteDeposit('${f.id}','${d.id}')" style="background:none;border:none;cursor:pointer;color:#333;font-size:13px" onmouseover="this.style.color='#c0392b'" onmouseout="this.style.color='#333'">✕</button></td></tr>`;});html+='</table>';}document.getElementById('histContent').innerHTML=html;document.getElementById('histModal').classList.add('active');}
function deleteDeposit(fid,did){
  const f=funds.find(x=>x.id===fid);
  const dep=f.deposits.find(function(d){return d.id===did;});
  f.deposits=f.deposits.filter(d=>d.id!==did);
  saveFunds();
  if(dep&&dep.cfId) removeFromCF(dep.cfId);
  openHistory(fid);renderFunds();
}
function postToCF(opts){
  var mk=(opts.date||localDateStr(new Date())).slice(0,7);
  var cfData=loadCFData();
  if(!cfData[mk]) cfData[mk]={income:[],expenses:[]};
  var section=opts.type==='income'?'income':'expenses';
  var cfId=uid();
  var rec = {
    id:cfId, label:opts.label, amount:opts.amount,
    icon:opts.icon||'', date:opts.date||localDateStr(new Date()),
    auto:false, account:opts.sourceCardName||'',
    sourceType:opts.sourceType||'', sourceId:opts.sourceId||'',
    note:opts.note||'',
    // createdAt is the precise ISO timestamp this entry was logged. The bank-
    // bucket math uses it to decide whether to count this entry against the
    // running balance (only entries created AFTER the baseline timestamp count).
    createdAt: new Date().toISOString()
  };
  // Carry destBank through so savings allocations drain the right bucket
  // in the Available Cash card (May 2026 redesign).
  if(opts.destBank) rec.destBank = opts.destBank;
  cfData[mk][section].push(rec);
  saveCFData(cfData);
  return cfId;
}
function removeFromCF(cfId){
  if(!cfId) return;
  var cfData=loadCFData();
  var changed=false;
  Object.keys(cfData).forEach(function(mk){
    ['income','expenses'].forEach(function(sec){
      if(cfData[mk]&&cfData[mk][sec]){
        var b=cfData[mk][sec].length;
        cfData[mk][sec]=cfData[mk][sec].filter(function(e){return e.id!==cfId;});
        if(cfData[mk][sec].length!==b) changed=true;
      }
    });
  });
  if(changed) saveCFData(cfData);
}

// ══ USE FUNDS / SPEND FROM CARD ══

var _useFundsCFEnabled = true;

function toggleUseFundsCF(){
  _useFundsCFEnabled = !_useFundsCFEnabled;
  var btn   = document.getElementById('useFundsCFToggle');
  var thumb = document.getElementById('useFundsCFThumb');
  var note  = document.getElementById('useFundsCFNote');
  btn.style.background   = _useFundsCFEnabled ? '#c8f230' : '#333';
  thumb.style.left       = _useFundsCFEnabled ? '22px' : '3px';
  thumb.style.background = _useFundsCFEnabled ? '#000' : '#666';
  note.style.color       = _useFundsCFEnabled ? '#3a5a00' : '#444';
  note.textContent       = _useFundsCFEnabled
    ? '✓ Will appear in Cash Flow → Expenses this month'
    : '— Will NOT be added to Cash Flow';
}

function openUseFunds(cardType, cardId){
  // cardType: 'savings' | 'maint' | 'custommaint'
  _useFundsCFEnabled = true;
  document.getElementById('useFundsCFToggle').style.background = '#c8f230';
  document.getElementById('useFundsCFThumb').style.left = '22px';
  document.getElementById('useFundsCFThumb').style.background = '#000';
  document.getElementById('useFundsCFNote').style.color = '#3a5a00';
  document.getElementById('useFundsCFNote').textContent = '✓ Will appear in Cash Flow → Expenses this month';

  document.getElementById('useFundsFundId').value  = cardId || '';
  document.getElementById('useFundsCardType').value = cardType;
  document.getElementById('useFundsCardId').value  = cardId || '';
  document.getElementById('useFundsDesc').value    = '';
  document.getElementById('useFundsAmt').value     = '';
  document.getElementById('useFundsDate').value    = localDateStr(new Date());

  // Set title & card name
  var title = '💸 Use Funds';
  var cardName = '';
  if(cardType === 'savings'){
    var f = funds.find(function(x){ return x.id === cardId; });
    if(f){ cardName = f.emoji + ' ' + f.name; title = '💸 Spend from ' + f.name; }
  } else if(cardType === 'custommaint'){
    var cards = loadCustomMaintCards();
    var c = cards.find(function(x){ return x.id === cardId; });
    if(c){ cardName = c.emoji + ' ' + c.name; title = '💸 Spend from ' + c.name; }
  } else if(cardType === 'maint'){
    cardName = '🔧 Maintenance Fund';
    title = '💸 Spend from Maintenance';
  }
  document.getElementById('useFundsTitle').textContent    = title;
  document.getElementById('useFundsCardName').textContent = cardName;

  // Populate car dropdown
  var carSel = document.getElementById('useFundsCarSel');
  var carField = document.getElementById('useFundsCarField');
  var cars = loadCarsData ? loadCarsData() : [];
  carSel.innerHTML = '<option value="">— No car link —</option>';
  if(cars.length){
    cars.forEach(function(car){
      var opt = document.createElement('option');
      opt.value = car.id;
      opt.textContent = (car.emoji || '🚗') + ' ' + car.name + (car.reg ? ' (' + car.reg + ')' : '');
      carSel.appendChild(opt);
    });
    carField.style.display = 'block';
  } else {
    carField.style.display = 'none';
  }

  document.getElementById('useFundsModal').classList.add('active');
  setTimeout(function(){ document.getElementById('useFundsDesc').focus(); }, 100);
}

function confirmUseFunds(){
  var cardType = document.getElementById('useFundsCardType').value;
  var cardId   = document.getElementById('useFundsCardId').value;
  var desc     = document.getElementById('useFundsDesc').value.trim();
  var amt      = parseFloat(document.getElementById('useFundsAmt').value);
  var date     = document.getElementById('useFundsDate').value || localDateStr(new Date());
  var carId    = document.getElementById('useFundsCarSel').value;

  if(!desc){ alert('Please enter a description.'); return; }
  if(!amt || amt <= 0){ alert('Please enter a valid amount.'); return; }

  var mk = date.slice(0, 7); // YYYY-MM

  // ── 1. Deduct from the source card ──
  if(cardType === 'savings'){
    var f = funds.find(function(x){ return x.id === cardId; });
    if(f){
      f.deposits.push({ id: uid(), txnType: 'out', amount: amt, date: date, note: '💸 ' + desc + (carId ? ' · Car' : ''), cfPosted: true });
      saveFunds();
      renderFunds();
    }
  } else if(cardType === 'custommaint'){
    var cmCards = loadCustomMaintCards();
    var cm = cmCards.find(function(x){ return x.id === cardId; });
    if(cm){
      if(!cm.spends) cm.spends = [];
      cm.spends.push({ id: uid(), amount: amt, date: date, note: desc + (carId ? ' · Car' : ''), carId: carId || null });
      saveCustomMaintCards(cmCards);
      renderCustomMaintCards();
    }
  } else if(cardType === 'maint'){
    // Log as a negative entry in the original maint data
    var mdata = getMaintData();
    mdata.push({ id: uid(), amount: -amt, date: date, note: '💸 ' + desc + (carId ? ' · Car' : ''), isSpend: true });
    saveMaintData(mdata);
    renderMaintCard();
  }

  // ── 2. Link to car — log as a car expense ──
  if(carId){
    var carsData = loadCarsData();
    var car = carsData.find(function(c){ return c.id === carId; });
    if(car){
      if(!car.expenses) car.expenses = [];
      car.expenses.push({
        id: uid(),
        date: date,
        desc: desc,
        amount: amt,
        category: 'Maintenance',
        note: 'From ' + (cardType === 'savings' ? 'Savings' : 'Maintenance') + ' card'
      });
      saveCarsData(carsData);
    }
  }

  // ── 3. Add to Cash Flow as expense ──
  if(_useFundsCFEnabled){
    var cfData = loadCFData();
    if(!cfData[mk]) cfData[mk] = { income: [], expenses: [] };
    var icon = cardType === 'savings' ? '💰' : '🔧';
    var cardLabel = '';
    if(cardType === 'savings'){
      var sf = funds.find(function(x){ return x.id === cardId; });
      cardLabel = sf ? sf.emoji + ' ' + sf.name : 'Savings';
    } else if(cardType === 'custommaint'){
      var cmc = loadCustomMaintCards().find(function(x){ return x.id === cardId; });
      cardLabel = cmc ? cmc.emoji + ' ' + cmc.name : 'Maintenance';
    } else {
      cardLabel = '🔧 Maintenance';
    }
    cfData[mk].expenses.push({
      id: uid(),
      label: desc,
      amount: amt,
      date: date,
      icon: icon,
      account: cardLabel,
      category: 'Card Spend',
      note: 'Spent from ' + cardLabel
    });
    saveCFData(cfData);
  }

  closeModal('useFundsModal');
  showBackupReminder('Spend logged — backup recommended');
}

// ══ CARPOOL ══

// ══ MOVE TO SAVINGS — entry point from Cash Flow "+ Move" button ═════════
// Opens a fund picker showing all active (non-expense) savings funds. When
// the user taps one, we hand off to the standard openDeposit() modal which
// has the From-bank picker baked in.
function openMoveToSavings(){
  var list = document.getElementById('moveToSavingsList');
  if(!list) return;
  // `funds` is the module-scoped array in this file (declared with `let` at top).
  var activeFunds = (typeof funds !== 'undefined' ? funds : []).filter(function(f){ return !f._deleted; });
  if(!activeFunds.length){
    list.innerHTML = '<div style="padding:16px;text-align:center;color:#555;font-size:12px;letter-spacing:1px;">No savings funds yet. Create one on the Savings tab first.</div>';
  } else {
    list.innerHTML = activeFunds.map(function(f){
      var saved = (typeof fundTotal === 'function') ? fundTotal(f) : 0;
      var goal  = f.goal || 0;
      var pct   = goal > 0 ? Math.min(100, Math.round((saved/goal)*100)) : 0;
      return '<button onclick="_moveToSavingsPick(\''+f.id+'\')" '
        + 'style="width:100%;text-align:left;background:#0a0a0a;border:1px solid #2a2a2a;border-radius:8px;padding:12px 14px;margin-bottom:8px;cursor:pointer;display:flex;align-items:center;gap:12px;font-family:DM Mono,monospace;">'
        + '<span style="font-size:22px;flex-shrink:0;">'+(f.emoji||'💰')+'</span>'
        + '<div style="flex:1;min-width:0;">'
        +   '<div style="font-size:13px;color:#efefef;font-family:Syne,sans-serif;font-weight:700;">'+f.name+'</div>'
        +   '<div style="font-size:10px;color:#666;letter-spacing:1px;margin-top:2px;">'+fmtR(saved)+(goal?' / '+fmtR(goal)+' · '+pct+'%':'')+'</div>'
        + '</div>'
        + '<span style="color:#c8f230;font-size:18px;">→</span>'
        + '</button>';
    }).join('');
  }
  document.getElementById('moveToSavingsModal').classList.add('active');
}

function _moveToSavingsPick(fundId){
  closeModal('moveToSavingsModal');
  // Open the standard deposit modal — it has amount + From-bank + date + note.
  openDeposit(fundId);
}

// ══ DEADLINE BACKFILL MODAL ══════════════════════════════════════════════
// On Savings tab load, scan for non-expense funds without a `deadline`. If
// any exist, surface a one-shot modal asking the user to pick a date for
// each. Defers gracefully on "Later" so they can still use the app.

function _fundsMissingDeadline(){
  return funds.filter(function(f){ return f && !f.isExpense && !f._deleted && !f.deadline; });
}

function maybePromptDeadlineBackfill(){
  var missing = _fundsMissingDeadline();
  if(!missing.length) return;
  var list = document.getElementById('deadlineBackfillList');
  if(!list) return;
  // Build rows: emoji + name + date input
  list.innerHTML = missing.map(function(f){
    return '<div style="background:#0a0a0a;border:1px solid #2a2a2a;border-radius:8px;padding:10px 12px;margin-bottom:8px;display:flex;align-items:center;gap:10px;font-family:DM Mono,monospace;">'
      + '<span style="font-size:20px;flex-shrink:0;">'+(f.emoji||'💰')+'</span>'
      + '<div style="flex:1;min-width:0;">'
      +   '<div style="font-size:12px;color:#efefef;font-family:Syne,sans-serif;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+f.name+'</div>'
      +   '<div style="font-size:9px;color:#666;letter-spacing:1px;margin-top:2px;">Goal '+fmtR(f.goal)+'</div>'
      + '</div>'
      + '<input type="date" data-fund-id="'+f.id+'" class="dl-backfill-input" style="background:#fff;border:1px solid #ccc;border-radius:4px;padding:5px 6px;font-family:DM Mono,monospace;font-size:11px;color:#000;width:130px;flex-shrink:0;"/>'
      + '</div>';
  }).join('');
  document.getElementById('deadlineBackfillModal').classList.add('active');
}

function confirmDeadlineBackfill(){
  var inputs = document.querySelectorAll('.dl-backfill-input');
  var changed = 0, skipped = 0;
  inputs.forEach(function(inp){
    var id = inp.getAttribute('data-fund-id');
    var val = inp.value;
    if(!val){ skipped++; return; }
    var f = funds.find(function(x){ return x.id === id; });
    if(f){ f.deadline = val; changed++; }
  });
  if(changed > 0){ saveFunds(); renderFunds(); }
  closeModal('deadlineBackfillModal');
  if(skipped > 0 && changed > 0){
    alert('Saved '+changed+'. '+skipped+' still without a deadline — you\'ll be prompted again next time.');
  } else if(skipped > 0 && changed === 0){
    // user hit Save All without picking any — leave them be
  }
}

// Run the prompt shortly after page load so funds are loaded and DOM is ready.
if(typeof window !== 'undefined'){
  setTimeout(function(){ try { maybePromptDeadlineBackfill(); } catch(e){} }, 1500);
}
window.maybePromptDeadlineBackfill = maybePromptDeadlineBackfill;
window.confirmDeadlineBackfill = confirmDeadlineBackfill;
