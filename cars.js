// Cars: service tracker, intelligence, licence tracker


function loadCarsData(){ try{ return JSON.parse(lsGet(CARS_KEY)||'[]'); }catch(e){ return []; } }
function saveCarsData(data){ lsSet(CARS_KEY, JSON.stringify(data)); }
function loadDrivers(){ try{ return JSON.parse(lsGet(DRIVER_KEY)||'[]'); }catch(e){ return []; } }
function saveDrivers(data){ lsSet(DRIVER_KEY, JSON.stringify(data)); }

// ── countdown helper ──
function countdownBadge(dateStr, label){
  if(!dateStr) return '';
  var today = new Date(); today.setHours(0,0,0,0);
  var d = new Date(dateStr+'T00:00:00');
  var diff = Math.round((d - today)/86400000);
  if(diff < 0)   return '<span style="color:#f23060;font-size:10px;letter-spacing:1px;">⚠ '+label+' overdue '+Math.abs(diff)+'d</span>';
  if(diff === 0) return '<span style="color:#f23060;font-size:10px;letter-spacing:1px;">⚠ '+label+' due TODAY!</span>';
  if(diff <= 30) return '<span style="color:#f2a830;font-size:10px;letter-spacing:1px;">⏰ '+label+' in '+diff+'d</span>';
  if(diff <= 60) return '<span style="color:#d4a800;font-size:10px;letter-spacing:1px;">'+label+' in '+diff+'d</span>';
  return '<span style="color:#5a8800;font-size:10px;letter-spacing:1px;">'+label+' in '+diff+'d</span>';
}


// ══ CAR SERVICE INTELLIGENCE ══
function calcNextService(car){
  // If nextService date is manually set, use it as source of truth
  if(car.nextService){
    var now0 = new Date();
    var svcDate0 = new Date(car.nextService+'T00:00:00');
    var days0 = Math.round((svcDate0-now0)/86400000);
    return { daysUntilNext: days0, kmUntilNext: null, nextType: car.lastServiceType||'Minor',
             reason: car.nextService+' (manually set)', minorDue: null, majorDue: null };
  }
  // Returns { minorDue: {date, km, reason}, majorDue: {date, km, reason}, nextType, daysUntilNext, kmUntilNext }
  var lastDate  = car.lastServiceDate ? new Date(car.lastServiceDate+'T00:00:00') : null;
  var lastKm    = Number(car.lastServiceKm||0);
  var curKm     = Number(car.kilometers||0);
  var carpool   = !!car.carpoolUsage;
  var lastType  = car.lastServiceType || 'Minor';

  var minorKmInterval = carpool ? 5000 : 10000;
  var majorKmInterval = 40000;
  var minorMonths     = 6;
  var majorMonths     = 24;

  var result = { minorDue:null, majorDue:null, nextType:'Minor', daysUntilNext:null, kmUntilNext:null, reason:'' };
  if(!lastDate && !lastKm) return result;

  var now = new Date();

  // Minor service: 6 months OR minorKmInterval km — whichever first
  var minorByDate = null, minorByKm = null;
  if(lastDate){
    minorByDate = new Date(lastDate);
    minorByDate.setMonth(minorByDate.getMonth() + minorMonths);
  }
  if(lastKm){ minorByKm = lastKm + minorKmInterval; }

  // Major service: 24 months OR 40,000km — whichever first
  var majorByDate = null, majorByKm = null;
  if(lastDate){
    majorByDate = new Date(lastDate);
    majorByDate.setMonth(majorByDate.getMonth() + majorMonths);
  }
  if(lastKm){ majorByKm = lastKm + majorKmInterval; }

  // Days until minor
  var daysMinor = minorByDate ? Math.round((minorByDate-now)/86400000) : null;
  var kmMinor   = minorByKm   ? minorByKm - curKm : null;

  // Days until major
  var daysMajor = majorByDate ? Math.round((majorByDate-now)/86400000) : null;
  var kmMajor   = majorByKm   ? majorByKm - curKm : null;

  // Which comes first — minor or major?
  // Convert km to approximate days (assume ~50km/day average for carpooler)
  var kmPerDay = carpool ? 60 : 30;
  var daysMinorKm = kmMinor != null ? Math.round(kmMinor/kmPerDay) : null;
  var daysMajorKm = kmMajor != null ? Math.round(kmMajor/kmPerDay) : null;

  var effectiveMinor = Math.min(
    daysMinor != null ? daysMinor : 9999,
    daysMinorKm != null ? daysMinorKm : 9999
  );
  var effectiveMajor = Math.min(
    daysMajor != null ? daysMajor : 9999,
    daysMajorKm != null ? daysMajorKm : 9999
  );

  // Minor reason
  var minorReason = '';
  if(daysMinor != null && (daysMinorKm == null || daysMinor <= daysMinorKm)){
    minorReason = minorByDate.toISOString().slice(0,10)+' (6 month interval)';
  } else if(daysMinorKm != null){
    minorReason = fmtR(minorByKm).replace('R','')+' km ('+(carpool?'5,000':'10,000')+'km interval)';
  }

  // Major reason
  var majorReason = '';
  if(daysMajor != null && (daysMajorKm == null || daysMajor <= daysMajorKm)){
    majorReason = majorByDate.toISOString().slice(0,10)+' (24 month interval)';
  } else if(daysMajorKm != null){
    majorReason = majorByKm.toLocaleString('en-ZA')+' km (40,000km interval)';
  }

  result.minorDue = { daysLeft: daysMinor, kmLeft: kmMinor, reason: minorReason, effectiveDays: effectiveMinor };
  result.majorDue = { daysLeft: daysMajor, kmLeft: kmMajor, reason: majorReason, effectiveDays: effectiveMajor };

  if(effectiveMajor < effectiveMinor){
    result.nextType = 'Major';
    result.daysUntilNext = effectiveMajor;
    result.kmUntilNext = kmMajor;
    result.reason = majorReason;
  } else {
    result.nextType = 'Minor';
    result.daysUntilNext = effectiveMinor;
    result.kmUntilNext = kmMinor;
    result.reason = minorReason;
  }

  return result;
}

