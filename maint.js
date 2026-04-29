// Maintenance: fund, custom maintenance cards




// ══ CUSTOM MAINTENANCE CARDS ══
var cmSelEmoji = '🔧';
var cmContributors = PASSENGERS.slice(); // defaults, editable

function loadCustomMaintCards(){ try{ return JSON.parse(lsGet(CUSTOM_MAINT_KEY)||'[]'); }catch(e){ return []; } }
function saveCustomMaintCards(d){ lsSet(CUSTOM_MAINT_KEY, JSON.stringify(d)); }

const CM_EMOJIS = ['🔧','🏠','🚗','🛞','⚡','🌿','🏗️','🛁','🪟','🔑','🧹','💧','🔩','🪛','🏋️','🎯'];

function openNewMaintCard(){
  cmSelEmoji = '🔧';
  cmContributors = PASSENGERS.slice();
  document.getElementById('customMaintTitle').textContent = '🔧 New Maintenance Card';
  document.getElementById('cmName').value = '';
  document.getElementById('cmTarget').value = '';
  document.getElementById('cmEditId').value = '';
  buildCmEmojiGrid();
  renderCmContributors();
  document.getElementById('customMaintModal').classList.add('active');
}

function openEditMaintCard(id){
  const cards = loadCustomMaintCards();
  const c = cards.find(function(x){ return x.id === id; });
  if(!c) return;
  cmSelEmoji = c.emoji || '🔧';
  cmContributors = c.contributors ? [...c.contributors] : [];
  document.getElementById('customMaintTitle').textContent = '✏️ Edit Card';
  document.getElementById('cmName').value = c.name;
  document.getElementById('cmTarget').value = c.target;
  document.getElementById('cmEditId').value = id;
  buildCmEmojiGrid();
  renderCmContributors();
  document.getElementById('customMaintModal').classList.add('active');
}

function buildCmEmojiGrid(){
  const g = document.getElementById('cmEmojiGrid');
  g.innerHTML = '';
  CM_EMOJIS.forEach(function(e){
    const b = document.createElement('button');
    b.className = 'emoji-opt' + (e === cmSelEmoji ? ' selected' : '');
    b.textContent = e;
    b.type = 'button';
    b.onclick = function(){ cmSelEmoji = e; buildCmEmojiGrid(); };
    g.appendChild(b);
  });
}

function renderCmContributors(){
  const list = document.getElementById('cmContributorList');
  list.innerHTML = '';
  cmContributors.forEach(function(name, i){
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;';
    row.innerHTML =
      '<input type="text" value="'+name+'" oninput="cmContributors['+i+']=this.value" style="flex:1;padding:8px 10px;border-radius:4px;border:1px solid var(--border);background:#111;color:#efefef;font-family:\'DM Mono\',monospace;font-size:13px;outline:none;"/>'
      +'<button type="button" onclick="cmContributors.splice('+i+',1);renderCmContributors();" style="background:none;border:1px solid #2a1a1a;border-radius:4px;width:28px;height:28px;color:#555;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;" onmouseover="this.style.borderColor=\'#c0392b\';this.style.color=\'#c0392b\'" onmouseout="this.style.borderColor=\'#2a1a1a\';this.style.color=\'#555\'">✕</button>';
    list.appendChild(row);
  });
}

function addCmContributor(){
  cmContributors.push('');
  renderCmContributors();
  // Focus last input
  setTimeout(function(){
    const inputs = document.querySelectorAll('#cmContributorList input');
    if(inputs.length) inputs[inputs.length-1].focus();
  }, 50);
}

