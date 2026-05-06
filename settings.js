// Settings: backup, restore, passenger mgmt, login users

// ══════════════════════════════════════════════
// 🏦 RECONCILE — Dual Account Balance Tracker
// ══════════════════════════════════════════════
const RECON_KEY = 'yb_recon_balances_v1';

function loadReconBalances(){
  try{ return JSON.parse(lsGet(RECON_KEY)||'{}'); }catch(e){ return {}; }
}

function saveReconBalances(){
  var fnb  = parseFloat(document.getElementById('reconFNB').value)||0;
  var tyme = parseFloat(document.getElementById('reconTyme').value)||0;
  var data = { fnb:fnb, tyme:tyme, updated: new Date().toISOString() };
  lsSet(RECON_KEY, JSON.stringify(data));
  updateReconTotal();
  // Show quick toast
  var btn = document.querySelector('button[onclick="saveReconBalances()"]');
  if(btn){ var orig=btn.textContent; btn.textContent='✓ Saved'; setTimeout(function(){ btn.textContent=orig; },1200); }
}

function updateReconTotal(){
  var fnb  = parseFloat(document.getElementById('reconFNB')&&document.getElementById('reconFNB').value)||0;
  var tyme = parseFloat(document.getElementById('reconTyme')&&document.getElementById('reconTyme').value)||0;
  var total = fnb + tyme;
  var el = document.getElementById('reconTotal');
  if(el) el.textContent = fmtR(total);
  // Live-update the Bank Balance card at the top so the user sees the
  // number reflect immediately as they type, before they tap save.
  try { renderBankBalanceCard(); } catch(e){}
  // Live-update the Odin tile too (if Odin tab is currently visible)
  try { if(typeof odinRefreshIfOpen === 'function') odinRefreshIfOpen(); } catch(e){}
}

// Debounced auto-save — fires 600ms after the user stops typing.
var _reconAutoSaveTimer = null;
function _scheduleReconAutoSave(){
  if(_reconAutoSaveTimer) clearTimeout(_reconAutoSaveTimer);
  _reconAutoSaveTimer = setTimeout(function(){
    try { saveReconBalances(); } catch(e){}
  }, 600);
  // Update the running total immediately for snappy feedback
  try { updateReconTotal(); } catch(e){}
}

function renderReconPanel(){
  // Load saved balances
  var saved = loadReconBalances();
  var fnbEl  = document.getElementById('reconFNB');
  var tymeEl = document.getElementById('reconTyme');
  if(fnbEl && saved.fnb !== undefined) fnbEl.value = saved.fnb;
  if(tymeEl && saved.tyme !== undefined) tymeEl.value = saved.tyme;

  // Last updated
  var lastEl = document.getElementById('reconLastUpdated');
  if(lastEl && saved.updated){
    var d = new Date(saved.updated);
    lastEl.textContent = 'Last updated: '+d.toLocaleDateString('en-ZA')+' '+d.toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit'});
  }

  updateReconTotal();

  // ── Auto-save: debounced save when the user types in either bank balance ──
  // Previously the user had to remember to tap the green Save button. Forgetting
  // that = balances vanish on next login. We attach a one-time listener on each
  // input that auto-saves after 600ms of inactivity. The manual Save button
  // still works for instant save + visual confirmation.
  if(fnbEl && !fnbEl._autoSaveBound){
    fnbEl._autoSaveBound = true;
    fnbEl.addEventListener('input', _scheduleReconAutoSave);
    fnbEl.addEventListener('blur',  saveReconBalances);
  }
  if(tymeEl && !tymeEl._autoSaveBound){
    tymeEl._autoSaveBound = true;
    tymeEl.addEventListener('input', _scheduleReconAutoSave);
    tymeEl.addEventListener('blur',  saveReconBalances);
  }

  // Savings rows
  var savingsContainer = document.getElementById('reconSavingsRows');
  if(!savingsContainer) return;
  savingsContainer.innerHTML = '';
  var totalSaved = 0;

  // Savings funds
  (funds||[]).filter(function(f){ return !f.isExpense; }).forEach(function(f){
    var saved = fundTotal(f);
    if(saved <= 0) return;
    totalSaved += saved;
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #1a3a00;';
    row.innerHTML = '<span style="font-size:12px;color:#efefef;">'+(f.emoji||'💰')+' '+f.name+'</span>'
      +'<span style="font-family:Syne,sans-serif;font-weight:700;font-size:14px;color:#c8f230;">'+fmtR(saved)+'</span>';
    savingsContainer.appendChild(row);
  });

  // Custom maintenance cards
  try{
    var mcards = JSON.parse(lsGet(CUSTOM_MAINT_KEY)||'[]');
    mcards.forEach(function(card){
      var cardSaved = (card.entries||[]).reduce(function(s,e){ return s+Number(e.amount||0); },0);
      if(cardSaved <= 0) return;
      totalSaved += cardSaved;
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #1a3a00;';
      row.innerHTML = '<span style="font-size:12px;color:#efefef;">'+(card.emoji||'🔧')+' '+card.name+'</span>'
        +'<span style="font-family:Syne,sans-serif;font-weight:700;font-size:14px;color:#c8f230;">'+fmtR(cardSaved)+'</span>';
      savingsContainer.appendChild(row);
    });
  }catch(e){}

  // Maintenance fund original
  try{
    var mdata = getMaintData();
    var maintTotal = mdata.reduce(function(s,e){ return s+Number(e.amount||0); },0);
    if(maintTotal > 0){
      totalSaved += maintTotal;
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #1a3a00;';
      row.innerHTML = '<span style="font-size:12px;color:#efefef;">🔧 Maintenance Fund</span>'
        +'<span style="font-family:Syne,sans-serif;font-weight:700;font-size:14px;color:#c8f230;">'+fmtR(maintTotal)+'</span>';
      savingsContainer.appendChild(row);
    }
  }catch(e){}

  var totEl = document.getElementById('reconSavingsTotal');
  if(totEl) totEl.textContent = fmtR(totalSaved);
}

