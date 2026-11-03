"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { LayoutDashboard, Layers3, CalendarDays, CreditCard, Settings2, Plus, ArrowUpRight, ArrowRight, ChevronLeft, ChevronRight, Search, Bell, CircleHelp, Check, Download, Upload, X, Pause, Play, Pencil, Landmark, Wallet, Building2, UserRound, LogOut, Menu, Sprout, CircleDollarSign, RefreshCw, LoaderCircle, CalendarClock, ShieldCheck, Archive, ReceiptText } from "lucide-react";
import { CATEGORIES, INTERVALS, addDays, addMonths, emptyWorkspace, expenseStatus, makeDemoWorkspace, monthlyBudget, monthlyEquivalentMinor, monthRange, nextOccurrence, occurrences, paymentTwdMinor, projectedTotal, todayInTaipei, toTwdMinor, validateWorkspace, type Workspace, type Expense, type Payment, type PaymentMethod, type Scope, type Currency } from "../lib/domain";
import { exportCalendar, parseBackup, serializeBackup } from "../lib/export";
import { toggleExpenseLifecycle } from "../lib/lifecycle";
import { ExpenseForm, MethodForm, PaymentForm, Modal } from "./forms";
import { SpendingChart, CategoryChart, PaymentCalendar } from "./charts";

type View = "overview" | "items" | "calendar" | "methods" | "settings";
type Dialog = { kind: "expense"; expense?: Expense } | { kind: "method"; method?: PaymentMethod } | { kind: "payment"; expense: Expense; date: string } | { kind: "paid"; payment: Payment } | { kind: "cancel"; expense: Expense } | { kind: "import"; workspace: Workspace } | { kind: "help" } | null;
const NAV = [{ id: "overview", label: "總覽", icon: LayoutDashboard }, { id: "items", label: "所有項目", icon: Layers3 }, { id: "calendar", label: "付款日曆", icon: CalendarDays }, { id: "methods", label: "付款方式", icon: CreditCard }] as const;
const KIND = { card: "信用卡", bank: "銀行帳戶", wallet: "第三方支付", other: "其他方式" };
const formatTwd = (minor: number) => new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(minor / 100);
const formatMoney = (minor: number | null, currency: Currency) => minor === null ? "金額待補" : new Intl.NumberFormat("zh-TW", { style: "currency", currency, maximumFractionDigits: currency === "JPY" || currency === "TWD" ? 0 : 2 }).format(minor / (currency === "JPY" ? 1 : 100));
const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const categoryOf = (id: string) => CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
const intervalOf = (n: number) => INTERVALS.find(i => i.value === n)?.label || `${n} 個月`;
const paymentLabel = (method?: PaymentMethod) => method ? `${method.name}${method.last4 ? ` · ${method.last4}` : ""}` : "尚未指定";

