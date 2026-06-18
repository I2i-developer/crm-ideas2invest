import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext } from "@/lib/auth/permissions";
import ProvisionUserForm from "../system-gate/create-operator/components/ProvisionUserForm";

export default async function RegisterPage() {
  const supabase = await createClient();
  const { user } = await getAuthContext(supabase);

  // if (!user) {
  //   redirect("/login");
  // }

  return <ProvisionUserForm />;
}
