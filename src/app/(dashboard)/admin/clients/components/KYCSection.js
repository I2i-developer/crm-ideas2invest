import FormSelect from "./FormSelect";

export default function KYCSection() {
  return (
    <div className="border-t pt-6">
      <h2 className="text-lg font-semibold mb-4">KYC Verification</h2>

      <a
        href="https://www.cvlkra.com/"
        target="_blank"
        className="text-blue-600 underline"
      >
        Check KYC on Official Website
      </a>

      <div className="mt-4 grid grid-cols-3 gap-4">
        <FormSelect
          name="kyc_status"
          placeholder="KYC Status"
          options={["Validated", "Registered", "On-Hold", "Rejected"]}
        />

        <input type="file" className="input" />
        <input type="file" className="input" />
      </div>
    </div>
  );
}
