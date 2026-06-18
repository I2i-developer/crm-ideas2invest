import { redirect } from "next/navigation";

export default async function AdminTaskDetailAlias({ params }) {
  const { taskId } = await params;
  redirect(`/dashboard/tasks/${taskId}`);
}
