"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Cake, CalendarDays, Gift, MoreHorizontal, Pencil, Plus, Search, Trash2, UserRound, X } from "lucide-react";
import toast from "react-hot-toast";
import { authFetch } from "@/lib/authFetch";
import FormInput from "../clients/components/FormInput";
import FormSelect from "../clients/components/FormSelect";
import PageHeader from "@/components/PageHeader";
import { formatDateDDMonYYYY } from "@/lib/dateFormat";
import CrmTooltip from "@/components/CrmTooltip";
import styles from "./birthdays.module.css";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const EMPTY_BIRTHDAY_FORM = {
  person_name: "",
  person_type: "Client",
  date_of_birth: "",
};

function buildCalendar(year, month) {
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const offset = firstDay.getDay();
  return [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
}

function birthdayHref(birthday) {
  return birthday.client_id ? `/admin/clients/${birthday.client_id}` : "/admin/birthdays";
}

function titleCase(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/\b([a-z])/g, (char) => char.toUpperCase());
}

function formatBirthdayDate(monthDay = "", dateOfBirth = "") {
  if (dateOfBirth) return formatDateDDMonYYYY(dateOfBirth, monthDay);
  const [month, day] = monthDay.split("-").map(Number);
  if (!month || !day) return monthDay;
  return formatDateDDMonYYYY(new Date(new Date().getFullYear(), month - 1, day), monthDay);
}

