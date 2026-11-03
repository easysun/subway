export type Currency = "TWD" | "USD" | "JPY" | "EUR";
export type Category = "entertainment" | "software" | "utilities" | "tax" | "cloud" | "housing" | "insurance" | "other";
export type Scope = "personal" | "business";

export interface PaymentMethod {
  id: string;
  name: string;
  kind: "card" | "bank" | "wallet" | "other";
  last4: string;
  color: string;
  archived: boolean;
}

export interface Expense {
  id: string;
  name: string;
  category: Category;
  scope: Scope;
  amountMinor: number | null;
  currency: Currency;
  amountMode: "fixed" | "variable";
  intervalMonths: 1 | 2 | 3 | 6 | 12;
  firstDueOn: string;
  monthEnd: boolean;
  paymentMethodId: string | null;
  automatic: boolean;
  reminderDays: number;
  notes: string;
  website: string;
  pauses: Array<{ from: string; untilExclusive?: string }>;
  cancelledFrom: string | null;
}

export interface Payment {
  id: string;
  expenseId: string;
  expenseName: string;
  category: Category;
  scope: Scope;
  scheduledOn: string;
  paidOn: string;
  amountMinor: number;
  currency: Currency;
  paymentMethodId: string | null;
  paymentMethodName: string;
  fxRate: number | null;
  settledTwdMinor?: number | null;
}

export interface Workspace {
  schemaVersion: 1;
  expenses: Expense[];
  methods: PaymentMethod[];
  payments: Payment[];
  settings: {
    budgetMinor: number | null;
    rates: Record<Currency, number | null>;
    rateDate: string;
  };
}

export interface Occurrence {
  expense: Expense;
  scheduledOn: string;
  payment?: Payment;
}

export interface Total {
  twdMinor: number;
  missing: number;
  estimated: boolean;
}

export const CATEGORIES: Array<{ id: Category; label: string; color: string }> = [
  { id: "entertainment", label: "娛樂影音", color: "#E879A2" },
  { id: "software", label: "軟體工具", color: "#8B7BE8" },
  { id: "utilities", label: "水電通訊", color: "#E4AD58" },
  { id: "tax", label: "稅務", color: "#D48664" },
  { id: "cloud", label: "雲端服務", color: "#60A5E8" },
  { id: "housing", label: "居住物業", color: "#67B99E" },
  { id: "insurance", label: "保險", color: "#A89CCC" },
  { id: "other", label: "其他", color: "#92A0AF" },
];

export const CURRENCIES: Currency[] = ["TWD", "USD", "JPY", "EUR"];
export const INTERVALS: Array<{ value: Expense["intervalMonths"]; label: string }> = [
  { value: 1, label: "每月" }, { value: 2, label: "每 2 個月" },
  { value: 3, label: "每季" }, { value: 6, label: "每半年" },
  { value: 12, label: "每年" },
];

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function dateParts(date: string): [number, number, number] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("日期必須使用 YYYY-MM-DD 格式");
  const [year, month, day] = date.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error("日期不存在");
  }
  return [year, month, day];
}