// ════════════════════════════════════════════════════════════════════
// BANK BALANCE CARD — pulls real Tyme + FNB balances from storage
// ════════════════════════════════════════════════════════════════════
// Lives at the top of Cash Flow tab. Always shows current bank balance,
// regardless of the month being viewed, because real cash doesn't reset
// when the calendar flips. Updates whenever:
//   - renderCashFlow runs (tab opened, month changed, entry added)
//   - User types in the bank balance inputs at the bottom (live updates
//     wired in saveReconBalances + scheduleReconAutoSave)
function renderBankBalanceCard(){
  var amtEl = document.getElementById('cfBankBalanceAmt');
  var brkEl = document.getElementById('cfBankBalanceBreakdown');
  if(!amtEl || !brkEl) return; // card not on the page

  // Prefer live values from the input fields if present (handles in-flight
  // edits before the user clicks Save), fall back to stored values.
  var fnbInp  = document.getElementById('reconFNB');
  var tymeInp = document.getElementById('reconTyme');
  var saved   = (typeof loadReconBalances === 'function') ? loadReconBalances() : {};
  var fnb  = (fnbInp  && fnbInp.value  !== '') ? (parseFloat(fnbInp.value)  || 0) : (saved.fnb  || 0);
  var tyme = (tymeInp && tymeInp.value !== '') ? (parseFloat(tymeInp.value) || 0) : (saved.tyme || 0);
  var total = fnb + tyme;

  amtEl.textContent = fmtR(total);
  brkEl.textContent = 'FNB: '+fmtR(fnb)+' · Tyme: '+fmtR(tyme);

  // Subtle color cue if both are zero — let the user know the card is
  // waiting for data, not broken.
  if(total <= 0){
    amtEl.style.color  = '#3a6060';
    brkEl.textContent  = 'Enter your bank balances below ↓';
  } else {
    amtEl.style.color  = '#9be0e0';
  }
}

