import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import {
  canAccessClient,
  canReplaceDocument,
  canUploadClientDocument,
  getAuthContext,
} from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";
import { getAdminUserIds, notifyUsers } from "@/lib/notifications/service";
import { getTaskDataClient } from "@/lib/tasks/assignees";

function emptyToNull(value) {
  return value && value !== "null" && value !== "undefined" ? value : null;
}

function sameOwnerSlot(document, payload) {
  if (document.owner_type && document.owner_type !== payload.owner_type) return false;

  const ownerColumns = ["holder_id", "nominee_id", "guardian_id", "bank_account_id"];
  return ownerColumns.every((column) => {
    const payloadValue = payload[column] || null;
    const documentValue = document[column] || null;

    if (payloadValue) return !documentValue || documentValue === payloadValue;
    return !documentValue;
  });
}

async function findExistingDocument(supabase, tableName, payload) {
  const { data, error } = await supabase
    .from(tableName)
    .select("*")
    .eq("client_id", payload.client_id);

  if (error) return { document: null, error };

  const candidates = (data || []).filter((item) => sameOwnerSlot(item, payload));
  const document =
    candidates.find((item) => item.requirement_key === payload.requirement_key) ||
    candidates.find((item) => item.document_type === payload.document_type);

  return { document: document || null, error: null };
}

export async function GET(request, { params }) {
  const supabase = await createClient(request);
  const documentDb = getTaskDataClient(supabase);
  const { id: clientId } = await params;
  const { user, role } = await getAuthContext(supabase);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = await canAccessClient(supabase, user.id, role, clientId);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await documentDb
    .from("documents")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const documents = await Promise.all(
    (data || []).map(async (document) => {
      if (!document.storage_path) {
        return { ...document, preview_url: document.file_url };
      }

      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from("client-documents")
        .createSignedUrl(document.storage_path, 60 * 10);

      return {
        ...document,
        preview_url: signedUrlError ? document.file_url : signedUrlData.signedUrl,
      };
    })
  );

  return NextResponse.json({ documents }, { status: 200 });
}