function saveCustomMaintCard(){
  const name = document.getElementById('cmName').value.trim();
  const target = parseFloat(document.getElementById('cmTarget').value) || 0;
  const editId = document.getElementById('cmEditId').value;
  const rawNames = cmContributors.filter(function(c){
    return typeof c === 'string' ? c.trim() : c.name && c.name.trim();
  });
  if(!name){ alert('Please enter a card name.'); return; }
  if(target < 1){ alert('Please enter a monthly target of at least R1.'); return; } // #6 validation
  if(!rawNames.length){ alert('Add at least one contributor.'); return; }

  const cards = loadCustomMaintCards();

  if(editId){
    const idx = cards.findIndex(function(c){ return c.id === editId; });
    if(idx > -1){
      const existing = cards[idx];
      // Merge: keep existing contributor IDs where name matches, create new IDs for new ones
      const existingContribs = existing.contributors || [];
      const mergedContribs = cmContributors.map(function(c){
        const newName = typeof c === 'string' ? c.trim() : c.name.trim();
        // Find existing contributor with same name or same id
        const found = existingContribs.find(function(ec){
          return (typeof ec === 'object' ? ec.id === (typeof c === 'object' ? c.id : null) || ec.name === newName : ec === newName);
        });
        if(found && typeof found === 'object') return { id: found.id, name: newName };
        if(found && typeof found === 'string') return { id: uid(), name: newName };
        return { id: uid(), name: newName };
      });
      cards[idx].name = name;
      cards[idx].emoji = cmSelEmoji;
      cards[idx].target = target;
      cards[idx].contributors = mergedContribs;
      // Migrate any string-person entries to use IDs
      cards[idx].entries = (cards[idx].entries||[]).map(function(e){
        if(e.personId) return e; // already migrated
        const match = mergedContribs.find(function(c){ return c.name === e.person; });
        return Object.assign({}, e, { personId: match ? match.id : null });
      });
    }
  } else {
    const contributors = cmContributors.map(function(c){
      const n = typeof c === 'string' ? c.trim() : c.name.trim();
      return { id: uid(), name: n };
    });
    cards.push({ id: uid(), name, emoji: cmSelEmoji, target, contributors, entries: [] });
  }
  saveCustomMaintCards(cards);
  closeModal('customMaintModal');
  renderCustomMaintCards();
}

function deleteCustomMaintCard(id){
  if(!confirm('Delete this card? All contribution history will be lost.')) return;
  const cards = loadCustomMaintCards().filter(function(c){ return c.id !== id; });
  saveCustomMaintCards(cards);
  renderCustomMaintCards();
}

function openCustomMaintContrib(cardId){
  document.getElementById('cmContribCardId').value = cardId;
  document.getElementById('cmContribAmt').value = '';
  document.getElementById('cmContribNote').value = '';
  document.getElementById('cmContribDate').value = localDateStr(new Date());
  const cards = loadCustomMaintCards();
  const card = cards.find(function(c){ return c.id === cardId; });
  const sel = document.getElementById('cmContribPerson');
  sel.innerHTML = '';
  if(card && card.contributors){
    card.contributors.forEach(function(p){
      const o = document.createElement('option');
      const id = typeof p === 'object' ? p.id : p;
      const name = typeof p === 'object' ? p.name : p;
      o.value = id;
      o.textContent = name;
      sel.appendChild(o);
    });
  }
  document.getElementById('customMaintContribModal').classList.add('active');
}

function confirmCustomMaintContrib(){
  const cardId = document.getElementById('cmContribCardId').value;
  const amount = parseFloat(document.getElementById('cmContribAmt').value);
  const personId = document.getElementById('cmContribPerson').value;
  const date = document.getElementById('cmContribDate').value || localDateStr(new Date());
  const note = document.getElementById('cmContribNote').value.trim();
  if(!amount || amount <= 0){ alert('Enter a valid amount.'); return; }
  const cards = loadCustomMaintCards();
  const card = cards.find(function(c){ return c.id === cardId; });
  if(!card) return;
  // Resolve name from ID for display
  const contrib = (card.contributors||[]).find(function(c){ return (typeof c === 'object' ? c.id : c) === personId; });
  const personName = contrib ? (typeof contrib === 'object' ? contrib.name : contrib) : personId;
  if(!card.entries) card.entries = [];
  var cmId=uid();
  var cmCfId=postToCF({label:card.name+' - '+personName,amount:amount,date:date,icon:'maint',type:'expense',sourceType:'custommaint',sourceId:cardId,sourceCardName:card.name,note:note});
  card.entries.push({ id: cmId, personId, person: personName, amount, date, note, cfId:cmCfId });
  saveCustomMaintCards(cards);
  closeModal('customMaintContribModal');
  renderCustomMaintCards();
}

