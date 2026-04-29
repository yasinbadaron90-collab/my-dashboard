// Odin Chat: conversational engine — no API needed

let aiIsLoading = false;

function openAIAssistant(){
  document.getElementById('aiOverlay').classList.add('open');
  setTimeout(function(){ var el=document.getElementById('aiInput'); if(el) el.focus(); }, 300);
}
function closeAIAssistant(){
  document.getElementById('aiOverlay').classList.remove('open');
}
function clearAIChat(){
  var msgs = document.getElementById('aiMessages');
  if(msgs) msgs.innerHTML = '<div class="ai-empty" id="aiEmptyState">'
    +'<div class="ai-empty-icon">🧠</div>'
    +'<div class="ai-empty-title">Ask Odin anything</div>'
    +'<div class="ai-empty-sub">Try: "Can I buy sneakers for R800?"<br>or "What does Lezaun owe me?"<br>or "How do I set up my school tab?"</div>'
    +'</div>';
}
function aiQuickPrompt(text){
  var el = document.getElementById('aiInput');
  if(el) el.value = text;
  odinChat(text);
}

// ── Message bubble render ──
function appendOdinMsg(role, html){
  var empty = document.getElementById('aiEmptyState');
  if(empty) empty.remove();
  var msgs = document.getElementById('aiMessages');
  if(!msgs) return;

  var wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;gap:8px;margin-bottom:12px;align-items:flex-start;'
    +(role==='user'?'flex-direction:row-reverse;':'');

  var avatar = document.createElement('div');
  avatar.style.cssText = 'width:28px;height:28px;border-radius:50%;display:flex;align-items:center;'
    +'justify-content:center;font-size:14px;flex-shrink:0;'
    +(role==='user'?'background:#1a2e00;':'background:#111;border:1px solid #2a2a2a;');
  avatar.textContent = role==='user' ? '👤' : '🧠';

  var bubble = document.createElement('div');
  bubble.style.cssText = 'max-width:78%;padding:10px 14px;border-radius:'
    +(role==='user'?'12px 2px 12px 12px;background:#1a2e00;border:1px solid #2a4a00;color:#c8f230;'
                  :'12px 12px 12px 2px;background:#111;border:1px solid #2a2a2a;color:#efefef;')
    +'font-size:12px;line-height:1.6;word-break:break-word;white-space:normal;overflow-wrap:break-word;font-family:"DM Mono",monospace;';
  bubble.innerHTML = html;

  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  msgs.appendChild(wrap);
  msgs.scrollTop = msgs.scrollHeight;
}

// ── Main chat handler ──
function odinChat(text){
  if(!text || !text.trim()) return;
  var input = document.getElementById('aiInput');
  if(input) input.value = '';

  appendOdinMsg('user', escHtml(text));

  // Thinking indicator
  var empty = document.getElementById('aiEmptyState');
  if(empty) empty.remove();
  var msgs = document.getElementById('aiMessages');
  var thinkId = 'odin_think_'+Date.now();
  var thinkWrap = document.createElement('div');
  thinkWrap.id = thinkId;
  thinkWrap.style.cssText = 'display:flex;gap:8px;margin-bottom:12px;align-items:flex-start;';
  thinkWrap.innerHTML = '<div style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;background:#111;border:1px solid #2a2a2a;">🧠</div>'
    +'<div style="padding:10px 14px;border-radius:12px 12px 12px 2px;background:#111;border:1px solid #2a2a2a;color:#5a8800;font-size:12px;font-family:DM Mono,monospace;">thinking...</div>';
  if(msgs) msgs.appendChild(thinkWrap);
  if(msgs) msgs.scrollTop = msgs.scrollHeight;

  setTimeout(function(){
    var el = document.getElementById(thinkId);
    if(el) el.remove();
    var response = odinProcess(text.toLowerCase().trim());
    appendOdinMsg('assistant', response);
  }, 400);
}

