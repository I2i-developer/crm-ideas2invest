"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { authFetch } from "@/lib/authFetch";
import { Copy, Check, ClipboardList, HeartPulse, PauseCircle } from "lucide-react";
import toast from "react-hot-toast";
import { Tooltip } from "react-tooltip";
import "react-tooltip/dist/react-tooltip.css";
import DocumentViewer from "../../components/documents/DocumentViewer";
import PageHeader from "@/components/PageHeader";
import { formatDateDDMonYYYY } from "@/lib/dateFormat";

export default function CompleteClientInfo() {
  const { id } = useParams();

  const [client, setClient] = useState(null);
  const [holders, setHolders] = useState([]);
  const [bankAccount, setBankAccount] = useState(null);
  const [riskAssessments, setRiskAssessments] = useState([]);
  const [insurancePolicies, setInsurancePolicies] = useState([]);
  const [clientTasks, setClientTasks] = useState([]);
  const [sipEvents, setSipEvents] = useState([]);
  const [sessionParsedData, setSessionParsedData] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);

  const fetchClient = useCallback(async () => {
    const [clientRes, holdersRes, bankRes] = await Promise.all([
      supabase
        .from("clients")
        .select("*")
        .eq("id", id)
        .single(),
      supabase
        .from("client_holders")
        .select("*")
        .eq("client_id", id)
        .order("holder_order", { ascending: true }),
      supabase
        .from("client_bank_accounts")
        .select("*")
        .eq("client_id", id)
        .order("is_primary", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (!clientRes.error) setClient(clientRes.data);
    setHolders(holdersRes.data || []);
    setBankAccount(bankRes.data || null);
  }, [id]);

  useEffect(() => {
    fetchClient();
  }, [fetchClient]);

  useEffect(() => {
    async function fetchClientModules() {
      const [riskResponse, insuranceResponse, sipResponse] = await Promise.all([
        authFetch(`/api/risk-profiling?client_id=${id}`),
        authFetch(`/api/insurance?client_id=${id}`),
        authFetch(`/api/sip-reports?client_id=${id}`),
      ]);

      const riskData = await riskResponse.json().catch(() => ({}));
      const insuranceData = await insuranceResponse.json().catch(() => ({}));
      const sipData = await sipResponse.json().catch(() => ({}));

      if (riskResponse.ok) setRiskAssessments(riskData.assessments || []);
      if (insuranceResponse.ok) setInsurancePolicies(insuranceData.policies || []);
      if (sipResponse.ok) setSipEvents(sipData.events || []);
    }

    if (id) fetchClientModules();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const storedParsedData = sessionStorage.getItem(`parsed_kyc:${id}`);
    if (!storedParsedData) return;

    try {
      setSessionParsedData(JSON.parse(storedParsedData));
    } catch {
      setSessionParsedData(null);
    }
  }, [id]);

  useEffect(() => {
    async function fetchClientTasks() {
      const response = await authFetch(`/api/tasks?client_id=${id}`);
      const data = await response.json().catch(() => ({}));
      if (response.ok) setClientTasks(data.tasks || []);
    }

    if (id) fetchClientTasks();
  }, [id]);

  const parsedFieldsOrder = [
    "father_name",
    "dob",
    "aadhaar_number",
    "pan_number",
    "account_number",
    "ifsc_code",
    "micr_code",
    "bank_name",
    "account_type",
    "pincode",
  ];
  const labelMap = {
    father_name: "Father Name",
    dob: "Date of Birth",
    aadhaar_number: "Aadhaar Number",
    pan_number: "PAN Number",
    passport_number: "Passport Number",
    passport_expiry_date: "Passport Expiry Date",
    account_number: "Account Number",
    ifsc_code: "IFSC Code",
    micr_code: "MICR Code",
    bank_name: "Bank Name",
    account_type: "Account Type",
    nri_account_type: "NRI Account Type",
    address: "Address",
    pincode: "Pincode",
  };

  const INDIAN_STATES = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat",
    "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra",
    "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim",
    "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  ];

  function deriveState(address = "") {
    const upperAddress = address.toUpperCase();
    return INDIAN_STATES.find((state) => upperAddress.includes(state.toUpperCase())) || "";
  }

  function deriveCity(address = "", state = "") {
    const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
    const stateIndex = parts.findIndex((part) => state && part.toUpperCase().includes(state.toUpperCase()));
    const pinIndex = parts.findIndex((part) => /\b\d{6}\b/.test(part));
    const candidateIndex = stateIndex > 0 ? stateIndex - 1 : pinIndex > 0 ? pinIndex - 1 : parts.length - 2;
    return parts[candidateIndex]?.replace(/\b\d{6}\b/g, "").trim() || "";
  }

  function cleanEnglishAddress(address = "") {
    return String(address || "")
      .split(",")
      .map((part) => part.replace(/\s+/g, " ").trim())
      .filter((part) => part && !/[\u0900-\u097F]/.test(part))
      .join(", ");
  }
  const formatLabel = (key) => {
    return key
      .replace(/_/g, " ")                
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };
  const getLabel = (key) => {
    return labelMap[key] || formatLabel(key);
  };

  const getKycColor = (status) => {
    switch (status) {
      case "Validated":
        return "bg-green-100 text-green-700";
      case "Registered":
        return "bg-blue-100 text-blue-700";
      case "On-Hold":
        return "bg-yellow-100 text-yellow-700";
      case "Rejected":
        return "bg-red-100 text-red-700";
      default:
        return "text-gray-500";
    }
  };

  const copyValue = (value, key) => {
    navigator.clipboard.writeText(value || "");
    setCopiedKey(key);
    toast.success("Copied");

    setTimeout(() => setCopiedKey(null), 1500);
  };

  const renderField = (label, value, key) => {
    const hasValue = value !== null && value !== undefined && value !== "";
    const isDateField = key === "dob" || /(?:date|_at|expiry)$/i.test(key || "");
    const displayValue = isDateField && hasValue ? formatDateDDMonYYYY(value) : value;

    return (
    <div className="flex justify-between items-center p-3 border rounded-lg bg-gray-50">
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className={`font-medium break-all ${hasValue ? "text-gray-800" : "text-red-500"}`}>
          {hasValue ? displayValue : "Missing"}
        </p>
      </div>

      <button
        onClick={() => copyValue(displayValue, key)}
        data-tooltip-id="copy-tooltip"
        data-tooltip-content={copiedKey === key ? "" : "Copy"}
        className="cursor-pointer"
        >
        {copiedKey === key ? (
            <Check size={20} className="text-green-600" />
        ) : (
            <Copy
            size={19}
            className="text-blue-600 transition-transform duration-300 hover:scale-110"
            />
        )}
        </button>

        <Tooltip id="copy-tooltip" place="top" delayShow={200}  delayHide={200}
            style={{
                fontSize: "13px",
                padding: "2px 8px",
                borderRadius: "10px"
            }} 
        />
    </div>
    );
  };

  if (!client) return <p className="p-6">Loading...</p>;

  const primaryHolder = holders.find((holder) => holder.holder_type === "primary") || holders[0] || {};
  let rawParsed = sessionParsedData || client.parsed_kyc || {};
  if (typeof rawParsed === "string") {
    try {
      rawParsed = JSON.parse(rawParsed || "{}");
    } catch {
      rawParsed = {};
    }
  }
  const parsed = {
    ...rawParsed,
    father_name: rawParsed.father_name || primaryHolder.father_spouse_name,
    dob: rawParsed.dob || primaryHolder.date_of_birth,
    aadhaar_number: rawParsed.aadhaar_number || (primaryHolder.aadhaar_last_four ? `XXXX XXXX ${primaryHolder.aadhaar_last_four}` : ""),
    pan_number: rawParsed.pan_number || primaryHolder.pan,
    passport_number: rawParsed.passport_number || primaryHolder.passport_number || client.passport_number,
    passport_expiry_date: rawParsed.passport_expiry_date || primaryHolder.passport_expiry_date || client.passport_expiry_date,
    account_number: rawParsed.account_number || bankAccount?.account_number,
    ifsc_code: rawParsed.ifsc_code || bankAccount?.ifsc_code,
    micr_code: rawParsed.micr_code || bankAccount?.micr_code,
    bank_name: rawParsed.bank_name || bankAccount?.bank_name,
    account_type: rawParsed.account_type || bankAccount?.account_type,
    nri_account_type: rawParsed.nri_account_type || bankAccount?.nri_account_type || client.nri_bank_account_type,
    address: cleanEnglishAddress(rawParsed.address || primaryHolder.address || client.residential_address),
    pincode: rawParsed.pincode || client.pin_code,
  };
  const parsedFields = client.tax_status === "NRI"
    ? [...parsedFieldsOrder.slice(0, 4), "passport_number", "passport_expiry_date", ...parsedFieldsOrder.slice(4, 9), "nri_account_type", ...parsedFieldsOrder.slice(9)]
    : parsedFieldsOrder;
  const displayState = client.state || deriveState(parsed.address);
  const displayCity = client.city || deriveCity(parsed.address, displayState);
  const latestRiskAssessment = riskAssessments[0];
  const latestInsurancePolicy = insurancePolicies[0];
  const openTasks = clientTasks.filter((task) => task.status !== "Completed");
  const overdueTasks = openTasks.filter((task) => task.due_date && task.due_date < new Date().toISOString().slice(0, 10));

  const sipStatusClass = (value) => {
    const styles = {
      terminated: "bg-red-50 text-red-700 border-red-100",
      paused: "bg-amber-50 text-amber-700 border-amber-100",
      rejected: "bg-rose-50 text-rose-700 border-rose-100",
      pending: "bg-amber-50 text-amber-700 border-amber-100",
      resolved: "bg-green-50 text-green-700 border-green-100",
      restarted: "bg-blue-50 text-blue-700 border-blue-100",
    };
    return styles[value] || "bg-slate-50 text-slate-700 border-slate-100";
  };
  const insuranceStatusClass = (value) => {
    const styles = {
      Paid: "bg-green-50 text-green-700 border-green-100",
      Pending: "bg-amber-50 text-amber-700 border-amber-100",
      "Grace Period": "bg-blue-50 text-blue-700 border-blue-100",
      Overdue: "bg-red-50 text-red-700 border-red-100",
      Lapsed: "bg-slate-50 text-slate-700 border-slate-100",
    };
    return styles[value] || "bg-slate-50 text-slate-700 border-slate-100";
  };
  const formatCurrency = (value) => {
    if (!value) return "-";
    return Number(value).toLocaleString("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    });
  };

  return (
    <div className="p-6 space-y-6">

      {/* <h1 className="text-2xl font-semibold">
        Complete Client Profile
      </h1> */}
      <PageHeader
        eyebrow="Complete profile"
        title="Complete Client Profile"
        description={`Profile Created: ${formatDateDDMonYYYY(client.created_at, "N/A")}`}
        icon={ClipboardList}
        actions={
          <div className="rounded-2xl border border-white bg-white/80 px-4 py-2 shadow-sm">
          <p className="text-sm text-slate-500 mb-1">KYC Status</p>
          <p className={`text-[17px] font-medium py-1 px-3 rounded-4xl bg-white ${getKycColor(client.kyc_status)}`}>
            {client.kyc_status || "N/A"}
          </p>
        </div>
        }
      />

      <div className="grid md:grid-cols-2 gap-5">
        <Link href={`/admin/risk-profiling?client_id=${id}`} className="glass-card p-5 hover:bg-white/70 transition">
          <p className="text-sm text-gray-500">Risk Profiling</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">
            {latestRiskAssessment?.risk_category || client.risk_category || "Pending assessment"}
          </p>
          {latestRiskAssessment?.total_score !== undefined && (
            <p className="mt-1 text-xs text-gray-500">Score: {latestRiskAssessment.total_score}</p>
          )}
        </Link>
        <Link href={`/admin/insurance?client_id=${id}`} className="glass-card p-5 hover:bg-white/70 transition">
          <p className="text-sm text-gray-500">Insurance</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">
            {latestInsurancePolicy?.policy_type || client.insurance_policy_type || client.has_insurance || "Not captured"}
          </p>
          {(latestInsurancePolicy?.renewal_date || client.insurance_renewal_date) && (
            <p className="mt-1 text-xs text-gray-500">Renewal: {formatDateDDMonYYYY(latestInsurancePolicy?.renewal_date || client.insurance_renewal_date, "-")}</p>
          )}
        </Link>
      </div>

      {/* CLIENT INFO */}
      <Section title="Client Information">
        {renderField("Tax Status", client.tax_status || "Individual", "tax_status")}
        {renderField("Holding Pattern", client.holding_pattern || "Single", "holding_pattern")}
        {renderField("Full Name", client.full_name, "full_name")}
        {renderField("Mobile", client.mobile, "mobile")}
        {renderField("Mobile Declaration Flag", client.mobile_declaration_flag, "mobile_declaration_flag")}
        {renderField("Email", client.email, "email")}
        {renderField("Email Declaration Flag", client.email_declaration_flag, "email_declaration_flag")}
        {renderField("Gender", client.gender, "gender")}
        {renderField("Marital Status", client.marital_status, "marital_status")}
        {renderField("Salary Range", client.salary_range, "salary_range")}
        {renderField("Occupation", client.occupation, "occupation")}
        {renderField("Citizenship", client.citizenship, "citizenship")}
        {renderField("Residential Status", client.residential_status, "residential_status")}
        {renderField("Residential Address", cleanEnglishAddress(client.residential_address) || parsed.address, "residential_address")}
        {renderField("City", displayCity, "city")}
        {renderField("State", displayState, "state")}
        {renderField("Country", client.country, "country")}
        {renderField("PIN Code", client.pin_code || parsed.pincode, "pin_code")}
        {client.tax_status === "NRI" && (
          <>
            {renderField("Foreign Address", client.foreign_address, "foreign_address")}
            {renderField("Passport Number", client.passport_number, "passport_number")}
            {renderField("Passport Expiry", client.passport_expiry_date, "passport_expiry_date")}
            {renderField("NRI Bank Account Type", client.nri_bank_account_type, "nri_bank_account_type")}
          </>
        )}
      </Section>

      {client.tax_status !== "Minor" && (
        <Section title="Nominee Information">
          {renderField("Nominee Name", client.nominee_name, "nominee_name")}
          {renderField("Nominee Relation", client.nominee_relation, "nominee_relation")}
          {renderField(
            "Nominee Share (%)",
            client.nominee_share ? `${client.nominee_share}%` : null,
            "nominee_share"
          )}
          {renderField("Nominee Mobile", client.nominee_mobile, "nominee_mobile")}
          {renderField("Nominee Email", client.nominee_email, "nominee_email")}
        </Section>
      )}

      <Section title="Holder Details">
        {holders.length === 0 ? (
          <p className="text-sm text-gray-500">No holder records found.</p>
        ) : (
          holders.map((holder) => (
            <div key={holder.id || holder.holder_type} className="p-3 border rounded-lg bg-gray-50 space-y-1">
              <p className="font-semibold text-gray-800">{holder.full_name || holder.label || "Holder"}</p>
              <p className="text-xs text-gray-500">{holder.holder_type} holder</p>
              <p className="text-sm text-gray-700">PAN: {holder.pan || "Missing"}</p>
              <p className="text-sm text-gray-700">DOB: {formatDateDDMonYYYY(holder.date_of_birth)}</p>
              <p className="text-sm text-gray-700">Mobile: {holder.mobile || "Missing"}</p>
            </div>
          ))
        )}
      </Section>

      <Section title="Bank Details">
        {renderField("Bank Name", bankAccount?.bank_name, "bank_name")}
        {renderField("Account Holder", bankAccount?.account_holder_name, "account_holder_name")}
        {renderField("Account Number", bankAccount?.account_number, "account_number")}
        {renderField("Account Type", bankAccount?.account_type || bankAccount?.nri_account_type, "account_type")}
        {renderField("IFSC", bankAccount?.ifsc_code, "ifsc_code")}
        {renderField("MICR", bankAccount?.micr_code, "micr_code")}
      </Section>

      <Section title="Insurance Policies" noGrid>
        {insurancePolicies.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-5 text-sm text-gray-500">
            No insurance policy records found.
          </div>
        ) : (
          <div className="space-y-3">
            {insurancePolicies.map((policy) => (
              <div key={policy.id} className="rounded-xl border bg-gray-50 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${insuranceStatusClass(policy.computed_payment_status || policy.payment_status)}`}>
                        {policy.computed_payment_status || policy.payment_status || "Pending"}
                      </span>
                      <span className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                        {policy.through_company ? "Through us" : "External"}
                      </span>
                    </div>
                    <p className="font-semibold text-gray-900">{policy.policy_type || "Insurance Policy"}</p>
                    <p className="text-sm text-gray-600">
                      {policy.insurance_company || "-"} / Policy {policy.policy_number || "-"}
                    </p>
                    <p className="text-sm text-gray-500">
                      Premium {formatCurrency(policy.premium_amount)} / Due {formatDateDDMonYYYY(policy.due_date || policy.renewal_date, "-")}
                    </p>
                    {policy.remarks && <p className="text-sm text-gray-500">{policy.remarks}</p>}
                  </div>
                  <div className="flex flex-col items-start gap-2 text-sm md:items-end">
                    <span className="inline-flex items-center gap-1 text-gray-500">
                      <HeartPulse size={15} />
                      Next follow-up {formatDateDDMonYYYY(policy.next_follow_up_date, "-")}
                    </span>
                    <Link href={`/admin/insurance?client_id=${id}`} className="font-medium text-blue-700 hover:underline">
                      Open policy logs
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* PARSED DATA */}
      <Section title="Parsed KYC Data">
        {parsedFields.map((field) => (
          <div key={field}>
            {renderField(labelMap[field], parsed[field], field)}
          </div>
        ))}
      </Section>

      <Section title="Client Documents" noGrid>
        <DocumentViewer clientId={id} />
      </Section>

      <Section title="SIP Activity" noGrid>
        {sipEvents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-5 text-sm text-gray-500">
            No SIP pause or termination records found.
          </div>
        ) : (
          <div className="space-y-3">
            {sipEvents.map((event) => (
              <div key={event.id} className="rounded-xl border bg-gray-50 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${sipStatusClass(event.event_type)}`}>
                        {event.event_type}
                      </span>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${sipStatusClass(event.follow_up_status)}`}>
                        {event.follow_up_status?.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="font-semibold text-gray-900">{event.scheme || event.fund || "SIP event"}</p>
                    <p className="text-sm text-gray-600">
                      Folio {event.folio_no || "-"} / Amount {event.amount ? Number(event.amount).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }) : "-"}
                    </p>
                    <p className="text-sm text-gray-500">{event.rejection_remarks || event.remarks || "No remarks captured."}</p>
                  </div>
                  <div className="flex flex-col items-start gap-2 text-sm md:items-end">
                    <span className="inline-flex items-center gap-1 text-gray-500">
                      <PauseCircle size={15} />
                      {formatDateDDMonYYYY(event.termination_date || event.end_date || event.created_at, "-")}
                    </span>
                    {event.task_id && (
                      <Link href={`/dashboard/tasks/${event.task_id}`} className="font-medium text-blue-700 hover:underline">
                        Open follow-up task
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Miscellaneous">
        {renderField("Total Tasks", clientTasks.length, "task_total")}
        {renderField("Open Tasks", openTasks.length, "task_open")}
        {renderField("Overdue Tasks", overdueTasks.length, "task_overdue")}
        {renderField("Documents Uploaded", client.document_progress ? `${client.document_progress}% complete` : "0% complete", "document_progress")}
        {renderField("Relationship Manager", client.relationship_manager, "relationship_manager")}
        {renderField("Operations Owner", client.operations_owner, "operations_owner")}
        <div className="md:col-span-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">Recent Client Tasks</p>
            <Link href={`/dashboard/tasks?client_id=${id}`} className="text-sm font-medium text-blue-700">Open all tasks</Link>
          </div>
          {clientTasks.slice(0, 5).map((task) => (
            <Link key={task.id} href={`/dashboard/tasks/${task.id}`} className="flex items-center justify-between rounded-lg border bg-gray-50 p-3 hover:bg-blue-50">
              <span className="font-medium text-gray-800">{task.title}</span>
              <span className="text-sm text-gray-500">{task.status}{task.due_date ? ` / ${formatDateDDMonYYYY(task.due_date, "-")}` : ""}</span>
            </Link>
          ))}
          {clientTasks.length === 0 && <p className="text-sm text-gray-500">No tasks linked to this client.</p>}
        </div>
      </Section>

    </div>
  );
}

/* SECTION COMPONENT */
function Section({ title, children, noGrid }) {
  return (
    <div className="border rounded-xl p-4 space-y-3 bg-white shadow-sm">
      <h2 className="font-semibold text-lg">{title}</h2>

      <div className={noGrid ? "" : "grid md:grid-cols-3 gap-3"}>
        {children}
      </div>
    </div>
  );
}
