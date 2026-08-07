import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

const VIEWPORT_MARGIN = 12;
const GAP = 8;

interface MenuPosition {
  left: number;
  top: number;
}

export function AnchoredMenu({
  open,
  anchorRef,
  ariaLabel,
  role = "menu",
  className = "",
  onClose,
  children,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  ariaLabel: string;
  role?: "menu" | "dialog";
  className?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const place = () => {
      const anchor = anchorRef.current;
      const menu = menuRef.current;
      if (!anchor || !menu) return;
      const anchorRect = anchor.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const width = menuRect.width || 240;
      const height = menuRect.height || 180;
      const left = Math.min(
        Math.max(VIEWPORT_MARGIN, anchorRect.right - width),
        Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN),
      );
      const below = anchorRect.bottom + GAP;
      const above = anchorRect.top - height - GAP;
      const preferredTop = below + height <= window.innerHeight - VIEWPORT_MARGIN ? below : above;
      const top = Math.min(
        Math.max(VIEWPORT_MARGIN, preferredTop),
        Math.max(VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN),
      );
      setPosition({ left, top });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchorRef, open]);

  useLayoutEffect(() => {
    if (!open) return;
    const closeFromPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      onClose();
    };
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
      anchorRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeFromPointer);
    window.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeFromPointer);
      window.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [anchorRef, onClose, open]);

  if (!open) return null;
  return createPortal(
    <div
      ref={menuRef}
      className={`safe-action-menu__popover anchored-menu ${className}`.trim()}
      role={role}
      aria-label={ariaLabel}
      style={{
        position: "fixed",
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        right: "auto",
        bottom: "auto",
        visibility: position ? "visible" : "hidden",
      }}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}
