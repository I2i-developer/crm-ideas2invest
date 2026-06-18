"use client";

import { useMemo, useRef, useState } from "react";
import {
  ArrowRightLeft,
  Calculator,
  Download,
  Flag,
  HeartPulse,
  IndianRupee,
  Landmark,
  LineChart,
  PiggyBank,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { Bar as BarChart, Doughnut, Line } from "react-chartjs-2";
import FormInput from "../clients/components/FormInput";
import PageHeader from "@/components/PageHeader";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, LineElement, PointElement, Filler, Tooltip, Legend);

const CALCULATORS = [
  { id: "sip", name: "SIP Calculator", category: "Mutual Funds", icon: PiggyBank },
  { id: "lumpsum", name: "Lumpsum Calculator", category: "Mutual Funds", icon: IndianRupee },
  { id: "mutual-fund", name: "Mutual Fund Calculator", category: "Mutual Funds", icon: LineChart },
  { id: "reverse", name: "Reverse Calculation", category: "Planning", icon: RefreshCw },
  { id: "goal", name: "Goal Planning", category: "Planning", icon: Flag },
  { id: "retirement", name: "Retirement Calculator", category: "Planning", icon: Landmark },
  { id: "swp", name: "SWP Calculator", category: "Withdrawal", icon: IndianRupee },
  { id: "stp", name: "STP Calculator", category: "Transfer", icon: ArrowRightLeft },
  { id: "mutual-ace", name: "Mutual + Ace Calculator", category: "Advanced", icon: TrendingUp },
  { id: "insurance-need", name: "Insurance Need Calculator", category: "Insurance", icon: HeartPulse },
];

const DEFAULTS = {
  sip: { monthly: 10000, returnRate: 12, years: 10, stepUp: 0 },
  lumpsum: { amount: 500000, returnRate: 12, years: 10 },
  "mutual-fund": { lumpsum: 200000, monthly: 10000, returnRate: 12, years: 10 },
  reverse: { target: 10000000, returnRate: 12, years: 10 },
  goal: { currentCost: 2500000, inflation: 6, years: 8, returnRate: 12, currentInvestment: 300000 },
  retirement: { currentAge: 35, retirementAge: 60, lifeExpectancy: 85, monthlyExpense: 100000, inflation: 6, preReturn: 12, postReturn: 7, currentCorpus: 1000000 },
  swp: { corpus: 5000000, monthlyWithdrawal: 40000, returnRate: 8, years: 15 },
  stp: { corpus: 1200000, monthlyTransfer: 50000, sourceReturn: 6, targetReturn: 12, months: 24 },
  "mutual-ace": { existingCorpus: 500000, monthly: 15000, annualStepUp: 10, lumpsum: 200000, returnRate: 13, years: 15 },
  "insurance-need": { annualExpense: 1200000, liabilities: 2500000, goals: 3000000, existingCover: 1000000, existingAssets: 1500000, yearsSupport: 15, inflation: 6, returnRate: 8 },
};

function currency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function compactCurrency(value) {
  const amount = Number.isFinite(value) ? value : 0;
  if (Math.abs(amount) >= 10000000) return `Rs. ${(amount / 10000000).toFixed(2)} Cr`;
  if (Math.abs(amount) >= 100000) return `Rs. ${(amount / 100000).toFixed(2)} L`;
  return currency(amount);
}

function number(value) {
  return Number(value || 0);
}

function monthlyRate(annualRate) {
  return number(annualRate) / 100 / 12;
}

function futureValueSip(monthly, annualRate, years, stepUp = 0) {
  const months = Math.max(0, Math.round(number(years) * 12));
  const rate = monthlyRate(annualRate);
  let invested = 0;
  let value = 0;

  for (let month = 1; month <= months; month += 1) {
    const yearIndex = Math.floor((month - 1) / 12);
    const contribution = number(monthly) * ((1 + number(stepUp) / 100) ** yearIndex);
    invested += contribution;
    value = (value + contribution) * (1 + rate);
  }

  return { invested, value, gains: value - invested };
}

function futureValueLumpsum(amount, annualRate, years) {
  const invested = number(amount);
  const value = invested * ((1 + number(annualRate) / 100) ** number(years));
  return { invested, value, gains: value - invested };
}

function requiredSip(target, annualRate, years) {
  const rate = monthlyRate(annualRate);
  const months = Math.max(1, Math.round(number(years) * 12));
  const factor = rate === 0 ? months : (((1 + rate) ** months - 1) / rate) * (1 + rate);
  return number(target) / factor;
}