function renderCars(){
  var cars = loadCarsData();
  var container = document.getElementById('carsContainer');
  if(!container) return;

  if(cars.length === 0){
    container.innerHTML = '<div style="padding:48px 16px;text-align:center;color:#333;font-size:13px;background:var(--surface);border:1px dashed var(--border);border-radius:10px;">No cars added yet — tap <strong style="color:#f2a830;">+ Add Car</strong> to get started</div>';
  } else {
    container.innerHTML = '';
    cars.forEach(function(car){
      var expenses = car.expenses || [];
      var total = expenses.reduce(function(s,e){ return s+Number(e.amt||0); },0);
      var lastSvc  = car.lastService || '';
      var nextSvc  = car.nextService || '';
      var licExp   = car.licenceExpiry || '';
      var svcCd    = countdownBadge(nextSvc, 'Service');
      var licCd    = countdownBadge(licExp,  'Licence');
      var kmDisplay = car.kilometers ? Number(car.kilometers).toLocaleString('en-ZA')+' km' : '—';
      var svcKmDisplay = car.serviceKm ? Number(car.serviceKm).toLocaleString('en-ZA')+' km' : '—';

      // Category totals
      var catMap = {};
      expenses.forEach(function(e){ var c=e.category||'💡 Other'; catMap[c]=(catMap[c]||0)+Number(e.amt||0); });
      var catPills = Object.keys(catMap).map(function(c){
        return '<span style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:100px;padding:3px 10px;font-size:10px;color:#888;white-space:nowrap;">'+c+' <strong style="color:#f2a830;">R'+catMap[c].toLocaleString('en-ZA')+'</strong></span>';
      }).join('');

      // Expense rows
      var rowsHtml = '';
      if(expenses.length === 0){
        rowsHtml = '<div style="padding:20px 16px;text-align:center;color:#333;font-size:12px;">No expenses logged yet</div>';
      } else {
        expenses.slice().sort(function(a,b){ return b.date.localeCompare(a.date); }).forEach(function(e){
          rowsHtml +=
            '<div style="display:grid;grid-template-columns:1fr auto auto auto;gap:8px;align-items:center;padding:10px 16px;border-bottom:1px solid #161616;font-size:12px;">'
            +'<div>'
              +'<div style="color:#ccc;font-size:12px;">'+(e.category||'💡 Other')+'<span style="color:#555;font-size:11px;margin-left:6px;">'+(e.desc||'')+'</span></div>'
              +'<div style="color:#555;font-size:10px;margin-top:2px;">'+e.date+(e.km?' · <span style="color:#4a7a00;">'+Number(e.km).toLocaleString('en-ZA')+' km</span>':'')+'</div>'
            +'</div>'
            +'<span style="color:#f2a830;font-weight:700;font-size:13px;white-space:nowrap;">R'+Number(e.amt).toLocaleString('en-ZA')+'</span>'
            +'<span onclick="openEditExpense(\''+car.id+'\',\''+e.id+'\')" style="cursor:pointer;color:#444;font-size:14px;padding:2px 6px;">✏️</span>'
            +'<span onclick="deleteExpense(\''+car.id+'\',\''+e.id+'\')" style="cursor:pointer;color:#444;font-size:14px;padding:2px 6px;">🗑</span>'
            +'</div>';
        });
      }

      var card = document.createElement('div');
      card.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:20px;';
      card.innerHTML =
        // Header
        '<div style="background:#111;padding:14px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">'
          +'<div>'
            +'<div style="font-family:\'Syne\',sans-serif;font-weight:800;font-size:17px;color:#efefef;">'+car.name+'</div>'
            +(car.year||car.note?'<div style="font-size:10px;color:#555;letter-spacing:1px;margin-top:2px;">'+(car.year?car.year+' · ':'')+( car.note||'')+'</div>':'')
            +(car.plate?'<div style="font-size:11px;color:#f2a830;letter-spacing:2px;margin-top:4px;font-weight:700;">🔖 '+car.plate+'</div>':'')
            +(car.vin?'<div style="font-size:9px;color:#444;letter-spacing:1px;margin-top:2px;">VIN: '+car.vin+'</div>':'')
            +(car.engineNo?'<div style="font-size:9px;color:#444;letter-spacing:1px;margin-top:2px;">Engine: '+car.engineNo+'</div>':'')
          +'</div>'
          +'<div style="text-align:right;">'
            +'<div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#555;margin-bottom:2px;">Total Spent</div>'
            +'<div style="font-family:\'Syne\',sans-serif;font-weight:800;font-size:22px;color:#f2a830;">R'+total.toLocaleString('en-ZA')+'</div>'
          +'</div>'
        +'</div>'

        // 4-cell status grid: Last Service | Next Service | Licence Disc | Kilometres
        +'<div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid var(--border);">'
          +'<div style="padding:12px 16px;border-right:1px solid var(--border);border-bottom:1px solid var(--border);">'
            +'<div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#555;margin-bottom:4px;">Last Service</div>'
            +'<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:14px;color:#efefef;">'+(lastSvc?formatDisplayDate(lastSvc):'<span style="color:#333;">—</span>')+'</div>'
            +(car.serviceKm?'<div style="font-size:10px;color:#4a7a00;margin-top:2px;">@ '+svcKmDisplay+'</div>':'')
          +'</div>'
          +'<div style="padding:12px 16px;border-bottom:1px solid var(--border);">'
            +'<div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#555;margin-bottom:4px;">Next Service Due</div>'
            +'<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:14px;color:#c8f230;">'+(nextSvc?formatDisplayDate(nextSvc):'<span style="color:#333;">—</span>')+'</div>'
            +(car.nextServiceKm?'<div style="font-size:10px;color:#5a8800;margin-top:2px;">or '+Number(car.nextServiceKm).toLocaleString('en-ZA')+' km</div>':'')
            +(svcCd?'<div style="margin-top:2px;">'+svcCd+'</div>':'')
          +'</div>'
          +'<div style="padding:12px 16px;border-right:1px solid var(--border);">'
            +'<div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#555;margin-bottom:4px;">Licence Disc</div>'
            +'<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:14px;color:'+(licExp?'#f2a830':'#333')+'">'+(licExp?formatDisplayDate(licExp):'<span style="color:#333;">—</span>')+'</div>'
            +(licCd?'<div style="margin-top:2px;">'+licCd+'</div>':'')
          +'</div>'
          +'<div style="padding:12px 16px;">'
            +'<div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#555;margin-bottom:4px;">Kilometres</div>'
            +'<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:14px;color:#efefef;">'+kmDisplay+'</div>'
          +'</div>'
        +'</div>'

        // Action buttons
        +(function(){
          var today2 = new Date(); today2.setHours(0,0,0,0);
          var svcDue = nextSvc ? new Date(nextSvc+'T00:00:00') : null;
          var showSvcBtn = svcDue && svcDue <= today2;
          return '<div style="display:flex;gap:8px;padding:10px 16px;border-bottom:1px solid var(--border);flex-wrap:wrap;">'
            +(showSvcBtn ? '<button onclick="openLogServiceToday(\''+car.id+'\')" style="background:#1a0000;border:2px solid #f23060;border-radius:6px;padding:7px 14px;color:#f23060;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;animation:pulse-red 1.5s infinite;" onmouseover="this.style.opacity=\'.8\'" onmouseout="this.style.opacity=\'1\'">✅ Log Service Today</button>' : '')
          +(showSvcBtn ? '<button onclick="openRescheduleService(\''+car.id+'\')" style="background:#0a0a1a;border:1px solid #555;border-radius:6px;padding:7px 14px;color:#888;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;" onmouseover="this.style.opacity=\'.8\'" onmouseout="this.style.opacity=\'1\'">📅 Reschedule</button>' : '')
            +'<button onclick="openAddExpense(\''+car.id+'\')" style="background:#1a1a00;border:1px solid #f2a830;border-radius:6px;padding:7px 14px;color:#f2a830;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;" onmouseover="this.style.opacity=\'.8\'" onmouseout="this.style.opacity=\'1\'">+ Log Expense</button>'
            +'<button onclick="openServiceModal(\''+car.id+'\')" style="background:#0d1a00;border:1px solid #3a5a00;border-radius:6px;padding:7px 14px;color:#8ab820;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;" onmouseover="this.style.opacity=\'.8\'" onmouseout="this.style.opacity=\'1\'">📅 Dates & km</button>'
            +'<button onclick="openEditCarModal(\''+car.id+'\')" style="background:#1a1000;border:1px solid #4a3000;border-radius:6px;padding:7px 14px;color:#888;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;" onmouseover="this.style.opacity=\'.8\'" onmouseout="this.style.opacity=\'1\'">✏️ Edit Car</button>'
            +'<button onclick="exportCarPDF(\''+car.id+'\')" style="background:#0a0a1a;border:1px solid #3a3a7a;border-radius:6px;padding:7px 14px;color:#8888dd;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;" onmouseover="this.style.opacity=\'.8\'" onmouseout="this.style.opacity=\'1\'">📄 Export PDF</button>'
            +'<button onclick="deleteCar(\''+car.id+'\')" style="margin-left:auto;background:none;border:1px solid #2a1a1a;border-radius:6px;padding:7px 12px;color:#555;font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;cursor:pointer;" onmouseover="this.style.borderColor=\'#c0392b\';this.style.color=\'#c0392b\'" onmouseout="this.style.borderColor=\'#2a1a1a\';this.style.color=\'#555\'">Remove</button>'
          +'</div>';
        })()

        // Category pills
        +(catPills?'<div style="padding:10px 16px;display:flex;flex-wrap:wrap;gap:6px;border-bottom:1px solid var(--border);">'+catPills+'</div>':'')

        // Expense rows
        +'<div>'
          +'<div style="display:grid;grid-template-columns:1fr auto auto auto;gap:8px;padding:8px 16px;border-bottom:1px solid #1a1a1a;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#555;">'
            +'<span>Description</span><span>Amount</span><span></span><span></span>'
          +'</div>'
          +rowsHtml
        +'</div>';

      container.appendChild(card);
    });
  }

  // Render driver licences section
  renderDrivers();
}

