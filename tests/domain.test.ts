import assert from "node:assert/strict";
import test from "node:test";
import {
  addDays,
  addMonths,
  emptyWorkspace,
  expenseStatus,
  makeDemoWorkspace,
  monthlyBudget,
  monthlyEquivalentMinor,
  monthRange,
  nextOccurrence,
  occurrences,
  paymentTwdMinor,
  projectedTotal,
  todayInTaipei,
  toTwdMinor,
  validateWorkspace,
  type Expense,
  type Payment,
  type Workspace,
} from "../lib/domain.ts";

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "expense-1", name: "測試訂閱", category: "software", scope: "personal",
    amountMinor: 100_000, currency: "TWD", amountMode: "fixed",
    intervalMonths: 1, firstDueOn: "2026-01-31", monthEnd: false,
    paymentMethodId: "method-1", automatic: true, reminderDays: 3,
    notes: "", website: "", pauses: [], cancelledFrom: null,
    ...overrides,
  };
}

function workspace(expenses: Expense[] = [expense()]): Workspace {
  return {
    schemaVersion: 1,
    expenses,
    methods: [{
      id: "method-1", name: "日常信用卡", kind: "card", last4: "1234",
      color: "#8B5CF6", archived: false,
    }],
    payments: [],
    settings: {
      budgetMinor: null,
      rates: { TWD: 1, USD: 32, JPY: 0.22, EUR: 35 },
      rateDate: "2026-11-03",
    },
  };
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "payment-1", expenseId: "expense-1", expenseName: "付款時的名稱",
    category: "software", scope: "personal", scheduledOn: "2026-11-30",
    paidOn: "2026-11-30", amountMinor: 100_000, currency: "TWD",
    paymentMethodId: "method-1", paymentMethodName: "付款時的卡片名稱",
    fxRate: 1,
    ...overrides,
  };
}

test("monthly anchors recover the original day after February", () => {
  assert.deepEqual(occurrences(expense(), "2026-01-01", "2026-05-01"), [
    "2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30",
  ]);
  assert.equal(addMonths("2026-01-31", 2), "2026-03-31");
});

test("month-end recurrence differs from an ordinary thirtieth-day anchor", () => {
  const normal = expense({ firstDueOn: "2026-04-30" });
  assert.deepEqual(occurrences(normal, "2026-04-01", "2026-07-01"), [
    "2026-04-30", "2026-05-30", "2026-06-30",
  ]);
  assert.deepEqual(occurrences({ ...normal, monthEnd: true }, "2026-04-01", "2026-07-01"), [
    "2026-04-30", "2026-05-31", "2026-06-30",
  ]);
});

test("month-end preserves an explicitly entered first payment date", () => {
  assert.deepEqual(occurrences(expense({ firstDueOn: "2026-04-15", monthEnd: true }), "2026-04-01", "2026-07-01"), [
    "2026-04-15", "2026-05-31", "2026-06-30",
  ]);
});

test("annual February 29 returns on the next leap year", () => {
  const annual = expense({ firstDueOn: "2024-02-29", intervalMonths: 12 });
  assert.deepEqual(occurrences(annual, "2024-01-01", "2029-01-01"), [
    "2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29",
  ]);
});

test("two-month intervals cross a year without drifting their anchor", () => {
  const alternate = expense({ firstDueOn: "2025-12-31", intervalMonths: 2 });
  assert.deepEqual(occurrences(alternate, "2025-12-01", "2026-07-01"), [
    "2025-12-31", "2026-02-28", "2026-04-30", "2026-06-30",
  ]);
});

test("calendar ranges use an exclusive end and handle leap days", () => {
  assert.deepEqual(monthRange("2024-02"), { start: "2024-02-01", end: "2024-03-01" });
  assert.deepEqual(monthRange("2026-12"), { start: "2026-12-01", end: "2027-01-01" });
  assert.equal(addDays("2024-02-28", 1), "2024-02-29");
  assert.equal(addDays("2024-03-01", -1), "2024-02-29");
  assert.deepEqual(occurrences(expense(), "2026-02-28", "2026-03-31"), ["2026-02-28"]);
});