const RETURN_KEYS = {
  sip: ["returnRate"],
  lumpsum: ["returnRate"],
  "mutual-fund": ["returnRate"],
  reverse: ["returnRate"],
  goal: ["returnRate"],
  retirement: ["preReturn", "postReturn"],
  swp: ["returnRate"],
  stp: ["sourceReturn", "targetReturn"],
  "mutual-ace": ["returnRate"],
  "insurance-need": ["returnRate"],
};

const SCENARIOS = [
  { id: "conservative", label: "Conservative", shift: -2, color: "#f59e0b" },
  { id: "base", label: "Base", shift: 0, color: "#2563eb" },
  { id: "growth", label: "Growth", shift: 2, color: "#16a34a" },
];

function applyScenario(activeId, inputs, scenarioId) {
  const scenario = SCENARIOS.find((item) => item.id === scenarioId) || SCENARIOS[1];
  const adjusted = { ...inputs };
  for (const key of RETURN_KEYS[activeId] || []) {
    adjusted[key] = Math.max(0, number(inputs[key]) + scenario.shift);
  }
  return adjusted;
}

function getDurationYears(activeId, inputs) {
  if (activeId === "retirement") return Math.max(1, number(inputs.retirementAge) - number(inputs.currentAge));
  if (activeId === "stp") return Math.max(1, Math.ceil(number(inputs.months) / 12));
  if (activeId === "insurance-need") return Math.max(1, number(inputs.yearsSupport));
  return Math.max(1, number(inputs.years));
}

function buildProjection(activeId, inputs) {
  const totalYears = Math.min(40, Math.max(1, Math.round(getDurationYears(activeId, inputs))));
  const points = [];

  for (let year = 0; year <= totalYears; year += 1) {
    const nextInputs = { ...inputs };
    if ("years" in nextInputs) nextInputs.years = year;
    if (activeId === "retirement") nextInputs.retirementAge = number(inputs.currentAge) + year;
    if (activeId === "stp") nextInputs.months = year * 12;
    if (activeId === "insurance-need") nextInputs.yearsSupport = Math.max(1, year);
    points.push({
      label: year === 0 ? "Today" : `Y${year}`,
      year,
      value: calculate(activeId, nextInputs).headline,
    });
  }

  return points;
}

