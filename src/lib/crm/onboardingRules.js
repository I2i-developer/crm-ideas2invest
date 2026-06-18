export const TAX_STATUS = {
  INDIVIDUAL: "Individual",
  MINOR: "Minor",
  NRI: "NRI",
};

export const HOLDING_PATTERN = {
  SINGLE: "Single",
  JOINT: "Joint",
  ANYONE_OR_SURVIVOR: "Anyone or Survivor",
};

export const TAX_STATUS_OPTIONS = [
  { value: TAX_STATUS.INDIVIDUAL, label: "Individual" },
  { value: TAX_STATUS.MINOR, label: "Minor" },
  { value: TAX_STATUS.NRI, label: "NRI" },
];

export const HOLDING_PATTERN_OPTIONS = [
  { value: HOLDING_PATTERN.SINGLE, label: "Single" },
  { value: HOLDING_PATTERN.JOINT, label: "Joint" },
  { value: HOLDING_PATTERN.ANYONE_OR_SURVIVOR, label: "Anyone or Survivor" },
];

export const NRI_BANK_ACCOUNT_TYPE_OPTIONS = [
  { value: "", label: "Select NRI account type" },
  { value: "NRE", label: "NRE" },
  { value: "NRO", label: "NRO" },
  { value: "FCNR", label: "FCNR" },
  { value: "Other", label: "Other" },
];

export function getHoldingPatternOptions(taxStatus) {
  if (taxStatus !== TAX_STATUS.INDIVIDUAL) {
    return [{ value: HOLDING_PATTERN.SINGLE, label: "Single" }];
  }

  return HOLDING_PATTERN_OPTIONS;
}

export function getDefaultHoldingPattern(taxStatus) {
  return taxStatus === TAX_STATUS.INDIVIDUAL
    ? HOLDING_PATTERN.SINGLE
    : HOLDING_PATTERN.SINGLE;
}

export function getHolderBlueprints(taxStatus, holdingPattern) {
  if (taxStatus === TAX_STATUS.MINOR) {
    return [{ holder_type: "primary", holder_order: 1, label: "Minor Holder" }];
  }

  if (taxStatus === TAX_STATUS.NRI) {
    return [{ holder_type: "primary", holder_order: 1, label: "NRI Holder" }];
  }

  if (
    holdingPattern === HOLDING_PATTERN.JOINT ||
    holdingPattern === HOLDING_PATTERN.ANYONE_OR_SURVIVOR
  ) {
    return [
      { holder_type: "primary", holder_order: 1, label: "Primary Holder" },
      { holder_type: "second", holder_order: 2, label: "Second Holder" },
      { holder_type: "third", holder_order: 3, label: "Third Holder", optional: true },
    ];
  }

  return [{ holder_type: "primary", holder_order: 1, label: "Primary Holder" }];
}

const BASE_HOLDER_DOCUMENTS = [
  { requirement_key: "pan_card", label: "PAN Card", is_document: true },
  { requirement_key: "aadhaar_front", label: "Aadhaar Front", is_document: true },
  { requirement_key: "aadhaar_back", label: "Aadhaar Back", is_document: true },
  { requirement_key: "email_id", label: "Email ID", is_data_point: true },
  { requirement_key: "phone_number", label: "Phone Number", is_data_point: true },
  { requirement_key: "passport_photo", label: "Passport-size Photo", is_document: true },
  { requirement_key: "signature", label: "Signature", is_document: true },
];

const NOMINEE_REQUIREMENTS = [
  { owner_type: "nominee", owner_role: "any", requirement_key: "pan_card", label: "Nominee PAN Card", is_document: true },
  { owner_type: "nominee", owner_role: "any", requirement_key: "aadhaar_front", label: "Nominee Aadhaar Front", is_document: true },
  { owner_type: "nominee", owner_role: "any", requirement_key: "email_id", label: "Nominee Email ID", is_data_point: true },
  { owner_type: "nominee", owner_role: "any", requirement_key: "phone_number", label: "Nominee Phone Number", is_data_point: true },
];

export function createEmptyHolder(blueprint = {}) {
  return {
    holder_type: blueprint.holder_type || "primary",
    holder_order: blueprint.holder_order || 1,
    label: blueprint.label || "Holder",
    optional: blueprint.optional || false,
    full_name: "",
    father_spouse_name: "",
    date_of_birth: "",
    gender: "",
    pan: "",
    aadhaar_last_four: "",
    ckyc_number: "",
    kyc_status: "",
    mobile: "",
    email: "",
    address: "",
    occupation: "",
    annual_income_range: "",
    political_exposure_status: "",
    holder_remarks: "",
    foreign_address: "",
    passport_number: "",
    passport_expiry_date: "",
  };
}

export function createHoldersForSelection(taxStatus, holdingPattern, includeThirdHolder = false) {
  return getHolderBlueprints(taxStatus, holdingPattern)
    .filter((holder) => !holder.optional || includeThirdHolder)
    .map(createEmptyHolder);
}

export function createEmptyNominee(order = 1) {
  return {
    nominee_order: order,
    name: "",
    relationship: "",
    date_of_birth: "",
    guardian_name: "",
    percentage: "",
    mobile: "",
    email: "",
    address: "",
    pan: "",
    aadhaar_last_four: "",
    nomination_opted: true,
    opted_out_reason: "",
    remarks: "",
  };
}

export function createEmptyGuardian() {
  return {
    full_name: "",
    relationship: "",
    pan: "",
    aadhaar_last_four: "",
    mobile: "",
    email: "",
    address: "",
    date_of_birth: "",
    kyc_status: "",
    remarks: "",
  };
}

