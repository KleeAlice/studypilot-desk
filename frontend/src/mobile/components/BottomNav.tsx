import { MobileIcon, type MobileIconName } from "./MobileIcon";

export type MobileDestination = "home" | "courses" | "notes" | "stats";

const items: Array<{ id: MobileDestination; label: string; icon: MobileIconName }> = [
  { id: "home", label: "首页", icon: "home" },
  { id: "courses", label: "课程", icon: "courses" },
  { id: "notes", label: "笔记", icon: "notes" },
  { id: "stats", label: "统计", icon: "stats" },
];

export function BottomNav({ active, onChange }: { active: MobileDestination; onChange: (destination: MobileDestination) => void }) {
  return (
    <nav className="sp-mobile-nav" aria-label="主要导航">
      {items.map((item) => (
        <button
          className="sp-mobile-nav__item"
          data-active={active === item.id || undefined}
          type="button"
          key={item.id}
          aria-current={active === item.id ? "page" : undefined}
          aria-label={item.label}
          onClick={() => onChange(item.id)}
        >
          <span className="sp-mobile-nav__icon"><MobileIcon name={item.icon} /></span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
