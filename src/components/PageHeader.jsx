export default function PageHeader({
  eyebrow,
  title,
  description,
  icon: _Icon,
  actions,
  tone = "default",
  compact = false,
}) {
  const tones = {
    default: "border-blue-100 bg-gradient-to-br from-white via-blue-50 to-emerald-50",
    blue: "border-blue-100 bg-gradient-to-br from-white via-blue-50 to-indigo-50",
    emerald: "border-emerald-100 bg-gradient-to-br from-white via-emerald-50 to-teal-50",
    amber: "border-amber-100 bg-gradient-to-br from-white via-amber-50 to-orange-50",
  };
  const eyebrowTones = {
    default: "text-blue-700",
    blue: "text-blue-700",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
  };

  return (
    <header className={`relative overflow-hidden rounded-2xl border sm:rounded-3xl ${tones[tone] || tones.default} ${compact ? "p-4 sm:p-5" : "p-4 sm:p-7"} shadow-[0_18px_45px_rgba(15,23,42,0.08)]`}>
      <div className="relative flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-5">
        <div className="min-w-0">
          {eyebrow && (
            <p className={`text-xs font-semibold uppercase tracking-wide sm:text-sm ${eyebrowTones[tone] || eyebrowTones.default}`}>
              {eyebrow}
            </p>
          )}
          <h1 className={`${eyebrow ? "mt-2" : ""} break-words text-2xl font-semibold text-slate-950 sm:text-3xl`}>{title}</h1>
          {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>}
        </div>
        {actions && <div className="relative flex w-full flex-wrap items-center gap-3 sm:w-auto">{actions}</div>}
      </div>
    </header>
  );
}
