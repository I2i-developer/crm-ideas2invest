"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { authFetch } from "@/lib/authFetch";
import ConfirmDialog from "@/components/ConfirmDialog";
import PageHeader from "@/components/PageHeader";
import CrmTooltip from "@/components/CrmTooltip";
import toast from "react-hot-toast";
import TaskStats from "./TaskStats";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  Filter,
  ListFilter,
  PauseCircle,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import styles from "./TaskList.module.css";
import { formatDateDDMonYYYY } from "@/lib/dateFormat";

const PRIORITY_STYLES = {
  Low: styles.priorityLow,
  Medium: styles.priorityMedium,
  High: styles.priorityHigh,
  Urgent: styles.priorityUrgent,
};

const STATUS_ICONS = {
  Pending: Clock3,
  "In Progress": AlertCircle,
  "Follow-up": Clock3,
  "Waiting for Approval": PauseCircle,
  Completed: CheckCircle2,
  "On Hold": PauseCircle,
  Cancelled: X,
};

const STATUS_STYLES = {
  Pending: styles.statusPending,
  "In Progress": styles.statusProgress,
  "Follow-up": styles.statusPending,
  "Waiting for Approval": styles.statusHold,
  Completed: styles.statusCompleted,
  "On Hold": styles.statusHold,
  Cancelled: styles.statusHold,
};

