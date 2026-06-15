// BANK FEED COMPANION — bankfeed.js
// Reads a photo, screenshot, or PDF of a bank statement using Claude vision,
// extracts transactions, matches them to your pockets, and logs approved
// ones as Spend entries — identical to tapping ↑ Spend yourself.
//
// Two modes:
//   SNAP NOW  — one transaction from a payment notification/slip screenshot
//   MONTHLY   — full statement PDF (FNB runs 13th–13th)
//
// Storage keys:
//   yb_bankfeed_merchants_v1  — merchant→pocketId memory (persists forever)
//   yb_bankfeed_sessions_v1   — past import sessions (last 6 kept)
//
// Hard rules inherited:
//   • Never log a spend that would push a pocket negative (mirrors v109)
//   • Every logged transaction carries a bankfeedId mirror-link
//   • postToCF passthrough list includes bankfeedId (added in this file)
//
// NOTE: this file calls the Anthropic API directly (same pattern as
// odin_chat.js would if it used the API) — no server needed.

'use strict';

// ── Constants ────────────────────────────────────────────────────────────────
var BF_MERCHANT_KEY = 'yb_bankfeed_merchants_v1';
var BF_SESSION_KEY  = 'yb_bankfeed_sessions_v1';
var BF_MAX_SESSIONS = 6;

// ── State ────────────────────────────────────────────────────────────────────
var _bf = {
  mode: null,           // 'snap' | 'monthly'
  rawFile: null,        // File object
  base64: null,         // base64 string
  mimeType: null,       // 'image/jpeg' | 'image/png' | 'application/pdf'
  dateFrom: null,       // ISO date string — filter start
  dateTo: null,         // ISO date string — filter end
  transactions: [],     // extracted from AI: [{merchant, amount, date, type:'debit'|'credit', raw}]
  assignments: {},      // txn index → pocketId (or 'skip')
  step: 'upload',       // 'upload' | 'reading' | 'review' | 'confirm' | 'done'
};

// ── Load / save merchant memory ───────────────────────────────────────────────
function bfLoadMerchants(){
  try{ return JSON.parse(lsGet(BF_MERCHANT_KEY)||'{}'); }catch(e){ return {}; }
}
function bfSaveMerchants(m){ lsSet(BF_MERCHANT_KEY, JSON.stringify(m)); }

// Normalise merchant name for lookup key
function bfMerchantKey(raw){
  return (raw||'').toUpperCase().replace(/[^A-Z0-9 ]/g,'').replace(/\s+/g,' ').trim().slice(0,40);
}

// ── Open / close modal ────────────────────────────────────────────────────────
function openBankFeed(mode){
  _bf.mode = mode || 'snap';
  _bf.rawFile = null;
  _bf.base64 = null;
  _bf.mimeType = null;
  _bf.transactions = [];
  _bf.assignments = {};
  _bf.step = 'upload';

  // Default date range: 12th of last month to 12th of this month (FNB cycle)
  var now = new Date();
  var y = now.getFullYear();
  var m = now.getMonth(); // 0-based
  var thisMonth12 = new Date(y, m, 12);
  if(now <= thisMonth12){
    var from = new Date(y, m-1, 12);
    var to   = new Date(y, m, 12);
  } else {
    var from = new Date(y, m, 12);
    var to   = new Date(y, m+1, 12);
  }
  _bf.dateFrom = from.toISOString().split('T')[0];
  _bf.dateTo   = to.toISOString().split('T')[0];

  _bfRender();
  document.getElementById('bankFeedModal').classList.add('active');

  // Update tab button highlight
  var snapBtn = document.getElementById('bfTabSnap');
  var monthBtn = document.getElementById('bfTabMonthly');
  if(snapBtn && monthBtn){
    if(_bf.mode === 'snap'){
      snapBtn.style.background = '#0d1a00'; snapBtn.style.color = 'var(--accent)'; snapBtn.style.borderColor = 'var(--accent)';
      monthBtn.style.background = 'none'; monthBtn.style.color = 'var(--muted)'; monthBtn.style.borderColor = 'var(--border)';
    } else {
      monthBtn.style.background = '#0d1a00'; monthBtn.style.color = 'var(--accent)'; monthBtn.style.borderColor = 'var(--accent)';
      snapBtn.style.background = 'none'; snapBtn.style.color = 'var(--muted)'; snapBtn.style.borderColor = 'var(--border)';
    }
  }
}

