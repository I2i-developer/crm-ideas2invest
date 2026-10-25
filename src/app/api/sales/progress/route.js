import { salesContext, salesJson, salesError } from "@/lib/sales/server";
import { sourceId, UUID_RE } from "@/lib/sales/rules";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const ctx = await salesContext(request);
  if (ctx.error) return ctx.error;
  try {
    const source = sourceId(new URL(request.url).searchParams.get("source"));
    if (!source) return salesJson({ last_call: null, bookmark: null });
    const { data, error } = await ctx.supabase.rpc("sales_calling_state", { p_source: source });
    if (error) throw error;
    return salesJson(data);
  } catch (error) { return salesError(error); }
}

export async function POST(request) {
  const ctx = await salesContext(request);
  if (ctx.error) return ctx.error;
  try {
    const body = await request.json();
    const source = sourceId(body.source_id);
    if (!source || (body.lead_id !== null && !UUID_RE.test(body.lead_id || ""))) throw new Error("Select a valid source and lead");
    const { data, error } = await ctx.supabase.rpc("sales_set_bookmark", { p_source: source, p_lead: body.lead_id });
    if (error) throw error;
    return salesJson(data);
  } catch (error) { return salesError(error); }
}