export default function BirthdayCalendarPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [birthdays, setBirthdays] = useState([]);
  const [allBirthdays, setAllBirthdays] = useState([]);
  const [selectedDay, setSelectedDay] = useState(now.getDate());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAddBirthday, setShowAddBirthday] = useState(false);
  const [savingBirthday, setSavingBirthday] = useState(false);
  const [birthdayForm, setBirthdayForm] = useState(EMPTY_BIRTHDAY_FORM);
  const [editingBirthday, setEditingBirthday] = useState(null);
  const [deletingBirthday, setDeletingBirthday] = useState(null);
  const [canManage, setCanManage] = useState(null);
  const [birthdayActionsId, setBirthdayActionsId] = useState(null);
  const [loadError, setLoadError] = useState("");

  const loadBirthdays = useCallback(async (targetMonth = month, targetYear = year) => {
    setLoading(true);
    try {
      const response = await authFetch(`/api/birthdays?month=${targetMonth}&year=${targetYear}&days=30`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load birthdays");
      setBirthdays(data.calendar || []);
      setAllBirthdays(data.events || []);
      setCanManage(data.can_manage === true);
      setLoadError("");
    } catch (error) {
      setCanManage(null);
      setLoadError(error.message || "Unable to load birthdays");
      toast.error(error.message || "Unable to load birthdays");
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    loadBirthdays();
  }, [loadBirthdays]);

  const closeBirthdayDialog = useCallback(() => {
    if (savingBirthday) return;
    setShowAddBirthday(false);
    setEditingBirthday(null);
    setDeletingBirthday(null);
    setBirthdayForm(EMPTY_BIRTHDAY_FORM);
  }, [savingBirthday]);

  useEffect(() => {
    if (!showAddBirthday && !deletingBirthday) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => { if (event.key === "Escape") closeBirthdayDialog(); };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [showAddBirthday, deletingBirthday, closeBirthdayDialog]);

  async function addBirthday(event) {
    event.preventDefault();
    if (savingBirthday) return;
    setSavingBirthday(true);
    try {
      const response = await authFetch("/api/birthdays", {
        method: editingBirthday ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...birthdayForm, ...(editingBirthday ? { id: editingBirthday.id } : {}) }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Unable to save birthday");
      }

      const birthdayDate = new Date(`${birthdayForm.date_of_birth}T00:00:00`);
      setMonth(birthdayDate.getMonth() + 1);
      setYear(now.getFullYear());
      setSelectedDay(birthdayDate.getDate());
      setBirthdayForm(EMPTY_BIRTHDAY_FORM);
      setShowAddBirthday(false);
      setEditingBirthday(null);
      toast.success(editingBirthday ? "Birthday updated" : "Client birthday added");
      await loadBirthdays(birthdayDate.getMonth() + 1, now.getFullYear());
    } catch (error) {
      toast.error(error.message || "Unable to save birthday");
    } finally {
      setSavingBirthday(false);
    }
  }

  async function deleteBirthday() {
    if (!deletingBirthday || savingBirthday) return;
    setSavingBirthday(true);
    try {
      const response = await authFetch("/api/birthdays", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deletingBirthday.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to delete birthday");
      setDeletingBirthday(null);
      toast.success("Birthday deleted");
      await loadBirthdays();
    } catch (error) {
      toast.error(error.message || "Unable to delete birthday");
    } finally {
      setSavingBirthday(false);
    }
  }

  const searchResults = useMemo(() => {
    const term = search.trim().toLowerCase();
    const source = term ? allBirthdays : birthdays;

    return source.filter((birthday) =>
      [
        birthday.person_name,
        birthday.client_name,
        birthday.client_id,
        birthday.client_code,
        birthday.mobile,
        birthday.email,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [allBirthdays, birthdays, search]);

  const calendarBirthdays = useMemo(() => {
    if (!search.trim()) return birthdays;

    return searchResults
      .filter((birthday) => Number(birthday.month_day?.slice(0, 2)) === month)
      .map((birthday) => ({
        ...birthday,
        calendar_date: `${year}-${String(month).padStart(2, "0")}-${birthday.month_day.slice(3, 5)}`,
      }));
  }, [birthdays, month, search, searchResults, year]);

  const grouped = useMemo(() => {
    return calendarBirthdays.reduce((acc, birthday) => {
      const day = Number(birthday.calendar_date.slice(8, 10));
      acc[day] = acc[day] || [];
      acc[day].push(birthday);
      return acc;
    }, {});
  }, [calendarBirthdays]);

  const days = buildCalendar(year, month);
  const selectedBirthdays = grouped[selectedDay] || [];
  const hasSearch = Boolean(search.trim());
  const showToday = hasSearch || month !== now.getMonth() + 1 || year !== now.getFullYear() || selectedDay !== now.getDate();
  const todayCount = allBirthdays.filter((birthday) => birthday.days_until === 0).length;
  const monthCount = birthdays.length;
  const panelItems = hasSearch ? searchResults : selectedBirthdays;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Client celebrations"
        title="Birthday Calendar"
        description="Holder-wise birthdays across the CRM."
        icon={Cake}
        actions={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Metric icon={Gift} label="Today" value={todayCount} />
              <Metric icon={CalendarDays} label={MONTHS[month - 1]} value={monthCount} />
              <Metric icon={UserRound} label="All Records" value={allBirthdays.length} />
            </div>
          </div>
        }
      />

      <div className="glass-card p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto] lg:items-center">
          <FormInput
            name="birthday_search"
            value={search}
            onValueChange={setSearch}
            placeholder="Search by client, holder, mobile, email, or client ID"
            icon={<Search size={18} />}
          />

          <FormSelect
            name="month"
            value={month}
            onValueChange={(value) => setMonth(Number(value))}
            options={MONTHS.map((name, index) => ({
              value: index + 1,
              label: name,
            }))}
            className="w-44"
          />

          <FormInput
            name="year"
            value={year}
            onValueChange={(value) => setYear(Number(value))}
            type="number"
            className="w-28"
          />

          <div className="flex flex-wrap items-center gap-2">
          {showToday && <button
            type="button"
            onClick={() => {
              const today = new Date();
              setMonth(today.getMonth() + 1);
              setYear(today.getFullYear());
              setSelectedDay(today.getDate());
              setSearch("");
              setBirthdayActionsId(null);
            }}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200 dark:hover:bg-blue-900"
          >
            <CalendarDays size={16} />
            Today
          </button>}
          <button
            type="button"
            onClick={() => { setEditingBirthday(null); setBirthdayForm(EMPTY_BIRTHDAY_FORM); setShowAddBirthday(true); }}
            className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <Plus size={16} />
            Add birthday
          </button>
          </div>
        </div>
      </div>

      {!loading && canManage === false && <p className="text-sm text-amber-700 dark:text-amber-300">Birthday editing requires database migration 202610310001_birthday_management.sql.</p>}
      {!loading && loadError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
        <span>{loadError}</span>
        <button type="button" onClick={() => loadBirthdays()} className="rounded-lg border border-current px-3 py-1.5 font-semibold transition hover:bg-red-100 dark:hover:bg-red-900">Try again</button>
      </div>}

      <div className="grid xl:grid-cols-[1fr_360px] gap-6">
        <div className="glass-card p-5 shadow-lg">
          {hasSearch && searchResults.length === 0 ? (
            <div className="flex min-h-80 items-center justify-center rounded-xl border border-dashed bg-white text-sm text-gray-500">
              No birthdays match your search.
            </div>
          ) : (
          <>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{MONTHS[month - 1]} {year}</h2>
              <p className="text-sm text-gray-500">{monthCount} birthdays this month</p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
              {hasSearch ? `${searchResults.length} matched` : "Calendar view"}
            </span>
          </div>
          <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {days.map((day, index) => {
              const events = day ? grouped[day] || [] : [];
              const isSelected = selectedDay === day;
              const hasEvents = events.length > 0;
              const isToday =
                day &&
                day === now.getDate() &&
                month === now.getMonth() + 1 &&
                year === now.getFullYear();
              return (
                <div key={`${day || "blank"}-${index}`} className="group relative min-w-0">
                <button
                  key={`${day || "blank"}-${index}`}
                  type="button"
                  disabled={!day}
                  onClick={() => day && setSelectedDay(day)}
                  className={`min-h-28 w-full rounded-2xl border p-2 text-left transition ${
                    !day
                      ? "bg-transparent border-transparent"
                      : isToday
                        ? "border-pink-400 bg-gradient-to-br from-pink-50 via-white to-blue-50 shadow-lg ring-2 ring-pink-200"
                        : isSelected
                          ? "border-blue-400 bg-blue-50 shadow-md ring-2 ring-blue-100"
                        : hasEvents
                          ? "border-emerald-200 bg-gradient-to-b from-emerald-50 to-white hover:border-emerald-300 hover:shadow-md"
                          : "bg-white hover:bg-gray-50"
                  }`}
                >
                  {day && (
                    <>
                      <div className="flex items-center justify-between">
                        <span
                          className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-semibold ${
                            isToday
                              ? "bg-gradient-to-br from-pink-600 to-blue-600 text-white shadow-md"
                              : "text-gray-800"
                          }`}
                        >
                          {day}
                        </span>
                        {hasEvents && (
                          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-xs font-bold text-white">
                            {events.length}
                          </span>
                        )}
                      </div>
                      {isToday && (
                        <span className="mt-2 inline-flex rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-pink-700">
                          Today
                        </span>
                      )}
                      <div className="mt-2 space-y-1">
                        {events.slice(0, 2).map((event) => (
                          <span key={event.id} className="block truncate rounded-lg bg-white/80 px-2 py-1 text-xs font-semibold text-emerald-800 shadow-sm">
                            {titleCase(event.person_name)}
                          </span>
                        ))}
                        {events.length > 2 && <span className="text-xs text-gray-500">+{events.length - 2} more</span>}
                      </div>
                    </>
                  )}
                </button>
                </div>
              );
            })}
          </div>
          </>
          )}
        </div>

        <div className="glass-card p-5 space-y-3 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">
                {hasSearch ? "Search Results" : `${MONTHS[month - 1]} ${selectedDay}`}
              </h2>
              <p className="text-xs text-gray-500">{panelItems.length} birthday{panelItems.length === 1 ? "" : "s"}</p>
            </div>
            <Cake className="text-pink-500" size={22} />
          </div>
          {loading ? (
            <p className="text-sm text-gray-500">Loading birthdays...</p>
          ) : panelItems.length === 0 ? (
            <p className="text-sm text-gray-500">
              {hasSearch ? "No matching birthdays found." : "No birthdays on this date."}
            </p>
          ) : (
            panelItems.map((birthday) => (
              <article key={birthday.id} data-actions-open={birthdayActionsId === birthday.id} onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setBirthdayActionsId(null);
              }} onKeyDown={(event) => { if (event.key === "Escape") { setBirthdayActionsId(null); event.currentTarget.querySelector("a")?.focus(); } }} className={`${styles.birthdayCard} block rounded-2xl border border-pink-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-pink-200 hover:bg-pink-50/60`}>
              <Link href={birthdayHref(birthday)} className="block min-w-0 rounded focus-visible:outline-2 focus-visible:outline-blue-500">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-orange-400 text-sm font-bold text-white">
                    {titleCase(birthday.person_name).charAt(0)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-gray-900">{titleCase(birthday.person_name)}</p>
                    <p className="text-xs font-medium text-gray-500">
                      Age {birthday.age ?? "-"} {hasSearch && ` / ${formatBirthdayDate(birthday.month_day, birthday.date_of_birth)}`}
                    </p>
                  </div>
                </div>
                {(birthday.mobile || birthday.email || birthday.client_code) && (
                  <p className="mt-3 text-[11px] text-gray-400">
                    {[birthday.client_code, birthday.mobile, birthday.email].filter(Boolean).join(" / ")}
                  </p>
                )}
              </Link>
              {canManage && <>
              <button type="button" className={styles.touchActionsToggle} aria-label={`Birthday actions for ${birthday.person_name}`} aria-expanded={birthdayActionsId === birthday.id} onClick={() => setBirthdayActionsId((current) => current === birthday.id ? null : birthday.id)}><MoreHorizontal size={20} /></button>
              <div className={styles.birthdayActions}>
                <CrmTooltip content="Edit birthday">
                  <button type="button" aria-label={`Edit birthday for ${birthday.person_name}`} onClick={() => {
                    setEditingBirthday(birthday);
                    setBirthdayForm({ person_name: birthday.person_name, person_type: birthday.person_type, date_of_birth: birthday.date_of_birth });
                    setShowAddBirthday(true);
                  }} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-50 px-3 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-200 dark:hover:bg-blue-900"><Pencil size={14} />Edit</button>
                </CrmTooltip>
                <CrmTooltip content="Delete birthday">
                  <button type="button" aria-label={`Delete birthday for ${birthday.person_name}`} onClick={() => setDeletingBirthday(birthday)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-50 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-100 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-900"><Trash2 size={14} />Delete</button>
                </CrmTooltip>
              </div></>}
              </article>
            ))
          )}
        </div>
      </div>

      {showAddBirthday && (
        <>
          <button
            type="button"
            aria-label="Close birthday dialog"
            className="fixed inset-0 z-40 h-screen bg-slate-950/35 backdrop-blur-sm"
            onClick={closeBirthdayDialog}
          />
          <div role="dialog" aria-modal="true" aria-label={editingBirthday ? "Edit client birthday" : "Add client birthday"} className="fixed inset-x-3 top-1/2 z-50 mx-auto max-h-[calc(100vh-2rem)] w-auto max-w-xl -translate-y-1/2 overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-pink-50 via-white to-blue-50 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">{editingBirthday ? "Edit client birthday" : "Add client birthday"}</h2>
                <p className="text-xs text-slate-500">{editingBirthday ? "Update the calendar entry. Client profile details remain unchanged." : "Add a birthday maintained directly inside the CRM."}</p>
              </div>
              <button
                type="button"
                onClick={closeBirthdayDialog}
                aria-label="Close birthday editor"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-white hover:text-slate-900"
              >
                <X size={17} />
              </button>
            </div>
            <form onSubmit={addBirthday} className="p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormInput
                  label="Client name"
                  name="person_name"
                  required
                  maxLength={200}
                  value={birthdayForm.person_name}
                  onValueChange={(value) => setBirthdayForm((current) => ({ ...current, person_name: value }))}
                />
                <FormInput
                  label="Date of birth"
                  name="date_of_birth"
                  type="date"
                  maxDate={`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`}
                  required
                  value={birthdayForm.date_of_birth}
                  onValueChange={(value) => setBirthdayForm((current) => ({ ...current, date_of_birth: value }))}
                />
              </div>
              <div className="mt-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeBirthdayDialog}
                  disabled={savingBirthday}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingBirthday}
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                >
                  {savingBirthday ? "Saving..." : editingBirthday ? "Save changes" : "Add birthday"}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {deletingBirthday && <>
        <button type="button" aria-label="Close delete birthday dialog" onClick={closeBirthdayDialog} className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-sm" />
        <div role="alertdialog" aria-modal="true" aria-labelledby="delete-birthday-title" aria-describedby="delete-birthday-description" className="fixed inset-x-3 top-1/2 z-50 mx-auto max-w-md -translate-y-1/2 rounded-lg border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
          <h2 id="delete-birthday-title" className="text-lg font-semibold text-gray-900 dark:text-white">Delete birthday?</h2>
          <p id="delete-birthday-description" className="mt-2 break-words text-sm text-gray-600 dark:text-gray-300">Remove <strong>{deletingBirthday.person_name}</strong> from the birthday calendar for everyone? The client profile and documents will not be deleted.</p>
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" autoFocus disabled={savingBirthday} onClick={closeBirthdayDialog} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800">Cancel</button>
            <button type="button" disabled={savingBirthday} onClick={deleteBirthday} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"><Trash2 size={15} />{savingBirthday ? "Deleting..." : "Delete birthday"}</button>
          </div>
        </div>
      </>}
    </div>
  );
}

function Metric({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-white bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        <Icon size={15} />
        {label}
      </div>
      <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}
