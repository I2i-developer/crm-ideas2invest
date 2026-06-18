"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabaseClient";
import FormSelect from "../../components/FormSelect";

export default function KycSection({ clientId, initialStatus = "Registered", onStatusChange, canEdit = false }) {
  const [kycStatus, setKycStatus] = useState(initialStatus);

  const saveKycStatus = async () => {
    const { error } = await supabase
      .from("clients")
      .update({ kyc_status: kycStatus })
      .eq("id", clientId);

    if (error) {
      toast.error("Failed to update KYC");
    } else {
      toast.success("KYC Status Updated");
      if (onStatusChange) onStatusChange(kycStatus);
    }
  };

  const kycOptions = [
    { value: "Validated", label: "Validated" },
    { value: "Registered", label: "Registered" },
    { value: "On-Hold", label: "On-Hold" },
    { value: "Rejected", label: "Rejected" },
  ];

  return (
    <div className="glass-card p-6">
      <h2 className="ml-1 text-lg font-semibold text-gray-800 mb-2">Current KYC Status</h2>
      <div className="flex items-center gap-6">
        {/* <select
          value={kycStatus}
          onChange={(e) => setKycStatus(e.target.value)}
          className="input w-60"
        >
          <option>Validated</option>
          <option>Registered</option>
          <option>On-Hold</option>
          <option>Rejected</option>
        </select> */}

        <FormSelect
          placeholder="KYC Status"
          options={kycOptions}
          value={kycStatus}
          onChange={(e) => setKycStatus(e.target.value)}
          disabled={!canEdit}
        />

        <button
          onClick={saveKycStatus}
          disabled={!canEdit}
          className="px-4 py-2 bg-blue-600 text-white w-40 rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          Save Status
        </button>
      </div>
    </div>
  );
}
