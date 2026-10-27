"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, X } from "lucide-react";
import VoiceInputButton from "@/components/VoiceInputButton";
import { parseManualDate, formatManualDate, formatDateDraft } from "@/lib/dateInput";
import styles from "./DateInput.module.css";

const TEMPORAL_TYPES = new Set(["date", "datetime-local", "time", "month"]);
const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const QUICK_TIMES = ["09:00", "12:00", "15:00", "18:00"];

function pad(value) {
  return String(value).padStart(2, "0");
}

function dateKey(date) {
  return `${String(date.getFullYear()).padStart(4, "0")}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function calendarDate(year, month, day = 1) {
  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(year, month, day);
  return date;
}

function monthKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function timeKey(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function clampNumber(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function parseDateValue(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  if (!parseManualDate(`${day}/${month}/${year}`)) return null;
  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(Number(year), Number(month) - 1, Number(day));
  return date;
}

function parseMonthValue(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const [, year, month] = match;
  const date = calendarDate(Number(year), Number(month) - 1);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseTimeValue(value) {
  if (!value) return null;
  const match = String(value).match(/T?(\d{2}):(\d{2})/);
  if (!match) return null;
  return {
    hour: clampNumber(match[1], 0, 23),
    minute: clampNumber(match[2], 0, 59),
  };
}

function displayDate(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function displayTemporalValue(type, value) {
  if (!value) return "";

  if (type === "time") {
    const time = parseTimeValue(value);
    return time ? `${pad(time.hour)}:${pad(time.minute)}` : "";
  }

  if (type === "month") {
    const date = parseMonthValue(value);
    return date
      ? new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(date)
      : "";
  }

  const date = parseDateValue(value);
  if (type === "datetime-local") {
    const time = parseTimeValue(value);
    return [displayDate(date), time ? `${pad(time.hour)}:${pad(time.minute)}` : ""]
      .filter(Boolean)
      .join(" at ");
  }

  return displayDate(date);
}

function buildCalendarDays(year, month) {
  const firstDate = calendarDate(year, month);
  const mondayOffset = (firstDate.getDay() + 6) % 7;
  const start = calendarDate(year, month, 1 - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function TemporalInput({
  label,
  id,
  name,
  type,
  placeholder,
  value,
  onValueChange,
  onBlur,
  onFocus,
  required,
  disabled,
  controlClass,
  maxDate,
}) {
  const wrapperRef = useRef(null);
  const popoverRef = useRef(null), controlRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const [draft, setDraft] = useState(formatManualDate(value)), [dateError, setDateError] = useState("");
  const [editingMonthYear, setEditingMonthYear] = useState(false), [yearDraft, setYearDraft] = useState("");
  const selectedDate = useMemo(
    () => (type === "month" ? parseMonthValue(value) : parseDateValue(value)),
    [type, value]
  );
  const selectedTime = useMemo(() => parseTimeValue(value), [value]);
  const maxDateKey = useMemo(() => {
    if (!maxDate || !["date", "datetime-local"].includes(type)) return "";
    const parsed = parseDateValue(maxDate);
    return parsed ? dateKey(parsed) : "";
  }, [maxDate, type]);
  const initialViewDate = selectedDate || new Date();
  const [viewYear, setViewYear] = useState(initialViewDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialViewDate.getMonth());

  useEffect(() => {
    setDraft(formatManualDate(value)); setDateError("");
    controlRef.current?.setCustomValidity?.("");
  }, [value]);

  useLayoutEffect(() => {
    if (!open) { setPosition(null); return; }
    const place = () => {
      if (!wrapperRef.current || !popoverRef.current) return;
      const anchor = wrapperRef.current.getBoundingClientRect(), viewport = window.visualViewport;
      const leftEdge = viewport?.offsetLeft || 0, topEdge = viewport?.offsetTop || 0;
      const width = Math.min(352, (viewport?.width || window.innerWidth) - 24);
      const bottom = topEdge + (viewport?.height || window.innerHeight);
      const height = Math.min(popoverRef.current.offsetHeight, bottom - topEdge - 24);
      const below = bottom - anchor.bottom - 12, above = anchor.top - topEdge - 12;
      const top = below >= height ? anchor.bottom + 8 : above >= height ? anchor.top - height - 8 : Math.max(topEdge + 12, bottom - height - 12);
      setPosition({ top, left: Math.max(leftEdge + 12, Math.min(anchor.left, leftEdge + (viewport?.width || window.innerWidth) - width - 12)), width, maxHeight: bottom - topEdge - 24, fontFamily: window.getComputedStyle(wrapperRef.current).fontFamily });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(popoverRef.current); observer.observe(wrapperRef.current);
    window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place); window.visualViewport?.addEventListener("scroll", place);
    return () => {
      observer.disconnect(); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place); window.visualViewport?.removeEventListener("scroll", place);
    };
  }, [open]);

  useEffect(() => {
    if (selectedDate) {
      setViewYear(selectedDate.getFullYear());
      setViewMonth(selectedDate.getMonth());
    }
  }, [selectedDate]);

  useEffect(() => {
    function handlePointerDown(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target) && !popoverRef.current?.contains(event.target)) {
        setOpen(false);
        onBlur?.(event);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation();
        setOpen(false);
        controlRef.current?.focus({ preventScroll: true });
        onBlur?.(event);
      }
    }

    if (open) {
      document.addEventListener("pointerdown", handlePointerDown);
      document.addEventListener("keydown", handleKeyDown, true);
    }

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onBlur, open]);

  const displayValue = displayTemporalValue(type, value);
  const calendarDays = useMemo(() => buildCalendarDays(viewYear, viewMonth), [viewMonth, viewYear]);
  const todayKey = dateKey(new Date());

  function emit(nextValue) {
    onValueChange(nextValue);
  }

  function openPicker() {
    if (disabled) return;
    setOpen(true);
    setEditingMonthYear(false);
    onFocus?.();
  }

  function validateDraft(text, input, showError = false) {
    const parsed = parseManualDate(text);
    const message = text && !parsed ? "Enter a valid date in DD/MM/YYYY format." : parsed && maxDateKey && parsed > maxDateKey ? `Date cannot be after ${formatManualDate(maxDateKey)}.` : "";
    input.setCustomValidity(message);
    if (showError) setDateError(message); else setDateError("");
    if (!message && parsed) emit(parsed);
    else if (!text) emit("");
  }

  function commitYear(input) {
    const year = Number(yearDraft);
    if (!/^\d{4}$/.test(yearDraft) || year < 1 || year > 9999 || (maxDateKey && year > Number(maxDateKey.slice(0, 4)))) {
      input.setCustomValidity("Enter a valid four-digit year within the allowed range.");
      input.reportValidity(); return false;
    }
    input.setCustomValidity(""); setViewYear(year);
    if (maxDateKey && year === Number(maxDateKey.slice(0, 4))) setViewMonth((month) => Math.min(month, Number(maxDateKey.slice(5, 7)) - 1));
    return true;
  }

  function moveMonth(direction) {
    const next = calendarDate(viewYear, viewMonth + direction);
    if (next.getFullYear() < 1 || next.getFullYear() > 9999) return;
    if (direction > 0 && maxDateKey && dateKey(next) > maxDateKey) return;
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  function selectDate(date) {
    const nextDate = dateKey(date);
    if (maxDateKey && nextDate > maxDateKey) return;
    if (type === "datetime-local") {
      const time = selectedTime ? `${pad(selectedTime.hour)}:${pad(selectedTime.minute)}` : "09:00";
      emit(`${nextDate}T${time}`);
      return;
    }
    emit(nextDate);
    setOpen(false);
  }

  function selectMonth(monthIndex) {
    emit(`${String(viewYear).padStart(4, "0")}-${pad(monthIndex + 1)}`);
    setViewMonth(monthIndex);
    setOpen(false);
  }

  function selectTime(nextTime) {
    if (type === "datetime-local") {
      const date = selectedDate ? dateKey(selectedDate) : dateKey(new Date());
      emit(`${date}T${nextTime}`);
      return;
    }
    emit(nextTime);
  }

  function updateTime(part, nextValue) {
    const current = selectedTime || { hour: 9, minute: 0 };
    const hour = part === "hour" ? clampNumber(nextValue, 0, 23) : current.hour;
    const minute = part === "minute" ? clampNumber(nextValue, 0, 59) : current.minute;
    selectTime(`${pad(hour)}:${pad(minute)}`);
  }

  function clearValue(event) {
    event.stopPropagation();
    emit("");
  }

  function setCurrentValue() {
    const now = new Date();
    if (maxDateKey && ["date", "datetime-local"].includes(type) && dateKey(now) > maxDateKey) return;
    if (type === "date") emit(dateKey(now));
    if (type === "datetime-local") emit(`${dateKey(now)}T${timeKey(now)}`);
    if (type === "time") emit(timeKey(now));
    if (type === "month") emit(monthKey(now));
  }

  const pickerIcon = type === "time" ? <Clock3 size={18} /> : <CalendarDays size={18} />;
  const nextMonth = calendarDate(viewYear, viewMonth + 1);
  const nextMonthDisabled = Boolean(maxDateKey && dateKey(nextMonth) > maxDateKey);

  return (
    <div ref={wrapperRef} className="relative">
      {type === "date" ? <div className="relative">
        <input ref={controlRef} id={id || name} type="text" inputMode="numeric" autoComplete="off" placeholder="DD/MM/YYYY" maxLength={10}
          className={`${controlClass} min-h-[44px] pr-12`} value={draft} required={required} disabled={disabled}
          aria-invalid={Boolean(dateError)} aria-describedby={dateError ? `${id || name}-date-error` : undefined}
          onChange={(event) => { setOpen(false); const text = formatDateDraft(event.target.value); setDraft(text); validateDraft(text, event.target); }}
          onClick={() => setOpen(false)} onFocus={(event) => { setOpen(false); onFocus?.(event); }} onBlur={(event) => { validateDraft(draft, event.target, true); onBlur?.(event); }}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); validateDraft(draft, event.currentTarget, true); } }} />
        <button type="button" disabled={disabled} onClick={openPicker} aria-label={`Open ${label || name || "date"} calendar`} aria-haspopup="dialog" aria-expanded={open}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><CalendarDays size={18} /></button>
      </div> : <button
        ref={controlRef}
        id={id || name}
        type="button"
        disabled={disabled}
        onClick={openPicker}
        className={`${controlClass} flex min-h-[44px] items-center justify-between gap-3 text-left`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={displayValue ? "truncate" : "truncate text-gray-400 dark:text-slate-500"}>
          {displayValue || placeholder || "Select value"}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-slate-500 dark:text-slate-300">
          {value && !required && (
            <span
              role="button"
              tabIndex={-1}
              onClick={clearValue}
              className="rounded-full p-1 transition hover:bg-slate-100 hover:text-red-500 dark:hover:bg-slate-800"
              aria-label="Clear value"
            >
              <X size={15} />
            </span>
          )}
          {pickerIcon}
        </span>
      </button>}
      {dateError && <p id={`${id || name}-date-error`} role="alert" className="mt-1 text-xs text-red-600 dark:text-red-300">{dateError}</p>}

      <input type="hidden" name={name} value={value || ""} required={required} readOnly />

      {open && !disabled && createPortal(
        <div ref={popoverRef} role="dialog" aria-label={`${label || name || "Date"} calendar`} style={{ position: "fixed", zIndex: 10000, ...position, visibility: position ? "visible" : "hidden" }}
          className={`${styles.calendar} w-[min(22rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 shadow-2xl shadow-slate-900/12 dark:border-slate-700 dark:shadow-black/40`}>
          {(type === "date" || type === "datetime-local") && (
            <div className="p-3">
              <div className="mb-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => moveMonth(-1)}
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                  aria-label="Previous month"
                >
                  <ChevronLeft size={18} />
                </button>
                {editingMonthYear ? <div className="flex min-w-0 items-center gap-2">
                  <select aria-label="Calendar month" value={viewMonth} onChange={(event) => setViewMonth(Number(event.target.value))}
                    className="min-w-0 rounded-lg border border-slate-200 bg-white p-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                    {MONTHS.map((month, index) => <option value={index} key={month} disabled={Boolean(maxDateKey && viewYear === Number(maxDateKey.slice(0, 4)) && index > Number(maxDateKey.slice(5, 7)) - 1)}>{month}</option>)}
                  </select>
                  <input aria-label="Calendar year" inputMode="numeric" maxLength={4} value={yearDraft} autoFocus
                    className="w-20 rounded-lg border border-slate-200 bg-white p-1.5 text-center text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    onChange={(event) => { event.target.setCustomValidity(""); setYearDraft(event.target.value.replace(/\D/g, "")); }}
                    onBlur={(event) => commitYear(event.target)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); if (commitYear(event.currentTarget)) setEditingMonthYear(false); } }} />
                </div> : <button type="button" aria-label="Edit calendar month and year" onClick={() => { setYearDraft(String(viewYear).padStart(4, "0")); setEditingMonthYear(true); }} className="rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800">
                  {new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(calendarDate(viewYear, viewMonth))}
                </button>}
                <button
                  type="button"
                  onClick={() => moveMonth(1)}
                  disabled={nextMonthDisabled}
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                  aria-label="Next month"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {WEEK_DAYS.map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>

              <div className="mt-2 grid grid-cols-7 gap-1">
                {calendarDays.map((date) => {
                  const key = dateKey(date);
                  const isFutureBlocked = maxDateKey && key > maxDateKey;
                  if (isFutureBlocked) {
                    return <span key={key} className="h-9 rounded-xl" aria-hidden="true" />;
                  }
                  const isSelected = selectedDate && key === dateKey(selectedDate);
                  const isMuted = date.getMonth() !== viewMonth;
                  const isToday = key === todayKey;
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-label={formatManualDate(key)}
                      onClick={() => selectDate(date)}
                      className={`h-9 rounded-xl text-sm font-medium transition ${
                        isSelected
                          ? "bg-green-600 text-white shadow-lg shadow-green-600/25"
                          : isToday
                          ? "border border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950 dark:text-green-200"
                          : isMuted
                          ? "text-slate-300 hover:bg-slate-50 dark:text-slate-600 dark:hover:bg-slate-900"
                          : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                      }`}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {type === "month" && (
            <div className="p-3">
              <div className="mb-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setViewYear((year) => year - 1)}
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                  aria-label="Previous year"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{viewYear}</div>
                <button
                  type="button"
                  onClick={() => setViewYear((year) => year + 1)}
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                  aria-label="Next year"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {MONTHS.map((month, index) => {
                  const selectedMonth = selectedDate?.getFullYear() === viewYear && selectedDate?.getMonth() === index;
                  return (
                    <button
                      key={month}
                      type="button"
                      onClick={() => selectMonth(index)}
                      className={`rounded-xl px-3 py-3 text-sm font-semibold transition ${
                        selectedMonth
                          ? "bg-green-600 text-white shadow-lg shadow-green-600/25"
                          : "bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      }`}
                    >
                      {month}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {(type === "time" || type === "datetime-local") && (
            <div className="border-t border-slate-100 p-3 dark:border-slate-800">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <Clock3 size={16} />
                Time
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  value={pad(selectedTime?.hour ?? 9)}
                  onChange={(event) => updateTime("hour", event.target.value)}
                  className="w-20 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-sm font-semibold text-slate-800 outline-none focus:border-green-300 focus:ring-2 focus:ring-green-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  aria-label="Hour"
                />
                <span className="font-bold text-slate-400">:</span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  value={pad(selectedTime?.minute ?? 0)}
                  onChange={(event) => updateTime("minute", event.target.value)}
                  className="w-20 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-sm font-semibold text-slate-800 outline-none focus:border-green-300 focus:ring-2 focus:ring-green-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  aria-label="Minute"
                />
                <div className="flex flex-wrap gap-1 sm:ml-auto">
                  {QUICK_TIMES.map((quickTime) => (
                    <button
                      key={quickTime}
                      type="button"
                      onClick={() => selectTime(quickTime)}
                      className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-green-50 hover:text-green-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-green-950 dark:hover:text-green-200"
                    >
                      {quickTime}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/80">
            <button
              type="button"
              onClick={setCurrentValue}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-green-700 transition hover:bg-green-100 dark:text-green-300 dark:hover:bg-green-950"
            >
              {type === "month" ? "This month" : type === "time" ? "Now" : "Today"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onBlur?.();
              }}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              Done
            </button>
          </div>
        </div>, document.body
      )}
    </div>
  );
}

export default function FormInput({
  label,
  name,
  type = "text",
  placeholder,
  value,
  onChange,
  onValueChange,
  onBlur,
  onFocus,
  required = false,
  icon,
  voice = false,
  voiceLanguage = "en-IN",
  voiceMode = "replace",
  onVoiceTranscript,
  disabled = false,
  maxDate,
  multiline = false,
  rows = 3,
  className = "",
  inputClassName = "",
}) {
  const [internalValue, setInternalValue] = useState(value ?? "");
  const useTemporalPicker = !multiline && TEMPORAL_TYPES.has(type);
  const currentValue = value === undefined ? internalValue : value ?? "";

  function emitChange(nextValue, originalEvent) {
    if (value === undefined) {
      setInternalValue(nextValue);
    }

    onValueChange?.(nextValue);
    onChange?.(
      originalEvent || {
        target: {
          name,
          value: nextValue,
        },
      }
    );
  }

  function handleVoiceTranscript(transcript) {
    const nextValue = voiceMode === "append" && currentValue ? `${currentValue} ${transcript}` : transcript;

    if (onVoiceTranscript) {
      onVoiceTranscript(nextValue);
      return;
    }

    emitChange(nextValue);
  }

  const controlClass = `w-full px-4 py-2.5 bg-white/70 backdrop-blur-md border border-gray-200 
          rounded-xl shadow-sm outline-none transition
          focus:ring-2 focus:ring-green-500 focus:border-green-100
          text-sm leading-5 text-slate-700 placeholder:text-gray-400
          dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-50
          dark:placeholder:text-slate-500 dark:focus:border-green-500/60
          dark:focus:ring-green-500/20
          font-sans
          ${icon && !useTemporalPicker ? "pl-10" : ""}
          ${voice && !useTemporalPicker ? "pr-11" : ""}
          ${disabled ? "cursor-not-allowed opacity-70" : ""}
          ${inputClassName}`;
  const valueProps = value === undefined ? {} : { value: value ?? "" };

  return (
    <div className={`space-y-1 w-full ${className}`}>
      {label && (
        <label
          htmlFor={name}
          className="ml-1 text-sm font-medium text-gray-700 dark:text-slate-200"
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div className="relative">
        {icon && !useTemporalPicker && (
          <div className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-gray-500 dark:text-slate-400">
            {icon}
          </div>
        )}

        {useTemporalPicker ? (
          <TemporalInput
            label={label}
            id={name}
            name={name}
            type={type}
            placeholder={placeholder}
            value={currentValue}
            onValueChange={(nextValue) => emitChange(nextValue)}
            onBlur={onBlur}
            onFocus={onFocus}
            required={required}
            disabled={disabled}
            maxDate={maxDate}
            controlClass={controlClass}
          />
        ) : multiline ? (
          <textarea
            id={name}
            name={name}
            placeholder={placeholder}
            {...valueProps}
            onChange={(event) => emitChange(event.target.value, event)}
            onBlur={onBlur}
            onFocus={onFocus}
            required={required}
            disabled={disabled}
            rows={rows}
            className={controlClass}
          />
        ) : (
          <input
            id={name}
            name={name}
            type={type}
            placeholder={placeholder}
            {...valueProps}
            onChange={(event) => emitChange(event.target.value, event)}
            onBlur={onBlur}
            onFocus={onFocus}
            required={required}
            disabled={disabled}
            className={controlClass}
          />
        )}

        {voice && !useTemporalPicker && (
          <VoiceInputButton
            onTranscript={handleVoiceTranscript}
            language={voiceLanguage}
            disabled={disabled}
            label={`Use voice input for ${label || name}`}
          />
        )}
      </div>
    </div>
  );
}
