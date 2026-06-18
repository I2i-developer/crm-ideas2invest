export default function StatusBadge({ status }) {
  const colors = {
    Validated: "bg-green-100 text-green-700",
    Registered: "bg-blue-100 text-blue-700",
    "On-Hold": "bg-yellow-100 text-yellow-700",
    Rejected: "bg-red-100 text-red-700",
  };

  return (
    <span className={`px-4 py-2 rounded-xl text-sm font-medium ${colors[status]}`}>
      {status}
    </span>
  );
}