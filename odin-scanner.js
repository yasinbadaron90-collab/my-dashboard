// odin-scanner.js — Odin Invoice Scanner (v119b)
// Reads a workshop invoice photo or PDF using Claude vision.
// Extracts line items, flags tricky money (credits, R0 lines, VAT),
// reconciles captured total vs invoice printed total,
// then pre-fills the Log Expense modal for user approval.
//
// Nothing commits until the user taps Approve.
// Every line is editable/deletable before approving.
// Funded car → deducts pocket. Record-only car → history only, R0.
//
// Depends on:
//   cars.js        — loadCarsData(), saveCarsData(), openAddExpense()
//   advisories.js  — saveAdvisory(), openAdvisoryList()
//   bankfeed.js    — bfGetApiKey() (reuses same API key)
//   savings.js     — funds, fundTotal()
//
// Storage key: none (session-only state, nothing persists until Approve)

'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
var _scanner = {
  carId: null,
  mimeType: null,
  base64: null,
  lines: [],        // extracted line items: {desc, amount, isZero, isCredit, isNote, include}
  advisories: [],   // extracted workshop notes: {text, severity}
  invoiceTotal: 0,  // printed total from invoice
  capturedTotal: 0, // sum of our captured lines
  date: null,
  step: 'upload'    // 'upload' | 'reading' | 'review' | 'advisories' | 'done'
};

// ── Open / close ──────────────────────────────────────────────────────────────
function openOdinScanner(carId){
  var cars = typeof loadCarsData === 'function' ? loadCarsData() : [];
  var car  = cars.find(function(c){ return c.id === carId; });
  if(!car){ alert('Car not found.'); return; }

  _scanner.carId    = carId;
  _scanner.mimeType = null;
  _scanner.base64   = null;
  _scanner.lines    = [];
  _scanner.advisories = [];
  _scanner.invoiceTotal  = 0;
  _scanner.capturedTotal = 0;
  _scanner.date     = typeof localDateStr === 'function' ? localDateStr(new Date()) : new Date().toISOString().split('T')[0];
  _scanner.step     = 'upload';

  _scanRender();
  document.getElementById('odinScannerModal').classList.add('active');
}

function closeOdinScanner(){
  document.getElementById('odinScannerModal').classList.remove('active');
}

// ── Render dispatcher ─────────────────────────────────────────────────────────
function _scanRender(){
  var el = document.getElementById('odinScannerContent');
  if(!el) return;
  if(_scanner.step === 'upload')     el.innerHTML = _scanRenderUpload();
  if(_scanner.step === 'reading')    el.innerHTML = _scanRenderReading();
  if(_scanner.step === 'review')     el.innerHTML = _scanRenderReview();
  if(_scanner.step === 'advisories') el.innerHTML = _scanRenderAdvisories();
  if(_scanner.step === 'done')       el.innerHTML = _scanRenderDone();
}

