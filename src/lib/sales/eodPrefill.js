const metrics = [
  ["dialed", "Calls dialed"], ["connected", "Calls connected"],
  ["interested", "Interested / follow-up calls"], ["non_interested", "Not interested calls"],
  ["meeting_scheduled", "Meetings scheduled"],
];

export function buildCallingEodPrefill(row, source, date) {
  const count = (key) => Math.max(0, Number(row?.[key]) || 0);
  return {
    report_date: date,
    work_summary: `Calling activity for ${source} on ${date}.`,
    completed_work: metrics.map(([key, label], index) => `${index + 1}. [${source}] ${label}: ${count(key)}`).join("\n"),
    client_followups: `[${source}] Interested / follow-up calls: ${count("interested")}; meetings scheduled: ${count("meeting_scheduled")}.`,
  };
}

export function mergeCallingEodPrefill(current, prefill) {
  const items = (value) => String(value || "").split(/\r?\n/).map((line) => line.trim().replace(/^\d+[.)]\s*/, "")).filter(Boolean);
  const combined = [...new Set([...items(current.completed_work), ...items(prefill.completed_work)])];
  const append = (existing, added) => !existing ? added : existing.includes(added) ? existing : `${existing}\n${added}`;
  return {
    ...current,
    work_summary: append(current.work_summary || "", prefill.work_summary),
    completed_work: combined.map((line, index) => `${index + 1}. ${line}`).join("\n"),
    client_followups: append(current.client_followups || "", prefill.client_followups),
  };
}
