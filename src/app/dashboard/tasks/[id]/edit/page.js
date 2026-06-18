"use client";

import { useCallback, useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { authFetch } from "@/lib/authFetch";
import toast from "react-hot-toast";
import TaskForm from "../../components/TaskForm";
import { ClipboardList } from "lucide-react";
import PageHeader from "@/components/PageHeader";

export default function EditTaskPage() {
  const { id } = useParams();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);

  const fetchTask = useCallback(async () => {
    setLoading(true);
    const res = await authFetch(`/api/tasks/${id}`);
    if (res.ok) {
      const data = await res.json();
      setTask(data.task);
    } else {
      toast.error("Task not found");
    }
    setLoading(false);
  }, [id]);

  async function fetchFormData() {
    const [usersRes, clientsRes] = await Promise.all([
      authFetch("/api/tasks/assignees"),
      supabase.from("clients").select("id, full_name"),
    ]);
    const usersPayload = await usersRes.json();
    setUsers(usersRes.ok ? usersPayload.users || [] : []);
    setClients(clientsRes.data || []);
  }

  useEffect(() => {
    fetchTask();
    fetchFormData();
  }, [fetchTask, id]);

  async function handleSubmit(payload) {
    const res = await authFetch(`/api/tasks/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      toast.success("Task updated successfully");
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed to update task");
    }
  }

  if (loading) {
    return <div style={{ textAlign: "center", padding: "60px", color: "#64748b" }}>Loading...</div>;
  }

  if (!task) {
    return <div style={{ textAlign: "center", padding: "60px", color: "#64748b" }}>Task not found</div>;
  }

  return (
    <div style={{ padding: "0" }}>
      <div style={{ marginBottom: "24px" }}>
        <PageHeader
          eyebrow="Task workspace"
          title="Edit Task"
          description="Update task details and assignments."
          icon={ClipboardList}
        />
      </div>

      <TaskForm
        initialData={task}
        users={users}
        clients={clients}
        onSubmit={handleSubmit}
        isEdit={true}
      />
    </div>
  );
}
