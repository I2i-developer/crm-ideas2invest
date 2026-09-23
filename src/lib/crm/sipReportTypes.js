export const SIP_REPORT_RTAS = [
  { value: "kfintech", label: "KFintech" },
  { value: "cams", label: "CAMS" },
];

export const SIP_REPORT_TYPES = [
  {
    value: "kfintech_sip_stp",
    rta: "kfintech",
    label: "SIP Termination/Pause Report - KFintech",
    shortLabel: "SIP/STP",
    supported: true,
    description: "Currently supported import format.",
  },
  {
    value: "kfintech_termination_pause",
    rta: "kfintech",
    label: "Active SIP/STP/SWP Report - KFintech",
    shortLabel: "Active SIP/STP/SWP",
    supported: true,
    description: "Imports active SIP/STP/SWP registrations with registration/start/end dates, transaction type, installments, amount, folio, contact, bank/NACH hints, and STP target details.",
  },
  {
    value: "kfintech_transaction_rejection",
    rta: "kfintech",
    label: "SIP Transaction Level Rejection Report - KFintech",
    shortLabel: "Txn Rejection",
    supported: true,
    description: "Imports transaction-level SIP rejections with transaction date, amount, scheme, folio, and rejection reason.",
  },
  {
    value: "kfintech_closed_sip_stp",
    rta: "kfintech",
    label: "Closed SIP/STP Report - KFintech",
    shortLabel: "Closed SIP/STP",
    supported: true,
    description: "Imports closed SIP/STP rows with registration/from/to dates, transaction type, folio, amount, frequency, investor contact, and product code.",
  },
  {
    value: "kfintech_sip_stp_expiring",
    rta: "kfintech",
    label: "SIP/STP Expiring Report - KFintech",
    shortLabel: "Expiring SIP/STP",
    supported: true,
    description: "Imports SIP/STP rows nearing expiry with end date, amount, folio, contact, PAN/KYC flags, and target scheme details.",
  },
  {
    value: "cams_unoperational_sip_stp",
    rta: "cams",
    label: "Un-operational SIP/STP Report - CAMS",
    shortLabel: "Un-operational",
    supported: true,
    description: "Imports CAMS un-operational SIP/STP rows with folio, investor, PAN, amount, frequency, cease date, request reference, and remarks.",
  },
];

export const DEFAULT_SIP_REPORT_RTA = "kfintech";
export const DEFAULT_SIP_REPORT_TYPE = "kfintech_sip_stp";

export function getSipReportRta(value) {
  return SIP_REPORT_RTAS.find((rta) => rta.value === value) || null;
}

export function getSipReportType(value) {
  return SIP_REPORT_TYPES.find((type) => type.value === value) || null;
}

export function getSipReportTypesForRta(rta) {
  return SIP_REPORT_TYPES.filter((type) => type.rta === rta);
}

export function sipReportTypeLabel(value) {
  return getSipReportType(value)?.label || "Legacy SIP Report";
}

export function sipReportRtaLabel(value) {
  return getSipReportRta(value)?.label || "Legacy";
}