// ── STEP 1: Upload ────────────────────────────────────────────────────────────
function _scanRenderUpload(){
  var cars = typeof loadCarsData === 'function' ? loadCarsData() : [];
  var car  = cars.find(function(c){ return c.id === _scanner.carId; });
  var carName = car ? (car.name || 'Car') : 'Car';
  var isRecordOnly = !car || !car.maintenanceFundId;

  var recordOnlyNote = isRecordOnly
    ? '<div class="scan-info-box" style="border-color:#1a2040;color:#7090f0;background:#0a0e1a;">📋 This is a record-only car — invoice will be saved to history only. No pocket deducted.</div>'
    : '<div class="scan-info-box">💸 Funded car — approved lines will deduct from the linked pocket + log to Cash Flow.</div>';

  return '<div class="scan-hdr">'
    +'<div class="scan-title">🧾 Scan Invoice</div>'
    +'<div class="scan-sub">'+_scanEsc(carName)+' · Odin reads it, you approve</div>'
    +'</div>'
    +recordOnlyNote
    +'<div class="scan-section-label">Upload the invoice</div>'
    +'<div class="scan-upload-grid">'
    +'<label class="scan-upload-opt scan-opt-primary" for="scanFileInput">'
    +'<div class="scan-upload-icon">📸</div>'
    +'<div class="scan-upload-name">Take Photo</div>'
    +'<div class="scan-upload-hint">Physical invoice / jobcard</div>'
    +'</label>'
    +'<label class="scan-upload-opt" for="scanFileInput">'
    +'<div class="scan-upload-icon">📄</div>'
    +'<div class="scan-upload-name">Upload PDF</div>'
    +'<div class="scan-upload-hint">Digital invoice from workshop</div>'
    +'</label>'
    +'</div>'
    +'<input type="file" id="scanFileInput" accept="image/*,application/pdf" capture="environment"'
    +' style="display:none" onchange="scanFileChosen(this)"/>'
    +'<div class="scan-info-box" style="margin-top:12px;">'
    +'💡 Odin will flag credits, R0 lines, VAT, and notes pages automatically. You confirm what gets logged.'
    +'</div>'
    +'<button class="scan-btn-ghost" onclick="closeOdinScanner()">Cancel</button>';
}

// ── Handle file selection ─────────────────────────────────────────────────────
function scanFileChosen(input){
  var file = input.files[0];
  if(!file) return;
  _scanner.mimeType = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
  _scanner.step = 'reading';
  _scanRender();

  var reader = new FileReader();
  reader.onload = function(e){
    _scanner.base64 = e.target.result.split(',')[1];
    _scanCallAI();
  };
  reader.readAsDataURL(file);
}

// ── STEP 2: Reading ───────────────────────────────────────────────────────────
function _scanRenderReading(){
  return '<div class="scan-hdr">'
    +'<div class="scan-title">🧠 Reading invoice...</div>'
    +'<div class="scan-sub">Extracting line items and workshop notes</div>'
    +'</div>'
    +'<div style="text-align:center;padding:32px 0 20px;">'
    +'<div style="font-size:44px;margin-bottom:14px;">🧠</div>'
    +'<div style="font-size:11px;color:#8ab820;letter-spacing:1px;margin-bottom:14px;" id="scanReadingLabel">Analysing invoice...</div>'
    +'<div style="height:5px;background:#1a1a1a;border-radius:3px;overflow:hidden;margin:0 20px;">'
    +'<div style="height:100%;background:#c8f230;border-radius:3px;transition:width 0.8s ease;" id="scanProgFill" style="width:15%"></div>'
    +'</div>'
    +'</div>'
    +'<div class="scan-info-box">Checking for credits · R0 lines · VAT · workshop notes · reconciling total...</div>';
}

function _scanAnimateProgress(){
  var steps = [
    {pct:'15%', text:'Reading invoice structure...'},
    {pct:'35%', text:'Extracting line items...'},
    {pct:'55%', text:'Checking for credits and R0 lines...'},
    {pct:'75%', text:'Extracting workshop notes...'},
    {pct:'90%', text:'Reconciling total...'},
  ];
  var i = 0;
  var iv = setInterval(function(){
    if(i >= steps.length){ clearInterval(iv); return; }
    var fill  = document.getElementById('scanProgFill');
    var label = document.getElementById('scanReadingLabel');
    if(fill)  fill.style.width  = steps[i].pct;
    if(label) label.textContent = steps[i].text;
    i++;
  }, 1000);
  return iv;
}

