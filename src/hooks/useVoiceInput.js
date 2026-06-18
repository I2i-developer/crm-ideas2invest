"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function getSpeechRecognition() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function useVoiceInput({ language = "en-IN", onResult } = {}) {
  const recognitionRef = useRef(null);
  const onResultRef = useRef(onResult);
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    setSupported(Boolean(getSpeechRecognition()));

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        try {
          recognitionRef.current.stop();
        } catch {
          // Some browsers throw if stop is called before recognition fully starts.
        }
        recognitionRef.current = null;
      }
    };
  }, []);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        setListening(false);
      }
    }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const SpeechRecognition = getSpeechRecognition();

    if (!SpeechRecognition) {
      setSupported(false);
      setError("Voice input is not supported in this browser.");
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    const recognition = new SpeechRecognition();
    recognition.lang = language;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const spokenText = event.results[index][0]?.transcript || "";

        if (event.results[index].isFinal) {
          finalTranscript += spokenText;
        } else {
          interimTranscript += spokenText;
        }
      }

      const nextTranscript = (finalTranscript || interimTranscript).trim();
      setTranscript(nextTranscript);

      if (finalTranscript.trim()) {
        onResultRef.current?.(finalTranscript.trim());
      }
    };

    recognition.onerror = (event) => {
      const message =
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone permission was denied."
          : "Voice input could not be captured.";

      setError(message);
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    setTranscript("");
    setError("");
    setListening(true);
    try {
      recognition.start();
    } catch {
      setListening(false);
      setError("Voice input could not be started.");
    }
  }, [language]);

  const toggle = useCallback(() => {
    if (listening) {
      stop();
    } else {
      start();
    }
  }, [listening, start, stop]);

  return {
    supported,
    unsupported: !supported,
    listening,
    transcript,
    error,
    start,
    stop,
    toggle,
  };
}