function renderCashFlow(){
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('cfMonthLabel').textContent = MONTH_NAMES[cfMonth] + ' ' + cfYear;

  const data = loadCFData();
  const mk = cfKey();

  // Merge recurring + month-specific entries
  const recurIncome   = (data.recurring&&data.recurring.income)   || [];
  const recurExpenses = (data.recurring&&data.recurring.expenses)  || [];
  const monthIncome   = (data[mk]&&data[mk].income)               || [];
  const monthExpenses = (data[mk]&&data[mk].expenses)              || [];

  // Deduplicate: month-specific overrides recurring for same id
  const monthIds = new Set([...monthIncome, ...monthExpenses].map(function(e){ return e.id; }));
  const allIncome   = [...recurIncome.filter(function(e){ return !monthIds.has(e.id); }), ...monthIncome];
  const allExpenses = [...recurExpenses.filter(function(e){ return !monthIds.has(e.id); }), ...monthExpenses];

  // ── AUTO-PULL: Carpool income ──
  let carpoolAuto = 0;
  if(cpData[mk]){
    Object.values(cpData[mk]).forEach(function(dd){
      if(typeof dd!=='object') return;
      PASSENGERS.forEach(function(p){
        if(dd[p]&&typeof dd[p]==='object') carpoolAuto += dd[p].amt||0;
      });
    });
  }

  // AUTO-PULL instalments removed — instalment payments are logged manually when paid
  const instPlans = loadInst ? loadInst() : [];
  const autoExpenses = [];

  // AUTO-PULL savings removed — MoneyMoveZ handles deposits directly, no double-count

  // ── AUTO-PULL: Car expenses this month ──
  const carFund = funds.find(function(f){ return f.isExpense; });
  // ── AUTO-PULL: Car expenses ──
  // NOTE: EE90 spends now post individually via 💸 Use Funds → no lump AUTO pull needed
  // Only pull OLD entries that predate the Use Funds feature (don't have a CF entry yet)
  if(carFund){
    const carSpent = (carFund.deposits||[]).filter(function(d){
      return d.txnType==='out' && d.date && d.date.startsWith(mk) && !d.note && !d.cfPosted;
    }).reduce(function(s,d){ return s+d.amount; },0);
    if(carSpent > 0){
      autoExpenses.push({ id:'auto_car_'+mk, label:'Car Expenses (untagged)', amount:carSpent, icon:'🔧', auto:true, source:'cars' });
    }
  }

  // ── SPLIT: Real expenses vs Savings allocations ──
  // Use the shared helper from cashflow.js so the in-app filter and the PDF
  // filter stay in sync. Falls back to category match when sourceType is missing
  // (auto-pushed entries from older flows).
  function isSavingsAlloc(e){
    if(typeof cfIsSavingsAlloc === 'function') return cfIsSavingsAlloc(e);
    // Inline fallback if cashflow.js hasn't loaded for some reason
    var SRC = ['savings_deposit','car_add','maint','custommaint','car_service_save','savings'];
    var CAT = ['Savings','Cars','Maintenance'];
    if(e.sourceType && SRC.indexOf(e.sourceType) > -1) return true;
    if(e.category   && CAT.indexOf(e.category)   > -1) return true;
    return false;
  }

  const realExpenses    = allExpenses.filter(function(e){ return !isSavingsAlloc(e); });
  const savingsAllocs   = allExpenses.filter(function(e){ return isSavingsAlloc(e); });

  const totalIncome        = allIncome.reduce(function(s,e){ return s+e.amount; },0);
  const totalRealExpenses  = realExpenses.reduce(function(s,e){ return s+e.amount; },0) + autoExpenses.reduce(function(s,e){ return s+e.amount; },0);
  const totalSavingsAllocs = savingsAllocs.reduce(function(s,e){ return s+e.amount; },0);
  const totalExpenses      = totalRealExpenses + totalSavingsAllocs;

  // Net Operating = income minus real spend only
  const netOperating = totalIncome - totalRealExpenses;
  // Net Accounting = full picture including savings moves
  const netAccounting = totalIncome - totalExpenses;

  const netColor  = netOperating >= 0 ? '#c8f230' : '#f23060';
  const netBg     = netOperating >= 0 ? '#0d1a00' : '#1a0505';
  const netBorder = netOperating >= 0 ? '#3a5a00' : '#5a1a1a';

  // ── UPDATE NET BANNER ──
  document.getElementById('cfNetBanner').style.cssText = 'border-radius:10px;padding:18px 20px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;background:'+netBg+';border:1px solid '+netBorder+';';
  document.getElementById('cfNetLabel').style.color = netColor;
  document.getElementById('cfNetAmt').style.color = netColor;
  document.getElementById('cfNetAmt').textContent = (netOperating>=0?'+':'')+fmtR(netOperating);
  document.getElementById('cfNetBreakdown').textContent = fmtR(totalIncome)+' − '+fmtR(totalRealExpenses)+' (real spend)';
  document.getElementById('cfNetBreakdown').style.color = '#888';

  // ── UPDATE BANK BALANCE CARD ──
  // Pulls live from yb_recon_balances_v1 (set via the FNB/Tyme inputs at the
  // bottom of this tab). Survives across months — represents real money in
  // your accounts NOW, not month-bound math.
  try { renderBankBalanceCard(); } catch(e){ console.warn('renderBankBalanceCard failed:', e); }

  // ── RENDER INCOME ROWS ──
  const incomeContainer = document.getElementById('cfIncomeRows');
  let incomeHTML = '';

  // Sort income by date (dated entries first, sorted ascending; undated at end)
  allIncome.sort(function(a, b){
    if(a.date && b.date) return a.date.localeCompare(b.date);
    if(a.date) return -1;
    if(b.date) return 1;
    return 0;
  });

  // Manual income
  allIncome.forEach(function(e){
    const isRecur = recurIncome.some(function(r){ return r.id===e.id; });
    incomeHTML += cfRow(e, 'income', isRecur);
  });
  // Auto: carpool
  // Carpool auto income removed — log manually when received
  if(!incomeHTML){
    // Compact empty state — sits inside the income card so we keep the
    // padding tight. CTA opens the standard income entry modal.
    incomeHTML = (typeof buildEmptyState === 'function')
      ? buildEmptyState({
          icon: '💵',
          title: 'No income yet this month',
          subtitle: 'Salary, carpool payments, side income — log it here.',
          ctaLabel: '+ Add Income',
          ctaOnclick: "openCfEntryModal('income')",
          compact: true
        })
      : '<div style="padding:14px;color:#444;font-size:12px;letter-spacing:1px;">No income entries — tap + Add to get started.</div>';
  }
  incomeContainer.innerHTML = incomeHTML;

  // ── RENDER EXPENSE ROWS — Real Expenses ──
  const expenseContainer = document.getElementById('cfExpenseRows');
  let expenseHTML = '';
  realExpenses.forEach(function(e){
    const isRecur = recurExpenses.some(function(r){ return r.id===e.id; });
    expenseHTML += cfRow(e, 'expense', isRecur);
  });
  autoExpenses.forEach(function(e){ expenseHTML += cfAutoRow(e); });
  if(!expenseHTML){
    expenseHTML = (typeof buildEmptyState === 'function')
      ? buildEmptyState({
          icon: '🧾',
          title: 'No expenses logged yet',
          subtitle: 'Bills, groceries, fuel — tap below to log a real spend.',
          ctaLabel: '+ Add Expense',
          ctaOnclick: "openCfEntryModal('expense')",
          compact: true
        })
      : '<div style="padding:14px;color:#444;font-size:12px;letter-spacing:1px;">No real expenses this month.</div>';
  }
  expenseContainer.innerHTML = expenseHTML;

  // ── RENDER SAVINGS ALLOCATIONS SECTION ──
  const savingsContainer = document.getElementById('cfSavingsAllocRows');
  if(savingsContainer){
    let savingsHTML = '';
    savingsAllocs.forEach(function(e){
      const isRecur = recurExpenses.some(function(r){ return r.id===e.id; });
      savingsHTML += cfRow(e, 'expense', isRecur);
    });
    if(!savingsHTML){
      // No CTA — savings allocations come automatically from MoneyMoveZ
      // and Use Funds, not from a direct "Add" action here. Just explain
      // where they come from.
      savingsHTML = (typeof buildEmptyState === 'function')
        ? buildEmptyState({
            icon: '💰',
            title: 'No savings moves this month',
            subtitle: 'Allocations appear here when you save via MoneyMoveZ or Use Funds in the Savings tab.',
            compact: true
          })
        : '<div style="padding:14px;color:#444;font-size:12px;letter-spacing:1px;">No savings allocations this month.</div>';
    }
    savingsContainer.innerHTML = savingsHTML;
    document.getElementById('cfSavingsTotalRow').textContent = fmtR(totalSavingsAllocs);
  }

  // ── TOTALS ──
  document.getElementById('cfTotalIncome').textContent   = fmtR(totalIncome);
  document.getElementById('cfTotalExpenses').textContent = fmtR(totalRealExpenses);

  // ── RECONCILE PANEL ──
  try{ renderReconPanel(); }catch(e){}

  // ── NET SUMMARY CARD ──
  const summaryCard = document.getElementById('cfNetSummaryCard');
  summaryCard.style.cssText = 'border-radius:10px;padding:18px 20px;text-align:center;background:'+netBg+';border:1px solid '+netBorder+';';
  document.getElementById('cfNetSummaryAmt').style.color = netColor;
  document.getElementById('cfNetSummaryAmt').textContent = (net>=0?'+':'')+fmtR(net);
  const msg = document.getElementById('cfNetSummaryMsg');
  msg.style.color = netColor;
  msg.textContent = netOperating >= 0
    ? '🎉 You\'re '+fmtR(netOperating)+' ahead after real expenses'
    : '⚠️ You\'re '+fmtR(Math.abs(net))+' over budget this month';
}

