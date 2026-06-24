// ════════════════════════════════════════════════════════════════════
// INFO.JS — Step 11a: app-wide ⓘ explainer pattern
// ════════════════════════════════════════════════════════════════════
//
// Single reusable modal + helper for showing plain-English "what's this"
// pop-ups anywhere in the app. Tap the ⓘ → modal opens. Tap ✕ or tap
// outside → modal closes.
//
// Usage in HTML:
//   <button class="info-btn" onclick="openInfo('Your Money', 'Your money lives in pockets...')">ⓘ</button>
//
// Or programmatically:
//   openInfo('Title', 'Body text...');
//
// Body supports plain text only (no HTML). Newlines render as paragraph
// breaks for readability.
// ════════════════════════════════════════════════════════════════════

function openInfo(title, body){
  var modal = document.getElementById('infoModal');
  if(!modal){
    console.warn('[info] modal element not found in DOM');
    return;
  }
  var titleEl = document.getElementById('infoModalTitle');
  var bodyEl  = document.getElementById('infoModalBody');
  if(titleEl) titleEl.textContent = title || '';
  if(bodyEl){
    // Split on newlines into paragraphs for readable formatting.
    // Escape HTML to prevent injection.
    var paras = String(body||'').split(/\n+/).map(function(p){
      return p.trim();
    }).filter(function(p){ return p.length > 0; });
    bodyEl.innerHTML = paras.map(function(p){
      return '<p style="margin:0 0 12px 0;line-height:1.55;color:var(--text);font-size:13px;">'+_escInfo(p)+'</p>';
    }).join('');
  }
  modal.classList.add('active');
  document.body.classList.add('modal-open');
}

function closeInfo(){
  var modal = document.getElementById('infoModal');
  if(modal) modal.classList.remove('active');
  // Only remove modal-open if no other modals open
  var anyOpen = document.querySelectorAll('.overlay.active, .qe-overlay.active').length > 0;
  if(!anyOpen) document.body.classList.remove('modal-open');
}

function _escInfo(s){
  return String(s||'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// Tap outside to close (wires once on first openInfo)
document.addEventListener('DOMContentLoaded', function(){
  var modal = document.getElementById('infoModal');
  if(modal){
    modal.addEventListener('click', function(e){
      if(e.target === modal) closeInfo();
    });
  }
});
