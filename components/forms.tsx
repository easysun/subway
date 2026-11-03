'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { LoaderCircle, X } from 'lucide-react';
import { CATEGORIES, CURRENCIES, INTERVALS } from '../lib/domain';
import type { Currency, Expense, Payment, PaymentMethod } from '../lib/domain';
import { newRecordId } from '../lib/id';

type ModalProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
};

export function Modal({ title, subtitle, children, onClose, busy = false }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdropPress = useRef(false);
  const headingId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    if (!dialog.open) dialog.showModal();
    document.body.style.overflow = 'hidden';
    dialog.querySelector<HTMLElement>('[data-initial-focus]')?.focus();

    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby={headingId}
      aria-describedby={subtitle ? descriptionId : undefined}
      aria-busy={busy || undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onPointerDown={(event) => {
        backdropPress.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && backdropPress.current && !busy) {
          onClose();
        }
        backdropPress.current = false;
      }}
    >
      <div className="modal-inner">
        <div className="modal-head">
          <div>
            <h2 id={headingId}>{title}</h2>
            {subtitle ? <p id={descriptionId}>{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className="modal-close"
            aria-label="關閉視窗"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : '暫時無法儲存，請稍後再試。';
}

function useFormSave(onClose: () => void) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);

  async function save(action: () => Promise<void>) {
    if (savingRef.current) return;
    savingRef.current = true;
    setPending(true);
    setError(null);
    try {
      await action();
      onClose();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      savingRef.current = false;
      setPending(false);
    }
  }

  function close() {
    if (!savingRef.current) onClose();
  }

  return { pending, error, setError, save, close };
}

function currencyScale(currency: Currency) {
  return currency === 'JPY' ? 1 : 100;
}