function formatDate(year: number, month: number, day: number): string {
  if (year < 1 || year > 9999) throw new Error("日期超出可計算範圍");
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function todayInTaipei(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((entry) => entry.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function addDays(date: string, days: number): string {
  dateParts(date);
  if (!Number.isSafeInteger(days)) throw new Error("天數必須是整數");
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  if (!Number.isFinite(value.getTime())) throw new Error("日期超出可計算範圍");
  return formatDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
}

// Always add from the original anchor; iterating from a clamped February date drifts.
export function addMonths(date: string, months: number): string {
  const [year, month, day] = dateParts(date);
  if (!Number.isSafeInteger(months)) throw new Error("月份間隔必須是整數");
  const index = year * 12 + month - 1 + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = index - targetYear * 12 + 1;
  return formatDate(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)));
}

export function monthRange(month: string): { start: string; end: string } {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("月份必須使用 YYYY-MM 格式");
  const start = `${month}-01`;
  return { start, end: addMonths(start, 1) };
}

function firstIndex(expense: Expense, from: string): number {
  if (!INTERVALS.some((interval) => interval.value === expense.intervalMonths)) throw new Error("不支援的付款週期");
  const [year, month] = dateParts(from);
  const [anchorYear, anchorMonth] = dateParts(expense.firstDueOn);
  return Math.max(0, Math.floor(((year - anchorYear) * 12 + month - anchorMonth) / expense.intervalMonths));
}

function dateAtIndex(expense: Expense, index: number): string {
  const date = addMonths(expense.firstDueOn, index * expense.intervalMonths);
  // The explicitly entered first payment is authoritative, even when mid-month.
  if (!expense.monthEnd || index === 0) return date;
  const [year, month] = dateParts(date);
  return formatDate(year, month, daysInMonth(year, month));
}

export function expenseStatus(expense: Expense, on: string): "active" | "paused" | "cancelled" {
  if (expense.cancelledFrom !== null && on >= expense.cancelledFrom) return "cancelled";
  if (expense.pauses.some((pause) => on >= pause.from && (!pause.untilExclusive || on < pause.untilExclusive))) return "paused";
  return "active";
}

export function occurrences(expense: Expense, start: string, end: string): string[] {
  dateParts(start);
  dateParts(end);
  if (start >= end || expense.firstDueOn >= end) return [];
  const dates: string[] = [];
  for (let index = firstIndex(expense, start); ; index += 1) {
    const date = dateAtIndex(expense, index);
    if (date >= end || (expense.cancelledFrom !== null && date >= expense.cancelledFrom)) break;
    if (date >= start && expenseStatus(expense, date) === "active") dates.push(date);
  }
  return dates;
}

export function nextOccurrence(expense: Expense, from: string): string | null {
  dateParts(from);
  if (expense.cancelledFrom !== null && from >= expense.cancelledFrom) return null;
  const [anchorYear, anchorMonth] = dateParts(expense.firstDueOn);
  for (let index = firstIndex(expense, from); ; index += 1) {
    if (anchorYear * 12 + anchorMonth - 1 + index * expense.intervalMonths >= 10_000 * 12) return null;
    const date = dateAtIndex(expense, index);
    if (date < from) continue;
    if (expense.cancelledFrom !== null && date >= expense.cancelledFrom) return null;
    const pauses = expense.pauses.filter((pause) => date >= pause.from && (!pause.untilExclusive || date < pause.untilExclusive));
    if (pauses.some((pause) => !pause.untilExclusive)) return null;
    if (pauses.length === 0) return date;
    // Jump across closed pauses while retaining the original recurrence anchor.
    const resumeOn = pauses.reduce((latest, pause) => pause.untilExclusive! > latest ? pause.untilExclusive! : latest, date);
    index = Math.max(index, firstIndex(expense, resumeOn) - 1);
  }
}

export function monthlyEquivalentMinor(expense: Expense, on: string): number | null {
  if (expenseStatus(expense, on) !== "active") return 0;
  return expense.amountMinor === null ? null : expense.amountMinor / expense.intervalMonths;
}

function twdMinorRaw(amountMinor: number | null, currency: Currency, rates: Record<Currency, number | null>): number | null {
  if (amountMinor === null) return null;
  if (currency === "TWD" || amountMinor === 0) return amountMinor;
  const rate = rates[currency];
  if (rate === null || !Number.isFinite(rate) || rate <= 0) return null;
  // TWD, USD and EUR use two decimal places; JPY stores whole yen.
  return amountMinor * rate * (currency === "JPY" ? 100 : 1);
}

export function toTwdMinor(amountMinor: number | null, currency: Currency, rates: Record<Currency, number | null>): number | null {
  const converted = twdMinorRaw(amountMinor, currency, rates);
  return converted === null ? null : Math.round(converted);
}

export function paymentTwdMinor(payment: Payment): number | null {
  if (payment.settledTwdMinor !== undefined && payment.settledTwdMinor !== null) return payment.settledTwdMinor;
  return toTwdMinor(payment.amountMinor, payment.currency, {
    TWD: 1, USD: null, JPY: null, EUR: null, [payment.currency]: payment.fxRate,
  });
}

function addToTotal(total: Total, amount: number | null, estimated: boolean): void {
  if (amount === null) total.missing += 1;
  else total.twdMinor += amount;
  total.estimated ||= estimated || amount === null;
}

function occurrenceKey(expenseId: string, scheduledOn: string): string {
  return `${expenseId}|${scheduledOn}`;
}

export function projectedTotal(workspace: Workspace, start: string, end: string, scope: "all" | Scope): Total {
  dateParts(start);
  dateParts(end);
  const total: Total = { twdMinor: 0, missing: 0, estimated: false };
  // All recorded occurrences suppress their forecast, including early payments
  // in another month and payments whose historical scope has since changed.
  const paid = new Set(workspace.payments.map((payment) => occurrenceKey(payment.expenseId, payment.scheduledOn)));
  for (const payment of workspace.payments) {
    if (payment.paidOn < start || payment.paidOn >= end || (scope !== "all" && payment.scope !== scope)) continue;
    addToTotal(total, paymentTwdMinor(payment), payment.currency !== "TWD" && payment.settledTwdMinor == null);
  }
  for (const expense of workspace.expenses) {
    if (scope !== "all" && expense.scope !== scope) continue;
    for (const date of occurrences(expense, start, end)) {
      if (paid.has(occurrenceKey(expense.id, date))) continue;
      addToTotal(total, toTwdMinor(expense.amountMinor, expense.currency, workspace.settings.rates),
        expense.amountMode === "variable" || expense.currency !== "TWD");
    }
  }
  return total;
}

export function monthlyBudget(workspace: Workspace, scope: "all" | Scope, on: string): Total {
  const total: Total = { twdMinor: 0, missing: 0, estimated: false };
  for (const expense of workspace.expenses) {
    if ((scope !== "all" && expense.scope !== scope) || expenseStatus(expense, on) !== "active") continue;
    addToTotal(total, twdMinorRaw(monthlyEquivalentMinor(expense, on), expense.currency, workspace.settings.rates),
      expense.amountMode === "variable" || expense.currency !== "TWD");
  }
  // Monthly allocations may contain fractions of a minor unit. Round once.
  return { ...total, twdMinor: Math.round(total.twdMinor) };
}

export function emptyWorkspace(today: string): Workspace {
  checkedDate(today, "today");
  return {
    schemaVersion: 1, expenses: [], methods: [], payments: [],
    settings: { budgetMinor: null, rates: { TWD: 1, USD: null, JPY: null, EUR: null }, rateDate: today },
  };
}

export function makeDemoWorkspace(today: string): Workspace {
  const workspace = emptyWorkspace(today);
  const monthStart = `${today.slice(0, 7)}-01`;
  const earlier = addMonths(monthStart, -2);
  const anchorMonth = earlier < "2000-01-01" ? "2000-01-01" : earlier;
  const year = today.slice(0, 4);
  workspace.settings = {
    budgetMinor: 3_000_000,
    // Illustrative demo rates only; a new empty workspace has no foreign rates.
    rates: { TWD: 1, USD: 32, JPY: 0.22, EUR: 35 }, rateDate: today,
  };
  workspace.methods = [
    { id: "demo-card-personal", name: "日常信用卡", kind: "card", last4: "0412", color: "#8B7BE8", archived: false },
    { id: "demo-card-business", name: "商務信用卡", kind: "card", last4: "0826", color: "#60A5E8", archived: false },
    { id: "demo-bank", name: "主要銀行帳戶", kind: "bank", last4: "1208", color: "#67B99E", archived: false },
  ];
  const make = (
    id: string, name: string, category: Category, amountMinor: number,
    day: number, overrides: Partial<Expense> = {},
  ): Expense => ({
    id: `demo-${id}`, name, category, scope: "personal", amountMinor,
    currency: "TWD", amountMode: "fixed", intervalMonths: 1,
    firstDueOn: `${anchorMonth.slice(0, 7)}-${String(day).padStart(2, "0")}`,
    monthEnd: false, paymentMethodId: "demo-card-personal", automatic: true,
    reminderDays: 3, notes: "示範資料；金額與匯率僅供體驗，不代表官方報價。",
    website: "", pauses: [], cancelledFrom: null, ...overrides,
  });
  const business: Partial<Expense> = { scope: "business", currency: "USD", paymentMethodId: "demo-card-business" };
  workspace.expenses = [
    make("netflix", "Netflix Premium", "entertainment", 39_000, 2),
    make("chatgpt", "ChatGPT Plus", "software", 2_000, 8, { currency: "USD" }),
    make("xbox", "Xbox Game Pass", "entertainment", 29_900, 12),
    make("aws", "AWS 雲端服務", "cloud", 9_000, 15, { ...business, amountMode: "variable" }),
    make("workspace", "Google Workspace", "software", 1_400, 22, business),
    make("github", "GitHub Enterprise", "software", 6_300, 25, business),
    make("vps", "VPS 虛擬主機", "cloud", 1_200, 20, business),
    make("electricity", "電費", "utilities", 180_000, 18, {
      amountMode: "variable", intervalMonths: 2, paymentMethodId: "demo-bank",
    }),
    make("tax", "地價稅", "tax", 600_000, 30, {
      firstDueOn: `${year}-11-30`, intervalMonths: 12, automatic: false, paymentMethodId: "demo-bank", reminderDays: 14,
    }),
    make("insurance", "住宅火險", "insurance", 240_000, 15, {
      firstDueOn: `${year}-07-15`, intervalMonths: 12, paymentMethodId: "demo-bank", reminderDays: 14,
    }),
    make("rent", "房租", "housing", 1_800_000, 1, { paymentMethodId: "demo-bank", automatic: false }),
    make("cleaning", "大樓清潔", "housing", 150_000, 28, {
      scope: "business", paymentMethodId: "demo-bank", automatic: false,
    }),
  ];
  const previousMonth = addMonths(monthStart, -1);
  const historyStart = previousMonth < "2000-01-01" ? "2000-01-01" : previousMonth;
  for (const expense of workspace.expenses) {
    for (const scheduledOn of occurrences(expense, historyStart, addDays(today, 1))) {
      const method = workspace.methods.find((item) => item.id === expense.paymentMethodId)!;
      workspace.payments.push({
        id: `demo-payment-${expense.id}-${scheduledOn}`, expenseId: expense.id,
        expenseName: expense.name, category: expense.category, scope: expense.scope,
        scheduledOn, paidOn: scheduledOn, amountMinor: expense.amountMinor!, currency: expense.currency,
        paymentMethodId: method.id, paymentMethodName: method.name, fxRate: workspace.settings.rates[expense.currency],
      });
    }
  }
  return workspace;
}

// Import validation also rebuilds objects, preventing unknown imported fields
// from becoming part of application state. Payment labels remain snapshots.
function invalid(path: string, message: string): never {
  throw new Error(`${path}：${message}`);
}

function object(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid(path, "必須是物件");
  const result = value as Record<string, unknown>;
  for (const key of Object.keys(result)) if (!keys.includes(key)) invalid(`${path}.${key}`, "不支援的欄位");
  return result;
}

function array(value: unknown, path: string, limit: number): unknown[] {
  if (!Array.isArray(value) || value.length > limit) invalid(path, `必須是最多 ${limit} 筆的陣列`);
  return value;
}

function textValue(value: unknown, path: string, maximum: number, required = false): string {
  if (typeof value !== "string" || value.length > maximum || (required && value.trim().length === 0)) {
    invalid(path, `必須是${required ? "非空白且" : ""}不超過 ${maximum} 字的文字`);
  }
  return value;
}

function idValue(value: unknown, path: string): string {
  const id = textValue(value, path, 128, true);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(id)) invalid(path, "識別碼格式不正確");
  return id;
}

