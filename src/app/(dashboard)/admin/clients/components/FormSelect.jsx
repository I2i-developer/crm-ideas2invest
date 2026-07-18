"use client";

import { useEffect, useState } from "react";
import Select from "react-select";

export default function FormSelect({
  label,
  name,
  options,
  placeholder,
  value,
  onChange,
  onValueChange,
  required = false,
  disabled = false,
  includeAll = false,
  allLabel = "All",
  className = "",
  isMulti = false,
  isSearchable = false,
}) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => setIsDark(root.classList.contains("dark"));
    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const normalizedOptions = [
    ...(includeAll && !isMulti ? [{ value: "", label: allLabel }] : []),
    ...(options || []).map((option) =>
      typeof option === "string" || typeof option === "number"
        ? { value: option, label: String(option) }
        : option
    ),
  ];
  const selectedOption = isMulti
    ? normalizedOptions.filter((option) => (value || []).map(String).includes(String(option.value)))
    : normalizedOptions.find((option) => String(option.value) === String(value ?? "")) || null;

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
      <Select
        name={name}
        options={normalizedOptions}
        placeholder={placeholder}
        value={selectedOption}
        isDisabled={disabled}
        onChange={(option) => {
          const nextValue = isMulti
            ? (option || []).map((item) => item.value)
            : option ? option.value : "";
          onValueChange?.(nextValue);
          onChange?.({
            target: { name, value: nextValue },
          });
        }}
        isMulti={isMulti}
        isSearchable={isSearchable}
        closeMenuOnSelect={!isMulti}
        hideSelectedOptions={false}
        isClearable={!required && !includeAll}
        styles={{
          control: (base, state) => ({
            ...base,
            borderRadius: "12px",
            padding: "0 4px",
            minHeight: "42px",
            backgroundColor: isDark ? "rgba(15, 23, 42, 0.92)" : "rgba(255, 255, 255, 0.72)",
            borderColor: state.isFocused ? "#22c55e" : isDark ? "#334155" : "#e5e7eb",
            boxShadow: state.isFocused ? (isDark ? "0 0 0 2px rgba(34, 197, 94, 0.22)" : "0 0 0 2px rgba(34, 197, 94, 0.12)") : "none",
            color: isDark ? "#f8fafc" : "#111827",
            "&:hover": {
              borderColor: "#22c55e",
            },
          }),
          valueContainer: (base) => ({
            ...base,
            padding: "2px 8px",
            color: isDark ? "#f8fafc" : "#111827",
          }),
          singleValue: (base) => ({
            ...base,
            color: isDark ? "#f8fafc" : "#111827",
          }),
          multiValue: (base) => ({
            ...base,
            backgroundColor: isDark ? "rgba(34, 197, 94, 0.18)" : "#dcfce7",
            borderRadius: "8px",
          }),
          multiValueLabel: (base) => ({
            ...base,
            color: isDark ? "#bbf7d0" : "#166534",
            fontWeight: 600,
          }),
          multiValueRemove: (base) => ({
            ...base,
            color: isDark ? "#86efac" : "#15803d",
            ":hover": {
              backgroundColor: isDark ? "rgba(34, 197, 94, 0.28)" : "#bbf7d0",
              color: isDark ? "#f8fafc" : "#14532d",
            },
          }),
          input: (base) => ({
            ...base,
            color: isDark ? "#f8fafc" : "#111827",
          }),
          indicatorsContainer: (base) => ({
            ...base,
            minHeight: "40px",
            color: isDark ? "#cbd5e1" : "#64748b",
          }),
          dropdownIndicator: (base, state) => ({
            ...base,
            color: state.isFocused ? "#22c55e" : isDark ? "#cbd5e1" : "#64748b",
            ":hover": {
              color: "#22c55e",
            },
          }),
          clearIndicator: (base) => ({
            ...base,
            color: isDark ? "#94a3b8" : "#64748b",
            ":hover": {
              color: isDark ? "#f87171" : "#dc2626",
            },
          }),
          indicatorSeparator: (base) => ({
            ...base,
            backgroundColor: isDark ? "#334155" : "#e5e7eb",
          }),

          menu: (base) => ({
            ...base,
            marginTop: 4,
            borderRadius: "12px",
            overflow: "hidden",
            zIndex: 9999,
            backgroundColor: isDark ? "#0f172a" : "#ffffff",
            border: `1px solid ${isDark ? "#334155" : "#e5e7eb"}`,
            boxShadow: isDark
              ? "0 20px 45px rgba(0, 0, 0, 0.45)"
              : "0 20px 45px rgba(15, 23, 42, 0.14)",
          }),
          menuPortal: (base) => ({
            ...base,
            zIndex: 9999,
          }),

          option: (base, state) => ({
            ...base,
            backgroundColor: state.isSelected
              ? isDark ? "rgba(34, 197, 94, 0.24)" : "#bbf7d0"
              : state.isFocused
                ? isDark ? "rgba(34, 197, 94, 0.16)" : "#dcfce7"
                : isDark ? "#0f172a" : "white",
            color: isDark ? "#f8fafc" : "#111827",
            cursor: "pointer",
            fontWeight: state.isSelected ? 700 : 500,
          }),

          placeholder: (base) => ({
            ...base,
            color: isDark ? "#94a3b8" : "#9ca3af",
          }),
          noOptionsMessage: (base) => ({
            ...base,
            color: isDark ? "#cbd5e1" : "#64748b",
            backgroundColor: isDark ? "#0f172a" : "#ffffff",
          }),
        }}
        menuPortalTarget={typeof window !== "undefined" ? document.body : null}
        menuPosition="fixed"
      />
    </div>
  );
}
