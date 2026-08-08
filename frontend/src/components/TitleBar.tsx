import { useEffect, useState } from "react";
import type { UiLanguage } from "../ui/language";
import { platform } from "../platform";

export function TitleBar({ language = "zh-CN", navigationCollapsed = false, onExpandNavigation, onMenuClick }: {
  language?: UiLanguage;
  navigationCollapsed?: boolean;
  onExpandNavigation?: () => void;
  onMenuClick?: () => void;
}) {
  const english = language === "en-US";
  const [agentOpen, setAgentOpen] = useState(false);

  useEffect(() => {
    function syncAgentState(event: Event) {
      setAgentOpen(Boolean((event as CustomEvent<{ open?: boolean }>).detail?.open));
    }
    window.addEventListener("studypilot:agent-state", syncAgentState);
    return () => window.removeEventListener("studypilot:agent-state", syncAgentState);
  }, []);

  return (
    <header className="titlebar">
      <div className="titlebar__drag" data-tauri-drag-region>
        <span className="brand-mark">SP</span>
        <span className="titlebar__name">StudyPilot Desk</span>
      </div>
      <div className="titlebar__controls">
        {onMenuClick && (
          <button
            className="titlebar__menu"
            aria-label={english ? "Open navigation" : "打开导航"}
            title={english ? "Navigation" : "导航"}
            onClick={onMenuClick}
          >
            <span aria-hidden="true">☰</span>
          </button>
        )}
        <button
          className={`titlebar-ai ${agentOpen ? "is-active" : ""}`}
          aria-label={agentOpen ? (english ? "Close PILOT assistant" : "关闭 PILOT 助手") : (english ? "Open PILOT assistant" : "打开 PILOT 助手")}
          aria-pressed={agentOpen}
          title={english ? "PILOT assistant" : "PILOT 学习助手"}
          onClick={() => window.dispatchEvent(new CustomEvent("studypilot:toggle-agent"))}
        >
          <span>AI</span><i aria-hidden="true" />
        </button>
        {navigationCollapsed && onExpandNavigation && (
          <button
            className="titlebar-nav-restore"
            aria-label={english ? "Expand navigation" : "展开导航"}
            title={english ? "Expand navigation" : "展开导航"}
            onClick={onExpandNavigation}
          >
            <span aria-hidden="true">▤</span>
          </button>
        )}
      </div>
      <div className="titlebar__drag-fill" data-tauri-drag-region aria-hidden="true" />
      <div className="window-actions" hidden={!platform().window.controlsAvailable}>
        <button aria-label={english ? "Minimize window" : "最小化窗口"} onClick={() => void platform().window.minimize()}>—</button>
        <button aria-label={english ? "Maximize or restore window" : "最大化或还原窗口"} onClick={() => void platform().window.toggleMaximize()}>□</button>
        <button className="window-close" aria-label={english ? "Close window" : "关闭窗口"} onClick={() => void platform().window.close()}>×</button>
      </div>
    </header>
  );
}
