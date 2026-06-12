// advisories.js — Odin Phase 1 (v118a)
// Workshop advisories for cars. Tracked at car.advisories[].
// Phase 1a scope: data model + add + list view. Detail view + actions = v118b.
// Alert integration = v118c.
//
// Data shape per advisory:
//   { id, severity:'red'|'amber'|'blue', text, flaggedDate, source,
//     status:'open'|'resolved', bookedFor, bookedNote, notes:[],
//     resolvedAt, resolvedBy, resolvedByInvoiceId, resolvedReason,
//     snoozeUntil }

(function(){

  // ── Helpers ──────────────────────────────────────────────────

  function getCarAdvisories(car){
    return Array.isArray(car && car.advisories) ? car.advisories : [];
  }

  function getOpenAdvisories(car){
    return getCarAdvisories(car).filter(function(a){ return a.status === 'open'; });
  }

  function getResolvedAdvisories(car){
    return getCarAdvisories(car).filter(function(a){ return a.status === 'resolved'; });
  }

  function getAdvisoryBadgeState(car){
    var open = getOpenAdvisories(car);
    if(open.length === 0) return null;
    var hasRed   = open.some(function(a){ return a.severity === 'red';   });
    var hasAmber = open.some(function(a){ return a.severity === 'amber'; });
    return {
      count: open.length,
      severity: hasRed ? 'red' : hasAmber ? 'amber' : 'blue'
    };
  }

  // Read cars + persist a mutated car using the real cars.js API
  function _allCars(){
    if(typeof loadCarsData === 'function') return loadCarsData();
    return [];
  }
  function _findCar(carId){
    return _allCars().find(function(c){ return c.id === carId; });
  }
  function _saveCar(mutatedCar){
    if(typeof loadCarsData !== 'function' || typeof saveCarsData !== 'function') return;
    var all = loadCarsData();
    var idx = all.findIndex(function(c){ return c.id === mutatedCar.id; });
    if(idx >= 0){
      all[idx] = mutatedCar;
      saveCarsData(all);
    }
  }

  function _fmtDate(iso){
    if(!iso) return '—';
    try{
      var d = new Date(iso+'T00:00:00');
      return d.getDate()+' '+d.toLocaleString('en-ZA',{month:'short'})+' '+d.getFullYear();
    }catch(e){ return iso; }
  }

  function _escape(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Badge HTML for car header ────────────────────────────────

  function renderAdvisoryBadge(car){
    var s = getAdvisoryBadgeState(car);
    if(!s) return '';
    var emoji, bg, color, border;
    if(s.severity === 'red'){
      emoji='⚠️'; bg='#3a0a0a'; color='#f23060'; border='#5a0e0e';
    } else if(s.severity === 'amber'){
      emoji='👁'; bg='#3a2a00'; color='#f2a830'; border='#5a3a00';
    } else {
      emoji='ℹ️'; bg='#0a2030'; color='#30c8f2'; border='#1e4a5a';
    }
    return '<span onclick="openAdvisoryList(\''+car.id+'\');event.stopPropagation();" '
      + 'style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:10px;'
      + 'font-size:10px;font-weight:700;letter-spacing:1px;cursor:pointer;'
      + 'background:'+bg+';color:'+color+';border:1px solid '+border+';margin-left:8px;'
      + (s.severity==='red'?'box-shadow:0 0 8px rgba(242,48,96,.3);':'')
      + '">'+emoji+' '+s.count+'</span>';
  }

  // ── Button HTML for the More section ─────────────────────────

  function renderAdvisoryMoreButton(car){
    var open = getOpenAdvisories(car);
    if(open.length === 0){
      return '<button onclick="openAdvisoryList(\''+car.id+'\')" '
        + 'style="background:transparent;border:1px solid #2a2a2a;border-radius:6px;padding:8px 12px;color:#666;'
        + 'font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;">'
        + '⊕ Add Advisory</button>';
    }
    var s = getAdvisoryBadgeState(car);
    var emoji, color, border, bg;
    if(s.severity === 'red'){
      emoji='⚠️'; color='#f23060'; border='#5a0e0e'; bg='#1a0a0a';
    } else if(s.severity === 'amber'){
      emoji='👁'; color='#f2a830'; border='#5a3a00'; bg='#1a1400';
    } else {
      emoji='ℹ️'; color='#30c8f2'; border='#1e4a5a'; bg='#0a2030';
    }
    return '<button onclick="openAdvisoryList(\''+car.id+'\')" '
      + 'style="background:'+bg+';border:1px solid '+border+';border-radius:6px;padding:8px 12px;color:'+color+';'
      + 'font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;">'
      + emoji+' Advisories ('+s.count+')</button>';
  }

  // ── List modal ───────────────────────────────────────────────

  var _advListCarId = null;
  var _advListFilter = 'open'; // 'open' | 'resolved'

  function openAdvisoryList(carId){
    var car = _findCar(carId);
    if(!car){ alert('Car not found.'); return; }
    _advListCarId = carId;
    _advListFilter = 'open';
    _renderAdvisoryList();
    var ov = document.getElementById('advisoryListModal');
    if(ov) ov.classList.add('active');
  }

  function _setAdvListFilter(f){
    _advListFilter = f;
    _renderAdvisoryList();
  }

  function _renderAdvisoryList(){
    var car = _findCar(_advListCarId);
    if(!car) return;
    var titleEl = document.getElementById('advisoryListTitle');
    var subEl   = document.getElementById('advisoryListSub');
    var listEl  = document.getElementById('advisoryListBody');
    var tabsEl  = document.getElementById('advisoryListTabs');

    var openCount = getOpenAdvisories(car).length;
    var resolvedCount = getResolvedAdvisories(car).length;

    if(titleEl) titleEl.textContent = '⚠️ '+car.name+' advisories';
    if(subEl)   subEl.textContent   = openCount+' open · '+resolvedCount+' resolved';

    if(tabsEl){
      tabsEl.innerHTML =
          '<span onclick="_setAdvListFilter(\'open\')" '
            + 'style="padding:4px 10px;border-radius:10px;font-size:10px;letter-spacing:1px;cursor:pointer;'
            + (_advListFilter==='open'
                ? 'background:#3a0a0a;color:#f23060;border:1px solid #5a0e0e;'
                : 'background:#1a1a1a;color:#666;border:1px solid #2a2a2a;')
            + '">OPEN ('+openCount+')</span>'
        + ' <span onclick="_setAdvListFilter(\'resolved\')" '
            + 'style="padding:4px 10px;border-radius:10px;font-size:10px;letter-spacing:1px;cursor:pointer;margin-left:4px;'
            + (_advListFilter==='resolved'
                ? 'background:#1a2e00;color:#c8f230;border:1px solid #3a5a00;'
                : 'background:#1a1a1a;color:#666;border:1px solid #2a2a2a;')
            + '">RESOLVED ('+resolvedCount+')</span>'
        + ' <span onclick="openAddAdvisory(\''+car.id+'\')" '
            + 'style="padding:4px 10px;border-radius:10px;font-size:10px;letter-spacing:1px;cursor:pointer;'
            + 'background:#1a1a1a;color:#c8f230;border:1px solid #3a5a00;margin-left:auto;float:right;">+ Add</span>';
    }

    var items = (_advListFilter === 'open' ? getOpenAdvisories(car) : getResolvedAdvisories(car))
      .slice()
      .sort(function(a,b){
        var rank = { red:0, amber:1, blue:2 };
        if(rank[a.severity] !== rank[b.severity]) return rank[a.severity] - rank[b.severity];
        return (b.flaggedDate||'').localeCompare(a.flaggedDate||'');
      });

    if(items.length === 0){
      listEl.innerHTML = '<div style="padding:24px;text-align:center;color:#666;font-size:12px;">'
        + (_advListFilter === 'open' ? 'No open advisories.' : 'No resolved advisories yet.')
        + '</div>';
      return;
    }

    listEl.innerHTML = items.map(function(a){
      var bgColor, sevColor, sevLabel;
      if(a.severity === 'red'){
        bgColor = '#f23060'; sevColor = '#f23060'; sevLabel = '🔴 Action needed';
      } else if(a.severity === 'amber'){
        bgColor = '#f2a830'; sevColor = '#f2a830'; sevLabel = '🟠 Watch';
      } else {
        bgColor = '#30c8f2'; sevColor = '#30c8f2'; sevLabel = '🔵 FYI';
      }

      var statusPill = '';
      if(a.status === 'resolved'){
        statusPill = '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:9px;letter-spacing:1px;margin-top:6px;'
          + 'background:#1a2e00;color:#c8f230;border:1px solid #3a5a00;">✓ Resolved '+_fmtDate(a.resolvedAt)+'</span>';
      } else if(_isSnoozed(a)){
        statusPill = '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:9px;letter-spacing:1px;margin-top:6px;'
          + 'background:#1a1a3a;color:#a8a8ff;border:1px solid #3a3a5a;">😴 Snoozed until '+_fmtDate(a.snoozeUntil)+'</span>';
      } else if(a.bookedFor){
        statusPill = '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:9px;letter-spacing:1px;margin-top:6px;'
          + 'background:#1a2e3a;color:#30c8f2;border:1px solid #1e4a5a;">📅 Booked for '+_fmtDate(a.bookedFor)+'</span>';
      } else {
        statusPill = '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:9px;letter-spacing:1px;margin-top:6px;'
          + 'background:#3a0a0a;color:#f23060;border:1px solid #5a0e0e;">OPEN</span>';
      }

      // v118a: tap shows alert "Detail view coming in v118b". Delete button works.
      return '<div style="background:#222;border:1px solid #2a2a2a;border-radius:6px;padding:11px 12px;margin-bottom:8px;border-left:4px solid '+bgColor+';">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:6px;">'
        +   '<span style="font-size:9px;letter-spacing:2px;text-transform:uppercase;font-weight:700;color:'+sevColor+';">'+sevLabel+'</span>'
        +   '<span style="font-size:10px;color:#666;">'+_fmtDate(a.flaggedDate)+'</span>'
        + '</div>'
        + '<div style="font-size:12px;color:#efefef;line-height:1.4;margin-bottom:4px;">'+_escape(a.text)+'</div>'
        + (a.source ? '<div style="font-size:10px;color:#666;font-style:italic;">'+_escape(a.source)+'</div>' : '')
        + statusPill
        + '<div style="margin-top:8px;display:flex;gap:6px;">'
        +   '<button onclick="openAdvisoryDetail(\''+a.id+'\')" '
        +     'style="background:transparent;border:1px solid #2a2a2a;color:#888;padding:5px 10px;border-radius:4px;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;cursor:pointer;">Open</button>'
        +   '<button onclick="deleteAdvisory(\''+a.id+'\')" '
        +     'style="background:transparent;border:1px solid #2a1a1a;color:#666;padding:5px 10px;border-radius:4px;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;cursor:pointer;margin-left:auto;">Delete</button>'
        + '</div>'
        + '</div>';
    }).join('');
  }

  // ── Detail view (v118b) ──────────────────────────────────────

  var _detailAdvId = null;

  function _sevMeta(sev){
    if(sev === 'red')   return { emoji:'🔴', label:'Action needed', color:'#f23060', bg:'#3a0a0a', border:'#5a0e0e', dot:'#f23060' };
    if(sev === 'amber') return { emoji:'🟠', label:'Watch',         color:'#f2a830', bg:'#3a2a00', border:'#5a3a00', dot:'#f2a830' };
    return                      { emoji:'🔵', label:'FYI',           color:'#30c8f2', bg:'#0a2030', border:'#1e4a5a', dot:'#30c8f2' };
  }

  function _isSnoozed(a){
    return a.snoozeUntil && a.snoozeUntil >= new Date().toISOString().split('T')[0];
  }

  function _advStatusPill(a){
    if(a.status === 'resolved'){
      return '<span style="display:inline-block;padding:4px 12px;border-radius:100px;font-size:10px;letter-spacing:2px;'
        + 'background:#1a2e00;color:#c8f230;border:1px solid #3a5a00;">✓ RESOLVED · '+_fmtDate(a.resolvedAt)+'</span>';
    }
    if(_isSnoozed(a)){
      return '<span style="display:inline-block;padding:4px 12px;border-radius:100px;font-size:10px;letter-spacing:2px;'
        + 'background:#1a1a3a;color:#a8a8ff;border:1px solid #3a3a5a;">😴 SNOOZED UNTIL '+_fmtDate(a.snoozeUntil)+'</span>';
    }
    if(a.bookedFor){
      return '<span style="display:inline-block;padding:4px 12px;border-radius:100px;font-size:10px;letter-spacing:2px;'
        + 'background:#1a2e3a;color:#30c8f2;border:1px solid #1e4a5a;">📅 BOOKED FOR '+_fmtDate(a.bookedFor)+'</span>';
    }
    return '<span style="display:inline-block;padding:4px 12px;border-radius:100px;font-size:10px;letter-spacing:2px;'
      + 'background:#3a0a0a;color:#f23060;border:1px solid #5a0e0e;">OPEN</span>';
  }

  function _resolveLabel(a){
    if(a.resolvedBy === 'invoice') return 'Fixed — '+(a.resolvedReason||'linked invoice');
    if(a.resolvedBy === 'diy')     return 'Fixed myself (DIY)'+(a.resolvedReason ? ' — '+a.resolvedReason : '');
    if(a.resolvedBy === 'false')   return 'False alarm / not an issue'+(a.resolvedReason ? ' — '+a.resolvedReason : '');
    return 'Resolved';
  }

  function _buildTimeline(a){
    var items = [];
    items.push({ date: a.flaggedDate, icon:'🚩', text:'Flagged'+(a.source ? ' by '+a.source : '') });
    (a.notes||[]).forEach(function(n){
      items.push({ date: n.date, icon:'📝', text: n.text });
    });
    if(a.bookedFor){
      items.push({ date: a.bookedAt || a.flaggedDate, icon:'📅', text:'Booked for '+_fmtDate(a.bookedFor)+(a.bookedNote ? ' — '+a.bookedNote : '') });
    }
    if(a.status === 'resolved'){
      items.push({ date: a.resolvedAt, icon:'✓', text: _resolveLabel(a) });
    }
    items.sort(function(x,y){ return (x.date||'').localeCompare(y.date||''); });
    return items.map(function(it){
      return '<div style="display:flex;gap:10px;margin-bottom:10px;font-size:12px;">'
        + '<div style="flex-shrink:0;width:18px;text-align:center;">'+it.icon+'</div>'
        + '<div style="flex:1;"><div style="font-size:10px;color:#666;margin-bottom:2px;">'+_fmtDate(it.date)+'</div>'
        + '<div style="color:#ccc;line-height:1.4;">'+_escape(it.text)+'</div></div>'
        + '</div>';
    }).join('');
  }

  function openAdvisoryDetail(advId){
    var car = _findCar(_advListCarId);
    if(!car) return;
    var adv = (car.advisories||[]).find(function(a){ return a.id === advId; });
    if(!adv){ alert('Advisory not found.'); return; }
    _detailAdvId = advId;
    _renderAdvisoryDetail();
    var ov = document.getElementById('advisoryDetailModal');
    if(ov) ov.classList.add('active');
  }

  function _renderAdvisoryDetail(){
    var car = _findCar(_advListCarId);
    if(!car) return;
    var adv = (car.advisories||[]).find(function(a){ return a.id === _detailAdvId; });
    if(!adv) return;
    var sm = _sevMeta(adv.severity);

    var sevRow = document.getElementById('advDetailSevRow');
    if(sevRow){
      sevRow.innerHTML = '<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:'+sm.dot+';margin-right:8px;vertical-align:middle;"></span>'
        + '<span style="font-size:11px;letter-spacing:2px;color:'+sm.color+';font-weight:700;">'+sm.emoji+' '+sm.label.toUpperCase()+'</span>'
        + '<span style="float:right;font-size:11px;color:#666;">'+_fmtDate(adv.flaggedDate)+'</span>';
    }
    var textEl = document.getElementById('advDetailText');
    if(textEl) textEl.textContent = adv.text;
    var srcEl = document.getElementById('advDetailSource');
    if(srcEl) srcEl.textContent = adv.source || '';
    var pillEl = document.getElementById('advDetailStatus');
    if(pillEl) pillEl.innerHTML = _advStatusPill(adv);
    var tlEl = document.getElementById('advDetailTimeline');
    if(tlEl) tlEl.innerHTML = _buildTimeline(adv);

    // hide all popups on re-render
    ['advPopupBooked','advPopupNote','advPopupSnooze','advPopupResolve'].forEach(function(id){
      var el = document.getElementById(id);
      if(el) el.classList.remove('show');
    });

    // hide actions once resolved
    var actionsEl = document.getElementById('advDetailActions');
    if(actionsEl) actionsEl.style.display = (adv.status === 'resolved') ? 'none' : 'grid';

    // pre-fill booked fields
    var bd = document.getElementById('advBookedDate');
    if(bd) bd.value = adv.bookedFor || new Date().toISOString().split('T')[0];
    var bn = document.getElementById('advBookedNote');
    if(bn) bn.value = adv.bookedNote || '';

    // populate invoice picker from this car's real expenses
    var sel = document.getElementById('advResolveInvoice');
    if(sel){
      var exps = (car.expenses||[]).slice().sort(function(a,b){ return (b.date||'').localeCompare(a.date||''); });
      sel.innerHTML = exps.length
        ? exps.map(function(e){
            return '<option value="'+_escape(e.id)+'">'+_escape(e.desc||e.category||'Expense')+' — R'+e.amt+' — '+_fmtDate(e.date)+'</option>';
          }).join('')
        : '<option value="">(no expenses logged on this car)</option>';
    }
  }

  function _advTogglePopup(name){
    var ids = { booked:'advPopupBooked', note:'advPopupNote', snooze:'advPopupSnooze', resolve:'advPopupResolve' };
    Object.keys(ids).forEach(function(k){
      var el = document.getElementById(ids[k]);
      if(!el) return;
      if(k === name) el.classList.toggle('show');
      else el.classList.remove('show');
    });
  }

  function _advResolveReasonChanged(){
    var v = document.getElementById('advResolveReason').value;
    var row = document.getElementById('advResolveInvoiceRow');
    if(row) row.style.display = (v === 'invoice') ? 'block' : 'none';
  }

  function saveAdvBookedFor(){
    var car = _findCar(_advListCarId);
    var adv = car && (car.advisories||[]).find(function(a){ return a.id === _detailAdvId; });
    if(!adv) return;
    var date = document.getElementById('advBookedDate').value;
    var note = (document.getElementById('advBookedNote').value||'').trim();
    if(!date){ alert('Pick a date.'); return; }
    adv.bookedFor = date;
    adv.bookedNote = note;
    adv.bookedAt = new Date().toISOString().split('T')[0];
    adv.snoozeUntil = null; // booking supersedes a snooze
    _saveCar(car);
    _renderAdvisoryDetail();
    _renderAdvisoryList();
    if(typeof renderCars === 'function') renderCars();
  }

  function saveAdvNote(){
    var car = _findCar(_advListCarId);
    var adv = car && (car.advisories||[]).find(function(a){ return a.id === _detailAdvId; });
    if(!adv) return;
    var text = (document.getElementById('advNoteText').value||'').trim();
    if(!text){ alert('Write a note first.'); return; }
    if(!Array.isArray(adv.notes)) adv.notes = [];
    adv.notes.push({ date: new Date().toISOString().split('T')[0], text: text });
    document.getElementById('advNoteText').value = '';
    _saveCar(car);
    _renderAdvisoryDetail();
    _renderAdvisoryList();
  }

  function saveAdvSnooze(){
    var car = _findCar(_advListCarId);
    var adv = car && (car.advisories||[]).find(function(a){ return a.id === _detailAdvId; });
    if(!adv) return;
    var days = parseInt(document.getElementById('advSnoozeSelect').value, 10);
    var d = new Date();
    d.setDate(d.getDate() + days);
    adv.snoozeUntil = d.toISOString().split('T')[0];
    if(!Array.isArray(adv.notes)) adv.notes = [];
    adv.notes.push({ date: new Date().toISOString().split('T')[0], text: '😴 Snoozed '+days+' day'+(days>1?'s':'')+' (until '+_fmtDate(adv.snoozeUntil)+')' });
    _saveCar(car);
    _renderAdvisoryDetail();
    _renderAdvisoryList();
    if(typeof renderCars === 'function') renderCars();
  }

  function saveAdvResolve(){
    var car = _findCar(_advListCarId);
    var adv = car && (car.advisories||[]).find(function(a){ return a.id === _detailAdvId; });
    if(!adv) return;
    var reason = document.getElementById('advResolveReason').value;
    if(!reason){ alert('Choose how it was resolved.'); return; }

    var resolvedReason = '';
    if(reason === 'invoice'){
      var sel = document.getElementById('advResolveInvoice');
      var expId = sel.value;
      if(!expId){ alert('Pick the expense it was fixed under.'); return; }
      adv.resolvedByInvoiceId = expId;
      var exp = (car.expenses||[]).find(function(e){ return e.id === expId; });
      resolvedReason = exp ? (exp.desc||exp.category||'')+' — R'+exp.amt+' — '+_fmtDate(exp.date) : 'linked invoice';
    } else {
      adv.resolvedByInvoiceId = null;
      resolvedReason = (document.getElementById('advResolveExtra').value||'').trim();
    }

    adv.status = 'resolved';
    adv.resolvedAt = new Date().toISOString().split('T')[0];
    adv.resolvedBy = reason;
    adv.resolvedReason = resolvedReason;
    adv.snoozeUntil = null;
    _saveCar(car);
    _renderAdvisoryDetail();
    _renderAdvisoryList();
    if(typeof renderCars === 'function') renderCars();
  }

  function deleteAdvisory(advId){
    var car = _findCar(_advListCarId);
    if(!car || !Array.isArray(car.advisories)) return;
    var adv = car.advisories.find(function(a){ return a.id === advId; });
    if(!adv) return;
    if(!confirm('Delete this advisory?\n\n"'+adv.text+'"\n\nThis removes the record entirely. (Use Mark Resolved instead if you want to keep it in history — coming v118b.)')) return;
    car.advisories = car.advisories.filter(function(a){ return a.id !== advId; });
    _saveCar(car);
    _renderAdvisoryList();
    if(typeof renderCars === 'function') renderCars();
  }

  // ── Add Advisory modal ───────────────────────────────────────

  var _addAdvCarId = null;
  var _addAdvSeverity = 'amber'; // default

  function openAddAdvisory(carId){
    var car = _findCar(carId);
    if(!car){ alert('Car not found.'); return; }
    _addAdvCarId = carId;
    _addAdvSeverity = 'amber';

    var carLabelEl = document.getElementById('addAdvisoryCarLabel');
    var textEl     = document.getElementById('addAdvisoryText');
    var sourceEl   = document.getElementById('addAdvisorySource');
    var dateEl     = document.getElementById('addAdvisoryDate');

    if(carLabelEl) carLabelEl.textContent = car.name + (car.plate ? ' · '+car.plate : '');
    if(textEl)     textEl.value = '';
    if(sourceEl)   sourceEl.value = '';
    if(dateEl)     dateEl.value = new Date().toISOString().split('T')[0];

    _renderSeverityPills();

    var ov = document.getElementById('addAdvisoryModal');
    if(ov) ov.classList.add('active');
  }

  function _selectSeverity(sev){
    _addAdvSeverity = sev;
    _renderSeverityPills();
  }

  function _renderSeverityPills(){
    var el = document.getElementById('addAdvisorySeverityPills');
    if(!el) return;
    var sevs = [
      { id:'red',   label:'🔴 Action needed', color:'#f23060', bg:'#3a0a0a', border:'#5a0e0e' },
      { id:'amber', label:'🟠 Watch',         color:'#f2a830', bg:'#3a2a00', border:'#5a3a00' },
      { id:'blue',  label:'🔵 FYI',           color:'#30c8f2', bg:'#0a2030', border:'#1e4a5a' }
    ];
    el.innerHTML = sevs.map(function(s){
      var sel = (s.id === _addAdvSeverity);
      return '<span onclick="_selectSeverity(\''+s.id+'\')" '
        + 'style="display:inline-block;padding:6px 12px;border-radius:6px;font-size:11px;letter-spacing:1px;cursor:pointer;margin-right:6px;margin-bottom:6px;'
        + (sel
            ? 'background:'+s.bg+';color:'+s.color+';border:1px solid '+s.border+';font-weight:700;'
            : 'background:transparent;color:#666;border:1px solid #2a2a2a;')
        + '">'+s.label+'</span>';
    }).join('');
  }

  function saveAdvisory(){
    var car = _findCar(_addAdvCarId);
    if(!car){ alert('Car not found.'); return; }
    var text   = (document.getElementById('addAdvisoryText').value||'').trim();
    var source = (document.getElementById('addAdvisorySource').value||'').trim();
    var date   = document.getElementById('addAdvisoryDate').value || new Date().toISOString().split('T')[0];

    if(!text){ alert('Please describe the advisory.'); return; }

    if(!Array.isArray(car.advisories)) car.advisories = [];
    car.advisories.push({
      id: 'adv_' + (typeof uid==='function' ? uid() : Math.random().toString(36).slice(2,9)),
      severity: _addAdvSeverity,
      text: text,
      flaggedDate: date,
      source: source,
      status: 'open',
      bookedFor: null,
      bookedNote: null,
      notes: [],
      resolvedAt: null,
      resolvedBy: null,
      resolvedByInvoiceId: null,
      resolvedReason: null,
      snoozeUntil: null
    });

    _saveCar(car);
    if(typeof closeModal === 'function') closeModal('addAdvisoryModal');
    if(typeof renderCars === 'function') renderCars();
    // Re-render the list if it's open
    if(document.getElementById('advisoryListModal') && document.getElementById('advisoryListModal').classList.contains('active')){
      _renderAdvisoryList();
    }
  }

  // ── Export to window ────────────────────────────────────────

  window.getCarAdvisories       = getCarAdvisories;
  window.getOpenAdvisories      = getOpenAdvisories;
  window.getResolvedAdvisories  = getResolvedAdvisories;
  window.getAdvisoryBadgeState  = getAdvisoryBadgeState;
  window.renderAdvisoryBadge    = renderAdvisoryBadge;
  window.renderAdvisoryMoreButton = renderAdvisoryMoreButton;
  window.openAdvisoryList       = openAdvisoryList;
  window.openAddAdvisory        = openAddAdvisory;
  window.saveAdvisory           = saveAdvisory;
  window.deleteAdvisory         = deleteAdvisory;
  window._setAdvListFilter      = _setAdvListFilter;
  window._selectSeverity        = _selectSeverity;
  window.openAdvisoryDetail     = openAdvisoryDetail;
  window._advTogglePopup        = _advTogglePopup;
  window._advResolveReasonChanged = _advResolveReasonChanged;
  window.saveAdvBookedFor       = saveAdvBookedFor;
  window.saveAdvNote            = saveAdvNote;
  window.saveAdvSnooze          = saveAdvSnooze;
  window.saveAdvResolve         = saveAdvResolve;

})();
