// Sync: Google Drive, share, migration


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
