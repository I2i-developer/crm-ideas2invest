import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import {
  canAccessClient,
  canDeleteClientDocument,
  canVerifyClientDocument,
  getAuthContext,
} from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";
import { notifyUsers } from "@/lib/notifications/service";

const STATUS_MAP = {
  uploaded: "Uploaded",
  parsed: "Parsed",
  under_review: "Under review",
  verified: "Verified",
  rejected: "Rejected",
  exception_approved: "Exception approved",
};

async function getDocument(supabase, clientId, documentId) {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .eq("client_id", clientId)
    .maybeSingle();

  return { document: data, error };
}

export async function GET(request, { params }) {
  const supabase = await createClient(request);
  const { id: clientId, documentId } = await params;
  const { user, role } = await getAuthContext(supabase);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = await canAccessClient(supabase, user.id, role, clientId);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { document, error } = await getDocument(supabase, clientId, documentId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  if (!document.storage_path) {
    return NextResponse.json({ url: document.file_url }, { status: 200 });
  }

  const { data, error: signedUrlError } = await supabase.storage
    .from("client-documents")
    .createSignedUrl(document.storage_path, 60 * 10);

  if (signedUrlError) {
    return NextResponse.json({ error: signedUrlError.message }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl }, { status: 200 });
}

export async function PATCH(request, { params }) {
  const supabase = await createClient(request);
  const { id: clientId, documentId } = await params;
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canVerifyClientDocument(role)) {
    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "permission_denied_document_status",
      entityType: "document",
      entityId: documentId,
      request,
    });
    return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
  }

  const body = await request.json();
  const status = STATUS_MAP[body.status] || body.status;
  if (!Object.values(STATUS_MAP).includes(status)) {
    return NextResponse.json({ error: "Invalid document status" }, { status: 400 });
  }

  const { document: existingDocument, error } = await getDocument(supabase, clientId, documentId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!existingDocument) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const statusUpdates = {
    status,
    review_notes: body.review_notes || null,
    verified_by: status === "Verified" || status === "Exception approved" ? user.id : null,
    verified_at: status === "Verified" || status === "Exception approved" ? new Date().toISOString() : null,
    rejected_by: status === "Rejected" ? user.id : null,
    rejected_at: status === "Rejected" ? new Date().toISOString() : null,
  };

  const { data: updatedDocument, error: updateError } = await supabase
    .from("documents")
    .update(statusUpdates)
    .eq("id", documentId)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await supabase
    .from("client_documents")
    .update(statusUpdates)
    .eq("client_id", clientId)
    .eq("storage_path", existingDocument.storage_path);

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: `document_${status.toLowerCase().replaceAll(" ", "_")}`,
    entityType: "document",
    entityId: documentId,
    oldValue: existingDocument,
    newValue: updatedDocument,
    request,
  });

  if (status === "Rejected") {
    const { data: client } = await supabase
      .from("clients")
      .select("operations_owner")
      .eq("id", clientId)
      .maybeSingle();

    await notifyUsers(supabase, [client?.operations_owner].filter(Boolean), {
      title: "Document rejected",
      message: `${existingDocument.document_type} was rejected.`,
      type: "document_rejected",
      entityType: "document",
      entityId: documentId,
      linkUrl: `/admin/clients/${clientId}`,
      metadata: { client_id: clientId, document_type: existingDocument.document_type },
    });
  }

  return NextResponse.json({ document: updatedDocument }, { status: 200 });
}

export async function DELETE(request, { params }) {
  const supabase = await createClient(request);
  const { id: clientId, documentId } = await params;
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canDeleteClientDocument(role)) {
    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "permission_denied_document_delete",
      entityType: "document",
      entityId: documentId,
      request,
    });
    return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
  }

  const { document: existingDocument, error } = await getDocument(supabase, clientId, documentId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!existingDocument) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  if (existingDocument.storage_path) {
    await supabase.storage.from("client-documents").remove([existingDocument.storage_path]);
  }

  const { error: deleteError } = await supabase
    .from("documents")
    .delete()
    .eq("id", documentId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  await supabase
    .from("client_documents")
    .delete()
    .eq("client_id", clientId)
    .eq("storage_path", existingDocument.storage_path);

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "document_deleted",
    entityType: "document",
    entityId: documentId,
    oldValue: existingDocument,
    metadata: { client_id: clientId },
    request,
  });

  return NextResponse.json({ message: "Document deleted successfully" }, { status: 200 });
}