// ── Call Claude API ───────────────────────────────────────────────────────────
function _scanCallAI(){
  var apiKey = typeof bfGetApiKey === 'function' ? bfGetApiKey() : '';
  if(!apiKey){
    _scanner.step = 'upload';
    _scanRender();
    alert('No API key set. Go to Settings → Bank Feed AI Key and paste your Anthropic key first.');
    return;
  }

  var iv = _scanAnimateProgress();
  var isPDF = _scanner.mimeType === 'application/pdf';

  var systemPrompt = 'You are a workshop invoice parser for a South African car owner. '
    +'Extract all information and return ONLY valid JSON — no markdown, no explanation.\n'
    +'Return an object with these exact fields:\n'
    +'  lines: array of line items, each with:\n'
    +'    desc: string (description of the work/part)\n'
    +'    amount: number (always positive, ZAR)\n'
    +'    isZero: boolean (true if the amount is R0 — e.g. "NO NEED", "not required")\n'
    +'    isCredit: boolean (true if this is a credit/discount/refund reducing the total)\n'
    +'    isNote: boolean (true if this is a note/comment page, not a charge)\n'
    +'    include: boolean (default true; false for isZero, isNote lines)\n'
    +'  invoiceTotal: number (the printed TOTAL/AMOUNT DUE at the bottom of the invoice — what was actually paid)\n'
    +'  date: string (invoice date, ISO format YYYY-MM-DD)\n'
    +'  workshopName: string (name of the workshop/garage)\n'
    +'  advisories: array of workshop recommendations/notes, each with:\n'
    +'    text: string (the recommendation, e.g. "Coolant test FAIL — rebook")\n'
    +'    severity: "red"|"amber"|"blue" (red=action needed, amber=watch, blue=FYI)\n'
    +'Rules:\n'
    +'- isCredit lines REDUCE the total (e.g. trade-in credit, goodwill discount)\n'
    +'- If a credit line exists, flag it and use the FINAL printed total, not the sum of parts\n'
    +'- R0 lines = part/service was inspected but not needed — show greyed, default include:false\n'
    +'- Notes pages = text explanations, not charges — isNote:true, include:false\n'
    +'- VAT is usually included in South African invoices — do not add it twice\n'
    +'- advisories = any "check X", "replace Y soon", "monitor Z", "rebook for" type notes\n'
    +'- Return ONLY the JSON object, nothing else';

  var userText = 'This is a workshop invoice/jobcard for a car service. '
    +'Extract all line items, the printed total, and any workshop recommendations or advisory notes.';

  var messageContent = [
    {
      type: isPDF ? 'document' : 'image',
      source: { type: 'base64', media_type: _scanner.mimeType, data: _scanner.base64 }
    },
    { type: 'text', text: userText }
  ];

  fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'anthropic-beta': 'pdfs-2024-09-25'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: messageContent }]
    })
  })
  .then(function(r){ return r.json(); })
  .then(function(data){
    clearInterval(iv);
    var fill = document.getElementById('scanProgFill');
    if(fill) fill.style.width = '100%';

    if(data.error){
      _scanner.step = 'upload';
      _scanRender();
      var msg = data.error.message || 'API error';
      if(msg.includes('credit') || msg.includes('billing')){
        alert('Anthropic API credits needed. Go to console.anthropic.com → Plans & Billing to top up.');
      } else if(msg.includes('api_key') || msg.includes('auth')){
        alert('Invalid API key. Go to Settings → Bank Feed AI Key and check your key.');
      } else {
        alert('Could not read the invoice: ' + msg);
      }
      return;
    }

    var raw = '';
    if(data.content && data.content.length){
      for(var i=0;i<data.content.length;i++){
        if(data.content[i].type === 'text') raw += data.content[i].text;
      }
    }
    raw = raw.replace(/```json|```/g,'').trim();

    var parsed = {};
    try{ parsed = JSON.parse(raw); }catch(e){ parsed = {}; }

    _scanner.lines         = Array.isArray(parsed.lines) ? parsed.lines : [];
    _scanner.advisories    = Array.isArray(parsed.advisories) ? parsed.advisories : [];
    _scanner.invoiceTotal  = Number(parsed.invoiceTotal) || 0;
    _scanner.date          = parsed.date || _scanner.date;
    _scanner.workshopName  = parsed.workshopName || '';

    // Calculate captured total (only included non-credit lines)
    _scanRecalcTotal();

    _scanner.step = _scanner.lines.length ? 'review' : 'upload';
    if(!_scanner.lines.length){
      alert('No line items found. Try a clearer photo or different file.');
    }
    _scanRender();
  })
  .catch(function(err){
    clearInterval(iv);
    console.error('Odin scanner error:', err);
    _scanner.step = 'upload';
    _scanRender();
    alert('Could not read the invoice. Please try again.');
  });
}

