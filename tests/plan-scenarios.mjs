#!/usr/bin/env node
// Plan tab scenario tests (v152o): black-box checks of the pay-cycle and "money added and kept"
// numbers using the REAL functions from calc.js on small made-up data.
// Run: node tests/plan-scenarios.mjs      Exit 0 = pass, 1 = fail.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
function grab(src, name){
  const start = src.indexOf('function ' + name + '(');
  if(start < 0) throw new Error('function not found: ' + name);
  let i = src.indexOf('{', src.indexOf(')', start)), depth = 0;
  for(; i < src.length; i++){ if(src[i] === '{') depth++; else if(src[i] === '}' && --depth === 0) return src.slice(start, i + 1); }
  throw new Error('unbalanced braces in ' + name);
}
const calc = read('calc.js');
const st = { moneyIn: [], moves: [], cpPay: [], funds: [], plan: null };
const ctx = vm.createContext({
  console, PLAN_KEY: 'plan',
  lsGet: k => k === 'plan' ? (st.plan ? JSON.stringify(st.plan) : null) : k === 'yb_carpool_payments_v1' ? JSON.stringify(st.cpPay) : null,
  loadMoneyInData: () => st.moneyIn, loadMoveData: () => st.moves,
  get funds(){ return st.funds; }
});
vm.runInContext(['_planDS','planSalaryDates','_planDecPayDay','_planMonth25','_planNominal','_planSalaryCycle','_planEffStart','_planExpectedPay','planCycleFor','planInCycle','planRoutedInCycle']
  .map(n => grab(calc, n)).join('\n'), ctx);
const { planCycleFor, planInCycle, planRoutedInCycle } = ctx;
let passed = 0;
function t(name, fn){ try{ fn(); passed++; console.log('  ✓ ' + name); } catch(e){ console.log('  ✗ ' + name + '\n      ' + e.message); process.exitCode = 1; } }
const reset = () => { st.moneyIn = []; st.moves = []; st.cpPay = []; st.funds = []; st.plan = null; };
const salary = date => ({ id:'s'+date, date, amount:20000, note:'Salary', houseTotal:5000, splits:[] });

console.log('pay cycle (25th to 24th)');
t('a normal day sits in the cycle that started on the 25th', () => {
  reset(); const c = planCycleFor('2026-11-10');
  assert.equal(c.label, '2026-10-25'); assert.equal(c.labelEnd, '2026-11-24'); assert.equal(c.nextLabel, '2026-11-25');
});
t('the 24th is still the old cycle, the 25th starts the new one', () => {
  reset();
  assert.equal(planCycleFor('2026-11-24').label, '2026-10-25');
  assert.equal(planCycleFor('2026-11-25').label, '2026-11-25');
});
t('year boundary: 3 Jan belongs to the cycle that began 25 Dec', () => {
  reset(); assert.equal(planCycleFor('2027-01-03').label, '2026-12-25');
});
t('planInCycle: start inclusive, next exclusive', () => {
  reset(); const c = { start:'2026-10-25', next:'2026-11-25' };
  assert.equal(planInCycle('2026-10-24', c), false); assert.equal(planInCycle('2026-10-25', c), true);
  assert.equal(planInCycle('2026-11-24', c), true);  assert.equal(planInCycle('2026-11-25', c), false);
});
t('payday on a weekend moves to the Friday before (25 Oct 2026 is a Sunday -> Fri 23 Oct)', () => {
  reset(); assert.equal(planCycleFor('2026-10-05').payNext, '2026-10-23');
});
t('salary logged early (on the 22nd) starts the next cycle that day', () => {
  reset(); st.moneyIn = [salary('2026-11-22')];
  const c = planCycleFor('2026-11-22');
  assert.equal(c.label, '2026-11-25'); assert.equal(c.start, '2026-11-22'); assert.equal(c.early, true);
});
t('a salary logged early does not change days before it', () => {
  reset(); st.moneyIn = [salary('2026-11-22')];
  assert.equal(planCycleFor('2026-11-20').label, '2026-10-25');
});
t('a late salary (logged before the 10th) belongs to LAST month, so the 5th stays in that cycle', () => {
  reset(); st.moneyIn = [salary('2026-11-05')];
  assert.equal(planCycleFor('2026-11-06').label, '2026-10-25');
});

