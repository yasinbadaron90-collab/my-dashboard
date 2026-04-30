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

function renderFunds(){
  const grid=document.getElementById('fundGrid');grid.innerHTML='';
  let grand=0;
  if(!funds.length){
    grid.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:48px 24px;color:#333;font-size:13px;letter-spacing:1px;">No savings funds yet.<br><span style="font-size:11px;color:#2a2a2a;">Tap <strong style="color:#555;">+ New Savings Fund</strong> to get started.</span></div>';
    renderBankStrip();
    try { if(typeof renderMaintCard === 'function') renderMaintCard(); } catch(e){}
    return;
  }
  funds.forEach(f=>{
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
    card.innerHTML = '<div class="fund-top"><div><span class="fund-emoji">'+f.emoji+'</span><div class="fund-name">'+f.name+'</div><div class="fund-weekly">'+subtitleLabel+' · started '+startedLabel+'</div></div><div style="display:flex;align-items:center;gap:6px"><button class="'+chevClass+'" onclick="toggleFundCard(\''+f.id+'\',this)" title="Collapse"><span class="chev">&#8964;</span></button><div class="fund-actions admin-only" style="display:flex;gap:6px"><button class="icon-btn" onclick="openHistory(\''+f.id+'\')">☰</button><button class="icon-btn" onclick="openEditFund(\''+f.id+'\')">✎</button><button class="icon-btn danger" onclick="deleteFund(\''+f.id+'\')">✕</button></div></div></div>'
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
  buildEmojiGrid();buildColorGrid();
  document.getElementById('fundModal').classList.add('active');
}
function openEditFund(id){const f=funds.find(x=>x.id===id);if(!f)return;editingId=id;selEmoji=f.emoji;selColor=f.color;document.getElementById('modalTitle').textContent='Edit Fund';document.getElementById('fName').value=f.name;document.getElementById('fGoal').value=f.goal;targetType=f.targetType||'weekly';document.getElementById('fWeekly').value=f.targetType==='monthly'?Math.round(f.weekly*4.33):f.weekly;document.getElementById('fStart').value=f.start;setTargetType(targetType);updateTargetHint();buildEmojiGrid();buildColorGrid();document.getElementById('fundModal').classList.add('active');}
function buildEmojiGrid(){const g=document.getElementById('emojiGrid');g.innerHTML='';EMOJIS.forEach(e=>{const b=document.createElement('button');b.className='emoji-opt'+(e===selEmoji?' selected':'');b.textContent=e;b.onclick=()=>{selEmoji=e;buildEmojiGrid();};g.appendChild(b);});}
function buildColorGrid(){const g=document.getElementById('colorGrid');g.innerHTML='';COLORS.forEach(c=>{const b=document.createElement('button');b.className='color-opt'+(c===selColor?' selected':'');b.style.background=c;b.onclick=()=>{selColor=c;buildColorGrid();};g.appendChild(b);});}
function saveFund(){const name=document.getElementById('fName').value.trim();const goal=parseFloat(document.getElementById('fGoal').value);const rawAmt=parseFloat(document.getElementById('fWeekly').value)||0;const weekly=targetType==='monthly'?parseFloat((rawAmt/4.33).toFixed(2)):rawAmt;const start=document.getElementById('fStart').value;if(!name||!goal||!start)return;const isNew=!editingId;if(editingId){const f=funds.find(x=>x.id===editingId);Object.assign(f,{name,emoji:selEmoji,color:selColor,goal,weekly,targetType,start,isExpense:f.isExpense||false});}else{funds.push({id:uid(),name,emoji:selEmoji,color:selColor,goal,weekly:weekly||200,targetType,start,deposits:[]});}saveFunds();closeModal('fundModal');renderFunds();showBackupReminder(isNew?'New savings card created':'Savings card updated');}
function deleteFund(id){if(!confirm('Delete this fund?'))return;funds=funds.filter(f=>f.id!==id);saveFunds();renderFunds();}
function openDeposit(id){depositingId=id;const f=funds.find(x=>x.id===id);document.getElementById('depFundName').textContent=f.emoji+' '+f.name;document.getElementById('depAmount').value=f.weekly||200;document.getElementById('depDate').value=localDateStr(new Date());document.getElementById('depNote').value='';document.getElementById('depModal').classList.add('active');}
function confirmDeposit(){
  const amount=parseFloat(document.getElementById('depAmount').value);
  const date=document.getElementById('depDate').value||localDateStr(new Date());
  const note=document.getElementById('depNote').value.trim();
  if(!amount||amount<=0)return;
  const f=funds.find(x=>x.id===depositingId);
  const cfId_dep=postToCF({label:'Savings - '+f.name,amount:amount,date:date,icon:'savings',type:'expense',sourceType:'savings_deposit',sourceId:depositingId,sourceCardName:f.name,note:note});
  f.deposits.push({id:uid(),amount,note,date,cfId:cfId_dep});
  const manuals=loadManualBalances();
  if(manuals[depositingId]!==undefined){delete manuals[depositingId];saveManualBalances(manuals);}
  saveFunds();closeModal('depModal');renderFunds();
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
  cfData[mk][section].push({
    id:cfId, label:opts.label, amount:opts.amount,
    icon:opts.icon||'', date:opts.date||localDateStr(new Date()),
    auto:false, account:opts.sourceCardName||'',
    sourceType:opts.sourceType||'', sourceId:opts.sourceId||'',
    note:opts.note||''
  });
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