function closeBankFeed(){
  document.getElementById('bankFeedModal').classList.remove('active');
}

// ── Main render dispatcher ────────────────────────────────────────────────────
function _bfRender(){
  var modal = document.getElementById('bankFeedContent');
  if(!modal) return;
  if(_bf.step === 'upload')  modal.innerHTML = _bfRenderUpload();
  if(_bf.step === 'reading') modal.innerHTML = _bfRenderReading();
  if(_bf.step === 'review')  modal.innerHTML = _bfRenderReview();
  if(_bf.step === 'confirm') modal.innerHTML = _bfRenderConfirm();
  if(_bf.step === 'done')    modal.innerHTML = _bfRenderDone();
}

// ── STEP 1: Upload ────────────────────────────────────────────────────────────
function _bfRenderUpload(){
  var isSnap = _bf.mode === 'snap';
  var title  = isSnap ? '📸 Snap Now' : '📄 Monthly Statement';
  var sub    = isSnap
    ? 'Screenshot or photo of a single payment'
    : 'FNB / TymeBank PDF — 13th to 13th';

  var dateSection = isSnap ? '' :
    '<div class="bf-section-label">Date range (tap to change)</div>'
    +'<div style="display:flex;gap:10px;margin-bottom:16px;">'
    +'<div class="bf-date-box" onclick="bfEditDate(\'from\')">'
    +'<div class="bf-date-label">From</div>'
    +'<div class="bf-date-val" id="bfDateFrom">'+_bf.dateFrom+'</div>'
    +'</div>'
    +'<div style="color:#444;font-size:16px;align-self:center;">→</div>'
    +'<div class="bf-date-box" onclick="bfEditDate(\'to\')">'
    +'<div class="bf-date-label">To</div>'
    +'<div class="bf-date-val" id="bfDateTo">'+_bf.dateTo+'</div>'
    +'</div>'
    +'</div>';

  return '<div class="bf-hdr">'
    +'<div class="bf-title">'+title+'</div>'
    +'<div class="bf-sub">'+sub+'</div>'
    +'</div>'
    +dateSection
    +'<div class="bf-section-label">Choose your source</div>'
    +'<div class="bf-upload-grid">'
    +'<label class="bf-upload-opt bf-opt-primary" for="bfFileInput">'
    +'<div class="bf-upload-icon">📸</div>'
    +'<div class="bf-upload-name">Photo / Screenshot</div>'
    +'<div class="bf-upload-hint">Camera or gallery</div>'
    +'</label>'
    +'<label class="bf-upload-opt" for="bfFileInput">'
    +'<div class="bf-upload-icon">📄</div>'
    +'<div class="bf-upload-name">PDF Statement</div>'
    +'<div class="bf-upload-hint">Downloaded from FNB app</div>'
    +'</label>'
    +'</div>'
    +'<input type="file" id="bfFileInput" accept="image/*,application/pdf" capture="environment"'
    +' style="display:none" onchange="bfFileChosen(this)"/>'
    +'<div class="bf-info-box" style="margin-top:16px;">'
    +'💡 The AI reads your statement and extracts every transaction. Nothing leaves your device except the file you upload.'
    +'</div>'
    +'<button class="bf-btn-ghost" onclick="closeBankFeed()">Cancel</button>';
}

// ── Handle file selection ─────────────────────────────────────────────────────
function bfFileChosen(input){
  var file = input.files[0];
  if(!file) return;
  _bf.rawFile = file;
  _bf.mimeType = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
  _bf.step = 'reading';
  _bfRender();
  // Start reading
  var reader = new FileReader();
  reader.onload = function(e){
    _bf.base64 = e.target.result.split(',')[1];
    _bfCallAI();
  };
  reader.readAsDataURL(file);
}

