// ══════════════════════════════════════════════════════════════════════
// forecast.js — v150f  (2026-10-10)
// Reports → 🔮 Forecast. Read-only against your money data; the ONLY thing
// it writes is its own settings key (yb_forecast_v1): the editable income and
// expense lines, the Vault goal and the Vault pocket.
//
//   Starting balance = your OWN money (same rule as Home: every pocket that
//   is not deleted and has no heldFor).
//   Each line = amount per month, optional From / Until month, and a pay day.
//   The current month only counts what is still to come: a line with a pay
//   day counts if that day has not passed; a line with day 0 is spread
//   through the month, so only the days remaining count.
//   Vault projection assumes every monthly surplus goes into the Vault.
// ══════════════════════════════════════════════════════════════════════
var FC_KEY = 'yb_forecast_v1';
var _fc = null;
var _fcChart = null;
var _FC_MS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function _fcEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _fcId(){ return 'l'+Math.random().toString(36).slice(2,8); }
function _fcMoney(n){
  var v = Math.round(Number(n)||0), neg = v < 0; v = Math.abs(v);
  return (neg?'-':'')+'R'+v.toLocaleString('en-ZA');
}
function _fcMonthKey(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
function _fcMonthLabel(mk){ return _FC_MS[parseInt(mk.slice(5,7),10)-1]+' '+mk.slice(0,4); }
function _fcAddMonths(mk, n){
  var y = parseInt(mk.slice(0,4),10), m = parseInt(mk.slice(5,7),10)-1+n;
  y += Math.floor(m/12); m = ((m%12)+12)%12;
  return y+'-'+String(m+1).padStart(2,'0');
}

function _fcDefaults(){
  var stipendTo = '2026-10';
  try { var pl = (typeof loadPlan === 'function') ? loadPlan() : null; if(pl && pl.stipendEnd) stipendTo = pl.stipendEnd.slice(0,7); } catch(e){}
  var vaultId = '';
  try { var vf = (typeof funds !== 'undefined' ? funds : []).find(function(f){ return !f._deleted && /vault/i.test(f.name||''); }); if(vf) vaultId = vf.id; } catch(e){}
  return {
    v:1, vaultId:vaultId, goal:60000, goalDate:'2030-01',
    incomes:[
      { id:_fcId(), label:'Salary',  amount:10500, day:25, from:'', to:'' },
      { id:_fcId(), label:'Stipend', amount:4430,  day:25, from:'', to:stipendTo },
      { id:_fcId(), label:'Carpool', amount:1800,  day:0,  from:'', to:'' }
    ],
    expenses:[
      { id:_fcId(), label:'House expenses',  amount:6950, day:25, from:'', to:'' },
      { id:_fcId(), label:'Nuri debt',       amount:1000, day:25, from:'', to:'' },
      { id:_fcId(), label:'Subscriptions',   amount:610,  day:0,  from:'', to:'' },
      { id:_fcId(), label:'Everyday spending', amount:5000, day:0, from:'', to:'' },
      { id:_fcId(), label:'Car costs',       amount:800,  day:0,  from:'', to:'' }
    ]
  };
}
function _fcLoad(){
  if(_fc) return _fc;
  try { var raw = lsGet(FC_KEY); if(raw){ var p = JSON.parse(raw); if(p && p.incomes && p.expenses) _fc = p; } } catch(e){}
  if(!_fc){ _fc = _fcDefaults(); _fcSave(); }
  if(!_fc.vaultId){
    try { var vf = (typeof funds !== 'undefined' ? funds : []).find(function(f){ return !f._deleted && /vault/i.test(f.name||''); }); if(vf) _fc.vaultId = vf.id; } catch(e){}
  }
  return _fc;
}
function _fcSave(){ try { lsSet(FC_KEY, JSON.stringify(_fc)); } catch(e){ console.warn('[forecast] save failed', e); } }

function _fcOwnMoney(){
  var list = (typeof funds !== 'undefined' && funds) ? funds : [];
  return list.reduce(function(s,f){
    if(f._deleted || (f.heldFor||'').trim()) return s;
    return s + ((typeof fundTotal === 'function') ? fundTotal(f) : 0);
  }, 0);
}
function _fcVaultNow(m){
  var f = (typeof funds !== 'undefined' ? funds : []).find(function(x){ return x.id === m.vaultId; });
  return f ? ((typeof fundTotal === 'function') ? fundTotal(f) : 0) : null;
}

function _fcLineAmt(line, mk, i, today){
  var amt = Number(line.amount)||0;
  if(line.from && mk < line.from) return 0;
  if(line.to && mk > line.to) return 0;
  if(i > 0) return amt;
  var dim = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate();
  var d = today.getDate();
  var day = parseInt(line.day,10)||0;
  if(day > 0) return day > d ? amt : 0;
  return amt * (dim - d) / dim;
}
function _fcNet(m, i, today){
  var mk = _fcAddMonths(_fcMonthKey(today), i);
  var inc = 0, exp = 0;
  m.incomes.forEach(function(l){ inc += _fcLineAmt(l, mk, i, today); });
  m.expenses.forEach(function(l){ exp += _fcLineAmt(l, mk, i, today); });
  return { mk:mk, inc:inc, exp:exp, net:inc-exp };
}

function computeForecast(m, today, ownNow, vaultNow){
  today = today || new Date();
  var HORIZON = 24, LONG = 150;
  var out = { ownNow:ownNow, vaultNow:vaultNow, months:[], own:[], vault:[], nets:[], runsOut:null, vaultDate:null, need:null, monthsToGoal:null };
  var cur = _fcMonthKey(today);
  var own = ownNow, vault = vaultNow;
  for(var i = 0; i <= LONG; i++){
    var n = _fcNet(m, i, today);
    own += n.net;
    if(vault !== null) vault += Math.max(0, n.net);
    if(i <= HORIZON){ out.months.push(n.mk); out.own.push(own); out.vault.push(vault); out.nets.push(n); }
    if(out.runsOut === null && own < 0) out.runsOut = n.mk;
    if(vault !== null && out.vaultDate === null && vault >= m.goal) out.vaultDate = n.mk;
  }
  out.nextNet = out.nets[1] ? out.nets[1].net : 0;
  if(vaultNow !== null && m.goalDate && /^\d{4}-\d{2}$/.test(m.goalDate)){
    var gy = parseInt(m.goalDate.slice(0,4),10), gm = parseInt(m.goalDate.slice(5,7),10);
    var cy = parseInt(cur.slice(0,4),10), cm = parseInt(cur.slice(5,7),10);
    var diff = (gy-cy)*12 + (gm-cm);
    out.monthsToGoal = diff;
    if(diff > 0) out.need = Math.max(0, (m.goal - vaultNow) / diff);
  }
  return out;
}

// ── UI ───────────────────────────────────────────────────────────────
var _FC_IN = 'background:#1a1a1a;border:1px solid #333;color:#efefef;font-family:\'DM Mono\',monospace;font-size:12px;padding:8px;border-radius:4px;width:100%;box-sizing:border-box;';
var _FC_LBL = 'display:block;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:3px;';

function _fcLineHtml(kind, l){
  var id = l.id;
  return '<div style="padding:10px 0;border-top:1px solid var(--border)">'
    +'<div style="display:flex;gap:8px;margin-bottom:6px">'
    +'<input type="text" value="'+_fcEsc(l.label)+'" oninput="fcSetLine(\''+kind+'\',\''+id+'\',\'label\',this.value)" style="'+_FC_IN+'flex:1;font-weight:500"/>'
    +'<button onclick="fcDelLine(\''+kind+'\',\''+id+'\')" aria-label="Delete line" style="background:none;border:1px solid var(--border);color:var(--muted);border-radius:4px;width:34px;cursor:pointer;font-size:13px">✕</button>'
    +'</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">'
    +'<div><label style="'+_FC_LBL+'">R per month</label><input type="number" inputmode="decimal" value="'+(Number(l.amount)||0)+'" oninput="fcSetLine(\''+kind+'\',\''+id+'\',\'amount\',this.value)" style="'+_FC_IN+'"/></div>'
    +'<div><label style="'+_FC_LBL+'">Pay day (0 = spread)</label><input type="number" inputmode="numeric" min="0" max="31" value="'+(parseInt(l.day,10)||0)+'" oninput="fcSetLine(\''+kind+'\',\''+id+'\',\'day\',this.value)" style="'+_FC_IN+'"/></div>'
    +'<div><label style="'+_FC_LBL+'">From</label><input type="month" value="'+_fcEsc(l.from||'')+'" onchange="fcSetLine(\''+kind+'\',\''+id+'\',\'from\',this.value)" style="'+_FC_IN+'"/></div>'
    +'<div><label style="'+_FC_LBL+'">Until</label><input type="month" value="'+_fcEsc(l.to||'')+'" onchange="fcSetLine(\''+kind+'\',\''+id+'\',\'to\',this.value)" style="'+_FC_IN+'"/></div>'
    +'</div></div>';
}

function _fcBodyHtml(m){
  var vaultOpts = '<option value="">None</option>' + (typeof funds !== 'undefined' ? funds : []).filter(function(f){ return !f._deleted; })
    .map(function(f){ return '<option value="'+_fcEsc(f.id)+'"'+(f.id===m.vaultId?' selected':'')+'>'+_fcEsc(((f.emoji||'')+' '+f.name).trim())+'</option>'; }).join('');
  var btn = 'width:100%;background:none;border:1px dashed var(--border);color:var(--muted);font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;padding:10px;border-radius:6px;cursor:pointer;margin-top:8px;';
  return '<div style="padding:4px 14px 14px">'
    +'<div id="fcTiles" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px"></div>'
    +'<div id="fcVerdict" style="font-size:11px;line-height:1.6;color:var(--muted);margin-bottom:10px"></div>'
    +'<div style="display:flex;gap:12px;flex-wrap:wrap;font-size:10px;color:var(--muted);margin-bottom:6px"><span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#2a78d6;margin-right:4px"></span>Own money</span><span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#1baf7a;margin-right:4px"></span>Vault (surplus goes in)</span></div>'
    +'<div style="position:relative;width:100%;height:230px"><canvas id="fcChart" role="img" aria-label="Projected own money and Vault balance over the next 24 months"></canvas></div>'
    +'<div style="font-size:9px;letter-spacing:3px;text-transform:uppercase;color:var(--muted);margin:16px 0 6px">Vault goal</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">'
    +'<div style="grid-column:span 2"><label style="'+_FC_LBL+'">Vault pocket</label><select onchange="fcSetMeta(\'vaultId\',this.value)" style="'+_FC_IN+'">'+vaultOpts+'</select></div>'
    +'<div><label style="'+_FC_LBL+'">Goal (R)</label><input type="number" inputmode="decimal" value="'+(Number(m.goal)||0)+'" oninput="fcSetMeta(\'goal\',this.value)" style="'+_FC_IN+'"/></div>'
    +'<div><label style="'+_FC_LBL+'">By month</label><input type="month" value="'+_fcEsc(m.goalDate||'')+'" onchange="fcSetMeta(\'goalDate\',this.value)" style="'+_FC_IN+'"/></div>'
    +'</div>'
    +'<div style="font-size:9px;letter-spacing:3px;text-transform:uppercase;color:var(--muted);margin:18px 0 0">Income</div>'
    +'<div id="fcIncLines">'+m.incomes.map(function(l){ return _fcLineHtml('inc', l); }).join('')+'</div>'
    +'<button onclick="fcAddLine(\'inc\')" style="'+btn+'">+ Add income</button>'
    +'<div style="font-size:9px;letter-spacing:3px;text-transform:uppercase;color:var(--muted);margin:18px 0 0">Spending</div>'
    +'<div id="fcExpLines">'+m.expenses.map(function(l){ return _fcLineHtml('exp', l); }).join('')+'</div>'
    +'<button onclick="fcAddLine(\'exp\')" style="'+btn+'">+ Add spending</button>'
    +'<div style="font-size:10px;color:#555;line-height:1.6;margin-top:14px">Leave From / Until empty to count every month. To model a new salary: set Until on the old one, then add a new income line with From. This month only counts what is still to come. Starting amounts are assumptions, not your actual averages.</div>'
    +'<button onclick="fcReset()" style="'+btn+'border-style:solid">Reset to starting assumptions</button>'
    +'</div>';
}

function _fcRenderOutputs(){
  var m = _fcLoad();
  var tiles = document.getElementById('fcTiles');
  if(!tiles) return;
  var today = new Date();
  var ownNow = _fcOwnMoney(), vaultNow = _fcVaultNow(m);
  var f = computeForecast(m, today, ownNow, vaultNow);
  function tile(label, val, sub, color){
    return '<div style="background:#111;border-radius:6px;padding:10px 12px"><div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--muted)">'+label+'</div>'
      +'<div style="font-family:Syne,sans-serif;font-weight:700;font-size:17px;margin-top:2px;color:'+(color||'var(--text)')+'">'+val+'</div>'
      +'<div style="font-size:9px;color:#555;margin-top:2px">'+sub+'</div></div>';
  }
  var nextNet = f.nextNet;
  var lasts = f.runsOut ? _fcMonthLabel(f.runsOut) : 'Stays above R0';
  var vaultTile;
  if(vaultNow === null) vaultTile = tile('Vault', 'Not set', 'pick a pocket below');
  else vaultTile = tile('Vault date', f.vaultDate ? _fcMonthLabel(f.vaultDate) : 'Not in 12 yrs', 'at this pace, goal '+_fcMoney(m.goal), f.vaultDate ? '#c8f230' : '#f2a830');
  tiles.innerHTML =
      tile('Own money now', _fcMoney(ownNow), 'excl. held pockets')
    + tile('Runs out', lasts, f.runsOut ? 'own money below R0' : 'for the next 24 months', f.runsOut ? '#f23060' : '#c8f230')
    + tile('Next month net', (nextNet>=0?'+':'')+_fcMoney(nextNet), _fcMonthLabel(f.nets[1].mk)+', in minus out', nextNet>=0 ? '#c8f230' : '#f23060')
    + vaultTile;
  var verdict = document.getElementById('fcVerdict');
  if(verdict){
    var parts = [];
    if(f.need !== null && vaultNow !== null){
      parts.push('To reach '+_fcMoney(m.goal)+' by '+_fcMonthLabel(m.goalDate)+' the Vault needs about <b style="color:var(--text)">'+_fcMoney(f.need)+'/month</b>.');
      if(f.vaultDate && f.vaultDate <= m.goalDate) parts.push('At the lines below you get there around <b style="color:#c8f230">'+_fcMonthLabel(f.vaultDate)+'</b>.');
      else if(f.vaultDate) parts.push('At the lines below you get there around <b style="color:#f2a830">'+_fcMonthLabel(f.vaultDate)+'</b>, after your goal month.');
      else parts.push('At the lines below you do not get there within 12 years; next month nets '+_fcMoney(nextNet)+'.');
    } else if(vaultNow !== null && f.monthsToGoal !== null && f.monthsToGoal <= 0){
      parts.push('The goal month has already passed.');
    }
    verdict.innerHTML = parts.join(' ');
  }
  // chart
  var cv = document.getElementById('fcChart');
  if(cv && typeof Chart !== 'undefined'){
    var labels = ['Now'].concat(f.months.map(function(mk, i){ return _FC_MS[parseInt(mk.slice(5,7),10)-1]+(mk.slice(5,7)==='01'||i===0 ? ' '+mk.slice(2,4) : ''); }));
    var ownData = [Math.round(ownNow)].concat(f.own.map(function(v){ return Math.round(v); }));
    var vaultData = [vaultNow === null ? null : Math.round(vaultNow)].concat(f.vault.map(function(v){ return v === null ? null : Math.round(v); }));
    var ds = [
      { label:'Own money', data:ownData, borderColor:'#2a78d6', backgroundColor:'#2a78d6', borderWidth:2, pointRadius:0, tension:0.2 },
      { label:'Vault', data:vaultData, borderColor:'#1baf7a', backgroundColor:'#1baf7a', borderWidth:2, pointRadius:0, tension:0.2, borderDash:[6,3], hidden: vaultNow === null }
    ];
    if(_fcChart){ _fcChart.destroy(); _fcChart = null; }
    _fcChart = new Chart(cv, {
      type:'line', data:{ labels:labels, datasets:ds },
      options:{ responsive:true, maintainAspectRatio:false, animation:false,
        plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:function(c){ return c.dataset.label+': '+_fcMoney(c.parsed.y); } } } },
        scales:{
          x:{ grid:{display:false}, ticks:{ autoSkip:true, maxRotation:0, color:'#888', font:{size:9} } },
          y:{ grid:{color:'rgba(136,135,129,0.2)'}, ticks:{ color:'#888', font:{size:9}, callback:function(v){ return (v<0?'-':'')+'R'+Math.round(Math.abs(v)/1000)+'k'; } } }
        } }
    });
  }
}

