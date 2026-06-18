"use client";

const sideClasses = {
  top: "bottom-full left-1/2 mb-2 -translate-x-1/2",
  bottom: "left-1/2 top-full mt-2 -translate-x-1/2",
  left: "right-full top-1/2 mr-2 -translate-y-1/2",
  right: "left-full top-1/2 ml-2 -translate-y-1/2",
};

const arrowClasses = {
  top: "left-1/2 top-full -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-slate-950",
  bottom: "bottom-full left-1/2 -translate-x-1/2 border-x-4 border-b-4 border-x-transparent border-b-slate-950",
  left: "left-full top-1/2 -translate-y-1/2 border-y-4 border-l-4 border-y-transparent border-l-slate-950",
  right: "right-full top-1/2 -translate-y-1/2 border-y-4 border-r-4 border-y-transparent border-r-slate-950",
};

export default function CrmTooltip({
  content,
  children,
  side = "top",
  className = "",
  tooltipClassName = "",
}) {
  if (!content) return children;

  return (
    <span className={`group/crm-tooltip relative inline-flex ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-[9999] hidden max-w-64 whitespace-nowrap rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white shadow-2xl ring-1 ring-white/10 group-hover/crm-tooltip:block group-focus-within/crm-tooltip:block ${
          sideClasses[side] || sideClasses.top
        } ${tooltipClassName}`}
      >
        {content}
        <span className={`absolute h-0 w-0 ${arrowClasses[side] || arrowClasses.top}`} />
      </span>
    </span>
  );
}