// ── STEP 2: Reading (AI in progress) ─────────────────────────────────────────
function _bfRenderReading(){
  return '<div class="bf-hdr">'
    +'<div class="bf-title">🧠 Reading...</div>'
    +'<div class="bf-sub">Extracting transactions from your statement</div>'
    +'</div>'
    +'<div class="bf-reading-wrap">'
    +'<div class="bf-reading-icon">🧠</div>'
    +'<div class="bf-reading-label" id="bfReadingLabel">Analysing your statement...</div>'
    +'<div class="bf-prog-track"><div class="bf-prog-fill" id="bfProgFill" style="width:20%"></div></div>'
    +'</div>'
    +'<div class="bf-info-box" style="margin-top:16px;">'
    +'Finding merchants · amounts · dates · matching to your pockets'
    +'</div>';
}

// Animate the progress bar while AI is working
function _bfAnimateProgress(){
  var fill = document.getElementById('bfProgFill');
  var label = document.getElementById('bfReadingLabel');
  var steps = [
    {pct:20, text:'Analysing your statement...'},
    {pct:45, text:'Finding transactions...'},
    {pct:65, text:'Matching merchants to pockets...'},
    {pct:85, text:'Almost done...'},
  ];
  var i = 0;
  var iv = setInterval(function(){
    if(i >= steps.length){ clearInterval(iv); return; }
    if(fill) fill.style.width = steps[i].pct+'%';
    if(label) label.textContent = steps[i].text;
    i++;
  }, 900);
  return iv;
}

// ── API key helpers ───────────────────────────────────────────────────────────
var BF_KEY_STORAGE = 'yb_bf_api_key_v1';
function bfGetApiKey(){ return lsGet(BF_KEY_STORAGE) || ''; }
function bfSaveApiKey(){
  var val = (document.getElementById('bfApiKeyInput').value||'').trim();
  if(!val){ alert('Paste your API key first.'); return; }
  if(!val.startsWith('sk-ant-')){ alert('That doesn\'t look like an Anthropic key — should start with sk-ant-'); return; }
  lsSet(BF_KEY_STORAGE, val);
  document.getElementById('bfApiKeyStatus').textContent = '✓ Key saved';
  document.getElementById('bfApiKeyStatus').style.color = '#c8f230';
  setTimeout(function(){ document.getElementById('bfApiKeyStatus').textContent = ''; }, 2000);
}
function bfClearApiKey(){
  lsSet(BF_KEY_STORAGE, '');
  document.getElementById('bfApiKeyInput').value = '';
  document.getElementById('bfApiKeyStatus').textContent = 'Key cleared';
  document.getElementById('bfApiKeyStatus').style.color = '#888';
}
// Pre-fill the input when settings opens
function bfPreFillKeyInput(){
  var inp = document.getElementById('bfApiKeyInput');
  if(inp){ var k = bfGetApiKey(); if(k) inp.value = k; }
}

