"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { authFetch } from "@/lib/authFetch";
import toast from "react-hot-toast";
import TaskForm from "../components/TaskForm";
import CommentSection from "../components/CommentSection";
import Checklist from "../components/Checklist";
import ActivityTimeline from "../components/ActivityTimeline";
import {
  ArrowLeft,
  Clock,
  User,
  FileText,
  Link as LinkIcon,
} from "lucide-react";
import styles from "./TaskDetail.module.css";
import { formatDateDDMonYYYY } from "@/lib/dateFormat";

const PRIORITY_COLORS = {
  Low: "#10b981",
  Medium: "#3b82f6",
  High: "#f59e0b",
  Urgent: "#ef4444",
};

const STATUS_COLORS = {
  Pending: "#f59e0b",
  "In Progress": "#3b82f6",
  "Follow-up": "#7c3aed",
  "Waiting for Approval": "#0891b2",
  Completed: "#10b981",
  "On Hold": "#94a3b8",
  Cancelled: "#ef4444",
};

const STATUS_OPTIONS = [
  { value: "Pending", label: "Pending" },
  { value: "In Progress", label: "In Progress" },
  { value: "Follow-up", label: "Follow-up" },
  { value: "Waiting for Approval", label: "Waiting for Approval" },
  { value: "Completed", label: "Completed" },
  { value: "On Hold", label: "On Hold" },
  { value: "Cancelled", label: "Cancelled" },
];

export default function TaskDetailPage() {
  const { id } = useParams();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentRole, setCurrentRole] = useState(null);

  async function fetchCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUserId(user?.id);

    if (user?.id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      setCurrentRole(profile?.role || null);
    }
  }

  const fetchTask = useCallback(async () => {
    setLoading(true);
    const res = await authFetch(`/api/tasks/${id}`);
    if (res.ok) {
      const data = await res.json();
      setTask(data.task);
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Task could not be opened");
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchTask();
    fetchCurrentUser();
  }, [fetchTask, id]);

  async function handleStatusUpdate(newStatus) {
    setUpdating(true);
    const res = await authFetch(`/api/tasks/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });

    if (res.ok) {
      const data = await res.json();
      setTask(data.task);
      toast.success(`Status updated to ${newStatus}`);
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Failed to update status");
    }
    setUpdating(false);
  }

  if (loading) {
    return <div className={styles.loading}>Loading task details...</div>;
  }

  if (!task) {
    return <div className={styles.notFound}>Task not found</div>;
  }

  return (
    <div className={styles.container}>
      <Link href="/dashboard/tasks" className={styles.backBtn}>
        <ArrowLeft size={18} />
        <span>Back to Tasks</span>
      </Link>

      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.taskNumber}>{task.task_number}</span>
          <h1 className={styles.title}>{task.title}</h1>
          <div className={styles.badges}>
            <span
              className={styles.priorityBadge}
              style={{ backgroundColor: PRIORITY_COLORS[task.priority] }}
            >
              {task.priority}
            </span>
            <span
              className={styles.statusBadge}
              style={{
                color: STATUS_COLORS[task.status],
                backgroundColor: `${STATUS_COLORS[task.status]}15`,
              }}
            >
              {task.status}
            </span>
            {task.category && (
              <span className={styles.categoryBadge}>{task.category}</span>
            )}
          </div>
        </div>

        <div className={styles.headerRight}>
          {currentRole === "admin" && (
            <Link href={`/dashboard/tasks/${id}/edit`} className={styles.backBtn}>
              Edit Task
            </Link>
          )}
          <div className={styles.statusUpdate}>
            <label className={styles.statusLabel}>Update Status:</label>
            <select
              value={task.status}
              onChange={(e) => handleStatusUpdate(e.target.value)}
              disabled={updating}
              className={styles.statusSelect}
              style={{ borderColor: STATUS_COLORS[task.status] }}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.main}>
          {task.description && (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Description</h3>
              <p className={styles.description}>{task.description}</p>
            </div>
          )}

          <Checklist
            taskId={task.id}
            items={task.task_checklist || []}
            canEdit={true}
          />

          <CommentSection
            taskId={task.id}
            comments={task.task_comments || []}
            currentUserId={currentUserId}
            onRemarkAdded={fetchTask}
          />

          <ActivityTimeline activities={task.task_activity_logs || []} />
        </div>

        <div className={styles.sidebar}>
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Task Details</h3>

            <div className={styles.detailsList}>
              <div className={styles.detailItem}>
                <Clock size={16} className={styles.detailIcon} />
                <div>
                  <span className={styles.detailLabel}>Due Date</span>
                  <span className={styles.detailValue}>
                    {formatDateDDMonYYYY(task.due_date, "Not set")}
                  </span>
                </div>
              </div>

              {task.client && (
                <div className={styles.detailItem}>
                  <LinkIcon size={16} className={styles.detailIcon} />
                  <div>
                    <span className={styles.detailLabel}>Client</span>
                    <Link
                      href={currentRole === "operations" ? `/admin/clients/${task.client.id}/client-details` : `/admin/clients/${task.client.id}`}
                      className={styles.clientLink}
                    >
                      {task.client.full_name}
                    </Link>
                  </div>
                </div>
              )}

              <div className={styles.detailItem}>
                <User size={16} className={styles.detailIcon} />
                <div>
                  <span className={styles.detailLabel}>Created By</span>
                  <span className={styles.detailValue}>
                    {task.created_by?.name || "Unknown"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Assigned To</h3>
            <div className={styles.assigneesList}>
              {task.task_assignments?.length === 0 ? (
                <p className={styles.noAssignees}>No users assigned</p>
              ) : (
                task.task_assignments.map((assignment) => (
                  <div key={assignment.id} className={styles.assigneeItem}>
                    <div className={styles.assigneeAvatar}>
                      {assignment.assignee?.avatar_url ? (
                        <Image
                          src={assignment.assignee.avatar_url}
                          alt=""
                          width={32}
                          height={32}
                          unoptimized
                        />
                      ) : (
                        <span>{assignment.assignee?.name?.charAt(0) || "?"}</span>
                      )}
                    </div>
                    <div>
                      <span className={styles.assigneeName}>
                        {assignment.assignee?.name || "Unknown"}
                      </span>
                      {assignment.assignee?.designation && (
                        <span className={styles.assigneeRole}>
                          {assignment.assignee.designation}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {task.task_attachments?.length > 0 && (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Attachments</h3>
              <div className={styles.attachmentsList}>
                {task.task_attachments.map((att) => (
                  <a
                    key={att.id}
                    href={att.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.attachmentItem}
                  >
                    <FileText size={16} />
                    <span>{att.file_name || "File"}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {task.tags && task.tags.length > 0 && (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Tags</h3>
              <div className={styles.tagsList}>
                {task.tags.map((tag, i) => (
                  <span key={i} className={styles.tag}>{tag}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
