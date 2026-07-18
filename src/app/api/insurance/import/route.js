import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";
import { getImportReadClient, matchInsuranceClient, normalizePolicyPayload, parseInsuranceImport } from "@/lib/insurance/renewals";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const supabase = await createClient(request);
  const db = getImportReadClient(supabase);
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role)) {
    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "permission_denied_insurance_import",
      entityType: "insurance_import",
      request,
    });
    return NextResponse.json({ error: "Only admin can import insurance policies" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file) return NextResponse.json({ error: "Insurance import file is required" }, { status: 400 });

    const allowedTypes = [
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];
    const fileName = file.name || "insurance-import";
    if (!allowedTypes.includes(file.type) && !/\.(csv|xlsx|xls)$/i.test(fileName)) {
      return NextResponse.json({ error: "Upload a CSV or Excel insurance file" }, { status: 400 });
    }

    const { fileHash, rows } = await parseInsuranceImport(file);
    const { data: existingImport } = await db
      .from("insurance_imports")
      .select("id")
      .eq("file_hash", fileHash)
      .maybeSingle();

    if (existingImport) {
      return NextResponse.json({ error: "This insurance import file was already uploaded" }, { status: 409 });
    }

    const { data: importRow, error: importError } = await db
      .from("insurance_imports")
      .insert({
        file_name: fileName,
        file_hash: fileHash,
        imported_by: user.id,
        import_status: "completed",
        total_rows: rows.length,
      })
      .select()
      .single();

    if (importError) throw new Error(importError.message);

    let successfulRows = 0;
    let duplicateRows = 0;
    let failedRows = 0;
    let unmatchedRows = 0;
    const errors = [];

    for (const [index, row] of rows.entries()) {
      const policy = row.normalized;
      try {
        if (policy.policy_number) {
          const { data: duplicate } = await db
            .from("insurance_policies")
            .select("id")
            .eq("policy_number", policy.policy_number)
            .maybeSingle();
          if (duplicate) {
            duplicateRows += 1;
            continue;
          }
        }

        const { client, reason } = await matchInsuranceClient(db, policy);
        if (!client) unmatchedRows += 1;

        const payload = normalizePolicyPayload({
          ...policy,
          client_id: client?.id || null,
          status: "Active",
        }, user.id);

        const { error } = await db.from("insurance_policies").insert({
          ...payload,
          import_id: importRow.id,
          import_source: "manual_upload",
          match_status: client ? "matched" : "unmatched",
          match_reason: reason || null,
          imported_client_name: policy.client_name || null,
          imported_contact_mobile: policy.contact_mobile || null,
          imported_contact_email: policy.contact_email || null,
          raw_import_row: row.raw || {},
          created_by: user.id,
        });

        if (error) throw new Error(error.message);
        successfulRows += 1;
      } catch (error) {
        failedRows += 1;
        errors.push({ row: index + 2, reason: error.message || "Import row failed", raw: row.raw });
      }
    }

    const importStatus = failedRows ? "completed_with_errors" : "completed";
    await db
      .from("insurance_imports")
      .update({
        import_status: importStatus,
        successful_rows: successfulRows,
        duplicate_rows: duplicateRows,
        failed_rows: failedRows,
        unmatched_rows: unmatchedRows,
        error_summary: errors,
      })
      .eq("id", importRow.id);

    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "insurance_import_completed",
      entityType: "insurance_import",
      entityId: importRow.id,
      metadata: { total_rows: rows.length, successfulRows, duplicateRows, failedRows, unmatchedRows },
      request,
    });

    return NextResponse.json({
      import_id: importRow.id,
      total_rows: rows.length,
      successful_rows: successfulRows,
      duplicate_rows: duplicateRows,
      failed_rows: failedRows,
      unmatched_rows: unmatchedRows,
      errors: errors.slice(0, 20),
    }, { status: 201 });
  } catch (error) {
    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "insurance_import_failed",
      entityType: "insurance_import",
      metadata: { error: error.message },
      request,
    });
    return NextResponse.json({ error: error.message || "Insurance import failed" }, { status: 400 });
  }
}
