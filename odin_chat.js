// Odin Chat: conversational engine, affordability


// ══════════════════════════════════════════════════════════
// 🧠 ODIN CHAT ENGINE — No API needed, reads live data
// ══════════════════════════════════════════════════════════

function openAIAssistant(){
  document.getElementById('aiOverlay').classList.add('open');
  setTimeout(function(){ document.getElementById('aiInput').focus(); }, 300);
}
function closeAIAssistant(){
  document.getElementById('aiOverlay').classList.remove('open');
}
function clearAIChat(){
  document.getElementById('aiMessages').innerHTML =
    '<div class="ai-empty" id="aiEmptyState">'
    +'<div class="ai-empty-icon">🧠</div>'
    +'<div class="ai-empty-title">Ask Odin anything</div>'
    +'<div class="ai-empty-sub">Try: \"Can I buy sneakers for R800?\"<br>or \"What does Lezaun owe me?\"<br>or \"How\'s my cash flow this month?\"</div>'
    +'</div>';
}

function odinChat(text){
  if(!text || !text.trim()) return;
  var input = document.getElementById('aiInput');
  var msgs  = document.getElementById('aiMessages');
  var empty = document.getElementById('aiEmptyState');
  if(empty) empty.style.display = 'none';
  if(input) input.value = '';

  // Show user message
  var userDiv = document.createElement('div');
  userDiv.className = 'ai-msg user';
  userDiv.style.cssText = 'align-self:flex-end;background:#1a2e00;border:1px solid #2a4a00;border-radius:12px 12px 2px 12px;padding:10px 14px;font-size:12px;color:#c8f230;max-width:80%;margin-bottom:8px;';
  userDiv.textContent = text;
  msgs.appendChild(userDiv);

  // Thinking indicator
  var thinkDiv = document.createElement('div');
  thinkDiv.className = 'ai-msg odin';
  thinkDiv.style.cssText = 'align-self:flex-start;background:#111;border:1px solid #2a2a2a;border-radius:2px 12px 12px 12px;padding:10px 14px;font-size:12px;color:#5a8800;max-width:85%;margin-bottom:8px;';
  thinkDiv.textContent = '🧠 thinking...';
  msgs.appendChild(thinkDiv);
  msgs.scrollTop = msgs.scrollHeight;

  // Process and respond
  setTimeout(function(){
    var response = odinProcess(text.toLowerCase());
    thinkDiv.style.color = '#efefef';
    thinkDiv.innerHTML = response;
    msgs.scrollTop = msgs.scrollHeight;
  }, 400);
}

function odinProcess(q){
  var now = new Date();
  var mk  = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');

  // ── AFFORDABILITY CHECK ──
  // Match: R800, r800, "costs 800", "are 1400", "is 1400", "for 1400"
  var affordMatch = q.match(/r\s*(\d[\d,]*)/) || q.match(/(?:costs?|are|is|for|about|around|at)\s+(\d[\d,]*)/) || q.match(/(\d{3,}[\d,]*)/);
  var affordAmt = affordMatch ? parseFloat((affordMatch[1]||affordMatch[2]||affordMatch[3]||'0').replace(',','')) : null;
  if((q.includes('afford') || q.includes('buy') || q.includes('can i') || q.includes('sneaker') || q.includes('shoe') || q.includes('petrol') || q.includes('fuel') || q.includes('gas') || q.includes('cost') || q.includes('are') || q.includes('spend')) && affordAmt){
    return odinAffordability(affordAmt, q);
  }
  if((q.includes('afford') || q.includes('buy') || q.includes('can i')) && !affordAmt){
    return '🧠 How much does it cost? Try: <b>\'Can I buy sneakers for R800?\'</b>';
  }

  // ── PERSON LOOKUP ──
  var people = [];
  try{ people = loadPassengers()||[]; }catch(e){}
  var extData = {};
  try{ extData = loadExternalBorrows(); }catch(e){}
  var allNames = people.map(function(p){ return p.name.toLowerCase(); });
  Object.values(extData).forEach(function(p){ allNames.push(p.name.toLowerCase()); });

  for(var i=0; i<people.length; i++){
    var pName = people[i].name;
    if(q.includes(pName.toLowerCase())){
      return odinPersonStatus(pName, 'carpool');
    }
  }
  Object.keys(extData).forEach(function(key){
    var p = extData[key];
    if(q.includes(p.name.toLowerCase())){
      return odinPersonStatus(p.name, 'external', key);
    }
  });

  // ── CASH FLOW ──
  if(q.includes('cash flow') || q.includes('cashflow') || q.includes('net') || q.includes('budget')){
    return odinCashFlowSummary();
  }

  // ── SAVINGS ──
  if(q.includes('saving') || q.includes('fund') || q.includes('vault') || q.includes('emergency')){
    return odinSavingsSummary();
  }

  // ── CARPOOL ──
  if(q.includes('carpool') || q.includes('trip') || q.includes('passenger') || q.includes('pool')){
    return odinCarpoolSummary();
  }

  // ── CARS ──
  if(q.includes('car') || q.includes('service') || q.includes('kia') || q.includes('toyota') || q.includes('hyundai')){
    return odinCarsSummary();
  }

  // ── WHO OWES ──
  if(q.includes('owe') || q.includes('debt') || q.includes('lent') || q.includes('borrow')){
    return odinBorrowSummary();
  }

  // ── WHATSAPP ──
  if(q.includes('whatsapp') || q.includes('message') || q.includes('send')){
    return odinWhatsApp();
  }

  // ── SUMMARY ──
  if(q.includes('summary') || q.includes('overview') || q.includes('health') || q.includes('status') || q.includes('how am i')){
    return odinFullSummary();
  }

  // ── MAINTENANCE ──
  if(q.includes('maintenance') || q.includes('maint')){
    return odinMaintSummary();
  }

  // ── DEFAULT ──
  return '<b>🧠 I did not quite catch that.</b><br><br>Try asking:<br>'
    +'<span style="color:#c8f230;">Can I buy shoes for R800?</span><br>'
    +'<span style="color:#c8f230;">What does Lezaun owe me?</span><br>'
    +'<span style="color:#c8f230;">Cash flow this month</span><br>'
    +'<span style="color:#c8f230;">Savings summary</span><br>'
    +'<span style="color:#c8f230;">Carpool this month</span>';
}