function _scanRecalcTotal(){
  _scanner.capturedTotal = _scanner.lines.reduce(function(s, l){
    if(!l.include) return s;
    if(l.isCredit) return s - Number(l.amount || 0);
    return s + Number(l.amount || 0);
  }, 0);
}

// ── STEP 3: Review line items ─────────────────────────────────────────────────
function _scanRenderReview(){
  _scanRecalcTotal();
  var lines = _scanner.lines;
  var diff  = Math.abs(_scanner.capturedTotal - _scanner.invoiceTotal);
  var reconciled = diff < 0.10;

  var reconcileHtml = _scanner.invoiceTotal > 0
    ? '<div class="scan-reconcile '+(reconciled?'scan-reconcile-ok':'scan-reconcile-warn')+'">'
      +(reconciled
        ? '✓ Captured R'+_scanner.capturedTotal.toFixed(2)+' matches invoice total R'+_scanner.invoiceTotal.toFixed(2)+' — nothing missed.'
        : '⚠️ Captured R'+_scanner.capturedTotal.toFixed(2)+' vs invoice total R'+_scanner.invoiceTotal.toFixed(2)+' — R'+diff.toFixed(2)+' gap. Check the lines below.')
      +'</div>'
    : '';

  var linesHtml = lines.map(function(l, i){
    var isZero   = l.isZero   || l.amount === 0;
    var isCredit = l.isCredit || false;
    var isNote   = l.isNote   || false;
    var included = l.include  !== false;

    var rowClass = 'scan-line-row';
    if(!included) rowClass += ' scan-line-greyed';
    if(isCredit)  rowClass += ' scan-line-credit';

    var amtColor = isCredit ? '#f2a830' : isZero ? '#333' : (included ? '#c8f230' : '#444');
    var amtText  = isCredit ? '-R'+Number(l.amount||0).toFixed(2)
                 : isZero   ? 'R0'
                 : 'R'+Number(l.amount||0).toFixed(2);

    var badge = '';
    if(isCredit) badge = '<span class="scan-badge scan-badge-orange">Credit</span>';
    if(isZero)   badge = '<span class="scan-badge scan-badge-grey">Not needed</span>';
    if(isNote)   badge = '<span class="scan-badge scan-badge-blue">Note</span>';

    var toggle = '<button onclick="scanToggleLine('+i+')" class="scan-toggle-btn '+(included?'scan-toggle-on':'scan-toggle-off')+'">'
      +(included?'✓ Include':'Skip')+'</button>';

    return '<div class="'+rowClass+'" id="scanLine'+i+'">'
      +'<div class="scan-line-left">'
      +'<div class="scan-line-desc">'+_scanEsc(l.desc||'—')+'</div>'
      +(badge?'<div style="margin-top:4px;">'+badge+'</div>':'')
      +'</div>'
      +'<div class="scan-line-right">'
      +'<div class="scan-line-amt" style="color:'+amtColor+'">'+amtText+'</div>'
      +toggle
      +'</div>'
      +'</div>';
  }).join('');

  var workshop = _scanner.workshopName ? ' · '+_scanner.workshopName : '';
  var advCount = _scanner.advisories.length;
  var advNote  = advCount > 0
    ? '<div class="scan-info-box" style="margin-top:12px;">🔧 '+advCount+' workshop advisory note'+(advCount>1?'s':'')+' found — you\'ll review them on the next screen.</div>'
    : '';

  return '<div class="scan-hdr">'
    +'<div class="scan-title">'+lines.length+' line items</div>'
    +'<div class="scan-sub">'+_scanner.date+workshop+'</div>'
    +'</div>'
    +reconcileHtml
    +'<div class="scan-section-label">Review — tap to include/skip</div>'
    +linesHtml
    +advNote
    +'<div style="margin-top:16px;">'
    +'<button class="scan-btn-primary" onclick="scanProceedToApprove()">Approve & log →</button>'
    +'<button class="scan-btn-ghost" onclick="closeOdinScanner()">Cancel</button>'
    +'</div>';
}

