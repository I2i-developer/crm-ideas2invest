"use client";

import { Mic, MicOff } from "lucide-react";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import CrmTooltip from "@/components/CrmTooltip";

export default function VoiceInputButton({
  onTranscript,
  language = "en-IN",
  disabled = false,
  label = "Use voice input",
}) {
  const { unsupported, listening, error, toggle } = useVoiceInput({
    language,
    onResult: onTranscript,
  });

  const isDisabled = disabled || unsupported;
  const title = unsupported
    ? "Voice input is not supported in this browser"
    : error || (listening ? "Stop listening" : label);

  return (
    <>
      <CrmTooltip content={title} side="top" className="absolute right-3 top-1/2 -translate-y-1/2">
        <button
          type="button"
          onClick={toggle}
          disabled={isDisabled}
          aria-label={title}
          className={`rounded-full p-1.5 transition ${
            listening
              ? "bg-green-100 text-green-700 ring-2 ring-green-300"
              : "text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          } ${isDisabled ? "cursor-not-allowed opacity-45 hover:bg-transparent" : ""}`}
        >
          {listening ? <MicOff size={17} /> : <Mic size={17} />}
          <span className="sr-only">{title}</span>
        </button>
      </CrmTooltip>

      {error && (
        <span className="absolute right-0 top-full z-10 mt-1 rounded-md border border-red-100 bg-white px-2 py-1 text-[11px] font-medium text-red-600 shadow-sm">
          {error}
        </span>
      )}
    </>
  );
}