// ── Call Claude API to extract transactions ───────────────────────────────────
function _bfCallAI(){
  var apiKey = bfGetApiKey();
  if(!apiKey){
    _bf.step = 'upload';
    _bfRender();
    alert('No API key set. Go to Settings → Bank Feed AI Key and paste your Anthropic key first.');
    return;
  }

  var iv = _bfAnimateProgress();
  var isPDF = _bf.mimeType === 'application/pdf';
  var isSnap = _bf.mode === 'snap';

  var systemPrompt = 'You are a bank statement parser. Extract transactions and return ONLY valid JSON — no markdown, no explanation.\n'
    +'Return an array of objects with these exact fields:\n'
    +'  merchant: string (merchant name as it appears)\n'
    +'  amount: number (always positive)\n'
    +'  date: string (ISO format YYYY-MM-DD, infer year if missing)\n'
    +'  type: "debit" or "credit"\n'
    +'  raw: string (the original line from the statement)\n'
    +'Rules:\n'
    +'- Debits = money going OUT (purchases, fees, debit orders)\n'
    +'- Credits = money coming IN (salary, transfers in, carpool payments)\n'
    +'- Skip balance lines, opening/closing balance, statement header info\n'
    +'- If you cannot read a line clearly, skip it\n'
    +'- Return [] if no transactions found\n'
    +'- Return ONLY the JSON array, nothing else';

  var userText = isSnap
    ? 'This is a screenshot of a single payment or transaction notification. Extract the transaction details.'
    : 'This is a bank statement. Extract all transactions between '
      +_bf.dateFrom+' and '+_bf.dateTo+'. Skip any transactions outside this date range.';

  var messageContent = [
    {
      type: isPDF ? 'document' : 'image',
      source: {
        type: 'base64',
        media_type: _bf.mimeType,
        data: _bf.base64
      }
    },
    { type: 'text', text: userText }
  ];

  var proxyUrl = (typeof ODIN_PROXY_URL !== 'undefined' && ODIN_PROXY_URL && !ODIN_PROXY_URL.includes('YOUR-WORKER'))
    ? ODIN_PROXY_URL : null;

  fetch(proxyUrl || 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: proxyUrl ? {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
      'X-Anthropic-Beta': 'pdfs-2024-09-25'
    } : {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'anthropic-beta': 'pdfs-2024-09-25'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: 'user', content: messageContent }]
    })
  })
  .then(function(r){ return r.json(); })
  .then(function(data){
    clearInterval(iv);
    var fill = document.getElementById('bfProgFill');
    if(fill) fill.style.width = '100%';

    // Check for API errors
    if(data.error){
      console.error('BankFeed API error:', data.error);
      _bf.step = 'upload';
      _bfRender();
      var msg = data.error.message || 'API error';
      if(msg.includes('api_key') || msg.includes('auth') || msg.includes('invalid x-api-key')){
        alert('Invalid API key. Go to Settings → Bank Feed AI Key and check your key.');
      } else {
        alert('Could not read the statement: ' + msg);
      }
      return;
    }

    var raw = '';
    if(data.content && data.content.length){
      for(var i=0;i<data.content.length;i++){
        if(data.content[i].type === 'text') raw += data.content[i].text;
      }
    }
    // Strip any markdown fences
    raw = raw.replace(/```json|```/g,'').trim();

    var txns = [];
    try{ txns = JSON.parse(raw); }catch(e){ txns = []; }

    if(!Array.isArray(txns)) txns = [];

    // Pre-match against merchant memory
    var memory = bfLoadMerchants();
    _bf.transactions = txns;
    _bf.assignments = {};
    txns.forEach(function(t, i){
      var key = bfMerchantKey(t.merchant);
      if(memory[key]) _bf.assignments[i] = memory[key]; // pre-fill from memory
    });

    _bf.step = txns.length ? 'review' : 'upload';
    if(!txns.length){
      alert('No transactions found in that file. Try a clearer photo or different file.');
    }
    _bfRender();
  })
  .catch(function(err){
    clearInterval(iv);
    console.error('Bank feed AI error:', err);
    _bf.step = 'upload';
    _bfRender();
    alert('Could not read the statement. Please try again.');
  });
}

