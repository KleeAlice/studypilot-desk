import type { CSSProperties } from "react";

export type ViewKey = "home" | "today" | "roadmap" | "knowledge" | "library" | "lab" | "studio" | "review" | "stats" | "settings";

const items: Array<{ key: ViewKey; label: string }> = [
  { key: "home", label: "课程主页" },
  { key: "today", label: "今日驾驶舱" },
  { key: "roadmap", label: "24 周路线" },
  { key: "knowledge", label: "知识网络" },
  { key: "library", label: "资料书架" },
  { key: "lab", label: "Python 实验室" },
  { key: "studio", label: "项目与研究" },
  { key: "review", label: "复盘与求职" },
  { key: "stats", label: "学习统计" },
  { key: "settings", label: "设置" },
];

function NavIcon({ name }: { name: ViewKey }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true" {...common}>
    {name === "home" && <><path d="m4 11 8-7 8 7" /><path d="M6.5 9.5V20h11V9.5M10 20v-6h4v6" /></>}
    {name === "today" && <><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="4" rx="2" /><rect x="13" y="10" width="7" height="10" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /></>}
    {name === "roadmap" && <><path d="M5 20V5" /><path d="M5 6c4-3 8 3 14-1v9c-6 4-10-2-14 1" /></>}
    {name === "knowledge" && <><circle cx="6" cy="7" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="13" cy="18" r="2.5" /><path d="m8.4 6.8 7.1-.6M7.4 9l4.2 6.7m4.2-7.5-2 7.3" /></>}
    {name === "library" && <><path d="M4.5 5.5h4v14h-4zM10 4.5h4v15h-4zM15.6 6l3.5-1 3 13.5-3.5 1z" /></>}
    {name === "lab" && <><path d="M9 3h6m-5 0v6l-5 8.4A2.3 2.3 0 0 0 7 21h10a2.3 2.3 0 0 0 2-3.6L14 9V3" /><path d="M7.5 15h9" /></>}
    {name === "studio" && <><path d="M3.5 7.5h6l2-2h9v13h-17z" /><path d="m14 10 .7 1.6 1.8.2-1.3 1.2.4 1.8-1.6-.9-1.6.9.4-1.8-1.3-1.2 1.8-.2z" /></>}
    {name === "review" && <><path d="M5 19V9m5 10V5m5 14v-6m4 6V8" /><path d="m4 5 3 3 5-5 4 4 4-4" /></>}
    {name === "stats" && <><circle cx="12" cy="12" r="8" /><path d="M12 4v8l5.6 3.2" /><path d="M5.3 17.3 9 13.6" /></>}
    {name === "settings" && <><circle cx="12" cy="12" r="3" /><path d="M19 13.5v-3l-2-.7a7 7 0 0 0-.8-1.8l.9-1.9L15 4l-1.9.9a7 7 0 0 0-2.2 0L9 4 6.9 6.1 7.8 8A7 7 0 0 0 7 9.8l-2 .7v3l2 .7a7 7 0 0 0 .8 1.8l-.9 1.9L9 20l1.9-.9a7 7 0 0 0 2.2 0l1.9.9 2.1-2.1-.9-1.9a7 7 0 0 0 .8-1.8z" /></>}
  </svg>;
}

export function NavRail({ active, onChange, collapsed, onToggle, courseTitle, onBackToLibrary }: {
  active: ViewKey;
  onChange: (view: ViewKey) => void;
  collapsed: boolean;
  onToggle: () => void;
  courseTitle?: string;
  onBackToLibrary?: () => void;
}) {
  const activeIndex = Math.max(0, items.findIndex((item) => item.key === active));
  return (
    <aside className={`navrail ${collapsed ? "navrail--collapsed" : ""}`}>
      {onBackToLibrary && <button className="navrail__back" aria-label="返回课程书架" onClick={onBackToLibrary}><span>←</span><div><small>COURSE LIBRARY</small><strong>{courseTitle || "课程书架"}</strong></div></button>}
      <div className="navrail__status"><span className="status-dot" />本地系统在线</div>
      <nav aria-label="主导航">
        <span className="navrail__indicator" aria-hidden="true" style={{ "--nav-active-index": activeIndex } as CSSProperties} />
        {items.map((item) => (
          <button key={item.key} className={active === item.key ? "is-active" : ""} onClick={() => onChange(item.key)} aria-label={item.label} aria-current={active === item.key ? "page" : undefined}>
            <span className="nav-code"><NavIcon name={item.key} /></span><span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
      <button className="nav-toggle" onClick={onToggle} aria-label={collapsed ? "展开导航" : "收起导航"}>{collapsed ? ">" : "< 收起"}</button>
    </aside>
  );
}