function nullableId(value: unknown, path: string): string | null {
  return value === null ? null : idValue(value, path);
}

function integer(value: unknown, path: string, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > maximum) {
    invalid(path, `必須是 0 到 ${maximum} 的整數`);
  }
  return value;
}

function money(value: unknown, path: string, nullable = false): number | null {
  return nullable && value === null ? null : integer(value, path, 1_000_000_000_000);
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") invalid(path, "必須是布林值");
  return value;
}

function oneOf<T extends string | number>(value: unknown, values: readonly T[], path: string): T {
  if (!values.includes(value as T)) invalid(path, "不支援的選項");
  return value as T;
}

function checkedDate(value: unknown, path: string): string {
  const date = textValue(value, path, 10, true);
  try {
    const [year] = dateParts(date);
    if (year < 2000 || year > 2100) invalid(path, "年份必須介於 2000 與 2100");
  } catch {
    invalid(path, "必須是 2000 至 2100 年間有效的 YYYY-MM-DD 日期");
  }
  return date;
}

function fx(value: unknown, path: string): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1_000_000) {
    invalid(path, "匯率必須是大於 0 且不超過 1,000,000 的有限數字");
  }
  return value;
}

const categoryIds = CATEGORIES.map((category) => category.id);
const scopes: Scope[] = ["personal", "business"];