function escHtml(str){
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Process query ──
function odinProcess(q){
  var now = new Date();
  var mk = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');

  // Greetings
  if(/^(hi|hello|hey|salaam|salam|hiya|howzit|sup|good\s*(morning|afternoon|evening|day))/.test(q)){
    var hour = now.getHours();
    var greet = hour<12?'Good morning':'hour'<17?'Good afternoon':'Good evening';
    return greet+', Yasin! 👋<br><br>I am Odin, your financial brain. Ask me anything about your money — savings, carpool, who owes you, cash flow, or whether you can afford something.<br><br>What do you need?';
  }

  // Affordability
  var affordMatch = q.match(/r\s*(\d[\d,]*)/) || q.match(/(?:costs?|are|is|for|about|around|at)\s+(\d[\d,]*)/) || q.match(/(\d{3,}[\d,]*)/);
  var affordAmt = affordMatch ? parseFloat((affordMatch[1]||affordMatch[2]||affordMatch[3]||'0').replace(',','')) : null;
  if((q.includes('afford')||q.includes('buy')||q.includes('can i')||q.includes('sneaker')||q.includes('shoe')||q.includes('petrol')||q.includes('fuel')||q.includes('gas')||q.includes('cost')||q.includes('spend')) && affordAmt){
    return odinAffordability(affordAmt, q);
  }
  if((q.includes('afford')||q.includes('buy')||q.includes('can i')) && !affordAmt){
    return '🧠 How much does it cost?<br>Try: <span style="color:#c8f230;">Can I buy shoes for R800?</span>';
  }

  // Person lookup
  try{
    var pax = loadPassengers()||[];
    for(var i=0;i<pax.length;i++){
      if(q.includes(pax[i].name.toLowerCase())) return odinPersonStatus(pax[i].name,'carpool');
    }
  }catch(e){}
  try{
    var ext = loadExternalBorrows();
    var extKeys = Object.keys(ext);
    for(var j=0;j<extKeys.length;j++){
      var p = ext[extKeys[j]];
      if(p && p.name && q.includes(p.name.toLowerCase())) return odinPersonStatus(p.name,'external',extKeys[j]);
    }
  }catch(e){}

  // FNB / TymeBank balance
  if(q.includes('fnb')||q.includes('tyme')||q.includes('bank balance')||q.includes('account')){
    try{
      var recon = JSON.parse(lsGet('yb_recon_balances_v1')||'{}');
      if(!recon.fnb && !recon.tyme) return '🧠 No bank balances saved yet.<br>Go to <b>Cash Flow → Account Balances</b> and enter your balances first.';
      var out = '<b>🏦 Bank Balances</b><br><br>';
      if(recon.fnb) out += '🏛 FNB: <b style="color:#4a9aff;">'+fmtR(recon.fnb)+'</b><br>';
      if(recon.tyme) out += '🏦 TymeBank: <b style="color:#f2a830;">'+fmtR(recon.tyme)+'</b><br>';
      out += '<br>Total liquid: <b style="color:#c8f230;">'+fmtR((Number(recon.fnb||0)+Number(recon.tyme||0)))+'</b>';
      return out;
    }catch(e){}
  }

  // ── Onboarding / "how do I…" intents ────────────────────────────────
  // These come BEFORE the summary handlers so a question like "How do I set
  // up savings?" goes to the walkthrough instead of dumping a savings
  // summary that the new user can't yet make sense of.
  var isHowTo = (
    q.indexOf('how do i') > -1 ||
    q.indexOf('how to') > -1 ||
    q.indexOf('set up') > -1 ||
    q.indexOf('setup') > -1 ||
    q.indexOf('get started') > -1 ||
    q.indexOf('walk me through') > -1 ||
    q.indexOf('show me how') > -1 ||
    q.indexOf('explain') > -1 ||
    q.indexOf('teach me') > -1
  );
  if(isHowTo){
    if(q.indexOf('school') > -1 || q.indexOf('subject') > -1 || q.indexOf('grade') > -1 || q.indexOf('module') > -1){
      return odinSchoolHelp(q);
    }
    if(q.indexOf('saving') > -1 || q.indexOf('fund') > -1 || q.indexOf('vault') > -1){
      return odinSavingsHelp();
    }
    if(q.indexOf('carpool') > -1 || q.indexOf('trip') > -1 || q.indexOf('passenger') > -1){
      return odinCarpoolHelp();
    }
    if(q.indexOf('cash flow') > -1 || q.indexOf('cashflow') > -1 || q.indexOf('budget') > -1 || q.indexOf('income') > -1 || q.indexOf('expense') > -1){
      return odinCashflowHelp();
    }
    if(q.indexOf('car') > -1 || q.indexOf('service') > -1 || q.indexOf('maintenance') > -1){
      return odinCarsHelp();
    }
    if(q.indexOf('prayer') > -1 || q.indexOf('salaah') > -1 || q.indexOf('salah') > -1){
      return odinPrayerHelp();
    }
    if(q.indexOf('tour') > -1 || q.indexOf('everything') > -1 || q.indexOf('whole app') > -1 || q.indexOf('overview') > -1){
      return odinTourHelp();
    }
  }

  // School — onboarding walkthrough (must check this BEFORE the generic
  // "saving"/"fund" handler since "school" can co-occur with those words).
  if(q.includes('school')||q.includes('subject')||q.includes('webinar')||q.includes('assignment')||q.includes('quiz')||q.includes('exam')||q.includes('grade')||q.includes('result')||q.includes('module')){
    return odinSchoolHelp(q);
  }

  // Cash flow
  if(q.includes('cash flow')||q.includes('cashflow')||q.includes('net')||q.includes('budget')||q.includes('income')){
    return odinCashFlowSummary();
  }

  // Savings
  if(q.includes('saving')||q.includes('fund')||q.includes('vault')||q.includes('emergency')||q.includes('eid')||q.includes('birthday')){
    return odinSavingsSummary();
  }

  // Carpool
  if(q.includes('carpool')||q.includes('trip')||q.includes('pool')||q.includes('passenger')||q.includes('made this')||q.includes('earn')){
    return odinCarpoolSummary();
  }

  // Cars
  if(q.includes('car')||q.includes('service')||q.includes('kia')||q.includes('toyota')||q.includes('hyundai')){
    return odinCarsSummary();
  }

  // Who owes
  if(q.includes('owe')||q.includes('debt')||q.includes('lent')||q.includes('borrow')||q.includes('money')){
    return odinBorrowSummary();
  }

  // WhatsApp
  if(q.includes('whatsapp')||q.includes('message')||q.includes('send')){
    return odinWhatsApp();
  }

  // Summary
  if(q.includes('summary')||q.includes('overview')||q.includes('health')||q.includes('status')||q.includes('how am i')){
    return odinFullSummary();
  }

  // Maintenance
  if(q.includes('maintenance')||q.includes('maint')){
    return odinMaintSummary();
  }

  // Default
  return '<b>🧠 I did not quite catch that.</b><br><br>Try asking:<br>'
    +'<span style="color:#c8f230;">Can I buy shoes for R800?</span><br>'
    +'<span style="color:#c8f230;">What does Lezaun owe me?</span><br>'
    +'<span style="color:#c8f230;">Savings summary</span><br>'
    +'<span style="color:#c8f230;">Cash flow this month</span><br>'
    +'<span style="color:#c8f230;">Carpool this month</span>';
}

function odinAffordability(amount, q){
  var recon={};
  try{ recon=JSON.parse(lsGet('yb_recon_balances_v1')||'{}'); }catch(e){}
  var liquid = Number(recon.fnb||0)+Number(recon.tyme||0);
  var outstanding=0;
  try{ var plans=loadInst?loadInst():[]; plans.forEach(function(p){ if(p.monthToMonth) outstanding+=p.amt||0; }); }catch(e){}
  var available = Math.max(0,liquid-outstanding);
  var canAfford = available>=amount;
  var leftAfter = available-amount;
  var item = q.includes('sneaker')||q.includes('shoe')?'shoes':q.includes('petrol')||q.includes('fuel')||q.includes('gas')?'fuel':'this purchase';
  if(!liquid) return '🧠 No bank balances saved yet.<br>Go to <b>Cash Flow → Account Balances</b> and enter your FNB and TymeBank balances first.';
  var out = '<b>'+(canAfford?'✅ Yes, you can afford it':'❌ Tight — be careful')+'</b><br><br>';
  out += '💳 Available cash: <b>'+fmtR(liquid)+'</b><br>';
  if(outstanding) out += '📋 Commitments: <b>-'+fmtR(outstanding)+'</b><br>';
  out += '🟢 Truly free: <b>'+fmtR(available)+'</b><br><br>';
  out += '🛒 '+item+': <b>-'+fmtR(amount)+'</b><br>';
  out += 'After: <b style="color:'+(leftAfter>=500?'#c8f230':leftAfter>=0?'#f2a830':'#f23060')+';">'+fmtR(leftAfter)+'</b><br><br>';
  if(leftAfter<0) out += '🔴 You would go negative. Rather wait.';
  else if(leftAfter<500) out += '⚠️ Very tight. Make sure no urgent bills coming.';
  else out += '👍 You are in a good position!';
  return out;
}

function odinPersonStatus(name, tag, extKey){
  var out = '<b>'+escHtml(name)+'</b><br><br>';
  if(tag==='carpool'){
    try{
      loadBorrows();
      var entries=(borrowData&&borrowData[name])||[];
      var b=0,r=0;
      entries.forEach(function(e){ if(e.type==='repay') r+=Number(e.amount||0); else b+=Number(e.amount||0); });
      var owed=Math.max(0,b-r);
      out += owed>0?'💸 Owes you: <b style="color:#f2a830;">'+fmtR(owed)+'</b><br>':'✅ Nothing owed — all settled<br>';
      out += 'Lent: '+fmtR(b)+' · Repaid: '+fmtR(r);
    }catch(e){ out += 'Could not load borrow data.'; }
  } else {
    try{
      var extD=loadExternalBorrows();
      var p=extD[extKey];
      if(p){
        var b=0,r=0;
        (p.entries||[]).forEach(function(e){ if(e.type==='repay') r+=Number(e.amount||0); else b+=Number(e.amount||0); });
        var owed=Math.max(0,b-r);
        out += owed>0?'💸 Owes you: <b style="color:#f2a830;">'+fmtR(owed)+'</b><br>':'✅ Fully settled<br>';
        out += 'Lent: '+fmtR(b)+' · Repaid: '+fmtR(r);
      }
    }catch(e){ out += 'Could not load data.'; }
  }
  return out;
}

function odinCashFlowSummary(){
  try{
    var snap=getLendingSnapshot();
    var out='<b>💵 Cash Flow — This Month</b><br><br>';
    out+='📈 Income: <b style="color:#c8f230;">'+fmtR(snap.totalIncome)+'</b><br>';
    out+='Net (real spend): <b style="color:'+(snap.net>=0?'#c8f230':'#f23060')+';">'+fmtR(snap.net)+'</b><br><br>';
    out+=snap.net>=0?'✅ You are ahead this month.':'⚠️ Overspent on real expenses.';
    return out;
  }catch(e){ return '⚠️ Could not load cash flow data.'; }
}

function odinSavingsSummary(){
  var out='<b>💰 Savings Summary</b><br><br>';
  var total=0;
  try{
    (funds||[]).filter(function(f){ return !f.isExpense; }).forEach(function(f){
      var saved=fundTotal(f);
      var pct=f.goal>0?Math.round(saved/f.goal*100):0;
      total+=saved;
      out+=(f.emoji||'💰')+' <b>'+escHtml(f.name)+'</b>: '+fmtR(saved)+' ('+pct+'%)<br>';
    });
  }catch(e){}
  out+='<br>Total saved: <b style="color:#c8f230;">'+fmtR(total)+'</b>';
  return out;
}

function odinCarpoolSummary(){
  var now=new Date();
  var mk=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  var out='<b>🚗 Carpool — This Month</b><br><br>';
  var total=0;
  try{
    var pax=loadPassengers()||[];
    pax.forEach(function(p){
      var monthTotal=0;
      if(cpData&&cpData[mk]){
        Object.values(cpData[mk]).forEach(function(day){ if(day[p.name]) monthTotal+=Number(day[p.name].amt||0); });
      }
      total+=monthTotal;
      out+='👤 '+escHtml(p.name)+': <b>'+fmtR(monthTotal)+'</b><br>';
    });
  }catch(e){}
  out+='<br>Total: <b style="color:#c8f230;">'+fmtR(total)+'</b>';
  return out;
}

function odinCarsSummary(){
  var out='<b>🔧 Cars — Service Status</b><br><br>';
  try{
    loadCarsData().forEach(function(car){
      var svc=calcNextService(car);
      var days=svc.daysUntilNext;
      var status=days===null?'No data set'
        :days<0?'<b style="color:#f23060;">OVERDUE by '+Math.abs(days)+' days</b>'
        :days<=30?'<b style="color:#f23060;">Due in '+days+' days</b>'
        :days<=90?'<b style="color:#f2a830;">Due in '+days+' days</b>'
        :'<b style="color:#c8f230;">Due in '+days+' days</b>';
      out+='🚗 <b>'+escHtml(car.name)+'</b>: '+status+'<br>';
    });
  }catch(e){ out+='Could not load car data.'; }
  return out;
}

function odinBorrowSummary(){
  var out='<b>🤝 Who Owes You</b><br><br>';
  var grand=0;
  try{
    var pax=loadPassengers()||[];
    pax.forEach(function(p){
      loadBorrows();
      var ents=(borrowData&&borrowData[p.name])||[];
      var b=0,r=0; ents.forEach(function(e){ if(e.type==='repay') r+=Number(e.amount||0); else b+=Number(e.amount||0); });
      var owed=Math.max(0,b-r);
      if(owed>0){ out+='👤 '+escHtml(p.name)+': <b style="color:#f2a830;">'+fmtR(owed)+'</b><br>'; grand+=owed; }
    });
    var extD=loadExternalBorrows();
    Object.values(extD).forEach(function(p){
      if(p.archived) return;
      var b=0,r=0; (p.entries||[]).forEach(function(e){ if(e.type==='repay') r+=Number(e.amount||0); else b+=Number(e.amount||0); });
      var owed=Math.max(0,b-r);
      if(owed>0){ out+='👤 '+escHtml(p.name)+' (personal): <b style="color:#f2a830;">'+fmtR(owed)+'</b><br>'; grand+=owed; }
    });
  }catch(e){}
  out+=grand>0?'<br>Total owed to you: <b style="color:#f2a830;">'+fmtR(grand)+'</b>':'Everyone is settled ✅';
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
    out+=short>0?'⚠️ Still <b style="color:#f2a830;">'+fmtR(short)+'</b> short.':'✅ Target met!';
    return out;
  }catch(e){ return 'Could not load maintenance data.'; }
}

