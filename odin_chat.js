// Odin Chat: conversational engine, affordability

const AI_KEY_STORE = 'yb_ai_key_v1';
let _aiKeyMem = "";
let aiChatHistory = [];
let aiIsLoading = false;

function openAIAssistant(){
  document.getElementById('aiOverlay').classList.add('open');
  // Restore saved key
  const saved = lsGet(AI_KEY_STORE);
  if(saved){
    document.getElementById('aiApiKey').value = saved;
    document.getElementById('aiKeyStatus').textContent = '✓ saved';
    document.getElementById('aiKeyStatus').style.color = '#3a5a00';
  }
  // Focus input
  setTimeout(()=>{ document.getElementById('aiInput').focus(); }, 300);
}
function closeAIAssistant(){
  document.getElementById('aiOverlay').classList.remove('open');
}
function saveAIKey(val){
  _aiKeyMem = val.trim();
  lsSet(AI_KEY_STORE, val.trim());
  const st = document.getElementById('aiKeyStatus');
  if(val.trim().startsWith('AIza')){
    st.textContent = '✓ saved'; st.style.color = '#5a8800';
  } else if(val.trim()){
    st.textContent = '⚠ check key'; st.style.color = '#f2a830';
  } else {
    st.textContent = ''; 
  }
}
function clearAIChat(){
  aiChatHistory = [];
  const msgs = document.getElementById('aiMessages');
  msgs.innerHTML = '<div class="ai-empty" id="aiEmptyState"><div class="ai-empty-icon">✦</div><div class="ai-empty-title">Ask me anything</div><div class="ai-empty-sub">I have access to all your savings funds,<br>carpool data, and repayment records.<br>Try a quick prompt above or type below.</div></div>';
}
function aiQuickPrompt(text){
  document.getElementById('aiInput').value = text;
  sendAIMessage();
}

function gatherDashboardContext(){
  // Savings
  let savingsData = [];
  try{
    const raw = lsGet(SK);
    const parsed = raw ? JSON.parse(raw) : [];
    savingsData = parsed.map(function(f){
      const total = f.deposits ? f.deposits.reduce(function(s,d){ return s+(d.txnType==='out'?-d.amount:d.amount); },0) : 0;
      return { name: f.name, emoji: f.emoji, saved: Math.round(total), goal: f.goal, pct: f.goal>0?Math.round((total/f.goal)*100):0, weekly: f.weekly, start: f.start };
    });
  }catch(e){}

  // Carpool — current month summary
  let carpoolSummary = {};
  try{
    const cp = JSON.parse(lsGet(CPK)||'{}');
    const now = new Date();
    const mk = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
    const monthData = cp[mk] || {};
    const summary = {};
    PASSENGERS.slice().forEach(function(p){ summary[p] = {owed:0, paid:0}; });
    Object.values(monthData).forEach(function(day){
      PASSENGERS.slice().forEach(function(p){
        if(day[p]){
          if(day[p].paid) summary[p].paid += day[p].amt||0;
          else summary[p].owed += day[p].amt||0;
        }
      });
    });
    carpoolSummary = { month: mk, passengers: summary };
  }catch(e){}

  // External borrows (money owed)
  let moneyOwed = [];
  try{
    const ext = JSON.parse(lsGet('yb_external_borrows_v1')||'{}');
    Object.values(ext).forEach(function(person){
      let borrowed=0, repaid=0;
      (person.entries||[]).forEach(function(e){ if(e.type==='borrow') borrowed+=e.amount; else repaid+=e.amount; });
      if(borrowed-repaid>0) moneyOwed.push({ name:person.name, borrowed, repaid, owing: borrowed-repaid });
    });
  }catch(e){}

  // Maintenance fund
  let maintenance = null;
  try{
    const data = JSON.parse(lsGet(MAINT_KEY)||'[]');
    const now = new Date();
    const mk = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
    const monthTotal = data.filter(function(e){return e.date&&e.date.startsWith(mk);}).reduce(function(s,e){return s+e.amount;},0);
    const allTotal = data.reduce(function(s,e){return s+e.amount;},0);
    maintenance = { monthTotal, allTotal, target: MAINT_TARGET };
  }catch(e){}

  return { savings: savingsData, carpool: carpoolSummary, moneyOwed, maintenance, generatedAt: new Date().toISOString() };
}

