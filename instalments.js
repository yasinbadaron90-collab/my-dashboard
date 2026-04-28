// Instalments: plans, payments, snowball


var _instShowCleared = false;

function loadInst(){ try{ return JSON.parse(lsGet(INST_KEY)||'[]'); }catch(e){ return []; } }
function saveInst(d){ lsSet(INST_KEY, JSON.stringify(d)); }

// ── (seedMTNContract removed — all plans must be added manually via + Add Plan) ──

// Provider colours
var INST_PROV_COLORS = {
  TFG:        { bg:'#1a0a2e', border:'#5a2a8a', text:'#c8a0f0', badge:'#a070d0' },
  PayFlex:    { bg:'#0a1a2e', border:'#2a4a8a', text:'#70a0f0', badge:'#5080d0' },
  PayJustNow: { bg:'#1a1a00', border:'#5a5a00', text:'#d0d070', badge:'#a0a040' },
  MTN:        { bg:'#1a1000', border:'#6a4a00', text:'#f2c830', badge:'#d4a800' },
  Other:      { bg:'#1a1a1a', border:'#3a3a3a', text:'#aaaaaa', badge:'#888888' }
};
var INST_PROV_ICON = { TFG:'🛍', PayFlex:'⚡', PayJustNow:'🕐', MTN:'📱', Other:'📄' };

// ── Instalment number options per provider ──
var INST_NUM_OPTS = {
  TFG:        [6],
  PayFlex:    [3, 4],
  PayJustNow: [3],
  MTN:        [12, 24, 36],
  Other:      [3, 6, 12, 24, 36]
};

function selectInstProvider(el){
  document.querySelectorAll('.inst-prov-opt').forEach(function(o){
    o.style.borderColor = 'var(--border)';
    o.style.color = 'var(--muted)';
    o.style.background = 'none';
  });
  el.style.borderColor = '#c8f230';
  el.style.color = '#c8f230';
  el.style.background = '#0d1a00';
  document.getElementById('instProvider').value = el.dataset.val;
  buildInstNumButtons(el.dataset.val);
  // Show debit day field for contract-style providers
  var showDebit = (el.dataset.val === 'MTN' || el.dataset.val === 'Other');
  document.getElementById('debitDayField').style.display = showDebit ? 'block' : 'none';
}

function buildInstNumButtons(prov){
  var grid = document.getElementById('instNumGrid');
  var opts = INST_NUM_OPTS[prov] || [3, 4, 6];
  grid.innerHTML = '';
  opts.forEach(function(n){
    var btn = document.createElement('div');
    btn.className = 'inst-num-opt';
    btn.dataset.val = n;
    btn.style.cssText = 'padding:10px 16px;border:1px solid var(--border);border-radius:6px;cursor:pointer;text-align:center;font-family:\'Syne\',sans-serif;font-size:18px;font-weight:700;color:var(--muted);transition:all .15s;';
    btn.textContent = n;
    btn.onclick = function(){ selectInstNum(btn); instAutoCalc(); };
    grid.appendChild(btn);
  });
  // Auto-select first
  if(grid.firstChild){ selectInstNum(grid.firstChild); }
}

function selectInstNum(el){
  document.querySelectorAll('.inst-num-opt').forEach(function(o){
    o.style.borderColor = 'var(--border)';
    o.style.color = 'var(--muted)';
    o.style.background = 'none';
  });
  el.style.borderColor = '#c8f230';
  el.style.color = '#c8f230';
  el.style.background = '#0d1a00';
  document.getElementById('instNum').value = el.dataset.val;
}

function instAutoCalc(){
  var total = parseFloat(document.getElementById('instTotal').value) || 0;
  var num   = parseInt(document.getElementById('instNum').value)   || 0;
  if(total > 0 && num > 0){
    document.getElementById('instAmt').value = (total / num).toFixed(2);
  }
}

// Build payment schedule dates
function buildInstSchedule(startDate, num, freq){
  var dates = [];
  var d = new Date(startDate + 'T00:00:00');
  for(var i = 0; i < num; i++){
    dates.push(localDateStr(d));
    if(freq === 'fortnightly'){
      d.setDate(d.getDate() + 14);
    } else {
      d.setMonth(d.getMonth() + 1);
    }
  }
  return dates;
}

