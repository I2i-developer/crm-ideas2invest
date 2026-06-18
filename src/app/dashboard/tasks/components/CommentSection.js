"use client";

import { useState } from "react";
import Image from "next/image";
import { Send } from "lucide-react";
import { authFetch } from "@/lib/authFetch";
import toast from "react-hot-toast";
import styles from "./CommentSection.module.css";
import { formatDateTimeDDMonYYYY } from "@/lib/dateFormat";

export default function CommentSection({ taskId, comments = [], currentUserId, onRemarkAdded }) {
  const [remark, setRemark] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!remark.trim()) return;

    setLoading(true);
    try {
      const res = await authFetch(`/api/tasks/${taskId}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: remark.trim() }),
      });

      if (res.ok) {
        setRemark("");
        toast.success("Remark added");
        if (onRemarkAdded) {
          await onRemarkAdded();
        } else {
          window.location.reload();
        }
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Remark could not be added");
      }
    } catch (error) {
      console.error("Remark submit failed:", error);
      toast.error("Remark could not be added");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Remarks</h3>

      <form onSubmit={handleSubmit} className={styles.form}>
        <textarea
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          placeholder="Add a remark..."
          rows={3}
          className={styles.textarea}
        />
        <button type="submit" disabled={loading || !remark.trim()} className={styles.submitBtn}>
          <Send size={16} />
          <span>{loading ? "Posting..." : "Post Remark"}</span>
        </button>
      </form>

      <div className={styles.commentsList}>
        {comments.length === 0 ? (
          <p className={styles.empty}>No remarks yet. Be the first to add one.</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className={styles.commentCard}>
              <div className={styles.commentHeader}>
                <div className={styles.avatar}>
                  {c.user?.avatar_url ? (
                    <Image
                      src={c.user.avatar_url}
                      alt=""
                      width={32}
                      height={32}
                      unoptimized
                    />
                  ) : (
                    <span>{c.user?.name?.charAt(0) || "?"}</span>
                  )}
                </div>
                <div className={styles.commentMeta}>
                  <span className={styles.userName}>{c.user?.name || "Unknown"}</span>
                  <span className={styles.commentDate}>
                    {formatDateTimeDDMonYYYY(c.created_at, "-")}
                  </span>
                </div>
              </div>
              <p className={styles.commentText}>{c.comment}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
