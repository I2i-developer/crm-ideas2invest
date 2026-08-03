const EMPTY_SUMMARY = {
  overview: "",
  major_discussion_points: [],
  client_current_situation: [],
  existing_investments: [],
  existing_insurance: [],
  income_details: [],
  family_dependents: [],
  financial_goals: [],
  risk_profile_notes: [],
  kyc_concerns: [],
  detected_pans: [],
  important_figures: [],
  product_opportunities: {
    mutual_funds: [],
    sip_swp_stp: [],
    pms_aif: [],
    gift_city: [],
    insurance: [],
  },
  documents_required: [],
  follow_up_actions: [],
  suggested_tasks: [],
  suggested_reminders: [],
  open_questions: [],
  sentiment: "Neutral",
  priority: "Medium",
  ai_generated: false,
};

const SECTION_KEYWORDS = {
  kyc_concerns: ["kyc", "pan", "aadhaar", "document", "signature", "bank proof", "address proof", "fatca"],
  existing_insurance: ["insurance", "policy", "premium", "term plan", "health cover", "life cover", "renewal"],
  existing_investments: ["investment", "mutual fund", "portfolio", "sip", "swp", "stp", "equity", "debt", "fd", "stock", "direct"],
  income_details: ["salary", "income", "bonus", "appraisal", "ctc", "business income", "cashflow"],
  family_dependents: ["family", "spouse", "wife", "husband", "son", "daughter", "child", "children", "dependent", "parent"],
  financial_goals: ["goal", "retirement", "education", "marriage", "house", "home", "car", "travel", "corpus"],
  risk_profile_notes: ["risk", "conservative", "balanced", "aggressive", "volatility", "drawdown"],
  follow_up_actions: ["follow up", "call", "send", "share", "remind", "collect", "check", "next meeting"],
};

