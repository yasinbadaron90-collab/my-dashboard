#!/usr/bin/env node
// Money maths regression tests — v151l.
// Pulls the REAL functions out of the working copy (no copies of the formulas here)
// and checks them on a small fake dataset. Guards the bugs that were found by hand:
//   - R17.95 float drift in fundTotal (v149t)
//   - Lezaun double-counted repayment in calcPersonTotals (2026-08-10)
//   - carpool credit: oldest first, capped, fully reversible (v151e-g)
//   - UTC date slip in localDateStr callers (v151l)
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
  grab(read('savings.js'), 'fundTotal'),
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

console.log('\n' + (process.exitCode ? '❌ FAILED' : '✅ ' + passed + ' checks passed'));
