import Link from "next/link";
import {
  ArrowRight,
  Ban,
  CheckCircle2,
  FileSpreadsheet,
  PauseCircle,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { SIP_REPORT_TYPES, sipReportRtaLabel } from "@/lib/crm/sipReportTypes";

const REPORT_VISUALS = {
  kfintech_sip_stp: {
    icon: FileSpreadsheet,
    tone: "border-blue-100 bg-blue-50 text-blue-800",
    iconTone: "bg-blue-600 text-white",
  },
  kfintech_termination_pause: {
    icon: PauseCircle,
    tone: "border-amber-100 bg-amber-50 text-amber-800",
    iconTone: "bg-amber-500 text-white",
  },
  kfintech_transaction_rejection: {
    icon: ShieldAlert,
    tone: "border-rose-100 bg-rose-50 text-rose-800",
    iconTone: "bg-rose-600 text-white",
  },
  kfintech_closed_sip_stp: {
    icon: XCircle,
    tone: "border-slate-200 bg-slate-50 text-slate-800",
    iconTone: "bg-slate-700 text-white",
  },
  kfintech_sip_stp_expiring: {
    icon: XCircle,
    tone: "border-violet-100 bg-violet-50 text-violet-800",
    iconTone: "bg-violet-600 text-white",
  },
  cams_unoperational_sip_stp: {
    icon: Ban,
    tone: "border-cyan-100 bg-cyan-50 text-cyan-800",
    iconTone: "bg-cyan-600 text-white",
  },
};

function reportCardLabelParts(report) {
  const match = String(report.label || "").match(/^(.*?)\s*-\s*(KFintech|CAMS)$/i);
  if (!match) {
    return { title: report.label, suffix: "" };
  }

  return {
    title: match[1],
    suffix: match[2],
  };
}

function reportSuffixClass(report) {
  if (report.rta === "cams") {
    return "border-cyan-200 bg-cyan-100 text-cyan-800";
  }

  return "border-blue-200 bg-blue-100 text-blue-800";
}

export default function SipTrackerReportsPage() {
  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow="Operations tracker"
        title="SIP Tracker"
        description="Choose the report you want to import, review, and track."
        icon={FileSpreadsheet}
      />

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {SIP_REPORT_TYPES.map((report) => {
          const visual = REPORT_VISUALS[report.value] || REPORT_VISUALS.kfintech_sip_stp;
          const Icon = visual.icon;
          const label = reportCardLabelParts(report);

          return (
            <Link
              key={report.value}
              href={`/admin/sip-tracker/${report.value}`}
              className={`group flex min-h-[190px] flex-col justify-between rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${visual.tone}`}
            >
              <div className="flex items-start justify-between gap-4">
                <span className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm ${visual.iconTone}`}>
                  <Icon size={23} />
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${
                    report.supported
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-white/70 text-amber-700"
                  }`}
                >
                  {report.supported ? <CheckCircle2 size={13} /> : <PauseCircle size={13} />}
                  {report.supported ? "Ready" : "Mapping pending"}
                </span>
              </div>

              <div className="mt-5 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide opacity-75">{sipReportRtaLabel(report.rta)}</p>
                <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold leading-snug text-slate-950">
                  <span>{label.title}</span>
                  {label.suffix && (
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-bold ${reportSuffixClass(report)}`}>
                      {label.suffix}
                    </span>
                  )}
                </h2>
                <p className="line-clamp-2 text-sm leading-6 text-slate-600">{report.description}</p>
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-current/10 pt-4 text-sm font-semibold">
                <span>{report.supported ? "Open report" : "View setup status"}</span>
                <ArrowRight size={17} className="transition group-hover:translate-x-1" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
