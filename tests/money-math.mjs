#!/usr/bin/env node
// Money maths regression tests — v151l.
// Pulls the REAL functions out of the working copy (no copies of the formulas here)
// and checks them on a small fake dataset. Guards the bugs that were found by hand:
//   - R17.95 float drift in fundTotal (v149t)
//   - Lezaun double-counted repayment in calcPersonTotals (2026-08-10)
//   - carpool credit: oldest first, capped, fully reversible (v151e-g)
//   - UTC date slip in localDateStr callers (v151l)
//   - Money In delete leaving money behind (_moneyInReverse, v151n)
// Run: node tests/money-math.mjs      Exit 0 = pass, 1 = fail.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
function grab(src, name){
  const start = src.indexOf('function ' + name + '(');
  if(start < 0) throw new Error('function not found: ' + name);
  let i = src.indexOf('{', src.indexOf(')', start)), depth = 0;
  for(; i < src.length; i++){
    if(src[i] === '{') depth++;
    else if(src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('unbalanced braces in ' + name);
}

const store = {};
let n = 0;
const ctx = vm.createContext({
  lsGet: k => (k in store ? store[k] : null),
  lsSet: (k, v) => { store[k] = String(v); },
  uid: () => 't' + (++n),
  console
});
const carpool = read('carpool.js');
vm.runInContext([
  grab(read('cashflow.js'), 'localDateStr'),
  grab(read('calc.js'), 'fundTotal'),
  grab(read('money.js'), 'calcPersonTotals'),
  "var CP_CREDIT_KEY = 'yb_cp_credits_v1';",
  ...['cpCreditsLoad','cpCreditsSave','_cpR2','cpCreditOpen','cpCreditAdd','cpCreditConsume','cpCreditRestore'].map(f => grab(carpool, f))
].join('\n'), ctx);
const { localDateStr, fundTotal, calcPersonTotals, cpCreditOpen, cpCreditAdd, cpCreditConsume, cpCreditRestore } = ctx;

let passed = 0;
function t(name, fn){ try{ fn(); passed++; console.log('  ✓ ' + name); } catch(e){ console.log('  ✗ ' + name + '\n      ' + e.message); process.exitCode = 1; } }

console.log('fundTotal');
t('rounds to cents (the R17.95 case)', () => {
  const deps = [{amount:10.10},{amount:5.55},{amount:2.30}];
  assert.equal(fundTotal({deposits:deps}), 17.95);
});
t("txnType 'out' subtracts; empty pocket is 0, never -0", () => {
  assert.equal(fundTotal({deposits:[{amount:100},{amount:40.5,txnType:'out'}]}), 59.5);
  assert.ok(Object.is(fundTotal({deposits:[{amount:5},{amount:5,txnType:'out'}]}), 0));
  assert.equal(fundTotal({}), 0);
});

console.log('calcPersonTotals');
const owing = e => { const r = calcPersonTotals(e, false); return Math.round((r.borrowed - r.repaid) * 100) / 100; };
t('repayment pool pays oldest loan first', () => {
  assert.equal(owing([{date:'2026-01-01',amount:100},{date:'2026-02-01',amount:50},{type:'repay',date:'2026-02-05',amount:100}]), 50);
});
t('paid loan + its own repay entry is not credited twice (Lezaun 2026-08-10)', () => {
  assert.equal(owing([
    {date:'2026-06-01',amount:300,paid:true},{type:'repay',date:'2026-06-25',amount:300},
    {date:'2026-08-01',amount:200}
  ]), 200);
});
t('paid:true with no repay entry settles itself and eats no pool', () => {
  assert.equal(owing([{date:'2026-01-01',amount:80,paid:true},{date:'2026-02-01',amount:60}]), 60);
});
t('fully repaid is exactly 0; iOwe entries are ignored', () => {
  assert.equal(owing([{date:'2026-01-01',amount:33.33},{date:'2026-01-02',amount:33.33},{date:'2026-01-03',amount:33.34},{type:'repay',date:'2026-01-09',amount:100}]), 0);
  assert.equal(owing([{date:'2026-01-01',amount:500,iOwe:true}]), 0);
});

console.log('carpool credit');
t('consume is oldest first and capped at what is open', () => {
  store.yb_cp_credits_v1 = JSON.stringify([
    {id:'a',passenger:'P',amount:27,remaining:27,createdAt:'2026-11-01T00:00:00Z',uses:[]},
    {id:'b',passenger:'P',amount:54,remaining:54,createdAt:'2026-11-02T00:00:00Z',uses:[]},
    {id:'c',passenger:'Q',amount:99,remaining:99,createdAt:'2026-10-01T00:00:00Z',uses:[]}
  ]);
  assert.equal(cpCreditOpen('P'), 81);
  const used = cpCreditConsume('P', 40, 'pay1');
  assert.deepEqual(JSON.parse(JSON.stringify(used)), [{id:'a',amount:27},{id:'b',amount:13}]);
  assert.equal(cpCreditOpen('P'), 41);
  assert.equal(cpCreditOpen('Q'), 99);
  const rest = cpCreditConsume('P', 500, 'pay2');
  assert.equal(rest.reduce((s,u) => s + u.amount, 0), 41);
  assert.equal(cpCreditOpen('P'), 0);
  cpCreditRestore(rest, 'pay2'); cpCreditRestore(used, 'pay1');
});
t('restore puts every cent back and never exceeds the original', () => {
  assert.equal(cpCreditOpen('P'), 81);
  cpCreditRestore([{id:'a',amount:27}], 'ghost');
  assert.equal(cpCreditOpen('P'), 81);
});
t('zero or negative credit is not created', () => {
  assert.equal(cpCreditAdd('P', 0, ''), null);
  assert.equal(cpCreditAdd('P', -5, ''), null);
});

console.log('money in reverse');
t('_moneyInReverse puts every rand back: pockets, cash flow, bank, loan, record', () => {
  // Real code, stubbed storage. Simulates one saved Money In of R5000 into FNB:
  // house R1000, pocket split R2000, subscription R300 (R200 bank part) that repays a loan,
  // and R500 of house money parked in a pocket.
  const s = {}; let base = { FNB: 1000 };
  const ext = { lender: { entries: [ {id:'old', amount:50}, {id:'rep1', amount:200} ] } };
  const funds = [
    { id:'f1', deposits:[ {id:'keep1', amount:10}, {id:'d1', amount:2000} ] },
    { id:'f2', deposits:[ {id:'d2', amount:500} ] }
  ];
  const cf = { '2026-11': {
    income:   [ {id:'inc', amount:5000, destBank:'FNB'}, {id:'otherInc', amount:7} ],
    expenses: [ {id:'cfSplit', amount:2000, destBank:'FNB', sourceType:'savings_deposit'},
                {id:'house', amount:1000, destBank:'FNB'}, {id:'sub1', amount:300, destBank:'FNB'},
                {id:'hc', amount:500, sourceType:'savings_deposit'}, {id:'hcSubs', amount:0},
                {id:'otherExp', amount:9, destBank:'FNB'} ] } };
  const rec = { id:'mi1', date:'2026-11-10', amount:5000, sourceBank:'FNB', house:1000,
    cfIncomeId:'inc', cfHouseId:'house',
    splits:[ {fundId:'f1', depositId:'d1', cfId:'cfSplit', amount:2000} ],
    subs:[ {cfId:'sub1', amount:300, bank:200, debtKey:'lender', debtEntryId:'rep1'} ],
    houseCash:{ fundId:'f2', depositId:'d2', cfId:'hc', subsCfId:'hcSubs' } };
  // Baseline as the save left it: +5000 income, -1000 house, -2000 split, -200 sub bank part.
  base.FNB = 1000 + 5000 - 1000 - 2000 - 200;
  s.yb_moneyin_v1 = JSON.stringify([rec, {id:'mi2'}]);
  const c2 = vm.createContext({
    lsGet: k => (k in s ? s[k] : null), lsSet: (k, v) => { s[k] = String(v); },
    funds, saveFunds(){}, renderFunds(){},
    loadCFData: () => JSON.parse(JSON.stringify(cf)),
    saveCFData: d => { for(const k in cf) delete cf[k]; Object.assign(cf, JSON.parse(JSON.stringify(d))); },
    loadExternalBorrows: () => JSON.parse(JSON.stringify(ext)),
    saveExternalBorrows: d => { ext.lender = d.lender; },
    window: { _adjustBaselineForBank: (b, amt) => { base[b] = Math.round(((base[b]||0) + amt) * 100) / 100; } },
    console
  });
  const savings = read('savings.js'), cashflow = read('cashflow.js'), moneyin = read('moneyin.js');
  vm.runInContext([
    "const CF_SAV_SRC_TYPES = ['savings_deposit','car_add','maint','custommaint','car_service_save','savings'];",
    "const CF_SAV_CATEGORIES = ['Savings','Cars','Maintenance'];",
    grab(cashflow, 'cfIsSavingsAlloc'), grab(savings, 'removeFromCF'),
    "const MONEYIN_KEY = 'yb_moneyin_v1';",
    grab(moneyin, 'loadMoneyInData'), grab(moneyin, 'saveMoneyInData'), grab(moneyin, '_moneyInReverse')
  ].join('\n'), c2);
  assert.equal(c2._moneyInReverse('mi1', {silent:true}), true);
  assert.equal(base.FNB, 1000, 'bank baseline back to where it started');
  assert.deepEqual(funds[0].deposits.map(d => d.id), ['keep1']);
  assert.deepEqual(funds[1].deposits.map(d => d.id), []);
  assert.deepEqual(cf['2026-11'].income.map(e => e.id), ['otherInc']);
  assert.deepEqual(cf['2026-11'].expenses.map(e => e.id), ['otherExp']);
  assert.deepEqual(ext.lender.entries.map(e => e.id), ['old']);
  assert.deepEqual(JSON.parse(s.yb_moneyin_v1).map(r => r.id), ['mi2']);
  assert.equal(c2._moneyInReverse('nope', {silent:true}), false);
});

console.log('dates');
t('localDateStr gives the local calendar day, not the UTC one', () => {
  assert.equal(localDateStr(new Date(2026, 10, 1, 0, 30)), '2026-11-01');
  assert.equal(localDateStr(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});
t('no UTC date slices left in app code', () => {
  const files = ['advisories','bankfeed','carpool','cars','core','instalments','odin','odin_chat','routine','savings','school'];
  const bad = [];
  files.forEach(f => read(f + '.js').split('\n').forEach((l, i) => {
    if(/toISOString\(\)\.(split\('T'\)\[0\]|slice\(0,\s*(7|10)\))/.test(l) && !/typeof localDateStr/.test(l)) bad.push(f + '.js:' + (i + 1));
  }));
  assert.deepEqual(bad, []);
});

console.log('\nplan: money added and kept (v152o/q)');
{
  // Ee90 case: R208 added on 16-17 Nov, then a R52 top-up spent the SAME day on 20 Nov.
  // The old "only after the last spend date" rule counted 0; the pocket really holds R208 of cycle money.
  const pctx = vm.createContext({
    lsGet: k => (k in store ? store[k] : null), lsSet: (k, v) => { store[k] = String(v); }, console,
    loadMoneyInData: () => [], loadMoveData: () => pmoves, funds: []
  });
  var pmoves = [];
  vm.runInContext([grab(read('calc.js'), 'fundTotal'), grab(read('calc.js'), 'planInCycle'), grab(read('calc.js'), 'planRoutedInCycle')].join('\n'), pctx);
  const cyc = { start:'2026-10-24', next:'2026-11-25' };
  const run = (deposits, moves) => { pmoves = moves; pctx.funds = [{ id:'p1', deposits: deposits.concat(moves.filter(m=>!m.merge).map(m=>({ date:m.date, amount:m.amount, moveId:'mv' }))) }]; return pctx.planRoutedInCycle({ pocketId:'p1', source:'' }, cyc); };
  t('top-up spent the same day does not wipe out older kept money', () => {
    const r = run(
      [ {date:'2026-10-01',amount:2186.18}, {date:'2026-11-13',amount:3300.97,txnType:'out'}, {date:'2026-11-17',amount:100,repayId:'r1'},
        {date:'2026-11-20',amount:52,moveId:'m3'}, {date:'2026-11-20',amount:52,txnType:'out'} ],
      [ {date:'2026-11-13',toId:'p1',amount:1114.79}, {date:'2026-11-16',toId:'p1',amount:108}, {date:'2026-11-20',toId:'p1',amount:52} ]);
    assert.equal(r, 208);
  });
  t('top-ups spent in full still count as nothing', () => {
    const r = run([ {date:'2026-11-05',amount:500,txnType:'out'} ], [ {date:'2026-11-04',toId:'p1',amount:500} ]);
    assert.equal(r, 0);
  });
  t('money added after the last spend counts in full', () => {
    const r = run([ {date:'2026-10-01',amount:200}, {date:'2026-11-05',amount:500,txnType:'out'} ], [ {date:'2026-11-04',toId:'p1',amount:300}, {date:'2026-11-08',toId:'p1',amount:200} ]);
    assert.equal(r, 200);
  });
  t('a small spend only cancels that much of an earlier top-up', () => {
    const r = run([ {date:'2026-11-06',amount:120,txnType:'out'} ], [ {date:'2026-11-04',toId:'p1',amount:500} ]);
    assert.equal(r, 380);
  });
  t('merge moves never count', () => {
    assert.equal(run([], [ {date:'2026-11-04',toId:'p1',amount:900,merge:true} ]), 0);
  });
}

console.log('\nfuel statement budget line (v152s)');
{
  const fctx = vm.createContext({ console });
  vm.runInContext(grab(read('core.js'), '_fuelStatementBudget'), fctx);
  const b = fctx._fuelStatementBudget;
  t('one whole cycle: budget 3000 minus spent 2804.55 = 195.45 left (the on-screen number)', () => {
    const r = b('2026-09-25', '2026-10-24', 2804.55, 3000); assert.equal(r.budget, 3000); assert.equal(r.left, 195.45);
  });
  t('over budget gives a negative left', () => { assert.equal(b('2026-09-25', '2026-10-24', 3100.5, 3000).left, -100.5); });
  t('year boundary cycle 25 Dec to 24 Jan counts as one cycle', () => { assert.ok(b('2026-12-25', '2027-01-24', 100, 3000)); });
  t('current cycle so far (25 Oct to 22 Nov): 3000 - 2290.35 = 709.65 left, flagged partial (what the phone showed at 17:34 on 22 Nov)', () => {
    const r = b('2026-10-25', '2026-11-22', 2290.35, 3000); assert.equal(r.left, 709.65); assert.equal(r.partial, true);
  });
  t('a finished cycle is not partial', () => { assert.equal(b('2026-09-25', '2026-10-24', 100, 3000).partial, false); });
  t('end date before the start gives no line', () => { assert.equal(b('2026-10-25', '2026-10-20', 100, 3000), null); });
  t('same-month part of a cycle (25 Oct to 31 Oct) counts as partial', () => { assert.equal(b('2026-10-25', '2026-10-31', 100, 3000).partial, true); });
  t('custom range gets no budget line', () => {
    assert.equal(b('2026-10-01', '2026-10-31', 100, 3000), null);
    assert.equal(b('2026-09-25', '2026-11-24', 100, 3000), null);
    assert.equal(b('2026-09-26', '2026-10-24', 100, 3000), null);
  });
  t('no budget set or junk dates gives no line', () => { assert.equal(b('2026-09-25', '2026-10-24', 100, 0), null); assert.equal(b('', 'x', 1, 3000), null); });
  t('exact zero left is not shown as -0', () => { assert.ok(Object.is(b('2026-09-25', '2026-10-24', 3000, 3000).left, 0)); });
}

console.log('\n' + (process.exitCode ? '❌ FAILED' : '✅ ' + passed + ' checks passed'));
