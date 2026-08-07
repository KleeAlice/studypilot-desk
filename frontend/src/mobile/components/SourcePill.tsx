import type { SourceStatus } from "../domain";
import { MobileIcon } from "./MobileIcon";

export function SourcePill({ status }: { status: SourceStatus }) {
  return (
    <div className="sp-source-pill" aria-label={`${status.label}，${status.updatedAt}`}>
      <span className="sp-source-pill__icon"><MobileIcon name="cloud" size={17} /></span>
      <span className="sp-source-pill__copy">
        <strong>{status.label}</strong>
        <span>{status.updatedAt}</span>
      </span>
      <span className="sp-source-pill__dot" aria-hidden="true" />
    </div>
  );
}
