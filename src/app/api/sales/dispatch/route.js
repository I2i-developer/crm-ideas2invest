import { salesJson, salesError } from "@/lib/sales/server";
import { createTaskServiceClient } from "@/lib/tasks/assignees";
import { dispatchSalesReminders } from "@/lib/sales/notifications";
export const dynamic = "force-dynamic";
export async function GET(request) {
  if (!process.env.CRON_SECRET) return salesJson({ error: "CRON_SECRET is not configured" }, 503);
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return salesJson({ error: "Unauthorized" }, 401);
  const db = createTaskServiceClient();
  if (!db) return salesJson({ error: "Supabase service role key is required for scheduled reminders" }, 503);
  try { return salesJson(await dispatchSalesReminders(db)); }
  catch (error) { return salesError(error); }
}
