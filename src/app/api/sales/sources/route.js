import { salesContext, salesJson, salesError } from "@/lib/sales/server";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const ctx = await salesContext(request);
  if (ctx.error) return ctx.error;
  try {
    const { data, error } = await ctx.supabase.rpc("sales_list_sources");
    if (error) throw error;
    return salesJson({ sources: (data || []).filter((source) => source.name?.trim().toLowerCase() !== "manual" || Number(source.lead_count) > 0) });
  } catch (error) { return salesError(error); }
}
