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

## Files
| File | Owns |
|---|---|
| core.js | lsGet/lsSet, keys, login/PIN, launch menu, drawer, theme, tab switching |
| firebase-sync.js | Google sign-in, Firestore mirror, device lock, `FB_SYNC_KEYS` / `FB_EXCLUDED_KEYS` |
| savings.js | Pockets/funds, `fundTotal`, deposits, use funds, `postToCF` / `removeFromCF` |
| moneyin.js | Money In (income into pockets) |
| spend.js | Spend (deduct from one pocket, posts to Cash Flow) |
| move.js | Move between two pockets |
| cashflow.js | `localDateStr`, Cash Flow tab, month report, reconcile, CF PDF |
| settings.js | Reconcile balances (`yb_recon_balances_v1`), backup/restore (`buildBackupPayload`), passenger mgmt UI |
| money.js | Money Owed: external borrows, `calcPersonTotals`, PDF |
| borrow.js | Borrow logging, lending guardrail, archive |
| carpool.js | Carpool grid, tariffs, passenger cards, statements/PDF, savings + CF charts |
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
| home.js | Home screen, folders, plan |
| routine.js | Recurring tasks + priorities |
| school.js | School events/tasks |
| prayer.js | Prayer tracker, times, heatmap |
| info.js | ⓘ explainer popups |
| sw.js | Service worker, `CACHE_VERSION`, `SHELL_ASSETS` |

## Tests
- `tests/money-math.mjs` — fundTotal, calcPersonTotals, carpool credits, localDateStr, no-UTC-date scan.
- `tests/output-consistency.mjs` — carpool card vs PDF numbers.

Keep this file current: update the table when a file is added, removed or changes job.
