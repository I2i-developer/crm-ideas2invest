"use client";

import { useState } from "react";
import { Plus, Check, Trash2 } from "lucide-react";
import styles from "./Checklist.module.css";

export default function Checklist({ taskId, items = [], canEdit = true }) {
  const [newItem, setNewItem] = useState("");
  const [loading, setLoading] = useState(false);

  async function addItem(e) {
    e.preventDefault();
    if (!newItem.trim()) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_text: newItem.trim() }),
      });

      if (res.ok) {
        setNewItem("");
        window.location.reload();
      }
    } finally {
      setLoading(false);
    }
  }

  async function toggleItem(itemId, isCompleted) {
    await fetch(`/api/tasks/${taskId}/checklist`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: itemId, is_completed: !isCompleted }),
    });

    if (typeof window !== "undefined") window.location.reload();
  }

  async function deleteItem(itemId) {
    await fetch(`/api/tasks/${taskId}/checklist?item_id=${itemId}`, { method: "DELETE" });
    if (typeof window !== "undefined") window.location.reload();
  }

  const completedCount = items.filter((i) => i.is_completed).length;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Checklist</h3>
        {items.length > 0 && (
          <span className={styles.progress}>{completedCount}/{items.length} completed</span>
        )}
      </div>

      {canEdit && (
        <form onSubmit={addItem} className={styles.addForm}>
          <input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="Add checklist item..."
            className={styles.addInput}
          />
          <button type="submit" disabled={loading || !newItem.trim()} className={styles.addBtn}>
            <Plus size={16} />
          </button>
        </form>
      )}

      <div className={styles.list}>
        {items.length === 0 ? (
          <p className={styles.empty}>No checklist items yet</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className={`${styles.item} ${item.is_completed ? styles.completed : ""}`}>
              <button
                onClick={() => toggleItem(item.id, item.is_completed)}
                className={`${styles.checkBtn} ${item.is_completed ? styles.checked : ""}`}
              >
                {item.is_completed && <Check size={12} />}
              </button>
              <span className={styles.itemText}>{item.item_text}</span>
              {canEdit && (
                <button onClick={() => deleteItem(item.id)} className={styles.deleteBtn}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}