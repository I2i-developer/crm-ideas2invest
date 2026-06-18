"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { authFetch } from "@/lib/authFetch";

const LOCKED_STATUSES = ["Verified", "Exception approved"];

export default function DocumentCard({
  title,
  clientId,
  documents,
  refreshDocs,
  openModal,
  ownerType = "client",
  requirementKey,
  holderId,
  nomineeId,
  guardianId,
  bankAccountId,
  canDeleteDocument = false,
  canVerifyDocument = false,
  canReplaceVerified = false,
}) {
  const [uploading, setUploading] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [progress, setProgress] = useState(0);

  const existingDoc = documents.find((document) => {
    const matchesType = requirementKey
      ? document.requirement_key === requirementKey
      : document.document_type === title;

    if (!matchesType) return false;
    if (document.owner_type && document.owner_type !== ownerType) return false;

    if (ownerType === "holder" && holderId) return document.holder_id === holderId;
    if (ownerType === "nominee" && nomineeId) return document.nominee_id === nomineeId;
    if (ownerType === "guardian" && guardianId) return document.guardian_id === guardianId;
    if (ownerType === "bank") {
      if (bankAccountId) return document.bank_account_id === bankAccountId;
      if (holderId) return document.holder_id === holderId;
    }

    return true;
  });

  const isLocked = existingDoc && LOCKED_STATUSES.includes(existingDoc.status);
  const canUpload = !isLocked || canReplaceVerified;

  async function openDocumentPreview() {
    if (!existingDoc) return;

    try {
      const response = await authFetch(`/api/clients/${clientId}/documents/${existingDoc.id}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to open document");
      openModal(data.url);
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Unable to open document");
    }
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!canUpload) {
      toast.error("This document is locked and cannot be replaced.");
      return;
    }

    setUploading(true);
    setProgress(25);

    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("document_type", title);
      formData.set("owner_type", ownerType);
      formData.set("requirement_key", requirementKey || title);
      if (holderId) formData.set("holder_id", holderId);
      if (nomineeId) formData.set("nominee_id", nomineeId);
      if (guardianId) formData.set("guardian_id", guardianId);
      if (bankAccountId) formData.set("bank_account_id", bankAccountId);

      setProgress(80);

      const response = await authFetch(`/api/clients/${clientId}/documents`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Upload failed");

      setProgress(100);
      await refreshDocs();

      toast.success(data.document ? "Document uploaded successfully" : "Document updated");
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Upload failed");
    }

    setTimeout(() => {
      setUploading(false);
      setProgress(0);
    }, 600);
  }

  async function handleDelete() {
    if (!existingDoc) return;

    try {
      const response = await authFetch(`/api/clients/${clientId}/documents/${existingDoc.id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to delete document");

      await refreshDocs();
      toast.success("Document deleted");
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to delete document");
    }
  }

  async function updateStatus(status) {
    if (!existingDoc) return;

    setUpdatingStatus(true);
    try {
      const response = await authFetch(`/api/clients/${clientId}/documents/${existingDoc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to update document status");
      await refreshDocs();
      toast.success("Document status updated");
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to update document status");
    } finally {
      setUpdatingStatus(false);
    }
  }

  return (
    <div
      className={`border rounded-xl p-5 flex justify-between items-center transition ${
        existingDoc ? "border-green-200 bg-green-50" : "border-gray-200 bg-white"
      }`}
    >
      <div
        className="flex items-center gap-4 cursor-pointer"
        onClick={openDocumentPreview}
      >
        <div className={`w-14 h-14 rounded-lg flex items-center justify-center text-[11px] font-semibold ${
          existingDoc ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
        }`}>
          DOC
        </div>

        <div>
          <p className="font-medium text-gray-800">{title}</p>
          <p className="text-xs">
            {existingDoc ? (
              <span className="text-green-600 font-medium">{existingDoc.status || "Uploaded"}</span>
            ) : (
              <span className="text-gray-400">Not Uploaded</span>
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 items-end">
        <label className={canUpload ? "cursor-pointer" : "cursor-not-allowed"}>
          <span
            className={`px-4 py-2 text-sm text-white rounded-lg transition ${
              canUpload ? "bg-indigo-600 hover:bg-indigo-700" : "bg-gray-400"
            }`}
          >
            {uploading ? "Uploading..." : existingDoc ? "Replace" : "Upload"}
          </span>
          <input type="file" onChange={handleUpload} disabled={!canUpload} className="hidden" />
        </label>

        {uploading && (
          <div className="w-28 bg-gray-200 h-1 rounded">
            <div
              className="bg-blue-500 h-1 rounded transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {existingDoc && canVerifyDocument && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => updateStatus("verified")}
              disabled={updatingStatus}
              className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              Verify
            </button>
            <button
              type="button"
              onClick={() => updateStatus("rejected")}
              disabled={updatingStatus}
              className="px-3 py-1 text-sm bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        )}

        {existingDoc && canDeleteDocument && (
          <button
            type="button"
            onClick={handleDelete}
            className="px-3 py-1 text-sm bg-[#ff033e] text-white rounded hover:bg-red-700"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
