import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { SplitDivider } from "./SplitDivider";

export function StudySplitWorkspace({ primary, companion, companionKind, companionTitle, primaryTitle, companionControls, onClose }: {
  primary: ReactNode;
  companion: ReactNode;
  companionKind: "library" | "knowledge";
  companionTitle: string;
  primaryTitle?: string;
  companionControls?: ReactNode;
  onClose: () => void;
}) {
  const workspaceRef = useRef<HTMLElement>(null);
  const [leadingPercent, setLeadingPercent] = useState(52);
  const [swapped, setSwapped] = useState(false);
  const resolvedPrimaryTitle = primaryTitle || (companionKind === "library" ? "知识网络" : "资料库");
  return <section
    ref={workspaceRef}
    className="study-split-workspace"
    data-companion={companionKind}
    data-swapped={String(swapped)}
    style={{ "--split-leading": `${leadingPercent}%`, "--split-header-height": "50px" } as CSSProperties}
  >
    <section className="study-split-workspace__pane study-split-workspace__primary" aria-label={`主工作区：${resolvedPrimaryTitle}`}>
      <header className="study-split-workspace__primary-header">
        <div><strong>{resolvedPrimaryTitle}</strong></div>
      </header>
      <div className="study-split-workspace__surface">{primary}</div>
    </section>
    <SplitDivider
      containerRef={workspaceRef}
      value={leadingPercent}
      label={`调整${resolvedPrimaryTitle}与${companionTitle}宽度`}
      swapLabel={`交换${resolvedPrimaryTitle}与${companionTitle}位置`}
      onChange={setLeadingPercent}
      onSwap={() => setSwapped((value) => !value)}
    />
    <aside className="study-split-workspace__pane study-split-workspace__companion" aria-label={`联动分屏：${companionTitle}`}>
      <header className="study-split-workspace__companion-header">
        <div><strong>{companionTitle}</strong></div>
        {companionControls}
        <button type="button" aria-label={`关闭${companionTitle}分屏`} onClick={onClose}>×</button>
      </header>
      <div className="study-split-workspace__surface">{companion}</div>
    </aside>
  </section>;
}