export function normalizeSummary(summary = {}) {
  const normalizedInput = normalizeSummaryShape(summary);
  const merged = {
    ...EMPTY_SUMMARY,
    ...normalizedInput,
    product_opportunities: {
      ...EMPTY_SUMMARY.product_opportunities,
      ...(normalizedInput.product_opportunities || {}),
    },
  };

  for (const key of [
    "major_discussion_points",
    "client_current_situation",
    "existing_investments",
    "existing_insurance",
    "income_details",
    "family_dependents",
    "financial_goals",
    "risk_profile_notes",
    "kyc_concerns",
    "detected_pans",
    "important_figures",
    "documents_required",
    "follow_up_actions",
    "suggested_tasks",
    "suggested_reminders",
    "open_questions",
  ]) {
    merged[key] = Array.isArray(merged[key]) ? merged[key].filter(Boolean) : [];
  }

  for (const key of Object.keys(merged.product_opportunities)) {
    merged.product_opportunities[key] = Array.isArray(merged.product_opportunities[key])
      ? merged.product_opportunities[key].filter(Boolean)
      : [];
  }

  merged.detected_pans = [...new Set([...merged.detected_pans, ...detectPans(normalizedInput.raw_notes || "")])];
  merged.priority = ["Low", "Medium", "High", "Urgent"].includes(merged.priority) ? merged.priority : "Medium";
  merged.sentiment = merged.sentiment || "Neutral";

  return merged;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value).flatMap(asArray);
  if (typeof value === "string") {
    return value
      .split(/\n|•|- /)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function firstValue(source, keys, fallback = undefined) {
  for (const key of keys) {
    if (source?.[key] !== undefined && source[key] !== null) return source[key];
  }
  return fallback;
}

function normalizeSummaryShape(summary = {}) {
  const source = summary.summary && typeof summary.summary === "object" ? { ...summary.summary, ...summary } : summary;
  const product = source.product_opportunities || source.product_opportunity || source.opportunities || {};

  return {
    ...source,
    overview: firstValue(source, ["overview", "meeting_overview", "summary_overview", "meeting_summary"], source.overview),
    major_discussion_points: asArray(firstValue(source, ["major_discussion_points", "major_discussion", "discussion_points", "key_discussion_points"])),
    client_current_situation: asArray(firstValue(source, ["client_current_situation", "current_situation", "client_situation"])),
    existing_investments: asArray(firstValue(source, ["existing_investments", "investments", "investment_notes", "current_portfolio"])),
    existing_insurance: asArray(firstValue(source, ["existing_insurance", "insurance", "insurance_notes"])),
    income_details: asArray(firstValue(source, ["income_details", "income", "salary_details", "income_salary_bonus_appraisal_details"])),
    family_dependents: asArray(firstValue(source, ["family_dependents", "family_members_and_dependents", "family", "dependents"])),
    financial_goals: asArray(firstValue(source, ["financial_goals", "goals", "client_goals"])),
    risk_profile_notes: asArray(firstValue(source, ["risk_profile_notes", "risk_profile", "risk_factor_notes", "risk_notes"])),
    kyc_concerns: asArray(firstValue(source, ["kyc_concerns", "kyc_status_or_kyc_concerns", "kyc", "kyc_notes"])),
    detected_pans: asArray(firstValue(source, ["detected_pans", "pan_numbers_detected", "pan_numbers", "pans"])).map((pan) => String(pan).toUpperCase()),
    important_figures: asArray(firstValue(source, ["important_figures", "important_numbers", "figures", "amounts_discussed"])),
    documents_required: asArray(firstValue(source, ["documents_required", "required_documents", "documents"])),
    follow_up_actions: asArray(firstValue(source, ["follow_up_actions", "followups", "follow_ups", "action_items"])),
    suggested_tasks: asArray(firstValue(source, ["suggested_tasks", "tasks"])).map((item) => (
      typeof item === "string" ? { title: item, description: item, category: "Follow-up" } : item
    )),
    suggested_reminders: asArray(firstValue(source, ["suggested_reminders", "reminders"])).map((item) => (
      typeof item === "string" ? { title: item, notes: item } : item
    )),
    open_questions: asArray(firstValue(source, ["open_questions", "questions"])),
    product_opportunities: {
      mutual_funds: asArray(firstValue(product, ["mutual_funds", "mutual_fund", "mf"])),
      sip_swp_stp: asArray(firstValue(product, ["sip_swp_stp", "sip", "swp_stp", "sip_stp_swp"])),
      pms_aif: asArray(firstValue(product, ["pms_aif", "pms", "aif"])),
      gift_city: asArray(firstValue(product, ["gift_city", "gift"])),
      insurance: asArray(firstValue(product, ["insurance"])),
    },
  };
}

export function detectPans(text = "") {
  return [...new Set(String(text).toUpperCase().match(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g) || [])];
}

function splitSentences(text = "") {
  return String(text)
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function pickSentences(sentences, keywords, limit = 5) {
  const lowerKeywords = keywords.map((keyword) => keyword.toLowerCase());
  return sentences
    .filter((sentence) => lowerKeywords.some((keyword) => sentence.toLowerCase().includes(keyword)))
    .slice(0, limit);
}

function extractFigures(text = "") {
  const matches = String(text).match(/\b(?:rs\.?|inr|₹)?\s?\d[\d,]*(?:\.\d+)?\s?(?:lakh|lac|cr|crore|k|%|percent)?\b/gi) || [];
  return [...new Set(matches.map((match) => match.trim()))].slice(0, 12);
}

function inferPriority(text = "") {
  const lower = text.toLowerCase();
  if (/\burgent|asap|immediately|overdue|critical\b/.test(lower)) return "Urgent";
  if (/\bimportant|high priority|this week|deadline\b/.test(lower)) return "High";
  if (/\bwhenever|later|low priority\b/.test(lower)) return "Low";
  return "Medium";
}

function inferSentiment(text = "") {
  const lower = text.toLowerCase();
  if (/\bconcerned|worried|confused|unhappy|risk|delay\b/.test(lower)) return "Concerned";
  if (/\binterested|positive|ready|agreed|comfortable\b/.test(lower)) return "Positive";
  return "Neutral";
}

function detectDocuments(sentences) {
  const docs = new Set();
  const text = sentences.join(" ").toLowerCase();
  const candidates = [
    ["PAN card", "pan"],
    ["Aadhaar card", "aadhaar"],
    ["Bank proof", "bank proof"],
    ["Cancelled cheque", "cancelled cheque"],
    ["Address proof", "address proof"],
    ["Passport", "passport"],
    ["Salary slip", "salary slip"],
    ["Insurance policy copy", "policy copy"],
    ["NSDL/CAS statement", "nsdl"],
    ["CAS statement", "cas"],
  ];
  candidates.forEach(([label, needle]) => {
    if (text.includes(needle)) docs.add(label);
  });
  return [...docs];
}

function buildSuggestedTasks(summary) {
  const source = [
    ...summary.follow_up_actions,
    ...summary.documents_required.map((doc) => `Collect ${doc}`),
    ...summary.kyc_concerns.map((item) => `Check KYC: ${item}`),
  ];

  return [...new Set(source)]
    .slice(0, 6)
    .map((item) => ({
      title: item.length > 90 ? `${item.slice(0, 87)}...` : item,
      description: item,
      priority: summary.priority,
      category: item.toLowerCase().includes("kyc") ? "KYC" : "Follow-up",
    }));
}

function buildSuggestedReminders(summary) {
  return summary.follow_up_actions.slice(0, 5).map((item) => ({
    title: item.length > 90 ? `${item.slice(0, 87)}...` : item,
    notes: item,
    priority: summary.priority,
  }));
}

export function fallbackMeetingSummary(rawNotes = "") {
  const sentences = splitSentences(rawNotes);
  const firstSentences = sentences.slice(0, 3);
  const summary = {
    ...EMPTY_SUMMARY,
    overview: firstSentences.join(" ") || "Meeting notes captured. Generate or refine the structured summary after adding more detail.",
    major_discussion_points: sentences.slice(0, 6),
    client_current_situation: pickSentences(sentences, ["currently", "existing", "has", "income", "portfolio"], 5),
    existing_investments: pickSentences(sentences, SECTION_KEYWORDS.existing_investments),
    existing_insurance: pickSentences(sentences, SECTION_KEYWORDS.existing_insurance),
    income_details: pickSentences(sentences, SECTION_KEYWORDS.income_details),
    family_dependents: pickSentences(sentences, SECTION_KEYWORDS.family_dependents),
    financial_goals: pickSentences(sentences, SECTION_KEYWORDS.financial_goals),
    risk_profile_notes: pickSentences(sentences, SECTION_KEYWORDS.risk_profile_notes),
    kyc_concerns: pickSentences(sentences, SECTION_KEYWORDS.kyc_concerns),
    detected_pans: detectPans(rawNotes),
    important_figures: extractFigures(rawNotes),
    documents_required: detectDocuments(sentences),
    follow_up_actions: pickSentences(sentences, SECTION_KEYWORDS.follow_up_actions, 8),
    open_questions: sentences.filter((sentence) => sentence.endsWith("?")).slice(0, 5),
    sentiment: inferSentiment(rawNotes),
    priority: inferPriority(rawNotes),
    ai_generated: false,
  };

  const lower = rawNotes.toLowerCase();
  summary.product_opportunities = {
    mutual_funds: pickSentences(sentences, ["mutual fund", "mf", "lumpsum"]),
    sip_swp_stp: pickSentences(sentences, ["sip", "swp", "stp", "step up"]),
    pms_aif: pickSentences(sentences, ["pms", "aif"]),
    gift_city: pickSentences(sentences, ["gift city", "gift"]),
    insurance: pickSentences(sentences, ["insurance", "term plan", "health cover"]),
  };

  if (lower.includes("mutual fund") && summary.product_opportunities.mutual_funds.length === 0) {
    summary.product_opportunities.mutual_funds.push("Mutual fund opportunity discussed.");
  }

  summary.suggested_tasks = buildSuggestedTasks(summary);
  summary.suggested_reminders = buildSuggestedReminders(summary);

  return normalizeSummary({ ...summary, raw_notes: rawNotes });
}

export function meetingSummaryPrompt(rawNotes, client = null) {
  return [
    {
      role: "system",
      content:
        "You summarize mutual fund distributor CRM meeting notes into strict JSON. Do not invent facts. Use concise bullet strings. Return JSON only. The response must include keys: overview, major_discussion_points, client_current_situation, existing_investments, existing_insurance, income_details, family_dependents, financial_goals, risk_profile_notes, kyc_concerns, detected_pans, important_figures, product_opportunities, documents_required, follow_up_actions, suggested_tasks, suggested_reminders, open_questions, sentiment, priority.",
    },
    {
      role: "user",
      content: JSON.stringify({
        client_context: client
          ? {
              name: client.full_name,
              email: client.email,
              mobile: client.mobile,
              tax_status: client.tax_status,
              holding_pattern: client.holding_pattern,
              risk_category: client.risk_category,
              kyc_status: client.kyc_status,
            }
          : null,
        required_schema: EMPTY_SUMMARY,
        raw_meeting_notes: rawNotes,
      }),
    },
  ];
}

function stripJsonFence(content = "") {
  return String(content)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function mergeSummaryWithFallback(aiSummary, rawNotes) {
  const fallback = fallbackMeetingSummary(rawNotes);
  const ai = normalizeSummary({ ...aiSummary, raw_notes: rawNotes, ai_generated: true });
  const merged = {
    ...fallback,
    ...ai,
    overview: ai.overview || fallback.overview,
    product_opportunities: {
      ...fallback.product_opportunities,
      ...ai.product_opportunities,
    },
    ai_generated: true,
  };

  for (const key of [
    "major_discussion_points",
    "client_current_situation",
    "existing_investments",
    "existing_insurance",
    "income_details",
    "family_dependents",
    "financial_goals",
    "risk_profile_notes",
    "kyc_concerns",
    "detected_pans",
    "important_figures",
    "documents_required",
    "follow_up_actions",
    "suggested_tasks",
    "suggested_reminders",
    "open_questions",
  ]) {
    merged[key] = ai[key]?.length ? ai[key] : fallback[key];
  }

  for (const key of Object.keys(merged.product_opportunities)) {
    merged.product_opportunities[key] = ai.product_opportunities?.[key]?.length
      ? ai.product_opportunities[key]
      : fallback.product_opportunities[key];
  }

  return normalizeSummary({ ...merged, raw_notes: rawNotes });
}

export function parseAiSummary(content, rawNotes = "") {
  try {
    const parsed = JSON.parse(stripJsonFence(content));
    return mergeSummaryWithFallback(parsed, rawNotes);
  } catch {
    return fallbackMeetingSummary(rawNotes);
  }
}
