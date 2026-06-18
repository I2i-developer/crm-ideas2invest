"use client";

import FormInput from "./FormInput";
import KYCSection from "./KYCSection";

export default function ClientForm() {
  return (
    <div className="bg-white/60 backdrop-blur-lg p-6 rounded-2xl shadow-lg space-y-6">
      <div className="grid grid-cols-2 gap-6">
        <FormInput name="fullName" placeholder="Full Name" />
        <FormInput name="email" type="email" placeholder="Email Address" />
        <FormInput name="mobile" placeholder="Mobile Number" />
      </div>

      <KYCSection />

      <button className="mt-6 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition">
        Continue to Upload Documents
      </button>
    </div>
  );
}
