"use client";

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
}) {
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
          className="ml-1 text-sm font-medium text-gray-700"
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
        closeMenuOnSelect={!isMulti}
        hideSelectedOptions={false}
        isClearable={!required && !includeAll}
        styles={{
          control: (base, state) => ({
            ...base,
            borderRadius: "12px",
            padding: "4px",
            borderColor: state.isFocused ? "#22c55e" : "#e5e7eb",
            boxShadow: "none",
            "&:hover": {
              borderColor: "#22c55e",
            },
          }),

          menu: (base) => ({
            ...base,
            marginTop: 4,
            borderRadius: "12px",
            overflow: "hidden",
            zIndex: 50,
          }),

          option: (base, state) => ({
            ...base,
            backgroundColor: state.isFocused ? "#dcfce7" : "white",
            color: "#111",
            cursor: "pointer",
          }),

          placeholder: (base) => ({
            ...base,
            color: "#9ca3af",
          }),
        }}
        menuPortalTarget={typeof window !== "undefined" ? document.body : null}
        menuPosition="fixed"
      />
    </div>
  );
}
