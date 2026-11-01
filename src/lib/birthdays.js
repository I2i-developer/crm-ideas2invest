import { parseManualDate } from "@/lib/dateInput";

export function validateBirthday(body, today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })) {
  const person_name = String(body.person_name || "").trim();
  const date_of_birth = String(body.date_of_birth || "");
  if (!person_name || person_name.length > 200) return { error: "Enter a client name of up to 200 characters" };
  const match = date_of_birth.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match || !parseManualDate(`${match[3]}/${match[2]}/${match[1]}`)) return { error: "Enter a valid date of birth" };
  if (date_of_birth > today) return { error: "Date of birth cannot be in the future" };
  return { person_name, date_of_birth };
}

export function applyBirthdayChanges(events, changes) {
  const byId = new Map(changes.map((change) => [change.event_id, change]));
  return events.flatMap((event) => {
    const change = byId.get(event.id);
    if (change?.deleted) return [];
    return [{ ...event, person_name: change?.person_name ?? event.person_name, date_of_birth: change?.date_of_birth ?? event.date_of_birth }];
  });
}
