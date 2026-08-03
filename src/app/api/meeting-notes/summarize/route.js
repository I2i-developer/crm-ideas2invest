import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin, isOperations, canAccessClient } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";
import { fallbackMeetingSummary, meetingSummaryPrompt, normalizeSummary, parseAiSummary } from "@/lib/meetings/intelligence";

export const dynamic = "force-dynamic";

async function getClientContext(supabase, clientId) {
  if (!clientId) return null;
  const { data } = await supabase
    .from("clients")
    .select("id, full_name, email, mobile, tax_status, holding_pattern, risk_category, kyc_status")
    .eq("id", clientId)
    .maybeSingle();
  return data || null;
}

export async function POST(request) {
  const supabase = await createClient(request);
  const { user, profile, role } = await getAuthContext(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role) && !isOperations(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const rawNotes = String(body.raw_notes || "").trim();
  const clientId = body.client_id || null;
  const meetingId = body.meeting_id || null;

  if (!rawNotes) return NextResponse.json({ error: "Raw meeting notes are required" }, { status: 400 });
  if (clientId && !(await canAccessClient(supabase, user.id, role, clientId))) {
    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "permission_denied_meeting_summary",
      entityType: "client_meeting",
      metadata: { client_id: clientId },
      request,
    });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const client = await getClientContext(supabase, clientId);
  let summary = fallbackMeetingSummary(rawNotes);
  let aiError = null;
  let aiProvider = "fallback";

  const groqKey = process.env.GROQ_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;

  if (groqKey || openAiKey) {
    try {
      const openai = new OpenAI({
        apiKey: groqKey || openAiKey,
        baseURL: groqKey ? "https://api.groq.com/openai/v1" : undefined,
      });
      const completion = await openai.chat.completions.create({
        model: groqKey
          ? process.env.GROQ_MEETING_SUMMARY_MODEL || "llama-3.3-70b-versatile"
          : process.env.OPENAI_MEETING_SUMMARY_MODEL || "gpt-4.1-mini",
        messages: meetingSummaryPrompt(rawNotes, client),
        temperature: 0.2,
        response_format: { type: "json_object" },
      });
      summary = parseAiSummary(completion.choices?.[0]?.message?.content || "", rawNotes);
      aiProvider = groqKey ? "groq" : "openai";
    } catch (error) {
      aiError = error.message || "AI summarization failed; fallback summary was generated.";
      summary = fallbackMeetingSummary(rawNotes);
    }
  }

  summary = normalizeSummary({ ...summary, raw_notes: rawNotes });

  if (meetingId) {
    const { data: existing } = await supabase
      .from("client_meetings")
      .select("id, created_by, client_id, status")
      .eq("id", meetingId)
      .maybeSingle();

    const allowed = existing && (isAdmin(role) || existing.created_by === user.id || (existing.client_id && await canAccessClient(supabase, user.id, role, existing.client_id)));
    if (!allowed || existing.status === "Finalized" && !isAdmin(role)) {
      return NextResponse.json({ error: "You cannot update this meeting summary" }, { status: 403 });
    }

    const { error: updateError } = await supabase
      .from("client_meetings")
      .update({
        raw_notes: rawNotes,
        summary_json: summary,
        overview: summary.overview,
        major_discussion: summary.major_discussion_points.join("\n"),
        detected_pans: summary.detected_pans,
        important_figures: summary.important_figures,
        sentiment: summary.sentiment,
        priority: summary.priority,
        status: "Summarized",
        updated_by: user.id,
      })
      .eq("id", meetingId);

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "meeting_summary_generated",
    entityType: "client_meeting",
    entityId: meetingId,
    newValue: { ai_generated: summary.ai_generated, detected_pans: summary.detected_pans, priority: summary.priority },
    metadata: { ai_error: aiError, ai_provider: aiProvider },
    request,
  });

  return NextResponse.json({
    summary,
    ai_error: aiError,
    ai_enabled: Boolean(groqKey || openAiKey),
    ai_provider: aiProvider,
  }, { status: 200 });
}
