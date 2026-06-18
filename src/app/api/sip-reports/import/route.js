import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin } from "@/lib/auth/permissions";
import { importSipReport } from "@/lib/crm/sipReports";
import { writeAuditLog } from "@/lib/audit/logger";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["csv", "txt", "xls", "xlsx"]);

function extensionOf(fileName = "") {
  return String(fileName).split(".").pop()?.toLowerCase() || "";
}

export async function POST(request) {
  const supabase = await createClient(request);
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdmin(role)) {
    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "permission_denied_sip_import",
      entityType: "sip_import",
      request,
    });
    return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ error: "SIP report file is required" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File is too large. Maximum size is 10 MB." }, { status: 400 });
    }

    const extension = extensionOf(file.name);
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return NextResponse.json({ error: "Unsupported file type. Upload .xlsx, .xls, or .csv." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const summary = await importSipReport({
      supabase,
      actor: user,
      profile,
      fileName: file.name,
      buffer,
      sourceType: "manual_upload",
      request,
    });

    return NextResponse.json(summary, { status: 201 });
  } catch (error) {
    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "sip_import_failed",
      entityType: "sip_import",
      metadata: { error: error.message },
      request,
    });

    return NextResponse.json({ error: error.message || "SIP report import failed" }, { status: 400 });
  }
}