function deleteCustomMaintEntry(cardId, entryId){
  const cards = loadCustomMaintCards();
  const card = cards.find(function(c){ return c.id === cardId; });
  if(!card) return;
  var entry=(card.entries||[]).find(function(e){return e.id===entryId;});
  if(entry&&entry.cfId) removeFromCF(entry.cfId);
  card.entries = (card.entries||[]).filter(function(e){ return e.id !== entryId; });
  saveCustomMaintCards(cards);
  renderCustomMaintCards();
}

function renderCustomMaintCards(){
  const wrap = document.getElementById('customMaintCardsWrap');
  if(!wrap) return;
  const cards = loadCustomMaintCards();
  if(!cards.length){ wrap.innerHTML = ''; return; }
  const now = new Date();
  const monthKey = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');

  wrap.innerHTML = cards.map(function(card){
    const entries = card.entries || [];
    const monthEntries = entries.filter(function(e){ return e.date && e.date.startsWith(monthKey); });
    const monthTotal = monthEntries.reduce(function(s,e){ return s+e.amount; }, 0);
    const allTotal = entries.reduce(function(s,e){ return s+e.amount; }, 0);
    const pct = Math.min(100, (monthTotal / card.target) * 100);
    const remaining = Math.max(0, card.target - monthTotal);
    const onTrack = monthTotal >= card.target;
    const barColor = onTrack ? '#c8f230' : monthTotal >= card.target*0.5 ? '#f2a830' : '#f23060';

    // Per-person totals — keyed by ID, displayed by current name
    const byPersonId = {};
    const contribList = card.contributors || [];
    contribList.forEach(function(p){
      const id = typeof p === 'object' ? p.id : p;
      byPersonId[id] = 0;
    });
    entries.forEach(function(e){
      const key = e.personId || e.person; // fallback to name for legacy entries
      if(byPersonId[key] !== undefined) byPersonId[key] += e.amount;
    });
    const personCols = contribList.map(function(p){
      const id = typeof p === 'object' ? p.id : p;
      const name = typeof p === 'object' ? p.name : p;
      return '<div style="padding:10px;border-right:1px solid var(--border);text-align:center;flex:1;">'
        +'<div style="font-size:9px;color:#444;letter-spacing:1px;text-transform:uppercase;margin-bottom:3px;">'+name+'</div>'
        +'<div style="font-size:13px;font-weight:700;color:#efefef;">'+fmtR(byPersonId[id]||0)+'</div>'
        +'</div>';
    }).join('');

    const recent = entries.slice().sort(function(a,b){ return new Date(b.date)-new Date(a.date); }).slice(0,5);
    const recentRows = recent.length
      ? recent.map(function(e){
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #161616;">'
            +'<div style="display:flex;flex-direction:column;gap:2px;">'
              +'<span style="font-size:11px;color:#efefef;">'+e.person+(e.note?' · '+e.note:'')+'</span>'
              +'<span style="font-size:10px;color:#333;">'+e.date+'</span>'
            +'</div>'
            +'<div style="display:flex;align-items:center;gap:8px;">'
              +'<span style="font-size:12px;font-weight:500;color:#c8f230;">+'+fmtR(e.amount)+'</span>'
              +'<button onclick="deleteCustomMaintEntry(\''+card.id+'\',\''+e.id+'\')" style="background:none;border:1px solid #2a1a1a;border-radius:4px;width:22px;height:22px;color:#444;cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center;" class="admin-only" onmouseover="this.style.borderColor=\'#c0392b\';this.style.color=\'#c0392b\'" onmouseout="this.style.borderColor=\'#2a1a1a\';this.style.color=\'#444\'">✕</button>'
            +'</div>'
          +'</div>';
        }).join('')
      : '<div style="font-size:11px;color:#333;padding:8px 0;">No contributions yet.</div>';

    return '<div class="fund-card" style="border-color:#2a3000;max-width:720px;margin:0 auto 14px;">'
      // Top
      +'<div class="fund-top" style="border-bottom-color:#2a3000;">'
        +'<div>'
          +'<span class="fund-emoji">'+card.emoji+'</span>'
          +'<div class="fund-name">'+card.name+'</div>'
          +'<div class="fund-weekly" style="color:#8ab820;">R'+card.target.toLocaleString('en-ZA')+'/month target</div>'
        +'</div>'
        +'<div style="display:flex;align-items:center;gap:6px;">'
          +'<div class="fund-actions admin-only" style="display:flex;gap:6px;">'
            +'<button class="icon-btn" onclick="openEditMaintCard(\''+card.id+'\')" title="Edit">✏️</button>'
            +'<button class="icon-btn danger" onclick="deleteCustomMaintCard(\''+card.id+'\')" title="Delete">🗑</button>'
            +'<button class="icon-btn" onclick="openCustomMaintContrib(\''+card.id+'\')" style="border-color:#3a5a00;color:#c8f230;" title="Add contribution">＋</button>'
            +'<button class="icon-btn admin-only" onclick="openUseFunds(\'custommaint\',\''+card.id+'\')" style="border-color:#5a3a00;color:#f2a830;" title="Use funds / log spend">💸</button>'
          +'</div>'
        +'</div>'
      +'</div>'
      // Stats
      +'<div class="fund-body">'
        +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:1px solid var(--border);margin:-16px -18px 0;padding:0;">'
          +'<div style="padding:12px 14px;border-right:1px solid var(--border);">'
            +'<div style="font-size:9px;color:#444;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px;">This Month</div>'
            +'<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:15px;color:#c8f230;">'+fmtR(monthTotal)+'</div>'
          +'</div>'
          +'<div style="padding:12px 10px;border-right:1px solid var(--border);">'
            +'<div style="font-size:9px;color:#444;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px;">Total Saved</div>'
            +'<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:15px;color:#c8f230;">'+fmtR(allTotal)+'</div>'
          +'</div>'
          +'<div style="padding:12px 10px;">'
            +'<div style="font-size:9px;color:#444;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px;">Status</div>'
            +'<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:13px;color:'+(onTrack?'#c8f230':'#f2a830')+';">'+(onTrack?'✅ On track':'⚠ R'+remaining.toFixed(0)+' short')+'</div>'
          +'</div>'
        +'</div>'
        // Progress bar
        +'<div style="padding:10px 0;border-bottom:1px solid var(--border);">'
          +'<div style="height:5px;background:#2a2a2a;border-radius:3px;overflow:hidden;">'
            +'<div style="width:'+pct+'%;height:100%;background:'+barColor+';border-radius:3px;transition:width .5s ease;box-shadow:0 0 8px '+barColor+'55;"></div>'
          +'</div>'
          +'<div style="font-size:10px;color:#444;margin-top:5px;letter-spacing:1px;">'+(onTrack?'🎉 Target reached!':pct.toFixed(0)+'% · R'+remaining.toFixed(0)+' to go')+'</div>'
        +'</div>'
        // Per-person
        +'<div style="display:flex;border-bottom:1px solid var(--border);margin:0 -18px;">'+personCols+'</div>'
        // Recent
        +'<div style="padding-top:8px;">'+recentRows+'</div>'
      +'</div>'
    +'</div>';
  }).join('');
}