function odinAffordability(amount, q){
  var recon = {};
  try{ recon = JSON.parse(lsGet('yb_recon_balances_v1')||'{}'); }catch(e){}
  var fnb  = Number(recon.fnb||0);
  var tyme = Number(recon.tyme||0);
  var liquid = fnb + tyme;

  // Outstanding commitments
  var outstanding = 0;
  try{
    var plans = loadInst ? loadInst() : [];
    plans.forEach(function(p){ if(p.monthToMonth) outstanding += p.amt||0; });
  }catch(e){}

  var available = Math.max(0, liquid - outstanding);
  var canAfford = available >= amount;
  var leftAfter = available - amount;

  var item = q.includes('sneaker')||q.includes('shoe') ? 'sneakers'
    : q.includes('petrol')||q.includes('fuel')||q.includes('gas') ? 'fuel'
    : 'this purchase';

  if(!liquid){
    return '🧠 I do not have your bank balances yet. Go to <b>Cash Flow → Account Balances</b> and enter your FNB and TymeBank balances first.';
  }

  var out = '<b>'+(canAfford?'✅ Yes, you can afford it':'❌ Tight — be careful')+'</b><br><br>';
  out += '💳 Available cash: <b>'+fmtR(liquid)+'</b><br>';
  if(outstanding) out += '📋 Commitments due: <b>-'+fmtR(outstanding)+'</b><br>';
  out += '🟢 Truly free: <b>'+fmtR(available)+'</b><br><br>';
  out += '🛒 '+item+': <b>-'+fmtR(amount)+'</b><br>';
  out += 'After purchase: <b style="color:'+(leftAfter>=500?'#c8f230':leftAfter>=0?'#f2a830':'#f23060')+';">'+fmtR(leftAfter)+'</b><br><br>';

  if(leftAfter < 500 && leftAfter >= 0){
    out += '⚠️ <i>That leaves you very tight. Make sure no urgent expenses are coming.</i>';
  } else if(leftAfter < 0){
    out += '🔴 <i>You\'d go into the negative. Rather wait until next income.</i>';
  } else {
    out += '👍 <i>You\'re in a good position. Enjoy it!</i>';
  }
  return out;
}

function odinPersonStatus(name, tag, extKey){
  var out = '<b>'+name+'</b><br><br>';
  if(tag === 'carpool'){
    loadBorrows();
    var entries = (borrowData&&borrowData[name])||[];
    var b=0,r=0;
    entries.forEach(function(e){ if(e.type==='repay') r+=Number(e.amount||0); else b+=Number(e.amount||0); });
    var owed = Math.max(0,b-r);
    out += owed>0
      ? '💸 Owes you: <b style="color:#f2a830;">'+fmtR(owed)+'</b><br>'
      : '✅ All settled — nothing owed<br>';
    out += 'Total lent: '+fmtR(b)+' · Repaid: '+fmtR(r)+'<br>';
    // Carpool this month
    var now = new Date();
    var mk = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
    if(cpData&&cpData[mk]){
      var monthTotal=0;
      Object.values(cpData[mk]).forEach(function(day){ if(day[name]) monthTotal+=Number(day[name].amt||0); });
      if(monthTotal) out += '🚗 Carpool this month: <b>'+fmtR(monthTotal)+'</b>';
    }
  } else {
    var extD = loadExternalBorrows();
    var p = extD[extKey];
    if(p){
      var b=0,r=0;
      (p.entries||[]).forEach(function(e){ if(e.type==='repay') r+=Number(e.amount||0); else b+=Number(e.amount||0); });
      var owed=Math.max(0,b-r);
      out += owed>0
        ? '💸 Owes you: <b style="color:#f2a830;">'+fmtR(owed)+'</b><br>'
        : '✅ Fully settled<br>';
      out += 'Total lent: '+fmtR(b)+' · Repaid: '+fmtR(r);
    }
  }
  return out;
}

