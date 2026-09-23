import { notFound } from "next/navigation";
import SipReportPage from "../SipReportPage";
import { SIP_REPORT_TYPES, getSipReportType } from "@/lib/crm/sipReportTypes";

export function generateStaticParams() {
  return SIP_REPORT_TYPES.map((report) => ({ reportType: report.value }));
}

export default async function SipTrackerReportPage({ params }) {
  const { reportType } = await params;
  const decodedReportType = decodeURIComponent(reportType || "");

  if (!getSipReportType(decodedReportType)) {
    notFound();
  }

  return <SipReportPage reportTypeValue={decodedReportType} />;
}
