import { salesContext, salesJson, salesError } from "@/lib/sales/server";
import { istDate, UUID_RE, sourceId } from "@/lib/sales/rules";
export const dynamic = "force-dynamic";
export async function GET(request) {
  const ctx = await salesContext(request);
  if (ctx.error) return ctx.error;
  try {
    const p = new URL(request.url).searchParams;
    const date = p.get("date") || istDate();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > istDate()) throw new Error("Choose today or an earlier date");
    const owner = p.get("owner");
    if (owner && !UUID_RE.test(owner)) throw new Error("Invalid user");
    const source = sourceId(p.get("source"));
    if (!source) return salesJson({ date, timezone: "Asia/Kolkata", rows: [] });
    const { data, error } = await ctx.supabase.rpc("sales_source_eod", { p_date: date, p_user: owner || null, p_source_id: source });
    if (error) throw error;
    return salesJson({ date, timezone: "Asia/Kolkata", rows: data });
  } catch (error) { return salesError(error); }
}
