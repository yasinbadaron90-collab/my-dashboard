// Carpool module

// State — initialised here because they were lost when the app was split out of the monolith
let cpData = {};
let cpYear = new Date().getFullYear();
let cpMonth = new Date().getMonth();

// ── Cross-module access ─────────────────────────────────────────────────
// `let` makes these variables block-scoped to this script — other modules
// like routine.js (MoneyMoveZ allocation logic) need to read them. Mirror
// onto window so they can. After every loadCP() / month change, refresh
// the window references too (see syncWindowCp helper below).
function syncWindowCp(){
  window.cpData  = cpData;
  window.cpYear  = cpYear;
  window.cpMonth = cpMonth;
}
syncWindowCp();

const PRELOAD_CP={};
function loadCP(){
  try{cpData=JSON.parse(lsGet(CPK)||'{}');}catch(e){cpData={};}
  syncWindowCp();
  // saveCP() removed — was overwriting data on login
}
function saveCP(){lsSet(CPK,JSON.stringify(cpData)); syncWindowCp(); try{odinRefreshIfOpen();}catch(e){} }

// ── Eager load on script parse ─────────────────────────────────────────────
// loadCP() is also called from DOMContentLoaded in core.js, but that runs
// AFTER all scripts parse and can leave a small race window where a save
// fires before data is loaded. Calling it here at module load shrinks the
// window to zero — by the time any onclick handler can possibly fire, this
// module's script has parsed and cpData is already populated.
try { loadCP(); } catch(e){ /* lsGet may not exist if core.js hasn't loaded — DOMContentLoaded will retry */ }

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
      // Read-only: do NOT call getDay() here — that mutates cpData and seeds
      // empty days with default unpaid R44 entries, which then get persisted
      // by the next saveCP(). Use the existing entry if present, otherwise {}.
      const dd=(cpData[mk] && cpData[mk][ds]) ? cpData[mk][ds] : {};
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
      // Always render a row — absent shows as —. Use plain-text PAID / DUE
      // markers instead of emoji because the PDF/share renderer can't always
      // handle them (✓ and ⏳ render as garbage characters like "#ó" in some
      // share previews and PDF outputs).
      if(amt===0)return '<div class="stmt-row"><span class="stmt-day">'+dl+'</span><span class="stmt-absent">—</span></div>';
      if(paid)return '<div class="stmt-row"><span class="stmt-day">'+dl+'</span><span class="stmt-paid">'+fmtR(amt)+' PAID</span></div>';
      return '<div class="stmt-row"><span class="stmt-day">'+dl+'</span><span class="stmt-unpaid">'+fmtR(amt)+' DUE</span></div>';
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
  optionsEl.appendChild(buildDestOption('maint:original', '🔧 '+getMaintFundName(), fmtR(maintMonth)+' this month · target '+fmtR(getMaintTarget()), '#f2a830'));

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

  if(!choice){ alert('Please choose where to put the money.'); return; }

  const today = localDateStr(new Date());

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
    const mk = (new Date()).getFullYear()+'-'+String((new Date()).getMonth()+1).padStart(2,'0');
    if(!data[mk]) data[mk] = { income:[], expenses:[] };
    data[mk].income = data[mk].income || [];
    data[mk].income.push({ id: uid(), label: passenger+' payment', amount: totalOwing, icon:'💳', auto:false });
    if(saveCFData) saveCFData(data);

  } else if(choice.startsWith('fund:')){
    const fundId = choice.replace('fund:','');
    const f = funds.find(function(x){ return x.id === fundId; });
    if(f){
      if(!f.deposits) f.deposits = [];
      f.deposits.push({ id:uid(), amount:totalOwing, date:today, note:passenger+' carpool+borrow payment', txnType:'in' });
      saveFunds();
      renderFunds();
      // Also add to cash flow as income
      const data = loadCFData ? loadCFData() : {};
      const mk = today.slice(0,7);
      if(!data[mk]) data[mk] = { income:[], expenses:[] };
      data[mk].income = data[mk].income || [];
      data[mk].income.push({ id:uid(), label:passenger+' → '+f.name, amount:totalOwing, icon:f.emoji||'💰', auto:false });
      if(saveCFData) saveCFData(data);
    }

  } else if(choice.startsWith('maint:')){
    const cardId = choice.replace('maint:','');
    if(cardId === 'original'){
      const data = getMaintData();
      data.push({ id:uid(), person:passenger, amount:totalOwing, date:today, note:'Carpool+borrow payment' });
      saveMaintData(data);
      renderMaintCard();
    } else {
      const cards = loadCustomMaintCards();
      const card = cards.find(function(c){ return c.id === cardId; });
      if(card){
        if(!card.entries) card.entries = [];
        // Find contributor ID for this passenger
        const contrib = (card.contributors||[]).find(function(c){ return (typeof c==='object'?c.name:c) === passenger; });
        const personId = contrib ? (typeof contrib==='object'?contrib.id:contrib) : passenger;
        card.entries.push({ id:uid(), personId, person:passenger, amount:totalOwing, date:today, note:'Carpool+borrow payment' });
        saveCustomMaintCards(cards);
        renderCustomMaintCards();
      }
    }
    // Also add to cash flow
    const data = loadCFData ? loadCFData() : {};
    const mk = today.slice(0,7);
    if(!data[mk]) data[mk] = { income:[], expenses:[] };
    data[mk].income = data[mk].income || [];
    data[mk].income.push({ id:uid(), label:passenger+' → Maintenance', amount:totalOwing, icon:'🔧', auto:false });
    if(saveCFData) saveCFData(data);

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