function formatDisplayDate(ds){
  if(!ds) return '—';
  var d = new Date(ds+'T00:00:00');
  return d.getDate()+' '+d.toLocaleString('en-ZA',{month:'short'})+' '+d.getFullYear();
}

function openAddCarModal(){
  document.getElementById('editCarId').value = '';
  document.getElementById('addCarModalTitle').textContent = '🚙 Add Car';
  document.getElementById('addCarSaveBtn').textContent = 'Add Car';
  document.getElementById('carName').value = '';
  document.getElementById('carYear').value = '';
  document.getElementById('carNote').value = '';
  document.getElementById('carVin').value = '';
  document.getElementById('carEngineNo').value = '';
  document.getElementById('carPlate').value = '';
  document.getElementById('carLicenceExpiry').value = '';
  document.getElementById('carKm').value = '';
  document.getElementById('carNextServiceKm').value = '';
  document.getElementById('carServiceTargetCost').value = '';
  populateCarMaintDropdown('');
  document.getElementById('carLastServiceDate').value = '';
  document.getElementById('carLastServiceKm').value = '';
  document.getElementById('carLastServiceType').value = 'Minor';
  document.getElementById('carCarpoolUsage').checked = false;
  document.getElementById('addCarModal').classList.add('active');
  setTimeout(function(){ document.getElementById('carName').focus(); }, 100);
}


function populateCarMaintDropdown(selectedId){
  var sel = document.getElementById('carMaintenanceFundId');
  if(!sel) return;
  // Build list: original maint fund + all custom maint cards
  var options = '<option value="">— None —</option>';
  options += '<option value="__maint__"'+(selectedId==='__maint__'?' selected':'')+'>Maintenance Fund (original)</option>';
  try{
    var cards = JSON.parse(lsGet(CUSTOM_MAINT_KEY)||'[]');
    cards.forEach(function(c){
      options += '<option value="'+c.id+'"'+(selectedId===c.id?' selected':'')+'>'+c.name+'</option>';
    });
  }catch(e){}
  sel.innerHTML = options;
}

function openEditCarModal(carId){
  var car = loadCarsData().find(function(c){ return c.id === carId; });
  if(!car) return;
  document.getElementById('editCarId').value = carId;
  document.getElementById('addCarModalTitle').textContent = '✏️ Edit Car';
  document.getElementById('addCarSaveBtn').textContent = 'Save Changes';
  document.getElementById('carName').value = car.name || '';
  document.getElementById('carYear').value = car.year || '';
  document.getElementById('carNote').value = car.note || '';
  document.getElementById('carVin').value = car.vin || '';
  document.getElementById('carEngineNo').value = car.engineNo || '';
  document.getElementById('carPlate').value = car.plate || '';
  document.getElementById('carLicenceExpiry').value = car.licenceExpiry || '';
  document.getElementById('carKm').value = car.kilometers || '';
  document.getElementById('carNextServiceKm').value = car.nextServiceKm || '';
  document.getElementById('carServiceTargetCost').value = car.serviceTargetCost || '';
  populateCarMaintDropdown(car.maintenanceFundId || '');
  document.getElementById('carLastServiceDate').value = car.lastServiceDate || '';
  document.getElementById('carLastServiceKm').value = car.lastServiceKm || '';
  document.getElementById('carLastServiceType').value = car.lastServiceType || 'Minor';
  document.getElementById('carCarpoolUsage').checked = !!car.carpoolUsage;
  document.getElementById('addCarModal').classList.add('active');
}