function fcSetLine(kind, id, field, val){
  var m = _fcLoad();
  var list = kind === 'inc' ? m.incomes : m.expenses;
  var l = list.find(function(x){ return x.id === id; });
  if(!l) return;
  if(field === 'amount') l.amount = parseFloat(val)||0;
  else if(field === 'day'){ var d = parseInt(val,10)||0; l.day = Math.max(0, Math.min(31, d)); }
  else l[field] = val;
  _fcSave(); _fcRenderOutputs();
}
function fcSetMeta(field, val){
  var m = _fcLoad();
  if(field === 'goal') m.goal = parseFloat(val)||0; else m[field] = val;
  _fcSave(); _fcRenderOutputs();
}
function fcAddLine(kind){
  var m = _fcLoad();
  (kind === 'inc' ? m.incomes : m.expenses).push({ id:_fcId(), label: kind === 'inc' ? 'New income' : 'New spending', amount:0, day:0, from:'', to:'' });
  _fcSave(); _fcRebuildBody();
}
function fcDelLine(kind, id){
  var m = _fcLoad();
  if(kind === 'inc') m.incomes = m.incomes.filter(function(x){ return x.id !== id; });
  else m.expenses = m.expenses.filter(function(x){ return x.id !== id; });
  _fcSave(); _fcRebuildBody();
}
function fcReset(){
  if(!confirm('Reset the forecast to the starting assumptions? Your edits will be lost.')) return;
  _fc = _fcDefaults(); _fcSave(); _fcRebuildBody();
}
function _fcRebuildBody(){
  var host = document.getElementById('rptFolderForecastInner');
  if(!host) return;
  host.innerHTML = _fcBodyHtml(_fcLoad());
  _fcRenderOutputs();
}
function forecastToggleFolder(){
  if(typeof rptToggleFolder === 'function') rptToggleFolder('rptFolderForecast');
  setTimeout(_fcRenderOutputs, 60);
}