function moneyInput(minor: number | null | undefined, currency: Currency): string {
  if (minor == null) return '';
  if (currency === 'JPY') return String(minor);
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`;
}

function parseMoney(value: string, currency: Currency, label: string): number {
  const raw = value.trim();
  if (!raw) throw new Error(`請填寫${label}。`);
  const valid = currency === 'JPY' ? /^\d+$/ : /^\d+(?:\.\d{1,2})?$/;
  if (!valid.test(raw)) {
    throw new Error(
      currency === 'JPY'
        ? `${label}請輸入零或正整數，日圓不使用小數。`
        : `${label}請輸入零或正數，最多保留兩位小數。`,
    );
  }
  const [whole, fraction = ''] = raw.split('.');
  const minor =
    Number(whole) * currencyScale(currency) +
    (currency === 'JPY' ? 0 : Number(fraction.padEnd(2, '0')));
  if (!Number.isSafeInteger(minor) || minor < 0 || minor > 1_000_000_000_000) {
    throw new Error(`${label}超出可儲存的範圍，請確認金額。`);
  }
  return minor;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normaliseWebsite(value: string): string {
  const raw = value.trim();
  if (!raw) return '';
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      throw new Error('Invalid website');
    }
    return url.toString();
  } catch {
    throw new Error('請輸入有效的網站網址，例如 https://example.com。');
  }
}

function methodLabel(method: PaymentMethod): string {
  return `${method.name}${method.last4 ? ` · ${method.last4}` : ''}${method.archived ? '（已封存）' : ''}`;
}

function FormError({ error }: { error: string | null }) {
  return error ? <p className="form-error" role="alert">{error}</p> : null;
}

function FormActions({
  pending,
  onClose,
  label,
}: {
  pending: boolean;
  onClose: () => void;
  label: string;
}) {
  return (
    <div className="modal-actions">
      <button type="button" className="btn btn-secondary" onClick={onClose} disabled={pending}>
        取消
      </button>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : null}
        {pending ? '儲存中…' : label}
      </button>
    </div>
  );
}

type ExpenseFormProps = {
  expense?: Expense;
  methods: PaymentMethod[];
  today: string;
  onSave: (expense: Expense) => Promise<void>;
  onClose: () => void;
};

export function ExpenseForm({ expense, methods, today, onSave, onClose }: ExpenseFormProps) {
  const id = useId();
  const [recordId] = useState(() => expense?.id ?? newRecordId());
  const submission = useFormSave(onClose);
  const [name, setName] = useState(expense?.name ?? '');
  const [scope, setScope] = useState<Expense['scope']>(expense?.scope ?? 'personal');
  const [category, setCategory] = useState<Expense['category']>(expense?.category ?? 'software');
  const [currency, setCurrency] = useState<Currency>(expense?.currency ?? 'TWD');
  const [amount, setAmount] = useState(moneyInput(expense?.amountMinor, expense?.currency ?? 'TWD'));
  const [amountMode, setAmountMode] = useState<Expense['amountMode']>(expense?.amountMode ?? 'fixed');
  const [intervalMonths, setIntervalMonths] = useState<Expense['intervalMonths']>(expense?.intervalMonths ?? 1);
  const [firstDueOn, setFirstDueOn] = useState(expense?.firstDueOn ?? today);
  const [monthEnd, setMonthEnd] = useState(expense?.monthEnd ?? false);
  const [paymentMethodId, setPaymentMethodId] = useState(expense?.paymentMethodId ?? '');
  const [automatic, setAutomatic] = useState(expense?.automatic ?? false);
  const [reminderDays, setReminderDays] = useState(expense?.reminderDays ?? 3);
  const [notes, setNotes] = useState(expense?.notes ?? '');
  const [website, setWebsite] = useState(expense?.website ?? '');
  const availableMethods = methods.filter((method) => !method.archived || method.id === paymentMethodId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submission.pending) return;
    submission.setError(null);
    try {
      const cleanName = name.trim();
      if (!cleanName) throw new Error('請填寫費用名稱。');
      if (!validDate(firstDueOn)) throw new Error('請選擇有效的首次到期日。');
      const amountMinor = amountMode === 'variable' && !amount.trim()
        ? null
        : parseMoney(amount, currency, amountMode === 'variable' ? '預估金額' : '固定金額');
      const nextExpense: Expense = {
        id: recordId,
        name: cleanName,
        category,
        scope,
        amountMinor,
        currency,
        amountMode,
        intervalMonths,
        firstDueOn,
        monthEnd,
        paymentMethodId: paymentMethodId || null,
        automatic,
        reminderDays,
        notes: notes.trim(),
        website: normaliseWebsite(website),
        pauses: expense?.pauses ?? [],
        cancelledFrom: expense?.cancelledFrom ?? null,
      };
      await submission.save(() => onSave(nextExpense));
    } catch (reason) {
      submission.setError(errorMessage(reason));
    }
  }

  return (
    <Modal
      title={expense ? '編輯定期費用' : '新增定期費用'}
      subtitle="把每次到期日、金額與付款方式放在一起。"
      onClose={submission.close}
      busy={submission.pending}
    >
      <form onSubmit={handleSubmit} noValidate>
        <fieldset className="form-grid" disabled={submission.pending} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div className="field span-2">
            <label htmlFor={`${id}-name`}>費用名稱</label>
            <input id={`${id}-name`} className="input" data-initial-focus value={name} onChange={(event) => setName(event.target.value)} placeholder="例如 Netflix、房租、營業稅" maxLength={120} required autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor={`${id}-scope`}>使用範圍</label>
            <select id={`${id}-scope`} className="select" value={scope} onChange={(event) => setScope(event.target.value as Expense['scope'])}>
              <option value="personal">個人</option>
              <option value="business">商業</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${id}-category`}>分類</label>
            <select id={`${id}-category`} className="select" value={category} onChange={(event) => setCategory(event.target.value as Expense['category'])}>
              {CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${id}-amount-mode`}>金額類型</label>
            <select id={`${id}-amount-mode`} className="select" value={amountMode} onChange={(event) => setAmountMode(event.target.value as Expense['amountMode'])}>
              <option value="fixed">固定金額</option>
              <option value="variable">每期金額不同</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${id}-currency`}>幣別</label>
            <select id={`${id}-currency`} className="select" value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}>
              {CURRENCIES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${id}-amount`}>{amountMode === 'variable' ? '每期預估金額（選填）' : '每期固定金額'}</label>
            <input id={`${id}-amount`} className="input" inputMode={currency === 'JPY' ? 'numeric' : 'decimal'} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={currency === 'JPY' ? '0' : '0.00'} required={amountMode === 'fixed'} aria-describedby={`${id}-amount-help`} autoComplete="off" />
            <p className="field-help" id={`${id}-amount-help`}>
              {amountMode === 'variable' ? '可先留白，付款時再記錄實際金額。' : '填寫每個繳費週期的金額。'}
              {currency === 'JPY' ? ' 日圓請輸入整數。' : ''}
            </p>
          </div>
          <div className="field">
            <label htmlFor={`${id}-interval`}>繳費週期</label>
            <select id={`${id}-interval`} className="select" value={intervalMonths} onChange={(event) => setIntervalMonths(Number(event.target.value) as Expense['intervalMonths'])}>
              {INTERVALS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${id}-first-due`}>首次到期日</label>
            <input id={`${id}-first-due`} className="input" type="date" value={firstDueOn} onChange={(event) => setFirstDueOn(event.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor={`${id}-reminder`}>提前提醒</label>
            <select id={`${id}-reminder`} className="select" value={reminderDays} onChange={(event) => setReminderDays(Number(event.target.value))}>
              {[0, 1, 3, 7, 14, 30].map((days) => <option key={days} value={days}>{days === 0 ? '到期當天' : `${days} 天前`}</option>)}
            </select>
          </div>
          <div className="field span-2">
            <label className="check-row" htmlFor={`${id}-month-end`}>
              <input id={`${id}-month-end`} type="checkbox" checked={monthEnd} onChange={(event) => setMonthEnd(event.target.checked)} />
              固定於月底到期
            </label>
            <p className="field-help">首次到期日之後，每個繳費月份都使用當月最後一天。</p>
          </div>
          <div className="field span-2">
            <label htmlFor={`${id}-method`}>預設付款方式</label>
            <select id={`${id}-method`} className="select" value={paymentMethodId} onChange={(event) => setPaymentMethodId(event.target.value)}>
              <option value="">尚未指定</option>
              {availableMethods.map((method) => <option key={method.id} value={method.id}>{methodLabel(method)}</option>)}
            </select>
            {methods.every((method) => method.archived) ? <p className="field-help">可以稍後至「付款方式」新增，再回來指定。</p> : null}
          </div>
          <div className="field span-2">
            <label className="check-row" htmlFor={`${id}-automatic`}>
              <input id={`${id}-automatic`} type="checkbox" checked={automatic} onChange={(event) => setAutomatic(event.target.checked)} />
              已向商家設定自動扣款
            </label>
            <p className="field-help">此項僅作標記，Subway 不會代為扣款或開通自動付款。</p>
          </div>
          <div className="field span-2">
            <label htmlFor={`${id}-website`}>管理網站（選填）</label>
            <input id={`${id}-website`} className="input" inputMode="url" value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://example.com" maxLength={2048} autoComplete="url" />
          </div>
          <div className="field span-2">
            <label htmlFor={`${id}-notes`}>備註（選填）</label>
            <textarea id={`${id}-notes`} className="input" value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={2000} placeholder="方案、分攤方式，或其他想記住的事…" />
          </div>
        </fieldset>
        <FormError error={submission.error} />
        <FormActions pending={submission.pending} onClose={submission.close} label={expense ? '儲存變更' : '新增費用'} />
      </form>
    </Modal>
  );
}