function odinWhatsApp(){
  var now=new Date();
  var mk=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  var month=now.toLocaleString('en-ZA',{month:'long',year:'numeric'});
  var msg='Carpool Summary - '+month+'\n\n';
  try{
    var pax=loadPassengers()||[];
    pax.forEach(function(p){
      var monthTotal=0,unpaid=0;
      if(cpData&&cpData[mk]){
        Object.values(cpData[mk]).forEach(function(day){
          if(!day[p.name]) return;
          var amt=Number(day[p.name].amt||0);
          monthTotal+=amt;
          if(!day[p.name].paid) unpaid+=amt;
        });
      }
      if(monthTotal>0){
        msg+=p.name+': R'+monthTotal.toLocaleString('en-ZA');
        if(unpaid>0) msg+=' (R'+unpaid.toLocaleString('en-ZA')+' outstanding)';
        msg+='\n';
      }
    });
  }catch(e){}
  msg+='\nPayment to FNB / TymeBank. Thank you';
  return '<b>📲 WhatsApp Message</b><br><br>'
    +'<div style="background:#0d1a00;border:1px solid #1a3a00;border-radius:8px;padding:12px;font-size:11px;color:#c8f230;white-space:pre-wrap;word-break:break-word;">'+escHtml(msg)+'</div>'
    +'<br><span style="font-size:10px;color:#555;">Copy and paste into WhatsApp</span>';
}

