"use client";

import { useMemo, useState } from "react";
import { Calculator, Delete, Divide, Equal, Minus, Percent, Plus, X } from "lucide-react";
import CrmTooltip from "@/components/CrmTooltip";

const BUTTONS = [
  ["C", "⌫", "%", "÷"],
  ["7", "8", "9", "×"],
  ["4", "5", "6", "-"],
  ["1", "2", "3", "+"],
  ["0", ".", "="],
];

function sanitizeExpression(value) {
  return value
    .replaceAll("×", "*")
    .replaceAll("÷", "/")
    .replaceAll("%", "/100")
    .replace(/[^0-9+\-*/().\s]/g, "");
}

function evaluateExpression(expression) {
  const sanitized = sanitizeExpression(expression);
  if (!sanitized.trim()) return "";
  // Limited calculator expression evaluation after strict character sanitizing.
  const result = Function(`"use strict"; return (${sanitized})`)();
  return Number.isFinite(result) ? String(Number.parseFloat(result.toFixed(10))) : "Error";
}

function buttonIcon(label) {
  if (label === "+") return <Plus size={15} />;
  if (label === "-") return <Minus size={15} />;
  if (label === "×") return <X size={15} />;
  if (label === "÷") return <Divide size={15} />;
  if (label === "%") return <Percent size={15} />;
  if (label === "=") return <Equal size={16} />;
  if (label === "⌫") return <Delete size={15} />;
  return label;
}

export default function HeaderBasicCalculator({ role }) {
  const [open, setOpen] = useState(false);
  const [display, setDisplay] = useState("0");

  const show = role === "operations";
  const expression = useMemo(() => display === "Error" ? "0" : display, [display]);
  if (!show) return null;

  function press(label) {
    if (label === "C") {
      setDisplay("0");
      return;
    }
    if (label === "⌫") {
      setDisplay((current) => (current.length <= 1 || current === "Error" ? "0" : current.slice(0, -1)));
      return;
    }
    if (label === "=") {
      try {
        setDisplay(evaluateExpression(expression));
      } catch {
        setDisplay("Error");
      }
      return;
    }

    setDisplay((current) => {
      const next = current === "0" || current === "Error" ? label : `${current}${label}`;
      return next.replace(/([+\-×÷.])\1+/g, "$1");
    });
  }

  return (
    <div className="relative">
      <CrmTooltip content="Basic calculator" side="bottom">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-pink-50 text-pink-700 shadow-sm transition hover:bg-white hover:text-pink-700 sm:h-11 sm:w-11"
          aria-label="Open calculator"
        >
          <Calculator size={19} />
        </button>
      </CrmTooltip>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close calculator"
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            onClick={() => setOpen(false)}
          />
          <div className="fixed right-3 top-[4.25rem] z-50 w-[min(320px,calc(100vw-1.5rem))] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:absolute sm:right-0 sm:top-14">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-950">Quick calculator</p>
                <p className="text-xs text-slate-500">For on-page calculations only</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>
            <div className="mb-3 min-h-14 rounded-xl border border-slate-200 bg-slate-950 px-4 py-3 text-right text-2xl font-semibold text-white">
              {display}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {BUTTONS.flat().map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => press(label)}
                  className={`flex h-11 items-center justify-center rounded-xl text-sm font-semibold transition ${
                    label === "="
                      ? "col-span-2 bg-emerald-600 text-white hover:bg-emerald-700"
                      : ["+", "-", "×", "÷", "%"].includes(label)
                        ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                        : label === "C" || label === "⌫"
                          ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                          : "bg-slate-100 text-slate-800 hover:bg-slate-200"
                  }`}
                >
                  {buttonIcon(label)}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