function openInstModal(editId){
  document.getElementById('instEditId').value = editId || '';
  document.getElementById('instModalTitle').textContent = editId ? '✏️ Edit Instalment Plan' : '+ New Instalment Plan';
  document.getElementById('instSaveBtn').textContent = editId ? 'Save Changes' : 'Save Plan';

  // Reset provider selection
  document.querySelectorAll('.inst-prov-opt').forEach(function(o){
    o.style.borderColor = 'var(--border)';
    o.style.color = 'var(--muted)';
    o.style.background = 'none';
  });
  document.getElementById('instProvider').value = '';
  document.getElementById('instNumGrid').innerHTML = '';
  document.getElementById('instNum').value = '';

  if(editId){
    var plans = loadInst();
    var plan  = plans.find(function(p){ return p.id === editId; });
    if(!plan) return;

    // Pre-select provider
    var provEl = document.querySelector('.inst-prov-opt[data-val="'+plan.provider+'"]');
    if(provEl){ selectInstProvider(provEl); }
    buildInstNumButtons(plan.provider);
    // Pre-select num
    setTimeout(function(){
      var numEl = document.querySelector('.inst-num-opt[data-val="'+plan.num+'"]');
      if(numEl){ selectInstNum(numEl); }
    }, 50);

    document.getElementById('instDesc').value      = plan.desc || '';
    document.getElementById('instTotal').value     = plan.total || '';
    document.getElementById('instAmt').value       = plan.amt || '';
    document.getElementById('instFreq').value      = plan.freq || 'monthly';
    document.getElementById('instStartDate').value = (plan.dates && plan.dates[0]) || localDateStr(new Date());
    document.getElementById('instDebitDay').value  = plan.debitDay || '';
    // Store M2M flag so confirmInstalment can preserve it
    document.getElementById('instEditId').dataset.m2m = plan.monthToMonth ? '1' : '';
  } else {
    document.getElementById('instDesc').value      = '';
    document.getElementById('instTotal').value     = '';
    document.getElementById('instAmt').value       = '';
    document.getElementById('instFreq').value      = 'monthly';
    document.getElementById('instStartDate').value = localDateStr(new Date());
  }

  document.getElementById('instModal').classList.add('active');
  setTimeout(function(){ document.getElementById('instDesc').focus(); }, 100);
}

function confirmInstalment(){
  var prov  = document.getElementById('instProvider').value;
  var desc  = document.getElementById('instDesc').value.trim();
  var total = parseFloat(document.getElementById('instTotal').value);
  var num   = parseInt(document.getElementById('instNum').value);
  var amt   = parseFloat(document.getElementById('instAmt').value);
  var freq  = document.getElementById('instFreq').value;
  var start = document.getElementById('instStartDate').value;
  var editId= document.getElementById('instEditId').value;
  var debitDay = parseInt(document.getElementById('instDebitDay').value) || null;

  if(!prov)  { alert('Please select a provider.'); return; }
  if(!desc)  { alert('Please enter a description.'); return; }
  var isEditingM2M = document.getElementById('instEditId').dataset.m2m === '1';
  var isM2MProvider = (prov === 'MTN' || prov === 'Other') && !num && !total;
  // For M2M plans: total and num can be blank
  if(!isEditingM2M && !total || (!isEditingM2M && total <= 0)){ alert('Please enter the total amount.'); return; }
  if(!isEditingM2M && !num)   { alert('Please select number of instalments.'); return; }
  if(!start) { alert('Please select the first payment date.'); return; }
  if(!amt || amt <= 0) amt = (total && num) ? total / num : 0;
  if(!amt || amt <= 0) { alert('Please enter the instalment amount (R).'); return; }

  var plans = loadInst();
  var dates = (num && start) ? buildInstSchedule(start, num, freq) : [];

  if(editId){
    var idx = plans.findIndex(function(p){ return p.id === editId; });
    if(idx > -1){
      // Preserve existing payments and M2M flag
      var oldPlan = plans[idx];
      plans[idx] = {
        id: editId,
        provider: prov,
        desc: desc,
        total: total || null,
        num: num || null,
        amt: amt,
        freq: freq,
        debitDay: debitDay || oldPlan.debitDay || null,
        monthToMonth: oldPlan.monthToMonth || false,
        dates: dates,
        paid: oldPlan.paid || []
      };
    }
  } else {
    plans.push({
      id: uid(),
      provider: prov,
      desc: desc,
      total: total,
      num: num,
      amt: amt,
      freq: freq,
      debitDay: debitDay,
      dates: dates,
      paid: []   // array of { index, date, note }
    });
  }

  saveInst(plans);
  closeModal('instModal');
  renderInst();
}

