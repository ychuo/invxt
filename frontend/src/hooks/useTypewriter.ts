"use client";
import { useState, useEffect, useRef } from "react";

export function useTypewriter(text: string, enabled: boolean, speed: number = 25) {
  const [displayed, setDisplayed] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled || !text) {
      setDisplayed(text);
      return;
    }

    // Start from the end of previously displayed text
    const startIdx = text.startsWith(displayed) ? displayed.length : 0;
    let idx = startIdx;

    timerRef.current = setInterval(() => {
      idx++;
      setDisplayed(text.slice(0, idx));
      if (idx >= text.length) {
        if (timerRef.current) clearInterval(timerRef.current);
      }
    }, speed);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [text, enabled]);

  // Reset when text changes completely
  useEffect(() => {
    if (!text.startsWith(displayed) && displayed !== "") {
      setDisplayed("");
    }
  }, [text]);

  return enabled ? displayed : text;
}
