import { useEffect, useState, type ReactNode } from "react";

export type PresencePhase = "entering" | "entered" | "exiting";

export function MotionPresence({ present, exitMs = 180, children }: {
  present: boolean;
  exitMs?: number;
  children: (phase: PresencePhase) => ReactNode;
}) {
  const [mounted, setMounted] = useState(present);
  const [phase, setPhase] = useState<PresencePhase>("entering");

  useEffect(() => {
    if (present) {
      setMounted(true);
      setPhase("entering");
      const frame = requestAnimationFrame(() => setPhase("entered"));
      return () => cancelAnimationFrame(frame);
    }
    if (!mounted) return;
    setPhase("exiting");
    const timer = window.setTimeout(() => setMounted(false), exitMs);
    return () => window.clearTimeout(timer);
  }, [exitMs, mounted, present]);

  return mounted ? children(phase) : null;
}