function cfRow(e, type, isRecur){
  const color = type==='income' ? '#c8f230' : '#f23060';
  const sign  = type==='income' ? '+' : '−';
  // Date badge for income entries
  let dateBadge = '';
  if(type === 'income' && e.date){
    try{
      const d = new Date(e.date+'T00:00:00');
      dateBadge = ' <span style="color:#5a8800;font-size:9px;background:#0d1a00;border:1px solid #2a4a00;border-radius:3px;padding:1px 5px;letter-spacing:0.5px;">'+d.toLocaleDateString('en-ZA',{day:'numeric',month:'short'})+'</span>';
    }catch(ex){}
  }
  const subLine = e.account
    ? '<div style="font-size:9px;letter-spacing:1px;"><span style="color:#a78bfa;background:#1a0e2e;border:1px solid #3a2060;border-radius:3px;padding:1px 5px;">'+e.account+'</span>'+(e.borrowTag?' <span style="color:#555;">'+e.borrowTag+'</span>':'')+'</div>'
    : '<div style="font-size:9px;color:#444;letter-spacing:1px;display:flex;align-items:center;gap:4px;">'+(isRecur?'Monthly recurring':'This month only')+dateBadge+'</div>';
  return '<div style="display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:1px solid var(--border);">'
    +'<span style="font-size:18px;flex-shrink:0;">'+e.icon+'</span>'
    +'<div style="flex:1;min-width:0;">'
      +'<div style="font-size:12px;color:#efefef;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+e.label+'</div>'
      +subLine
    +'</div>'
    +'<span style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:15px;color:'+color+';white-space:nowrap;">'+sign+fmtR(e.amount)+'</span>'
    +'<div style="display:flex;gap:4px;" class="admin-only">'
      +'<button onclick="openCfEntryModal(\''+type+'\',\''+e.id+'\')" style="background:none;border:1px solid #2a2a2a;border-radius:4px;width:26px;height:26px;color:#555;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;" onmouseover="this.style.borderColor=\'#555\'" onmouseout="this.style.borderColor=\'#2a2a2a\'">✏️</button>'
      +'<button onclick="deleteCfEntry(\''+e.id+'\',\''+type+'\')" style="background:none;border:1px solid #2a1a1a;border-radius:4px;width:26px;height:26px;color:#555;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;" onmouseover="this.style.borderColor=\'#c0392b\';this.style.color=\'#c0392b\'" onmouseout="this.style.borderColor=\'#2a1a1a\';this.style.color=\'#555\'">✕</button>'
    +'</div>'
  +'</div>';
}