function deleteInstPlan(id){
  if(!confirm('Remove this instalment plan?')) return;
  var plans = loadInst().filter(function(p){ return p.id !== id; });
  saveInst(plans);
  renderInst();
}

function openInstPayModal(planId, idx){
  var plans = loadInst();
  var plan  = plans.find(function(p){ return p.id === planId; });
  if(!plan) return;
  document.getElementById('instPayPlanId').value = planId;
  document.getElementById('instPayIndex').value  = idx;
  document.getElementById('instPayDate').value   = localDateStr(new Date());
  document.getElementById('instPayNote').value   = '';
  document.getElementById('instPayInfo').innerHTML =
    '<strong style="color:#c8f230;">'+plan.desc+'</strong><br>'
    +'Payment '+(idx+1)+' of '+plan.num+' &nbsp;·&nbsp; <span style="color:#f2a830;">'+fmtR(plan.amt)+'</span><br>'
    +'Scheduled: '+formatDisplayDate(plan.dates[idx]);
  document.getElementById('instPayModal').classList.add('active');
}

function confirmInstPay(){
  var planId = document.getElementById('instPayPlanId').value;
  var idx    = parseInt(document.getElementById('instPayIndex').value);
  var date   = document.getElementById('instPayDate').value || localDateStr(new Date());
  var note   = document.getElementById('instPayNote').value.trim();
  var plans  = loadInst();
  var plan   = plans.find(function(p){ return p.id === planId; });
  if(!plan) return;
  if(!plan.paid) plan.paid = [];
  var payLabel=plan.desc+(idx===-1?' (monthly)':' - payment '+(idx+1));
  var cfId_inst=postToCF({label:payLabel,amount:plan.amt,date:date,icon:'inst',type:'expense',sourceType:'instalment',sourceId:planId,sourceCardName:plan.provider+' '+plan.desc,note:note});
  if(idx === -1){
    var nextIdx = plan.paid.length > 0 ? Math.max.apply(null, plan.paid.map(function(x){ return x.index; })) + 1 : 0;
    plan.paid.push({ index: nextIdx, date: date, note: note, cfId:cfId_inst });
  } else {
    plan.paid = plan.paid.filter(function(x){ return x.index !== idx; });
    plan.paid.push({ index: idx, date: date, note: note, cfId:cfId_inst });
  }
  saveInst(plans);
  closeModal('instPayModal');
  renderInst();
}

function unmarkInstPay(planId, idx){
  var plans = loadInst();
  var plan  = plans.find(function(p){ return p.id === planId; });
  if(!plan) return;
  var payEntry=(plan.paid||[]).find(function(x){return x.index===idx;});
  if(payEntry&&payEntry.cfId) removeFromCF(payEntry.cfId);
  plan.paid = (plan.paid||[]).filter(function(x){ return x.index !== idx; });
  saveInst(plans);
  renderInst();
}

// ── Snowball: skip M2M plans, focus on fixed-term ones ──
function getSnowballOrder(plans){
  var active = plans.filter(function(p){
    return !p.monthToMonth && p.num && (p.paid||[]).length < p.num;
  });
  return active.slice().sort(function(a, b){
    var remA = (a.num - (a.paid||[]).length) * a.amt;
    var remB = (b.num - (b.paid||[]).length) * b.amt;
    return remA - remB;
  });
}

