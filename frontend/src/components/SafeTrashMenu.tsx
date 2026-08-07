import { useRef, useState } from "react";
import { AnchoredMenu } from "./AnchoredMenu";
import { ConfirmDialog } from "./ConfirmDialog";

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
  const [error, setError] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm();
      setConfirming(false);
      setOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "移动失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <div className="safe-action-menu">
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
      <AnchoredMenu open={open} anchorRef={triggerRef} ariaLabel={menuLabel} onClose={() => setOpen(false)}>
        <div><small>更多操作</small><strong>{itemName}</strong></div>
        <button type="button" role="menuitem" className="is-danger" onClick={(event) => { event.stopPropagation(); setOpen(false); setError(""); setConfirming(true); }}>移入回收站</button>
      </AnchoredMenu>
    </div>
    <ConfirmDialog
      open={confirming}
      title={dialogTitle}
      description={<p><strong>“{itemName}”</strong> {consequence}</p>}
      confirmLabel="确认移入回收站"
      busy={busy}
      error={error}
      onCancel={() => { if (!busy) { setConfirming(false); setError(""); triggerRef.current?.focus(); } }}
      onConfirm={() => void confirm()}
    />
  </>;
}
