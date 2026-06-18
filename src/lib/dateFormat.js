const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatDateDDMonYYYY(value, fallback = "Missing") {
  if (!value) return fallback;

  const datePart = String(value).slice(0, 10);
  const match = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, year, month, day] = match;
    const monthLabel = SHORT_MONTHS[Number(month) - 1];
    return monthLabel ? `${day}-${monthLabel}-${year}` : fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${String(date.getDate()).padStart(2, "0")}-${SHORT_MONTHS[date.getMonth()]}-${date.getFullYear()}`;
}

export function formatTime(value, fallback = "-") {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateTimeDDMonYYYY(value, fallback = "-") {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return `${formatDateDDMonYYYY(date, fallback)}, ${formatTime(date, fallback)}`;
}
