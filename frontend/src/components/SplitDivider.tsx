import { useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

export function clampSplitPercent(value: number) {
  return Math.min(72, Math.max(28, Math.round(value)));
}

export function SplitDivider({
  containerRef,
  value,
  label,
  swapLabel,
  onChange,
  onSwap,
}: {
  containerRef: RefObject<HTMLElement | null>;
  value: number;
  label: string;
  swapLabel: string;
  onChange: (value: number) => void;
  onSwap: () => void;
}) {
  const activePointer = useRef<number | null>(null);
  function valueFromPointer(clientX: number) {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds?.width) return;
    onChange(clampSplitPercent(((clientX - bounds.left) / bounds.width) * 100));
  }

  function beginResize(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    activePointer.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    document.body.classList.add("is-resizing-split");
    valueFromPointer(event.clientX);
  }

  function continueResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (activePointer.current !== event.pointerId) return;
    valueFromPointer(event.clientX);
    event.preventDefault();
  }

  function finishResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (activePointer.current !== event.pointerId) return;
    activePointer.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    document.body.classList.remove("is-resizing-split");
  }

  function resizeFromKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Home") {
      event.preventDefault();
      onChange(50);
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    onChange(clampSplitPercent(value + (event.key === "ArrowRight" ? 4 : -4)));
  }

  return (
    <div
      className="split-divider"
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={28}
      aria-valuemax={72}
      aria-valuenow={value}
      tabIndex={0}
      onPointerDown={beginResize}
      onKeyDown={resizeFromKeyboard}
      onPointerMove={continueResize}
      onPointerUp={finishResize}
      onPointerCancel={finishResize}
      onLostPointerCapture={finishResize}
    >
      <i aria-hidden="true" />
      <button type="button" aria-label={swapLabel} title={swapLabel} onClick={onSwap}>⇄</button>
      <i aria-hidden="true" />
    </div>
  );
}
