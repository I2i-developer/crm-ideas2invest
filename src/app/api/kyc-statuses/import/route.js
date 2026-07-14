import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin, isOperations } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";
import { parseKycImport } from "@/lib/kyc/status";

export const dynamic = "force-dynamic";

function normalizeClientMatchRows(rows = []) {
  const matches = new Map();
  for (const row of rows || []) {
    if (!row.pan || !row.client_id) continue;
    matches.set(String(row.pan).toUpperCase(), row.client_id);
  }
  return matches;
}

export async function POST(request) {
  const supabase = await createClient(request);
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role) && !isOperations(role)) {
    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "permission_denied_kyc_import",
      entityType: "client_kyc_import",
      request,
    });
    return NextResponse.json({ error: "Only CRM admin and operations users can import KYC status files" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file) return NextResponse.json({ error: "KYC import file is required" }, { status: 400 });

    const fileName = file.name || "kyc-status-import";
    if (!/\.(csv|xlsx|xls)$/i.test(fileName)) {
      return NextResponse.json({ error: "Upload a CSV or Excel file" }, { status: 400 });
    }

    const { fileHash, rows, rejectedRows } = await parseKycImport(file);
    const pans = rows.map((row) => row.normalized_pan).filter(Boolean);

    const { data: existingRows, error: existingError } = pans.length
      ? await supabase
          .from("client_kyc_statuses")
          .select("normalized_pan, client_name, kyc_status")
          .in("normalized_pan", pans)
      : { data: [], error: null };

    if (existingError) throw new Error(existingError.message);

    const existingPanMap = new Map((existingRows || []).map((row) => [row.normalized_pan, row]));
    const acceptedRows = [];
    const rejected = [...rejectedRows];

    for (const row of rows) {
      const duplicate = existingPanMap.get(row.normalized_pan);
      if (duplicate) {
        rejected.push({
          row: row.row,
          reason: "PAN already exists in KYC Status Tracker",
          pan_number: row.normalized_pan,
          existing_client_name: duplicate.client_name,
          existing_status: duplicate.kyc_status,
          raw: row.raw_import_row,
        });
        continue;
      }
      acceptedRows.push(row);
    }

    const acceptedPans = acceptedRows.map((row) => row.normalized_pan).filter(Boolean);
    const { data: holderMatches, error: holderError } = acceptedPans.length
      ? await supabase
          .from("client_holders")
          .select("pan, client_id")
          .in("pan", acceptedPans)
      : { data: [], error: null };

    if (holderError) throw new Error(holderError.message);
    const clientByPan = normalizeClientMatchRows(holderMatches);

    const importStatus = rejected.length ? "completed_with_rejections" : "completed";
    const { data: importRow, error: importError } = await supabase
      .from("client_kyc_imports")
      .insert({
        file_name: fileName,
        file_hash: fileHash,
        imported_by: user.id,
        import_status: importStatus,
        total_rows: rows.length + rejectedRows.filter((row) => row.row !== 0).length,
        successful_rows: acceptedRows.length,
        duplicate_rows: rejected.filter((row) => /duplicate|already exists/i.test(row.reason || "")).length,
        invalid_rows: rejected.filter((row) => /missing|invalid/i.test(row.reason || "")).length,
        rejected_rows: rejected,
      })
      .select()
      .single();

    if (importError) throw new Error(importError.message);

    const payload = acceptedRows.map((row) => ({
      client_id: clientByPan.get(row.normalized_pan) || null,
      client_name: row.client_name,
      pan_number: row.pan_number,
      normalized_pan: row.normalized_pan,
      kyc_status: row.kyc_status,
      status_source: "Bulk Upload",
      kra_agency: row.kra_agency,
      remarks: row.remarks,
      import_id: importRow.id,
      raw_import_row: row.raw_import_row,
      created_by: user.id,
      updated_by: user.id,
    }));

    let inserted = [];
    if (payload.length) {
      const { data, error } = await supabase
        .from("client_kyc_statuses")
        .insert(payload)
        .select("id, client_name, normalized_pan, kyc_status");

      if (error) throw new Error(error.message);
      inserted = data || [];

      await supabase.from("client_kyc_status_history").insert(
        inserted.map((row) => ({
          kyc_status_id: row.id,
          changed_by: user.id,
          old_status: null,
          new_status: row.kyc_status,
          new_value: row,
          change_note: "Created by bulk KYC import",
        }))
      );
    }

    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "kyc_import_completed",
      entityType: "client_kyc_import",
      entityId: importRow.id,
      metadata: {
        file_name: fileName,
        total_rows: rows.length + rejectedRows.filter((row) => row.row !== 0).length,
        successful_rows: inserted.length,
        rejected_rows: rejected.length,
      },
      request,
    });

    return NextResponse.json({
      import_id: importRow.id,
      total_rows: rows.length + rejectedRows.filter((row) => row.row !== 0).length,
      successful_rows: inserted.length,
      rejected_rows: rejected.length,
      duplicates: rejected.filter((row) => /duplicate|already exists/i.test(row.reason || "")).length,
      invalid_rows: rejected.filter((row) => /missing|invalid/i.test(row.reason || "")).length,
      rejected: rejected.slice(0, 100),
    }, { status: 201 });
  } catch (error) {
    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "kyc_import_failed",
      entityType: "client_kyc_import",
      metadata: { error: error.message },
      request,
    });
    return NextResponse.json({ error: error.message || "KYC import failed" }, { status: 400 });
  }
}
