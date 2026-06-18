"use client";

import { useEffect, useState } from "react";
import { formatDateDDMonYYYY } from "@/lib/dateFormat";

export default function HeaderDateTime() {
  const [now, setNow] = useState(null);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!now) {
    return (
      <div className="hidden rounded-2xl border border-gray-200 bg-white px-3 py-2 text-left shadow-sm md:block">
        <p className="text-xs font-medium text-gray-500">Today</p>
        <p className="text-sm font-semibold text-gray-900">--:--:--</p>
      </div>
    );
  }

  return (
    <div className="hidden rounded-2xl border border-gray-200 bg-white px-3 py-2 text-left shadow-sm md:block">
      <p className="text-xs font-medium text-gray-500">
        {formatDateDDMonYYYY(now, "-")}
      </p>
      <p className="text-sm font-semibold text-gray-900">
        {now.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </p>
    </div>
  );
}
