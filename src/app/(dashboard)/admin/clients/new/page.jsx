"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import FormInput from "../components/FormInput";
import FormSelect from "../components/FormSelect";
import PageHeader from "@/components/PageHeader";
import { UserPlus } from "lucide-react";
import {
  createEmptyGuardian,
  createEmptyNominee,
  createHoldersForSelection,
  getDefaultHoldingPattern,
  getDocumentRequirementInstances,
  getHoldingPatternOptions,
  getRequirementInstanceKey,
  HOLDING_PATTERN,
  TAX_STATUS,
  TAX_STATUS_OPTIONS,
} from "@/lib/crm/onboardingRules";

const STEPS = [
  "Setup",
  "Client",
  "Nominee / Guardian",
  "Review",
];

const genderOptions = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "TRANSGENDER", label: "Transgender" },
  { value: "PREFER NOT TO SAY", label: "Prefer Not To Say" },
];

const occupationOptions = [
  { value: "BUSINESS", label: "Business" },
  { value: "PROFESSIONAL", label: "Professional" },
  { value: "PRIVATE SECTOR", label: "Private Sector" },
  { value: "PUBLIC SECTOR", label: "Public Sector" },
  { value: "GOVT SERVICES", label: "Govt Services" },
  { value: "AGRICULTURE", label: "Agriculture" },
  { value: "HOUSEWIFE", label: "Housewife" },
  { value: "STUDENT", label: "Student" },
  { value: "RETIRED", label: "Retired" },
  { value: "OTHERS", label: "Others" },
];

const citizenshipOptions = [
  { value: "INDIAN", label: "Indian" },
  { value: "OTHERS", label: "Others" },
];

const maritalStatusOptions = [
  { value: "MARRIED", label: "Married" },
  { value: "UNMARRIED", label: "Unmarried" },
  { value: "OTHERS", label: "Others" },
];

const salaryRangeOptions = [
  { value: "BELOW 1 Lac", label: "Below 1 Lac" },
  { value: "1 - 5 Lac", label: "1 - 5 Lac" },
  { value: "5 - 10 Lac", label: "5 - 10 Lac" },
  { value: "10 - 25 Lac", label: "10 - 25 Lac" },
  { value: "25 Lac - 1 Cr", label: "25 Lac - 1 Cr" },
  { value: "> 1 Cr", label: "> 1 Cr" },
];

const residentialStatusOptions = [
  { value: "RESIDENT INDIVIDUAL", label: "Resident Individual" },
  { value: "NON RESIDENT INDIAN", label: "Non Resident Indian" },
  { value: "FOREIGN NATIONAL", label: "Foreign National" },
  { value: "PERSON OF INDIAN ORIGIN", label: "Person of Indian Origin" },
];

const declarationFlagOptions = [
  "Self",
  "Spouse",
  "Dependent Children",
  "Dependent Siblings",
  "Dependent Parents",
  "Guardian",
  "PMS",
  "Custodian",
  "POA",
].map((value) => ({ value, label: value }));

const initialClient = {
  tax_status: TAX_STATUS.INDIVIDUAL,
  holding_pattern: HOLDING_PATTERN.SINGLE,
  client_category: "",
  client_source: "",
  residential_address: "",
  correspondence_address: "",
  city: "",
  state: "",
  country: "India",
  pin_code: "",
  investment_objective: "",
  notes: "",
  full_name: "",
  email: "",
  email_declaration_flag: "Self",
  mobile: "",
  mobile_declaration_flag: "Self",
  gender: "",
  marital_status: "",
  salary_range: "",
  occupation: "",
  citizenship: "INDIAN",
  citizenship_country: "",
  residential_status: "",
  foreign_address: "",
  passport_number: "",
  passport_expiry_date: "",
  nri_bank_account_type: "",
};

function hasNomineeData(nominee) {
  return [
    nominee.name,
    nominee.relationship,
    nominee.percentage,
    nominee.mobile,
    nominee.email,
  ].some(Boolean);
}

function formatListValue(value) {
  return value || "Missing";
}

function isParsedOnlyRequirement(requirement) {
  return requirement.requirement_key === "foreign_address";
}

