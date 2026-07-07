"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import { ClipboardList, Edit3, Eye, Search, Trash2, Users } from "lucide-react";
import toast from "react-hot-toast";
import FormInput from "./components/FormInput";
import ConfirmDialog from "@/components/ConfirmDialog";
import PageHeader from "@/components/PageHeader";
import CrmTooltip from "@/components/CrmTooltip";

export default function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [focused, setFocused] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [clientToDelete, setClientToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentRole, setCurrentRole] = useState(null);
  const isAdmin = currentRole === "admin";
  const canAddClient = currentRole === "admin" || currentRole === "operations";

  function handleDelete(id) {
    if (!isAdmin) return;
    setClientToDelete(id);
    setShowDeleteModal(true);
  }

  async function confirmDelete() {
    if (!clientToDelete) return;

    setDeleting(true);
    const { error } = await supabase
      .from("clients")
      .delete()
      .eq("id", clientToDelete);
    setDeleting(false);

    if (error) {
      toast.error("Failed to delete client.");
      return;
    }

    setShowDeleteModal(false);
    setClientToDelete(null);
    fetchClients();
  }

  const fetchClients = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });

    if (searchTerm) {
      query = query.or(
        `full_name.ilike.%${searchTerm}%,mobile.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`
      );
    }

    const { data } = await query;

    setClients(data || []);
    setLoading(false);
  }, [searchTerm]);

  useEffect(() => {
    const fetchRole = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      setCurrentRole(profile?.role || null);
    };

    fetchRole();
  }, []);

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchClients();
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [fetchClients]);

  return (
    <div className="p-6 space-y-8">

      {/* Header */}
      <PageHeader
        eyebrow="Client workspace"
        title="Clients"
        description="Manage and track all registered clients."
        icon={Users}
        actions={canAddClient && (
          <Link
            href="/admin/clients/new"
            onClick={(event) => {
              event.preventDefault();
              window.location.assign("/admin/clients/new");
            }}
            className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 shadow-lg transition hover:bg-blue-50"
          >
            + New Client
          </Link>
        )}
      />

      {/* Search + Stats */}
      <div className="flex justify-between items-center">
        
        {/* Search */}
        <div
          className={`
            relative
            transition-all duration-500 ease-in-out
            ${focused || searchTerm ? "w-96" : "w-52"}
          `}
        >
          <FormInput
            name="client_search"
            placeholder="Search by name, mobile or email..."
            value={searchTerm}
            onValueChange={setSearchTerm}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            icon={<Search size={20} />}
            inputClassName={`font-[inherit] text-gray-800 shadow-lg border-white/40 ${focused ? "shadow-xl bg-white/80" : ""}`}
          />
        </div>

        {/* Client Count */}
        <div className="glass-card px-6 py-3 text-[15px] font-medium text-gray-700">
          Total Clients: <span className="text-blue-600">{clients.length}</span>
        </div>
      </div>

      {/* Clients List */}
      <div className="glass-card p-6 space-y-4">

        {loading && (
          <div className="space-y-3 animate-pulse">
            <div className="h-12 bg-white/50 rounded-lg" />
            <div className="h-12 bg-white/50 rounded-lg" />
            <div className="h-12 bg-white/50 rounded-lg" />
          </div>
        )}

        {!loading && clients.length === 0 && (
          <p className="text-gray-500 text-center py-6">
            No clients found.
          </p>
        )}
          {!loading &&
            clients.map((client) => (
              <div
                key={client.id}
                className="flex justify-between items-center p-4 rounded-xl hover:bg-white/50 transition-all duration-200 group"
              >
                <Link href={`/admin/clients/${client.id}`} className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white font-semibold">
                    {client.full_name?.charAt(0)}
                  </div>

                  <div>
                    <p className="font-medium text-gray-800">
                      {client.full_name}
                    </p>
                    <p className="text-sm text-gray-500">
                      {client.mobile} • {client.email}
                    </p>
                  </div>
                </Link>

                {/* Actions */}
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition">
                  <CrmTooltip content="View documents">
                    <Link
                      href={`/admin/clients/${client.id}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-700 transition hover:bg-blue-100"
                      aria-label={`View documents for ${client.full_name}`}
                    >
                      <Eye size={17} />
                    </Link>
                  </CrmTooltip>

                  <CrmTooltip content="Complete client profile">
                    <Link
                      href={`/admin/clients/${client.id}/client-details`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100"
                      aria-label={`Open complete profile for ${client.full_name}`}
                    >
                      <ClipboardList size={17} />
                    </Link>
                  </CrmTooltip>

                  {isAdmin && (
                    <>
                      <CrmTooltip content="Edit client">
                        <Link
                          href={`/admin/clients/${client.id}/edit`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-indigo-100 bg-indigo-50 text-indigo-700 transition hover:bg-indigo-100"
                          aria-label={`Edit ${client.full_name}`}
                        >
                          <Edit3 size={16} />
                        </Link>
                      </CrmTooltip>

                      <CrmTooltip content="Delete client">
                        <button
                          onClick={() => handleDelete(client.id)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-100 bg-red-50 text-red-600 transition hover:bg-red-100"
                          aria-label={`Delete ${client.full_name}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </CrmTooltip>
                    </>
                  )}
                </div>
              </div>
          ))}
      </div>
      <ConfirmDialog
        open={showDeleteModal}
        title="Delete client?"
        message="This client and related CRM records may be removed. This action cannot be undone."
        loading={deleting}
        onCancel={() => { setShowDeleteModal(false); setClientToDelete(null); }}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