function confirmAddCar(){
  var name = document.getElementById('carName').value.trim();
  if(!name){ alert('Please enter a car name.'); return; }
  var editId = document.getElementById('editCarId').value;
  var cars = loadCarsData();
  var carData = {
    name: name,
    year: document.getElementById('carYear').value.trim(),
    note: document.getElementById('carNote').value.trim(),
    vin:  document.getElementById('carVin').value.trim().toUpperCase(),
    engineNo: document.getElementById('carEngineNo').value.trim().toUpperCase(),
    plate: document.getElementById('carPlate').value.trim().toUpperCase(),
    licenceExpiry: document.getElementById('carLicenceExpiry').value,
    kilometers: document.getElementById('carKm').value ? Number(document.getElementById('carKm').value) : '',
    nextServiceKm: document.getElementById('carNextServiceKm').value ? Number(document.getElementById('carNextServiceKm').value) : '',
    serviceTargetCost: document.getElementById('carServiceTargetCost').value ? Number(document.getElementById('carServiceTargetCost').value) : 2000,
    maintenanceFundId: document.getElementById('carMaintenanceFundId').value || '',
    lastServiceDate: document.getElementById('carLastServiceDate').value || '',
    lastServiceKm: document.getElementById('carLastServiceKm').value ? Number(document.getElementById('carLastServiceKm').value) : '',
    lastServiceType: document.getElementById('carLastServiceType').value || 'Minor',
    carpoolUsage: document.getElementById('carCarpoolUsage').checked
  };
  if(editId){
    var idx = cars.findIndex(function(c){ return c.id === editId; });
    if(idx > -1){ Object.assign(cars[idx], carData); }
  } else {
    carData.id = uid();
    carData.lastService = '';
    carData.nextService = '';
    carData.nextServiceKm = '';
    carData.serviceKm = '';
    carData.expenses = [];
    cars.push(carData);
  }
  saveCarsData(cars);
  closeModal('addCarModal');
  renderCars();
}

function deleteCar(carId){
  if(!confirm('Remove this car and all its expense history?')) return;
  var cars = loadCarsData().filter(function(c){ return c.id !== carId; });
  saveCarsData(cars);
  renderCars();
}

function exportCarPDF(carId){
  if(typeof window.jspdf === 'undefined'){
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = function(){ buildCarPDF(carId); };
    document.head.appendChild(s);
  } else {
    buildCarPDF(carId);
  }
}

