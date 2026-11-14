# YB Dashboard — Architecture Map

Read this first. Then open only the file(s) the task needs. Rules and money conventions live in the `yb-dashboard-rules` skill.

## Shape
- Vanilla JS PWA, no build step. GitHub Pages from `main` root.
- 27 plain `<script>` files share globals; load order is set in `index.html` (core.js first, firebase-sync.js last).
- `localStorage` is the source of truth via `lsGet` / `lsSet` (core.js). firebase-sync.js patches `lsSet` to mirror each key to Firestore `users/{uid}/data/{key}`.
- `sw.js` precaches every JS file in `SHELL_ASSETS`. New JS file → add to `index.html` AND `SHELL_ASSETS`. Any precached file changed → bump `CACHE_VERSION`.

## Data flow
User action → module `saveX()` → `lsSet(key)` → Firestore mirror (background) → module `renderX()` re-draws its tab.
Money moves between pockets; banks are a doorway only (never hold a balance).
For new features: money must enter, leave or move through a pocket (Money In / Spend / Move / Use funds). Never store or add to a bank balance directly; `yb_recon_balances_v1` changes only via `_adjustBaselineForBank`.

## Files
| File | Owns |
|---|---|
| core.js | lsGet/lsSet, keys, Google login entry (`loginSuccess`/`enterApp`), launch menu, drawer, theme, tab switching |
| firebase-sync.js | Google sign-in, Firestore mirror, device lock, `FB_SYNC_KEYS` / `FB_EXCLUDED_KEYS` |
| savings.js | Pockets/funds, `fundTotal`, deposits, use funds, `postToCF` / `removeFromCF` |
| moneyin.js | Money In (income into pockets) |
| spend.js | Spend (deduct from one pocket, posts to Cash Flow) |
| move.js | Move between two pockets |
| cashflow.js | `localDateStr`, Cash Flow tab, month report, reconcile, CF PDF |
| settings.js | Reconcile balances (`yb_recon_balances_v1`), backup/restore (`buildBackupPayload`), passenger mgmt UI |
| money.js | Money Owed: external borrows, `calcPersonTotals`, PDF |
| borrow.js | Borrow logging, lending guardrail, archive |
| carpool.js | Carpool grid, tariffs, passenger cards, statements/PDF, savings + CF charts. Credits for prepaid days that later changed: `yb_cp_credits_v1` via `cpCreditsLoad/Save/Add/Consume` |
| passengers.js | `PASSENGERS` / `PASSENGER_DATA` globals, passenger CRUD |
| instalments.js | Instalment plans, payments, snowball, PDF |
| cars.js | Car service tracker, licence tracker, drivers |
| advisories.js | Workshop advisories on cars (`car.advisories[]`) |
| odin-scanner.js | Invoice photo/PDF scanner (Claude vision) |
| bankfeed.js | Bank statement scanner → Spend entries |
| odin.js | Odin command centre tab, launch alerts |
| odin_chat.js | Odin chat (Claude API) |
| forecast.js | Reports → Forecast (read-only, own key `yb_forecast_v1`) |
| audit.js | Self-audit data-integrity checker (read-only) |
| home.js | Home screen, folders, Plan. Pay-cycle helpers (25th→24th, salary-date aware): `planCycleFor`, `planInCycle`, `planCycleLabel` |
| routine.js | Recurring tasks + priorities |
| school.js | School events/tasks |
| prayer.js | Prayer tracker, times, heatmap |
| info.js | ⓘ explainer popups |
| sw.js | Service worker, `CACHE_VERSION`, `SHELL_ASSETS` |

## Do not
- Write a second "how much does X owe" calculation. Owing = `calcPersonTotals`; carpool statement/PDF = the card's numbers.
- Compute your own pay cycle. Use `planCycleFor`.
- Use `toISOString()` for dates. Use `localDateStr`.
- Change a pocket balance without going through `fundTotal`'s records (deposits / spends / moves).
- Add a storage key without adding it to `FB_SYNC_KEYS` (or `FB_EXCLUDED_KEYS`) and the backup/restore in settings.js.

## Tests
- `tests/money-math.mjs` — fundTotal, calcPersonTotals, carpool credits, localDateStr, no-UTC-date scan.
- `tests/output-consistency.mjs` — carpool card vs PDF numbers.

Keep this file current: update the table when a file is added, removed or changes job.