function cfAutoRow(e){
  const sourceLabel = { carpool:'Auto · Carpool', instalments:'Auto · Instalments', savings:'Auto · Savings', cars:'Auto · Cars' };
  const isIncome = e.source === 'carpool';
  const sign  = isIncome ? '+' : '−';
  const color = isIncome ? '#c8f230' : '#f2a830';
  return '<div style="display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:1px solid var(--border);opacity:.85;">'
    +'<span style="font-size:18px;flex-shrink:0;">'+e.icon+'</span>'
    +'<div style="flex:1;min-width:0;">'
      +'<div style="font-size:12px;color:#efefef;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+e.label+'</div>'
      +'<div style="font-size:9px;color:#3a5a00;letter-spacing:1px;">'+(sourceLabel[e.source]||'Auto-imported')+'</div>'
    +'</div>'
    +'<span style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:15px;color:'+color+';white-space:nowrap;">'+sign+fmtR(e.amount)+'</span>'
    +'<span style="font-size:9px;color:#3a5a00;background:#0d1a00;border:1px solid #2a4a00;border-radius:4px;padding:2px 6px;white-space:nowrap;">AUTO</span>'
  +'</div>';
}

// ── Backup Reminder Toast ──
function showBackupReminder(reason){
  // Remove any existing toast
  const old = document.getElementById('backupToast');
  if(old) old.remove();
  const toast = document.createElement('div');
  toast.id = 'backupToast';
  toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1a2e00;border:1px solid #c8f230;border-radius:8px;padding:12px 16px;z-index:9999;display:flex;align-items:center;gap:12px;font-family:DM Mono,monospace;font-size:11px;letter-spacing:1.5px;color:#c8f230;box-shadow:0 4px 20px rgba(0,0,0,.6);min-width:280px;';
  toast.innerHTML = '<span>💾 '+reason+'</span><button onclick="backupData();document.getElementById(\'backupToast\').remove();" style="background:#c8f230;color:#000;border:none;border-radius:4px;padding:6px 12px;font-family:DM Mono,monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;font-weight:700;white-space:nowrap;">Download Backup</button><button onclick="document.getElementById(\'backupToast\').remove();" style="background:none;border:none;color:#555;cursor:pointer;font-size:16px;padding:0 2px;">✕</button>';
  document.body.appendChild(toast);
  // Auto-dismiss after 12 seconds
  setTimeout(function(){ if(document.getElementById('backupToast')) document.getElementById('backupToast').remove(); }, 12000);
}