// ── STEP 3: Review ────────────────────────────────────────────────────────────
function _bfRenderReview(){
  var txns = _bf.transactions;
  var funds = window.funds || [];
  var memory = bfLoadMerchants();

  var matched = txns.filter(function(_,i){ return _bf.assignments[i] && _bf.assignments[i] !== 'skip'; }).length;
  var skipped = txns.filter(function(_,i){ return _bf.assignments[i] === 'skip'; }).length;
  var unmatched = txns.length - matched - skipped;

  var rows = txns.map(function(t, i){
    var key = bfMerchantKey(t.merchant);
    var assigned = _bf.assignments[i];
    var isCredit = t.type === 'credit';
    var amtColor = isCredit ? '#c8f230' : '#f23060';
    var amtPrefix = isCredit ? '+' : '-';

    // Badge
    var badge = '';
    if(assigned === 'skip'){
      badge = '<span class="bf-badge bf-badge-grey">Skip</span>';
    } else if(assigned){
      var pkt = funds.find(function(f){ return f.id === assigned; });
      var pktName = pkt ? (pkt.emoji+' '+pkt.name) : assigned;
      var fromMemory = !!memory[key];
      badge = '<span class="bf-badge bf-badge-green">'+_bfEsc(pktName)+(fromMemory?' 🧠':'')+'</span>';
    } else if(isCredit){
      badge = '<span class="bf-badge bf-badge-purple">Income — skip or assign</span>';
    } else {
      badge = '<span class="bf-badge bf-badge-orange">Needs pocket</span>';
    }

    // Pocket picker (show when unassigned debit, or always tappable)
    var pickerHtml = _bfRenderMiniPicker(i, assigned, isCredit);

    return '<div class="bf-txn-card" id="bfTxn'+i+'">'
      +'<div class="bf-txn-top">'
      +'<div class="bf-txn-left">'
      +'<div class="bf-txn-merchant">'+_bfEsc(t.merchant)+'</div>'
      +'<div class="bf-txn-meta">'+t.date+'</div>'
      +'</div>'
      +'<div class="bf-txn-right">'
      +'<div class="bf-txn-amt" style="color:'+amtColor+'">'+amtPrefix+'R'+Number(t.amount).toLocaleString('en-ZA')+'</div>'
      +badge
      +'</div>'
      +'</div>'
      +pickerHtml
      +'</div>';
  }).join('');

  return '<div class="bf-hdr">'
    +'<div class="bf-title">'+txns.length+' transactions found</div>'
    +'<div class="bf-sub">'+matched+' matched · '+unmatched+' need a pocket · '+skipped+' skipped</div>'
    +'</div>'
    +'<div class="bf-stat-row">'
    +'<div class="bf-stat-box"><div class="bf-stat-label">Auto-matched</div><div class="bf-stat-val" style="color:#c8f230">'+matched+'</div></div>'
    +'<div class="bf-stat-box"><div class="bf-stat-label">Needs you</div><div class="bf-stat-val" style="color:#f2a830">'+unmatched+'</div></div>'
    +'<div class="bf-stat-box"><div class="bf-stat-label">Skipped</div><div class="bf-stat-val" style="color:#555">'+skipped+'</div></div>'
    +'</div>'
    +rows
    +'<div style="margin-top:16px">'
    +'<button class="bf-btn-primary" onclick="bfProceedToConfirm()">Review & approve →</button>'
    +'<button class="bf-btn-ghost" onclick="closeBankFeed()">Cancel</button>'
    +'</div>';
}

function _bfRenderMiniPicker(idx, assigned, isCredit){
  var funds = window.funds || [];
  var opts = funds.map(function(f){
    var sel = assigned === f.id;
    var bal = typeof fundTotal === 'function' ? fundTotal(f) : 0;
    return '<div class="bf-pocket-chip'+(sel?' bf-pocket-sel':'')+'" onclick="bfAssign('+idx+',\''+f.id+'\')">'
      +_bfEsc(f.emoji+' '+f.name)
      +'<span style="color:#555;margin-left:4px;font-size:9px;">R'+Number(bal).toLocaleString('en-ZA')+'</span>'
      +'</div>';
  }).join('');

  var skipSel = assigned === 'skip';
  var skipChip = '<div class="bf-pocket-chip bf-pocket-skip'+(skipSel?' bf-pocket-sel-skip':'')+'" onclick="bfAssign('+idx+',\'skip\')">✕ Skip</div>';

  return '<div class="bf-picker-row">'+opts+skipChip+'</div>';
}

function bfAssign(idx, pocketId){
  _bf.assignments[idx] = pocketId;
  _bfRender(); // re-render review
}

// ── STEP 4: Confirm ───────────────────────────────────────────────────────────
function bfProceedToConfirm(){
  _bf.step = 'confirm';
  _bfRender();
}

