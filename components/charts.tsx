"use client";

import { useId, useMemo, useState } from "react";
import { CalendarDays, Check, ChevronRight } from "lucide-react";
import {
  CATEGORIES,
  expenseStatus,
  monthlyEquivalentMinor,
  monthRange,
  occurrences,
  paymentTwdMinor,
  projectedTotal,
  toTwdMinor,
  type Category,
  type Currency,
  type Expense,
  type Payment,
  type Scope,
  type Workspace,
} from "@/lib/domain";

type ScopeFilter = "all" | Scope;

function formatMoney(amountMinor: number | null, currency: Currency = "TWD") {
  if (amountMinor === null) return "待確認";
  const divisor = currency === "JPY" ? 1 : 100;
  const prefix = { TWD: "NT$", USD: "US$", JPY: "JP¥", EUR: "€" }[currency];
  const digits = currency === "JPY" ? 0 : 2;
  return `${prefix} ${new Intl.NumberFormat("zh-TW", {
    minimumFractionDigits: currency === "USD" || currency === "EUR" ? 2 : 0,
    maximumFractionDigits: digits,
  }).format(amountMinor / divisor)}`;
}

function shiftMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string, includeYear = false) {
  const [year, monthNumber] = month.split("-");
  return `${includeYear ? `${year} 年 ` : ""}${Number(monthNumber)} 月`;
}

function dateLabel(date: string) {
  const [, month, day] = date.split("-");
  return `${Number(month)} 月 ${Number(day)} 日`;
}

function inScope(value: Scope, scope: ScopeFilter) {
  return scope === "all" || value === scope;
}

function niceChartMaximum(value: number) {
  if (value <= 0) return 100_000;
  const roughStep = value / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const fraction = roughStep / magnitude;
  const multiplier = [1, 2, 2.5, 5, 10].find((candidate) => candidate >= fraction) ?? 10;
  return multiplier * magnitude * 4;
}

function categoryDetails(category: Category) {
  return CATEGORIES.find((entry) => entry.id === category) ?? CATEGORIES[CATEGORIES.length - 1];
}

