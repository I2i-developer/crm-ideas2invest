import { notFound } from "next/navigation";
import { TAX_STATUS } from "@/lib/crm/onboardingRules";
import DocumentRequirementGuide from "../DocumentRequirementGuide";

const TAX_STATUS_BY_SLUG = {
  individual: TAX_STATUS.INDIVIDUAL,
  minor: TAX_STATUS.MINOR,
  nri: TAX_STATUS.NRI,
};

export default async function DocumentRequirementTaxStatusPage({ params }) {
  const { taxStatus } = await params;
  const selectedTaxStatus = TAX_STATUS_BY_SLUG[String(taxStatus || "").toLowerCase()];

  if (!selectedTaxStatus) notFound();

  return <DocumentRequirementGuide taxStatus={selectedTaxStatus} />;
}
