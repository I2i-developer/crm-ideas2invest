"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Flame,
  PauseCircle,
} from "lucide-react";
import styles from "./TaskStats.module.css";

export default function TaskStats({ tasks = [] }) {
  const total = tasks.length;
  const pending = tasks.filter((task) => task.status === "Pending").length;
  const inProgress = tasks.filter((task) => task.status === "In Progress").length;
  const completed = tasks.filter((task) => task.status === "Completed").length;
  const onHold = tasks.filter((task) => task.status === "On Hold").length;
  const followUp = tasks.filter((task) => task.status === "Follow-up").length;
  const waiting = tasks.filter((task) => task.status === "Waiting for Approval").length;
  const highPriority = tasks.filter((task) => task.priority === "High" || task.priority === "Urgent").length;

  const stats = [
    { label: "Total", value: total, tone: "slate", icon: ClipboardList },
    { label: "Pending", value: pending, tone: "amber", icon: Clock3 },
    { label: "In Progress", value: inProgress, tone: "blue", icon: AlertTriangle },
    { label: "Completed", value: completed, tone: "green", icon: CheckCircle2 },
    { label: "On Hold", value: onHold, tone: "gray", icon: PauseCircle },
    { label: "Follow-up", value: followUp, tone: "blue", icon: Clock3 },
    { label: "Waiting Approval", value: waiting, tone: "gray", icon: PauseCircle },
    { label: "Priority", value: highPriority, tone: "red", icon: Flame },
  ];

  return (
    <div className={styles.statsGrid}>
      {stats.map((stat) => {
        const Icon = stat.icon;

        return (
          <div key={stat.label} className={`${styles.statCard} ${styles[stat.tone]}`}>
            <span className={styles.statIcon}>
              <Icon size={18} />
            </span>
            <div className={styles.statContent}>
              <span className={styles.statLabel}>{stat.label}</span>
              <span className={styles.statValue}>{stat.value}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
