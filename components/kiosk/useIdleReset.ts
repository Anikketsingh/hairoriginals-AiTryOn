"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** How long the "Still there?" countdown runs before the reset fires. */
const WARNING_SECONDS = 15;

/**
 * Walk-up inactivity timer for the standee. After `timeoutSeconds` without a
 * touch it exposes a countdown (`secondsLeft`) for a "Still there?" prompt;
 * when that runs out it calls `onIdle`, which must wipe the visitor's state.
 * Any touch, click or key press restarts the clock.
 */
export function useIdleReset({
  timeoutSeconds,
  enabled,
  onIdle,
}: {
  timeoutSeconds: number;
  enabled: boolean;
  onIdle: () => void;
}): { secondsLeft: number | null; poke: () => void } {
  const lastActivity = useRef(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const onIdleRef = useRef(onIdle);
  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  const poke = useCallback(() => {
    lastActivity.current = Date.now();
    setSecondsLeft(null);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    lastActivity.current = Date.now();
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, poke, { passive: true }));

    const tick = setInterval(() => {
      const idleFor = (Date.now() - lastActivity.current) / 1000;
      const remaining = Math.ceil(timeoutSeconds + WARNING_SECONDS - idleFor);
      if (remaining <= 0) {
        setSecondsLeft(null);
        onIdleRef.current();
      } else if (idleFor >= timeoutSeconds) {
        setSecondsLeft(remaining);
      }
    }, 500);

    return () => {
      events.forEach((e) => window.removeEventListener(e, poke));
      clearInterval(tick);
      setSecondsLeft(null);
    };
  }, [enabled, timeoutSeconds, poke]);

  return { secondsLeft, poke };
}