function parseMethod(value: unknown, path: string): PaymentMethod {
  const data = object(value, path, ["id", "name", "kind", "last4", "color", "archived"]);
  const last4 = textValue(data.last4, `${path}.last4`, 4);
  if (last4 !== "" && !/^\d{4}$/.test(last4)) invalid(`${path}.last4`, "只能留空或填寫末四碼數字");
  const color = textValue(data.color, `${path}.color`, 7, true);
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) invalid(`${path}.color`, "必須是六碼十六進位色彩");
  return {
    id: idValue(data.id, `${path}.id`), name: textValue(data.name, `${path}.name`, 120, true),
    kind: oneOf(data.kind, ["card", "bank", "wallet", "other"] as const, `${path}.kind`),
    last4, color, archived: booleanValue(data.archived, `${path}.archived`),
  };
}

function parseExpense(value: unknown, path: string): Expense {
  const data = object(value, path, [
    "id", "name", "category", "scope", "amountMinor", "currency", "amountMode", "intervalMonths",
    "firstDueOn", "monthEnd", "paymentMethodId", "automatic", "reminderDays", "notes", "website", "pauses", "cancelledFrom",
  ]);
  const amountMode = oneOf(data.amountMode, ["fixed", "variable"] as const, `${path}.amountMode`);
  const website = textValue(data.website, `${path}.website`, 2048);
  if (website !== "") {
    try {
      if (!["https:", "http:"].includes(new URL(website).protocol)) invalid(`${path}.website`, "只接受 HTTP 或 HTTPS 網址");
    } catch {
      invalid(`${path}.website`, "必須是有效的 HTTP 或 HTTPS 網址");
    }
  }
  const pauses = array(data.pauses, `${path}.pauses`, 500).map((value, index) => {
    const pausePath = `${path}.pauses[${index}]`;
    const pause = object(value, pausePath, ["from", "untilExclusive"]);
    const from = checkedDate(pause.from, `${pausePath}.from`);
    if (pause.untilExclusive === undefined) return { from };
    const untilExclusive = checkedDate(pause.untilExclusive, `${pausePath}.untilExclusive`);
    if (untilExclusive < from) invalid(pausePath, "暫停結束日期不能早於開始日期");
    return { from, untilExclusive };
  });
  return {
    id: idValue(data.id, `${path}.id`), name: textValue(data.name, `${path}.name`, 120, true),
    category: oneOf(data.category, categoryIds, `${path}.category`), scope: oneOf(data.scope, scopes, `${path}.scope`),
    amountMinor: money(data.amountMinor, `${path}.amountMinor`, amountMode === "variable"),
    currency: oneOf(data.currency, CURRENCIES, `${path}.currency`), amountMode,
    intervalMonths: oneOf(data.intervalMonths, [1, 2, 3, 6, 12] as const, `${path}.intervalMonths`),
    firstDueOn: checkedDate(data.firstDueOn, `${path}.firstDueOn`), monthEnd: booleanValue(data.monthEnd, `${path}.monthEnd`),
    paymentMethodId: nullableId(data.paymentMethodId, `${path}.paymentMethodId`),
    automatic: booleanValue(data.automatic, `${path}.automatic`), reminderDays: integer(data.reminderDays, `${path}.reminderDays`, 30),
    notes: textValue(data.notes, `${path}.notes`, 2000), website, pauses,
    cancelledFrom: data.cancelledFrom === null ? null : checkedDate(data.cancelledFrom, `${path}.cancelledFrom`),
  };
}