test("Taipei today advances at 16:00 UTC independently of the host timezone", (context) => {
  context.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-03T15:59:00.000Z") });
  assert.equal(todayInTaipei(), "2026-11-03");
  context.mock.timers.setTime(new Date("2026-11-03T16:01:00.000Z").getTime());
  assert.equal(todayInTaipei(), "2026-11-04");
});

test("cancellation suppresses future dates but preserves the earlier schedule", () => {
  const cancelled = expense({ cancelledFrom: "2026-03-31" });
  assert.deepEqual(occurrences(cancelled, "2026-01-01", "2026-06-01"), ["2026-01-31", "2026-02-28"]);
  assert.equal(expenseStatus(cancelled, "2026-03-30"), "active");
  assert.equal(expenseStatus(cancelled, "2026-03-31"), "cancelled");
  assert.equal(nextOccurrence(cancelled, "2026-03-01"), null);
});

test("a closed pause skips its inclusive start and resumes at its exclusive end", () => {
  const paused = expense({ pauses: [{ from: "2026-02-28", untilExclusive: "2026-04-30" }] });
  assert.deepEqual(occurrences(paused, "2026-01-01", "2026-06-01"), [
    "2026-01-31", "2026-04-30", "2026-05-31",
  ]);
  assert.equal(expenseStatus(paused, "2026-02-28"), "paused");
  assert.equal(expenseStatus(paused, "2026-04-30"), "active");
  assert.equal(nextOccurrence(paused, "2026-02-01"), "2026-04-30");
});

test("an indefinite pause has no next payment and does not rewrite earlier history", () => {
  const paused = expense({ pauses: [{ from: "2026-03-01" }] });
  assert.equal(nextOccurrence(paused, "2026-02-01"), "2026-02-28");
  assert.equal(nextOccurrence(paused, "2026-03-01"), null);
  assert.deepEqual(occurrences(paused, "2026-01-01", "2027-01-01"), ["2026-01-31", "2026-02-28"]);
});

test("monthly equivalent includes a planned future start but excludes inactive commitments", () => {
  const annual = expense({ amountMinor: 1_200_000, intervalMonths: 12, firstDueOn: "2027-05-01" });
  assert.equal(monthlyEquivalentMinor(annual, "2026-11-03"), 100_000);
  assert.equal(monthlyEquivalentMinor({ ...annual, cancelledFrom: "2026-11-01" }, "2026-11-03"), 0);
  assert.equal(monthlyEquivalentMinor({ ...annual, pauses: [{ from: "2026-11-01" }] }, "2026-11-03"), 0);
});

test("monthly budget rounds after combining fractional monthly equivalents", () => {
  const data = workspace([1, 2, 3].map((n) => expense({ id: `expense-${n}`, amountMinor: 500, intervalMonths: 12 })));
  assert.deepEqual(monthlyBudget(data, "all", "2026-11-03"), { twdMinor: 125, missing: 0, estimated: false });
});

test("an unknown variable amount is incomplete while a true zero remains known", () => {
  const unknown = expense({ amountMode: "variable", amountMinor: null, firstDueOn: "2026-11-10" });
  assert.equal(monthlyEquivalentMinor(unknown, "2026-11-03"), null);
  assert.deepEqual(projectedTotal(workspace([unknown]), "2026-11-01", "2026-12-01", "all"), {
    twdMinor: 0, missing: 1, estimated: true,
  });
  assert.deepEqual(monthlyBudget(workspace([expense({ amountMinor: 0 })]), "all", "2026-11-03"), {
    twdMinor: 0, missing: 0, estimated: false,
  });
});

test("JPY uses whole-yen units and an absent FX quote never becomes zero", () => {
  const rates = { TWD: 1, USD: 32, JPY: 0.22, EUR: null };
  assert.equal(toTwdMinor(1_000, "JPY", rates), 22_000);
  assert.equal(toTwdMinor(2_000, "USD", rates), 64_000);
  assert.equal(toTwdMinor(1_000, "TWD", rates), 1_000);
  assert.equal(toTwdMinor(1_000, "EUR", rates), null);
  assert.equal(toTwdMinor(null, "TWD", rates), null);
});