export async function POST(request, { params }) {
  const supabase = await createClient(request);
  const { id: clientId } = await params;
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = await canUploadClientDocument(supabase, user.id, role, clientId);
  if (!allowed) {
    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "permission_denied_document_upload",
      entityType: "client",
      entityId: clientId,
      request,
    });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Document file is required" }, { status: 400 });
  }

  const payload = {
    client_id: clientId,
    document_type: formData.get("document_type")?.toString() || "Document",
    owner_type: formData.get("owner_type")?.toString() || "client",
    requirement_key: formData.get("requirement_key")?.toString() || formData.get("document_type")?.toString() || "document",
    holder_id: emptyToNull(formData.get("holder_id")?.toString()),
    nominee_id: emptyToNull(formData.get("nominee_id")?.toString()),
    guardian_id: emptyToNull(formData.get("guardian_id")?.toString()),
    bank_account_id: emptyToNull(formData.get("bank_account_id")?.toString()),
  };

  const { document: existingDocument, error: existingDocumentError } = await findExistingDocument(
    supabase,
    "documents",
    payload
  );

  if (existingDocumentError) {
    return NextResponse.json({ error: existingDocumentError.message }, { status: 500 });
  }

  if (existingDocument && !canReplaceDocument(role, existingDocument)) {
    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "permission_denied_document_replace",
      entityType: "document",
      entityId: existingDocument.id,
      oldValue: existingDocument,
      request,
    });
    return NextResponse.json({ error: "This document cannot be replaced by your role." }, { status: 403 });
  }

  const extension = file.name?.split(".").pop() || "bin";
  const safeTitle = payload.document_type.replace(/[^a-zA-Z0-9]/g, "_");
  const filePath = `${clientId}/${safeTitle}_${Date.now()}.${extension}`;
  const fileBuffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from("client-documents")
    .upload(filePath, fileBuffer, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: publicUrlData } = supabase.storage
    .from("client-documents")
    .getPublicUrl(filePath);

  const documentPayload = {
    ...payload,
    file_url: publicUrlData.publicUrl,
    storage_path: filePath,
    file_name: file.name,
    file_type: file.type,
    file_size: file.size,
    status: "Uploaded",
    uploaded_by: user.id,
  };

  let savedDocument;
  let documentError;

  if (existingDocument) {
    const result = await supabase
      .from("documents")
      .update(documentPayload)
      .eq("id", existingDocument.id)
      .select()
      .single();
    savedDocument = result.data;
    documentError = result.error;
  } else {
    const result = await supabase
      .from("documents")
      .insert([documentPayload])
      .select()
      .single();
    savedDocument = result.data;
    documentError = result.error;
  }

  if (documentError?.code === "23505") {
    const { document: duplicateDocument, error: duplicateLookupError } = await findExistingDocument(
      supabase,
      "documents",
      payload
    );

    if (duplicateLookupError) {
      return NextResponse.json({ error: duplicateLookupError.message }, { status: 500 });
    }

    if (duplicateDocument) {
      if (!canReplaceDocument(role, duplicateDocument)) {
        return NextResponse.json({ error: "This document cannot be replaced by your role." }, { status: 403 });
      }

      const result = await supabase
        .from("documents")
        .update(documentPayload)
        .eq("id", duplicateDocument.id)
        .select()
        .single();
      savedDocument = result.data;
      documentError = result.error;
    }
  }

  if (documentError) {
    return NextResponse.json({ error: documentError.message }, { status: 500 });
  }

  const { document: existingClientDocument, error: existingClientDocumentError } = await findExistingDocument(
    supabase,
    "client_documents",
    payload
  );

  if (existingClientDocumentError) {
    return NextResponse.json({ error: existingClientDocumentError.message }, { status: 500 });
  }

  if (existingClientDocument) {
    const { error: clientDocumentUpdateError } = await supabase
      .from("client_documents")
      .update(documentPayload)
      .eq("id", existingClientDocument.id);
    if (clientDocumentUpdateError) {
      return NextResponse.json({ error: clientDocumentUpdateError.message }, { status: 500 });
    }
  } else {
    const { error: clientDocumentInsertError } = await supabase.from("client_documents").insert([documentPayload]);

    if (clientDocumentInsertError?.code === "23505") {
      const { document: duplicateClientDocument, error: duplicateClientLookupError } = await findExistingDocument(
        supabase,
        "client_documents",
        payload
      );

      if (duplicateClientLookupError) {
        return NextResponse.json({ error: duplicateClientLookupError.message }, { status: 500 });
      }

      if (duplicateClientDocument) {
        const { error: duplicateClientUpdateError } = await supabase
          .from("client_documents")
          .update(documentPayload)
          .eq("id", duplicateClientDocument.id);
        if (duplicateClientUpdateError) {
          return NextResponse.json({ error: duplicateClientUpdateError.message }, { status: 500 });
        }
      } else {
        return NextResponse.json({ error: clientDocumentInsertError.message }, { status: 500 });
      }
    } else if (clientDocumentInsertError) {
      return NextResponse.json({ error: clientDocumentInsertError.message }, { status: 500 });
    }
  }

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: existingDocument ? "document_replaced" : "document_uploaded",
    entityType: "document",
    entityId: savedDocument.id,
    oldValue: existingDocument,
    newValue: savedDocument,
    metadata: {
      client_id: clientId,
      owner_type: payload.owner_type,
      requirement_key: payload.requirement_key,
    },
    request,
  });

  const adminUserIds = await getAdminUserIds(supabase);
  await notifyUsers(supabase, adminUserIds, {
    title: "Document verification pending",
    message: `${payload.document_type} was uploaded for review.`,
    type: "document_verification_pending",
    entityType: "document",
    entityId: savedDocument.id,
    linkUrl: `/admin/clients/${clientId}`,
    metadata: { client_id: clientId, document_type: payload.document_type },
    dedupeKey: `document_pending:${savedDocument.id}`,
  });

  return NextResponse.json({ document: savedDocument }, { status: existingDocument ? 200 : 201 });
}