export function createEmptyBankAccount() {
  return {
    bank_name: "",
    branch: "",
    account_holder_name: "",
    account_number: "",
    account_type: "",
    nri_account_type: "",
    ifsc_code: "",
    micr_code: "",
    is_primary: true,
    remarks: "",
  };
}

export function getDocumentRequirements(taxStatus, holdingPattern) {
  if (taxStatus === TAX_STATUS.MINOR) {
    return [
      { owner_type: "holder", owner_role: "primary", requirement_key: "aadhaar_front", label: "Minor Aadhaar Front", is_document: true },
      { owner_type: "holder", owner_role: "primary", requirement_key: "aadhaar_back", label: "Minor Aadhaar Back", is_document: true },
      { owner_type: "bank", owner_role: "primary", requirement_key: "cancelled_cheque", label: "Cancelled Cheque", is_document: true },
      { owner_type: "holder", owner_role: "primary", requirement_key: "email_id", label: "Minor Email ID", is_data_point: true },
      { owner_type: "holder", owner_role: "primary", requirement_key: "phone_number", label: "Minor Phone Number", is_data_point: true },
      { owner_type: "holder", owner_role: "primary", requirement_key: "passport_photo", label: "Passport-size Photo", is_document: true },
      { owner_type: "holder", owner_role: "primary", requirement_key: "signature", label: "Signature", is_document: true },
      { owner_type: "guardian", owner_role: "primary", requirement_key: "pan_card", label: "Guardian PAN Card", is_document: true },
      { owner_type: "guardian", owner_role: "primary", requirement_key: "aadhaar_front", label: "Guardian Aadhaar Front", is_document: true },
      { owner_type: "guardian", owner_role: "primary", requirement_key: "aadhaar_back", label: "Guardian Aadhaar Back", is_document: true },
      { owner_type: "guardian", owner_role: "primary", requirement_key: "email_id", label: "Guardian Email ID", is_data_point: true },
      { owner_type: "guardian", owner_role: "primary", requirement_key: "phone_number", label: "Guardian Phone Number", is_data_point: true },
      { owner_type: "client", owner_role: "primary", requirement_key: "extra_document", label: "School ID / Birth Certificate / Passport", is_document: true, is_mandatory: false },
    ];
  }

  if (taxStatus === TAX_STATUS.NRI) {
    return [
      ...BASE_HOLDER_DOCUMENTS.map((requirement) => ({
        owner_type: "holder",
        owner_role: "primary",
        ...requirement,
      })),
      { owner_type: "bank", owner_role: "primary", requirement_key: "cancelled_cheque_nre_nro", label: "Cancelled Cheque for NRE/NRO Account", is_document: true },
      { owner_type: "holder", owner_role: "primary", requirement_key: "foreign_address", label: "Foreign Address", is_data_point: true },
      { owner_type: "holder", owner_role: "primary", requirement_key: "passport", label: "Passport", is_document: true },
      ...NOMINEE_REQUIREMENTS,
      { owner_type: "client", owner_role: "primary", requirement_key: "extra_document", label: "Nationality Certificate / Electricity Bill / Utility Bill / SSN or TIN / Others", is_document: true, is_mandatory: false },
    ];
  }

  const holderBlueprints = getHolderBlueprints(taxStatus, holdingPattern);

  return [
    ...holderBlueprints.flatMap((holder) => [
      ...BASE_HOLDER_DOCUMENTS.map((requirement) => ({
        owner_type: "holder",
        owner_role: holder.holder_type,
        optional_owner: holder.optional || false,
        label: `${holder.label} ${requirement.label}`,
        ...requirement,
      })),
      {
        owner_type: "bank",
        owner_role: holder.holder_type,
        optional_owner: holder.optional || false,
        requirement_key: "cancelled_cheque",
        label: `${holder.label} Cancelled Cheque`,
        is_document: true,
      },
    ]),
    ...NOMINEE_REQUIREMENTS,
    { owner_type: "client", owner_role: "primary", requirement_key: "extra_document", label: "Other Supporting Document", is_document: true, is_mandatory: false },
  ];
}

export function getLegacyDocumentTypes(taxStatus = TAX_STATUS.INDIVIDUAL, holdingPattern = HOLDING_PATTERN.SINGLE) {
  return getDocumentRequirements(taxStatus, holdingPattern)
    .filter((requirement) => requirement.is_document && !requirement.optional_owner)
    .map((requirement) => requirement.label);
}

export function getRequirementInstanceKey(requirement, entityKey = requirement.owner_role || "client") {
  return [
    requirement.owner_type,
    requirement.owner_role || "any",
    entityKey,
    requirement.requirement_key,
  ].join(":");
}

export function expandRequirementsForEntities(requirements, holders = [], nominees = [], hasGuardian = false) {
  return requirements.flatMap((requirement) => {
    if (requirement.owner_type === "holder" || requirement.owner_type === "bank") {
      return holders
        .filter((holder) => holder.holder_type === requirement.owner_role)
        .map((holder) => ({
          ...requirement,
          entity_key: holder.holder_type,
          entity_label: holder.label,
        }));
    }

    if (requirement.owner_type === "nominee") {
      return nominees.map((nominee) => ({
        ...requirement,
        entity_key: `nominee_${nominee.nominee_order}`,
        entity_label: `Nominee ${nominee.nominee_order}`,
      }));
    }

    if (requirement.owner_type === "guardian") {
      return hasGuardian
        ? [{ ...requirement, entity_key: "guardian", entity_label: "Guardian" }]
        : [];
    }

    return [{ ...requirement, entity_key: "client", entity_label: "Client" }];
  });
}

export function getDocumentRequirementInstances(taxStatus, holdingPattern, holders, nominees, hasGuardian) {
  return expandRequirementsForEntities(
    getDocumentRequirements(taxStatus, holdingPattern),
    holders,
    nominees,
    hasGuardian
  );
}
