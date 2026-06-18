// "use client";

// import { Copy, Check, X } from "lucide-react";
// import { useState } from "react";
// import toast from "react-hot-toast";

// export default function ParsedDataModal({ parsedData, onClose }) {
//   const [copiedKey, setCopiedKey] = useState(null);

//   const copyValue = (value, key) => {
//     navigator.clipboard.writeText(value || "");
//     setCopiedKey(key);

//     toast.success("Copied");

//     setTimeout(() => setCopiedKey(null), 1500);
//   };

//   return (
//     <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
//       <div className="bg-white w-[600px] max-h-[80vh] overflow-y-auto rounded-2xl p-6 relative shadow-xl">

//         {/* Close Button */}
//         <button
//           className="absolute top-4 right-4 p-1 rounded hover:bg-gray-100"
//           onClick={onClose}
//           title="Close"
//         >
//           <X size={20} className="text-gray-500" />
//         </button>

//         <h2 className="text-xl font-semibold mb-6">Parsed KYC Data</h2>

//         <div className="space-y-3">
//           {Object.entries(parsedData).map(([key, value]) => (
//             <div
//               key={key}
//               className="flex justify-between items-center p-3 rounded-lg border bg-gray-50 hover:bg-gray-100 transition"
//             >
//               <div className="pr-4">
//                 <p className="text-xs text-gray-500 capitalize">{key}</p>
//                 <p className="font-medium text-gray-800 break-all">
//                   {value || "-"}
//                 </p>
//               </div>

//               <button
//                 onClick={() => copyValue(value, key)}
//                 className="p-2 rounded-md hover:bg-gray-200 transition"
//               >
//                 {copiedKey === key ? (
//                   <Check size={18} className="text-green-600" />
//                 ) : (
//                   <Copy size={18} className="text-gray-600" />
//                 )}
//               </button>
//             </div>
//           ))}
//         </div>
//       </div>
//     </div>
//   );
// }

"use client";

import { X, ExternalLink } from "lucide-react";
import { useRouter, useParams } from "next/navigation";

export default function ParsedDataModal({ parsedData, onClose }) {
  const router = useRouter();
  const { id } = useParams();

  const goToProfile = () => {
    sessionStorage.setItem(`parsed_kyc:${id}`, JSON.stringify(parsedData));
    router.push(`/admin/clients/${id}/client-details`);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white w-[600px] max-h-[80vh] overflow-y-auto rounded-2xl p-6 relative shadow-xl">

        {/* Close Button */}
        <button
          className="absolute top-4 right-4 p-1 rounded hover:bg-gray-100"
          onClick={onClose}
          title="Close"
        >
          <X size={20} className="text-gray-500" />
        </button>

        <h2 className="text-xl font-semibold mb-6">Parsed KYC Data</h2>

        <div className="space-y-3">
          {Object.entries(parsedData).map(([key, value]) => (
            <div
              key={key}
              className="flex justify-between items-center p-3 rounded-lg border bg-gray-50 hover:bg-gray-100 transition"
            >
              <div className="pr-4">
                <p className="text-xs text-gray-500 capitalize">{key}</p>
                <p className="font-medium text-gray-800 break-all">
                  {value || "-"}
                </p>
              </div>

            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition"
          >
            View Documents
          </button>
          <button
            onClick={goToProfile}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            Complete Client Profile
            <ExternalLink size={16} />
          </button>
        </div>

      </div>
    </div>
  );
}