function getMaintData(){
  try{ const v=lsGet(MAINT_KEY); if(v) return JSON.parse(v); }catch(e){}
  return [];
}
function saveMaintData(d){
  lsSet(MAINT_KEY, JSON.stringify(d));
}

function renderMaintCard(){
  const data = getMaintData();
  const now = new Date();
  const monthKey = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  const monthEntries = data.filter(function(e){ return e.date && e.date.startsWith(monthKey); });
  const monthTotal = monthEntries.reduce(function(s,e){ return s + e.amount; }, 0);
  const allTotal = data.reduce(function(s,e){ return s + e.amount; }, 0);
  const byPerson = {};
  PASSENGERS.forEach(function(p){ byPerson[p] = 0; });
  data.forEach(function(e){ if(byPerson[e.person] !== undefined) byPerson[e.person] += e.amount; });
  const target = getMaintTarget();
  const pct = Math.min(100, (monthTotal / target) * 100);
  const remaining = Math.max(0, target - monthTotal);
  const onTrack = monthTotal >= target;
  const barColor = onTrack ? '#c8f230' : monthTotal >= target * 0.5 ? '#f2a830' : '#f23060';
  const el = function(id){ return document.getElementById(id); };
  // Dynamic title + subtitle (name and target are user-editable)
  if(el('maintFundName'))     el('maintFundName').textContent = getMaintFundName();
  if(el('maintTargetLabel'))  el('maintTargetLabel').textContent = fmtR(target)+'/month target · carpool contributions';
  if(el('maintMonthAmt')) el('maintMonthAmt').textContent = fmtR(monthTotal);
  if(el('maintTotalAmt')) el('maintTotalAmt').textContent = fmtR(allTotal);
  if(el('maintStatus')){ el('maintStatus').textContent = onTrack ? '✅ On track' : '⚠ R'+remaining.toFixed(0)+' short'; el('maintStatus').style.color = onTrack ? '#c8f230' : '#f2a830'; }
  if(el('maintProgBar')){ el('maintProgBar').style.width = pct+'%'; el('maintProgBar').style.background = barColor; el('maintProgBar').style.boxShadow = '0 0 8px '+barColor+'55'; }
  if(el('maintProgLabel')) el('maintProgLabel').textContent = onTrack ? '🎉 Target reached this month!' : pct.toFixed(0)+'% · R'+remaining.toFixed(0)+' to go this month';
  // Dynamic per-person breakdown
  const personWrap = el('maintPersonBreakdown');
  if(personWrap){
    personWrap.innerHTML = PASSENGER_DATA.map(function(p, i){
      const isLast = i === PASSENGER_DATA.length - 1;
      return '<div style="padding:10px '+(i===0?'14px':'10px')+';'+(isLast?'':'border-right:1px solid var(--border);')+'text-align:center;flex:1;">'
        +'<div style="font-size:9px;color:#444;letter-spacing:1px;text-transform:uppercase;margin-bottom:3px;">'+p.name+'</div>'
        +'<div style="font-size:13px;font-weight:700;color:#efefef;">'+fmtR(byPerson[p.name]||0)+'</div>'
        +'</div>';
    }).join('');
  } else {
    // Fallback for static HTML IDs
    if(el('maintDavid')) el('maintDavid').textContent = fmtR(byPerson.David||0);
    if(el('maintLezaun')) el('maintLezaun').textContent = fmtR(byPerson.Lezaun||0);
    if(el('maintShireen')) el('maintShireen').textContent = fmtR(byPerson.Shireen||0);
  }
  const recent = [...data].sort(function(a,b){ return new Date(b.date)-new Date(a.date); }).slice(0,5);
  if(el('maintRecentRows')){
    if(!recent.length){ el('maintRecentRows').innerHTML = '<div style="font-size:11px;color:#333;padding:8px 0;">No contributions yet.</div>'; }
    else { el('maintRecentRows').innerHTML = recent.map(function(e){ var fromLabel=e.person&&e.person!=='undefined'?e.person:(e.note?'Manual':'—'); var amt=Number(e.amount||0); var amtColor=amt>=0?'#c8f230':'#f23060'; var amtText=(amt>=0?'+':'')+fmtR(Math.abs(amt)); return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #161616"><div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:11px;color:#efefef">'+fromLabel+(e.note?' · '+e.note:'')+'</span><span style="font-size:10px;color:#333">'+e.date+'</span></div><span style="font-size:12px;font-weight:500;color:'+amtColor+';">'+amtText+'</span></div>'; }).join(''); }
  }
}

// ── Edit-fund modal handlers ─────────────────────────────────────────────
// Opens a small dialog to rename the fund and change its monthly target.
function openMaintSettings(){
  const cur = getMaintSettings();
  const nameInp   = document.getElementById('maintEditName');
  const targetInp = document.getElementById('maintEditTarget');
  const status    = document.getElementById('maintEditStatus');
  if(nameInp)   nameInp.value   = cur.name;
  if(targetInp) targetInp.value = cur.target;
  if(status)    status.textContent = '';
  const m = document.getElementById('maintEditModal');
  if(m) m.classList.add('active');
}
function closeMaintSettings(){
  const m = document.getElementById('maintEditModal');
  if(m) m.classList.remove('active');
}
function saveMaintSettings(){
  const nameInp   = document.getElementById('maintEditName');
  const targetInp = document.getElementById('maintEditTarget');
  const status    = document.getElementById('maintEditStatus');
  const name = (nameInp && nameInp.value || '').trim();
  const target = parseFloat(targetInp && targetInp.value);
  if(!name){
    if(status){ status.style.color = '#f23060'; status.textContent = '✕ Name cannot be empty.'; }
    return;
  }
  if(!(target > 0)){
    if(status){ status.style.color = '#f23060'; status.textContent = '✕ Target must be a positive number.'; }
    return;
  }
  setMaintSettings(name, target);
  closeMaintSettings();
  // Refresh anything that depends on the name/target
  try { renderMaintCard();   } catch(e){}
  try { renderCarpool();     } catch(e){}
  try { renderFunds();       } catch(e){}
  try { odinRefreshIfOpen(); } catch(e){}
  try { showBackupReminder('Maintenance fund updated'); } catch(e){}
}


function openMaintContrib(){
  // Populate person select dynamically
  const sel = document.getElementById('maintPerson');
  sel.innerHTML = PASSENGER_DATA.map(function(p){
    return '<option value="'+p.name+'">'+p.name+'</option>';
  }).join('') + '<option value="Other">Other</option>';
  const amtEl = document.getElementById('maintAmt');
  if(amtEl){ amtEl.value = ''; amtEl.style.borderColor = ''; }
  document.getElementById('maintNote').value = '';
  document.getElementById('maintDate').value = localDateStr(new Date());
  // Clear stale feedback from a previous tap
  const statusEl = document.getElementById('maintModalStatus');
  if(statusEl){ statusEl.textContent = ''; statusEl.style.color = ''; }
  document.getElementById('maintModal').classList.add('active');
}

function confirmMaintContrib(){
  // Modal feedback line — was sharing id="maintStatus" with the card's status
  // indicator, which caused error/success messages to clobber the card display.
  // Now uses dedicated id="maintModalStatus".
  const statusEl = document.getElementById('maintModalStatus');
  const amtEl = document.getElementById('maintAmt');
  const amount = parseFloat(amtEl ? amtEl.value : '');
  const person = document.getElementById('maintPerson').value;
  const date = document.getElementById('maintDate').value || localDateStr(new Date());
  const note = document.getElementById('maintNote').value.trim();
  if(!amount || amount <= 0){
    if(statusEl){ statusEl.style.color='#f23060'; statusEl.textContent='⚠ Enter a valid amount first.'; }
    if(amtEl){ amtEl.style.borderColor='#f23060'; amtEl.focus(); }
    return;
  }
  try{
    if(amtEl) amtEl.style.borderColor='';
    if(statusEl){ statusEl.style.color='#c8f230'; statusEl.textContent='Saving…'; }
    var maintId=uid();
    var cfId_maint=postToCF({label:'Maintenance Fund - '+person,amount:amount,date:date,icon:'maint',type:'expense',sourceType:'maint',sourceId:maintId,sourceCardName:'Maintenance Fund',note:note});
    const data = getMaintData();
    data.push({ id: maintId, person, amount, date, note, cfId:cfId_maint });
    saveMaintData(data);
    if(statusEl) statusEl.textContent='✓ Saved & logged to Cash Flow!';
    setTimeout(function(){
      closeModal('maintModal');
      renderMaintCard();
    }, 400);
  } catch(err){
    if(statusEl){ statusEl.style.color='#f23060'; statusEl.textContent='✕ Error: '+err.message; }
  }
}
function openMaintHistory(){
  const data = getMaintData();
  const sorted = [...data].sort(function(a,b){ return new Date(b.date)-new Date(a.date); });
  let html = '';
  if(!sorted.length){ html = '<p style="color:var(--muted);font-size:12px">No contributions yet.</p>'; }
  else {
    html = '<table style="width:100%;border-collapse:collapse;font-size:12px"><tr><th style="text-align:left;font-size:9px;letter-spacing:2px;color:var(--muted);padding:4px 6px;border-bottom:1px solid var(--border);font-weight:400">DATE</th><th style="text-align:left;font-size:9px;letter-spacing:2px;color:var(--muted);padding:4px 6px;border-bottom:1px solid var(--border);font-weight:400">FROM</th><th style="text-align:left;font-size:9px;letter-spacing:2px;color:var(--muted);padding:4px 6px;border-bottom:1px solid var(--border);font-weight:400">AMOUNT</th><th style="text-align:left;font-size:9px;letter-spacing:2px;color:var(--muted);padding:4px 6px;border-bottom:1px solid var(--border);font-weight:400">NOTE</th><th style="padding:4px 6px;border-bottom:1px solid var(--border)"></th></tr>';
    sorted.forEach(function(e){ var fromLabel=e.person&&e.person!=='undefined'?e.person:(e.note?'Manual':'—'); var amt=Number(e.amount||0); var amtColor=amt>=0?'#c8f230':'#f23060'; var amtText=(amt>=0?'+':'')+fmtR(Math.abs(amt)); html += '<tr><td style="padding:9px 6px;border-bottom:1px solid #1a1a1a;color:var(--muted)">'+e.date+'</td><td style="padding:9px 6px;border-bottom:1px solid #1a1a1a;color:#efefef">'+fromLabel+'</td><td style="padding:9px 6px;border-bottom:1px solid #1a1a1a;color:'+amtColor+';font-weight:500">'+amtText+'</td><td style="padding:9px 6px;border-bottom:1px solid #1a1a1a;color:var(--muted)">'+(e.note||'—')+'</td><td style="padding:9px 6px;border-bottom:1px solid #1a1a1a"><button onclick="deleteMaintEntry(\''+e.id+'\')" style="background:none;border:none;cursor:pointer;color:#333;font-size:13px" onmouseover="this.style.color=\'#c0392b\'" onmouseout="this.style.color=\'#333\'">✕</button></td></tr>'; });
    html += '</table>';
  }
  document.getElementById('maintHistContent').innerHTML = html;
  document.getElementById('maintHistModal').classList.add('active');
}

function deleteMaintEntry(id){
  const all = getMaintData();
  const entry=all.find(function(e){return e.id===id;});
  if(entry&&entry.cfId) removeFromCF(entry.cfId);
  saveMaintData(all.filter(function(e){return e.id!==id;}));
  openMaintHistory();
  renderMaintCard();
}

/* ══════════════════════════════════ */

// ══ AI ASSISTANT ══