export function SpendingChart({
  workspace,
  month,
  scope,
}: {
  workspace: Workspace;
  month: string;
  scope: ScopeFilter;
}) {
  const tooltipId = useId();
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null);
  const [focusedMonth, setFocusedMonth] = useState<string | null>(null);
  const rows = useMemo(() => {
    return Array.from({ length: 6 }, (_, index) => {
      const chartMonth = shiftMonth(month, index - 2);
      const { start, end } = monthRange(chartMonth);
      const total = projectedTotal(workspace, start, end, scope);
      let paid = 0;
      let paidMissing = 0;
      for (const payment of workspace.payments) {
        if (!inScope(payment.scope, scope) || payment.paidOn < start || payment.paidOn >= end) continue;
        const amount = paymentTwdMinor(payment);
        if (amount === null) paidMissing += 1;
        else paid += amount;
      }
      const planned = Math.max(0, total.twdMinor - paid);
      return { month: chartMonth, total, paid, paidMissing, planned, height: paid + planned };
    });
  }, [workspace, month, scope]);
  const maximum = niceChartMaximum(Math.max(...rows.map((row) => row.height), 0));
  const missing = rows.reduce((sum, row) => sum + row.total.missing, 0);
  const paidMissing = rows.reduce((sum, row) => sum + row.paidMissing, 0);
  const activeMonth = hoveredMonth ?? focusedMonth;
  const hasValues = rows.some((row) => row.height > 0);

  return (
    <section className="chart-panel spending-panel" aria-label="六個月支出趨勢">
      <div className="panel-head">
        <div>
          <p className="eyebrow">SPENDING TREND</p>
          <h2 className="panel-title">支出趨勢</h2>
        </div>
        <div className="chart-legend" aria-label="圖表圖例">
          <span><i className="legend-dot paid-dot" style={{ backgroundColor: "#2d765c" }} />已付款</span>
          <span><i className="legend-dot planned-dot" style={{ backgroundColor: "#dcebd7" }} />待付預估</span>
        </div>
      </div>

      <div className="bar-chart">
        <div className="chart-y-axis" aria-hidden="true">
          {[4, 3, 2, 1, 0].map((part) => (
            <span key={part}>{new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format((maximum * part) / 400)}</span>
          ))}
        </div>
        <div className="chart-plot">
          <div className="chart-grid-lines" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((line) => <span key={line} />)}
          </div>
          <div className="chart-bars">
            {rows.map((row) => {
              const shown = activeMonth === row.month;
              const label = `${monthLabel(row.month, true)}，預估合計 ${formatMoney(row.total.twdMinor)}，已付款 ${formatMoney(row.paid)}，待付預估 ${formatMoney(row.planned)}${row.total.missing ? `，${row.total.missing} 筆金額或匯率待確認` : ""}${row.paidMissing ? `，${row.paidMissing} 筆付款缺少台幣換算金額` : ""}`;
              return (
                <button
                  type="button"
                  key={row.month}
                  className={`bar-column${row.month === month ? " is-current" : ""}`}
                  aria-label={label}
                  onMouseEnter={() => setHoveredMonth(row.month)}
                  onMouseLeave={() => setHoveredMonth(null)}
                  onFocus={() => setFocusedMonth(row.month)}
                  onBlur={() => setFocusedMonth(null)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setHoveredMonth(null);
                      setFocusedMonth(null);
                    }
                  }}
                >
                  <span className="bar-track">
                    <span className="bar-stack" style={{ height: `${(row.height / maximum) * 100}%` }}>
                      <span className="bar-planned" style={{ height: `${row.height ? (row.planned / row.height) * 100 : 0}%` }} />
                      <span className="bar-paid" style={{ height: `${row.height ? (row.paid / row.height) * 100 : 0}%` }} />
                    </span>
                  </span>
                  <span className="bar-label">{monthLabel(row.month)}</span>
                  {shown && (
                    <span className="bar-tooltip" id={`${tooltipId}-${row.month}`} role="tooltip">
                      <strong>{monthLabel(row.month, true)}</strong>
                      <span>預估合計 <b>{formatMoney(row.total.twdMinor)}</b></span>
                      <span>已付款 <b>{formatMoney(row.paid)}</b></span>
                      <span>待付預估 <b>{formatMoney(row.planned)}</b></span>
                      {row.total.missing > 0 && <small>{row.total.missing} 筆金額或匯率待確認</small>}
                      {row.paidMissing > 0 && <small>其中 {row.paidMissing} 筆已付款尚無台幣換算金額</small>}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <p className="chart-footnote">
        {hasValues ? "單位：新台幣。已付款依實際付款日統計，待付金額依目前排程估算。" : "尚無可計算的支出，新增項目後即可查看趨勢。單位：新台幣。"}
        {missing > 0 && ` 此期間有 ${missing} 筆金額或匯率未設定，尚未納入預估。`}
        {paidMissing > 0 && ` 其中 ${paidMissing} 筆已付款缺少台幣換算金額。`}
      </p>
    </section>
  );
}

export function CategoryChart({
  workspace,
  scope,
  today,
}: {
  workspace: Workspace;
  scope: ScopeFilter;
  today: string;
}) {
  const titleId = useId();
  const breakdown = useMemo(() => {
    const categories = CATEGORIES.map((category) => ({ ...category, amount: 0, count: 0, missing: 0 }));
    let activeCount = 0;
    let hasForeignCurrency = false;
    for (const expense of workspace.expenses) {
      if (!inScope(expense.scope, scope) || expenseStatus(expense, today) !== "active") continue;
      const category = categories.find((entry) => entry.id === expense.category)!;
      activeCount += 1;
      category.count += 1;
      const value = toTwdMinor(monthlyEquivalentMinor(expense, today), expense.currency, workspace.settings.rates);
      if (value === null) category.missing += 1;
      else category.amount += value;
      if (expense.currency !== "TWD") hasForeignCurrency = true;
    }
    return {
      categories: categories.filter((category) => category.count > 0).sort((a, b) => b.amount - a.amount),
      total: categories.reduce((sum, category) => sum + category.amount, 0),
      missing: categories.reduce((sum, category) => sum + category.missing, 0),
      activeCount,
      hasForeignCurrency,
    };
  }, [workspace, scope, today]);
  const radius = 74;
  const circumference = 2 * Math.PI * radius;
  let accumulated = 0;
  const arcs = breakdown.categories.map((category) => {
    const length = breakdown.total > 0 ? (category.amount / breakdown.total) * circumference : 0;
    const offset = accumulated;
    accumulated += length;
    return { ...category, length, offset };
  });

  return (
    <section className="chart-panel category-panel" aria-label="使用中支出的每月分類分佈">
      <div className="panel-head">
        <div>
          <p className="eyebrow">BY CATEGORY</p>
          <h2 className="panel-title">支出分佈</h2>
        </div>
        <span className="muted category-period">每月平均</span>
      </div>
      <div className="donut-layout">
        <div className="donut-wrap">
          <svg viewBox="0 0 200 200" role="img" aria-labelledby={titleId}>
            <title id={titleId}>{`每月平均支出 ${formatMoney(breakdown.total)}${breakdown.missing > 0 ? `，不含 ${breakdown.missing} 筆待確認項目` : ""}`}</title>
            <circle cx="100" cy="100" r={radius} fill="none" stroke="#eef1f6" strokeWidth="23" />
            {arcs.filter((arc) => arc.length > 0).map((arc) => (
              <circle
                key={arc.id}
                cx="100"
                cy="100"
                r={radius}
                fill="none"
                stroke={arc.color}
                strokeWidth="23"
                strokeDasharray={`${arc.length} ${circumference - arc.length}`}
                strokeDashoffset={-arc.offset}
                transform="rotate(-90 100 100)"
              />
            ))}
          </svg>
          <div className="donut-center" aria-hidden="true">
            <span>每月平均</span>
            <strong>{formatMoney(breakdown.total)}</strong>
            <small>{breakdown.activeCount} 筆使用中項目</small>
          </div>
        </div>
        {breakdown.categories.length > 0 ? (
          <ul className="category-legend">
            {breakdown.categories.map((category) => (
              <li className="category-line" key={category.id}>
                <i className="legend-dot" style={{ backgroundColor: category.color }} aria-hidden="true" />
                <span className="category-name">
                  {category.label}
                  {category.missing > 0 && <small className="muted">{category.missing} 筆待確認</small>}
                </span>
                <span className="category-amount">{category.missing === category.count ? "待確認" : formatMoney(category.amount)}</span>
                <span className="category-percentage muted">
                  {breakdown.total > 0 && category.amount > 0 ? `${((category.amount / breakdown.total) * 100).toFixed(1)}%` : "—"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-small">還沒有使用中的項目。新增第一筆支出，開始了解你的每月負擔。</p>
        )}
      </div>
      <p className="chart-footnote">
        依使用中項目的付款週期攤提，顯示每月平均負擔。
        {breakdown.hasForeignCurrency && ` 外幣按設定匯率估算${workspace.settings.rateDate ? `（${workspace.settings.rateDate}）` : ""}。`}
        {breakdown.missing > 0 && ` ${breakdown.missing} 筆金額或匯率未設定，尚未納入；占比僅以已知金額計算。`}
      </p>
    </section>
  );
}

type CalendarEntry = {
  expense: Expense;
  scheduledOn: string;
  payment?: Payment;
};

function expenseForPayment(payment: Payment, existing?: Expense): Expense {
  if (existing) return existing;
  return {
    id: payment.expenseId,
    name: payment.expenseName,
    category: payment.category,
    scope: payment.scope,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    amountMode: "fixed",
    intervalMonths: 1,
    firstDueOn: payment.scheduledOn,
    monthEnd: false,
    paymentMethodId: payment.paymentMethodId,
    automatic: false,
    reminderDays: 0,
    notes: "",
    website: "",
    pauses: [],
    cancelledFrom: payment.scheduledOn,
  };
}

function calendarEntries(workspace: Workspace, month: string, scope: ScopeFilter) {
  const { start, end } = monthRange(month);
  const byKey = new Map<string, CalendarEntry>();
  const expenseById = new Map(workspace.expenses.map((expense) => [expense.id, expense]));
  const paidByKey = new Map(workspace.payments.map((payment) => [`${payment.expenseId}:${payment.scheduledOn}`, payment]));

  // Payment snapshots are independent of the current schedule, so editing,
  // pausing, or cancelling an expense cannot erase its recorded calendar item.
  for (const payment of workspace.payments) {
    if (payment.scheduledOn < start || payment.scheduledOn >= end || !inScope(payment.scope, scope)) continue;
    byKey.set(`${payment.expenseId}:${payment.scheduledOn}`, {
      expense: expenseForPayment(payment, expenseById.get(payment.expenseId)),
      scheduledOn: payment.scheduledOn,
      payment,
    });
  }
  for (const expense of workspace.expenses) {
    if (!inScope(expense.scope, scope)) continue;
    for (const scheduledOn of occurrences(expense, start, end)) {
      const key = `${expense.id}:${scheduledOn}`;
      const payment = paidByKey.get(key);
      if (payment && !inScope(payment.scope, scope)) continue;
      byKey.set(key, { expense, scheduledOn, payment });
    }
  }

  const byDate = new Map<string, CalendarEntry[]>();
  for (const entry of byKey.values()) {
    const entries = byDate.get(entry.scheduledOn) ?? [];
    entries.push(entry);
    byDate.set(entry.scheduledOn, entries);
  }
  for (const entries of byDate.values()) {
    entries.sort((a, b) => Number(Boolean(a.payment)) - Number(Boolean(b.payment)) || (a.payment?.expenseName ?? a.expense.name).localeCompare(b.payment?.expenseName ?? b.expense.name, "zh-TW"));
  }
  return byDate;
}

function entryTotal(entries: CalendarEntry[], workspace: Workspace) {
  let amount = 0;
  let missing = 0;
  for (const entry of entries) {
    const value = entry.payment
      ? paymentTwdMinor(entry.payment)
      : toTwdMinor(entry.expense.amountMinor, entry.expense.currency, workspace.settings.rates);
    if (value === null) missing += 1;
    else amount += value;
  }
  return { amount, missing };
}

type CalendarProps = {
  workspace: Workspace;
  month: string;
  scope: ScopeFilter;
  today: string;
  onSelect: (expense: Expense, scheduledOn: string) => void;
};

export function PaymentCalendar(props: CalendarProps) {
  // Remounting the month resets day selection, without an effect that can
  // briefly show an agenda belonging to the previously displayed month.
  return <PaymentCalendarMonth key={props.month} {...props} />;
}

function PaymentCalendarMonth({ workspace, month, scope, today, onSelect }: CalendarProps) {
  const [selectedDay, setSelectedDay] = useState(today.startsWith(`${month}-`) ? today : `${month}-01`);
  const headingId = useId();
  const entriesByDate = useMemo(() => calendarEntries(workspace, month, scope), [workspace, month, scope]);
  const days = useMemo(() => {
    const [year, monthNumber] = month.split("-").map(Number);
    const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1));
    const mondayOffset = (firstDay.getUTCDay() + 6) % 7;
    const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const cellCount = Math.ceil((mondayOffset + daysInMonth) / 7) * 7;
    return Array.from({ length: cellCount }, (_, index) => {
      const date = new Date(Date.UTC(year, monthNumber - 1, index - mondayOffset + 1));
      return date.toISOString().slice(0, 10);
    });
  }, [month]);
  const agenda = entriesByDate.get(selectedDay) ?? [];
  const agendaTotal = entryTotal(agenda, workspace);
  const monthCount = Array.from(entriesByDate.values()).reduce((sum, entries) => sum + entries.length, 0);

  return (
    <section className="calendar-panel" aria-labelledby={headingId}>
      <div className="panel-head">
        <div>
          <p className="eyebrow">PAYMENT CALENDAR</p>
          <h2 className="panel-title" id={headingId}>付款行事曆</h2>
        </div>
        <span className="muted calendar-month-label">{monthLabel(month, true)} · {monthCount} 筆</span>
      </div>
      <div className="calendar-weekdays" aria-hidden="true">
        {["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="calendar-grid" role="group" aria-label={`${monthLabel(month, true)}，每週由星期一開始`}>
        {days.map((day) => {
          const outside = !day.startsWith(`${month}-`);
          const entries = entriesByDate.get(day) ?? [];
          const total = entryTotal(entries, workspace);
          const selected = selectedDay === day;
          const isToday = day === today;
          const totalLabel = entries.length === 0 ? "無付款項目" : `${entries.length} 筆，${formatMoney(total.amount)}${total.missing > 0 ? `，另有 ${total.missing} 筆金額或匯率待確認` : ""}`;
          return (
            <button
              type="button"
              key={day}
              className={`calendar-day${outside ? " outside" : ""}${isToday ? " is-today" : ""}${selected ? " is-selected" : ""}${entries.length ? " has-payments" : ""}`}
              disabled={outside}
              aria-label={`${day}${isToday ? "，今天" : ""}，${totalLabel}`}
              aria-pressed={selected}
              aria-current={isToday ? "date" : undefined}
              onClick={() => setSelectedDay(day)}
            >
              <time dateTime={day}>{Number(day.slice(-2))}</time>
              <span className="calendar-dots" aria-hidden="true">
                {entries.slice(0, 3).map((entry) => (
                  <i key={`${entry.expense.id}:${entry.scheduledOn}`} style={{ backgroundColor: categoryDetails(entry.payment?.category ?? entry.expense.category).color }} />
                ))}
                {entries.length > 3 && <span className="calendar-dot-count">+{entries.length - 3}</span>}
              </span>
              {entries.length > 0 && (
                <span className="calendar-day-total" aria-hidden="true">
                  {total.missing === entries.length ? "待確認" : `${formatMoney(total.amount)}${total.missing > 0 ? "+" : ""}`}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="day-agenda" aria-live="polite" aria-atomic="false">
        <div className="agenda-heading">
          <h3>{dateLabel(selectedDay)}{selectedDay === today && <span className="today-label">今天</span>}</h3>
          <span className="muted">{agenda.length} 筆{agenda.length > 0 && ` · ${agendaTotal.missing === agenda.length ? "金額待確認" : formatMoney(agendaTotal.amount)}`}</span>
        </div>
        {agenda.length === 0 ? (
          <div className="empty-small agenda-empty"><CalendarDays size={22} aria-hidden="true" /><span>這一天沒有預定付款，輕鬆一下。</span></div>
        ) : (
          <div className="agenda-list">
            {agenda.map((entry) => {
              const category = categoryDetails(entry.payment?.category ?? entry.expense.category);
              const method = entry.payment?.paymentMethodName ?? workspace.methods.find((candidate) => candidate.id === entry.expense.paymentMethodId)?.name;
              const name = entry.payment?.expenseName ?? entry.expense.name;
              const amount = entry.payment ? entry.payment.amountMinor : entry.expense.amountMinor;
              const currency = entry.payment?.currency ?? entry.expense.currency;
              const paid = Boolean(entry.payment);
              return (
                <button
                  type="button"
                  key={`${entry.expense.id}:${entry.scheduledOn}`}
                  className="agenda-row"
                  onClick={() => onSelect(entry.expense, entry.scheduledOn)}
                  aria-label={`${name}，${formatMoney(amount, currency)}，${paid ? "已付款，檢視紀錄" : "未確認，登記付款"}`}
                >
                  <span className="agenda-icon" style={{ color: category.color, backgroundColor: `${category.color}18` }} aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
                  <span className="agenda-description">
                    <strong>{name}</strong>
                    <small className="muted">{category.label}{method ? ` · ${method}` : ""}</small>
                  </span>
                  <span className="agenda-payment">
                    <strong>{formatMoney(amount, currency)}</strong>
                    <span className={`agenda-status ${paid ? "agenda-paid" : "agenda-pending"}`}>
                      {paid ? <><Check size={12} aria-hidden="true" />已付款 · {dateLabel(entry.payment!.paidOn)}</> : entry.scheduledOn < today ? "未確認 · 已過預定日" : "未確認"}
                    </span>
                  </span>
                  <ChevronRight size={16} className="agenda-chevron" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        )}
        {agendaTotal.missing > 0 && <p className="chart-footnote">當日合計未包含 {agendaTotal.missing} 筆金額或匯率待確認項目。</p>}
      </div>
      <p className="chart-footnote calendar-footnote">依預定付款日排列。日曆金額以新台幣估算；點選項目可登記或檢視實際付款。</p>
    </section>
  );
}
