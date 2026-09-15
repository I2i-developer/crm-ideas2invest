"use client";

import { Suspense } from "react";
import TaskList from "./components/TaskList";
import BrandLoader from "@/components/BrandLoader";
import styles from "./tasks.module.css";

export default function TasksPage() {
  return (
    <div className={styles.pageWrapper}>
      <Suspense fallback={<BrandLoader label="Loading tasks" />}>
        <TaskList />
      </Suspense>
    </div>
  );
}
