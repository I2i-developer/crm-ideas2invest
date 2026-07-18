"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useCallback, useMemo, useState, useEffect } from "react";
import toast from "react-hot-toast";
import { authFetch } from "@/lib/authFetch";
import { supabase } from "@/lib/supabaseClient";

import ClientInfo from "./client-details/ClientInfo";
import StatusBadge from "./components/StatusBadge";
import KycSection from "./kyc/KycSection";
import DocumentCard from "./documents/DocumentCard";
import ParsedDataModal from "./modals/ParsedDataModal";
import PageHeader from "@/components/PageHeader";
import { FolderOpen } from "lucide-react";

import { getDocumentRequirementInstances } from "@/lib/crm/onboardingRules";

function getRequirementOwnerIds(requirement, holders, nominees, guardian, bankAccount) {
  return {
    holderId:
      requirement.owner_type === "holder" || requirement.owner_type === "bank"
        ? holders.find((holder) => holder.holder_type === requirement.owner_role)?.id
        : null,
    nomineeId:
      requirement.owner_type === "nominee"
        ? nominees.find((nominee) => `nominee_${nominee.nominee_order}` === requirement.entity_key)?.id
        : null,
    guardianId: requirement.owner_type === "guardian" ? guardian?.id : null,
    bankAccountId: requirement.owner_type === "bank" ? bankAccount?.id : null,
  };
}

function documentMatchesRequirement(document, requirement, ownerIds) {
  if (!document.file_url) return false;
  if (document.requirement_key !== requirement.requirement_key) return false;
  if (document.owner_type && document.owner_type !== requirement.owner_type) return false;

  if (requirement.owner_type === "holder" && ownerIds.holderId) {
    return document.holder_id === ownerIds.holderId;
  }

  if (requirement.owner_type === "nominee" && ownerIds.nomineeId) {
    return document.nominee_id === ownerIds.nomineeId;
  }

  if (requirement.owner_type === "guardian" && ownerIds.guardianId) {
    return document.guardian_id === ownerIds.guardianId;
  }

  if (requirement.owner_type === "bank") {
    if (ownerIds.bankAccountId) return document.bank_account_id === ownerIds.bankAccountId;
    if (ownerIds.holderId) return document.holder_id === ownerIds.holderId;
  }

  return true;
}

async function readApiResponse(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  const fallbackMessage = response.ok
    ? "Server returned an unexpected response."
    : `Server returned ${response.status} ${response.statusText || "error"}.`;

  return {
    error: text?.startsWith("<!DOCTYPE")
      ? `${fallbackMessage} Check the terminal/server logs for the OCR route.`
      : text || fallbackMessage,
  };
}

