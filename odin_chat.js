// Odin Chat — powered by Claude API (claude-sonnet-4-6)
// External API (called from index.html / odin.js / school.js / home.js):
//   openAIAssistant()   closeAIAssistant()   clearAIChat()
//   odinChat(text)      odinChatAsk(text)    appendOdinMsg(role, html)

// ── Conversation history (session-only) ──────────────────────────────────────
var _odinHistory = [];  // [{role:'user'|'assistant', content:'...', html:'...'}]

// -- Save chat history to Firestore --
function _odinSaveHistory(){
  try{
    if(!window._fb || !_fb.db || !_fb.uid) return;
    var toSave = _odinHistory.slice(-20); // last 20 turns only
    _fb.db.collection('users').doc(_fb.uid)
      .collection('odin_chat').doc('history')
      .set({ turns: toSave, updatedAt: new Date().toISOString() })
      .catch(function(e){ console.warn('[Odin] save history failed', e); });
  }catch(e){}
}

// -- Load chat history from Firestore --
function _odinLoadHistory(){
  try{
    if(!window._fb || !_fb.db || !_fb.uid) return;
    _fb.db.collection('users').doc(_fb.uid)
      .collection('odin_chat').doc('history')
      .get().then(function(doc){
        if(!doc.exists) return;
        var data = doc.data();
        if(!data || !data.turns || !data.turns.length) return;
        _odinHistory = data.turns;
        // Render the bubbles
        var msgs = document.getElementById('aiMessages');
        if(!msgs) return;
        var empty = document.getElementById('aiEmptyState');
        if(empty) empty.remove();
        _odinHistory.forEach(function(t){
          appendOdinMsg(t.role, t.html || escHtml(t.content));
        });
      }).catch(function(e){ console.warn('[Odin] load history failed', e); });
  }catch(e){}
}

// ── Open / close / clear ─────────────────────────────────────────────────────
var _odinLoaded = false;
function openAIAssistant(){
  document.getElementById('aiOverlay').classList.add('open');
  setTimeout(function(){ var el=document.getElementById('aiInput'); if(el) el.focus(); }, 300);
  if(!_odinLoaded){ _odinLoaded = true; _odinLoadHistory(); }
}
function closeAIAssistant(){
  document.getElementById('aiOverlay').classList.remove('open');
}
function clearAIChat(){
  _odinHistory = [];
  _odinLoaded = false;
  try{
    if(window._fb && _fb.db && _fb.uid){
      _fb.db.collection('users').doc(_fb.uid)
        .collection('odin_chat').doc('history')
        .delete().catch(function(){});
    }
  }catch(e){}
  var msgs = document.getElementById('aiMessages');
  if(msgs) msgs.innerHTML = '<div class="ai-empty" id="aiEmptyState">'
    +'<div class="ai-empty-icon">🧠</div>'
    +'<div class="ai-empty-title">Ask Odin anything</div>'
    +'<div class="ai-empty-sub">Try: "Can I afford the Kia service right now?"<br>or "What does Lezaun owe me?"<br>or "How is my savings going?"</div>'
    +'</div>';
}

// ── Message bubble render ─────────────────────────────────────────────────────
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
  bubble.style.cssText = 'max-width:82%;padding:10px 14px;border-radius:'
    +(role==='user'?'12px 2px 12px 12px;background:#1a2e00;border:1px solid #2a4a00;color:#c8f230;'
                  :'12px 12px 12px 2px;background:#111;border:1px solid #2a2a2a;color:#efefef;')
    +'font-size:12px;line-height:1.6;word-break:break-word;white-space:normal;overflow-wrap:break-word;font-family:"DM Mono",monospace;';
  bubble.innerHTML = html;

  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  msgs.appendChild(wrap);
  msgs.scrollTop = msgs.scrollHeight;
}