function parsePayment(value: unknown, path: string): Payment {
  const data = object(value, path, [
    "id", "expenseId", "expenseName", "category", "scope", "scheduledOn", "paidOn", "amountMinor", "currency",
    "paymentMethodId", "paymentMethodName", "fxRate", "settledTwdMinor",
  ]);
  const result: Payment = {
    id: idValue(data.id, `${path}.id`), expenseId: idValue(data.expenseId, `${path}.expenseId`),
    expenseName: textValue(data.expenseName, `${path}.expenseName`, 120, true),
    category: oneOf(data.category, categoryIds, `${path}.category`), scope: oneOf(data.scope, scopes, `${path}.scope`),
    scheduledOn: checkedDate(data.scheduledOn, `${path}.scheduledOn`), paidOn: checkedDate(data.paidOn, `${path}.paidOn`),
    amountMinor: money(data.amountMinor, `${path}.amountMinor`)!, currency: oneOf(data.currency, CURRENCIES, `${path}.currency`),
    paymentMethodId: nullableId(data.paymentMethodId, `${path}.paymentMethodId`),
    paymentMethodName: textValue(data.paymentMethodName, `${path}.paymentMethodName`, 120), fxRate: fx(data.fxRate, `${path}.fxRate`),
  };
  if (result.currency === "TWD" && result.fxRate !== null && result.fxRate !== 1) invalid(`${path}.fxRate`, "TWD 匯率必須為 1");
  if (data.settledTwdMinor !== undefined) result.settledTwdMinor = money(data.settledTwdMinor, `${path}.settledTwdMinor`, true);
  return result;
}