function appendMessage(role, text){
  const empty = document.getElementById('aiEmptyState');
  if(empty) empty.remove();

  const msgs = document.getElementById('aiMessages');
  const wrap = document.createElement('div');
  wrap.className = 'ai-msg '+role;

  const avatar = document.createElement('div');
  avatar.className = 'ai-avatar';
  avatar.textContent = role==='assistant' ? '✦' : '👤';

  const bubble = document.createElement('div');
  bubble.className = 'ai-bubble';
  // Simple markdown-ish: bold **text**, line breaks
  bubble.innerHTML = text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.*?)\*\*/g,'<strong style="color:#efefef;">$1</strong>')
    .replace(/\n/g,'<br>');

  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  msgs.appendChild(wrap);
  msgs.scrollTop = msgs.scrollHeight;
  return bubble;
}

function showTypingIndicator(){
  const empty = document.getElementById('aiEmptyState');
  if(empty) empty.remove();
  const msgs = document.getElementById('aiMessages');
  const wrap = document.createElement('div');
  wrap.className = 'ai-msg assistant';
  wrap.id = 'aiTypingWrap';
  const avatar = document.createElement('div');
  avatar.className = 'ai-avatar';
  avatar.textContent = '✦';
  const bubble = document.createElement('div');
  bubble.className = 'ai-bubble ai-typing';
  bubble.innerHTML = '<span></span><span></span><span></span>';
  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  msgs.appendChild(wrap);
  msgs.scrollTop = msgs.scrollHeight;
}
function removeTypingIndicator(){
  const el = document.getElementById('aiTypingWrap');
  if(el) el.remove();
}

async function sendAIMessage(){
  if(aiIsLoading) return;
  const input = document.getElementById('aiInput');
  const text = input.value.trim();
  if(!text) return;

  const keyInput = document.getElementById("aiApiKey");
  const apiKey = (keyInput && keyInput.value.trim()) || _aiKeyMem || (lsGet(AI_KEY_STORE)||"").trim();
  if(!apiKey || apiKey.length < 20){
    appendMessage("assistant", "⚠️ Please paste your Gemini API key into the **API KEY** field above and try again.");
    return;
  }

  input.value = '';
  input.style.height = 'auto';
  aiIsLoading = true;
  document.getElementById('aiSendBtn').disabled = true;

  appendMessage('user', text);
  aiChatHistory.push({ role:'user', content: text });

  showTypingIndicator();

  const ctx = gatherDashboardContext();
  const systemPrompt = `You are a smart personal finance assistant built into the user's YB Dashboard. You have full read access to their financial data below. Be concise, insightful, and practical. Use Rands (R) for currency. When listing numbers, keep it scannable. Use **bold** for key figures.

DASHBOARD DATA (live snapshot):
${JSON.stringify(ctx, null, 2)}

Rules:
- Answer only based on the data provided. Don't make up numbers.
- If data seems empty or zero, say so honestly.
- Format responses for a mobile screen — short paragraphs, not walls of text.
- Never mention the raw JSON or that you were given data — just answer naturally.`;

  try{
    // Build Gemini conversation history
    const geminiContents = [];
    // Add system prompt as first user message
    geminiContents.push({
      role: 'user',
      parts: [{ text: systemPrompt + '\n\nUser: ' + text }]
    });
    // Add previous chat history (skip last user message already added above)
    const historyForGemini = [];
    for(let i = 0; i < aiChatHistory.length - 1; i++){
      historyForGemini.push({
        role: aiChatHistory[i].role === 'assistant' ? 'model' : 'user',
        parts: [{ text: aiChatHistory[i].content }]
      });
    }

    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key='+apiKey,{
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({
        contents: geminiContents,
        generationConfig: { maxOutputTokens: 1000 }
      })
    });
    const data = await res.json();
    removeTypingIndicator();

    if(data.error){
      appendMessage('assistant','⚠️ API error: '+data.error.message);
    } else {
      const reply = data.candidates[0].content.parts[0].text;
      appendMessage('assistant', reply);
      aiChatHistory.push({ role:'assistant', content: reply });
    }
  }catch(err){
    removeTypingIndicator();
    appendMessage('assistant','⚠️ Could not reach the API. Check your internet connection and try again.\n\nError: '+err.message);
  }

  aiIsLoading = false;
  document.getElementById('aiSendBtn').disabled = false;
  input.focus();
}

/* ══════════════════════════════════ */

// ── CAR SERVICE TRACKER ──
