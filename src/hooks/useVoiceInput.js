"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function getSpeechRecognition() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

async function requestMicrophoneAccess() {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return true;
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((track) => track.stop());
  return true;
}

export function useVoiceInput({
  language = "en-IN",
  onResult,
  continuous = false,
  restartOnSilence = false,
} = {}) {
  const recognitionRef = useRef(null);
  const onResultRef = useRef(onResult);
  const finalTranscriptRef = useRef("");
  const shouldListenRef = useRef(false);
  const manuallyStoppedRef = useRef(false);
  const microphoneReadyRef = useRef(false);
  const restartTimerRef = useRef(null);
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
        window.clearTimeout(restartTimerRef.current);
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
    manuallyStoppedRef.current = true;
    shouldListenRef.current = false;
    window.clearTimeout(restartTimerRef.current);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        setListening(false);
      }
    }
    setListening(false);
  }, []);

  const start = useCallback(async () => {
    const SpeechRecognition = getSpeechRecognition();

    if (!SpeechRecognition) {
      setSupported(false);
      setError("Voice input is not supported in this browser.");
      return;
    }

    window.clearTimeout(restartTimerRef.current);
    manuallyStoppedRef.current = false;
    shouldListenRef.current = true;
    setError("");

    if (!microphoneReadyRef.current) {
      try {
        await requestMicrophoneAccess();
        microphoneReadyRef.current = true;
      } catch {
        shouldListenRef.current = false;
        setListening(false);
        setError("Microphone permission was denied. Allow microphone access in browser site settings.");
        return;
      }
    }

    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      try {
        recognitionRef.current.stop();
      } catch {
        // Existing recognizer may already be stopped.
      }
    }

    const recognition = new SpeechRecognition();
    recognition.lang = language;
    recognition.continuous = continuous;
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

      if (finalTranscript.trim()) {
        finalTranscriptRef.current = [finalTranscriptRef.current, finalTranscript.trim()]
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
      }

      const nextTranscript = [finalTranscriptRef.current, interimTranscript.trim()]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      setTranscript(nextTranscript);

      if (nextTranscript) {
        onResultRef.current?.(nextTranscript, {
          final: Boolean(finalTranscript.trim()),
          interim: interimTranscript.trim(),
        });
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech" && restartOnSilence && shouldListenRef.current) {
        return;
      }

      const message =
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone permission was denied."
          : "Voice input could not be captured.";

      setError(message);
      setListening(false);
      shouldListenRef.current = false;
    };

    recognition.onend = () => {
      if (restartOnSilence && shouldListenRef.current && !manuallyStoppedRef.current) {
        restartTimerRef.current = window.setTimeout(() => {
          try {
            recognition.start();
            setListening(true);
          } catch {
            setListening(false);
          }
        }, 350);
        return;
      }

      setListening(false);
    };

    recognitionRef.current = recognition;
    finalTranscriptRef.current = "";
    setTranscript("");
    setError("");
    setListening(true);
    try {
      recognition.start();
    } catch {
      setListening(false);
      shouldListenRef.current = false;
      setError("Voice input could not be started.");
    }
  }, [continuous, language, restartOnSilence]);

  const resetTranscript = useCallback(() => {
    finalTranscriptRef.current = "";
    setTranscript("");
  }, []);

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
    resetTranscript,
  };
}
