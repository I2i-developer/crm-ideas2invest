"use client";

import * as Tooltip from "@radix-ui/react-tooltip";

export default function CrmTooltip({
  content,
  children,
  side = "top",
  className = "",
  tooltipClassName = "",
}) {
  if (!content) return children;

  return (
    <Tooltip.Provider delayDuration={120}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild><span className={`relative inline-flex ${className}`}>{children}</span></Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content side={side} sideOffset={8} collisionPadding={12}
            style={{ maxWidth: "min(16rem, calc(100vw - 24px))" }}
            className={`pointer-events-none z-[10050] whitespace-normal break-words rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white shadow-2xl ring-1 ring-white/10 ${tooltipClassName}`}>
            {content}<Tooltip.Arrow className="fill-slate-950" width={8} height={4} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