function buildCarPDF(carId){
  var car = loadCarsData().find(function(c){ return c.id === carId; });
  if(!car) return;

  // Toast
  var toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1a1a1a;border:1px solid #3a5a00;border-radius:10px;padding:14px 20px;display:flex;align-items:center;gap:12px;z-index:9999;box-shadow:0 4px 24px rgba(0,0,0,.5);min-width:240px;';
  toast.innerHTML =
    '<div style="width:18px;height:18px;border:2px solid #3a5a00;border-top-color:#c8f230;border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0;"></div>'
    +'<div><div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:13px;color:#efefef;">Generating PDF...</div>'
    +'<div style="font-size:10px;color:#555;margin-top:2px;letter-spacing:1px;">'+car.name+'</div></div>';
  if(!document.getElementById('spinStyle')){
    var sp=document.createElement('style');sp.id='spinStyle';
    sp.textContent='@keyframes spin{to{transform:rotate(360deg);}}';
    document.head.appendChild(sp);
  }
  document.body.appendChild(toast);

  setTimeout(function(){
    // Strip emojis and non-latin characters that jsPDF can't render
    function stripEmoji(str){
      return (str||'').replace(/[\u{1F000}-\u{1FFFF}|\u{2600}-\u{27FF}|\u{2B00}-\u{2BFF}|\u{FE00}-\u{FEFF}|\u{1F900}-\u{1F9FF}|\u{E000}-\u{F8FF}]/gu,'').replace(/[^\x00-\x7F]/g,'').replace(/\s+/g,' ').trim();
    }
    var expenses = car.expenses || [];
    var total = expenses.reduce(function(s,e){ return s+Number(e.amt||0); },0);
    var catMap = {};
    expenses.forEach(function(e){ var c=stripEmoji(e.category||'Other')||'Other'; catMap[c]=(catMap[c]||0)+Number(e.amt||0); });
    var sorted = expenses.slice().sort(function(a,b){ return b.date.localeCompare(a.date); });
    var printDate = new Date().toLocaleDateString('en-ZA',{day:'numeric',month:'long',year:'numeric'});

    var {jsPDF} = window.jspdf;
    var doc = new jsPDF({unit:'mm', format:'a4'});
    var W = 210, H = 297;
    var L = 16, R = W - 16;

    // Dark background
    doc.setFillColor(10,10,10); doc.rect(0,0,W,H,'F');
    // Accent top bar
    doc.setFillColor(200,242,48); doc.rect(0,0,W,2,'F');

    // Header label
    doc.setTextColor(90,136,0); doc.setFontSize(7); doc.setFont('helvetica','normal');
    doc.text('CAR REPORT', L, 12);
    doc.text(printDate.toUpperCase(), R, 12, {align:'right'});

    // Car name
    doc.setTextColor(200,242,48); doc.setFontSize(22); doc.setFont('helvetica','bold');
    doc.text(car.name, L, 22);

    // Sub info
    var subParts = [];
    if(car.year) subParts.push(car.year);
    if(car.plate) subParts.push(car.plate);
    if(car.vin) subParts.push('VIN: '+car.vin);
    if(car.engineNo) subParts.push('Eng: '+car.engineNo);
    if(car.note) subParts.push(car.note);
    doc.setTextColor(85,85,85); doc.setFontSize(8); doc.setFont('helvetica','normal');
    if(subParts.length) doc.text(subParts.join(' · '), L, 29);

    // Total cost pill (top right)
    doc.setTextColor(200,242,48); doc.setFontSize(18); doc.setFont('helvetica','bold');
    doc.text('R'+total.toLocaleString('en-ZA'), R, 22, {align:'right'});
    doc.setTextColor(85,85,85); doc.setFontSize(7); doc.setFont('helvetica','normal');
    doc.text('TOTAL SPENT', R, 27, {align:'right'});

    // Divider
    doc.setDrawColor(200,242,48); doc.setLineWidth(0.4); doc.line(L,33,R,33);

    // ── INFO BOXES ROW ──
    var y = 38;
    var boxes = [
      {label:'LAST SERVICE', val: car.lastService||'—', sub: car.serviceKm?'@ '+Number(car.serviceKm).toLocaleString('en-ZA')+' km':null},
      {label:'NEXT SERVICE', val: car.nextService||'—', valColor:[242,160,48], sub: car.nextServiceKm?'or '+Number(car.nextServiceKm).toLocaleString('en-ZA')+' km':null},
      {label:'LICENCE DISC', val: car.licenceExpiry||'—'},
      {label:'KILOMETRES', val: car.kilometers?Number(car.kilometers).toLocaleString('en-ZA')+' km':'—'},
    ];
    var bW = (R-L)/2 - 3;
    var bH = 20;
    boxes.forEach(function(b, i){
      var bx = L + (i%2)*(bW+6);
      var by = y + Math.floor(i/2)*(bH+4);
      doc.setFillColor(22,22,22); doc.setDrawColor(38,38,38); doc.setLineWidth(0.3);
      doc.roundedRect(bx, by, bW, bH, 2, 2, 'FD');
      doc.setTextColor(80,80,80); doc.setFontSize(7); doc.setFont('helvetica','normal');
      doc.text(b.label, bx+6, by+6);
      var vc = b.valColor || [239,239,239];
      doc.setTextColor(vc[0],vc[1],vc[2]); doc.setFontSize(11); doc.setFont('helvetica','bold');
      doc.text(b.val, bx+6, by+13);
      if(b.sub){
        doc.setTextColor(90,136,0); doc.setFontSize(7); doc.setFont('helvetica','normal');
        doc.text(b.sub, bx+6, by+18);
      }
    });

    y = y + 2*(bH+4) + 6;

    // ── CATEGORY BREAKDOWN ──
    doc.setTextColor(85,85,85); doc.setFontSize(7); doc.setFont('helvetica','normal');
    doc.text('EXPENSE BREAKDOWN BY CATEGORY', L, y);
    doc.setDrawColor(38,38,38); doc.setLineWidth(0.3); doc.line(L,y+2,R,y+2);
    y += 7;

    var catKeys = Object.keys(catMap);
    if(catKeys.length === 0){
      doc.setTextColor(60,60,60); doc.setFontSize(9);
      doc.text('No expenses logged', L, y+4);
      y += 12;
    } else {
      catKeys.forEach(function(c){
        var amt = catMap[c];
        var pct = total>0 ? (amt/total) : 0;
        // Bar background
        doc.setFillColor(28,28,28); doc.roundedRect(L, y, R-L, 8, 1, 1, 'F');
        // Bar fill
        var barW = Math.max(2, (R-L-2)*pct);
        doc.setFillColor(40,70,0); doc.roundedRect(L+1, y+1, barW, 6, 1, 1, 'F');
        // Category name (stripped)
        doc.setTextColor(180,180,180); doc.setFontSize(8); doc.setFont('helvetica','normal');
        doc.text(stripEmoji(c)||c, L+4, y+5.5);
        // Amount
        doc.setTextColor(200,242,48); doc.setFont('helvetica','bold');
        doc.text('R'+Number(amt).toLocaleString('en-ZA'), R-2, y+5.5, {align:'right'});
        y += 10;
        if(y > H-40){ doc.addPage(); doc.setFillColor(10,10,10); doc.rect(0,0,W,H,'F'); y=16; }
      });
      // Total row
      doc.setFillColor(30,40,10); doc.setDrawColor(200,242,48); doc.setLineWidth(0.3);
      doc.roundedRect(L, y, R-L, 9, 1, 1, 'FD');
      doc.setTextColor(150,150,150); doc.setFontSize(8); doc.setFont('helvetica','normal');
      doc.text('TOTAL SPENT', L+4, y+6);
      doc.setTextColor(200,242,48); doc.setFontSize(10); doc.setFont('helvetica','bold');
      doc.text('R'+total.toLocaleString('en-ZA'), R-2, y+6, {align:'right'});
      y += 14;
    }

    // ── EXPENSE LOG ──
    if(y > H - 60){ doc.addPage(); doc.setFillColor(10,10,10); doc.rect(0,0,W,H,'F'); y=16; }

    doc.setTextColor(85,85,85); doc.setFontSize(7); doc.setFont('helvetica','normal');
    doc.text('FULL EXPENSE LOG', L, y);
    doc.setDrawColor(38,38,38); doc.setLineWidth(0.3); doc.line(L,y+2,R,y+2);
    y += 7;

    // Table header
    var cols = {date:L, cat:L+26, desc:L+54, km:L+130, amt:R};
    doc.setTextColor(70,70,70); doc.setFontSize(7); doc.setFont('helvetica','normal');
    doc.text('DATE',     cols.date, y);
    doc.text('CATEGORY', cols.cat,  y);
    doc.text('DESCRIPTION', cols.desc, y);
    doc.text('KM',       cols.km,   y);
    doc.text('AMOUNT',   cols.amt,  y, {align:'right'});
    doc.setDrawColor(38,38,38); doc.setLineWidth(0.2); doc.line(L,y+2,R,y+2);
    y += 7;

    if(sorted.length === 0){
      doc.setTextColor(60,60,60); doc.setFontSize(9);
      doc.text('No expenses logged', L, y+4);
    } else {
      sorted.forEach(function(e, idx){
        // Alternating row bg — height calculated after desc wrap
        var descFull = stripEmoji(e.desc||'—') || '—';
        var catClean = stripEmoji(e.category||'Other') || 'Other';
        var descMaxW = cols.km - cols.desc - 4;
        doc.setFontSize(8); doc.setFont('helvetica','normal');
        var descLines = doc.splitTextToSize(descFull, descMaxW);
        var rowH = Math.max(8, descLines.length * 5 + 4);

        if(y > H - rowH - 10){
          doc.addPage();
          doc.setFillColor(10,10,10); doc.rect(0,0,W,H,'F');
          doc.setFillColor(200,242,48); doc.rect(0,0,W,1,'F');
          y = 16;
          // Repeat header
          doc.setTextColor(70,70,70); doc.setFontSize(7); doc.setFont('helvetica','normal');
          doc.text('DATE',     cols.date, y); doc.text('CATEGORY', cols.cat, y);
          doc.text('DESCRIPTION', cols.desc, y); doc.text('KM', cols.km, y);
          doc.text('AMOUNT',   cols.amt,  y, {align:'right'});
          doc.setDrawColor(38,38,38); doc.setLineWidth(0.2); doc.line(L,y+2,R,y+2);
          y += 7;
        }

        if(idx%2===0){ doc.setFillColor(16,16,16); doc.rect(L,y-4,R-L,rowH,'F'); }
        doc.setTextColor(140,140,140); doc.setFontSize(8); doc.setFont('helvetica','normal');
        doc.text(e.date||'—', cols.date, y);
        doc.text(catClean,    cols.cat,  y);
        doc.setTextColor(190,190,190);
        doc.text(descLines,   cols.desc, y);
        doc.setTextColor(100,100,100);
        doc.text(e.km?Number(e.km).toLocaleString('en-ZA')+' km':'—', cols.km, y);
        doc.setTextColor(242,160,48); doc.setFont('helvetica','bold');
        doc.text('R'+Number(e.amt||0).toLocaleString('en-ZA'), cols.amt, y, {align:'right'});
        y += rowH;
      });
    }

    // Footer
    var totalPages = doc.internal.getNumberOfPages();
    for(var p=1;p<=totalPages;p++){
      doc.setPage(p);
      doc.setFillColor(200,242,48); doc.rect(0,H-1,W,1,'F');
      doc.setTextColor(50,50,50); doc.setFontSize(7); doc.setFont('helvetica','normal');
      doc.text('Generated by My Dashboard · '+printDate, L, H-4);
      doc.text('Page '+p+' of '+totalPages, R, H-4, {align:'right'});
    }

    var safeName = car.name.replace(/[^a-z0-9]/gi,'_');
    doc.save(safeName+'_Report_'+localDateStr(new Date())+'.pdf');

    document.body.removeChild(toast);
  }, 80);
}