export default function TaskList() {
  const searchParams = useSearchParams();
  const linkedClientId = searchParams.get("client_id");
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState({
    status: "All",
    priority: "All",
    assigned_user: "all",
  });
  const [showFilters, setShowFilters] = useState(false);
  const [users, setUsers] = useState([]);
  const [currentRole, setCurrentRole] = useState(null);
  const [taskToDelete, setTaskToDelete] = useState(null);
  const [deletingTask, setDeletingTask] = useState(false);

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((value) => value !== "All" && value !== "all").length,
    [filters]
  );

  const fetchUsers = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      setCurrentRole(profile?.role || null);
    }

    const { data } = await supabase
      .from("profiles")
      .select("id, name, full_name, email, designation, avatar_url, role, is_active, status")
      .in("role", ["admin", "operations"])
      .order("name", { ascending: true });

    setUsers((data || []).filter((user) => user.is_active !== false && user.status !== "Inactive"));
  }, []);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();

    if (searchTerm) params.set("search", searchTerm);
    if (filters.status !== "All") params.set("status", filters.status);
    if (filters.priority !== "All") params.set("priority", filters.priority);
    if (filters.assigned_user !== "all") params.set("assigned_user", filters.assigned_user);
    if (linkedClientId) params.set("client_id", linkedClientId);

    try {
      const res = await authFetch(`/api/tasks?${params.toString()}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data.error || "Task queue could not be loaded");
        setTasks([]);
        return;
      }

      setTasks(data.tasks || []);
    } catch (error) {
      console.error("Task queue fetch failed:", error);
      toast.error("Task queue could not be loaded");
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [filters, linkedClientId, searchTerm]);

  useEffect(() => {
    fetchTasks();
    fetchUsers();
  }, [fetchTasks, fetchUsers]);

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchTasks();
    }, 350);

    return () => clearTimeout(delayDebounce);
  }, [fetchTasks]);

  useEffect(() => {
    function refreshOnFocus() {
      fetchTasks();
    }

    window.addEventListener("focus", refreshOnFocus);
    window.addEventListener("pageshow", refreshOnFocus);

    const tasksChannel = supabase
      .channel("task-list-live-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, refreshOnFocus)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_assignments" }, refreshOnFocus)
      .subscribe();

    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      window.removeEventListener("pageshow", refreshOnFocus);
      supabase.removeChannel(tasksChannel);
    };
  }, [fetchTasks]);

  async function confirmDeleteTask() {
    if (!taskToDelete) return;
    setDeletingTask(true);
    const res = await authFetch(`/api/tasks/${taskToDelete.id}`, { method: "DELETE" });
    setDeletingTask(false);
    if (res.ok) {
      setTaskToDelete(null);
      fetchTasks();
      toast.success("Task deleted");
      return;
    }
    const data = await res.json().catch(() => ({}));
    toast.error(data.error || "Task could not be deleted");
  }

  const resetFilters = () => {
    setFilters({ status: "All", priority: "All", assigned_user: "all" });
  };

  return (
    <div className={styles.container}>
        <PageHeader
          eyebrow="Task Management"
          title={String(currentRole || "").toLowerCase() === "admin" ? "Team Tasks" : "Assigned Tasks"}
          description={
            String(currentRole || "").toLowerCase() === "admin"
              ? "Plan, assign, and follow work across clients and internal operations."
              : "Track and update the tasks assigned to you."
          }
        icon={ClipboardList}
        actions={currentRole === "admin" && (
          <Link href="/dashboard/tasks/create" className={styles.createBtn}>
            <Plus size={17} />
            <span>New Task</span>
          </Link>
        )}
      />

      <TaskStats tasks={tasks} />

      <section className={styles.toolbar} aria-label="Task controls">
        <div className={styles.searchBox}>
          <Search size={18} className={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search title or description"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className={styles.searchInput}
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm("")} className={styles.iconBtn} aria-label="Clear search">
              <X size={16} />
            </button>
          )}
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`${styles.filterBtn} ${showFilters ? styles.filterActive : ""}`}
        >
          <ListFilter size={17} />
          <span>Filters</span>
          {activeFilterCount > 0 && <span className={styles.filterCount}>{activeFilterCount}</span>}
        </button>
      </section>

      {showFilters && (
        <section className={styles.filterPanel} aria-label="Task filters">
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Status</label>
            <select
              value={filters.status}
              onChange={(event) => setFilters({ ...filters, status: event.target.value })}
              className={styles.filterSelect}
            >
              <option value="All">All statuses</option>
              <option value="Pending">Pending</option>
              <option value="In Progress">In Progress</option>
              <option value="Follow-up">Follow-up</option>
              <option value="Waiting for Approval">Waiting for Approval</option>
              <option value="Completed">Completed</option>
              <option value="On Hold">On Hold</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Priority</label>
            <select
              value={filters.priority}
              onChange={(event) => setFilters({ ...filters, priority: event.target.value })}
              className={styles.filterSelect}
            >
              <option value="All">All priorities</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Urgent">Urgent</option>
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Assignee</label>
            <select
              value={filters.assigned_user}
              onChange={(event) => setFilters({ ...filters, assigned_user: event.target.value })}
              className={styles.filterSelect}
            >
              <option value="all">All users</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name || user.full_name || user.email}
                </option>
              ))}
            </select>
          </div>

          <button onClick={resetFilters} className={styles.clearFiltersBtn}>
            Clear
          </button>
        </section>
      )}

      <section className={styles.listPanel}>
        <div className={styles.listHeader}>
          <div>
            <h2>Task Queue</h2>
            <p>
              {loading
                ? "Loading tasks"
                : `${tasks.length} task${tasks.length === 1 ? "" : "s"} shown${linkedClientId ? " for this client" : ""}`}
            </p>
          </div>
          <Filter size={17} />
        </div>

        <div className={styles.taskList}>
          {loading ? (
            <div className={styles.loading}>
              <div className={styles.skeleton} />
              <div className={styles.skeleton} />
              <div className={styles.skeleton} />
            </div>
          ) : tasks.length === 0 ? (
            <div className={styles.empty}>
              <Users size={28} />
              <p>No tasks found</p>
            </div>
          ) : (
            tasks.map((task) => {
              const StatusIcon = STATUS_ICONS[task.status] || Clock3;
              const canDeleteTask = String(currentRole || "").toLowerCase() === "admin";
              const completedItems = task.task_checklist?.filter((item) => item.is_completed).length || 0;
              const totalItems = task.task_checklist?.length || 0;

              return (
                <article key={task.id} className={styles.taskCard}>
                  <div className={styles.taskMain}>
                    <div className={styles.taskHeader}>
                      <span className={`${styles.priorityBadge} ${PRIORITY_STYLES[task.priority] || styles.priorityMedium}`}>
                        {task.priority}
                      </span>
                    </div>

                    <h3 className={styles.taskTitle}>{task.title}</h3>
                    {task.description && (
                      <p className={styles.taskDesc}>
                        {task.description.length > 130 ? `${task.description.substring(0, 130)}...` : task.description}
                      </p>
                    )}
                  </div>

                  <div className={styles.taskMeta}>
                    <span className={`${styles.statusBadge} ${STATUS_STYLES[task.status] || styles.statusPending}`}>
                      <StatusIcon size={15} />
                      {task.status}
                    </span>

                    {task.category && <span className={styles.categoryBadge}>{task.category}</span>}

                    {task.due_date && (
                      <span className={styles.dueDate}>
                        <CalendarDays size={15} />
                        {formatDateDDMonYYYY(task.due_date, "-")}
                      </span>
                    )}
                  </div>

                  <div className={styles.taskPeople}>
                    <div className={styles.assignees}>
                      {task.task_assignments?.slice(0, 3).map((assignment) => (
                        <CrmTooltip key={assignment.id} content={assignment.assignee?.name || "Unassigned"}>
                          <div className={styles.avatar}>
                            {assignment.assignee?.avatar_url ? (
                              <Image
                                src={assignment.assignee.avatar_url}
                                alt=""
                                width={30}
                                height={30}
                                unoptimized
                              />
                            ) : (
                              <span>{assignment.assignee?.name?.charAt(0) || "?"}</span>
                            )}
                          </div>
                        </CrmTooltip>
                      ))}
                      {task.task_assignments?.length > 3 && (
                        <div className={styles.avatarMore}>+{task.task_assignments.length - 3}</div>
                      )}
                      {!task.task_assignments?.length && <span className={styles.unassigned}>Unassigned</span>}
                    </div>

                    {totalItems > 0 && (
                      <span className={styles.checklistProgress}>
                        {completedItems}/{totalItems}
                      </span>
                    )}
                  </div>

                  <div className={styles.taskActions}>
                    <Link href={`/dashboard/tasks/${task.id}`} className={styles.viewBtn}>
                      Open
                      <ChevronRight size={15} />
                    </Link>
                    {canDeleteTask && (
                      <button onClick={() => setTaskToDelete(task)} className={styles.deleteBtn} aria-label="Delete task">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
      <ConfirmDialog
        open={Boolean(taskToDelete)}
        title="Delete task?"
        message={`This will remove "${taskToDelete?.title || "this task"}" from the CRM task queue. This action cannot be undone.`}
        loading={deletingTask}
        onCancel={() => setTaskToDelete(null)}
        onConfirm={confirmDeleteTask}
      />
    </div>
  );
}