function escHtml(str){
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Build live data snapshot for system prompt ────────────────────────────────
function _odinBuildContext(){
  var ctx = [];
  var today = new Date().toISOString().split('T')[0];
  ctx.push('Today: '+today);
  ctx.push('User: Yasin Badaron (admin)');

  // ── POCKETS / SAVINGS ──
  try{
    var funds = JSON.parse(lsGet('yasin_funds_v16')||'[]');
    if(funds.length){
      ctx.push('\n--- POCKETS / SAVINGS ---');
      funds.forEach(function(f){
        var bal = (f.deposits||[]).reduce(function(s,d){
          if(f.isExpense) return d.txnType==='in' ? s+d.amount : s-d.amount;
          return d.txnType==='out' ? s-d.amount : s+d.amount;
        },0);
        ctx.push(f.emoji+' '+f.name+': R'+bal.toFixed(2)
          +(f.goal?' (goal R'+f.goal+')':'')
          +(f.isExpense?' [expense fund]':'')
          +(f.weekly&&!f.isExpense?' saving R'+f.weekly+(f.targetType==='monthly'?'/mo':'/wk'):''));
        // last 5 transactions
        var recent=(f.deposits||[]).slice(-5);
        recent.forEach(function(d){
          var sign=f.isExpense?(d.txnType==='out'?'-':'+'):'+';
          ctx.push('  '+d.date+' '+sign+'R'+d.amount+(d.note?' ('+d.note+')':''));
        });
      });
    }
  }catch(e){}

  // ── BANK BASELINES ──
  try{
    var recon = JSON.parse(lsGet('yb_recon_balances_v1')||'{}');
    ctx.push('\n--- BANK BASELINES (pocket-first model — normally R0) ---');
    ctx.push('FNB: R'+(recon.fnb||0)+', TymeBank: R'+(recon.tyme||0)+', Cash: R'+(recon.cash||0));
    ctx.push('Pockets = source of truth. Banks = doorways only.');
  }catch(e){}

  // ── CASH FLOW ──
  try{
    var cfData = JSON.parse(lsGet('yb_cashflow_v1')||'{}');
    var cfKeys = Object.keys(cfData).sort();
    if(cfKeys.length){
      ctx.push('\n--- CASH FLOW (monthly breakdown) ---');
      cfKeys.forEach(function(mk){
        var mo = cfData[mk];
        var inc = (mo.income||[]).reduce(function(s,e){return s+(e.amount||0);},0);
        var exp = (mo.expenses||[]).reduce(function(s,e){return s+(e.amount||0);},0);
        var net = inc - exp;
        ctx.push(mk+': income R'+inc.toFixed(2)+', expenses R'+exp.toFixed(2)+', net '+(net>=0?'+':'')+net.toFixed(2));
        // Show income entries
        (mo.income||[]).forEach(function(e){
          ctx.push('  +R'+e.amount+' '+e.label+' '+e.date+(e.account?' ['+e.account+']':''));
        });
        // Show expense entries (non-savings-allocation)
        (mo.expenses||[]).forEach(function(e){
          ctx.push('  -R'+e.amount+' '+e.label+' '+e.date+(e.account?' ['+e.account+']':''));
        });
      });
    }
  }catch(e){}

  // ── CARPOOL ──
  try{
    var cpData = JSON.parse(lsGet('yasin_carpool_v4')||'{}');
    var grandTotal=0, unpaid=0;
    var paxTotals={};
    var pax = (typeof loadPassengers==='function'&&loadPassengers()) ? loadPassengers().map(function(p){return p.name;}) : ['David','Lezaun','Shireen'];
    Object.values(cpData).forEach(function(month){
      Object.values(month).forEach(function(day){
        if(typeof day!=='object') return;
        pax.forEach(function(p){
          if(!day[p]||typeof day[p]!=='object') return;
          var amt=day[p].amt||0, paid=day[p].paid||false;
          grandTotal+=amt;
          if(!paid&&amt>0) unpaid+=amt;
          if(!paxTotals[p]) paxTotals[p]={total:0,owing:0};
          paxTotals[p].total+=amt;
          if(!paid&&amt>0) paxTotals[p].owing+=amt;
        });
      });
    });
    ctx.push('\n--- CARPOOL ---');
    ctx.push('All time earned: R'+grandTotal.toFixed(2)+', Outstanding: R'+unpaid.toFixed(2));
    Object.keys(paxTotals).forEach(function(p){
      ctx.push(p+': total R'+paxTotals[p].total.toFixed(2)+', currently owes R'+paxTotals[p].owing.toFixed(2));
    });
  }catch(e){}

  // ── MONEY OWED (BORROWED) ──
  try{
    var borrows = JSON.parse(lsGet('yb_borrow_data_v1')||'[]');
    var active = borrows.filter(function(b){return !b.paid;});
    ctx.push('\n--- MONEY OWED ---');
    if(!active.length){ ctx.push('No active loans.'); }
    else{ active.forEach(function(b){
      var repaid=(b.entries||[]).filter(function(e){return e.type==='repay';}).reduce(function(s,e){return s+e.amount;},0);
      ctx.push(b.name+' owes R'+((b.amount||0)-repaid).toFixed(2)+' (lent R'+(b.amount||0)+', repaid R'+repaid.toFixed(2)+')'+(b.reason?' for '+b.reason:''));
    });}
  }catch(e){}

  // ── INSTALMENTS ──
  try{
    var inst = JSON.parse(lsGet('yb_instalments_v1')||'[]');
    if(inst.length){
      ctx.push('\n--- INSTALMENTS ---');
      inst.forEach(function(p){
        var paidMo=(p.paid||[]).length, total=p.months||0;
        var remaining=total-paidMo;
        ctx.push(p.name+': R'+p.amt+(p.serviceFee?'+R'+p.serviceFee+' fee':'')+'/month'
          +', debit day '+p.debitDay
          +', '+paidMo+'/'+total+' paid, '+remaining+' months remaining'
          +(p.fundingPocketId?' funded from pocket '+p.fundingPocketId:''));
      });
    }
  }catch(e){}

  // ── CARS ──
  try{
    var cars = JSON.parse(lsGet('yasin_cars_v1')||'[]');
    if(cars.length){
      ctx.push('\n--- CARS ---');
      cars.forEach(function(c){
        var openAdv=(c.advisories||[]).filter(function(a){return a.status==='open';});
        var nextServiceKm = (c.lastServiceKm&&c.serviceKm) ? (Number(c.lastServiceKm)+Number(c.serviceKm)) : null;
        var kmToService = (nextServiceKm&&c.km) ? nextServiceKm-Number(c.km) : null;
        ctx.push((c.name||'Car')+' ('+c.plate+')'
          +': '+c.km+'km'
          +(c.lastServiceDate?' | last service '+c.lastServiceDate+' at '+c.lastServiceKm+'km':'')
          +(c.lastServiceType?' ('+c.lastServiceType+')':'')
          +(c.serviceKm?' | interval '+c.serviceKm+'km':'')
          +(kmToService!=null?' | '+kmToService+'km until next service':'')
          +(c.nextService?' | next service due '+c.nextService:''));
        if(openAdv.length){
          ctx.push('  Open advisories:');
          openAdv.forEach(function(a){
            ctx.push('  - ['+a.severity.toUpperCase()+'] '+a.text
              +(a.source?' ('+a.source+')':'')
              +(a.bookedFor?' — booked for '+a.bookedFor:''));
          });
        }
        var expenses=(c.expenses||[]).slice(-10);
        if(expenses.length){
          ctx.push('  Recent expenses:');
          expenses.forEach(function(e){
            // field names: desc (not description), amt (not amount)
            ctx.push('  - '+(e.date||'?')+' R'+(e.amt||e.amount||0)+' '+(e.desc||e.description||e.category||''));
          });
        }
      });
    }
  }catch(e){}

  // ── ODIN ALERTS (service reminders, upcoming debits etc) ──
  try{
    if(typeof buildOdinLaunchAlerts === 'function'){
      var alerts = buildOdinLaunchAlerts();
      if(alerts && alerts.length){
        ctx.push('\n--- ACTIVE ODIN ALERTS ---');
        alerts.forEach(function(a){ ctx.push('['+a.level.toUpperCase()+'] '+a.text); });
      }
    }
  }catch(e){}

  // ── SCHOOL ──
  try{
    var subjects = JSON.parse(lsGet('yasin_school_results_v2')||'[]');
    if(subjects.length){
      ctx.push('\n--- SCHOOL (BCom General, final year 2026) ---');
      var byYear={};
      subjects.forEach(function(s){
        var y=s.year||'Unknown';
        if(!byYear[y]) byYear[y]=[];
        var final=s.examPct!=null&&s.yearPct!=null?Math.round(s.yearPct*0.4+s.examPct*0.6):null;
        byYear[y].push(s.code+' '+s.name+': '+s.result+(final!=null?' ('+final+'%)':'')+(s.examDate?' — exam '+s.examDate:'')+(s.isPlaceholder?' [placeholder]':''));
      });
      Object.keys(byYear).sort().forEach(function(y){
        ctx.push('Year '+y+':');
        byYear[y].forEach(function(line){ ctx.push('  '+line); });
      });
    }
  }catch(e){}

  // -- SCHOOL EVENTS / SCHEDULE --
  try{
    var schoolEvents = JSON.parse(lsGet('yasin_school_events_v1')||'[]');
    var schoolDone = JSON.parse(lsGet('yasin_school_done_v1')||'[]');
    var today2 = new Date(); today2.setHours(0,0,0,0);
    var upcoming = schoolEvents.filter(function(ev){
      if(!ev.date) return false;
      var d = new Date(ev.date+'T00:00:00');
      return d >= today2;
    }).sort(function(a,b){ return a.date.localeCompare(b.date); });
    if(upcoming.length){
      ctx.push('\n--- SCHOOL SCHEDULE (upcoming events) ---');
      upcoming.forEach(function(ev){
        var done = schoolDone.indexOf(ev.id) > -1;
        var doneStr = done ? ' [DONE]' : '';
        var timeStr = ev.time ? ' at '+ev.time : '';
        var subj = ev.subject || ev.subjects || '';
        var label = ev.title || ev.type || 'Event';
        ctx.push((ev.type||'event').toUpperCase()+': '+label+' - '+subj+' - '+ev.date+timeStr+doneStr);
      });
    }
  }catch(e){}

  // ── PRAYER ──
  try{
    var prayer = JSON.parse(lsGet('yb_prayer_v1')||'{}');
    var streak = prayer.streak||0;
    var best = prayer.bestStreak||0;
    ctx.push('\n--- PRAYER ---');
    ctx.push('Current streak: '+streak+' days, best: '+best+' days');
  }catch(e){}

  // ── ROUTINE ──
  try{
    var tasks = JSON.parse(lsGet('yb_routine_v1')||'[]');
    if(tasks.length){
      ctx.push('\n--- ROUTINE TASKS ---');
      tasks.forEach(function(t){
        var due = t.lastDone ? 'last done '+t.lastDone : 'never done';
        ctx.push(t.name+' ('+t.frequency+'): '+due+(t.cost?' R'+t.cost+' each':''));
      });
    }
  }catch(e){}

  return ctx.join('\n');
}

// ── Cloudflare Worker proxy URL (replaces direct Anthropic call to avoid CORS)
// After deploying cf-worker.js to Cloudflare, paste your worker URL here:
var ODIN_PROXY_URL = 'https://wispy-thunder-bc04.yasin-badaron90.workers.dev';

// ── Main chat handler ─────────────────────────────────────────────────────────
function odinChat(text){
  if(!text || !text.trim()) return;
  var input = document.getElementById('aiInput');
  if(input) input.value = '';

  // Check API key
  var apiKey = (typeof bfGetApiKey === 'function') ? bfGetApiKey() : lsGet('yb_bf_api_key_v1')||'';
  if(!apiKey){
    appendOdinMsg('user', escHtml(text));
    appendOdinMsg('assistant', '🔑 No API key set.<br><br>Go to <b>Settings → Bank Feed AI Key</b> and paste your Anthropic API key. Get one free at <a href="https://console.anthropic.com" target="_blank" style="color:#c8f230;">console.anthropic.com</a><br><br>Also make sure the Cloudflare Worker is deployed and <b>ODIN_PROXY_URL</b> is set in odin_chat.js.');
    return;
  }
  if(!ODIN_PROXY_URL || ODIN_PROXY_URL.includes('YOUR-WORKER')){
    appendOdinMsg('user', escHtml(text));
    appendOdinMsg('assistant', '⚙️ Proxy not configured yet.<br><br>Deploy <b>cf-worker.js</b> to Cloudflare Workers, then paste your worker URL into <b>ODIN_PROXY_URL</b> in odin_chat.js.');
    return;
  }

  appendOdinMsg('user', escHtml(text));
  _odinHistory.push({role:'user', content:text});

  // Thinking indicator
  var msgs = document.getElementById('aiMessages');
  var thinkId = 'odin_think_'+Date.now();
  var thinkWrap = document.createElement('div');
  thinkWrap.id = thinkId;
  thinkWrap.style.cssText = 'display:flex;gap:8px;margin-bottom:12px;align-items:flex-start;';
  thinkWrap.innerHTML = '<div style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;background:#111;border:1px solid #2a2a2a;">🧠</div>'
    +'<div style="padding:10px 14px;border-radius:12px 12px 12px 2px;background:#111;border:1px solid #2a2a2a;color:#5a8800;font-size:12px;font-family:DM Mono,monospace;">thinking...</div>';
  if(msgs){ msgs.appendChild(thinkWrap); msgs.scrollTop = msgs.scrollHeight; }

  var systemPrompt = 'You are Odin, a sharp and direct personal finance assistant built into Yasin\'s dashboard app (My Dashboard V34). '
    +'You have full access to Yasin\'s live financial data shown below. '
    +'Be concise — this is a mobile app. Use short paragraphs. Use bold for key numbers. '
    +'Never pad responses. If you don\'t know something, say so. '
    +'Speak in Yasin\'s voice — direct, no waffle. Use R for South African Rand. '
    +'If Yasin asks about affordability, use pocket balances (not bank baselines which are normally R0). '
    +'The pocket-first model means money lives in pockets; banks are just doorways.\n\n'
    +'CAR OWNERSHIP (important context):\n'
    +'- Toyota Corolla CAA 643-241 = YASIN\'S car (his daily driver), funded from Ee90 pocket\n'
    +'- Kia Picanto CAA 189-565 = NURJAHAN\'S car (Yasin\'s wife), also funded from Ee90 pocket\n'
    +'- Hyundai Getz CAA 353-290 = MOTHER-IN-LAW\'S car, Nurjahan pays for it, record-only in app (no pocket deduction ever)\n'
    +'- Ee90 _KiA picaNto pocket = funds both Yasin\'s Toyota AND Nurjahan\'s Kia (the pocket name is misleading — ignore it)\n\n'
    +'LIVE DATA:\n'+_odinBuildContext();

  var messages = _odinHistory.slice(); // include current user message

  fetch(ODIN_PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages
    })
  }).then(function(res){ return res.json(); }).then(function(data){
    var el = document.getElementById(thinkId);
    if(el) el.remove();

    if(data.error){
      appendOdinMsg('assistant', '❌ API error: '+escHtml(data.error.message||JSON.stringify(data.error)));
      _odinHistory.pop(); // remove the failed user message
      return;
    }

    var reply = '';
    if(data.content && data.content.length){
      reply = data.content.filter(function(b){return b.type==='text';}).map(function(b){return b.text;}).join('');
    }
    if(!reply) reply = '🧠 No response received.';

    // Convert markdown-ish to simple HTML
    var html = reply
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/\*\*(.+?)\*\*/g,'<b>$1</b>')
      .replace(/\n/g,'<br>');

    appendOdinMsg('assistant', html);
    // Store html on the user message too (already pushed without html)
    if(_odinHistory.length > 0 && _odinHistory[_odinHistory.length-1].role === 'user'){
      _odinHistory[_odinHistory.length-1].html = escHtml(_odinHistory[_odinHistory.length-1].content);
    }
    _odinHistory.push({role:'assistant', content:reply, html:html});

    // Keep history at max 20 turns (40 entries) to avoid token bloat
    if(_odinHistory.length > 40) _odinHistory = _odinHistory.slice(-40);

    // Save to Firestore
    _odinSaveHistory();

  }).catch(function(err){
    var el = document.getElementById(thinkId);
    if(el) el.remove();
    appendOdinMsg('assistant', '❌ Network error: '+escHtml(String(err))+'<br><br>Check your connection and try again.');
    _odinHistory.pop();
  });
}

// ── Called from school.js / odin.js to pre-fill and send a question ──────────
function odinChatAsk(question){
  openAIAssistant();
  setTimeout(function(){ odinChat(question); }, 350);
}