console.log('\nmoney added and kept this cycle');
const C = { start:'2026-10-25', next:'2026-11-25' };
const run = (deps, moves, card) => { st.moves = moves; st.funds = [{ id:'p', deposits: deps }]; return planRoutedInCycle(Object.assign({ pocketId:'p', source:'' }, card||{}), C); };
t('Money In split to the pocket counts in full', () => {
  reset(); st.moneyIn = [{ date:'2026-11-02', splits:[{ fundId:'p', amount:500 }] }];
  assert.equal(run([], []), 500);
});
t('Money In from before the cycle is ignored', () => {
  reset(); st.moneyIn = [{ date:'2026-10-24', splits:[{ fundId:'p', amount:500 }] }];
  assert.equal(run([], []), 0);
});
t('Money In to a different pocket is ignored', () => {
  reset(); st.moneyIn = [{ date:'2026-11-02', splits:[{ fundId:'other', amount:500 }] }];
  assert.equal(run([], []), 0);
});
t('move in on the 25th (cycle start) counts, move on the 24th does not', () => {
  reset();
  assert.equal(run([], [{ date:'2026-10-25', toId:'p', amount:100 }]), 100);
  assert.equal(run([], [{ date:'2026-10-24', toId:'p', amount:100 }]), 0);
});
t('move in on 24 Nov counts, 25 Nov does not', () => {
  reset();
  assert.equal(run([], [{ date:'2026-11-24', toId:'p', amount:100 }]), 100);
  assert.equal(run([], [{ date:'2026-11-25', toId:'p', amount:100 }]), 0);
});
t('spends before the top-up never reduce it', () => {
  reset(); assert.equal(run([{ date:'2026-11-02', amount:300, txnType:'out' }], [{ date:'2026-11-05', toId:'p', amount:200 }]), 200);
});
t('two top-ups then one spend: the spend eats the NEWEST top-up first', () => {
  reset(); assert.equal(run([{ date:'2026-11-10', amount:150, txnType:'out' }], [{ date:'2026-11-04', toId:'p', amount:300 }, { date:'2026-11-08', toId:'p', amount:200 }]), 350);
});
t('a spend bigger than all top-ups floors at 0 (never negative)', () => {
  reset(); assert.equal(run([{ date:'2026-11-10', amount:9000, txnType:'out' }], [{ date:'2026-11-04', toId:'p', amount:300 }]), 0);
});
t('spend then new top-up the same day: top-up first, so it is eaten (same-day top-up paying for the spend)', () => {
  reset(); assert.equal(run([{ date:'2026-11-10', amount:60, txnType:'out' }], [{ date:'2026-11-10', toId:'p', amount:60 }]), 0);
});
t('repayment and profit share deposits count; plain deposits do not', () => {
  reset();
  assert.equal(run([{ date:'2026-11-03', amount:100, repayId:'r' }, { date:'2026-11-04', amount:5, note:'Profit share' }, { date:'2026-11-05', amount:77 }], []), 105);
});
t('deposits already counted as a move/Money In/carpool are not counted twice as repay', () => {
  reset(); assert.equal(run([{ date:'2026-11-03', amount:100, repayId:'r', moveId:'m' }], []), 0);
});
t('merge moves (joining two pockets) are not saving', () => {
  reset(); assert.equal(run([], [{ date:'2026-11-04', toId:'p', amount:900, merge:true }]), 0);
});
t('Masud monthly allowance: every move in counts even after spending', () => {
  reset(); st.moves = [{ date:'2026-11-04', toId:'mm48mhq', amount:1575 }];
  st.funds = [{ id:'mm48mhq', deposits:[{ date:'2026-11-05', amount:1500, txnType:'out' }] }];
  assert.equal(planRoutedInCycle({ pocketId:'mm48mhq', source:'' }, C), 1575);
});
t('fares paid straight into a pocket count for ANY card, not just carpool cards (Ee90 case)', () => {
  reset(); st.cpPay = [{ date:'2026-11-03', amount:270, destChoice:'fund:p' }];
  assert.equal(run([], [], { source:'carpool' }), 270);
  assert.equal(run([], [], { source:'' }), 270);
});
t('a direct fare is not counted twice via its own pocket deposit', () => {
  reset(); st.cpPay = [{ date:'2026-11-03', amount:270, destChoice:'fund:p' }];
  assert.equal(run([{ date:'2026-11-03', amount:270, carpoolPaymentId:'c1' }], []), 270);
});
t('fares paid into a different pocket are ignored', () => {
  reset(); st.cpPay = [{ date:'2026-11-03', amount:270, destChoice:'fund:other' }];
  assert.equal(run([], []), 0);
});
t('money added by hand with the pocket Add button counts, and a later spend cancels it', () => {
  reset();
  assert.equal(run([{ date:'2026-11-03', amount:400, savingsDepositId:'x' }], []), 400);
  assert.equal(run([{ date:'2026-11-03', amount:400, savingsDepositId:'x' }, { date:'2026-11-09', amount:150, txnType:'out' }], []), 250);
});
t('Money In split stored as text is added as a number, not joined as text', () => {
  reset(); st.moneyIn = [{ date:'2026-11-02', splits:[{ fundId:'p', amount:'500' }] }, { date:'2026-11-03', splits:[{ fundId:'p', amount:'20' }] }];
  assert.equal(run([], []), 520);
});
t('carpool fares moved in from cash wallet count once (as a move), not twice', () => {
  reset(); st.cpPay = [{ date:'2026-11-03', amount:270, destChoice:'fund:cash' }];
  assert.equal(run([], [{ date:'2026-11-03', toId:'p', amount:270 }], { source:'carpool' }), 270);
});
t('amounts stored as text are handled', () => {
  reset(); assert.equal(run([{ date:'2026-11-10', amount:'20', txnType:'out' }], [{ date:'2026-11-04', toId:'p', amount:'100' }]), 80);
});
t('results are rounded to cents', () => {
  reset(); assert.equal(run([], [{ date:'2026-11-04', toId:'p', amount:0.1 }, { date:'2026-11-05', toId:'p', amount:0.2 }]), 0.3);
});
t('missing pocket gives 0, not a crash', () => {
  reset(); st.funds = []; st.moves = [{ date:'2026-11-04', toId:'zzz', amount:5 }];
  assert.equal(planRoutedInCycle({ pocketId:'zzz', source:'' }, C), 5);
});

console.log('\n' + (process.exitCode ? '❌ FAILED' : '✅ ' + passed + ' plan scenarios passed'));