function _bfRenderConfirm(){
  var txns = _bf.transactions;
  var funds = window.funds || [];

  // Build summary of what will be logged
  var toLog = txns.filter(function(t,i){
    var a = _bf.assignments[i];
    return a && a !== 'skip' && t.type === 'debit';
  });
  var toSkip = txns.filter(function(t,i){
    var a = _bf.assignments[i];
    return !a || a === 'skip' || t.type === 'credit';
  });

  // Check for any pocket-short situations
  var warnings = [];
  toLog.forEach(function(t, li){
    var realIdx = txns.indexOf(t);
    var pktId = _bf.assignments[realIdx];
    var pkt = funds.find(function(f){ return f.id === pktId; });
    if(pkt){
      var bal = typeof fundTotal === 'function' ? fundTotal(pkt) : 0;
      if(t.amount > bal){
        warnings.push(_bfEsc(pkt.emoji+' '+pkt.name)+' only has R'+Number(bal).toLocaleString('en-ZA')+' but '+_bfEsc(t.merchant)+' needs R'+Number(t.amount).toLocaleString('en-ZA'));
      }
    }
  });

  var warnHtml = warnings.length
    ? '<div class="bf-warn-box">⚠️ <strong>Pocket short:</strong><br>'+warnings.join('<br>')+'<br><br>Go back and reassign or skip these.</div>'
    : '';

  var rows = toLog.map(function(t){
    var realIdx = txns.indexOf(t);
    var pktId = _bf.assignments[realIdx];
    var pkt = funds.find(function(f){ return f.id === pktId; });
    var pktName = pkt ? (pkt.emoji+' '+pkt.name) : pktId;
    return '<div class="bf-confirm-row">'
      +'<div class="bf-confirm-left">'
      +'<div class="bf-confirm-merchant">'+_bfEsc(t.merchant)+'</div>'
      +'<div class="bf-confirm-pocket" style="color:#c8f230">→ '+_bfEsc(pktName)+'</div>'
      +'</div>'
      +'<div class="bf-confirm-amt" style="color:#f23060">-R'+Number(t.amount).toLocaleString('en-ZA')+'</div>'
      +'</div>';
  }).join('');

  var canApprove = warnings.length === 0 && toLog.length > 0;

  return '<div class="bf-hdr">'
    +'<div class="bf-title">Approve '+toLog.length+' transactions</div>'
    +'<div class="bf-sub">'+toSkip.length+' will be skipped</div>'
    +'</div>'
    +warnHtml
    +rows
    +'<div style="margin-top:16px">'
    +(canApprove
      ? '<button class="bf-btn-primary" onclick="bfApproveAll()">✓ Log all now</button>'
      : '<button class="bf-btn-disabled" disabled>Fix pocket-short issues first</button>')
    +'<button class="bf-btn-ghost" onclick="_bf.step=\'review\';_bfRender()">← Go back</button>'
    +'<button class="bf-btn-ghost" onclick="closeBankFeed()">Cancel</button>'
    +'</div>';
}

// ── STEP 5: Approve & log ─────────────────────────────────────────────────────
function bfApproveAll(){
  var txns = _bf.transactions;
  // Reload from storage and re-sync window.funds so the push below goes to
  // the exact same array that saveFunds() will write to disk.
  if(typeof loadFunds === 'function') loadFunds();
  if(typeof funds !== 'undefined') window.funds = funds;
  var bfFunds = window.funds || [];
  var memory = bfLoadMerchants();
  var logged = 0;

  txns.forEach(function(t, i){
    var pktId = _bf.assignments[i];
    if(!pktId || pktId === 'skip') return;
    if(t.type !== 'debit') return; // credits handled separately later

    var pkt = bfFunds.find(function(f){ return f.id === pktId; });
    if(!pkt) return;

    // Hard-block: re-check balance (mirrors v109 spend guard)
    var bal = typeof fundTotal === 'function' ? fundTotal(pkt) : 0;
    if(t.amount > bal + 0.005){
      console.warn('BankFeed: skipping '+t.merchant+' — pocket '+pkt.name+' has '+bal+' < '+t.amount);
      return;
    }

    // Generate IDs
    var bfId = 'bf_'+uid();
    var depId = 'bfdep_'+uid();

    // Add pocket deposit (txnType: 'out')
    if(!pkt.deposits) pkt.deposits = [];
    pkt.deposits.push({
      id: depId,
      txnType: 'out',
      amount: t.amount,
      date: t.date,
      note: t.merchant,
      bankfeedId: bfId
    });

    // Post to Cash Flow
    if(typeof postToCF === 'function'){
      postToCF({
        type: 'expenses',
        label: t.merchant,
        amount: t.amount,
        date: t.date,
        icon: '🏦',
        account: pkt.name,
        sourceType: 'bankfeed_spend',
        bankfeedId: bfId,
        destPocketId: pktId
      });
    }

    // Remember merchant → pocket mapping
    var key = bfMerchantKey(t.merchant);
    memory[key] = pktId;

    logged++;
  });

  // Save funds + merchant memory
  if(typeof saveFunds === 'function') saveFunds();
  bfSaveMerchants(memory);

  // Save session summary
  _bfSaveSession(logged);

  _bf.step = 'done';
  _bf._loggedCount = logged;
  _bfRender();

  // Refresh savings display
  if(typeof renderFunds === 'function') renderFunds();
  if(typeof renderCashFlow === 'function') renderCashFlow();
}