function Brand({ expense, small = false }: { expense: Pick<Expense, "name" | "category">; small?: boolean }) {
  const name = expense.name.toLowerCase();
  const mark = name.includes("netflix") ? ["N", "#fce9e9", "#d72029"] : name.includes("chatgpt") ? ["✳", "#e7f3ec", "#168161"] : name.includes("aws") ? ["aws", "#fff0d9", "#a56713"] : name.includes("xbox") || name.includes("xgpu") ? ["X", "#eaf3e5", "#417534"] : name.includes("google") ? ["G", "#eef0ff", "#4e66b5"] : name.includes("github") ? ["gh", "#eeeef1", "#383744"] : [expense.name.slice(0, 1), `${categoryOf(expense.category).color}18`, categoryOf(expense.category).color];
  return <span className={`brand-icon${small ? " brand-small" : ""}`} style={{ background: mark[1], color: mark[2] }} aria-hidden="true">{mark[0]}</span>;
}
function download(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Subway({ user, signInUrl, signOutUrl }: { user: { name: string; email: string } | null; signInUrl: string; signOutUrl: string }) {
  const [today] = useState(todayInTaipei);
  const [workspace, setWorkspace] = useState<Workspace>(() => emptyWorkspace(today));
  const [sample, setSample] = useState<Workspace>(() => makeDemoWorkspace(today));
  const [demo, setDemo] = useState(true);
  const [view, setView] = useState<View>("overview");
  const [scope, setScope] = useState<"all" | Scope>("all");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [loading, setLoading] = useState(!!user);
  const [ready, setReady] = useState(!user);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [actionError, setActionError] = useState("");
  const revision = useRef(0);
  const writeLock = useRef(false);
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    fetch("/api/workspace", { cache: "no-store", signal: controller.signal }).then(async response => {
      const result = await response.json() as { workspace: unknown; revision: number; error?: string };
      if (!response.ok) throw new Error(result.error || "無法載入資料");
      const saved = validateWorkspace(result.workspace);
      setWorkspace(saved); revision.current = result.revision;
      setDemo(saved.expenses.length === 0 && saved.methods.length === 0 && saved.payments.length === 0);
      setReady(true);
    }).catch(error => { if (error.name !== "AbortError") setLoadError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [user]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(""), 4800); return () => clearTimeout(id); }, [toast]);
  useEffect(() => { setActionError(""); }, [dialog]);

  const data = demo ? sample : workspace;
  const expenses = useMemo(() => data.expenses.filter(e => scope === "all" || e.scope === scope), [data.expenses, scope]);
  const active = expenses.filter(e => expenseStatus(e, today) === "active");
  const range = monthRange(month);
  const forecast = projectedTotal(data, range.start, range.end, scope);
  const monthly = monthlyBudget(data, scope, today);
  const payments = data.payments.filter(p => scope === "all" || p.scope === scope);
  const upcoming = expenses.flatMap(expense => occurrences(expense, today, addDays(today, 30)).map(date => ({ expense, date }))).filter(item => !data.payments.some(p => p.expenseId === item.expense.id && p.scheduledOn === item.date)).sort((a, b) => a.date.localeCompare(b.date) || a.expense.name.localeCompare(b.expense.name));
  const upcomingTotal = upcoming.reduce((sum, item) => sum + (toTwdMinor(item.expense.amountMinor, item.expense.currency, data.settings.rates) ?? 0), 0);
  const upcomingMissing = upcoming.filter(item => toTwdMinor(item.expense.amountMinor, item.expense.currency, data.settings.rates) === null).length;
  const reminders = upcoming.filter(item => item.date <= addDays(today, item.expense.reminderDays));
  const monthPaid = payments.filter(p => p.paidOn >= range.start && p.paidOn < range.end).reduce((sum, p) => sum + (paymentTwdMinor(p) ?? 0), 0);
  const budget = data.settings.budgetMinor;
  const fullMonthly = monthlyBudget(data, "all", today);
  const budgetPercent = budget ? Math.round(fullMonthly.twdMinor / budget * 100) : 0;
  const filtered = expenses.filter(e => (category === "all" || e.category === category) && (status === "all" || expenseStatus(e, today) === status) && `${e.name} ${e.notes} ${paymentLabel(data.methods.find(m => m.id === e.paymentMethodId))}`.toLowerCase().includes(search.toLowerCase()));

  async function persist(next: Workspace) {
    const validated = validateWorkspace(next);
    if (demo) { setSample(validated); setToast("示範資料已更新，未儲存至帳戶。"); return; }
    if (!user || !ready) throw new Error("請先登入並成功載入資料。");
    if (writeLock.current) throw new Error("正在儲存上一筆變更，請稍候。");
    writeLock.current = true; setSaving(true);
    try {
      const response = await fetch("/api/workspace", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace: validated, revision: revision.current }) });
      const result = await response.json() as { workspace: unknown; revision: number; error?: string };
      if (!response.ok) throw new Error(result.error || "儲存失敗，請重試。");
      setWorkspace(validated); revision.current = result.revision; setToast("已儲存至你的帳戶。");
    } finally { writeLock.current = false; setSaving(false); }
  }
  const saveExpense = async (expense: Expense) => { await persist({ ...data, expenses: data.expenses.some(e => e.id === expense.id) ? data.expenses.map(e => e.id === expense.id ? expense : e) : [...data.expenses, expense] }); setDialog(null); };
  const saveMethod = async (method: PaymentMethod) => { await persist({ ...data, methods: data.methods.some(m => m.id === method.id) ? data.methods.map(m => m.id === method.id ? method : m) : [...data.methods, method] }); setDialog(null); };
  const savePayment = async (payment: Payment) => { await persist({ ...data, payments: [...data.payments.filter(p => !(p.expenseId === payment.expenseId && p.scheduledOn === payment.scheduledOn)), payment] }); setDialog(null); };
  const navigate = (next: View) => { setView(next); setMobileNav(false); };
  const moveMonth = (n: number) => { const next = addMonths(`${month}-01`, n).slice(0, 7); if (next >= "2000-03" && next <= "2099-09") setMonth(next); };
  function selectPayment(expense: Expense, date: string) {
    const payment = data.payments.find(p => p.expenseId === expense.id && p.scheduledOn === date);
    setDialog(payment ? { kind: "paid", payment } : { kind: "payment", expense, date });
  }
  async function toggleExpense(expense: Expense) {
    const updated = toggleExpenseLifecycle(expense, today);
    try { await saveExpense(updated); } catch (error) { setToast(error instanceof Error ? error.message : "儲存失敗"); }
  }
  function exportData() { download(serializeBackup(data), `subway-${demo ? "demo" : "backup"}-${today}.json`, "application/json"); setToast("已匯出 JSON 備份。"); }
  function exportIcs() { download(exportCalendar(data, today, scope), `subway-payments-${today}.ics`, "text/calendar;charset=utf-8"); setToast("已匯出未來 12 個月的付款日曆快照。"); }
  async function importData(file: File) {
    try { if (file.size > 4_194_304) throw new Error("備份檔案不可超過 4 MB。"); setDialog({ kind: "import", workspace: parseBackup(await file.text()) }); }
    catch (error) { setToast(error instanceof Error ? error.message : "無法讀取備份檔案。"); }
    finally { if (importInput.current) importInput.current.value = ""; }
  }
  const runAction = async (action: () => Promise<void>) => { try { setActionError(""); await action(); } catch (error) { setActionError(error instanceof Error ? error.message : "操作失敗"); } };

  if (loading) return <main className="loading-screen" aria-busy="true"><img src="/favicon.svg" width="44" height="44" alt="Subway" /><h1>subway.</h1><p><LoaderCircle size={17} className="spin" /> 正在載入你的支出空間…</p></main>;

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">跳至主要內容</a>
    {mobileNav && <button className="nav-scrim" aria-label="關閉導覽" onClick={() => setMobileNav(false)} />}
    <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
      <button className="wordmark" onClick={() => navigate("overview")} aria-label="Subway 首頁"><img src="/favicon.svg" width="36" height="36" alt="" /><span>subway<span className="brand-period">.</span></span></button>
      <div className="workspace-label"><span className="workspace-symbol"><Sprout size={17} /></span><span>我的支出空間<small>Make room for what matters.</small></span></div>
      <p className="nav-caption">日常管理</p>
      <nav aria-label="主要導覽">{NAV.map(item => <button key={item.id} className={`nav-item ${view === item.id ? "selected" : ""}`} onClick={() => navigate(item.id)} aria-current={view === item.id ? "page" : undefined}><item.icon size={19} /><span>{item.label}</span>{item.id === "items" && <span className="nav-count">{data.expenses.length}</span>}</button>)}</nav>
      <div className="sidebar-note"><span className="little-spark">✳</span><h3>小小整理，大大安心。</h3><p>從一筆訂閱開始，慢慢看清每個月的生活。</p><button onClick={() => setDialog({ kind: "expense" })}>加入第一筆支出 <ArrowUpRight size={15} /></button></div>
      <div className="sidebar-bottom"><button className={`nav-item ${view === "settings" ? "selected" : ""}`} onClick={() => navigate("settings")}><Settings2 size={19} /><span>偏好設定</span></button><button className="nav-item" onClick={() => setDialog({ kind: "help" })}><CircleHelp size={19} /><span>使用指南</span></button><div className="profile"><span className="avatar">{user ? user.name.slice(0, 1) : "S"}</span><span>{demo ? "探索 Subway" : user?.name || "我的空間"}<small>{demo ? "示範空間" : "個人帳戶"}</small></span>{user ? <a href={signOutUrl} target="_top" aria-label="登出" className="icon-button"><LogOut size={16} /></a> : <a href={signInUrl} target="_top" aria-label="登入" className="icon-button"><ArrowUpRight size={16} /></a>}</div></div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="開啟導覽" onClick={() => setMobileNav(true)}><Menu size={21} /></button><span>我的空間</span><ChevronRight size={13} /><strong>{NAV.find(n => n.id === view)?.label || "偏好設定"}</strong></div><div className="topbar-actions"><span className="sync-status"><span className={`sync-dot ${demo ? "demo-dot" : ""}`} />{loading ? "載入中" : saving ? "儲存中" : demo ? "示範模式" : ready ? "已同步" : "尚未連線"}</span><button className="icon-button notification-button" onClick={() => { setMonth(today.slice(0, 7)); navigate("calendar"); }} aria-label={`${reminders.length} 筆即將到期的付款`}><Bell size={19} />{reminders.length > 0 && <span className="notification-dot" />}</button><span className="topbar-divider" /><span className="topbar-avatar">{user ? user.name.slice(0, 1) : "S"}</span></div></header>

      <main id="main-content" className="main-content">
        {loadError && <div className="error-banner" role="alert"><span>{loadError}</span><button className="text-button" onClick={() => window.location.reload()}><RefreshCw size={14} /> 重新載入</button></div>}
        {demo && <div className="demo-banner"><span><span className="demo-pill">DEMO</span> 先看看，支出可以多清楚。<span className="demo-detail">以下金額與匯率皆為示範，可自由試用。</span></span>{user ? <button disabled={loading || !ready} onClick={() => { setDemo(false); setView("overview"); setToast("已切換至你的資料，示範資料不會被帶入。"); }}>開始記錄我的支出 <ArrowRight size={14} /></button> : <a href={signInUrl} target="_top">登入並開始記錄 <ArrowRight size={14} /></a>}</div>}
        <div className="page-heading"><div><p className="eyebrow">{view === "overview" ? "A LITTLE CLARITY, EVERY MONTH" : view === "calendar" ? "YOUR PAYMENTS, ON TIME" : view === "methods" ? "EVERY PAYMENT HAS A PLACE" : view === "items" ? "ALL YOUR RECURRING EXPENSES" : "MAKE SUBWAY YOURS"}</p><h1>{view === "overview" ? "每一筆支出，都心裡有數。" : view === "items" ? "所有固定支出" : view === "calendar" ? "付款日曆" : view === "methods" ? "付款方式" : "偏好設定"}</h1><p className="page-description">{view === "overview" ? "把訂閱、帳單和生活裡的固定開銷，放在一起看。" : view === "items" ? "從串流影音到年度保險，一個地方管理每一次付款。" : view === "calendar" ? "提前知道哪一天、哪筆費用、用哪個方式付款。" : view === "methods" ? "記住每筆支出從哪裡支付，少一點翻找，多一點清楚。" : "調整預算與估算匯率，也隨時帶走你的資料。"}</p></div><div className="heading-actions">{view === "calendar" ? <button className="btn btn-secondary" onClick={exportIcs}><Download size={16} /> 匯出日曆</button> : view === "settings" ? null : <button className="btn btn-primary" onClick={() => setDialog({ kind: view === "methods" ? "method" : "expense" })}><Plus size={17} /> {view === "methods" ? "新增付款方式" : "新增項目"}</button>}</div></div>

        {view !== "settings" && <div className="view-toolbar"><div className="segmented" aria-label="支出範圍">{([{ id: "all", label: "全部支出" }, { id: "personal", label: "個人生活" }, { id: "business", label: "工作與事業" }] as const).map(item => <button key={item.id} aria-pressed={scope === item.id} className={scope === item.id ? "active" : ""} onClick={() => setScope(item.id)}>{item.label}</button>)}</div>{(view === "overview" || view === "calendar") && <div className="month-selector"><button className="icon-button" onClick={() => moveMonth(-1)} aria-label="上一個月"><ChevronLeft size={17} /></button><span><CalendarDays size={15} />{month.slice(0, 4)} 年 {Number(month.slice(5))} 月</span><button className="icon-button" onClick={() => moveMonth(1)} aria-label="下一個月"><ChevronRight size={17} /></button></div>}{!demo && user && <button className="text-button demo-toggle" onClick={() => setDemo(true)}>查看示範</button>}</div>}

        {view === "overview" && <>
          <section className="stats-grid" aria-label="支出摘要"><div className="stat-card stat-featured"><div className="stat-top"><span>本月預計支出</span><span className="stat-icon"><CircleDollarSign size={19} /></span></div><div className="stat-value"><span>NT$</span>{formatTwd(forecast.twdMinor)}</div><div className="stat-bottom"><span className="stat-tag"><span className="small-dot" /> 已付款 NT$ {formatTwd(monthPaid)}</span>{forecast.missing > 0 && <span>＋{forecast.missing} 筆待補</span>}</div><p className="stat-help">已記錄付款 ＋ 本月尚待付款的預估</p><span className="stat-decoration" aria-hidden="true" /></div>
          <div className="stat-card"><div className="stat-top"><span>每月平均負擔</span><span className="stat-icon"><Layers3 size={19} /></span></div><div className="stat-value"><span>NT$</span>{formatTwd(monthly.twdMinor)}</div><div className="stat-bottom"><span className="neutral-tag">年繳、季繳已攤平</span>{monthly.missing > 0 && <span>＋{monthly.missing} 筆待補</span>}</div><p className="stat-help">依目前啟用項目計算，非當月實際扣款</p></div>
          <div className="stat-card"><div className="stat-top"><span>未來 30 天待付款</span><span className="stat-icon yellow"><CalendarClock size={19} /></span></div><div className="stat-value"><span>NT$</span>{formatTwd(upcomingTotal)}</div><div className="stat-bottom"><span className="warm-tag">{upcoming.length} 筆即將到來</span>{upcomingMissing > 0 && <span>＋{upcomingMissing} 筆待補</span>}</div><p className="stat-help">最近一筆：{upcoming[0] ? `${shortDate(upcoming[0].date)} ${upcoming[0].expense.name}` : "近期沒有待付款項目"}</p></div>
          <div className="stat-card"><div className="stat-top"><span>持續追蹤中</span><span className="stat-icon"><Sprout size={19} /></span></div><div className="stat-value">{active.length}<span className="value-unit">個項目</span></div><div className="stat-bottom"><span className="status-dot" />{active.filter(e => e.scope === "personal").length} 個人 · {active.filter(e => e.scope === "business").length} 工作</div><p className="stat-help">另有 {expenses.length - active.length} 個已暫停或取消</p></div></section>
          {(forecast.missing > 0 || monthly.missing > 0) && <div className="info-note">部分金額或換算匯率尚未填寫，總額暫未包含這些項目。<button onClick={() => navigate("settings")}>補上匯率 <ArrowRight size={13} /></button></div>}
          <section className="analysis-grid"><SpendingChart workspace={data} month={month} scope={scope} /><CategoryChart workspace={data} scope={scope} today={today} /></section>
          <section className="bottom-grid"><div className="panel upcoming-panel"><div className="panel-head"><div><p className="eyebrow">COMING UP</p><h2>接下來的付款</h2></div><button className="text-button" onClick={() => { setMonth(today.slice(0, 7)); navigate("calendar"); }}>查看日曆 <ArrowUpRight size={15} /></button></div><div className="upcoming-list">{upcoming.slice(0, 5).map(({ expense, date }) => <button className="upcoming-row" key={`${expense.id}-${date}`} onClick={() => selectPayment(expense, date)}><span className="date-box"><span>{Number(date.slice(5, 7))} 月</span><strong>{date.slice(8)}</strong></span><Brand expense={expense} /><span className="upcoming-name"><strong>{expense.name}</strong><small>{paymentLabel(data.methods.find(m => m.id === expense.paymentMethodId))}</small></span><span className="upcoming-amount"><strong>{formatMoney(expense.amountMinor, expense.currency)}</strong><small>{expense.amountMode === "variable" ? "預估金額" : expense.automatic ? "自動扣款" : "手動繳費"}</small></span><ChevronRight size={16} /></button>)}{upcoming.length === 0 && <div className="empty-state small"><CalendarDays size={32} /><h3>近期暫無待付款項目</h3><p>加入支出後，下一次付款就會出現在這裡。</p><button className="text-button" onClick={() => setDialog({ kind: "expense" })}>新增一筆 <Plus size={14} /></button></div>}</div></div>
          <div className="budget-panel"><div className="budget-illustration" aria-hidden="true"><Sprout size={40} /><span /><span /></div><p className="eyebrow">A LITTLE MORE BREATHING ROOM</p><h2>留點餘裕，給喜歡的生活。</h2><p>為全部支出設定月均預算，讓固定開銷保持在舒服的範圍。</p>{budget ? <><div className="budget-numbers"><strong>NT$ {formatTwd(fullMonthly.twdMinor)}</strong><span>/ {formatTwd(budget)}</span></div><div className="progress-track"><span className={budgetPercent > 100 ? "over-budget" : ""} style={{ width: `${Math.min(budgetPercent, 100)}%` }} /></div><div className="budget-caption"><span>已使用 {budgetPercent}%{fullMonthly.missing ? "（部分待補）" : ""}</span><span>{budgetPercent > 100 ? "已超出預算" : `餘裕 NT$ ${formatTwd(Math.max(0, budget - fullMonthly.twdMinor))}`}</span></div></> : <div className="budget-unset">給下個月一個舒服的預算。</div>}<button className="btn btn-budget" onClick={() => navigate("settings")}>{budget ? "調整月均預算" : "設定月均預算"}<ArrowRight size={16} /></button></div></section>
        </>}

        {view === "items" && <section className="panel items-panel"><div className="list-toolbar"><label className="search-box"><Search size={17} /><input placeholder="搜尋名稱、備註或付款方式…" value={search} onChange={event => setSearch(event.target.value)} aria-label="搜尋項目" /></label><div className="list-filters"><select aria-label="分類篩選" value={category} onChange={event => setCategory(event.target.value)}><option value="all">所有分類</option>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select><select aria-label="狀態篩選" value={status} onChange={event => setStatus(event.target.value)}><option value="all">所有狀態</option><option value="active">使用中</option><option value="paused">已暫停</option><option value="cancelled">已取消</option></select></div></div><div className="table-scroll"><table className="expense-table"><thead><tr><th>項目 / 分類</th><th>每期費用</th><th>付款週期</th><th>下次付款</th><th>付款方式</th><th>狀態</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{filtered.map(expense => { const state = expenseStatus(expense, today); const next = occurrences(expense, today, addMonths(today, 24)).find(date => !data.payments.some(p => p.expenseId === expense.id && p.scheduledOn === date)) ?? null; const monthlyValue = monthlyEquivalentMinor(expense, today); return <tr key={expense.id}><td><button className="item-name-button" onClick={() => setDialog({ kind: "expense", expense })}><Brand expense={expense} /><span><strong>{expense.name}</strong><small>{categoryOf(expense.category).label} · {expense.scope === "personal" ? "個人" : "工作"}</small></span></button></td><td><strong>{formatMoney(expense.amountMinor, expense.currency)}</strong><small>{expense.amountMode === "variable" ? "預估 · " : ""}月均 {formatMoney(monthlyValue, expense.currency)}</small></td><td>{intervalOf(expense.intervalMonths)}</td><td>{next ? <button className="date-link" onClick={() => selectPayment(expense, next)}>{next.replaceAll("-", "/")}</button> : "—"}</td><td className="method-cell"><CreditCard size={14} />{paymentLabel(data.methods.find(m => m.id === expense.paymentMethodId))}</td><td><span className={`status-pill status-${state}`}><span />{state === "active" ? "使用中" : state === "paused" ? "已暫停" : "已取消"}</span></td><td><div className="row-actions"><button className="icon-button" aria-label={`編輯 ${expense.name}`} onClick={() => setDialog({ kind: "expense", expense })}><Pencil size={15} /></button><button className="icon-button" disabled={saving} aria-label={`${state === "active" ? "暫停" : "啟用"} ${expense.name}`} onClick={() => toggleExpense(expense)}>{state === "active" ? <Pause size={15} /> : <Play size={15} />}</button>{state !== "cancelled" && <button className="icon-button" disabled={saving} aria-label={`取消 ${expense.name}`} onClick={() => setDialog({ kind: "cancel", expense })}><X size={15} /></button>}</div></td></tr>; })}</tbody></table></div>{filtered.length === 0 && <div className="empty-state"><Layers3 size={34} /><h3>{data.expenses.length ? "沒有符合的項目" : "從第一筆固定支出開始"}</h3><p>{data.expenses.length ? "試著調整搜尋條件或篩選範圍。" : "Netflix、手機帳單，或每年的保險都可以。"}</p><button className="btn btn-primary" onClick={() => setDialog({ kind: "expense" })}><Plus size={16} />新增項目</button></div>}<div className="table-footer"><span>共 {filtered.length} 個項目</span><span>外幣保留原額 · 月均費用依付款週期攤提</span></div></section>}

        {view === "calendar" && <><div className="calendar-summary"><span>本月預計 <strong>NT$ {formatTwd(forecast.twdMinor)}</strong>{forecast.missing > 0 && ` ＋${forecast.missing} 筆待補`}</span><span className="muted">點選日期查看項目，再記錄付款結果</span><button className="text-button" onClick={() => setMonth(today.slice(0, 7))}>回到本月</button></div><PaymentCalendar workspace={data} month={month} scope={scope} today={today} onSelect={selectPayment} /><p className="page-footnote">付款日是服務商扣款或帳單繳費的日期，信用卡帳單的銀行扣款日需另外安排。到期不會自動標為已付款。</p></>}

        {view === "methods" && <><div className="methods-grid">{data.methods.map(method => { const assigned = active.filter(e => e.paymentMethodId === method.id); const total = assigned.reduce((sum, expense) => sum + (toTwdMinor(monthlyEquivalentMinor(expense, today), expense.currency, data.settings.rates) ?? 0), 0); const unknown = assigned.filter(e => toTwdMinor(monthlyEquivalentMinor(e, today), e.currency, data.settings.rates) === null).length; const Icon = method.kind === "card" ? CreditCard : method.kind === "bank" ? Landmark : Wallet; return <article className={`method-card ${method.archived ? "method-archived" : ""}`} key={method.id}><div className="method-visual" style={{ background: method.color }}><div className="method-visual-top"><span>{KIND[method.kind]}</span><Icon size={26} /></div><div className="method-chip" aria-hidden="true" /><strong>{method.name}</strong><div className="method-digits">{method.last4 ? `••••  ••••  ••••  ${method.last4}` : "僅保存辨識名稱"}</div></div><div className="method-details"><div><p>{assigned.length} 個使用中項目 {method.archived && <span className="neutral-tag">已封存</span>}</p><strong>NT$ {formatTwd(total)} <small>/ 月均{unknown ? ` ＋${unknown} 筆待補` : ""}</small></strong></div><button className="icon-button" aria-label={`編輯付款方式 ${method.name}`} onClick={() => setDialog({ kind: "method", method })}><Pencil size={16} /></button></div><div className="method-associated">{assigned.slice(0, 3).map(e => <span key={e.id}><Brand expense={e} small />{e.name}</span>)}{assigned.length > 3 && <small>＋{assigned.length - 3} 個</small>}{!assigned.length && <span className="muted">尚無使用中的項目</span>}</div><div className="method-footer"><button className="text-button" disabled={saving} onClick={() => saveMethod({ ...method, archived: !method.archived }).catch(error => setToast(error.message))}><Archive size={14} />{method.archived ? "解除封存" : "封存付款方式"}</button><span>僅記錄名稱與末四碼</span></div></article>; })}<button className="add-method-card" onClick={() => setDialog({ kind: "method" })}><span><Plus size={25} /></span><strong>新增付款方式</strong><small>信用卡、銀行帳戶或第三方支付</small></button></div><div className="info-note"><ShieldCheck size={17} />這裡只記錄付款方式的辨識資訊，不儲存完整卡號、帳號或付款密碼。</div></>}

        {view === "settings" && <SettingsPanel workspace={data} saving={saving} onSave={async settings => { await persist({ ...data, settings }); }} onExport={exportData} onImport={() => importInput.current?.click()} onCalendar={exportIcs} />}
        <input ref={importInput} type="file" accept="application/json,.json" className="sr-only" aria-label="匯入 JSON 備份" onChange={event => { const file = event.target.files?.[0]; if (file) void importData(file); }} />
        <footer className="app-footer"><span>subway. <span>讓生活，多一點餘裕。</span></span><span>{data.expenses.some(e => e.currency !== "TWD") ? "外幣合計採手動預估匯率 · 非即時行情" : "金額以 TWD 顯示 · 付款日期依台北時區"}</span><a href="https://github.com/easysun/subway" target="_blank" rel="noopener noreferrer">GitHub <ArrowUpRight size={12} /></a></footer>
      </main>
    </div>

    {dialog?.kind === "expense" && <ExpenseForm expense={dialog.expense} methods={data.methods} today={today} onSave={saveExpense} onClose={() => setDialog(null)} />}
    {dialog?.kind === "method" && <MethodForm method={dialog.method} onSave={saveMethod} onClose={() => setDialog(null)} />}
    {dialog?.kind === "payment" && <PaymentForm expense={dialog.expense} scheduledOn={dialog.date} methods={data.methods} rates={data.settings.rates} today={today} onSave={savePayment} onClose={() => setDialog(null)} />}
    {dialog?.kind === "paid" && <Modal title="付款紀錄" subtitle="這是你手動記錄的付款結果。" onClose={() => setDialog(null)}><div className="record-summary"><Brand expense={{ name: dialog.payment.expenseName, category: dialog.payment.category }} /><h3>{dialog.payment.expenseName}</h3><strong>{formatMoney(dialog.payment.amountMinor, dialog.payment.currency)}</strong><span className="status-pill status-active"><Check size={13} />已記錄付款</span></div><dl className="record-details"><div><dt>原訂付款日</dt><dd>{dialog.payment.scheduledOn}</dd></div><div><dt>實際付款日</dt><dd>{dialog.payment.paidOn}</dd></div><div><dt>付款方式</dt><dd>{dialog.payment.paymentMethodName || "未指定"}</dd></div><div><dt>{dialog.payment.currency === "TWD" || dialog.payment.settledTwdMinor != null ? "新台幣金額" : "新台幣估算"}</dt><dd>{paymentTwdMinor(dialog.payment) === null ? "缺少換算匯率" : `NT$ ${formatTwd(paymentTwdMinor(dialog.payment)!)}`}</dd></div></dl>{actionError && <p role="alert" className="form-error">{actionError}</p>}<div className="modal-actions"><button className="btn btn-secondary" disabled={saving} onClick={() => runAction(async () => { await persist({ ...data, payments: data.payments.filter(p => p.id !== dialog.payment.id) }); setDialog(null); })}>撤銷這筆紀錄</button><button className="btn btn-primary" onClick={() => setDialog(null)}>完成</button></div><p className="field-help">撤銷只會移除此紀錄，不會向銀行或服務商退款。</p></Modal>}
    {dialog?.kind === "cancel" && <Modal title={`取消追蹤 ${dialog.expense.name}？`} subtitle="從今天起停止產生預定付款，過去的付款紀錄會保留。" onClose={() => setDialog(null)}><p className="modal-copy">若要停止服務商扣款，請另外到該服務取消訂閱。Subway 只管理你的支出紀錄。</p>{actionError && <p className="form-error" role="alert">{actionError}</p>}<div className="modal-actions"><button className="btn btn-secondary" onClick={() => setDialog(null)}>繼續追蹤</button><button className="btn btn-danger" disabled={saving} onClick={() => runAction(() => saveExpense({ ...dialog.expense, cancelledFrom: today }))}>確認取消追蹤</button></div></Modal>}
    {dialog?.kind === "import" && <Modal title="還原備份資料" subtitle={`備份包含 ${dialog.workspace.expenses.length} 個項目、${dialog.workspace.methods.length} 種付款方式與 ${dialog.workspace.payments.length} 筆付款紀錄。`} onClose={() => setDialog(null)}><p className="modal-copy">這會取代目前{demo ? "示範空間" : "帳戶"}的資料。建議先匯出目前資料，保留一份備份。</p>{actionError && <p className="form-error" role="alert">{actionError}</p>}<div className="modal-actions"><button className="btn btn-secondary" onClick={exportData}>先匯出目前資料</button><button className="btn btn-primary" disabled={saving} onClick={() => runAction(async () => { await persist(dialog.workspace); setDialog(null); })}>確認還原</button></div></Modal>}
    {dialog?.kind === "help" && <Modal title="一起把固定支出整理好" subtitle="幾分鐘，換來每個月的清楚。" onClose={() => setDialog(null)}><div className="help-steps"><section><span>01</span><div><h3>加入每筆重複發生的費用</h3><p>選擇固定或浮動金額、付款週期、第一次付款日，以及付款方式。稅費日期依你的帳單填寫。</p></div></section><section><span>02</span><div><h3>看見兩種不同的負擔</h3><p>「本月預計支出」依日期計算；「每月平均負擔」將季繳、年繳攤平。未知金額及未設定的匯率會另行標示。</p></div></section><section><span>03</span><div><h3>付款後，記下一筆</h3><p>在日曆點選項目，填入實際付款金額與日期。系統不會操作你的銀行或信用卡。</p></div></section><section><span>04</span><div><h3>讓提醒跟著你的日曆</h3><p>匯出未來 12 個月的 ICS 日曆，匯入你常用的行事曆。這是靜態快照，修改項目後需重新匯出；提醒由行事曆提供。</p></div></section></div><div className="modal-actions"><button className="btn btn-primary" onClick={() => setDialog(null)}>開始整理</button></div></Modal>}
    {toast && <div className="toast" role="status"><Check size={17} /><span>{toast}</span><button aria-label="關閉通知" onClick={() => setToast("")}><X size={14} /></button></div>}
  </div>;
}