function renderInst(){
  var plans   = loadInst();
  var now     = new Date();
  var thisMonth = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');

  var active  = [];
  var cleared = [];

  plans.forEach(function(p){
    var paidIdxs = (p.paid||[]).map(function(x){ return x.index; });
    var done = !p.monthToMonth && p.num && paidIdxs.length >= p.num;
    if(done) cleared.push(p);
    else     active.push(p);
  });

  // Summary
  var totalDueMonth = 0;
  var totalRem      = 0;
  active.forEach(function(p){
    var paidIdxs = (p.paid||[]).map(function(x){ return x.index; });
    p.dates.forEach(function(ds, i){
      if(paidIdxs.indexOf(i) > -1) return;
      totalRem += p.amt;
      if(ds.slice(0,7) === thisMonth) totalDueMonth += p.amt;
    });
  });

  document.getElementById('instActiveCnt').textContent = active.length;
  document.getElementById('instDueMonth').textContent  = fmtR(totalDueMonth);
  document.getElementById('instTotalRem').textContent  = fmtR(totalRem);

  // Snowball banner
  var banner = document.getElementById('instSnowballBanner');
  var sbOrder = getSnowballOrder(plans);
  if(sbOrder.length >= 2){
    banner.style.display = 'block';
    var first = sbOrder[0];
    var remPays = first.num - (first.paid||[]).length;
    document.getElementById('instSnowballMsg').innerHTML =
      'Focus on clearing <strong style="color:#c8f230;">'+first.desc+'</strong> ('+INST_PROV_ICON[first.provider]+' '+first.provider+') first — only <strong style="color:#f2a830;">'+remPays+' payment'+(remPays!==1?'s':'')+' left</strong> ('+fmtR(remPays*first.amt)+'). Finish it, then roll that money into your next plan.';
  } else {
    banner.style.display = 'none';
  }

  // Cards
  var container = document.getElementById('instCards');
  container.innerHTML = '';

  if(active.length === 0){
    container.innerHTML = '<div style="padding:48px 16px;text-align:center;color:#333;font-size:13px;background:var(--surface);border:1px dashed var(--border);border-radius:10px;">No active instalment plans — tap <strong style="color:#c8f230;">+ Add Plan</strong> to get started</div>';
  } else {
    // Separate M2M (ongoing) plans from fixed-term plans
    var m2mPlans = active.filter(function(p){ return !!p.monthToMonth; });
    var fixedPlans = getSnowballOrder(active); // excludes M2M, sorted smallest-remaining-first
    // Render fixed-term plans first (snowball order), then M2M ongoing plans
    fixedPlans.forEach(function(plan, cardIdx){
      container.appendChild(buildInstCard(plan, cardIdx === 0 && fixedPlans.length > 1));
    });
    m2mPlans.forEach(function(plan){
      container.appendChild(buildInstCard(plan, false));
    });
  }

  // Cleared section
  var clearedWrap = document.getElementById('instClearedWrap');
  var clearedList = document.getElementById('instClearedList');
  if(cleared.length > 0){
    clearedWrap.style.display = 'block';
    document.getElementById('instClearedBtn').textContent = _instShowCleared
      ? 'Hide Cleared Plans ('+cleared.length+')'
      : 'Show Cleared Plans ('+cleared.length+')';
    if(_instShowCleared){
      clearedList.style.display = 'block';
      clearedList.innerHTML = '';
      cleared.forEach(function(plan){ clearedList.appendChild(buildInstCard(plan, false, true)); });
    } else {
      clearedList.style.display = 'none';
    }
  } else {
    clearedWrap.style.display = 'none';
  }
}

