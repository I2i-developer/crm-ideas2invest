import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext } from "@/lib/auth/permissions";

export async function GET(request) {
  const supabase = await createClient(request);
  const { user } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: questionnaire, error: questionnaireError } = await supabase
    .from("risk_questionnaires")
    .select("*")
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (questionnaireError) {
    return NextResponse.json({ error: questionnaireError.message }, { status: 500 });
  }

  if (!questionnaire) {
    return NextResponse.json({ questionnaire: null, questions: [] }, { status: 200 });
  }

  const { data: questions, error } = await supabase
    .from("risk_questions")
    .select("*")
    .eq("questionnaire_id", questionnaire.id)
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ questionnaire, questions: questions || [] }, { status: 200 });
}
