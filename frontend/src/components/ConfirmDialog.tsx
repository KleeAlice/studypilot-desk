import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  error = "",
  icon = "⌫",
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  error?: string;
  icon?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", closeFromKeyboard);
    return () => window.removeEventListener("keydown", closeFromKeyboard);
  }, [busy, onCancel, open]);

  if (!open) return null;
  return createPortal(
    <div className="safe-confirm-backdrop" onPointerDown={(event) => {
      if (event.target === event.currentTarget && !busy) onCancel();
    }}>
      <section className="safe-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="safe-confirm-dialog__icon" aria-hidden="true">{icon}</div>
        <div className="safe-confirm-dialog__content"><h2 id={titleId}>{title}</h2><div className="safe-confirm-dialog__description">{description}</div>{error && <p className="error-message" role="alert">{error}</p>}</div>
        <footer>
          <button type="button" className="quiet-action" disabled={busy} onClick={onCancel}>取消</button>
          <button type="button" className="danger-action" disabled={busy} onClick={onConfirm}>{busy ? "正在处理…" : confirmLabel}</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