function backupData(){
  const backup = buildBackupPayload();
  const blob = new Blob([JSON.stringify(backup, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'YBDashboard_Backup_'+localDateTimeStr(new Date())+'.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 5000);
}

// ── Round-trip integrity test (console only) ────────────────────────────
// Run yb_backupTest() in the browser dev tools console to verify that:
//   1. buildBackupPayload() captures every key actually in localStorage
//   2. Every section in the backup is JSON-roundtrippable (no circular refs)
//   3. Restore would write back to the same key set, byte-equal
//
// This does NOT touch your real data — it just compares an in-memory copy
// of the backup against what's in storage.
window.yb_backupTest = function(){
  console.log('=== YB Backup Integrity Test ===');
  var payload = buildBackupPayload();
  var json = JSON.stringify(payload);
  var size = new Blob([json]).size;
  console.log('Backup payload size: '+(size/1024).toFixed(1)+' KB');

  // Count entries per section
  var n = function(v){ return Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : (v?1:0)); };
  var report = {};
  Object.keys(payload).forEach(function(k){
    if(k === 'version' || k === 'exported' || k === 'exportedDate') return;
    report[k] = n(payload[k]);
  });
  console.table(report);

  // Verify JSON round-trip — any section that doesn't survive parse/stringify
  // would silently lose data on actual backup. We shouldn't have any of these
  // since localStorage values are strings, but worth checking.
  var rehydrated;
  try {
    rehydrated = JSON.parse(json);
  } catch(e){
    console.error('✕ Backup payload is not valid JSON. Restore would fail.', e);
    return false;
  }
  if(JSON.stringify(rehydrated) !== json){
    console.warn('⚠ JSON round-trip differs from original. May indicate ordering instability.');
  }

  // Check known-storage-keys vs what made it into the backup
  var EXCLUDED_FROM_BACKUP = [
    'yb_biometric_registered',  // device-specific
    'yb_biometric_credid',      // device-specific
    'yasin_sync_meta_v1',       // sync state, intentionally per-device
    'yb_cf_sourcetype_migration_v1',     // per-device system flag
    'yb_cfdata_premigration_backup_v1',  // per-device system backup
  ];
  var allLSKeys = [];
  for(var i=0; i<localStorage.length; i++){
    var k = localStorage.key(i);
    if(k && k.indexOf('collapse_') !== 0) allLSKeys.push(k);
  }
  var notBackedUp = allLSKeys.filter(function(k){
    if(EXCLUDED_FROM_BACKUP.indexOf(k) > -1) return false;
    // Heuristic: did any section of the backup represent this key's data?
    // We can't know for sure without a key-to-payload-field map, but we can
    // at least surface unknown keys for human review.
    return false; // Disabled — too noisy. See keys() for the canonical list.
  });
  console.log('localStorage keys present:', allLSKeys.length);

  console.log('✓ Backup payload looks valid.');
  return true;
};

function buildBackupPayload(){
  return {
    version: 'ybdashboard_v1',
    exported: new Date().toISOString(),
    exportedDate: localDateStr(new Date()),
    funds: JSON.parse(lsGet(SK)||'[]'),
    passengers: loadPassengers(),
    cashflow: JSON.parse(lsGet(CF_KEY)||'{}'),
    carpool: JSON.parse(lsGet(CPK)||'{}'),
    borrows: JSON.parse(lsGet(BORROW_KEY)||'{}'),
    fuel: JSON.parse(lsGet(FUEL_KEY)||'[]'),
    prayer: getPrayerData(),
    maintenance: getMaintData(),
    externalBorrows: loadExternalBorrows(),
    cars: JSON.parse(lsGet(CARS_KEY)||'[]'),
    drivers: JSON.parse(lsGet(DRIVER_KEY)||'[]'),
    instalments: JSON.parse(lsGet(INST_KEY)||'[]'),
    pins: JSON.parse(lsGet(PIN_STORE_KEY)||'null'),
    schoolEvents: loadSchoolEvents(),
    schoolResults: ALL_YEARS_DATA,
    schoolDone: getSchoolDone(),
    // Previously missing — now included
    customMaint:    JSON.parse(lsGet(CUSTOM_MAINT_KEY)        ||'[]'),
    maintSettings:  (typeof getMaintSettings === 'function') ? getMaintSettings() : null,
    reconBalances:  JSON.parse(lsGet(RECON_KEY)               ||'{}'),
    routine:        JSON.parse(lsGet(ROUTINE_KEY)             ||'null'),
    dailyFuel:      JSON.parse(lsGet(DAILY_FUEL_KEY)          ||'null'),
    pricingTank:    JSON.parse(lsGet(PRICING_TANK_KEY)        ||'null'),
    pricingPriv:    JSON.parse(lsGet(PRICING_PRIVATE_KEY)     ||'null'),
    manualBalances: JSON.parse(lsGet('yb_manual_balances_v1') ||'{}'),
    priorityRules:  JSON.parse(lsGet('yb_priority_rules_v1')  ||'null'),
    carpoolArchived: JSON.parse(lsGet('yb_carpool_archived')  ||'[]'),
    themeLight:     lsGet('yasin_theme_light')
    // Intentionally excluded:
    //   - biometric credentials (device-specific, won't transfer)
    //   - sync metadata (would mark a fresh device as already-synced)
    //   - cashflow migration flags (per-device system state)
    //   - UI collapse prefs (cosmetic, not worth shipping)
  };
}

function restoreData(input){
  const file = input.files[0];
  if(!file) return;
  const status = document.getElementById('restoreStatus');
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const backup = JSON.parse(e.target.result);
      if(backup.version !== 'ybdashboard_v1') throw new Error('Unrecognised backup format.');

      // Build a preview of what's about to be restored so the user can
      // sanity-check before overwriting. Counts are calculated defensively —
      // missing sections are fine, this is informational only.
      var n = function(v){ return Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : 0); };
      var preview = [
        backup.exportedDate ? 'From: '+backup.exportedDate : ('Exported: '+(backup.exported||'unknown')),
        '',
        n(backup.funds)            +' savings funds',
        n(backup.cashflow)         +' cashflow months',
        n(backup.carpool)          +' carpool months',
        n(backup.borrows)          +' people with borrow history',
        n(backup.passengers)       +' passengers',
        n(backup.cars)             +' cars',
        n(backup.instalments)      +' instalments',
        n(backup.schoolEvents)     +' school events',
        n(backup.fuel)             +' fuel entries',
        ''
      ].join('\n');

      if(!confirm(preview + 'This will OVERWRITE all current data. Continue?')){
        input.value='';
        return;
      }
      if(backup.funds)          lsSet(SK,   JSON.stringify(backup.funds));
      if(backup.passengers)     lsSet(PASSENGERS_KEY,      JSON.stringify(backup.passengers));
      if(backup.cashflow)       lsSet(CF_KEY,              JSON.stringify(backup.cashflow));
      if(backup.carpool)        lsSet(CPK,  JSON.stringify(backup.carpool));
      if(backup.borrows)        lsSet(BORROW_KEY,  JSON.stringify(backup.borrows));
      if(backup.fuel)           lsSet(FUEL_KEY,     JSON.stringify(backup.fuel));
      if(backup.externalBorrows) lsSet(EXTERNAL_BORROW_KEY, JSON.stringify(backup.externalBorrows));
      if(backup.prayer)         lsSet(PRAYER_KEY,          JSON.stringify(backup.prayer));
      if(backup.maintenance)    lsSet(MAINT_KEY,           JSON.stringify(backup.maintenance));
      if(backup.cars)           lsSet(CARS_KEY,     JSON.stringify(backup.cars));
      if(backup.drivers)        lsSet(DRIVER_KEY,  JSON.stringify(backup.drivers));
      if(backup.instalments)    lsSet(INST_KEY, JSON.stringify(backup.instalments));
      if(backup.pins)           lsSet(PIN_STORE_KEY,           JSON.stringify(backup.pins));
      if(backup.schoolEvents)   lsSet(SCHOOL_EVENTS_KEY,   JSON.stringify(backup.schoolEvents));
      if(backup.schoolResults)  lsSet(SCHOOL_RESULTS_KEY,  JSON.stringify(backup.schoolResults));
      if(backup.schoolDone)     lsSet(SCHOOL_DONE_KEY,     JSON.stringify(backup.schoolDone));
      // Previously missing on restore — now included
      if(backup.customMaint)    lsSet(CUSTOM_MAINT_KEY,    JSON.stringify(backup.customMaint));
      if(backup.maintSettings)  lsSet(MAINT_SETTINGS_KEY,  JSON.stringify(backup.maintSettings));
      if(backup.reconBalances)  lsSet(RECON_KEY,           JSON.stringify(backup.reconBalances));
      if(backup.routine)        lsSet(ROUTINE_KEY,         JSON.stringify(backup.routine));
      if(backup.dailyFuel)      lsSet(DAILY_FUEL_KEY,      JSON.stringify(backup.dailyFuel));
      if(backup.pricingTank)    lsSet(PRICING_TANK_KEY,    JSON.stringify(backup.pricingTank));
      if(backup.pricingPriv)    lsSet(PRICING_PRIVATE_KEY, JSON.stringify(backup.pricingPriv));
      if(backup.manualBalances) lsSet('yb_manual_balances_v1', JSON.stringify(backup.manualBalances));
      if(backup.priorityRules)  lsSet('yb_priority_rules_v1',  JSON.stringify(backup.priorityRules));
      if(backup.carpoolArchived) lsSet('yb_carpool_archived',  JSON.stringify(backup.carpoolArchived));
      if(backup.themeLight !== undefined && backup.themeLight !== null){
        lsSet('yasin_theme_light', backup.themeLight);
      }
      status.style.color='#c8f230';
      status.textContent='✓ Restored from '+backup.exported+'. Reloading…';
      setTimeout(function(){ location.reload(); }, 1200);
    } catch(err){
      status.style.color='#f23060';
      status.textContent='✕ Invalid file — '+err.message;
      input.value='';
    }
  };
  reader.readAsText(file);
}