function odinFullSummary(){
  var out='<b>📊 Full Overview</b><br><br>';
  try{ var snap=getLendingSnapshot(); out+='💵 Net cash flow: <b style="color:'+(snap.net>=0?'#c8f230':'#f23060')+';">'+fmtR(snap.net)+'</b><br>'; }catch(e){}
  try{ var recon=JSON.parse(lsGet('yb_recon_balances_v1')||'{}'); var liq=Number(recon.fnb||0)+Number(recon.tyme||0); if(liq) out+='🏦 Liquid cash: <b>'+fmtR(liq)+'</b><br>'; }catch(e){}
  try{ var tot=(funds||[]).filter(function(f){ return !f.isExpense; }).reduce(function(s,f){ return s+fundTotal(f); },0); out+='💰 Total saved: <b style="color:#c8f230;">'+fmtR(tot)+'</b><br>'; }catch(e){}
  try{
    var grand=0;
    var pax=loadPassengers()||[];
    pax.forEach(function(p){ loadBorrows(); var ents=(borrowData&&borrowData[p.name])||[]; var b=0,r=0; ents.forEach(function(e){ if(e.type==='repay') r+=Number(e.amount||0); else b+=Number(e.amount||0); }); grand+=Math.max(0,b-r); });
    var extD=loadExternalBorrows(); Object.values(extD).forEach(function(p){ if(p.archived) return; var b=0,r=0; (p.entries||[]).forEach(function(e){ if(e.type==='repay') r+=Number(e.amount||0); else b+=Number(e.amount||0); }); grand+=Math.max(0,b-r); });
    if(grand>0) out+='🤝 Owed to you: <b style="color:#f2a830;">'+fmtR(grand)+'</b><br>';
  }catch(e){}
  var alerts=buildOdinLaunchAlerts().filter(function(a){ return a.level==='red'; });
  if(alerts.length){ out+='<br>🔴 <b>Urgent:</b><br>'; alerts.forEach(function(a){ out+='• '+escHtml(a.text)+'<br>'; }); }
  return out;
}

