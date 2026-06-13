# Odoo Full Stack GSheet Sync Rescue Plan

This project currently mixes prototype code, test scripts, live Odoo mutations, and UI workflows in one surface. The safest way to recover it is to stabilize shared foundations first, then repair each tab as a small verified workflow.

## Recovery Principles

- Do not patch every tab independently before fixing auth, config, encoding, and Odoo RPC.
- Do not write directly to low-level Odoo records when a business workflow exists.
- Keep read-only tabs read-only until their data mapping is trusted.
- Make destructive actions explicit and reversible where possible.
- Prefer Odoo standard flows over hand-built fallback records.
- Treat Google Sheets as a sync boundary with conflict rules, not as a second database.

## Severity Levels

- P0: Can corrupt data, expose admin features, or destroy accounting/stock records.
- P1: Produces wrong business results or silently hides failures.
- P2: Broken UX, inconsistent display, incomplete data, or maintainability problems.

## Foundation First

### P0 - Auth and roles

Current problem:
- Backend trusts `X-User-Role` and `role` query values.
- Frontend stores user role in `localStorage`.
- Any user can spoof admin or another department role.
- Passwords are stored as plain text in `users.json`.

Target:
- Login returns a signed session token.
- Middleware validates token and derives role from server-side user data.
- Passwords are hashed.
- Admin-only routes cannot be opened by edited browser headers.

Main files:
- `backend/middlewares/authMiddleware.js`
- `backend/routes/api.js`
- `backend/services/fileService.js`
- `frontend/js/app.js`
- `users.json`

### P0 - Config and secrets

Current problem:
- Odoo login defaults and script credentials are hard-coded.
- Some scripts still read old absolute paths like `C:/Users/Admin/.openclaw/...`.
- Google credentials can be written outside the repo from an API request.

Target:
- One config loader for app and scripts.
- No hard-coded passwords in source.
- Credentials are only loaded from configured local files or env vars.
- UI masks secrets and never sends masked password as a real password.

Main files:
- `backend/config/config.js`
- `backend/routes/api.js`
- `backend/scripts/*.js`

### P1 - Encoding

Current problem:
- Vietnamese text is mojibake in HTML, JS, API messages, and docs.
- Broken labels make UI hard to trust and can break matching/search behavior.

Target:
- All source files saved as UTF-8.
- Vietnamese text is corrected once, not repeatedly patched in random places.
- Search normalization uses valid Unicode input.

Main files:
- `frontend/index.html`
- `frontend/js/app.js`
- `backend/routes/api.js`
- `backend/services/fileService.js`
- `SKILL.md`

## Tab-by-Tab Recovery

## Dashboard

Current problem:
- Summary calls endpoints that are role-restricted in inconsistent ways.
- Admin dashboard depends on spoofable auth.
- Metrics mix live operational counts with stale or hidden data.

Target:
- Dedicated `/api/dashboard/summary` endpoint derived from validated role.
- Only request metrics relevant to the current role.
- Failed metric calls show partial status instead of making the whole dashboard misleading.

Priority: P1 after auth.

## Products Tab

Current problem:
- Product type mapping is inconsistent: UI uses `product`, `service`, `combo`; scripts say Odoo often uses `consu`.
- `is_storable` is guessed without checking target Odoo fields.
- Product create/update can write invalid fields for the current Odoo instance.
- Product list hides items with `N/A` and missing `write_date`, which can hide bad imports instead of surfacing them.

Target:
- Detect valid `product.template` fields and selection values with `fields_get`.
- Normalize UI choices to actual Odoo values.
- Validate create/update payload before calling Odoo.
- Add an import/quality status column instead of silently filtering suspicious products.

Priority: P1.

## Customers Tab

Current problem:
- Partner create/update uses only name, street, phone, customer/vendor rank.
- No duplicate detection.
- Updating a partner type can add rank but never clears an old role intentionally.

Target:
- Search existing partners before create.
- Separate customer/vendor intent clearly.
- Preserve fields not owned by this app.
- Add edit rules only after duplicate and identity behavior is clear.

Priority: P2 unless partner duplicates are already damaging workflows.

## Stock Tab

Current problem:
- Reads all `stock.quant` with no domain and low limits.
- Includes locations that may not be relevant to operational stock.
- Product/location lookups are capped independently, which can produce blank names.
- Other workflows write directly to `stock.quant`, so display can reflect corrupted adjustment logic.

Target:
- Filter internal stock by default.
- Join data robustly or request enough related records.
- Display reserved/available quantities if needed.
- Make stock tab read-only until stock mutation flows are fixed.

Priority: P1.

## Orders Tab - Purchase Order

Current problem:
- Creates and auto-confirms purchase orders immediately.
- Receipt validation sets `qty_done` from `product_uom_qty` for all move lines, then validates with skip contexts.
- No partial receipt, backorder, lot/serial, unit of measure, or vendor price handling.