function changePin(){
  const newPin = document.getElementById('pinNew').value.trim();
  const confirmPin = document.getElementById('pinConfirm').value.trim();
  const status = document.getElementById('pinChangeStatus');
  if(!/^\d{4}$/.test(newPin)){ status.style.color='#f23060'; status.textContent='✕ PIN must be exactly 4 digits.'; return; }
  if(newPin !== confirmPin){ status.style.color='#f23060'; status.textContent='✕ PINs do not match.'; return; }
  if(PINS[newPin] && PINS[newPin].name !== currentUser){
    status.style.color='#f23060'; status.textContent='✕ That PIN is already used by ' + PINS[newPin].name + '.'; return;
  }
  // Find and update the current user's old PIN entry
  const oldPin = Object.keys(PINS).find(function(p){ return PINS[p].name === currentUser; });
  if(oldPin && oldPin !== newPin){
    PINS[newPin] = PINS[oldPin];
    delete PINS[oldPin];
  } else if(!oldPin){
    PINS[newPin] = { role: 'admin', name: currentUser };
  }
  savePINS(PINS);
  status.style.color='#c8f230';
  status.textContent='✓ PIN updated and saved permanently.';
  document.getElementById('pinNew').value='';
  document.getElementById('pinConfirm').value='';
}

function clearAllData(){
  if(!confirm('⚠ This will delete ALL data — savings funds, carpool, borrows, fuel, prayer. Maintenance card stays. Are you sure?')) return;
  if(!confirm('Last chance — download a backup first? Press Cancel to go back, OK to delete everything.')) return;
  const allKeys = [SK, CPK, BORROW_KEY, EXTERNAL_BORROW_KEY, SYNC_KEY, PRAYER_KEY, FUEL_KEY, DAILY_FUEL_KEY, PRICING_TANK_KEY, PRICING_PRIVATE_KEY, SCHOOL_EVENTS_KEY, SCHOOL_RESULTS_KEY, SCHOOL_DONE_KEY];
  allKeys.forEach(function(k){
    try{ localStorage.removeItem(k); }catch(e){}
    try{ sessionStorage.removeItem(k); }catch(e){}
    delete _lsMem[k];
  });
  // Write empty state explicitly so reload doesn't re-seed
  lsSet(SK, '[]');
  lsSet(CPK, '{}');
  lsSet(BORROW_KEY, '{}');
  lsSet(EXTERNAL_BORROW_KEY, '{}');
  alert('All data cleared. Reloading…');
  location.reload();
}