function renderForecastSection(){
  var anchor = document.getElementById('rptFolderExportWrap');
  if(!anchor) return;
  var wrap = document.getElementById('rptFolderForecastWrap');
  if(!wrap){
    wrap = document.createElement('div');
    wrap.id = 'rptFolderForecastWrap';
    wrap.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:10px;';
    wrap.innerHTML =
      '<div onclick="forecastToggleFolder()" style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;cursor:pointer;">'
      +'<div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:14px;">🔮 Forecast</div>'
      +'<div style="display:flex;align-items:center;gap:10px;"><span style="font-size:11px;color:var(--muted);" id="rptFolderForecastMeta"></span>'
      +'<span style="color:var(--muted);font-size:18px;transition:transform .2s;" id="rptFolderForecastArrow">›</span></div></div>'
      +'<div id="rptFolderForecastBody" style="display:none;padding:0 0 8px;"><div id="rptFolderForecastInner"></div></div>';
    anchor.insertAdjacentElement('beforebegin', wrap);
    document.getElementById('rptFolderForecastInner').innerHTML = _fcBodyHtml(_fcLoad());
  }
  if(typeof currentRole !== 'undefined' && currentRole !== 'admin'){ wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  var body = document.getElementById('rptFolderForecastBody');
  var meta = document.getElementById('rptFolderForecastMeta');
  try {
    var m = _fcLoad();
    var f = computeForecast(m, new Date(), _fcOwnMoney(), _fcVaultNow(m));
    if(meta) meta.textContent = f.runsOut ? 'runs out '+_fcMonthLabel(f.runsOut) : 'stays above R0';
  } catch(e){}
  if(body && body.style.display !== 'none') _fcRenderOutputs();
}
