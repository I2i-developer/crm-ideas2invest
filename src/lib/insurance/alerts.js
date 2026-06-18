import { createNotification } from "@/lib/notifications/service";
import { inferPaymentStatus } from "@/lib/insurance/renewals";
import { formatDateDDMonYYYY } from "@/lib/dateFormat";

function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export async function generateInsuranceRenewalNotifications(supabase, userId) {
  if (!userId) return;

  const today = new Date();
  const todayKey = dateKey(today);
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + 30);

  const { data: policies, error } = await supabase
    .from("insurance_policies")
    .select("*, client:clients(id, full_name)")
    .eq("status", "Active")
    .not("renewal_date", "is", null)
    .lte("renewal_date", dateKey(windowEnd));

  if (error) {
    console.error("Insurance renewal notification lookup failed:", error.message || error);
    return;
  }

  await Promise.all(
    (policies || []).map((policy) => {
      if (inferPaymentStatus(policy, todayKey) === "Paid") return null;
      const renewalDate = policy.renewal_date;
      const type =
        renewalDate < todayKey
          ? "insurance_renewal_overdue"
          : renewalDate === todayKey
            ? "insurance_renewal_due_today"
            : "insurance_renewal_upcoming";

      const title =
        type === "insurance_renewal_overdue"
          ? "Insurance renewal overdue"
          : type === "insurance_renewal_due_today"
            ? "Insurance renewal due today"
            : "Upcoming insurance renewal";
      const clientName = policy.client?.full_name || policy.imported_client_name || "Policy holder";

      const notification = createNotification(supabase, {
        userId,
        title,
        message: `${clientName} ${policy.policy_type || "insurance"} renewal date is ${formatDateDDMonYYYY(renewalDate, renewalDate)}.`,
        type,
        entityType: "insurance_policy",
        entityId: policy.id,
        linkUrl: `/admin/insurance?client_id=${policy.client_id}`,
        metadata: {
          client_id: policy.client_id,
          client_name: clientName,
          renewal_date: renewalDate,
          insurance_company: policy.insurance_company,
        },
        dedupeKey: `${type}:${policy.id}:${todayKey}`,
      });

      return notification;
    })
  );
}
