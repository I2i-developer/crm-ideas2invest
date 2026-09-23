import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin } from "@/lib/auth/permissions";
import { getTaskDataClient } from "@/lib/tasks/assignees";
import { buildUsageReportData, getUsageReportRange, renderUsageReportPdf } from "@/lib/reports/usageReport";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  const supabase = await createClient(request);
  const db = getTaskDataClient(supabase);
  const { user, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });

  const searchParams = new URL(request.url).searchParams;
  const range = getUsageReportRange({
    period: searchParams.get("period") || "daily",
    date: searchParams.get("date") || undefined,
    dateFrom: searchParams.get("date_from") || undefined,
    dateTo: searchParams.get("date_to") || undefined,
  });

  try {
    const report = await buildUsageReportData(db, range);
    const pdf = await renderUsageReportPdf(report);
    const filename = `crm-usage-${range.period}-${range.startKey}${range.period === "weekly" ? `-to-${range.inclusiveEndKey}` : ""}.pdf`;

    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Usage report generation failed:", error);
    return NextResponse.json({ error: error.message || "Usage report generation failed" }, { status: 500 });
  }
}
