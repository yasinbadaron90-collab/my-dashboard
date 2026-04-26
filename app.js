/* My Dashboard V34 — Application Logic */
/* Auto-extracted from single-file HTML */

// ── Robust storage: tries localStorage → sessionStorage → memory ──
// MUST be defined first — used by PIN system and everything else
const _lsMem = {};
function lsSet(key, val){
  _lsMem[key] = val;
  try{ localStorage.setItem(key, val); return; } catch(e){}
  try{ sessionStorage.setItem(key, val); return; } catch(e){}
}
function lsGet(key, fallback){
  try{ const v = localStorage.getItem(key); if(v !== null) return v; } catch(e){}
  try{ const v = sessionStorage.getItem(key); if(v !== null) return v; } catch(e){}
  return (_lsMem[key] !== undefined) ? _lsMem[key] : (fallback || null);
}
// ── All storage keys — defined early to avoid ReferenceError ──
const PIN_STORE_KEY      = 'yb_pins';
const SK                 = 'yasin_funds_v16';
const CPK                = 'yasin_carpool_v4';
const BORROW_KEY         = 'yasin_borrows_v1';
const SYNC_KEY           = 'yasin_sync_meta_v1';
const PRAYER_KEY         = 'yasin_prayer_v1';
const MAINT_KEY          = 'yasin_maint_v1';
const MAINT_TARGET       = 1500;
const SCHOOL_EVENTS_KEY  = 'yasin_school_events_v1';
const SCHOOL_RESULTS_KEY = 'yasin_school_results_v1';
const SCHOOL_DONE_KEY    = 'yasin_school_done_v1';
const FUEL_KEY           = 'yasin_fuel_v1';
const DAILY_FUEL_KEY     = 'yb_daily_fuel';
const PRICING_TANK_KEY   = 'yb_pricing_tank';
const PRICING_PRIVATE_KEY= 'yb_pricing_private';
const PASSENGERS_KEY     = 'yb_passengers_v1';
const CF_KEY             = 'yb_cashflow_v1';
const CUSTOM_MAINT_KEY   = 'yasin_maint_cards_v1';
const CARS_KEY           = 'yasin_cars_v1';
const DRIVER_KEY         = 'yasin_drivers_v1';
const INST_KEY           = 'yasin_instalments_v1';
const EXTERNAL_BORROW_KEY= 'yb_external_borrows_v1';

// Seed memory from whatever storage is available
(function seedMem(){
  const keys = [SK,CPK,BORROW_KEY,FUEL_KEY,PRAYER_KEY,MAINT_KEY,SYNC_KEY,PIN_STORE_KEY,INST_KEY,DRIVER_KEY,CARS_KEY,SCHOOL_EVENTS_KEY,SCHOOL_RESULTS_KEY,SCHOOL_DONE_KEY,PASSENGERS_KEY,CF_KEY,CUSTOM_MAINT_KEY,EXTERNAL_BORROW_KEY,DAILY_FUEL_KEY,PRICING_TANK_KEY,PRICING_PRIVATE_KEY];
  keys.forEach(function(k){
    try{ const v=localStorage.getItem(k); if(v){ _lsMem[k]=v; return; } }catch(e){}
    try{ const v=sessionStorage.getItem(k); if(v) _lsMem[k]=v; }catch(e){}
  });
})();


const PIN_DEFAULTS = {
  '2610': { role: 'admin',      name: 'Yasin'   },
  '1111': { role: 'user',       name: 'David'   },
  '2222': { role: 'user',       name: 'Shireen' },
  '3333': { role: 'user',       name: 'Lezaun'  },
  '2709': { role: 'carservice', name: 'Munier'  }
};

function loadPINS(){
  try {
    const saved = JSON.parse(lsGet(PIN_STORE_KEY));
    return saved || PIN_DEFAULTS;
  } catch(e){ return PIN_DEFAULTS; }
}
function savePINS(pins){ lsSet(PIN_STORE_KEY, JSON.stringify(pins)); }
let PINS = loadPINS();
let currentRole = 'guest';
let currentUser = null;
let pinEntry = "";

function pinPress(n){if(pinEntry.length>=4)return;pinEntry+=String(n);updateDots();if(pinEntry.length===4)setTimeout(checkPin,150);}
function pinDel(){pinEntry=pinEntry.slice(0,-1);updateDots();document.getElementById("pinError").textContent="";}
function updateDots(){for(let i=0;i<4;i++){const d=document.getElementById("dot"+i);if(i<pinEntry.length){d.style.background="#c8f230";d.style.borderColor="#c8f230";}else{d.style.background="transparent";d.style.borderColor="#333";}}}
document.addEventListener('keydown',function(e){
  const screen=document.getElementById('loginScreen');
  if(!screen||screen.style.display==='none')return;
  if(e.key>='0'&&e.key<='9'){pinPress(parseInt(e.key));}
  else if(e.key==='Backspace'){pinDel();}
});
function checkPin(){
  const match = PINS[pinEntry];
  if(match){
    currentRole = match.role;
    currentUser = match.name;
    const s=document.getElementById("loginScreen");
    s.style.opacity="0";
    setTimeout(function(){
      s.style.display="none";
      applyRole();
      document.getElementById('drawerLogoutBtn').style.display = 'flex';
      // After successful PIN login, offer to register biometric if admin
      if(currentRole === 'admin' && window.PublicKeyCredential && !lsGet('yb_biometric_registered')){
        setTimeout(offerBiometricRegistration, 800);
      }
      showLaunchMenu();
    },400);
  } else {
    document.getElementById("pinError").textContent="Incorrect PIN. Try again.";
    pinEntry="";updateDots();
    const dots=document.getElementById("pinDots");
    dots.style.transition="transform 0.1s";
    dots.style.transform="translateX(10px)";
    setTimeout(function(){dots.style.transform="translateX(-10px)";},100);
    setTimeout(function(){dots.style.transform="translateX(0)";},200);
  }
}

// ══ WEBAUTHN BIOMETRIC ══
const BIOMETRIC_KEY = 'yb_biometric_registered';
const BIOMETRIC_CRED_KEY = 'yb_biometric_credid';
const RP_ID = 'yasinbadaron90-collab.github.io';
const RP_NAME = 'YB Dashboard';

function biometricSupported(){
  return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
}

function showPinFallback(){
  document.getElementById('biometricSection').style.display = 'none';
  document.getElementById('pinSection').style.display = 'block';
  document.getElementById('loginSubtitle').textContent = 'Enter PIN to continue';
}

function loginSuccess(name, role){
  currentRole = role;
  currentUser = name;
  const s = document.getElementById('loginScreen');
  s.style.opacity = '0';
  setTimeout(function(){
    s.style.display = 'none';
    applyRole();
    document.getElementById('drawerLogoutBtn').style.display = 'flex';
    showLaunchMenu();
  }, 400);
}

// ── Called on page load — check if biometric is registered ──
function initBiometricLogin(){
  if(!biometricSupported()) return;
  const registered = lsGet(BIOMETRIC_KEY);
  if(registered === 'true'){
    // Show fingerprint button, hide PIN by default
    document.getElementById('biometricSection').style.display = 'block';
    document.getElementById('pinSection').style.display = 'none';
    document.getElementById('loginSubtitle').textContent = 'Use fingerprint or PIN to continue';
    // Auto-trigger biometric after short delay
    setTimeout(biometricLogin, 400);
  }
}

// ── Trigger fingerprint authentication ──
async function biometricLogin(){
  const statusEl = document.getElementById('biometricStatus');
  const btn = document.getElementById('biometricBtn');
  if(statusEl) statusEl.textContent = 'Scanning…';
  if(btn){ btn.style.borderColor = '#f2a830'; btn.style.background = '#1a1200'; }

  try {
    const credIdB64 = lsGet(BIOMETRIC_CRED_KEY);
    if(!credIdB64){ showPinFallback(); return; }

    // Decode stored credential ID
    const credIdBytes = Uint8Array.from(atob(credIdB64), function(c){ return c.charCodeAt(0); });

    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: RP_ID,
        allowCredentials: [{ id: credIdBytes, type: 'public-key' }],
        userVerification: 'required',
        timeout: 60000
      }
    });

    if(assertion){
      if(statusEl) statusEl.textContent = '✓ Unlocked!';
      if(btn){ btn.style.borderColor = '#c8f230'; btn.style.background = '#0d1a00'; }
      setTimeout(function(){
        loginSuccess('Yasin', 'admin');
      }, 300);
    }
  } catch(err){
    if(err.name === 'NotAllowedError'){
      if(statusEl) statusEl.textContent = 'Cancelled — try again';
    } else {
      if(statusEl) statusEl.textContent = 'Biometric failed — use PIN';
      setTimeout(showPinFallback, 1500);
    }
    if(btn){ btn.style.borderColor = '#f23060'; btn.style.background = '#1a0505'; }
    setTimeout(function(){
      if(btn){ btn.style.borderColor = '#c8f230'; btn.style.background = '#0d1a00'; }
      if(statusEl) statusEl.textContent = 'Touch to unlock';
    }, 2000);
  }
}

// ── Register biometric — called after first successful PIN login ──
async function registerBiometric(){
  if(!biometricSupported()){
    alert('Your browser does not support biometric authentication.');
    return;
  }
  try {
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);
    const userId = new Uint8Array(16);
    crypto.getRandomValues(userId);

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { id: RP_ID, name: RP_NAME },
        user: { id: userId, name: 'yasin', displayName: 'Yasin' },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },   // ES256
          { alg: -257, type: 'public-key' }  // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred'
        },
        timeout: 60000,
        attestation: 'none'
      }
    });

    if(credential){
      // Store credential ID as base64
      const credIdArr = new Uint8Array(credential.rawId);
      const credIdB64 = btoa(String.fromCharCode.apply(null, credIdArr));
      lsSet(BIOMETRIC_CRED_KEY, credIdB64);
      lsSet(BIOMETRIC_KEY, 'true');
      return true;
    }
  } catch(err){
    console.warn('Biometric registration failed:', err);
    return false;
  }
}

// ── Offer to register biometric after first admin PIN login ──
function offerBiometricRegistration(){
  if(!biometricSupported()) return;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9998;display:flex;align-items:center;justify-content:center;padding:24px;';
  overlay.innerHTML =
    '<div style="background:#111;border:1px solid #2a2a2a;border-radius:14px;padding:28px 24px;max-width:320px;width:100%;text-align:center;">'
    +'<div style="font-size:48px;margin-bottom:16px;">👆</div>'
    +'<div style="font-family:\'Syne\',sans-serif;font-weight:800;font-size:18px;color:#efefef;margin-bottom:8px;">Enable Fingerprint Login?</div>'
    +'<div style="font-size:11px;color:#555;letter-spacing:0.5px;line-height:1.7;margin-bottom:24px;">Skip the PIN next time — just touch your fingerprint sensor to unlock your dashboard instantly.</div>'
    +'<button onclick="confirmBiometricSetup(this.parentElement.parentElement)" style="width:100%;padding:14px;background:#c8f230;border:none;border-radius:8px;color:#000;font-family:\'DM Mono\',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;font-weight:700;margin-bottom:10px;">👆 Enable Fingerprint</button>'
    +'<button onclick="this.parentElement.parentElement.remove()" style="width:100%;padding:12px;background:none;border:1px solid #2a2a2a;border-radius:8px;color:#555;font-family:\'DM Mono\',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;">Not Now</button>'
    +'</div>';
  document.body.appendChild(overlay);
}

async function confirmBiometricSetup(overlay){
  const btn = overlay.querySelector('button');
  if(btn){ btn.textContent = '⏳ Scanning…'; btn.disabled = true; }
  const success = await registerBiometric();
  if(overlay) overlay.remove();
  if(success){
    // Show success toast
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:#0d1a00;border:1px solid #c8f230;border-radius:8px;padding:12px 20px;z-index:9999;font-family:DM Mono,monospace;font-size:11px;color:#c8f230;letter-spacing:1px;white-space:nowrap;';
    toast.textContent = '✓ Fingerprint registered! Use it next time you open the app.';
    document.body.appendChild(toast);
    setTimeout(function(){ toast.remove(); }, 4000);
  } else {
    alert('Fingerprint setup failed. You can try again from Settings.');
  }
}

// ── Remove biometric (for Settings) ──
function removeBiometric(){
  if(!confirm('Remove fingerprint login? You\'ll need your PIN to log in again.')) return;
  try{ localStorage.removeItem(BIOMETRIC_KEY); }catch(e){}
  try{ localStorage.removeItem(BIOMETRIC_CRED_KEY); }catch(e){}
  lsSet(BIOMETRIC_KEY, null);
  lsSet(BIOMETRIC_CRED_KEY, null);
  alert('Fingerprint removed. PIN login will be used next time.');
}

// ── Run on page load ──
document.addEventListener('DOMContentLoaded', function(){
  initBiometricLogin();
});


function applyRole(){
  if(currentRole==='admin'){
    // Admin: start on carpool, show both nav tabs
    document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
    document.getElementById('page-carpool').classList.add('active');
    document.getElementById('navCarpool').classList.add('active');
    document.getElementById('navSavings').classList.remove('active');
    renderCarpool();
    // Fire reminders after a short delay
    setTimeout(checkReminders, 800);
    return;
  }

  // Car Service role — only show the Cars tab
  if(currentRole === 'carservice'){
    document.querySelectorAll('.admin-only').forEach(function(el){ el.style.display='none'; });
    // Reveal the data section for carservice users
    document.querySelectorAll('.carservice-show').forEach(function(el){ el.style.display=''; });
    // Show the Cars nav tab only
    document.getElementById('navSavings').style.display = 'none';
    document.getElementById('navCarpool').style.display = 'none';
    var navCars = document.getElementById('navCars');
    if(navCars){ navCars.style.display = ''; navCars.classList.add('active'); navCars.style.pointerEvents = 'none'; }
    // Show hamburger (so they can access data options)
    var hbg = document.getElementById('hbgBtn');
    if(hbg) hbg.style.display = '';
    // Show Cars page
    document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
    document.getElementById('page-cars').classList.add('active');
    document.getElementById('page-cars').style.display = 'block';
    renderCars();
    return;
  }

  // Passenger role
  // Hide admin-only elements
  document.querySelectorAll('.admin-only').forEach(function(el){ el.style.display='none'; });

  // Hide nav tabs entirely for passengers
  document.getElementById('navSavings').style.display = 'none';
  document.getElementById('navCarpool').style.display = 'none';

  // Also hide hamburger button for passengers
  var hbg = document.getElementById('hbgBtn');
  if(hbg) hbg.style.display = 'none';

  // Switch to carpool
  document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
  document.getElementById('page-carpool').classList.add('active');

  // Re-render carpool filtered to this user
  renderCarpool();

  // Open the left statement pane automatically
  const pane = document.getElementById('cpLeftPane');
  if(pane && pane.classList.contains('collapsed')) togglePane();

  // Lock passenger selector to only show current user, hide others
  document.querySelectorAll('.pass-opt').forEach(function(el){
    if(el.getAttribute('data-name') === currentUser){
      el.classList.add('selected');
      el.style.pointerEvents = 'none';
    } else {
      el.classList.remove('selected');
      el.style.display = 'none';
    }
  });

  // Auto-fill current month date range
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay  = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fmt = function(d){ return d.toISOString().slice(0,10); };
  const sfrom = document.getElementById('stmtFrom');
  const sto   = document.getElementById('stmtTo');
  if(sfrom) sfrom.value = fmt(firstDay);
  if(sto)   sto.value   = fmt(lastDay);

  // Auto-generate their statement
  setTimeout(generateStatements, 200);
}

function logout(){
  currentRole = 'guest';
  currentUser = null;
  pinEntry = '';
  updateDots();
  document.getElementById('pinError').textContent = '';
  document.getElementById('drawerLogoutBtn').style.display = 'none';
  // Restore hamburger button
  var hbg = document.getElementById('hbgBtn');
  if(hbg) hbg.style.display = '';
  // Restore savings + carpool nav tabs
  document.getElementById('navSavings').style.display = '';
  document.getElementById('navCarpool').style.display = '';
  // Restore Cars nav tab pointer events (in case carservice user was logged in)
  var navCars = document.getElementById('navCars');
  if(navCars){ navCars.style.pointerEvents = ''; navCars.classList.remove('active'); }
  // Restore admin-only elements (skip page divs — tab visibility controlled by CSS)
  document.querySelectorAll('.admin-only').forEach(function(el){
    if(el.classList.contains('page')) return;
    el.style.display='';
  });
  // Hide carservice-specific reveals (admin-only will re-show them properly)
  document.querySelectorAll('.carservice-show').forEach(function(el){ el.style.display=''; });
  // Show login screen
  const s = document.getElementById('loginScreen');
  s.style.display = 'flex';
  s.style.opacity = '1';
  // Reset to carpool page
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-carpool').classList.add('active');
  document.getElementById('navCarpool').classList.add('active');
  document.getElementById('navSavings').classList.remove('active');
  renderCarpool();
}

// ── DRAWER ──
function openDrawer(){
  document.getElementById('hbgDrawer').classList.add('open');
  document.getElementById('hbgOverlay').classList.add('open');
}
function closeDrawer(){
  document.getElementById('hbgDrawer').classList.remove('open');
  document.getElementById('hbgOverlay').classList.remove('open');
}

// ── THEME TOGGLE ──
function toggleTheme(){
  var isLight = document.documentElement.classList.toggle('light');
  lsSet('yasin_theme_light', isLight ? '1' : '0');
  var lbl = document.getElementById('themeLabel');
  if(lbl) lbl.textContent = isLight ? 'Dark Mode' : 'Light Mode';
}
(function initTheme(){
  var saved = lsGet('yasin_theme_light');
  if(saved === '1'){
    document.documentElement.classList.add('light');
    var lbl = document.getElementById('themeLabel');
    if(lbl) lbl.textContent = 'Dark Mode';
  }
})();

// ── EXPORT RESULTS AS PDF-STYLE HTML ──
function exportResults(){
  if(typeof window.jspdf === 'undefined'){
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = function(){ buildResultsPDF(); };
    document.head.appendChild(s);
  } else {
    buildResultsPDF();
  }
}

function buildResultsPDF(){
  var yearData = ALL_YEARS_DATA[_activeYearIdx];
  var subjects = yearData.subjects;
  var withResults = subjects.filter(function(x){ return x.finalPct !== null; });
  var avgFinal = withResults.length > 0
    ? (withResults.reduce(function(s,x){ return s+x.finalPct; },0) / withResults.length).toFixed(1)
    : null;

  // Toast
  var toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1a1a1a;border:1px solid #3a5a00;border-radius:10px;padding:14px 20px;display:flex;align-items:center;gap:12px;z-index:9999;box-shadow:0 4px 24px rgba(0,0,0,.5);min-width:240px;';
  toast.innerHTML =
    '<div style="width:18px;height:18px;border:2px solid #3a5a00;border-top-color:#c8f230;border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0;"></div>'
    +'<div><div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:13px;color:#efefef;">Generating PDF...</div>'
    +'<div style="font-size:10px;color:#555;margin-top:2px;letter-spacing:1px;">'+yearData.year+' · Yasin Badaron</div></div>';
  if(!document.getElementById('spinStyle')){
    var sp=document.createElement('style');sp.id='spinStyle';
    sp.textContent='@keyframes spin{to{transform:rotate(360deg);}}';
    document.head.appendChild(sp);
  }
  document.body.appendChild(toast);

  var {jsPDF} = window.jspdf;
  var doc = new jsPDF({unit:'mm', format:'a4'});

  // Background
  doc.setFillColor(10,10,10); doc.rect(0,0,210,297,'F');
  // Accent top bar
  doc.setFillColor(200,242,48); doc.rect(0,0,210,2,'F');

  // Header
  doc.setTextColor(90,136,0); doc.setFontSize(8); doc.setFont('helvetica','normal');
  doc.text('STATEMENT OF RESULTS', 20, 14);
  doc.text('REGENT BUSINESS SCHOOL', 190, 14, {align:'right'});

  doc.setTextColor(200,242,48); doc.setFontSize(24); doc.setFont('helvetica','bold');
  doc.text('Yasin Badaron', 20, 26);

  doc.setTextColor(85,85,85); doc.setFontSize(9); doc.setFont('helvetica','normal');
  doc.text('Bachelor of Commerce · Student No: 12446490 · SAQA ID: 71778', 20, 33);

  // Year + avg (top right)
  doc.setTextColor(200,242,48); doc.setFontSize(18); doc.setFont('helvetica','bold');
  doc.text(yearData.year, 190, 22, {align:'right'});
  doc.setTextColor(85,85,85); doc.setFontSize(9); doc.setFont('helvetica','normal');
  doc.text(yearData.period, 190, 28, {align:'right'});
  if(avgFinal){
    doc.setTextColor(200,242,48); doc.setFontSize(22); doc.setFont('helvetica','bold');
    doc.text(avgFinal+'%', 190, 37, {align:'right'});
    doc.setTextColor(85,85,85); doc.setFontSize(7); doc.setFont('helvetica','normal');
    doc.text('AVERAGE', 190, 41, {align:'right'});
  }

  // Divider
  doc.setDrawColor(200,242,48); doc.setLineWidth(0.5); doc.line(20,44,190,44);

  // Table header
  var y = 52;
  var cols = {module:20, code:90, year:120, exam:138, final:156, result:172};
  doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(85,85,85);
  doc.text('MODULE',        cols.module, y);
  doc.text('CODE',          cols.code,   y);
  doc.text('YEAR %',        cols.year,   y, {align:'center'});
  doc.text('EXAM %',        cols.exam,   y, {align:'center'});
  doc.text('FINAL %',       cols.final,  y, {align:'center'});
  doc.text('RESULT',        cols.result, y, {align:'center'});
  doc.setDrawColor(40,40,40); doc.setLineWidth(0.3); doc.line(20,y+3,190,y+3);
  y += 10;

  // Rows
  subjects.forEach(function(sub){
    var isExm = sub.result === 'EXM';

    // Result badge color
    var rc = sub.result==='PD'||sub.result==='PDS' ? [200,242,48]
           : sub.result==='P'||sub.result==='PS'   ? [52,211,153]
           : sub.result==='F'||sub.result==='FS'   ? [242,48,96]
           : sub.result==='EXM'                    ? [136,136,136]
           : [136,136,136];

    // Module name (wrap if long)
    doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.setTextColor(239,239,239);
    var modName = doc.splitTextToSize(sub.name, 60);
    doc.text(modName, cols.module, y);

    doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(85,85,85);
    doc.text(sub.code, cols.code, y);

    // Year %
    doc.setFontSize(10); doc.setTextColor(239,239,239);
    doc.text(isExm||sub.yearPct===null ? '—' : sub.yearPct+'%', cols.year, y, {align:'center'});
    // Exam %
    doc.text(isExm||sub.examPct===null ? '—' : sub.examPct+'%', cols.exam, y, {align:'center'});
    // Final %
    if(sub.finalPct!==null){
      doc.setTextColor(200,242,48); doc.setFont('helvetica','bold');
      doc.text(sub.finalPct+'%', cols.final, y, {align:'center'});
    } else {
      doc.setTextColor(50,50,50); doc.setFont('helvetica','normal');
      doc.text('—', cols.final, y, {align:'center'});
    }

    // Result badge
    if(sub.result){
      var bw = 18; var bh = 6;
      var bx = cols.result - bw/2; var by = y - 4.5;
      doc.setFillColor(rc[0], rc[1], rc[2]);
      doc.setDrawColor(rc[0], rc[1], rc[2]);
      doc.roundedRect(bx, by, bw, bh, 1.5, 1.5, 'F');
      doc.setTextColor(isExm ? 255:10, isExm?255:10, isExm?255:10);
      doc.setFontSize(7); doc.setFont('helvetica','bold');
      doc.text(sub.result, cols.result, y, {align:'center'});
    } else {
      doc.setTextColor(50,50,50); doc.setFontSize(10);
      doc.text('—', cols.result, y, {align:'center'});
    }

    // Quiz & assignment scores as small note below if present
    var lineH = modName.length > 1 ? 7*modName.length : 7;
    if(sub.quizScore!==null || sub.assessmentScore!==null){
      doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(85,85,85);
      var extras = [];
      if(sub.quizScore!==null) extras.push('Quiz: '+sub.quizScore+'%');
      if(sub.assessmentScore!==null) extras.push('Assignment: '+sub.assessmentScore+'%');
      doc.text(extras.join('  ·  '), cols.module, y+lineH-2);
      lineH += 4;
    }

    doc.setDrawColor(30,30,30); doc.setLineWidth(0.2); doc.line(20, y+lineH, 190, y+lineH);
    y += lineH + 6;
  });

  // Footer
  doc.setDrawColor(200,242,48); doc.setLineWidth(0.3); doc.line(20,280,190,280);
  doc.setTextColor(50,50,50); doc.setFontSize(7); doc.setFont('helvetica','normal');
  doc.text('Exported from YB Dashboard · '+new Date().toLocaleDateString('en-ZA',{day:'numeric',month:'long',year:'numeric'}), 20, 285);
  doc.text('Regent Business School · SAQA ID: 71778', 190, 285, {align:'right'});

  // Save
  doc.save('Results_'+yearData.year.replace(' ','_')+'_Yasin_Badaron.pdf');

  // Update toast
  setTimeout(function(){
    toast.innerHTML =
      '<div style="width:18px;height:18px;background:#1a2e00;border:2px solid #3a5a00;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;color:#c8f230;">✓</div>'
      +'<div><div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:13px;color:#c8f230;">PDF Downloaded!</div>'
      +'<div style="font-size:10px;color:#555;margin-top:2px;letter-spacing:1px;">Saved to your Downloads folder</div></div>';
    toast.style.borderColor = '#3a5a00';
    setTimeout(function(){
      toast.style.transition='opacity .4s'; toast.style.opacity='0';
      setTimeout(function(){ if(toast.parentNode) toast.parentNode.removeChild(toast); },400);
    },2500);
  },800);
}

function addFuelEntry() {
  var date = document.getElementById('fuelDate').value;
  var price = Number(document.getElementById('fuelPrice').value);
  var amount = Number(document.getElementById('fuelAmount').value);
  if (!date || !price || !amount) return;
  var data = JSON.parse(lsGet(FUEL_KEY) || '[]');
  data.push({ id: uid(), date: date, price: price, amount: amount });
  lsSet(FUEL_KEY, JSON.stringify(data));
  document.getElementById('fuelDate').value = '';
  document.getElementById('fuelPrice').value = '';
  document.getElementById('fuelAmount').value = '';
  loadFuelReport();
}
function deleteFuelEntry(id) {
  var data = JSON.parse(lsGet(FUEL_KEY) || '[]');
  data = data.filter(function(x){ return x.id !== id; });
  lsSet(FUEL_KEY, JSON.stringify(data));
  loadFuelReport();
}
function loadFuelReport() {
  var FUEL_BUDGET = 2800; // R per month
  var PASSENGERS = window.PASSENGERS || ['David','Lezaun','Shireen'];

  // ── Pay cycle: 25th of last month → 24th of this month ──
  var now = new Date();
  var cycleStart, cycleEnd;
  if(now.getDate() >= 25) {
    // We're past the 25th — cycle is 25th this month to 24th next month
    cycleStart = new Date(now.getFullYear(), now.getMonth(), 25);
    cycleEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 24);
  } else {
    // We're before the 25th — cycle is 25th last month to 24th this month
    cycleStart = new Date(now.getFullYear(), now.getMonth() - 1, 25);
    cycleEnd   = new Date(now.getFullYear(), now.getMonth(), 24);
  }
  function inCycle(ds) {
    var d = new Date(ds);
    return d >= cycleStart && d <= cycleEnd;
  }
  var cycleLabel =
    cycleStart.getDate() + ' ' + cycleStart.toLocaleString('en-ZA',{month:'short'}) +
    ' – ' +
    cycleEnd.getDate() + ' ' + cycleEnd.toLocaleString('en-ZA',{month:'short'});

  // ── Fuel data — filter to pay cycle ──
  var allFuelData = JSON.parse(lsGet(FUEL_KEY) || '[]');
  var fuelData = allFuelData.filter(function(x){ return inCycle(x.date); });
  var fuelTotal = 0;
  fuelData.forEach(function(x){ fuelTotal += Number(x.amount); });

  // ── Carpool data — filter to pay cycle ──
  var cp = {};
  try { cp = JSON.parse(lsGet(CPK) || '{}'); } catch(e){}

  // Data is stored as cp["2026-03"]["2026-03-10"] = {David:{amt:44,paid:false}, ...}
  var days = {};
  Object.keys(cp).forEach(function(mk){
    if(!/^\d{4}-\d{2}$/.test(mk)) return; // only month keys
    var monthData = cp[mk];
    if(typeof monthData !== 'object') return;
    Object.keys(monthData).forEach(function(ds){
      if(inCycle(ds)) days[ds] = monthData[ds];
    });
  });

  // ── Per-day P&L ──
  var totalIncome = 0;
  var drivingDayCount = 0;
  var passengerStats = {};
  PASSENGERS.forEach(function(p){ passengerStats[p] = { income: 0, trips: 0, absent: 0 }; });

  // First pass — count days where at least 1 passenger paid something
  Object.keys(days).forEach(function(ds){
    var dd = days[ds];
    var hasPassenger = false;
    PASSENGERS.forEach(function(p){
      var pdata = dd[p];
      if(pdata && typeof pdata === 'object' && Number(pdata.amt) > 0) hasPassenger = true;
    });
    if(hasPassenger) drivingDayCount++;
  });

  var fuelPerDay = drivingDayCount > 0
    ? fuelTotal / drivingDayCount
    : FUEL_BUDGET / 22;

  var dayRows = [];
  Object.keys(days).sort().reverse().forEach(function(ds){
    var dd = days[ds];
    var dayIncome = 0;
    var activePax = [];
    PASSENGERS.forEach(function(p){
      var pdata = dd[p];
      if(!pdata || typeof pdata !== 'object') {
        passengerStats[p].absent++;
        return;
      }
      var amt = Number(pdata.amt) || 0;
      if(amt === 0) {
        passengerStats[p].absent++;
        return;
      }
      dayIncome += amt;
      passengerStats[p].income += amt;
      passengerStats[p].trips++;
      activePax.push(p.charAt(0));
    });
    if(activePax.length === 0) return;
    totalIncome += dayIncome;
    var pl = dayIncome - fuelPerDay;
    dayRows.push({ ds: ds, pax: activePax, income: dayIncome, fuel: fuelPerDay, pl: pl });
  });

  var plCycleLabelEl = document.getElementById('plCycleLabel');
  if(plCycleLabelEl) plCycleLabelEl.textContent = 'Pay cycle: ' + cycleLabel;

  var netPL = totalIncome - fuelTotal;

  // ── Daily fuel cost (user-set) ──
  var dailyFuelCostEl = document.getElementById('dailyFuelCost');
  var dailyFuelCost = dailyFuelCostEl ? (parseFloat(dailyFuelCostEl.value) || 100) : 100;
  var totalFuelCost = drivingDayCount * dailyFuelCost;

  // ── Update Fuel log section ──
  var fuelTotalEl   = document.getElementById('fuelTotal');
  var fuelCountEl   = document.getElementById('fuelCount');
  var fuelSuggestEl = document.getElementById('fuelSuggest');
  var fuelRowsEl    = document.getElementById('fuelRows');
  if(fuelTotalEl) fuelTotalEl.textContent = fmtR(fuelTotal);
  if(fuelCountEl) fuelCountEl.textContent = fuelData.length;
  var budgetLeft = FUEL_BUDGET - fuelTotal;
  if(fuelSuggestEl){
    fuelSuggestEl.textContent = budgetLeft >= 0 ? fmtR(budgetLeft)+' left' : fmtR(Math.abs(budgetLeft))+' over';
    fuelSuggestEl.style.color = budgetLeft >= 0 ? '#c8f230' : '#f23060';
    fuelSuggestEl.previousElementSibling.textContent = 'Budget Remaining';
  }
  if(fuelRowsEl){
    fuelRowsEl.innerHTML = '';
    if(fuelData.length === 0){
      fuelRowsEl.innerHTML = '<div style="color:#555;font-size:13px;padding:12px 14px;">No fuel entries yet.</div>';
    } else {
      fuelData.slice().sort(function(a,b){ return b.date.localeCompare(a.date); }).forEach(function(x){
        var row = document.createElement('div');
        row.style.cssText = 'display:grid;grid-template-columns:1.5fr 1fr 1fr 28px;padding:9px 14px;border-bottom:1px solid #161616;font-size:12px;align-items:center;';
        var litres = x.price > 0 ? (x.amount/x.price).toFixed(1)+'L' : '-';
        row.innerHTML = '<span style="color:var(--muted)">'+x.date+'</span>'
          +'<span style="color:#ccc">R'+Number(x.price).toFixed(2)+' <span style="color:#555;font-size:10px;">('+litres+')</span></span>'
          +'<span style="color:#a78bfa;font-weight:500">'+fmtR(x.amount)+'</span>'
          +'<span onclick="deleteFuelEntry(\''+x.id+'\')" style="color:#555;cursor:pointer;font-size:18px;line-height:1;text-align:center;">&times;</span>';
        fuelRowsEl.appendChild(row);
      });
    }
  }

  // ── Fuel Savings hero card ──
  var plNetEl         = document.getElementById('plNet');
  var plVerdictEl     = document.getElementById('plVerdict');
  var plIncomeEl      = document.getElementById('plIncome');
  var plFuelEl        = document.getElementById('plFuel');
  var plRowsEl        = document.getElementById('plRows');
  var plPassCardsEl   = document.getElementById('plPassCards');
  var plCoveredPct    = document.getElementById('plCoveredPct');
  var plCoverageBar   = document.getElementById('plCoverageBar');
  var plCoverageLabel = document.getElementById('plCoverageLabel');
  if(!plNetEl) return;

  var coveredPct = totalFuelCost > 0 ? Math.min(100, Math.round((totalIncome/totalFuelCost)*100)) : 0;
  var barColor   = coveredPct >= 80 ? '#c8f230' : coveredPct >= 50 ? '#f2a830' : '#f23060';

  plNetEl.textContent    = fmtR(Math.round(totalIncome));
  plIncomeEl.textContent = fmtR(Math.round(totalIncome));
  plFuelEl.textContent   = fmtR(Math.round(totalFuelCost));
  if(plCoveredPct)    plCoveredPct.textContent    = coveredPct+'%';
  if(plCoverageBar){  plCoverageBar.style.width    = coveredPct+'%'; plCoverageBar.style.background = barColor; }
  if(plCoverageLabel) plCoverageLabel.textContent  = 'passengers covered '+coveredPct+'% of your fuel this cycle';
  if(plVerdictEl)     plVerdictEl.textContent      = 'in fuel costs covered this cycle 🎉';

  // ── Per-day coverage rows ──
  if(plRowsEl){
    if(dayRows.length === 0){
      plRowsEl.innerHTML = '<div style="color:#555;font-size:13px;padding:12px 14px;">No carpool data this cycle yet.</div>';
    } else {
      plRowsEl.innerHTML = '';
      dayRows.forEach(function(d){
        var pct      = Math.min(100, Math.round((d.income / dailyFuelCost)*100));
        var dColor   = pct >= 100 ? '#c8f230' : pct >= 66 ? '#f2a830' : '#f23060';
        var pctLabel = pct >= 100 ? '✅ '+pct+'%' : pct+'%';
        var paxStr   = d.pax.length > 0 ? d.pax.join(', ') : '—';
        var row = document.createElement('div');
        row.style.cssText = 'padding:9px 14px;border-bottom:1px solid #161616;';
        row.innerHTML =
          '<div style="display:grid;grid-template-columns:1.2fr 0.8fr 1fr 1fr 1fr;font-size:11px;align-items:center;margin-bottom:5px;">'
          +'<span style="color:var(--muted)">'+d.ds+'</span>'
          +'<span style="color:#888;text-align:center;">'+paxStr+'</span>'
          +'<span style="color:#c8f230;text-align:right;">'+fmtR(Math.round(d.income))+'</span>'
          +'<span style="color:#f2a830;text-align:right;">'+fmtR(Math.round(dailyFuelCost))+'</span>'
          +'<span style="color:'+dColor+';font-weight:700;text-align:right;">'+pctLabel+'</span>'
          +'</div>'
          +'<div style="height:3px;background:#1a1a1a;border-radius:2px;overflow:hidden;">'
          +'<div style="height:100%;width:'+pct+'%;background:'+dColor+';border-radius:2px;transition:width .5s;box-shadow:0 0 6px '+dColor+'44;"></div>'
          +'</div>';
        plRowsEl.appendChild(row);
      });
    }
  }

  // ── Per-passenger savings cards ──
  if(plPassCardsEl){
    plPassCardsEl.innerHTML = '';
    PASSENGERS.forEach(function(p){
      var s = passengerStats[p];
      var total_trips = s.trips + s.absent;
      var attendance  = total_trips > 0 ? Math.round((s.trips/total_trips)*100) : 0;
      var card = document.createElement('div');
      card.style.cssText = 'background:var(--surface);border:1px solid var(--border);padding:14px;border-radius:8px;';
      card.innerHTML =
        '<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:14px;color:#efefef;margin-bottom:8px;">'+p+'</div>'
        +'<div style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:3px;">Saved you</div>'
        +'<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:20px;color:#c8f230;margin-bottom:8px;">'+fmtR(s.income)+'</div>'
        +'<div style="font-size:10px;color:var(--muted);">'+s.trips+' trips &nbsp;·&nbsp; '+attendance+'% attendance</div>';
      plPassCardsEl.appendChild(card);
    });
  }

  // ── Feed Smart Pricing calculator ──
  var totalPricingTrips = 0, totalPricingIncome = 0;
  PASSENGERS.forEach(function(p){ totalPricingTrips += passengerStats[p].trips; totalPricingIncome += passengerStats[p].income; });
  _pricingTripsPerTank = totalPricingTrips;
  _pricingCurrentAvg   = totalPricingTrips > 0 ? totalPricingIncome/totalPricingTrips : 0;
  restorePricingSettings();
}

// ══ MONEY OWED ══

function loadExternalBorrows(){
  try{ return JSON.parse(lsGet(EXTERNAL_BORROW_KEY)||'{}'); }catch(e){ return {}; }
}
function saveExternalBorrows(data){ lsSet(EXTERNAL_BORROW_KEY, JSON.stringify(data)); }

function openExternalBorrowModal(){
  document.getElementById('extBorrowName').value = '';
  document.getElementById('extBorrowAmt').value = '';
  document.getElementById('extBorrowDate').value = localDateStr(new Date());
  document.getElementById('extBorrowNote').value = '';
  document.getElementById('externalBorrowModal').classList.add('active');
  setTimeout(updateExtLendingGuardrail,100);
}

function confirmExternalBorrow(){
  const name   = document.getElementById('extBorrowName').value.trim();
  const amount = parseFloat(document.getElementById('extBorrowAmt').value);
  const date   = document.getElementById('extBorrowDate').value || localDateStr(new Date());
  const note   = document.getElementById('extBorrowNote').value.trim();
  const account = document.getElementById('extBorrowAccount').value || 'FNB';
  if(!name){ alert('Please enter a name.'); return; }
  if(!amount || amount <= 0){ alert('Please enter a valid amount.'); return; }
  const data = loadExternalBorrows();
  const key  = name.toLowerCase().replace(/\s+/g,'_');
  if(!data[key]) data[key] = { name: name, entries: [] };
  var newEntry = { id: uid(), type:'borrow', amount, date, note, account };
  data[key].entries.push(newEntry);
  saveExternalBorrows(data);
  // Log as expense in cashflow — stamp cfId back for cascade delete
  var cfId = logBorrowToCashflow(name, amount, date, account, 'personal');
  if(cfId){ newEntry.cfId = cfId; saveExternalBorrows(data); }
  closeModal('externalBorrowModal');
  renderMoneyOwed();
  odinRefreshIfOpen();
  if(typeof renderOdinInsights === 'function') try{ renderOdinInsights('money'); }catch(e){}
}

// ── LOG BORROW AS CASHFLOW EXPENSE ──
// Returns the CF entry id so callers can stamp cfId onto the borrow entry for cascade delete
function logBorrowToCashflow(personName, amount, date, account, tag){
  try{
    var data = loadCFData();
    var d = new Date(date + 'T00:00:00');
    var mk = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    if(!data[mk]) data[mk] = { income:[], expenses:[] };
    if(!data[mk].expenses) data[mk].expenses = [];
    var acctLabel = account === 'TymeBank' ? 'TymeBank' : 'FNB';
    var tagLabel  = tag === 'carpool' ? '🚗 Carpool' : '👤 Personal';
    var cfEntryId = uid();
    data[mk].expenses.push({
      id: cfEntryId,
      label: '💸 Lent to ' + personName + ' [' + acctLabel + ']',
      amount: amount,
      icon: '🤝',
      auto: false,
      account: account,
      borrowTag: tagLabel,
      date: date
    });
    saveCFData(data);
    return cfEntryId;
  }catch(e){ console.warn('Could not log borrow to cashflow:', e); return null; }
}

// ── ADD MORE BORROW (top-up existing person) ──
function openAddMoreBorrowModal(key, tag){
  var personName = '';
  var currentTotal = 0;
  if(tag === 'carpool'){
    personName = key;
    var entries = borrowData[key] || [];
    var ct = calcPersonTotals(entries);
    currentTotal = ct.borrowed - ct.repaid;
  } else {
    var extData = loadExternalBorrows();
    var p = extData[key];
    if(!p){ alert('Person not found.'); return; }
    personName = p.name;
    var ct2 = calcPersonTotals(p.entries);
    currentTotal = ct2.borrowed - ct2.repaid;
  }
  document.getElementById('addMoreBorrowKey').value   = key;
  document.getElementById('addMoreBorrowTag').value   = tag;
  document.getElementById('addMoreBorrowPersonName').textContent = personName;
  document.getElementById('addMoreBorrowCurrentTotal').textContent = 'R' + currentTotal.toLocaleString('en-ZA') + ' still owed';
  document.getElementById('addMoreBorrowAmt').value   = '';
  document.getElementById('addMoreBorrowDate').value  = localDateStr(new Date());
  document.getElementById('addMoreBorrowNote').value  = '';
  document.getElementById('addMoreBorrowAccount').value = 'FNB';
  document.getElementById('addMoreBorrowModal').classList.add('active');
}

function confirmAddMoreBorrow(){
  var key     = document.getElementById('addMoreBorrowKey').value;
  var tag     = document.getElementById('addMoreBorrowTag').value;
  var amount  = parseFloat(document.getElementById('addMoreBorrowAmt').value);
  var date    = document.getElementById('addMoreBorrowDate').value || localDateStr(new Date());
  var note    = document.getElementById('addMoreBorrowNote').value.trim();
  var account = document.getElementById('addMoreBorrowAccount').value || 'FNB';
  if(!amount || amount <= 0){ alert('Enter a valid amount to add.'); return; }
  var personName = document.getElementById('addMoreBorrowPersonName').textContent;

  if(tag === 'carpool'){
    if(!borrowData[key]) borrowData[key] = [];
    var cpEntry = { id: uid(), type:'borrow', amount: amount, date: date, note: note, account: account, paid: false };
    borrowData[key].push(cpEntry);
    var cpCfId = logBorrowToCashflow(personName, amount, date, account, tag);
    if(cpCfId){ cpEntry.cfId = cpCfId; }
    saveBorrows();
    renderCarpool();
  } else {
    var extData = loadExternalBorrows();
    if(!extData[key]){ alert('Person not found.'); return; }
    var extEntry = { id: uid(), type:'borrow', amount: amount, date: date, note: note, account: account };
    extData[key].entries.push(extEntry);
    var extCfId = logBorrowToCashflow(personName, amount, date, account, tag);
    if(extCfId){ extEntry.cfId = extCfId; }
    saveExternalBorrows(extData);
    renderMoneyOwed();
    if(typeof renderOdinInsights === 'function') try{ renderOdinInsights('money'); }catch(e){}
  }
  closeModal('addMoreBorrowModal');

  var old = document.getElementById('borrowAddToast');
  if(old) old.remove();
  var toast = document.createElement('div');
  toast.id = 'borrowAddToast';
  toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1a0e2e;border:1px solid #a78bfa;border-radius:8px;padding:12px 16px;z-index:9999;display:flex;align-items:center;gap:10px;font-family:DM Mono,monospace;font-size:11px;letter-spacing:1px;color:#a78bfa;box-shadow:0 4px 20px rgba(0,0,0,.6);min-width:260px;';
  toast.innerHTML = '<span>💸 R'+Number(amount).toLocaleString('en-ZA')+' added to <strong style="color:#efefef;">'+personName+'</strong> · from '+account+' · logged to cashflow</span><button onclick="document.getElementById(\'borrowAddToast\').remove();" style="background:none;border:none;color:#555;cursor:pointer;font-size:16px;padding:0 2px;">✕</button>';
  document.body.appendChild(toast);
  setTimeout(function(){ if(toast.parentNode) toast.remove(); }, 5000);
}

function buildFundSelectOptions(selectId){
  const sel = document.getElementById(selectId);
  if(!sel) return;
  // Only FNB funds (exclude TymeBank and Kids funds)
  const tymeFundNames=['The Vault (Tax)','Traffic Infractions'];
  const kidsFundNames=["Masud's Fund"];
  const fnbFunds = funds.filter(function(f){
    return kidsFundNames.indexOf(f.name) < 0 && tymeFundNames.indexOf(f.name) < 0;
  });
  sel.innerHTML = '<option value="">— Don\'t add to savings —</option>'
    + fnbFunds.map(function(f){
        return '<option value="'+f.id+'">'+f.emoji+' '+f.name+'</option>';
      }).join('')
    + '<option value="__maint__">🔧 Maintenance Fund</option>';
  sel.value = '';
}

function openExternalRepayModal(key){
  const data   = loadExternalBorrows();
  const person = data[key];
  if(!person) return;
  document.getElementById('extRepayPersonKey').value = key;
  document.getElementById('extRepayNameDisplay').textContent = person.name;
  document.getElementById('extRepayAmt').value = '';
  document.getElementById('extRepayDate').value = localDateStr(new Date());
  document.getElementById('extRepayNote').value = '';
  // Show owing
  const { borrowed, repaid } = calcPersonTotals(person.entries);
  const owing = borrowed - repaid;
  document.getElementById('extRepayOwingSummary').innerHTML =
    person.name + ' currently owes <strong style="color:#f2a830;font-size:13px;">R' + owing.toLocaleString('en-ZA') + '</strong>';
  buildFundSelectOptions('extRepayFundSelect');
  document.getElementById('externalRepayModal').classList.add('active');
}

function confirmExternalRepay(){
  const key    = document.getElementById('extRepayPersonKey').value;
  const amount = parseFloat(document.getElementById('extRepayAmt').value);
  const date   = document.getElementById('extRepayDate').value || localDateStr(new Date());
  const note   = document.getElementById('extRepayNote').value.trim() || 'Repayment';
  if(!amount || amount <= 0){ alert('Enter a valid repayment amount.'); return; }
  const data = loadExternalBorrows();
  if(!data[key]) return;
  const personName = data[key].name || key;
  const borrowEntryId = uid();
  data[key].entries.push({ id: borrowEntryId, type:'repay', amount, date, note });
  saveExternalBorrows(data);
  // ── Optional: push repayment into a savings fund ──
  const fundSel = document.getElementById('extRepayFundSelect');
  if(fundSel && fundSel.value){
    const linkedId = key + ':' + borrowEntryId;
    if(fundSel.value === '__maint__'){
      const mdata = getMaintData();
      mdata.push({ id: uid(), borrowEntryId: linkedId, person: personName, amount, date, note: '↩ Repaid by ' + personName + (note && note !== 'Repayment' ? ' · ' + note : '') });
      saveMaintData(mdata);
      renderMaintCard();
  odinRefreshIfOpen();
      showRepayToast(personName, amount, 'Maintenance Fund');
    } else {
      const f = funds.find(x => x.id === fundSel.value);
      if(f){
        f.deposits.push({ id: uid(), borrowEntryId: linkedId, amount, date, note: '↩ Repaid by ' + personName + (note && note !== 'Repayment' ? ' · ' + note : ''), txnType: 'in' });
        saveFunds();
        renderFunds();
        showRepayToast(personName, amount, f.name);
      }
    }
  }
  closeModal('externalRepayModal');
  renderMoneyOwed();
  if(typeof renderOdinInsights === 'function') try{ renderOdinInsights('money'); }catch(e){}
}

function showRepayToast(name, amount, fundName){
  const old = document.getElementById('repayFundToast');
  if(old) old.remove();
  const toast = document.createElement('div');
  toast.id = 'repayFundToast';
  toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#0a1a2e;border:1px solid #7090f0;border-radius:8px;padding:12px 16px;z-index:9999;display:flex;align-items:center;gap:10px;font-family:DM Mono,monospace;font-size:11px;letter-spacing:1px;color:#7090f0;box-shadow:0 4px 20px rgba(0,0,0,.6);min-width:260px;';
  toast.innerHTML = '<span>✓ R'+Number(amount).toLocaleString('en-ZA')+' from '+name+' added to <strong style="color:#efefef;">'+fundName+'</strong></span><button onclick="document.getElementById(\'repayFundToast\').remove();" style="background:none;border:none;color:#555;cursor:pointer;font-size:16px;padding:0 2px;">✕</button>';
  document.body.appendChild(toast);
  setTimeout(function(){ if(toast.parentNode) toast.remove(); }, 5000);
}

function calcPersonTotals(entries){
  let borrowed = 0, repaid = 0;
  (entries||[]).forEach(function(e){
    if(e.type === 'repay') repaid += Number(e.amount||0);
    else borrowed += Number(e.amount||0);
  });
  return { borrowed, repaid };
}

function renderMoneyOwed(){
  const container = document.getElementById('moneyOwedList');
  if(!container) return;
  window._moPersonMap = {}; // reset map on each render
  if(typeof renderOdinInsights === 'function') try{ renderOdinInsights('money'); }catch(e){}

  // ── Build combined list: carpool borrows + external ──
  const people = [];

  // 1) Carpool passengers — pull from borrowData
  loadBorrows();
  const PASSENGERS = window.PASSENGERS || ['David','Lezaun','Shireen'];
  PASSENGERS.forEach(function(name){
    const entries = borrowData[name] || [];
    if(entries.length === 0) return;
    const { borrowed, repaid } = calcPersonTotals(entries);
    if(borrowed === 0) return;
    // Check if archived
    var carpoolArchived = JSON.parse(lsGet('yb_carpool_archived')||'[]');
    if(carpoolArchived.indexOf(name) > -1) return;
    people.push({ name, tag:'carpool', entries, borrowed, repaid, key: name });
  });

  // 2) External people
  const extData = loadExternalBorrows();
  Object.keys(extData).forEach(function(key){
    const p = extData[key];
    if(p.archived) return; // skip archived
    const { borrowed, repaid } = calcPersonTotals(p.entries);
    if(borrowed === 0) return;
    people.push({ name: p.name, tag:'external', entries: p.entries, borrowed, repaid, key });
  });

  // ── Summary totals ──
  let grandLent = 0, grandRepaid = 0;
  people.forEach(function(p){ grandLent += p.borrowed; grandRepaid += p.repaid; });
  const grandOwing = grandLent - grandRepaid;
  const moTL = document.getElementById('moTotalLent');
  const moTR = document.getElementById('moTotalRepaid');
  const moTO = document.getElementById('moTotalOwing');
  if(moTL) moTL.textContent = 'R' + grandLent.toLocaleString('en-ZA');
  if(moTR) moTR.textContent = 'R' + grandRepaid.toLocaleString('en-ZA');
  var displayOwing = Math.max(0, grandOwing);
  if(moTO) moTO.textContent = 'R' + displayOwing.toLocaleString('en-ZA');

  if(people.length === 0){
    container.innerHTML = '<div style="color:#555;font-size:13px;text-align:center;padding:40px 0;">No one owes you anything right now 🎉</div>';
    return;
  }

  container.innerHTML = '';
  people.forEach(function(p){
    const owing   = p.borrowed - p.repaid;
    const pct     = p.borrowed > 0 ? Math.min(100, Math.round((p.repaid/p.borrowed)*100)) : 0;
    const settled = owing <= 0;
    const tagHtml = p.tag === 'carpool'
      ? '<span style="font-size:9px;padding:2px 8px;border-radius:100px;background:#1a2e00;color:#c8f230;border:1px solid #3a5a00;letter-spacing:1px;">🚗 CARPOOL</span>'
      : '<span style="font-size:9px;padding:2px 8px;border-radius:100px;background:#1a1a2e;color:#7090f0;border:1px solid #2a2a5a;letter-spacing:1px;">👤 PERSONAL</span>';

    // Entry rows
    const entryRows = (p.entries||[]).slice().sort(function(a,b){ return a.date < b.date ? -1 : 1; }).map(function(e){
      const editFn   = p.tag === 'carpool'
        ? 'openEditBorrowModal(\''+p.key+'\',\''+e.id+'\')'
        : 'openEditExternalBorrowModal(\''+p.key+'\',\''+e.id+'\')';
      const delFn    = p.tag === 'carpool'
        ? 'deleteBorrowEntry(\''+p.key+'\',\''+e.id+'\')'
        : 'deleteBorrowEntryUnified(\'__ext__'+p.key+'\',\''+e.id+'\')';
      const actionBtns = '<span onclick="'+editFn+'" style="cursor:pointer;color:#444;font-size:13px;padding:2px 5px;" title="Edit">✏️</span>'
        +'<span onclick="'+delFn+'" style="cursor:pointer;color:#444;font-size:13px;padding:2px 5px;" title="Delete">🗑</span>';
      if(e.type==='repay') return ''; // repayments hidden from mini statement
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;font-size:11px;border-bottom:1px solid #161616;">'
        +'<span style="color:#555;">'+e.date+(e.note?' · '+e.note:'')+(e.account?' <span style="font-size:9px;background:#1a0e2e;border:1px solid #3a2060;border-radius:3px;padding:1px 4px;color:#a78bfa;">'+e.account+'</span>':'')+' </span>'
        +'<span style="display:flex;align-items:center;gap:4px;"><span style="color:#a78bfa;">💸 R'+Number(e.amount).toLocaleString('en-ZA')+'</span>'+actionBtns+'</span>'
        +'</div>';
    }).join('');

    const repayBtn = p.tag === 'external' && !settled
      ? '<button onclick="openExternalRepayModal(\''+p.key+'\')" style="padding:7px 14px;background:#0e1a2e;border:1px solid #7090f0;border-radius:6px;color:#7090f0;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1px;cursor:pointer;">↩ Repayment</button>'
      : (p.tag === 'carpool' && !settled
          ? '<button onclick="openRepayModal(\''+p.key+'\')" style="padding:7px 14px;background:#0e1a2e;border:1px solid #7090f0;border-radius:6px;color:#7090f0;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1px;cursor:pointer;">↩ Repayment</button>'
          : '');

    const cardIdx = window._moPersonMap ? Object.keys(window._moPersonMap).length : 0;
    if(!window._moPersonMap) window._moPersonMap = {};
    window._moPersonMap[cardIdx] = p;

    const card = document.createElement('div');
    card.style.cssText = 'background:var(--surface);border:1px solid '+(settled?'#2a2a2a':'#3a2000')+';border-radius:10px;overflow:hidden;';
    card.setAttribute('data-mo-idx', cardIdx);
    card.innerHTML =
      // Top
      '<div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">'
        +'<div style="display:flex;align-items:center;gap:10px;">'
          +'<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:16px;color:#efefef;">'+p.name+'</div>'
          +tagHtml
        +'</div>'
        +'<div style="text-align:right;">'
          +'<div style="font-size:9px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;">'+(settled?'Settled':'Owes you')+'</div>'
          +'<div style="font-family:\'Syne\',sans-serif;font-weight:800;font-size:22px;color:'+(settled?'#c8f230':'#f2a830')+';">'+(settled?'✓ Settled':'R'+owing.toLocaleString('en-ZA'))+'</div>'
        +'</div>'
      +'</div>'
      // Progress bar
      +'<div style="padding:10px 16px;border-bottom:1px solid var(--border);background:#0a0a0a;">'
        +'<div style="display:flex;justify-content:space-between;font-size:9px;color:#444;margin-bottom:4px;letter-spacing:1px;">'
          +'<span>Lent R'+p.borrowed.toLocaleString('en-ZA')+'</span>'
          +'<span>'+pct+'% repaid</span>'
          +'<span>Repaid R'+p.repaid.toLocaleString('en-ZA')+'</span>'
        +'</div>'
        +'<div style="height:4px;background:#1a1a1a;border-radius:2px;overflow:hidden;">'
          +'<div style="height:100%;width:'+pct+'%;background:'+(settled?'#c8f230':'#7090f0')+';border-radius:2px;transition:width .5s;"></div>'
        +'</div>'
      +'</div>'
      // Entry history
      +'<div style="padding:8px 16px 0;">'
        +entryRows
      +'</div>'
      // Actions
      +'<div style="padding:10px 16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'
        +(repayBtn ? repayBtn : '')
        +'<button onclick="openAddMoreBorrowModal(\''+p.key+'\',\''+p.tag+'\')" style="padding:7px 14px;background:#1a0e2e;border:1px solid #a78bfa;border-radius:6px;color:#a78bfa;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1px;cursor:pointer;">➕ More Borrowed</button>'
        +'<button onclick="exportPersonPDF(this)" style="padding:7px 14px;background:#1a1a00;border:1px solid #5a4a00;border-radius:6px;color:#f2a830;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1px;cursor:pointer;transition:opacity .15s;" onmouseover="this.style.opacity=\'.75\'" onmouseout="this.style.opacity=\'1\'">⬇ PDF</button>'
        +(settled && p.key ? '<button onclick="archiveExternalPerson(\''+p.key+'\',\''+p.tag+'\')" style="padding:7px 14px;background:#1a1a1a;border:1px solid #333;border-radius:6px;color:#555;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1px;cursor:pointer;" onmouseover="this.style.color=\'#888\'" onmouseout="this.style.color=\'#555\'">📦 Archive</button>' : '')
      +'</div>';
    container.appendChild(card);
  });
}

// ── EXPORT INDIVIDUAL PERSON PDF ──
function exportPersonPDF(btn){
  var card = btn.closest('[data-mo-idx]');
  var idx = card ? card.getAttribute('data-mo-idx') : null;
  var p = (idx !== null && window._moPersonMap) ? window._moPersonMap[idx] : null;
  if(!p){ alert('Could not find person data. Please try again.'); return; }

  var orig = btn.textContent;
  btn.textContent = '⏳…';
  btn.disabled = true;
  setTimeout(function(){ btn.textContent = orig; btn.disabled = false; }, 4000);

  if(typeof window.jspdf === 'undefined'){
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = function(){ _buildPersonPDF(p); };
    document.head.appendChild(s);
  } else {
    _buildPersonPDF(p);
  }
}

function _buildPersonPDF(p){
  var owing = p.borrowed - p.repaid;
  var settled = owing <= 0;
  var pct = p.borrowed > 0 ? Math.min(100, Math.round((p.repaid/p.borrowed)*100)) : 0;
  var today = new Date().toLocaleDateString('en-ZA');

  var {jsPDF} = window.jspdf;
  var doc = new jsPDF({unit:'mm', format:'a4'});

  function newPage(){
    doc.addPage();
    doc.setFillColor(10,10,10); doc.rect(0,0,210,297,'F');
    doc.setFillColor(167,139,250); doc.rect(0,0,210,2,'F');
    doc.setTextColor(50,50,50); doc.setFontSize(8); doc.setFont('helvetica','normal');
    doc.text(p.name+' (cont.) · '+today, 105, 12, {align:'center'});
    return 22;
  }

  // Background + stripe
  doc.setFillColor(10,10,10); doc.rect(0,0,210,297,'F');
  doc.setFillColor(167,139,250); doc.rect(0,0,210,2,'F');

  // Header
  doc.setTextColor(107,79,168); doc.setFontSize(9); doc.setFont('helvetica','normal');
  doc.text('MONEY OWED · '+(p.tag==='carpool'?'CARPOOL':'PERSONAL'), 105, 16, {align:'center'});
  doc.setTextColor(167,139,250); doc.setFontSize(28); doc.setFont('helvetica','bold');
  doc.text(p.name, 105, 30, {align:'center'});
  doc.setTextColor(85,85,85); doc.setFontSize(10); doc.setFont('helvetica','normal');
  doc.text('Generated: '+today, 105, 38, {align:'center'});
  doc.setDrawColor(167,139,250); doc.setLineWidth(0.5); doc.line(20,43,190,43);

  // Summary
  var y = 52;
  doc.setFontSize(9);
  doc.setTextColor(107,79,168); doc.text('Total Lent', 20, y);
  doc.setTextColor(167,139,250); doc.setFont('helvetica','bold');
  doc.text('R'+p.borrowed.toLocaleString('en-ZA'), 70, y, {align:'right'});
  doc.setFont('helvetica','normal');
  doc.setTextColor(90,136,0); doc.text('Repaid', 105, y, {align:'center'});
  doc.setTextColor(200,242,48); doc.setFont('helvetica','bold');
  doc.text('R'+p.repaid.toLocaleString('en-ZA'), 145, y, {align:'right'});
  doc.setFont('helvetica','normal');
  doc.setTextColor(settled?90:180, settled?136:120, settled?0:40);
  doc.text(settled?'✓ Settled':'Still Owed', 155, y);
  if(settled){
    doc.setTextColor(200,242,48); doc.setFont('helvetica','bold');
    doc.text('Settled', 190, y, {align:'right'});
  } else {
    doc.setTextColor(242,168,48); doc.setFont('helvetica','bold');
    doc.text('R'+owing.toLocaleString('en-ZA'), 190, y, {align:'right'});
  }
  doc.setFont('helvetica','normal');
  y += 5;

  // Progress bar
  doc.setFillColor(30,30,30); doc.rect(20,y,170,3,'F');
  var barW = Math.round((pct/100)*170);
  if(barW > 0){
    if(settled) doc.setFillColor(200,242,48);
    else doc.setFillColor(112,144,240);
    doc.rect(20,y,barW,3,'F');
  }
  doc.setTextColor(60,60,60); doc.setFontSize(8);
  doc.text(pct+'% repaid', 105, y+8, {align:'center'});
  y += 14;

  doc.setDrawColor(40,40,40); doc.setLineWidth(0.3); doc.line(20,y,190,y);
  y += 8;

  var bottomMargin = 270;
  var sortedEntries = (p.entries||[]).slice().sort(function(a,b){ return a.date < b.date ? -1 : 1; });

  if(sortedEntries.length === 0){
    doc.setTextColor(60,60,60); doc.setFontSize(11);
    doc.text('No transactions recorded.', 105, y+10, {align:'center'});
    y += 20;
  }

  sortedEntries.forEach(function(e){
    if(y > bottomMargin){ y = newPage(); }
    var label = e.date + (e.note ? ' · '+e.note : '');
    doc.setFontSize(11); doc.setFont('helvetica','normal');
    if(e.type === 'repay'){
      doc.setTextColor(85,85,85); doc.text(label, 20, y);
      doc.setTextColor(112,144,240); doc.text('Repaid -R'+Number(e.amount).toLocaleString('en-ZA'), 190, y, {align:'right'});
    } else {
      doc.setTextColor(85,85,85); doc.text(label, 20, y);
      doc.setTextColor(167,139,250); doc.text('Lent R'+Number(e.amount).toLocaleString('en-ZA'), 190, y, {align:'right'});
    }
    doc.setDrawColor(25,25,25); doc.setLineWidth(0.2); doc.line(20,y+3,190,y+3);
    y += 12;
  });

  // Totals
  if(y + 30 > bottomMargin){ y = newPage(); }
  y += 4;
  doc.setDrawColor(167,139,250); doc.setLineWidth(0.5); doc.line(20,y,190,y); y += 8;
  doc.setFontSize(9); doc.setFont('helvetica','normal');
  doc.setTextColor(107,79,168); doc.text('Total Lent', 20, y);
  doc.setTextColor(167,139,250); doc.setFont('helvetica','bold');
  doc.text('R'+p.borrowed.toLocaleString('en-ZA'), 190, y, {align:'right'}); y += 7;
  doc.setFont('helvetica','normal');
  doc.setTextColor(90,136,0); doc.text('Repaid', 20, y);
  doc.setTextColor(200,242,48); doc.setFont('helvetica','bold');
  doc.text('R'+p.repaid.toLocaleString('en-ZA'), 190, y, {align:'right'}); y += 7;
  if(!settled){
    doc.setFont('helvetica','normal');
    doc.setTextColor(180,120,40); doc.text('OUTSTANDING', 20, y);
    doc.setTextColor(242,168,48); doc.setFont('helvetica','bold');
    doc.setFontSize(14);
    doc.text('R'+owing.toLocaleString('en-ZA'), 190, y+1, {align:'right'});
  } else {
    doc.setTextColor(200,242,48); doc.setFont('helvetica','bold');
    doc.setFontSize(14); doc.text('✓ FULLY SETTLED', 190, y+1, {align:'right'});
  }

  // Footer
  doc.setTextColor(50,50,50); doc.setFontSize(8); doc.setFont('helvetica','normal');
  doc.text('Generated by My Dashboard · '+today, 105, 285, {align:'center'});

  doc.save('Borrowed_'+p.name+'_'+today.replace(/\//g,'-')+'.pdf');
}

// Patch openRepayModal to accept an optional passenger name
var _origOpenRepayModal = null;
function openRepayModalFor(passengerName){
  const sel = document.getElementById('repayPassenger');
  if(sel) sel.value = passengerName;
  openRepayModal();
}
function saveDailyFuel(){
  try{ var el=document.getElementById('dailyFuelCost'); if(el) lsSet(DAILY_FUEL_KEY, el.value); }catch(e){}
}
function restoreDailyFuel(){
  try{ var v=lsGet(DAILY_FUEL_KEY); var el=document.getElementById('dailyFuelCost'); if(v&&el) el.value=v; }catch(e){}
}
function loadBorrowReport() {
  // Read carpool borrows — yasin_borrows_v1 is a {passenger: [...entries]} object
  const raw = JSON.parse(lsGet(BORROW_KEY) || '{}');

  let totalBorrowed = 0;
  let totalRepaid = 0;
  const byPerson = {}; // { name: { borrowed, repaid, tag } }

  // 1) Carpool passengers
  Object.keys(raw).forEach(function(passenger) {
    const entries = raw[passenger] || [];
    entries.forEach(function(b) {
      if(b.type === 'repay'){
        totalRepaid += Number(b.amount || 0);
        if (!byPerson[passenger]) byPerson[passenger] = { borrowed: 0, repaid: 0, tag: 'carpool' };
        byPerson[passenger].repaid += Number(b.amount || 0);
      } else {
        const amount = Number(b.amount || 0);
        const repaid = b.paid ? amount : 0;
        totalBorrowed += amount;
        totalRepaid += repaid;
        if (!byPerson[passenger]) byPerson[passenger] = { borrowed: 0, repaid: 0, tag: 'carpool' };
        byPerson[passenger].borrowed += amount;
        byPerson[passenger].repaid += repaid;
      }
    });
  });

  // 2) External / Personal borrows — yb_external_borrows_v1
  const extData = loadExternalBorrows();
  Object.keys(extData).forEach(function(key) {
    const p = extData[key];
    const entries = p.entries || [];
    const displayName = p.name || key;
    entries.forEach(function(b) {
      if(b.type === 'repay'){
        totalRepaid += Number(b.amount || 0);
        if (!byPerson[displayName]) byPerson[displayName] = { borrowed: 0, repaid: 0, tag: 'personal' };
        byPerson[displayName].repaid += Number(b.amount || 0);
      } else {
        const amount = Number(b.amount || 0);
        totalBorrowed += amount;
        if (!byPerson[displayName]) byPerson[displayName] = { borrowed: 0, repaid: 0, tag: 'personal' };
        byPerson[displayName].borrowed += amount;
      }
    });
  });

  const el = function(id){ return document.getElementById(id); };
  el('rptBorrowTotal').textContent  = fmtR(totalBorrowed);
  el('rptBorrowRepaid').textContent = fmtR(totalRepaid);
  el('rptBorrowOwing').textContent  = fmtR(totalBorrowed - totalRepaid);

  const container = el('rptBorrowRows');
  container.innerHTML = '';

  const names = Object.keys(byPerson);
  if (names.length === 0) {
    container.innerHTML = '<div style="color:#555;font-size:13px;padding:8px 0;">No borrow records yet.</div>';
    return;
  }

  names.forEach(function(name) {
    const b = byPerson[name];
    const owing = b.borrowed - b.repaid;
    const tagBadge = b.tag === 'personal'
      ? '<span style="font-size:9px;padding:1px 7px;border-radius:100px;background:#1a1a2e;color:#7090f0;border:1px solid #2a2a5a;letter-spacing:1px;margin-left:6px;">👤 PERSONAL</span>'
      : '<span style="font-size:9px;padding:1px 7px;border-radius:100px;background:#1a2e00;color:#c8f230;border:1px solid #3a5a00;letter-spacing:1px;margin-left:6px;">🚗 CARPOOL</span>';
    const row = document.createElement('div');
    row.className = 'rpt-row';
    row.style.gridTemplateColumns = '1.5fr 1fr 1fr 1fr';
    row.innerHTML =
      '<span style="color:#ccc;display:flex;align-items:center;">' + name + tagBadge + '</span>' +
      '<span style="color:#888">' + fmtR(b.borrowed) + '</span>' +
      '<span style="color:#c8f230">' + fmtR(b.repaid) + '</span>' +
      '<span style="color:' + (owing > 0 ? '#f2a830' : '#c8f230') + ';font-weight:500">' + fmtR(owing) + '</span>';
    container.appendChild(row);
  });
}


/* ══════════════════════════════════ */

// UTILS
function uid(){return Math.random().toString(36).slice(2,9);}
function stripEmoji(s){
  if(!s) return '';
  var r='';
  for(var i=0;i<s.length;i++){ var code=s.charCodeAt(i); if(code>=55296&&code<=57343){i++;}else if(code<=127){r+=s[i];} }
  return r.replace(/s+/g,' ').trim();
}

function fmtR(n){return 'R'+Number(n).toLocaleString('en-ZA');}
function switchTab(tab,btn){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('navSavings').classList.remove('active');
  document.getElementById('navCarpool').classList.remove('active');
  var navCars = document.getElementById('navCars');
  if(navCars) navCars.classList.remove('active');
  var navInst = document.getElementById('navInstalments');
  if(navInst) navInst.classList.remove('active');
  var navSchool = document.getElementById('navSchool');
  if(navSchool) navSchool.classList.remove('active');
  var navRoutine = document.getElementById('navRoutine');
  if(navRoutine) navRoutine.classList.remove('active');
  var navCf = document.getElementById('navCashflow');
  if(navCf) navCf.classList.remove('active');
  var navOdin = document.getElementById('navOdin');
  if(navOdin) navOdin.classList.remove('active');
  if(tab==='savings') document.getElementById('navSavings').classList.add('active');
  if(tab==='carpool') document.getElementById('navCarpool').classList.add('active');
  if(tab==='cars' && navCars) navCars.classList.add('active');
  if(tab==='instalments' && navInst) navInst.classList.add('active');
  if(tab==='school' && navSchool) navSchool.classList.add('active');
  if(tab==='routine' && navRoutine) navRoutine.classList.add('active');
  if(tab==='cashflow' && navCf) navCf.classList.add('active');
  if(tab==='odin' && navOdin) navOdin.classList.add('active');
  document.getElementById('page-'+tab).classList.add('active');
  if(tab==='carpool') renderCarpool();
  if(tab==='savings'){ renderFunds(); renderCustomMaintCards(); }
  if(tab==='reports'){ renderReportFilters(); renderReports(); loadBorrowReport(); restoreDailyFuel(); loadFuelReport(); restorePricingSettings(); runSmartEngine(); initCFReportPickers(); }
  if(tab==='prayer'){ pDayOffset=0; renderPrayer(); }
  if(tab==='money'){ renderMoneyOwed(); try{ renderOdinInsights('money'); }catch(e){} }
  if(tab==='cars'){ renderCars(); }
  if(tab==='instalments'){ renderInst(); }
  if(tab==='school'){ renderSchool(); }
  if(tab==='routine'){ renderRoutine(); }
  if(tab==='cashflow'){ renderCashFlow(); }
  if(tab==='odin'){ renderOdinTab(); }
}

// Navigate to a tab without needing a button reference
function goToTab(tab){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('navSavings').classList.remove('active');
  document.getElementById('navCarpool').classList.remove('active');
  var navCars = document.getElementById('navCars');
  if(navCars) navCars.classList.remove('active');
  var navInst = document.getElementById('navInstalments');
  if(navInst) navInst.classList.remove('active');
  var navSchool = document.getElementById('navSchool');
  if(navSchool) navSchool.classList.remove('active');
  var navRoutine = document.getElementById('navRoutine');
  if(navRoutine) navRoutine.classList.remove('active');
  var navCf = document.getElementById('navCashflow');
  if(navCf) navCf.classList.remove('active');
  if(tab==='savings') document.getElementById('navSavings').classList.add('active');
  if(tab==='carpool') document.getElementById('navCarpool').classList.add('active');
  if(tab==='cars' && navCars) navCars.classList.add('active');
  if(tab==='instalments' && navInst) navInst.classList.add('active');
  if(tab==='school' && navSchool) navSchool.classList.add('active');
  if(tab==='routine' && navRoutine) navRoutine.classList.add('active');
  if(tab==='cashflow' && navCf) navCf.classList.add('active');
  document.getElementById('page-'+tab).classList.add('active');
  if(tab==='carpool') renderCarpool();
  if(tab==='savings'){ renderFunds(); renderCustomMaintCards(); }
  if(tab==='reports'){ renderReportFilters(); renderReports(); loadBorrowReport(); restoreDailyFuel(); loadFuelReport(); restorePricingSettings(); runSmartEngine(); initCFReportPickers(); }
  if(tab==='prayer'){ pDayOffset=0; renderPrayer(); }
  if(tab==='money'){ renderMoneyOwed(); try{ renderOdinInsights('money'); }catch(e){} }
  if(tab==='cars'){ renderCars(); }
  if(tab==='instalments'){ renderInst(); }
  if(tab==='school'){ renderSchool(); }
  if(tab==='routine'){ renderRoutine(); }
  if(tab==='cashflow'){ renderCashFlow(); }
  if(tab==='odin'){ renderOdinTab(); }
}

// ── POST-LOGIN LAUNCH MENU ──


// ══════════════════════════════════════════════════════════════
// 🧠 ODIN COMMAND CENTRE TAB
// ══════════════════════════════════════════════════════════════

// ── Odin auto-refresh — call after any save/delete ──
function odinRefreshIfOpen(){
  try{
    var odinPage = document.getElementById('page-odin');
    if(odinPage && odinPage.classList.contains('active')) renderOdinTab();
  }catch(e){}
}

function renderOdinTab(){
  var now = new Date();
  var mk  = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  var hour = now.getHours();
  var timeGreet = hour<12?'Good morning':hour<17?'Good afternoon':'Good evening';

  // Greeting
  var greetEl = document.getElementById('odinTabGreeting');
  if(greetEl) greetEl.textContent = timeGreet+', '+( currentUser||'Yasin')+'. Here\'s your financial overview.';

  // ── ALERTS ──
  _renderOdinTabAlerts(now, mk);

  // ── SNAPSHOT ──
  _renderOdinTabSnapshot(mk);

  // ── RECENT ACTIVITY ──
  _renderOdinTabActivity(mk);
}

function _renderOdinTabAlerts(now, mk){
  var container = document.getElementById('odinTabAlerts');
  if(!container) return;
  var alerts = buildOdinLaunchAlerts();
  container.innerHTML = '';

  if(!alerts.length){
    var ok = document.createElement('div');
    ok.style.cssText = 'background:#0d1a00;border:1px solid #1a3a00;border-radius:10px;padding:14px 16px;font-size:12px;color:#5a8800;';
    ok.textContent = '✅ All clear — nothing urgent right now.';
    container.appendChild(ok);
    return;
  }

  alerts.forEach(function(a){
    var bg     = a.level==='red'?'#1a0505':a.level==='amber'?'#1a1000':'#0d1a00';
    var border = a.level==='red'?'#3a1a1a':a.level==='amber'?'#3a2a00':'#1a3a00';
    var color  = a.level==='red'?'#f23060':a.level==='amber'?'#f2a830':'#5a8800';
    var dot    = a.level==='red'?'🔴':a.level==='amber'?'🟡':'🟢';

    var card = document.createElement('div');
    card.style.cssText = 'background:'+bg+';border:1px solid '+border+';border-radius:10px;padding:12px 14px;margin-bottom:10px;';

    // Main row — dot + text
    var mainRow = document.createElement('div');
    mainRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:'+(a.actions&&a.actions.length?'10px':'0')+';';

    var dotSpan = document.createElement('span');
    dotSpan.style.cssText = 'font-size:14px;flex-shrink:0;';
    dotSpan.textContent = dot;

    var textSpan = document.createElement('span');
    textSpan.style.cssText = 'font-size:12px;color:'+color+';flex:1;font-family:DM Mono,monospace;letter-spacing:0.3px;line-height:1.4;';
    textSpan.textContent = a.text;

    mainRow.appendChild(dotSpan);
    mainRow.appendChild(textSpan);
    card.appendChild(mainRow);

    // Action buttons row
    if(a.actions && a.actions.length){
      var actRow = document.createElement('div');
      actRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;padding-left:24px;';

      a.actions.forEach(function(action){
        var isDelete = action.label.toLowerCase().indexOf('delete') > -1;
        var btn = document.createElement('button');
        btn.style.cssText = 'background:none;border:1px solid '+(isDelete?'#5a1a1a':'#2a3a1a')+';border-radius:6px;'
          +'padding:5px 12px;color:'+(isDelete?'#f23060':color)+';font-family:DM Mono,monospace;'
          +'font-size:10px;letter-spacing:1px;cursor:pointer;transition:all .15s;';
        btn.onmouseover = function(){
          this.style.background = isDelete?'#2a0808':'#0d2000';
        };
        btn.onmouseout = function(){
          this.style.background = 'none';
        };
        btn.textContent = action.label;
        btn.addEventListener('click', action.fn);
        actRow.appendChild(btn);
      });

      card.appendChild(actRow);
    }

    container.appendChild(card);
  });
}

function _renderOdinTabSnapshot(mk){
  var container = document.getElementById('odinTabSnapshot');
  if(!container) return;
  container.innerHTML = '';

  var snap = null;
  try{ snap = (typeof getLendingSnapshot==='function') ? getLendingSnapshot() : null; }catch(e){}

  var tiles = [];

  // Cash flow net
  if(snap){
    tiles.push({
      label:'Net Cash Flow',
      value:(snap.net>=0?'+':'')+fmtR(snap.net),
      color: snap.net>=0?'#c8f230':'#f23060',
      bg: snap.net>=0?'#0d1a00':'#1a0505',
      border: snap.net>=0?'#1a3a00':'#5a1a1a',
      tab:'cashflow'
    });
  }

  // Maintenance fund this month
  try{
    var mdata = getMaintData();
    var mThisMonth = mdata.filter(function(e){ return e.date&&e.date.startsWith(mk); }).reduce(function(s,e){ return s+e.amount; },0);
    tiles.push({
      label:'Maintenance Fund',
      value: fmtR(mThisMonth)+' / '+fmtR(MAINT_TARGET),
      color: mThisMonth>=MAINT_TARGET?'#c8f230':'#f2a830',
      bg:'#1a1000', border:'#3a2a00', tab:'savings'
    });
  }catch(e){}

  // Total owed to you
  try{
    var totalOwed = 0;
    var pax = loadPassengers()||[];
    pax.forEach(function(p){
      var ents = (borrowData&&borrowData[p.name])||[];
      var b=0,r=0;
      ents.forEach(function(e){ if(e.type==='repay') r+=Number(e.amount||0); else b+=Number(e.amount||0); });
      totalOwed += Math.max(0,b-r);
    });
    var extD = loadExternalBorrows();
    Object.values(extD).forEach(function(p){
      var b=0,r=0;
      (p.entries||[]).forEach(function(e){ if(e.type==='repay') r+=Number(e.amount||0); else b+=Number(e.amount||0); });
      totalOwed += Math.max(0,b-r);
    });
    tiles.push({
      label:'Owed to You',
      value: fmtR(totalOwed),
      color: totalOwed>0?'#a78bfa':'#555',
      bg:'#0d0a1a', border:'#2a1a4a', tab:'money'
    });
  }catch(e){}

  // Savings total
  try{
    var totalSaved = (funds||[]).filter(function(f){ return !f.isExpense; }).reduce(function(s,f){ return s+fundTotal(f); },0);
    tiles.push({
      label:'Total Saved',
      value: fmtR(totalSaved),
      color:'#c8f230', bg:'#0d1a00', border:'#1a3a00', tab:'savings'
    });
  }catch(e){}

  tiles.forEach(function(t){
    var tile = document.createElement('div');
    tile.style.cssText = 'background:'+t.bg+';border:1px solid '+t.border+';border-radius:10px;padding:14px 12px;cursor:pointer;transition:opacity .15s;';
    tile.onmouseover = function(){ this.style.opacity='0.8'; };
    tile.onmouseout  = function(){ this.style.opacity='1'; };
    tile.addEventListener('click', (function(tab){ return function(){ goToTab(tab); }; })(t.tab));
    tile.innerHTML = '<div style="font-size:9px;color:#555;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">'+t.label+'</div>'
      +'<div style="font-family:Syne,sans-serif;font-weight:800;font-size:18px;color:'+t.color+';">'+t.value+'</div>';
    container.appendChild(tile);
  });
}

function _renderOdinTabActivity(mk){
  var container = document.getElementById('odinTabActivity');
  if(!container) return;
  container.innerHTML = '';

  var activity = [];

  // Recent CF entries
  try{
    var cfData = loadCFData();
    var monthData = cfData[mk]||{};
    var inc = (monthData.income||[]).slice(-3).reverse();
    var exp = (monthData.expenses||[]).slice(-3).reverse();
    inc.forEach(function(e){
      activity.push({ date:e.date||'', text:stripEmojiCF(e.label||'Income'), amount:'+'+fmtR(e.amount), color:'#c8f230', tab:'cashflow' });
    });
    exp.forEach(function(e){
      activity.push({ date:e.date||'', text:stripEmojiCF(e.label||'Expense'), amount:'-'+fmtR(e.amount), color:'#f23060', tab:'cashflow' });
    });
  }catch(e){}

  // Sort by date desc
  activity.sort(function(a,b){ return b.date.localeCompare(a.date); });
  activity = activity.slice(0,8);

  if(!activity.length){
    var none = document.createElement('div');
    none.style.cssText = 'font-size:11px;color:#333;padding:8px 0;';
    none.textContent = 'No activity this month yet.';
    container.appendChild(none);
    return;
  }

  activity.forEach(function(a){
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #161616;cursor:pointer;';
    row.addEventListener('click', (function(tab){ return function(){ goToTab(tab); }; })(a.tab));
    row.innerHTML = '<div><div style="font-size:12px;color:#efefef;font-family:DM Mono,monospace;">'+a.text+'</div>'
      +'<div style="font-size:10px;color:#333;margin-top:2px;">'+a.date+'</div></div>'
      +'<span style="font-size:13px;font-weight:700;color:'+a.color+';">'+a.amount+'</span>';
    container.appendChild(row);
  });
}

// ══ ODIN LAUNCH ALERTS ══
function buildOdinLaunchAlerts(){
  var alerts = [];
  var now = new Date();
  var mk = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');

  // ── Car service ──
  try{
    loadCarsData().forEach(function(car){
      var daysLeft = null;
      var svcResult = calcNextService(car);
      daysLeft = svcResult.daysUntilNext;
      if(daysLeft === null) return;
      var level = daysLeft < 0 ? 'red' : daysLeft <= 30 ? 'red' : daysLeft <= 90 ? 'amber' : null;
      if(!level) return;
      var text = daysLeft < 0
        ? car.name+' service OVERDUE by '+Math.abs(daysLeft)+' days'
        : car.name+' service due in '+daysLeft+' days';
      alerts.push({ level:level, text:text, tab:'cars',
        actions:[{ label:'Go to Cars', fn: function(){ goToTab('cars'); } }]
      });
    });
  }catch(e){}

  // ── Cash flow ──
  try{
    var snap = (typeof getLendingSnapshot==='function') ? getLendingSnapshot() : null;
    if(snap && snap.net < 0){
      alerts.push({ level:'red', text:'Cash flow deficit — '+fmtR(Math.abs(snap.net))+' over budget', tab:'cashflow',
        actions:[{ label:'Allocate', fn: function(){ openAllocateModal('odin'); } },
                 { label:'View', fn: function(){ goToTab('cashflow'); } }]
      });
    } else if(snap && snap.net > 0){
      alerts.push({ level:'green', text:'Cash flow positive — '+fmtR(snap.net)+' surplus this month', tab:'cashflow',
        actions:[{ label:'Allocate surplus', fn: function(){ openAllocateModal('odin'); } }]
      });
    }
  }catch(e){}

  // ── Carpool borrows ──
  try{
    var passengers = loadPassengers()||[];
    passengers.forEach(function(p){
      var entries = (borrowData&&borrowData[p.name])||[];
      var b=0,r=0;
      entries.forEach(function(e){ if(e.type==='repay') r+=Number(e.amount||0); else b+=Number(e.amount||0); });
      var owed = Math.max(0,b-r);
      if(owed>0){
        // Find the latest unpaid borrow entry for delete
        var unpaid = entries.filter(function(e){ return e.type!=='repay'; });
        var latest = unpaid.length ? unpaid[unpaid.length-1] : null;
        var pName = p.name;
        var latestId = latest ? latest.id : null;
        var pNameCopy = pName;
        alerts.push({ level:'amber', text: p.name+' owes you '+fmtR(owed), tab:'carpool',
          actions:[
            { label:'↩ Repayment', fn: (function(n){ return function(){ odinOpenRepayment(n,false,null); }; })(pNameCopy) },
            { label:'+ Borrow', fn: (function(n){ return function(){ odinOpenBorrow(n,false,null); }; })(pNameCopy) },
            { label:'View', fn: function(){ goToTab('carpool'); } }
          ]
        });
      }
    });
  }catch(e){}

  // ── External borrows ──
  try{
    var extD = loadExternalBorrows();
    Object.keys(extD).forEach(function(key){
      var p = extD[key];
      var b=0,r=0;
      (p.entries||[]).forEach(function(e){ if(e.type==='repay') r+=Number(e.amount||0); else b+=Number(e.amount||0); });
      var owed = Math.max(0,b-r);
      if(owed>0){
        var unpaid = (p.entries||[]).filter(function(e){ return e.type!=='repay'; });
        var latest = unpaid.length ? unpaid[unpaid.length-1] : null;
        var pKey = key;
        var latestId = latest ? latest.id : null;
        var pKeyCopy = pKey;
        var pNameExtCopy = p.name;
        alerts.push({ level:'amber', text: p.name+' owes you '+fmtR(owed), tab:'money',
          actions:[
            { label:'↩ Repayment', fn: (function(k,n){ return function(){ odinOpenRepayment(n,true,k); }; })(pKeyCopy,pNameExtCopy) },
            { label:'+ Borrow', fn: (function(k,n){ return function(){ odinOpenBorrow(n,true,k); }; })(pKeyCopy,pNameExtCopy) },
            { label:'View', fn: function(){ goToTab('money'); } }
          ]
        });
      }
    });
  }catch(e){}

  // ── Instalments due ──
  try{
    var plans = (typeof loadInst==='function') ? loadInst() : [];
    plans.forEach(function(plan){
      if(plan.monthToMonth) return;
      var paidIdxs = (plan.paid||[]).map(function(p){ return p.index; });
      (plan.dates||[]).forEach(function(ds,i){
        if(paidIdxs.indexOf(i)>-1) return;
        var dueDate = new Date(ds+'T00:00:00');
        var daysLeft = Math.round((dueDate-now)/86400000);
        if(daysLeft>=0 && daysLeft<=14){
          var planId = plan.id;
          alerts.push({ level:'red', text: plan.desc+' — '+fmtR(plan.amt)+' due in '+daysLeft+' days', tab:'instalments',
            actions:[
              { label:'View', fn: function(){ goToTab('instalments'); } },
              { label:'Delete plan', fn: function(){
                if(confirm('Delete instalment plan "'+plan.desc+'"? This cannot be undone.')){
                  deleteInstPlan(planId);
                  renderOdinTab();
                }
              }}
            ]
          });
        }
      });
    });
  }catch(e){}

  // ── Savings funds low ──
  try{
    (funds||[]).filter(function(f){ return !f.isExpense&&f.goal>0; }).forEach(function(f){
      var saved = fundTotal(f);
      var pct = saved/f.goal;
      if(pct >= 1){
        alerts.push({ level:'green', text:(f.emoji||'💰')+' '+f.name+' — Goal reached!', tab:'savings',
          actions:[{ label:'View', fn: function(){ goToTab('savings'); } }]
        });
      } else if(pct < 0.2){
        var fId = f.id;
        alerts.push({ level:'amber', text:(f.emoji||'💰')+' '+f.name+' — only '+Math.round(pct*100)+'% saved', tab:'savings',
          actions:[
            { label:'Deposit', fn: function(){ goToTab('savings'); } },
            { label:'Delete fund', fn: function(){
              if(confirm('Delete fund "'+f.name+'"? All deposits will be lost.')){
                deleteFund(fId);
                renderOdinTab();
              }
            }}
          ]
        });
      }
    });
  }catch(e){}

  // ── Maintenance fund ──
  try{
    var mdata = getMaintData();
    var mThisMonth = mdata.filter(function(e){ return e.date&&e.date.startsWith(mk); }).reduce(function(s,e){ return s+e.amount; },0);
    var mShort = Math.max(0, MAINT_TARGET - mThisMonth);
    if(mShort > 0){
      alerts.push({ level:'amber', text:'Maintenance Fund — R'+mShort.toFixed(0)+' short this month', tab:'savings',
        actions:[{ label:'View', fn: function(){ goToTab('savings'); } }]
      });
    } else {
      alerts.push({ level:'green', text:'Maintenance Fund — target met this month', tab:'savings',
        actions:[{ label:'View', fn: function(){ goToTab('savings'); } }]
      });
    }
  }catch(e){}

  return alerts;
}


function renderOdinLaunchAlerts(){
  var container = document.getElementById('odinLaunchAlerts');
  if(!container) return;
  var alerts = buildOdinLaunchAlerts();
  container.innerHTML = '';

  if(!alerts.length){
    var clear = document.createElement('div');
    clear.style.cssText = 'background:#0d1a00;border:1px solid #1a3a00;border-radius:10px;padding:12px 16px;font-size:12px;color:#5a8800;letter-spacing:0.5px;';
    clear.textContent = '✅ All clear — no urgent items today.';
    container.appendChild(clear);
    return;
  }

  var red   = alerts.filter(function(a){ return a.level==='red'; });
  var amber = alerts.filter(function(a){ return a.level==='amber'; });
  var green = alerts.filter(function(a){ return a.level==='green'; });

  // Summary line
  var summary = document.createElement('div');
  summary.style.cssText = 'font-size:10px;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;';
  if(red.length){
    summary.style.color = '#f23060';
    summary.textContent = '⚠ '+red.length+' urgent item'+(red.length>1?'s':'')+' need'+(red.length===1?'s':'')+' attention';
  } else if(amber.length){
    summary.style.color = '#f2a830';
    summary.textContent = amber.length+' item'+(amber.length>1?'s':'')+' to keep an eye on';
  } else {
    summary.style.color = '#5a8800';
    summary.textContent = 'Looking good today';
  }
  container.appendChild(summary);

  // Show only red alerts by default
  var defaultAlerts = red.length ? red : amber.length ? amber.slice(0,2) : green.slice(0,1);
  var hiddenAlerts  = red.length ? amber.concat(green) : amber.length ? amber.slice(2).concat(green) : green.slice(1);

  function buildAlertCard(a){
    var bg    = a.level==='red'?'#1a0505':a.level==='amber'?'#1a1000':'#0d1a00';
    var border= a.level==='red'?'#5a1a1a':a.level==='amber'?'#5a3a00':'#1a3a00';
    var color = a.level==='red'?'#f23060':a.level==='amber'?'#f2a830':'#5a8800';
    var dot   = a.level==='red'?'🔴':a.level==='amber'?'🟡':'🟢';
    var d = document.createElement('div');
    d.style.cssText = 'display:flex;align-items:center;gap:10px;background:'+bg+';border:1px solid '+border+';border-radius:8px;padding:10px 14px;margin-bottom:8px;cursor:pointer;transition:opacity .15s;';
    d.onmouseover = function(){ this.style.opacity='0.8'; };
    d.onmouseout  = function(){ this.style.opacity='1'; };
    d.addEventListener('click', (function(tab){ return function(){ closeLaunchMenu(); goToTab(tab); }; })(a.tab));
    var dotSpan = document.createElement('span');
    dotSpan.style.cssText = 'font-size:14px;flex-shrink:0;';
    dotSpan.textContent = dot;
    var textSpan = document.createElement('span');
    textSpan.style.cssText = 'font-size:12px;color:'+color+';flex:1;font-family:DM Mono,monospace;letter-spacing:0.3px;';
    textSpan.textContent = a.text;
    var arrow = document.createElement('span');
    arrow.style.cssText = 'color:#333;font-size:16px;';
    arrow.textContent = '›';
    d.appendChild(dotSpan);
    d.appendChild(textSpan);
    d.appendChild(arrow);
    return d;
  }

  // Render default (urgent) alerts
  defaultAlerts.forEach(function(a){ container.appendChild(buildAlertCard(a)); });

  // View all toggle
  if(hiddenAlerts.length){
    var extraWrap = document.createElement('div');
    extraWrap.style.display = 'none';
    hiddenAlerts.forEach(function(a){ extraWrap.appendChild(buildAlertCard(a)); });
    container.appendChild(extraWrap);

    var toggleBtn = document.createElement('button');
    toggleBtn.style.cssText = 'width:100%;background:none;border:1px solid #2a2a2a;border-radius:8px;padding:8px;color:#555;font-family:DM Mono,monospace;font-size:10px;letter-spacing:1px;cursor:pointer;margin-top:2px;transition:all .15s;';
    toggleBtn.textContent = 'View all ('+hiddenAlerts.length+' more)';
    var expanded = false;
    toggleBtn.addEventListener('click', function(){
      expanded = !expanded;
      extraWrap.style.display = expanded ? 'block' : 'none';
      toggleBtn.textContent = expanded ? 'Show less ↑' : 'View all ('+hiddenAlerts.length+' more)';
      toggleBtn.style.color = expanded ? '#888' : '#555';
    });
    container.appendChild(toggleBtn);
  }
}


function showLaunchMenu(){
  document.getElementById('launchMenuOverlay').style.display='flex';
  // Hide the nav and all pages until the user picks a section
  var nav = document.querySelector('.nav');
  if(nav) nav.style.visibility='hidden';
  document.querySelectorAll('.page').forEach(function(p){ p.style.visibility='hidden'; });
  // Build menu items based on role
  const list = document.getElementById('launchMenuList');
  list.innerHTML = '';

  const adminItems = [
    { icon:'🚗', label:'Carpool', sub:'Trips, payments & statements', tab:'carpool' },
    { icon:'💰', label:'Savings', sub:'Funds & deposit tracking', tab:'savings' },
    { icon:'💵', label:'Cash Flow', sub:'Income, expenses & net position', tab:'cashflow' },
    { icon:'💳', label:'Instalments', sub:'Payment plans & instalment tracking', tab:'instalments' },
    { icon:'🎓', label:'School', sub:'Webinars, assignments, exams & quizzes', tab:'school' },
    { icon:'🔧', label:'Car Service Tracker', sub:'Maintenance logs & expense history', tab:'cars' },
    { icon:'🤝', label:'Money Owed to Me', sub:'Loans, repayments & balances', tab:'money' },
    { icon:'📊', label:'Reports', sub:'Fuel savings & borrow summary', tab:'reports' },
    { icon:'🕌', label:'Prayer Tracker', sub:'Salah streaks & heatmap', tab:'prayer' },
    { icon:'🔁', label:'Routine', sub:'Daily tasks & habit tracking', tab:'routine' },
    { icon:'✦', label:'AI Assistant', sub:'Ask anything about your dashboard', tab:'ai' },
  ];
  const passengerItems = [
    { icon:'🚗', label:'Carpool', sub:'View your trips & statement', tab:'carpool' },
  ];
  const carserviceItems = [
    { icon:'🔧', label:'Car Service Tracker', sub:'Maintenance logs & expense history', tab:'cars' },
  ];

  const items = currentRole === 'admin' ? adminItems : currentRole === 'carservice' ? carserviceItems : passengerItems;
  items.forEach(function(item){
    const btn = document.createElement('button');
    btn.style.cssText = 'display:flex;align-items:center;gap:16px;width:100%;padding:16px 18px;background:#111;border:1px solid #2a2a2a;border-radius:10px;cursor:pointer;text-align:left;transition:all .18s;font-family:"DM Mono",monospace;margin-bottom:10px;';
    btn.onmouseover = function(){ this.style.borderColor='#c8f230'; this.style.background='#0d1a00'; };
    btn.onmouseout  = function(){ this.style.borderColor='#2a2a2a'; this.style.background='#111'; };
    btn.innerHTML =
      '<span style="font-size:28px;line-height:1;flex-shrink:0;">'+item.icon+'</span>'+
      '<div>'+
        '<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:15px;color:#efefef;margin-bottom:2px;">'+item.label+'</div>'+
        '<div style="font-size:10px;color:#555;letter-spacing:1px;">'+item.sub+'</div>'+
      '</div>'+
      '<span style="margin-left:auto;color:#333;font-size:18px;">›</span>';
    btn.onclick = function(){
      closeLaunchMenu();
      if(item.tab === 'ai'){ openAIAssistant(); } else { goToTab(item.tab); }
    };
    list.appendChild(btn);
  });

  // Greeting
  const greeting = document.getElementById('launchGreeting');
  const hour = new Date().getHours();
  const timeGreet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  greeting.textContent = timeGreet + ', ' + (currentUser || 'there') + ' 👋';

  // Odin alerts — only for admin
  if(currentRole === 'admin'){
    setTimeout(renderOdinLaunchAlerts, 50);
  } else {
    var alertsEl = document.getElementById('odinLaunchAlerts');
    if(alertsEl) alertsEl.innerHTML = '';
  }
}

function closeLaunchMenu(){
  document.getElementById('launchMenuOverlay').style.display='none';
  // Restore nav and pages
  var nav = document.querySelector('.nav');
  if(nav) nav.style.visibility='';
  document.querySelectorAll('.page').forEach(function(p){ p.style.visibility=''; });
}
function closeModal(id){document.getElementById(id).classList.remove('active');}
document.querySelectorAll('.overlay').forEach(o=>{o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('active');});});

// ══ SAVINGS ══

const EMOJIS=['🚗','🏠','🎉','💊','📚','✈️','👶','🛒','💎','🔧','🌙','💰','⚡','🎯','🛞','🏋️'];
const COLORS=['#c8f230','#f23060','#30c8f2','#f2a830','#a830f2','#30f2a8','#f230c8','#ffffff'];
let funds=[],editingId=null,depositingId=null,selEmoji='💰',selColor='#c8f230';

function loadFunds(){
  try{funds=JSON.parse(lsGet(SK)||'[]');}catch(e){funds=[];}
}
function saveFunds(){lsSet(SK,JSON.stringify(funds)); odinRefreshIfOpen();}

// ── fundTotal: sum all deposits for a fund ──
function fundTotal(f){
  return (f.deposits||[]).reduce(function(s,d){
    if(d.txnType==='out') return s - d.amount;
    return s + d.amount;
  }, 0);
}

function remaining(f){return Math.max(0,f.goal-fundTotal(f));}
function pct(f){return Math.min(100,(fundTotal(f)/f.goal)*100);}
function weeksLeft(f){return Math.ceil(remaining(f)/(f.weekly||200));}
function etaDate(f){const d=new Date();d.setDate(d.getDate()+weeksLeft(f)*7);return d.toLocaleDateString('en-ZA',{day:'2-digit',month:'short',year:'numeric'});}

function renderFunds(){
  const grid=document.getElementById('fundGrid');grid.innerHTML='';
  let grand=0;
  if(!funds.length){
    grid.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:48px 24px;color:#333;font-size:13px;letter-spacing:1px;">No savings funds yet.<br><span style="font-size:11px;color:#2a2a2a;">Tap <strong style="color:#555;">+ New Savings Fund</strong> to get started.</span></div>';
    renderBankStrip();
    return;
  }
  funds.forEach(f=>{
    grand+=fundTotal(f);
    const total=fundTotal(f),rem=remaining(f),p=pct(f),done=rem===0;
    const card=document.createElement('div');card.className='fund-card';
    const isExpense = f.isExpense || false;
    const weeklyLabel = f.targetType==='monthly' ? 'R'+Math.round(f.weekly*4.33)+'/month' : 'R'+f.weekly+'/week';
    const subtitleLabel = isExpense ? 'expense tracker' : weeklyLabel;
    const startedLabel = new Date(f.start).toLocaleDateString('en-ZA',{day:'2-digit',month:'short',year:'2-digit'});

    // Unified stats
    const totalIn = isExpense
      ? f.deposits.filter(function(d){return d.txnType==='in';}).reduce(function(s,d){return s+d.amount;},0)
      : total;
    const totalOut = isExpense
      ? f.deposits.filter(function(d){return d.txnType==='out'||!d.txnType;}).reduce(function(s,d){return s+d.amount;},0)
      : 0;
    const balance = isExpense ? totalIn - totalOut : total;
    const goalAmt = f.goal;
    const progPct = isExpense
      ? (totalIn > 0 ? Math.max(0, Math.min(100, (balance/totalIn)*100)) : 0)
      : Math.min(100, (total/goalAmt)*100);
    const progColor = isExpense
      ? (balance < 0 ? '#f23060' : balance < totalIn*0.2 ? '#f2a830' : '#c8f230')
      : f.color;
    const balColor = isExpense
      ? (balance < 0 ? '#f23060' : balance < totalIn*0.2 ? '#f2a830' : '#c8f230')
      : f.color;
    const barLabel = isExpense
      ? (totalIn===0 ? 'No funds added yet' : balance < 0 ? fmtR(Math.abs(balance))+' over budget' : fmtR(balance)+' remaining')
      : (done ? '🎉 Goal reached!' : p.toFixed(0)+'% · '+fmtR(rem)+' to go · '+etaDate(f));
    const barLabelColor = (isExpense && balance < 0) ? '#f23060' : '#444';

    // Transaction rows
    const txnRows = [...f.deposits].sort(function(a,b){return new Date(b.date)-new Date(a.date);}).slice(0,5).map(function(d){
      const isOut = d.txnType==='out';
      const amtColor = isOut ? '#f23060' : '#c8f230';
      const prefix = isOut ? '-' : '+';
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #161616"><div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:11px;color:#efefef">'+(d.note||'—')+'</span><span style="font-size:10px;color:#333">'+d.date+'</span></div><span style="font-size:12px;font-weight:500;color:'+amtColor+'">'+prefix+fmtR(d.amount)+'</span></div>';
    }).join('');

    const balColor2 = balance<0?'#f23060':balance<1000?'#f2a830':'#c8f230';
    const stat1Label = isExpense ? 'Available' : 'Saved';
    const stat1Val = isExpense ? fmtR(balance) : fmtR(total);
    const stat2Label = isExpense ? 'Added' : 'Goal';
    const stat2Val = isExpense ? fmtR(totalIn) : fmtR(goalAmt);
    const stat2Color = isExpense ? '#c8f230' : '#555';
    const stat3Label = isExpense ? 'Spent' : 'Remaining';
    const stat3Val = isExpense ? fmtR(totalOut) : (done ? '🎉' : fmtR(rem));
    const stat3Color = isExpense ? '#f23060' : (done ? '#c8f230' : '#f2a830');

    const bodyHtml = '<div class="fund-body">'
      +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:1px solid var(--border);margin:-16px -18px 0;padding:0">'
      +'<div style="padding:12px 14px;border-right:1px solid var(--border)"><div style="font-size:9px;color:#444;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px">'+stat1Label+'</div><div style="font-family:Syne,sans-serif;font-weight:700;font-size:15px;color:'+balColor+'">'+stat1Val+'</div></div>'
      +'<div style="padding:12px 10px;border-right:1px solid var(--border)"><div style="font-size:9px;color:#444;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px">'+stat2Label+'</div><div style="font-family:Syne,sans-serif;font-weight:700;font-size:15px;color:'+stat2Color+'">'+stat2Val+'</div></div>'
      +'<div style="padding:12px 10px"><div style="font-size:9px;color:#444;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px">'+stat3Label+'</div><div style="font-family:Syne,sans-serif;font-weight:700;font-size:15px;color:'+stat3Color+'">'+stat3Val+'</div></div>'
      +'</div>'
      +'<div style="padding:10px 0;border-bottom:1px solid var(--border)"><div style="height:5px;background:#2a2a2a;border-radius:3px;overflow:hidden"><div style="width:'+progPct+'%;height:100%;background:'+progColor+';border-radius:3px;transition:width .5s ease;box-shadow:0 0 8px '+progColor+'55"></div></div><div style="font-size:10px;color:'+barLabelColor+';margin-top:5px;letter-spacing:1px">'+barLabel+'</div></div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:1px solid var(--border);margin:0 -18px">'
      +'<button class="admin-only" onclick="'+(isExpense?'openCarTxn(\''+f.id+'\',\'in\')':'openDeposit(\''+f.id+'\')')+'" style="padding:11px;font-family:DM Mono,monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;border:none;background:#1a2e00;color:#c8f230;border-right:1px solid var(--border)">＋ '+(isExpense?'Add Funds':'Deposit')+'</button>'
      +(isExpense
        ? '<button class="admin-only" onclick="openUseFunds(\'savings\',\''+f.id+'\')" style="padding:11px;font-family:DM Mono,monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;border:none;background:#2a1000;color:#f2a830">💸 Use Funds</button>'
        : '<button class="admin-only" onclick="openUseFunds(\'savings\',\''+f.id+'\')" style="padding:11px;font-family:DM Mono,monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;border:none;background:#2a1500;color:#f2a830;border-right:1px solid var(--border)">💸 Use</button>'
         +'<button class="admin-only" onclick="openHistory(\''+f.id+'\')" style="padding:11px;font-family:DM Mono,monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;border:none;background:#1a0a00;color:#888">☰</button>'
      )
      +'</div>'
      +'<div style="padding-top:8px">'+txnRows+'</div>'
      +'</div>';

    const cardId = 'fc-'+f.id;
    const isCollapsed = false;
    const chevClass = isCollapsed ? 'collapse-btn collapsed' : 'collapse-btn';
    const wrapStyle = isCollapsed ? 'max-height:0;opacity:0;' : 'max-height:2000px;opacity:1;';
    card.innerHTML = '<div class="fund-top"><div><span class="fund-emoji">'+f.emoji+'</span><div class="fund-name">'+f.name+'</div><div class="fund-weekly">'+subtitleLabel+' · started '+startedLabel+'</div></div><div style="display:flex;align-items:center;gap:6px"><button class="'+chevClass+'" onclick="toggleFundCard(\''+f.id+'\',this)" title="Collapse"><span class="chev">&#8964;</span></button><div class="fund-actions admin-only" style="display:flex;gap:6px"><button class="icon-btn" onclick="openHistory(\''+f.id+'\')">☰</button><button class="icon-btn" onclick="openEditFund(\''+f.id+'\')">✎</button><button class="icon-btn danger" onclick="deleteFund(\''+f.id+'\')">✕</button></div></div></div>'
      + '<div class="fund-body-wrap '+(isCollapsed?'collapsed':'expanded')+'" id="'+cardId+'" style="'+wrapStyle+'">' + bodyHtml + '</div>';
    grid.appendChild(card);
  });
  renderBankStrip();
  setTimeout(()=>{document.querySelectorAll('.prog-fill').forEach((el,i)=>{el.style.transitionDelay=(i*.08)+'s';});},50);
}

// ── Manual bank balances — stored per fund id ──
const MANUAL_BAL_KEY = 'yb_manual_balances_v1';
function loadManualBalances(){ try{ return JSON.parse(lsGet(MANUAL_BAL_KEY)||'{}'); }catch(e){ return {}; } }
function saveManualBalances(data){ lsSet(MANUAL_BAL_KEY, JSON.stringify(data)); }

function getFundTrackedBal(f){
  if(f.name === 'Car Fund (EE90)'){
    const totalIn  = (f.deposits||[]).filter(function(d){ return d.txnType === 'in'; }).reduce(function(s,d){ return s + d.amount; }, 0);
    const totalOut = (f.deposits||[]).filter(function(d){ return d.txnType === 'out' || !d.txnType; }).reduce(function(s,d){ return s + d.amount; }, 0);
    return totalIn - totalOut;
  }
  return fundTotal(f);
}

function openBalanceEdit(fundId){
  const f = funds.find(function(x){ return x.id === fundId; });
  if(!f) return;
  const manuals = loadManualBalances();
  const tracked = getFundTrackedBal(f);
  const current = manuals[fundId] !== undefined ? manuals[fundId] : tracked;

  // Build modal
  const old = document.getElementById('balEditModal');
  if(old) old.remove();

  const modal = document.createElement('div');
  modal.id = 'balEditModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:500;display:flex;align-items:center;justify-content:center;padding:16px;';
  modal.innerHTML =
    '<div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:20px;width:100%;max-width:340px;">'
    + '<div style="font-family:\'Syne\',sans-serif;font-weight:800;font-size:16px;color:#efefef;margin-bottom:4px;">' + f.emoji + ' ' + f.name + '</div>'
    + '<div style="font-size:10px;color:#555;letter-spacing:1px;margin-bottom:16px;">Set the actual balance in your bank account</div>'
    + '<div style="margin-bottom:6px;">'
    + '<label style="display:block;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#555;margin-bottom:6px;">Actual Bank Balance (R)</label>'
    + '<input id="balEditInput" type="number" inputmode="decimal" value="' + current.toFixed(2) + '" '
    + 'style="width:100%;background:#111;border:1px solid #333;color:#efefef;font-family:\'DM Mono\',monospace;font-size:18px;padding:12px;border-radius:4px;outline:none;box-sizing:border-box;"/>'
    + '</div>'
    + '<div style="font-size:10px;color:#444;margin-bottom:18px;letter-spacing:0.5px;">Tracked by deposits: <span style="color:#888;">' + fmtR(tracked) + '</span></div>'
    + '<div style="display:flex;gap:10px;">'
    + '<button onclick="document.getElementById(\'balEditModal\').remove();" style="flex:1;padding:11px;background:none;border:1px solid #2a2a2a;color:#555;font-family:\'DM Mono\',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;border-radius:4px;cursor:pointer;">Cancel</button>'
    + '<button onclick="saveBalanceEdit(\''+fundId+'\')" style="flex:1;padding:11px;background:#c8f230;border:none;color:#000;font-family:\'DM Mono\',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;border-radius:4px;cursor:pointer;font-weight:700;">Save</button>'
    + '</div>'
    + '</div>';
  document.body.appendChild(modal);
  setTimeout(function(){ document.getElementById('balEditInput').select(); }, 50);

  // Close on backdrop click
  modal.addEventListener('click', function(e){ if(e.target === modal) modal.remove(); });
}

function saveBalanceEdit(fundId){
  const input = document.getElementById('balEditInput');
  const val = parseFloat(input ? input.value : '');
  if(isNaN(val)){ return; }

  // ── #8 fix: store manualBalance directly on the fund, no fake deposits ──
  const manuals = loadManualBalances();
  manuals[fundId] = val;
  saveManualBalances(manuals);

  // Clean up any old isBalanceCorrection deposits from previous approach
  const f = funds.find(function(x){ return x.id === fundId; });
  if(f && f.deposits){
    const before = f.deposits.length;
    f.deposits = f.deposits.filter(function(d){ return !d.isBalanceCorrection; });
    if(f.deposits.length !== before) saveFunds();
  }

  const modal = document.getElementById('balEditModal');
  if(modal) modal.remove();
  renderFunds();
}

function renderBankStrip(){
  const strip = document.getElementById('bankStrip');
  if(!strip) return;

  const tymeFundNames = ['The Vault (Tax)', 'Traffic Infractions'];
  const kidsFundNames = ["Masud's Fund"];
  const manuals = loadManualBalances();

  strip.innerHTML = '';

  if(!funds.length){
    strip.innerHTML = '<div style="padding:10px 14px;font-size:11px;color:#333;">No funds yet</div>';
    return;
  }

  funds.forEach(function(f, i){
    const tracked = getFundTrackedBal(f);
    const bal = manuals[f.id] !== undefined ? manuals[f.id] : tracked;
    const hasManual = manuals[f.id] !== undefined;

    let color;
    if(kidsFundNames.indexOf(f.name) >= 0)      color = '#ffb830';
    else if(tymeFundNames.indexOf(f.name) >= 0) color = '#c8f230';
    else                                          color = 'var(--text)';

    const isLast = (i === funds.length - 1);
    const row = document.createElement('div');
    row.style.cssText =
      'display:flex;justify-content:space-between;align-items:center;padding:8px 14px;cursor:pointer;transition:background .15s;'
      + (isLast ? '' : 'border-bottom:1px solid var(--border);');
    row.title = 'Tap to edit balance';
    row.onmouseenter = function(){ this.style.background='#222'; };
    row.onmouseleave = function(){ this.style.background=''; };
    row.onclick = function(){ openBalanceEdit(f.id); };
    row.innerHTML =
      '<span style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);'
      + 'max-width:130px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="'+f.name+'">'
      + f.emoji + ' ' + f.name
      + '</span>'
      + '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">'
      + (hasManual ? '<span style="font-size:9px;color:#555;" title="Manually set">✎</span>' : '')
      + '<strong style="font-size:13px;color:' + color + ';">' + fmtR(bal) + '</strong>'
      + '</div>';
    strip.appendChild(row);
  });
}

function toggleBankPanel(){
  const body = document.getElementById('bankPanelBody');
  const chev = document.getElementById('bankChev');
  if(!body) return;
  const isCollapsed = body.style.maxHeight === '0px' || body.style.maxHeight === '0';
  if(isCollapsed){
    body.style.maxHeight = '600px';
    body.style.opacity = '1';
    if(chev) chev.style.transform = 'rotate(0deg)';
    lsSet('collapse_bankpanel','0');
  } else {
    body.style.maxHeight = '0px';
    body.style.opacity = '0';
    if(chev) chev.style.transform = 'rotate(-90deg)';
    lsSet('collapse_bankpanel','1');
  }
}
function toggleMaintCard(btn){
  const wrap = document.getElementById('maintBodyWrap');
  if(!wrap) return;
  const isNowCollapsed = !wrap.classList.contains('collapsed');
  if(isNowCollapsed){
    wrap.style.maxHeight = wrap.scrollHeight+'px';
    requestAnimationFrame(function(){
      wrap.classList.add('collapsed');
      wrap.classList.remove('expanded');
      wrap.style.maxHeight = '0';
      btn.classList.add('collapsed');
    });
  } else {
    wrap.classList.remove('collapsed');
    wrap.classList.add('expanded');
    wrap.style.maxHeight = wrap.scrollHeight+'px';
    btn.classList.remove('collapsed');
    setTimeout(function(){ wrap.style.maxHeight = '2000px'; }, 360);
  }
  lsSet('collapse_maint', isNowCollapsed ? '1' : '0');
}
function toggleFundCard(id, btn){
  var cardId = 'fc-'+id;
  var wrap = document.getElementById(cardId);
  if(!wrap) return;
  var isNowCollapsed = !wrap.classList.contains('collapsed');
  if(isNowCollapsed){
    wrap.style.maxHeight = wrap.scrollHeight+'px';
    requestAnimationFrame(function(){
      wrap.classList.add('collapsed');
      wrap.classList.remove('expanded');
      wrap.style.maxHeight = '0';
      btn.classList.add('collapsed');
    });
  } else {
    wrap.classList.remove('collapsed');
    wrap.classList.add('expanded');
    wrap.style.maxHeight = wrap.scrollHeight+'px';
    btn.classList.remove('collapsed');
    setTimeout(function(){ wrap.style.maxHeight = '2000px'; }, 360);
  }
  lsSet('collapse_fund_'+id, isNowCollapsed ? '1' : '0');
}

function setTargetType(t){
  targetType=t;
  const bw=document.getElementById('btnWeekly');
  const bm=document.getElementById('btnMonthly');
  if(t==='weekly'){
    bw.style.border='1px solid #c8f230';bw.style.background='#1a2e00';bw.style.color='#c8f230';
    bm.style.border='1px solid var(--border)';bm.style.background='none';bm.style.color='var(--muted)';
    document.getElementById('fWeekly').placeholder='e.g. 200';
  } else {
    bm.style.border='1px solid #c8f230';bm.style.background='#1a2e00';bm.style.color='#c8f230';
    bw.style.border='1px solid var(--border)';bw.style.background='none';bw.style.color='var(--muted)';
    document.getElementById('fWeekly').placeholder='e.g. 800';
  }
  updateTargetHint();
}
function updateTargetHint(){
  const val=parseFloat(document.getElementById('fWeekly').value);
  const hint=document.getElementById('fTargetHint');
  if(!val||!hint)return;
  if(targetType==='weekly'){hint.textContent='= approx R'+(val*4.33).toFixed(0)+'/month';}
  else{hint.textContent='= approx R'+(val/4.33).toFixed(0)+'/week';}
}
function openNewFund(){
  // Show type picker first
  document.getElementById('cardTypePicker').classList.add('active');
}
function openNewFundDirect(){
  // Original new fund logic
  editingId=null;selEmoji='💰';selColor=COLORS[0];
  document.getElementById('modalTitle').textContent='New Fund';
  document.getElementById('fName').value='';
  document.getElementById('fGoal').value='';
  document.getElementById('fWeekly').value='';
  document.getElementById('fTargetHint').textContent='';
  setTargetType('weekly');
  document.getElementById('fStart').value=localDateStr(new Date());
  buildEmojiGrid();buildColorGrid();
  document.getElementById('fundModal').classList.add('active');
}
function openEditFund(id){const f=funds.find(x=>x.id===id);if(!f)return;editingId=id;selEmoji=f.emoji;selColor=f.color;document.getElementById('modalTitle').textContent='Edit Fund';document.getElementById('fName').value=f.name;document.getElementById('fGoal').value=f.goal;targetType=f.targetType||'weekly';document.getElementById('fWeekly').value=f.targetType==='monthly'?Math.round(f.weekly*4.33):f.weekly;document.getElementById('fStart').value=f.start;setTargetType(targetType);updateTargetHint();buildEmojiGrid();buildColorGrid();document.getElementById('fundModal').classList.add('active');}
function buildEmojiGrid(){const g=document.getElementById('emojiGrid');g.innerHTML='';EMOJIS.forEach(e=>{const b=document.createElement('button');b.className='emoji-opt'+(e===selEmoji?' selected':'');b.textContent=e;b.onclick=()=>{selEmoji=e;buildEmojiGrid();};g.appendChild(b);});}
function buildColorGrid(){const g=document.getElementById('colorGrid');g.innerHTML='';COLORS.forEach(c=>{const b=document.createElement('button');b.className='color-opt'+(c===selColor?' selected':'');b.style.background=c;b.onclick=()=>{selColor=c;buildColorGrid();};g.appendChild(b);});}
function saveFund(){const name=document.getElementById('fName').value.trim();const goal=parseFloat(document.getElementById('fGoal').value);const rawAmt=parseFloat(document.getElementById('fWeekly').value)||0;const weekly=targetType==='monthly'?parseFloat((rawAmt/4.33).toFixed(2)):rawAmt;const start=document.getElementById('fStart').value;if(!name||!goal||!start)return;const isNew=!editingId;if(editingId){const f=funds.find(x=>x.id===editingId);Object.assign(f,{name,emoji:selEmoji,color:selColor,goal,weekly,targetType,start,isExpense:f.isExpense||false});}else{funds.push({id:uid(),name,emoji:selEmoji,color:selColor,goal,weekly:weekly||200,targetType,start,deposits:[]});}saveFunds();closeModal('fundModal');renderFunds();showBackupReminder(isNew?'New savings card created':'Savings card updated');}
function deleteFund(id){if(!confirm('Delete this fund?'))return;funds=funds.filter(f=>f.id!==id);saveFunds();renderFunds();}
function openDeposit(id){depositingId=id;const f=funds.find(x=>x.id===id);document.getElementById('depFundName').textContent=f.emoji+' '+f.name;document.getElementById('depAmount').value=f.weekly||200;document.getElementById('depDate').value=localDateStr(new Date());document.getElementById('depNote').value='';document.getElementById('depModal').classList.add('active');}
function confirmDeposit(){
  const amount=parseFloat(document.getElementById('depAmount').value);
  const date=document.getElementById('depDate').value||localDateStr(new Date());
  const note=document.getElementById('depNote').value.trim();
  if(!amount||amount<=0)return;
  const f=funds.find(x=>x.id===depositingId);
  const cfId_dep=postToCF({label:'Savings - '+f.name,amount:amount,date:date,icon:'savings',type:'expense',sourceType:'savings_deposit',sourceId:depositingId,sourceCardName:f.name,note:note});
  f.deposits.push({id:uid(),amount,note,date,cfId:cfId_dep});
  const manuals=loadManualBalances();
  if(manuals[depositingId]!==undefined){delete manuals[depositingId];saveManualBalances(manuals);}
  saveFunds();closeModal('depModal');renderFunds();
}
function openHistory(id){const f=funds.find(x=>x.id===id);document.getElementById('histTitle').textContent=f.emoji+' '+f.name;const deps=[...f.deposits].reverse();let html='';if(!deps.length){html='<p style="color:var(--muted);font-size:12px">No deposits yet.</p>';}else{html='<table style="width:100%;border-collapse:collapse;font-size:12px"><tr><th style="text-align:left;font-size:9px;letter-spacing:2px;color:var(--muted);padding:4px 6px;border-bottom:1px solid var(--border);font-weight:400">DATE</th><th style="text-align:left;font-size:9px;letter-spacing:2px;color:var(--muted);padding:4px 6px;border-bottom:1px solid var(--border);font-weight:400">AMOUNT</th><th style="text-align:left;font-size:9px;letter-spacing:2px;color:var(--muted);padding:4px 6px;border-bottom:1px solid var(--border);font-weight:400">NOTE</th><th style="padding:4px 6px;border-bottom:1px solid var(--border)"></th></tr>';deps.forEach(d=>{const isOut=d.txnType==='out';const amtColor=isOut?'#f23060':'#c8f230';const prefix=isOut?'-':'+';html+=`<tr><td style="padding:9px 6px;border-bottom:1px solid #1a1a1a;color:var(--muted)">${d.date}</td><td style="padding:9px 6px;border-bottom:1px solid #1a1a1a;color:${amtColor};font-weight:500">${prefix}${fmtR(d.amount)}</td><td style="padding:9px 6px;border-bottom:1px solid #1a1a1a;color:var(--muted)">${d.note||'—'}</td><td style="padding:9px 6px;border-bottom:1px solid #1a1a1a"><button onclick="deleteDeposit('${f.id}','${d.id}')" style="background:none;border:none;cursor:pointer;color:#333;font-size:13px" onmouseover="this.style.color='#c0392b'" onmouseout="this.style.color='#333'">✕</button></td></tr>`;});html+='</table>';}document.getElementById('histContent').innerHTML=html;document.getElementById('histModal').classList.add('active');}
function deleteDeposit(fid,did){
  const f=funds.find(x=>x.id===fid);
  const dep=f.deposits.find(function(d){return d.id===did;});
  f.deposits=f.deposits.filter(d=>d.id!==did);
  saveFunds();
  if(dep&&dep.cfId) removeFromCF(dep.cfId);
  openHistory(fid);renderFunds();
}
function postToCF(opts){
  var mk=(opts.date||localDateStr(new Date())).slice(0,7);
  var cfData=loadCFData();
  if(!cfData[mk]) cfData[mk]={income:[],expenses:[]};
  var section=opts.type==='income'?'income':'expenses';
  var cfId=uid();
  cfData[mk][section].push({
    id:cfId, label:opts.label, amount:opts.amount,
    icon:opts.icon||'', date:opts.date||localDateStr(new Date()),
    auto:false, account:opts.sourceCardName||'',
    sourceType:opts.sourceType||'', sourceId:opts.sourceId||'',
    note:opts.note||''
  });
  saveCFData(cfData);
  return cfId;
}
function removeFromCF(cfId){
  if(!cfId) return;
  var cfData=loadCFData();
  var changed=false;
  Object.keys(cfData).forEach(function(mk){
    ['income','expenses'].forEach(function(sec){
      if(cfData[mk]&&cfData[mk][sec]){
        var b=cfData[mk][sec].length;
        cfData[mk][sec]=cfData[mk][sec].filter(function(e){return e.id!==cfId;});
        if(cfData[mk][sec].length!==b) changed=true;
      }
    });
  });
  if(changed) saveCFData(cfData);
}

// ══ USE FUNDS / SPEND FROM CARD ══

var _useFundsCFEnabled = true;

function toggleUseFundsCF(){
  _useFundsCFEnabled = !_useFundsCFEnabled;
  var btn   = document.getElementById('useFundsCFToggle');
  var thumb = document.getElementById('useFundsCFThumb');
  var note  = document.getElementById('useFundsCFNote');
  btn.style.background   = _useFundsCFEnabled ? '#c8f230' : '#333';
  thumb.style.left       = _useFundsCFEnabled ? '22px' : '3px';
  thumb.style.background = _useFundsCFEnabled ? '#000' : '#666';
  note.style.color       = _useFundsCFEnabled ? '#3a5a00' : '#444';
  note.textContent       = _useFundsCFEnabled
    ? '✓ Will appear in Cash Flow → Expenses this month'
    : '— Will NOT be added to Cash Flow';
}

function openUseFunds(cardType, cardId){
  // cardType: 'savings' | 'maint' | 'custommaint'
  _useFundsCFEnabled = true;
  document.getElementById('useFundsCFToggle').style.background = '#c8f230';
  document.getElementById('useFundsCFThumb').style.left = '22px';
  document.getElementById('useFundsCFThumb').style.background = '#000';
  document.getElementById('useFundsCFNote').style.color = '#3a5a00';
  document.getElementById('useFundsCFNote').textContent = '✓ Will appear in Cash Flow → Expenses this month';

  document.getElementById('useFundsFundId').value  = cardId || '';
  document.getElementById('useFundsCardType').value = cardType;
  document.getElementById('useFundsCardId').value  = cardId || '';
  document.getElementById('useFundsDesc').value    = '';
  document.getElementById('useFundsAmt').value     = '';
  document.getElementById('useFundsDate').value    = localDateStr(new Date());

  // Set title & card name
  var title = '💸 Use Funds';
  var cardName = '';
  if(cardType === 'savings'){
    var f = funds.find(function(x){ return x.id === cardId; });
    if(f){ cardName = f.emoji + ' ' + f.name; title = '💸 Spend from ' + f.name; }
  } else if(cardType === 'custommaint'){
    var cards = loadCustomMaintCards();
    var c = cards.find(function(x){ return x.id === cardId; });
    if(c){ cardName = c.emoji + ' ' + c.name; title = '💸 Spend from ' + c.name; }
  } else if(cardType === 'maint'){
    cardName = '🔧 Maintenance Fund';
    title = '💸 Spend from Maintenance';
  }
  document.getElementById('useFundsTitle').textContent    = title;
  document.getElementById('useFundsCardName').textContent = cardName;

  // Populate car dropdown
  var carSel = document.getElementById('useFundsCarSel');
  var carField = document.getElementById('useFundsCarField');
  var cars = loadCarsData ? loadCarsData() : [];
  carSel.innerHTML = '<option value="">— No car link —</option>';
  if(cars.length){
    cars.forEach(function(car){
      var opt = document.createElement('option');
      opt.value = car.id;
      opt.textContent = (car.emoji || '🚗') + ' ' + car.name + (car.reg ? ' (' + car.reg + ')' : '');
      carSel.appendChild(opt);
    });
    carField.style.display = 'block';
  } else {
    carField.style.display = 'none';
  }

  document.getElementById('useFundsModal').classList.add('active');
  setTimeout(function(){ document.getElementById('useFundsDesc').focus(); }, 100);
}

function confirmUseFunds(){
  var cardType = document.getElementById('useFundsCardType').value;
  var cardId   = document.getElementById('useFundsCardId').value;
  var desc     = document.getElementById('useFundsDesc').value.trim();
  var amt      = parseFloat(document.getElementById('useFundsAmt').value);
  var date     = document.getElementById('useFundsDate').value || localDateStr(new Date());
  var carId    = document.getElementById('useFundsCarSel').value;

  if(!desc){ alert('Please enter a description.'); return; }
  if(!amt || amt <= 0){ alert('Please enter a valid amount.'); return; }

  var mk = date.slice(0, 7); // YYYY-MM

  // ── 1. Deduct from the source card ──
  if(cardType === 'savings'){
    var f = funds.find(function(x){ return x.id === cardId; });
    if(f){
      f.deposits.push({ id: uid(), txnType: 'out', amount: amt, date: date, note: '💸 ' + desc + (carId ? ' · Car' : ''), cfPosted: true });
      saveFunds();
      renderFunds();
    }
  } else if(cardType === 'custommaint'){
    var cmCards = loadCustomMaintCards();
    var cm = cmCards.find(function(x){ return x.id === cardId; });
    if(cm){
      if(!cm.spends) cm.spends = [];
      cm.spends.push({ id: uid(), amount: amt, date: date, note: desc + (carId ? ' · Car' : ''), carId: carId || null });
      saveCustomMaintCards(cmCards);
      renderCustomMaintCards();
    }
  } else if(cardType === 'maint'){
    // Log as a negative entry in the original maint data
    var mdata = getMaintData();
    mdata.push({ id: uid(), amount: -amt, date: date, note: '💸 ' + desc + (carId ? ' · Car' : ''), isSpend: true });
    saveMaintData(mdata);
    renderMaintCard();
  }

  // ── 2. Link to car — log as a car expense ──
  if(carId){
    var carsData = loadCarsData();
    var car = carsData.find(function(c){ return c.id === carId; });
    if(car){
      if(!car.expenses) car.expenses = [];
      car.expenses.push({
        id: uid(),
        date: date,
        desc: desc,
        amount: amt,
        category: 'Maintenance',
        note: 'From ' + (cardType === 'savings' ? 'Savings' : 'Maintenance') + ' card'
      });
      saveCarsData(carsData);
    }
  }

  // ── 3. Add to Cash Flow as expense ──
  if(_useFundsCFEnabled){
    var cfData = loadCFData();
    if(!cfData[mk]) cfData[mk] = { income: [], expenses: [] };
    var icon = cardType === 'savings' ? '💰' : '🔧';
    var cardLabel = '';
    if(cardType === 'savings'){
      var sf = funds.find(function(x){ return x.id === cardId; });
      cardLabel = sf ? sf.emoji + ' ' + sf.name : 'Savings';
    } else if(cardType === 'custommaint'){
      var cmc = loadCustomMaintCards().find(function(x){ return x.id === cardId; });
      cardLabel = cmc ? cmc.emoji + ' ' + cmc.name : 'Maintenance';
    } else {
      cardLabel = '🔧 Maintenance';
    }
    cfData[mk].expenses.push({
      id: uid(),
      label: desc,
      amount: amt,
      date: date,
      icon: icon,
      account: cardLabel,
      category: 'Card Spend',
      note: 'Spent from ' + cardLabel
    });
    saveCFData(cfData);
  }

  closeModal('useFundsModal');
  showBackupReminder('Spend logged — backup recommended');
}

// ══ CARPOOL ══

// ══ PASSENGER SYSTEM ══
const PASSENGER_COLORS = ['#c8f230','#7090f0','#f2a830','#f23060','#a78bfa','#30c8f2','#f230c8','#30f2a8'];

const PASSENGER_DEFAULTS = [
  { id: 'p_david',   name: 'David',   defaultAmt: 44, color: '#c8f230' },
  { id: 'p_lezaun',  name: 'Lezaun',  defaultAmt: 44, color: '#7090f0' },
  { id: 'p_shireen', name: 'Shireen', defaultAmt: 44, color: '#f2a830' }
];

function loadPassengers(){
  try {
    const saved = JSON.parse(lsGet(PASSENGERS_KEY));
    if(saved && saved.length) return saved;
  } catch(e){}
  return PASSENGER_DEFAULTS;
}
function savePassengers(list){ lsSet(PASSENGERS_KEY, JSON.stringify(list)); }

// Live passenger list — replaces hardcoded array
var PASSENGERS = loadPassengers().map(function(p){ return p.name; });
var PASSENGER_DATA = loadPassengers();

function refreshPassengerGlobals(){
  PASSENGER_DATA = loadPassengers();
  PASSENGERS = PASSENGER_DATA.map(function(p){ return p.name; });
}

const DEFAULT_AMOUNTS_OBJ = {};
PASSENGER_DATA.forEach(function(p){ DEFAULT_AMOUNTS_OBJ[p.name] = p.defaultAmt || 44; });



let cpData={},cpYear=new Date().getFullYear(),cpMonth=new Date().getMonth();

const PRELOAD_CP={};
function loadCP(){
  try{cpData=JSON.parse(lsGet(CPK)||'{}');}catch(e){cpData={};}
  // Merge preload into cpData — live data takes priority, preload fills gaps
  Object.keys(PRELOAD_CP).forEach(function(mk){
    if(!cpData[mk]) cpData[mk]={};
    Object.keys(PRELOAD_CP[mk]).forEach(function(ds){
      if(!cpData[mk][ds]) cpData[mk][ds]=PRELOAD_CP[mk][ds];
    });
  });
  saveCP();
}
function saveCP(){lsSet(CPK,JSON.stringify(cpData)); odinRefreshIfOpen();}
function cpKey(){return cpYear+'-'+String(cpMonth+1).padStart(2,'0');}
function getDay(ds){
  const mk=cpKey();
  if(!cpData[mk])cpData[mk]={};
  if(!cpData[mk][ds]){
    const dayObj={notes:''};
    PASSENGER_DATA.forEach(function(p){ dayObj[p.name]={amt:p.defaultAmt||44,paid:false}; });
    cpData[mk][ds]=dayObj;
  }
  // Ensure any new passengers added later get initialised on existing days
  PASSENGER_DATA.forEach(function(p){
    if(!cpData[mk][ds][p.name]) cpData[mk][ds][p.name]={amt:p.defaultAmt||44,paid:false};
  });
  return cpData[mk][ds];
}
function passengerAmt(dd,p){const v=dd[p];if(!v||typeof v==='string')return 0;return v.amt||0;}
function passengerPaid(dd,p){const v=dd[p];if(!v||typeof v==='string')return false;return v.paid||false;}
function dayTotal(dd){return PASSENGERS.reduce((s,p)=>s+passengerAmt(dd,p),0);}
function cpChangeMonth(dir){
  cpMonth+=dir;
  if(cpMonth>11){cpMonth=0;cpYear++;}
  if(cpMonth<0){cpMonth=11;cpYear--;}
  const now=new Date();
  if(cpYear>now.getFullYear()||(cpYear===now.getFullYear()&&cpMonth>now.getMonth())){
    cpMonth-=dir;
    if(cpMonth>11){cpMonth=0;cpYear++;}
    if(cpMonth<0){cpMonth=11;cpYear--;}
    return;
  }
  renderCarpool();
}

// SMART AUTO-FILL
// DEFAULT_AMOUNTS — built dynamically from passenger data
var DEFAULT_AMOUNTS = {};
PASSENGER_DATA.forEach(function(p){ DEFAULT_AMOUNTS[p.name] = p.defaultAmt || 44; });

// ── South African Public Holidays ──
const SA_HOLIDAYS = {
  // 2025
  '2025-01-01':'New Year\'s Day',
  '2025-03-21':'Human Rights Day',
  '2025-04-18':'Good Friday',
  '2025-04-21':'Family Day',
  '2025-04-27':'Freedom Day',
  '2025-04-28':'Freedom Day (observed)',
  '2025-05-01':'Workers\' Day',
  '2025-06-16':'Youth Day',
  '2025-08-09':'National Women\'s Day',
  '2025-09-24':'Heritage Day',
  '2025-12-16':'Day of Reconciliation',
  '2025-12-25':'Christmas Day',
  '2025-12-26':'Day of Goodwill',
  // 2026
  '2026-01-01':'New Year\'s Day',
  '2026-03-21':'Human Rights Day',
  '2026-04-03':'Good Friday',
  '2026-04-06':'Family Day',
  '2026-04-27':'Freedom Day',
  '2026-05-01':'Workers\' Day',
  '2026-06-16':'Youth Day',
  '2026-08-10':'National Women\'s Day',
  '2026-09-24':'Heritage Day',
  '2026-12-16':'Day of Reconciliation',
  '2026-12-25':'Christmas Day',
  '2026-12-26':'Day of Goodwill',
  // 2027
  '2027-01-01':'New Year\'s Day',
  '2027-03-21':'Human Rights Day',
  '2027-03-26':'Good Friday',
  '2027-03-29':'Family Day',
  '2027-04-27':'Freedom Day',
  '2027-05-01':'Workers\' Day',
  '2027-06-16':'Youth Day',
  '2027-08-09':'National Women\'s Day',
  '2027-09-24':'Heritage Day',
  '2027-12-16':'Day of Reconciliation',
  '2027-12-25':'Christmas Day',
  '2027-12-26':'Day of Goodwill',
};
function isSAHoliday(ds){ return SA_HOLIDAYS.hasOwnProperty(ds); }
function getSAHolidayName(ds){ return SA_HOLIDAYS[ds]||''; }

function autoFillMonth(){
  const mk = cpYear+'-'+String(cpMonth+1).padStart(2,'0');
  if(!cpData[mk]) cpData[mk]={};
  const d = new Date(cpYear, cpMonth, 1);
  let filled = 0;
  while(d.getMonth()===cpMonth){
    const dow = d.getDay();
    if(dow>=1&&dow<=5){ // weekdays only
      const ds = localDateStr(d);
      if(!cpData[mk][ds]){
        const dayObj = { notes: '' };
        PASSENGER_DATA.forEach(function(p){ dayObj[p.name] = {amt: p.defaultAmt||44, paid:false}; });
        cpData[mk][ds] = dayObj;
        filled++;
      }
    }
    d.setDate(d.getDate()+1);
  }
  saveCP();
  renderCarpool();
  if(filled>0) alert('Auto-filled '+filled+' weekdays with R44 each. Tap ✓ to mark paid, or adjust any amounts!');
  else alert('All weekdays already have entries for this month!');
}
function isWeekday(d){const day=d.getDay();return day>=1&&day<=5;}

function getMonthWeeks(){
  const days=[];
  const d=new Date(cpYear,cpMonth,1);
  while(d.getMonth()===cpMonth){if(isWeekday(d))days.push(new Date(d));d.setDate(d.getDate()+1);}
  const weeks=[];let week=[];
  days.forEach((d,i)=>{
    week.push(d);
    const next=days[i+1];
    const last=!next;
    const newWeek=next&&(next.getDay()<=d.getDay());
    if(last||newWeek){weeks.push(week);week=[];}
  });
  return weeks;
}

function renderCarpool(){
  // Render statement pane passenger options dynamically
  const stmtPassOpts = document.getElementById('stmtPassOpts');
  if(stmtPassOpts){
    stmtPassOpts.innerHTML = PASSENGER_DATA.map(function(p){
      return '<div class="pass-opt selected" data-name="'+p.name+'" onclick="togglePassOpt(this)"><span>'+p.name+'</span><span class="chk">✓</span></div>';
    }).join('');
    // If passenger role, lock to current user only
    if(currentRole !== 'admin' && currentUser){
      stmtPassOpts.querySelectorAll('.pass-opt').forEach(function(el){
        if(el.getAttribute('data-name') !== currentUser){
          el.classList.remove('selected');
          el.style.display = 'none';
        } else {
          el.style.pointerEvents = 'none';
        }
      });
    }
  }

  const MN=['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('cpMonthLabel').textContent=MN[cpMonth]+' '+cpYear;
  const weeks=getMonthWeeks();
  const mk=cpKey();
  let monthTotal=0,unpaid=0,grand=0;

  const pillPassengers = currentRole==='admin' ? PASSENGERS : [currentUser];
  Object.values(cpData).forEach(md=>{
    Object.values(md).forEach(dd=>{
      if(typeof dd==='object'&&dd){
        pillPassengers.forEach(p=>{
          const amt=passengerAmt(dd,p);
          const paid=passengerPaid(dd,p);
          grand+=amt;
          if(!paid&&amt>0)unpaid+=amt;
        });
      }
    });
  });

  if(cpData[mk]){Object.values(cpData[mk]).forEach(dd=>{if(typeof dd==='object'&&dd){if(currentRole==='admin'){monthTotal+=dayTotal(dd);}else{monthTotal+=passengerAmt(dd,currentUser);}}});}

  document.getElementById('cpUnpaid').textContent=fmtR(unpaid);
  document.getElementById('cpMonthTotal').textContent=fmtR(monthTotal);
  document.getElementById('cpGrandTotal').textContent=fmtR(grand);
  // Grand total bar: admin sees all-time grand total; passengers see their monthly total
  if(currentRole==='admin'){
    document.getElementById('cpGrandTotalBar').textContent=fmtR(grand);
    document.getElementById('cpGrandBarLabel').textContent='Grand Total \u2014 all time';
  } else {
    const MN2=['January','February','March','April','May','June','July','August','September','October','November','December'];
    document.getElementById('cpGrandTotalBar').textContent=fmtR(monthTotal);
    document.getElementById('cpGrandBarLabel').textContent=(currentUser||'Your')+' Total \u2014 '+MN2[cpMonth];
  }

  const container=document.getElementById('cpWeeks');container.innerHTML='';

  weeks.forEach((wd,wi)=>{
    let wkTotal=0;
    if(cpData[mk])wd.forEach(d=>{const ds=localDateStr(d);if(cpData[mk][ds]){const dd=cpData[mk][ds];if(currentRole==='admin'){wkTotal+=dayTotal(dd);}else{wkTotal+=passengerAmt(dd,currentUser);}}});
    const s=wd[0].toLocaleDateString('en-ZA',{day:'2-digit',month:'short'});
    const e=wd[wd.length-1].toLocaleDateString('en-ZA',{day:'2-digit',month:'short'});
    const block=document.createElement('div');block.className='week-block';
    const visiblePassengers = currentRole==='admin' ? PASSENGERS : PASSENGERS.filter(p=>p===currentUser);
    block.innerHTML=`<div class="week-hdr"><span class="week-hdr-label">Week ${wi+1} &nbsp; ${s} – ${e}</span><span class="week-hdr-total">${fmtR(wkTotal)}</span></div><table class="cp-table"><thead><tr><th class="dc">Day</th>${visiblePassengers.map(p=>`<th>${p}</th>`).join('')}${currentRole==='admin'?'<th class="tc">Total</th>':''}<th class="nc">Notes</th></tr></thead><tbody id="wb${wi}"></tbody></table>`;
    container.appendChild(block);
    const tbody=document.getElementById('wb'+wi);
    wd.forEach(d=>{
      const ds=localDateStr(d);
      const dl=d.toLocaleDateString('en-ZA',{weekday:'short',day:'2-digit'});
      const dd=getDay(ds);
      const tot=dayTotal(dd);
      const tr=document.createElement('tr');
      const holiday=isSAHoliday(ds);
      const holidayName=holiday?getSAHolidayName(ds):'';
      if(holiday) tr.style.cssText='background:#0d1a00;opacity:0.85;';
      const dayCell=holiday
        ?`<td class="dc" title="${holidayName}"><span style="color:#c8f230;font-weight:700;">${dl}</span><br><span style="font-size:9px;color:#8ab820;letter-spacing:0.5px;">🇿🇦 ${holidayName}</span></td>`
        :`<td class="dc">${dl}</td>`;
      tr.innerHTML=`${dayCell}${PASSENGERS.map(p=>{
        const mk2=ds.slice(0,7);
        const hasEntry=cpData[mk2]&&cpData[mk2][ds]&&typeof cpData[mk2][ds][p]==='object';
        const amt=hasEntry?passengerAmt(dd,p):null;
        const paid=hasEntry?passengerPaid(dd,p):false;
        // encode value as "amt_paid" string
        let val='absent';
        if(hasEntry){
          if(amt===44&&paid)       val='44_paid';
          else if(amt===44&&!paid) val='44_unpaid';
          else if(amt===22&&paid)  val='22_paid';
          else if(amt===22&&!paid) val='22_unpaid';
          else if(amt===0)         val='0_present';
        }
        const selStyle='background:#111;border:1px solid #333;color:#efefef;font-family:"DM Mono",monospace;font-size:11px;border-radius:4px;padding:5px 4px;width:90px;cursor:pointer;outline:none;appearance:none;-webkit-appearance:none;text-align:center;';
        // Passenger view: read-only display instead of dropdown
        if(currentRole !== 'admin' && p !== currentUser) return ''; // skip other columns
        if(currentRole !== 'admin'){
          let dispTxt='—', dispCol='#333';
          if(val==='44_paid'||val==='22_paid'){
            const a=val==='44_paid'?'R44':'R22';
            dispTxt=a+' ✓'; dispCol='#c8f230';
          } else if(val==='44_unpaid'||val==='22_unpaid'){
            const a=val==='44_unpaid'?'R44':'R22';
            dispTxt=a+' ⏳'; dispCol='#f2a830';
          } else if(val==='0_present'){dispTxt='R0';dispCol='#555';}
          return `<td style="text-align:center;font-family:'DM Mono',monospace;font-size:12px;color:${dispCol};padding:6px 4px;">${dispTxt}</td>`;
        }
        return `<td><select data-date="${ds}" data-passenger="${p}" onchange="setTripSelect(this)" style="${selStyle}">
          <option value="absent"   ${val==='absent'   ?'selected':''} style="background:#111;color:#444">— Absent</option>
          <option value="44_unpaid"${val==='44_unpaid'?'selected':''} style="background:#1e1400;color:#f2a830">R44 ⏳</option>
          <option value="44_paid"  ${val==='44_paid'  ?'selected':''} style="background:#1a2e00;color:#c8f230">R44 ✓</option>
          <option value="22_unpaid"${val==='22_unpaid'?'selected':''} style="background:#1e1400;color:#f2a830">R22 ⏳</option>
          <option value="22_paid"  ${val==='22_paid'  ?'selected':''} style="background:#1a2e00;color:#c8f230">R22 ✓</option>
          <option value="0_present"${val==='0_present'?'selected':''} style="background:#222;color:#555">R0</option>
        </select></td>`;
      }).join('')}${currentRole==='admin'?'<td class="tc">'+(tot>0?fmtR(tot):'<span style="color:var(--muted2)">—</span>')+'</td>':''}${currentRole==='admin'?'<td class="nc"><input class="notes-inp" placeholder="notes..." value="'+(dd.notes||'').replace(/"/g,'&quot;')+'" data-date="'+ds+'" onchange="setNote(this)"/></td>':'<td class="nc" style="color:var(--muted);font-size:11px;">'+(dd.notes||'')+'</td>'}`;
      tbody.appendChild(tr);
    });
  });
  // Style all selects after render
  document.querySelectorAll('.cp-table select').forEach(function(sel){
    styleSelect(sel, sel.value);
  });
}

function styleSelect(sel, val){
  if(val==='44_paid'||val==='22_paid'){
    sel.style.background='#1a2e00';sel.style.color='#c8f230';sel.style.borderColor='#5a8800';
  } else if(val==='44_unpaid'||val==='22_unpaid'){
    sel.style.background='#1e1400';sel.style.color='#f2a830';sel.style.borderColor='#4a3000';
  } else if(val==='0_present'){
    sel.style.background='#1a1a1a';sel.style.color='#555';sel.style.borderColor='#333';
  } else {
    sel.style.background='#111';sel.style.color='#333';sel.style.borderColor='#222';
  }
}

function setTripSelect(sel){
  const ds=sel.getAttribute('data-date');
  const p=sel.getAttribute('data-passenger');
  const val=sel.value;
  const mk=ds.slice(0,7);
  if(!cpData[mk]) cpData[mk]={};
  if(!cpData[mk][ds]){ const d2={notes:''}; PASSENGER_DATA.forEach(function(p){ d2[p.name]={amt:0,paid:false}; }); cpData[mk][ds]=d2; }
  if(!cpData[mk][ds][p]||typeof cpData[mk][ds][p]!=='object') cpData[mk][ds][p]={amt:0,paid:false};
  if(val==='absent'){
    cpData[mk][ds][p]={amt:0,paid:false};
  } else {
    const parts=val.split('_');
    cpData[mk][ds][p]={amt:parseInt(parts[0]),paid:parts[1]==='paid'};
  }
  styleSelect(sel, val);
  saveCP();
  renderCarpool();
}



function setNote(inp){
  const ds=inp.getAttribute('data-date');
  getDay(ds).notes=inp.value;
  saveCP();
}

// CAR FUND TRANSACTIONS
let carTxnFundId = null, carTxnType = 'in';
function openCarTxn(fundId, type) {
  carTxnFundId = fundId; carTxnType = type;
  document.getElementById('carTxnTitle').textContent = type==='in' ? 'Add Funds' : 'Log Spend';
  document.getElementById('carTxnSubtitle').textContent = type==='in' ? '🚗 Adding to Car Fund' : '🚗 Car Fund (EE90)';
  document.getElementById('carTxnConfirm').textContent = type==='in' ? 'Add' : 'Log';
  document.getElementById('carTxnConfirm').style.background = type==='in' ? '#c8f230' : '#f23060';
  document.getElementById('carTxnConfirm').style.color = type==='in' ? '#000' : '#fff';
  document.getElementById('carTxnAmt').value = '';
  document.getElementById('carTxnDate').value = localDateStr(new Date());
  document.getElementById('carTxnNote').value = '';
  document.getElementById('carTxnModal').classList.add('active');
}
function confirmCarTxn() {
  const amount = parseFloat(document.getElementById('carTxnAmt').value);
  const date = document.getElementById('carTxnDate').value || localDateStr(new Date());
  const note = document.getElementById('carTxnNote').value.trim();
  if (!amount || amount <= 0) return;
  const f = funds.find(x => x.id === carTxnFundId);
  var isOut_car=carTxnType==='out';
  var cfId_car=postToCF({label:isOut_car?(note||'Car Fund Spend'):'Add to '+f.name,amount:amount,date:date,icon:'car',type:'expense',sourceType:isOut_car?'car_spend':'car_add',sourceId:carTxnFundId,sourceCardName:f.name,note:note});
  f.deposits.push({ id: uid(), txnType: carTxnType, amount, date, note, cfId:cfId_car });
  const manuals=loadManualBalances();
  if(manuals[carTxnFundId]!==undefined){delete manuals[carTxnFundId];saveManualBalances(manuals);}
  saveFunds(); closeModal('carTxnModal'); renderFunds();
}

// MINI STATEMENT
function togglePassOpt(el){el.classList.toggle('selected');}
function togglePane(){
  const pane=document.getElementById('cpLeftPane');
  const btn=document.getElementById('paneToggle');
  const reopen=document.getElementById('reopenPane');
  pane.classList.toggle('collapsed');
  const col=pane.classList.contains('collapsed');
  btn.innerHTML=col?'&#8250;':'&#8249;';
  if(reopen)reopen.style.display=col?'inline-flex':'none';
}
function generateStatements(){
  const from=document.getElementById('stmtFrom').value;
  const to=document.getElementById('stmtTo').value;
  if(!from||!to){alert('Please select a date range');return;}
  const selected=[...document.querySelectorAll('.pass-opt.selected')].map(el=>el.getAttribute('data-name'));
  if(!selected.length){alert('Please select at least one passenger');return;}
  const fromDate=new Date(from+'T00:00:00');
  const toDate=new Date(to+'T00:00:00');
  toDate.setHours(23,59,59,999); // prevent timezone cutoff missing last day
  // Build ALL weekdays in range — always include every day regardless of storage state
  const days=[];
  const d=new Date(fromDate);
  while(d<=toDate){if(d.getDay()>=1&&d.getDay()<=5)days.push(new Date(d));d.setDate(d.getDate()+1);}
  const container=document.getElementById('stmtCards');
  container.innerHTML='';
  const passengerTotals=[];let grandTotal=0;
  selected.forEach(function(passenger){
    let tripTotal=0,tripPaid=0,tripOwing=0;
    // Single loop — build UI rows AND tripData for PDF simultaneously
    const tripDataArr=[];
    const rows=days.map(function(day){
      const ds=localDateStr(day);
      const mk=ds.slice(0,7);
      const dd=(cpData[mk]&&cpData[mk][ds])?cpData[mk][ds]:null;
      const amt=(dd&&dd[passenger]&&typeof dd[passenger]==='object')?dd[passenger].amt||0:0;
      const paid=(dd&&dd[passenger]&&typeof dd[passenger]==='object')?dd[passenger].paid||false:false;
      const dl=day.toLocaleDateString('en-ZA',{weekday:'short',day:'2-digit',month:'short'});
      const dlLong=day.toLocaleDateString('en-ZA',{weekday:'long',day:'2-digit',month:'short'});
      tripTotal+=amt;
      if(paid)tripPaid+=amt; else if(amt>0)tripOwing+=amt;
      tripDataArr.push({day:dlLong,amt:amt,paid:paid});
      // Always render a row — absent shows as —
      if(amt===0)return '<div class="stmt-row"><span class="stmt-day">'+dl+'</span><span class="stmt-absent">—</span></div>';
      if(paid)return '<div class="stmt-row"><span class="stmt-day">'+dl+'</span><span class="stmt-paid">'+fmtR(amt)+' ✓</span></div>';
      return '<div class="stmt-row"><span class="stmt-day">'+dl+'</span><span class="stmt-unpaid">'+fmtR(amt)+' ⏳</span></div>';
    }).join('');

    // Borrow entries within date range — sorted by date ascending
    const borrows=(borrowData[passenger]||[])
      .filter(function(b){return b.date>=from&&b.date<=to;})
      .sort(function(a,b){return a.date<b.date?-1:a.date>b.date?1:0;});
    let borrowTotal=0,borrowPaid=0;
    borrows.forEach(function(b){
      if(b.type==='repay'){
        borrowPaid += Number(b.amount||0);
      } else {
        borrowTotal += Number(b.amount||0);
        if(b.paid) borrowPaid += Number(b.amount||0);
      }
    });
    const borrowOwing=borrowTotal-borrowPaid;
    const borrowRows=borrows.map(function(b){
      if(b.type==='repay'){
        return '<div class="stmt-row" style="background:#0a0e18;">'
          +'<span class="stmt-day">'+b.date+(b.note?' · '+b.note:'')+'</span>'
          +'<span style="display:flex;align-items:center;gap:6px;">'
          +'<span style="color:#7090f0;font-weight:500;">↩ -'+fmtR(b.amount)+' paid</span>'
          +'<span onclick="openEditBorrowModal(\''+passenger+'\',\''+b.id+'\')" style="cursor:pointer;color:#444;font-size:14px;" title="Edit">✏️</span>'
          +'<span onclick="deleteBorrowEntry(\''+passenger+'\',\''+b.id+'\')" style="cursor:pointer;color:#444;font-size:14px;" title="Delete">🗑</span>'
          +'</span>'
          +'</div>';
      }
      return '<div class="stmt-row borrow-row">'
        +'<span class="stmt-day">'+b.date+(b.note?' · '+b.note:'')+'</span>'
        +'<span style="display:flex;align-items:center;gap:6px;">'
        +'<span class="stmt-borrow">💸 '+fmtR(b.amount)+(b.paid?' ✓':' ⏳')+'</span>'
        +'<span onclick="openEditBorrowModal(\''+passenger+'\',\''+b.id+'\')" style="cursor:pointer;color:#444;font-size:14px;" title="Edit">✏️</span>'
        +'<span onclick="deleteBorrowEntry(\''+passenger+'\',\''+b.id+'\')" style="cursor:pointer;color:#444;font-size:14px;" title="Delete">🗑</span>'
        +'</span>'
        +'</div>';
    }).join('');

    const totalOwed=tripTotal+borrowTotal;
    const totalPaid=tripPaid+borrowPaid;
    const totalOwing=tripOwing+borrowOwing;

    // Status badge top-right
    const statusHtml = '';

    // Breakdown footer — always shows trips section; borrow section only if borrows exist
    const breakdownHtml='<div style="padding:8px 12px;border-top:1px solid #1e3a00;background:#0a1500;font-size:10px;display:flex;flex-direction:column;gap:3px;">'
      +'<div style="display:flex;justify-content:space-between;"><span style="color:#5a8800;">Trips</span><span style="color:#c8f230;">'+fmtR(tripTotal)+'</span></div>'
      +'<div style="display:flex;justify-content:space-between;"><span style="color:#5a8800;">Trips Paid</span><span style="color:#efefef;">'+fmtR(tripPaid)+'</span></div>'
      +(tripOwing>0
        ?'<div style="display:flex;justify-content:space-between;border-top:1px solid #1e3a00;padding-top:4px;margin-top:2px;"><span style="color:#f2a830;letter-spacing:1px;text-transform:uppercase;">Trips Outstanding</span><span style="color:#f2a830;font-weight:700;">'+fmtR(tripOwing)+'</span></div>'
        :'<div style="display:flex;justify-content:space-between;border-top:1px solid #1e3a00;padding-top:4px;margin-top:2px;"><span style="color:#c8f230;letter-spacing:1px;text-transform:uppercase;">Trips</span><span style="color:#c8f230;font-weight:700;">All settled ✓</span></div>'
      )
      +(borrowTotal>0
        ?'<div style="display:flex;justify-content:space-between;border-top:1px solid #1e3a00;padding-top:4px;margin-top:4px;"><span style="color:#6b4fa8;">Borrowed</span><span style="color:#a78bfa;">'+fmtR(borrowTotal)+'</span></div>'
         +(borrowPaid>0?'<div style="display:flex;justify-content:space-between;"><span style="color:#6b4fa8;">Borrow Paid</span><span style="color:#efefef;">'+fmtR(borrowPaid)+'</span></div>':'')
         +(borrowOwing>0?'<div style="display:flex;justify-content:space-between;"><span style="color:#a78bfa;letter-spacing:1px;text-transform:uppercase;">Borrow Outstanding</span><span style="color:#a78bfa;font-weight:700;">'+fmtR(borrowOwing)+'</span></div>':'')
        :''
      )
      +'</div>';

    // WA text — one line per day with proper newlines, borrow section appended
    const waLines=days.map(function(day){
      const ds=localDateStr(day);const mk=ds.slice(0,7);
      const dd=(cpData[mk]&&cpData[mk][ds])?cpData[mk][ds]:null;
      const amt=(dd&&dd[passenger]&&typeof dd[passenger]==='object')?dd[passenger].amt||0:0;
      const paid=(dd&&dd[passenger]&&typeof dd[passenger]==='object')?dd[passenger].paid||false:false;
      const dl=day.toLocaleDateString('en-ZA',{weekday:'short',day:'2-digit',month:'short'});
      if(amt===0)return dl+' — absent';
      return dl+' — '+fmtR(amt)+(paid?' ✓':' ⏳');
    });
    const waBorrowSection=borrows.length
      ?'\n\n💸 *Borrowed:*\n'+borrows.map(function(b){return b.date+(b.note?' ('+b.note+')':'')+' — '+fmtR(b.amount)+(b.paid?' ✓':' ⏳');}).join('\n')
      :'';
    const waSummary='\n\n*Trips: '+fmtR(tripTotal)+'*'
      +(borrowTotal>0?'\n*Borrowed: '+fmtR(borrowTotal)+'*':'')
      +'\n*Total Owed: '+fmtR(totalOwed)+'*'
      +'\n*Paid: '+fmtR(totalPaid)+'*\n'
      +(totalOwing>0?'*Outstanding: '+fmtR(totalOwing)+'*\n\nPlease settle when convenient 🙏':'*All settled! 🎉*');
    const waText='*Carpool Statement — '+from+' to '+to+'*\nHi '+passenger+' 👋\n\n'
      +waLines.join('\n')+waBorrowSection+waSummary;

    const card=document.createElement('div');
    card.className='stmt-card';
    const cardId='stmt_'+Math.random().toString(36).slice(2,7);
    card.innerHTML='<div class="stmt-card-top"><span class="stmt-name">'+passenger+'</span>'+statusHtml+'</div>'
      +'<div class="stmt-rows">'+rows
      +(borrows.length?'<div style="padding:5px 12px;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#6b4fa8;background:#0d0a1a;">💸 Borrowed</div>'+borrowRows:'')
      +'</div>'+breakdownHtml
      // Unified outstanding total + pay button
      +(totalOwing>0
        ?'<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#0d1a00;border-top:1px solid #2a4a00;">'
          +'<div><div style="font-size:9px;color:#5a8800;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px;">Total Outstanding</div>'
          +'<div style="font-family:\'Syne\',sans-serif;font-weight:800;font-size:20px;color:#f2a830;">'+fmtR(totalOwing)+'</div></div>'
          +'<button onclick="openPayDestModal(this)" style="padding:10px 16px;background:#c8f230;border:none;border-radius:8px;color:#000;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;font-weight:700;">💳 Mark Paid →</button>'
        +'</div>'
        :'<div style="padding:10px 12px;background:#0a1500;border-top:1px solid #1e3a00;font-size:11px;color:#c8f230;text-align:center;">✅ All settled</div>'
      )
      +'<div class="stmt-btns">'
      +'<button class="stmt-btn btn-copy" id="pdf_'+cardId+'" onclick="genPDF(this)">📄 Export</button>'
      +'<button class="stmt-btn btn-save" id="wa_'+cardId+'" onclick="openWA(this)">💬 Save</button>'
      +'</div>';
    card._pdfData={passenger:passenger,from:from,to:to,totalAmt:totalOwed,tripData:tripDataArr,borrowData:borrows,tripTotal:tripTotal,borrowTotal:borrowTotal,tripPaid:tripPaid,borrowPaid:borrowPaid,tripOwing:tripOwing,borrowOwing:borrowOwing};
    card._waData=waText;
    card._stmtMeta={passenger,tripOwing,borrowOwing,totalOwing,from,to};
    container.appendChild(card);
    passengerTotals.push({name:passenger,total:totalOwed,owing:totalOwing});
    grandTotal+=totalOwed;
  });

  // Grand total card
  const gtCard=document.createElement('div');
  gtCard.style.cssText='background:#111;border:1px solid #2a4a00;border-radius:6px;padding:14px 16px;margin-top:4px;';
  const gtRows=passengerTotals.map(function(p){return '<div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:12px"><span style="color:#555">'+p.name+'</span><span style="color:#efefef">'+fmtR(p.total)+'</span></div>';}).join('');
  gtCard.innerHTML='<div style="font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#444;margin-bottom:10px">Total — '+from+' to '+to+'</div>'+gtRows+'<div style="border-top:1px solid #2a2a2a;padding-top:8px;margin-top:4px;display:flex;justify-content:space-between;"><span style="color:#efefef;font-size:12px;font-weight:500">Grand Total</span><span style="font-family:Syne,sans-serif;font-size:20px;font-weight:700;color:#c8f230">'+fmtR(grandTotal)+'</span></div>';
  container.appendChild(gtCard);

  document.getElementById('stmtArea').style.display='block';
}
function copyStmt(btn, text, passenger, from, to, rows, totalAmt){
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Carpool Statement - ${passenger}</title>
<style>
  body{background:#0a0a0a;color:#efefef;font-family:'Courier New',monospace;padding:32px 24px;max-width:400px;margin:0 auto;}
  .header{text-align:center;border-bottom:2px solid #c8f230;padding-bottom:16px;margin-bottom:20px;}
  .co{font-size:11px;color:#5a8800;letter-spacing:3px;text-transform:uppercase;margin-bottom:6px;}
  .name{font-size:32px;font-weight:700;color:#c8f230;letter-spacing:-1px;}
  .period{font-size:12px;color:#555;margin-top:4px;}
  .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #1a1a1a;font-size:13px;}
  .row .day{color:#555;}
  .row .amt-paid{color:#c8f230;font-weight:700;}
  .row .amt-owing{color:#f2a830;font-weight:700;}
  .row .amt-absent{color:#333;}
  .total-bar{display:flex;justify-content:space-between;align-items:center;margin-top:20px;padding-top:16px;border-top:2px solid #c8f230;}
  .total-label{font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#5a8800;}
  .total-amt{font-size:28px;font-weight:700;color:#c8f230;}
  .footer{text-align:center;margin-top:24px;font-size:10px;color:#333;letter-spacing:2px;}
</style></head>
<body>
<div class="header">
  <div class="co">Usabco Carpool</div>
  <div class="name">${passenger}</div>
  <div class="period">${from} — ${to}</div>
</div>
${rows}
<div class="total-bar">
  <span class="total-label">Total</span>
  <span class="total-amt">R${totalAmt.toLocaleString('en-ZA')}</span>
</div>
<div class="footer">Generated by My Dashboard · ${new Date().toLocaleDateString('en-ZA')}</div>
</body></html>`;
  const blob = new Blob([html], {type:'text/html'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'Statement_'+passenger+'_'+from+'_to_'+to+'.html';
  a.click();
}
function genPDF(btn){
  const card=btn.closest('.stmt-card');
  const d=card._pdfData;
  const passenger=d.passenger,from=d.from,to=d.to,totalAmt=d.totalAmt;
  const days=d.days||[];
  if(typeof window.jspdf==='undefined'){
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload=function(){buildPDF(passenger,from,to,totalAmt,d.tripData,d.borrowData||[],d.tripTotal||0,d.borrowTotal||0,d.tripPaid||0,d.borrowPaid||0,d.tripOwing||0,d.borrowOwing||0);};
    document.head.appendChild(s);
  } else {
    buildPDF(passenger,from,to,totalAmt,d.tripData,d.borrowData||[],d.tripTotal||0,d.borrowTotal||0,d.tripPaid||0,d.borrowPaid||0,d.tripOwing||0,d.borrowOwing||0);
  }
}
function buildPDF(passenger,from,to,totalAmt,tripData,borrowData,tripTotal,borrowTotal,tripPaid,borrowPaid,tripOwing,borrowOwing){
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:'mm',format:'a4'});
  // Helper: add new page with header continuation
  function newPage(){
    doc.addPage();
    doc.setFillColor(10,10,10);doc.rect(0,0,210,297,'F');
    doc.setFillColor(200,242,48);doc.rect(0,0,210,2,'F');
    doc.setTextColor(50,50,50);doc.setFontSize(8);doc.setFont('helvetica','normal');
    doc.text(passenger+' (cont.) — '+from+' to '+to,105,12,{align:'center'});
    return 22; // y start for content on new page
  }
  // Page 1 header
  doc.setFillColor(10,10,10);doc.rect(0,0,210,297,'F');
  doc.setFillColor(200,242,48);doc.rect(0,0,210,2,'F');
  doc.setTextColor(90,136,0);doc.setFontSize(9);doc.setFont('helvetica','normal');
  doc.text('USABCO CARPOOL',105,18,{align:'center'});
  doc.setTextColor(200,242,48);doc.setFontSize(28);doc.setFont('helvetica','bold');
  doc.text(passenger,105,32,{align:'center'});
  doc.setTextColor(85,85,85);doc.setFontSize(10);doc.setFont('helvetica','normal');
  doc.text(from+' to '+to,105,40,{align:'center'});
  doc.setDrawColor(200,242,48);doc.setLineWidth(0.5);doc.line(20,45,190,45);
  let y=55;
  const bottomMargin=270; // leave room for footer at 285

  // Trip rows — every weekday, absent or not
  tripData.forEach(function(t){
    if(y>bottomMargin){y=newPage();}
    doc.setTextColor(85,85,85);doc.setFontSize(11);doc.setFont('helvetica','normal');doc.text(t.day,20,y);
    if(t.amt===0){doc.setTextColor(50,50,50);doc.text('—',190,y,{align:'right'});}
    else if(t.paid){doc.setTextColor(200,242,48);doc.text('R'+t.amt+' \u2713',190,y,{align:'right'});}
    else{doc.setTextColor(242,168,48);doc.text('R'+t.amt+' \u23f3',190,y,{align:'right'});}
    doc.setDrawColor(30,30,30);doc.setLineWidth(0.2);doc.line(20,y+4,190,y+4);
    y+=13;
  });

  // Borrow section — only if there are borrows
  if(borrowData&&borrowData.length>0){
    if(y>bottomMargin){y=newPage();}
    y+=4;
    doc.setFillColor(15,10,26);doc.rect(20,y-5,170,9,'F');
    doc.setTextColor(107,79,168);doc.setFontSize(8);doc.setFont('helvetica','normal');
    doc.text('\u{1F4B8} BORROWED',20,y);
    y+=10;
    borrowData.forEach(function(b){
      if(y>bottomMargin){y=newPage();}
      const label=b.date+(b.note?' \u00B7 '+b.note:'');
      doc.setTextColor(85,85,85);doc.setFontSize(11);doc.setFont('helvetica','normal');doc.text(label,20,y);
      doc.setTextColor(167,139,250);
      doc.text('R'+b.amount+(b.paid?' \u2713':' \u23f3'),190,y,{align:'right'});
      doc.setDrawColor(30,30,30);doc.setLineWidth(0.2);doc.line(20,y+4,190,y+4);
      y+=13;
    });
  }

  // Breakdown + totals — need space; add page if tight
  const breakdownHeight=14+(borrowTotal>0?(borrowPaid>0?28:21):0)+(tripOwing>0||borrowOwing>0?7:0)+16;
  if(y+breakdownHeight>bottomMargin){y=newPage();}
  y+=4;
  doc.setDrawColor(200,242,48);doc.setLineWidth(0.5);doc.line(20,y,190,y);y+=8;
  // Trip breakdown
  doc.setFont('helvetica','normal');
  doc.setTextColor(90,136,0);doc.setFontSize(9);doc.text('Trips',20,y);
  doc.setTextColor(200,242,48);doc.text('R'+Number(tripTotal).toLocaleString('en-ZA'),190,y,{align:'right'});y+=7;
  doc.setTextColor(90,136,0);doc.text('Trips Paid',20,y);
  doc.setTextColor(239,239,239);doc.text('R'+Number(tripPaid).toLocaleString('en-ZA'),190,y,{align:'right'});y+=7;
  if(tripOwing>0){
    doc.setTextColor(242,168,48);doc.text('TRIPS OUTSTANDING',20,y);
    doc.setTextColor(242,168,48);doc.setFont('helvetica','bold');doc.text('R'+Number(tripOwing).toLocaleString('en-ZA'),190,y,{align:'right'});doc.setFont('helvetica','normal');y+=7;
  }
  // Borrow breakdown — only if borrows exist
  if(borrowTotal>0){
    doc.setDrawColor(50,50,50);doc.setLineWidth(0.2);doc.line(20,y,190,y);y+=5;
    doc.setTextColor(107,79,168);doc.setFontSize(9);doc.text('Borrowed',20,y);
    doc.setTextColor(167,139,250);doc.text('R'+Number(borrowTotal).toLocaleString('en-ZA'),190,y,{align:'right'});y+=7;
    if(borrowPaid>0){
      doc.setTextColor(107,79,168);doc.text('Borrow Paid',20,y);
      doc.setTextColor(239,239,239);doc.text('R'+Number(borrowPaid).toLocaleString('en-ZA'),190,y,{align:'right'});y+=7;
    }
    if(borrowOwing>0){
      doc.setTextColor(167,139,250);doc.setFont('helvetica','bold');doc.text('BORROW OUTSTANDING',20,y);
      doc.text('R'+Number(borrowOwing).toLocaleString('en-ZA'),190,y,{align:'right'});doc.setFont('helvetica','normal');y+=7;
    }
  }
  // Grand total
  doc.setDrawColor(200,242,48);doc.setLineWidth(0.5);doc.line(20,y,190,y);y+=8;
  doc.setTextColor(90,136,0);doc.setFontSize(9);doc.setFont('helvetica','normal');doc.text('TOTAL',20,y);
  doc.setTextColor(200,242,48);doc.setFontSize(20);doc.setFont('helvetica','bold');
  doc.text('R'+Number(totalAmt).toLocaleString('en-ZA'),190,y+2,{align:'right'});
  // Footer on last page
  doc.setTextColor(50,50,50);doc.setFontSize(8);doc.setFont('helvetica','normal');
  doc.text('Generated by My Dashboard \u00B7 '+new Date().toLocaleDateString('en-ZA'),105,285,{align:'center'});
  doc.save('Statement_'+passenger+'_'+from+'_to_'+to+'.pdf');
}
// ══ PAY DESTINATION SYSTEM ══
function openPayDestModal(btn){
  const card = btn.closest('.stmt-card');
  if(!card || !card._stmtMeta) return;
  const meta = card._stmtMeta;
  const passenger = meta.passenger;
  const tripOwing = meta.tripOwing || 0;
  const borrowOwing = meta.borrowOwing || 0;
  const totalOwing = meta.totalOwing || (tripOwing + borrowOwing);

  document.getElementById('payDestPassenger').value = passenger;
  document.getElementById('payDestTripOwing').value = tripOwing;
  document.getElementById('payDestBorrowOwing').value = borrowOwing;
  document.getElementById('payDestTotal').value = totalOwing;
  document.getElementById('payDestChoice').value = '';

  // Summary
  const summaryEl = document.getElementById('payDestSummary');
  summaryEl.innerHTML =
    '<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:16px;color:#efefef;margin-bottom:6px;">'+passenger+' paying '+fmtR(totalOwing)+'</div>'
    +(tripOwing>0?'<div>🚗 Carpool outstanding: <strong style="color:#f2a830;">'+fmtR(tripOwing)+'</strong></div>':'')
    +(borrowOwing>0?'<div>💸 Borrow outstanding: <strong style="color:#a78bfa;">'+fmtR(borrowOwing)+'</strong></div>':'');

  // Build destination options
  const optionsEl = document.getElementById('payDestOptions');
  optionsEl.innerHTML = '';

  // Savings funds
  funds.filter(function(f){ return !f.isExpense; }).forEach(function(f){
    const saved = fundTotal(f);
    const pct = f.goal > 0 ? Math.min(100, Math.round(saved/f.goal*100)) : 0;
    optionsEl.appendChild(buildDestOption('fund:'+f.id, f.emoji+' '+f.name, fmtR(saved)+' saved · '+pct+'% of goal', '#c8f230'));
  });

  // Maintenance Fund (original)
  const maintMonth = getMaintData().filter(function(e){
    const now = new Date();
    return e.date && e.date.startsWith(now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0'));
  }).reduce(function(s,e){ return s+e.amount; },0);
  optionsEl.appendChild(buildDestOption('maint:original', '🔧 Maintenance Fund', fmtR(maintMonth)+' this month · target '+fmtR(MAINT_TARGET), '#f2a830'));

  // Custom maintenance cards
  loadCustomMaintCards().forEach(function(card){
    const cardMonth = (card.entries||[]).filter(function(e){
      const now = new Date();
      return e.date && e.date.startsWith(now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0'));
    }).reduce(function(s,e){ return s+e.amount; },0);
    optionsEl.appendChild(buildDestOption('maint:'+card.id, card.emoji+' '+card.name, fmtR(cardMonth)+' this month · target '+fmtR(card.target), '#f2a830'));
  });

  // Cash Flow only (just record as income, no deposit)
  optionsEl.appendChild(buildDestOption('cashflow', '💵 Cash Flow Only', 'Record as income — no fund deposit', '#7090f0'));

  // Split option
  optionsEl.appendChild(buildDestOption('split', '✂️ Split Between Funds', 'Divide the amount across multiple destinations', '#888'));

  document.getElementById('payDestModal').classList.add('active');
}

function buildDestOption(value, label, sub, color){
  const div = document.createElement('div');
  div.dataset.value = value;
  div.onclick = function(){ selectDestOption(div); };
  div.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--border);border-radius:8px;cursor:pointer;transition:all .15s;';
  div.innerHTML =
    '<div style="width:14px;height:14px;border-radius:50%;border:2px solid '+color+';flex-shrink:0;" class="dest-radio"></div>'
    +'<div style="flex:1;">'
      +'<div style="font-size:12px;color:#efefef;">'+label+'</div>'
      +'<div style="font-size:10px;color:#555;letter-spacing:0.5px;margin-top:2px;">'+sub+'</div>'
    +'</div>';
  return div;
}

function selectDestOption(el){
  document.querySelectorAll('#payDestOptions > div').forEach(function(d){
    d.style.borderColor = 'var(--border)';
    d.style.background = 'none';
    d.querySelector('.dest-radio').style.background = 'none';
  });
  el.style.borderColor = '#c8f230';
  el.style.background = '#0d1a00';
  el.querySelector('.dest-radio').style.background = '#c8f230';
  document.getElementById('payDestChoice').value = el.dataset.value;
}

function confirmPayDest(){
  const passenger = document.getElementById('payDestPassenger').value;
  const tripOwing = parseFloat(document.getElementById('payDestTripOwing').value) || 0;
  const borrowOwing = parseFloat(document.getElementById('payDestBorrowOwing').value) || 0;
  const totalOwing = parseFloat(document.getElementById('payDestTotal').value) || 0;
  const choice = document.getElementById('payDestChoice').value;
  const bank = document.getElementById('payDestBank') ? document.getElementById('payDestBank').value : 'Tymebank';

  if(!choice){ alert('Please choose where to put the money.'); return; }

  const today = localDateStr(new Date());

  // Build enriched label parts
  var payParts = [];
  if(tripOwing > 0) payParts.push('Carpool ' + fmtR(tripOwing));
  if(borrowOwing > 0) payParts.push('Borrow ' + fmtR(borrowOwing));
  var payBreakdown = payParts.length ? ' (' + payParts.join(' + ') + ')' : '';

  // 1. Mark carpool trips as paid in the current statement range
  if(tripOwing > 0){
    const from = document.querySelector('#stmtFrom') ? document.querySelector('#stmtFrom').value : null;
    const to   = document.querySelector('#stmtTo')   ? document.querySelector('#stmtTo').value   : null;
    if(from && to){
      Object.keys(cpData).forEach(function(mk){
        Object.keys(cpData[mk]).forEach(function(ds){
          if(ds < from || ds > to) return;
          const dd = cpData[mk][ds];
          if(dd && dd[passenger] && typeof dd[passenger]==='object' && !dd[passenger].paid && dd[passenger].amt > 0){
            dd[passenger].paid = true;
          }
        });
      });
      saveCP();
    }
  }

  // 2. Mark borrows as repaid
  if(borrowOwing > 0 && borrowData[passenger]){
    borrowData[passenger].forEach(function(b){
      if(b.type !== 'repay' && !b.paid) b.paid = true;
    });
    saveBorrows();
  }

  // 3. Route money to destination
  if(choice === 'cashflow'){
    // Add to cash flow as income entry for this month
    const data = loadCFData ? loadCFData() : {};
    const mk = today.slice(0,7);
    if(!data[mk]) data[mk] = { income:[], expenses:[] };
    data[mk].income = data[mk].income || [];
    const cfLabel_cf = passenger + ' → Cash Flow' + payBreakdown + ' via ' + bank;
    const cfNote_cf = passenger + ' paid' + payBreakdown + ' into ' + bank + ' · Logged to Cash Flow';
    data[mk].income.push({ id: uid(), label: cfLabel_cf, amount: totalOwing, icon:'💳', auto:false, sourceType:'carpool_payment', sourceId:passenger, sourceCardName:bank, note:cfNote_cf });
    if(saveCFData) saveCFData(data);

  } else if(choice.startsWith('fund:')){
    const fundId = choice.replace('fund:','');
    const f = funds.find(function(x){ return x.id === fundId; });
    if(f){
      if(!f.deposits) f.deposits = [];
      const fundNote = passenger + ' paid' + payBreakdown + ' into ' + bank + ' → ' + f.name;
      f.deposits.push({ id:uid(), amount:totalOwing, date:today, note:fundNote, txnType:'in' });
      saveFunds();
      renderFunds();
      // Also add to cash flow as income
      const data = loadCFData ? loadCFData() : {};
      const mk = today.slice(0,7);
      if(!data[mk]) data[mk] = { income:[], expenses:[] };
      data[mk].income = data[mk].income || [];
      const cfLabel_fund = passenger + ' → ' + f.name + payBreakdown + ' via ' + bank;
      data[mk].income.push({ id:uid(), label:cfLabel_fund, amount:totalOwing, icon:f.emoji||'💰', auto:false, sourceType:'carpool_payment', sourceId:passenger, sourceCardName:bank, note:fundNote });
      if(saveCFData) saveCFData(data);
    }

  } else if(choice.startsWith('maint:')){
    const cardId = choice.replace('maint:','');
    const maintNote = passenger + ' paid' + payBreakdown + ' into ' + bank;
    if(cardId === 'original'){
      const data = getMaintData();
      data.push({ id:uid(), person:passenger, amount:totalOwing, date:today, note:maintNote });
      saveMaintData(data);
      renderMaintCard();
    } else {
      const cards = loadCustomMaintCards();
      const card = cards.find(function(c){ return c.id === cardId; });
      if(card){
        if(!card.entries) card.entries = [];
        const contrib = (card.contributors||[]).find(function(c){ return (typeof c==='object'?c.name:c) === passenger; });
        const personId = contrib ? (typeof contrib==='object'?contrib.id:contrib) : passenger;
        const cardName = card.name || 'Maintenance';
        card.entries.push({ id:uid(), personId, person:passenger, amount:totalOwing, date:today, note:maintNote + ' → ' + cardName });
        saveCustomMaintCards(cards);
        renderCustomMaintCards();
      }
    }
    // Also add to cash flow
    const cfData2 = loadCFData ? loadCFData() : {};
    const mk2 = today.slice(0,7);
    if(!cfData2[mk2]) cfData2[mk2] = { income:[], expenses:[] };
    cfData2[mk2].income = cfData2[mk2].income || [];
    const destMaintName = cardId === 'original' ? 'Maintenance Fund' : (loadCustomMaintCards().find(function(c){ return c.id===cardId; })||{}).name||'Maintenance';
    const cfLabel_maint = passenger + ' → ' + destMaintName + payBreakdown + ' via ' + bank;
    cfData2[mk2].income.push({ id:uid(), label:cfLabel_maint, amount:totalOwing, icon:'🔧', auto:false, sourceType:'carpool_payment', sourceId:passenger, sourceCardName:bank, note:maintNote + ' → ' + destMaintName });
    if(saveCFData) saveCFData(cfData2);

  } else if(choice === 'split'){
    // For split, just close and let user manually deposit — show a toast guide
    closeModal('payDestModal');
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:#0d1228;border:1px solid #7090f0;border-radius:8px;padding:12px 20px;z-index:9999;font-family:DM Mono,monospace;font-size:11px;color:#7090f0;letter-spacing:1px;text-align:center;max-width:300px;';
    toast.textContent = 'Trips & borrows marked paid. Manually deposit '+fmtR(totalOwing)+' across your chosen funds.';
    document.body.appendChild(toast);
    setTimeout(function(){ toast.remove(); }, 5000);
    renderCarpool();
    generateStatements();
    return;
  }

  closeModal('payDestModal');

  // Show success toast
  const destName = choice === 'cashflow' ? 'Cash Flow' : choice.startsWith('fund:') ? (funds.find(function(f){ return f.id===choice.replace('fund:',''); })||{}).name||'Fund' : 'Maintenance';
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:#0d1a00;border:1px solid #c8f230;border-radius:8px;padding:12px 20px;z-index:9999;font-family:DM Mono,monospace;font-size:11px;color:#c8f230;letter-spacing:1px;white-space:nowrap;';
  toast.textContent = '✓ '+fmtR(totalOwing)+' from '+passenger+' → '+destName;
  document.body.appendChild(toast);
  setTimeout(function(){ toast.remove(); }, 4000);

  // Refresh everything
  renderCarpool();
  generateStatements();
}

function openWA(btn){const card=btn.closest('.stmt-card');const text=card._waData;window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank');}
function saveStmt(name,from,to,text){const b=new Blob([text],{type:'text/plain'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='Statement_'+name+'_'+from+'_to_'+to+'.txt';a.click();}

// REPORTS

function rptScrollTo(sectionId){
  var el = document.getElementById(sectionId);
  if(el) el.scrollIntoView({ behavior:'smooth', block:'start' });
}
let reportPeriod = 'all';
let compareMode = false;

// ── Get the previous period key given the current one ──
function getPreviousPeriodKey(currentKey) {
  const periods = buildReportPeriods();
  const keys = Object.keys(periods).filter(function(k){ return k !== 'all'; });
  const idx = keys.indexOf(currentKey);
  if (idx <= 0) return null;
  return keys[idx - 1];
}

function toggleCompareMode() {
  compareMode = !compareMode;
  const btn = document.getElementById('compareToggleBtn');
  const label = document.getElementById('compareToggleLabel');
  if (compareMode) {
    btn.style.background = '#1a2e00';
    btn.style.borderColor = 'var(--accent)';
    btn.style.color = 'var(--accent)';
    label.textContent = 'COMPARING';
  } else {
    btn.style.background = 'none';
    btn.style.borderColor = 'var(--border)';
    btn.style.color = 'var(--muted)';
    label.textContent = 'COMPARE';
  }
  renderReports();
}

// ── Aggregate carpool totals for a given months array ──
function getCarpoolTotalsForPeriod(months) {
  const passengers = PASSENGERS.slice();
  const paxData = {};
  let total = 0;
  passengers.forEach(function(p){ paxData[p] = { total:0, paid:0, owing:0 }; });
  Object.keys(cpData).forEach(function(mk){
    if (months && !months.includes(mk)) return;
    Object.values(cpData[mk]).forEach(function(dd){
      if (typeof dd !== 'object') return;
      passengers.forEach(function(p){
        if (!dd[p] || typeof dd[p] !== 'object') return;
        const amt = dd[p].amt || 0;
        const paid = dd[p].paid || false;
        paxData[p].total += amt;
        if (paid) paxData[p].paid += amt;
        else if (amt > 0) paxData[p].owing += amt;
        total += amt;
      });
    });
  });
  return { paxData, total };
}

// ── Format a delta value with colour and sign ──
function fmtDelta(val) {
  if (val === 0) return { text: '—', pct: '0%', color: '#555' };
  const sign = val > 0 ? '+' : '';
  const color = val > 0 ? '#c8f230' : '#f23060';
  return { text: sign + fmtR(val), color };
}
function fmtDeltaPct(a, b) {
  if (b === 0) return '';
  const pct = ((a - b) / b * 100).toFixed(1);
  const sign = pct > 0 ? '+' : '';
  return sign + pct + '%';
}

// ── Build period options dynamically from the current date ──
function buildReportPeriods(){
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth(); // 0-based
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const MONTH_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const periods = {};
  // Last 6 months (including current)
  for(let i = 5; i >= 0; i--){
    let m = curMonth - i;
    let y = curYear;
    if(m < 0){ m += 12; y -= 1; }
    const key = y+'-'+String(m+1).padStart(2,'0');
    periods[key] = { label: MONTH_FULL[m]+' '+y, months: [key] };
  }
  // Q1, Q2, Q3, Q4 for current year
  const quarters = [
    { key:'q1-'+curYear, label:'Q1 '+curYear, months:[curYear+'-01',curYear+'-02',curYear+'-03'] },
    { key:'q2-'+curYear, label:'Q2 '+curYear, months:[curYear+'-04',curYear+'-05',curYear+'-06'] },
    { key:'q3-'+curYear, label:'Q3 '+curYear, months:[curYear+'-07',curYear+'-08',curYear+'-09'] },
    { key:'q4-'+curYear, label:'Q4 '+curYear, months:[curYear+'-10',curYear+'-11',curYear+'-12'] },
  ];
  // Only add quarters that have at least started
  quarters.forEach(function(q){
    const firstMonth = parseInt(q.months[0].split('-')[1]) - 1;
    if(firstMonth <= curMonth) periods[q.key] = { label: q.label, months: q.months };
  });
  // All time
  periods['all'] = { label: 'All Time', months: null };
  return periods;
}

function renderReportFilters(){
  const periods = buildReportPeriods();
  const container = document.getElementById('reportFilters');
  if(!container) return;
  container.innerHTML = '';
  Object.keys(periods).forEach(function(key){
    const btn = document.createElement('button');
    btn.className = 'rpt-filter' + (key === reportPeriod ? ' rpt-active' : '');
    btn.textContent = periods[key].label.replace(/ 20\d\d$/,function(m){ return m; }).split(' ')[0] + (periods[key].label.includes('Q') ? ' '+periods[key].label.split(' ')[1] : '');
    // Shorten month names: "January 2026" → "Jan 26", quarters keep "Q1 2026"
    const parts = periods[key].label.split(' ');
    if(parts[0].startsWith('Q')){
      btn.textContent = parts[0]+' '+parts[1];
    } else {
      const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const mi = MONTH_NAMES.indexOf(parts[0]);
      btn.textContent = (mi>=0?MONTH_SHORT[mi]:parts[0]) + " '" + String(parts[1]).slice(2);
    }
    if(key === 'all') btn.textContent = 'All time';
    btn.onclick = function(){ setReportPeriod(key, btn); };
    container.appendChild(btn);
  });
}

function setReportPeriod(p,btn){
  reportPeriod=p;
  document.querySelectorAll('.rpt-filter').forEach(function(b){b.classList.remove('rpt-active');});
  if(btn) btn.classList.add('rpt-active');
  renderReports();
}

function renderReports(){
  const periods = buildReportPeriods();
  const period  = periods[reportPeriod] || periods['all'];
  const months  = period.months;
  const label   = period.label;

  // ── #3 Fix: fundBalanceAt — running balance at end of a period ──
  // This is what you actually want for comparison:
  // "What was this fund's balance at the end of Jan?" not "How much was deposited in Jan?"
  function fundBalanceAt(f, monthKeys) {
    if (!monthKeys) return fundTotal(f); // all time = current total
    // Find the last month in the period and sum all deposits up to end of that month
    const lastMonth = monthKeys[monthKeys.length - 1]; // e.g. "2026-02"
    return (f.deposits || []).reduce(function(s, d) {
      if (!d.date) return s;
      const mk = d.date.slice(0, 7);
      if (mk > lastMonth) return s; // deposit is after the period end — exclude
      if (d.txnType === 'out') return s - d.amount;
      return s + d.amount;
    }, 0);
  }

  // ── Also keep depositedInPeriod for "how much was added this period" ──
  function fundDepositedInPeriod(f, monthKeys) {
    return (f.deposits || []).reduce(function(s, d) {
      if (!d.date) return s;
      const mk = d.date.slice(0, 7);
      if (monthKeys && !monthKeys.includes(mk)) return s;
      if (d.txnType === 'out') return s - d.amount;
      return s + d.amount;
    }, 0);
  }

  // SAVINGS
  const prevKey = getPreviousPeriodKey(reportPeriod);
  const prevPeriod = prevKey ? periods[prevKey] : null;
  const showCompare = compareMode && prevPeriod && reportPeriod !== 'all';

  document.getElementById('rptSavingsPeriod').textContent = showCompare
    ? (period.label + ' vs ' + prevPeriod.label)
    : (months ? 'Balance at end of ' + label : label);

  if (showCompare) {
    // Compare mode
    document.getElementById('savNormalCards').style.display  = 'none';
    document.getElementById('savCompareCards').style.display = 'block';
    document.getElementById('savNormalTable').style.display  = 'none';
    document.getElementById('savCompareTable').style.display = 'block';

    document.getElementById('savCmpCardLabelA').textContent = period.label;
    document.getElementById('savCmpCardLabelB').textContent = prevPeriod.label;
    document.getElementById('savCmpColA').textContent = 'Balance ' + period.label;
    document.getElementById('savCmpColB').textContent = 'Balance ' + prevPeriod.label;

    let totalA = 0, totalB = 0;
    const compareRows = funds.map(function(f) {
      const a = fundBalanceAt(f, months);
      const b = fundBalanceAt(f, prevPeriod.months);
      totalA += a; totalB += b;
      const d = fmtDelta(a - b);
      const pctStr = fmtDeltaPct(a, b);
      // Also show what was deposited in the current period as context
      const deposited = fundDepositedInPeriod(f, months);
      return '<div class="rpt-row" style="grid-template-columns:1.5fr 1fr 1fr 1fr">'
        + '<span style="color:#888">' + f.emoji + ' ' + f.name + '</span>'
        + '<span style="color:#c8f230" title="Balance at end of '+period.label+'">' + fmtR(a) + '</span>'
        + '<span style="color:#666" title="Balance at end of '+prevPeriod.label+'">' + fmtR(b) + '</span>'
        + '<span style="color:' + d.color + ';font-weight:500">' + d.text + (pctStr ? ' <span style="font-size:9px;opacity:.7">('+pctStr+')</span>' : '') + '</span>'
        + '</div>';
    }).join('');

    document.getElementById('savCmpTotalA').textContent = fmtR(totalA);
    document.getElementById('savCmpTotalB').textContent = fmtR(totalB);
    document.getElementById('savCmpCardLabelA').textContent = 'Balance · ' + period.label;
    document.getElementById('savCmpCardLabelB').textContent = 'Balance · ' + prevPeriod.label;
    const sd = fmtDelta(totalA - totalB);
    const sdEl = document.getElementById('savCmpDelta');
    sdEl.textContent = sd.text; sdEl.style.color = sd.color;
    const spEl = document.getElementById('savCmpDeltaPct');
    spEl.textContent = fmtDeltaPct(totalA, totalB); spEl.style.color = sd.color;
    document.getElementById('rptSavingsCompareRows').innerHTML = compareRows || '<div style="padding:14px;color:#555;font-size:12px">No funds found</div>';
    document.getElementById('rptTotalSaved').textContent = fmtR(totalA);
    document.getElementById('rptFundCount').textContent = funds.length;

  } else {
    // Normal mode
    document.getElementById('savNormalCards').style.display  = 'grid';
    document.getElementById('savCompareCards').style.display = 'none';
    document.getElementById('savNormalTable').style.display  = 'block';
    document.getElementById('savCompareTable').style.display = 'none';

    let totalSaved = 0;
    const savingsRows = funds.map(function(f){
      let displayAmt, displayPct, displayCol;
      if(f.isExpense){
        const totalIn=f.deposits.filter(function(d){return d.txnType==='in';}).reduce(function(s,d){return s+d.amount;},0);
        const totalOut=f.deposits.filter(function(d){return d.txnType==='out';}).reduce(function(s,d){return s+d.amount;},0);
        const bal=totalIn-totalOut;
        totalSaved+=bal;
        displayAmt=fmtR(bal);
        displayPct=(totalIn>0?Math.min(100,(bal/totalIn)*100):0).toFixed(0)+'%';
        displayCol=bal<0?'#f23060':bal<totalIn*0.2?'#f2a830':'#c8f230';
        return '<div class="rpt-row" style="grid-template-columns:2fr 1fr 1fr"><span style="color:#888">'+f.emoji+' '+f.name+'</span><span style="color:'+displayCol+';font-weight:500">'+displayAmt+'</span><span style="color:#555">'+displayPct+' avail</span></div>';
      } else {
        // Use fundBalanceAt for accurate period balance
        const t = fundBalanceAt(f, months);
        const goal = f.goal || 0;
        totalSaved += t;
        const pct = goal > 0 ? Math.min(100,(t/goal)*100).toFixed(0) : '—';
        const col = t===0?'#333':'#c8f230';
        const pctDisplay = goal > 0 ? pct+'%'+(t>=goal?' \uD83C\uDF89':'') : '—';
        return '<div class="rpt-row" style="grid-template-columns:2fr 1fr 1fr"><span style="color:#888">'+f.emoji+' '+f.name+'</span><span style="color:'+col+';font-weight:500">'+fmtR(t)+'</span><span style="color:#555">'+pctDisplay+'</span></div>';
      }
    }).join('');
    document.getElementById('rptTotalSaved').textContent=fmtR(totalSaved);
    document.getElementById('rptFundCount').textContent=funds.length;
    document.getElementById('rptSavingsRows').innerHTML=savingsRows;
  }

  // CARPOOL
  const banner = document.getElementById('compareBanner');

  if (showCompare) {
    // ── COMPARE MODE ──
    if (banner) banner.style.display = 'block';
    document.getElementById('cmpLabelA').textContent = period.label;
    document.getElementById('cmpLabelB').textContent = prevPeriod.label;
    document.getElementById('cmpCardLabelA').textContent = period.label;
    document.getElementById('cmpCardLabelB').textContent = prevPeriod.label;
    document.getElementById('cmpColA').textContent = period.label;
    document.getElementById('cmpColB').textContent = prevPeriod.label;

    const curData  = getCarpoolTotalsForPeriod(months);
    const prevData = getCarpoolTotalsForPeriod(prevPeriod.months);

    document.getElementById('rptCarpoolPeriod').textContent = period.label + ' vs ' + prevPeriod.label;
    document.getElementById('rptCarpoolTotal').textContent = fmtR(curData.total);
    document.getElementById('rptCarpoolOwing').textContent = fmtR(
      PASSENGERS.slice().reduce(function(s,p){ return s + curData.paxData[p].owing; }, 0)
    );
    document.getElementById('cmpTotalA').textContent = fmtR(curData.total);
    document.getElementById('cmpTotalB').textContent = fmtR(prevData.total);

    const delta = fmtDelta(curData.total - prevData.total);
    const dEl = document.getElementById('cmpDelta');
    const pEl = document.getElementById('cmpDeltaPct');
    dEl.textContent = delta.text;
    dEl.style.color = delta.color;
    pEl.textContent = fmtDeltaPct(curData.total, prevData.total);
    pEl.style.color = delta.color;

    // Passenger compare rows
    const compareRows = PASSENGERS.slice().map(function(p) {
      const cur  = curData.paxData[p].total;
      const prev = prevData.paxData[p].total;
      const d    = fmtDelta(cur - prev);
      const pct  = fmtDeltaPct(cur, prev);
      return '<div class="rpt-row" style="grid-template-columns:1.2fr 1fr 1fr 1fr">'
        + '<span style="color:#888">' + p + '</span>'
        + '<span style="color:#c8f230">' + fmtR(cur) + '</span>'
        + '<span style="color:#666">' + fmtR(prev) + '</span>'
        + '<span style="color:' + d.color + ';font-weight:500">' + d.text + (pct ? ' <span style="font-size:9px;opacity:.7">(' + pct + ')</span>' : '') + '</span>'
        + '</div>';
    }).join('');
    document.getElementById('rptCarpoolCompareRows').innerHTML = compareRows;

    document.getElementById('cpNormalCards').style.display  = 'none';
    document.getElementById('cpCompareCards').style.display = 'block';
    document.getElementById('cpNormalTable').style.display  = 'none';
    document.getElementById('cpCompareTable').style.display = 'block';

  } else {
    // ── NORMAL MODE ──
    if (banner) banner.style.display = 'none';
    document.getElementById('cpNormalCards').style.display  = 'grid';
    document.getElementById('cpCompareCards').style.display = 'none';
    document.getElementById('cpNormalTable').style.display  = 'block';
    document.getElementById('cpCompareTable').style.display = 'none';

    document.getElementById('rptCarpoolPeriod').textContent = label;
    let cpTotal=0, cpOwing=0;
    const paxData={};
    const passengers=PASSENGERS.slice();
    passengers.forEach(function(p){ paxData[p]={total:0,paid:0,owing:0}; });

    Object.keys(cpData).forEach(function(mk){
      if(months && !months.includes(mk)) return;
      Object.values(cpData[mk]).forEach(function(dd){
        if(typeof dd!=='object') return;
        passengers.forEach(function(p){
          if(!dd[p]||typeof dd[p]!=='object') return;
          const amt=dd[p].amt||0;
          const paid=dd[p].paid||false;
          paxData[p].total+=amt;
          if(paid) paxData[p].paid+=amt;
          else if(amt>0) paxData[p].owing+=amt;
          cpTotal+=amt;
          if(!paid&&amt>0) cpOwing+=amt;
        });
      });
    });

    document.getElementById('rptCarpoolTotal').textContent=fmtR(cpTotal);
    document.getElementById('rptCarpoolOwing').textContent=fmtR(cpOwing);
    const carpoolRows=passengers.map(function(p){
      const d=paxData[p];
      return '<div class="rpt-row" style="grid-template-columns:1.5fr 1fr 1fr 1fr"><span style="color:#888">'+p+'</span><span style="color:#efefef">'+fmtR(d.total)+'</span><span style="color:#c8f230">'+fmtR(d.paid)+'</span><span style="color:#f2a830">'+fmtR(d.owing)+'</span></div>';
    }).join('');
    document.getElementById('rptCarpoolRows').innerHTML=carpoolRows;
  }
  renderCarpoolChart();

  // MAINTENANCE (unified: original + custom cards)
  renderMaintReport(months, label);

  // Smart Engine — refresh insights
  runSmartEngine();

  // CAR EXPENSES - pull directly from live Car Fund data
  const carFund=funds.find(function(f){return f.isExpense;});
  if(carFund){
    const totalIn=carFund.deposits.filter(function(d){return d.txnType==='in';}).reduce(function(s,d){return s+d.amount;},0);
    const totalOut=carFund.deposits.filter(function(d){return d.txnType==='out';}).reduce(function(s,d){return s+d.amount;},0);
    const balance=totalIn-totalOut;
    document.getElementById('rptCarSpent').textContent=fmtR(totalOut);
    document.getElementById('rptCarAvail').textContent=fmtR(balance);
    const outDeposits=carFund.deposits.filter(function(d){return d.txnType==='out';});
    const carRows=outDeposits.length>0?outDeposits.sort(function(a,b){return new Date(a.date)-new Date(b.date);}).map(function(d){
      return '<div class="rpt-row" style="grid-template-columns:2fr 1fr 1fr"><span style="color:#888">'+(d.note||'—')+'</span><span style="color:#555">'+(d.date||'—')+'</span><span style="color:#f23060;font-weight:500">-'+fmtR(d.amount)+'</span></div>';
    }).join(''):'<div style="padding:14px;color:#555;font-size:12px">No expenses logged yet</div>';
    document.getElementById('rptCarRows').innerHTML=carRows;
  }
}

// ── CARPOOL INCOME CHART ──
var _cpChart = null;
var _cpChartMode = 'bar';

function setCpChartMode(mode, btn) {
  _cpChartMode = mode;
  document.querySelectorAll('#chartTypeToggle button').forEach(function(b){
    b.style.background = 'none';
    b.style.borderColor = 'var(--border)';
    b.style.color = 'var(--muted)';
  });
  btn.style.background = '#1a2e00';
  btn.style.borderColor = 'var(--accent)';
  btn.style.color = 'var(--accent)';
  renderCarpoolChart();
}

function renderCarpoolChart() {
  var canvas = document.getElementById('cpIncomeChart');
  var emptyMsg = document.getElementById('cpChartEmpty');
  if (!canvas) return;

  var MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var labels = [];
  var monthKeys = [];

  // ── Respect the selected report period ──
  var now = new Date();
  var periods = buildReportPeriods();
  var selPeriod = periods[reportPeriod] || periods['all'];

  if (reportPeriod === 'all' || !selPeriod.months) {
    // All time or no filter: show last 6 months
    for (var i = 5; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(MONTH_SHORT[d.getMonth()] + " '" + String(d.getFullYear()).slice(2));
      monthKeys.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
    }
  } else if (selPeriod.months.length === 1) {
    // Single month: show daily breakdown for that month
    var mk = selPeriod.months[0];
    var yr = parseInt(mk.slice(0,4));
    var mo = parseInt(mk.slice(5,7)) - 1;
    var daysInMonth = new Date(yr, mo+1, 0).getDate();
    for (var day = 1; day <= daysInMonth; day++) {
      labels.push(String(day));
      monthKeys.push(mk + '-' + String(day).padStart(2,'0')); // daily key
    }
    // Use daily mode flag
    return renderCarpoolChartDaily(canvas, emptyMsg, mk, labels);
  } else {
    // Multi-month (quarter): show each month
    selPeriod.months.forEach(function(mk) {
      var yr = parseInt(mk.slice(0,4));
      var mo = parseInt(mk.slice(5,7)) - 1;
      labels.push(MONTH_SHORT[mo] + " '" + String(yr).slice(2));
      monthKeys.push(mk);
    });
  }

  var passengers = PASSENGER_DATA.map(function(p){ return p.name; });
  var colorMap = {};
  var bgAlphaMap = {};
  PASSENGER_DATA.forEach(function(p){
    colorMap[p.name] = p.color || '#c8f230';
    bgAlphaMap[p.name] = (p.color || '#c8f230') + '33';
  });

  // Aggregate per passenger per month
  var totals = {};
  passengers.forEach(function(p) { totals[p] = monthKeys.map(function() { return 0; }); });

  var hasData = false;
  monthKeys.forEach(function(mk, mi) {
    if (!cpData[mk]) return;
    Object.values(cpData[mk]).forEach(function(dd) {
      if (typeof dd !== 'object') return;
      passengers.forEach(function(p) {
        if (!dd[p] || typeof dd[p] !== 'object') return;
        var amt = dd[p].amt || 0;
        if (amt > 0) { totals[p][mi] += amt; hasData = true; }
      });
    });
  });

  if (!hasData) {
    canvas.style.display = 'none';
    if (emptyMsg) emptyMsg.style.display = 'block';
    return;
  }
  canvas.style.display = 'block';
  if (emptyMsg) emptyMsg.style.display = 'none';

  // Build legend dynamically
  const legend = document.getElementById('cpChartLegend');
  if(legend){
    legend.innerHTML = PASSENGER_DATA.map(function(p){
      return '<div style="display:flex;align-items:center;gap:6px;font-size:10px;color:#aaa;"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:'+(p.color||'#c8f230')+'"></span>'+p.name+'</div>';
    }).join('');
  }

  // Destroy old chart
  if (_cpChart) { _cpChart.destroy(); _cpChart = null; }
  // Reset drill-down
  closeDrillDown();

  var isLine = _cpChartMode === 'line';
  var isDark = !document.documentElement.classList.contains('light');

  var datasets = passengers.map(function(p) {
    return {
      label: p,
      data: totals[p],
      backgroundColor: isLine ? bgAlphaMap[p] : colorMap[p] + 'cc',
      borderColor: colorMap[p],
      borderWidth: isLine ? 2 : 0,
      borderRadius: isLine ? 0 : 5,
      pointBackgroundColor: colorMap[p],
      pointRadius: isLine ? 4 : 0,
      pointHoverRadius: 6,
      tension: 0.35,
      fill: isLine
    };
  });

  var gridColor = isDark ? '#2a2a2a' : '#e5e5e5';
  var tickColor = isDark ? '#555' : '#aaa';

  _cpChart = new Chart(canvas, {
    type: isLine ? 'line' : 'bar',
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      onHover: function(event, elements) {
        canvas.style.cursor = elements.length ? 'pointer' : 'default';
      },
      onClick: function(event, elements) {
        if (!elements.length) return;
        var idx = elements[0].index;
        var mk = monthKeys[idx];
        var lbl = labels[idx];
        drillDownToMonth(mk, lbl);
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#111',
          borderColor: '#333',
          borderWidth: 1,
          titleColor: '#888',
          bodyColor: '#efefef',
          padding: 10,
          callbacks: {
            label: function(ctx) {
              return ' ' + ctx.dataset.label + ': R' + (ctx.parsed.y || 0).toLocaleString('en-ZA');
            }
          }
        }
      },
      scales: {
        x: {
          stacked: !isLine,
          grid: { color: gridColor, drawBorder: false },
          ticks: { color: tickColor, font: { family: "'DM Mono', monospace", size: 10 } }
        },
        y: {
          stacked: !isLine,
          grid: { color: gridColor, drawBorder: false },
          border: { dash: [3, 3] },
          ticks: {
            color: tickColor,
            font: { family: "'DM Mono', monospace", size: 10 },
            callback: function(v) { return 'R' + v.toLocaleString('en-ZA'); }
          }
        }
      }
    }
  });
}

function renderCarpoolChartDaily(canvas, emptyMsg, monthKey, dayLabels) {
  var passengers = PASSENGER_DATA.map(function(p){ return p.name; });
  var colorMap3 = {};
  PASSENGER_DATA.forEach(function(p){ colorMap3[p.name] = p.color || '#c8f230'; });
  var monthData = cpData[monthKey] || {};
  var daysInMonth = dayLabels.length;

  var totals = {};
  passengers.forEach(function(p) { totals[p] = Array(daysInMonth).fill(0); });
  var hasData = false;

  Object.keys(monthData).forEach(function(dateKey) {
    // dateKey format: "2026-04-15" — get day index
    var parts = dateKey.split('-');
    if (parts.length < 3) return;
    var dayIdx = parseInt(parts[2]) - 1;
    if (dayIdx < 0 || dayIdx >= daysInMonth) return;
    var dd = monthData[dateKey];
    if (typeof dd !== 'object') return;
    passengers.forEach(function(p) {
      if (!dd[p] || typeof dd[p] !== 'object') return;
      var amt = dd[p].amt || 0;
      if (amt > 0) { totals[p][dayIdx] += amt; hasData = true; }
    });
  });

  if (!hasData) {
    canvas.style.display = 'none';
    if (emptyMsg) emptyMsg.style.display = 'block';
    return;
  }
  canvas.style.display = 'block';
  if (emptyMsg) emptyMsg.style.display = 'none';
  if (_cpChart) { _cpChart.destroy(); _cpChart = null; }

  var isDark = !document.documentElement.classList.contains('light');
  var gridColor = isDark ? '#2a2a2a' : '#e5e5e5';
  var tickColor = isDark ? '#555' : '#aaa';
  var isLine = _cpChartMode === 'line';

  var datasets = passengers.map(function(p) {
    return {
      label: p, data: totals[p],
      backgroundColor: isLine ? colorMap3[p]+'33' : colorMap3[p]+'cc',
      borderColor: colorMap3[p], borderWidth: isLine ? 2 : 0,
      borderRadius: isLine ? 0 : 4, pointRadius: isLine ? 3 : 0,
      pointHoverRadius: 5, tension: 0.3, fill: isLine
    };
  });

  _cpChart = new Chart(canvas, {
    type: isLine ? 'line' : 'bar',
    data: { labels: dayLabels, datasets: datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#111', borderColor: '#333', borderWidth: 1,
          titleColor: '#888', bodyColor: '#efefef', padding: 10,
          callbacks: { label: function(ctx) { return ' ' + ctx.dataset.label + ': R' + (ctx.parsed.y||0).toLocaleString('en-ZA'); } }
        }
      },
      scales: {
        x: { stacked: !isLine, grid: { color: gridColor }, ticks: { color: tickColor, font: { family: "'DM Mono',monospace", size: 9 } } },
        y: { stacked: !isLine, grid: { color: gridColor }, ticks: { color: tickColor, font: { family: "'DM Mono',monospace", size: 9 }, callback: function(v){ return 'R'+v.toLocaleString('en-ZA'); } } }
      }
    }
  });
}

function renderMaintReport(months, label) {
  const now = new Date();
  const curMonthKey = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');

  // ── Helper: filter entries by period ──
  function entriesInPeriod(entries, monthKeys) {
    if (!monthKeys) return entries; // all time
    return entries.filter(function(e){ return e.date && monthKeys.includes(e.date.slice(0,7)); });
  }

  // ── 1. Original hardcoded maintenance card ──
  const origEntries = getMaintData();
  const origMonthEntries = origEntries.filter(function(e){ return e.date && e.date.startsWith(curMonthKey); });
  const origPeriodEntries = entriesInPeriod(origEntries, months);
  const origMonthTotal = origMonthEntries.reduce(function(s,e){ return s+e.amount; }, 0);
  const origPeriodTotal = origPeriodEntries.reduce(function(s,e){ return s+e.amount; }, 0);
  const origAllTotal = origEntries.reduce(function(s,e){ return s+e.amount; }, 0);
  const origTarget = typeof MAINT_TARGET !== 'undefined' ? MAINT_TARGET : 1500;
  const origPct = origTarget > 0 ? Math.min(100, Math.round((origMonthTotal/origTarget)*100)) : 0;

  // ── 2. Custom maintenance cards ──
  const customCards = loadCustomMaintCards();
  let grandMonth = origMonthTotal;
  let grandTotal = origAllTotal;

  const rows = [];

  // Original card row
  rows.push({
    name: '🔧 Maintenance Fund',
    monthAmt: origMonthTotal,
    periodAmt: origPeriodTotal,
    allTotal: origAllTotal,
    target: origTarget,
    pct: origPct
  });

  // Custom card rows
  customCards.forEach(function(card) {
    const entries = card.entries || [];
    const monthEntries = entries.filter(function(e){ return e.date && e.date.startsWith(curMonthKey); });
    const periodEntries = entriesInPeriod(entries, months);
    const monthAmt = monthEntries.reduce(function(s,e){ return s+e.amount; }, 0);
    const periodAmt = periodEntries.reduce(function(s,e){ return s+e.amount; }, 0);
    const allAmt = entries.reduce(function(s,e){ return s+e.amount; }, 0);
    const pct = card.target > 0 ? Math.min(100, Math.round((monthAmt/card.target)*100)) : 0;
    grandMonth += monthAmt;
    grandTotal += allAmt;
    rows.push({ name: card.emoji+' '+card.name, monthAmt, periodAmt, allAmt, target: card.target, pct });
  });

  // Update summary cards
  document.getElementById('rptMaintMonth').textContent = fmtR(grandMonth);
  document.getElementById('rptMaintTotal').textContent = fmtR(grandTotal);
  document.getElementById('rptMaintCount').textContent = rows.length;
  document.getElementById('rptMaintPeriod').textContent = label;

  // Update rows
  const displayAmt = months ? 'periodAmt' : 'allTotal';
  document.getElementById('rptMaintRows').innerHTML = rows.map(function(r) {
    const amt = months ? r.periodAmt : (r.allTotal || r.allAmt || 0);
    const pctColor = r.pct >= 100 ? '#c8f230' : r.pct >= 50 ? '#f2a830' : '#f23060';
    return '<div class="rpt-row" style="grid-template-columns:2fr 1fr 1fr 1fr">'
      + '<span style="color:#888">' + r.name + '</span>'
      + '<span style="color:#f2a830;font-weight:500">' + fmtR(r.monthAmt) + '</span>'
      + '<span style="color:#c8f230">' + fmtR(amt) + '</span>'
      + '<span style="color:' + pctColor + '">' + r.pct + '%</span>'
      + '</div>';
  }).join('') || '<div style="padding:14px;color:#555;font-size:12px">No maintenance funds yet.</div>';
}

// ── CHART DRILL-DOWN ──
var _drillMonthKey = null;

function closeDrillDown(){
  document.getElementById('chartDrillPanel').style.display = 'none';
  document.getElementById('chartDrillHint').style.display = 'block';
  _drillMonthKey = null;
}

function drillDownToMonth(monthKey, label) {
  _drillMonthKey = monthKey;
  const panel = document.getElementById('chartDrillPanel');
  const drillLabel = document.getElementById('drillLabel');
  const drillRows = document.getElementById('drillRows');
  const drillSummary = document.getElementById('drillSummary');
  const drillTotal = document.getElementById('drillTotal');

  drillLabel.textContent = label;
  document.getElementById('chartDrillHint').style.display = 'none';

  const monthData = cpData[monthKey] || {};
  const dates = Object.keys(monthData).filter(function(ds){
    return typeof monthData[ds] === 'object' && ds !== 'notes';
  }).sort();

  // Update column headers dynamically
  const pNames = PASSENGER_DATA.map(function(p){ return p.name; });
  const col1 = document.getElementById('drillCol1');
  const col2 = document.getElementById('drillCol2');
  // Show first 2 passengers in columns, rest in total
  if(col1) col1.textContent = pNames[0] || '—';
  if(col2) col2.textContent = pNames[1] || '—';

  let grandTotal = 0;
  let tripCount = 0;

  const rows = dates.map(function(ds){
    const dd = monthData[ds];
    if(typeof dd !== 'object') return '';
    const dayAmt = PASSENGERS.reduce(function(s,p){
      return s + (dd[p] && typeof dd[p]==='object' ? dd[p].amt||0 : 0);
    }, 0);
    if(dayAmt === 0) return '';
    grandTotal += dayAmt;
    tripCount++;

    const p0 = pNames[0] ? (dd[pNames[0]]&&typeof dd[pNames[0]]==='object' ? dd[pNames[0]] : {amt:0,paid:false}) : {amt:0,paid:false};
    const p1 = pNames[1] ? (dd[pNames[1]]&&typeof dd[pNames[1]]==='object' ? dd[pNames[1]] : {amt:0,paid:false}) : {amt:0,paid:false};

    const fmt = function(v){ return v.amt > 0 ? '<span style="color:'+(v.paid?'#c8f230':'#f2a830')+'">R'+v.amt+(v.paid?' ✓':'')+' </span>' : '<span style="color:#333">—</span>'; };
    const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(ds+'T00:00:00').getDay()];

    return '<div style="display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;padding:8px 16px;border-bottom:1px solid #0d1a00;font-size:11px;align-items:center;">'
      +'<span style="color:#888;">'+dow+' '+ds.slice(8)+'</span>'
      +fmt(p0)
      +fmt(p1)
      +'<span style="color:#efefef;font-weight:700;">'+fmtR(dayAmt)+'</span>'
      +'</div>';
  }).join('');

  drillRows.innerHTML = rows || '<div style="padding:16px;color:#444;font-size:12px;">No trips this month.</div>';
  drillSummary.textContent = tripCount + ' trip day' + (tripCount!==1?'s':'');
  drillTotal.textContent = fmtR(grandTotal);
  panel.style.display = 'block';
  // Scroll to panel
  setTimeout(function(){ panel.scrollIntoView({ behavior:'smooth', block:'nearest' }); }, 100);
}

// ══ SMART ENGINE ══
function runSmartEngine() {
  const container = document.getElementById('insightCards');
  if (!container) return;

  const now = new Date();
  const curMK = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  const prevDate = new Date(now.getFullYear(), now.getMonth()-1, 1);
  const prevMK = prevDate.getFullYear() + '-' + String(prevDate.getMonth()+1).padStart(2,'0');
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const ts = document.getElementById('insightTimestamp');
  if (ts) ts.textContent = 'as of ' + now.toLocaleDateString('en-ZA', {day:'2-digit',month:'short'});

  const insights = [];

  // ── 1. NET POSITION this month ──
  try {
    const dailyFuelEl = document.getElementById('dailyFuelCost');
    const dailyFuel = dailyFuelEl ? parseFloat(dailyFuelEl.value)||100 : 100;
    const drivingDays = (function(){
      let count = 0;
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      while(d.getMonth() === now.getMonth()){
        if(d.getDay()>=1&&d.getDay()<=5) count++;
        d.setDate(d.getDate()+1);
      }
      return count;
    })();
    const estimatedFuel = drivingDays * dailyFuel;

    let carpoolThisMonth = 0;
    if (cpData[curMK]) {
      Object.values(cpData[curMK]).forEach(function(dd){
        if(typeof dd!=='object') return;
        PASSENGERS.forEach(function(p){
          if(dd[p]&&typeof dd[p]==='object') carpoolThisMonth += dd[p].amt||0;
        });
      });
    }
    const net = carpoolThisMonth - estimatedFuel;
    const netColor = net >= 0 ? '#c8f230' : '#f23060';
    const netIcon = net >= 0 ? '✅' : '⚠️';
    insights.push({
      icon: netIcon,
      title: 'Net Position — ' + MONTH_NAMES[now.getMonth()],
      body: '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-top:6px;">'
        + '<div><div style="font-size:9px;color:#555;letter-spacing:1px;margin-bottom:2px;">CARPOOL IN</div><div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:18px;color:#c8f230;">'+fmtR(carpoolThisMonth)+'</div></div>'
        + '<div style="color:#333;font-size:18px;">−</div>'
        + '<div><div style="font-size:9px;color:#555;letter-spacing:1px;margin-bottom:2px;">FUEL EST.</div><div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:18px;color:#f2a830;">'+fmtR(estimatedFuel)+'</div></div>'
        + '<div style="color:#333;font-size:18px;">=</div>'
        + '<div><div style="font-size:9px;color:#555;letter-spacing:1px;margin-bottom:2px;">NET</div><div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:22px;color:'+netColor+';">'+(net>=0?'+':'')+fmtR(net)+'</div></div>'
        + '</div>'
        + '<div style="font-size:10px;color:#444;margin-top:6px;letter-spacing:0.5px;">Based on '+drivingDays+' working days × '+fmtR(dailyFuel)+'/day</div>',
      accent: netColor
    });
  } catch(e){}

  // ── 2. WHO OWES YOU ──
  try {
    const owing = [];
    PASSENGERS.forEach(function(p){
      let total = 0;
      if(cpData[curMK]){
        Object.values(cpData[curMK]).forEach(function(dd){
          if(dd[p]&&typeof dd[p]==='object'&&!dd[p].paid) total += dd[p].amt||0;
        });
      }
      if(total > 0) owing.push({ name:p, amt:total });
    });
    // Also check borrow data
    PASSENGERS.forEach(function(p){
      const bt = getBorrowTotal(p);
      const outstanding = bt.borrowTotal - bt.borrowPaid;
      if(outstanding > 0.01){
        const existing = owing.find(function(x){ return x.name===p; });
        if(existing) existing.borrow = outstanding;
        else owing.push({ name:p, amt:0, borrow:outstanding });
      }
    });

    if(owing.length === 0){
      insights.push({
        icon:'✅', title:'All Paid Up', accent:'#c8f230',
        body:'<div style="font-size:11px;color:#5a8800;margin-top:4px;letter-spacing:0.5px;">No outstanding carpool balances this month. 🎉</div>'
      });
    } else {
      const rows = owing.map(function(o){
        let detail = '';
        if(o.amt > 0) detail += '<span style="background:#1a1200;border:1px solid #3a3000;border-radius:4px;padding:2px 8px;font-size:10px;color:#f2a830;margin-right:4px;">🚗 R'+o.amt+' carpool</span>';
        if(o.borrow) detail += '<span style="background:#1a0a2e;border:1px solid #3a2060;border-radius:4px;padding:2px 8px;font-size:10px;color:#a78bfa;">💸 R'+o.borrow.toFixed(0)+' borrowed</span>';
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1a1a1a;flex-wrap:wrap;gap:4px;">'
          +'<span style="font-size:12px;color:#efefef;">'+o.name+'</span>'
          +'<div>'+detail+'</div>'
          +'</div>';
      }).join('');
      insights.push({
        icon:'💸', title:'Outstanding Balances', accent:'#f2a830',
        body:'<div style="margin-top:6px;">'+rows+'</div>'
      });
    }
  } catch(e){}

  // ── 3. MONTH-ON-MONTH TREND ──
  try {
    let curTotal = 0, prevTotal = 0;
    if(cpData[curMK]) Object.values(cpData[curMK]).forEach(function(dd){
      if(typeof dd!=='object') return;
      PASSENGERS.forEach(function(p){ if(dd[p]&&typeof dd[p]==='object') curTotal+=dd[p].amt||0; });
    });
    if(cpData[prevMK]) Object.values(cpData[prevMK]).forEach(function(dd){
      if(typeof dd!=='object') return;
      PASSENGERS.forEach(function(p){ if(dd[p]&&typeof dd[p]==='object') prevTotal+=dd[p].amt||0; });
    });

    const diff = curTotal - prevTotal;
    const pct = prevTotal > 0 ? ((diff/prevTotal)*100).toFixed(0) : null;
    const trendIcon = diff > 0 ? '📈' : diff < 0 ? '📉' : '➡️';
    const trendColor = diff > 0 ? '#c8f230' : diff < 0 ? '#f23060' : '#888';
    const sign = diff > 0 ? '+' : '';
    insights.push({
      icon: trendIcon, title: 'Carpool Trend', accent: trendColor,
      body: '<div style="display:flex;align-items:center;gap:16px;margin-top:6px;flex-wrap:wrap;">'
        +'<div><div style="font-size:9px;color:#555;letter-spacing:1px;margin-bottom:2px;">'+MONTH_NAMES[prevDate.getMonth()].slice(0,3).toUpperCase()+'</div><div style="font-family:\'Syne\',sans-serif;font-size:17px;font-weight:700;color:#888;">'+fmtR(prevTotal)+'</div></div>'
        +'<div style="color:#333;">→</div>'
        +'<div><div style="font-size:9px;color:#555;letter-spacing:1px;margin-bottom:2px;">'+MONTH_NAMES[now.getMonth()].slice(0,3).toUpperCase()+'</div><div style="font-family:\'Syne\',sans-serif;font-size:17px;font-weight:700;color:#c8f230;">'+fmtR(curTotal)+'</div></div>'
        +'<div style="margin-left:auto;text-align:right;">'
          +'<div style="font-family:\'Syne\',sans-serif;font-size:22px;font-weight:800;color:'+trendColor+';">'+sign+fmtR(diff)+'</div>'
          +(pct!==null?'<div style="font-size:10px;color:'+trendColor+';letter-spacing:1px;">'+sign+pct+'% vs last month</div>':'')
        +'</div>'
        +'</div>'
    });
  } catch(e){}

  // ── 4. SAVINGS PACE ──
  try {
    const offTrack = [];
    const onTrack = [];
    funds.filter(function(f){ return !f.isExpense && f.goal > 0; }).forEach(function(f){
      const saved = fundTotal(f);
      const rem = Math.max(0, f.goal - saved);
      const pct = Math.min(100, (saved/f.goal)*100);
      if(saved >= f.goal){
        onTrack.push({ name:f.emoji+' '+f.name, pct:100 });
      } else if(f.weekly > 0){
        const wks = Math.ceil(rem/f.weekly);
        const eta = new Date();
        eta.setDate(eta.getDate() + wks*7);
        const etaStr = eta.toLocaleDateString('en-ZA',{day:'2-digit',month:'short',year:'numeric'});
        if(pct < 30){
          offTrack.push({ name:f.emoji+' '+f.name, pct:Math.round(pct), rem:fmtR(rem), eta:etaStr, wks });
        } else {
          onTrack.push({ name:f.emoji+' '+f.name, pct:Math.round(pct), eta:etaStr });
        }
      }
    });

    let savingsBody = '<div style="margin-top:6px;">';
    if(offTrack.length){
      savingsBody += offTrack.map(function(f){
        return '<div style="padding:6px 0;border-bottom:1px solid #1a1a1a;">'
          +'<div style="display:flex;justify-content:space-between;margin-bottom:4px;">'
            +'<span style="font-size:11px;color:#efefef;">'+f.name+'</span>'
            +'<span style="font-size:10px;color:#f2a830;">'+f.pct+'% · '+f.rem+' to go</span>'
          +'</div>'
          +'<div style="height:3px;background:#1a1a1a;border-radius:2px;">'
            +'<div style="height:100%;width:'+f.pct+'%;background:#f2a830;border-radius:2px;"></div>'
          +'</div>'
          +'<div style="font-size:9px;color:#444;margin-top:3px;letter-spacing:0.5px;">ETA: '+f.eta+'</div>'
        +'</div>';
      }).join('');
    }
    if(onTrack.length){
      savingsBody += '<div style="font-size:10px;color:#5a8800;margin-top:'+(offTrack.length?'8':'0')+'px;letter-spacing:0.5px;">✅ '+onTrack.length+' fund'+(onTrack.length!==1?'s':'')+' on track or complete</div>';
    }
    if(!offTrack.length && !onTrack.length){
      savingsBody += '<div style="font-size:11px;color:#444;">No savings funds set up yet.</div>';
    }
    savingsBody += '</div>';

    insights.push({
      icon: offTrack.length ? '⚠️' : '✅',
      title: 'Savings Pace',
      accent: offTrack.length ? '#f2a830' : '#c8f230',
      body: savingsBody
    });
  } catch(e){}

  // ── 5. MAINTENANCE HEALTH ──
  try {
    const maintInsights = [];

    // Original card
    const origData = getMaintData();
    const origMonth = origData.filter(function(e){ return e.date&&e.date.startsWith(curMK); }).reduce(function(s,e){ return s+e.amount; },0);
    const origShort = MAINT_TARGET - origMonth;
    maintInsights.push({ name:'🔧 Maintenance Fund', target:MAINT_TARGET, thisMonth:origMonth, short:origShort });

    // Custom cards
    loadCustomMaintCards().forEach(function(card){
      const entries = (card.entries||[]).filter(function(e){ return e.date&&e.date.startsWith(curMK); });
      const thisMonth = entries.reduce(function(s,e){ return s+e.amount; },0);
      maintInsights.push({ name:card.emoji+' '+card.name, target:card.target, thisMonth, short:card.target-thisMonth });
    });

    const needsAttention = maintInsights.filter(function(m){ return m.short > 0; });
    const maintBody = '<div style="margin-top:6px;">'
      + maintInsights.map(function(m){
          const pct = Math.min(100, m.target>0 ? Math.round(m.thisMonth/m.target*100) : 0);
          const color = pct>=100?'#c8f230':pct>=50?'#f2a830':'#f23060';
          return '<div style="padding:5px 0;border-bottom:1px solid #1a1a1a;">'
            +'<div style="display:flex;justify-content:space-between;margin-bottom:3px;">'
              +'<span style="font-size:11px;color:#efefef;">'+m.name+'</span>'
              +'<span style="font-size:10px;color:'+color+';">'+fmtR(m.thisMonth)+' / '+fmtR(m.target)+'</span>'
            +'</div>'
            +'<div style="height:3px;background:#1a1a1a;border-radius:2px;">'
              +'<div style="height:100%;width:'+pct+'%;background:'+color+';border-radius:2px;"></div>'
            +'</div>'
          +'</div>';
        }).join('')
      +'</div>';

    insights.push({
      icon: needsAttention.length ? '🔧' : '✅',
      title: 'Maintenance Health — ' + MONTH_NAMES[now.getMonth()],
      accent: needsAttention.length > 0 ? '#f2a830' : '#c8f230',
      body: maintBody
    });
  } catch(e){}

  // ── RENDER ALL INSIGHTS ──
  container.innerHTML = insights.map(function(ins){
    return '<div style="background:var(--surface);border:1px solid var(--border);border-left:3px solid '+ins.accent+';border-radius:8px;padding:14px 16px;">'
      +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">'
        +'<span style="font-size:14px;">'+ins.icon+'</span>'
        +'<span style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:13px;color:#efefef;">'+ins.title+'</span>'
      +'</div>'
      +ins.body
    +'</div>';
  }).join('');
}

// ══ CASH FLOW REPORT EXPORT ══

function buildCFMonthData(mk){
  // Returns { income:[], expenses:[], totalIncome, totalExpenses, net } for a given month key (YYYY-MM)
  const data = loadCFData();
  const recurIncome   = (data.recurring&&data.recurring.income)   || [];
  const recurExpenses = (data.recurring&&data.recurring.expenses)  || [];
  const monthIncome   = (data[mk]&&data[mk].income)               || [];
  const monthExpenses = (data[mk]&&data[mk].expenses)              || [];
  const monthIds = new Set([...monthIncome,...monthExpenses].map(function(e){ return e.id; }));
  const allIncome   = [...recurIncome.filter(function(e){ return !monthIds.has(e.id); }),...monthIncome];
  const allExpenses = [...recurExpenses.filter(function(e){ return !monthIds.has(e.id); }),...monthExpenses];

  // Auto: carpool
  let carpoolAuto = 0;
  if(cpData[mk]){
    Object.values(cpData[mk]).forEach(function(dd){
      if(typeof dd!=='object') return;
      PASSENGERS.forEach(function(p){
        if(dd[p]&&typeof dd[p]==='object') carpoolAuto += dd[p].amt||0;
      });
    });
  }
  if(carpoolAuto > 0) allIncome.push({ label:'Carpool Income', amount:carpoolAuto, icon:'🚗', auto:true, category:'Carpool' });

  // Auto: instalments
  const instPlans = loadInst ? loadInst() : [];
  instPlans.forEach(function(plan){
    if(plan.monthToMonth){
      allExpenses.push({ label:plan.desc, amount:plan.amt, icon:'💳', auto:true, category:'Instalments' });
    } else {
      const dueThisMonth = (plan.dates||[]).some(function(ds){ return ds.startsWith(mk); });
      if(dueThisMonth) allExpenses.push({ label:plan.desc, amount:plan.amt, icon:'💳', auto:true, category:'Instalments' });
    }
  });

  // Auto: savings
  funds.forEach(function(f){
    if(f.isExpense) return;
    const deposited = (f.deposits||[]).filter(function(d){ return d.date&&d.date.startsWith(mk)&&d.txnType!=='out'; }).reduce(function(s,d){ return s+d.amount; },0);
    if(deposited > 0) allExpenses.push({ label:f.emoji+' '+f.name, amount:deposited, icon:'💰', auto:true, category:'Savings' });
  });

  // Auto: car
  const carFund = funds.find(function(f){ return f.isExpense; });
  if(carFund){
    const carSpent = (carFund.deposits||[]).filter(function(d){ return d.txnType==='out'&&d.date&&d.date.startsWith(mk); }).reduce(function(s,d){ return s+d.amount; },0);
    if(carSpent > 0) allExpenses.push({ label:'Car Expenses', amount:carSpent, icon:'🔧', auto:true, category:'Cars' });
  }

  const totalIncome   = allIncome.reduce(function(s,e){ return s+e.amount; },0);
  const totalExpenses = allExpenses.reduce(function(s,e){ return s+e.amount; },0);
  return { income: allIncome, expenses: allExpenses, totalIncome, totalExpenses, net: totalIncome - totalExpenses };
}

function cfMonthKeyFromDate(y, m){
  return y + '-' + String(m+1).padStart(2,'0');
}

function exportCFMonthReport(){
  const mk = cfKey();
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const label = MONTH_NAMES[cfMonth] + ' ' + cfYear;
  const d = buildCFMonthData(mk);
  if(typeof window.jspdf === 'undefined'){
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = function(){ buildCFPDF([{ mk:mk, label:label, data:d }], label); };
    document.head.appendChild(s);
  } else {
    buildCFPDF([{ mk:mk, label:label, data:d }], label);
  }
}

function exportCFRangeReport(){
  const fromVal = document.getElementById('cfRptFrom').value;
  const toVal   = document.getElementById('cfRptTo').value;
  if(!fromVal || !toVal){ alert('Please select both a From and To month.'); return; }
  if(fromVal > toVal){ alert('From month must be before or equal to To month.'); return; }
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const months = [];
  let parts = fromVal.split('-').map(Number);
  let fy = parts[0], fm = parts[1] - 1;
  const tparts = toVal.split('-').map(Number);
  const ty = tparts[0], tm = tparts[1] - 1;
  while(fy < ty || (fy === ty && fm <= tm)){
    const mk = cfMonthKeyFromDate(fy, fm);
    const label = MONTH_NAMES[fm] + ' ' + fy;
    months.push({ mk:mk, label:label, data:buildCFMonthData(mk) });
    fm++;
    if(fm > 11){ fm = 0; fy++; }
  }
  const rangeLabel = MONTH_NAMES[parseInt(fromVal.split('-')[1])-1] + ' ' + fromVal.split('-')[0]
    + ' to ' + MONTH_NAMES[parseInt(toVal.split('-')[1])-1] + ' ' + toVal.split('-')[0];
  if(typeof window.jspdf === 'undefined'){
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = function(){ buildCFPDF(months, rangeLabel); };
    document.head.appendChild(s);
  } else {
    buildCFPDF(months, rangeLabel);
  }
}


function stripEmojiCF(str){
  if(!str) return '';
  return str.replace(/[^\x20-\x7E]/g, '').replace(/\s+/g,' ').trim();
}
function buildCFPDF(months, titleLabel){
  var toast = document.createElement('div');
  toast.id = 'cfPdfToast';
  toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1a1a1a;border:1px solid #3a5a00;border-radius:10px;padding:14px 20px;display:flex;align-items:center;gap:12px;z-index:9999;box-shadow:0 4px 24px rgba(0,0,0,.5);min-width:240px;';
  toast.innerHTML = '<div style="width:18px;height:18px;border:2px solid #3a5a00;border-top-color:#c8f230;border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0;"></div>'
    +'<div><div style="font-family:Syne,sans-serif;font-weight:700;font-size:13px;color:#efefef;">Generating PDF...</div>'
    +'<div style="font-size:10px;color:#555;margin-top:2px;letter-spacing:1px;">Cash Flow Report</div></div>';
  if(!document.getElementById('spinStyle')){
    var sp=document.createElement('style');sp.id='spinStyle';
    sp.textContent='@keyframes spin{to{transform:rotate(360deg);}}';
    document.head.appendChild(sp);
  }
  document.body.appendChild(toast);
  setTimeout(function(){
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit:'mm', format:'a4' });
    var W=210, H=297, margin=16, y=0;
    function bg(){ doc.setFillColor(10,10,10); doc.rect(0,0,W,H,'F'); doc.setFillColor(200,242,48); doc.rect(0,0,W,1.5,'F'); }
    function newPage(){ doc.addPage(); bg(); y=16; }
    bg();
    // Header
    y=13;
    doc.setTextColor(90,136,0); doc.setFontSize(7); doc.setFont('helvetica','normal');
    doc.text('CASH FLOW REPORT', margin, y);
    doc.text(new Date().toLocaleDateString('en-ZA'), W-margin, y, {align:'right'});
    y=24;
    doc.setTextColor(200,242,48); doc.setFontSize(22); doc.setFont('helvetica','bold');
    doc.text('Cash Flow', margin, y);
    y=31;
    doc.setTextColor(85,85,85); doc.setFontSize(9); doc.setFont('helvetica','normal');
    doc.text(titleLabel, margin, y);
    y=37;
    doc.setDrawColor(42,42,42); doc.setLineWidth(0.3); doc.line(margin,y,W-margin,y);
    y+=8;
    // Summary heading
    doc.setTextColor(90,136,0); doc.setFontSize(7); doc.setFont('helvetica','normal');
    doc.text('SUMMARY', margin, y); y+=5;
    // Table header
    var c={month:margin, income:90, expenses:132, net:172};
    doc.setFillColor(20,30,0); doc.rect(margin,y-3.5,W-(margin*2),6,'F');
    doc.setTextColor(90,136,0); doc.setFontSize(7);
    doc.text('MONTH',    c.month,    y);
    doc.text('INCOME',   c.income,   y);
    doc.text('EXPENSES', c.expenses, y);
    doc.text('NET',       c.net,      y);
    y+=7;
    var grandIn=0, grandEx=0;
    months.forEach(function(m,i){
      if(y>H-20) newPage();
      doc.setFillColor(i%2===0?14:17,i%2===0?14:17,i%2===0?14:17);
      doc.rect(margin,y-3.5,W-(margin*2),6,'F');
      doc.setTextColor(190,190,190); doc.setFontSize(8); doc.setFont('helvetica','normal');
      doc.text(m.label, c.month, y);
      doc.text('R'+m.data.totalIncome.toFixed(2), c.income, y);
      doc.text('R'+m.data.totalExpenses.toFixed(2), c.expenses, y);
      var nc = m.data.net>=0?[200,242,48]:[242,48,96];
      doc.setTextColor(nc[0],nc[1],nc[2]);
      doc.text((m.data.net>=0?'+ ':'-  ')+'R'+Math.abs(m.data.net).toFixed(2), c.net, y);
      grandIn+=m.data.totalIncome; grandEx+=m.data.totalExpenses;
      y+=6;
    });
    if(months.length>1){
      if(y>H-20) newPage();
      var gNet=grandIn-grandEx, gc=gNet>=0?[200,242,48]:[242,48,96];
      doc.setFillColor(20,40,0); doc.rect(margin,y-3.5,W-(margin*2),6,'F');
      doc.setTextColor(200,242,48); doc.setFontSize(8); doc.setFont('helvetica','bold');
      doc.text('TOTAL', c.month, y);
      doc.text('R'+grandIn.toFixed(2), c.income, y);
      doc.text('R'+grandEx.toFixed(2), c.expenses, y);
      doc.setTextColor(gc[0],gc[1],gc[2]);
      doc.text((gNet>=0?'+ ':'-  ')+'R'+Math.abs(gNet).toFixed(2), c.net, y);
      y+=10;
    } else { y+=4; }
    // Detail per month
    months.forEach(function(m){
      if(y>H-40) newPage();
      doc.setDrawColor(42,42,42); doc.setLineWidth(0.3); doc.line(margin,y,W-margin,y); y+=6;
      doc.setTextColor(200,242,48); doc.setFontSize(10); doc.setFont('helvetica','bold');
      doc.text(m.label, margin, y); y+=5;
      // Net pill
      var nc=m.data.net>=0?[200,242,48]:[242,48,96];
      doc.setTextColor(nc[0],nc[1],nc[2]); doc.setFontSize(8); doc.setFont('helvetica','bold');
      doc.text('Net: '+(m.data.net>=0?'+ ':'-  ')+'R'+Math.abs(m.data.net).toFixed(2), margin, y); y+=8;
      // Income
      if(m.data.income.length>0){
        if(y>H-20) newPage();
        doc.setTextColor(90,136,0); doc.setFontSize(7); doc.setFont('helvetica','normal');
        doc.text('INCOME', margin, y); y+=5;
        m.data.income.forEach(function(e){
          if(y>H-14) newPage();
          doc.setFillColor(10,20,0); doc.rect(margin,y-3.5,W-(margin*2),6,'F');
          doc.setTextColor(180,180,180); doc.setFontSize(8); doc.setFont('helvetica','normal');
          doc.text(stripEmojiCF(e.label||'Income').substring(0,40), margin+2, y);
          doc.setTextColor(200,242,48); doc.setFont('helvetica','bold');
          doc.text('+ R'+e.amount.toFixed(2), W-margin, y, {align:'right'});
          var iSub = [stripEmojiCF(e.account||e.category||'').substring(0,25), e.date||''].filter(Boolean).join('  .  ');
          if(iSub){ doc.setTextColor(58,90,0); doc.setFontSize(6); doc.setFont('helvetica','normal'); doc.text(iSub, margin+2, y+3); }
          y+=7;
        });
        doc.setTextColor(90,136,0); doc.setFontSize(7); doc.setFont('helvetica','normal');
        doc.text('Total Income: R'+m.data.totalIncome.toFixed(2), W-margin, y, {align:'right'}); y+=8;
      }
      // Split expenses
      var PDF_SAV_SRC=['savings_deposit','car_add','maint','custommaint','car_service_save','savings'];
      var pdfRealExp = m.data.expenses.filter(function(e){ return !e.sourceType||PDF_SAV_SRC.indexOf(e.sourceType)===-1; });
      var pdfSavAlloc = m.data.expenses.filter(function(e){ return e.sourceType&&PDF_SAV_SRC.indexOf(e.sourceType)>-1; });
      var pdfRealTotal = pdfRealExp.reduce(function(s,e){ return s+e.amount; },0);
      var pdfSavTotal  = pdfSavAlloc.reduce(function(s,e){ return s+e.amount; },0);

      // Real Expenses
      if(pdfRealExp.length>0){
        if(y>H-20) newPage();
        doc.setTextColor(90,26,26); doc.setFontSize(7); doc.setFont('helvetica','normal');
        doc.text('EXPENSES', margin, y); y+=5;
        pdfRealExp.forEach(function(e){
          if(y>H-14) newPage();
          doc.setFillColor(20,5,5); doc.rect(margin,y-3.5,W-(margin*2),6,'F');
          doc.setTextColor(180,180,180); doc.setFontSize(8); doc.setFont('helvetica','normal');
          doc.text(stripEmojiCF(e.label||'Expense').substring(0,40), margin+2, y);
          doc.setTextColor(242,48,96); doc.setFont('helvetica','bold');
          doc.text('- R'+e.amount.toFixed(2), W-margin, y, {align:'right'});
          var eSub = [stripEmojiCF(e.account||e.category||'').substring(0,25), e.date||''].filter(Boolean).join('  .  ');
          if(eSub){ doc.setTextColor(90,26,26); doc.setFontSize(6); doc.setFont('helvetica','normal'); doc.text(eSub, margin+2, y+3); }
          y+=7;
        });
        doc.setTextColor(90,26,26); doc.setFontSize(7); doc.setFont('helvetica','normal');
        doc.text('Total Expenses: R'+pdfRealTotal.toFixed(2), W-margin, y, {align:'right'}); y+=8;
      }

      // Savings Allocations
      if(pdfSavAlloc.length>0){
        if(y>H-20) newPage();
        doc.setTextColor(58,90,0); doc.setFontSize(7); doc.setFont('helvetica','normal');
        doc.text('SAVINGS ALLOCATIONS (Still Yours)', margin, y); y+=5;
        pdfSavAlloc.forEach(function(e){
          if(y>H-14) newPage();
          doc.setFillColor(10,20,0); doc.rect(margin,y-3.5,W-(margin*2),6,'F');
          doc.setTextColor(180,180,180); doc.setFontSize(8); doc.setFont('helvetica','normal');
          doc.text(stripEmojiCF(e.label||'Savings').substring(0,40), margin+2, y);
          doc.setTextColor(200,242,48); doc.setFont('helvetica','bold');
          doc.text('> R'+e.amount.toFixed(2), W-margin, y, {align:'right'});
          var sSub = [stripEmojiCF(e.account||e.sourceCardName||'').substring(0,25), e.date||''].filter(Boolean).join('  .  ');
          if(sSub){ doc.setTextColor(58,90,0); doc.setFontSize(6); doc.setFont('helvetica','normal'); doc.text(sSub, margin+2, y+3); }
          y+=7;
        });
        doc.setTextColor(58,90,0); doc.setFontSize(7); doc.setFont('helvetica','normal');
        doc.text('Total Saved: R'+pdfSavTotal.toFixed(2), W-margin, y, {align:'right'}); y+=10;
      }
    });
    // Footer
    doc.setTextColor(42,42,42); doc.setFontSize(7); doc.setFont('helvetica','normal');
    doc.text('Generated by YB Dashboard', margin, H-8);
    doc.text(new Date().toLocaleString('en-ZA'), W-margin, H-8, {align:'right'});
    var fname = 'CashFlow_'+titleLabel.replace(/[^a-zA-Z0-9]/g,'_')+'.pdf';
    doc.save(fname);
    var t=document.getElementById('cfPdfToast'); if(t) t.remove();
  }, 100);
}

function initCFReportPickers(){
  var now = new Date();
  var thisMonth = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  var sixMonthsAgo = new Date(now.getFullYear(), now.getMonth()-5, 1);
  var fromMonth = sixMonthsAgo.getFullYear()+'-'+String(sixMonthsAgo.getMonth()+1).padStart(2,'0');
  var fromEl = document.getElementById('cfRptFrom');
  var toEl   = document.getElementById('cfRptTo');
  if(fromEl && !fromEl.value) fromEl.value = fromMonth;
  if(toEl   && !toEl.value)   toEl.value   = thisMonth;
}

function exportBIStarSchema(){
  const btn = event.target.closest('button');
  if(btn){ btn.textContent = '⏳ Building…'; btn.disabled = true; }

  setTimeout(function(){
    try {
      const now = new Date();
      const exportDate = localDateStr(now);

      // ── FACT TABLE 1: fact_trips ──
      // One row per passenger per day (trip-level grain)
      let factTrips = 'trip_id,date,year,month,month_name,week_of_year,day_of_week,passenger,amount,paid,paid_flag\n';
      const MONTH_NAMES_BI = ['January','February','March','April','May','June','July','August','September','October','November','December'];

      Object.keys(cpData).sort().forEach(function(mk){
        const yr = mk.slice(0,4);
        const mo = parseInt(mk.slice(5,7));
        Object.keys(cpData[mk]).sort().forEach(function(ds){
          const dd = cpData[mk][ds];
          if(typeof dd !== 'object') return;
          const dObj = new Date(ds+'T00:00:00');
          const dow = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dObj.getDay()];
          // Week of year
          const startOfYear = new Date(dObj.getFullYear(), 0, 1);
          const woy = Math.ceil(((dObj - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);

          PASSENGERS.forEach(function(p){
            const v = dd[p] && typeof dd[p]==='object' ? dd[p] : null;
            if(!v || v.amt === 0) return;
            const tripId = ds.replace(/-/g,'') + '_' + p.replace(/\s/g,'');
            factTrips += [
              tripId, ds, yr, mo, MONTH_NAMES_BI[mo-1], woy, dow,
              p, v.amt, v.paid ? 'TRUE' : 'FALSE', v.paid ? 1 : 0
            ].join(',') + '\n';
          });
        });
      });

      // ── FACT TABLE 2: fact_deposits ──
      // One row per savings deposit
      let factDeposits = 'deposit_id,date,year,month,month_name,fund_id,fund_name,fund_emoji,amount,direction,note,goal,goal_progress_pct\n';
      funds.forEach(function(f){
        const fundId = f.id.slice(0,8);
        (f.deposits||[]).forEach(function(d){
          if(!d.date) return;
          const mo = parseInt(d.date.slice(5,7));
          const yr = d.date.slice(0,4);
          const dir = d.txnType === 'out' ? 'OUT' : 'IN';
          const currentTotal = fundTotal(f);
          const goalPct = f.goal > 0 ? (currentTotal/f.goal*100).toFixed(1) : '';
          factDeposits += [
            d.id ? d.id.slice(0,8) : fundId+'_'+d.date,
            d.date, yr, mo, MONTH_NAMES_BI[mo-1],
            fundId,
            '"'+f.name.replace(/"/g,"'")+'"',
            f.emoji,
            d.amount, dir,
            '"'+(d.note||'').replace(/"/g,"'")+'"',
            f.goal||'',
            goalPct
          ].join(',') + '\n';
        });
      });

      // ── FACT TABLE 3: fact_contributions ──
      // One row per maintenance contribution (original + custom cards)
      let factContribs = 'contrib_id,date,year,month,month_name,card_id,card_name,card_type,contributor,amount,note,monthly_target\n';

      // Original maintenance card
      getMaintData().forEach(function(e){
        if(!e.date) return;
        const mo = parseInt(e.date.slice(5,7));
        const yr = e.date.slice(0,4);
        factContribs += [
          e.id ? e.id.slice(0,8) : 'maint_'+e.date,
          e.date, yr, mo, MONTH_NAMES_BI[mo-1],
          'maint_original', '"Maintenance Fund"', 'original',
          e.person||'', e.amount||0,
          '"'+(e.note||'').replace(/"/g,"'")+'"',
          1500
        ].join(',') + '\n';
      });

      // Custom maintenance cards
      loadCustomMaintCards().forEach(function(card){
        const cardId = card.id.slice(0,8);
        (card.entries||[]).forEach(function(e){
          if(!e.date) return;
          const mo = parseInt(e.date.slice(5,7));
          const yr = e.date.slice(0,4);
          // Resolve contributor name from ID if available
          const contrib = (card.contributors||[]).find(function(c){
            return (typeof c==='object' ? c.id : c) === (e.personId || e.person);
          });
          const contribName = contrib ? (typeof contrib==='object' ? contrib.name : contrib) : (e.person||'');
          factContribs += [
            e.id ? e.id.slice(0,8) : cardId+'_'+e.date,
            e.date, yr, mo, MONTH_NAMES_BI[mo-1],
            cardId, '"'+card.name.replace(/"/g,"'")+'"', 'custom',
            contribName, e.amount||0,
            '"'+(e.note||'').replace(/"/g,"'")+'"',
            card.target||0
          ].join(',') + '\n';
        });
      });

      // ── Download all 3 CSVs ──
      function downloadCSV(content, filename){
        const blob = new Blob([content], {type:'text/csv;charset=utf-8;'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function(){ URL.revokeObjectURL(a.href); }, 3000);
      }

      downloadCSV(factTrips,   'fact_trips_'+exportDate+'.csv');
      setTimeout(function(){ downloadCSV(factDeposits, 'fact_deposits_'+exportDate+'.csv'); }, 400);
      setTimeout(function(){ downloadCSV(factContribs, 'fact_contributions_'+exportDate+'.csv'); }, 800);

      if(btn){ setTimeout(function(){ btn.innerHTML = '<span>🧊</span> Export Star Schema (3 CSVs)'; btn.disabled = false; }, 1200); }

    } catch(err){
      console.error('BI export error:', err);
      if(btn){ btn.innerHTML = '<span>🧊</span> Export Star Schema (3 CSVs)'; btn.disabled = false; }
      alert('Export failed: ' + err.message);
    }
  }, 50);
}

function exportReport(type){
  let csv='';
  const now=new Date().toLocaleDateString('en-ZA');

  if(type==='savings'||type==='all'){
    csv+='SAVINGS REPORT\n';
    csv+='Fund,Saved,Goal,Progress\n';
    funds.forEach(function(f){
      const t=fundTotal(f);
      csv+=f.name+','+t+','+f.goal+','+(t/f.goal*100).toFixed(1)+'%\n';
    });
    csv+='\n';
  }

  if(type==='carpool'||type==='all'){
    csv+='CARPOOL INCOME REPORT\n';
    const pNames = PASSENGERS.slice();
    csv+='Date,'+pNames.map(function(p){ return p+','+p+' Paid'; }).join(',')+',Day Total\n';
    Object.keys(cpData).sort().forEach(function(mk){
      Object.keys(cpData[mk]).sort().forEach(function(ds){
        const dd=cpData[mk][ds];
        if(typeof dd!=='object') return;
        let total=0;
        const cols=pNames.map(function(p){
          const v=dd[p]&&typeof dd[p]==='object'?dd[p]:{amt:0,paid:false};
          total+=v.amt||0;
          return (v.amt||0)+','+(v.paid?'Yes':'No');
        });
        if(total>0) csv+=ds+','+cols.join(',')+','+total+'\n';
      });
    });
    csv+='\n';
  }

  if(type==='car'||type==='all'){
    csv+='CAR EXPENSE REPORT\n';
    csv+='Date,Description,Amount\n';
    const carFundExp=funds.find(function(f){return f.isExpense;});
    if(carFundExp){
      carFundExp.deposits.filter(function(d){return d.txnType==='out';}).sort(function(a,b){return new Date(a.date)-new Date(b.date);}).forEach(function(d){
        csv+=d.date+','+(d.note||'').replace(/,/g,' ')+','+d.amount+'\n';
      });
    }
    csv+='\n';
  }

  const blob=new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='MyDashboard_Report_'+now.replace(/\//g,'-')+'.csv';
  a.click();
}

// QUICK ENTRY
let qeDate = new Date();
// QE_PASSENGERS is now dynamic — always reads from live PASSENGER_DATA
function getQEPassengers(){ return PASSENGER_DATA; }

function openQuickEntry(){
  // Always open on today's actual date
  const now = new Date();
  qeDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  renderQE();
  document.getElementById('qeOverlay').classList.add('active');
}

function closeQuickEntry(){ document.getElementById('qeOverlay').classList.remove('active'); }

function qeChangeDay(dir){
  // Step once, then keep stepping in same direction until we land on a weekday
  do { qeDate.setDate(qeDate.getDate()+dir); }
  while(qeDate.getDay()===0||qeDate.getDay()===6);
  renderQE();
}

function renderQE(){
  const ds = localDateStr(qeDate);
  const mk = ds.slice(0,7);
  document.getElementById('qeDateLabel').textContent = qeDate.toLocaleDateString('en-ZA',{weekday:'long',day:'2-digit',month:'short'});
  document.getElementById('qeWeekLabel').textContent = qeDate.toLocaleDateString('en-ZA',{month:'long',year:'numeric'});

  const existing = (cpData[mk]&&cpData[mk][ds]) ? cpData[mk][ds] : null;
  const container = document.getElementById('qePassengers');
  container.innerHTML = '';

  getQEPassengers().forEach(function(pObj){
    const p = pObj.name;
    const defAmt = pObj.defaultAmt || 44;
    const halfAmt = Math.round(defAmt / 2);
    const curAmt = existing&&existing[p]&&typeof existing[p]==='object' ? existing[p].amt||0 : 0;
    const curPaid = existing&&existing[p]&&typeof existing[p]==='object' ? existing[p].paid||false : false;
    const tagClass = curAmt===0 ? 'tag-absent' : curPaid ? 'tag-paid' : 'tag-owing';
    const tagText = curAmt===0 ? 'Absent' : (curPaid?'R'+curAmt+' paid':'R'+curAmt+' owing');

    const card = document.createElement('div');
    card.className = 'pass-card';
    card.id = 'qe-card-'+p;
    card.innerHTML = '<div class="pass-card-hdr"><span class="pass-card-name">'+p+'</span><span class="pass-tag '+tagClass+'" id="qe-tag-'+p+'">'+tagText+'</span></div>'
      +'<div class="pass-card-body">'
      +'<div class="preset-row">'
      +'<button class="qe-preset'+(curAmt===defAmt?' sel':'')+'" data-p="'+p+'" data-v="'+defAmt+'" onclick="qeSetAmt(this)">R'+defAmt+'</button>'
      +'<button class="qe-preset'+(curAmt===halfAmt?' sel':'')+'" data-p="'+p+'" data-v="'+halfAmt+'" onclick="qeSetAmt(this)">R'+halfAmt+'</button>'
      +'<button class="qe-preset'+(curAmt===0&&existing&&existing[p]?' sel':'')+'" data-p="'+p+'" data-v="0" onclick="qeSetAmt(this)">R0</button>'
      +'<button class="qe-preset abs'+((!existing||!existing[p])?' abs':'')+'" data-p="'+p+'" data-v="-1" onclick="qeSetAmt(this)">Absent</button>'
      +'</div>'
      +'<div class="paid-row"><div class="paid-tog'+(curPaid?' on':'')+'" id="qe-tog-'+p+'" data-p="'+p+'" onclick="qeTogglePaid(this)"></div>'
      +'<span class="paid-lbl'+(curPaid?' on':'')+'" id="qe-plbl-'+p+'">'+(curPaid?'Paid ✓':'Not paid')+'</span></div>'
      +'</div>';
    card.dataset.amt = curAmt;
    card.dataset.paid = curPaid;
    container.appendChild(card);
  });
  qeUpdateTotal();
}

function qeSetAmt(btn){
  const p=btn.getAttribute('data-p');
  const val=parseFloat(btn.getAttribute('data-v'));
  const card=document.getElementById('qe-card-'+p);
  card.dataset.amt=val<0?'':val;
  card.querySelectorAll('.qe-preset').forEach(function(b){b.classList.remove('sel','abs');});
  if(val<0)btn.classList.add('abs');else btn.classList.add('sel');
  qeUpdateTag(p);qeUpdateTotal();
}

function qeTogglePaid(tog){
  const p=tog.getAttribute('data-p');
  const lbl=document.getElementById('qe-plbl-'+p);
  const card=document.getElementById('qe-card-'+p);
  tog.classList.toggle('on');
  const on=tog.classList.contains('on');
  lbl.textContent=on?'Paid ✓':'Not paid';
  lbl.className='paid-lbl'+(on?' on':'');
  card.dataset.paid=on;
  qeUpdateTag(p);
}

function qeUpdateTag(p){
  const card = document.getElementById('qe-card-'+p);
  const amt = parseFloat(card.dataset.amt);
  const paid = card.dataset.paid === 'true';
  const tag = document.getElementById('qe-tag-'+p);
  if(isNaN(amt)||card.dataset.amt===''){tag.textContent='Absent';tag.className='pass-tag tag-absent';}
  else if(paid){tag.textContent='R'+amt+' paid';tag.className='pass-tag tag-paid';}
  else{tag.textContent='R'+amt+' owing';tag.className='pass-tag tag-owing';}
}

function qeUpdateTotal(){
  let total = 0;
  getQEPassengers().forEach(function(pObj){
    const card = document.getElementById('qe-card-'+pObj.name);
    if(card){ const v=parseFloat(card.dataset.amt)||0; total+=v; }
  });
  document.getElementById('qeDayTotal').textContent = fmtR(total);
}

function saveQuickEntry(){
  const ds = localDateStr(qeDate);
  const mk = ds.slice(0,7);
  if(!cpData[mk]) cpData[mk]={};
  if(!cpData[mk][ds]){
    const dayObj={notes:''};
    PASSENGER_DATA.forEach(function(p){ dayObj[p.name]={amt:0,paid:false}; });
    cpData[mk][ds]=dayObj;
  }
  getQEPassengers().forEach(function(pObj){
    const p = pObj.name;
    const card = document.getElementById('qe-card-'+p);
    if(!card) return;
    const amt = card.dataset.amt==='' ? 0 : parseFloat(card.dataset.amt)||0;
    const paid = card.dataset.paid==='true';
    cpData[mk][ds][p] = {amt:amt, paid:paid};
  });
  saveCP();
  renderCarpool();
  closeQuickEntry();
}

// LOCAL DATE HELPER — always uses SA (local) time, never UTC
function localDateStr(d){
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,'0');
  const day=String(d.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+day;
}
function localDateTimeStr(d){
  const date=localDateStr(d);
  const hh=String(d.getHours()).padStart(2,'0');
  const mm=String(d.getMinutes()).padStart(2,'0');
  return date+'_'+hh+'-'+mm;
}

// ══ SETTINGS ══
function openSettings(){
  document.getElementById('restoreStatus').textContent='';
  document.getElementById('pinChangeStatus').textContent='';
  document.getElementById('pinNew').value='';
  document.getElementById('pinConfirm').value='';
  document.getElementById('passPinStatus') && (document.getElementById('passPinStatus').textContent='');
  renderPassengerRows();
  renderLoginUserRows();
  // Biometric status
  const bioStatus = document.getElementById('biometricSettingsStatus');
  const bioBtn = document.getElementById('biometricSettingsBtn');
  if(bioStatus && bioBtn){
    const registered = lsGet(BIOMETRIC_KEY) === 'true';
    const supported = biometricSupported();
    if(!supported){
      bioStatus.textContent = 'Not supported on this browser/device.';
      bioBtn.innerHTML = '';
    } else if(registered){
      bioStatus.textContent = 'Fingerprint is registered and active.';
      bioBtn.innerHTML = '<button onclick="removeBiometric()" style="width:100%;padding:10px;background:#1a0a0a;border:1px solid #3a1010;border-radius:6px;color:#f23060;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;font-weight:700;" onmouseover="this.style.opacity=\'.8\'" onmouseout="this.style.opacity=\'1\'">🗑 Remove Fingerprint</button>';
    } else {
      bioStatus.textContent = 'Not set up yet. Register your fingerprint to skip the PIN.';
      bioBtn.innerHTML = '<button onclick="confirmBiometricSetup(this.closest(\'[style]\'))" style="width:100%;padding:10px;background:#1a2e00;border:1px solid #3a5a00;border-radius:6px;color:#c8f230;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;font-weight:700;" onmouseover="this.style.opacity=\'.8\'" onmouseout="this.style.opacity=\'1\'">👆 Register Fingerprint</button>';
    }
  }
  document.getElementById('settingsModal').classList.add('active');
}

function renderPassPinRows(){
  const container = document.getElementById('passPinRows');
  if(!container) return;
  const passengers = Object.entries(PINS).filter(function(e){ return e[1].role==='user' || e[1].role==='carservice'; });
  container.innerHTML = passengers.map(function(entry){
    const pin = entry[0];
    const user = entry[1];
    const id = 'pinval_' + pin;
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#0d1a10;border:1px solid #1a4028;border-radius:4px;">'
      + '<span style="font-family:\'DM Mono\',monospace;font-size:11px;color:#efefef;letter-spacing:1px;">'+user.name+'</span>'
      + '<span style="display:flex;align-items:center;gap:8px;">'
      + '<span id="'+id+'" data-pin="'+pin+'" style="font-family:\'DM Mono\',monospace;font-size:14px;color:#c8f230;letter-spacing:4px;">••••</span>'
      + '<button onclick="(function(el,btn){if(el.textContent===\'••••\'){el.textContent=el.dataset.pin;btn.textContent=\'Hide\';}else{el.textContent=\'••••\';btn.textContent=\'Show\';}})(document.getElementById(\''+id+'\'),this)" style="background:none;border:1px solid #2a2a2a;border-radius:4px;padding:2px 7px;color:#888;font-family:\'DM Mono\',monospace;font-size:9px;letter-spacing:1px;cursor:pointer;">Show</button>'
      + '</span>'
      + '</div>';
  }).join('');
}

// ══ PASSENGER MANAGEMENT UI ══
var pmSelColor = '#c8f230';

function renderPassengerRows(){
  const container = document.getElementById('passengerRows');
  if(!container) return;
  const list = loadPassengers();
  if(!list.length){
    container.innerHTML = '<div style="font-size:11px;color:#333;padding:4px 0;">No passengers yet.</div>';
    return;
  }
  container.innerHTML = list.map(function(p){
    return '<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#0d1a10;border:1px solid #1a4028;border-radius:6px;">'
      +'<span style="width:10px;height:10px;border-radius:50%;background:'+p.color+';flex-shrink:0;display:inline-block;"></span>'
      +'<span style="flex:1;font-family:\'DM Mono\',monospace;font-size:12px;color:#efefef;">'+p.name+'</span>'
      +'<span style="font-size:10px;color:#555;letter-spacing:1px;">R'+( p.defaultAmt||44)+'/trip</span>'
      +'<button onclick="editPassenger(\''+p.id+'\')" style="background:none;border:1px solid #2a2a2a;border-radius:4px;padding:3px 8px;color:#888;font-family:\'DM Mono\',monospace;font-size:9px;letter-spacing:1px;cursor:pointer;" onmouseover="this.style.borderColor=\'#555\'" onmouseout="this.style.borderColor=\'#2a2a2a\'">Edit</button>'
      +'<button onclick="deletePassenger(\''+p.id+'\')" style="background:none;border:1px solid #2a1a1a;border-radius:4px;padding:3px 8px;color:#555;font-family:\'DM Mono\',monospace;font-size:9px;letter-spacing:1px;cursor:pointer;" onmouseover="this.style.borderColor=\'#c0392b\';this.style.color=\'#c0392b\'" onmouseout="this.style.borderColor=\'#2a1a1a\';this.style.color=\'#555\'">✕</button>'
    +'</div>';
  }).join('');
}

function buildPmColorGrid(){
  const g = document.getElementById('pmColorGrid');
  if(!g) return;
  g.innerHTML = '';
  PASSENGER_COLORS.forEach(function(c){
    const b = document.createElement('button');
    b.type = 'button';
    b.style.cssText = 'width:24px;height:24px;border-radius:50%;background:'+c+';border:'+(c===pmSelColor?'3px solid #fff':'2px solid transparent')+';cursor:pointer;transition:border .15s;';
    b.onclick = function(){ pmSelColor = c; buildPmColorGrid(); };
    g.appendChild(b);
  });
}

function addPassenger(){
  pmSelColor = PASSENGER_COLORS[loadPassengers().length % PASSENGER_COLORS.length];
  document.getElementById('passengerModalTitle').textContent = '🚗 Add Passenger';
  document.getElementById('pmName').value = '';
  document.getElementById('pmAmt').value = '44';
  document.getElementById('pmEditId').value = '';
  buildPmColorGrid();
  document.getElementById('passengerModal').classList.add('active');
}

function editPassenger(id){
  const list = loadPassengers();
  const p = list.find(function(x){ return x.id === id; });
  if(!p) return;
  pmSelColor = p.color || '#c8f230';
  document.getElementById('passengerModalTitle').textContent = '✏️ Edit Passenger';
  document.getElementById('pmName').value = p.name;
  document.getElementById('pmAmt').value = p.defaultAmt || 44;
  document.getElementById('pmEditId').value = id;
  buildPmColorGrid();
  document.getElementById('passengerModal').classList.add('active');
}

function savePassenger(){
  const name = document.getElementById('pmName').value.trim();
  const amt = parseFloat(document.getElementById('pmAmt').value) || 44;
  const editId = document.getElementById('pmEditId').value;
  if(!name){ alert('Enter a passenger name.'); return; }

  const list = loadPassengers();
  if(editId){
    const idx = list.findIndex(function(p){ return p.id === editId; });
    if(idx > -1){
      const oldName = list[idx].name;
      list[idx].name = name;
      list[idx].defaultAmt = amt;
      list[idx].color = pmSelColor;
      // If name changed, migrate carpool data
      if(oldName !== name) migratePassengerName(oldName, name);
    }
  } else {
    // Check for duplicate
    if(list.find(function(p){ return p.name.toLowerCase() === name.toLowerCase(); })){
      alert('A passenger named "'+name+'" already exists.'); return;
    }
    list.push({ id: uid(), name, defaultAmt: amt, color: pmSelColor });
  }
  savePassengers(list);
  refreshPassengerGlobals();
  closeModal('passengerModal');
  renderPassengerRows();
  // Refresh statement pane passenger options
  renderPassOptList();
  showBackupReminder('Passenger list updated');
}

function deletePassenger(id){
  const list = loadPassengers();
  const p = list.find(function(x){ return x.id === id; });
  if(!p) return;
  if(!confirm('Remove '+p.name+' as a passenger? Their carpool history stays but they won\'t appear in new entries.')) return;
  const newList = list.filter(function(x){ return x.id !== id; });
  savePassengers(newList);
  refreshPassengerGlobals();
  renderPassengerRows();
  renderPassOptList();
}

function migratePassengerName(oldName, newName){
  // Migrate carpool data keys
  Object.keys(cpData).forEach(function(mk){
    Object.keys(cpData[mk]).forEach(function(ds){
      const day = cpData[mk][ds];
      if(day[oldName] !== undefined){
        day[newName] = day[oldName];
        delete day[oldName];
      }
    });
  });
  saveCP();
  // Migrate borrows
  try {
    const borrows = JSON.parse(lsGet(BORROW_KEY)||'{}');
    if(borrows[oldName]){
      borrows[newName] = borrows[oldName];
      delete borrows[oldName];
      lsSet(BORROW_KEY, JSON.stringify(borrows));
    }
  } catch(e){}
}

function renderPassOptList(){
  // Re-render the statement pane passenger checkboxes dynamically
  const container = document.querySelector('.pane-body .field:last-of-type > div');
  if(!container) return;
  container.innerHTML = PASSENGER_DATA.map(function(p){
    return '<div class="pass-opt selected" data-name="'+p.name+'" onclick="togglePassOpt(this)"><span>'+p.name+'</span><span class="chk">✓</span></div>';
  }).join('');
}

// ══ LOGIN USER MANAGEMENT ══
var lumSelRole = 'user';

function renderLoginUserRows(){
  const container = document.getElementById('loginUserRows');
  if(!container) return;
  const roleLabels = { admin:'Admin', user:'Passenger', carservice:'Car Service' };
  const roleColors = { admin:'#c8f230', user:'#7090f0', carservice:'#f2a830' };
  container.innerHTML = Object.entries(PINS).map(function(entry){
    const pin = entry[0];
    const user = entry[1];
    const isMe = user.name === currentUser;
    return '<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#0d1228;border:1px solid #1a2040;border-radius:6px;">'
      +'<span style="flex:1;font-family:\'DM Mono\',monospace;font-size:12px;color:#efefef;">'+user.name+(isMe?' <span style="font-size:9px;color:#555;">(you)</span>':'')+'</span>'
      +'<span style="font-size:9px;padding:2px 8px;border-radius:100px;background:#1a1a2e;color:'+(roleColors[user.role]||'#888')+';border:1px solid #2a2a4a;letter-spacing:1px;">'+( roleLabels[user.role]||user.role)+'</span>'
      +'<span style="font-family:\'DM Mono\',monospace;font-size:13px;color:#c8f230;letter-spacing:3px;">'+pin+'</span>'
      +'<button onclick="editLoginUser(\''+pin+'\')" style="background:none;border:1px solid #2a2a2a;border-radius:4px;padding:3px 8px;color:#888;font-family:\'DM Mono\',monospace;font-size:9px;letter-spacing:1px;cursor:pointer;">Edit</button>'
      +(!isMe ? '<button onclick="deleteLoginUser(\''+pin+'\')" style="background:none;border:1px solid #2a1a1a;border-radius:4px;padding:3px 8px;color:#555;font-family:\'DM Mono\',monospace;font-size:9px;letter-spacing:1px;cursor:pointer;" onmouseover="this.style.borderColor=\'#c0392b\';this.style.color=\'#c0392b\'" onmouseout="this.style.borderColor=\'#2a1a1a\';this.style.color=\'#555\'">✕</button>' : '')
    +'</div>';
  }).join('');
}

function setLumRole(role, btn){
  lumSelRole = role;
  document.getElementById('lumRole').value = role;
  ['user','admin','carservice'].forEach(function(r){
    const b = document.getElementById('lumRole'+r.charAt(0).toUpperCase()+r.slice(1));
    if(!b) return;
    if(r === role){
      b.style.borderColor = '#c8f230'; b.style.background = '#1a2e00'; b.style.color = '#c8f230';
    } else {
      b.style.borderColor = 'var(--border)'; b.style.background = 'none'; b.style.color = 'var(--muted)';
    }
  });
}

function addLoginUser(){
  lumSelRole = 'user';
  document.getElementById('loginUserModalTitle').textContent = '🔐 Add Login User';
  document.getElementById('lumName').value = '';
  document.getElementById('lumPin').value = '';
  document.getElementById('lumOldPin').value = '';
  document.getElementById('lumStatus').textContent = '';
  setLumRole('user', null);
  document.getElementById('loginUserModal').classList.add('active');
}

function editLoginUser(pin){
  const user = PINS[pin];
  if(!user) return;
  lumSelRole = user.role;
  document.getElementById('loginUserModalTitle').textContent = '✏️ Edit Login User';
  document.getElementById('lumName').value = user.name;
  document.getElementById('lumPin').value = pin;
  document.getElementById('lumOldPin').value = pin;
  document.getElementById('lumStatus').textContent = '';
  setLumRole(user.role, null);
  document.getElementById('loginUserModal').classList.add('active');
}

function saveLoginUser(){
  const name = document.getElementById('lumName').value.trim();
  const pin = document.getElementById('lumPin').value.trim();
  const oldPin = document.getElementById('lumOldPin').value.trim();
  const role = document.getElementById('lumRole').value || 'user';
  const status = document.getElementById('lumStatus');

  if(!name){ status.style.color='#f23060'; status.textContent='Enter a name.'; return; }
  if(!/^\d{4}$/.test(pin)){ status.style.color='#f23060'; status.textContent='PIN must be exactly 4 digits.'; return; }
  if(PINS[pin] && pin !== oldPin){
    status.style.color='#f23060'; status.textContent='That PIN is already used by '+PINS[pin].name+'.'; return;
  }
  if(oldPin && oldPin !== pin) delete PINS[oldPin];
  PINS[pin] = { role, name };
  savePINS(PINS);
  closeModal('loginUserModal');
  renderLoginUserRows();
  showBackupReminder('Login users updated');
}

function deleteLoginUser(pin){
  const user = PINS[pin];
  if(!user) return;
  if(user.name === currentUser){ alert('You can\'t delete your own login.'); return; }
  if(!confirm('Remove login access for '+user.name+'? Their data stays, they just can\'t log in.')) return;
  delete PINS[pin];
  savePINS(PINS);
  renderLoginUserRows();
}

// ══ CASH FLOW ══
var cfYear = new Date().getFullYear();
var cfMonth = new Date().getMonth();
var cfSelIcon = '💰';
var cfRecur = true;

const CF_ICONS = ['💰','💵','👔','📱','🚗','👰','👶','🏠','🎓','🍔','💳','🔧','✈️','🛒','💊','🎯','📦','💸','🤝','🏋️'];

function loadCFData(){ try{ return JSON.parse(lsGet(CF_KEY)||'{}'); }catch(e){ return {}; } }
function saveCFData(d){ lsSet(CF_KEY, JSON.stringify(d)); }

function cfKey(){ return cfYear+'-'+String(cfMonth+1).padStart(2,'0'); }

function cfChangeMonth(dir){
  cfMonth += dir;
  if(cfMonth > 11){ cfMonth=0; cfYear++; }
  if(cfMonth < 0){ cfMonth=11; cfYear--; }
  const now = new Date();
  if(cfYear > now.getFullYear()||(cfYear===now.getFullYear()&&cfMonth>now.getMonth())){
    cfMonth -= dir;
    if(cfMonth > 11){ cfMonth=0; cfYear++; }
    if(cfMonth < 0){ cfMonth=11; cfYear--; }
    return;
  }
  renderCashFlow();
}

function setCfBank(bank, btn){
  document.getElementById('cfEntryBank').value = bank;
  var fnbBtn  = document.getElementById('cfBankFNB');
  var tymeBtn = document.getElementById('cfBankTyme');
  if(fnbBtn){  fnbBtn.style.borderColor  = bank==='FNB'     ? '#4a7aaa' : 'var(--border)';
               fnbBtn.style.background   = bank==='FNB'     ? '#0a0f1a' : 'none';
               fnbBtn.style.color        = bank==='FNB'     ? '#4a9aff' : 'var(--muted)'; }
  if(tymeBtn){ tymeBtn.style.borderColor = bank==='TymeBank'? '#aa8a00' : 'var(--border)';
               tymeBtn.style.background  = bank==='TymeBank'? '#1a1000' : 'none';
               tymeBtn.style.color       = bank==='TymeBank'? '#f2a830' : 'var(--muted)'; }
}

function setCfRecur(val, btn){
  cfRecur = val;
  document.getElementById('cfEntryRecur').value = val ? 'true' : 'false';
  ['cfRecurYes','cfRecurNo'].forEach(function(id){
    const b = document.getElementById(id);
    if(!b) return;
    const isActive = (id==='cfRecurYes') === val;
    b.style.borderColor = isActive ? '#c8f230' : 'var(--border)';
    b.style.background  = isActive ? '#1a2e00' : 'none';
    b.style.color       = isActive ? '#c8f230' : 'var(--muted)';
  });
}

function buildCfIconGrid(){
  const g = document.getElementById('cfIconGrid');
  if(!g) return;
  g.innerHTML = '';
  CF_ICONS.forEach(function(ic){
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = ic;
    b.style.cssText = 'width:32px;height:32px;border-radius:6px;border:'+(ic===cfSelIcon?'2px solid #c8f230;background:#1a2e00':'1px solid var(--border);background:none')+';font-size:16px;cursor:pointer;transition:all .15s;';
    b.onclick = function(){ cfSelIcon=ic; buildCfIconGrid(); };
    g.appendChild(b);
  });
}

function openCfEntryModal(type, editId){
  const isIncome = type === 'income';
  cfSelIcon = isIncome ? '💰' : '💸';
  cfRecur = true;
  document.getElementById('cfEntryModalTitle').textContent = (editId ? '✏️ Edit' : '+ Add') + (isIncome ? ' Income' : ' Expense');
  document.getElementById('cfEntryModalTitle').style.color = isIncome ? '#c8f230' : '#f23060';
  document.getElementById('cfEntryType').value = type;
  document.getElementById('cfEntryId').value = editId || '';
  document.getElementById('cfEntryLabel').value = '';
  if(document.getElementById('cfEntryBank')) document.getElementById('cfEntryBank').value = 'FNB';
  setCfBank('FNB', null);
  document.getElementById('cfEntryAmount').value = '';
  // Always show date field, default to today
  const dateField = document.getElementById('cfEntryDateField');
  const dateInput = document.getElementById('cfEntryDate');
  const dateLabel = document.getElementById('cfEntryDateLabel');
  dateField.style.display = '';
  dateLabel.textContent = isIncome ? 'Date Received' : 'Date';
  dateInput.value = localDateStr(new Date());
  setCfRecur(true, null);

  if(editId){
    const data = loadCFData();
    const mk = cfKey();
    const section = isIncome ? (data[mk]&&data[mk].income||[]) : (data[mk]&&data[mk].expenses||[]);
    // Also check recurring
    const recurring = isIncome ? (data.recurring&&data.recurring.income||[]) : (data.recurring&&data.recurring.expenses||[]);
    const entry = section.find(function(e){ return e.id===editId; }) || recurring.find(function(e){ return e.id===editId; });
    if(entry){
      document.getElementById('cfEntryLabel').value = entry.label;
      document.getElementById('cfEntryAmount').value = entry.amount;
      cfSelIcon = entry.icon || cfSelIcon;
      if(entry.date) dateInput.value = entry.date;
      const isRec = !!recurring.find(function(e){ return e.id===editId; });
      setCfRecur(isRec, null);
    }
  }

  buildCfIconGrid();
  document.getElementById('cfEntryModal').classList.add('active');
}

function saveCfEntry(){
  const label  = document.getElementById('cfEntryLabel').value.trim();
  const amount = parseFloat(document.getElementById('cfEntryAmount').value);
  const type   = document.getElementById('cfEntryType').value;
  const editId = document.getElementById('cfEntryId').value;
  const recur  = document.getElementById('cfEntryRecur').value === 'true';

  if(!label){ alert('Enter a label.'); return; }
  if(!amount || amount <= 0){ alert('Enter a valid amount.'); return; }

  const data = loadCFData();
  const mk = cfKey();
  const section = type === 'income' ? 'income' : 'expenses';

  const entryDate = document.getElementById('cfEntryDate').value || localDateStr(new Date());
  const cfBank = document.getElementById('cfEntryBank') ? document.getElementById('cfEntryBank').value : 'FNB';
  const entry = { id: editId || uid(), label, amount, icon: cfSelIcon, auto: false, account: cfBank };
  if(entryDate) entry.date = entryDate;

  if(recur){
    // Store in recurring section
    if(!data.recurring) data.recurring = { income:[], expenses:[] };
    if(editId){
      // Remove from both month and recurring (it might have been in either)
      data.recurring[section] = (data.recurring[section]||[]).filter(function(e){ return e.id!==editId; });
      if(data[mk]) data[mk][section] = (data[mk][section]||[]).filter(function(e){ return e.id!==editId; });
    }
    data.recurring[section] = data.recurring[section] || [];
    data.recurring[section].push(entry);
  } else {
    // Store in this month only
    if(!data[mk]) data[mk] = { income:[], expenses:[] };
    if(editId){
      data[mk][section] = (data[mk][section]||[]).filter(function(e){ return e.id!==editId; });
      if(data.recurring) data.recurring[section] = (data.recurring[section]||[]).filter(function(e){ return e.id!==editId; });
    }
    data[mk][section] = data[mk][section] || [];
    data[mk][section].push(entry);
  }

  saveCFData(data);
  closeModal('cfEntryModal');
  renderCashFlow();
}

function deleteCfEntry(id, type){
  if(!confirm('Remove this entry?')) return;

  // ── Find the entry first so we can reverse any linked fund/maintenance deposit ──
  var cfData = loadCFData();
  var mk = cfKey();
  var section = type === 'income' ? 'income' : 'expenses';
  var entry = null;
  if(cfData[mk] && cfData[mk][section]){
    entry = cfData[mk][section].find(function(e){ return e.id===id; });
  }
  if(!entry && cfData.recurring && cfData.recurring[section]){
    entry = cfData.recurring[section].find(function(e){ return e.id===id; });
  }

  // ── Reverse linked record based on sourceType (bidirectional sync) ──
  if(entry && entry.sourceType){
    var st  = entry.sourceType;
    var sid = entry.sourceId;

    if(st === 'savings_deposit' && sid){
      var f = funds.find(function(x){ return x.id===sid; });
      if(f){
        f.deposits = (f.deposits||[]).filter(function(d){ return d.cfId !== id; });
        saveFunds(); renderFunds();
      }
    } else if(st === 'maint'){
      var mdata = getMaintData();
      saveMaintData(mdata.filter(function(e){ return e.cfId !== id; }));
      renderMaintCard();
    } else if(st === 'custommaint'){
      try{
        var cards = loadCustomMaintCards();
        cards.forEach(function(card){
          card.entries = (card.entries||[]).filter(function(e){ return e.cfId !== id; });
        });
        saveCustomMaintCards(cards);
        renderMaintCard();
      }catch(e){}
    } else if(st === 'car_service_save' || st === 'car_spend' || st === 'car_add'){
      var carFund = funds.find(function(f){ return f.isExpense; });
      if(carFund){
        carFund.deposits = (carFund.deposits||[]).filter(function(d){ return d.cfId !== id; });
        saveFunds(); renderFunds();
      }
    } else if(st === 'borrow_repaid' && sid){
      // Remove the repayment entry from borrowData
      if(borrowData[sid]){
        borrowData[sid] = borrowData[sid].filter(function(e){ return e.cfId !== id; });
        saveBorrows();
        renderCarpool(); renderMoneyOwed();
      }
    } else if(st === 'instalment' && sid){
      // Unmark the instalment payment that was logged with this CF entry
      try{
        var instPlans = loadInst ? loadInst() : [];
        instPlans.forEach(function(plan){
          if(plan.id === sid){
            plan.paid = (plan.paid||[]).filter(function(p){ return p.cfId !== id; });
          }
        });
        if(typeof saveInst === 'function') saveInst(instPlans);
        if(typeof renderInstalments === 'function') renderInstalments();
      }catch(e){}
    }
    // allocation_income / obligation: CF-only — no linked card record to reverse
  }

  // ── Remove from CF ──
  if(cfData[mk]) cfData[mk][section] = (cfData[mk][section]||[]).filter(function(e){ return e.id!==id; });
  if(cfData.recurring) cfData.recurring[section] = (cfData.recurring[section]||[]).filter(function(e){ return e.id!==id; });
  saveCFData(cfData);
  renderCashFlow();
}


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
  var SAVINGS_SOURCE_TYPES = ['savings_deposit','car_add','maint','custommaint','car_service_save','savings'];
  function isSavingsAlloc(e){ return e.sourceType && SAVINGS_SOURCE_TYPES.indexOf(e.sourceType) > -1; }

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
  if(!incomeHTML) incomeHTML = '<div style="padding:14px;color:#444;font-size:12px;letter-spacing:1px;">No income entries — tap + Add to get started.</div>';
  incomeContainer.innerHTML = incomeHTML;

  // ── RENDER EXPENSE ROWS — Real Expenses ──
  const expenseContainer = document.getElementById('cfExpenseRows');
  let expenseHTML = '';
  realExpenses.forEach(function(e){
    const isRecur = recurExpenses.some(function(r){ return r.id===e.id; });
    expenseHTML += cfRow(e, 'expense', isRecur);
  });
  autoExpenses.forEach(function(e){ expenseHTML += cfAutoRow(e); });
  if(!expenseHTML) expenseHTML = '<div style="padding:14px;color:#444;font-size:12px;letter-spacing:1px;">No real expenses this month.</div>';
  expenseContainer.innerHTML = expenseHTML;

  // ── RENDER SAVINGS ALLOCATIONS SECTION ──
  const savingsContainer = document.getElementById('cfSavingsAllocRows');
  if(savingsContainer){
    let savingsHTML = '';
    savingsAllocs.forEach(function(e){
      const isRecur = recurExpenses.some(function(r){ return r.id===e.id; });
      savingsHTML += cfRow(e, 'expense', isRecur);
    });
    if(!savingsHTML) savingsHTML = '<div style="padding:14px;color:#444;font-size:12px;letter-spacing:1px;">No savings allocations this month.</div>';
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
    schoolDone: getSchoolDone()
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
      if(!confirm('This will overwrite all current data. Are you sure?')){ input.value=''; return; }
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

let borrowData = {};

function loadBorrows(){
  try{ borrowData = JSON.parse(lsGet(BORROW_KEY)||'{}'); }catch(e){ borrowData={}; }
}
function saveBorrows(){ lsSet(BORROW_KEY, JSON.stringify(borrowData)); odinRefreshIfOpen(); }

// ══ LENDING GUARDRAIL ══
function getLendingSnapshot(){
  var now=new Date();
  var mk=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  var cfData=loadCFData();
  var rI=(cfData.recurring&&cfData.recurring.income)||[];
  var rE=(cfData.recurring&&cfData.recurring.expenses)||[];
  var mI=(cfData[mk]&&cfData[mk].income)||[];
  var mE=(cfData[mk]&&cfData[mk].expenses)||[];
  var ids=new Set([...mI,...mE].map(function(e){return e.id;}));
  var allI=[...rI.filter(function(e){return !ids.has(e.id);}),...mI];
  var allE=[...rE.filter(function(e){return !ids.has(e.id);}),...mE];
  var SAVINGS_SRC=['savings_deposit','car_add','maint','custommaint','car_service_save','savings'];
  var inc=allI.reduce(function(s,e){return s+e.amount;},0);
  // Only count real expenses — not savings allocations
  var exp=allE.filter(function(e){return !e.sourceType||SAVINGS_SRC.indexOf(e.sourceType)===-1;}).reduce(function(s,e){return s+e.amount;},0);
  var inst=loadInst?loadInst():[];
  inst.forEach(function(p){if(p.monthToMonth)exp+=p.amt||0;});
  var net=inc-exp;
  var buf=Math.max(500,inc*0.1);
  return{net:net,totalIncome:inc,maxSafeLend:Math.max(0,net-buf)};
}
function getPersonOwing(name){
  var o=0;
  if(borrowData&&borrowData[name]) borrowData[name].forEach(function(e){o+=e.type==='borrow'?e.amount:-e.amount;});
  var ext=loadExternalBorrows();
  Object.values(ext).forEach(function(p){
    if(p.name&&p.name.toLowerCase()===name.toLowerCase())
      (p.entries||[]).forEach(function(e){o+=e.type==='borrow'?e.amount:-e.amount;});
  });
  return Math.max(0,o);
}
function renderGuardrail(vEl,dEl,mEl,pEl,name,amt){
  var s=getLendingSnapshot();
  var owing=name?getPersonOwing(name):0;
  pEl.style.display='block';
  var lines=['Net this month: '+(s.net>=0?'+':'-')+'R'+Math.abs(s.net).toFixed(2)];
  if(owing>0) lines.push(name+' still owes you R'+owing.toFixed(2));
  var v,vc,bc,bg;
  if(s.net<0){v='Do not lend - you are in the red';vc='#f23060';bc='#5a1a1a';bg='#1a0505';mEl.textContent='Safe to lend: R0';mEl.style.color='#f23060';}
  else if(s.maxSafeLend<=0){v='Caution - very little room';vc='#f2a830';bc='#5a3a00';bg='#1a1000';mEl.textContent='Safe to lend: R0';mEl.style.color='#f2a830';}
  else{v='Safe to lend up to R'+s.maxSafeLend.toFixed(2);vc='#c8f230';bc='#3a5a00';bg='#0d1a00';mEl.textContent='Max safe: R'+s.maxSafeLend.toFixed(2);mEl.style.color='#c8f230';}
  if(amt>0){
    if(amt>s.maxSafeLend){v='R'+amt.toFixed(2)+' is too much';vc='#f23060';bc='#5a1a1a';bg='#1a0505';mEl.textContent='Max safe: R'+s.maxSafeLend.toFixed(2);mEl.style.color='#f2a830';}
    else{v='R'+amt.toFixed(2)+' is fine to lend';vc='#c8f230';bc='#3a5a00';bg='#0d1a00';}
  }
  pEl.style.background=bg;pEl.style.borderColor=bc;
  vEl.style.color=vc;vEl.textContent=v;
  dEl.innerHTML=lines.map(function(l){return '· '+l;}).join('<br>');
}
function updateLendingGuardrail(){
  var p=document.getElementById('borrowPassenger');
  var a=parseFloat(document.getElementById('borrowAmt').value)||0;
  renderGuardrail(document.getElementById('guardrailVerdict'),document.getElementById('guardrailDetail'),document.getElementById('guardrailMax'),document.getElementById('lendingGuardrail'),p?p.value:'',a);
}
function updateExtLendingGuardrail(){
  var n=(document.getElementById('extBorrowName').value||'').trim();
  var a=parseFloat(document.getElementById('extBorrowAmt').value)||0;
  renderGuardrail(document.getElementById('extGuardrailVerdict'),document.getElementById('extGuardrailDetail'),document.getElementById('extGuardrailMax'),document.getElementById('extLendingGuardrail'),n,a);
}
function openBorrowModal(){
  document.getElementById('borrowAmt').value='';
  document.getElementById('borrowDate').value=localDateStr(new Date());
  document.getElementById('borrowNote').value='';
  document.getElementById('borrowModal').classList.add('active');
  setTimeout(updateLendingGuardrail,100);
}

function confirmBorrow(){
  const passenger = document.getElementById('borrowPassenger').value;
  const amount = parseFloat(document.getElementById('borrowAmt').value);
  const date = document.getElementById('borrowDate').value || localDateStr(new Date());
  const note = document.getElementById('borrowNote').value.trim();
  const account = document.getElementById('borrowAccount').value || 'FNB';
  if(!passenger || isNaN(amount) || amount<=0){ alert('Enter a valid amount.'); return; }
  if(!borrowData[passenger]) borrowData[passenger]=[];
  borrowData[passenger].push({ id: uid(), type:'borrow', amount, date, note, account, paid:false });
  saveBorrows();
  // Log as expense in cashflow
  logBorrowToCashflow(passenger, amount, date, account, 'carpool');
  closeModal('borrowModal');
  renderCarpool();
}

// ── EDIT BORROW ENTRY ──
function openEditBorrowModal(passenger, entryId){
  const entries = borrowData[passenger] || [];
  const entry = entries.find(function(e){ return e.id === entryId; });
  if(!entry) return;
  document.getElementById('editBorrowPassenger').value  = passenger;
  document.getElementById('editBorrowId').value         = entryId;
  document.getElementById('editBorrowAmt').value        = entry.amount;
  document.getElementById('editBorrowDate').value       = entry.date;
  document.getElementById('editBorrowNote').value       = entry.note || '';
  document.getElementById('editBorrowTypeLabel').textContent = entry.type === 'repay' ? '↩ Repayment' : '💸 Borrow';
  document.getElementById('editBorrowModal').classList.add('active');
}

function confirmEditBorrow(){
  const passenger = document.getElementById('editBorrowPassenger').value;
  const entryId   = document.getElementById('editBorrowId').value;
  const amount    = parseFloat(document.getElementById('editBorrowAmt').value);
  const date      = document.getElementById('editBorrowDate').value;
  const note      = document.getElementById('editBorrowNote').value.trim();
  if(!amount || amount <= 0){ alert('Enter a valid amount.'); return; }
  const entries = borrowData[passenger] || [];
  const idx = entries.findIndex(function(e){ return e.id === entryId; });
  if(idx === -1) return;
  entries[idx].amount = amount;
  entries[idx].date   = date;
  entries[idx].note   = note;
  saveBorrows();
  closeModal('editBorrowModal');
  renderCarpool();
  renderMoneyOwed();
  const stmtArea = document.getElementById('stmtArea');
  if(stmtArea && stmtArea.style.display !== 'none') generateStatements();
}

function deleteBorrowEntry(passenger, entryId){
  var _entry = (borrowData[passenger]||[]).find(function(e){ return e.id === entryId; });
  var hasCF = _entry && !!_entry.cfId;
  var msg = 'Delete this entry?' + (hasCF ? '\n\nThis will also remove the linked Cash Flow record.' : '') + '\n\nThis cannot be undone.';
  if(!confirm(msg)) return;
  if(hasCF) removeFromCF(_entry.cfId);
  borrowData[passenger] = (borrowData[passenger]||[]).filter(function(e){ return e.id !== entryId; });
  saveBorrows();
  renderCarpool();
  renderMoneyOwed();
  if(typeof renderOdinInsights === 'function') try{ renderOdinInsights('money'); }catch(e){}
  const stmtArea = document.getElementById('stmtArea');
  if(stmtArea && stmtArea.style.display !== 'none') generateStatements();
}

// ── EDIT EXTERNAL BORROW ENTRY ──
function openEditExternalBorrowModal(personKey, entryId){
  const data   = loadExternalBorrows();
  const person = data[personKey];
  if(!person) return;
  const entry = (person.entries||[]).find(function(e){ return e.id === entryId; });
  if(!entry) return;
  document.getElementById('editBorrowPassenger').value  = '__ext__' + personKey;
  document.getElementById('editBorrowId').value         = entryId;
  document.getElementById('editBorrowAmt').value        = entry.amount;
  document.getElementById('editBorrowDate').value       = entry.date;
  document.getElementById('editBorrowNote').value       = entry.note || '';
  document.getElementById('editBorrowTypeLabel').textContent = (entry.type === 'repay' ? '↩ Repayment' : '💸 Borrow') + ' — ' + person.name;
  document.getElementById('editBorrowModal').classList.add('active');
}

function confirmEditBorrowUnified(){
  const passengerVal = document.getElementById('editBorrowPassenger').value;
  const entryId      = document.getElementById('editBorrowId').value;
  const amount       = parseFloat(document.getElementById('editBorrowAmt').value);
  const date         = document.getElementById('editBorrowDate').value;
  const note         = document.getElementById('editBorrowNote').value.trim();
  if(!amount || amount <= 0){ alert('Enter a valid amount.'); return; }

  if(passengerVal.startsWith('__ext__')){
    const personKey = passengerVal.replace('__ext__','');
    const data = loadExternalBorrows();
    if(!data[personKey]) return;
    const idx = data[personKey].entries.findIndex(function(e){ return e.id === entryId; });
    if(idx === -1) return;
    data[personKey].entries[idx].amount = amount;
    data[personKey].entries[idx].date   = date;
    data[personKey].entries[idx].note   = note;
    saveExternalBorrows(data);
    // Sync linked savings deposit
    updateSavingsDepositByBorrowId(personKey + ':' + entryId, amount, date, note);
  } else {
    const entries = borrowData[passengerVal] || [];
    const idx = entries.findIndex(function(e){ return e.id === entryId; });
    if(idx === -1) return;
    entries[idx].amount = amount;
    entries[idx].date   = date;
    entries[idx].note   = note;
    saveBorrows();
  }
  closeModal('editBorrowModal');
  renderCarpool();
  renderMoneyOwed();
  const stmtArea = document.getElementById('stmtArea');
  if(stmtArea && stmtArea.style.display !== 'none') generateStatements();
}

function removeSavingsDepositByBorrowId(linkedId){
  // Remove from regular funds
  let changed = false;
  funds.forEach(function(f){
    const before = f.deposits.length;
    f.deposits = f.deposits.filter(function(d){ return d.borrowEntryId !== linkedId; });
    if(f.deposits.length !== before) changed = true;
  });
  if(changed){ saveFunds(); renderFunds(); }
  // Remove from Maintenance Fund
  const mdata = getMaintData();
  const mBefore = mdata.length;
  const mNew = mdata.filter(function(e){ return e.borrowEntryId !== linkedId; });
  if(mNew.length !== mBefore){ saveMaintData(mNew); renderMaintCard(); }
}

function updateSavingsDepositByBorrowId(linkedId, newAmount, newDate, newNote){
  let changed = false;
  funds.forEach(function(f){
    f.deposits.forEach(function(d){
      if(d.borrowEntryId === linkedId){
        d.amount = newAmount; d.date = newDate;
        if(newNote) d.note = d.note.replace(/·.*$/, '') + (newNote ? ' · ' + newNote : '');
        changed = true;
      }
    });
  });
  if(changed){ saveFunds(); renderFunds(); }
  const mdata = getMaintData();
  let mChanged = false;
  mdata.forEach(function(e){
    if(e.borrowEntryId === linkedId){
      e.amount = newAmount; e.date = newDate;
      mChanged = true;
    }
  });
  if(mChanged){ saveMaintData(mdata); renderMaintCard(); }
}

function deleteBorrowEntryUnified(passengerVal, entryId){
  var hasCF = false;
  if(passengerVal.startsWith('__ext__')){
    var _ck = passengerVal.replace('__ext__','');
    var _cd = loadExternalBorrows();
    var _ce = (_cd[_ck]&&_cd[_ck].entries||[]).find(function(e){ return e.id === entryId; });
    hasCF = _ce && !!_ce.cfId;
  } else {
    var _ie = (borrowData[passengerVal]||[]).find(function(e){ return e.id === entryId; });
    hasCF = _ie && !!_ie.cfId;
  }
  var msg = 'Delete this entry?' + (hasCF ? '\n\nThis will also remove the linked Cash Flow record.' : '') + '\n\nThis cannot be undone.';
  if(!confirm(msg)) return;
  if(passengerVal.startsWith('__ext__')){
    const personKey = passengerVal.replace('__ext__','');
    const data = loadExternalBorrows();
    if(data[personKey]){
      var _extEntry = (data[personKey].entries||[]).find(function(e){ return e.id === entryId; });
      if(_extEntry && _extEntry.cfId) removeFromCF(_extEntry.cfId);
      removeSavingsDepositByBorrowId(personKey + ':' + entryId);
      data[personKey].entries = data[personKey].entries.filter(function(e){ return e.id !== entryId; });
    }
    saveExternalBorrows(data);
  } else {
    var _intEntry = (borrowData[passengerVal]||[]).find(function(e){ return e.id === entryId; });
    if(_intEntry && _intEntry.cfId) removeFromCF(_intEntry.cfId);
    borrowData[passengerVal] = (borrowData[passengerVal]||[]).filter(function(e){ return e.id !== entryId; });
    saveBorrows();
  }
  renderCarpool();
  renderMoneyOwed();
  if(typeof renderOdinInsights === 'function') try{ renderOdinInsights('money'); }catch(e){}
  const stmtArea = document.getElementById('stmtArea');
  if(stmtArea && stmtArea.style.display !== 'none') generateStatements();
}

function openRepayModal(){
  document.getElementById('repayAmt').value='';
  document.getElementById('repayDate').value=localDateStr(new Date());
  document.getElementById('repayNote').value='';
  const sel = document.getElementById('repayPassenger');
  // Populate dynamically
  sel.innerHTML = PASSENGERS.map(function(p){ return '<option value="'+p+'">'+p+'</option>'; }).join('');
  // Default to first passenger who actually owes something
  const firstOwing = PASSENGERS.find(function(p){
    const entries = borrowData[p] || [];
    let b=0,r=0;
    entries.forEach(function(e){ if(e.type==='repay') r+=Number(e.amount||0); else b+=Number(e.amount||0); });
    return (b-r) > 0;
  });
  sel.value = firstOwing || PASSENGERS[0];
  updateRepayOwingSummary();
  document.getElementById('repayModal').classList.add('active');
}

function updateRepayOwingSummary(){
  const passenger = document.getElementById('repayPassenger').value;
  const summary = document.getElementById('repayOwingSummary');
  const entries = borrowData[passenger] || [];
  let totalBorrowed = 0, totalRepaid = 0;
  entries.forEach(function(b){
    if(b.type === 'repay'){
      totalRepaid += Number(b.amount || 0);
    } else {
      totalBorrowed += Number(b.amount || 0);
      if(b.paid) totalRepaid += Number(b.amount || 0);
    }
  });
  const owing = totalBorrowed - totalRepaid;
  if(owing <= 0){
    summary.innerHTML = '<span style="color:#c8f230;">✓ ' + passenger + ' has no outstanding balance.</span>';
  } else {
    summary.innerHTML = passenger + ' currently owes <strong style="color:#f2a830;font-size:13px;">R' + owing.toLocaleString('en-ZA') + '</strong>';
  }
}

// Wire up passenger change on repay modal
document.addEventListener('DOMContentLoaded', function(){
  const sel = document.getElementById('repayPassenger');
  if(sel) sel.addEventListener('change', updateRepayOwingSummary);
});

function confirmRepay(){
  const passenger = document.getElementById('repayPassenger').value;
  const amount = parseFloat(document.getElementById('repayAmt').value);
  const date = document.getElementById('repayDate').value || localDateStr(new Date());
  const bank = document.getElementById('repayBank') ? document.getElementById('repayBank').value : 'Tymebank';
  const noteRaw = document.getElementById('repayNote').value.trim();
  if(!passenger || isNaN(amount) || amount <= 0){ alert('Enter a valid repayment amount.'); return; }
  if(!borrowData[passenger]) borrowData[passenger] = [];
  // Build enriched label and note for Cash Flow
  const cfLabel = passenger + ' – Borrow Repayment → ' + bank;
  const cfNote = 'Borrowed money repaid by ' + passenger + ' into ' + bank + (noteRaw ? ' · ' + noteRaw : '');
  var cfId_repay=postToCF({label:cfLabel,amount:amount,date:date,icon:'repay',type:'income',sourceType:'borrow_repaid',sourceId:passenger,sourceCardName:bank,note:cfNote});
  borrowData[passenger].push({ id: uid(), type:'repay', amount: amount, date: date, note: cfNote, paid: true, cfId:cfId_repay, bank:bank });
  saveBorrows();
  closeModal('repayModal');
  renderCarpool();
  renderMoneyOwed();
  if(typeof renderOdinInsights === 'function') try{ renderOdinInsights('money'); }catch(e){}
  const stmtArea = document.getElementById('stmtArea');
  if(stmtArea && stmtArea.style.display !== 'none') generateStatements();
  loadBorrowReport();
  // ── Open MoneyMoveZ to allocate the repayment ──
  setTimeout(function(){
    openAllocateModal('repayment');
    var amtEl = document.getElementById('allocAmount');
    if(amtEl){ amtEl.value = amount; }
    var srcEl = document.getElementById('allocSource');
    if(srcEl){ srcEl.value = 'repay_carpool_'+passenger; }
    if(typeof recalcAllocation === 'function') recalcAllocation();
  }, 300);
}

function getBorrowTotal(passenger){
  if(!borrowData[passenger]) return { borrowTotal:0, borrowPaid:0 };
  let borrowTotal=0, borrowPaid=0;
  borrowData[passenger].forEach(function(b){
    if(b.type === 'repay'){
      // Repayments reduce what they owe
      borrowPaid += Number(b.amount || 0);
    } else {
      borrowTotal += Number(b.amount || 0);
      if(b.paid) borrowPaid += Number(b.amount || 0);
    }
  });
  return { borrowTotal, borrowPaid };
}


// ── Archive settled external borrow person ──

// ── Show/Hide archived people in Money Owed ──
var _moShowArchived = false;

function toggleArchivedMoney(){
  _moShowArchived = !_moShowArchived;
  var section = document.getElementById('moArchivedSection');
  var btn = document.getElementById('moToggleArchived');
  if(section) section.style.display = _moShowArchived ? 'block' : 'none';
  if(btn) btn.textContent = _moShowArchived ? '📦 Hide Archived' : '📦 Show Archived';
  if(_moShowArchived) renderArchivedMoney();
}

function renderArchivedMoney(){
  var container = document.getElementById('moArchivedList');
  if(!container) return;
  container.innerHTML = '';
  var hasAny = false;

  // Carpool archived
  var carpoolArchived = JSON.parse(lsGet('yb_carpool_archived')||'[]');
  carpoolArchived.forEach(function(name){
    hasAny = true;
    var d = document.createElement('div');
    d.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:#111;border:1px solid #2a2a2a;border-radius:8px;margin-bottom:8px;';
    d.innerHTML = '<div><div style="font-size:13px;color:#555;">'+name+'</div><div style="font-size:9px;color:#333;letter-spacing:1px;">CARPOOL</div></div>'
      +'<button onclick="unarchivePerson(\''+name+'\',\'carpool\')" style="background:none;border:1px solid #2a3a1a;border-radius:6px;padding:5px 12px;color:#5a8800;font-family:DM Mono,monospace;font-size:10px;cursor:pointer;">Restore</button>';
    container.appendChild(d);
  });

  // External archived
  var extData = loadExternalBorrows();
  Object.keys(extData).forEach(function(key){
    var p = extData[key];
    if(!p.archived) return;
    hasAny = true;
    var d = document.createElement('div');
    d.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:#111;border:1px solid #2a2a2a;border-radius:8px;margin-bottom:8px;';
    d.innerHTML = '<div><div style="font-size:13px;color:#555;">'+p.name+'</div><div style="font-size:9px;color:#333;letter-spacing:1px;">PERSONAL</div></div>'
      +'<button onclick="unarchivePerson(\''+key+'\',\'external\')" style="background:none;border:1px solid #2a3a1a;border-radius:6px;padding:5px 12px;color:#5a8800;font-family:DM Mono,monospace;font-size:10px;cursor:pointer;">Restore</button>';
    container.appendChild(d);
  });

  if(!hasAny){
    container.innerHTML = '<div style="font-size:11px;color:#333;padding:8px 0;">No archived people.</div>';
  }
}

function unarchivePerson(key, tag){
  if(tag === 'carpool'){
    var archived = JSON.parse(lsGet('yb_carpool_archived')||'[]');
    archived = archived.filter(function(n){ return n !== key; });
    lsSet('yb_carpool_archived', JSON.stringify(archived));
  } else {
    var data = loadExternalBorrows();
    if(data[key]){ data[key].archived = false; saveExternalBorrows(data); }
  }
  renderMoneyOwed();
  if(_moShowArchived) renderArchivedMoney();
}

function archiveExternalPerson(key, tag){
  if(!confirm('Archive this person? Their history will be hidden but not deleted.')) return;
  if(tag === 'carpool'){
    var archived = JSON.parse(lsGet('yb_carpool_archived')||'[]');
    if(archived.indexOf(key) === -1) archived.push(key);
    lsSet('yb_carpool_archived', JSON.stringify(archived));
  } else {
    var data = loadExternalBorrows();
    if(data[key]){ data[key].archived = true; saveExternalBorrows(data); }
  }
  renderMoneyOwed();
  odinRefreshIfOpen();
}

// ── Odin: open repayment from command centre ──
function odinOpenRepayment(name, isExternal, extKey){
  if(isExternal){
    openExternalRepayModal(extKey);
  } else {
    openRepayModal();
    // Pre-select the passenger
    setTimeout(function(){
      var sel = document.getElementById('repayPassenger');
      if(sel){ sel.value = name; sel.dispatchEvent(new Event('change')); }
    }, 100);
  }
}

// ── Odin: open borrow from command centre ──
function odinOpenBorrow(name, isExternal, extKey){
  if(isExternal){
    // Open external borrow modal
    var modal = document.getElementById('externalBorrowModal');
    if(modal){
      var nameEl = document.getElementById('extBorrowPersonName');
      if(nameEl) nameEl.value = name;
      modal.classList.add('active');
    }
  } else {
    // Open carpool borrow modal pre-selected
    var bModal = document.getElementById('borrowModal');
    if(bModal){
      var bSel = document.getElementById('borrowPassenger');
      if(bSel){ bSel.value = name; }
      bModal.classList.add('active');
    }
  }
}

// ── SMART PRICING CALCULATOR ──
var _pricingTripsPerTank = 0;
var _pricingCurrentAvg = 0;

function recalcPricing(){
  const tankCostEl     = document.getElementById('tankCost');
  const privateUseEl   = document.getElementById('privateUseAmt');
  const manualTripsEl  = document.getElementById('manualTripsPerTank');
  if(!tankCostEl) return;

  const tankCost      = parseFloat(tankCostEl.value)    || 0;
  const privateUseAmt = parseFloat(privateUseEl.value)  || 0;
  const manualTrips   = parseFloat(manualTripsEl.value) || 0;
  const tripsPerTank  = manualTrips > 0 ? manualTrips : _pricingTripsPerTank;

  // Update auto trips display
  const autoEl = document.getElementById('autoTripsPerTank');
  if(autoEl) autoEl.textContent = _pricingTripsPerTank > 0 ? _pricingTripsPerTank + ' trips' : 'No data yet';

  // Live split summary
  const splitSummary = document.getElementById('splitSummary');
  const splitWarning = document.getElementById('splitWarning');
  const carpoolCost   = Math.max(0, tankCost - privateUseAmt);
  if(tankCost > 0){
    if(splitSummary) splitSummary.style.display = 'flex';
    const sp = document.getElementById('splitPrivate');
    const sc = document.getElementById('splitCarpool');
    const st = document.getElementById('splitTank');
    if(sp) sp.textContent = 'R' + privateUseAmt.toLocaleString('en-ZA');
    if(sc) sc.textContent = 'R' + carpoolCost.toLocaleString('en-ZA');
    if(st) st.textContent = 'R' + tankCost.toLocaleString('en-ZA');
    if(splitWarning) splitWarning.style.display = privateUseAmt > tankCost ? 'block' : 'none';
  } else {
    if(splitSummary) splitSummary.style.display = 'none';
  }

  const resYourCost    = document.getElementById('resYourCost');
  const resBreakEven   = document.getElementById('resBreakEven');
  const resRecommended = document.getElementById('resRecommended');
  const resStatus      = document.getElementById('resStatus');
  const resExplain     = document.getElementById('resExplain');
  const result         = document.getElementById('pricingResult');

  if(tankCost <= 0 || tripsPerTank <= 0){
    if(resStatus){ resStatus.textContent = '⏳ Enter your tank cost' + (tripsPerTank<=0?' and trips per tank':'') + ' to see your recommended price'; resStatus.style.color='#555'; resStatus.style.background='#111'; resStatus.style.border='1px solid #222'; }
    if(resYourCost)    resYourCost.textContent    = '—';
    if(resBreakEven)   resBreakEven.textContent   = '—';
    if(resRecommended) resRecommended.textContent = '—';
    if(resExplain)     resExplain.textContent     = '';
    return;
  }

  // Maths
  const breakEven   = carpoolCost / tripsPerTank;
  const recommended = Math.ceil(breakEven * 1.10 / 5) * 5;

  if(resYourCost)    resYourCost.textContent    = 'R' + Math.round(privateUseAmt);
  if(resBreakEven)   resBreakEven.textContent   = 'R' + breakEven.toFixed(2);
  if(resRecommended) resRecommended.textContent = 'R' + recommended;

  // Status vs what passengers currently pay
  const currentAvg = _pricingCurrentAvg || 0;
  let statusText, statusColor, bgColor, borderColor;
  if(currentAvg <= 0){
    statusText='⏳ No current trip data to compare yet'; statusColor='#555'; bgColor='#111'; borderColor='#222';
  } else {
    const gap = currentAvg - breakEven;
    if(gap < -10){
      statusText='⚠️ Undercharging by R'+Math.abs(gap).toFixed(0)+'/trip — raise to at least R'+recommended;
      statusColor='#f23060'; bgColor='#1a0808'; borderColor='#5a1010';
    } else if(gap < 0){
      statusText='⚠️ Slightly under break-even by R'+Math.abs(gap).toFixed(0)+' — consider R'+recommended;
      statusColor='#f2a830'; bgColor='#1a1000'; borderColor='#5a3a00';
    } else if(gap < 10){
      statusText='✅ Just covering costs — R'+recommended+' gives you a safety buffer';
      statusColor='#c8f230'; bgColor='#0d1a00'; borderColor='#3a5a00';
    } else {
      statusText='✅ Profitable — R'+recommended+' keeps your buffer solid';
      statusColor='#c8f230'; bgColor='#0d1a00'; borderColor='#3a5a00';
    }
  }
  if(resStatus){ resStatus.textContent=statusText; resStatus.style.color=statusColor; resStatus.style.background=bgColor; resStatus.style.border='1px solid '+borderColor; }
  if(result){ result.style.background=bgColor; result.style.borderColor=borderColor; }

  if(resExplain) resExplain.innerHTML =
    'Tank <strong style="color:#efefef;">R'+tankCost+'</strong>'
    +' − Private use <strong style="color:#f2a830;">R'+Math.round(privateUseAmt)+'</strong>'
    +' = Carpool share <strong style="color:#c8f230;">R'+Math.round(carpoolCost)+'</strong><br>'
    +'R'+Math.round(carpoolCost)+' ÷ '+tripsPerTank+' trips'
    +' = <strong style="color:#efefef;">R'+breakEven.toFixed(2)+' break-even</strong>'
    +' + 10% → <strong style="color:#c8f230;">R'+recommended+' recommended</strong>';

  try{
    lsSet(PRICING_TANK_KEY,    tankCost);
    lsSet(PRICING_PRIVATE_KEY, privateUseAmt);
  }catch(e){}
}

function restorePricingSettings(){
  try{
    const tank    = lsGet(PRICING_TANK_KEY);
    const priv    = lsGet(PRICING_PRIVATE_KEY);
    if(tank){ const el=document.getElementById('tankCost');     if(el) el.value=tank; }
    if(priv){ const el=document.getElementById('privateUseAmt'); if(el) el.value=priv; }
  }catch(e){}
  recalcPricing();
}

// ══ GOOGLE DRIVE SYNC ══

const DRIVE_FILENAME = 'YBDashboard_Latest.json';

function getSyncMeta(){
  try{ return JSON.parse(lsGet(SYNC_KEY)||'{}'); }catch(e){ return {}; }
}
function setSyncMeta(data){
  const meta = Object.assign(getSyncMeta(), data);
  lsSet(SYNC_KEY, JSON.stringify(meta));
}

// ── EXPORT: share JSON to Drive via Android share sheet (phone) or download (laptop) ──
function driveExport(){
  const payload = buildBackupPayload();
  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], {type:'application/json'});
  const file = new File([blob], DRIVE_FILENAME, {type:'application/json'});

  setSyncMeta({ lastExport: new Date().toISOString() });
  updateSyncUI();

  // Try native share (works on HTTPS, may silently fail on local files)
  if(navigator.canShare && navigator.canShare({files:[file]})){
    navigator.share({ files:[file], title: 'YB Dashboard Backup', text: 'Save to Google Drive' })
      .then(()=>{ showSyncToast('✓ Shared! Save it to Google Drive.', '#c8f230'); })
      .catch(function(err){
        if(err.name==='AbortError') return; // user cancelled, fine
        // Share failed (e.g. running as local file) — fall back to download
        _doDownloadExport(blob);
      });
  } else {
    _doDownloadExport(blob);
  }
}

function _doDownloadExport(blob){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = DRIVE_FILENAME;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 5000);
  showSyncToast('⬇ Backup downloaded! Move it to Google Drive to keep it safe.','#f2a830');
}

// ── IMPORT: file picker — browse Google Drive app on Android ──
function driveImport(){
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.json,application/json';
  inp.onchange = function(){
    const file = inp.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = function(e){
      try{
        const backup = JSON.parse(e.target.result);
        if(backup.version !== 'ybdashboard_v1') throw new Error('Not a YB Dashboard backup.');
        const driveDate = backup.exported || backup.exportedDate || '?';
        const localMeta = getSyncMeta();
        const localExport = localMeta.lastExport;

        let msg = 'Import backup from ' + (backup.exportedDate||driveDate) + '?';
        if(localExport){
          const localD = new Date(localExport);
          const driveD = new Date(backup.exported||0);
          if(driveD < localD){
            msg = '⚠ Drive file is OLDER than your last export.\n\nDrive: '+(backup.exportedDate||'?')+'\nYour last export: '+localDateStr(localD)+'\n\nImport anyway? This will overwrite newer local data.';
          }
        }
        if(!confirm(msg)) return;
        if(backup.funds)          lsSet(SK,   JSON.stringify(backup.funds));
        if(backup.carpool)        lsSet(CPK,  JSON.stringify(backup.carpool));
        if(backup.borrows)        lsSet(BORROW_KEY,  JSON.stringify(backup.borrows));
        if(backup.fuel)           lsSet(FUEL_KEY,     JSON.stringify(backup.fuel));
        if(backup.maintenance)    lsSet(MAINT_KEY,           JSON.stringify(backup.maintenance));
        if(backup.prayer)         lsSet(PRAYER_KEY,          JSON.stringify(backup.prayer));
        if(backup.externalBorrows) lsSet(EXTERNAL_BORROW_KEY, JSON.stringify(backup.externalBorrows));
        if(backup.cars)           lsSet(CARS_KEY,     JSON.stringify(backup.cars));
        if(backup.drivers)        lsSet(DRIVER_KEY,  JSON.stringify(backup.drivers));
        if(backup.instalments)    lsSet(INST_KEY, JSON.stringify(backup.instalments));
        if(backup.pins)           lsSet(PIN_STORE_KEY,           JSON.stringify(backup.pins));
        setSyncMeta({ lastImport: new Date().toISOString(), lastImportDate: backup.exportedDate||backup.exported });
        showSyncToast('✓ Imported! Reloading…', '#c8f230');
        setTimeout(function(){ location.reload(); }, 1200);
      } catch(err){
        showSyncToast('✕ '+err.message, '#f23060');
      }
    };
    reader.readAsText(file);
  };
  inp.click();
}

function showSyncToast(msg, color){
  let toast = document.getElementById('syncToast');
  if(!toast){
    toast = document.createElement('div');
    toast.id = 'syncToast';
    toast.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:12px 20px;font-family:\'DM Mono\',monospace;font-size:11px;letter-spacing:1px;z-index:9999;transition:opacity .4s;white-space:nowrap;max-width:90vw;text-align:center;';
    document.body.appendChild(toast);
  }
  toast.style.color = color||'#efefef';
  toast.style.borderColor = color||'#333';
  toast.style.opacity = '1';
  toast.textContent = msg;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(function(){ toast.style.opacity='0'; }, 3500);
}

function updateSyncUI(){
  const meta = getSyncMeta();
  const expEl = document.getElementById('syncLastExport');
  const impEl = document.getElementById('syncLastImport');
  if(expEl) expEl.textContent = meta.lastExport ? '↑ Last export: '+localDateStr(new Date(meta.lastExport)) : '↑ Never exported';
  if(impEl) impEl.textContent = meta.lastImport ? '↓ Last import: '+(meta.lastImportDate||localDateStr(new Date(meta.lastImport))) : '↓ Never imported';
}

// ── Detect if Web Share (Android/PWA) is available ──
function isMobileShare(){ return !!(navigator.canShare); }

// INIT
const _today=new Date(),_weekAgo=new Date();_weekAgo.setDate(_weekAgo.getDate()-6);
const _toISO=d=>localDateStr(d);
if(document.getElementById('stmtFrom'))document.getElementById('stmtFrom').value=_toISO(_weekAgo);
if(document.getElementById('stmtTo'))document.getElementById('stmtTo').value=_toISO(_today);
// ── Migrate Shareen → Shireen in all stored data ──
(function migrateShireen(){
  try {
    // Carpool data
    var cpRaw = lsGet(CPK);
    if(cpRaw && cpRaw.includes('Shareen')){
      lsSet(CPK, cpRaw.split('Shareen').join('Shireen'));
    }
    // Borrows
    var bRaw = lsGet(BORROW_KEY);
    if(bRaw && bRaw.includes('Shareen')){
      lsSet(BORROW_KEY, bRaw.split('Shareen').join('Shireen'));
    }
    // Maintenance
    var mRaw = lsGet('yasin_maint_v1');
    if(mRaw && mRaw.includes('Shareen')){
      lsSet('yasin_maint_v1', mRaw.split('Shareen').join('Shireen'));
    }
    // Custom maint cards
    var cmRaw = lsGet('yasin_maint_cards_v1');
    if(cmRaw && cmRaw.includes('Shareen')){
      lsSet('yasin_maint_cards_v1', cmRaw.split('Shareen').join('Shireen'));
    }
    // PINs
    var pinRaw = lsGet(PIN_STORE_KEY);
    if(pinRaw && pinRaw.includes('Shareen')){
      lsSet(PIN_STORE_KEY, pinRaw.split('Shareen').join('Shireen'));
    }
  } catch(e){ console.warn('Migration error:', e); }
})();

loadFunds();renderFunds();renderMaintCard();renderCustomMaintCards();
// Cards always start expanded
loadCP();loadBorrows();renderCarpool();
// Init sync UI after DOM ready
setTimeout(updateSyncUI, 100);



// ══ PRAYER TRACKER ══

const PRAYER_LABELS = {t:'Tahajjud', f:'Fajr', d:'Dhuhr', a:'Asr', m:'Maghrib', i:'Isha'};
const FARD_KEYS = ['f','d','a','m','i'];

// Prayer seed removed — initPrayerData() starts fresh on first run.
// Historical data is preserved inside backups (prayer key). No seed needed.
// Prayer seed data removed — history lives in backup JSON, not in source code.

function initPrayerData(){
  if(!lsGet(PRAYER_KEY)){
    lsSet(PRAYER_KEY, JSON.stringify({}));
  }
}

function getPrayerData(){ 
  try{ return JSON.parse(lsGet(PRAYER_KEY)||'{}'); }catch(e){ return {}; }
}
function savePrayerData(d){ lsSet(PRAYER_KEY, JSON.stringify(d)); }

// ── Prayer day navigation (0 = today, -1 = yesterday, etc.) ──
let pDayOffset = 0;

function pSelectedDateStr(){
  const d = new Date();
  d.setDate(d.getDate() + pDayOffset);
  return pLocalDate(d);
}

function pDayNav(delta){
  const newOffset = pDayOffset + delta;
  if(newOffset > 0) return; // Can't go into future
  pDayOffset = newOffset;
  const data = getPrayerData();
  const dateStr = pSelectedDateStr();
  updatePDayLabels(dateStr);
  renderTodayGridWithTimes(data, dateStr);
}

function updatePDayLabels(dateStr){
  const label = document.getElementById('pDayLabel');
  const sub = document.getElementById('pDaySubLabel');
  const nextBtn = document.getElementById('pDayNextBtn');
  if(!label) return;
  const d = new Date(dateStr + 'T12:00:00');
  const today = pTodayStr();
  const yesterday = pLocalDate(new Date(new Date().setDate(new Date().getDate()-1)));
  if(dateStr === today){
    label.textContent = "Today's Salah";
    if(sub){ sub.style.display='none'; sub.textContent=''; }
    if(nextBtn){ nextBtn.style.opacity='0.3'; nextBtn.style.cursor='default'; }
  } else if(dateStr === yesterday){
    label.textContent = "Yesterday's Salah";
    if(sub){ sub.style.display='block'; sub.textContent=d.toLocaleDateString('en-ZA',{weekday:'long',day:'numeric',month:'short'}); }
    if(nextBtn){ nextBtn.style.opacity='1'; nextBtn.style.cursor='pointer'; }
  } else {
    label.textContent = d.toLocaleDateString('en-ZA',{weekday:'long',day:'numeric',month:'long'}).toUpperCase();
    if(sub){ sub.style.display='none'; }
    if(nextBtn){ nextBtn.style.opacity='1'; nextBtn.style.cursor='pointer'; }
  }
}

function pLocalDate(d){ 
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset*60000);
  return local.toISOString().slice(0,10);
}

function pTodayStr(){ return pLocalDate(new Date()); }

// Heatmap month state
let pHeatmapYear, pHeatmapMonth;

function renderPrayer(){
  initPrayerData();
  const data = getPrayerData();
  const today = pTodayStr();
  const selectedDate = pSelectedDateStr();

  // Header date
  const el = document.getElementById('prayerTodayDate');
  if(el){
    const d = new Date();
    el.textContent = d.toLocaleDateString('en-ZA',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).toUpperCase();
  }

  // Update day nav labels
  updatePDayLabels(selectedDate);

  // Today grid — fetch times then render for selected date
  renderTodayGridWithTimes(data, selectedDate);

  // Stats always based on actual today
  computeAndRenderStats(data, today);

  // Heatmap — default to current month
  if(!pHeatmapYear){
    const now = new Date();
    pHeatmapYear = now.getFullYear();
    pHeatmapMonth = now.getMonth(); // 0-indexed
  }
  renderHeatmap(data);

  // Breakdown bars
  renderBreakdown(data);
}

// ── Prayer Times (Aladhan API — Cape Town) ──
let prayerTimesCache = null;
let prayerTimesCacheDate = null;

function isFriday(dateStr){
  return new Date(dateStr + 'T12:00:00').getDay() === 5;
}

// ── Static Cape Town Prayer Times (Hanafi method, SA) ──
// Updated annually. Format: [Fajr, Dhuhr, Asr, Maghrib, Isha] per month/day
// Source: Islamic Council of South Africa / IslamicFinder
const CAPE_TOWN_TIMES = {
  // month (1-12): { day: [Fajr, Dhuhr, Asr, Maghrib, Isha] }
  1:  { 1:'05:18,13:02,16:53,20:12,21:35', 5:'05:21,13:04,16:52,20:12,21:35', 10:'05:25,13:06,16:51,20:11,21:33', 15:'05:30,13:08,16:49,20:09,21:31', 20:'05:35,13:10,16:47,20:07,21:28', 25:'05:40,13:11,16:45,20:04,21:25', 31:'05:46,13:13,16:42,20:00,21:20' },
  2:  { 1:'05:47,13:13,16:41,19:59,21:20', 5:'05:51,13:13,16:39,19:56,21:16', 10:'05:56,13:14,16:36,19:51,21:11', 15:'06:01,13:14,16:33,19:47,21:06', 20:'06:06,13:13,16:30,19:41,21:00', 28:'06:12,13:13,16:26,19:35,20:53' },
  3:  { 1:'06:13,13:13,16:25,19:34,20:52', 5:'06:17,13:12,16:22,19:29,20:46', 10:'06:22,13:11,16:18,19:22,20:39', 15:'06:27,13:10,16:14,19:16,20:32', 20:'06:31,13:08,16:10,19:09,20:25', 25:'06:35,13:07,16:06,19:02,20:17', 31:'06:39,13:05,16:01,18:54,20:09' },
  4:  { 1:'06:40,13:05,16:00,18:53,20:08', 5:'06:43,13:03,15:56,18:46,20:00', 10:'06:47,13:02,15:52,18:39,19:53', 15:'06:51,13:00,15:47,18:31,19:45', 20:'06:54,12:59,15:43,18:24,19:37', 30:'06:59,12:56,15:35,18:10,19:23' },
  5:  { 1:'07:00,12:56,15:34,18:09,19:22', 5:'07:03,12:55,15:30,18:03,19:16', 10:'07:06,12:54,15:25,17:56,19:08', 15:'07:08,12:53,15:22,17:50,19:02', 20:'07:11,12:53,15:18,17:44,18:56', 25:'07:12,12:52,15:15,17:39,18:51', 31:'07:14,12:52,15:12,17:34,18:46' },
  6:  { 1:'07:14,12:52,15:11,17:33,18:45', 5:'07:15,12:52,15:09,17:29,18:41', 10:'07:16,12:52,15:07,17:25,18:37', 15:'07:17,12:53,15:06,17:23,18:35', 20:'07:17,12:53,15:05,17:21,18:33', 30:'07:16,12:54,15:05,17:20,18:33' },
  7:  { 1:'07:16,12:54,15:05,17:20,18:33', 5:'07:15,12:55,15:06,17:21,18:34', 10:'07:13,12:55,15:07,17:23,18:36', 15:'07:11,12:56,15:09,17:26,18:39', 20:'07:09,12:57,15:11,17:30,18:43', 25:'07:06,12:57,15:13,17:34,18:47', 31:'07:02,12:58,15:17,17:39,18:52' },
  8:  { 1:'07:01,12:58,15:17,17:40,18:53', 5:'06:57,12:58,15:21,17:46,18:59', 10:'06:52,12:59,15:25,17:53,19:06', 15:'06:46,12:59,15:30,18:00,19:14', 20:'06:40,12:59,15:34,18:07,19:21', 25:'06:34,12:58,15:38,18:14,19:28', 31:'06:26,12:58,15:43,18:21,19:36' },
  9:  { 1:'06:25,12:58,15:44,18:22,19:37', 5:'06:18,12:57,15:48,18:29,19:44', 10:'06:10,12:57,15:53,18:37,19:52', 15:'06:01,12:56,15:58,18:44,20:00', 20:'05:52,12:55,16:03,18:52,20:07', 30:'05:35,12:53,16:12,19:06,20:21' },
  10: { 1:'05:33,12:53,16:13,19:08,20:23', 5:'05:24,12:52,16:18,19:16,20:31', 10:'05:13,12:51,16:24,19:25,20:41', 15:'05:02,12:50,16:29,19:34,20:50', 20:'04:51,12:49,16:34,19:42,20:59', 25:'04:40,12:48,16:39,19:51,21:09', 31:'04:28,12:48,16:45,20:00,21:19' },
  11: { 1:'04:27,12:48,16:46,20:01,21:20', 5:'04:18,12:47,16:50,20:09,21:28', 10:'04:08,12:47,16:55,20:18,21:38', 15:'03:59,12:47,16:59,20:26,21:47', 20:'03:51,12:47,17:03,20:34,21:55', 30:'03:39,12:48,17:10,20:49,22:11' },
  12: { 1:'03:38,12:48,17:11,20:50,22:12', 5:'03:35,12:49,17:13,20:55,22:17', 10:'03:33,12:50,17:15,21:00,22:22', 15:'03:33,12:51,17:16,21:04,22:26', 20:'03:35,12:53,17:17,21:07,22:28', 25:'03:38,12:54,17:17,21:08,22:29', 31:'03:44,12:56,17:16,21:07,22:28' }
};

function getStaticPrayerTimes(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const monthData = CAPE_TOWN_TIMES[month] || {};
  // Find nearest key
  const keys = Object.keys(monthData).map(Number).sort(function(a,b){return a-b;});
  let nearest = keys[0];
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] <= day) nearest = keys[i];
    else break;
  }
  const parts = (monthData[nearest] || '').split(',');
  if (parts.length < 5) return null;
  return { f: parts[0], d: parts[1], a: parts[2], m: parts[3], i: parts[4], j: parts[1], t: null };
}

function fetchPrayerTimes(){
  const today = pTodayStr();
  if(prayerTimesCache && prayerTimesCacheDate === today) return Promise.resolve(prayerTimesCache);

  // Always load static times immediately so UI never shows blank
  const staticTimes = getStaticPrayerTimes(today);
  if(staticTimes){
    prayerTimesCache = staticTimes;
    prayerTimesCacheDate = today;
  }

  // Try API to get accurate times — silently update cache if it works
  const url = 'https://api.aladhan.com/v1/timingsByCity?city=Cape+Town&country=South+Africa&method=2';
  return fetch(url)
    .then(function(r){ return r.json(); })
    .then(function(json){
      if(json.status === 'OK'){
        const t = json.data.timings;
        prayerTimesCache = {
          t: null,
          f: t.Fajr,
          d: t.Dhuhr,
          j: t.Jumuah || t.Dhuhr,
          a: t.Asr,
          m: t.Maghrib,
          i: t.Isha
        };
        prayerTimesCacheDate = today;
      }
      return prayerTimesCache;
    })
    .catch(function(){ return prayerTimesCache; }); // Return static times on network fail
}

function renderTodayGrid(data, today){
  const grid = document.getElementById('prayerTodayGrid');
  if(!grid) return;
  const todayEntry = data[today] || {};
  const friday = isFriday(today);
  const times = prayerTimesCache || {};

  // On Fridays: replace Dhuhr with Jumuah + add Dhuhr below it (some musallahs pray both)
  const prayers = friday ? [
    {key:'t', label:'Tahajjud', color:'#9b59b6'},
    {key:'f', label:'Fajr',     color:'var(--accent)'},
    {key:'j', label:'Jumuah',   color:'#f2a830'},
    {key:'a', label:'Asr',      color:'var(--accent)'},
    {key:'m', label:'Maghrib',  color:'var(--accent)'},
    {key:'i', label:'Isha',     color:'var(--accent)'},
  ] : [
    {key:'t', label:'Tahajjud', color:'#9b59b6'},
    {key:'f', label:'Fajr',     color:'var(--accent)'},
    {key:'d', label:'Dhuhr',    color:'var(--accent)'},
    {key:'a', label:'Asr',      color:'var(--accent)'},
    {key:'m', label:'Maghrib',  color:'var(--accent)'},
    {key:'i', label:'Isha',     color:'var(--accent)'},
  ];

  grid.innerHTML = prayers.map(p => {
    const done = todayEntry[p.key] === 1;
    const timeStr = times[p.key] ? '<span style="font-size:10px;color:#aaa;letter-spacing:1px;margin-top:1px;">'+times[p.key]+'</span>' : '';
    const isJumuah = p.key === 'j';
    const bgColor = done
      ? (p.key==='t' ? 'rgba(155,89,182,.15)' : isJumuah ? 'rgba(242,168,48,.1)' : 'rgba(200,242,48,.1)')
      : 'transparent';
    const icon = done ? (p.key==='t' ? '🌙' : isJumuah ? '🕌' : '✅') : (isJumuah ? '🕌' : '⬜');
    return `<button onclick="togglePrayer('${p.key}')" style="
      border:2px solid ${done ? p.color : isJumuah ? '#6b4800' : 'var(--border)'};
      background:${bgColor};
      border-radius:8px;padding:12px 6px;cursor:pointer;transition:all .2s;
      display:flex;flex-direction:column;align-items:center;gap:4px;">
      <span style="font-size:18px;">${icon}</span>
      <span style="font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:${done ? p.color : isJumuah ? '#f2a830' : 'var(--muted)'};">${p.label}</span>
      ${timeStr}
    </button>`;
  }).join('');

  // Friday label
  const label = document.getElementById('pFridayBadge');
  if(friday && !label){
    const header = grid.closest('.page').querySelector('[style*="Today\'s Salah"]') ||
                   grid.parentElement.querySelector('div');
    // inject badge next to header
    const badge = document.createElement('span');
    badge.id = 'pFridayBadge';
    badge.style.cssText = 'margin-left:8px;background:#6b4800;color:#f2a830;font-size:9px;letter-spacing:2px;text-transform:uppercase;padding:2px 8px;border-radius:3px;';
    badge.textContent = 'Jumu\'ah';
    if(grid.previousElementSibling) grid.previousElementSibling.appendChild(badge);
  }
}

function renderTodayGridWithTimes(data, today){
  fetchPrayerTimes().then(function(){
    renderTodayGrid(data, today);
  });
}

function togglePrayer(key){
  const data = getPrayerData();
  const today = pTodayStr();
  const dateStr = pSelectedDateStr();
  if(!data[dateStr]) data[dateStr] = {t:0,f:0,d:0,a:0,m:0,i:0,j:0};
  if(data[dateStr][key] === undefined) data[dateStr][key] = 0;
  data[dateStr][key] = data[dateStr][key] === 1 ? 0 : 1;
  savePrayerData(data);
  // Re-render just the today grid (fast, times already cached)
  renderTodayGrid(data, dateStr);
  // Re-run stats + heatmap
  computeAndRenderStats(data, today);
  renderHeatmap(data);
  renderBreakdown(data);
}

function computeAndRenderStats(data, today){
  const dates = Object.keys(data).sort();
  let totalFard = 0, totalPossible = 0;
  let currentStreak = 0, bestStreak = 0, tempStreak = 0;
  let tahajjudCount = 0, trackedDays = 0;

  // Walk all dates to compute streaks and totals
  const allDates = [];
  if(dates.length > 0){
    // Fill from first date to today
    const start = new Date(dates[0]+'T00:00:00');
    const end = new Date(today+'T00:00:00');
    for(let d = new Date(start); d <= end; d.setDate(d.getDate()+1)){
      allDates.push(pLocalDate(d));
    }
  }

  allDates.forEach(function(ds){
    const entry = data[ds] || {};
    const fardDone = FARD_KEYS.filter(k => entry[k] === 1).length;
    const fardCount = fardDone;
    totalPossible += 5;
    totalFard += fardCount;
    if(entry.t === 1) tahajjudCount++;
    trackedDays++;

    if(fardCount === 5){
      tempStreak++;
      if(tempStreak > bestStreak) bestStreak = tempStreak;
    } else {
      tempStreak = 0;
    }
  });

  // Current streak — walk backwards from today
  currentStreak = 0;
  for(let i = allDates.length - 1; i >= 0; i--){
    const entry = data[allDates[i]] || {};
    const fardDone = FARD_KEYS.filter(k => entry[k] === 1).length;
    if(fardDone === 5){ currentStreak++; } else { break; }
  }

  const rate = totalPossible > 0 ? Math.round(totalFard / totalPossible * 100) : 0;

  document.getElementById('pStreak').textContent = currentStreak;
  document.getElementById('pBestStreak').textContent = bestStreak;
  document.getElementById('pTotal').textContent = totalFard.toLocaleString();
  document.getElementById('pRate').textContent = rate + '%';
  document.getElementById('pTahajjudCount').textContent = tahajjudCount.toLocaleString();
  document.getElementById('pTahajjudPct').textContent = trackedDays > 0 ? Math.round(tahajjudCount/trackedDays*100)+'%' : '0%';
}

const HEATMAP_COLORS = [
  '#1a1a1a', // 0 - empty
  '#1a3300', // 1
  '#2d5c00', // 2-3
  '#5a9900', // 4
  '#c8f230', // 5 fard
];

function fardCountColor(entry){
  if(!entry) return HEATMAP_COLORS[0];
  const c = FARD_KEYS.filter(k => entry[k]===1).length;
  if(c===0) return HEATMAP_COLORS[0];
  if(c===1) return HEATMAP_COLORS[1];
  if(c<=3)  return HEATMAP_COLORS[2];
  if(c===4) return HEATMAP_COLORS[3];
  return HEATMAP_COLORS[4];
}

function renderHeatmap(data){
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  document.getElementById('pHeatmapLabel').textContent = months[pHeatmapMonth] + ' ' + pHeatmapYear;

  const grid = document.getElementById('pHeatmapGrid');
  const today = pTodayStr();
  const firstDay = new Date(pHeatmapYear, pHeatmapMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(pHeatmapYear, pHeatmapMonth+1, 0).getDate();

  let cells = '';
  // Empty cells for offset
  for(let i=0; i<firstDay; i++){
    cells += '<div></div>';
  }
  for(let day=1; day<=daysInMonth; day++){
    const ds = pHeatmapYear+'-'+String(pHeatmapMonth+1).padStart(2,'0')+'-'+String(day).padStart(2,'0');
    const entry = data[ds];
    const bg = fardCountColor(entry);
    const isTahajjud = entry && entry.t===1;
    const isToday = ds===today;
    const fardC = entry ? FARD_KEYS.filter(k=>entry[k]===1).length : 0;
    const tooltip = `${ds}: ${fardC}/5 fard${isTahajjud?' + Tahajjud':''}`;
    cells += `<div title="${tooltip}" style="
      width:100%;aspect-ratio:1;border-radius:3px;
      background:${bg};
      ${isTahajjud ? 'outline:2px solid #9b59b6;outline-offset:-1px;' : ''}
      ${isToday ? 'outline:2px solid var(--accent);outline-offset:-1px;' : ''}
      cursor:default;
    "></div>`;
  }
  grid.innerHTML = cells;
}

function prayerHeatmapPrev(){
  pHeatmapMonth--;
  if(pHeatmapMonth < 0){ pHeatmapMonth=11; pHeatmapYear--; }
  renderHeatmap(getPrayerData());
}
function prayerHeatmapNext(){
  const now = new Date();
  if(pHeatmapYear > now.getFullYear() || (pHeatmapYear===now.getFullYear() && pHeatmapMonth>=now.getMonth())) return;
  pHeatmapMonth++;
  if(pHeatmapMonth > 11){ pHeatmapMonth=0; pHeatmapYear++; }
  renderHeatmap(getPrayerData());
}

function renderBreakdown(data){
  const el = document.getElementById('pBreakdown');
  if(!el) return;
  const counts = {f:0,d:0,a:0,m:0,i:0,j:0};
  let jumuahFridays = 0;
  const total = Object.keys(data).length;
  Object.keys(data).forEach(function(ds){
    const entry = data[ds];
    FARD_KEYS.forEach(function(k){ if(entry[k]===1) counts[k]++; });
    if(isFriday(ds)){
      jumuahFridays++;
      if(entry.j===1) counts.j++;
    }
  });
  const labels = {f:'Fajr',d:'Dhuhr',a:'Asr',m:'Maghrib',i:'Isha'};
  let html = FARD_KEYS.map(function(k){
    const pct = total > 0 ? Math.round(counts[k]/total*100) : 0;
    return `<div>
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <span style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);">${labels[k]}</span>
        <span style="font-size:10px;color:var(--text);">${counts[k].toLocaleString()} <span style="color:var(--muted);">(${pct}%)</span></span>
      </div>
      <div style="height:6px;background:#1a1a1a;border-radius:3px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:3px;transition:width .4s;"></div>
      </div>
    </div>`;
  }).join('');
  // Jumuah row
  const jPct = jumuahFridays > 0 ? Math.round(counts.j/jumuahFridays*100) : 0;
  html += `<div style="margin-top:4px;padding-top:10px;border-top:1px solid var(--border);">
    <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
      <span style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#f2a830;">🕌 Jumuah</span>
      <span style="font-size:10px;color:var(--text);">${counts.j} / ${jumuahFridays} Fridays <span style="color:var(--muted);">(${jPct}%)</span></span>
    </div>
    <div style="height:6px;background:#1a1a1a;border-radius:3px;overflow:hidden;">
      <div style="height:100%;width:${jPct}%;background:#f2a830;border-radius:3px;transition:width .4s;"></div>
    </div>
  </div>`;
  el.innerHTML = html;
}

// prayer tab render is handled directly in switchTab above

// ══ MAINTENANCE FUND ══



// ══ CUSTOM MAINTENANCE CARDS ══
var cmSelEmoji = '🔧';
var cmContributors = PASSENGERS.slice(); // defaults, editable

function loadCustomMaintCards(){ try{ return JSON.parse(lsGet(CUSTOM_MAINT_KEY)||'[]'); }catch(e){ return []; } }
function saveCustomMaintCards(d){ lsSet(CUSTOM_MAINT_KEY, JSON.stringify(d)); }

const CM_EMOJIS = ['🔧','🏠','🚗','🛞','⚡','🌿','🏗️','🛁','🪟','🔑','🧹','💧','🔩','🪛','🏋️','🎯'];

function openNewMaintCard(){
  cmSelEmoji = '🔧';
  cmContributors = PASSENGERS.slice();
  document.getElementById('customMaintTitle').textContent = '🔧 New Maintenance Card';
  document.getElementById('cmName').value = '';
  document.getElementById('cmTarget').value = '';
  document.getElementById('cmEditId').value = '';
  buildCmEmojiGrid();
  renderCmContributors();
  document.getElementById('customMaintModal').classList.add('active');
}

function openEditMaintCard(id){
  const cards = loadCustomMaintCards();
  const c = cards.find(function(x){ return x.id === id; });
  if(!c) return;
  cmSelEmoji = c.emoji || '🔧';
  cmContributors = c.contributors ? [...c.contributors] : [];
  document.getElementById('customMaintTitle').textContent = '✏️ Edit Card';
  document.getElementById('cmName').value = c.name;
  document.getElementById('cmTarget').value = c.target;
  document.getElementById('cmEditId').value = id;
  buildCmEmojiGrid();
  renderCmContributors();
  document.getElementById('customMaintModal').classList.add('active');
}

function buildCmEmojiGrid(){
  const g = document.getElementById('cmEmojiGrid');
  g.innerHTML = '';
  CM_EMOJIS.forEach(function(e){
    const b = document.createElement('button');
    b.className = 'emoji-opt' + (e === cmSelEmoji ? ' selected' : '');
    b.textContent = e;
    b.type = 'button';
    b.onclick = function(){ cmSelEmoji = e; buildCmEmojiGrid(); };
    g.appendChild(b);
  });
}

function renderCmContributors(){
  const list = document.getElementById('cmContributorList');
  list.innerHTML = '';
  cmContributors.forEach(function(name, i){
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;';
    row.innerHTML =
      '<input type="text" value="'+name+'" oninput="cmContributors['+i+']=this.value" style="flex:1;padding:8px 10px;border-radius:4px;border:1px solid var(--border);background:#111;color:#efefef;font-family:\'DM Mono\',monospace;font-size:13px;outline:none;"/>'
      +'<button type="button" onclick="cmContributors.splice('+i+',1);renderCmContributors();" style="background:none;border:1px solid #2a1a1a;border-radius:4px;width:28px;height:28px;color:#555;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;" onmouseover="this.style.borderColor=\'#c0392b\';this.style.color=\'#c0392b\'" onmouseout="this.style.borderColor=\'#2a1a1a\';this.style.color=\'#555\'">✕</button>';
    list.appendChild(row);
  });
}

function addCmContributor(){
  cmContributors.push('');
  renderCmContributors();
  // Focus last input
  setTimeout(function(){
    const inputs = document.querySelectorAll('#cmContributorList input');
    if(inputs.length) inputs[inputs.length-1].focus();
  }, 50);
}

function saveCustomMaintCard(){
  const name = document.getElementById('cmName').value.trim();
  const target = parseFloat(document.getElementById('cmTarget').value) || 0;
  const editId = document.getElementById('cmEditId').value;
  const rawNames = cmContributors.filter(function(c){
    return typeof c === 'string' ? c.trim() : c.name && c.name.trim();
  });
  if(!name){ alert('Please enter a card name.'); return; }
  if(target < 1){ alert('Please enter a monthly target of at least R1.'); return; } // #6 validation
  if(!rawNames.length){ alert('Add at least one contributor.'); return; }

  const cards = loadCustomMaintCards();

  if(editId){
    const idx = cards.findIndex(function(c){ return c.id === editId; });
    if(idx > -1){
      const existing = cards[idx];
      // Merge: keep existing contributor IDs where name matches, create new IDs for new ones
      const existingContribs = existing.contributors || [];
      const mergedContribs = cmContributors.map(function(c){
        const newName = typeof c === 'string' ? c.trim() : c.name.trim();
        // Find existing contributor with same name or same id
        const found = existingContribs.find(function(ec){
          return (typeof ec === 'object' ? ec.id === (typeof c === 'object' ? c.id : null) || ec.name === newName : ec === newName);
        });
        if(found && typeof found === 'object') return { id: found.id, name: newName };
        if(found && typeof found === 'string') return { id: uid(), name: newName };
        return { id: uid(), name: newName };
      });
      cards[idx].name = name;
      cards[idx].emoji = cmSelEmoji;
      cards[idx].target = target;
      cards[idx].contributors = mergedContribs;
      // Migrate any string-person entries to use IDs
      cards[idx].entries = (cards[idx].entries||[]).map(function(e){
        if(e.personId) return e; // already migrated
        const match = mergedContribs.find(function(c){ return c.name === e.person; });
        return Object.assign({}, e, { personId: match ? match.id : null });
      });
    }
  } else {
    const contributors = cmContributors.map(function(c){
      const n = typeof c === 'string' ? c.trim() : c.name.trim();
      return { id: uid(), name: n };
    });
    cards.push({ id: uid(), name, emoji: cmSelEmoji, target, contributors, entries: [] });
  }
  saveCustomMaintCards(cards);
  closeModal('customMaintModal');
  renderCustomMaintCards();
}

function deleteCustomMaintCard(id){
  if(!confirm('Delete this card? All contribution history will be lost.')) return;
  const cards = loadCustomMaintCards().filter(function(c){ return c.id !== id; });
  saveCustomMaintCards(cards);
  renderCustomMaintCards();
}

function openCustomMaintContrib(cardId){
  document.getElementById('cmContribCardId').value = cardId;
  document.getElementById('cmContribAmt').value = '';
  document.getElementById('cmContribNote').value = '';
  document.getElementById('cmContribDate').value = localDateStr(new Date());
  const cards = loadCustomMaintCards();
  const card = cards.find(function(c){ return c.id === cardId; });
  const sel = document.getElementById('cmContribPerson');
  sel.innerHTML = '';
  if(card && card.contributors){
    card.contributors.forEach(function(p){
      const o = document.createElement('option');
      const id = typeof p === 'object' ? p.id : p;
      const name = typeof p === 'object' ? p.name : p;
      o.value = id;
      o.textContent = name;
      sel.appendChild(o);
    });
  }
  document.getElementById('customMaintContribModal').classList.add('active');
}

function confirmCustomMaintContrib(){
  const cardId = document.getElementById('cmContribCardId').value;
  const amount = parseFloat(document.getElementById('cmContribAmt').value);
  const personId = document.getElementById('cmContribPerson').value;
  const date = document.getElementById('cmContribDate').value || localDateStr(new Date());
  const note = document.getElementById('cmContribNote').value.trim();
  if(!amount || amount <= 0){ alert('Enter a valid amount.'); return; }
  const cards = loadCustomMaintCards();
  const card = cards.find(function(c){ return c.id === cardId; });
  if(!card) return;
  // Resolve name from ID for display
  const contrib = (card.contributors||[]).find(function(c){ return (typeof c === 'object' ? c.id : c) === personId; });
  const personName = contrib ? (typeof contrib === 'object' ? contrib.name : contrib) : personId;
  if(!card.entries) card.entries = [];
  var cmId=uid();
  var cmCfId=postToCF({label:card.name+' - '+personName,amount:amount,date:date,icon:'maint',type:'expense',sourceType:'custommaint',sourceId:cardId,sourceCardName:card.name,note:note});
  card.entries.push({ id: cmId, personId, person: personName, amount, date, note, cfId:cmCfId });
  saveCustomMaintCards(cards);
  closeModal('customMaintContribModal');
  renderCustomMaintCards();
}

function deleteCustomMaintEntry(cardId, entryId){
  const cards = loadCustomMaintCards();
  const card = cards.find(function(c){ return c.id === cardId; });
  if(!card) return;
  var entry=(card.entries||[]).find(function(e){return e.id===entryId;});
  if(entry&&entry.cfId) removeFromCF(entry.cfId);
  card.entries = (card.entries||[]).filter(function(e){ return e.id !== entryId; });
  saveCustomMaintCards(cards);
  renderCustomMaintCards();
}

function renderCustomMaintCards(){
  const wrap = document.getElementById('customMaintCardsWrap');
  if(!wrap) return;
  const cards = loadCustomMaintCards();
  if(!cards.length){ wrap.innerHTML = ''; return; }
  const now = new Date();
  const monthKey = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');

  wrap.innerHTML = cards.map(function(card){
    const entries = card.entries || [];
    const monthEntries = entries.filter(function(e){ return e.date && e.date.startsWith(monthKey); });
    const monthTotal = monthEntries.reduce(function(s,e){ return s+e.amount; }, 0);
    const allTotal = entries.reduce(function(s,e){ return s+e.amount; }, 0);
    const pct = Math.min(100, (monthTotal / card.target) * 100);
    const remaining = Math.max(0, card.target - monthTotal);
    const onTrack = monthTotal >= card.target;
    const barColor = onTrack ? '#c8f230' : monthTotal >= card.target*0.5 ? '#f2a830' : '#f23060';

    // Per-person totals — keyed by ID, displayed by current name
    const byPersonId = {};
    const contribList = card.contributors || [];
    contribList.forEach(function(p){
      const id = typeof p === 'object' ? p.id : p;
      byPersonId[id] = 0;
    });
    entries.forEach(function(e){
      const key = e.personId || e.person; // fallback to name for legacy entries
      if(byPersonId[key] !== undefined) byPersonId[key] += e.amount;
    });
    const personCols = contribList.map(function(p){
      const id = typeof p === 'object' ? p.id : p;
      const name = typeof p === 'object' ? p.name : p;
      return '<div style="padding:10px;border-right:1px solid var(--border);text-align:center;flex:1;">'
        +'<div style="font-size:9px;color:#444;letter-spacing:1px;text-transform:uppercase;margin-bottom:3px;">'+name+'</div>'
        +'<div style="font-size:13px;font-weight:700;color:#efefef;">'+fmtR(byPersonId[id]||0)+'</div>'
        +'</div>';
    }).join('');

    const recent = entries.slice().sort(function(a,b){ return new Date(b.date)-new Date(a.date); }).slice(0,5);
    const recentRows = recent.length
      ? recent.map(function(e){
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #161616;">'
            +'<div style="display:flex;flex-direction:column;gap:2px;">'
              +'<span style="font-size:11px;color:#efefef;">'+e.person+(e.note?' · '+e.note:'')+'</span>'
              +'<span style="font-size:10px;color:#333;">'+e.date+'</span>'
            +'</div>'
            +'<div style="display:flex;align-items:center;gap:8px;">'
              +'<span style="font-size:12px;font-weight:500;color:#c8f230;">+'+fmtR(e.amount)+'</span>'
              +'<button onclick="deleteCustomMaintEntry(\''+card.id+'\',\''+e.id+'\')" style="background:none;border:1px solid #2a1a1a;border-radius:4px;width:22px;height:22px;color:#444;cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center;" class="admin-only" onmouseover="this.style.borderColor=\'#c0392b\';this.style.color=\'#c0392b\'" onmouseout="this.style.borderColor=\'#2a1a1a\';this.style.color=\'#444\'">✕</button>'
            +'</div>'
          +'</div>';
        }).join('')
      : '<div style="font-size:11px;color:#333;padding:8px 0;">No contributions yet.</div>';

    return '<div class="fund-card" style="border-color:#2a3000;max-width:720px;margin:0 auto 14px;">'
      // Top
      +'<div class="fund-top" style="border-bottom-color:#2a3000;">'
        +'<div>'
          +'<span class="fund-emoji">'+card.emoji+'</span>'
          +'<div class="fund-name">'+card.name+'</div>'
          +'<div class="fund-weekly" style="color:#8ab820;">R'+card.target.toLocaleString('en-ZA')+'/month target</div>'
        +'</div>'
        +'<div style="display:flex;align-items:center;gap:6px;">'
          +'<div class="fund-actions admin-only" style="display:flex;gap:6px;">'
            +'<button class="icon-btn" onclick="openEditMaintCard(\''+card.id+'\')" title="Edit">✏️</button>'
            +'<button class="icon-btn danger" onclick="deleteCustomMaintCard(\''+card.id+'\')" title="Delete">🗑</button>'
            +'<button class="icon-btn" onclick="openCustomMaintContrib(\''+card.id+'\')" style="border-color:#3a5a00;color:#c8f230;" title="Add contribution">＋</button>'
            +'<button class="icon-btn admin-only" onclick="openUseFunds(\'custommaint\',\''+card.id+'\')" style="border-color:#5a3a00;color:#f2a830;" title="Use funds / log spend">💸</button>'
          +'</div>'
        +'</div>'
      +'</div>'
      // Stats
      +'<div class="fund-body">'
        +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:1px solid var(--border);margin:-16px -18px 0;padding:0;">'
          +'<div style="padding:12px 14px;border-right:1px solid var(--border);">'
            +'<div style="font-size:9px;color:#444;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px;">This Month</div>'
            +'<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:15px;color:#c8f230;">'+fmtR(monthTotal)+'</div>'
          +'</div>'
          +'<div style="padding:12px 10px;border-right:1px solid var(--border);">'
            +'<div style="font-size:9px;color:#444;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px;">Total Saved</div>'
            +'<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:15px;color:#c8f230;">'+fmtR(allTotal)+'</div>'
          +'</div>'
          +'<div style="padding:12px 10px;">'
            +'<div style="font-size:9px;color:#444;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px;">Status</div>'
            +'<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:13px;color:'+(onTrack?'#c8f230':'#f2a830')+';">'+(onTrack?'✅ On track':'⚠ R'+remaining.toFixed(0)+' short')+'</div>'
          +'</div>'
        +'</div>'
        // Progress bar
        +'<div style="padding:10px 0;border-bottom:1px solid var(--border);">'
          +'<div style="height:5px;background:#2a2a2a;border-radius:3px;overflow:hidden;">'
            +'<div style="width:'+pct+'%;height:100%;background:'+barColor+';border-radius:3px;transition:width .5s ease;box-shadow:0 0 8px '+barColor+'55;"></div>'
          +'</div>'
          +'<div style="font-size:10px;color:#444;margin-top:5px;letter-spacing:1px;">'+(onTrack?'🎉 Target reached!':pct.toFixed(0)+'% · R'+remaining.toFixed(0)+' to go')+'</div>'
        +'</div>'
        // Per-person
        +'<div style="display:flex;border-bottom:1px solid var(--border);margin:0 -18px;">'+personCols+'</div>'
        // Recent
        +'<div style="padding-top:8px;">'+recentRows+'</div>'
      +'</div>'
    +'</div>';
  }).join('');
}

function getMaintData(){
  try{ const v=lsGet(MAINT_KEY); if(v) return JSON.parse(v); }catch(e){}
  return [];
}
function saveMaintData(d){
  lsSet(MAINT_KEY, JSON.stringify(d));
}

function renderMaintCard(){
  const data = getMaintData();
  const now = new Date();
  const monthKey = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  const monthEntries = data.filter(function(e){ return e.date && e.date.startsWith(monthKey); });
  const monthTotal = monthEntries.reduce(function(s,e){ return s + e.amount; }, 0);
  const allTotal = data.reduce(function(s,e){ return s + e.amount; }, 0);
  const byPerson = {};
  PASSENGERS.forEach(function(p){ byPerson[p] = 0; });
  data.forEach(function(e){ if(byPerson[e.person] !== undefined) byPerson[e.person] += e.amount; });
  const pct = Math.min(100, (monthTotal / MAINT_TARGET) * 100);
  const remaining = Math.max(0, MAINT_TARGET - monthTotal);
  const onTrack = monthTotal >= MAINT_TARGET;
  const barColor = onTrack ? '#c8f230' : monthTotal >= MAINT_TARGET * 0.5 ? '#f2a830' : '#f23060';
  const el = function(id){ return document.getElementById(id); };
  if(el('maintMonthAmt')) el('maintMonthAmt').textContent = fmtR(monthTotal);
  if(el('maintTotalAmt')) el('maintTotalAmt').textContent = fmtR(allTotal);
  if(el('maintStatus')){ el('maintStatus').textContent = onTrack ? '✅ On track' : '⚠ R'+remaining.toFixed(0)+' short'; el('maintStatus').style.color = onTrack ? '#c8f230' : '#f2a830'; }
  if(el('maintProgBar')){ el('maintProgBar').style.width = pct+'%'; el('maintProgBar').style.background = barColor; el('maintProgBar').style.boxShadow = '0 0 8px '+barColor+'55'; }
  if(el('maintProgLabel')) el('maintProgLabel').textContent = onTrack ? '🎉 Target reached this month!' : pct.toFixed(0)+'% · R'+remaining.toFixed(0)+' to go this month';
  // Dynamic per-person breakdown
  const personWrap = el('maintPersonBreakdown');
  if(personWrap){
    personWrap.innerHTML = PASSENGER_DATA.map(function(p, i){
      const isLast = i === PASSENGER_DATA.length - 1;
      return '<div style="padding:10px '+(i===0?'14px':'10px')+';'+(isLast?'':'border-right:1px solid var(--border);')+'text-align:center;flex:1;">'
        +'<div style="font-size:9px;color:#444;letter-spacing:1px;text-transform:uppercase;margin-bottom:3px;">'+p.name+'</div>'
        +'<div style="font-size:13px;font-weight:700;color:#efefef;">'+fmtR(byPerson[p.name]||0)+'</div>'
        +'</div>';
    }).join('');
  } else {
    // Fallback for static HTML IDs
    if(el('maintDavid')) el('maintDavid').textContent = fmtR(byPerson.David||0);
    if(el('maintLezaun')) el('maintLezaun').textContent = fmtR(byPerson.Lezaun||0);
    if(el('maintShireen')) el('maintShireen').textContent = fmtR(byPerson.Shireen||0);
  }
  const recent = [...data].sort(function(a,b){ return new Date(b.date)-new Date(a.date); }).slice(0,5);
  if(el('maintRecentRows')){
    if(!recent.length){ el('maintRecentRows').innerHTML = '<div style="font-size:11px;color:#333;padding:8px 0;">No contributions yet.</div>'; }
    else { el('maintRecentRows').innerHTML = recent.map(function(e){ var fromLabel=e.person&&e.person!=='undefined'?e.person:(e.note?'Manual':'—'); var amt=Number(e.amount||0); var amtColor=amt>=0?'#c8f230':'#f23060'; var amtText=(amt>=0?'+':'')+fmtR(Math.abs(amt)); return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #161616"><div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:11px;color:#efefef">'+fromLabel+(e.note?' · '+e.note:'')+'</span><span style="font-size:10px;color:#333">'+e.date+'</span></div><span style="font-size:12px;font-weight:500;color:'+amtColor+';">'+amtText+'</span></div>'; }).join(''); }
  }
}

function openMaintContrib(){
  // Populate person select dynamically
  const sel = document.getElementById('maintPerson');
  sel.innerHTML = PASSENGER_DATA.map(function(p){
    return '<option value="'+p.name+'">'+p.name+'</option>';
  }).join('') + '<option value="Other">Other</option>';
  document.getElementById('maintAmt').value = '';
  document.getElementById('maintNote').value = '';
  document.getElementById('maintDate').value = localDateStr(new Date());
  document.getElementById('maintModal').classList.add('active');
}

function confirmMaintContrib(){
  const statusEl = document.getElementById('maintStatus');
  const amtEl = document.getElementById('maintAmt');
  const amount = parseFloat(amtEl ? amtEl.value : '');
  const person = document.getElementById('maintPerson').value;
  const date = document.getElementById('maintDate').value || localDateStr(new Date());
  const note = document.getElementById('maintNote').value.trim();
  if(!amount || amount <= 0){
    if(statusEl){ statusEl.style.color='#f23060'; statusEl.textContent='⚠ Enter a valid amount first.'; }
    if(amtEl){ amtEl.style.borderColor='#f23060'; amtEl.focus(); }
    return;
  }
  try{
    if(amtEl) amtEl.style.borderColor='';
    if(statusEl){ statusEl.style.color='#c8f230'; statusEl.textContent='Saving…'; }
    var maintId=uid();
    var cfId_maint=postToCF({label:'Maintenance Fund - '+person,amount:amount,date:date,icon:'maint',type:'expense',sourceType:'maint',sourceId:maintId,sourceCardName:'Maintenance Fund',note:note});
    const data = getMaintData();
    data.push({ id: maintId, person, amount, date, note, cfId:cfId_maint });
    saveMaintData(data);
    if(statusEl) statusEl.textContent='✓ Saved & logged to Cash Flow!';
    setTimeout(function(){
      closeModal('maintModal');
      renderMaintCard();
    }, 400);
  } catch(err){
    if(statusEl){ statusEl.style.color='#f23060'; statusEl.textContent='✕ Error: '+err.message; }
  }
}
function openMaintHistory(){
  const data = getMaintData();
  const sorted = [...data].sort(function(a,b){ return new Date(b.date)-new Date(a.date); });
  let html = '';
  if(!sorted.length){ html = '<p style="color:var(--muted);font-size:12px">No contributions yet.</p>'; }
  else {
    html = '<table style="width:100%;border-collapse:collapse;font-size:12px"><tr><th style="text-align:left;font-size:9px;letter-spacing:2px;color:var(--muted);padding:4px 6px;border-bottom:1px solid var(--border);font-weight:400">DATE</th><th style="text-align:left;font-size:9px;letter-spacing:2px;color:var(--muted);padding:4px 6px;border-bottom:1px solid var(--border);font-weight:400">FROM</th><th style="text-align:left;font-size:9px;letter-spacing:2px;color:var(--muted);padding:4px 6px;border-bottom:1px solid var(--border);font-weight:400">AMOUNT</th><th style="text-align:left;font-size:9px;letter-spacing:2px;color:var(--muted);padding:4px 6px;border-bottom:1px solid var(--border);font-weight:400">NOTE</th><th style="padding:4px 6px;border-bottom:1px solid var(--border)"></th></tr>';
    sorted.forEach(function(e){ var fromLabel=e.person&&e.person!=='undefined'?e.person:(e.note?'Manual':'—'); var amt=Number(e.amount||0); var amtColor=amt>=0?'#c8f230':'#f23060'; var amtText=(amt>=0?'+':'')+fmtR(Math.abs(amt)); html += '<tr><td style="padding:9px 6px;border-bottom:1px solid #1a1a1a;color:var(--muted)">'+e.date+'</td><td style="padding:9px 6px;border-bottom:1px solid #1a1a1a;color:#efefef">'+fromLabel+'</td><td style="padding:9px 6px;border-bottom:1px solid #1a1a1a;color:'+amtColor+';font-weight:500">'+amtText+'</td><td style="padding:9px 6px;border-bottom:1px solid #1a1a1a;color:var(--muted)">'+(e.note||'—')+'</td><td style="padding:9px 6px;border-bottom:1px solid #1a1a1a"><button onclick="deleteMaintEntry(\''+e.id+'\')" style="background:none;border:none;cursor:pointer;color:#333;font-size:13px" onmouseover="this.style.color=\'#c0392b\'" onmouseout="this.style.color=\'#333\'">✕</button></td></tr>'; });
    html += '</table>';
  }
  document.getElementById('maintHistContent').innerHTML = html;
  document.getElementById('maintHistModal').classList.add('active');
}

function deleteMaintEntry(id){
  const all = getMaintData();
  const entry=all.find(function(e){return e.id===id;});
  if(entry&&entry.cfId) removeFromCF(entry.cfId);
  saveMaintData(all.filter(function(e){return e.id!==id;}));
  openMaintHistory();
  renderMaintCard();
}

/* ══════════════════════════════════ */

// ══ AI ASSISTANT ══

// ══════════════════════════════════════════════════════════
// 🧠 ODIN CHAT ENGINE — No API needed, reads live data
// ══════════════════════════════════════════════════════════

function openAIAssistant(){
  document.getElementById('aiOverlay').classList.add('active');
  setTimeout(function(){ document.getElementById('aiInput').focus(); }, 300);
}
function closeAIAssistant(){
  document.getElementById('aiOverlay').classList.remove('active');
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
  var affordMatch = q.match(/r\s*(\d[\d,]*)/);
  var affordAmt = affordMatch ? parseFloat(affordMatch[1].replace(',','')) : null;
  if((q.includes('afford') || q.includes('buy') || q.includes('can i') || q.includes('sneaker') || q.includes('petrol') || q.includes('fuel') || q.includes('gas')) && affordAmt){
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
  return '🧠 I didn\'t quite catch that. Try:<br>'
    +'<b>"Can I buy X for R500?"</b><br>'
    +'<b>"What does Lezaun owe me?"</b><br>'
    +'<b>"Cash flow this month?"</b><br>'
    +'<b>"Savings summary"</b><br>'
    +'<b>"Carpool this month"</b>';
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