// Wire send button
document.addEventListener('DOMContentLoaded', function(){
  var btn = document.getElementById('aiSendBtn');
  if(btn) btn.onclick = function(){
    var val = document.getElementById('aiInput').value.trim();
    if(val) odinChat(val);
  };
  var inp = document.getElementById('aiInput');
  if(inp) inp.addEventListener('keydown', function(e){
    if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); var val=this.value.trim(); if(val) odinChat(val); }
  });
});

// ── External entry points (used by buttons elsewhere in the app) ──────────
// odinChatAsk(question) — open the assistant overlay and submit a pre-filled
// question on behalf of the user. Used by the school empty-state and the
// Odin onboarding alert.
function odinChatAsk(question){
  try {
    if(typeof openAIAssistant === 'function') openAIAssistant();
    setTimeout(function(){ odinChat(question); }, 300);
  } catch(e){ console.warn('odinChatAsk failed:', e); }
}
// Alias kept for callsites that used a different name during initial wiring.
function openOdinChat(question){ odinChatAsk(question); }

// ── School onboarding & quick guidance ───────────────────────────────────
// Walks new users through what the school tab does and how to populate it.
function odinSchoolHelp(q){
  try {
    var setupHint = '';
    if(typeof isSchoolEmpty === 'function' && isSchoolEmpty()){
      setupHint = '<br><br>👋 You haven\'t added anything yet — let\'s start.';
    }

    // If they're asking specifically about results / grades, focus there.
    if(q && (q.indexOf('grade') > -1 || q.indexOf('result') > -1 || q.indexOf('mark') > -1)){
      return '<b>📋 School Results</b>'+setupHint+'<br><br>'
        +'On the <b>School</b> tab you can record your subjects per academic year. For each subject, log:'
        +'<br>• Year mark %'
        +'<br>• Exam mark %'
        +'<br>• Final % and grade (PD / P / S / DS / F)'
        +'<br><br>'
        +'I\'ll calculate your average per year and flag subjects where you\'re slipping. The full editor lives on the <b>School</b> tab — tap the "Results" toggle.';
    }

    // Generic "set up my school tab" walkthrough.
    return '<b>📚 School Tab — Quick Start</b>'+setupHint+'<br><br>'
      +'The School tab tracks two things:'
      +'<br><br>'
      +'<b>1. Calendar events</b> — webinars, assignments, quizzes, exams. I\'ll send you reminders as deadlines approach.'
      +'<br><br>'
      +'<b>2. Results</b> — your year mark, exam mark, and final grade per subject per year.'
      +'<br><br>'
      +'<b>How to add an event:</b><br>'
      +'1. Go to the <b>School</b> tab<br>'
      +'2. Tap <span style="color:#c8f230;">＋ Quick add</span><br>'
      +'3. Pick a type (webinar / assignment / quiz / exam)<br>'
      +'4. Enter the subject, title, date, and optional time<br>'
      +'<br>'
      +'<b>Tip:</b> Add all your assignment due dates first — those are the ones I can warn you about most usefully.'
      +'<br><br>'
      +'Anything specific you want to know? Try: <span style="color:#c8f230;">how do grades work?</span>';
  } catch(e){
    return '🧠 Tap the <b>School</b> tab and use the <b>＋ Quick add</b> button to add your first event. I\'ll handle reminders from there.';
  }
}