function scanToggleLine(i){
  _scanner.lines[i].include = !_scanner.lines[i].include;
  _scanRender();
}

// ── STEP 3b: Advisory review ──────────────────────────────────────────────────
function scanProceedToApprove(){
  if(_scanner.advisories.length > 0){
    _scanner.step = 'advisories';
  } else {
    _scanApproveAll();
    return;
  }
  _scanRender();
}

function _scanRenderAdvisories(){
  var advs = _scanner.advisories;
  var rows = advs.map(function(a, i){
    var col   = a.severity === 'red' ? '#f23060' : a.severity === 'amber' ? '#f2a830' : '#7090f0';
    var bg    = a.severity === 'red' ? '#1a0505' : a.severity === 'amber' ? '#1a0d00' : '#050a1a';
    var bdr   = a.severity === 'red' ? '#3a1010' : a.severity === 'amber' ? '#3a2000' : '#101a3a';
    var emoji = a.severity === 'red' ? '🔴' : a.severity === 'amber' ? '🟠' : '🔵';
    var included = a.include !== false;

    return '<div style="background:'+bg+';border:1px solid '+bdr+';border-radius:8px;padding:12px 14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">'
      +'<div style="flex:1;">'
      +'<div style="font-size:11px;color:'+col+';margin-bottom:4px;">'+emoji+' '+_scanEsc(a.text)+'</div>'
      +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">'
      +'<button onclick="scanSetAdvSeverity('+i+',\'red\')" style="padding:3px 8px;border-radius:4px;font-size:9px;cursor:pointer;border:1px solid '+(a.severity==='red'?'#f23060':'#333')+';background:'+(a.severity==='red'?'#2e0a0a':'#111')+';color:'+(a.severity==='red'?'#f23060':'#555')+';">🔴 Action</button>'
      +'<button onclick="scanSetAdvSeverity('+i+',\'amber\')" style="padding:3px 8px;border-radius:4px;font-size:9px;cursor:pointer;border:1px solid '+(a.severity==='amber'?'#f2a830':'#333')+';background:'+(a.severity==='amber'?'#2e1a00':'#111')+';color:'+(a.severity==='amber'?'#f2a830':'#555')+';">🟠 Watch</button>'
      +'<button onclick="scanSetAdvSeverity('+i+',\'blue\')" style="padding:3px 8px;border-radius:4px;font-size:9px;cursor:pointer;border:1px solid '+(a.severity==='blue'?'#7090f0':'#333')+';background:'+(a.severity==='blue'?'#050a1a':'#111')+';color:'+(a.severity==='blue'?'#7090f0':'#555')+';">🔵 FYI</button>'
      +'<button onclick="scanRemoveAdvisory('+i+')" style="padding:3px 8px;border-radius:4px;font-size:9px;cursor:pointer;border:1px solid #333;background:#111;color:#555;">✕ Remove</button>'
      +'</div>'
      +'</div>'
      +'</div>';
  }).join('');

  return '<div class="scan-hdr">'
    +'<div class="scan-title">'+advs.length+' workshop note'+(advs.length>1?'s':'')+'</div>'
    +'<div class="scan-sub">Review severity — these pin to the car card</div>'
    +'</div>'
    +'<div class="scan-info-box">🔧 These are the mechanic\'s recommendations. Adjust severity if needed, remove any that aren\'t relevant.</div>'
    +'<div style="margin-top:12px;">'+rows+'</div>'
    +'<div style="margin-top:16px;">'
    +'<button class="scan-btn-primary" onclick="_scanApproveAll()">✓ Save everything</button>'
    +'<button class="scan-btn-ghost" onclick="_scanner.step=\'review\';_scanRender()">← Back to lines</button>'
    +'</div>';
}

