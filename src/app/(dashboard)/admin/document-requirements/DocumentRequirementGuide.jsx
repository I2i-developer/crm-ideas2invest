"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Banknote,
  FileCheck2,
  FileText,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import {
  getDocumentRequirements,
  HOLDING_PATTERN,
  HOLDING_PATTERN_OPTIONS,
  TAX_STATUS,
} from "@/lib/crm/onboardingRules";
import PageHeader from "@/components/PageHeader";

const TAX_STATUS_META = {
  [TAX_STATUS.INDIVIDUAL]: {
    title: "Individual",
    description: "Requirements for single, joint, and anyone-or-survivor individual onboarding.",
    accent: "blue",
  },
  [TAX_STATUS.MINOR]: {
    title: "Minor",
    description: "Minor onboarding requirements with separate guardian document checks. Nominee is not applicable.",
    accent: "amber",
  },
  [TAX_STATUS.NRI]: {
    title: "NRI",
    description: "NRI holder requirements including passport, foreign address, and NRE/NRO cheque rules.",
    accent: "emerald",
  },
};

const OWNER_META = {
  holder: { label: "Holder Documents", icon: UserRound, tone: "bg-blue-50 text-blue-700 border-blue-100" },
  nominee: { label: "Nominee Documents", icon: UsersRound, tone: "bg-violet-50 text-violet-700 border-violet-100" },
  guardian: { label: "Guardian Documents", icon: ShieldCheck, tone: "bg-amber-50 text-amber-700 border-amber-100" },
  bank: { label: "Bank Documents", icon: Banknote, tone: "bg-emerald-50 text-emerald-700 border-emerald-100" },
  client: { label: "Client Documents", icon: FileText, tone: "bg-slate-50 text-slate-700 border-slate-100" },
};

function groupRequirements(requirements) {
  return requirements.reduce((acc, requirement) => {
    const ownerLabel = requirement.owner_role
      ? `${OWNER_META[requirement.owner_type]?.label || "Documents"} - ${titleCase(requirement.owner_role)}`
      : OWNER_META[requirement.owner_type]?.label || "Documents";

    acc[ownerLabel] = acc[ownerLabel] || {
      ownerType: requirement.owner_type,
      items: [],
    };
    acc[ownerLabel].items.push(requirement);
    return acc;
  }, {});
}

function titleCase(value = "") {
  return String(value)
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

function getRequirementStats(requirements) {
  return {
    total: requirements.length,
    documents: requirements.filter((requirement) => requirement.is_document).length,
    dataPoints: requirements.filter((requirement) => requirement.is_data_point).length,
    mandatory: requirements.filter((requirement) => requirement.is_mandatory !== false).length,
  };
}

function getNotes(taxStatus, holdingPattern) {
  if (taxStatus === TAX_STATUS.MINOR) {
    return [
      "Minor onboarding does not require nominee details.",
      "Guardian details are captured separately from the minor holder.",
      "Address and bank details can be populated from document parsing where available.",
    ];
  }

  if (taxStatus === TAX_STATUS.NRI) {
    return [
      "Passport and foreign address are required for NRI onboarding.",
      "NRE/NRO cancelled cheque is required for bank validation.",
      "Nominee details are supported up to a maximum of 3 nominees.",
    ];
  }

  return [
    `${holdingPattern} holding pattern controls how many holder-wise document sets are required.`,
    "Third holder requirements are applicable only when a third holder is added.",
    "Nominee details are supported up to a maximum of 3 nominees.",
  ];
}

export default function DocumentRequirementGuide({ taxStatus }) {
  const isIndividual = taxStatus === TAX_STATUS.INDIVIDUAL;
  const [holdingPattern, setHoldingPattern] = useState(HOLDING_PATTERN.SINGLE);
  const effectiveHoldingPattern = isIndividual ? holdingPattern : HOLDING_PATTERN.SINGLE;

  const requirements = useMemo(
    () => getDocumentRequirements(taxStatus, effectiveHoldingPattern),
    [effectiveHoldingPattern, taxStatus]
  );
  const grouped = useMemo(() => groupRequirements(requirements), [requirements]);
  const stats = getRequirementStats(requirements);
  const meta = TAX_STATUS_META[taxStatus] || TAX_STATUS_META[TAX_STATUS.INDIVIDUAL];
  const notes = getNotes(taxStatus, effectiveHoldingPattern);

  return (
    <div className="space-y-6">
      <Link href="/admin/document-requirements" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700">
        <ArrowLeft size={16} />
        Back to tax status selection
      </Link>

      <PageHeader
        eyebrow="Document Requirement Guide"
        title={meta.title}
        description={meta.description}
        icon={FileCheck2}
        tone={meta.accent}
      />

      {isIndividual && (
        <section className="glass-card p-4">
          <p className="mb-3 text-sm font-semibold text-gray-700">Select Holding Pattern</p>
          <div className="grid gap-2 md:grid-cols-3">
            {HOLDING_PATTERN_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setHoldingPattern(option.value)}
                className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                  option.value === holdingPattern
                    ? "border-blue-300 bg-blue-50 text-blue-800 shadow-sm"
                    : "border-gray-100 bg-white text-gray-600 hover:border-blue-200 hover:bg-blue-50/50"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-4">
        <Stat label="Total Requirements" value={stats.total} />
        <Stat label="Documents" value={stats.documents} />
        <Stat label="Data Points" value={stats.dataPoints} />
        <Stat label="Mandatory" value={stats.mandatory} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {Object.entries(grouped).map(([groupName, group]) => {
            const ownerMeta = OWNER_META[group.ownerType] || OWNER_META.client;
            const Icon = ownerMeta.icon;

            return (
              <div key={groupName} className="glass-card p-5">
                <div className="mb-4 flex items-center gap-3">
                  <span className={`rounded-2xl border p-3 ${ownerMeta.tone}`}>
                    <Icon size={20} />
                  </span>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{groupName}</h2>
                    <p className="text-sm text-gray-500">{group.items.length} requirement{group.items.length === 1 ? "" : "s"}</p>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {group.items.map((requirement) => (
                    <RequirementCard key={`${requirement.owner_type}-${requirement.owner_role}-${requirement.requirement_key}`} requirement={requirement} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <aside className="space-y-5">
          <div className="glass-card p-5">
            <h2 className="text-lg font-semibold text-gray-900">Important Notes</h2>
            <div className="mt-4 space-y-3">
              {notes.map((note) => (
                <div key={note} className="flex gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-3">
                  <BadgeCheck className="mt-0.5 flex-shrink-0 text-blue-700" size={17} />
                  <p className="text-sm leading-6 text-gray-700">{note}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card p-5">
            <h2 className="text-lg font-semibold text-gray-900">Upload Location</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Documents are uploaded from the client profile document view. Parsed data then appears in the complete client profile.
            </p>
            <Link href="/admin/clients" className="mt-4 inline-flex rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
              Open Clients
            </Link>
          </div>
        </aside>
      </section>
    </div>
  );
}

function RequirementCard({ requirement }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-gray-900">{requirement.label}</p>
          <p className="mt-1 text-xs text-gray-500">{requirement.requirement_key}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${requirement.is_document ? "bg-emerald-50 text-emerald-700" : "bg-indigo-50 text-indigo-700"}`}>
          {requirement.is_document ? "Document" : "Data"}
        </span>
      </div>
      {requirement.optional_owner && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          Applies when this holder is added.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="glass-card p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}
