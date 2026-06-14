// Odin Chat — powered by Claude API (claude-sonnet-4-6)
// External API (called from index.html / odin.js / school.js / home.js):
//   openAIAssistant()   closeAIAssistant()   clearAIChat()
//   odinChat(text)      odinChatAsk(text)    appendOdinMsg(role, html)

// ── Conversation history (session-only) ──────────────────────────────────────
var _odinHistory = [];  // [{role:'user'|'assistant', content:'...'}]

// ── Open / close / clear ─────────────────────────────────────────────────────
function openAIAssistant(){
  document.getElementById('aiOverlay').classList.add('open');
  setTimeout(function(){ var el=document.getElementById('aiInput'); if(el) el.focus(); }, 300);
}
function closeAIAssistant(){
  document.getElementById('aiOverlay').classList.remove('open');
}
function clearAIChat(){
  _odinHistory = [];
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

  // Pockets / savings
  try{
    var funds = JSON.parse(lsGet('yasin_funds_v16')||'[]');
    if(funds.length){
      ctx.push('\n--- POCKETS / SAVINGS ---');
      funds.forEach(function(f){
        var total = (f.deposits||[]).reduce(function(s,d){
          if(f.isExpense){
            return d.txnType==='in' ? s+d.amount : s-d.amount;
          }
          return s+d.amount;
        },0);
        ctx.push(f.emoji+' '+f.name+': R'+total.toFixed(2)+(f.goal?' (goal R'+f.goal+')':'')+(f.isExpense?' [expense fund]':''));
      });
    }
  }catch(e){}

  // Bank baselines
  try{
    var recon = JSON.parse(lsGet('yb_recon_balances_v1')||'{}');
    ctx.push('\n--- BANK BASELINES (doorway model — normally R0) ---');
    ctx.push('FNB: R'+(recon.fnb||0)+', TymeBank: R'+(recon.tyme||0)+', Cash: R'+(recon.cash||0));
    ctx.push('Note: pockets are source of truth. Banks are doorways only and should normally show R0.');
  }catch(e){}

  // Cash flow (last 30 entries)
  try{
    var cf = JSON.parse(lsGet('yb_cashflow_v1')||'[]');
    if(cf.length){
      ctx.push('\n--- RECENT CASH FLOW (last 20 entries) ---');
      cf.slice(-20).forEach(function(e){
        var prefix = e.type==='income'?'+':'-';
        ctx.push(e.date+' '+prefix+'R'+e.amount+' '+e.label+(e.account?' ['+e.account+']':''));
      });
    }
  }catch(e){}

  // Carpool — who owes, grand total
  try{
    var cpData = JSON.parse(lsGet('yasin_carpool_v4')||'{}');
    var grandTotal=0, unpaid=0;
    var paxTotals = {};
    Object.values(cpData).forEach(function(month){
      Object.values(month).forEach(function(day){
        if(typeof day!=='object') return;
        ['David','Lezaun','Shireen'].forEach(function(p){
          if(!day[p]||typeof day[p]!=='object') return;
          var amt=day[p].amt||0;
          var paid=day[p].paid||false;
          grandTotal+=amt;
          if(!paid&&amt>0) unpaid+=amt;
          if(!paxTotals[p]) paxTotals[p]={total:0,owing:0};
          paxTotals[p].total+=amt;
          if(!paid&&amt>0) paxTotals[p].owing+=amt;
        });
      });
    });
    ctx.push('\n--- CARPOOL ---');
    ctx.push('Grand total earned: R'+grandTotal.toFixed(2)+', Outstanding: R'+unpaid.toFixed(2));
    Object.keys(paxTotals).forEach(function(p){
      ctx.push(p+': total R'+paxTotals[p].total.toFixed(2)+', owes R'+paxTotals[p].owing.toFixed(2));
    });
  }catch(e){}

  // Borrowed / Money Owed
  try{
    var borrows = JSON.parse(lsGet('yb_borrow_data_v1')||'[]');
    if(borrows.length){
      ctx.push('\n--- MONEY OWED (BORROWED) ---');
      borrows.forEach(function(b){
        if(b.paid) return;
        var repaid=(b.entries||[]).filter(function(e){return e.type==='repay';}).reduce(function(s,e){return s+e.amount;},0);
        ctx.push(b.name+' owes R'+((b.amount||0)-repaid).toFixed(2)+' (originally R'+(b.amount||0)+')');
      });
    }
  }catch(e){}

  // Instalments
  try{
    var inst = JSON.parse(lsGet('yb_instalments_v1')||'[]');
    if(inst.length){
      ctx.push('\n--- INSTALMENTS ---');
      inst.forEach(function(p){
        var paidMonths=(p.paid||[]).length;
        var total=p.months||0;
        ctx.push(p.name+': R'+p.amt+'/month, '+paidMonths+'/'+total+' paid, debit day '+p.debitDay+(p.serviceFee?' (+R'+p.serviceFee+' fee)':''));
      });
    }
  }catch(e){}

  // Cars
  try{
    var cars = JSON.parse(lsGet('yb_cars_v2')||'[]');
    if(cars.length){
      ctx.push('\n--- CARS ---');
      cars.forEach(function(c){
        var openAdv=(c.advisories||[]).filter(function(a){return a.status==='open';}).length;
        ctx.push((c.name||'Car')+' ('+c.plate+'): '+c.km+'km'+
          (c.lastServiceDate?' last service '+c.lastServiceDate:'')+(openAdv?' — '+openAdv+' open advisor'+(openAdv!==1?'ies':'y'):''));
      });
    }
  }catch(e){}

  // School
  try{
    var subjects = JSON.parse(lsGet('yasin_school_results_v2')||'[]');
    if(subjects.length){
      ctx.push('\n--- SCHOOL (BCom General, final year 2026) ---');
      subjects.forEach(function(s){
        var final = s.examPct!=null&&s.yearPct!=null ? Math.round(s.yearPct*0.4+s.examPct*0.6) : null;
        ctx.push(s.code+' '+s.name+': '+s.result+(final!=null?' ('+final+'%)':'')+(s.examDate?' exam '+s.examDate:''));
      });
    }
  }catch(e){}

  return ctx.join('\n');
}

// ── Cloudflare Worker proxy URL (replaces direct Anthropic call to avoid CORS)
// After deploying cf-worker.js to Cloudflare, paste your worker URL here:
var ODIN_PROXY_URL = 'https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev';

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
    _odinHistory.push({role:'assistant', content:reply});

    // Keep history at max 20 turns (40 entries) to avoid token bloat
    if(_odinHistory.length > 40) _odinHistory = _odinHistory.slice(-40);

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