function odinCashFlowSummary(){
  try{
    var snap = getLendingSnapshot();
    var out = '<b>💵 Cash Flow — This Month</b><br><br>';
    out += '📈 Income: <b style="color:#c8f230;">'+fmtR(snap.totalIncome)+'</b><br>';
    out += '📉 Real Expenses: <b style="color:#f23060;">'+fmtR(snap.totalIncome - snap.net - (snap.totalIncome*0))+'</b><br>';
    out += 'Net: <b style="color:'+(snap.net>=0?'#c8f230':'#f23060')+';">'+fmtR(snap.net)+'</b><br><br>';
    out += snap.net>=0
      ? '✅ You are ahead this month.'
      : '⚠️ You are over budget on real expenses.';
    return out;
  }catch(e){ return '⚠️ Could not load cash flow data.'; }
}

function odinSavingsSummary(){
  var out = '<b>💰 Savings Summary</b><br><br>';
  var total = 0;
  try{
    (funds||[]).filter(function(f){ return !f.isExpense; }).forEach(function(f){
      var saved = fundTotal(f);
      var pct = f.goal>0 ? Math.round(saved/f.goal*100) : 0;
      total += saved;
      out += (f.emoji||'💰')+' <b>'+f.name+'</b>: '+fmtR(saved)+' ('+pct+'%)<br>';
    });
  }catch(e){}
  out += '<br>Total saved: <b style="color:#c8f230;">'+fmtR(total)+'</b>';
  return out;
}

function odinCarpoolSummary(){
  var now = new Date();
  var mk = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  var out = '<b>🚗 Carpool — This Month</b><br><br>';
  var total = 0;
  try{
    var pax = loadPassengers()||[];
    pax.forEach(function(p){
      var monthTotal=0;
      if(cpData&&cpData[mk]){
        Object.values(cpData[mk]).forEach(function(day){ if(day[p.name]) monthTotal+=Number(day[p.name].amt||0); });
      }
      total+=monthTotal;
      out += '👤 '+p.name+': <b>'+fmtR(monthTotal)+'</b><br>';
    });
  }catch(e){}
  out += '<br>Total collected: <b style="color:#c8f230;">'+fmtR(total)+'</b>';
  return out;
}

function odinCarsSummary(){
  var out = '<b>🔧 Cars — Service Status</b><br><br>';
  try{
    loadCarsData().forEach(function(car){
      var svc = calcNextService(car);
      var days = svc.daysUntilNext;
      var status = days===null ? 'No service data'
        : days<0 ? '<b style="color:#f23060;">OVERDUE by '+Math.abs(days)+' days</b>'
        : days<=30 ? '<b style="color:#f23060;">Due in '+days+' days</b>'
        : days<=90 ? '<b style="color:#f2a830;">Due in '+days+' days</b>'
        : '<b style="color:#c8f230;">Due in '+days+' days</b>';
      out += '🚗 <b>'+car.name+'</b>: '+status+'<br>';
    });
  }catch(e){ out += 'Could not load car data.'; }
  return out;
}

function odinBorrowSummary(){
  var out = '<b>🤝 Who Owes You</b><br><br>';
  var grandTotal = 0;
  try{
    var pax = loadPassengers()||[];
    pax.forEach(function(p){
      loadBorrows();
      var entries=(borrowData&&borrowData[p.name])||[];
      var b=0,r=0;
      entries.forEach(function(e){ if(e.type==='repay') r+=Number(e.amount||0); else b+=Number(e.amount||0); });
      var owed=Math.max(0,b-r);
      if(owed>0){ out+='👤 '+p.name+': <b style="color:#f2a830;">'+fmtR(owed)+'</b><br>'; grandTotal+=owed; }
    });
    var extD=loadExternalBorrows();
    Object.values(extD).forEach(function(p){
      if(p.archived) return;
      var b=0,r=0;
      (p.entries||[]).forEach(function(e){ if(e.type==='repay') r+=Number(e.amount||0); else b+=Number(e.amount||0); });
      var owed=Math.max(0,b-r);
      if(owed>0){ out+='👤 '+p.name+' (personal): <b style="color:#f2a830;">'+fmtR(owed)+'</b><br>'; grandTotal+=owed; }
    });
  }catch(e){}
  out += grandTotal>0
    ? '<br>Total owed to you: <b style="color:#f2a830;">'+fmtR(grandTotal)+'</b>'
    : 'Everyone is settled. ✅';
  return out;
}

