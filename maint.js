// ══ MAINTENANCE FUND — REMOVED ═══════════════════════════════════════════
// The dedicated Maintenance Fund feature (card, settings, history, delete)
// has been permanently removed — no UI, no toggle, no way to bring it back.
// This file only exists because a few other files (cashflow.js's delete
// cascade, odin.js's alert tiles, savings.js's spend router, settings.js's
// totals) call these function names without checking they exist first.
// These are safe no-ops so nothing throws. They never store, show, or
// contribute data anywhere.
function getMaintData(){ return []; }
function saveMaintData(){ /* no-op */ }
function getMaintFundName(){ return 'Legacy Fund'; }
function getMaintTarget(){ return 0; }
function setMaintSettings(){ /* no-op */ }
function renderMaintCard(){ /* no-op */ }
function deleteMaintEntry(){ /* no-op */ }

// Custom maintenance cards (the old "Car Fund"-style renamed cards) —
// same story: fully removed, these are just safe no-ops so the few
// remaining unguarded callers (cashflow.js delete cascade, savings.js
// spend router) don't throw.
function loadCustomMaintCards(){ return []; }
function saveCustomMaintCards(){ /* no-op */ }
function renderCustomMaintCards(){ /* no-op */ }
function deleteCustomMaintCard(){ /* no-op */ }
function openCustomMaintContrib(){ /* no-op */ }

window.getMaintData = getMaintData;
window.saveMaintData = saveMaintData;
window.getMaintFundName = getMaintFundName;
window.getMaintTarget = getMaintTarget;
window.setMaintSettings = setMaintSettings;
window.renderMaintCard = renderMaintCard;
window.deleteMaintEntry = deleteMaintEntry;
window.loadCustomMaintCards = loadCustomMaintCards;
window.saveCustomMaintCards = saveCustomMaintCards;
window.renderCustomMaintCards = renderCustomMaintCards;
window.deleteCustomMaintCard = deleteCustomMaintCard;
window.openCustomMaintContrib = openCustomMaintContrib;