function scanSetAdvSeverity(i, sev){
  _scanner.advisories[i].severity = sev;
  _scanRender();
}

function scanRemoveAdvisory(i){
  _scanner.advisories.splice(i, 1);
  _scanRender();
}

// ── STEP 4: Approve all ───────────────────────────────────────────────────────
function _scanApproveAll(){
  var cars    = typeof loadCarsData === 'function' ? loadCarsData() : [];
  var car     = cars.find(function(c){ return c.id === _scanner.carId; });
  if(!car){ alert('Car not found.'); return; }

  var includedLines = _scanner.lines.filter(function(l){ return l.include !== false && !l.isNote; });

  if(includedLines.length === 0){
    alert('No lines selected to log. Tap ✓ Include on at least one line.');
    return;
  }

  // Pre-fill the Log Expense form with the scanner's data
  // Use the REAL openAddExpense then fill in fields
  closeOdinScanner();

  // Small delay to let the scanner modal close
  setTimeout(function(){
    openAddExpense(_scanner.carId);

    // Fill description — combine all included line items
    var descEl = document.getElementById('expenseDesc');
    if(descEl){
      var desc = includedLines.length === 1
        ? includedLines[0].desc
        : (_scanner.workshopName || 'Workshop service') + ' · ' + includedLines.length + ' items';
      descEl.value = desc;
    }

    // Fill amount — capturedTotal of included lines
    _scanRecalcTotal();
    var amtEl = document.getElementById('expenseAmt');
    if(amtEl) amtEl.value = _scanner.capturedTotal.toFixed(2);

    // Fill date
    var dateEl = document.getElementById('expenseDate');
    if(dateEl) dateEl.value = _scanner.date;

    // Set category to Service
    if(typeof setSelectedCategories === 'function') setSelectedCategories(['🔧 Service']);

    // If there are advisories, save them now
    if(_scanner.advisories.length > 0 && typeof saveAdvisory === 'function'){
      _scanner.advisories.forEach(function(a){
        saveAdvisory(_scanner.carId, {
          severity:    a.severity || 'amber',
          text:        a.text,
          flaggedDate: _scanner.date,
          source:      _scanner.workshopName || 'Invoice scan'
        });
      });
    }

    _scanner.step = 'done';
  }, 300);
}

// ── STEP 5: Done ──────────────────────────────────────────────────────────────
function _scanRenderDone(){
  return '<div style="text-align:center;padding:32px 0 20px;">'
    +'<div style="font-size:48px;margin-bottom:14px;">✅</div>'
    +'<div style="font-family:Syne,sans-serif;font-weight:800;font-size:20px;letter-spacing:-0.5px;">Invoice logged</div>'
    +'<div style="font-size:11px;color:#888;margin-top:6px;letter-spacing:1px;">Log Expense form pre-filled — tap Save to confirm</div>'
    +'</div>'
    +'<div class="scan-info-box">The form is pre-filled with the invoice total and description. Review it and tap Save Entry to complete.</div>'
    +'<div style="margin-top:16px;">'
    +'<button class="scan-btn-primary" onclick="closeOdinScanner()">Go to form →</button>'
    +'</div>';
}

// ── Utility ───────────────────────────────────────────────────────────────────
function _scanEsc(s){
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Expose globals ────────────────────────────────────────────────────────────
window.openOdinScanner  = openOdinScanner;
window.closeOdinScanner = closeOdinScanner;
window.scanFileChosen   = scanFileChosen;
window.scanToggleLine   = scanToggleLine;
window.scanProceedToApprove = scanProceedToApprove;
window.scanSetAdvSeverity   = scanSetAdvSeverity;
window.scanRemoveAdvisory   = scanRemoveAdvisory;
window._scanApproveAll      = _scanApproveAll;
