"use client";

import { Suspense } from "react";
import TaskList from "./components/TaskList";
import styles from "./tasks.module.css";

export default function TasksPage() {
  return (
    <div className={styles.pageWrapper}>
      <Suspense fallback={<div className={styles.loading}>Loading tasks...</div>}>
        <TaskList />
      </Suspense>
    </div>
  );
}
