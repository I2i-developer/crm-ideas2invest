"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { authFetch } from "@/lib/authFetch";
import TaskForm from "../components/TaskForm";
import toast from "react-hot-toast";
import { ClipboardList } from "lucide-react";
import PageHeader from "@/components/PageHeader";

export default function CreateTaskPage() {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [role, setRole] = useState(null);
  const [prefillData, setPrefillData] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.size) return;

    const source = params.get("source");
    const sourceSipEventId = params.get("source_sip_event_id");
    const isSipPrefill = source === "sip_tracker" || Boolean(sourceSipEventId);
    if (!isSipPrefill) return;

    setPrefillData({
      prefill_key: `sip-${sourceSipEventId || Date.now()}`,
      title: params.get("title") || "",
      description: params.get("description") || "",
      category: params.get("category") || "Follow-up",
      priority: params.get("priority") || "Medium",
      status: params.get("status") || "Pending",
      due_date: params.get("due_date") || new Date().toISOString().slice(0, 10),
      client_id: params.get("client_id") || "",
      tags: params.get("tags") || "SIP",
      source_sip_event_id: sourceSipEventId || "",
      task_assignments: [],
    });
  }, []);

  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = user ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle() : { data: null };
      setRole(profile?.role);
      const usersRes = await authFetch("/api/tasks/assignees");
      const usersPayload = await usersRes.json();
      setUsers(usersRes.ok ? usersPayload.users || [] : []);
      if (!usersRes.ok) toast.error(usersPayload.error || "Unable to load task assignees");
      if (profile?.role === "admin") {
        const { data } = await supabase.from("clients").select("id, full_name");
        setClients(data || []);
      } else setPrefillData(null);
    }
    fetchData();
  }, []);

  async function handleSubmit(payload) {
    const res = await authFetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      const taskId = data.task?.id;

      if (!taskId) {
        toast.error("Task was created, but the task details could not be opened.");
        router.replace("/dashboard/tasks");
        router.refresh();
        return;
      }

      toast.success("Task created successfully");
      router.replace(`/dashboard/tasks/${taskId}`);
      router.refresh();
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed to create task");
    }
  }

  return (
    <div style={{ padding: "0" }}>
      <div style={{ marginBottom: "24px" }}>
        <PageHeader
          eyebrow="Task workspace"
          title="Create New Task"
          description="Create and assign a task to your team."
          icon={ClipboardList}
        />
      </div>

      <TaskForm
        key={prefillData?.prefill_key || "blank-task"}
        initialData={prefillData}
        users={users}
        clients={clients}
        allowClientLink={role === "admin"}
        onSubmit={handleSubmit}
        isEdit={false}
      />
    </div>
  );
}
