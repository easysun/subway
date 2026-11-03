import { addDays, addMonths, occurrences, validateWorkspace, type Workspace, type Scope } from "./domain.ts";

export function serializeBackup(workspace: Workspace): string {
  return JSON.stringify({ application: "Subway", exportedAt: new Date().toISOString(), workspace }, null, 2);
}
export function parseBackup(text: string): Workspace {
  if (new TextEncoder().encode(text).byteLength > 4_194_304) throw new Error("備份檔案不可超過 4 MB。");
  const parsed = JSON.parse(text);
  const workspace = validateWorkspace(parsed?.workspace ?? parsed);
  // Raw backups may contain formatting; only the normalized API payload has the 1 MiB write limit.
  if (new TextEncoder().encode(JSON.stringify({ workspace, revision: 1_000_000_000 })).byteLength > 1_048_576) throw new Error("備份的資料內容超過 1 MB 上限，請減少紀錄後再還原。");
  return workspace;
}

const escape = (value: string) => value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
function fold(line: string): string {
  let result = "", current = "", bytes = 0;
  for (const character of line) {
    const size = new TextEncoder().encode(character).length;
    if (bytes + size > 73) { result += current + "\r\n "; current = ""; bytes = 1; }
    current += character; bytes += size;
  }
  return result + current;
}
/** A downloadable snapshot, not a live calendar subscription. */
export function exportCalendar(workspace: Workspace, today: string, scope: "all" | Scope = "all"): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Subway//Recurring expenses//ZH-TW", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Subway 付款提醒"];
  const paid = new Set(workspace.payments.map(p => `${p.expenseId}:${p.scheduledOn}`));
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  for (const expense of workspace.expenses.filter(e => scope === "all" || e.scope === scope)) {
    for (const date of occurrences(expense, today, addMonths(today, 12))) {
      if (paid.has(`${expense.id}:${date}`)) continue;
      const amount = expense.amountMinor === null ? "金額待補" : `${expense.currency} ${(expense.amountMinor / (expense.currency === "JPY" ? 1 : 100)).toFixed(expense.currency === "JPY" ? 0 : 2)}`;
      lines.push("BEGIN:VEVENT", `UID:${expense.id}-${date}@sub.ages.tw`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${date.replaceAll("-", "")}`, `DTEND;VALUE=DATE:${addDays(date, 1).replaceAll("-", "")}`, `SUMMARY:${escape(`${expense.name} · ${amount}`)}`, `DESCRIPTION:${escape(`預定付款提醒。${expense.amountMode === "variable" ? "金額為預估。" : ""}請確認是否已付款。\n${expense.notes}\n此日曆為匯出時的快照，不會自動更新。`)}`);
      lines.push("BEGIN:VALARM", expense.reminderDays === 0 ? "TRIGGER:PT0S" : `TRIGGER:-P${expense.reminderDays}D`, "ACTION:DISPLAY", `DESCRIPTION:${escape(`${expense.name} 即將付款`)}`, "END:VALARM");
      lines.push("END:VEVENT");
    }
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
