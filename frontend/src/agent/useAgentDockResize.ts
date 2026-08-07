import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";


const STORAGE_KEY = "studypilot.agent.dock-width";
const MIN_WIDTH = 360;
const DEFAULT_WIDTH = 420;

function maximumWidth() {
  return Math.max(MIN_WIDTH, Math.min(760, window.innerWidth - 320));
}

function clampWidth(value: number) {
  return Math.min(maximumWidth(), Math.max(MIN_WIDTH, Math.round(value)));
}

function readWidth() {
  try {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 ? clampWidth(stored) : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

function persistWidth(value: number) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Resizing remains available in memory when storage is restricted.
  }
}

export function useAgentDockResize() {
  const [dockWidth, setDockWidth] = useState(readWidth);
  const drag = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);

  function updateWidth(value: number) {
    const next = clampWidth(value);
    setDockWidth(next);
    persistWidth(next);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: dockWidth,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    updateWidth(current.startWidth + current.startX - event.clientX);
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") updateWidth(dockWidth + 24);
    else if (event.key === "ArrowRight") updateWidth(dockWidth - 24);
    else if (event.key === "Home") updateWidth(MIN_WIDTH);
    else if (event.key === "End") updateWidth(maximumWidth());
    else return;
    event.preventDefault();
  }

  return {
    dockWidth,
    minimumWidth: MIN_WIDTH,
    maximumWidth: maximumWidth(),
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onKeyDown,
  };
}
