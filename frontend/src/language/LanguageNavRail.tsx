export type LanguageCourseView =
  | "home"
  | "journey"
  | "lesson"
  | "practice"
  | "vocabulary"
  | "library"
  | "stats"
  | "settings";

const destinations: Array<{
  view: LanguageCourseView;
  label: string;
  icon: "today" | "path" | "practice" | "words" | "materials" | "growth" | "settings";
}> = [
  { view: "home", label: "今日", icon: "today" },
  { view: "journey", label: "学习路径", icon: "path" },
  { view: "practice", label: "今日训练", icon: "practice" },
  { view: "vocabulary", label: "词汇本", icon: "words" },
  { view: "library", label: "课程资料", icon: "materials" },
  { view: "stats", label: "成长记录", icon: "growth" },
  { view: "settings", label: "设置", icon: "settings" },
];

function LanguageNavIcon({ name }: { name: typeof destinations[number]["icon"] }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
    {name === "today" && <><path d="M5 4.5h14v15H5zM8 2.8v3.4m8-3.4v3.4M5 8.5h14" /><path d="m9 14 2 2 4-5" /></>}
    {name === "path" && <><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18c7 0 1-12 8-12" /></>}
    {name === "practice" && <><path d="M8 5.5v13l11-6.5z" /><path d="M4 5v14" /></>}
    {name === "words" && <><path d="M4 19 9.5 5 15 19M6 14h7" /><path d="M16 10h4m-2-2v8" /></>}
    {name === "materials" && <><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" /><path d="M8 4v13a3 3 0 0 0-3-3m6-6h5m-5 4h5" /></>}
    {name === "growth" && <><path d="M5 19V9m7 10V5m7 14v-7" /><path d="m4 7 6-4 5 5 5-4" /></>}
    {name === "settings" && <><circle cx="12" cy="12" r="3" /><path d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.4-6.4L17 7m-10 10-1.4 1.4m12.8 0L17 17M7 7 5.6 5.6" /></>}
  </svg>;
}

export function LanguageNavRail({
  active,
  courseTitle,
  languageLabel,
  onNavigate,
  onBackToLibrary,
}: {
  active: LanguageCourseView;
  courseTitle: string;
  languageLabel: string;
  onNavigate: (view: LanguageCourseView) => void;
  onBackToLibrary: () => void;
}) {
  return (
    <aside className="language-navrail">
      <button className="language-navrail__back" aria-label="返回课程书架" onClick={onBackToLibrary}>
        <span aria-hidden="true">←</span>
        <div><strong>{courseTitle}</strong><small>{languageLabel}</small></div>
      </button>
      <nav aria-label="语言课程导航">
        {destinations.map((destination) => (
          <button
            key={destination.view}
            className={active === destination.view ? "is-active" : ""}
            aria-label={destination.label}
            aria-current={active === destination.view ? "page" : undefined}
            onClick={() => onNavigate(destination.view)}
          >
            <span><LanguageNavIcon name={destination.icon} /></span>
            <strong>{destination.label}</strong>
          </button>
        ))}
      </nav>
      <div className="language-navrail__status">
        <span aria-hidden="true" />
        本地学习数据已保存
      </div>
    </aside>
  );
}
