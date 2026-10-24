import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isOperations } from "@/lib/auth/permissions";
import { getTaskDataClient } from "@/lib/tasks/assignees";
import { writeAuditLog } from "@/lib/audit/logger";

export async function POST(request, { params }) {
  const { id } = await params;
  const supabase = await createClient(request);
  const { user, profile, role } = await getAuthContext(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOperations(role)) return NextResponse.json({ error: "Only operations users can reply to reviews" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > 2500) {
    return NextResponse.json({ error: "Enter a reply between 1 and 2500 characters" }, { status: 400 });
  }
  const db = getTaskDataClient(supabase);
  const { data: report, error: readError } = await db.from("operation_eod_reports")
    .select("id, review_note").eq("id", id).eq("created_by", user.id)
    .is("operation_hidden_at", null).maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!report) return NextResponse.json({ error: "EOD report not found" }, { status: 404 });
  if (!report.review_note?.trim()) return NextResponse.json({ error: "There is no review note to reply to" }, { status: 400 });
  const { data: reply, error } = await db.from("operation_eod_replies").insert({
    report_id: id, created_by: user.id, message, review_note: report.review_note,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await writeAuditLog(supabase, {
    actor: user, profile, action: "operation_eod_review_replied",
    entityType: "operation_eod_report", entityId: id, newValue: reply, request,
  });
  return NextResponse.json({ reply }, { status: 201 });
}
