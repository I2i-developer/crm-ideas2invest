import { salesContext, salesJson, salesError } from "@/lib/sales/server";
import { sourceId } from "@/lib/sales/rules";
export const dynamic = "force-dynamic";
export async function GET(request) {
  const ctx = await salesContext(request);
  if (ctx.error) return ctx.error;
  try {
    const params = new URL(request.url).searchParams;
    const source = sourceId(params.get("source")), owner = sourceId(params.get("owner"));
    if (!source) return salesJson({ pipeline: [], daily: [] });
    const { data, error } = await ctx.supabase.rpc("sales_calling_insights", { p_source: source, p_owner: owner });
    if (error) throw error;
    return salesJson(data);
  } catch (error) { return salesError(error); }
}
