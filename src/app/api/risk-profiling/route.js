import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { canAccessClient, getAuthContext, isAdmin } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";
import { calculateRiskScore } from "@/lib/risk/scoring";

async function assertClientAccess(supabase, user, role, clientId) {
  if (isAdmin(role)) return true;
  return canAccessClient(supabase, user.id, role, clientId);
}

export async function GET(request) {
  const supabase = await createClient(request);
  const { user } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("client_id");

  let query = supabase
    .from("risk_profile_assessments")
    .select(`
      *,
      client:clients(id, full_name),
      questionnaire:risk_questionnaires(id, title),
      answers:risk_profile_answers(*, question:risk_questions(id, question_text))
    `)
    .order("assessment_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (clientId) query = query.eq("client_id", clientId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ assessments: data || [] }, { status: 200 });
}

export async function POST(request) {
  const supabase = await createClient(request);
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  if (!body.client_id) return NextResponse.json({ error: "Client is required" }, { status: 400 });
  if (!Array.isArray(body.answers) || body.answers.length === 0) {
    return NextResponse.json({ error: "Answers are required" }, { status: 400 });
  }

  const allowed = await assertClientAccess(supabase, user, role, body.client_id);
  if (!allowed) {
    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "permission_denied_risk_assessment_create",
      entityType: "client",
      entityId: body.client_id,
      request,
    });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { totalScore, riskCategory } = calculateRiskScore(body.answers);
  const assessmentPayload = {
    client_id: body.client_id,
    questionnaire_id: body.questionnaire_id || null,
    status: "Submitted",
    total_score: totalScore,
    risk_category: riskCategory,
    assessment_date: body.assessment_date || new Date().toISOString().slice(0, 10),
    review_date: body.review_date || null,
    remarks: body.remarks || null,
    created_by: user.id,
  };

  const { data: assessment, error: assessmentError } = await supabase
    .from("risk_profile_assessments")
    .insert(assessmentPayload)
    .select()
    .single();

  if (assessmentError) return NextResponse.json({ error: assessmentError.message }, { status: 500 });

  const answers = body.answers.map((answer) => ({
    assessment_id: assessment.id,
    question_id: answer.question_id,
    answer_label: answer.answer_label,
    score: Number(answer.score) || 0,
    metadata: answer.metadata || {},
  }));

  const { error: answersError } = await supabase.from("risk_profile_answers").insert(answers);
  if (answersError) return NextResponse.json({ error: answersError.message }, { status: 500 });

  await supabase
    .from("clients")
    .update({ risk_category: riskCategory, updated_by: user.id })
    .eq("id", body.client_id);

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "risk_assessment_created",
    entityType: "risk_profile_assessment",
    entityId: assessment.id,
    newValue: { ...assessment, answers, risk_category: riskCategory },
    request,
  });

  return NextResponse.json({ assessment: { ...assessment, answers } }, { status: 201 });
}