export default function ClientDetails() {
  const { id } = useParams();

  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState([]);
  const [holders, setHolders] = useState([]);
  const [nominees, setNominees] = useState([]);
  const [guardian, setGuardian] = useState(null);
  const [bankAccount, setBankAccount] = useState(null);
  const [currentRole, setCurrentRole] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  const [parsedData, setParsedData] = useState(null);
  const [parseLoading, setParseLoading] = useState(false);
  const [showParsedModal, setShowParsedModal] = useState(false);
  const [kycStatus, setKycStatus] = useState("Registered");
  const [kycProgress, setKycProgress] = useState(0);

  const documentRequirements = useMemo(() => {
    if (!client) return [];

    const effectiveHolders = holders.length > 0
      ? holders
      : [{ holder_type: "primary", holder_order: 1 }];

    return getDocumentRequirementInstances(
      client.tax_status || "Individual",
      client.holding_pattern || "Single",
      effectiveHolders.map((holder) => ({
        ...holder,
        holder_type: holder.holder_type,
        label:
          holder.holder_type === "primary"
            ? client.tax_status === "Minor"
              ? "Minor Holder"
              : "Primary Holder"
            : holder.holder_type === "second"
              ? "Second Holder"
              : "Third Holder",
      })),
      nominees.map((nominee) => ({
        ...nominee,
        nominee_order: nominee.nominee_order,
      })),
      client.tax_status === "Minor" && Boolean(guardian)
    ).filter((requirement) => requirement.is_document);
  }, [client, guardian, holders, nominees]);

  // Fetch Client
  useEffect(() => {
    const fetchClient = async () => {
      const [{ data, error }, { data: userData }] = await Promise.all([
        supabase
          .from("clients")
          .select("*")
          .eq("id", id)
          .single(),
        supabase.auth.getUser(),
      ]);

      if (error) {
        toast.error("Failed to fetch client");
        return;
      }

      if (userData?.user?.id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", userData.user.id)
          .maybeSingle();
        setCurrentRole(profile?.role || null);
      }

      setClient(data);
      setKycStatus(data.kyc_status || "Registered");
      setKycProgress(data.document_progress || 0);
      setLoading(false);
    };

    if (id) fetchClient();
  }, [id]);

  // Fetch Documents
  const fetchDocs = useCallback(async () => {
    const { data } = await supabase
      .from("documents")
      .select("*")
      .eq("client_id", id);

    setDocuments(data || []);
  }, [id]);

  useEffect(() => {
    if (id) fetchDocs();
  }, [fetchDocs, id]);

  useEffect(() => {
    const fetchRelatedRecords = async () => {
      const [holdersRes, nomineesRes, guardianRes, bankRes] = await Promise.all([
        supabase
          .from("client_holders")
          .select("*")
          .eq("client_id", id)
          .order("holder_order", { ascending: true }),
        supabase
          .from("client_nominees")
          .select("*")
          .eq("client_id", id)
          .order("nominee_order", { ascending: true }),
        supabase
          .from("client_guardians")
          .select("*")
          .eq("client_id", id)
          .maybeSingle(),
        supabase
          .from("client_bank_accounts")
          .select("*")
          .eq("client_id", id)
          .eq("is_primary", true)
          .maybeSingle(),
      ]);

      setHolders(holdersRes.data || []);
      setNominees(nomineesRes.data || []);
      setGuardian(guardianRes.data || null);
      setBankAccount(bankRes.data || null);
    };

    if (id) fetchRelatedRecords();
  }, [id]);

  // Update KYC progress whenever documents change
  // useEffect(() => {
  //   if (!documents.length) return;

  //   const uploadedCount = documents.filter((d) => d.file_url).length;
  //   const progress = Math.round((uploadedCount / docTypes.length) * 100);
  //   setKycProgress(progress);

  //   // Auto KYC validation
  //   const approvedDocs = documents.filter((d) => d.status === "Approved").length;
  //   if (approvedDocs === docTypes.length) setKycStatus("Validated");
  // }, [documents]);
  
  useEffect(() => {
    if (!documents) return;

    const updateProgress = async () => {
      const uploadedCount = documentRequirements.filter((requirement) =>
        documents.some((document) =>
          documentMatchesRequirement(
            document,
            requirement,
            getRequirementOwnerIds(requirement, holders, nominees, guardian, bankAccount)
          )
        )
      ).length;
      const totalRequired = documentRequirements.length || 1;
      const progress = Math.round((uploadedCount / totalRequired) * 100);

      setKycProgress(progress);

      const { error } = await supabase
        .from("clients")
        .update({ document_progress: progress })
        .eq("id", id);

      if (error) {
        console.error("Update failed:", error);
      }
    };

    updateProgress();
  }, [bankAccount, documentRequirements, documents, guardian, holders, id, nominees]);

  // Parse Documents
  const handleParseDocuments = async () => {
    if (kycProgress !== 100) {
      toast.error("Upload all documents before parsing");
      return;
    }

    setParseLoading(true);

    try {
      const res = await authFetch("/api/parse-kyc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: id, documents }),
      });

      const data = await readApiResponse(res);
      if (!res.ok) {
        const detailMessage = data.details?.length
          ? ` ${data.details.slice(0, 2).map((detail) => `${detail.document_type || "Document"}: ${detail.error}`).join("; ")}`
          : "";
        throw new Error(`${data.error || "Parsing failed"}${detailMessage}`);
      }

      setParsedData(data);
      setShowParsedModal(true);
      toast.success("Documents parsed successfully");
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to parse documents");
    }

    setParseLoading(false);
  };

  if (loading) return <div className="p-6">Loading client data...</div>;

  return (
    <div className="p-6 space-y-8">

      <PageHeader
        eyebrow="Client documents"
        title="Client Profile"
        description={`Client ID: ${id}`}
        icon={FolderOpen}
        actions={
          <>
          <Link
            href={`/admin/clients/${id}/client-details`}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-emerald-700 shadow-lg transition hover:bg-emerald-50"
          >
            Complete Client Profile
          </Link>
          <StatusBadge status={kycStatus} />
          </>
        }
      />

      {/* CLIENT INFO */}
      <ClientInfo client={client} />

      {/* KYC Section */}
      <KycSection
        clientId={id}
        initialStatus={kycStatus}
        onStatusChange={setKycStatus}
        canEdit={currentRole === "admin"}
      />

      <div className="grid md:grid-cols-2 gap-5">
        <Link href={`/admin/risk-profiling?client_id=${id}`} className="glass-card p-5 hover:bg-white/70 transition">
          <p className="text-sm text-gray-500">Risk Profiling</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">{client.risk_category || "Pending assessment"}</p>
        </Link>
      </div>

      {/* DOCUMENTS */}
      <div className="glass-card p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-3">Documents</h2>

        {/* Dynamic progress bar */}
        <div className="w-full bg-gray-200 rounded-full h-4">
          <div className="bg-green-500 h-4 rounded-full transition-all" style={{ width: `${kycProgress}%` }} />
        </div>
        <p className="text-sm text-gray-500 mt-2 mb-6">{kycProgress}% completed</p>

        <div className="grid md:grid-cols-2 gap-5">
          {documentRequirements.map((requirement) => (
            <DocumentCard
              key={`${requirement.owner_type}-${requirement.entity_key}-${requirement.requirement_key}`}
              title={requirement.label}
              clientId={id}
              documents={documents}
              refreshDocs={fetchDocs}   // will update kycProgress automatically
              openModal={setPreviewUrl}
              ownerType={requirement.owner_type}
              requirementKey={requirement.requirement_key}
              {...getRequirementOwnerIds(requirement, holders, nominees, guardian, bankAccount)}
              canDeleteDocument={currentRole === "admin"}
              canVerifyDocument={currentRole === "admin"}
              canReplaceVerified={currentRole === "admin"}
            />
          ))}
        </div>

        <div className="flex justify-end mt-6">
          <button
            onClick={handleParseDocuments}
            disabled={currentRole !== "admin" || kycProgress !== 100 || parseLoading}
            className={`px-6 py-2 rounded-lg text-white transition ${
              currentRole === "admin" && kycProgress === 100 ? "bg-purple-600 hover:bg-purple-700" : "bg-gray-400 cursor-not-allowed"
            }`}
          >
            {parseLoading ? "Parsing..." : "Parse Data"}
          </button>
        </div>
      </div>

      {/* PREVIEW MODAL */}
      {previewUrl && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setPreviewUrl(null)}>
          <div className="bg-white p-4 rounded-lg w-[80%] h-[80%] relative" onClick={(event) => event.stopPropagation()}>
            <button
              className="absolute top-3 right-5 z-20 rounded bg-white/90 px-2 text-2xl text-gray-500 font-bold cursor-pointer hover:text-red-500 transition"
              onClick={() => setPreviewUrl(null)}
              title="Close"
            >
              x
            </button>
            <div className="relative h-full w-full">
              <Image
                src={previewUrl}
                alt="Document preview"
                fill
                sizes="80vw"
                className="object-contain rounded"
                unoptimized
              />
            </div>
          </div>
        </div>
      )}

      {/* PARSED DATA MODAL */}
      {showParsedModal && parsedData && (
        // <ParsedDataModal parsedData={parsedData} onClose={() => setShowParsedModal(false)} />
        <ParsedDataModal
          parsedData={parsedData}
          onClose={() => setShowParsedModal(false)}
        />
      )}
    </div>
  );
}
