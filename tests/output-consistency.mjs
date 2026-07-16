#!/usr/bin/env node
// Output Consistency Checker — My Dashboard V34
// Reads the LIVE carpool.js from GitHub (always current, never a stale copy) and
// checks whether the three carpool-statement surfaces (on-screen card, WhatsApp
// text, exported PDF) agree on which concepts they show. Built after the
// "TOTAL OWED" incident (v147g/h) — a label that appeared in the PDF and never
// existed in the card, caught only by a human looking at the actual PDF.
//
// This does NOT verify any dollar amounts. It verifies label/concept PARITY —
// if one surface starts showing something the other two don't, this fails loud,
// before the bug ever reaches an actual generated statement.
//
// Run: node output-consistency.mjs
// Exit code 0 = all expected-parity concepts consistent. Exit code 1 = drift found.

const REPO_RAW = 'https://raw.githubusercontent.com/yasinbadaron90-collab/my-dashboard/main/carpool.js';

function extractBetween(src, startAnchor, endAnchor, label) {
  const startIdx = src.indexOf(startAnchor);
  if (startIdx === -1) throw new Error(`Could not find start anchor for ${label}: "${startAnchor}"`);
  const endIdx = src.indexOf(endAnchor, startIdx + startAnchor.length);
  if (endIdx === -1) throw new Error(`Could not find end anchor for ${label}: "${endAnchor}"`);
  return src.slice(startIdx, endIdx + endAnchor.length);
}

// Strip whole-line "//" comments before concept-matching. Without this, a comment
// that merely *mentions* a removed label (exactly what buildPDF's own comment does
// — explaining why TOTAL OWED was deleted) reads as a false positive: the checker
// "sees" the phrase in a comment explaining its absence and flags it as present.
function stripLineComments(region) {
  return region.split('\n').filter(line => !line.trim().startsWith('//')).join('\n');
}

async function main() {
  const fileArgIdx = process.argv.indexOf('--file');
  let src;
  if (fileArgIdx !== -1) {
    const path = process.argv[fileArgIdx + 1];
    console.log(`Reading local file: ${path}`);
    src = await (await import('node:fs/promises')).readFile(path, 'utf8');
  } else {
    console.log('Fetching live carpool.js…');
    const res = await fetch(REPO_RAW);
    if (!res.ok) throw new Error(`GitHub raw fetch failed: ${res.status}`);
    src = await res.text();
  }
  console.log(`OK — ${src.length} bytes\n`);

  // Extract the three render regions by real anchors already present in the source,
  // not by fixed line numbers (line numbers drift every deploy; these anchors don't).
  const regions = {};

  regions.card = extractBetween(
    src,
    '// Breakdown footer — always shows trips section',
    "+'<div class=\"stmt-btns\">'",
    'on-screen card'
  );

  regions.wa = extractBetween(
    src,
    "const waSummary='",
    "const waText=",
    'WhatsApp text'
  );

  regions.pdf = extractBetween(
    src,
    'function buildPDF(',
    '\nfunction ',
    'PDF export (buildPDF)'
  );

  for (const k of Object.keys(regions)) regions[k] = stripLineComments(regions[k]);

  // Concepts to check. `expected` is the EXACT set of surfaces this concept should
  // appear on right now — not "all or nothing". Any deviation from that exact set
  // is drift, full stop. (First draft of this file used a looser expectAll:true/false
  // split and it let the reintroduced v147g bug print as "info" instead of failing —
  // caught by testing against a deliberately-broken copy before trusting this file.)
  const CONCEPTS = [
    {
      key: 'combined_outstanding',
      label: 'Combined Outstanding total (trips+borrow, when owing > 0)',
      expected: ['card', 'wa', 'pdf'],
      test: {
        card: /Total Outstanding/,
        wa:   /\*Outstanding:/,
        pdf:  /'TOTAL OUTSTANDING'/,
      },
    },
    {
      key: 'all_settled',
      label: 'All-settled fallback (when owing = 0)',
      expected: ['card', 'wa', 'pdf'],
      test: {
        card: /All settled/i,
        wa:   /All settled/i,
        pdf:  /ALL SETTLED/i,
      },
    },
    {
      key: 'gross_total',
      label: 'Gross combined total (trips+borrow VALUE, before payments — the exact concept that caused v147g/h)',
      expected: [], // must appear on NONE — if this shows anywhere, it's the historical bug pattern back
      test: {
        card: /Total Owed/i,
        wa:   /Total Owed/i,
        pdf:  /TOTAL OWED/i,
      },
    },
    {
      key: 'trips_outstanding_line',
      label: 'Per-category Trips Outstanding line',
      expected: ['card', 'pdf'], // WA intentionally omits this for brevity — known, accepted asymmetry
      test: {
        card: /Trips Outstanding/,
        wa:   /Trips Outstanding/,
        pdf:  /TRIPS OUTSTANDING/,
      },
    },
    {
      key: 'borrow_outstanding_line',
      label: 'Per-category Borrow Outstanding line',
      expected: ['card', 'pdf'], // same reason as above
      test: {
        card: /Borrow Outstanding/,
        wa:   /Borrow Outstanding/,
        pdf:  /BORROW OUTSTANDING/,
      },
    },
  ];

  const surfaces = ['card', 'wa', 'pdf'];
  let drift = false;

  console.log('SURFACE      CARD   WA     PDF    VERDICT');
  console.log('-----------------------------------------------------------');

  for (const c of CONCEPTS) {
    const hits = {};
    for (const s of surfaces) hits[s] = c.test[s].test(regions[s]);
    const actual = surfaces.filter(s => hits[s]);
    const matchesExpected = actual.length === c.expected.length && actual.every(s => c.expected.includes(s));

    const verdict = matchesExpected ? 'consistent' : '⚠ DRIFT';
    if (!matchesExpected) drift = true;

    console.log(
      c.key.padEnd(24),
      (hits.card ? ' ✓ ' : ' · ').padEnd(6),
      (hits.wa   ? ' ✓ ' : ' · ').padEnd(6),
      (hits.pdf  ? ' ✓ ' : ' · ').padEnd(6),
      verdict
    );
    console.log('   ' + c.label);
    if (!matchesExpected) console.log(`   expected on [${c.expected.join(', ') || 'none'}], found on [${actual.join(', ') || 'none'}]`);
  }

  console.log('-----------------------------------------------------------');
  console.log(drift
    ? '\n❌ DRIFT DETECTED — at least one concept is not showing on its expected set of surfaces.'
    : '\n✅ All concepts match their expected surface set — card, WhatsApp, and PDF agree.');

  process.exit(drift ? 1 : 0);
}

main().catch(err => {
  console.error('Checker crashed:', err.message);
  process.exit(2);
});