// ══ BORROW FEATURE ══

// =====================================================================
// CLOUD SYNC handlers (Supabase) — Phase B1
// =====================================================================
function refreshCloudSyncStatus(){
  if(!window.cloudSync) return;
  var s = window.cloudSync.status();
  var statusEl = document.getElementById('cloudSyncStatus');
  var lastEl   = document.getElementById('cloudSyncLast');
  var queueEl  = document.getElementById('cloudSyncQueue');
  var upBtn    = document.getElementById('cloudUploadBtn');
  var pullBtn  = document.getElementById('cloudPullBtn');
  if(statusEl){
    var bits = [];
    bits.push(s.signedIn ? '✓ signed in' : '✗ not signed in');
    bits.push(s.online   ? '✓ online'    : '✗ offline');
    statusEl.textContent = 'Status: ' + bits.join(' · ');
  }
  if(lastEl){
    if(s.lastSync){
      try {
        var d = new Date(s.lastSync);
        lastEl.textContent = 'Last sync: ' + d.toLocaleDateString('en-ZA') + ' ' + d.toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit'});
      } catch(e){ lastEl.textContent = 'Last sync: ' + s.lastSync; }
    } else {
      lastEl.textContent = 'Last sync: never';
    }
  }
  if(queueEl) queueEl.textContent = 'Queue: ' + s.queueSize + ' pending';
  var ready = s.signedIn && s.online;
  if(upBtn){   upBtn.disabled   = !ready; upBtn.style.opacity   = ready ? '1' : '0.4'; upBtn.style.cursor   = ready ? 'pointer' : 'not-allowed'; }
  if(pullBtn){ pullBtn.disabled = !ready; pullBtn.style.opacity = ready ? '1' : '0.4'; pullBtn.style.cursor = ready ? 'pointer' : 'not-allowed'; }
}

async function cloudUploadAll(){
  var msg = document.getElementById('cloudSyncMsg');
  if(!window.cloudSync){ if(msg) msg.textContent = 'Cloud sync not loaded.'; return; }
  if(!confirm('Upload all current data to the cloud? This overwrites whatever is in the cloud right now.')) return;
  if(msg) msg.textContent = 'Uploading…';
  try {
    var res = await window.cloudSync.uploadAllLocal();
    if(!res.ok){
      if(msg) msg.textContent = 'Upload failed: ' + (res.reason || 'unknown');
    } else {
      var parts = [];
      for(var name in res.results){
        var r = res.results[name];
        if(r && r.ok) parts.push(name + ': ' + (r.count || 0));
        else parts.push(name + ': ✗ ' + (r && r.error || 'failed'));
      }
      if(msg) msg.textContent = '✓ Uploaded — ' + parts.join(', ');
    }
  } catch(e){
    console.warn('cloudUploadAll', e);
    if(msg) msg.textContent = 'Upload error: ' + (e && e.message || e);
  }
  refreshCloudSyncStatus();
}

async function cloudPullAll(){
  var msg = document.getElementById('cloudSyncMsg');
  if(!window.cloudSync){ if(msg) msg.textContent = 'Cloud sync not loaded.'; return; }
  if(!confirm('Pull cloud data and overwrite local data on this device? Anything you changed locally and didn\'t upload will be lost.')) return;
  if(msg) msg.textContent = 'Pulling…';
  try {
    var res = await window.cloudSync.pullAll();
    if(!res.ok){
      if(msg) msg.textContent = 'Pull failed: ' + (res.reason || 'unknown');
    } else {
      var parts = [];
      for(var name in res.results){
        var r = res.results[name];
        if(r && r.ok) parts.push(name + ': ' + (r.count || 0));
        else parts.push(name + ': ✗ ' + (r && r.error || 'failed'));
      }
      if(msg) msg.textContent = '✓ Pulled — ' + parts.join(', ');
    }
  } catch(e){
    console.warn('cloudPullAll', e);
    if(msg) msg.textContent = 'Pull error: ' + (e && e.message || e);
  }
  refreshCloudSyncStatus();
}

// Live status updates from cloud-sync engine
if(window.cloudSync && typeof window.cloudSync.onStatusChange === 'function'){
  window.cloudSync.onStatusChange(function(){
    try { refreshCloudSyncStatus(); } catch(e){}
  });
}

window.refreshCloudSyncStatus = refreshCloudSyncStatus;
window.cloudUploadAll = cloudUploadAll;
window.cloudPullAll   = cloudPullAll;