// ── First-run wizard ──────────────────────────────────────────────────────
// Triggered after a brand-new user creates their admin account. Opens the
// Odin chat overlay with a personalised welcome and a set of feature buttons.
// Each button leads to a guided walkthrough for that feature.
function startOdinFirstRunWizard(name){
  try {
    if(typeof openAIAssistant === 'function') openAIAssistant();
    setTimeout(function(){
      // Clear any greeting state and post a custom welcome.
      var msgs = document.getElementById('aiMessages');
      var empty = document.getElementById('aiEmptyState');
      if(empty) empty.remove();
      if(msgs) msgs.innerHTML = '';

      var displayName = (name && name.trim()) ? name.trim() : 'there';
      var welcome =
        'Hi ' + escHtml(displayName) + '! 👋<br><br>'
        + 'I\'m <b>Odin</b> — your in-app guide. Welcome to your dashboard.<br><br>'
        + 'This app does a lot of things. To save you scrolling, tell me what brought you here and I\'ll show you exactly how to set that part up first.<br><br>'
        + 'What matters most to you right now?<br><br>'
        + _wizardButtons();

      appendOdinMsg('assistant', welcome);
    }, 350);
  } catch(e){ console.warn('startOdinFirstRunWizard failed:', e); }
}

// HTML for the wizard's feature picker. Each button calls back into Odin
// with the relevant question, which routes through the existing answer
// engine — same code paths as a regular user typing the question.
function _wizardButtons(){
  var btns = [
    { label:'💰 Save money',          q:'How do I set up savings?' },
    { label:'🚗 Carpool earnings',    q:'How do I set up carpool?' },
    { label:'💵 Track cash flow',     q:'How do I set up cash flow?' },
    { label:'📚 School / studies',    q:'How do I set up my school tab?' },
    { label:'🔧 Cars & maintenance',  q:'How do I set up cars?' },
    { label:'🙏 Prayer times',        q:'How do I set up prayer times?' },
    { label:'🤷 Show me everything',  q:'Give me a quick tour of the whole app' }
  ];
  var html = '<div style="display:flex;flex-direction:column;gap:6px;margin-top:6px;">';
  btns.forEach(function(b){
    var qSafe = b.q.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
    html += '<button onclick="aiQuickPrompt(\''+qSafe+'\')" '
      + 'style="text-align:left;background:#0d1228;border:1px solid #2a3a6a;color:#7090f0;'
      + 'font-family:DM Mono,monospace;font-size:11px;letter-spacing:1px;padding:9px 12px;'
      + 'border-radius:6px;cursor:pointer;">'
      + escHtml(b.label) + '</button>';
  });
  html += '</div>';
  return html;
}

