"use client";

import InfoField from "../components/InfoField";
import { formatDateDDMonYYYY } from "@/lib/dateFormat";

export default function ClientInfo({ client }) {
  if (!client) return null;

  return (
    <>
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold mb-6 text-gray-800">
            <span className="text-blue-700">Client</span> Information
        </h2>

        <div className="grid md:grid-cols-3 gap-6 text-sm">
            <InfoField label="Tax Status" value={client.tax_status || "Individual"} />
            <InfoField label="Holding Pattern" value={client.holding_pattern || "Single"} />
            <InfoField label="Full Name" value={client.full_name} />
            <InfoField label="Mobile" value={client.mobile} />
            <InfoField label="Email" value={client.email} />
            <InfoField label="Gender" value={client.gender} />
            <InfoField label="Marital Status" value={client.marital_status} />
            <InfoField label="Salary" value={client.salary_range} />
            <InfoField label="Occupation" value={client.occupation} />
            <InfoField label="Citizenship" value={client.citizenship} />
            <InfoField label="Residential Status" value={client.residential_status} />
            <InfoField label="Residential Address" value={client.residential_address} />
            <InfoField label="City" value={client.city} />
            <InfoField label="State" value={client.state} />
            <InfoField label="Country" value={client.country} />
            <InfoField label="PIN Code" value={client.pin_code} />
            {client.tax_status === "NRI" && (
              <>
                <InfoField label="Foreign Address" value={client.foreign_address} />
                <InfoField label="Passport Number" value={client.passport_number} />
                <InfoField label="Passport Expiry" value={client.passport_expiry_date} />
                <InfoField label="NRI Bank Account Type" value={client.nri_bank_account_type} />
              </>
            )}
            <InfoField label="Account Created" value={formatDateDDMonYYYY(client.created_at, "-")} />
        </div>
      </div>
      {client.tax_status !== "Minor" && (
        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold mb-6 text-gray-800">
              <span className="text-green-600">Nominee</span> Information
          </h2>

          <div className="grid md:grid-cols-3 gap-6 text-sm">
              <InfoField label="Nominee Name" value={client.nominee_name} />
              <InfoField label="Nominee Relation" value={client.nominee_relation} />
              <InfoField label="Nominee Share (%)" value={client.nominee_share ? `${client.nominee_share}%` : ""} />
              <InfoField label="Nominee Mobile" value={client.nominee_mobile} />
              <InfoField label="Nominee Email" value={client.nominee_email} />
          </div>
        </div>
      )}
    </>
  );
}
