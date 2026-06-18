"use client";

import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/authFetch";
import DocumentGrid from "./DocumentGrid";
import DocumentModal from "./DocumentModal";

function ownerKey(document) {
  return [
    document.owner_type || "client",
    document.holder_id || "",
    document.nominee_id || "",
    document.guardian_id || "",
    document.bank_account_id || "",
  ].join(":");
}

function canonicalRequirementKey(document) {
  const key = String(document.requirement_key || document.document_type || "").toLowerCase();
  const type = String(document.document_type || "").toLowerCase();

  if ((key === "aadhaar_card" || type.includes("aadhaar card")) && document.owner_type === "nominee") {
    return "aadhaar_front";
  }

  if (key === "aadhaar_card") return "aadhaar_legacy";
  return key || type;
}

function isNewerDocument(candidate, current) {
  return new Date(candidate.updated_at || candidate.uploaded_at || candidate.created_at || 0) >
    new Date(current.updated_at || current.uploaded_at || current.created_at || 0);
}

function getVisibleDocuments(documents) {
  const keysByOwner = documents.reduce((acc, document) => {
    const key = ownerKey(document);
    const current = acc.get(key) || new Set();
    current.add(canonicalRequirementKey(document));
    acc.set(key, current);
    return acc;
  }, new Map());

  return Object.values(
    documents.reduce((acc, document) => {
      const owner = ownerKey(document);
      const requirement = canonicalRequirementKey(document);
      const ownerRequirementKeys = keysByOwner.get(owner) || new Set();

      if (document.owner_type === "nominee" && requirement === "aadhaar_back") {
        return acc;
      }

      if (
        requirement === "aadhaar_legacy" &&
        (ownerRequirementKeys.has("aadhaar_front") || ownerRequirementKeys.has("aadhaar_back"))
      ) {
        return acc;
      }

      const key = `${owner}:${requirement}`;
      const current = acc[key];
      if (!current || isNewerDocument(document, current)) {
        acc[key] = document;
      }

      return acc;
    }, {})
  );
}

export default function DocumentViewer({ clientId }) {
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);

  const fetchDocuments = useCallback(async () => {
    const response = await authFetch(`/api/clients/${clientId}/documents`);
    const data = await response.json().catch(() => ({}));
    if (response.ok) setDocuments(data.documents || []);
  }, [clientId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const visibleDocuments = getVisibleDocuments(documents);

  async function openPreview(document) {
    const response = await authFetch(`/api/clients/${clientId}/documents/${document.id}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setPreviewDocument({ ...document, previewError: data.error || "Unable to open document" });
      return;
    }

    setPreviewDocument({ ...document, preview_url: data.url || document.preview_url });
    setSelectedDoc(document);
  }

  return (
    <>
      <DocumentGrid documents={visibleDocuments} onPreview={openPreview} />

      <DocumentModal
        document={previewDocument || selectedDoc}
        onClose={() => {
          setSelectedDoc(null);
          setPreviewDocument(null);
        }}
      />
    </>
  );
}