// ── Generic feature walkthroughs ──────────────────────────────────────────
// Each walkthrough is short, action-oriented, and ends with a "what's next?"
// hook so the user can keep exploring without leaving the chat.

function odinSavingsHelp(){
  return '<b>💰 Savings Funds</b><br><br>'
    + 'Each fund tracks a goal — Emergency, Vault, Birthday, anything.<br><br>'
    + '<b>To create your first fund:</b><br>'
    + '1. Tap the <b>Savings</b> tab<br>'
    + '2. Tap <span style="color:#c8f230;">＋ New Savings Fund</span><br>'
    + '3. Pick a name, emoji, goal amount, and monthly target<br>'
    + '4. Tap <b>Save</b><br><br>'
    + 'After that, use <b>＋ Deposit</b> to log money in. I\'ll track your progress and warn you when you\'re slipping.<br><br>'
    + 'Want me to explain something else?';
}

function odinCarpoolHelp(){
  return '<b>🚗 Carpool</b><br><br>'
    + 'Track who you drove and how much they owe you per trip.<br><br>'
    + '<b>First, add your passengers:</b><br>'
    + '1. Tap the menu (☰) → <b>Settings</b><br>'
    + '2. Find the <b>Passengers</b> section<br>'
    + '3. Tap <b>+ Add</b> for each person, set their default trip amount<br><br>'
    + '<b>Then log trips on the Carpool tab:</b><br>'
    + '• Tap a cell for a day → pick the trip type (full / half / absent)<br>'
    + '• Mark cells green when paid<br>'
    + '• Use <b>Quick Entry</b> for bulk logging<br><br>'
    + 'When someone pays you, log it via the <b>Borrow → Repay</b> button so it shows up in Cash Flow.';
}

