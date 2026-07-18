import { useEffect, useRef, useState } from "react";
import { MotionPresence } from "./MotionPresence";

export function SafeTrashMenu({
  triggerLabel,
  menuLabel,
  dialogTitle,
  itemName,
  consequence,
  onConfirm,
  disabled = false,
}: {
  triggerLabel: string;
  menuLabel: string;
  dialogTitle: string;
  itemName: string;
  consequence: string;
  onConfirm: () => Promise<void>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeFromOutside(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeFromKeyboard(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("mousedown", closeFromOutside);
    window.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.removeEventListener("mousedown", closeFromOutside);
      window.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [open]);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
      setConfirming(false);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return <>
    <div className="safe-action-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="safe-action-menu__trigger"
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled || busy}
        onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }}
      >•••</button>
      <MotionPresence present={open} exitMs={120}>{(phase) => <div className="safe-action-menu__popover" data-presence={phase} role="menu" aria-label={menuLabel}>
        <div><small>更多操作</small><strong>{itemName}</strong></div>
        <button type="button" role="menuitem" className="is-danger" onClick={(event) => { event.stopPropagation(); setOpen(false); setConfirming(true); }}>移入回收站</button>
      </div>}</MotionPresence>
    </div>
    <MotionPresence present={confirming} exitMs={180}>{(phase) => <div className="safe-confirm-backdrop" data-presence={phase} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setConfirming(false); }}>
      <section className="safe-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby={`safe-confirm-${itemName}`}>
        <div className="safe-confirm-dialog__icon" aria-hidden="true">⌫</div>
        <div><small>MOVE TO TRASH</small><h2 id={`safe-confirm-${itemName}`}>{dialogTitle}</h2><p><strong>“{itemName}”</strong> {consequence}</p></div>
        <footer>
          <button type="button" className="quiet-action" disabled={busy} onClick={() => setConfirming(false)}>取消</button>
          <button type="button" className="danger-action" disabled={busy} onClick={() => void confirm()}>{busy ? "正在移动…" : "确认移入回收站"}</button>
        </footer>
      </section>
    </div>}</MotionPresence>
  </>;
}
