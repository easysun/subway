# Subway — recurring expense management

## Intent
Build a personal side project for subscriptions, recurring taxes and utilities, company services, rent, insurance, and other repeat payments. The requested hostname is `sub.ages.tw`; public source belongs to `easysun/subway`.

## Product decisions for the first version
- Traditional Chinese interface; Taiwan calendar dates; TWD reporting with original USD, JPY, and EUR amounts retained.
- Show scheduled spending separately from monthly equivalent commitments. Yearly bills appear in full in their due month and are divided by twelve for monthly budgeting.
- Support 1, 2, 3, 6, and 12 month recurrence, anchored dates, explicit month-end behavior, pauses and cancellations.
- Fixed amounts and variable estimates are distinct. Unknown amounts and missing exchange rates make totals visibly incomplete.
- Payment sources contain a label, kind, and optional last four digits. No full card number, bank credentials, or automatic payment execution.
- Actual payments are manually recorded with their real amount and date. Foreign exchange snapshots preserve historical estimates.
- Personal and business views are filters in one user's workspace. This is not a shared organization account model.
- Demo data is visibly identified and separate from saved account data.

## Approach
A React/TypeScript application with a Cloudflare Worker and D1 database keeps the runtime small and the domain calculations portable. Sites supplies an authenticated private review deployment and provisions D1; each database row is scoped to its authenticated owner. Public GitHub source is separate from access to financial records. The review deployment uses ChatGPT sign-in; a generally available external identity provider and independent hosting need a later deployment choice.

Alternatives considered: a browser-only tracker would not provide durable cross-device records; a separate server and PostgreSQL would add operations before the product is validated. The selected approach is an implementation default, not a user-mandated stack.

## Screens
1. Overview: current-month forecast, monthly budget, upcoming payments, six-month chart, category breakdown.
2. Items: search, category/status/scope filters, create/edit, pause/resume, cancel.
3. Calendar: navigate months, inspect and record due payments, download calendar.
4. Payment methods: create/edit/archive methods and see assigned commitments.
5. Settings: monthly budget, explicit manual FX estimates, JSON export/import.

## Integrity and verification
Persist user records in D1, never browser-only storage. Require identity on every API request; enforce same-origin JSON writes. Use revision checks so stale tabs cannot silently overwrite newer data. Test calendar anchors, currency math, actual/forecast deduplication, validation, owner isolation, and concurrent writes. Review desktop and mobile layouts in a browser.

## Limits
No email/bank synchronization, payment execution, automatic tax advice, tax deadline assumptions, exchange-rate feed, or background notification delivery. In-app reminders and downloadable calendar events cover the initial reminder flow. Public repository visibility does not make the hosted app public.