// ── STEP 6: Done ──────────────────────────────────────────────────────────────
function _bfRenderDone(){
  var n = _bf._loggedCount || 0;
  return '<div style="text-align:center;padding:32px 0 20px;">'
    +'<div style="font-size:52px;margin-bottom:14px">✅</div>'
    +'<div style="font-family:Syne,sans-serif;font-weight:800;font-size:22px;letter-spacing:-0.5px;">'+n+' transaction'+(n!==1?'s':'')+' logged</div>'
    +'<div style="font-size:11px;color:#888;margin-top:6px;letter-spacing:1px;">All added to your pockets</div>'
    +'</div>'
    +'<div class="bf-info-box">'
    +'🧠 Merchant mappings saved. Next time these merchants appear, they\'ll auto-match.'
    +'</div>'
    +'<div style="margin-top:16px">'
    +'<button class="bf-btn-primary" onclick="closeBankFeed()">Done</button>'
    +'<button class="bf-btn-ghost" onclick="openBankFeed(_bf.mode)">Import another</button>'
    +'</div>';
}

// ── Session history ───────────────────────────────────────────────────────────
function _bfSaveSession(count){
  try{
    var sessions = JSON.parse(lsGet(BF_SESSION_KEY)||'[]');
    sessions.unshift({ date: new Date().toISOString(), mode: _bf.mode, count: count });
    if(sessions.length > BF_MAX_SESSIONS) sessions = sessions.slice(0, BF_MAX_SESSIONS);
    lsSet(BF_SESSION_KEY, JSON.stringify(sessions));
  }catch(e){}
}

// ── Date editing ──────────────────────────────────────────────────────────────
function bfEditDate(which){
  var current = which === 'from' ? _bf.dateFrom : _bf.dateTo;
  var val = prompt('Enter date (YYYY-MM-DD):', current);
  if(val && /^\d{4}-\d{2}-\d{2}$/.test(val)){
    if(which === 'from') _bf.dateFrom = val;
    else _bf.dateTo = val;
    _bfRender();
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────
function _bfEsc(s){
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── _bfEntryReverse ──────────────────────────────────────────────────────────
// Atomically reverses a Bank Feed logged entry:
//   1. Removes the pocket OUT-deposit (matched by bankfeedId)
//   2. Removes the CF expense row (matched by bankfeedId)
// Called by cashflow.js hard-block guard when user taps ✕ on a BF CF row.
function _bfEntryReverse(bankfeedId, pocketId, amount){
  if(!bankfeedId) return;

  // 1. Remove pocket deposit
  if(typeof loadFunds === 'function') loadFunds();
  if(typeof funds !== 'undefined') window.funds = funds;
  var bfFunds = window.funds || [];
  var pkt = pocketId ? bfFunds.find(function(f){ return f.id === pocketId; }) : null;
  if(pkt && pkt.deposits){
    pkt.deposits = pkt.deposits.filter(function(d){ return d.bankfeedId !== bankfeedId; });
    if(typeof saveFunds === 'function') saveFunds();
  }

  // 2. Remove CF row
  try{
    var cfRaw = lsGet('yb_cashflow_v1');
    var cfAll = cfRaw ? JSON.parse(cfRaw) : {};
    Object.keys(cfAll).forEach(function(mk){
      ['income','expenses'].forEach(function(sec){
        if(cfAll[mk] && cfAll[mk][sec]){
          cfAll[mk][sec] = cfAll[mk][sec].filter(function(e){ return e.bankfeedId !== bankfeedId; });
        }
      });
    });
    lsSet('yb_cashflow_v1', JSON.stringify(cfAll));
  }catch(e){ console.error('_bfEntryReverse CF remove failed', e); }
}