test("missing foreign FX makes totals incomplete and converted amounts remain estimates", () => {
  const foreign = expense({ currency: "EUR", firstDueOn: "2026-11-10" });
  const data = workspace([foreign]);
  data.settings.rates.EUR = null;
  assert.deepEqual(monthlyBudget(data, "all", "2026-11-03"), { twdMinor: 0, missing: 1, estimated: true });
  data.settings.rates.EUR = 35;
  assert.deepEqual(projectedTotal(data, "2026-11-01", "2026-12-01", "all"), {
    twdMinor: 3_500_000, missing: 0, estimated: true,
  });
});

test("an early payment is counted only in its actual payment month", () => {
  const data = workspace([expense({ firstDueOn: "2026-11-30" })]);
  data.payments = [payment({ paidOn: "2026-10-30", amountMinor: 90_000 })];
  assert.deepEqual(projectedTotal(data, "2026-10-01", "2026-11-01", "all"), {
    twdMinor: 90_000, missing: 0, estimated: false,
  });
  assert.deepEqual(projectedTotal(data, "2026-11-01", "2026-12-01", "all"), {
    twdMinor: 0, missing: 0, estimated: false,
  });
});

test("actual amounts replace estimates and payment scope is its historical snapshot", () => {
  const data = workspace([expense({ scope: "business", amountMode: "variable", firstDueOn: "2026-11-30" })]);
  data.payments = [payment({ amountMinor: 84_000, scope: "personal" })];
  assert.deepEqual(projectedTotal(data, "2026-11-01", "2026-12-01", "personal"), {
    twdMinor: 84_000, missing: 0, estimated: false,
  });
  assert.deepEqual(projectedTotal(data, "2026-11-01", "2026-12-01", "business"), {
    twdMinor: 0, missing: 0, estimated: false,
  });
});

test("payment FX history is unaffected by current manual rates", () => {
  const data = workspace([expense({ currency: "USD", amountMinor: 2_000, firstDueOn: "2026-11-30" })]);
  data.payments = [payment({ currency: "USD", amountMinor: 2_000, fxRate: 31 })];
  data.settings.rates.USD = 99;
  assert.equal(paymentTwdMinor(data.payments[0]), 62_000);
  assert.deepEqual(projectedTotal(data, "2026-11-01", "2026-12-01", "all"), {
    twdMinor: 62_000, missing: 0, estimated: true,
  });
  data.payments[0].settledTwdMinor = 62_500;
  assert.equal(paymentTwdMinor(data.payments[0]), 62_500);
  assert.equal(projectedTotal(data, "2026-11-01", "2026-12-01", "all").estimated, false);
});

test("actual zero settlement is retained and a missing payment FX snapshot stays unknown", () => {
  assert.equal(paymentTwdMinor(payment({ currency: "USD", fxRate: null })), null);
  assert.equal(paymentTwdMinor(payment({ currency: "USD", fxRate: null, settledTwdMinor: 0 })), 0);
  assert.equal(paymentTwdMinor(payment({ currency: "JPY", amountMinor: 1_000, fxRate: 0.22 })), 22_000);
});

test("a paid occurrence remains in history after its expense is cancelled", () => {
  const data = workspace([expense({ cancelledFrom: "2026-01-01" })]);
  data.payments = [payment()];
  assert.deepEqual(projectedTotal(data, "2026-11-01", "2026-12-01", "all"), {
    twdMinor: 100_000, missing: 0, estimated: false,
  });
});

test("empty workspaces contain no assumed foreign exchange rates", () => {
  const data = emptyWorkspace("2026-11-03");
  assert.deepEqual(data.settings.rates, { TWD: 1, USD: null, JPY: null, EUR: null });
  assert.deepEqual(validateWorkspace(data), data);
});

