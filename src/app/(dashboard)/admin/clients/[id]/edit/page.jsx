"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { z } from "zod";
import { ChevronLeft, UserRoundCog } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  getDefaultHoldingPattern,
  getHoldingPatternOptions,
  TAX_STATUS,
  TAX_STATUS_OPTIONS,
} from "@/lib/crm/onboardingRules";
import FormInput from "../../components/FormInput";
import FormSelect from "../../components/FormSelect";
import PageHeader from "@/components/PageHeader";

export default function ClientDetails() {

  const router = useRouter();
  const { id } = useParams();
  const searchParams = useSearchParams();
  const editQuery = searchParams.get("edit");

  const [client, setClient] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  const clientSchema = z.object({
    full_name: z.string().min(2, "Name is too short"),
    email: z.string().email("Invalid email"),
    mobile: z.string().min(10, "Invalid mobile number"),
  });

  useEffect(() => {
    if (editQuery === "true") {
      setEditMode(true);
    }
  }, [editQuery]);

  const fetchClient = useCallback(async () => {

    setFetching(true);

    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error(error);
      setFetching(false);
      return;
    }

    setClient(data);
    setFetching(false);
  }, [id]);

  useEffect(() => {
    if (id) fetchClient();
  }, [fetchClient, id]);

  function handleChange(field, value) {
    if (field === "tax_status") {
      setClient((prev) => ({
        ...prev,
        tax_status: value,
        holding_pattern: getDefaultHoldingPattern(value),
      }));
      return;
    }

    setClient((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  async function handleUpdate() {

    const result = clientSchema.safeParse(client);

    if (!result.success) {
      toast.error(result.error.issues[0].message);
      return;
    }

    setLoading(true);

    toast.loading("Updating profile...", { id: "update" });

    const { error } = await supabase
      .from("clients")
      .update(client)
      .eq("id", id);

    setLoading(false);

    if (error) {
      toast.error("Update failed", { id: "update" });
      return;
    }

    toast.success("Profile updated", { id: "update" });
    setEditMode(false);
  }

  if (fetching) {
    return (
      <div className="p-6">
        <p className="text-gray-500">Loading client profile...</p>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-6">
        <p className="text-red-500">Client not found</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">

      <PageHeader
        eyebrow="Client workspace"
        title="Client Profile"
        description="View, edit and manage client information."
        icon={UserRoundCog}
        actions={
          <>
          <button
            onClick={() => router.push("/admin/clients")}
            className="group flex items-center gap-1 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-lg transition hover:bg-blue-50"
          >
            <ChevronLeft size={20} className="group-hover:-translate-x-1"/>
            Back
          </button>

        {!editMode ? (
          <button
            onClick={() => setEditMode(true)}
            className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 shadow-lg transition hover:bg-blue-50"
          >
            Edit Profile
          </button>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={() => setEditMode(false)}
              className="px-4 py-2 bg-gray-300 rounded-xl"
            >
              Cancel
            </button>

            <button
              onClick={handleUpdate}
              disabled={loading}
              className="px-5 py-2 bg-green-600 text-white rounded-xl shadow"
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        )}
          </>
        }
      />

      {/* CLIENT DETAILS */}

      <div className="glass-card p-6 space-y-6">

        <h2 className="text-lg font-semibold">
          Onboarding Setup
        </h2>

        <div className="grid grid-cols-2 gap-6">
          <FormSelect
            label="Tax Status"
            name="tax_status"
            value={client.tax_status || TAX_STATUS.INDIVIDUAL}
            disabled={!editMode}
            options={TAX_STATUS_OPTIONS.map((option) => option.value)}
            onValueChange={(value)=>handleChange("tax_status",value)}
          />

          <FormSelect
            label="Holding Pattern"
            name="holding_pattern"
            value={client.holding_pattern || "Single"}
            disabled={!editMode}
            options={getHoldingPatternOptions(client.tax_status || TAX_STATUS.INDIVIDUAL).map((option) => option.value)}
            onValueChange={(value)=>handleChange("holding_pattern",value)}
          />

        </div>

      </div>

      <div className="glass-card p-6 space-y-6">

        <h2 className="text-lg font-semibold">
          Client Details
        </h2>

        <div className="grid grid-cols-2 gap-6">

          <FormInput label="Full Name" name="full_name" value={client.full_name} disabled={!editMode}
            onValueChange={(value)=>handleChange("full_name",value)}/>

          <FormInput label="Email" name="email" value={client.email} disabled={!editMode}
            onValueChange={(value)=>handleChange("email",value)}/>

          <FormInput label="Mobile" name="mobile" value={client.mobile} disabled={!editMode}
            onValueChange={(value)=>handleChange("mobile",value)}/>

          {/* Gender */}

          <FormSelect label="Gender"
            name="gender"
            value={client.gender}
            disabled={!editMode}
            options={["MALE","FEMALE","TRANSGENDER","PREFER NOT TO SAY"]}
            onValueChange={(value)=>handleChange("gender",value)}
          />

          {/* Marital Status */}

          <FormSelect label="Marital Status"
            name="marital_status"
            value={client.marital_status}
            disabled={!editMode}
            options={["MARRIED","UNMARRIED","OTHERS"]}
            onValueChange={(value)=>handleChange("marital_status",value)}
          />

          {/* Salary */}

          <FormSelect label="Salary Range"
            name="salary_range"
            value={client.salary_range}
            disabled={!editMode}
            options={[
              "BELOW 1 Lac",
              "1 - 5 Lac",
              "5 - 10 Lac",
              "10 - 25 Lac",
              "25 Lac - 1 Cr",
              "> 1 Cr"
            ]}
            onValueChange={(value)=>handleChange("salary_range",value)}
          />

          {/* Occupation */}

          <FormSelect label="Occupation"
            name="occupation"
            value={client.occupation}
            disabled={!editMode}
            options={[
              "BUSINESS",
              "PROFESSIONAL",
              "PRIVATE SECTOR",
              "PUBLIC SECTOR",
              "GOVT SERVICES",
              "AGRICULTURE",
              "HOUSEWIFE",
              "STUDENT",
              "RETIRED",
              "OTHERS"
            ]}
            onValueChange={(value)=>handleChange("occupation",value)}
          />

          {/* Citizenship */}

          <FormSelect label="Citizenship"
            name="citizenship"
            value={client.citizenship}
            disabled={!editMode}
            options={["INDIAN","OTHERS"]}
            onValueChange={(value)=>handleChange("citizenship",value)}
          />

          {client.citizenship === "OTHERS" && (
            <FormInput label="Country"
              name="citizenship_country"
              value={client.citizenship_country}
              disabled={!editMode}
              onValueChange={(value)=>handleChange("citizenship_country",value)}
            />
          )}

          {/* Residential Status */}

          <FormSelect label="Residential Status"
            name="residential_status"
            value={client.residential_status}
            disabled={!editMode}
            options={[
              "RESIDENT INDIVIDUAL",
              "NON RESIDENT INDIAN",
              "FOREIGN NATIONAL",
              "PERSON OF INDIAN ORIGIN"
            ]}
            onValueChange={(value)=>handleChange("residential_status",value)}
          />

        </div>

      </div>

      {client.tax_status !== TAX_STATUS.MINOR && (
        <div className="glass-card p-6 space-y-6">

          <h2 className="text-lg font-semibold">
            Nominee Details
          </h2>

          <div className="grid grid-cols-2 gap-6">

            <FormInput label="Nominee Name"
              name="nominee_name"
              value={client.nominee_name}
              disabled={!editMode}
              onValueChange={(value)=>handleChange("nominee_name",value)}
            />

            <FormInput label="Relation"
              name="nominee_relation"
              value={client.nominee_relation}
              disabled={!editMode}
              onValueChange={(value)=>handleChange("nominee_relation",value)}
            />

            <FormInput label="Share (%)"
              name="nominee_share"
              value={client.nominee_share}
              disabled={!editMode}
              onValueChange={(value)=>handleChange("nominee_share",value)}
            />

            <FormInput label="Nominee Email"
              name="nominee_email"
              value={client.nominee_email}
              disabled={!editMode}
              onValueChange={(value)=>handleChange("nominee_email",value)}
            />

            <FormInput label="Nominee Mobile"
              name="nominee_mobile"
              value={client.nominee_mobile}
              disabled={!editMode}
              onValueChange={(value)=>handleChange("nominee_mobile",value)}
            />

          </div>

        </div>
      )}

    </div>
  );
}

// "use client";

// import { useEffect, useState } from "react";
// import { useRouter } from "next/navigation";
// import toast from "react-hot-toast";
// import { z } from "zod";
// import { ChevronLeft } from "lucide-react";
// import { useParams, useSearchParams } from "next/navigation";
// import { supabase } from "@/lib/supabaseClient";

// export default function ClientDetails() {
//   const router = useRouter();
//   const { id } = useParams();
//   const searchParams = useSearchParams();
//   const editQuery = searchParams.get("edit");

//   const [client, setClient] = useState(null);
//   const [editMode, setEditMode] = useState(false);
//   const [loading, setLoading] = useState(false);
//   const [fetching, setFetching] = useState(true);

//   const clientSchema = z.object({
//     full_name: z.string().min(2, "Name is too short"),
//     email: z.string().email("Invalid email"),
//     mobile: z.string().min(10, "Invalid mobile number"),
//     dob: z.string().optional(),
//     kyc_status: z.string(),
//   });

//   // Enable edit mode from query
//   useEffect(() => {
//     if (editQuery === "true") {
//       setEditMode(true);
//     }
//   }, [editQuery]);

//   // Fetch client
//   useEffect(() => {
//     if (id) fetchClient();
//   }, [id]);

//   async function fetchClient() {
//     setFetching(true);

//     const { data, error } = await supabase
//       .from("clients")
//       .select("*")
//       .eq("id", id)
//       .single();

//     if (error) {
//       console.error("Fetch error:", error);
//       setFetching(false);
//       return;
//     }

//     setClient(data);
//     setFetching(false);
//   }

//   function handleChange(field, value) {
//     setClient((prev) => ({
//       ...prev,
//       [field]: value,
//     }));
//   }

//   async function handleUpdate() {

//     const result = clientSchema.safeParse(client);

//     if (!result.success) {
//         toast.error(result.error.issues[0].message);
//         return;
//     }

//     setLoading(true);

//     const oldClient = { ...client };

//     toast.loading("Updating profile...", { id: "update" });

//     const { error } = await supabase
//         .from("clients")
//         .update(client)
//         .eq("id", id);

//     setLoading(false);

//     if (error) {
//         setClient(oldClient);
//         toast.error("Update failed", { id: "update" });
//         return;
//     }

//     toast.success("Profile updated", { id: "update" });
//     setEditMode(false);
//   }

//   if (fetching) {
//     return (
//       <div className="p-6">
//         <p className="text-gray-500">Loading client profile...</p>
//       </div>
//     );
//   }

//   if (!client) {
//     return (
//       <div className="p-6">
//         <p className="text-red-500">Client not found</p>
//       </div>
//     );
//   }

//   return (
//     <div className="p-6 space-y-8">

//       {/* Header */}
//       <div className="flex justify-between items-center">
//         {/* <div>
//           <h1 className="text-3xl font-semibold text-gray-800">
//             Client Profile
//           </h1>
//           <p className="text-sm text-gray-500 mt-1">
//             View and manage client information
//           </p>
//         </div> */}
//         <div className="flex items-center gap-6">
//             <button
//                 onClick={() => router.push("/admin/clients")}
//                 className="group flex items-center gap-1 px-4 py-3 bg-white border border-gray-200 rounded-2xl 
//                             font-medium text-gray-700 shadow-xs hover:scale-105 duration-200 "
//                 >
//                 <ChevronLeft size={20} className="transition-transform group-hover:-translate-x-1" />
//                 Back
//             </button>
//             <div>
//             <h1 className="text-3xl font-semibold text-gray-800">
//                 Client Profile
//             </h1>
//             <p className="text-sm text-gray-500">
//                 View and manage client information
//             </p>
//             </div>

//         </div>

//         {!editMode ? (
//           <button
//             onClick={() => setEditMode(true)}
//             className="px-5 py-2 bg-blue-600 text-white rounded-xl shadow hover:scale-105 transition"
//           >
//             Edit Profile
//           </button>
//         ) : (
//           <div className="flex gap-3">
//             <button
//               onClick={() => setEditMode(false)}
//               className="px-4 py-2 bg-gray-300 rounded-xl"
//             >
//               Cancel
//             </button>

//             <button
//               onClick={handleUpdate}
//               disabled={loading}
//               className="px-5 py-2 bg-green-600 text-white rounded-xl shadow"
//             >
//               {loading ? "Saving..." : "Save Changes"}
//             </button>
//           </div>
//         )}
//       </div>

//       {/* Profile Card */}
//       <div className="glass-card p-6 space-y-6">

//         <div className="grid grid-cols-2 gap-6">

//           {/* Full Name */}
//           <div>
//             <label className="text-sm text-gray-500">Full Name</label>
//             <input
//               className="input mt-1"
//               value={client.full_name || ""}
//               disabled={!editMode}
//               onChange={(e) => handleChange("full_name", e.target.value)}
//             />
//           </div>

//           {/* Email */}
//           <div>
//             <label className="text-sm text-gray-500">Email</label>
//             <input
//               className="input mt-1"
//               value={client.email || ""}
//               disabled={!editMode}
//               onChange={(e) => handleChange("email", e.target.value)}
//             />
//           </div>

//           {/* Mobile */}
//           <div>
//             <label className="text-sm text-gray-500">Mobile</label>
//             <input
//               className="input mt-1"
//               value={client.mobile || ""}
//               disabled={!editMode}
//               onChange={(e) => handleChange("mobile", e.target.value)}
//             />
//           </div>

//           {/* DOB */}
//           <div>
//             <label className="text-sm text-gray-500">Date of Birth</label>
//             <input
//               type="date"
//               className="input mt-1"
//               value={client.dob || ""}
//               disabled={!editMode}
//               onChange={(e) => handleChange("dob", e.target.value)}
//             />
//           </div>

//           {/* KYC */}
//           {/* <div>
//             <label className="text-sm text-gray-500">KYC Status</label>
//             <select
//               className="input mt-1"
//               value={client.kyc_status || ""}
//               disabled={!editMode}
//               onChange={(e) => handleChange("kyc_status", e.target.value)}
//             >
//               <option value="Registered">Registered</option>
//               <option value="Validated">Validated</option>
//               <option value="On-Hold">On-Hold</option>
//               <option value="Rejected">Rejected</option>
//             </select>
//           </div> */}

//         </div>

//       </div>
//     </div>
//   );
// }