export default function NewClientPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [client, setClient] = useState(initialClient);
  const [includeThirdHolder, setIncludeThirdHolder] = useState(false);
  const [holders, setHolders] = useState(
    createHoldersForSelection(TAX_STATUS.INDIVIDUAL, HOLDING_PATTERN.SINGLE)
  );
  const [nominees, setNominees] = useState([createEmptyNominee(1)]);
  const [guardian, setGuardian] = useState(createEmptyGuardian());
  const [errors, setErrors] = useState([]);

  const activeNominees = useMemo(
    () => client.tax_status === TAX_STATUS.MINOR ? [] : nominees.filter(hasNomineeData),
    [client.tax_status, nominees]
  );

  const requirementInstances = useMemo(
    () =>
      getDocumentRequirementInstances(
        client.tax_status,
        client.holding_pattern,
        holders,
        activeNominees,
        client.tax_status === TAX_STATUS.MINOR
      ),
    [activeNominees, client.holding_pattern, client.tax_status, holders]
  );

  const documentSummary = requirementInstances.map((requirement) => {
    const key = getRequirementInstanceKey(requirement, requirement.entity_key);
    const parsedOnly = isParsedOnlyRequirement(requirement);
    const fulfilled = requirement.is_document
      ? false
      : isDataPointFilled(requirement);

    return {
      ...requirement,
      key,
      fulfilled,
      parsedOnly,
      status: fulfilled ? "Ready" : parsedOnly ? "OCR Pending" : requirement.is_document ? "Pending" : "Missing",
    };
  });

  const missingMandatoryItems = documentSummary.filter(
    (item) => item.is_mandatory !== false && !item.is_document && !item.fulfilled && !item.parsedOnly
  );

  function updateClientField(name, value) {
    if (name === "tax_status") {
      const nextHoldingPattern = getDefaultHoldingPattern(value);
      setClient((prev) => ({
        ...prev,
        tax_status: value,
        holding_pattern: nextHoldingPattern,
        residential_status: value === TAX_STATUS.NRI ? "NON RESIDENT INDIAN" : prev.residential_status,
      }));
      setIncludeThirdHolder(false);
      setHolders(createHoldersForSelection(value, nextHoldingPattern, false));
      setNominees(value === TAX_STATUS.MINOR ? [] : [createEmptyNominee(1)]);
      return;
    }

    if (name === "holding_pattern") {
      setClient((prev) => ({ ...prev, holding_pattern: value }));
      setIncludeThirdHolder(false);
      setHolders(createHoldersForSelection(client.tax_status, value, false));
      return;
    }

    setClient((prev) => ({ ...prev, [name]: value }));
  }

  function handleClientChange(event) {
    updateClientField(event.target.name, event.target.value);
  }

  function updateHolder(index, field, value) {
    setHolders((prev) =>
      prev.map((holder, holderIndex) =>
        holderIndex === index ? { ...holder, [field]: value } : holder
      )
    );
  }

  function updateNominee(index, field, value) {
    setNominees((prev) =>
      prev.map((nominee, nomineeIndex) =>
        nomineeIndex === index ? { ...nominee, [field]: value } : nominee
      )
    );
  }

  function addNominee() {
    if (nominees.length >= 3) {
      setErrors(["A maximum of 3 nominees is allowed."]);
      return;
    }

    setNominees((prev) => [...prev, createEmptyNominee(prev.length + 1)]);
  }

  function removeNominee(index) {
    setNominees((prev) =>
      prev
        .filter((_, nomineeIndex) => nomineeIndex !== index)
        .map((nominee, nomineeIndex) => ({
          ...nominee,
          nominee_order: nomineeIndex + 1,
        }))
    );
  }

  function toggleThirdHolder(checked) {
    setIncludeThirdHolder(checked);
    setHolders(createHoldersForSelection(client.tax_status, client.holding_pattern, checked));
  }

  function isDataPointFilled(requirement) {
    if (requirement.owner_type === "holder") {
      const holder = holders.find((item) => item.holder_type === requirement.owner_role);
      if (!holder) return false;
      if (requirement.requirement_key === "email_id") return Boolean(holder.email || client.email);
      if (requirement.requirement_key === "phone_number") return Boolean(holder.mobile || client.mobile);
      if (requirement.requirement_key === "foreign_address") return Boolean(holder.foreign_address || client.foreign_address);
      return false;
    }

    if (requirement.owner_type === "guardian") {
      if (requirement.requirement_key === "email_id") return Boolean(guardian.email);
      if (requirement.requirement_key === "phone_number") return Boolean(guardian.mobile);
      return false;
    }

    if (requirement.owner_type === "nominee") {
      const nomineeOrder = Number(requirement.entity_key?.replace("nominee_", ""));
      const nominee = activeNominees.find((item) => item.nominee_order === nomineeOrder);
      if (!nominee) return false;
      if (requirement.requirement_key === "email_id") return Boolean(nominee.email);
      if (requirement.requirement_key === "phone_number") return Boolean(nominee.mobile);
      return false;
    }

    return false;
  }

  function validate() {
    const nextErrors = [];

    if (!client.tax_status) nextErrors.push("Tax Status is required.");
    if (client.tax_status === TAX_STATUS.INDIVIDUAL && !client.holding_pattern) {
      nextErrors.push("Holding Pattern is required for Individual clients.");
    }
    if (!client.full_name.trim()) nextErrors.push("Client full name is required.");
    if (!client.email.trim()) nextErrors.push("Client email is required.");
    if (!client.mobile.trim()) nextErrors.push("Client mobile is required.");

    const primaryHolder = holders.find((holder) => holder.holder_type === "primary");
    if (!primaryHolder?.full_name && !client.full_name) {
      nextErrors.push("Primary holder name is required.");
    }

    if (
      client.tax_status === TAX_STATUS.INDIVIDUAL &&
      (client.holding_pattern === HOLDING_PATTERN.JOINT ||
        client.holding_pattern === HOLDING_PATTERN.ANYONE_OR_SURVIVOR)
    ) {
      const secondHolder = holders.find((holder) => holder.holder_type === "second");
      if (!secondHolder?.full_name) nextErrors.push("Second holder name is required.");
      if (!secondHolder?.email) nextErrors.push("Second holder email is required.");
      if (!secondHolder?.mobile) nextErrors.push("Second holder phone number is required.");
    }

    if (client.tax_status === TAX_STATUS.MINOR) {
      if (!guardian.mobile.trim()) nextErrors.push("Guardian phone number is required for Minor onboarding.");
      if (!guardian.email.trim()) nextErrors.push("Guardian email is required for Minor onboarding.");
    }

    if (nominees.length > 3) nextErrors.push("A maximum of 3 nominees is allowed.");

    if (missingMandatoryItems.length > 0) {
      nextErrors.push(`${missingMandatoryItems.length} mandatory onboarding data item(s) are missing.`);
    }

    setErrors(nextErrors);
    return nextErrors.length === 0;
  }

  function goNext() {
    setErrors([]);
    setStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  }

  function goBack() {
    setErrors([]);
    setStep((prev) => Math.max(prev - 1, 0));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!validate()) {
      setStep(STEPS.length - 1);
      return;
    }

    setSaving(true);

    try {
      const primaryHolder = holders.find((holder) => holder.holder_type === "primary") || {};

      const clientPayload = {
        tax_status: client.tax_status,
        holding_pattern: client.holding_pattern,
        account_operation_mode:
          client.holding_pattern === HOLDING_PATTERN.ANYONE_OR_SURVIVOR
            ? HOLDING_PATTERN.ANYONE_OR_SURVIVOR
            : client.holding_pattern,
        client_category: client.client_category,
        client_source: client.client_source,
        residential_address: client.residential_address || primaryHolder.address,
        correspondence_address: client.correspondence_address,
        city: client.city,
        state: client.state,
        country: client.country,
        pin_code: client.pin_code,
        investment_objective: client.investment_objective,
        notes: client.notes,
        foreign_address: client.tax_status === TAX_STATUS.NRI ? client.foreign_address || primaryHolder.foreign_address : null,
        passport_number: client.tax_status === TAX_STATUS.NRI ? client.passport_number || primaryHolder.passport_number : null,
        passport_expiry_date:
          client.tax_status === TAX_STATUS.NRI
            ? client.passport_expiry_date || primaryHolder.passport_expiry_date || null
            : null,
        nri_bank_account_type:
          client.tax_status === TAX_STATUS.NRI ? client.nri_bank_account_type || null : null,
        full_name: client.full_name,
        email: client.email,
        email_declaration_flag: client.email_declaration_flag,
        mobile: client.mobile,
        mobile_declaration_flag: client.mobile_declaration_flag,
        gender: client.gender,
        marital_status: client.marital_status,
        salary_range: client.salary_range,
        occupation: client.occupation,
        citizenship: client.citizenship,
        citizenship_country: client.citizenship_country,
        residential_status: client.residential_status,
        nominee_name: activeNominees[0]?.name || null,
        nominee_relation: activeNominees[0]?.relationship || null,
        nominee_share: activeNominees[0]?.percentage || null,
        nominee_email: activeNominees[0]?.email || null,
        nominee_mobile: activeNominees[0]?.mobile || null,
        onboarding_status: "Draft",
        onboarding_completed_at: null,
      };

      const { data: createdClient, error: clientError } = await supabase
        .from("clients")
        .insert([clientPayload])
        .select()
        .single();

      if (clientError) throw clientError;

      const holderPayloads = holders.map((holder) => ({
        client_id: createdClient.id,
        holder_type: holder.holder_type,
        holder_order: holder.holder_order,
        full_name: holder.full_name || (holder.holder_type === "primary" ? client.full_name : null),
        father_spouse_name: holder.father_spouse_name,
        date_of_birth: null,
        gender: holder.gender || (holder.holder_type === "primary" ? client.gender : null),
        pan: holder.pan,
        aadhaar_last_four: holder.aadhaar_last_four,
        ckyc_number: holder.ckyc_number,
        kyc_status: holder.kyc_status,
        mobile: holder.mobile || (holder.holder_type === "primary" ? client.mobile : null),
        email: holder.email || (holder.holder_type === "primary" ? client.email : null),
        address: holder.address || (holder.holder_type === "primary" ? client.residential_address : null),
        occupation: holder.occupation || (holder.holder_type === "primary" ? client.occupation : null),
        annual_income_range: holder.annual_income_range || (holder.holder_type === "primary" ? client.salary_range : null),
        political_exposure_status: holder.political_exposure_status,
        holder_remarks: holder.holder_remarks,
        foreign_address: holder.foreign_address || (holder.holder_type === "primary" ? client.foreign_address : null),
        passport_number: holder.passport_number || (holder.holder_type === "primary" ? client.passport_number : null),
        passport_expiry_date: holder.passport_expiry_date || (holder.holder_type === "primary" ? client.passport_expiry_date || null : null),
      }));

      const { data: createdHolders, error: holderError } = await supabase
        .from("client_holders")
        .insert(holderPayloads)
        .select("id, holder_type");

      if (holderError) throw holderError;

      const holderIdMap = Object.fromEntries(
        (createdHolders || []).map((holder) => [holder.holder_type, holder.id])
      );

      if (activeNominees.length > 0) {
        const { error } = await supabase
          .from("client_nominees")
          .insert(
            activeNominees.map((nominee) => ({
              client_id: createdClient.id,
              nominee_order: nominee.nominee_order,
              name: nominee.name,
              relationship: nominee.relationship,
              date_of_birth: null,
              guardian_name: null,
              percentage: nominee.percentage || null,
              mobile: nominee.mobile,
              email: nominee.email,
              address: null,
              pan: null,
              aadhaar_last_four: null,
              nomination_opted: nominee.nomination_opted,
              opted_out_reason: nominee.opted_out_reason,
              remarks: nominee.remarks,
            }))
          );

        if (error) throw error;
      }

      if (client.tax_status === TAX_STATUS.MINOR) {
        const { error } = await supabase
          .from("client_guardians")
          .insert([
            {
              client_id: createdClient.id,
              minor_holder_id: holderIdMap.primary,
              full_name: guardian.full_name,
              relationship: guardian.relationship,
              pan: guardian.pan,
              aadhaar_last_four: guardian.aadhaar_last_four,
              mobile: guardian.mobile,
              email: guardian.email,
              address: guardian.address,
              date_of_birth: null,
              kyc_status: guardian.kyc_status,
              remarks: guardian.remarks,
            },
          ]);

        if (error) throw error;
      }

      router.push(`/admin/clients/${createdClient.id}`);
    } catch (error) {
      console.error(error);
      setErrors([error.message || "Failed to create client"]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Client onboarding"
        title="Create New Client"
        description="Complete the onboarding flow and upload required documents holder-wise."
        icon={UserPlus}
      />

      <div className="glass-card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          {STEPS.map((label, index) => (
            <button
              key={label}
              type="button"
              onClick={() => setStep(index)}
              className={`min-h-12 px-3 py-3 rounded-xl text-sm font-semibold font-sans leading-tight transition ${
                step === index
                  ? "bg-blue-600 text-white"
                  : index < step
                    ? "bg-green-100 text-green-700"
                    : "bg-white text-gray-500 border border-gray-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {errors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {step === 0 && (
          <Section title="Onboarding Setup">
            <FormSelect
              label="Tax Status"
              name="tax_status"
              placeholder="Tax Status"
              options={TAX_STATUS_OPTIONS}
              value={client.tax_status}
              onChange={handleClientChange}
              required
            />

            <FormSelect
              label="Holding Pattern"
              name="holding_pattern"
              placeholder="Holding Pattern"
              options={getHoldingPatternOptions(client.tax_status)}
              value={client.holding_pattern}
              onChange={handleClientChange}
              required
            />
          </Section>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <Section title="Client Details">
              <FormInput label="Full Name" name="full_name" placeholder="Enter full name" value={client.full_name} onChange={handleClientChange} required voice />
              <FormInput label="Email" name="email" placeholder="Email" value={client.email} onChange={handleClientChange} required voice />
              <FormSelect label="Email Declaration Flag" name="email_declaration_flag" options={declarationFlagOptions} value={client.email_declaration_flag} onChange={handleClientChange} required />
              <FormInput label="Mobile" name="mobile" placeholder="Mobile" value={client.mobile} onChange={handleClientChange} required voice />
              <FormSelect label="Mobile Declaration Flag" name="mobile_declaration_flag" options={declarationFlagOptions} value={client.mobile_declaration_flag} onChange={handleClientChange} required />
              <FormSelect label="Gender" name="gender" placeholder="Gender" options={genderOptions} value={client.gender} onChange={handleClientChange} />
              <FormSelect label="Marital Status" name="marital_status" placeholder="Marital Status" options={maritalStatusOptions} value={client.marital_status} onChange={handleClientChange} />
              <FormSelect label="Salary Range" name="salary_range" placeholder="Salary Range" options={salaryRangeOptions} value={client.salary_range} onChange={handleClientChange} />
              <FormSelect label="Occupation" name="occupation" placeholder="Occupation" options={occupationOptions} value={client.occupation} onChange={handleClientChange} />
              <FormSelect label="Citizenship" name="citizenship" placeholder="Citizenship" options={citizenshipOptions} value={client.citizenship} onChange={handleClientChange} />
              {client.citizenship === "OTHERS" && (
                <FormInput label="Citizenship Country" name="citizenship_country" placeholder="Country" value={client.citizenship_country} onChange={handleClientChange} voice />
              )}
              <FormSelect label="Residential Status" name="residential_status" placeholder="Residential Status" options={residentialStatusOptions} value={client.residential_status} onChange={handleClientChange} />
            </Section>

            {(client.holding_pattern === HOLDING_PATTERN.JOINT ||
              client.holding_pattern === HOLDING_PATTERN.ANYONE_OR_SURVIVOR) && (
              <>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={includeThirdHolder}
                    onChange={(event) => toggleThirdHolder(event.target.checked)}
                  />
                  Add optional third holder
                </label>

                {holders.map((holder, index) => (
                  holder.holder_type !== "primary" && (
                    <Section key={holder.holder_type} title={holder.label}>
                      <FormInput label="Full Name" name={`holder_${index}_name`} value={holder.full_name} onChange={(event) => updateHolder(index, "full_name", event.target.value)} required={!holder.optional} voice />
                      <FormInput label="Father/Spouse Name" name={`holder_${index}_father`} value={holder.father_spouse_name} onChange={(event) => updateHolder(index, "father_spouse_name", event.target.value)} voice />
                      <FormSelect label="Gender" name={`holder_${index}_gender`} options={genderOptions} value={holder.gender} onChange={(event) => updateHolder(index, "gender", event.target.value)} />
                      <FormInput label="PAN" name={`holder_${index}_pan`} value={holder.pan} onChange={(event) => updateHolder(index, "pan", event.target.value)} />
                      <FormInput label="Aadhaar Last 4" name={`holder_${index}_aadhaar`} value={holder.aadhaar_last_four} onChange={(event) => updateHolder(index, "aadhaar_last_four", event.target.value)} />
                      <FormInput label="CKYC Number" name={`holder_${index}_ckyc`} value={holder.ckyc_number} onChange={(event) => updateHolder(index, "ckyc_number", event.target.value)} />
                      <FormInput label="Mobile" name={`holder_${index}_mobile`} value={holder.mobile} onChange={(event) => updateHolder(index, "mobile", event.target.value)} voice />
                      <FormInput label="Email" name={`holder_${index}_email`} value={holder.email} onChange={(event) => updateHolder(index, "email", event.target.value)} voice />
                      <FormSelect label="Occupation" name={`holder_${index}_occupation`} options={occupationOptions} value={holder.occupation} onChange={(event) => updateHolder(index, "occupation", event.target.value)} />
                      <FormSelect label="Annual Income Range" name={`holder_${index}_income`} options={salaryRangeOptions} value={holder.annual_income_range} onChange={(event) => updateHolder(index, "annual_income_range", event.target.value)} />
                      <FormInput label="Political Exposure Status" name={`holder_${index}_pep`} value={holder.political_exposure_status} onChange={(event) => updateHolder(index, "political_exposure_status", event.target.value)} />
                    </Section>
                  )
                ))}
              </>
            )}
          </div>
        )}

        {step === 2 && client.tax_status === TAX_STATUS.MINOR && (
          <Section title="Guardian Details">
            <FormInput label="Mobile" name="guardian_mobile" value={guardian.mobile} onChange={(event) => setGuardian({ ...guardian, mobile: event.target.value })} required voice />
            <FormInput label="Email" name="guardian_email" value={guardian.email} onChange={(event) => setGuardian({ ...guardian, email: event.target.value })} required voice />
          </Section>
        )}

        {step === 2 && client.tax_status !== TAX_STATUS.MINOR && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Nominee Details</h2>
                <p className="text-sm text-gray-500">Add up to 3 nominees.</p>
              </div>
              <button
                type="button"
                onClick={addNominee}
                disabled={nominees.length >= 3}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:bg-gray-300"
              >
                Add Nominee
              </button>
            </div>

            {nominees.map((nominee, index) => (
              <Section key={nominee.nominee_order} title={`Nominee ${nominee.nominee_order}`}>
                <FormInput label="Name" name={`nominee_${index}_name`} value={nominee.name} onChange={(event) => updateNominee(index, "name", event.target.value)} voice />
                <FormInput label="Relationship" name={`nominee_${index}_relation`} value={nominee.relationship} onChange={(event) => updateNominee(index, "relationship", event.target.value)} voice />
                <FormInput label="Share (%)" name={`nominee_${index}_share`} type="number" value={nominee.percentage} onChange={(event) => updateNominee(index, "percentage", event.target.value)} />
                <FormInput label="Mobile" name={`nominee_${index}_mobile`} value={nominee.mobile} onChange={(event) => updateNominee(index, "mobile", event.target.value)} voice />
                <FormInput label="Email" name={`nominee_${index}_email`} value={nominee.email} onChange={(event) => updateNominee(index, "email", event.target.value)} voice />
                {nominees.length > 1 && (
                  <div className="col-span-2">
                    <button type="button" onClick={() => removeNominee(index)} className="text-sm text-red-600">
                      Remove nominee
                    </button>
                  </div>
                )}
              </Section>
            ))}
          </div>
        )}

        {step === 3 && (
          <ReviewStep
            client={client}
            holders={holders}
            nominees={activeNominees}
            guardian={guardian}
            documentSummary={documentSummary}
            missingMandatoryItems={missingMandatoryItems}
          />
        )}

        <div className="flex justify-between">
          <button
            type="button"
            onClick={goBack}
            disabled={step === 0}
            className="px-5 py-2 rounded-xl bg-gray-200 text-gray-700 disabled:opacity-40"
          >
            Back
          </button>

          {step < STEPS.length - 1 ? (
            <button type="button" onClick={goNext} className="px-5 py-2 rounded-xl bg-blue-600 text-white">
              Continue
            </button>
          ) : (
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl bg-green-600 text-white disabled:opacity-50">
              {saving ? "Saving..." : "Save Client"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="glass-card p-6 space-y-6">
      <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">{children}</div>
    </div>
  );
}

function ReviewStep({ client, holders, nominees, guardian, documentSummary, missingMandatoryItems }) {
  return (
    <div className="space-y-6">
      <ReviewCard title="Client Details">
        <ReviewItem label="Tax Status" value={client.tax_status} />
        <ReviewItem label="Holding Pattern" value={client.holding_pattern} />
        <ReviewItem label="Full Name" value={client.full_name} />
        <ReviewItem label="Email" value={client.email} />
        <ReviewItem label="Email Declaration Flag" value={client.email_declaration_flag} />
        <ReviewItem label="Mobile" value={client.mobile} />
        <ReviewItem label="Mobile Declaration Flag" value={client.mobile_declaration_flag} />
        <ReviewItem label="Occupation" value={client.occupation} />
        <ReviewItem label="Residential Status" value={client.residential_status} />
      </ReviewCard>

      <ReviewCard title="Holders">
        <div className="border rounded-lg p-3">
          <p className="font-semibold text-gray-800">
            {client.tax_status === TAX_STATUS.MINOR ? "Minor Holder" : client.tax_status === TAX_STATUS.NRI ? "NRI Holder" : "Primary Holder"}
          </p>
          <p className="text-sm text-gray-600">{formatListValue(client.full_name)}</p>
          <p className="text-sm text-gray-600">{formatListValue(client.email)} / {formatListValue(client.mobile)}</p>
        </div>

        {holders
          .filter((holder) => holder.holder_type !== "primary")
          .map((holder) => (
            <div key={holder.holder_type} className="border rounded-lg p-3">
              <p className="font-semibold text-gray-800">{holder.label}</p>
              <p className="text-sm text-gray-600">{formatListValue(holder.full_name)}</p>
              <p className="text-sm text-gray-600">{formatListValue(holder.email)} / {formatListValue(holder.mobile)}</p>
            </div>
          ))}
      </ReviewCard>

      {client.tax_status === TAX_STATUS.MINOR ? (
        <ReviewCard title="Guardian">
          <ReviewItem label="Mobile" value={guardian.mobile} />
          <ReviewItem label="Email" value={guardian.email} />
        </ReviewCard>
      ) : (
        <ReviewCard title="Nominees">
          {nominees.length === 0 ? (
            <p className="text-sm text-gray-500">No nominees added.</p>
          ) : nominees.map((nominee) => (
            <div key={nominee.nominee_order} className="border rounded-lg p-3">
              <p className="font-semibold text-gray-800">Nominee {nominee.nominee_order}</p>
              <p className="text-sm text-gray-600">{formatListValue(nominee.name)}</p>
              <p className="text-sm text-gray-600">{formatListValue(nominee.relationship)} / {formatListValue(nominee.percentage)}%</p>
            </div>
          ))}
        </ReviewCard>
      )}

      <ReviewCard title="Bank">
        {documentSummary
          .filter((item) => item.owner_type === "bank")
          .map((item) => (
            <ReviewItem key={item.key} label={`${item.entity_label}: ${item.label}`} value={item.status} />
          ))}
      </ReviewCard>

      <ReviewCard title="Document Completion">
        <div className="md:col-span-2">
          <p className={`text-sm font-semibold ${missingMandatoryItems.length ? "text-red-600" : "text-green-600"}`}>
            {missingMandatoryItems.length
              ? `${missingMandatoryItems.length} mandatory item(s) missing`
              : "All mandatory items ready"}
          </p>
        </div>

        {documentSummary.map((item) => (
          <ReviewItem
            key={item.key}
            label={`${item.entity_label}: ${item.label}`}
            value={item.status}
          />
        ))}
      </ReviewCard>
    </div>
  );
}

function ReviewCard({ title, children }) {
  return (
    <div className="glass-card p-6 space-y-4">
      <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
      <div className="grid md:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function ReviewItem({ label, value }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-sm font-medium ${value ? "text-gray-800" : "text-red-500"}`}>
        {formatListValue(value)}
      </p>
    </div>
  );
}
