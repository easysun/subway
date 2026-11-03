import { expenseStatus, type Expense } from "./domain.ts";

export function toggleExpenseLifecycle(expense: Expense, today: string): Expense {
  const status = expenseStatus(expense, today);
  if (status === "active") return { ...expense, pauses: [...expense.pauses, { from: today }] };
  const pauses = expense.pauses.flatMap(pause => {
    if (pause.from > today || (pause.untilExclusive && pause.untilExclusive <= today)) return [pause];
    return pause.from < today ? [{ ...pause, untilExclusive: today }] : [];
  });
  if (status === "cancelled" && expense.cancelledFrom && expense.cancelledFrom < today && !pauses.some(p => p.from <= expense.cancelledFrom! && p.untilExclusive && p.untilExclusive >= today)) {
    pauses.push({ from: expense.cancelledFrom, untilExclusive: today });
  }
  return { ...expense, pauses, cancelledFrom: status === "cancelled" ? null : expense.cancelledFrom };
}
