# My Dashboard V34

> **Personal finance tracker built on the principle that every transaction is auditable and every change is reversible.**

## The Problem

Personal finance apps track balances, but they don't track *integrity*. Delete a transaction, and it's gone — no proof of what happened, no audit trail. You're forced to trust the app's accuracy with no way to verify.

Real accounting software solves this with journal entries, reversals, and hard blocks. Personal finance should too.

## The Solution

My Dashboard treats money like a ledger. Every transaction is a journal entry. Every deletion triggers a reversal guard — you can't silently lose data. Every flow is reconcilable against a pocket-first model where money lives in named savings accounts, not a black-box balance.

**What this means:**
- **Audit trails** — every transaction logged, every change tracked
- **Hard-block guards** — delete a payment, the app forces you to reverse it (not just forget it happened)
- **Single source of truth** — pocket-first architecture with double-entry validation
- **Reconciliation** — compare your pockets against real bank accounts anytime

## Features

- **Pocket-first savings** — money lives in named pockets (Emergency Fund, Eid 2027, etc.), not a single balance
- **Cash Flow timeline** — income, spend, moves all logged with full edit/delete guards
- **Money Owed** — track personal loans and debts with repayment history
- **Carpool manager** — split trip costs with passengers, track who owes what
- **Reports & insights** — net worth, monthly savings growth, reconciliation dashboards
- **Routine tasks** — recurring expenses with optional cost tracking
- **School tracker** — course grades and progress monitoring
- **Odin AI assistant** — chat interface powered by Claude, reads all tabs, persistent history

## Tech Stack

- **Frontend:** Vanilla JavaScript PWA (no frameworks)
- **Hosting:** GitHub Pages
- **Backend:** Firebase (Firestore + Auth)
- **Auth:** Google Sign-In
- **AI:** Claude API (Sonnet 4.6) via Cloudflare Worker
- **Charts:** Chart.js

## Getting Started

### View Live
Visit: **[yasinbadaron90-collab.github.io/my-dashboard/](https://yasinbadaron90-collab.github.io/my-dashboard/)**

Sign in with Google. The app uses your Google Account to identify you — no passwords, no sign-up form.

### Run Locally

1. Clone the repo:
   ```bash
   git clone https://github.com/yasinbadaron90-collab/my-dashboard.git
   cd my-dashboard
   ```

2. You'll need to set up your own Firebase project (free tier works):
   - Create a project at [firebase.google.com](https://firebase.google.com)
   - Enable Firestore and Google Auth
   - Copy your config into `index.html` (look for `firebaseConfig`)

3. Serve locally (Python):
   ```bash
   python -m http.server 8000
   ```
   Then visit `http://localhost:8000`

4. To deploy to GitHub Pages:
   - Push to your own fork
   - Go to Settings → Pages → Source → "Deploy from a branch"
   - Choose `main` branch, `/root` folder
   - Your site will be live at `yourusername.github.io/my-dashboard/`

## Why This Matters

This isn't just a budget app. It's a proof of concept for **auditability in personal finance**. The CV story: *I identified a data-integrity failure in a real operational system (personal finance lacks audit trails), redesigned the data model for a single source of truth (pocket-first), and built validation, reconciliation, and reporting on top.*

Every feature serves that principle. Every bug fix reinforces it.

## Key Learnings

- **Money flows need 4+ delete guards** — cash flow tab, pocket history, person-specific managers, and legacy paths. Miss one, and data can silently vanish.
- **postToCF passthrough is critical** — any new money flow needs explicit mirror-link IDs, or the CF/pocket sync breaks.
- **Real device testing beats sandbox** — a chart rendering bug might not show on mobile but be obvious on desktop. Test everywhere.
- **PWA cache is sticky** — force-close twice or manually clear storage. Always.

## Known Limitations

- **Supabase was used and removed** — full code cleanup complete, zero traces remain
- **Maintenance Fund feature removed** — replaced with a 38-line stub to avoid breaking unguarded callers
- **Backup export key gap** — Firebase sync is complete, but the JSON export doesn't include all lend/repay/spend records yet
- **School rounding** — 1-point difference vs. transcript due to Regent's internal rounding (known and accepted)

## Contributing

This started as a personal tool and portfolio piece. If you fork it, the same principles apply: every transaction auditable, every deletion reversible, pocket-first architecture.

Questions? Open an issue or check the code — it's all vanilla JS, no magic.

---

**Built by:** Yasin Badaron  
**Status:** Live, actively maintained  
**Last updated:** July 2026