const METHOD_COLORS = [
  { value: '#F3CB54', label: '暖黃色' },
  { value: '#AFA1D5', label: '紫色' },
  { value: '#8CBFA6', label: '綠色' },
  { value: '#85ACD1', label: '藍色' },
  { value: '#DFA18B', label: '珊瑚色' },
  { value: '#A1A6AE', label: '灰色' },
];

type MethodFormProps = {
  method?: PaymentMethod;
  onSave: (method: PaymentMethod) => Promise<void>;
  onClose: () => void;
};

export function MethodForm({ method, onSave, onClose }: MethodFormProps) {
  const id = useId();
  const [recordId] = useState(() => method?.id ?? newRecordId());
  const submission = useFormSave(onClose);
  const [name, setName] = useState(method?.name ?? '');
  const [kind, setKind] = useState<PaymentMethod['kind']>(method?.kind ?? 'card');
  const [last4, setLast4] = useState(method?.last4 ?? '');
  const safeExistingColor = method?.color && /^#[a-f\d]{6}$/i.test(method.color) ? method.color : null;
  const [color, setColor] = useState(safeExistingColor ?? METHOD_COLORS[0].value);
  const colors = safeExistingColor && !METHOD_COLORS.some((item) => item.value.toLowerCase() === safeExistingColor.toLowerCase())
    ? [...METHOD_COLORS, { value: safeExistingColor, label: '目前的顏色' }]
    : METHOD_COLORS;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submission.pending) return;
    submission.setError(null);
    try {
      if (!name.trim()) throw new Error('請填寫付款方式名稱。');
      if (last4 && !/^\d{4}$/.test(last4)) throw new Error('識別末四碼請填寫完整四位數字，或留白。');
      const nextMethod: PaymentMethod = {
        id: recordId,
        name: name.trim(),
        kind,
        last4,
        color,
        archived: method?.archived ?? false,
      };
      await submission.save(() => onSave(nextMethod));
    } catch (reason) {
      submission.setError(errorMessage(reason));
    }
  }

  return (
    <Modal
      title={method ? '編輯付款方式' : '新增付款方式'}
      subtitle="用熟悉的名稱，認出每一筆費用由哪裡支付。"
      onClose={submission.close}
      busy={submission.pending}
    >
      <form onSubmit={handleSubmit} noValidate>
        <fieldset className="form-grid" disabled={submission.pending} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div className="field span-2">
            <label htmlFor={`${id}-name`}>付款方式名稱</label>
            <input id={`${id}-name`} className="input" data-initial-focus value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="例如 國泰 CUBE 卡、公司銀行帳戶" required autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor={`${id}-kind`}>類型</label>
            <select id={`${id}-kind`} className="select" value={kind} onChange={(event) => setKind(event.target.value as PaymentMethod['kind'])}>
              <option value="card">信用卡／金融卡</option>
              <option value="bank">銀行帳戶</option>
              <option value="wallet">電子錢包</option>
              <option value="other">其他</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${id}-last4`}>{kind === 'card' ? '卡號' : kind === 'bank' ? '帳號' : '識別'}末四碼（選填）</label>
            <input id={`${id}-last4`} className="input" inputMode="numeric" value={last4} onChange={(event) => setLast4(event.target.value.replace(/\D/g, '').slice(0, 4))} maxLength={4} placeholder="1234" aria-describedby={`${id}-privacy`} autoComplete="off" />
          </div>
          <p className="field-help span-2" id={`${id}-privacy`}>只需名稱與末四碼，請勿輸入完整卡號、銀行帳號或密碼。</p>
          <div className="field span-2">
            <span id={`${id}-color-label`}>標籤顏色</span>
            <div className="color-options" role="group" aria-labelledby={`${id}-color-label`}>
              {colors.map((item) => {
                const selected = item.value.toLowerCase() === color.toLowerCase();
                return (
                  <button
                    key={item.value}
                    type="button"
                    className={`color-option${selected ? ' selected' : ''}`}
                    style={{ backgroundColor: item.value }}
                    aria-label={item.label}
                    aria-pressed={selected}
                    title={item.label}
                    onClick={() => setColor(item.value)}
                  >
                    <span aria-hidden="true">{selected ? '✓' : ''}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </fieldset>
        <FormError error={submission.error} />
        <FormActions pending={submission.pending} onClose={submission.close} label={method ? '儲存變更' : '新增付款方式'} />
      </form>
    </Modal>
  );
}

type PaymentFormProps = {
  expense: Expense;
  scheduledOn: string;
  methods: PaymentMethod[];
  rates: Record<Currency, number | null>;
  today: string;
  onSave: (payment: Payment) => Promise<void>;
  onClose: () => void;
};

export function PaymentForm({ expense, scheduledOn, methods, rates, today, onSave, onClose }: PaymentFormProps) {
  const id = useId();
  const [recordId] = useState(() => newRecordId());
  const submission = useFormSave(onClose);
  const [amount, setAmount] = useState(moneyInput(expense.amountMinor, expense.currency));
  const [paidOn, setPaidOn] = useState(today);
  const [paymentMethodId, setPaymentMethodId] = useState(expense.paymentMethodId ?? '');
  const [settledTwd, setSettledTwd] = useState('');
  const foreignCurrency = expense.currency !== 'TWD';
  const rawRate = expense.currency === 'TWD' ? 1 : rates[expense.currency];
  const fxRate = typeof rawRate === 'number' && Number.isFinite(rawRate) && rawRate > 0 ? rawRate : null;
  const availableMethods = methods.filter((method) => !method.archived || method.id === paymentMethodId);
  let estimatedTwd: string | null = null;
  if (foreignCurrency && fxRate != null && amount.trim()) {
    try {
      const minor = parseMoney(amount, expense.currency, '實際付款金額');
      const estimate = (minor / currencyScale(expense.currency)) * fxRate;
      if (Number.isFinite(estimate)) {
        estimatedTwd = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 }).format(estimate);
      }
    } catch {
      // The submit handler reports incomplete or invalid monetary input.
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submission.pending) return;
    submission.setError(null);
    try {
      if (!validDate(scheduledOn)) throw new Error('這筆費用的到期日無效，請關閉視窗後重新選擇。');
      if (!validDate(paidOn)) throw new Error('請選擇有效的付款日期。');
      if (paidOn > today) throw new Error('付款日期不可晚於今天。');
      const amountMinor = parseMoney(amount, expense.currency, '實際付款金額');
      const settledTwdMinor = foreignCurrency && settledTwd.trim()
        ? parseMoney(settledTwd, 'TWD', '實際台幣入帳金額')
        : null;
      const selectedMethod = methods.find((method) => method.id === paymentMethodId);
      const payment: Payment = {
        id: recordId,
        expenseId: expense.id,
        expenseName: expense.name,
        category: expense.category,
        scope: expense.scope,
        scheduledOn,
        paidOn,
        amountMinor,
        currency: expense.currency,
        paymentMethodId: paymentMethodId || null,
        paymentMethodName: selectedMethod?.name ?? '未指定',
        fxRate,
        settledTwdMinor,
      };
      await submission.save(() => onSave(payment));
    } catch (reason) {
      submission.setError(errorMessage(reason));
    }
  }

  return (
    <Modal
      title="記錄付款"
      subtitle="只記錄付款結果，不會執行扣款。"
      onClose={submission.close}
      busy={submission.pending}
    >
      <form onSubmit={handleSubmit} noValidate>
        <fieldset className="form-grid" disabled={submission.pending} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div className="field span-2">
            <strong>{expense.name}</strong>
            <p className="field-help">本期到期日：{scheduledOn.replaceAll('-', '/')}</p>
          </div>
          <div className="field">
            <label htmlFor={`${id}-amount`}>實際付款金額（{expense.currency}）</label>
            <input id={`${id}-amount`} className="input" data-initial-focus inputMode={expense.currency === 'JPY' ? 'numeric' : 'decimal'} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={expense.currency === 'JPY' ? '0' : '0.00'} required autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor={`${id}-paid-on`}>付款日期</label>
            <input id={`${id}-paid-on`} className="input" type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} max={today} required />
          </div>
          <div className="field span-2">
            <label htmlFor={`${id}-method`}>此次付款方式</label>
            <select id={`${id}-method`} className="select" value={paymentMethodId} onChange={(event) => setPaymentMethodId(event.target.value)}>
              <option value="">尚未指定</option>
              {availableMethods.map((method) => <option key={method.id} value={method.id}>{methodLabel(method)}</option>)}
            </select>
          </div>
          {foreignCurrency ? (
            <>
              <div className="field span-2">
                <label htmlFor={`${id}-settled-twd`}>實際台幣入帳金額（選填）</label>
                <input id={`${id}-settled-twd`} className="input" inputMode="decimal" value={settledTwd} onChange={(event) => setSettledTwd(event.target.value)} placeholder="NT$ 0.00" autoComplete="off" aria-describedby={`${id}-settled-help`} />
                <p className="field-help" id={`${id}-settled-help`}>可填入帳單上包含手續費的台幣金額，統計將優先採用此金額。</p>
              </div>
              <p className="field-help span-2">
                {fxRate == null
                  ? '目前沒有可用匯率。你仍可記錄原幣付款，或填寫實際台幣入帳金額。'
                  : `${estimatedTwd != null ? `依目前參考匯率估算約 NT$ ${estimatedTwd}。` : ''}1 ${expense.currency} ≈ NT$ ${new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 4 }).format(fxRate)}。此為目前參考匯率，實際入帳金額可能不同。`}
              </p>
            </>
          ) : null}
        </fieldset>
        <FormError error={submission.error} />
        <FormActions pending={submission.pending} onClose={submission.close} label="儲存付款紀錄" />
      </form>
    </Modal>
  );
}