function uniqueIds(values: Array<{ id: string }>, path: string): Set<string> {
  const ids = new Set<string>();
  for (const value of values) {
    if (ids.has(value.id)) invalid(path, `識別碼重複：${value.id}`);
    ids.add(value.id);
  }
  return ids;
}

export function validateWorkspace(input: unknown): Workspace {
  const data = object(input, "workspace", ["schemaVersion", "expenses", "methods", "payments", "settings"]);
  if (data.schemaVersion !== 1) invalid("schemaVersion", "不支援此備份版本");
  // Check all outer limits before traversing any supplied collection.
  const expenseData = array(data.expenses, "expenses", 500);
  const methodData = array(data.methods, "methods", 50);
  const paymentData = array(data.payments, "payments", 3000);
  const expenses = expenseData.map((value, index) => parseExpense(value, `expenses[${index}]`));
  const methods = methodData.map((value, index) => parseMethod(value, `methods[${index}]`));
  const payments = paymentData.map((value, index) => parsePayment(value, `payments[${index}]`));
  const expenseIds = uniqueIds(expenses, "expenses");
  const methodIds = uniqueIds(methods, "methods");
  uniqueIds(payments, "payments");
  for (const expense of expenses) {
    if (expense.paymentMethodId !== null && !methodIds.has(expense.paymentMethodId)) invalid("expenses.paymentMethodId", "付款方式不存在");
  }
  const paidOccurrences = new Set<string>();
  for (const payment of payments) {
    if (!expenseIds.has(payment.expenseId)) invalid("payments.expenseId", "支出項目不存在");
    if (payment.paymentMethodId !== null && !methodIds.has(payment.paymentMethodId)) invalid("payments.paymentMethodId", "付款方式不存在");
    const key = occurrenceKey(payment.expenseId, payment.scheduledOn);
    if (paidOccurrences.has(key)) invalid("payments", "同一期付款不可重複登記");
    paidOccurrences.add(key);
  }
  const settings = object(data.settings, "settings", ["budgetMinor", "rates", "rateDate"]);
  const rateData = object(settings.rates, "settings.rates", CURRENCIES);
  const rates: Record<Currency, number | null> = {
    TWD: fx(rateData.TWD, "settings.rates.TWD"), USD: fx(rateData.USD, "settings.rates.USD"),
    JPY: fx(rateData.JPY, "settings.rates.JPY"), EUR: fx(rateData.EUR, "settings.rates.EUR"),
  };
  if (rates.TWD !== 1) invalid("settings.rates.TWD", "TWD 匯率必須為 1");
  return {
    schemaVersion: 1, expenses, methods, payments,
    settings: { budgetMinor: money(settings.budgetMinor, "settings.budgetMinor", true), rates, rateDate: checkedDate(settings.rateDate, "settings.rateDate") },
  };
}