function openRescheduleService(carId){
  var car = loadCarsData().find(function(c){ return c.id === carId; });
  if(!car) return;
  document.getElementById('rescheduleCarId').value = carId;
  document.getElementById('rescheduleCarLabel').textContent = car.name;
  document.getElementById('rescheduleNewDate').value = '';
  document.getElementById('rescheduleServiceModal').classList.add('active');
  setTimeout(function(){ document.getElementById('rescheduleNewDate').focus(); }, 100);
}

function confirmRescheduleService(){
  var carId = document.getElementById('rescheduleCarId').value;
  var newDate = document.getElementById('rescheduleNewDate').value;
  if(!newDate){ alert('Please pick a new service date.'); return; }
  var cars = loadCarsData();
  var car = cars.find(function(c){ return c.id === carId; });
  if(!car) return;
  car.nextService = newDate;
  saveCarsData(cars);
  closeModal('rescheduleServiceModal');
  renderCars();
}

function openLogServiceToday(carId){
  var car = loadCarsData().find(function(c){ return c.id === carId; });
  if(!car) return;
  document.getElementById('logServiceCarId').value = carId;
  document.getElementById('logServiceCarLabel').textContent = car.name;
  document.getElementById('logServiceNext').value = '';
  document.getElementById('logServiceKm').value = car.kilometers || '';
  document.getElementById('logServiceDesc').value = '';
  document.getElementById('logServiceAmt').value = '';
  document.getElementById('logServiceTodayModal').classList.add('active');
  setTimeout(function(){ document.getElementById('logServiceNext').focus(); }, 100);
}

function confirmLogServiceToday(){
  var carId = document.getElementById('logServiceCarId').value;
  var nextDate = document.getElementById('logServiceNext').value;
  var km = document.getElementById('logServiceKm').value;
  var desc = document.getElementById('logServiceDesc').value.trim();
  var amt = parseFloat(document.getElementById('logServiceAmt').value);

  if(!nextDate){ alert('Please set the next service due date.'); return; }

  var today = localDateStr(new Date());
  var cars = loadCarsData();
  var car = cars.find(function(c){ return c.id === carId; });
  if(!car) return;

  // Move service dates
  car.lastService = today;
  car.nextService = nextDate;
  if(km){ car.serviceKm = Number(km); car.kilometers = Math.max(Number(km), car.kilometers||0); }

  // Optionally log expense
  if(desc && !isNaN(amt) && amt > 0){
    if(!car.expenses) car.expenses = [];
    car.expenses.push({ id: uid(), category:'🔧 Service', desc:desc, amt:amt, date:today, km:km||'' });
  }

  saveCarsData(cars);
  closeModal('logServiceTodayModal');
  renderCars();
}

function getSelectedCategories(){
  var boxes = document.querySelectorAll('#expenseCategoryBox input[type=checkbox]:checked');
  var vals = [];
  boxes.forEach(function(b){ vals.push(b.value); });
  return vals.length ? vals.join(', ') : '';
}

function setSelectedCategories(arr){
  var boxes = document.querySelectorAll('#expenseCategoryBox input[type=checkbox]');
  boxes.forEach(function(b){ b.checked = arr.indexOf(b.value) > -1; });
}

function openAddExpense(carId){
  document.getElementById('addExpenseCarId').value = carId;
  document.getElementById('addExpenseEditId').value = '';
  var car = loadCarsData().find(function(c){ return c.id === carId; });
  document.getElementById('addExpenseCarLabel').textContent = car ? car.name : '';
  setSelectedCategories(['🔧 Service']);
  document.getElementById('expenseDesc').value = '';
  document.getElementById('expenseAmt').value = '';
  document.getElementById('expenseDate').value = localDateStr(new Date());
  document.getElementById('expenseKm').value = car && car.kilometers ? car.kilometers : '';
  document.getElementById('expenseModalSaveBtn').textContent = 'Save Entry';
  document.getElementById('addExpenseModal').classList.add('active');
  setTimeout(function(){ document.getElementById('expenseDesc').focus(); }, 100);
}

function openEditExpense(carId, expId){
  var cars = loadCarsData();
  var car = cars.find(function(c){ return c.id === carId; });
  if(!car) return;
  var exp = (car.expenses||[]).find(function(e){ return e.id === expId; });
  if(!exp) return;
  document.getElementById('addExpenseCarId').value = carId;
  document.getElementById('addExpenseEditId').value = expId;
  document.getElementById('addExpenseCarLabel').textContent = car.name;
  var cats = (exp.category||'💡 Other').split(', ');
  setSelectedCategories(cats);
  document.getElementById('expenseDesc').value = exp.desc || '';
  document.getElementById('expenseAmt').value = exp.amt || '';
  document.getElementById('expenseDate').value = exp.date || '';
  document.getElementById('expenseKm').value = exp.km || '';
  document.getElementById('expenseModalSaveBtn').textContent = 'Save Changes';
  document.getElementById('addExpenseModal').classList.add('active');
}

function confirmAddExpense(){
  var carId  = document.getElementById('addExpenseCarId').value;
  var editId = document.getElementById('addExpenseEditId').value;
  var cat    = getSelectedCategories();
  var desc   = document.getElementById('expenseDesc').value.trim();
  var amt    = parseFloat(document.getElementById('expenseAmt').value);
  var date   = document.getElementById('expenseDate').value || localDateStr(new Date());
  var km     = document.getElementById('expenseKm').value ? Number(document.getElementById('expenseKm').value) : '';
  if(!cat){ alert('Please select at least one category.'); return; }
  if(!amt || amt <= 0){ alert('Please enter a valid amount.'); return; }
  var cars = loadCarsData();
  var car = cars.find(function(c){ return c.id === carId; });
  if(!car) return;
  if(!car.expenses) car.expenses = [];
  var entry = { id: editId||uid(), category: cat, desc: desc, amt: amt, date: date, km: km };
  if(editId){
    var idx = car.expenses.findIndex(function(e){ return e.id === editId; });
    if(idx > -1) car.expenses[idx] = entry;
  } else {
    car.expenses.push(entry);
    // Update car's current km if provided
    if(km && km > (car.kilometers||0)) car.kilometers = km;
  }
  saveCarsData(cars);
  closeModal('addExpenseModal');
  renderCars();
}

