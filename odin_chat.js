// Odin Chat — powered by Claude API (claude-sonnet-4-6)
// External API (called from index.html / odin.js / school.js / home.js):
//   openAIAssistant()   closeAIAssistant()   clearAIChat()
//   odinChat(text)      odinChatAsk(text)    appendOdinMsg(role, html)

// ── Conversation history (session-only) ──────────────────────────────────────
var _odinHistory = [];  // [{role:'user'|'assistant', content:'...', html:'...', turnId:'...'}]
var _odinTurnSeq = 0;  // monotonic counter — gives each live assistant turn a unique ID

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
        // Render the bubbles — replayed history does NOT get feedback buttons
        var msgs = document.getElementById('aiMessages');
        if(!msgs) return;
        var empty = document.getElementById('aiEmptyState');
        if(empty) empty.remove();
        _odinHistory.forEach(function(t){
          appendOdinMsg(t.role, t.html || escHtml(t.content), false, null);
        });
      }).catch(function(e){ console.warn('[Odin] load history failed', e); });
  }catch(e){}
}

// -- Save 👍/👎 feedback to Firestore — never wiped by CLEAR, separate collection --
function _odinSaveFeedback(turnId, userMsg, odinReply, rating, correction){
  try{
    if(!window._fb || !_fb.db || !_fb.uid) return;
    var record = {
      ts:         new Date().toISOString(),
      turnId:     turnId,
      userMsg:    userMsg   || '',
      odinReply:  odinReply || '',
      rating:     rating,             // 'good' | 'bad'
      correction: correction || null
    };
    _fb.db.collection('users').doc(_fb.uid)
      .collection('odin_feedback').add(record)
      .catch(function(e){ console.warn('[Odin] feedback save failed', e); });
  }catch(e){}
}

// Helper: find the user message that preceded a given assistant turnId
function _odinGetLastUserMsg(turnId){
  for(var i = _odinHistory.length - 1; i >= 0; i--){
    if(_odinHistory[i].role === 'assistant' && _odinHistory[i].turnId === turnId){
      // The user message is the one before it
      if(i > 0 && _odinHistory[i-1].role === 'user'){
        return _odinHistory[i-1].content || '';
      }
    }
  }
  return '';
}