function odinCashflowHelp(){
  return '<b>💵 Cash Flow</b><br><br>'
    + 'See your monthly Income vs Expenses vs Savings, with a Net at the bottom.<br><br>'
    + '<b>How to use it:</b><br>'
    + '1. Tap the <b>Cash Flow</b> tab<br>'
    + '2. Tap <span style="color:#c8f230;">＋ Quick Entry</span> to log income or expenses<br>'
    + '3. Pick a category, amount, date, and which bank account it came from<br>'
    + '4. For things that repeat every month (rent, salary), tick <b>Recurring</b><br><br>'
    + '<b>Bank balances:</b> scroll down on the Cash Flow tab to enter your real FNB / Tymebank balances. They auto-save.<br><br>'
    + 'I\'ll generate a PDF report you can save or share at the end of each month.';
}

function odinCarsHelp(){
  return '<b>🔧 Cars</b><br><br>'
    + 'Tracks each car\'s service intervals, fuel, and maintenance fund spend.<br><br>'
    + '<b>To add your first car:</b><br>'
    + '1. Tap the <b>Cars</b> tab<br>'
    + '2. Tap <span style="color:#c8f230;">＋ Add Car</span><br>'
    + '3. Enter make/model, current km, last service date and km<br>'
    + '4. Set your service interval (e.g. every 15,000 km or 12 months)<br><br>'
    + 'I\'ll warn you when service is due. You can also link a car to your <b>Maintenance Fund</b> so the savings goal lines up with what you\'re actually putting away.';
}

function odinPrayerHelp(){
  return '<b>🙏 Prayer Times</b><br><br>'
    + 'The Prayer card shows today\'s salaah times based on your location, with a tap-to-mark-done flow.<br><br>'
    + '<b>To enable it:</b><br>'
    + '1. Tap the <b>Routine</b> tab (or wherever the Prayer card appears)<br>'
    + '2. The first time you load it, your browser will ask for location permission<br>'
    + '3. Allow it — times are calculated locally, nothing is sent anywhere<br><br>'
    + 'You can adjust the calculation method in settings if your local mosque uses a specific one.';
}

function odinTourHelp(){
  return '<b>🤷 Quick Tour</b><br><br>'
    + 'Here\'s the whole app at a glance:<br><br>'
    + '• <b>💰 Savings</b> — Track multiple savings goals (emergency, vault, gifts).<br>'
    + '• <b>🚗 Carpool</b> — Log who you drove and what they owe.<br>'
    + '• <b>🧠 Odin</b> (this tab) — Your overview and assistant.<br>'
    + '• <b>💵 Cash Flow</b> — Income vs expenses each month.<br>'
    + '• <b>🔧 Cars</b> — Service tracking and maintenance fund.<br>'
    + '• <b>💳 Instalments</b> — Payment plans and due dates.<br>'
    + '• <b>📚 School</b> — Calendar and grades.<br>'
    + '• <b>🔁 Routine</b> — Daily / weekly tasks.<br><br>'
    + 'Tap any tab to explore. Each one has a friendly empty state telling you what to do first. You can always ask me <i>"how do I set up X?"</i> for a walkthrough.<br><br>'
    + '<b>Tip:</b> I\'ll proactively warn you about overdue services, cash deficits, and upcoming deadlines — check the <b>Odin</b> dashboard tab daily.';
}