function buildInstCard(plan, isTarget, isCleared){
  var c = INST_PROV_COLORS[plan.provider] || INST_PROV_COLORS.TFG;
  var paidIdxs = (plan.paid||[]).map(function(x){ return x.index; });
  var paidCount = paidIdxs.length;
  var isM2M = !!plan.monthToMonth;
  var pct = isM2M ? 0 : Math.round((paidCount / plan.num) * 100);
  var remAmt = isM2M ? null : (plan.num - paidCount) * plan.amt;
  var totalPaid = paidCount * plan.amt;

  var card = document.createElement('div');
  card.style.cssText = 'background:var(--surface);border:1px solid '+(isCleared?'#2a2a2a':c.border)+';border-radius:10px;overflow:hidden;margin-bottom:14px;'+(isTarget?'box-shadow:0 0 0 2px #c8f23044;':'');

  // Header
  var subLabel = isM2M
    ? 'Month to Month · R' + plan.amt + '/month · Debit day ' + (plan.debitDay || '—')
    : plan.freq.charAt(0).toUpperCase() + plan.freq.slice(1) + ' · ' + plan.num + ' instalments';

  var headerHtml =
    '<div style="background:'+c.bg+';padding:14px 16px;border-bottom:1px solid '+c.border+';display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">'
      +'<div>'
        +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">'
          +'<span style="font-size:9px;padding:2px 9px;border-radius:100px;background:'+c.border+';color:'+c.text+';letter-spacing:1.5px;text-transform:uppercase;">'+INST_PROV_ICON[plan.provider]+' '+plan.provider+'</span>'
          +(isM2M ? '<span style="font-size:9px;padding:2px 9px;border-radius:100px;background:#1a1000;color:#f2c830;border:1px solid #6a4a00;letter-spacing:1.5px;">∞ ONGOING</span>' : '')
          +(isTarget && !isM2M ? '<span style="font-size:9px;padding:2px 9px;border-radius:100px;background:#0d1a00;color:#c8f230;border:1px solid #3a5a00;letter-spacing:1.5px;">❄️ ATTACK FIRST</span>' : '')
          +(isCleared ? '<span style="font-size:9px;padding:2px 9px;border-radius:100px;background:#0d1a00;color:#c8f230;border:1px solid #3a5a00;letter-spacing:1.5px;">✓ CLEARED</span>' : '')
        +'</div>'
        +'<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:17px;color:#efefef;">'+plan.desc+'</div>'
        +'<div style="font-size:10px;color:#555;margin-top:2px;letter-spacing:1px;">'+subLabel+'</div>'
      +'</div>'
      +'<div style="text-align:right;flex-shrink:0;">'
        +'<div style="font-size:9px;color:#555;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px;">'+(isM2M ? 'Total Paid' : isCleared ? 'Paid off' : 'Remaining')+'</div>'
        +'<div style="font-family:\'Syne\',sans-serif;font-weight:800;font-size:22px;color:'+(isM2M?'#f2c830':isCleared?'#c8f230':'#f2a830')+';">'+(isM2M ? fmtR(totalPaid) : isCleared ? fmtR(plan.total) : fmtR(remAmt))+'</div>'
      +'</div>'
    +'</div>';

  // Progress bar — skip for month-to-month
  var progHtml = isM2M
    ? '<div style="padding:10px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;font-size:10px;color:#555;letter-spacing:1px;">'
        +'<span>'+paidCount+' payment'+(paidCount!==1?'s':'')+' logged</span>'
        +'<span>R'+plan.amt+' debited on the '+( plan.debitDay || '?')+'th each month</span>'
      +'</div>'
    : '<div style="padding:12px 16px;border-bottom:1px solid var(--border);">'
        +'<div style="display:flex;justify-content:space-between;font-size:10px;color:#555;margin-bottom:6px;letter-spacing:1px;">'
          +'<span>'+paidCount+' of '+plan.num+' paid</span>'
          +'<span>'+pct+'%</span>'
          +'<span>'+fmtR(plan.amt)+'/payment</span>'
        +'</div>'
        +'<div style="height:6px;background:#1a1a1a;border-radius:3px;overflow:hidden;">'
        +'<div style="height:100%;width:'+pct+'%;background:'+(isCleared?'#c8f230':c.badge)+';border-radius:3px;transition:width .5s cubic-bezier(.16,1,.3,1);box-shadow:0 0 8px '+(isCleared?'#c8f23044':c.badge+'44')+';"></div>'
      +'</div>'
    +'</div>';

  // Payment rows
  var rowsHtml = '<div style="padding:8px 16px 4px;">';
  var now2 = new Date(); now2.setHours(0,0,0,0);

  if(isM2M){
    // Month-to-month: show paid history + next due
    var nextDue = new Date(now2.getFullYear(), now2.getMonth(), plan.debitDay || 20);
    if(nextDue < now2) nextDue = new Date(now2.getFullYear(), now2.getMonth()+1, plan.debitDay || 20);
    var isToday2 = nextDue.getTime() === now2.getTime();
    rowsHtml += '<div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#444;margin-bottom:8px;padding-top:4px;">Next debit</div>';
    rowsHtml += '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #161616;font-size:12px;">'
      +'<span style="width:10px;height:10px;border-radius:50%;background:'+(isToday2?'#f2a830':'#333')+';display:inline-block;flex-shrink:0;"></span>'
      +'<div style="flex:1;"><span style="color:#888;font-size:11px;">'+(isToday2?'Today!':nextDue.toLocaleDateString('en-ZA',{day:'2-digit',month:'short',year:'numeric'}))+'</span></div>'
      +'<span style="color:#f2c830;font-weight:700;">'+fmtR(plan.amt)+'</span>'
      +'<button onclick="openInstM2MPay(\''+plan.id+'\')" style="background:#0d1a00;border:1px solid #3a5a00;border-radius:4px;padding:3px 10px;color:#c8f230;font-family:\'DM Mono\',monospace;font-size:9px;letter-spacing:1px;cursor:pointer;">Mark Paid</button>'
    +'</div>';
    if(plan.paid && plan.paid.length > 0){
      rowsHtml += '<div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#444;margin:10px 0 6px;">Payment history</div>';
      var sortedPaid = plan.paid.slice().sort(function(a,b){ return b.date > a.date ? 1 : -1; });
      sortedPaid.slice(0,6).forEach(function(p){
        rowsHtml += '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #161616;font-size:12px;">'
          +'<span style="width:10px;height:10px;border-radius:50%;background:#c8f230;display:inline-block;flex-shrink:0;"></span>'
          +'<div style="flex:1;"><span style="color:#555;font-size:10px;">'+p.date+'</span>'+(p.note?'<span style="color:#444;font-size:10px;"> · '+p.note+'</span>':'')+'</div>'
          +'<span style="color:#c8f230;font-weight:700;">'+fmtR(plan.amt)+'</span>'
        +'</div>';
      });
    }
  } else {
    plan.dates.forEach(function(ds, i){
      var isPaid = paidIdxs.indexOf(i) > -1;
      var paidEntry = isPaid ? plan.paid.find(function(x){ return x.index === i; }) : null;
      var dDate = new Date(ds+'T00:00:00');
      var isOverdue = !isPaid && dDate < now2;
      var isToday   = !isPaid && dDate.getTime() === now2.getTime();

      var statusDot = isPaid
        ? '<span style="width:10px;height:10px;border-radius:50%;background:#c8f230;display:inline-block;flex-shrink:0;"></span>'
        : (isOverdue
            ? '<span style="width:10px;height:10px;border-radius:50%;background:#f23060;display:inline-block;flex-shrink:0;"></span>'
            : (isToday
                ? '<span style="width:10px;height:10px;border-radius:50%;background:#f2a830;display:inline-block;flex-shrink:0;"></span>'
                : '<span style="width:10px;height:10px;border-radius:50%;border:2px solid #333;display:inline-block;flex-shrink:0;"></span>'));

      var label = isPaid
        ? '<span style="color:#c8f230;">✓ Paid</span>'+(paidEntry&&paidEntry.date?' <span style="color:#555;font-size:10px;">'+paidEntry.date+'</span>':'')+(paidEntry&&paidEntry.note?' · <span style="color:#555;font-size:10px;">'+paidEntry.note+'</span>':'')
        : (isOverdue ? '<span style="color:#f23060;">Overdue</span>' : (isToday ? '<span style="color:#f2a830;">Due today!</span>' : '<span style="color:#555;">'+formatDisplayDate(ds)+'</span>'));

      var actionBtn = isPaid
        ? '<button onclick="unmarkInstPay(\''+plan.id+'\','+i+')" style="background:none;border:1px solid #2a2a2a;border-radius:4px;padding:3px 8px;color:#444;font-family:\'DM Mono\',monospace;font-size:9px;letter-spacing:1px;cursor:pointer;transition:all .15s;" onmouseover="this.style.borderColor=\'#555\';this.style.color=\'#888\'" onmouseout="this.style.borderColor=\'#2a2a2a\';this.style.color=\'#444\'">Undo</button>'
        : '<button onclick="openInstPayModal(\''+plan.id+'\','+i+')" style="background:#0d1a00;border:1px solid #3a5a00;border-radius:4px;padding:3px 10px;color:#c8f230;font-family:\'DM Mono\',monospace;font-size:9px;letter-spacing:1px;cursor:pointer;transition:all .15s;" onmouseover="this.style.opacity=\'.8\'" onmouseout="this.style.opacity=\'1\'">Mark Paid</button>';

      rowsHtml +=
        '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #161616;font-size:12px;">'
          +statusDot
          +'<span style="color:#555;min-width:24px;font-size:10px;">'+(i+1)+'</span>'
          +'<div style="flex:1;">'
            +'<span style="color:#888;font-size:10px;letter-spacing:0.5px;">'+formatDisplayDate(ds)+'</span>'
            +'<div style="margin-top:1px;">'+label+'</div>'
          +'</div>'
          +'<span style="color:#efefef;font-weight:700;font-size:13px;white-space:nowrap;">'+fmtR(plan.amt)+'</span>'
          +(!isCleared ? actionBtn : '')
        +'</div>';
    });
  }
  rowsHtml += '</div>';

  // Action buttons
  var actionsHtml = !isCleared
    ? '<div style="display:flex;gap:8px;padding:10px 16px;border-top:1px solid var(--border);">'
        +'<button onclick="openInstModal(\''+plan.id+'\')" style="background:#1a1a00;border:1px solid #3a3a00;border-radius:6px;padding:7px 14px;color:#888;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;" onmouseover="this.style.opacity=\'.8\'" onmouseout="this.style.opacity=\'1\'">✏️ Edit</button>'
        +'<button onclick="deleteInstPlan(\''+plan.id+'\')" style="margin-left:auto;background:none;border:1px solid #2a1a1a;border-radius:6px;padding:7px 12px;color:#555;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;cursor:pointer;" onmouseover="this.style.borderColor=\'#c0392b\';this.style.color=\'#c0392b\'" onmouseout="this.style.borderColor=\'#2a1a1a\';this.style.color=\'#555\'">Remove</button>'
      +'</div>'
    : '<div style="display:flex;justify-content:flex-end;padding:10px 16px;border-top:1px solid var(--border);">'
        +'<button onclick="deleteInstPlan(\''+plan.id+'\')" style="background:none;border:1px solid #2a1a1a;border-radius:6px;padding:7px 12px;color:#555;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;cursor:pointer;" onmouseover="this.style.borderColor=\'#c0392b\';this.style.color=\'#c0392b\'" onmouseout="this.style.borderColor=\'#2a1a1a\';this.style.color=\'#555\'">Remove</button>'
      +'</div>';

  card.innerHTML = headerHtml + progHtml + rowsHtml + actionsHtml;
  return card;
}

function toggleInstCleared(){
  _instShowCleared = !_instShowCleared;
  renderInst();
}

function openInstM2MPay(planId){
  document.getElementById('instPayPlanId').value = planId;
  document.getElementById('instPayIndex').value = -1; // -1 = M2M
  document.getElementById('instPayDate').value = localDateStr(new Date());
  document.getElementById('instPayNote').value = '';
  document.getElementById('instPayInfo').innerHTML = 'Log this month\'s MTN debit of <strong style="color:#f2c830;">R209</strong>.';
  document.getElementById('instPayModal').classList.add('active');
}

// ── Wire into switchTab ──
var _origSwitchTab = typeof switchTab === 'function' ? switchTab : null;
// Patch: renderInst when instalments tab is opened
document.addEventListener('DOMContentLoaded', function(){
  // nothing needed — switchTab handles it
});

/* ══════════════════════════════════ */

var ROUTINE_KEY = 'yasin_routine_v2';