Target:
- Create PO in draft first.
- Confirm only via explicit action.
- Receive quantities from user input.
- Respect Odoo immediate transfer and backorder wizard behavior.
- Do not auto-force full receipt unless the UI explicitly says full receipt.

Priority: P1.

## Production Tab

Current problem:
- Increases finished goods by directly writing or creating `stock.quant`.
- Deducts raw materials by directly writing `stock.quant`.
- Shortage still returns success and production log says completed.
- Local BOM fallback can silently produce wrong material consumption.

Target:
- If MRP is installed, use `mrp.production` and standard produce/consume workflow.
- If MRP is not installed, use explicit stock moves or inventory adjustments with an audit trail.
- Block production when required materials are short unless user has an approved override flow.
- Treat BOM source as mandatory and visible.

Priority: P0.

## Sales Tab

Current problem:
- Creates SO, confirms it, creates invoice, and posts invoice in one request.
- Fallback creates `account.move` manually, bypassing sales/invoice policies.
- Uses list price from cached product data with no price list, tax, unit, or stock availability checks.
- Sales role can indirectly create posted accounting records.

Target:
- Step 1: create quotation.
- Step 2: confirm quotation explicitly.
- Step 3: invoice through Odoo standard wizard only.
- Step 4: posting invoice belongs to accounting role, not sales.
- Remove manual invoice fallback unless explicitly approved for a controlled edge case.

Priority: P0.

## Invoices Tab

Current problem:
- Can post invoices.
- Can register payments.
- Can delete invoices by unlink/reset-to-draft/cancel fallback.
- Payment wizard does not expose journal/payment method choices.
- GTGT number is stored in generic fields without a clear accounting policy.

Target:
- Disable delete for posted invoices.
- Use cancel/reversal flows according to accounting rules.
- Register payments with explicit journal and date.
- Separate "internal note/payment reference" from legal invoice number fields.

Priority: P0.

## Terminal Tab

Current problem:
- Runs scripts via SSE based on a query param and spoofable role.
- Valid script list helps, but scripts contain old hard-coded paths and credentials.
- Long-running scripts mutate live Odoo data without dry-run mode.

Target:
- Admin token required.
- Every script supports dry-run.
- Every script uses shared config.
- Dangerous scripts are hidden or require confirmation with a clear impact summary.

Priority: P0.

## Settings Tab

Current problem:
- Protected only by spoofable admin role.
- Saves raw config from request body.
- Password masking can be confused with real values.
- Google credentials JSON is stored as raw text.

Target:
- Token-auth admin only.
- Validate Odoo URL, DB, login, sheet ID, and credentials JSON.
- Store secrets in a safer local secret file or env var reference.
- Test connection before save or provide "save without test" explicitly.

Priority: P0.

## Google Sheets Sync

Current problem:
- Script says two-way sync but pushes Odoo to Sheet before pulling Sheet changes.
- This can erase Sheet edits before they are applied.
- Conflict rule says "Odoo wins", but code updates Odoo if Sheet `write_date` is newer.
- Products are writable, but stock/invoices are read-only snapshots.
- Sheet `write_date` is copied from Odoo, so it is not a reliable Sheet edit timestamp.

Target:
- Decide one mode:
  - Odoo master, Sheet read-only export.
  - Sheet import queue, Odoo master after import.
  - True two-way sync with app-owned revision metadata.
- Never clear and rewrite a tab before reading pending edits.
- Add `sync_status`, `sync_error`, and `last_synced_at` columns.

Priority: P1 after P0 data corruption risks.

## Recommended Implementation Order

1. Add real session token auth and server-side role validation.
2. Lock dangerous routes behind real admin/accounting/warehouse roles.
3. Disable or guard destructive accounting/stock operations.
4. Fix UTF-8 text once across source files.
5. Rewrite production flow to stop direct `stock.quant` mutation.
6. Split sales flow into quote, confirm, invoice, and accounting post.
7. Rewrite invoice delete/payment behavior.
8. Normalize product type mapping with `fields_get`.
9. Refactor scripts to shared config and dry-run mode.
10. Redesign GSheet sync as either read-only export or explicit import queue.

## First Slice To Implement

Best first slice:
- Replace header-based role checks with signed token auth.
- Update frontend fetch wrapper to send `Authorization: Bearer <token>`.
- Migrate existing plaintext users to hashed passwords on first save or via a small migration.
- Keep route behavior otherwise unchanged.

Why first:
- It reduces the blast radius of every other broken tab.
- It lets later fixes be tested by real role.
- It prevents Terminal, Settings, Invoice, and Production routes from being triggered by spoofed headers.

## Definition Of Done For Each Fixed Tab

- The tab has one clear business workflow.
- Backend validates role from token, not from client-provided role.
- Backend validates all request payload fields.
- Odoo mutation uses standard workflow APIs where available.
- Failure states are visible to the user.
- No direct destructive fallback is hidden in catch blocks.
- A manual smoke test exists in the notes or a script.
