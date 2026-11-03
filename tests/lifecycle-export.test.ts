import test from "node:test";
import assert from "node:assert/strict";
import { addDays, expenseStatus, makeDemoWorkspace, occurrences, validateWorkspace, type Payment } from "../lib/domain.ts";
import { toggleExpenseLifecycle } from "../lib/lifecycle.ts";
import { exportCalendar, parseBackup, serializeBackup } from "../lib/export.ts";

test("reactivating a paused then cancelled expense clears both inactive states", () => {
  const expense = { ...makeDemoWorkspace("2026-11-03").expenses[0], pauses: [{ from: "2026-11-03" }], cancelledFrom: "2026-11-03" };
  const resumed = toggleExpenseLifecycle(expense, "2026-11-03");
  assert.equal(expenseStatus(resumed, "2026-11-03"), "active");
  assert.equal(resumed.pauses.length, 0);
  assert.equal(resumed.cancelledFrom, null);
});
test("resuming a cancelled expense preserves the historical paused/cancelled interval", () => {
  const expense = { ...makeDemoWorkspace("2026-11-03").expenses[0], firstDueOn: "2026-10-02", pauses: [{ from: "2026-10-01" }], cancelledFrom: "2026-11-01" };
  const resumed = toggleExpenseLifecycle(expense, "2026-11-03");
  assert.equal(expenseStatus(resumed, "2026-11-03"), "active");
  assert.deepEqual(occurrences(resumed, "2026-10-01", "2026-12-03"), ["2026-12-02"]);
});
test("resuming a bounded current pause closes it without deleting future pauses", () => {
  const expense = { ...makeDemoWorkspace("2026-11-03").expenses[0], pauses: [{ from: "2026-11-01", untilExclusive: "2026-11-20" }, { from: "2026-12-01", untilExclusive: "2027-01-01" }] };
  const resumed = toggleExpenseLifecycle(expense, "2026-11-03");
  assert.equal(expenseStatus(resumed, "2026-11-03"), "active");
  assert.deepEqual(resumed.pauses, [{ from: "2026-11-01", untilExclusive: "2026-11-03" }, { from: "2026-12-01", untilExclusive: "2027-01-01" }]);
});
test("same-day reminders create an alarm and calendar text cannot inject events", () => {
  const workspace = makeDemoWorkspace("2026-11-03");
  workspace.expenses = [{ ...workspace.expenses[0], name: "Test\nBEGIN:VEVENT", firstDueOn: "2026-11-05", reminderDays: 0 }];
  workspace.payments = [];
  const ics = exportCalendar(workspace, "2026-11-03");
  assert.equal(ics.match(/^BEGIN:VEVENT$/gm)?.length, 12);
  assert.equal(ics.match(/^BEGIN:VALARM$/gm)?.length, 12);
  assert.match(ics, /TRIGGER:PT0S/);
  assert.match(ics, /Test\\nBEGIN:VEVENT/);
});
test("a large valid saved workspace can round-trip its formatted backup", () => {
  const workspace = makeDemoWorkspace("2026-11-03");
  const e = workspace.expenses[0];
  workspace.payments = Array.from({ length: 2600 }, (_, index): Payment => ({ id: `history-${index}`, expenseId: e.id, expenseName: "Historical subscription", category: e.category, scope: e.scope, scheduledOn: addDays("2018-01-01", index), paidOn: addDays("2018-01-01", index), amountMinor: 2000, currency: "TWD", paymentMethodId: null, paymentMethodName: "", fxRate: 1 }));
  const valid = validateWorkspace(workspace);
  assert.ok(new TextEncoder().encode(JSON.stringify({ workspace: valid, revision: 1000000000 })).byteLength < 1_048_576);
  const backup = serializeBackup(valid);
  assert.ok(new TextEncoder().encode(backup).byteLength > 1_048_576);
  assert.deepEqual(parseBackup(backup), valid);
});
