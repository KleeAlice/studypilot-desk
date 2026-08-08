import type { CSSProperties } from "react";
import type { UiLanguage } from "../ui/language";

export type ViewKey = "home" | "learning" | "roadmap" | "knowledge" | "library" | "lab" | "studio" | "stats" | "settings";

const itemKeys: ViewKey[] = ["home", "learning", "roadmap", "knowledge", "library", "lab", "studio", "stats", "settings"];
const labels: Record<UiLanguage, Record<ViewKey, string>> = {
  "zh-CN": { home: "课程主页", learning: "学习中心", roadmap: "学习路线", knowledge: "知识网络", library: "资料书架", lab: "Python 实验室", studio: "项目与研究", stats: "学习统计", settings: "设置" },
  "en-US": { home: "Course Home", learning: "Learning Center", roadmap: "Learning Roadmap", knowledge: "Knowledge Graph", library: "Library", lab: "Python Lab", studio: "Projects & Research", stats: "Learning Stats", settings: "Settings" },
};

function NavIcon({ name }: { name: ViewKey }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true" {...common}>
    {name === "home" && <><path d="m4 11 8-7 8 7" /><path d="M6.5 9.5V20h11V9.5M10 20v-6h4v6" /></>}
    {name === "learning" && <><path d="M4 5.5c3.2-.8 5.8-.3 8 1.4v12c-2.2-1.7-4.8-2.2-8-1.4z" /><path d="M20 5.5c-3.2-.8-5.8-.3-8 1.4v12c2.2-1.7 4.8-2.2 8-1.4z" /><path d="M7 9.5h2.5M14.5 9.5H17" /></>}
    {name === "roadmap" && <><path d="M5 20V5" /><path d="M5 6c4-3 8 3 14-1v9c-6 4-10-2-14 1" /></>}
    {name === "knowledge" && <><circle cx="6" cy="7" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="13" cy="18" r="2.5" /><path d="m8.4 6.8 7.1-.6M7.4 9l4.2 6.7m4.2-7.5-2 7.3" /></>}
    {name === "library" && <><path d="M4.5 5.5h4v14h-4zM10 4.5h4v15h-4zM15.6 6l3.5-1 3 13.5-3.5 1z" /></>}
    {name === "lab" && <><path d="M9 3h6m-5 0v6l-5 8.4A2.3 2.3 0 0 0 7 21h10a2.3 2.3 0 0 0 2-3.6L14 9V3" /><path d="M7.5 15h9" /></>}
    {name === "studio" && <><path d="M3.5 7.5h6l2-2h9v13h-17z" /><path d="m14 10 .7 1.6 1.8.2-1.3 1.2.4 1.8-1.6-.9-1.6.9.4-1.8-1.3-1.2 1.8-.2z" /></>}
    {name === "stats" && <><circle cx="12" cy="12" r="8" /><path d="M12 4v8l5.6 3.2" /><path d="M5.3 17.3 9 13.6" /></>}
    {name === "settings" && <><circle cx="12" cy="12" r="3" /><path d="M19 13.5v-3l-2-.7a7 7 0 0 0-.8-1.8l.9-1.9L15 4l-1.9.9a7 7 0 0 0-2.2 0L9 4 6.9 6.1 7.8 8A7 7 0 0 0 7 9.8l-2 .7v3l2 .7a7 7 0 0 0 .8 1.8l-.9 1.9L9 20l1.9-.9a7 7 0 0 0 2.2 0l1.9.9 2.1-2.1-.9-1.9a7 7 0 0 0 .8-1.8z" /></>}
  </svg>;
}

export function NavRail({ active, onChange, collapsed, onToggle, courseTitle, onBackToLibrary, language = "zh-CN", mobileOpen = false, onCloseMobile }: {
  active: ViewKey;
  onChange: (view: ViewKey) => void;
  collapsed: boolean;
  onToggle: () => void;
  courseTitle?: string;
  onBackToLibrary?: () => void;
  language?: UiLanguage;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const activeIndex = Math.max(0, itemKeys.indexOf(active));
  const english = language === "en-US";
  return (
    <aside className={`navrail ${collapsed ? "navrail--collapsed" : ""} ${mobileOpen ? "is-mobile-open" : ""}`}>
      {onBackToLibrary && <button className="navrail__back" aria-label={english ? "Back to course library" : "返回课程书架"} onClick={() => { onBackToLibrary(); onCloseMobile?.(); }}><span>←</span><div><strong>{courseTitle || (english ? "Course Library" : "课程书架")}</strong></div></button>}
      <div className="navrail__status"><span className="status-dot" />{english ? "LOCAL READY" : "本地系统在线"}</div>
      <nav aria-label={english ? "Main navigation" : "主导航"}>
        <span className="navrail__indicator" aria-hidden="true" style={{ "--nav-active-index": activeIndex } as CSSProperties} />
        {itemKeys.map((key) => (
          <button key={key} className={active === key ? "is-active" : ""} onClick={() => { onChange(key); onCloseMobile?.(); }} aria-label={labels[language][key]} aria-current={active === key ? "page" : undefined}>
            <span className="nav-code"><NavIcon name={key} /></span><span className="nav-label">{labels[language][key]}</span>
          </button>
        ))}
      </nav>
      {!collapsed && <button className="nav-toggle" onClick={onToggle} aria-label={english ? "Collapse navigation" : "收起导航"}>{english ? "< Collapse" : "< 收起"}</button>}
    </aside>
  );
}
