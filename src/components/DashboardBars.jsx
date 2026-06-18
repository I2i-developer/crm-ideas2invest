"use client";

export default function DashboardBars({ title, data = {}, empty = "No data yet." }) {
  const entries = Object.entries(data || {}).filter(([, value]) => Number(value) > 0);
  const total = entries.reduce((sum, [, value]) => sum + Number(value), 0);

  return (
    <div className="glass-card p-5 space-y-4">
      <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-gray-500">{empty}</p>
      ) : (
        <div className="space-y-3">
          {entries.map(([label, value]) => {
            const percent = total ? Math.round((Number(value) / total) * 100) : 0;
            return (
              <div key={label} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-gray-700">{label}</span>
                  <span className="font-semibold text-gray-900">{value}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(percent, 4)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