function deleteExpense(carId, expId){
  if(!confirm('Delete this expense entry?')) return;
  var cars = loadCarsData();
  var car = cars.find(function(c){ return c.id === carId; });
  if(!car) return;
  car.expenses = (car.expenses||[]).filter(function(e){ return e.id !== expId; });
  saveCarsData(cars);
  renderCars();
}

function autoCalcNextService(){
  var dateVal = document.getElementById('lastServiceDate').value;
  var kmVal   = document.getElementById('serviceKm').value;
  var dateDisp = document.getElementById('nextSvcDateDisplay');
  var kmDisp   = document.getElementById('nextSvcKmDisplay');
  var hiddenDate = document.getElementById('nextServiceDate');
  var hiddenKm   = document.getElementById('nextServiceKm');
  if(dateVal){
    var d = new Date(dateVal);
    d.setFullYear(d.getFullYear() + 1);
    var yyyy = d.getFullYear();
    var mm   = String(d.getMonth()+1).padStart(2,'0');
    var dd   = String(d.getDate()).padStart(2,'0');
    var iso  = yyyy+'-'+mm+'-'+dd;
    hiddenDate.value = iso;
    dateDisp.textContent = dd+'/'+mm+'/'+yyyy;
  } else {
    hiddenDate.value = '';
    dateDisp.textContent = '—';
  }
  if(kmVal){
    var next = Number(kmVal) + 15000;
    hiddenKm.value = next;
    kmDisp.textContent = next.toLocaleString('en-ZA')+' km';
  } else {
    hiddenKm.value = '';
    kmDisp.textContent = '—';
  }
}

function openServiceModal(carId){
  var car = loadCarsData().find(function(c){ return c.id === carId; });
  if(!car) return;
  document.getElementById('serviceCarId').value = carId;
  document.getElementById('serviceModalCarLabel').textContent = car.name;
  document.getElementById('lastServiceDate').value = car.lastService || '';
  document.getElementById('serviceKm').value = car.serviceKm || '';
  document.getElementById('serviceLicenceExpiry').value = car.licenceExpiry || '';
  autoCalcNextService();
  // If there's already a saved nextService date, show it (override auto)
  if(car.nextService){
    document.getElementById('nextServiceDate').value = car.nextService;
    var parts = car.nextService.split('-');
    if(parts.length===3) document.getElementById('nextSvcDateDisplay').textContent = parts[2]+'/'+parts[1]+'/'+parts[0];
  }
  if(car.nextServiceKm){
    document.getElementById('nextServiceKm').value = car.nextServiceKm;
    document.getElementById('nextSvcKmDisplay').textContent = Number(car.nextServiceKm).toLocaleString('en-ZA')+' km';
  }
  document.getElementById('serviceModal').classList.add('active');
}

function confirmServiceDates(){
  var carId = document.getElementById('serviceCarId').value;
  var cars = loadCarsData();
  var car = cars.find(function(c){ return c.id === carId; });
  if(!car) return;
  car.lastService    = document.getElementById('lastServiceDate').value;
  car.serviceKm      = document.getElementById('serviceKm').value ? Number(document.getElementById('serviceKm').value) : '';
  car.nextService    = document.getElementById('nextServiceDate').value;
  car.nextServiceKm  = document.getElementById('nextServiceKm').value ? Number(document.getElementById('nextServiceKm').value) : '';
  car.licenceExpiry  = document.getElementById('serviceLicenceExpiry').value;
  if(car.serviceKm && car.serviceKm > (car.kilometers||0)) car.kilometers = car.serviceKm;
  saveCarsData(cars);
  closeModal('serviceModal');
  renderCars();
}

// ── DRIVER LICENCE TRACKER ──
function renderDrivers(){
  var wrap = document.getElementById('driverLicenceSection');
  if(!wrap) return;
  var drivers = loadDrivers();

  var rows = drivers.map(function(d){
    var cd = countdownBadge(d.expiry, 'Expires');
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:11px 16px;border-bottom:1px solid #161616;flex-wrap:wrap;gap:8px;">'
      +'<div>'
        +'<div style="font-size:13px;color:#efefef;font-weight:700;">'+d.name+'</div>'
        +(d.idNum?'<div style="font-size:10px;color:#555;letter-spacing:1px;">ID: '+d.idNum+'</div>':'')
      +'</div>'
      +'<div style="text-align:right;">'
        +'<div style="font-size:12px;color:#f2a830;">'+(d.expiry?formatDisplayDate(d.expiry):'<span style="color:#333;">No date set</span>')+'</div>'
        +(cd?'<div>'+cd+'</div>':'')
      +'</div>'
      +'<div style="display:flex;gap:6px;">'
        +'<button onclick="openEditDriver(\''+d.id+'\')" style="background:none;border:1px solid #2a2a2a;border-radius:4px;padding:4px 10px;color:#555;font-family:\'DM Mono\',monospace;font-size:9px;letter-spacing:1px;cursor:pointer;" onmouseover="this.style.borderColor=\'#444\';this.style.color=\'#888\'" onmouseout="this.style.borderColor=\'#2a2a2a\';this.style.color=\'#555\'">✏️ Edit</button>'
        +'<button onclick="deleteDriver(\''+d.id+'\')" style="background:none;border:1px solid #2a1a1a;border-radius:4px;padding:4px 10px;color:#555;font-family:\'DM Mono\',monospace;font-size:9px;letter-spacing:1px;cursor:pointer;" onmouseover="this.style.borderColor=\'#c0392b\';this.style.color=\'#c0392b\'" onmouseout="this.style.borderColor=\'#2a1a1a\';this.style.color=\'#555\'">🗑</button>'
      +'</div>'
    +'</div>';
  }).join('');

  wrap.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid var(--border);">'
      +'<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:15px;color:#efefef;">🪪 Driver\'s Licences</div>'
      +'<button onclick="openAddDriver()" style="background:#0d1a00;border:1px solid #3a5a00;border-radius:6px;padding:6px 12px;color:#c8f230;font-family:\'DM Mono\',monospace;font-size:9px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;">+ Add Person</button>'
    +'</div>'
    +(drivers.length===0
      ? '<div style="padding:20px 16px;text-align:center;color:#333;font-size:12px;">No driver licences added yet</div>'
      : rows);
}

function openAddDriver(){
  document.getElementById('driverEditId').value = '';
  document.getElementById('driverModalTitle').textContent = '🪪 Add Driver Licence';
  document.getElementById('driverName').value = '';
  document.getElementById('driverIdNum').value = '';
  document.getElementById('driverExpiry').value = '';
  document.getElementById('driverModal').classList.add('active');
  setTimeout(function(){ document.getElementById('driverName').focus(); }, 100);
}

