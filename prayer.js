// Prayer: tracker, navigation, times, heatmap


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
  // Sync this day to Supabase
  try { if(window.cloudSync && window.cloudSync.prayer) window.cloudSync.prayer.syncDay(dateStr); } catch(e){}
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
