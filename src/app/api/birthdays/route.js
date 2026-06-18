import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin, isOperations } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";
import importedBirthdays from "@/data/clientBirthdays.json";

function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function monthDay(value) {
  if (!value) return null;
  return value.slice(5, 10);
}

function nextBirthdayDate(dob, fromDate = new Date()) {
  if (!dob) return null;
  const [month, day] = monthDay(dob).split("-").map(Number);
  const candidate = new Date(fromDate.getFullYear(), month - 1, day);
  if (candidate < new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate())) {
    candidate.setFullYear(candidate.getFullYear() + 1);
  }
  return candidate;
}

function daysBetween(start, end) {
  const startDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endDate - startDate) / 86400000);
}

function ageOnBirthday(dob, year = new Date().getFullYear()) {
  if (!dob) return null;
  return year - Number(dob.slice(0, 4));
}

export async function GET(request) {
  const supabase = await createClient(request);
  const { user, role } = await getAuthContext(supabase);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const month = Number(searchParams.get("month")) || new Date().getMonth() + 1;
  const year = Number(searchParams.get("year")) || new Date().getFullYear();
  const days = Number(searchParams.get("days")) || 14;
  const admin = isAdmin(role);

  const [clientsRes, holdersRes, assignedTasksRes, manualBirthdaysRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, client_code, full_name, email, mobile, date_of_birth, operations_owner, relationship_manager, client_category, tax_status, holding_pattern")
      .eq("is_active", true),
    supabase
      .from("client_holders")
      .select("id, client_id, holder_type, holder_order, full_name, email, mobile, date_of_birth, clients(id, client_code, full_name, email, mobile, operations_owner, tax_status, holding_pattern)")
      .not("date_of_birth", "is", null),
    supabase
      .from("tasks")
      .select("client_id, task_assignments!inner(user_id)")
      .eq("task_assignments.user_id", user.id),
    supabase
      .from("manual_client_birthdays")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  const assignedClientIds = new Set((assignedTasksRes.data || []).map((task) => task.client_id).filter(Boolean));
  const visibleClientIds = new Set(
    (clientsRes.data || [])
      .filter((client) => admin || client.operations_owner === user.id || assignedClientIds.has(client.id))
      .map((client) => client.id)
  );

  const clientEvents = (clientsRes.data || [])
    .filter((client) => client.date_of_birth && visibleClientIds.has(client.id))
    .map((client) => ({
      id: `client-${client.id}`,
      client_id: client.id,
      client_code: client.client_code,
      client_name: client.full_name,
      person_name: client.full_name,
      person_type: client.tax_status === "Minor" ? "Minor Holder" : "Primary Holder",
      email: client.email,
      mobile: client.mobile,
      holding_pattern: client.holding_pattern,
      date_of_birth: client.date_of_birth,
    }));

  const holderEvents = (holdersRes.data || [])
    .filter((holder) => visibleClientIds.has(holder.client_id))
    .map((holder) => ({
      id: `holder-${holder.id}`,
      client_id: holder.client_id,
      client_code: holder.clients?.client_code,
      client_name: holder.clients?.full_name,
      person_name: holder.full_name,
      person_type:
        holder.holder_type === "primary"
          ? holder.clients?.tax_status === "Minor"
            ? "Minor Holder"
            : "Primary Holder"
          : holder.holder_type === "second"
            ? "Second Holder"
            : "Third Holder",
      holding_pattern: holder.clients?.holding_pattern,
      email: holder.email || holder.clients?.email,
      mobile: holder.mobile || holder.clients?.mobile,
      date_of_birth: holder.date_of_birth,
    }));

  const eventMap = new Map();
  [...clientEvents, ...holderEvents].forEach((event) => {
    const key = `${event.client_id}:${event.person_type}:${event.date_of_birth}`;
    if (!eventMap.has(key)) eventMap.set(key, event);
  });

  for (const birthday of importedBirthdays.entries || []) {
    const key = `imported:${birthday.person_name?.toLowerCase()}:${birthday.date_of_birth}`;
    if (!eventMap.has(key)) {
      eventMap.set(key, {
        id: birthday.id,
        client_id: null,
        client_name: birthday.client_name,
        person_name: birthday.person_name,
        person_type: birthday.person_type || "Imported Client",
        holding_pattern: null,
        date_of_birth: birthday.date_of_birth,
        source: birthday.source,
        source_month: birthday.source_month,
        source_row: birthday.source_row,
      });
    }
  }

  for (const birthday of manualBirthdaysRes.data || []) {
    const key = birthday.client_id
      ? `${birthday.client_id}:${birthday.person_type}:${birthday.date_of_birth}`
      : `manual:${birthday.person_name?.toLowerCase()}:${birthday.date_of_birth}`;
    if (!eventMap.has(key)) {
      eventMap.set(key, {
        id: `manual-${birthday.id}`,
        client_id: birthday.client_id,
        client_name: birthday.client_name || birthday.person_name,
        person_name: birthday.person_name,
        person_type: birthday.person_type || "Client",
        email: birthday.email,
        mobile: birthday.mobile,
        date_of_birth: birthday.date_of_birth,
        source: "Manual CRM entry",
      });
    }
  }

  const events = [...eventMap.values()].map((event) => {
    const nextDate = nextBirthdayDate(event.date_of_birth);
    return {
      ...event,
      month_day: monthDay(event.date_of_birth),
      next_birthday: dateKey(nextDate),
      days_until: daysBetween(new Date(), nextDate),
      age: ageOnBirthday(event.date_of_birth),
      turning_age: ageOnBirthday(event.date_of_birth, nextDate.getFullYear()),
    };
  });

  const todayMonthDay = monthDay(dateKey());
  const today = events.filter((event) => event.month_day === todayMonthDay);
  const upcoming = events
    .filter((event) => event.days_until > 0 && event.days_until <= days)
    .sort((a, b) => a.days_until - b.days_until);
  const calendar = events
    .filter((event) => Number(event.month_day.slice(0, 2)) === month)
    .map((event) => ({
      ...event,
      calendar_date: `${year}-${String(month).padStart(2, "0")}-${event.month_day.slice(3, 5)}`,
    }));

  return NextResponse.json({ today, upcoming, calendar, events }, { status: 200 });
}

export async function POST(request) {
  const supabase = await createClient(request);
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role) && !isOperations(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const payload = {
    client_id: body.client_id || null,
    person_name: String(body.person_name || "").trim(),
    client_name: String(body.client_name || body.person_name || "").trim() || null,
    person_type: String(body.person_type || "Client").trim() || "Client",
    date_of_birth: body.date_of_birth || null,
    mobile: String(body.mobile || "").trim() || null,
    email: String(body.email || "").trim().toLowerCase() || null,
    notes: String(body.notes || "").trim() || null,
    created_by: user.id,
    updated_by: user.id,
  };

  if (!payload.person_name) return NextResponse.json({ error: "Client name is required" }, { status: 400 });
  if (!payload.date_of_birth) return NextResponse.json({ error: "Date of birth is required" }, { status: 400 });

  const { data, error } = await supabase.from("manual_client_birthdays").insert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "manual_client_birthday_created",
    entityType: "manual_client_birthday",
    entityId: data.id,
    newValue: data,
    request,
  });

  return NextResponse.json({ birthday: data }, { status: 201 });
}