// Helper: find the assistant reply for a given turnId
function _odinGetReplyByTurnId(turnId){
  for(var i = 0; i < _odinHistory.length; i++){
    if(_odinHistory[i].role === 'assistant' && _odinHistory[i].turnId === turnId){
      return _odinHistory[i].content || '';
    }
  }
  return '';
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
  _odinTurnSeq = 0;
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
// showFeedback = true only for NEW live assistant replies, not replayed history
function appendOdinMsg(role, html, showFeedback, turnId){
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

  // Column wrapper so we can stack bubble + feedback row vertically
  var col = document.createElement('div');
  col.style.cssText = 'display:flex;flex-direction:column;align-items:'
    +(role==='user'?'flex-end':'flex-start')+';flex:1;min-width:0;';
  col.appendChild(bubble);

  // 👍/👎 row — only on live assistant replies in the current session
  if(role === 'assistant' && showFeedback && turnId){
    var fbRow = document.createElement('div');
    fbRow.id = 'fb-'+turnId;
    fbRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:4px;padding-left:2px;flex-wrap:wrap;';

    var btnUp = document.createElement('button');
    btnUp.textContent = '👍';
    btnUp.title = 'Good answer';
    btnUp.style.cssText = 'background:none;border:1px solid #2a2a2a;border-radius:4px;padding:2px 8px;font-size:12px;cursor:pointer;color:#555;transition:all .15s;';

    var btnDown = document.createElement('button');
    btnDown.textContent = '👎';
    btnDown.title = 'Wrong or misleading';
    btnDown.style.cssText = 'background:none;border:1px solid #2a2a2a;border-radius:4px;padding:2px 8px;font-size:12px;cursor:pointer;color:#555;transition:all .15s;';

    btnUp.onclick = function(){
      if(btnUp.dataset.rated) return;
      btnUp.dataset.rated = '1';
      btnUp.style.cssText  = 'background:#0d1a00;border:1px solid #5a8800;border-radius:4px;padding:2px 8px;font-size:12px;cursor:default;color:#c8f230;';
      btnDown.style.display = 'none';
      _odinSaveFeedback(turnId, _odinGetLastUserMsg(turnId), _odinGetReplyByTurnId(turnId), 'good', null);
    };

    btnDown.onclick = function(){
      if(btnDown.dataset.rated) return;
      btnDown.dataset.rated = '1';
      btnDown.style.cssText = 'background:#1a0000;border:1px solid #f23060;border-radius:4px;padding:2px 8px;font-size:12px;cursor:default;color:#f23060;';
      btnUp.style.display = 'none';
      // Show inline correction input
      var corrRow = document.createElement('div');
      corrRow.style.cssText = 'display:flex;gap:6px;margin-top:5px;align-items:center;width:100%;';
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.placeholder = 'What was wrong? (optional)';
      inp.style.cssText = 'flex:1;background:#1a0000;border:1px solid #5a1010;border-radius:4px;padding:5px 8px;'
        +'font-family:"DM Mono",monospace;font-size:11px;color:#efefef;outline:none;min-width:0;';
      var sendBtn = document.createElement('button');
      sendBtn.textContent = 'Send';
      sendBtn.style.cssText = 'background:#2e0000;border:1px solid #f23060;border-radius:4px;'
        +'padding:5px 10px;font-family:"DM Mono",monospace;font-size:10px;color:#f23060;cursor:pointer;white-space:nowrap;';
      sendBtn.onclick = function(){
        var corr = inp.value.trim() || null;
        _odinSaveFeedback(turnId, _odinGetLastUserMsg(turnId), _odinGetReplyByTurnId(turnId), 'bad', corr);
        corrRow.innerHTML = '<span style="font-size:10px;color:#f23060;letter-spacing:1px;">✓ Flagged — thanks</span>';
      };
      inp.onkeydown = function(e){ if(e.key==='Enter') sendBtn.click(); };
      corrRow.appendChild(inp);
      corrRow.appendChild(sendBtn);
      fbRow.appendChild(corrRow);
      setTimeout(function(){ inp.focus(); }, 50);
    };

    fbRow.appendChild(btnUp);
    fbRow.appendChild(btnDown);
    col.appendChild(fbRow);
  }

  wrap.appendChild(avatar);
  wrap.appendChild(col);
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
          if(!paxTotals[p]) paxTotals[p]={total:0,paid:0,owing:0};
          paxTotals[p].total+=amt;
          if(paid) paxTotals[p].paid+=amt;
          else if(amt>0){ paxTotals[p].owing+=amt; unpaid+=amt; }
        });
      });
    });
    ctx.push('\n--- CARPOOL ---');
    ctx.push('Grand total all time: R'+grandTotal+', Outstanding: R'+unpaid);
    pax.forEach(function(p){
      var t=paxTotals[p]||{total:0,paid:0,owing:0};
      ctx.push(p+': total R'+t.total+', paid R'+t.paid+', OWES R'+t.owing);
    });
    // Individual trip detail — last 2 months
    var monthKeys = Object.keys(cpData).sort().slice(-2);
    monthKeys.forEach(function(mk){
      var month = cpData[mk];
      Object.keys(month).sort().forEach(function(ds){
        var day = month[ds];
        if(typeof day !== 'object') return;
        pax.forEach(function(p){
          if(!day[p]||typeof day[p]!=='object') return;
          var amt=day[p].amt||0, paid=day[p].paid||false;
          if(amt > 0) ctx.push('Trip '+ds+' '+p+': R'+amt+(paid?' PAID':' UNPAID')+(day.notes?' ('+day.notes+')':''));
        });
      });
    });
  }catch(e){}

  // ── MONEY OWED ──
  try{
    // yasin_borrows_v1 is stored as {passengerName: [entries]} object
    var borrowsRaw = JSON.parse(lsGet('yasin_borrows_v1')||'{}');
    var extBorrows = JSON.parse(lsGet('yb_external_borrows_v1')||'[]');
    // Flatten the object into a single array
    var carpoolBorrows = [];
    Object.keys(borrowsRaw).forEach(function(p){
      (borrowsRaw[p]||[]).forEach(function(b){ carpoolBorrows.push(Object.assign({passenger:p},b)); });
    });
    var allBorrows = carpoolBorrows.concat(extBorrows);
    if(allBorrows.length){
      ctx.push('\n--- MONEY OWED TO YOU ---');
      allBorrows.forEach(function(b){
        var repaid = (b.repayments||[]).reduce(function(s,r){return s+(r.amount||0);},0);
        var owing  = (b.amount||0) - repaid;
        if(!b.paid && owing > 0){
          ctx.push(b.passenger+' owes R'+owing+' (lent R'+b.amount+' on '+b.date+', repaid R'+repaid+'): '+(b.note||''));
        }
      });
    }
  }catch(e){}

  // ── INSTALMENTS ──
  try{
    var instData = JSON.parse(lsGet('yasin_instalments_v1')||'[]');
    if(instData.length){
      ctx.push('\n--- INSTALMENTS ---');
      instData.forEach(function(p){
        var paidCount = (p.paid||[]).length;
        var totalMonths = p.months||0;
        ctx.push(p.desc+' ('+p.provider+'): R'+p.amt+'/mo, '+paidCount+'/'+totalMonths+' paid, debit day '+p.debitDay+(p.settled?' [SETTLED]':''));
      });
    }
  }catch(e){}

  // ── CARS ──
  try{
    var cars = JSON.parse(lsGet('yasin_cars_v1')||'[]');
    if(cars.length){
      ctx.push('\n--- CARS ---');
      cars.forEach(function(c){
        var spent = (c.expenses||[]).reduce(function(s,e){return s+(e.amt||0);},0);
        var advOpen = (c.advisories||[]).filter(function(a){return a.status==='open';}).length;
        ctx.push(c.name+(c.plate?' ('+c.plate+')':'')+': '+(c.kilometers||c.km||'unknown')+'km, last svc '+c.lastServiceDate+', total spent R'+spent+(advOpen?' ⚠️ '+advOpen+' open advisory':''));
        // Individual expense entries (same as what Reports tab shows)
        var recentExp = (c.expenses||[]).slice().sort(function(a,b){return (b.date||'').localeCompare(a.date||'');}).slice(0,20);
        recentExp.forEach(function(e){
          ctx.push('  car expense '+e.date+': R'+(e.amt||0)+' — '+(e.desc||'no description'));
        });
        (c.advisories||[]).filter(function(a){return a.status==='open';}).forEach(function(a){
          ctx.push('  advisory ['+a.severity+']: '+a.text);
        });
      });
    }
  }catch(e){}


  // ── DRIVER'S LICENCES ──
  try{
    var drivers = JSON.parse(lsGet('yasin_drivers_v1')||'[]');
    if(drivers.length){
      ctx.push('\n--- DRIVER\'S LICENCES ---');
      var today4 = new Date().toISOString().split('T')[0];
      drivers.forEach(function(d){
        var daysLeft = d.expiry ? Math.round((new Date(d.expiry)-new Date(today4))/(1000*60*60*24)) : null;
        ctx.push(d.name+(d.idNumber?' (ID: '+d.idNumber+')':'')+': expires '+d.expiry+(daysLeft!=null?' ('+daysLeft+' days)':''));
      });
    }
  }catch(e){}

  // ── PASSENGERS ──
  try{
    var passengerData = JSON.parse(lsGet('yb_passengers_v1')||'[]');
    var activePass = passengerData.filter(function(p){ return !p._deleted; });
    if(activePass.length){
      ctx.push('\n--- CARPOOL PASSENGERS ---');
      activePass.forEach(function(p){ ctx.push(p.name); });
    }
  }catch(e){}

  // ── ODIN ALERTS ──
  try{
    if(typeof buildOdinLaunchAlerts === 'function'){
      var alerts = buildOdinLaunchAlerts();
      if(alerts && alerts.length){
        ctx.push('\n--- ACTIVE ODIN ALERTS ---');
        alerts.forEach(function(a){
          var clean = (a.text||a.msg||'').replace(/<[^>]+>/g,'');
          ctx.push('['+a.level.toUpperCase()+'] '+a.icon+' '+clean);
        });
      }
    }
  }catch(e){}

  // ── SCHOOL ──
  try{
    var subjects = JSON.parse(lsGet('yb_school_results_v2')||'{}');
    var subArr = Object.values(subjects);
    if(subArr.length){
      ctx.push('\n--- SCHOOL SUBJECTS ---');
      subArr.forEach(function(s){
        var final = s.result || (s.exam != null && s.yearPct != null
          ? Math.round(s.yearPct*0.4 + s.exam*0.6)+'%' : 'in progress');
        ctx.push(s.code+' '+s.name+' (Year '+s.year+'): '+final+(s.examDate?' exam '+s.examDate:''));
      });
    }
    // School events
    var events = JSON.parse(lsGet('yasin_school_events_v1')||'[]');
    var today2 = new Date().toISOString().split('T')[0];
    var upcoming = events.filter(function(e){ return e.date >= today2; })
      .sort(function(a,b){ return a.date.localeCompare(b.date); }).slice(0,8);
    if(upcoming.length){
      ctx.push('\n--- UPCOMING SCHOOL EVENTS ---');
      upcoming.forEach(function(e){
        ctx.push(e.date+(e.time?' '+e.time:'')+' — '+e.title+(e.subject?' ('+e.subject+')':''));
      });
    }
  }catch(e){}

  // ── PRAYER ──
  try{
    var prayData = JSON.parse(lsGet('yasin_prayer_v1')||'{}');
    if(prayData.streak != null){
      ctx.push('\n--- PRAYER ---');
      ctx.push('Current streak: '+prayData.streak+' days');
    }
  }catch(e){}

  // ── ROUTINE ──
  try{
    var routTasks = JSON.parse(lsGet('yb_routine_v1')||'[]');
    if(routTasks.length){
      ctx.push('\n--- ROUTINE TASKS ---');
      routTasks.forEach(function(t){
        ctx.push(t.name+': last done '+(t.lastDone||'never')+(t.cost?' costs R'+t.cost:''));
      });
    }
  }catch(e){}

  // ── SPEND CATEGORIES ──
  try{
    var spends = JSON.parse(lsGet('yb_spend_v1')||'[]');
    if(spends.length){
      var nowD  = new Date();
      var thisMk = nowD.toISOString().slice(0,7);
      var prevD  = new Date(nowD.getFullYear(), nowD.getMonth()-1, 1);
      var prevMk = prevD.toISOString().slice(0,7);
      var catIds = ['Food','Fuel','Kids','Car','Personal','Home','School','Social','Other'];
      var thisCats = {}, prevCats = {}, thisUntagged=0, prevUntagged=0;
      catIds.forEach(function(c){ thisCats[c]=0; prevCats[c]=0; });
      spends.forEach(function(s){
        var mk = (s.date||'').slice(0,7);
        if(mk === thisMk){
          if(s.category && thisCats[s.category]!=null) thisCats[s.category]+=(s.amount||0);
          else thisUntagged+=(s.amount||0);
        } else if(mk === prevMk){
          if(s.category && prevCats[s.category]!=null) prevCats[s.category]+=(s.amount||0);
          else prevUntagged+=(s.amount||0);
        }
      });
      ctx.push('\n--- SPEND BY CATEGORY ---');
      ctx.push('This month ('+thisMk+') vs last ('+prevMk+'):');
      catIds.forEach(function(c){
        var cur=thisCats[c], prev=prevCats[c];
        if(cur===0 && prev===0) return;
        var chg = prev>0 ? Math.round((cur-prev)/prev*100) : null;
        ctx.push('  '+c+': R'+cur.toFixed(2)+(prev>0?' (prev R'+prev.toFixed(2)+', '+(chg>=0?'+':'')+chg+'%)':''));
      });
      if(thisUntagged>0) ctx.push('  Untagged: R'+thisUntagged.toFixed(2));
    }
  }catch(e){}

  // ── LENDS (new pocket-first records) ──
  try{
    var lends = JSON.parse(lsGet('yb_lends_v1')||'[]');
    if(lends.length){
      ctx.push('\n--- LEND RECORDS (yb_lends_v1) ---');
      lends.forEach(function(l){
        ctx.push(l.passenger+' lent R'+l.amount+' on '+l.date+(l.note?' ('+l.note+')':'')+(l.originPocket?' from pocket '+l.originPocket:'')+' [lendId:'+l.id+']');
      });
    }
  }catch(e){}

  // ── REPAYMENTS ──
  try{
    var repays = JSON.parse(lsGet('yb_repayments_v1')||'[]');
    if(repays.length){
      ctx.push('\n--- REPAYMENT RECORDS ---');
      repays.forEach(function(r){
        ctx.push(r.passenger+' repaid R'+r.amount+' on '+r.date+(r.bank?' via '+r.bank:'')+' into pocket '+r.pocketId);
      });
    }
  }catch(e){}

  // ── POCKET-TO-POCKET MOVES ──
  try{
    var moves = JSON.parse(lsGet('yb_moves_v1')||'[]');
    if(moves.length){
      ctx.push('\n--- POCKET MOVES ---');
      moves.slice().sort(function(a,b){return (b.date||'').localeCompare(a.date||'');}).slice(0,20).forEach(function(m){
        ctx.push(m.date+': R'+m.amount+' moved from pocket '+m.fromPocketId+' → '+m.toPocketId+(m.note?' ('+m.note+')':''));
      });
    }
  }catch(e){}

  // ── CARPOOL PAYMENT RECORDS ──
  try{
    var cpPmts = JSON.parse(lsGet('yb_carpool_payments_v1')||'[]');
    if(cpPmts.length){
      ctx.push('\n--- CARPOOL PAYMENT RECORDS ---');
      cpPmts.slice().sort(function(a,b){return (b.date||'').localeCompare(a.date||'');}).slice(0,20).forEach(function(p){
        ctx.push(p.date+': '+p.passenger+' paid R'+p.amount+(p.bank?' via '+p.bank:'')+' [id:'+p.id+']');
      });
    }
  }catch(e){}

  // ── PRIORITY RULES ──
  try{
    var prules = JSON.parse(lsGet('yb_priority_rules_v1')||'null');
    if(prules && prules.length){
      ctx.push('\n--- PRIORITY RULES (money-in split order) ---');
      prules.filter(function(r){return r.enabled;}).sort(function(a,b){return a.priority-b.priority;}).forEach(function(r){
        ctx.push('#'+r.priority+' '+r.name+': '+r.desc);
      });
    }
  }catch(e){}

  // ── MERCHANT CATEGORY MEMORY ──
  try{
    var merchantCats = JSON.parse(lsGet('yb_spend_merchant_cats_v1')||'{}');
    var mcKeys = Object.keys(merchantCats);
    if(mcKeys.length){
      ctx.push('\n--- MERCHANT CATEGORY MEMORY ---');
      mcKeys.forEach(function(k){ ctx.push(k+' → '+merchantCats[k]); });
    }
  }catch(e){}

  // ── CARPOOL ARCHIVED MONTHS ──
  try{
    var archived = JSON.parse(lsGet('yb_carpool_archived')||'[]');
    if(archived.length){
      ctx.push('\n--- CARPOOL ARCHIVED MONTHS ---');
      archived.forEach(function(m){ ctx.push('Archived: '+m); });
    }
  }catch(e){}


  // ── FUEL LOG ──
  try{
    var fuelEntries = JSON.parse(lsGet('yasin_fuel_v1')||'[]');
    if(fuelEntries.length){
      // Pay cycle: 25th last month → 24th this month (matches carpool pay cycle)
      var now3 = new Date();
      var cycleStart3, cycleEnd3;
      if(now3.getDate() >= 25){
        cycleStart3 = new Date(now3.getFullYear(), now3.getMonth(), 25);
        cycleEnd3   = new Date(now3.getFullYear(), now3.getMonth()+1, 24);
      } else {
        cycleStart3 = new Date(now3.getFullYear(), now3.getMonth()-1, 25);
        cycleEnd3   = new Date(now3.getFullYear(), now3.getMonth(), 24);
      }
      var csStr = cycleStart3.toISOString().split('T')[0];
      var ceStr = cycleEnd3.toISOString().split('T')[0];
      var cycleFuel = fuelEntries.filter(function(e){ return (e.date||'') >= csStr && (e.date||'') <= ceStr; });
      var cycleTotal = cycleFuel.reduce(function(s,e){ return s+(e.amount||0); },0);
      var FUEL_BUDGET = 2800;
      var budgetLeft = FUEL_BUDGET - cycleTotal;
      var dailyCost = Number(lsGet('yb_daily_fuel')||100);
      ctx.push('\n--- FUEL LOG ---');
      ctx.push('Pay cycle '+csStr+' to '+ceStr);
      ctx.push('Spent this cycle: R'+cycleTotal.toFixed(2)+' of R'+FUEL_BUDGET+' budget — R'+budgetLeft.toFixed(2)+(budgetLeft>=0?' remaining':' OVER BUDGET'));
      ctx.push('Daily fuel cost setting: R'+dailyCost+'/day');
      ctx.push('Total log entries: '+fuelEntries.length+', this cycle: '+cycleFuel.length);
      // Recent entries
      var recentFuel = cycleFuel.slice().sort(function(a,b){return (b.date||'').localeCompare(a.date||'');});
      recentFuel.forEach(function(e){
        ctx.push('  '+e.date+': R'+(e.amount||0)+' (R'+(e.price||0)+'/L)');
      });
    }
  }catch(e){}

  return ctx.join('\n');
}