function openEditDriver(id){
  var drivers = loadDrivers();
  var d = drivers.find(function(x){ return x.id === id; });
  if(!d) return;
  document.getElementById('driverEditId').value = id;
  document.getElementById('driverModalTitle').textContent = '✏️ Edit Driver Licence';
  document.getElementById('driverName').value = d.name || '';
  document.getElementById('driverIdNum').value = d.idNum || '';
  document.getElementById('driverExpiry').value = d.expiry || '';
  document.getElementById('driverModal').classList.add('active');
}

function confirmDriver(){
  var name = document.getElementById('driverName').value.trim();
  if(!name){ alert('Please enter a name.'); return; }
  var editId = document.getElementById('driverEditId').value;
  var drivers = loadDrivers();
  var entry = { name: name, idNum: document.getElementById('driverIdNum').value.trim(), expiry: document.getElementById('driverExpiry').value };
  if(editId){
    var idx = drivers.findIndex(function(x){ return x.id === editId; });
    if(idx > -1){ entry.id = editId; drivers[idx] = entry; }
  } else {
    entry.id = uid();
    drivers.push(entry);
  }
  saveDrivers(drivers);
  closeModal('driverModal');
  renderDrivers();
}

function deleteDriver(id){
  if(!confirm('Remove this driver licence record?')) return;
  saveDrivers(loadDrivers().filter(function(d){ return d.id !== id; }));
  renderDrivers();
}

// ── REMINDER BANNER (fires on login) ──
function checkReminders(){
  var alerts = [];
  var today = new Date(); today.setHours(0,0,0,0);
  var WARN = 60; // days

  function daysUntil(ds){
    if(!ds) return null;
    return Math.round((new Date(ds+'T00:00:00') - today)/86400000);
  }

  // Cars: service + licence disc
  loadCarsData().forEach(function(car){
    var svcDiff = daysUntil(car.nextService);
    var licDiff = daysUntil(car.licenceExpiry);
    if(svcDiff !== null && svcDiff <= WARN){
      if(svcDiff < 0) alerts.push({ icon:'🔧', msg: car.name+' service is <strong style="color:#f23060;">OVERDUE</strong> by '+Math.abs(svcDiff)+' days', level:'red' });
      else if(svcDiff === 0) alerts.push({ icon:'🔧', msg: car.name+' service is due <strong style="color:#f23060;">TODAY</strong>', level:'red' });
      else alerts.push({ icon:'🔧', msg: car.name+' service due in <strong style="color:#f2a830;">'+svcDiff+' days</strong> ('+formatDisplayDate(car.nextService)+')', level: svcDiff<=14?'red':'amber' });
    }
    if(licDiff !== null && licDiff <= WARN){
      if(licDiff < 0) alerts.push({ icon:'📋', msg: car.name+' licence disc <strong style="color:#f23060;">EXPIRED</strong> '+Math.abs(licDiff)+' days ago', level:'red' });
      else if(licDiff === 0) alerts.push({ icon:'📋', msg: car.name+' licence disc expires <strong style="color:#f23060;">TODAY</strong>', level:'red' });
      else alerts.push({ icon:'📋', msg: car.name+' licence disc expires in <strong style="color:#f2a830;">'+licDiff+' days</strong> ('+formatDisplayDate(car.licenceExpiry)+')', level: licDiff<=14?'red':'amber' });
    }
  });

  // Drivers
  loadDrivers().forEach(function(d){
    var diff = daysUntil(d.expiry);
    if(diff !== null && diff <= WARN){
      if(diff < 0) alerts.push({ icon:'🪪', msg: d.name+'\'s driver\'s licence <strong style="color:#f23060;">EXPIRED</strong> '+Math.abs(diff)+' days ago', level:'red' });
      else if(diff === 0) alerts.push({ icon:'🪪', msg: d.name+'\'s driver\'s licence expires <strong style="color:#f23060;">TODAY</strong>', level:'red' });
      else alerts.push({ icon:'🪪', msg: d.name+'\'s driver\'s licence expires in <strong style="color:#f2a830;">'+diff+' days</strong> ('+formatDisplayDate(d.expiry)+')', level: diff<=14?'red':'amber' });
    }
  });

  // Instalments due this month
  try{
    var plans = JSON.parse(lsGet(INST_KEY)||'[]');
    var nowM = today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0');
    plans.forEach(function(p){
      var paidIdxs = (p.paid||[]).map(function(x){ return x.index; });
      p.dates.forEach(function(ds, i){
        if(paidIdxs.indexOf(i) > -1) return;
        var diff2 = daysUntil(ds);
        if(diff2 !== null && diff2 >= 0 && diff2 <= 7){
          alerts.push({ icon:'💳', msg: p.desc+' ('+p.provider+') payment '+fmtR(p.amt)+' due in <strong style="color:#f2a830;">'+diff2+' days</strong>', level:'amber' });
        } else if(diff2 !== null && diff2 < 0){
          alerts.push({ icon:'💳', msg: p.desc+' ('+p.provider+') payment '+fmtR(p.amt)+' is <strong style="color:#f23060;">OVERDUE</strong>', level:'red' });
        }
      });
    });
  }catch(e){}

  if(alerts.length === 0) return;

  var old = document.getElementById('reminderBanner');
  if(old) old.remove();

  var banner = document.createElement('div');
  banner.id = 'reminderBanner';
  banner.style.cssText = 'position:fixed;top:50px;left:0;right:0;z-index:400;background:#0a0a0a;border-bottom:2px solid #f23060;padding:0;';

  var rows = alerts.map(function(a){
    return '<div style="display:flex;align-items:center;gap:10px;padding:9px 16px;border-bottom:1px solid #1a1a1a;font-size:11px;letter-spacing:0.5px;">'
      +'<span style="font-size:16px;flex-shrink:0;">'+a.icon+'</span>'
      +'<span style="color:#ccc;flex:1;">'+a.msg+'</span>'
      +'</div>';
  }).join('');

  banner.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 16px;background:#1a0000;border-bottom:1px solid #3a0000;">'
      +'<span style="font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#f23060;font-weight:700;">⚠ '+alerts.length+' Reminder'+(alerts.length>1?'s':'')+'</span>'
      +'<button onclick="document.getElementById(\'reminderBanner\').remove()" style="background:none;border:1px solid #3a0000;border-radius:4px;color:#f23060;font-size:11px;padding:3px 10px;cursor:pointer;font-family:\'DM Mono\',monospace;letter-spacing:1px;">Dismiss</button>'
    +'</div>'
    +rows;

  document.body.appendChild(banner);
}

/* ══════════════════════════════════ */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js');
  });
}

/* ══════════════════════════════════ */

