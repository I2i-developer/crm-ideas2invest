"use client";

import VoiceInputButton from "@/components/VoiceInputButton";

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
  multiline = false,
  rows = 3,
  className = "",
  inputClassName = "",
}) {
  function emitChange(nextValue, originalEvent) {
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
    const nextValue = voiceMode === "append" && value ? `${value} ${transcript}` : transcript;

    if (onVoiceTranscript) {
      onVoiceTranscript(nextValue);
      return;
    }

    emitChange(nextValue);
  }

  const controlClass = `w-full px-4 py-3 bg-white/70 backdrop-blur-md border border-gray-200 
          rounded-xl shadow-sm outline-none transition
          focus:ring-2 focus:ring-green-500 focus:border-green-100
          placeholder:text-gray-400
          font-[inherit]
          ${icon ? "pl-10" : ""}
          ${voice ? "pr-11" : ""}
          ${disabled ? "cursor-not-allowed opacity-70" : ""}
          ${inputClassName}`;
  const valueProps = value === undefined ? {} : { value: value ?? "" };

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

      <div className="relative">
        {icon && (
          <div className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-gray-500">
            {icon}
          </div>
        )}

        {multiline ? (
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

        {voice && (
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