// ── Cloudflare Worker proxy URL ───────────────────────────────────────────────
var ODIN_PROXY_URL = 'https://wispy-thunder-bc04.yasin-badaron90.workers.dev';

// ── Send a message ────────────────────────────────────────────────────────────
function odinChat(userText){
  if(!userText || !userText.trim()) return;
  userText = userText.trim();

  var apiKey = typeof bfGetApiKey === 'function' ? bfGetApiKey() : '';
  if(!apiKey){
    appendOdinMsg('assistant', '⚠️ No API key set. Go to <b>Settings → Bank Feed AI Key</b> and paste your Anthropic key.', false, null);
    return;
  }

  // Render user bubble
  appendOdinMsg('user', escHtml(userText), false, null);
  _odinHistory.push({role:'user', content:userText, html:escHtml(userText)});

  // Thinking indicator
  var thinkId = 'think-'+Date.now();
  appendOdinMsg('assistant', '<span id="'+thinkId+'" style="color:#555;font-style:italic;font-size:11px;">🧠 thinking...</span>', false, null);

  var systemPrompt = 'You are Odin — the financial co-pilot for Yasin Badaron\'s personal dashboard. '
    +'You are embedded inside his PWA. You read his real financial data and help him make decisions.\n\n'
    +'PERSONALITY:\n'
    +'- Direct, clear, no waffle\n'
    +'- Use numbers — always cite actual amounts from his data\n'
    +'- Friendly but professional\n'
    +'- South African context (ZAR, FNB, TymeBank, SARS, carpool culture)\n\n'
    +'POCKET-FIRST MODEL:\n'
    +'- Money lives in pockets, not bank accounts\n'
    +'- Bank accounts are doorways (normally R0)\n'
    +'- Never suggest spending from a bank account directly\n'
    +'- Always reference which pocket money should come from\n\n'
    +'ACCURACY:\n'
    +'- Only state facts from the data below — never invent balances or transactions\n'
    +'- If you\'re unsure, say so\n'
    +'- When summarising debt, include both carpool AND personal loans per person\n\n'
    +'CAR OWNERSHIP (important context):\n'
    +'- Toyota Corolla CAA 643-241 = YASIN\'S car (his daily driver), funded from Ee90 pocket\n'
    +'- Kia Picanto CAA 189-565 = NURJAHAN\'S car (Yasin\'s wife), also funded from Ee90 pocket\n'
    +'- Hyundai Getz CAA 353-290 = MOTHER-IN-LAW\'S car, Nurjahan pays for it, record-only in app (no pocket deduction ever)\n'
    +'- Ee90 _KiA picaNto pocket = funds both Yasin\'s Toyota AND Nurjahan\'s Kia (the pocket name is misleading — ignore it)\n\n'
    +'REPORTS TAB:\n'
    +'- The Reports tab has no separate storage — it aggregates Savings + Carpool + Cash Flow data\n'
    +'- You already have all that data in LIVE DATA below, so answer any reports question directly\n\n'
    +'LIVE DATA:\n'+_odinBuildContext();

  var messages = _odinHistory.slice();

  function _odinFetch(retrying){
    var controller = new AbortController();
    var timer = setTimeout(function(){ controller.abort(); }, 30000);
    fetch(ODIN_PROXY_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages.map(function(m){ return {role:m.role, content:m.content}; })
      })
    }).then(function(res){ clearTimeout(timer); return res.json(); }).then(function(data){
    var el = document.getElementById(thinkId);
    if(el) el.remove();

    if(data.error){
      appendOdinMsg('assistant', '❌ API error: '+escHtml(data.error.message||JSON.stringify(data.error)), false, null);
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

    // Assign a unique turn ID so feedback buttons can reference this specific reply
    var turnId = 'turn-'+(++_odinTurnSeq)+'-'+Date.now();

    // Render assistant bubble WITH feedback buttons (live reply = showFeedback true)
    appendOdinMsg('assistant', html, true, turnId);

    // Store html on the user message too (already pushed without html)
    if(_odinHistory.length > 0 && _odinHistory[_odinHistory.length-1].role === 'user'){
      _odinHistory[_odinHistory.length-1].html = escHtml(_odinHistory[_odinHistory.length-1].content);
    }
    _odinHistory.push({role:'assistant', content:reply, html:html, turnId:turnId});

    // Keep history at max 20 turns (40 entries) to avoid token bloat
    if(_odinHistory.length > 40) _odinHistory = _odinHistory.slice(-40);

    // Save to Firestore
    _odinSaveHistory();


  }).catch(function(err){
    clearTimeout(timer);
    if(!retrying){ setTimeout(function(){ _odinFetch(true); }, 2000); return; }
    var el = document.getElementById(thinkId);
    if(el) el.remove();
    appendOdinMsg('assistant', '❌ Network error — retried once. Check your connection and try again.', false, null);
    _odinHistory.pop();
  });
  }
  _odinFetch(false);
}







// ── Called from school.js / odin.js to pre-fill and send a question ──────────
function odinChatAsk(question){
  openAIAssistant();
  setTimeout(function(){ odinChat(question); }, 350);
}
