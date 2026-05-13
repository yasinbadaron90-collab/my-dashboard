// Cash Flow: render, reconcile, PDF export


// Helper: identify a savings allocation by either sourceType (preferred — set by
// explicit save flows) or category (fallback for auto-pushed and legacy entries).
const CF_SAV_SRC_TYPES = ['savings_deposit','car_add','maint','custommaint','car_service_save','savings'];
const CF_SAV_CATEGORIES = ['Savings','Cars','Maintenance'];
function cfIsSavingsAlloc(e){
  if(!e) return false;
  if(e.sourceType && CF_SAV_SRC_TYPES.indexOf(e.sourceType) > -1) return true;
  if(e.category   && CF_SAV_CATEGORIES.indexOf(e.category)  > -1) return true;
  return false;
}

function buildCFMonthData(mk){
  // Returns:
  //   income, expenses (all expenses, both real + savings), totalIncome,
  //   totalRealExpenses (Option B: real spend only — used for net),
  //   totalSavingsAllocs (money moved to savings — still yours),
  //   totalExpenses (legacy: real + savings, kept for backwards compat),
  //   net (Option B: Income − Real Expenses only)
  // for a given month key (YYYY-MM)
  const data = loadCFData();
  const recurIncome   = (data.recurring&&data.recurring.income)   || [];
  const recurExpenses = (data.recurring&&data.recurring.expenses)  || [];
  const monthIncome   = (data[mk]&&data[mk].income)               || [];
  const monthExpenses = (data[mk]&&data[mk].expenses)              || [];
  const monthIds = new Set([...monthIncome,...monthExpenses].map(function(e){ return e.id; }));
  const allIncome   = [...recurIncome.filter(function(e){ return !monthIds.has(e.id); }),...monthIncome];
  const allExpenses = [...recurExpenses.filter(function(e){ return !monthIds.has(e.id); }),...monthExpenses];

  // Carpool income is intentionally NOT auto-pulled here. Carpool entries on
  // the Carpool tab represent expected/projected earnings, not money received.
  // Real income only counts when the user actively logs receipt via MoneyMoveZ
  // (which posts a proper income entry through postToCF). Otherwise the cash
  // flow report would over-report income that's still owed to the user.

  // ── Auto-pulls removed for parity with the in-app render ──────────────
  // Previously the PDF path pulled instalments, savings deposits, and car
  // spends into the expense list automatically. The in-app screen does NOT
  // do this — instalment payments are logged manually when paid, savings
  // come through MoneyMoveZ, and car spends post via Use Funds → CF directly.
  //
  // Keeping the auto-pulls in the PDF caused a discrepancy: the PDF total
  // would be e.g. R10,365 while the in-app showed R9,689 for the same month.
  // We now only pull legacy untagged car entries (the same heuristic the
  // in-app uses) so the two surfaces always agree.

  // Legacy car entries — only those without a note and not yet posted to CF.
  // Matches the in-app filter in settings.js renderCashFlow exactly.
  const carFund = funds.find(function(f){ return f.isExpense; });
  if(carFund){
    const carSpent = (carFund.deposits||[]).filter(function(d){
      return d.txnType==='out' && d.date && d.date.startsWith(mk) && !d.note && !d.cfPosted;
    }).reduce(function(s,d){ return s+d.amount; },0);
    if(carSpent > 0) allExpenses.push({ label:'Car Expenses (untagged)', amount:carSpent, icon:'🔧', auto:true, category:'Cars' });
  }

  const totalIncome        = allIncome.reduce(function(s,e){ return s+e.amount; },0);
  const totalExpenses      = allExpenses.reduce(function(s,e){ return s+e.amount; },0);
  const totalSavingsAllocs = allExpenses.filter(cfIsSavingsAlloc).reduce(function(s,e){ return s+e.amount; },0);
  const totalRealExpenses  = totalExpenses - totalSavingsAllocs;
  // Option B: Net = Income − Real Expenses only. Savings shown separately.
  const net                = totalIncome - totalRealExpenses;

  return {
    income: allIncome,
    expenses: allExpenses,
    totalIncome,
    totalExpenses,        // legacy: real + savings
    totalRealExpenses,    // Option B headline figure
    totalSavingsAllocs,   // money moved to savings (still yours)
    net                   // Option B: Income − Real Expenses
  };
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

    // ── BANK BALANCE BANNER ────────────────────────────────────────────
    // Pulls the user's current FNB + Tyme balances from yb_recon_balances_v1.
    // Shown at the top of every monthly PDF as a "snapshot of now" — clearly
    // distinct from the month's calculated income/expense totals.
    try {
      var bbData = (typeof loadReconBalances === 'function') ? loadReconBalances() : {};
      var bbFnb  = Number(bbData.fnb)||0;
      var bbTyme = Number(bbData.tyme)||0;
      var bbTotal = bbFnb + bbTyme;
      var bbAsOf  = bbData.updated ? new Date(bbData.updated).toLocaleDateString('en-ZA') : new Date().toLocaleDateString('en-ZA');
      // Banner background — teal/cyan tint to differentiate from the green-themed monthly totals
      doc.setFillColor(10,30,30);
      doc.setDrawColor(26,64,64);
      doc.setLineWidth(0.4);
      doc.roundedRect(margin, y-2, W-(margin*2), 14, 2, 2, 'FD');
      // Label
      doc.setTextColor(90,184,184); doc.setFontSize(7); doc.setFont('helvetica','normal');
      doc.text('BANK BALANCE  (as of '+bbAsOf+')', margin+3, y+2.5);
      // Value
      doc.setTextColor(155,224,224); doc.setFontSize(13); doc.setFont('helvetica','bold');
      doc.text('R'+bbTotal.toFixed(2), margin+3, y+9);
      // Breakdown — right-aligned
      doc.setTextColor(106,160,160); doc.setFontSize(7); doc.setFont('helvetica','normal');
      doc.text('FNB: R'+bbFnb.toFixed(2)+'   Tyme: R'+bbTyme.toFixed(2), W-margin-3, y+8, {align:'right'});
      y += 18;
    } catch(_bbErr){
      // If recon balances unavailable, skip silently — PDF should still build.
      console.warn('[PDF] Bank balance banner skipped:', _bbErr);
    }

    // Summary heading
    doc.setTextColor(90,136,0); doc.setFontSize(7); doc.setFont('helvetica','normal');
    doc.text('SUMMARY', margin, y); y+=5;
    // Table header — Option B: net excludes savings, so summary needs both columns.
    // Column positions tuned for A4 portrait at 16mm margins.
    var c={month:margin, income:64, expenses:104, savings:140, net:174};
    doc.setFillColor(20,30,0); doc.rect(margin,y-3.5,W-(margin*2),6,'F');
    doc.setTextColor(90,136,0); doc.setFontSize(7);
    doc.text('MONTH',    c.month,    y);
    doc.text('INCOME',   c.income,   y);
    doc.text('EXPENSES', c.expenses, y);
    doc.text('SAVINGS',  c.savings,  y);
    doc.text('NET',      c.net,      y);
    y+=7;
    var grandIn=0, grandEx=0, grandSav=0;
    months.forEach(function(m,i){
      if(y>H-20) newPage();
      doc.setFillColor(i%2===0?14:17,i%2===0?14:17,i%2===0?14:17);
      doc.rect(margin,y-3.5,W-(margin*2),6,'F');
      doc.setTextColor(190,190,190); doc.setFontSize(8); doc.setFont('helvetica','normal');
      doc.text(m.label, c.month, y);
      doc.text('R'+m.data.totalIncome.toFixed(2), c.income, y);
      doc.text('R'+m.data.totalRealExpenses.toFixed(2), c.expenses, y);
      // Savings column — green-ish to communicate "this is yours, not lost"
      doc.setTextColor(140,200,80);
      doc.text('R'+m.data.totalSavingsAllocs.toFixed(2), c.savings, y);
      var nc = m.data.net>=0?[200,242,48]:[242,48,96];
      doc.setTextColor(nc[0],nc[1],nc[2]);
      doc.text((m.data.net>=0?'+ ':'-  ')+'R'+Math.abs(m.data.net).toFixed(2), c.net, y);
      grandIn+=m.data.totalIncome; grandEx+=m.data.totalRealExpenses; grandSav+=m.data.totalSavingsAllocs;
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
      doc.setTextColor(140,200,80);
      doc.text('R'+grandSav.toFixed(2), c.savings, y);
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
      // Split expenses — use the shared cfIsSavingsAlloc helper (defined at top
      // of this file) so the PDF, the in-app screen, and the borrow lending
      // guardrail all classify entries identically.
      var pdfRealExp  = m.data.expenses.filter(function(e){ return !cfIsSavingsAlloc(e); });
      var pdfSavAlloc = m.data.expenses.filter(function(e){ return  cfIsSavingsAlloc(e); });
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
      // Match savings card logic: outflow = txnType==='out' OR no txnType field
      // (legacy records added before the txnType flag existed)
      (carFundExp.deposits||[])
        .filter(function(d){ return d.txnType === 'out' || !d.txnType; })
        .sort(function(a,b){ return new Date(a.date) - new Date(b.date); })
        .forEach(function(d){
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
  // Populate the carpool tariff inputs with current saved values
  if(typeof populateCarpoolTariffInputs === 'function') try { populateCarpoolTariffInputs(); } catch(e){}
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
  // Refresh cloud sync status panel (added in Supabase migration)
  try { if(typeof refreshCloudSyncStatus === 'function') refreshCloudSyncStatus(); } catch(e){}
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

// ── ONE-TIME MIGRATION: backfill sourceType on legacy stored entries ─────
// Why: when sourceType was added to the schema, older entries already in
// localStorage didn't have it. The cashflow split logic (real expenses vs
// savings allocations) currently falls back to matching on `category` to
// catch those entries. That fallback is brittle — if a user ever creates
// a category called "Savings" for a non-savings reason, it gets misclassified.
//
// This migration runs once, scans every stored expense, and backfills
// sourceType using the entry's category or label as a reliable proxy. After
// it runs, the category fallback can eventually be removed cleanly.
//
// Safety:
//   - Backs up the entire cfData blob to a separate key BEFORE mutating
//   - Idempotent (won't run twice — guarded by a flag key)
//   - Only touches entries WITHOUT sourceType (already-tagged entries are skipped)
//   - Logs every change to the console so you can verify what was migrated

const CF_MIGRATION_FLAG_KEY    = 'yb_cf_sourcetype_migration_v1';
const CF_MIGRATION_BACKUP_KEY  = 'yb_cfdata_premigration_backup_v1';

// Inference rules: maps category/label hints to a stable sourceType.
// Keep these conservative — when in doubt, leave the entry untouched so a
// real manual expense never gets misclassified as a savings allocation.
function _cfInferSourceType(entry){
  if(!entry || entry.sourceType) return null;
  var cat = (entry.category || '').toLowerCase();
  var lbl = (entry.label    || '').toLowerCase();

  // Category-based rules
  if(cat === 'savings')      return 'savings_deposit';
  if(cat === 'maintenance')  return 'maint';
  if(cat === 'instalments')  return 'instalment';
  if(cat === 'cars'){
    // Car expenses: outflows from the car fund. Use car_spend by default
    // (older cars-tab spend logging path). New deposits set car_add via postToCF.
    return 'car_spend';
  }

  // Label-based fallback (older entries may have no category at all)
  if(lbl.indexOf('savings -') === 0 || lbl.indexOf('savings —') === 0) return 'savings_deposit';
  if(lbl.indexOf('maintenance fund') === 0)                            return 'maint';
  if(lbl.indexOf('car expenses') === 0 || lbl.indexOf('car fund') === 0) return 'car_spend';

  return null; // unknown → leave alone (treated as real expense)
}

function runCFSourceTypeMigration(){
  try {
    if(lsGet(CF_MIGRATION_FLAG_KEY)) return; // already ran
    var data = loadCFData();
    if(!data || typeof data !== 'object') return;

    // Backup BEFORE any mutation
    lsSet(CF_MIGRATION_BACKUP_KEY, JSON.stringify(data));

    var changes = [];
    var totalScanned = 0;

    // Walk every month's expenses + the recurring expenses list
    var buckets = [];
    if(data.recurring && Array.isArray(data.recurring.expenses)) buckets.push({path:'recurring', arr:data.recurring.expenses});
    Object.keys(data).forEach(function(k){
      if(k === 'recurring') return;
      if(data[k] && Array.isArray(data[k].expenses)) buckets.push({path:k, arr:data[k].expenses});
    });

    buckets.forEach(function(b){
      b.arr.forEach(function(e){
        totalScanned++;
        var inferred = _cfInferSourceType(e);
        if(inferred){
          changes.push({path:b.path, label:e.label, oldCategory:e.category||null, newSourceType:inferred});
          e.sourceType = inferred;
        }
      });
    });

    if(changes.length){
      saveCFData(data);
      console.log('[CF migration] Backfilled sourceType on '+changes.length+' of '+totalScanned+' stored expenses.');
      console.log('[CF migration] Backup saved to localStorage key: '+CF_MIGRATION_BACKUP_KEY);
      console.table(changes);
    } else {
      console.log('[CF migration] Scanned '+totalScanned+' stored expenses, no backfill needed.');
    }

    lsSet(CF_MIGRATION_FLAG_KEY, '1');
  } catch(err){
    console.warn('[CF migration] Failed:', err);
    // Do not set the flag — safe to retry on next load.
  }
}

// Run the migration as soon as cashflow.js parses. By this point core.js has
// already loaded (it's earlier in the script tag order) so lsGet/lsSet/CF_KEY
// are all available. This runs before any user interaction can fire a save.
try { runCFSourceTypeMigration(); } catch(e){}

// Manual rerun helpers — exposed for console use only.
//   yb_cfMigrationStatus()   shows whether it ran and where the backup lives
//   yb_cfMigrationRerun()    clears the flag and runs again (useful if you
//                            edit data manually and want to re-tag)
//   yb_cfMigrationRestore()  restores the pre-migration backup, undoing any
//                            backfilled sourceType. Use only if something
//                            went wrong.
window.yb_cfMigrationStatus = function(){
  var ran = !!lsGet(CF_MIGRATION_FLAG_KEY);
  var hasBackup = !!lsGet(CF_MIGRATION_BACKUP_KEY);
  console.log('Migration ran:', ran, '| Backup present:', hasBackup);
  return { ran: ran, hasBackup: hasBackup };
};
window.yb_cfMigrationRerun = function(){
  lsSet(CF_MIGRATION_FLAG_KEY, null);
  runCFSourceTypeMigration();
};
window.yb_cfMigrationRestore = function(){
  var backup = lsGet(CF_MIGRATION_BACKUP_KEY);
  if(!backup){ console.warn('No backup found.'); return; }
  if(!confirm('Restore cashflow data from pre-migration backup? This will undo any sourceType backfilling.')) return;
  lsSet(CF_KEY, backup);
  lsSet(CF_MIGRATION_FLAG_KEY, null);
  console.log('Restored. Reload the page to see the original data.');
};


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
  var cashBtn = document.getElementById('cfBankCash');
  // FNB (blue)
  if(fnbBtn){  fnbBtn.style.borderColor  = bank==='FNB'     ? '#4a7aaa' : 'var(--border)';
               fnbBtn.style.background   = bank==='FNB'     ? '#0a0f1a' : 'none';
               fnbBtn.style.color        = bank==='FNB'     ? '#4a9aff' : 'var(--muted)'; }
  // TymeBank (orange)
  if(tymeBtn){ tymeBtn.style.borderColor = bank==='TymeBank'? '#aa8a00' : 'var(--border)';
               tymeBtn.style.background  = bank==='TymeBank'? '#1a1000' : 'none';
               tymeBtn.style.color       = bank==='TymeBank'? '#f2a830' : 'var(--muted)'; }
  // Cash (lime)
  if(cashBtn){ cashBtn.style.borderColor = bank==='Cash'    ? '#3a5a00' : 'var(--border)';
               cashBtn.style.background  = bank==='Cash'    ? '#0d1a00' : 'none';
               cashBtn.style.color       = bank==='Cash'    ? '#c8f230' : 'var(--muted)'; }
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
      // Restore destBank if present (May 2026 redesign); fallback to account
      // which used to store the bank choice for cash-flow entries.
      var savedBank = entry.destBank || (['FNB','TymeBank','Cash'].indexOf(entry.account)>-1 ? entry.account : 'FNB');
      document.getElementById('cfEntryBank').value = savedBank;
      setCfBank(savedBank, null);
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
  // destBank is the dedicated "where the money lands" field added in the May 2026
  // redesign. The older `account` field is kept untouched for back-compat (carpool
  // auto-imports etc. stored passenger names there). destBank is the source of
  // truth for bank-balance math.
  // createdAt is a full ISO timestamp used by the bank-bucket math to decide
  // whether this entry is "after the baseline" (only entries newer than the
  // baseline snapshot adjust the running bank total).
  const entry = { id: editId || uid(), label, amount, icon: cfSelIcon, auto: false, account: cfBank, destBank: cfBank, createdAt: new Date().toISOString() };
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
  // ── Adjust live bank-bucket baseline (May 2026 Redesign Round 2) ──
  // If this is a NEW entry (not an edit of an existing one) and it has a
  // destBank, push the delta to the bucket so the Available Cash card
  // reflects it instantly. Income adds, expense subtracts. Edits are NOT
  // re-applied — we'd have to undo the old value first, which is fragile.
  if(!editId && cfBank && typeof window._adjustBaselineForBank === 'function'){
    var delta = (type === 'income') ? amount : -amount;
    window._adjustBaselineForBank(cfBank, delta);
  }
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