function odinMaintSummary(){
  var now=new Date();
  var mk=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  try{
    var mdata=getMaintData();
    var thisMonth=mdata.filter(function(e){ return e.date&&e.date.startsWith(mk); }).reduce(function(s,e){ return s+e.amount; },0);
    var short=Math.max(0,MAINT_TARGET-thisMonth);
    var out='<b>🔧 Maintenance Fund</b><br><br>';
    out+='This month: <b>'+fmtR(thisMonth)+'</b> of <b>'+fmtR(MAINT_TARGET)+'</b><br>';
    out+=short>0
      ? '⚠️ Still <b style="color:#f2a830;">'+fmtR(short)+'</b> short this month.'
      : '✅ Target met this month!';
    return out;
  }catch(e){ return 'Could not load maintenance data.'; }
}

function odinWhatsApp(){
  var now=new Date();
  var mk=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  var month=now.toLocaleString('en-ZA',{month:'long',year:'numeric'});
  var msg='🚗 *Carpool Summary — '+month+'*\n\n';
  try{
    var pax=loadPassengers()||[];
    pax.forEach(function(p){
      var monthTotal=0,paid=0,unpaid=0;
      if(cpData&&cpData[mk]){
        Object.values(cpData[mk]).forEach(function(day){
          if(!day[p.name]) return;
          var amt=Number(day[p.name].amt||0);
          monthTotal+=amt;
          if(day[p.name].paid) paid+=amt; else unpaid+=amt;
        });
      }
      if(monthTotal>0){
        msg+=p.name+': R'+monthTotal.toLocaleString('en-ZA');
        if(unpaid>0) msg+=' (R'+unpaid.toLocaleString('en-ZA')+' outstanding)';
        msg+='\n';
      }
    });
  }catch(e){}
  msg+='\nPayment to FNB / TymeBank. Thank you 🙏';
  return '<b>📲 WhatsApp Message</b><br><br><div style="background:#0d1a00;border:1px solid #1a3a00;border-radius:8px;padding:12px;font-size:11px;color:#c8f230;white-space:pre-wrap;font-family:DM Mono,monospace;">'+msg+'</div><br><i style="font-size:10px;color:#555;">Copy and paste into WhatsApp</i>';
}

function odinFullSummary(){
  var out = '<b>📊 Full Overview</b><br><br>';
  // Cash flow
  try{
    var snap=getLendingSnapshot();
    out+='💵 Net Cash Flow: <b style="color:'+(snap.net>=0?'#c8f230':'#f23060')+';">'+fmtR(snap.net)+'</b><br>';
  }catch(e){}
  // Liquid
  try{
    var recon=JSON.parse(lsGet('yb_recon_balances_v1')||'{}');
    var liq=(Number(recon.fnb||0)+Number(recon.tyme||0));
    if(liq) out+='🏦 Liquid cash: <b>'+fmtR(liq)+'</b><br>';
  }catch(e){}
  // Savings
  try{
    var tot=(funds||[]).filter(function(f){ return !f.isExpense; }).reduce(function(s,f){ return s+fundTotal(f); },0);
    out+='💰 Total saved: <b style="color:#c8f230;">'+fmtR(tot)+'</b><br>';
  }catch(e){}
  // Owed
  try{
    var grand=0;
    var pax=loadPassengers()||[];
    pax.forEach(function(p){
      loadBorrows();
      var ents=(borrowData&&borrowData[p.name])||[];
      var b=0,r=0; ents.forEach(function(e){ if(e.type==='repay') r+=Number(e.amount||0); else b+=Number(e.amount||0); });
      grand+=Math.max(0,b-r);
    });
    var extD=loadExternalBorrows();
    Object.values(extD).forEach(function(p){
      if(p.archived) return;
      var b=0,r=0; (p.entries||[]).forEach(function(e){ if(e.type==='repay') r+=Number(e.amount||0); else b+=Number(e.amount||0); });
      grand+=Math.max(0,b-r);
    });
    if(grand>0) out+='🤝 Total owed to you: <b style="color:#f2a830;">'+fmtR(grand)+'</b><br>';
  }catch(e){}
  // Urgent alerts
  var alerts=buildOdinLaunchAlerts().filter(function(a){ return a.level==='red'; });
  if(alerts.length){
    out+='<br>🔴 <b>Urgent:</b><br>';
    alerts.forEach(function(a){ out+='• '+a.text+'<br>'; });
  }
  return out;
}