function SettingsPanel({ workspace, saving, onSave, onExport, onImport, onCalendar }: { workspace: Workspace; saving: boolean; onSave: (settings: Workspace["settings"]) => Promise<void>; onExport: () => void; onImport: () => void; onCalendar: () => void }) {
  const [budget, setBudget] = useState(workspace.settings.budgetMinor === null ? "" : String(workspace.settings.budgetMinor / 100));
  const [rates, setRates] = useState({ USD: workspace.settings.rates.USD?.toString() ?? "", JPY: workspace.settings.rates.JPY?.toString() ?? "", EUR: workspace.settings.rates.EUR?.toString() ?? "" });
  const [rateDate, setRateDate] = useState(workspace.settings.rateDate);
  const [error, setError] = useState("");
  useEffect(() => { setBudget(workspace.settings.budgetMinor === null ? "" : String(workspace.settings.budgetMinor / 100)); setRates({ USD: workspace.settings.rates.USD?.toString() ?? "", JPY: workspace.settings.rates.JPY?.toString() ?? "", EUR: workspace.settings.rates.EUR?.toString() ?? "" }); setRateDate(workspace.settings.rateDate); }, [workspace.settings]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    try { await onSave({ budgetMinor: budget.trim() === "" ? null : Math.round(Number(budget) * 100), rates: { TWD: 1, USD: rates.USD === "" ? null : Number(rates.USD), JPY: rates.JPY === "" ? null : Number(rates.JPY), EUR: rates.EUR === "" ? null : Number(rates.EUR) }, rateDate }); }
    catch (e) { setError(e instanceof Error ? e.message : "儲存失敗"); }
  }
  return <div className="settings-grid"><form className="panel settings-panel" onSubmit={submit}><div className="panel-head"><div><p className="eyebrow">YOUR PREFERENCES</p><h2>預算與幣別</h2></div><Settings2 size={20} /></div><div className="settings-body"><label className="field">全部支出的月均預算（TWD）<input className="input" type="number" min="0" step="1" value={budget} onChange={e => setBudget(e.target.value)} placeholder="例如 20000" /><span className="field-help">用來和全部啟用項目的月均負擔比較。留空即可停用。</span></label><div className="form-divider" /><h3>手動預估匯率</h3><p className="field-help">輸入 1 單位外幣約等於多少新台幣。僅用於支出估算，不是即時行情；留空的外幣不會合併進 TWD 總額。</p><div className="form-grid">{(["USD", "JPY", "EUR"] as const).map(currency => <label className="field" key={currency}>1 {currency} ≈ TWD<input type="number" className="input" value={rates[currency]} min="0.000001" max="1000000" step="any" onChange={e => setRates({ ...rates, [currency]: e.target.value })} placeholder="未設定" /></label>)}<label className="field">匯率參考日期<input className="input" type="date" required value={rateDate} onChange={e => setRateDate(e.target.value)} /></label></div><p className="field-help">修改匯率不會重算已記錄付款的歷史換算金額。</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="settings-save"><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}儲存設定</button></div></div></form><div><section className="panel settings-panel"><div className="panel-head"><div><p className="eyebrow">YOUR DATA, ALWAYS YOURS</p><h2>資料與備份</h2></div><ShieldCheck size={20} /></div><div className="settings-body"><p>隨時匯出完整項目、付款方式與付款紀錄。備份中包含你的財務資訊，請妥善保存。</p><button className="settings-action" onClick={onExport}><Download size={20} /><span><strong>匯出 JSON 備份</strong><small>保留完整資料，可再次匯入</small></span><ArrowUpRight size={16} /></button><button className="settings-action" onClick={onImport}><Upload size={20} /><span><strong>從備份還原</strong><small>預覽筆數後確認取代目前資料</small></span><ArrowUpRight size={16} /></button><button className="settings-action" onClick={onCalendar}><CalendarDays size={20} /><span><strong>匯出付款日曆</strong><small>未來 12 個月的 ICS 靜態快照</small></span><ArrowUpRight size={16} /></button></div></section><div className="settings-note"><Sprout size={24} /><p>少一點意外的扣款，<br />多一點從容的日常。</p></div></div></div>;
}
