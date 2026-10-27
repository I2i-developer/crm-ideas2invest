import { salesContext, salesJson, salesError } from "@/lib/sales/server";
import { CALL_METRICS, SALES_PAGE_SIZE, sourceId, istDate } from "@/lib/sales/rules";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const ctx = await salesContext(request);
  if (ctx.error) return ctx.error;
  try {
    const params = new URL(request.url).searchParams;
    const source = sourceId(params.get("source")), owner = sourceId(params.get("owner"));
    const metric = params.get("metric") || "dialed", date = params.get("date") || istDate();
    const page = Math.max(1, Number.parseInt(params.get("page"), 10) || 1);
    if (!CALL_METRICS.includes(metric)) throw new Error("Choose a valid call activity filter");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > istDate() || page > 100000) throw new Error("Choose a valid date and page");
    if (!source) return salesJson({ rows: [], total: 0, page, page_size: SALES_PAGE_SIZE });
    const { data, error } = await ctx.supabase.rpc("sales_call_activity", { p_source: source, p_date: date, p_metric: metric, p_owner: owner, p_page: page });
    if (error) throw error;
    return salesJson({ ...data, page, page_size: SALES_PAGE_SIZE });
  } catch (error) { return salesError(error); }
}