function buildScenarioRows(activeId, inputs) {
  return SCENARIOS.map((scenario) => {
    const scenarioInputs = applyScenario(activeId, inputs, scenario.id);
    return {
      ...scenario,
      value: calculate(activeId, scenarioInputs).headline,
    };
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function chartImage(chartRef) {
  try {
    return chartRef.current?.toBase64Image?.("image/png", 1) || "";
  } catch {
    return "";
  }
}

function calculatorLabel(name) {
  return name.replace(/\s*Calculator\s*$/i, "").trim();
}

function calculate(activeId, inputs) {
  switch (activeId) {
    case "sip": {
      const result = futureValueSip(inputs.monthly, inputs.returnRate, inputs.years, inputs.stepUp);
      return {
        headline: result.value,
        label: "Expected corpus",
        metrics: [
          ["Total invested", result.invested],
          ["Estimated gains", result.gains],
          ["Maturity value", result.value],
        ],
        chart: [
          { label: "Invested", value: result.invested },
          { label: "Gains", value: result.gains },
        ],
      };
    }
    case "lumpsum": {
      const result = futureValueLumpsum(inputs.amount, inputs.returnRate, inputs.years);
      return {
        headline: result.value,
        label: "Expected maturity",
        metrics: [["Invested amount", result.invested], ["Estimated gains", result.gains], ["Maturity value", result.value]],
        chart: [{ label: "Invested", value: result.invested }, { label: "Gains", value: result.gains }],
      };
    }
    case "mutual-fund": {
      const sip = futureValueSip(inputs.monthly, inputs.returnRate, inputs.years);
      const lump = futureValueLumpsum(inputs.lumpsum, inputs.returnRate, inputs.years);
      return {
        headline: sip.value + lump.value,
        label: "Combined future value",
        metrics: [["Lumpsum value", lump.value], ["SIP value", sip.value], ["Total gains", sip.gains + lump.gains]],
        chart: [{ label: "Lumpsum", value: lump.value }, { label: "SIP", value: sip.value }],
      };
    }
    case "reverse": {
      const sip = requiredSip(inputs.target, inputs.returnRate, inputs.years);
      const lump = number(inputs.target) / ((1 + number(inputs.returnRate) / 100) ** number(inputs.years));
      return {
        headline: sip,
        label: "Required monthly SIP",
        metrics: [["Target corpus", number(inputs.target)], ["Required lumpsum today", lump], ["Monthly SIP required", sip]],
        chart: [{ label: "Lumpsum today", value: lump }, { label: "Monthly SIP x 12", value: sip * 12 }],
      };
    }
    case "goal": {
      const futureCost = number(inputs.currentCost) * ((1 + number(inputs.inflation) / 100) ** number(inputs.years));
      const currentValue = futureValueLumpsum(inputs.currentInvestment, inputs.returnRate, inputs.years).value;
      const gap = Math.max(0, futureCost - currentValue);
      const sip = requiredSip(gap, inputs.returnRate, inputs.years);
      return {
        headline: sip,
        label: "SIP needed for goal",
        metrics: [["Future goal cost", futureCost], ["Current investment future value", currentValue], ["Funding gap", gap], ["Monthly SIP required", sip]],
        chart: [{ label: "Current investment", value: currentValue }, { label: "Gap", value: gap }],
      };
    }
    case "retirement": {
      const yearsToRetire = Math.max(0, number(inputs.retirementAge) - number(inputs.currentAge));
      const retirementYears = Math.max(1, number(inputs.lifeExpectancy) - number(inputs.retirementAge));
      const monthlyAtRetirement = number(inputs.monthlyExpense) * ((1 + number(inputs.inflation) / 100) ** yearsToRetire);
      const annualExpense = monthlyAtRetirement * 12;
      const postReturn = number(inputs.postReturn) / 100;
      const corpusNeeded = annualExpense * ((1 - ((1 + postReturn) ** -retirementYears)) / Math.max(postReturn, 0.0001));
      const currentFuture = futureValueLumpsum(inputs.currentCorpus, inputs.preReturn, yearsToRetire).value;
      const gap = Math.max(0, corpusNeeded - currentFuture);
      const sip = requiredSip(gap, inputs.preReturn, yearsToRetire);
      return {
        headline: corpusNeeded,
        label: "Retirement corpus needed",
        metrics: [["Monthly expense at retirement", monthlyAtRetirement], ["Corpus needed", corpusNeeded], ["Existing corpus future value", currentFuture], ["Monthly SIP required", sip]],
        chart: [{ label: "Existing future corpus", value: currentFuture }, { label: "Gap", value: gap }],
      };
    }
    case "swp": {
      const months = Math.round(number(inputs.years) * 12);
      const rate = monthlyRate(inputs.returnRate);
      let balance = number(inputs.corpus);
      let totalWithdrawn = 0;
      for (let month = 1; month <= months && balance > 0; month += 1) {
        balance *= (1 + rate);
        const withdrawal = Math.min(balance, number(inputs.monthlyWithdrawal));
        balance -= withdrawal;
        totalWithdrawn += withdrawal;
      }
      return {
        headline: balance,
        label: "Remaining corpus",
        metrics: [["Initial corpus", number(inputs.corpus)], ["Total withdrawn", totalWithdrawn], ["Remaining corpus", balance]],
        chart: [{ label: "Withdrawn", value: totalWithdrawn }, { label: "Remaining", value: balance }],
      };
    }
    case "stp": {
      const months = Math.round(number(inputs.months));
      let source = number(inputs.corpus);
      let target = 0;
      const sourceRate = monthlyRate(inputs.sourceReturn);
      const targetRate = monthlyRate(inputs.targetReturn);
      let transferred = 0;
      for (let month = 1; month <= months && source > 0; month += 1) {
        source *= (1 + sourceRate);
        target *= (1 + targetRate);
        const transfer = Math.min(source, number(inputs.monthlyTransfer));
        source -= transfer;
        target += transfer;
        transferred += transfer;
      }
      return {
        headline: source + target,
        label: "Total portfolio value",
        metrics: [["Transferred amount", transferred], ["Source balance", source], ["Target fund value", target], ["Total value", source + target]],
        chart: [{ label: "Source", value: source }, { label: "Target", value: target }],
      };
    }
    case "mutual-ace": {
      const sip = futureValueSip(inputs.monthly, inputs.returnRate, inputs.years, inputs.annualStepUp);
      const existing = futureValueLumpsum(inputs.existingCorpus, inputs.returnRate, inputs.years);
      const lump = futureValueLumpsum(inputs.lumpsum, inputs.returnRate, inputs.years);
      return {
        headline: sip.value + existing.value + lump.value,
        label: "Advanced portfolio projection",
        metrics: [["Existing corpus value", existing.value], ["Fresh lumpsum value", lump.value], ["Step-up SIP value", sip.value], ["Total gains", existing.gains + lump.gains + sip.gains]],
        chart: [{ label: "Existing", value: existing.value }, { label: "Lumpsum", value: lump.value }, { label: "SIP", value: sip.value }],
      };
    }
    case "insurance-need": {
      const expenseCorpus = number(inputs.annualExpense) * ((1 + number(inputs.inflation) / 100) ** number(inputs.yearsSupport));
      const need = expenseCorpus + number(inputs.liabilities) + number(inputs.goals) - number(inputs.existingCover) - number(inputs.existingAssets);
      return {
        headline: Math.max(0, need),
        label: "Additional cover required",
        metrics: [["Family expense provision", expenseCorpus], ["Liabilities", number(inputs.liabilities)], ["Goals", number(inputs.goals)], ["Existing cover/assets", number(inputs.existingCover) + number(inputs.existingAssets)]],
        chart: [{ label: "Need", value: expenseCorpus + number(inputs.liabilities) + number(inputs.goals) }, { label: "Existing", value: number(inputs.existingCover) + number(inputs.existingAssets) }],
      };
    }
    default:
      return { headline: 0, label: "Result", metrics: [], chart: [] };
  }
}

const INPUTS = {
  sip: [["monthly", "Monthly SIP"], ["returnRate", "Expected Return (%)"], ["years", "Time Period (Years)"], ["stepUp", "Annual Step-up (%)"]],
  lumpsum: [["amount", "Investment Amount"], ["returnRate", "Expected Return (%)"], ["years", "Time Period (Years)"]],
  "mutual-fund": [["lumpsum", "Lumpsum Investment"], ["monthly", "Monthly SIP"], ["returnRate", "Expected Return (%)"], ["years", "Time Period (Years)"]],
  reverse: [["target", "Target Corpus"], ["returnRate", "Expected Return (%)"], ["years", "Time Period (Years)"]],
  goal: [["currentCost", "Goal Cost Today"], ["inflation", "Inflation (%)"], ["years", "Years to Goal"], ["returnRate", "Expected Return (%)"], ["currentInvestment", "Current Investment"]],
  retirement: [["currentAge", "Current Age"], ["retirementAge", "Retirement Age"], ["lifeExpectancy", "Life Expectancy"], ["monthlyExpense", "Monthly Expense Today"], ["inflation", "Inflation (%)"], ["preReturn", "Pre-retirement Return (%)"], ["postReturn", "Post-retirement Return (%)"], ["currentCorpus", "Current Corpus"]],
  swp: [["corpus", "Initial Corpus"], ["monthlyWithdrawal", "Monthly Withdrawal"], ["returnRate", "Expected Return (%)"], ["years", "Withdrawal Period (Years)"]],
  stp: [["corpus", "Source Corpus"], ["monthlyTransfer", "Monthly Transfer"], ["sourceReturn", "Source Return (%)"], ["targetReturn", "Target Return (%)"], ["months", "Transfer Period (Months)"]],
  "mutual-ace": [["existingCorpus", "Existing Corpus"], ["monthly", "Monthly SIP"], ["annualStepUp", "Annual SIP Step-up (%)"], ["lumpsum", "Fresh Lumpsum"], ["returnRate", "Expected Return (%)"], ["years", "Time Period (Years)"]],
  "insurance-need": [["annualExpense", "Annual Family Expense"], ["liabilities", "Outstanding Liabilities"], ["goals", "Future Goals"], ["existingCover", "Existing Insurance Cover"], ["existingAssets", "Existing Liquid Assets"], ["yearsSupport", "Years of Support"], ["inflation", "Inflation (%)"], ["returnRate", "Return on Corpus (%)"]],
};

export default function CalculatorsPage() {
  const [activeId, setActiveId] = useState("sip");
  const [inputs, setInputs] = useState(DEFAULTS);
  const [clientName, setClientName] = useState("");
  const [scenarioId, setScenarioId] = useState("base");
  const projectionChartRef = useRef(null);
  const breakdownChartRef = useRef(null);
  const scenarioChartRef = useRef(null);
  const active = CALCULATORS.find((calculator) => calculator.id === activeId) || CALCULATORS[0];
  const activeInputs = inputs[activeId];
  const effectiveInputs = useMemo(() => applyScenario(activeId, activeInputs, scenarioId), [activeId, activeInputs, scenarioId]);
  const result = useMemo(() => calculate(activeId, effectiveInputs), [activeId, effectiveInputs]);
  const projection = useMemo(() => buildProjection(activeId, effectiveInputs), [activeId, effectiveInputs]);
  const scenarioRows = useMemo(() => buildScenarioRows(activeId, activeInputs), [activeId, activeInputs]);

  function setInput(key, value) {
    setInputs((current) => ({
      ...current,
      [activeId]: {
        ...current[activeId],
        [key]: value,
      },
    }));
  }

  function resetCalculator() {
    setInputs((current) => ({ ...current, [activeId]: DEFAULTS[activeId] }));
    setScenarioId("base");
  }

  function applyQuickChange(key, delta) {
    setInputs((current) => ({
      ...current,
      [activeId]: {
        ...current[activeId],
        [key]: Math.max(0, number(current[activeId][key]) + delta),
      },
    }));
  }

  function exportPdf() {
    const clientLabel = clientName.trim() || "Client";
    const logoUrl = `${window.location.origin}/images/logo/logo.png`;
    const projectionImage = chartImage(projectionChartRef);
    const breakdownImage = chartImage(breakdownChartRef);
    const scenarioImage = chartImage(scenarioChartRef);
    const reportRows = result.metrics
      .map(([label, value]) => `<tr><td>${label}</td><td>${currency(value)}</td></tr>`)
      .join("");
    const inputRows = INPUTS[activeId]
      .map(([key, label]) => `<tr><td>${label}</td><td>${effectiveInputs[key]}</td></tr>`)
      .join("");
    const projectionRows = projection
      .map((point) => `<tr><td>${point.year === 0 ? "Today" : `Year ${point.year}`}</td><td>${currency(point.value)}</td></tr>`)
      .join("");
    const scenarioRowsHtml = scenarioRows
      .map((row) => `<tr><td>${row.label}</td><td>${row.shift > 0 ? `+${row.shift}%` : `${row.shift}%`}</td><td>${currency(row.value)}</td></tr>`)
      .join("");
    const reportHtml = `
      <html>
        <head>
          <title>${active.name} Result</title>
          <style>
            @page { margin: 18mm; }
            body { font-family: Arial, sans-serif; margin: 0; color: #172033; background: #ffffff; }
            .header { display: flex; align-items: center; justify-content: space-between; gap: 24px; border-bottom: 3px solid #2563eb; padding-bottom: 18px; margin-bottom: 24px; }
            .logo { max-width: 150px; max-height: 78px; object-fit: contain; }
            .eyebrow { color: #2563eb; font-size: 12px; font-weight: 700; text-transform: uppercase; }
            h1 { margin: 6px 0 0; font-size: 28px; }
            h2 { margin-top: 28px; }
            h3 { margin: 0 0 12px; color: #1e293b; }
            .client { color: #475569; margin-top: 8px; }
            .result { background: linear-gradient(135deg, #eff6ff, #ffffff); border: 1px solid #bfdbfe; border-radius: 18px; padding: 22px; margin-bottom: 22px; box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08); }
            .result p { margin: 0; color: #475569; }
            .result strong { display: block; margin-top: 8px; font-size: 34px; color: #0f172a; }
            .chart-grid { display: grid; grid-template-columns: 1fr; gap: 18px; margin-top: 16px; }
            .chart-card { border: 1px solid #e5e7eb; border-radius: 18px; padding: 16px; page-break-inside: avoid; box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06); }
            .chart-card img { display: block; width: 100%; max-height: 320px; object-fit: contain; }
            table { width: 100%; border-collapse: collapse; margin-top: 14px; }
            th { text-align: left; color: #64748b; font-size: 12px; text-transform: uppercase; }
            td, th { border-bottom: 1px solid #e5e7eb; padding: 11px 8px; }
            td:last-child { text-align: right; font-weight: 700; }
            .scenario td:nth-child(2), .scenario th:nth-child(2) { text-align: center; }
            .note { margin-top: 26px; color: #64748b; font-size: 12px; line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="eyebrow">Ideas2Invest CRM Calculator Report</div>
              <h1>${escapeHtml(active.name)}</h1>
              <div class="client">Prepared for: <strong>${escapeHtml(clientLabel)}</strong></div>
            </div>
            <img class="logo" src="${logoUrl}" alt="Ideas2Invest" />
          </div>
          <div class="result">
            <p>${escapeHtml(result.label)}</p>
            <strong>${currency(result.headline)}</strong>
          </div>
          <h2>Inputs</h2>
          <p class="note">Scenario: ${SCENARIOS.find((scenario) => scenario.id === scenarioId)?.label || "Base"}</p>
          <table>${inputRows}</table>
          <h2>Results</h2>
          <table>${reportRows}</table>
          <h2>Charts</h2>
          <div class="chart-grid">
            ${projectionImage ? `<div class="chart-card"><h3>Projection Chart</h3><img src="${projectionImage}" /></div>` : ""}
            ${breakdownImage ? `<div class="chart-card"><h3>Breakdown Chart</h3><img src="${breakdownImage}" /></div>` : ""}
            ${scenarioImage ? `<div class="chart-card"><h3>Scenario Comparison</h3><img src="${scenarioImage}" /></div>` : ""}
          </div>
          <h2>Year-wise Projection</h2>
          <table><thead><tr><th>Period</th><th>Projected value</th></tr></thead><tbody>${projectionRows}</tbody></table>
          <h2>Scenario Comparison</h2>
          <table class="scenario"><thead><tr><th>Scenario</th><th>Return shift</th><th>Outcome</th></tr></thead><tbody>${scenarioRowsHtml}</tbody></table>
          <p class="note">This report is an illustration based on user inputs. It is not investment advice and actual market returns can vary.</p>
        </body>
      </html>
    `;

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(reportHtml);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => iframe.remove(), 1000);
    }, 500);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Financial planning suite"
        title="Interactive CRM Calculators"
        description="Built-in investment, planning, retirement, withdrawal, transfer, and insurance calculators with exportable PDF-ready reports."
        icon={Calculator}
      />

      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="glass-card h-fit self-start p-3 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto scrollbar-hidden">
          <div className="space-y-1.5">
            {CALCULATORS.map((calculator) => {
              const Icon = calculator.icon;
              const selected = calculator.id === activeId;
              return (
                <button
                  key={calculator.id}
                  type="button"
                  onClick={() => setActiveId(calculator.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                    selected
                      ? "border-blue-300 bg-blue-50 text-blue-900 shadow-sm"
                      : "border-transparent bg-white/60 text-gray-700 hover:border-gray-200 hover:bg-white"
                  }`}
                >
                  <span className={`rounded-xl p-2 ${selected ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500"}`}>
                    <Icon size={19} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold">{calculatorLabel(calculator.name)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="min-w-0 space-y-6">
          <section className="glass-card p-5">
            <div className="grid gap-4 lg:grid-cols-[1fr_280px] lg:items-end">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Client-centric planning</p>
                <h2 className="mt-1 text-xl font-semibold text-gray-900">Prepare a named report for the client</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Enter the client name once and it will appear in the result card and exported PDF report.
                </p>
              </div>
              <FormInput
                label="Client Name"
                name="clientName"
                placeholder="Enter client name"
                value={clientName}
                onValueChange={setClientName}
              />
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            {SCENARIOS.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                onClick={() => setScenarioId(scenario.id)}
                className={`rounded-2xl border p-4 text-left transition ${
                  scenarioId === scenario.id
                    ? "border-blue-300 bg-blue-50 shadow-md"
                    : "border-white bg-white/70 hover:border-gray-200 hover:bg-white"
                }`}
              >
                <p className="text-sm font-semibold text-gray-900">{scenario.label}</p>
                <p className="mt-1 text-xs text-gray-500">
                  {scenario.shift > 0 ? `+${scenario.shift}%` : `${scenario.shift}%`} return assumption
                </p>
                <p className="mt-3 text-xl font-semibold text-gray-950">
                  {compactCurrency(scenarioRows.find((row) => row.id === scenario.id)?.value || 0)}
                </p>
              </button>
            ))}
          </section>

          <section className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
            <div className="glass-card p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">{active.category}</p>
                  <h2 className="text-2xl font-semibold text-gray-900">{active.name}</h2>
                </div>
                <button onClick={resetCalculator} className="rounded-lg border px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                  Reset
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {INPUTS[activeId].map(([key, label]) => (
                  <div key={key} className="rounded-2xl border border-gray-100 bg-white/70 p-3">
                    <FormInput
                      label={label}
                      name={key}
                      type="number"
                      value={activeInputs[key]}
                      onValueChange={(value) => setInput(key, value)}
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => applyQuickChange(key, key.toLowerCase().includes("rate") || key.toLowerCase().includes("return") || key.toLowerCase().includes("inflation") ? -1 : -1000)}
                        className="rounded-lg bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-200"
                      >
                        -
                      </button>
                      <button
                        type="button"
                        onClick={() => applyQuickChange(key, key.toLowerCase().includes("rate") || key.toLowerCase().includes("return") || key.toLowerCase().includes("inflation") ? 1 : 1000)}
                        className="rounded-lg bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <ResultCard active={active} result={result} clientName={clientName} onExport={exportPdf} />
          </section>

          <section className="grid gap-5">
            <ChartPanel
              title="Projection Chart"
              subtitle="Year-wise movement for the selected calculator and scenario."
            >
              <ProjectionChart points={projection} chartRef={projectionChartRef} />
            </ChartPanel>
            <ChartPanel
              title="Breakdown Chart"
              subtitle="Composition of invested value, gains, corpus, gap, or cover requirement."
            >
              <BreakdownChart result={result} chartRef={breakdownChartRef} />
            </ChartPanel>
            <ChartPanel
              title="Scenario Comparison"
              subtitle="Conservative, base, and growth assumptions shown side by side."
            >
              <ScenarioChart rows={scenarioRows} chartRef={scenarioChartRef} />
            </ChartPanel>
          </section>

          <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
            <ProjectionTable points={projection} />
            <InsightsPanel active={active} inputs={effectiveInputs} result={result} scenarioId={scenarioId} />
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            {result.metrics.slice(0, 3).map(([label, value]) => (
              <div key={label} className="glass-card p-5">
                <p className="text-sm text-gray-500">{label}</p>
                <p className="mt-2 text-2xl font-semibold text-gray-900">{currency(value)}</p>
              </div>
            ))}
          </section>
        </main>
      </div>
    </div>
  );
}

function ResultCard({ active, result, clientName, onExport }) {
  const Icon = active.icon;
  const clientLabel = clientName.trim() || "Client";
  return (
    <div className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-6 shadow-lg">
      <div className="flex items-start justify-between gap-4">
        <span className="rounded-2xl bg-blue-700 p-3 text-white">
          <Icon size={24} />
        </span>
        <button type="button" onClick={onExport} className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">
          <Download size={16} />
          Export PDF
        </button>
      </div>
      <p className="mt-5 rounded-2xl border border-blue-100 bg-white/70 px-4 py-3 text-sm font-semibold text-blue-900">
        Prepared for: {clientLabel}
      </p>
      <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-blue-700">{result.label}</p>
      <p className="mt-2 text-4xl font-semibold text-gray-950">{currency(result.headline)}</p>
      <div className="mt-6 space-y-3">
        {result.metrics.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between border-b border-blue-100 pb-2 text-sm">
            <span className="text-gray-500">{label}</span>
            <span className="font-semibold text-gray-900">{currency(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const chartPalette = ["#2563eb", "#16a34a", "#f59e0b", "#7c3aed", "#0891b2", "#db2777"];

function chartCurrency(value) {
  return compactCurrency(Number(value || 0));
}

function ChartPanel({ title, subtitle, children }) {
  return (
    <section className="glass-card p-6">
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
        <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function ProjectionChart({ points, chartRef }) {
  const values = points.map((point) => Math.max(0, number(point.value)));
  const hasData = values.some((value) => value > 0);

  if (!hasData) {
    return <EmptyVisual text="Adjust inputs to generate a projection chart." />;
  }

  return (
    <div className="h-[330px] rounded-2xl border border-blue-100 bg-white/80 p-4">
      <Line
        ref={chartRef}
        data={{
          labels: points.map((point) => point.label),
          datasets: [
            {
              label: "Projected value",
              data: values,
              borderColor: "#2563eb",
              backgroundColor: "rgba(37, 99, 235, 0.14)",
              fill: true,
              tension: 0.38,
              borderWidth: 3,
              pointRadius: 3,
              pointHoverRadius: 6,
              pointBackgroundColor: "#ffffff",
              pointBorderColor: "#2563eb",
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          interaction: { intersect: false, mode: "index" },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (context) => `Value: ${chartCurrency(context.parsed.y)}`,
              },
            },
          },
          scales: {
            x: {
              ticks: { color: "#64748b", maxTicksLimit: 9 },
              grid: { display: false },
            },
            y: {
              ticks: {
                color: "#64748b",
                callback: (value) => chartCurrency(value),
              },
              grid: { color: "rgba(148, 163, 184, 0.18)" },
            },
          },
        }}
      />
    </div>
  );
}

function BreakdownChart({ result, chartRef }) {
  const entries = result.chart.filter((item) => number(item.value) > 0);

  if (!entries.length) {
    return <EmptyVisual text="No allocation breakdown is available for these inputs yet." />;
  }

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(260px,360px)_minmax(0,1fr)]">
      <div className="h-[320px] rounded-2xl border border-blue-100 bg-white/80 p-4">
        <Doughnut
          ref={chartRef}
          data={{
            labels: entries.map((item) => item.label),
            datasets: [
              {
                data: entries.map((item) => number(item.value)),
                backgroundColor: entries.map((_, index) => chartPalette[index % chartPalette.length]),
                borderColor: "#ffffff",
                borderWidth: 4,
                hoverOffset: 10,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            cutout: "64%",
            plugins: {
              legend: {
                position: "bottom",
                labels: {
                  boxWidth: 10,
                  color: "#475569",
                  font: { size: 12, weight: 600 },
                },
              },
              tooltip: {
                callbacks: {
                  label: (context) => `${context.label}: ${chartCurrency(context.parsed)}`,
                },
              },
            },
          }}
        />
      </div>
      <div className="space-y-4">
        {entries.map((item, index) => (
          <VisualBar key={item.label} item={item} max={Math.max(...entries.map((entry) => number(entry.value)), 1)} index={index} />
        ))}
      </div>
    </div>
  );
}

function ScenarioChart({ rows, chartRef }) {
  const values = rows.map((row) => Math.max(0, number(row.value)));
  const hasData = values.some((value) => value > 0);

  if (!hasData) {
    return <EmptyVisual text="Scenario comparison will appear after valid inputs are entered." />;
  }

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
      <div className="h-[320px] rounded-2xl border border-blue-100 bg-white/80 p-4">
        <BarChart
          ref={chartRef}
          data={{
            labels: rows.map((row) => row.label),
            datasets: [
              {
                label: "Outcome",
                data: values,
                backgroundColor: rows.map((row) => row.color),
                borderRadius: 12,
                borderSkipped: false,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (context) => `Outcome: ${chartCurrency(context.parsed.y)}`,
                },
              },
            },
            scales: {
              x: {
                ticks: { color: "#64748b", font: { weight: 600 } },
                grid: { display: false },
              },
              y: {
                ticks: {
                  color: "#64748b",
                  callback: (value) => chartCurrency(value),
                },
                grid: { color: "rgba(148, 163, 184, 0.18)" },
              },
            },
          }}
        />
      </div>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="rounded-2xl border border-gray-100 bg-white/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900">{row.label}</p>
                <p className="text-xs text-gray-500">{row.shift > 0 ? `+${row.shift}%` : `${row.shift}%`} return assumption</p>
              </div>
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: row.color }} />
            </div>
            <p className="mt-3 text-2xl font-semibold text-gray-950">{currency(row.value)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectionTable({ points }) {
  return (
    <section className="glass-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Projection Milestones</h2>
          <p className="mt-1 text-sm text-gray-500">Complete year-wise table for the selected client scenario.</p>
        </div>
      </div>
      <div className="max-h-[420px] overflow-auto rounded-2xl border border-gray-100 bg-white/80">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-blue-50 text-left text-xs uppercase tracking-wide text-blue-800">
            <tr>
              <th className="px-4 py-3 font-semibold">Period</th>
              <th className="px-4 py-3 text-right font-semibold">Projected Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {points.map((point) => (
              <tr key={`${point.year}-${point.value}`} className="hover:bg-blue-50/60">
                <td className="px-4 py-3 font-medium text-gray-700">{point.year === 0 ? "Today" : `Year ${point.year}`}</td>
                <td className="px-4 py-3 text-right font-semibold text-gray-950">{currency(point.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function InsightsPanel({ active, inputs, result, scenarioId }) {
  const scenario = SCENARIOS.find((item) => item.id === scenarioId) || SCENARIOS[1];
  const growthMetric = result.metrics.find(([label]) => label.toLowerCase().includes("gain"));
  const investedMetric = result.metrics.find(([label]) => label.toLowerCase().includes("invested") || label.toLowerCase().includes("initial"));
  const gainPercent = investedMetric?.[1] ? (number(growthMetric?.[1]) / Math.max(1, number(investedMetric[1]))) * 100 : null;

  return (
    <section className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-lg">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">Advisor insight</p>
      <h2 className="mt-2 text-xl font-semibold">{active.name}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-300">
        The {scenario.label.toLowerCase()} scenario is currently active. Every change in the calculator updates the result, projection, and report instantly.
      </p>
      <div className="mt-5 grid gap-3">
        <InsightStat label="Scenario shift" value={`${scenario.shift > 0 ? "+" : ""}${scenario.shift}%`} />
        <InsightStat label="Headline result" value={compactCurrency(result.headline)} />
        {gainPercent !== null && <InsightStat label="Growth on base amount" value={`${gainPercent.toFixed(1)}%`} />}
        {"years" in inputs && <InsightStat label="Planning period" value={`${number(inputs.years)} years`} />}
      </div>
      <p className="mt-5 rounded-2xl border border-white/10 bg-white/10 p-4 text-sm leading-6 text-slate-200">
        Use this as an illustration during client discussions. Exported reports should be treated as planning estimates, not guaranteed returns.
      </p>
    </section>
  );
}

function InsightStat({ label, value }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
      <span className="text-sm text-slate-300">{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}

function VisualBar({ item, max, index }) {
  const colors = ["bg-blue-600", "bg-emerald-500", "bg-violet-500", "bg-amber-500", "bg-cyan-600", "bg-pink-600"];
  const width = `${Math.max(6, (number(item.value) / Math.max(max, 1)) * 100)}%`;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white/80 p-4">
      <div className="mb-2 flex justify-between text-sm">
        <span className="font-medium text-gray-700">{item.label}</span>
        <span className="font-semibold text-gray-900">{currency(item.value)}</span>
      </div>
      <div className="h-4 overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full ${colors[index % colors.length]}`} style={{ width }} />
      </div>
    </div>
  );
}

function EmptyVisual({ text }) {
  return (
    <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white/70 px-4 text-center text-sm text-gray-500">
      {text}
    </div>
  );
}


