"use client";

import { Clock, FileText, Check, AlertCircle, UserPlus, Trash2, Upload, RefreshCw } from "lucide-react";
import styles from "./ActivityTimeline.module.css";
import { formatDateTimeDDMonYYYY } from "@/lib/dateFormat";

const ACTION_ICONS = {
  created: <FileText size={14} />,
  status_changed_to_Pending: <Clock size={14} />,
  status_changed_to_InProgress: <AlertCircle size={14} />,
  status_changed_to_Completed: <Check size={14} />,
  status_changed_to_OnHold: <Clock size={14} />,
  "status_changed_to_Follow-up": <RefreshCw size={14} />,
  "status_changed_to_Waiting for Approval": <Clock size={14} />,
  status_changed_to_Cancelled: <Trash2 size={14} />,
  assigned: <UserPlus size={14} />,
  reassigned: <RefreshCw size={14} />,
  comment_added: <FileText size={14} />,
  attachment_added: <Upload size={14} />,
  checklist_item_added: <FileText size={14} />,
  checklist_item_completed: <Check size={14} />,
  checklist_item_uncompleted: <Clock size={14} />,
  deleted: <Trash2 size={14} />,
};

const ACTION_COLORS = {
  created: "#6366f1",
  status_changed_to_Completed: "#10b981",
  status_changed_to_InProgress: "#3b82f6",
  status_changed_to_Pending: "#f59e0b",
  status_changed_to_OnHold: "#94a3b8",
  "status_changed_to_Follow-up": "#7c3aed",
  "status_changed_to_Waiting for Approval": "#0891b2",
  status_changed_to_Cancelled: "#ef4444",
  assigned: "#8b5cf6",
  reassigned: "#06b6d4",
  comment_added: "#64748b",
  attachment_added: "#f59e0b",
  checklist_item_added: "#10b981",
  checklist_item_completed: "#10b981",
  checklist_item_uncompleted: "#f59e0b",
  deleted: "#ef4444",
};

const formatAction = (actionType) => {
  if (actionType === "comment_added") return "Remark Added";
  return actionType.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
};

export default function ActivityTimeline({ activities = [] }) {
  if (activities.length === 0) {
    return (
      <div className={styles.container}>
        <h3 className={styles.title}>Activity Timeline</h3>
        <p className={styles.empty}>No activity recorded yet</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Activity Timeline</h3>

      <div className={styles.timeline}>
        {activities.map((activity) => (
          <div key={activity.id} className={styles.item}>
            <div className={styles.icon} style={{ backgroundColor: ACTION_COLORS[activity.action_type] || "#64748b" }}>
              {ACTION_ICONS[activity.action_type] || <FileText size={14} />}
            </div>

            <div className={styles.content}>
              <div className={styles.actionLine}>
                <span className={styles.action}>{formatAction(activity.action_type)}</span>
                {activity.performer && <span className={styles.performer}>by {activity.performer.name}</span>}
              </div>
              {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                <p className={styles.details}>
                  {activity.metadata.title && <span>&quot;{activity.metadata.title}&quot;</span>}
                  {activity.metadata.status && <span>Status: {activity.metadata.status}</span>}
                  {activity.metadata.priority && <span>Priority: {activity.metadata.priority}</span>}
                  {activity.metadata.remark && <span>Remark: &quot;{activity.metadata.remark}&quot;</span>}
                  {activity.metadata.added_assignees?.length > 0 && <span>Added: {activity.metadata.added_assignees.length} user(s)</span>}
                  {activity.metadata.removed_assignees?.length > 0 && <span>Removed: {activity.metadata.removed_assignees.length} user(s)</span>}
                </p>
              )}
              <span className={styles.time}>
                {formatDateTimeDDMonYYYY(activity.created_at, "-")}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
