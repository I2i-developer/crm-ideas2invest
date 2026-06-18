"use client";
export default function InfoField({ label, value }) {
  return (
    <div>
      <p className="text-gray-500 text-sm">{label}</p>
      <p className="font-medium text-gray-800 text-[15px]">{value}</p>
    </div>
  );
}