test("demo fixtures remain valid and represent the requested recurring expense examples", () => {
  const data = makeDemoWorkspace("2026-11-03");
  assert.deepEqual(validateWorkspace(data), data);
  assert.ok(data.expenses.length >= 8 && data.expenses.length <= 12);
  assert.equal(data.methods.length, 3);
  for (const name of ["Netflix", "ChatGPT", "Xbox", "AWS"]) {
    assert.ok(data.expenses.some((item) => item.name.includes(name)), `${name} should be represented`);
  }
  for (const category of ["utilities", "tax", "insurance", "housing"]) {
    assert.ok(data.expenses.some((item) => item.category === category));
  }
});

test("validation preserves historical names and accepts archived referenced payment methods", () => {
  const data = workspace();
  data.methods[0].archived = true;
  data.payments = [payment()];
  const result = validateWorkspace(data);
  assert.equal(result.payments[0].expenseName, "付款時的名稱");
  assert.equal(result.payments[0].paymentMethodName, "付款時的卡片名稱");
  assert.notEqual(result, data);
});

test("validation rejects dangling expense and payment-method references", () => {
  const badExpenseMethod = workspace([expense({ paymentMethodId: "missing" })]);
  assert.throws(() => validateWorkspace(badExpenseMethod));
  const badPaymentExpense = workspace();
  badPaymentExpense.payments = [payment({ expenseId: "missing" })];
  assert.throws(() => validateWorkspace(badPaymentExpense));
  const badPaymentMethod = workspace();
  badPaymentMethod.payments = [payment({ paymentMethodId: "missing" })];
  assert.throws(() => validateWorkspace(badPaymentMethod));
});

test("validation rejects duplicate IDs within each collection and duplicate paid occurrences", () => {
  const duplicateExpense = workspace([expense(), expense()]);
  assert.throws(() => validateWorkspace(duplicateExpense));
  const duplicateMethod = workspace();
  duplicateMethod.methods.push({ ...duplicateMethod.methods[0] });
  assert.throws(() => validateWorkspace(duplicateMethod));
  const duplicatePaymentId = workspace();
  duplicatePaymentId.payments = [payment(), payment({ scheduledOn: "2026-12-31" })];
  assert.throws(() => validateWorkspace(duplicatePaymentId));
  const duplicateOccurrence = workspace();
  duplicateOccurrence.payments = [payment(), payment({ id: "payment-2" })];
  assert.throws(() => validateWorkspace(duplicateOccurrence));
});

test("validation rejects invalid dates, unsupported money, invalid FX and unbounded fields", () => {
  const invalidExpenses: Array<Partial<Expense>> = [
    { firstDueOn: "2026-02-29" }, { firstDueOn: "1999-12-31" },
    { firstDueOn: "2101-01-01" }, { amountMinor: -1 },
    { amountMinor: 0.5 }, { amountMinor: 1_000_000_000_001 },
    { amountMinor: null, amountMode: "fixed" },
    { name: " " }, { name: "a".repeat(121) },
    { website: "javascript:alert(1)" },
    { pauses: [{ from: "2026-05-01", untilExclusive: "2026-04-01" }] },
  ];
  for (const invalid of invalidExpenses) assert.throws(() => validateWorkspace(workspace([expense(invalid)])));
  assert.throws(() => validateWorkspace(workspace([expense({ currency: "GBP" as Expense["currency"] })])));
  for (const fx of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const data = workspace();
    data.settings.rates.USD = fx;
    assert.throws(() => validateWorkspace(data));
  }
  const invalidBaseRate = workspace();
  invalidBaseRate.settings.rates.TWD = 2;
  assert.throws(() => validateWorkspace(invalidBaseRate));
});

test("validation enforces collection limits before processing oversized imports", () => {
  const data = workspace();
  assert.throws(() => validateWorkspace({ ...data, expenses: Array.from({ length: 501 }, (_, n) => expense({ id: `e-${n}` })) }));
  assert.throws(() => validateWorkspace({ ...data, methods: Array.from({ length: 51 }, (_, n) => ({ ...data.methods[0], id: `m-${n}` })) }));
  assert.throws(() => validateWorkspace({ ...data, payments: Array.from({ length: 3_001 }, (_, n) => payment({ id: `p-${n}` })) }));
});
